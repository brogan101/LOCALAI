import { sqlite } from "../db/database.js";
import {
  recordAuditEvent,
  seedFoundationDefaults,
  upsertPluginState,
} from "./platform-foundation.js";
import { redactForMissionReplay } from "./mission-replay.js";
import type { RuntimeMode } from "./runtime-mode.js";
import type {
  ToolPermissionScope,
  ToolRecord,
  ToolRiskLevel,
  ToolStatus,
} from "./tool-registry.js";

export type ClawGatewayType = "openclaw" | "nemoclaw" | "openshell" | "messaging_bridge" | "skill_adapter";
export type ClawSkillLifecycleState =
  | "discovered"
  | "proposed"
  | "quarantined"
  | "reviewed"
  | "approved"
  | "rejected"
  | "disabled"
  | "blocked"
  | "not_configured";
export type ClawGatewayLifecycleState =
  | "not_configured"
  | "proposed"
  | "configured"
  | "enabled"
  | "degraded"
  | "blocked"
  | "disabled";
export type ClawGatewayActionState =
  | "proposed"
  | "approval_required"
  | "approved"
  | "denied"
  | "executed"
  | "failed"
  | "blocked"
  | "dry_run"
  | "not_configured";
export type ClawSkillSourceKind = "allowlisted" | "community" | "custom_local" | "unknown";
export type ClawSourceTrustStatus = "allowlisted" | "explicitly_approved" | "unverified" | "blocked";

export interface ClawSourceTrustMetadata {
  sourceUrl?: string;
  versionRef?: string;
  checksumOrDigest?: string;
  signatureStatus: "present" | "missing" | "unknown";
  provenanceStatus: "present" | "missing" | "unknown";
  reviewStatus: "not_reviewed" | "reviewed" | "approved" | "rejected";
  sourceKind: ClawSkillSourceKind;
  trustStatus: ClawSourceTrustStatus;
  explicitlyApprovedSource: boolean;
}

export interface ClawSkillRecord {
  id: string;
  displayName: string;
  gatewayType: ClawGatewayType;
  lifecycleState: ClawSkillLifecycleState;
  sourceRef: string;
  supportedChannels: string[];
  declaredPermissions: ToolPermissionScope[];
  networkAccessRequired: boolean;
  filesystemAccessRequired: "none" | "read" | "write" | "scoped";
  commandExecutionRequired: boolean;
  messagingRequired: boolean;
  browserDesktopRequired: boolean;
  secretsRequired: boolean;
  physicalActionPotential: boolean;
  updateInstallBehavior: "none" | "proposal_only" | "blocked";
  dockerMcpCompatible: boolean;
  preferredIsolation: "dry_run" | "docker_mcp_gateway" | "future_sandbox";
  riskLevel: ToolRiskLevel;
  sourceTrust: ClawSourceTrustMetadata;
  notConfiguredReason?: string;
  degradedReason?: string;
}

export interface ClawGatewayProfile {
  id: string;
  name: string;
  enabled: boolean;
  approved: boolean;
  gatewayStates: Record<ClawGatewayType, ClawGatewayLifecycleState>;
  allowedGateways: ClawGatewayType[];
  allowedSkills: string[];
  blockedSkills: string[];
  quarantinedSkills: string[];
  rejectedSkills: string[];
  approvedSkillSources: string[];
  allowedChannels: string[];
  modeCompatibility: RuntimeMode[];
  blockSecrets: boolean;
  requireApprovalForExternalMessages: boolean;
  allowDockerMcpIsolation: boolean;
  updatedAt: string;
}

export interface ClawGatewayStatus {
  status: "not_configured" | "degraded" | "available";
  openclawConfigured: boolean;
  nemoclawConfigured: boolean;
  openshellConfigured: boolean;
  gatewayReachable: false;
  skillRegistryStatus: "not_configured" | "quarantined" | "review_required" | "ready";
  unavailableReason?: string;
  degradedReason?: string;
  checkedAt: string;
  dryRun: true;
  profile: ClawGatewayProfile;
  skills: ClawSkillRecord[];
}

export interface ClawGatewayProposal {
  status: "proposed";
  dryRun: true;
  actionState: ClawGatewayActionState;
  gatewayType: ClawGatewayType;
  sourceRef: string;
  sourceTrust: ClawSourceTrustMetadata;
  requiredApprovals: string[];
  permissions: ToolPermissionScope[];
  rollbackPlan: string;
  testPlan: string[];
  notes: string[];
}

export interface ClawGatewayToolMetadata {
  gatewayType: ClawGatewayType;
  gatewayState: ClawGatewayLifecycleState;
  skillLifecycleState: ClawSkillLifecycleState;
  supportedChannels: string[];
  sourceTrust: ClawSourceTrustMetadata;
  networkAccessRequired: boolean;
  filesystemAccessRequired: "none" | "read" | "write" | "scoped";
  commandExecutionRequired: boolean;
  messagingRequired: boolean;
  browserDesktopRequired: boolean;
  secretsRequired: boolean;
  physicalActionPotential: boolean;
  dockerMcpCompatible: boolean;
  preferredIsolation: "dry_run" | "docker_mcp_gateway" | "future_sandbox";
  profileAllowlisted: boolean;
  blockSecrets: boolean;
  requireApprovalForExternalMessages: boolean;
  updateInstallBehavior: "none" | "proposal_only" | "blocked";
}

export const CLAW_GATEWAY_PROFILE_STATE_ID = "claw-gateway:profile";
export const CLAW_GATEWAY_SOURCE_OF_TRUTH =
  "Phase 07C OpenClaw/NemoClaw gateway profile stored in plugin_state plus Claw gateway metadata attached to the Phase 07A tool-registry.ts firewall and Phase 07B isolation concepts.";

const ALL_NON_EMERGENCY_MODES: RuntimeMode[] = [
  "Lightweight",
  "Coding",
  "Vision",
  "Media",
  "Business",
  "Maker",
  "HomeLab",
  "HomeShop",
];

const DEFAULT_SOURCE_TRUST: ClawSourceTrustMetadata = {
  sourceUrl: undefined,
  versionRef: undefined,
  checksumOrDigest: undefined,
  signatureStatus: "unknown",
  provenanceStatus: "unknown",
  reviewStatus: "not_reviewed",
  sourceKind: "unknown",
  trustStatus: "blocked",
  explicitlyApprovedSource: false,
};

const DEFAULT_GATEWAY_STATES: Record<ClawGatewayType, ClawGatewayLifecycleState> = {
  openclaw: "not_configured",
  nemoclaw: "not_configured",
  openshell: "not_configured",
  messaging_bridge: "not_configured",
  skill_adapter: "not_configured",
};

const DEFAULT_SKILLS: ClawSkillRecord[] = [
  {
    id: "openclaw.gateway",
    displayName: "OpenClaw Gateway",
    gatewayType: "openclaw",
    lifecycleState: "not_configured",
    sourceRef: "watchlist://OpenClaw",
    supportedChannels: ["chat", "mobile", "remote_command", "workflow_trigger"],
    declaredPermissions: ["external_messages", "network"],
    networkAccessRequired: true,
    filesystemAccessRequired: "none",
    commandExecutionRequired: false,
    messagingRequired: true,
    browserDesktopRequired: false,
    secretsRequired: false,
    physicalActionPotential: false,
    updateInstallBehavior: "proposal_only",
    dockerMcpCompatible: true,
    preferredIsolation: "dry_run",
    riskLevel: "critical",
    sourceTrust: {
      ...DEFAULT_SOURCE_TRUST,
      sourceUrl: "verify current repo before install",
      sourceKind: "unknown",
      trustStatus: "blocked",
    },
    notConfiguredReason: "OpenClaw is a future gateway and must be verified, allowlisted, configured, and approved before use.",
  },
  {
    id: "nemoclaw.gateway",
    displayName: "NemoClaw/OpenShell Gateway",
    gatewayType: "nemoclaw",
    lifecycleState: "not_configured",
    sourceRef: "watchlist://NemoClaw",
    supportedChannels: ["openshell", "chat_bridge", "workflow_trigger"],
    declaredPermissions: ["external_messages", "network"],
    networkAccessRequired: true,
    filesystemAccessRequired: "none",
    commandExecutionRequired: false,
    messagingRequired: true,
    browserDesktopRequired: false,
    secretsRequired: false,
    physicalActionPotential: false,
    updateInstallBehavior: "proposal_only",
    dockerMcpCompatible: true,
    preferredIsolation: "dry_run",
    riskLevel: "critical",
    sourceTrust: {
      ...DEFAULT_SOURCE_TRUST,
      sourceUrl: "verify current repo before install",
      sourceKind: "unknown",
      trustStatus: "blocked",
    },
    notConfiguredReason: "NemoClaw/OpenShell is a future gateway and must be verified, allowlisted, configured, and approved before use.",
  },
  {
    id: "openclaw.skill-adapter",
    displayName: "OpenClaw Skill Adapter",
    gatewayType: "skill_adapter",
    lifecycleState: "quarantined",
    sourceRef: "claw://skills/quarantine",
    supportedChannels: ["skill_ecosystem", "tool_gateway"],
    declaredPermissions: ["install", "update", "filesystem.write", "commands"],
    networkAccessRequired: true,
    filesystemAccessRequired: "write",
    commandExecutionRequired: true,
    messagingRequired: false,
    browserDesktopRequired: false,
    secretsRequired: false,
    physicalActionPotential: false,
    updateInstallBehavior: "proposal_only",
    dockerMcpCompatible: true,
    preferredIsolation: "docker_mcp_gateway",
    riskLevel: "high",
    sourceTrust: {
      ...DEFAULT_SOURCE_TRUST,
      sourceUrl: "claw://skills/quarantine",
      sourceKind: "community",
      trustStatus: "unverified",
    },
    notConfiguredReason: "OpenClaw skills default to quarantine/proposal only until reviewed and approved.",
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function scopeArray(value: unknown): ToolPermissionScope[] {
  return stringArray(value).filter((scope): scope is ToolPermissionScope => [
    "filesystem.read",
    "filesystem.write",
    "network",
    "commands",
    "secrets",
    "browser",
    "desktop",
    "physical",
    "model",
    "external_messages",
    "install",
    "update",
  ].includes(scope));
}

function readProfileState(): Record<string, unknown> {
  seedFoundationDefaults();
  const row = sqlite.prepare("SELECT state_json FROM plugin_state WHERE id = ?").get(CLAW_GATEWAY_PROFILE_STATE_ID) as
    | { state_json?: string }
    | undefined;
  return parseJson(row?.state_json);
}

function defaultProfile(): ClawGatewayProfile {
  return {
    id: "localai-claw-gateway",
    name: "LOCALAI OpenClaw/NemoClaw Gateway Profile",
    enabled: false,
    approved: false,
    gatewayStates: { ...DEFAULT_GATEWAY_STATES },
    allowedGateways: [],
    allowedSkills: [],
    blockedSkills: [],
    quarantinedSkills: DEFAULT_SKILLS.filter(skill => skill.lifecycleState === "quarantined").map(skill => skill.id),
    rejectedSkills: [],
    approvedSkillSources: [],
    allowedChannels: [],
    modeCompatibility: [...ALL_NON_EMERGENCY_MODES],
    blockSecrets: true,
    requireApprovalForExternalMessages: true,
    allowDockerMcpIsolation: true,
    updatedAt: nowIso(),
  };
}

export function getClawGatewayProfile(): ClawGatewayProfile {
  const state = readProfileState();
  const defaults = defaultProfile();
  const gatewayStates = typeof state["gatewayStates"] === "object" && state["gatewayStates"] !== null
    ? { ...defaults.gatewayStates, ...(state["gatewayStates"] as Record<string, ClawGatewayLifecycleState>) }
    : defaults.gatewayStates;
  return {
    ...defaults,
    enabled: state["enabled"] === true,
    approved: state["approved"] === true,
    gatewayStates,
    allowedGateways: stringArray(state["allowedGateways"]).filter((value): value is ClawGatewayType => value in DEFAULT_GATEWAY_STATES),
    allowedSkills: stringArray(state["allowedSkills"]),
    blockedSkills: stringArray(state["blockedSkills"]),
    quarantinedSkills: stringArray(state["quarantinedSkills"]).length ? stringArray(state["quarantinedSkills"]) : defaults.quarantinedSkills,
    rejectedSkills: stringArray(state["rejectedSkills"]),
    approvedSkillSources: stringArray(state["approvedSkillSources"]),
    allowedChannels: stringArray(state["allowedChannels"]),
    blockSecrets: state["blockSecrets"] !== false,
    requireApprovalForExternalMessages: state["requireApprovalForExternalMessages"] !== false,
    allowDockerMcpIsolation: state["allowDockerMcpIsolation"] !== false,
    updatedAt: typeof state["updatedAt"] === "string" ? state["updatedAt"] : defaults.updatedAt,
  };
}

export function saveClawGatewayProfile(input: Partial<ClawGatewayProfile>, actor = "system"): ClawGatewayProfile {
  const current = getClawGatewayProfile();
  const next: ClawGatewayProfile = {
    ...current,
    ...input,
    gatewayStates: { ...current.gatewayStates, ...(input.gatewayStates ?? {}) },
    updatedAt: nowIso(),
  };
  upsertPluginState(CLAW_GATEWAY_PROFILE_STATE_ID, {
    ...next,
    updatedBy: actor,
  });
  recordAuditEvent({
    eventType: "tool_firewall",
    action: "claw_gateway_profile_saved",
    actor,
    target: CLAW_GATEWAY_PROFILE_STATE_ID,
    result: "success",
    metadata: redactForMissionReplay({ profile: next }).value as Record<string, unknown>,
  });
  return next;
}

function riskFromSkill(skill: ClawSkillRecord): ToolRiskLevel {
  if (skill.physicalActionPotential || skill.secretsRequired || skill.messagingRequired || skill.browserDesktopRequired) return "critical";
  if (skill.commandExecutionRequired || skill.filesystemAccessRequired === "write") return "high";
  if (skill.networkAccessRequired) return "medium";
  return skill.riskLevel;
}

function profileAllows(profile: ClawGatewayProfile, skill: ClawSkillRecord): boolean {
  return profile.enabled
    && profile.approved
    && profile.allowedGateways.includes(skill.gatewayType)
    && profile.allowedSkills.includes(skill.id)
    && !profile.blockedSkills.includes(skill.id)
    && !profile.quarantinedSkills.includes(skill.id)
    && !profile.rejectedSkills.includes(skill.id);
}

function metadataForSkill(skill: ClawSkillRecord, profile: ClawGatewayProfile): ClawGatewayToolMetadata {
  return {
    gatewayType: skill.gatewayType,
    gatewayState: profile.gatewayStates[skill.gatewayType] ?? "not_configured",
    skillLifecycleState: skill.lifecycleState,
    supportedChannels: [...skill.supportedChannels],
    sourceTrust: { ...skill.sourceTrust },
    networkAccessRequired: skill.networkAccessRequired,
    filesystemAccessRequired: skill.filesystemAccessRequired,
    commandExecutionRequired: skill.commandExecutionRequired,
    messagingRequired: skill.messagingRequired,
    browserDesktopRequired: skill.browserDesktopRequired,
    secretsRequired: skill.secretsRequired,
    physicalActionPotential: skill.physicalActionPotential,
    dockerMcpCompatible: skill.dockerMcpCompatible,
    preferredIsolation: skill.preferredIsolation,
    profileAllowlisted: profileAllows(profile, skill),
    blockSecrets: profile.blockSecrets,
    requireApprovalForExternalMessages: profile.requireApprovalForExternalMessages,
    updateInstallBehavior: skill.updateInstallBehavior,
  };
}

export function clawGatewayToolRecords(profile: ClawGatewayProfile = getClawGatewayProfile()): ToolRecord[] {
  return DEFAULT_SKILLS.map((skill) => {
    const clawGateway = metadataForSkill(skill, profile);
    const riskLevel = riskFromSkill(skill);
    const configured = clawGateway.profileAllowlisted && clawGateway.gatewayState === "enabled" ? "configured" : "not_configured";
    const scopes = [...new Set(skill.declaredPermissions)];
    return {
      id: `claw.${skill.id}`,
      displayName: skill.displayName,
      provider: "localai-claw-gateway",
      type: "gateway",
      sourceRef: skill.sourceRef,
      sourceKind: "phase07c_claw_gateway",
      installStatus: "not_installed",
      configuredStatus: configured,
      enabled: false,
      visibility: clawGateway.profileAllowlisted ? "visible" : "hidden",
      isolationMode: skill.preferredIsolation === "docker_mcp_gateway" ? "docker_mcp_gateway" : "dry_run",
      clawGateway,
      runtimeModeCompatibility: profile.modeCompatibility.filter(mode => mode !== "Gaming" && mode !== "EmergencyStop"),
      permissionScopes: scopes,
      networkAccess: skill.networkAccessRequired ? "external" : "none",
      filesystemAccess: skill.filesystemAccessRequired,
      commandExecutionRequired: skill.commandExecutionRequired,
      secretsRequired: skill.secretsRequired,
      approvalRequirement: riskLevel === "critical" ? "manual_only" : "required",
      sandboxMode: "dry_run_only",
      riskLevel,
      auditReplayBehavior: "record_decision_and_approval",
      notConfiguredReason: skill.notConfiguredReason ?? "OpenClaw/NemoClaw gateway tools are not_configured until verified, allowlisted, configured, and approved.",
      degradedReason: skill.degradedReason,
      capabilities: ["claw_gateway", skill.gatewayType, ...skill.supportedChannels],
      actions: ["inspect", "propose_action", "discover_skill", "review_skill", "install_proposal", "update_proposal"],
      metadata: {
        phase: "07C",
        sourceOfTruth: CLAW_GATEWAY_SOURCE_OF_TRUTH,
        sourceTrust: clawGateway.sourceTrust,
        profileAllowlisted: clawGateway.profileAllowlisted,
        gatewayState: clawGateway.gatewayState,
        skillLifecycleState: clawGateway.skillLifecycleState,
        dockerMcpCompatible: clawGateway.dockerMcpCompatible,
      },
    };
  });
}

export function evaluateClawGatewayFirewall(
  tool: ToolRecord,
  requiredScopes: ToolPermissionScope[],
): { status: ToolStatus; reason: string; auditAction: string } | null {
  if (tool.sourceKind !== "phase07c_claw_gateway" && !tool.clawGateway) return null;
  const metadata = tool.clawGateway;
  if (!metadata) {
    return {
      status: "blocked",
      reason: "OpenClaw/NemoClaw gateway tool is missing required gateway policy metadata.",
      auditAction: "claw_gateway_metadata_blocked",
    };
  }
  if (metadata.sourceTrust.trustStatus === "blocked" || metadata.sourceTrust.sourceKind === "unknown") {
    return {
      status: "blocked",
      reason: "Unknown OpenClaw/NemoClaw skill or gateway sources are blocked until verified and allowlisted.",
      auditAction: "claw_gateway_untrusted_source_blocked",
    };
  }
  if ((metadata.sourceTrust.sourceKind === "community" || metadata.sourceTrust.sourceKind === "custom_local") && !metadata.sourceTrust.explicitlyApprovedSource) {
    return {
      status: "blocked",
      reason: "Community or custom OpenClaw/NemoClaw sources default to disabled until explicitly approved.",
      auditAction: "claw_gateway_unapproved_source_blocked",
    };
  }
  if (metadata.skillLifecycleState === "quarantined" || metadata.skillLifecycleState === "rejected" || metadata.skillLifecycleState === "blocked") {
    return {
      status: "blocked",
      reason: `OpenClaw/NemoClaw skill state ${metadata.skillLifecycleState} cannot execute.`,
      auditAction: "claw_gateway_skill_state_blocked",
    };
  }
  if (metadata.skillLifecycleState !== "approved" && metadata.skillLifecycleState !== "not_configured") {
    return {
      status: "blocked",
      reason: "OpenClaw/NemoClaw skills must be reviewed and approved before execution.",
      auditAction: "claw_gateway_skill_review_blocked",
    };
  }
  if (tool.visibility === "hidden" || metadata.profileAllowlisted !== true || metadata.gatewayState !== "enabled") {
    return {
      status: "not_configured",
      reason: "OpenClaw/NemoClaw gateways are hidden and not_configured until included in an approved profile/skill allowlist.",
      auditAction: "claw_gateway_profile_blocked",
    };
  }
  if (metadata.blockSecrets && (metadata.secretsRequired || tool.secretsRequired || requiredScopes.includes("secrets"))) {
    return {
      status: "blocked",
      reason: "OpenClaw/NemoClaw gateways block secrets, tokens, credentials, and environment exposure by default.",
      auditAction: "claw_gateway_secrets_blocked",
    };
  }
  if (metadata.physicalActionPotential || requiredScopes.includes("physical")) {
    return {
      status: "blocked",
      reason: "Physical OpenClaw/NemoClaw actions remain manual-only until a physical safety layer exists.",
      auditAction: "claw_gateway_physical_blocked",
    };
  }
  if (metadata.messagingRequired && metadata.requireApprovalForExternalMessages && !tool.permissionScopes.includes("external_messages")) {
    return {
      status: "blocked",
      reason: "External OpenClaw/NemoClaw messages must declare external_messages permission and require approval.",
      auditAction: "claw_gateway_messaging_scope_blocked",
    };
  }
  return null;
}

export function getClawGatewayStatus(): ClawGatewayStatus {
  const profile = getClawGatewayProfile();
  const skills = DEFAULT_SKILLS.map(skill => ({
    ...skill,
    lifecycleState: profile.allowedSkills.includes(skill.id)
      ? "approved" as ClawSkillLifecycleState
      : profile.rejectedSkills.includes(skill.id)
        ? "rejected" as ClawSkillLifecycleState
        : profile.quarantinedSkills.includes(skill.id)
          ? "quarantined" as ClawSkillLifecycleState
          : skill.lifecycleState,
  }));
  return {
    status: "not_configured",
    openclawConfigured: profile.gatewayStates.openclaw === "configured" || profile.gatewayStates.openclaw === "enabled",
    nemoclawConfigured: profile.gatewayStates.nemoclaw === "configured" || profile.gatewayStates.nemoclaw === "enabled",
    openshellConfigured: profile.gatewayStates.openshell === "configured" || profile.gatewayStates.openshell === "enabled",
    gatewayReachable: false,
    skillRegistryStatus: skills.some(skill => skill.lifecycleState === "quarantined") ? "quarantined" : "not_configured",
    unavailableReason: "Dry-run status only; no OpenClaw/NemoClaw service was installed, started, cloned, configured, or contacted.",
    checkedAt: nowIso(),
    dryRun: true,
    profile,
    skills,
  };
}

export function proposeClawGatewayConfig(options: {
  gatewayType?: ClawGatewayType;
  sourceRef?: string;
  sourceKind?: ClawSkillSourceKind;
} = {}): ClawGatewayProposal {
  const gatewayType = options.gatewayType ?? "openclaw";
  const sourceKind = options.sourceKind ?? "unknown";
  const trustStatus: ClawSourceTrustStatus = sourceKind === "unknown" ? "blocked" : "unverified";
  return {
    status: "proposed",
    dryRun: true,
    actionState: "proposed",
    gatewayType,
    sourceRef: options.sourceRef ?? `watchlist://${gatewayType}`,
    sourceTrust: {
      ...DEFAULT_SOURCE_TRUST,
      sourceUrl: options.sourceRef ?? `watchlist://${gatewayType}`,
      sourceKind,
      trustStatus,
    },
    requiredApprovals: [
      "source verification",
      "skill permission review",
      "gateway profile allowlist",
      "tool firewall approval before action",
    ],
    permissions: ["external_messages", "network"],
    rollbackPlan: "No change applied. A real apply path must create a snapshot/rollback plan before enabling any gateway.",
    testPlan: [
      "Run claw gateway firewall tests.",
      "Run route guard coverage.",
      "Run full LOCALAI typecheck and tests before approval.",
    ],
    notes: [
      "Proposal/dry-run only; no clone, install, service start, external message, or command execution occurred.",
      "Unknown sources remain blocked until verified and allowlisted.",
      "Secrets, tokens, cookies, SSH keys, passwords, crypto wallets, and private files are not exposed by default.",
    ],
  };
}

export function discoverClawSkill(input: Record<string, unknown>): ClawSkillRecord {
  const id = typeof input["id"] === "string" && input["id"].trim() ? input["id"].trim() : "unknown.claw.skill";
  const permissions = scopeArray(input["declaredPermissions"]);
  const sourceKind = typeof input["sourceKind"] === "string" && ["allowlisted", "community", "custom_local", "unknown"].includes(input["sourceKind"])
    ? input["sourceKind"] as ClawSkillSourceKind
    : "unknown";
  const lifecycleState: ClawSkillLifecycleState = sourceKind === "unknown" ? "blocked" : "quarantined";
  const messagingRequired = permissions.includes("external_messages") || input["messagingRequired"] === true;
  const commandExecutionRequired = permissions.includes("commands") || input["commandExecutionRequired"] === true;
  const secretsRequired = permissions.includes("secrets") || input["secretsRequired"] === true;
  const browserDesktopRequired = permissions.includes("browser") || permissions.includes("desktop");
  const physicalActionPotential = permissions.includes("physical") || input["physicalActionPotential"] === true;
  const filesystemAccessRequired = permissions.includes("filesystem.write")
    ? "write"
    : permissions.includes("filesystem.read")
      ? "read"
      : "none";
  const skill: ClawSkillRecord = {
    id,
    displayName: typeof input["displayName"] === "string" ? input["displayName"] : id,
    gatewayType: typeof input["gatewayType"] === "string" && input["gatewayType"] in DEFAULT_GATEWAY_STATES
      ? input["gatewayType"] as ClawGatewayType
      : "skill_adapter",
    lifecycleState,
    sourceRef: typeof input["sourceRef"] === "string" ? input["sourceRef"] : "unknown",
    supportedChannels: stringArray(input["supportedChannels"]),
    declaredPermissions: permissions,
    networkAccessRequired: permissions.includes("network") || input["networkAccessRequired"] === true,
    filesystemAccessRequired,
    commandExecutionRequired,
    messagingRequired,
    browserDesktopRequired,
    secretsRequired,
    physicalActionPotential,
    updateInstallBehavior: permissions.includes("install") || permissions.includes("update") ? "proposal_only" : "none",
    dockerMcpCompatible: input["dockerMcpCompatible"] !== false,
    preferredIsolation: input["preferredIsolation"] === "docker_mcp_gateway" ? "docker_mcp_gateway" : "dry_run",
    riskLevel: "medium",
    sourceTrust: {
      ...DEFAULT_SOURCE_TRUST,
      sourceUrl: typeof input["sourceRef"] === "string" ? input["sourceRef"] : undefined,
      sourceKind,
      trustStatus: sourceKind === "unknown" ? "blocked" : "unverified",
      explicitlyApprovedSource: false,
    },
    notConfiguredReason: sourceKind === "unknown"
      ? "Unknown OpenClaw/NemoClaw skill sources are blocked."
      : "Discovered OpenClaw/NemoClaw skills enter quarantine until reviewed.",
  };
  return { ...skill, riskLevel: riskFromSkill(skill) };
}

export function reviewClawSkill(input: {
  skillId: string;
  decision: "approve" | "reject" | "quarantine";
  sourceRef?: string;
}, actor = "api"): { profile: ClawGatewayProfile; executed: false; message: string } {
  const current = getClawGatewayProfile();
  const skillId = input.skillId;
  const next: ClawGatewayProfile = {
    ...current,
    allowedSkills: current.allowedSkills.filter(id => id !== skillId),
    rejectedSkills: current.rejectedSkills.filter(id => id !== skillId),
    quarantinedSkills: current.quarantinedSkills.filter(id => id !== skillId),
  };
  if (input.decision === "approve") {
    next.allowedSkills = [...new Set([...next.allowedSkills, skillId])];
    if (input.sourceRef) next.approvedSkillSources = [...new Set([...next.approvedSkillSources, input.sourceRef])];
  } else if (input.decision === "reject") {
    next.rejectedSkills = [...new Set([...next.rejectedSkills, skillId])];
  } else {
    next.quarantinedSkills = [...new Set([...next.quarantinedSkills, skillId])];
  }
  const profile = saveClawGatewayProfile(next, actor);
  return {
    profile,
    executed: false,
    message: `OpenClaw/NemoClaw skill ${skillId} marked ${input.decision}; no gateway action executed.`,
  };
}
