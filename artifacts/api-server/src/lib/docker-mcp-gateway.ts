import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sqlite } from "../db/database.js";
import {
  recordAuditEvent,
  seedFoundationDefaults,
  upsertPluginState,
} from "./platform-foundation.js";
import { redactForMissionReplay } from "./mission-replay.js";
import type {
  ToolApprovalRequirement,
  ToolPermissionScope,
  ToolRecord,
  ToolRiskLevel,
  ToolStatus,
} from "./tool-registry.js";
import type { RuntimeMode } from "./runtime-mode.js";

const execFileAsync = promisify(execFile);

export type DockerMcpIsolationMode = "none" | "dry_run" | "docker_mcp_gateway" | "future_sandbox";
export type DockerMcpCatalogSource =
  | "docker_built_catalog"
  | "community_catalog"
  | "custom_local"
  | "unknown_untrusted";
export type DockerMcpTrustStatus = "trusted_catalog" | "unverified" | "unpinned" | "blocked";

export interface DockerMcpResourceLimits {
  cpus: number;
  memoryMb: number;
}

export interface DockerMcpMountScope {
  hostPath: string;
  containerPath: string;
  mode: "read_only" | "read_write";
}

export interface DockerMcpSecurityConfig {
  blockSecrets: boolean;
  blockNetwork: boolean;
  resourceLimits: DockerMcpResourceLimits;
  allowedProfiles: string[];
  allowedTools: string[];
  allowedCatalogs: DockerMcpCatalogSource[];
  allowedRegistries: string[];
  allowedMounts: DockerMcpMountScope[];
  deniedEnvVars: string[];
  exposedEnvVars: string[];
}

export interface DockerMcpProfile {
  id: string;
  name: string;
  enabled: boolean;
  approved: boolean;
  allowedServers: string[];
  allowedTools: string[];
  modeCompatibility: RuntimeMode[];
  security: DockerMcpSecurityConfig;
  updatedAt: string;
}

export interface DockerMcpToolMetadata {
  isolationMode: DockerMcpIsolationMode;
  imageRef?: string;
  imagePinned: boolean;
  checksumOrDigest?: string;
  catalogSource: DockerMcpCatalogSource;
  trustStatus: DockerMcpTrustStatus;
  signatureStatus: "present" | "missing" | "unknown";
  provenanceStatus: "present" | "missing" | "unknown";
  sbomStatus: "present" | "missing" | "unknown";
  vulnerabilityScanStatus: "present" | "missing" | "unknown";
  containerNetworkMode: "none" | "restricted_egress" | "host_required";
  filesystemMounts: DockerMcpMountScope[];
  secretsRequired: boolean;
  resourceLimits: DockerMcpResourceLimits;
  profileId: string;
  profileAllowlisted: boolean;
  explicitlyApprovedSource: boolean;
  hiddenByDefault: boolean;
  blockSecrets: boolean;
  blockNetwork: boolean;
  deniedEnvVars: string[];
  exposedEnvVars: string[];
  notConfiguredReason?: string;
  degradedReason?: string;
}

export interface DockerMcpGatewayStatus {
  status: "available" | "not_configured" | "degraded";
  dockerInstalled: boolean;
  dockerDaemonReachable: boolean;
  dockerMcpAvailable: boolean;
  gatewayConfigured: boolean;
  gatewayRunning: boolean;
  unavailableReason?: string;
  checkedAt: string;
  dryRun: boolean;
  dockerVersion?: string;
  dockerServerVersion?: string;
  profile: DockerMcpProfile;
}

export interface DockerMcpGatewayProposal {
  status: "proposed";
  dryRun: true;
  source: string;
  imageRef: string;
  catalogSource: DockerMcpCatalogSource;
  trustStatus: DockerMcpTrustStatus;
  security: DockerMcpSecurityConfig;
  clientConfig: {
    mcpServers: Record<string, unknown>;
    environment: Record<string, never>;
  };
  notes: string[];
}

type DockerCommandRunner = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

interface DockerMcpToolSpec {
  id: string;
  displayName: string;
  sourceRef: string;
  imageRef: string;
  catalogSource: DockerMcpCatalogSource;
  permissionScopes: ToolPermissionScope[];
  capabilities: string[];
  actions: string[];
  networkRequired: boolean;
  filesystemMounts: DockerMcpMountScope[];
  secretsRequired: boolean;
}

export const DOCKER_MCP_PROFILE_STATE_ID = "docker-mcp:profile";
export const DOCKER_MCP_SOURCE_OF_TRUTH =
  "Phase 07B Docker MCP Gateway profile stored in plugin_state plus Docker MCP metadata attached to the Phase 07A tool-registry.ts firewall.";

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

export const DEFAULT_DOCKER_MCP_SECURITY: DockerMcpSecurityConfig = {
  blockSecrets: true,
  blockNetwork: true,
  resourceLimits: { cpus: 0.5, memoryMb: 512 },
  allowedProfiles: ["localai-safe"],
  allowedTools: [],
  allowedCatalogs: ["docker_built_catalog"],
  allowedRegistries: ["docker.io", "ghcr.io"],
  allowedMounts: [],
  deniedEnvVars: [
    "API_KEY",
    "TOKEN",
    "SECRET",
    "PASSWORD",
    "COOKIE",
    "SSH_KEY",
    "PRIVATE_KEY",
    "WALLET",
  ],
  exposedEnvVars: [],
};

const DOCKER_MCP_TOOL_SPECS: DockerMcpToolSpec[] = [
  {
    id: "docker-mcp.catalog.filesystem-readonly",
    displayName: "Docker MCP Filesystem Read-Only Tool",
    sourceRef: "docker-mcp://catalog/filesystem-readonly",
    imageRef: "docker/mcp-filesystem:unconfigured",
    catalogSource: "docker_built_catalog",
    permissionScopes: ["filesystem.read"],
    capabilities: ["mcp", "docker_mcp_gateway", "filesystem_readonly"],
    actions: ["inspect", "propose_run"],
    networkRequired: false,
    filesystemMounts: [],
    secretsRequired: false,
  },
  {
    id: "docker-mcp.catalog.fetch",
    displayName: "Docker MCP Fetch Tool",
    sourceRef: "docker-mcp://catalog/fetch",
    imageRef: "docker/mcp-fetch:unconfigured",
    catalogSource: "docker_built_catalog",
    permissionScopes: ["network"],
    capabilities: ["mcp", "docker_mcp_gateway", "network_declared"],
    actions: ["inspect", "propose_run"],
    networkRequired: true,
    filesystemMounts: [],
    secretsRequired: false,
  },
  {
    id: "docker-mcp.community.shell",
    displayName: "Community Docker MCP Shell Tool",
    sourceRef: "docker-mcp://community/shell",
    imageRef: "community/shell-mcp:untrusted",
    catalogSource: "community_catalog",
    permissionScopes: ["commands", "filesystem.write"],
    capabilities: ["mcp", "docker_mcp_gateway", "community_source"],
    actions: ["inspect", "propose_run"],
    networkRequired: false,
    filesystemMounts: [],
    secretsRequired: false,
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

function uniq<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function cloneSecurity(input?: Partial<DockerMcpSecurityConfig>): DockerMcpSecurityConfig {
  return {
    blockSecrets: input?.blockSecrets ?? DEFAULT_DOCKER_MCP_SECURITY.blockSecrets,
    blockNetwork: input?.blockNetwork ?? DEFAULT_DOCKER_MCP_SECURITY.blockNetwork,
    resourceLimits: {
      cpus: input?.resourceLimits?.cpus ?? DEFAULT_DOCKER_MCP_SECURITY.resourceLimits.cpus,
      memoryMb: input?.resourceLimits?.memoryMb ?? DEFAULT_DOCKER_MCP_SECURITY.resourceLimits.memoryMb,
    },
    allowedProfiles: uniq(input?.allowedProfiles ?? DEFAULT_DOCKER_MCP_SECURITY.allowedProfiles),
    allowedTools: uniq(input?.allowedTools ?? DEFAULT_DOCKER_MCP_SECURITY.allowedTools),
    allowedCatalogs: uniq(input?.allowedCatalogs ?? DEFAULT_DOCKER_MCP_SECURITY.allowedCatalogs),
    allowedRegistries: uniq(input?.allowedRegistries ?? DEFAULT_DOCKER_MCP_SECURITY.allowedRegistries),
    allowedMounts: [...(input?.allowedMounts ?? DEFAULT_DOCKER_MCP_SECURITY.allowedMounts)],
    deniedEnvVars: uniq(input?.deniedEnvVars ?? DEFAULT_DOCKER_MCP_SECURITY.deniedEnvVars),
    exposedEnvVars: uniq(input?.exposedEnvVars ?? DEFAULT_DOCKER_MCP_SECURITY.exposedEnvVars),
  };
}

function normalizeProfile(input: Record<string, unknown> = {}): DockerMcpProfile {
  const rawSecurity = input["security"] && typeof input["security"] === "object" && !Array.isArray(input["security"])
    ? input["security"] as Partial<DockerMcpSecurityConfig>
    : {};
  const security = cloneSecurity(rawSecurity);
  const allowedTools = Array.isArray(input["allowedTools"])
    ? input["allowedTools"].filter((value): value is string => typeof value === "string")
    : security.allowedTools;
  const allowedServers = Array.isArray(input["allowedServers"])
    ? input["allowedServers"].filter((value): value is string => typeof value === "string")
    : [];
  const modeCompatibility = Array.isArray(input["modeCompatibility"])
    ? input["modeCompatibility"].filter((value): value is RuntimeMode => typeof value === "string")
    : ALL_NON_EMERGENCY_MODES;
  return {
    id: typeof input["id"] === "string" ? input["id"] : "localai-safe",
    name: typeof input["name"] === "string" ? input["name"] : "LOCALAI Safe Docker MCP Profile",
    enabled: input["enabled"] === true,
    approved: input["approved"] === true,
    allowedServers: uniq(allowedServers),
    allowedTools: uniq(allowedTools),
    modeCompatibility: uniq(modeCompatibility),
    security: { ...security, allowedTools: uniq(allowedTools) },
    updatedAt: typeof input["updatedAt"] === "string" ? input["updatedAt"] : nowIso(),
  };
}

export function getDockerMcpProfile(): DockerMcpProfile {
  seedFoundationDefaults();
  const row = sqlite.prepare("SELECT state_json FROM plugin_state WHERE id = ?").get(DOCKER_MCP_PROFILE_STATE_ID) as
    | { state_json?: string }
    | undefined;
  return normalizeProfile(parseJson(row?.state_json));
}

export function saveDockerMcpProfile(patch: Partial<DockerMcpProfile>, actor = "localai"): DockerMcpProfile {
  const current = getDockerMcpProfile();
  const next = normalizeProfile({
    ...current,
    ...patch,
    security: {
      ...current.security,
      ...(patch.security ?? {}),
    },
    updatedAt: nowIso(),
  });
  const redacted = redactForMissionReplay(next);
  upsertPluginState(DOCKER_MCP_PROFILE_STATE_ID, {
    enabled: next.enabled,
    installed: false,
    permissions: {
      allowedTools: next.allowedTools,
      allowedServers: next.allowedServers,
      security: next.security,
    },
    ...redacted.value as Record<string, unknown>,
  });
  recordAuditEvent({
    eventType: "docker_mcp_gateway",
    action: "profile_update",
    actor,
    target: next.id,
    result: "success",
    metadata: redacted.value as Record<string, unknown>,
  });
  return next;
}

function sourceTrustStatus(source: DockerMcpCatalogSource): DockerMcpTrustStatus {
  if (source === "docker_built_catalog") return "trusted_catalog";
  if (source === "unknown_untrusted") return "blocked";
  return "unverified";
}

function riskForDockerMcpTool(source: DockerMcpCatalogSource, scopes: ToolPermissionScope[]): ToolRiskLevel {
  if (source === "unknown_untrusted") return "critical";
  if (source === "community_catalog" || source === "custom_local") return "high";
  if (scopes.some(scope => scope === "commands" || scope === "filesystem.write" || scope === "secrets")) return "high";
  if (scopes.includes("network")) return "medium";
  return "medium";
}

function approvalForDockerMcpTool(risk: ToolRiskLevel): ToolApprovalRequirement {
  return risk === "critical" ? "manual_only" : "required";
}

function metadataForSpec(spec: DockerMcpToolSpec, profile: DockerMcpProfile): DockerMcpToolMetadata {
  const allowlisted = profile.enabled === true && profile.approved === true && profile.allowedTools.includes(spec.id);
  const sourceAllowed = profile.security.allowedCatalogs.includes(spec.catalogSource);
  return {
    isolationMode: "docker_mcp_gateway",
    imageRef: spec.imageRef,
    imagePinned: false,
    catalogSource: spec.catalogSource,
    trustStatus: sourceTrustStatus(spec.catalogSource),
    signatureStatus: "unknown",
    provenanceStatus: "unknown",
    sbomStatus: "unknown",
    vulnerabilityScanStatus: "unknown",
    containerNetworkMode: spec.networkRequired ? "restricted_egress" : "none",
    filesystemMounts: spec.filesystemMounts,
    secretsRequired: spec.secretsRequired,
    resourceLimits: { ...profile.security.resourceLimits },
    profileId: profile.id,
    profileAllowlisted: allowlisted && sourceAllowed,
    explicitlyApprovedSource: sourceAllowed && spec.catalogSource === "docker_built_catalog",
    hiddenByDefault: true,
    blockSecrets: profile.security.blockSecrets,
    blockNetwork: spec.networkRequired ? profile.security.blockNetwork : true,
    deniedEnvVars: [...profile.security.deniedEnvVars],
    exposedEnvVars: [...profile.security.exposedEnvVars],
    notConfiguredReason: allowlisted && sourceAllowed
      ? "Docker MCP Gateway must be configured and reachable before this tool can run."
      : "Docker MCP tools are hidden and not_configured until included in an approved Docker MCP profile/tool allowlist.",
  };
}

export function dockerMcpGatewayToolRecords(profile: DockerMcpProfile = getDockerMcpProfile()): ToolRecord[] {
  return DOCKER_MCP_TOOL_SPECS.map((spec) => {
    const dockerMcp = metadataForSpec(spec, profile);
    const riskLevel = riskForDockerMcpTool(spec.catalogSource, spec.permissionScopes);
    const configured = dockerMcp.profileAllowlisted ? "not_configured" : "not_configured";
    return {
      id: spec.id,
      displayName: spec.displayName,
      provider: "docker-mcp-gateway",
      type: "mcp",
      sourceRef: spec.sourceRef,
      sourceKind: "phase07b_docker_mcp_gateway",
      installStatus: "not_installed",
      configuredStatus: configured,
      enabled: false,
      visibility: dockerMcp.profileAllowlisted ? "visible" : "hidden",
      isolationMode: "docker_mcp_gateway",
      dockerMcp,
      runtimeModeCompatibility: profile.modeCompatibility.filter(mode => mode !== "Gaming" && mode !== "EmergencyStop"),
      permissionScopes: spec.permissionScopes,
      networkAccess: spec.networkRequired ? "external" : "none",
      filesystemAccess: spec.permissionScopes.includes("filesystem.write")
        ? "write"
        : spec.permissionScopes.includes("filesystem.read")
          ? "scoped"
          : "none",
      commandExecutionRequired: spec.permissionScopes.includes("commands"),
      secretsRequired: spec.secretsRequired,
      approvalRequirement: approvalForDockerMcpTool(riskLevel),
      sandboxMode: "dry_run_only",
      riskLevel,
      auditReplayBehavior: "record_decision_and_approval",
      notConfiguredReason: dockerMcp.notConfiguredReason,
      capabilities: spec.capabilities,
      actions: spec.actions,
      metadata: {
        phase: "07B",
        sourceOfTruth: DOCKER_MCP_SOURCE_OF_TRUTH,
        catalogSource: spec.catalogSource,
        trustStatus: dockerMcp.trustStatus,
        hiddenByDefault: true,
        profileAllowlisted: dockerMcp.profileAllowlisted,
      },
    };
  });
}

export function evaluateDockerMcpFirewall(
  tool: ToolRecord,
  requiredScopes: ToolPermissionScope[],
): { status: ToolStatus; reason: string; auditAction: string } | null {
  if (tool.isolationMode !== "docker_mcp_gateway") return null;
  const metadata = tool.dockerMcp;
  if (!metadata) {
    return {
      status: "blocked",
      reason: "Docker MCP tool is missing required Docker MCP policy metadata.",
      auditAction: "docker_mcp_metadata_blocked",
    };
  }
  if (metadata.catalogSource === "unknown_untrusted" || metadata.trustStatus === "blocked") {
    return {
      status: "blocked",
      reason: "Unknown or untrusted Docker MCP catalog sources are blocked.",
      auditAction: "docker_mcp_untrusted_source_blocked",
    };
  }
  if ((metadata.catalogSource === "community_catalog" || metadata.catalogSource === "custom_local") && !metadata.explicitlyApprovedSource) {
    return {
      status: "blocked",
      reason: "Community or custom Docker MCP sources default to disabled until explicitly approved.",
      auditAction: "docker_mcp_unapproved_source_blocked",
    };
  }
  if (tool.visibility === "hidden" || metadata.profileAllowlisted !== true) {
    return {
      status: "not_configured",
      reason: "Docker MCP tools are hidden unless included in an approved profile/tool allowlist.",
      auditAction: "docker_mcp_profile_blocked",
    };
  }
  if (metadata.blockSecrets && (tool.secretsRequired || requiredScopes.includes("secrets") || metadata.exposedEnvVars.length > 0)) {
    return {
      status: "blocked",
      reason: "Docker MCP Gateway blocks secrets and environment exposure by default.",
      auditAction: "docker_mcp_secrets_blocked",
    };
  }
  if (metadata.blockNetwork && requiredScopes.includes("network")) {
    return {
      status: "blocked",
      reason: "Docker MCP Gateway blocks network access by default unless a profile explicitly allows it.",
      auditAction: "docker_mcp_network_blocked",
    };
  }
  if (metadata.filesystemMounts.some(mount => mount.hostPath === "/" || mount.hostPath === "*" || mount.mode === "read_write")) {
    return {
      status: "blocked",
      reason: "Docker MCP Gateway proposals cannot request broad or writeable filesystem mounts by default.",
      auditAction: "docker_mcp_mount_blocked",
    };
  }
  return null;
}

function scrubOutput(value: string): string {
  return value.replace(/\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|COOKIE)[A-Za-z0-9_]*)=[^\s]+/gi, "$1=[redacted]");
}

async function defaultDockerRunner(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(command, args, {
    timeout: 3000,
    windowsHide: true,
    maxBuffer: 128 * 1024,
  });
  return {
    stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout ?? ""),
    stderr: typeof result.stderr === "string" ? result.stderr : String(result.stderr ?? ""),
  };
}

async function runDockerProbe(
  runner: DockerCommandRunner,
  args: string[],
): Promise<{ ok: boolean; stdout: string; stderr: string; error?: string }> {
  try {
    const result = await runner("docker", args);
    return { ok: true, stdout: scrubOutput(result.stdout), stderr: scrubOutput(result.stderr) };
  } catch (error) {
    return {
      ok: false,
      stdout: "",
      stderr: "",
      error: error instanceof Error ? scrubOutput(error.message) : scrubOutput(String(error)),
    };
  }
}

export async function getDockerMcpGatewayStatus(options: {
  dryRun?: boolean;
  runner?: DockerCommandRunner;
} = {}): Promise<DockerMcpGatewayStatus> {
  const profile = getDockerMcpProfile();
  const checkedAt = nowIso();
  if (options.dryRun !== false) {
    return {
      status: "not_configured",
      dockerInstalled: false,
      dockerDaemonReachable: false,
      dockerMcpAvailable: false,
      gatewayConfigured: profile.enabled,
      gatewayRunning: false,
      unavailableReason: "Dry-run status requested; no Docker command was executed.",
      checkedAt,
      dryRun: true,
      profile,
    };
  }

  const runner = options.runner ?? defaultDockerRunner;
  const version = await runDockerProbe(runner, ["--version"]);
  if (!version.ok) {
    return {
      status: "not_configured",
      dockerInstalled: false,
      dockerDaemonReachable: false,
      dockerMcpAvailable: false,
      gatewayConfigured: profile.enabled,
      gatewayRunning: false,
      unavailableReason: version.error ?? "Docker CLI is unavailable.",
      checkedAt,
      dryRun: false,
      profile,
    };
  }

  const info = await runDockerProbe(runner, ["info", "--format", "{{json .ServerVersion}}"]);
  const mcpHelp = await runDockerProbe(runner, ["mcp", "--help"]);
  const dockerMcpAvailable = mcpHelp.ok;
  return {
    status: info.ok && dockerMcpAvailable && profile.enabled ? "available" : info.ok ? "not_configured" : "degraded",
    dockerInstalled: true,
    dockerDaemonReachable: info.ok,
    dockerMcpAvailable,
    gatewayConfigured: profile.enabled,
    gatewayRunning: false,
    unavailableReason: info.ok && dockerMcpAvailable
      ? profile.enabled
        ? "Gateway is configured, but LOCALAI did not start or inspect containers from this status check."
        : "Docker MCP Gateway profile is not configured/enabled in LOCALAI."
      : info.error ?? mcpHelp.error ?? "Docker MCP Gateway is unavailable.",
    checkedAt,
    dryRun: false,
    dockerVersion: version.stdout.trim(),
    dockerServerVersion: info.stdout.trim().replace(/^"|"$/g, ""),
    profile,
  };
}

export function proposeDockerMcpGatewayConfig(options: {
  profile?: DockerMcpProfile;
  networkRequired?: boolean;
  imageRef?: string;
  catalogSource?: DockerMcpCatalogSource;
} = {}): DockerMcpGatewayProposal {
  const profile = options.profile ?? getDockerMcpProfile();
  const catalogSource = options.catalogSource ?? "docker_built_catalog";
  const security = cloneSecurity({
    ...profile.security,
    blockSecrets: true,
    blockNetwork: options.networkRequired === true ? false : true,
    exposedEnvVars: [],
    allowedMounts: [],
  });
  return {
    status: "proposed",
    dryRun: true,
    source: DOCKER_MCP_SOURCE_OF_TRUTH,
    imageRef: options.imageRef ?? "docker/mcp-gateway:unpinned-proposal",
    catalogSource,
    trustStatus: sourceTrustStatus(catalogSource),
    security,
    clientConfig: {
      mcpServers: {},
      environment: {},
    },
    notes: [
      "Proposal only: no image was pulled, no container was started, and no MCP server was installed.",
      "Secrets and environment variables are blocked by default.",
      "Filesystem mounts are empty by default; broad mounts are not proposed.",
      "Only tools in the approved profile/tool allowlist are exposed to LOCALAI.",
    ],
  };
}
