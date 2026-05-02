import { randomUUID } from "crypto";
import { sqlite } from "../db/database.js";
import { thoughtLog } from "./thought-log.js";

// ── Source of truth ───────────────────────────────────────────────────────────

export const EDGE_NODE_SOURCE_OF_TRUTH = `
Edge Node Architecture Source of Truth (Phase 14A)
===================================================
Purpose: Prevent the gaming PC from becoming a fragile always-on server. Edge nodes
(mini PCs, Raspberry Pis, NAS, etc.) host always-on Home Assistant, cameras, printers,
and shop devices. The gaming PC is a heavy AI brain and optional coordinator — NOT the
primary always-on host for critical home/shop services.

Hard limits:
- Gaming PC node: alwaysOn is ALWAYS false and cannot be changed via any input.
- No services are installed to remote nodes in this phase (all actions proposal-only).
- Node health checks are read-only HTTP probes; no remote mutation occurs.
- High-risk edge actions (physical device writes, relay control, service restarts) are
  approval_required or manual_only and return executed=false in this phase.
- Secrets, device tokens, private endpoints, camera frames, and home layout data are
  never logged or stored in audit/thought metadata.
- Missing/unconfigured nodes report not_configured/offline/unknown, never fake success.
- Camera frame capture is permanently blocked regardless of profile configuration.
- Shop relay/power control is permanently manual_only regardless of profile configuration.
`;

// ── Types ─────────────────────────────────────────────────────────────────────

export type EdgeNodeType =
  | "mini_pc"
  | "raspberry_pi"
  | "nas"
  | "gaming_pc"
  | "server"
  | "unknown";

export type EdgeNodeRole =
  | "home_assistant"
  | "printer_host"
  | "camera_nvr"
  | "nas_storage"
  | "shop_controller"
  | "homelab_node"
  | "worker_node"
  | "coordinator"
  | "ai_brain";

export type EdgeNodeHealth =
  | "online"
  | "offline"
  | "degraded"
  | "not_configured"
  | "unknown";

export type EdgeActionRisk =
  | "read_only"
  | "dry_run"
  | "proposal"
  | "approval_required"
  | "blocked"
  | "manual_only";

export interface EdgeNodeCapability {
  id: string;
  label: string;
  riskTier: EdgeActionRisk;
  enabled: boolean;
}

export interface EdgeNodeAuthProfile {
  /** Type of auth only — actual credentials are never stored in this profile record */
  authType: "none" | "token" | "basic" | "certificate";
}

export interface EdgeNodeProfile {
  id: string;
  name: string;
  nodeType: EdgeNodeType;
  roles: EdgeNodeRole[];
  /** Base endpoint URL — stored without credentials */
  endpoint: string;
  authProfile: EdgeNodeAuthProfile;
  health: EdgeNodeHealth;
  lastSeenAt: string | null;
  allowedCapabilities: EdgeNodeCapability[];
  /** true only for the gaming PC node */
  isGamingPc: boolean;
  /** Always false for gaming PC (hard limit). true only for dedicated always-on nodes. */
  alwaysOn: boolean;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface EdgeNodeHealthResult {
  nodeId: string;
  health: EdgeNodeHealth;
  latencyMs?: number;
  message: string;
  checkedAt: string;
}

export interface EdgeActionEvalResult {
  allowed: boolean;
  riskTier: EdgeActionRisk;
  requiresApproval: boolean;
  message: string;
  /** Always false in Phase 14A — nothing executes on remote nodes */
  executed: false;
}

// ── Hard limits ───────────────────────────────────────────────────────────────

/** Gaming PC alwaysOn is permanently false — cannot be overridden by any input */
const GAMING_PC_ALWAYS_ON: false = false;

/** Camera frame capture is permanently blocked — privacy risk */
const BLOCKED_CAPABILITIES = new Set(["camera_frame_capture"]);

/** Shop relays are permanently manual_only — physical danger */
const MANUAL_ONLY_CAPABILITIES = new Set(["shop_relay_control", "shop_power_control"]);

// ── Lazy DDL ──────────────────────────────────────────────────────────────────

export function ensureEdgeNodeTables(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS edge_nodes (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      node_type         TEXT NOT NULL DEFAULT 'unknown',
      roles_json        TEXT NOT NULL DEFAULT '[]',
      endpoint          TEXT NOT NULL DEFAULT '',
      auth_type         TEXT NOT NULL DEFAULT 'none',
      health            TEXT NOT NULL DEFAULT 'not_configured',
      last_seen_at      TEXT,
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      is_gaming_pc      INTEGER NOT NULL DEFAULT 0,
      always_on         INTEGER NOT NULL DEFAULT 0,
      description       TEXT NOT NULL DEFAULT '',
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );
  `);
}

// ── Default capabilities by role ──────────────────────────────────────────────

function defaultCapabilitiesForRoles(roles: EdgeNodeRole[]): EdgeNodeCapability[] {
  const caps: EdgeNodeCapability[] = [];

  if (roles.includes("home_assistant")) {
    caps.push(
      { id: "ha_status_read",         label: "Read HA status/entities",            riskTier: "read_only",         enabled: true  },
      { id: "ha_entity_control",      label: "Control HA entities (lights/switches)", riskTier: "approval_required", enabled: false },
      { id: "ha_automation_trigger",  label: "Trigger HA automations",             riskTier: "approval_required", enabled: false },
    );
  }
  if (roles.includes("printer_host")) {
    caps.push(
      { id: "printer_status_read",    label: "Read printer status",                riskTier: "read_only",         enabled: true  },
      { id: "printer_queue_manage",   label: "Manage print queue",                 riskTier: "approval_required", enabled: false },
    );
  }
  if (roles.includes("camera_nvr")) {
    caps.push(
      { id: "camera_status_read",     label: "Read camera/NVR status (no frames)", riskTier: "read_only",         enabled: true  },
      // Permanently blocked — privacy risk; no approval can unblock
      { id: "camera_frame_capture",   label: "Capture camera frames",              riskTier: "blocked",           enabled: false },
    );
  }
  if (roles.includes("nas_storage")) {
    caps.push(
      { id: "nas_status_read",        label: "Read NAS status/capacity",           riskTier: "read_only",         enabled: true  },
      { id: "nas_file_read",          label: "Read files from NAS",                riskTier: "proposal",          enabled: false },
      { id: "nas_file_write",         label: "Write files to NAS",                 riskTier: "approval_required", enabled: false },
    );
  }
  if (roles.includes("shop_controller")) {
    caps.push(
      { id: "shop_status_read",       label: "Read shop device status",            riskTier: "read_only",         enabled: true  },
      // Permanently manual_only — physical danger
      { id: "shop_relay_control",     label: "Control shop relays/power",          riskTier: "manual_only",       enabled: false },
    );
  }
  if (roles.includes("worker_node") || roles.includes("homelab_node")) {
    caps.push(
      { id: "service_status_read",    label: "Read service health",                riskTier: "read_only",         enabled: true  },
      { id: "service_restart",        label: "Restart services",                   riskTier: "approval_required", enabled: false },
    );
  }
  if (roles.includes("ai_brain") || roles.includes("coordinator")) {
    caps.push(
      { id: "ai_status_read",         label: "Read AI/model service status",       riskTier: "read_only",         enabled: true  },
    );
  }

  return caps;
}

// ── Row mapper ────────────────────────────────────────────────────────────────

interface EdgeNodeRow {
  id: string; name: string; node_type: string; roles_json: string;
  endpoint: string; auth_type: string; health: string; last_seen_at: string | null;
  capabilities_json: string; is_gaming_pc: number; always_on: number;
  description: string; created_at: string; updated_at: string;
}

function rowToProfile(r: EdgeNodeRow): EdgeNodeProfile {
  const isGamingPc = r.is_gaming_pc === 1;
  return {
    id: r.id,
    name: r.name,
    nodeType: r.node_type as EdgeNodeType,
    roles: JSON.parse(r.roles_json) as EdgeNodeRole[],
    endpoint: r.endpoint,
    authProfile: { authType: r.auth_type as EdgeNodeAuthProfile["authType"] },
    health: r.health as EdgeNodeHealth,
    lastSeenAt: r.last_seen_at,
    allowedCapabilities: JSON.parse(r.capabilities_json) as EdgeNodeCapability[],
    isGamingPc,
    // Gaming PC alwaysOn is ALWAYS false — hard limit enforced here
    alwaysOn: isGamingPc ? GAMING_PC_ALWAYS_ON : r.always_on === 1,
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function listEdgeNodes(): EdgeNodeProfile[] {
  ensureEdgeNodeTables();
  const rows = sqlite.prepare(
    "SELECT * FROM edge_nodes ORDER BY created_at ASC"
  ).all() as EdgeNodeRow[];
  return rows.map(rowToProfile);
}

export function getEdgeNode(id: string): EdgeNodeProfile | null {
  ensureEdgeNodeTables();
  const row = sqlite.prepare(
    "SELECT * FROM edge_nodes WHERE id = ?"
  ).get(id) as EdgeNodeRow | undefined;
  return row ? rowToProfile(row) : null;
}

export interface UpsertEdgeNodeInput {
  id?: string;
  name: string;
  nodeType?: EdgeNodeType;
  roles?: EdgeNodeRole[];
  endpoint?: string;
  authType?: EdgeNodeAuthProfile["authType"];
  allowedCapabilities?: EdgeNodeCapability[];
  isGamingPc?: boolean;
  alwaysOn?: boolean;
  description?: string;
}

export function upsertEdgeNode(input: UpsertEdgeNodeInput): EdgeNodeProfile {
  ensureEdgeNodeTables();
  const now = new Date().toISOString();
  const id = input.id ?? randomUUID();
  const existing = input.id ? getEdgeNode(input.id) : null;

  const roles = input.roles ?? existing?.roles ?? [];
  const isGamingPc = input.isGamingPc ?? existing?.isGamingPc ?? false;
  // Hard limit: gaming PC cannot be always-on
  const alwaysOn = isGamingPc ? false : (input.alwaysOn ?? existing?.alwaysOn ?? false);

  // Apply hard limits to any supplied capabilities
  const rawCaps = input.allowedCapabilities
    ?? existing?.allowedCapabilities
    ?? defaultCapabilitiesForRoles(roles);
  const caps = rawCaps.map((c) => {
    if (BLOCKED_CAPABILITIES.has(c.id))   return { ...c, riskTier: "blocked"     as EdgeActionRisk, enabled: false };
    if (MANUAL_ONLY_CAPABILITIES.has(c.id)) return { ...c, riskTier: "manual_only" as EdgeActionRisk, enabled: false };
    return c;
  });

  sqlite.prepare(`
    INSERT INTO edge_nodes
      (id, name, node_type, roles_json, endpoint, auth_type, health,
       last_seen_at, capabilities_json, is_gaming_pc, always_on, description,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name              = excluded.name,
      node_type         = excluded.node_type,
      roles_json        = excluded.roles_json,
      endpoint          = excluded.endpoint,
      auth_type         = excluded.auth_type,
      capabilities_json = excluded.capabilities_json,
      is_gaming_pc      = excluded.is_gaming_pc,
      always_on         = excluded.always_on,
      description       = excluded.description,
      updated_at        = excluded.updated_at
  `).run(
    id,
    input.name,
    input.nodeType ?? existing?.nodeType ?? "unknown",
    JSON.stringify(roles),
    input.endpoint ?? existing?.endpoint ?? "",
    input.authType ?? existing?.authProfile.authType ?? "none",
    existing?.health ?? "not_configured",
    existing?.lastSeenAt ?? null,
    JSON.stringify(caps),
    isGamingPc ? 1 : 0,
    alwaysOn ? 1 : 0,
    input.description ?? existing?.description ?? "",
    existing?.createdAt ?? now,
    now,
  );

  const profile = getEdgeNode(id)!;

  thoughtLog.publish({
    category: "system",
    title: "Edge Node Registered",
    message: `Edge node '${profile.name}' registered (type: ${profile.nodeType})`,
    // Never log endpoint URL or auth details — could contain IP/token
    metadata: { nodeId: id, nodeType: profile.nodeType, isGamingPc, alwaysOn: profile.alwaysOn, roles },
  });

  return profile;
}

export function deleteEdgeNode(id: string): boolean {
  ensureEdgeNodeTables();
  const node = getEdgeNode(id);
  if (!node) return false;
  sqlite.prepare("DELETE FROM edge_nodes WHERE id = ?").run(id);
  thoughtLog.publish({
    category: "system",
    title: "Edge Node Removed",
    message: `Edge node '${node.name}' removed from registry`,
    metadata: { nodeId: id },
  });
  return true;
}

export function updateEdgeNodeHealth(id: string, health: EdgeNodeHealth, lastSeenAt?: string): void {
  ensureEdgeNodeTables();
  const now = new Date().toISOString();
  const seenAt = (health === "online" || health === "degraded") ? (lastSeenAt ?? now) : undefined;
  sqlite.prepare(
    "UPDATE edge_nodes SET health = ?, last_seen_at = COALESCE(?, last_seen_at), updated_at = ? WHERE id = ?"
  ).run(health, seenAt ?? null, now, id);
}

// ── Health check (read-only probe — NO remote mutation) ───────────────────────

export async function checkEdgeNodeHealth(id: string): Promise<EdgeNodeHealthResult> {
  const node = getEdgeNode(id);
  const checkedAt = new Date().toISOString();

  if (!node) {
    return { nodeId: id, health: "unknown", message: "Node not found in registry", checkedAt };
  }

  // Gaming PC: skip probe regardless of endpoint — not assumed always-on (hard limit)
  if (node.isGamingPc) {
    return {
      nodeId: id,
      health: "unknown",
      message: "Gaming PC is not assumed always-on; live probe skipped",
      checkedAt,
    };
  }

  if (!node.endpoint) {
    return { nodeId: id, health: "not_configured", message: "No endpoint configured", checkedAt };
  }

  // Read-only HTTP GET — no body, no state change on remote node
  const controller = new AbortController();
  const probeTimeout = setTimeout(() => controller.abort(), 5000);
  const startedAt = Date.now();
  try {
    const resp = await fetch(node.endpoint, { method: "GET", signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    const health: EdgeNodeHealth = resp.ok ? "online" : "degraded";
    updateEdgeNodeHealth(id, health, checkedAt);
    // Never log endpoint URL — could reveal private network topology
    return { nodeId: id, health, latencyMs, message: `HTTP ${resp.status}`, checkedAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateEdgeNodeHealth(id, "offline");
    return { nodeId: id, health: "offline", message: `Unreachable: ${message}`, checkedAt };
  } finally {
    clearTimeout(probeTimeout);
  }
}

// ── Edge action evaluation ────────────────────────────────────────────────────

export function evaluateEdgeAction(
  nodeId: string,
  capabilityId: string,
): EdgeActionEvalResult {
  const node = getEdgeNode(nodeId);
  if (!node) {
    return { allowed: false, riskTier: "blocked", requiresApproval: false, message: "Node not found", executed: false };
  }

  const cap = node.allowedCapabilities.find((c) => c.id === capabilityId);
  if (!cap) {
    return { allowed: false, riskTier: "blocked", requiresApproval: false, message: `Capability '${capabilityId}' not registered`, executed: false };
  }

  // Hard limits override everything
  if (BLOCKED_CAPABILITIES.has(capabilityId)) {
    return { allowed: false, riskTier: "blocked", requiresApproval: false, message: `Action '${cap.label}' is permanently blocked`, executed: false };
  }
  if (MANUAL_ONLY_CAPABILITIES.has(capabilityId)) {
    return { allowed: false, riskTier: "manual_only", requiresApproval: false, message: `Action '${cap.label}' is manual_only (physical danger)`, executed: false };
  }

  if (!cap.enabled) {
    return { allowed: false, riskTier: cap.riskTier, requiresApproval: cap.riskTier === "approval_required", message: `Capability '${cap.label}' is disabled`, executed: false };
  }
  if (cap.riskTier === "blocked" || cap.riskTier === "manual_only") {
    return { allowed: false, riskTier: cap.riskTier, requiresApproval: false, message: `Action '${cap.label}' is ${cap.riskTier}`, executed: false };
  }
  if (cap.riskTier === "approval_required") {
    return { allowed: false, riskTier: "approval_required", requiresApproval: true, message: `Action '${cap.label}' requires human approval`, executed: false };
  }

  // read_only / dry_run / proposal are allowed (but still not executed in Phase 14A)
  return {
    allowed: true,
    riskTier: cap.riskTier,
    requiresApproval: false,
    message: `Action '${cap.label}' is ${cap.riskTier} — no execution in Phase 14A`,
    executed: false,
  };
}

// ── Gaming PC role description ────────────────────────────────────────────────

export function getGamingPcRoleDescription(): Record<string, unknown> {
  return {
    role: "gaming_pc",
    alwaysOn: false,  // HARD LIMIT — never true
    purpose: "Heavy local AI brain, CAD/coding/media workstation, optional on-demand coordinator",
    notSuitableFor: [
      "Always-on Home Assistant host (use a dedicated mini PC or Pi)",
      "Always-on camera NVR (use a dedicated NVR or NAS)",
      "Always-on MQTT broker (use a dedicated Pi or mini PC)",
      "Always-on Zigbee2MQTT/Z-Wave hub",
      "Critical home safety automation host that must survive gaming PC reboots",
      "Always-on shop compressor/relay controller",
    ],
    suitableFor: [
      "Local LLM inference with Ollama (heavy models)",
      "CAD/rendering/media processing",
      "Coding agent runtime and code review",
      "On-demand AI task orchestration when powered on",
      "Optional coordinator for edge nodes when powered on",
    ],
    recommendation: "Deploy a Raspberry Pi 4/5, mini PC (N100/N305), or NAS for always-on home/shop services",
  };
}
