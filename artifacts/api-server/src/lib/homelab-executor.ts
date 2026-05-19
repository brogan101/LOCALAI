/**
 * HOMELAB EXECUTOR
 * =================
 * Phase 25 / B-009 family. Activates the "HomeLab" advanced nav item.
 *
 * Integrates with:
 *   - Proxmox VE  (REST API /api2/json)
 *   - OPNsense    (REST API /api)
 *   - NetBox      (REST API /api)
 *
 * All credentials come from Settings → Integrations, stored in the
 * encrypted DB table.  If creds are missing, every call returns
 * { executed: false, reason: "not_configured" } — never throws.
 *
 * Action model:
 *   validate  — check API reachability + creds
 *   dry_run   — describe what would change (proposal)
 *   execute   — make the REST call (requires explicit approval)
 *   verify    — re-query the resource and confirm state
 *
 * executor kinds:
 *   homelab_proxmox   — VM lifecycle (start/stop/snapshot/clone)
 *   homelab_opnsense  — firewall rule and alias management
 *   homelab_netbox    — DCIM/IPAM record management
 */

import { logger } from "./logger.js";
import {
  registerExecutor,
  type ExecutorRunner,
  type ExecutorRunnerContext,
  type ExecutorRunnerResult,
} from "./approved-executor.js";

// ─────────────────────────────────────────────────────────────────────────────
// Credential loader
// ─────────────────────────────────────────────────────────────────────────────

interface HomelabCreds {
  url: string;
  token: string;
  /** For Proxmox: "PVEAPIToken=user@realm!name=secret" format */
  tokenFormat?: "bearer" | "pve_api_token" | "x-api-token";
}

async function loadCreds(service: "proxmox" | "opnsense" | "netbox"): Promise<HomelabCreds | null> {
  try {
    const { getSettingValue } = await import("./settings-store.js");
    const url   = await getSettingValue(`homelab.${service}.url`).catch(() => null);
    const token = await getSettingValue(`homelab.${service}.token`).catch(() => null);
    if (!url || !token) return null;
    const fmt = await getSettingValue(`homelab.${service}.tokenFormat`).catch(() => "bearer");
    return { url: url.replace(/\/+$/, ""), token, tokenFormat: (fmt ?? "bearer") as HomelabCreds["tokenFormat"] };
  } catch {
    return null;
  }
}

function authHeaders(creds: HomelabCreds): Record<string, string> {
  switch (creds.tokenFormat) {
    case "pve_api_token":
      return { Authorization: `PVEAPIToken=${creds.token}` };
    case "x-api-token":
      return { "X-Api-Token": creds.token };
    default:
      return { Authorization: `Bearer ${creds.token}` };
  }
}

async function homelabFetch(
  creds: HomelabCreds,
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${creds.url}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      ...authHeaders(creds),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function notConfigured(service: string): ExecutorRunnerResult {
  return {
    success: false,
    executed: false,
    redactedSummary: `${service} not configured — add URL and API token in Settings → Integrations → HomeLab`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Proxmox executor
// ─────────────────────────────────────────────────────────────────────────────

export const HOMELAB_PROXMOX_KIND = "homelab_proxmox";

export type ProxmoxAction =
  | "list_vms"
  | "vm_status"
  | "vm_start"
  | "vm_stop"
  | "vm_shutdown"
  | "vm_snapshot"
  | "vm_clone"
  | "node_status";

export interface ProxmoxPayload {
  action: ProxmoxAction;
  node?: string;     // Proxmox node name, e.g. "pve"
  vmid?: number;
  snapshotName?: string;
  cloneVmid?: number;
  cloneName?: string;
}

const proxmoxRunner: ExecutorRunner = async (ctx: ExecutorRunnerContext): Promise<ExecutorRunnerResult> => {
  const { request, checkpoint, appendVerification } = ctx;
  const mode = request.mode ?? "dry_run";
  const payload = request.payload as unknown as ProxmoxPayload;

  checkpoint("validate");
  const creds = await loadCreds("proxmox");
  if (!creds) return notConfigured("Proxmox");

  // Health check
  const health = await homelabFetch(creds, "/api2/json/version").catch(() => null);
  if (!health?.ok) {
    const msg = `Proxmox not reachable at ${creds.url}`;
    await appendVerification(msg);
    return { success: false, executed: false, redactedSummary: msg };
  }
  await appendVerification(`Proxmox reachable: ${(health.data as any)?.data?.version}`);

  if (mode === "validate") {
    return { success: true, executed: false, redactedSummary: "Proxmox credentials valid" };
  }

  const node = payload.node ?? "pve";

  // READ-ONLY actions — safe in dry_run and execute
  if (payload.action === "list_vms") {
    const r = await homelabFetch(creds, `/api2/json/nodes/${node}/qemu`);
    const vms = (r.data as any)?.data ?? [];
    return {
      success: r.ok, executed: false,
      result: { vms: vms.slice(0, 20) },
      redactedSummary: `Listed ${vms.length} VMs on node ${node}`,
    };
  }

  if (payload.action === "node_status") {
    const r = await homelabFetch(creds, `/api2/json/nodes/${node}/status`);
    return {
      success: r.ok, executed: false,
      result: { status: (r.data as any)?.data },
      redactedSummary: `Node ${node} status retrieved`,
    };
  }

  if (payload.action === "vm_status" && payload.vmid) {
    const r = await homelabFetch(creds, `/api2/json/nodes/${node}/qemu/${payload.vmid}/status/current`);
    return {
      success: r.ok, executed: false,
      result: { status: (r.data as any)?.data },
      redactedSummary: `VM ${payload.vmid} status: ${(r.data as any)?.data?.status}`,
    };
  }

  // WRITE actions — dry_run returns proposal; execute makes the call
  const WRITE_ACTIONS: Record<string, { path: (p: ProxmoxPayload) => string; method: string; body?: (p: ProxmoxPayload) => unknown }> = {
    vm_start:    { path: (p) => `/api2/json/nodes/${node}/qemu/${p.vmid}/status/start`,    method: "POST" },
    vm_stop:     { path: (p) => `/api2/json/nodes/${node}/qemu/${p.vmid}/status/stop`,     method: "POST" },
    vm_shutdown: { path: (p) => `/api2/json/nodes/${node}/qemu/${p.vmid}/status/shutdown`, method: "POST" },
    vm_snapshot: { path: (p) => `/api2/json/nodes/${node}/qemu/${p.vmid}/snapshot`,        method: "POST",
                   body: (p) => ({ snapname: p.snapshotName ?? `snap_${Date.now()}` }) },
    vm_clone:    { path: (p) => `/api2/json/nodes/${node}/qemu/${p.vmid}/clone`,           method: "POST",
                   body: (p) => ({ newid: p.cloneVmid, name: p.cloneName }) },
  };

  const actionDef = WRITE_ACTIONS[payload.action];
  if (!actionDef || !payload.vmid) {
    return { success: false, executed: false, redactedSummary: `Unknown action or missing vmid: ${payload.action}` };
  }

  if (mode === "dry_run") {
    await appendVerification(`Dry-run: would ${payload.action} VM ${payload.vmid}`);
    return {
      success: true, executed: false,
      result: { wouldCall: `${actionDef.method} ${actionDef.path(payload)}`, payload: actionDef.body?.(payload) },
      redactedSummary: `Dry-run: ${payload.action} VM ${payload.vmid} on node ${node}`,
    };
  }

  checkpoint("execute");
  const r = await homelabFetch(creds, actionDef.path(payload), {
    method: actionDef.method,
    body: actionDef.body?.(payload),
  });

  await appendVerification(`${payload.action} VM ${payload.vmid}: HTTP ${r.status}`);

  return {
    success: r.ok, executed: r.ok,
    result: { taskId: (r.data as any)?.data, action: payload.action, vmid: payload.vmid },
    rollbackNotes: payload.action === "vm_start" ? `Stop VM ${payload.vmid}: POST /api2/json/nodes/${node}/qemu/${payload.vmid}/status/stop` : undefined,
    redactedSummary: r.ok
      ? `${payload.action} executed for VM ${payload.vmid}`
      : `${payload.action} failed: HTTP ${r.status}`,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// OPNsense executor
// ─────────────────────────────────────────────────────────────────────────────

export const HOMELAB_OPNSENSE_KIND = "homelab_opnsense";

export type OpnsenseAction =
  | "list_aliases"
  | "list_rules"
  | "add_alias"
  | "update_alias"
  | "apply_firewall";

export interface OpnsensePayload {
  action: OpnsenseAction;
  aliasName?: string;
  aliasType?: "host" | "network" | "port";
  aliasContent?: string[];
  aliasDescription?: string;
  aliasUuid?: string;
}

const opnsenseRunner: ExecutorRunner = async (ctx: ExecutorRunnerContext): Promise<ExecutorRunnerResult> => {
  const { request, checkpoint, appendVerification } = ctx;
  const mode = request.mode ?? "dry_run";
  const payload = request.payload as unknown as OpnsensePayload;

  checkpoint("validate");
  const creds = await loadCreds("opnsense");
  if (!creds) return notConfigured("OPNsense");

  const health = await homelabFetch(creds, "/api/core/firmware/status").catch(() => null);
  if (!health?.ok) {
    return { success: false, executed: false, redactedSummary: `OPNsense not reachable at ${creds.url}` };
  }
  await appendVerification(`OPNsense reachable`);

  if (mode === "validate") return { success: true, executed: false, redactedSummary: "OPNsense credentials valid" };

  // Read-only
  if (payload.action === "list_aliases") {
    const r = await homelabFetch(creds, "/api/firewall/alias/searchItem");
    return { success: r.ok, executed: false, result: { aliases: (r.data as any)?.rows?.slice(0, 20) },
             redactedSummary: `Listed ${(r.data as any)?.rowCount ?? 0} aliases` };
  }

  if (payload.action === "list_rules") {
    const r = await homelabFetch(creds, "/api/firewall/filter/searchRule");
    return { success: r.ok, executed: false, result: { rules: (r.data as any)?.rows?.slice(0, 20) },
             redactedSummary: `Listed ${(r.data as any)?.rowCount ?? 0} rules` };
  }

  // Write actions
  if (mode === "dry_run") {
    return { success: true, executed: false,
             result: { wouldAction: payload.action, payload },
             redactedSummary: `Dry-run: ${payload.action} on OPNsense` };
  }

  checkpoint("execute");

  if (payload.action === "add_alias") {
    const body = {
      alias: {
        name: payload.aliasName, type: payload.aliasType ?? "host",
        content: payload.aliasContent?.join("\n") ?? "",
        description: payload.aliasDescription ?? "",
        enabled: "1",
      },
    };
    const r = await homelabFetch(creds, "/api/firewall/alias/addItem", { method: "POST", body });
    if (r.ok) {
      await homelabFetch(creds, "/api/firewall/alias/reconfigure", { method: "POST" });
    }
    return { success: r.ok, executed: r.ok,
             result: { uuid: (r.data as any)?.uuid },
             redactedSummary: r.ok ? `Alias "${payload.aliasName}" created` : `Failed: HTTP ${r.status}` };
  }

  if (payload.action === "apply_firewall") {
    const r = await homelabFetch(creds, "/api/firewall/filter/apply", { method: "POST" });
    return { success: r.ok, executed: r.ok, redactedSummary: r.ok ? "Firewall rules applied" : `Apply failed: HTTP ${r.status}` };
  }

  return { success: false, executed: false, redactedSummary: `Unknown OPNsense action: ${payload.action}` };
};

// ─────────────────────────────────────────────────────────────────────────────
// NetBox executor
// ─────────────────────────────────────────────────────────────────────────────

export const HOMELAB_NETBOX_KIND = "homelab_netbox";

export type NetboxAction =
  | "list_devices"
  | "list_ip_addresses"
  | "create_ip"
  | "create_device"
  | "update_device_status";

export interface NetboxPayload {
  action: NetboxAction;
  deviceId?: number;
  ipAddress?: string;
  prefix?: string;
  deviceName?: string;
  deviceRole?: string;
  site?: string;
  status?: "active" | "reserved" | "deprecated" | "dhcp";
}

const netboxRunner: ExecutorRunner = async (ctx: ExecutorRunnerContext): Promise<ExecutorRunnerResult> => {
  const { request, checkpoint, appendVerification } = ctx;
  const mode = request.mode ?? "dry_run";
  const payload = request.payload as unknown as NetboxPayload;

  checkpoint("validate");
  const creds = await loadCreds("netbox");
  if (!creds) return notConfigured("NetBox");

  const health = await homelabFetch(creds, "/api/").catch(() => null);
  if (!health?.ok) {
    return { success: false, executed: false, redactedSummary: `NetBox not reachable at ${creds.url}` };
  }
  await appendVerification("NetBox reachable");
  if (mode === "validate") return { success: true, executed: false, redactedSummary: "NetBox credentials valid" };

  // Read-only
  if (payload.action === "list_devices") {
    const r = await homelabFetch(creds, "/api/dcim/devices/?limit=20");
    return { success: r.ok, executed: false,
             result: { devices: (r.data as any)?.results?.slice(0, 20) },
             redactedSummary: `Listed ${(r.data as any)?.count ?? 0} devices` };
  }

  if (payload.action === "list_ip_addresses") {
    const r = await homelabFetch(creds, `/api/ipam/ip-addresses/?limit=20${payload.prefix ? `&parent=${payload.prefix}` : ""}`);
    return { success: r.ok, executed: false,
             result: { addresses: (r.data as any)?.results?.slice(0, 20) },
             redactedSummary: `Listed ${(r.data as any)?.count ?? 0} IP addresses` };
  }

  if (mode === "dry_run") {
    return { success: true, executed: false,
             result: { wouldAction: payload.action },
             redactedSummary: `Dry-run: ${payload.action} on NetBox` };
  }

  checkpoint("execute");

  if (payload.action === "create_ip") {
    const r = await homelabFetch(creds, "/api/ipam/ip-addresses/", {
      method: "POST",
      body: { address: payload.ipAddress, status: payload.status ?? "active" },
    });
    return { success: r.ok, executed: r.ok,
             result: { id: (r.data as any)?.id },
             redactedSummary: r.ok ? `IP ${payload.ipAddress} created` : `Failed: HTTP ${r.status}` };
  }

  return { success: false, executed: false, redactedSummary: `Unknown NetBox action: ${payload.action}` };
};

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

let registered = false;
export function ensureHomelabExecutorsRegistered(): void {
  if (registered) return;
  registerExecutor(HOMELAB_PROXMOX_KIND, proxmoxRunner);
  registerExecutor(HOMELAB_OPNSENSE_KIND, opnsenseRunner);
  registerExecutor(HOMELAB_NETBOX_KIND, netboxRunner);
  registered = true;
  logger.info("homelab-executor: registered proxmox, opnsense, netbox");
}
