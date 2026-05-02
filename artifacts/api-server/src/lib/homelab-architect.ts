import { randomUUID } from "crypto";
import { sqlite } from "../db/database.js";
import { createApprovalRequest, getApprovalRequest, type ApprovalRequest } from "./approval-queue.js";
import { recordAuditEvent } from "./platform-foundation.js";
import { thoughtLog } from "./thought-log.js";

// ── Source of truth ───────────────────────────────────────────────────────────

export const HOMELAB_ARCHITECT_SOURCE_OF_TRUTH = `
HomeLab Architect Source of Truth (Phase 15A)
=============================================
Purpose: Local-first inventory and planning layer for home network, servers,
VMs, VLANs, subnets, DNS zones, and services. Read and plan before any config.

Supported optional integrations (all not_configured by default):
- NetBox: local DCIM/IPAM instance (read-only sync; write requires approval)
- Nautobot: local network source-of-truth platform (read-only sync)
- Proxmox: local hypervisor API (VM/container inventory read-only)
- OPNsense: local firewall API (interface/VLAN/rule read-only)
- UniFi: local UniFi controller (switch/AP/client inventory read-only)
- Ansible: local inventory and playbook catalog (read-only, dry-run only)
- OpenTofu/Terraform: local state files (read-only; no apply in this phase)
- Batfish: local network analysis (read-only config validation)

Hard limits (Phase 15A):
- No firewall, VLAN, routing, DNS, DHCP, VPN, switch, router, Proxmox, NAS,
  service, or device configuration may be applied in this phase.
- All sync is read-only or proposal-only; write/apply requires Phase 15B.
- No real network/device API calls during default tests (not_configured mode).
- Unknown devices, networks, and providers are marked unknown/not_configured,
  never guessed as confirmed.
- Diagrams distinguish confirmed vs proposed vs unknown data sources.
- Secrets, API keys, device tokens, firewall/router credentials, private IP
  maps, public IPs, VPN data, and camera/device info are never logged.
- Missing optional providers report not_configured/degraded, never fake success.
- No cloud network tools are required or used.
- applied=false always in Phase 15A (TypeScript literal type).

Phase 16 Home SOC:
- Home SOC is a read-first analysis/control layer over the HomeLab inventory,
  Phase 15B config/apply safety pipeline, Phase 14 edge node model, and Phase 14
  home/shop automation policies.
- Wazuh, Zeek, Suricata, OPNsense IDS/IPS, Pi-hole, AdGuard Home, LibreNMS,
  Zabbix, Netdata, Uptime Kuma, osquery, firewall/router APIs, SIEM exports,
  and packet capture tools are optional and not_configured by default.
- Default tests and default runtime do not install, start, scan, sniff traffic,
  enable IDS/IPS, change firewall rules, block devices, quarantine devices,
  modify DNS/DHCP/VLANs, or call real monitoring/security APIs.
- Alert summaries distinguish confirmed facts, inferred possibilities, unknown
  data, and proposed next actions. Missing data is marked unknown, never guessed.
- Security remediation actions are read_only, dry_run, proposal,
  approval_required, blocked, manual_only, or not_configured by default.
- Denied remediation approvals do not execute. Approved remediation still
  remains not_configured until a later provider-specific executor exists.
- Secrets, API keys, firewall/router credentials, private/public IP maps, VPN
  data, packet contents, camera data, home layout, presence data, and raw
  security logs are never written to audit/thought metadata.
`;

// ── Types ─────────────────────────────────────────────────────────────────────

export type HomelabProviderStatus = "not_configured" | "degraded" | "disabled" | "read_only";
export type HomelabDataConfidence = "confirmed" | "proposed" | "unknown";

export type HomelabDeviceRole =
  | "router"
  | "switch"
  | "firewall"
  | "access_point"
  | "server"
  | "nas"
  | "hypervisor"
  | "mini_pc"
  | "workstation"
  | "gaming_pc"
  | "printer"
  | "camera"
  | "iot_hub"
  | "ups"
  | "patch_panel"
  | "unknown";

export type HomelabDeviceStatus = "online" | "offline" | "not_configured" | "unknown";
export type HomelabServiceProtocol = "tcp" | "udp" | "http" | "https" | "unknown";

export interface HomelabSite {
  id: string;
  name: string;
  description: string;
  location: string;
  confidence: HomelabDataConfidence;
  createdAt: string;
  updatedAt: string;
}

export interface HomelabDevice {
  id: string;
  name: string;
  role: HomelabDeviceRole;
  siteId: string;
  make: string;
  model: string;
  serialNumber: string;
  /** Stored by reference label only — never logged as raw IP */
  managementIpRef: string;
  status: HomelabDeviceStatus;
  confidence: HomelabDataConfidence;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface HomelabVlan {
  id: string;
  vlanId: number;
  name: string;
  description: string;
  siteId: string;
  confidence: HomelabDataConfidence;
  createdAt: string;
  updatedAt: string;
}

export interface HomelabSubnet {
  id: string;
  /** CIDR notation, e.g. 192.168.10.0/24 */
  prefix: string;
  description: string;
  vlanId: string;
  siteId: string;
  /** Stored by reference label only — not logged */
  gatewayRef: string;
  confidence: HomelabDataConfidence;
  createdAt: string;
  updatedAt: string;
}

export interface HomelabService {
  id: string;
  name: string;
  serviceType: string;
  hostDeviceId: string;
  containerName: string;
  port: number;
  protocol: HomelabServiceProtocol;
  confidence: HomelabDataConfidence;
  status: HomelabDeviceStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface HomelabProviderProfile {
  providerId: string;
  name: string;
  status: HomelabProviderStatus;
  reason: string;
  lastSyncAt?: string;
  recordCount: number;
}

export interface HomelabBlueprint {
  id: string;
  generatedAt: string;
  overallConfidence: HomelabDataConfidence;
  sites: HomelabSite[];
  devices: HomelabDevice[];
  vlans: HomelabVlan[];
  subnets: HomelabSubnet[];
  services: HomelabService[];
  providers: HomelabProviderProfile[];
  notes: string[];
  /** Always false in Phase 15A — no config is applied */
  applied: false;
}

export interface HomelabInventoryStatus {
  sitesCount: number;
  devicesCount: number;
  vlansCount: number;
  subnetsCount: number;
  servicesCount: number;
  providers: HomelabProviderProfile[];
  sourceOfTruth: string;
}

export interface HomelabValidationResult {
  valid: boolean;
  reason?: string;
}

export type HomelabConfigProviderId =
  | "netbox"
  | "nautobot"
  | "proxmox"
  | "opnsense"
  | "unifi"
  | "ansible"
  | "opentofu"
  | "docker-compose"
  | "batfish";

export type HomelabConfigProposalType =
  | "vlan_ip_dns_dhcp_firewall"
  | "proxmox_layout"
  | "docker_compose_stack"
  | "backup_monitoring_plan"
  | "ansible_playbook"
  | "opentofu_terraform"
  | "opnsense_draft"
  | "unifi_draft"
  | "netbox_nautobot_draft";

export type HomelabPipelineState =
  | "drafted"
  | "validation_required"
  | "validation_passed"
  | "validation_failed"
  | "approval_required"
  | "approved"
  | "apply_blocked"
  | "applied"
  | "rollback_required"
  | "rolled_back"
  | "not_configured"
  | "dry_run";

export type HomelabConfigValidationKind = "static" | "simulated" | "unavailable_provider" | "real_provider";
export type HomelabConfigValidationStatus = "not_run" | "passed" | "failed" | "not_configured" | "degraded";
export type HomelabConfigApprovalStatus = "not_required" | "waiting_for_approval" | "approved" | "denied";

export interface HomelabConfigSafetyPlan {
  required: boolean;
  available: boolean;
  mode: "proposal_only" | "manual" | "configured";
  summary: string;
  steps: string[];
}

export interface HomelabConfigProposal {
  id: string;
  sourceInventoryRef: string;
  sourceBlueprintId: string;
  proposalType: HomelabConfigProposalType;
  targetProvider: HomelabConfigProviderId;
  targetType: string;
  draftMetadata: Record<string, unknown>;
  expectedChanges: Array<Record<string, unknown>>;
  diffSummary: Record<string, unknown>;
  validationStatus: HomelabConfigValidationStatus;
  validationKind: HomelabConfigValidationKind;
  validationNotes: string[];
  approvalStatus: HomelabConfigApprovalStatus;
  approvalId?: string;
  backupPlan: HomelabConfigSafetyPlan;
  rollbackPlan: HomelabConfigSafetyPlan;
  applyStatus: HomelabPipelineState;
  notConfiguredReason: string;
  providerStatus: HomelabProviderStatus;
  dryRun: boolean;
  executed: boolean;
  apiCallsMade: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HomelabConfigValidationOutcome {
  proposal: HomelabConfigProposal;
  status: HomelabConfigValidationStatus;
  kind: HomelabConfigValidationKind;
  notes: string[];
  realProviderCheck: boolean;
}

export interface HomelabConfigApplyOutcome {
  proposal: HomelabConfigProposal;
  allowed: boolean;
  status: HomelabPipelineState;
  reason: string;
  approvalId?: string;
  executed: false;
  apiCallsMade: false;
}

export type HomelabSocProviderId =
  | "wazuh"
  | "zeek"
  | "suricata"
  | "opnsense-ids"
  | "pihole"
  | "adguard-home"
  | "librenms"
  | "zabbix"
  | "netdata"
  | "uptime-kuma"
  | "osquery";

export type HomelabSocSeverity = "info" | "low" | "medium" | "high" | "critical";
export type HomelabSocAlertStatus = "open" | "acknowledged" | "resolved" | "not_configured";
export type HomelabSocReportKind =
  | "unknown_device_report"
  | "suspicious_dns_summary"
  | "wan_outage_timeline"
  | "noisy_iot_device_summary"
  | "what_changed_report";
export type HomelabSocRemediationAction =
  | "read_only_review"
  | "collect_logs"
  | "block_device"
  | "firewall_rule_change"
  | "isolate_vlan"
  | "dns_filter_change"
  | "kill_process"
  | "delete_file"
  | "disable_account"
  | "packet_capture";
export type HomelabSocActionMode =
  | "read_only"
  | "dry_run"
  | "proposal"
  | "approval_required"
  | "blocked"
  | "manual_only"
  | "not_configured";

export interface HomelabSocProviderProfile extends HomelabProviderProfile {
  providerId: HomelabSocProviderId;
  category: "siem" | "ids" | "dns" | "monitoring" | "endpoint";
  startupPolicy: "disabled";
  dataLeavesMachine: false;
}

export interface HomelabSocAlertSummary {
  confirmedFacts: string[];
  inferredPossibilities: string[];
  unknowns: string[];
  proposedNextActions: string[];
}

export interface HomelabSocAlert {
  id: string;
  title: string;
  severity: HomelabSocSeverity;
  category: string;
  sourceProvider: HomelabSocProviderId;
  deviceRef: string;
  summary: HomelabSocAlertSummary;
  status: HomelabSocAlertStatus;
  evidenceRefs: string[];
  providerStatus: HomelabProviderStatus;
  notConfiguredReason: string;
  localOnly: true;
  apiCallsMade: false;
  createdAt: string;
  updatedAt: string;
}

export interface HomelabSocReport {
  id: string;
  kind: HomelabSocReportKind;
  generatedAt: string;
  sourceInventoryRef: string;
  modelProvider: "local";
  localFirst: true;
  cloudRequired: false;
  apiCallsMade: false;
  summary: HomelabSocAlertSummary;
  counts: Record<string, number>;
  providerStatus: HomelabProviderStatus;
  notConfiguredReason: string;
}

export interface HomelabSocRemediationProposal {
  id: string;
  alertId: string;
  action: HomelabSocRemediationAction;
  mode: HomelabSocActionMode;
  status: "proposal" | "approval_required" | "denied" | "blocked" | "not_configured" | "dry_run" | "read_only";
  reason: string;
  approvalId?: string;
  linkedConfigProposalId?: string;
  dryRun: true;
  executed: false;
  apiCallsMade: false;
  createdAt: string;
  updatedAt: string;
}

export interface HomelabSocStatus {
  alertsCount: number;
  openAlertsCount: number;
  providers: HomelabSocProviderProfile[];
  sourceOfTruth: string;
  localFirst: true;
  cloudRequired: false;
  realSecurityApiCallsEnabled: false;
}

// ── Optional providers (all not_configured until explicitly configured) ────────

const HOMELAB_PROVIDERS: HomelabProviderProfile[] = [
  {
    providerId: "netbox",
    name: "NetBox (DCIM/IPAM)",
    status: "not_configured",
    reason: "No NetBox endpoint or API token configured. Add NetBox URL and token to enable read-only inventory sync.",
    recordCount: 0,
  },
  {
    providerId: "nautobot",
    name: "Nautobot (Network SoT)",
    status: "not_configured",
    reason: "No Nautobot endpoint or API token configured. Add Nautobot URL and token to enable read-only sync.",
    recordCount: 0,
  },
  {
    providerId: "proxmox",
    name: "Proxmox VE (Hypervisor)",
    status: "not_configured",
    reason: "No Proxmox host or API token configured. VM/container inventory is not available.",
    recordCount: 0,
  },
  {
    providerId: "opnsense",
    name: "OPNsense (Firewall)",
    status: "not_configured",
    reason: "No OPNsense host or API key configured. Firewall interface/VLAN/rule inventory is not available.",
    recordCount: 0,
  },
  {
    providerId: "unifi",
    name: "UniFi Controller",
    status: "not_configured",
    reason: "No UniFi controller URL or credentials configured. Switch/AP/client inventory is not available.",
    recordCount: 0,
  },
  {
    providerId: "ansible",
    name: "Ansible (Automation)",
    status: "not_configured",
    reason: "No Ansible inventory or playbook catalog path configured. Dry-run only once configured.",
    recordCount: 0,
  },
  {
    providerId: "opentofu",
    name: "OpenTofu / Terraform (IaC)",
    status: "not_configured",
    reason: "No OpenTofu/Terraform state path configured. Read-only state inspection only; no apply in Phase 15A.",
    recordCount: 0,
  },
  {
    providerId: "docker-compose",
    name: "Docker Compose (Service Stacks)",
    status: "not_configured",
    reason: "No Docker host or compose project root configured. Compose drafts remain proposal-only.",
    recordCount: 0,
  },
  {
    providerId: "batfish",
    name: "Batfish (Network Analysis)",
    status: "not_configured",
    reason: "No Batfish host configured. Config validation is not available.",
    recordCount: 0,
  },
];

export function getHomelabProviders(): HomelabProviderProfile[] {
  return HOMELAB_PROVIDERS.map((p) => ({ ...p }));
}

const HOMELAB_SOC_PROVIDERS: HomelabSocProviderProfile[] = [
  {
    providerId: "wazuh",
    name: "Wazuh (SIEM / endpoint security)",
    status: "not_configured",
    reason: "No Wazuh manager endpoint or local export path configured. Alert sync is unavailable.",
    recordCount: 0,
    category: "siem",
    startupPolicy: "disabled",
    dataLeavesMachine: false,
  },
  {
    providerId: "zeek",
    name: "Zeek (network security monitoring)",
    status: "not_configured",
    reason: "No Zeek log directory configured. Packet/log analysis is unavailable.",
    recordCount: 0,
    category: "ids",
    startupPolicy: "disabled",
    dataLeavesMachine: false,
  },
  {
    providerId: "suricata",
    name: "Suricata (IDS)",
    status: "not_configured",
    reason: "No Suricata EVE log path configured. IDS events are unavailable.",
    recordCount: 0,
    category: "ids",
    startupPolicy: "disabled",
    dataLeavesMachine: false,
  },
  {
    providerId: "opnsense-ids",
    name: "OPNsense IDS/IPS",
    status: "not_configured",
    reason: "No OPNsense IDS API profile configured. IDS status/rule data is unavailable.",
    recordCount: 0,
    category: "ids",
    startupPolicy: "disabled",
    dataLeavesMachine: false,
  },
  {
    providerId: "pihole",
    name: "Pi-hole (DNS filtering)",
    status: "not_configured",
    reason: "No Pi-hole endpoint or token reference configured. DNS summaries are unavailable.",
    recordCount: 0,
    category: "dns",
    startupPolicy: "disabled",
    dataLeavesMachine: false,
  },
  {
    providerId: "adguard-home",
    name: "AdGuard Home (DNS filtering)",
    status: "not_configured",
    reason: "No AdGuard Home endpoint or token reference configured. DNS summaries are unavailable.",
    recordCount: 0,
    category: "dns",
    startupPolicy: "disabled",
    dataLeavesMachine: false,
  },
  {
    providerId: "librenms",
    name: "LibreNMS (network monitoring)",
    status: "not_configured",
    reason: "No LibreNMS endpoint or token reference configured. Device telemetry is unavailable.",
    recordCount: 0,
    category: "monitoring",
    startupPolicy: "disabled",
    dataLeavesMachine: false,
  },
  {
    providerId: "zabbix",
    name: "Zabbix (monitoring)",
    status: "not_configured",
    reason: "No Zabbix endpoint or token reference configured. Monitoring events are unavailable.",
    recordCount: 0,
    category: "monitoring",
    startupPolicy: "disabled",
    dataLeavesMachine: false,
  },
  {
    providerId: "netdata",
    name: "Netdata (host telemetry)",
    status: "not_configured",
    reason: "No Netdata endpoint configured. Host telemetry is unavailable.",
    recordCount: 0,
    category: "monitoring",
    startupPolicy: "disabled",
    dataLeavesMachine: false,
  },
  {
    providerId: "uptime-kuma",
    name: "Uptime Kuma (availability monitoring)",
    status: "not_configured",
    reason: "No Uptime Kuma endpoint configured. Availability events are unavailable.",
    recordCount: 0,
    category: "monitoring",
    startupPolicy: "disabled",
    dataLeavesMachine: false,
  },
  {
    providerId: "osquery",
    name: "osquery (endpoint inventory)",
    status: "not_configured",
    reason: "No osquery local result path configured. Endpoint inventory/security facts are unavailable.",
    recordCount: 0,
    category: "endpoint",
    startupPolicy: "disabled",
    dataLeavesMachine: false,
  },
];

export function getHomelabSocProviders(): HomelabSocProviderProfile[] {
  return HOMELAB_SOC_PROVIDERS.map((p) => ({ ...p }));
}

export function getNetboxStatus(): HomelabProviderProfile {
  return { ...HOMELAB_PROVIDERS.find((p) => p.providerId === "netbox")! };
}

export function getNautobotStatus(): HomelabProviderProfile {
  return { ...HOMELAB_PROVIDERS.find((p) => p.providerId === "nautobot")! };
}

// ── Lazy DDL ──────────────────────────────────────────────────────────────────

let _tablesEnsured = false;

export function ensureHomelabTables(): void {
  if (_tablesEnsured) return;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS homelab_sites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      confidence TEXT NOT NULL DEFAULT 'unknown',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS homelab_devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'unknown',
      site_id TEXT NOT NULL DEFAULT '',
      make TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      serial_number TEXT NOT NULL DEFAULT '',
      management_ip_ref TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'unknown',
      confidence TEXT NOT NULL DEFAULT 'unknown',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS homelab_vlans (
      id TEXT PRIMARY KEY,
      vlan_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      site_id TEXT NOT NULL DEFAULT '',
      confidence TEXT NOT NULL DEFAULT 'unknown',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS homelab_subnets (
      id TEXT PRIMARY KEY,
      prefix TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      vlan_id TEXT NOT NULL DEFAULT '',
      site_id TEXT NOT NULL DEFAULT '',
      gateway_ref TEXT NOT NULL DEFAULT '',
      confidence TEXT NOT NULL DEFAULT 'unknown',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS homelab_services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      service_type TEXT NOT NULL DEFAULT '',
      host_device_id TEXT NOT NULL DEFAULT '',
      container_name TEXT NOT NULL DEFAULT '',
      port INTEGER NOT NULL DEFAULT 0,
      protocol TEXT NOT NULL DEFAULT 'unknown',
      confidence TEXT NOT NULL DEFAULT 'unknown',
      status TEXT NOT NULL DEFAULT 'unknown',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS homelab_config_proposals (
      id TEXT PRIMARY KEY,
      source_inventory_ref TEXT NOT NULL,
      source_blueprint_id TEXT NOT NULL,
      proposal_type TEXT NOT NULL,
      target_provider TEXT NOT NULL,
      target_type TEXT NOT NULL,
      draft_metadata_json TEXT NOT NULL DEFAULT '{}',
      expected_changes_json TEXT NOT NULL DEFAULT '[]',
      diff_summary_json TEXT NOT NULL DEFAULT '{}',
      validation_status TEXT NOT NULL DEFAULT 'not_run',
      validation_kind TEXT NOT NULL DEFAULT 'static',
      validation_notes_json TEXT NOT NULL DEFAULT '[]',
      approval_status TEXT NOT NULL DEFAULT 'not_required',
      approval_id TEXT,
      backup_plan_json TEXT NOT NULL DEFAULT '{}',
      rollback_plan_json TEXT NOT NULL DEFAULT '{}',
      apply_status TEXT NOT NULL DEFAULT 'drafted',
      not_configured_reason TEXT NOT NULL DEFAULT '',
      provider_status TEXT NOT NULL DEFAULT 'not_configured',
      dry_run INTEGER NOT NULL DEFAULT 1,
      executed INTEGER NOT NULL DEFAULT 0,
      api_calls_made INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS homelab_soc_alerts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      category TEXT NOT NULL DEFAULT 'general',
      source_provider TEXT NOT NULL,
      device_ref TEXT NOT NULL DEFAULT '',
      summary_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'open',
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      provider_status TEXT NOT NULL DEFAULT 'not_configured',
      not_configured_reason TEXT NOT NULL DEFAULT '',
      api_calls_made INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS homelab_soc_remediation_proposals (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL,
      action TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      approval_id TEXT,
      linked_config_proposal_id TEXT,
      dry_run INTEGER NOT NULL DEFAULT 1,
      executed INTEGER NOT NULL DEFAULT 0,
      api_calls_made INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  _tablesEnsured = true;
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseArray(value: unknown): Array<Record<string, unknown>> {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === "object") as Array<Record<string, unknown>> : [];
  } catch {
    return [];
  }
}

function parseStringArray(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
}

function rowToSafetyPlan(value: unknown): HomelabConfigSafetyPlan {
  const parsed = parseObject(value);
  return {
    required: parsed.required !== false,
    available: parsed.available === true,
    mode: (parsed.mode as HomelabConfigSafetyPlan["mode"]) ?? "proposal_only",
    summary: String(parsed.summary ?? ""),
    steps: Array.isArray(parsed.steps) ? parsed.steps.map((step) => String(step)) : [],
  };
}

function rowToConfigProposal(r: Record<string, unknown>): HomelabConfigProposal {
  const approvalId = (r["approval_id"] as string | null) ?? undefined;
  return {
    id: String(r["id"]),
    sourceInventoryRef: String(r["source_inventory_ref"]),
    sourceBlueprintId: String(r["source_blueprint_id"]),
    proposalType: r["proposal_type"] as HomelabConfigProposalType,
    targetProvider: r["target_provider"] as HomelabConfigProviderId,
    targetType: String(r["target_type"]),
    draftMetadata: parseObject(r["draft_metadata_json"]),
    expectedChanges: parseArray(r["expected_changes_json"]),
    diffSummary: parseObject(r["diff_summary_json"]),
    validationStatus: r["validation_status"] as HomelabConfigValidationStatus,
    validationKind: r["validation_kind"] as HomelabConfigValidationKind,
    validationNotes: parseStringArray(r["validation_notes_json"]),
    approvalStatus: r["approval_status"] as HomelabConfigApprovalStatus,
    approvalId,
    backupPlan: rowToSafetyPlan(r["backup_plan_json"]),
    rollbackPlan: rowToSafetyPlan(r["rollback_plan_json"]),
    applyStatus: r["apply_status"] as HomelabPipelineState,
    notConfiguredReason: String(r["not_configured_reason"] ?? ""),
    providerStatus: r["provider_status"] as HomelabProviderStatus,
    dryRun: Number(r["dry_run"] ?? 1) === 1,
    executed: Number(r["executed"] ?? 0) === 1,
    apiCallsMade: Number(r["api_calls_made"] ?? 0) === 1,
    createdAt: String(r["created_at"]),
    updatedAt: String(r["updated_at"]),
  };
}

function rowToSocSummary(value: unknown): HomelabSocAlertSummary {
  const parsed = parseObject(value);
  const asStrings = (entry: unknown): string[] => Array.isArray(entry) ? entry.map((item) => String(item)) : [];
  return {
    confirmedFacts: asStrings(parsed["confirmedFacts"]),
    inferredPossibilities: asStrings(parsed["inferredPossibilities"]),
    unknowns: asStrings(parsed["unknowns"]),
    proposedNextActions: asStrings(parsed["proposedNextActions"]),
  };
}

function rowToSocAlert(r: Record<string, unknown>): HomelabSocAlert {
  return {
    id: String(r["id"]),
    title: String(r["title"]),
    severity: r["severity"] as HomelabSocSeverity,
    category: String(r["category"] ?? "general"),
    sourceProvider: r["source_provider"] as HomelabSocProviderId,
    deviceRef: String(r["device_ref"] ?? ""),
    summary: rowToSocSummary(r["summary_json"]),
    status: r["status"] as HomelabSocAlertStatus,
    evidenceRefs: parseStringArray(r["evidence_refs_json"]),
    providerStatus: r["provider_status"] as HomelabProviderStatus,
    notConfiguredReason: String(r["not_configured_reason"] ?? ""),
    localOnly: true,
    apiCallsMade: false,
    createdAt: String(r["created_at"]),
    updatedAt: String(r["updated_at"]),
  };
}

function rowToSocRemediation(r: Record<string, unknown>): HomelabSocRemediationProposal {
  const approvalId = (r["approval_id"] as string | null) ?? undefined;
  const linkedConfigProposalId = (r["linked_config_proposal_id"] as string | null) ?? undefined;
  return {
    id: String(r["id"]),
    alertId: String(r["alert_id"]),
    action: r["action"] as HomelabSocRemediationAction,
    mode: r["mode"] as HomelabSocActionMode,
    status: r["status"] as HomelabSocRemediationProposal["status"],
    reason: String(r["reason"] ?? ""),
    approvalId,
    linkedConfigProposalId,
    dryRun: true,
    executed: false,
    apiCallsMade: false,
    createdAt: String(r["created_at"]),
    updatedAt: String(r["updated_at"]),
  };
}

function rowToSite(r: Record<string, unknown>): HomelabSite {
  return {
    id: String(r["id"]),
    name: String(r["name"]),
    description: String(r["description"] ?? ""),
    location: String(r["location"] ?? ""),
    confidence: (r["confidence"] as HomelabDataConfidence) ?? "unknown",
    createdAt: String(r["created_at"]),
    updatedAt: String(r["updated_at"]),
  };
}

function rowToDevice(r: Record<string, unknown>): HomelabDevice {
  return {
    id: String(r["id"]),
    name: String(r["name"]),
    role: (r["role"] as HomelabDeviceRole) ?? "unknown",
    siteId: String(r["site_id"] ?? ""),
    make: String(r["make"] ?? ""),
    model: String(r["model"] ?? ""),
    serialNumber: String(r["serial_number"] ?? ""),
    managementIpRef: String(r["management_ip_ref"] ?? ""),
    status: (r["status"] as HomelabDeviceStatus) ?? "unknown",
    confidence: (r["confidence"] as HomelabDataConfidence) ?? "unknown",
    notes: String(r["notes"] ?? ""),
    createdAt: String(r["created_at"]),
    updatedAt: String(r["updated_at"]),
  };
}

function rowToVlan(r: Record<string, unknown>): HomelabVlan {
  return {
    id: String(r["id"]),
    vlanId: Number(r["vlan_id"]),
    name: String(r["name"]),
    description: String(r["description"] ?? ""),
    siteId: String(r["site_id"] ?? ""),
    confidence: (r["confidence"] as HomelabDataConfidence) ?? "unknown",
    createdAt: String(r["created_at"]),
    updatedAt: String(r["updated_at"]),
  };
}

function rowToSubnet(r: Record<string, unknown>): HomelabSubnet {
  return {
    id: String(r["id"]),
    prefix: String(r["prefix"]),
    description: String(r["description"] ?? ""),
    vlanId: String(r["vlan_id"] ?? ""),
    siteId: String(r["site_id"] ?? ""),
    gatewayRef: String(r["gateway_ref"] ?? ""),
    confidence: (r["confidence"] as HomelabDataConfidence) ?? "unknown",
    createdAt: String(r["created_at"]),
    updatedAt: String(r["updated_at"]),
  };
}

function rowToService(r: Record<string, unknown>): HomelabService {
  return {
    id: String(r["id"]),
    name: String(r["name"]),
    serviceType: String(r["service_type"] ?? ""),
    hostDeviceId: String(r["host_device_id"] ?? ""),
    containerName: String(r["container_name"] ?? ""),
    port: Number(r["port"] ?? 0),
    protocol: (r["protocol"] as HomelabServiceProtocol) ?? "unknown",
    confidence: (r["confidence"] as HomelabDataConfidence) ?? "unknown",
    status: (r["status"] as HomelabDeviceStatus) ?? "unknown",
    notes: String(r["notes"] ?? ""),
    createdAt: String(r["created_at"]),
    updatedAt: String(r["updated_at"]),
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateVlanId(vlanId: number): HomelabValidationResult {
  if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094) {
    return { valid: false, reason: `VLAN ID must be an integer between 1 and 4094; got ${vlanId}` };
  }
  return { valid: true };
}

export function validateSubnetPrefix(prefix: string): HomelabValidationResult {
  if (typeof prefix !== "string" || !prefix.includes("/")) {
    return { valid: false, reason: `Invalid subnet prefix format: ${prefix}` };
  }
  const [addr, mask] = prefix.split("/");
  if (!addr || mask === undefined) {
    return { valid: false, reason: `Cannot parse prefix: ${prefix}` };
  }
  const octets = addr.split(".");
  if (octets.length !== 4) {
    return { valid: false, reason: `IPv4 address must have 4 octets: ${addr}` };
  }
  const allValid = octets.every((o) => {
    const n = Number.parseInt(o, 10);
    return String(n) === o && n >= 0 && n <= 255;
  });
  if (!allValid) {
    return { valid: false, reason: `Invalid IPv4 octet in: ${addr}` };
  }
  const prefixLen = Number.parseInt(mask, 10);
  if (!Number.isInteger(prefixLen) || prefixLen < 0 || prefixLen > 32) {
    return { valid: false, reason: `Prefix length must be 0–32; got ${mask}` };
  }
  return { valid: true };
}

// ── Site CRUD ─────────────────────────────────────────────────────────────────

export function listSites(): HomelabSite[] {
  ensureHomelabTables();
  const rows = sqlite.prepare("SELECT * FROM homelab_sites ORDER BY created_at ASC").all() as Record<string, unknown>[];
  return rows.map(rowToSite);
}

export function getSite(id: string): HomelabSite | null {
  ensureHomelabTables();
  const row = sqlite.prepare("SELECT * FROM homelab_sites WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToSite(row) : null;
}

export function upsertSite(input: Partial<HomelabSite> & { name: string }): HomelabSite {
  ensureHomelabTables();
  const now = new Date().toISOString();
  const id = input.id ?? randomUUID();
  sqlite.prepare(`
    INSERT INTO homelab_sites (id, name, description, location, confidence, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      location = excluded.location,
      confidence = excluded.confidence,
      updated_at = excluded.updated_at
  `).run(id, input.name, input.description ?? "", input.location ?? "", input.confidence ?? "unknown", now, now);

  thoughtLog.publish({
    category: "system",
    title: "HomeLab Site Upserted",
    message: `Site upserted: ${input.name}`,
    metadata: { siteId: id, siteName: input.name, confidence: input.confidence ?? "unknown" },
    // Never log private network location, IP ranges, or topology details
  });

  return getSite(id)!;
}

// ── Device CRUD ───────────────────────────────────────────────────────────────

export function listDevices(): HomelabDevice[] {
  ensureHomelabTables();
  const rows = sqlite.prepare("SELECT * FROM homelab_devices ORDER BY created_at ASC").all() as Record<string, unknown>[];
  return rows.map(rowToDevice);
}

export function getDevice(id: string): HomelabDevice | null {
  ensureHomelabTables();
  const row = sqlite.prepare("SELECT * FROM homelab_devices WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToDevice(row) : null;
}

export function upsertDevice(input: Partial<HomelabDevice> & { name: string }): HomelabDevice {
  ensureHomelabTables();
  const now = new Date().toISOString();
  const id = input.id ?? randomUUID();
  sqlite.prepare(`
    INSERT INTO homelab_devices
      (id, name, role, site_id, make, model, serial_number, management_ip_ref, status, confidence, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      role = excluded.role,
      site_id = excluded.site_id,
      make = excluded.make,
      model = excluded.model,
      serial_number = excluded.serial_number,
      management_ip_ref = excluded.management_ip_ref,
      status = excluded.status,
      confidence = excluded.confidence,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run(
    id, input.name, input.role ?? "unknown", input.siteId ?? "",
    input.make ?? "", input.model ?? "", input.serialNumber ?? "",
    input.managementIpRef ?? "", input.status ?? "unknown",
    input.confidence ?? "unknown", input.notes ?? "", now, now,
  );

  thoughtLog.publish({
    category: "system",
    title: "HomeLab Device Upserted",
    message: `Device upserted: ${input.name} (${input.role ?? "unknown"})`,
    metadata: {
      deviceId: id,
      deviceName: input.name,
      role: input.role ?? "unknown",
      confidence: input.confidence ?? "unknown",
      // Never log managementIpRef, serial numbers, credentials, or raw IPs
    },
  });

  return getDevice(id)!;
}

// ── VLAN CRUD ─────────────────────────────────────────────────────────────────

export function listVlans(): HomelabVlan[] {
  ensureHomelabTables();
  const rows = sqlite.prepare("SELECT * FROM homelab_vlans ORDER BY vlan_id ASC").all() as Record<string, unknown>[];
  return rows.map(rowToVlan);
}

export function getVlan(id: string): HomelabVlan | null {
  ensureHomelabTables();
  const row = sqlite.prepare("SELECT * FROM homelab_vlans WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToVlan(row) : null;
}

export function upsertVlan(input: Partial<HomelabVlan> & { name: string; vlanId: number }): HomelabVlan {
  ensureHomelabTables();
  const validation = validateVlanId(input.vlanId);
  if (!validation.valid) throw new Error(validation.reason);

  const now = new Date().toISOString();
  const id = input.id ?? randomUUID();
  sqlite.prepare(`
    INSERT INTO homelab_vlans (id, vlan_id, name, description, site_id, confidence, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      vlan_id = excluded.vlan_id,
      name = excluded.name,
      description = excluded.description,
      site_id = excluded.site_id,
      confidence = excluded.confidence,
      updated_at = excluded.updated_at
  `).run(id, input.vlanId, input.name, input.description ?? "", input.siteId ?? "", input.confidence ?? "unknown", now, now);

  thoughtLog.publish({
    category: "system",
    title: "HomeLab VLAN Upserted",
    message: `VLAN upserted: ${input.name} (ID ${input.vlanId})`,
    metadata: { vlanRecordId: id, vlanId: input.vlanId, vlanName: input.name, confidence: input.confidence ?? "unknown" },
  });

  return getVlan(id)!;
}

// ── Subnet CRUD ───────────────────────────────────────────────────────────────

export function listSubnets(): HomelabSubnet[] {
  ensureHomelabTables();
  const rows = sqlite.prepare("SELECT * FROM homelab_subnets ORDER BY created_at ASC").all() as Record<string, unknown>[];
  return rows.map(rowToSubnet);
}

export function getSubnet(id: string): HomelabSubnet | null {
  ensureHomelabTables();
  const row = sqlite.prepare("SELECT * FROM homelab_subnets WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToSubnet(row) : null;
}

export function upsertSubnet(input: Partial<HomelabSubnet> & { prefix: string }): HomelabSubnet {
  ensureHomelabTables();
  const validation = validateSubnetPrefix(input.prefix);
  if (!validation.valid) throw new Error(validation.reason);

  const now = new Date().toISOString();
  const id = input.id ?? randomUUID();
  sqlite.prepare(`
    INSERT INTO homelab_subnets (id, prefix, description, vlan_id, site_id, gateway_ref, confidence, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      prefix = excluded.prefix,
      description = excluded.description,
      vlan_id = excluded.vlan_id,
      site_id = excluded.site_id,
      gateway_ref = excluded.gateway_ref,
      confidence = excluded.confidence,
      updated_at = excluded.updated_at
  `).run(
    id, input.prefix, input.description ?? "",
    input.vlanId ?? "", input.siteId ?? "", input.gatewayRef ?? "",
    input.confidence ?? "unknown", now, now,
  );

  thoughtLog.publish({
    category: "system",
    title: "HomeLab Subnet Upserted",
    message: "Subnet record upserted",
    metadata: {
      subnetId: id,
      confidence: input.confidence ?? "unknown",
      // Never log raw prefix/gateway IPs — stored by ref label, not logged
    },
  });

  return getSubnet(id)!;
}

// ── Service CRUD ──────────────────────────────────────────────────────────────

export function listServices(): HomelabService[] {
  ensureHomelabTables();
  const rows = sqlite.prepare("SELECT * FROM homelab_services ORDER BY created_at ASC").all() as Record<string, unknown>[];
  return rows.map(rowToService);
}

export function getService(id: string): HomelabService | null {
  ensureHomelabTables();
  const row = sqlite.prepare("SELECT * FROM homelab_services WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToService(row) : null;
}

export function upsertService(input: Partial<HomelabService> & { name: string }): HomelabService {
  ensureHomelabTables();
  const now = new Date().toISOString();
  const id = input.id ?? randomUUID();
  sqlite.prepare(`
    INSERT INTO homelab_services
      (id, name, service_type, host_device_id, container_name, port, protocol, confidence, status, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      service_type = excluded.service_type,
      host_device_id = excluded.host_device_id,
      container_name = excluded.container_name,
      port = excluded.port,
      protocol = excluded.protocol,
      confidence = excluded.confidence,
      status = excluded.status,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run(
    id, input.name, input.serviceType ?? "", input.hostDeviceId ?? "",
    input.containerName ?? "", input.port ?? 0, input.protocol ?? "unknown",
    input.confidence ?? "unknown", input.status ?? "unknown", input.notes ?? "",
    now, now,
  );

  thoughtLog.publish({
    category: "system",
    title: "HomeLab Service Upserted",
    message: `Service upserted: ${input.name}`,
    metadata: {
      serviceId: id,
      serviceName: input.name,
      serviceType: input.serviceType ?? "",
      confidence: input.confidence ?? "unknown",
      // Never log host IPs, container internal IPs, or credentials
    },
  });

  return getService(id)!;
}

// ── Status & blueprint ────────────────────────────────────────────────────────

export function getHomelabStatus(): HomelabInventoryStatus {
  ensureHomelabTables();
  const sitesCount = (sqlite.prepare("SELECT COUNT(*) AS c FROM homelab_sites").get() as Record<string, unknown>)["c"] as number;
  const devicesCount = (sqlite.prepare("SELECT COUNT(*) AS c FROM homelab_devices").get() as Record<string, unknown>)["c"] as number;
  const vlansCount = (sqlite.prepare("SELECT COUNT(*) AS c FROM homelab_vlans").get() as Record<string, unknown>)["c"] as number;
  const subnetsCount = (sqlite.prepare("SELECT COUNT(*) AS c FROM homelab_subnets").get() as Record<string, unknown>)["c"] as number;
  const servicesCount = (sqlite.prepare("SELECT COUNT(*) AS c FROM homelab_services").get() as Record<string, unknown>)["c"] as number;

  return {
    sitesCount,
    devicesCount,
    vlansCount,
    subnetsCount,
    servicesCount,
    providers: getHomelabProviders(),
    sourceOfTruth: HOMELAB_ARCHITECT_SOURCE_OF_TRUTH,
  };
}

export function generateBlueprint(): HomelabBlueprint {
  ensureHomelabTables();
  const sites = listSites();
  const devices = listDevices();
  const vlans = listVlans();
  const subnets = listSubnets();
  const services = listServices();
  const providers = getHomelabProviders();

  const notes: string[] = [
    "Phase 15A: source-of-truth and planning layer only — no config applied.",
    "All optional providers (NetBox, Nautobot, Proxmox, OPNsense, UniFi) are not_configured.",
    "Data confidence: confirmed=verified, proposed=planned, unknown=unverified.",
    "No firewall, VLAN, DNS, DHCP, routing, or device changes in this phase.",
  ];

  if (devices.some((d) => d.confidence === "unknown")) {
    notes.push("WARNING: some devices have unknown confidence — verify before applying any config.");
  }
  if (vlans.some((v) => v.confidence === "unknown")) {
    notes.push("WARNING: some VLANs have unknown confidence — verify before applying VLAN config.");
  }
  if (subnets.some((s) => s.confidence === "unknown")) {
    notes.push("WARNING: some subnets have unknown confidence — verify before applying IP config.");
  }

  // Overall confidence: only "confirmed" if all non-empty collections are confirmed
  const allEntities = [...devices, ...vlans, ...subnets, ...services];
  const overallConfidence: HomelabDataConfidence =
    allEntities.length === 0 ? "unknown"
    : allEntities.every((e) => e.confidence === "confirmed") ? "confirmed"
    : "proposed";

  thoughtLog.publish({
    category: "system",
    title: "HomeLab Blueprint Generated",
    message: `Blueprint generated: ${sites.length} sites, ${devices.length} devices, ${vlans.length} VLANs, ${subnets.length} subnets, ${services.length} services`,
    metadata: {
      sitesCount: sites.length,
      devicesCount: devices.length,
      vlansCount: vlans.length,
      subnetsCount: subnets.length,
      servicesCount: services.length,
      overallConfidence,
      applied: false,
      // Never log IP prefixes, device tokens, credentials, or raw topology data
    },
  });

  return {
    id: randomUUID(),
    generatedAt: new Date().toISOString(),
    overallConfidence,
    sites,
    devices,
    vlans,
    subnets,
    services,
    providers,
    notes,
    applied: false,
  };
}

// ── Phase 15B config generation, validation, and apply pipeline ───────────────

function providerFor(id: HomelabConfigProviderId): HomelabProviderProfile {
  return getHomelabProviders().find((p) => p.providerId === id) ?? {
    providerId: id,
    name: id,
    status: "not_configured",
    reason: `${id} is not configured.`,
    recordCount: 0,
  };
}

function defaultProviderFor(type: HomelabConfigProposalType): HomelabConfigProviderId {
  switch (type) {
    case "proxmox_layout":
      return "proxmox";
    case "docker_compose_stack":
      return "docker-compose";
    case "ansible_playbook":
      return "ansible";
    case "opentofu_terraform":
      return "opentofu";
    case "opnsense_draft":
    case "vlan_ip_dns_dhcp_firewall":
      return "opnsense";
    case "unifi_draft":
      return "unifi";
    case "netbox_nautobot_draft":
      return "netbox";
    case "backup_monitoring_plan":
    default:
      return "ansible";
  }
}

function targetTypeFor(type: HomelabConfigProposalType): string {
  switch (type) {
    case "vlan_ip_dns_dhcp_firewall":
      return "vlan-ip-dns-dhcp-firewall-plan";
    case "proxmox_layout":
      return "proxmox-vm-lxc-service-layout";
    case "docker_compose_stack":
      return "docker-compose-service-stack";
    case "backup_monitoring_plan":
      return "backup-monitoring-plan";
    case "ansible_playbook":
      return "ansible-draft";
    case "opentofu_terraform":
      return "opentofu-terraform-draft";
    case "opnsense_draft":
      return "opnsense-provider-draft";
    case "unifi_draft":
      return "unifi-provider-draft";
    case "netbox_nautobot_draft":
      return "netbox-nautobot-provider-draft";
  }
}

function defaultSafetyPlan(kind: "backup" | "rollback"): HomelabConfigSafetyPlan {
  return {
    required: true,
    available: true,
    mode: "proposal_only",
    summary: `${kind === "backup" ? "Backup" : "Rollback"} plan metadata is present, but no provider action will run by default.`,
    steps: [
      "Confirm provider is intentionally configured.",
      "Capture current provider configuration outside default tests.",
      "Review diff and validation results before approval.",
      kind === "backup" ? "Store backup path/reference before apply." : "Use stored backup/reference to restore if verification fails.",
    ],
  };
}

function mergeSafetyPlan(kind: "backup" | "rollback", input?: Partial<HomelabConfigSafetyPlan>): HomelabConfigSafetyPlan {
  const base = defaultSafetyPlan(kind);
  return {
    ...base,
    ...input,
    steps: input?.steps ?? base.steps,
  };
}

function draftMetadataFor(type: HomelabConfigProposalType, blueprint: HomelabBlueprint): Record<string, unknown> {
  return {
    mode: "draft/proposal/dry_run",
    generatedBy: "homelab-architect-phase-15b",
    proposalType: type,
    sourceCounts: {
      sites: blueprint.sites.length,
      devices: blueprint.devices.length,
      vlans: blueprint.vlans.length,
      subnets: blueprint.subnets.length,
      services: blueprint.services.length,
    },
    configDraft: {
      format: targetTypeFor(type),
      containsSecrets: false,
      containsRawPrivateIpMap: false,
      externalProviderCalls: false,
    },
  };
}

function expectedChangesFor(type: HomelabConfigProposalType, blueprint: HomelabBlueprint): Array<Record<string, unknown>> {
  const counts = {
    sites: blueprint.sites.length,
    devices: blueprint.devices.length,
    vlans: blueprint.vlans.length,
    subnets: blueprint.subnets.length,
    services: blueprint.services.length,
  };
  switch (type) {
    case "vlan_ip_dns_dhcp_firewall":
      return [
        { domain: "vlan", action: "draft", count: counts.vlans },
        { domain: "ipam", action: "draft", count: counts.subnets },
        { domain: "dns-dhcp-firewall", action: "proposal_only", count: counts.services },
      ];
    case "proxmox_layout":
      return [{ domain: "proxmox", action: "draft-vm-lxc-service-layout", count: counts.services }];
    case "docker_compose_stack":
      return [{ domain: "docker-compose", action: "draft-service-stack", count: counts.services }];
    case "backup_monitoring_plan":
      return [{ domain: "backup-monitoring", action: "draft", count: counts.devices + counts.services }];
    case "ansible_playbook":
      return [{ domain: "ansible", action: "draft-playbook", count: counts.devices }];
    case "opentofu_terraform":
      return [{ domain: "opentofu-terraform", action: "draft-iac", count: counts.devices + counts.services }];
    case "opnsense_draft":
      return [{ domain: "opnsense", action: "draft-firewall-vlan-dhcp", count: counts.vlans + counts.subnets }];
    case "unifi_draft":
      return [{ domain: "unifi", action: "draft-switch-ap-network", count: counts.devices + counts.vlans }];
    case "netbox_nautobot_draft":
      return [{ domain: "network-source-of-truth", action: "draft-provider-records", count: counts.devices + counts.vlans + counts.subnets }];
  }
}

function diffSummaryFor(type: HomelabConfigProposalType): Record<string, unknown> {
  return {
    mode: "diff-first",
    targetType: targetTypeFor(type),
    sensitiveValuesRedacted: true,
    realProviderDiff: false,
    summary: "Draft-only expected-change summary. Real provider diff is unavailable until the provider is intentionally configured.",
  };
}

function saveProposal(input: HomelabConfigProposal): HomelabConfigProposal {
  ensureHomelabTables();
  sqlite.prepare(`
    INSERT INTO homelab_config_proposals
      (id, source_inventory_ref, source_blueprint_id, proposal_type, target_provider, target_type,
       draft_metadata_json, expected_changes_json, diff_summary_json, validation_status,
       validation_kind, validation_notes_json, approval_status, approval_id, backup_plan_json,
       rollback_plan_json, apply_status, not_configured_reason, provider_status, dry_run,
       executed, api_calls_made, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      draft_metadata_json = excluded.draft_metadata_json,
      expected_changes_json = excluded.expected_changes_json,
      diff_summary_json = excluded.diff_summary_json,
      validation_status = excluded.validation_status,
      validation_kind = excluded.validation_kind,
      validation_notes_json = excluded.validation_notes_json,
      approval_status = excluded.approval_status,
      approval_id = excluded.approval_id,
      backup_plan_json = excluded.backup_plan_json,
      rollback_plan_json = excluded.rollback_plan_json,
      apply_status = excluded.apply_status,
      not_configured_reason = excluded.not_configured_reason,
      provider_status = excluded.provider_status,
      dry_run = excluded.dry_run,
      executed = excluded.executed,
      api_calls_made = excluded.api_calls_made,
      updated_at = excluded.updated_at
  `).run(
    input.id,
    input.sourceInventoryRef,
    input.sourceBlueprintId,
    input.proposalType,
    input.targetProvider,
    input.targetType,
    JSON.stringify(input.draftMetadata),
    JSON.stringify(input.expectedChanges),
    JSON.stringify(input.diffSummary),
    input.validationStatus,
    input.validationKind,
    JSON.stringify(input.validationNotes),
    input.approvalStatus,
    input.approvalId ?? null,
    JSON.stringify(input.backupPlan),
    JSON.stringify(input.rollbackPlan),
    input.applyStatus,
    input.notConfiguredReason,
    input.providerStatus,
    input.dryRun ? 1 : 0,
    input.executed ? 1 : 0,
    input.apiCallsMade ? 1 : 0,
    input.createdAt,
    input.updatedAt,
  );
  return getHomelabConfigProposal(input.id)!;
}

export function listHomelabConfigProposals(limit = 100): HomelabConfigProposal[] {
  ensureHomelabTables();
  const rows = sqlite.prepare(`
    SELECT * FROM homelab_config_proposals
    ORDER BY created_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(limit, 500))) as Record<string, unknown>[];
  return rows.map(rowToConfigProposal);
}

export function getHomelabConfigProposal(id: string): HomelabConfigProposal | null {
  ensureHomelabTables();
  const row = sqlite.prepare("SELECT * FROM homelab_config_proposals WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToConfigProposal(row) : null;
}

export function createHomelabConfigProposal(input: {
  proposalType?: HomelabConfigProposalType;
  targetProvider?: HomelabConfigProviderId;
  sourceInventoryRef?: string;
  backupPlan?: Partial<HomelabConfigSafetyPlan>;
  rollbackPlan?: Partial<HomelabConfigSafetyPlan>;
} = {}): HomelabConfigProposal {
  ensureHomelabTables();
  const proposalType = input.proposalType ?? "vlan_ip_dns_dhcp_firewall";
  const targetProvider = input.targetProvider ?? defaultProviderFor(proposalType);
  const provider = providerFor(targetProvider);
  const blueprint = generateBlueprint();
  const timestamp = new Date().toISOString();
  const proposal: HomelabConfigProposal = {
    id: randomUUID(),
    sourceInventoryRef: input.sourceInventoryRef ?? "homelab-local-source-of-truth",
    sourceBlueprintId: blueprint.id,
    proposalType,
    targetProvider,
    targetType: targetTypeFor(proposalType),
    draftMetadata: draftMetadataFor(proposalType, blueprint),
    expectedChanges: expectedChangesFor(proposalType, blueprint),
    diffSummary: diffSummaryFor(proposalType),
    validationStatus: "not_run",
    validationKind: "static",
    validationNotes: ["Validation is required before any apply request can proceed."],
    approvalStatus: "not_required",
    backupPlan: mergeSafetyPlan("backup", input.backupPlan),
    rollbackPlan: mergeSafetyPlan("rollback", input.rollbackPlan),
    applyStatus: "drafted",
    notConfiguredReason: provider.status === "not_configured" ? provider.reason : "",
    providerStatus: provider.status,
    dryRun: true,
    executed: false,
    apiCallsMade: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const saved = saveProposal(proposal);
  recordAuditEvent({
    eventType: "homelab_config",
    action: "proposal_created",
    target: saved.id,
    result: "success",
    metadata: {
      proposalType,
      targetProvider,
      targetType: saved.targetType,
      providerStatus: saved.providerStatus,
      sourceBlueprintId: saved.sourceBlueprintId,
      dryRun: true,
      apiCallsMade: false,
    },
  });
  thoughtLog.publish({
    category: "system",
    title: "HomeLab Config Proposal Created",
    message: `Config proposal created: ${proposalType} for ${targetProvider}`,
    metadata: {
      proposalId: saved.id,
      proposalType,
      targetProvider,
      providerStatus: saved.providerStatus,
      dryRun: true,
      // Never log generated config contents, credentials, raw IP maps, or device tokens
    },
  });
  return saved;
}

export function validateHomelabConfigProposal(
  id: string,
  input: { kind?: HomelabConfigValidationKind } = {},
): HomelabConfigValidationOutcome {
  const proposal = getHomelabConfigProposal(id);
  if (!proposal) throw new Error(`HomeLab config proposal not found: ${id}`);
  const kind = input.kind ?? "static";
  const provider = providerFor(proposal.targetProvider);
  let status: HomelabConfigValidationStatus = "passed";
  let applyStatus: HomelabPipelineState = "validation_passed";
  const notes: string[] = [];
  const realProviderCheck = kind === "real_provider";

  if (kind === "unavailable_provider" || kind === "real_provider" || proposal.targetProvider === "batfish") {
    status = provider.status === "read_only" ? "degraded" : "not_configured";
    applyStatus = "not_configured";
    notes.push(`${provider.name} validation is ${provider.status}: ${provider.reason}`);
  } else if (!proposal.expectedChanges.length) {
    status = "failed";
    applyStatus = "validation_failed";
    notes.push("Static validation failed because the draft contains no expected-change metadata.");
  } else if (!proposal.draftMetadata.configDraft) {
    status = "failed";
    applyStatus = "validation_failed";
    notes.push("Static validation failed because draft metadata is incomplete.");
  } else {
    notes.push(kind === "simulated" ? "Simulated validation passed using local source-of-truth metadata only." : "Static validation passed using local source-of-truth metadata only.");
    notes.push("No real provider, network, DNS, DHCP, firewall, Proxmox, Docker, Ansible, OpenTofu, or Batfish calls were made.");
  }

  const updated = saveProposal({
    ...proposal,
    validationStatus: status,
    validationKind: kind,
    validationNotes: notes,
    applyStatus,
    apiCallsMade: false,
    executed: false,
    updatedAt: new Date().toISOString(),
  });

  recordAuditEvent({
    eventType: "homelab_config",
    action: "proposal_validated",
    target: updated.id,
    result: status === "passed" ? "success" : "blocked",
    metadata: {
      proposalType: updated.proposalType,
      targetProvider: updated.targetProvider,
      validationKind: kind,
      validationStatus: status,
      realProviderCheck,
      apiCallsMade: false,
    },
  });

  return { proposal: updated, status, kind, notes, realProviderCheck };
}

export function requestHomelabConfigApply(
  id: string,
  input: { approvalId?: string } = {},
): HomelabConfigApplyOutcome {
  const proposal = getHomelabConfigProposal(id);
  if (!proposal) throw new Error(`HomeLab config proposal not found: ${id}`);
  const provider = providerFor(proposal.targetProvider);
  const blocked = (reason: string, status: HomelabPipelineState = "apply_blocked", approvalStatus = proposal.approvalStatus): HomelabConfigApplyOutcome => {
    const updated = saveProposal({
      ...proposal,
      applyStatus: status,
      approvalStatus,
      notConfiguredReason: status === "not_configured" ? provider.reason : proposal.notConfiguredReason,
      executed: false,
      apiCallsMade: false,
      updatedAt: new Date().toISOString(),
    });
    recordAuditEvent({
      eventType: "homelab_config",
      action: "apply_blocked",
      target: updated.id,
      result: "blocked",
      metadata: {
        proposalType: updated.proposalType,
        targetProvider: updated.targetProvider,
        status,
        reason,
        executed: false,
        apiCallsMade: false,
      },
    });
    return { proposal: updated, allowed: false, status, reason, approvalId: updated.approvalId, executed: false, apiCallsMade: false };
  };

  if (proposal.validationStatus !== "passed") {
    return blocked("Validation must pass before apply can be requested.");
  }
  if (proposal.backupPlan.required && !proposal.backupPlan.available) {
    return blocked("A backup plan is required before mutable HomeLab config can be applied.");
  }
  if (proposal.rollbackPlan.required && !proposal.rollbackPlan.available) {
    return blocked("A rollback plan is required before mutable HomeLab config can be applied.");
  }

  const approvalId = input.approvalId ?? proposal.approvalId;
  if (approvalId) {
    const approval = getApprovalRequest(approvalId);
    if (!approval) return blocked("Approval request not found.");
    if (approval.status === "denied") return blocked("Denied apply approval did not execute.", "apply_blocked", "denied");
    if (approval.status !== "approved") return blocked(`Apply approval is ${approval.status}.`, "approval_required", "waiting_for_approval");

    if (provider.status !== "read_only") {
      const updated = saveProposal({
        ...proposal,
        approvalId,
        approvalStatus: "approved",
        applyStatus: "not_configured",
        notConfiguredReason: provider.reason,
        executed: false,
        apiCallsMade: false,
        updatedAt: new Date().toISOString(),
      });
      recordAuditEvent({
        eventType: "homelab_config",
        action: "approved_apply_not_configured",
        target: updated.id,
        result: "blocked",
        metadata: {
          targetProvider: updated.targetProvider,
          providerStatus: provider.status,
          approvalId,
          executed: false,
          apiCallsMade: false,
        },
      });
      return {
        proposal: updated,
        allowed: false,
        status: "not_configured",
        reason: provider.reason,
        approvalId,
        executed: false,
        apiCallsMade: false,
      };
    }
  } else {
    const approval = createApprovalRequest({
      type: "homelab_config_apply",
      title: "HomeLab Config Apply Approval",
      summary: `Approve proposal-only apply gate for ${proposal.proposalType} targeting ${proposal.targetProvider}.`,
      riskTier: "tier4_external_communication",
      physicalTier: "p4_approval_required",
      requestedAction: "homelab.config.apply",
      payload: {
        proposalId: proposal.id,
        proposalType: proposal.proposalType,
        targetProvider: proposal.targetProvider,
        targetType: proposal.targetType,
        validationStatus: proposal.validationStatus,
        backupPlanAvailable: proposal.backupPlan.available,
        rollbackPlanAvailable: proposal.rollbackPlan.available,
        dryRun: true,
      },
    });
    const updated = saveProposal({
      ...proposal,
      approvalId: approval.id,
      approvalStatus: "waiting_for_approval",
      applyStatus: "approval_required",
      executed: false,
      apiCallsMade: false,
      updatedAt: new Date().toISOString(),
    });
    recordAuditEvent({
      eventType: "homelab_config",
      action: "apply_approval_requested",
      target: updated.id,
      result: "blocked",
      metadata: {
        approvalId: approval.id,
        targetProvider: updated.targetProvider,
        dryRun: true,
        executed: false,
        apiCallsMade: false,
      },
    });
    return {
      proposal: updated,
      allowed: false,
      status: "approval_required",
      reason: "Explicit approval is required before any HomeLab apply path can continue.",
      approvalId: approval.id,
      executed: false,
      apiCallsMade: false,
    };
  }

  return blocked("Real apply remains disabled until a configured provider, policy allowance, approval, validation, and rollback path all exist.", "not_configured");
}

export function requestHomelabConfigRollback(id: string): HomelabConfigApplyOutcome {
  const proposal = getHomelabConfigProposal(id);
  if (!proposal) throw new Error(`HomeLab config proposal not found: ${id}`);
  const status: HomelabPipelineState = proposal.executed ? "rollback_required" : "apply_blocked";
  const reason = proposal.executed
    ? "Rollback requires explicit approval and provider configuration before execution."
    : "No config was applied, so rollback is metadata-only and no action executed.";
  const updated = saveProposal({
    ...proposal,
    applyStatus: status,
    executed: false,
    apiCallsMade: false,
    updatedAt: new Date().toISOString(),
  });
  recordAuditEvent({
    eventType: "homelab_config",
    action: "rollback_requested",
    target: updated.id,
    result: "blocked",
    metadata: { status, executed: false, apiCallsMade: false },
  });
  return { proposal: updated, allowed: false, status, reason, approvalId: updated.approvalId, executed: false, apiCallsMade: false };
}

// ── Phase 16 Home SOC and security monitoring copilot ────────────────────────

function socProviderFor(id: HomelabSocProviderId): HomelabSocProviderProfile {
  return getHomelabSocProviders().find((p) => p.providerId === id) ?? {
    providerId: id,
    name: id,
    status: "not_configured",
    reason: `${id} is not configured.`,
    recordCount: 0,
    category: "monitoring",
    startupPolicy: "disabled",
    dataLeavesMachine: false,
  };
}

function defaultSocSummary(input: Partial<HomelabSocAlertSummary> = {}): HomelabSocAlertSummary {
  return {
    confirmedFacts: input.confirmedFacts?.length ? input.confirmedFacts : ["Local HomeLab metadata record exists."],
    inferredPossibilities: input.inferredPossibilities ?? [],
    unknowns: input.unknowns?.length ? input.unknowns : ["Live provider telemetry is unavailable until a provider is intentionally configured."],
    proposedNextActions: input.proposedNextActions?.length ? input.proposedNextActions : ["Review local inventory, provider status, and approval requirements before remediation."],
  };
}

function saveSocAlert(alert: HomelabSocAlert): HomelabSocAlert {
  ensureHomelabTables();
  sqlite.prepare(`
    INSERT INTO homelab_soc_alerts
      (id, title, severity, category, source_provider, device_ref, summary_json,
       status, evidence_refs_json, provider_status, not_configured_reason,
       api_calls_made, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      severity = excluded.severity,
      category = excluded.category,
      source_provider = excluded.source_provider,
      device_ref = excluded.device_ref,
      summary_json = excluded.summary_json,
      status = excluded.status,
      evidence_refs_json = excluded.evidence_refs_json,
      provider_status = excluded.provider_status,
      not_configured_reason = excluded.not_configured_reason,
      api_calls_made = 0,
      updated_at = excluded.updated_at
  `).run(
    alert.id,
    alert.title,
    alert.severity,
    alert.category,
    alert.sourceProvider,
    alert.deviceRef,
    JSON.stringify(alert.summary),
    alert.status,
    JSON.stringify(alert.evidenceRefs),
    alert.providerStatus,
    alert.notConfiguredReason,
    alert.createdAt,
    alert.updatedAt,
  );
  return getHomelabSocAlert(alert.id)!;
}

function saveSocRemediation(input: HomelabSocRemediationProposal): HomelabSocRemediationProposal {
  ensureHomelabTables();
  sqlite.prepare(`
    INSERT INTO homelab_soc_remediation_proposals
      (id, alert_id, action, mode, status, reason, approval_id,
       linked_config_proposal_id, dry_run, executed, api_calls_made,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      mode = excluded.mode,
      status = excluded.status,
      reason = excluded.reason,
      approval_id = excluded.approval_id,
      linked_config_proposal_id = excluded.linked_config_proposal_id,
      dry_run = 1,
      executed = 0,
      api_calls_made = 0,
      updated_at = excluded.updated_at
  `).run(
    input.id,
    input.alertId,
    input.action,
    input.mode,
    input.status,
    input.reason,
    input.approvalId ?? null,
    input.linkedConfigProposalId ?? null,
    input.createdAt,
    input.updatedAt,
  );
  return getHomelabSocRemediation(input.id)!;
}

export function getHomelabSocStatus(): HomelabSocStatus {
  ensureHomelabTables();
  const alertsCount = (sqlite.prepare("SELECT COUNT(*) AS count FROM homelab_soc_alerts").get() as { count: number }).count;
  const openAlertsCount = (sqlite.prepare("SELECT COUNT(*) AS count FROM homelab_soc_alerts WHERE status = 'open'").get() as { count: number }).count;
  return {
    alertsCount,
    openAlertsCount,
    providers: getHomelabSocProviders(),
    sourceOfTruth: HOMELAB_ARCHITECT_SOURCE_OF_TRUTH,
    localFirst: true,
    cloudRequired: false,
    realSecurityApiCallsEnabled: false,
  };
}

export function listHomelabSocAlerts(limit = 100): HomelabSocAlert[] {
  ensureHomelabTables();
  const rows = sqlite.prepare(`
    SELECT * FROM homelab_soc_alerts
    ORDER BY created_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(limit, 500))) as Record<string, unknown>[];
  return rows.map(rowToSocAlert);
}

export function getHomelabSocAlert(id: string): HomelabSocAlert | null {
  ensureHomelabTables();
  const row = sqlite.prepare("SELECT * FROM homelab_soc_alerts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToSocAlert(row) : null;
}

export function createHomelabSocAlert(input: {
  title: string;
  severity?: HomelabSocSeverity;
  category?: string;
  sourceProvider?: HomelabSocProviderId;
  deviceRef?: string;
  summary?: Partial<HomelabSocAlertSummary>;
  evidenceRefs?: string[];
}): HomelabSocAlert {
  ensureHomelabTables();
  const title = input.title.trim();
  if (!title) throw new Error("title is required");
  const provider = socProviderFor(input.sourceProvider ?? "wazuh");
  const timestamp = new Date().toISOString();
  const alert: HomelabSocAlert = {
    id: randomUUID(),
    title,
    severity: input.severity ?? "info",
    category: input.category?.trim() || "general",
    sourceProvider: provider.providerId,
    deviceRef: input.deviceRef ?? "",
    summary: defaultSocSummary(input.summary),
    status: provider.status === "not_configured" ? "not_configured" : "open",
    evidenceRefs: input.evidenceRefs ?? [],
    providerStatus: provider.status,
    notConfiguredReason: provider.status === "not_configured" ? provider.reason : "",
    localOnly: true,
    apiCallsMade: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const saved = saveSocAlert(alert);
  recordAuditEvent({
    eventType: "homelab_soc",
    action: "alert_created",
    target: saved.id,
    result: "success",
    metadata: {
      severity: saved.severity,
      category: saved.category,
      sourceProvider: saved.sourceProvider,
      providerStatus: saved.providerStatus,
      evidenceRefCount: saved.evidenceRefs.length,
      localOnly: true,
      apiCallsMade: false,
    },
  });
  thoughtLog.publish({
    category: "system",
    title: "Home SOC Alert Recorded",
    message: `Home SOC alert recorded: ${saved.title}`,
    metadata: {
      alertId: saved.id,
      severity: saved.severity,
      category: saved.category,
      sourceProvider: saved.sourceProvider,
      providerStatus: saved.providerStatus,
      // Never log packet contents, DNS queries, private IP maps, credentials, or raw security logs.
    },
  });
  return saved;
}

export function generateHomelabSocReport(kind: HomelabSocReportKind): HomelabSocReport {
  ensureHomelabTables();
  const blueprint = generateBlueprint();
  const alerts = listHomelabSocAlerts(500);
  const unknownDevices = blueprint.devices.filter((device) => device.confidence === "unknown").length;
  const provider = socProviderFor(kind === "suspicious_dns_summary" ? "pihole" : kind === "wan_outage_timeline" ? "uptime-kuma" : "wazuh");
  const now = new Date().toISOString();
  const summaryByKind: Record<HomelabSocReportKind, Partial<HomelabSocAlertSummary>> = {
    unknown_device_report: {
      confirmedFacts: [`Local inventory contains ${blueprint.devices.length} device record(s).`, `${unknownDevices} device record(s) have unknown confidence.`],
      inferredPossibilities: unknownDevices > 0 ? ["Unknown-confidence devices may need source-of-truth verification."] : [],
      unknowns: ["Live DHCP/ARP/controller data is unavailable until a provider is configured."],
      proposedNextActions: ["Review unknown devices in HomeLab inventory before changing firewall or VLAN policy."],
    },
    suspicious_dns_summary: {
      confirmedFacts: [`${alerts.filter((alert) => alert.category === "dns").length} local DNS/security alert metadata record(s) exist.`],
      inferredPossibilities: ["DNS provider data may reveal blocked domains after Pi-hole or AdGuard Home is configured."],
      unknowns: ["DNS queries and blocked domain lists are unavailable by default and were not fetched."],
      proposedNextActions: ["Configure a local DNS provider intentionally, then review summaries before proposing DNS filter changes."],
    },
    wan_outage_timeline: {
      confirmedFacts: [`${blueprint.services.length} service record(s) are represented in the local blueprint.`],
      inferredPossibilities: ["WAN outage timelines may correlate with Uptime Kuma or firewall events once configured."],
      unknowns: ["No live WAN probe, packet capture, or monitoring API call was made."],
      proposedNextActions: ["Use read-only availability providers before proposing router/firewall changes."],
    },
    noisy_iot_device_summary: {
      confirmedFacts: [`${blueprint.devices.filter((device) => device.role === "unknown" || device.role === "iot_hub").length} possible IoT/unknown device record(s) exist.`],
      inferredPossibilities: ["Noisy device conclusions require local DNS/IDS telemetry before confirmation."],
      unknowns: ["Traffic volume, DNS query contents, and packet contents are unavailable by default."],
      proposedNextActions: ["Keep remediation proposal-only until local telemetry and approval exist."],
    },
    what_changed_report: {
      confirmedFacts: [`Local blueprint generated at ${blueprint.generatedAt}.`, `${alerts.length} Home SOC alert metadata record(s) exist.`],
      inferredPossibilities: ["Inventory, provider, and alert count changes can be compared once periodic snapshots exist."],
      unknowns: ["External SIEM, firewall, DNS, and monitoring timelines are not configured."],
      proposedNextActions: ["Compare local HomeLab blueprint revisions before proposing infrastructure changes."],
    },
  };
  const summary = defaultSocSummary(summaryByKind[kind]);
  const report: HomelabSocReport = {
    id: randomUUID(),
    kind,
    generatedAt: now,
    sourceInventoryRef: "homelab-local-source-of-truth",
    modelProvider: "local",
    localFirst: true,
    cloudRequired: false,
    apiCallsMade: false,
    summary,
    counts: {
      sites: blueprint.sites.length,
      devices: blueprint.devices.length,
      vlans: blueprint.vlans.length,
      subnets: blueprint.subnets.length,
      services: blueprint.services.length,
      alerts: alerts.length,
      unknownDevices,
    },
    providerStatus: provider.status,
    notConfiguredReason: provider.reason,
  };
  recordAuditEvent({
    eventType: "homelab_soc",
    action: "report_generated",
    target: report.id,
    result: "success",
    metadata: {
      kind,
      sourceInventoryRef: report.sourceInventoryRef,
      modelProvider: "local",
      localFirst: true,
      apiCallsMade: false,
      providerStatus: provider.status,
    },
  });
  return report;
}

function actionModeFor(action: HomelabSocRemediationAction): HomelabSocActionMode {
  switch (action) {
    case "read_only_review":
      return "read_only";
    case "collect_logs":
      return "proposal";
    case "packet_capture":
      return "blocked";
    case "block_device":
    case "firewall_rule_change":
    case "isolate_vlan":
    case "dns_filter_change":
    case "kill_process":
    case "delete_file":
    case "disable_account":
      return "approval_required";
  }
}

function remediationPayload(alert: HomelabSocAlert, action: HomelabSocRemediationAction): Record<string, unknown> {
  return {
    alertId: alert.id,
    action,
    sourceProvider: alert.sourceProvider,
    severity: alert.severity,
    category: alert.category,
    dryRun: true,
    localOnly: true,
    apiCallsMade: false,
  };
}

function configProposalTypeForSocAction(action: HomelabSocRemediationAction): HomelabConfigProposalType | null {
  if (action === "firewall_rule_change" || action === "isolate_vlan" || action === "block_device") return "vlan_ip_dns_dhcp_firewall";
  if (action === "dns_filter_change") return "opnsense_draft";
  return null;
}

export function getHomelabSocRemediation(id: string): HomelabSocRemediationProposal | null {
  ensureHomelabTables();
  const row = sqlite.prepare("SELECT * FROM homelab_soc_remediation_proposals WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToSocRemediation(row) : null;
}

export function listHomelabSocRemediations(limit = 100): HomelabSocRemediationProposal[] {
  ensureHomelabTables();
  const rows = sqlite.prepare(`
    SELECT * FROM homelab_soc_remediation_proposals
    ORDER BY created_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(limit, 500))) as Record<string, unknown>[];
  return rows.map(rowToSocRemediation);
}

export function proposeHomelabSocRemediation(
  alertId: string,
  action: HomelabSocRemediationAction,
  input: { approvalId?: string } = {},
): { proposal: HomelabSocRemediationProposal; approvalRequired: boolean; approval?: ApprovalRequest; executed: false; apiCallsMade: false } {
  ensureHomelabTables();
  const alert = getHomelabSocAlert(alertId);
  if (!alert) throw new Error(`Home SOC alert not found: ${alertId}`);
  const mode = actionModeFor(action);
  const timestamp = new Date().toISOString();

  if (mode === "blocked") {
    const proposal = saveSocRemediation({
      id: randomUUID(),
      alertId,
      action,
      mode,
      status: "blocked",
      reason: "Packet capture/sniffing is blocked by default. Configure a later approved read-only provider workflow instead.",
      dryRun: true,
      executed: false,
      apiCallsMade: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    recordAuditEvent({
      eventType: "homelab_soc",
      action: "remediation_blocked",
      target: proposal.id,
      result: "blocked",
      metadata: { alertId, action, mode, executed: false, apiCallsMade: false },
    });
    return { proposal, approvalRequired: false, executed: false, apiCallsMade: false };
  }

  if (mode === "read_only" || mode === "proposal") {
    const proposal = saveSocRemediation({
      id: randomUUID(),
      alertId,
      action,
      mode,
      status: mode === "read_only" ? "read_only" : "proposal",
      reason: mode === "read_only" ? "Read-only review only; no remediation executed." : "Proposal metadata only; no provider action executed.",
      dryRun: true,
      executed: false,
      apiCallsMade: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    recordAuditEvent({
      eventType: "homelab_soc",
      action: "remediation_proposed",
      target: proposal.id,
      result: "success",
      metadata: { alertId, action, mode, executed: false, apiCallsMade: false },
    });
    return { proposal, approvalRequired: false, executed: false, apiCallsMade: false };
  }

  let approval: ApprovalRequest | undefined;
  let approvalId = input.approvalId;
  if (approvalId) {
    const existing = getApprovalRequest(approvalId);
    if (!existing) {
      const proposal = saveSocRemediation({
        id: randomUUID(),
        alertId,
        action,
        mode,
        status: "blocked",
        reason: "Approval request not found. Remediation did not execute.",
        approvalId,
        dryRun: true,
        executed: false,
        apiCallsMade: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return { proposal, approvalRequired: true, executed: false, apiCallsMade: false };
    }
    approval = existing;
    if (existing.status === "denied") {
      const proposal = saveSocRemediation({
        id: randomUUID(),
        alertId,
        action,
        mode,
        status: "denied",
        reason: "Denied remediation approval did not execute.",
        approvalId,
        dryRun: true,
        executed: false,
        apiCallsMade: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      recordAuditEvent({
        eventType: "homelab_soc",
        action: "remediation_denied",
        target: proposal.id,
        result: "blocked",
        metadata: { alertId, action, approvalId, executed: false, apiCallsMade: false },
      });
      return { proposal, approvalRequired: true, approval, executed: false, apiCallsMade: false };
    }
    if (existing.status !== "approved") {
      const proposal = saveSocRemediation({
        id: randomUUID(),
        alertId,
        action,
        mode,
        status: "approval_required",
        reason: `Approval status is ${existing.status}. Remediation did not execute.`,
        approvalId,
        dryRun: true,
        executed: false,
        apiCallsMade: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return { proposal, approvalRequired: true, approval, executed: false, apiCallsMade: false };
    }
  } else {
    approval = createApprovalRequest({
      type: "homelab_soc_remediation",
      title: "Home SOC Remediation Approval",
      summary: `Approve proposal-only remediation gate for ${action}. No security provider execution is enabled by default.`,
      riskTier: "tier4_external_communication",
      physicalTier: "p4_approval_required",
      requestedAction: "homelab.soc.remediation",
      payload: remediationPayload(alert, action),
    });
    approvalId = approval.id;
    const proposal = saveSocRemediation({
      id: randomUUID(),
      alertId,
      action,
      mode,
      status: "approval_required",
      reason: "Explicit approval is required before this remediation path can continue.",
      approvalId,
      dryRun: true,
      executed: false,
      apiCallsMade: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    recordAuditEvent({
      eventType: "homelab_soc",
      action: "remediation_approval_requested",
      target: proposal.id,
      result: "blocked",
      metadata: { alertId, action, approvalId, executed: false, apiCallsMade: false },
    });
    return { proposal, approvalRequired: true, approval, executed: false, apiCallsMade: false };
  }

  const configType = configProposalTypeForSocAction(action);
  const linkedConfigProposal = configType
    ? createHomelabConfigProposal({
      proposalType: configType,
      sourceInventoryRef: `homelab-soc-alert:${alert.id}`,
    })
    : undefined;
  const proposal = saveSocRemediation({
    id: randomUUID(),
    alertId,
    action,
    mode,
    status: "not_configured",
    reason: "Approval exists, but the real security/network provider executor is not configured. No firewall, DNS, DHCP, VLAN, endpoint, or SIEM change executed.",
    approvalId,
    linkedConfigProposalId: linkedConfigProposal?.id,
    dryRun: true,
    executed: false,
    apiCallsMade: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  recordAuditEvent({
    eventType: "homelab_soc",
    action: "approved_remediation_not_configured",
    target: proposal.id,
    result: "blocked",
    metadata: {
      alertId,
      action,
      approvalId,
      linkedConfigProposalId: linkedConfigProposal?.id,
      executed: false,
      apiCallsMade: false,
    },
  });
  return { proposal, approvalRequired: true, approval, executed: false, apiCallsMade: false };
}
