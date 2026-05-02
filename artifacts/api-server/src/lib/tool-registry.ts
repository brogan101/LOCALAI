import { sqlite } from "../db/database.js";
import {
  evaluatePermission,
  recordAuditEvent,
  seedFoundationDefaults,
  upsertPluginState,
  type PermissionScope,
} from "./platform-foundation.js";
import {
  createApprovalRequest,
  verifyApprovedRequest,
  type ApprovalRequest,
  type PermissionTier,
  type PhysicalTier,
} from "./approval-queue.js";
import {
  getCurrentRuntimeMode,
  type RuntimeMode,
} from "./runtime-mode.js";
import { redactForMissionReplay } from "./mission-replay.js";
import { thoughtLog } from "./thought-log.js";
import {
  DOCKER_MCP_SOURCE_OF_TRUTH,
  DEFAULT_DOCKER_MCP_SECURITY,
  dockerMcpGatewayToolRecords,
  evaluateDockerMcpFirewall,
  getDockerMcpProfile,
  type DockerMcpIsolationMode,
  type DockerMcpToolMetadata,
} from "./docker-mcp-gateway.js";
import {
  CLAW_GATEWAY_SOURCE_OF_TRUTH,
  clawGatewayToolRecords,
  evaluateClawGatewayFirewall,
  getClawGatewayProfile,
  type ClawGatewayToolMetadata,
} from "./claw-gateway.js";
import {
  PLAYWRIGHT_BROWSER_SOURCE_OF_TRUTH,
  getBrowserProfile,
  playwrightBrowserToolRecords,
  evaluateBrowserFirewall,
  type PlaywrightBrowserToolMetadata,
} from "./playwright-browser.js";
import {
  DESKTOP_AUTOMATION_SOURCE_OF_TRUTH,
  getDesktopProfile,
  desktopAutomationToolRecords,
  evaluateDesktopFirewall,
  type DesktopAutomationToolMetadata,
} from "./desktop-automation.js";
import {
  CODING_AGENT_SOURCE_OF_TRUTH,
  getCodingAgentProfile,
  codingAgentToolRecords,
  evaluateCodingAgentFirewall,
  type CodingAgentToolMetadata,
} from "./coding-agent.js";

export type ToolType =
  | "plugin"
  | "integration"
  | "mcp"
  | "openapi"
  | "local-script"
  | "gateway"
  | "browser"
  | "desktop"
  | "physical";

export type ToolStatus =
  | "available"
  | "disabled"
  | "not_configured"
  | "blocked"
  | "approval_required"
  | "denied"
  | "dry_run"
  | "proposal_only";

export type ToolRiskLevel = "low" | "medium" | "high" | "critical";

export type ToolPermissionScope =
  | "filesystem.read"
  | "filesystem.write"
  | "network"
  | "commands"
  | "secrets"
  | "browser"
  | "desktop"
  | "physical"
  | "model"
  | "external_messages"
  | "install"
  | "update";

export type ToolInstallStatus = "installed" | "not_installed" | "unknown";
export type ToolConfiguredStatus = "configured" | "not_configured" | "degraded";
export type ToolApprovalRequirement = "none" | "required" | "manual_only";
export type ToolSandboxMode =
  | "none"
  | "scoped_process"
  | "dry_run_only"
  | "browser_dry_run"
  | "desktop_dry_run"
  | "manual_only"
  | "not_configured";

export interface ToolRecord {
  id: string;
  displayName: string;
  provider: string;
  type: ToolType;
  sourceRef: string;
  sourceKind: "plugin_manifest" | "integration_catalog" | "phase07a_foundation" | "phase07b_docker_mcp_gateway" | "phase07c_claw_gateway" | "phase09a_browser_automation" | "phase09b_desktop_automation" | "phase10_coding_agent";
  installStatus: ToolInstallStatus;
  configuredStatus: ToolConfiguredStatus;
  enabled: boolean;
  runtimeModeCompatibility: RuntimeMode[];
  permissionScopes: ToolPermissionScope[];
  networkAccess: "none" | "local_only" | "external";
  filesystemAccess: "none" | "read" | "write" | "scoped";
  commandExecutionRequired: boolean;
  secretsRequired: boolean;
  approvalRequirement: ToolApprovalRequirement;
  sandboxMode: ToolSandboxMode;
  isolationMode?: DockerMcpIsolationMode;
  visibility?: "visible" | "hidden";
  dockerMcp?: DockerMcpToolMetadata;
  clawGateway?: ClawGatewayToolMetadata;
  browserAutomation?: PlaywrightBrowserToolMetadata;
  desktopAutomation?: DesktopAutomationToolMetadata;
  codingAgent?: CodingAgentToolMetadata;
  riskLevel: ToolRiskLevel;
  auditReplayBehavior: "record_decision_only" | "record_decision_and_approval";
  degradedReason?: string;
  notConfiguredReason?: string;
  capabilities: string[];
  actions: string[];
  metadata: Record<string, unknown>;
}

export interface ToolPluginSource {
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  manifestPath: string;
  routes: Array<{ method: string; path: string; handler: string }>;
  pages: Array<{ label: string; path: string; component: string }>;
  permissions: {
    fileAccess: "none" | "read-only" | "read-write";
  };
}

export interface ToolIntegrationSource {
  id: string;
  name: string;
  repo: string;
  category: string;
  description: string;
  installMethod: string;
  installCmd: string;
  startCmd: string;
  updateCmd: string;
  docs: string;
  usedFor: string;
  localPort?: number;
  healthUrl?: string;
  installed: boolean;
  running: boolean;
  version: string | null;
  pinned: boolean;
  updateAvailable: boolean;
}

export interface ToolRegistryInput {
  plugins?: ToolPluginSource[];
  integrations?: ToolIntegrationSource[];
}

export interface ToolRegistryOptions {
  includeHidden?: boolean;
}

export interface ToolCallInput {
  toolId: string;
  action: string;
  requestedScopes?: ToolPermissionScope[];
  input?: Record<string, unknown>;
  approvalId?: string;
  dryRun?: boolean;
  sandboxSatisfied?: boolean;
  actor?: string;
  registry?: ToolRecord[];
  executeAdapterAvailable?: boolean;
}

export interface ToolFirewallDecision {
  status: ToolStatus;
  allowed: boolean;
  blocked: boolean;
  executed: false;
  reason: string;
  runtimeMode: RuntimeMode;
  requestedScopes: ToolPermissionScope[];
  requiredScopes: ToolPermissionScope[];
  approvalRequired: boolean;
  approvalId?: string;
  auditId?: string;
  redacted: boolean;
}

export interface ToolCallResult {
  success: boolean;
  status: ToolStatus;
  blocked: boolean;
  executed: false;
  message: string;
  tool?: ToolRecord;
  approvalRequired?: boolean;
  approval?: ApprovalRequest;
  decision: ToolFirewallDecision;
}

export const TOOL_APPROVAL_TYPE = "tool_firewall";

const SOURCE_OF_TRUTH =
  `Phase 07A tool-registry.ts projection over plugins/*.json manifests, the existing integrations catalog, tool:* plugin_state overrides, runtime mode policy, permission policies, approval_requests, audit_events, and mission replay redaction. ${DOCKER_MCP_SOURCE_OF_TRUTH} ${CLAW_GATEWAY_SOURCE_OF_TRUTH} ${PLAYWRIGHT_BROWSER_SOURCE_OF_TRUTH} ${DESKTOP_AUTOMATION_SOURCE_OF_TRUTH} ${CODING_AGENT_SOURCE_OF_TRUTH}`;

const ALL_RUNTIME_MODES: RuntimeMode[] = [
  "Lightweight",
  "Coding",
  "Vision",
  "Media",
  "Business",
  "Maker",
  "HomeLab",
  "HomeShop",
  "Gaming",
  "EmergencyStop",
];

const NON_GAMING_RUNTIME_MODES = ALL_RUNTIME_MODES.filter(
  mode => mode !== "Gaming" && mode !== "EmergencyStop",
);

const DANGEROUS_SCOPES = new Set<ToolPermissionScope>([
  "filesystem.write",
  "commands",
  "secrets",
  "browser",
  "desktop",
  "physical",
  "external_messages",
  "install",
  "update",
]);

const DANGEROUS_ACTIONS = new Set([
  "execute",
  "install",
  "start",
  "stop",
  "update",
  "delete",
  "write",
  "send",
  "message",
  "browser_control",
  "desktop_control",
  "physical_action",
]);

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

function uniqueScopes(scopes: ToolPermissionScope[]): ToolPermissionScope[] {
  return [...new Set(scopes)];
}

function toFoundationScope(scope: ToolPermissionScope): PermissionScope | null {
  switch (scope) {
    case "filesystem.read":
      return "file.read";
    case "filesystem.write":
      return "file.write";
    case "commands":
    case "install":
    case "update":
      return "command.execute";
    case "network":
    case "external_messages":
      return "network";
    case "browser":
      return "browser";
    case "desktop":
      return "desktop.worldgui";
    case "secrets":
      return "secrets";
    case "model":
      return "model.access";
    case "physical":
      return null;
  }
}

function readToolOverride(id: string): Record<string, unknown> {
  seedFoundationDefaults();
  const row = sqlite.prepare("SELECT state_json FROM plugin_state WHERE id = ?").get(`tool:${id}`) as
    | { state_json?: string }
    | undefined;
  return parseJson(row?.state_json);
}

function applyToolOverride(tool: ToolRecord): ToolRecord {
  const override = readToolOverride(tool.id);
  const explicitOverride = override["explicitToolFirewallOverride"] === true;
  const enabled = typeof override["enabled"] === "boolean"
    ? override["enabled"]
    : tool.enabled;
  return {
    ...tool,
    enabled: explicitOverride ? enabled : tool.enabled,
    metadata: {
      ...tool.metadata,
      firewallOverride: explicitOverride ? { enabled } : undefined,
    },
  };
}

export function setToolEnabled(tool: ToolRecord, enabled: boolean): ToolRecord {
  upsertPluginState(`tool:${tool.id}`, {
    enabled,
    installed: tool.installStatus === "installed",
    permissions: { scopes: tool.permissionScopes },
    explicitToolFirewallOverride: true,
    toolId: tool.id,
    configuredStatus: tool.configuredStatus,
    riskLevel: tool.riskLevel,
  });
  const next = { ...tool, enabled };
  recordToolAudit("set_enabled", next, enabled ? "success" : "blocked", {
    enabled,
    explicitToolFirewallOverride: true,
  });
  return next;
}

function recordToolAudit(
  action: string,
  tool: Pick<ToolRecord, "id" | "riskLevel" | "type" | "provider">,
  result: "success" | "blocked" | "failed",
  metadata: Record<string, unknown>,
  actor?: string,
): string {
  const redacted = redactForMissionReplay({
    traceId: `tool:${tool.id}`,
    toolId: tool.id,
    toolType: tool.type,
    provider: tool.provider,
    riskLevel: tool.riskLevel,
    ...metadata,
  });
  return recordAuditEvent({
    eventType: "tool_firewall",
    action,
    actor,
    target: tool.id,
    result,
    metadata: redacted.value as Record<string, unknown>,
  });
}

function publishToolThought(
  level: "info" | "warning" | "error",
  title: string,
  message: string,
  tool: Pick<ToolRecord, "id" | "riskLevel" | "type" | "provider">,
  metadata: Record<string, unknown>,
): void {
  const redacted = redactForMissionReplay({
    traceId: `tool:${tool.id}`,
    toolId: tool.id,
    toolType: tool.type,
    provider: tool.provider,
    riskLevel: tool.riskLevel,
    ...metadata,
  });
  thoughtLog.publish({
    level,
    category: "security",
    title,
    message,
    metadata: redacted.value as Record<string, unknown>,
  });
}

function resultFor(
  tool: ToolRecord,
  input: ToolCallInput,
  status: ToolStatus,
  reason: string,
  options: {
    allowed?: boolean;
    blocked?: boolean;
    approvalRequired?: boolean;
    approval?: ApprovalRequest;
    auditId?: string;
    redacted?: boolean;
  } = {},
): ToolCallResult {
  const requestedScopes = uniqueScopes(input.requestedScopes ?? []);
  const requiredScopes = uniqueScopes([...requestedScopes, ...scopesForAction(input.action)]);
  const decision: ToolFirewallDecision = {
    status,
    allowed: options.allowed ?? false,
    blocked: options.blocked ?? true,
    executed: false,
    reason,
    runtimeMode: getCurrentRuntimeMode(),
    requestedScopes,
    requiredScopes,
    approvalRequired: options.approvalRequired ?? false,
    approvalId: options.approval?.id,
    auditId: options.auditId,
    redacted: options.redacted ?? false,
  };
  return {
    success: decision.allowed && !decision.blocked,
    status,
    blocked: decision.blocked,
    executed: false,
    message: reason,
    tool,
    approvalRequired: decision.approvalRequired,
    approval: options.approval,
    decision,
  };
}

function unregisteredResult(input: ToolCallInput, reason = "Tool is not registered in the Phase 07A registry."): ToolCallResult {
  const runtimeMode = getCurrentRuntimeMode();
  const metadata = redactForMissionReplay({
    traceId: `tool:${input.toolId}`,
    toolId: input.toolId,
    action: input.action,
    requestedScopes: input.requestedScopes ?? [],
    input: input.input ?? {},
    runtimeMode,
    reason,
  });
  const auditId = recordAuditEvent({
    eventType: "tool_firewall",
    action: "unregistered_blocked",
    actor: input.actor,
    target: input.toolId,
    result: "blocked",
    metadata: metadata.value as Record<string, unknown>,
  });
  thoughtLog.publish({
    level: "warning",
    category: "security",
    title: "Tool Blocked",
    message: reason,
    metadata: metadata.value as Record<string, unknown>,
  });
  const stub: ToolRecord = {
    id: input.toolId,
    displayName: input.toolId,
    provider: "unknown",
    type: "integration",
    sourceRef: "unregistered",
    sourceKind: "phase07a_foundation",
    installStatus: "unknown",
    configuredStatus: "not_configured",
    enabled: false,
    runtimeModeCompatibility: [],
    permissionScopes: [],
    networkAccess: "none",
    filesystemAccess: "none",
    commandExecutionRequired: false,
    secretsRequired: false,
    approvalRequirement: "manual_only",
    sandboxMode: "not_configured",
    riskLevel: "critical",
    auditReplayBehavior: "record_decision_only",
    notConfiguredReason: reason,
    capabilities: [],
    actions: [],
    metadata: {},
  };
  return {
    success: false,
    status: "not_configured",
    blocked: true,
    executed: false,
    message: reason,
    tool: stub,
    decision: {
      status: "not_configured",
      allowed: false,
      blocked: true,
      executed: false,
      reason,
      runtimeMode,
      requestedScopes: uniqueScopes(input.requestedScopes ?? []),
      requiredScopes: uniqueScopes([...(input.requestedScopes ?? []), ...scopesForAction(input.action)]),
      approvalRequired: false,
      auditId,
      redacted: metadata.redacted,
    },
  };
}

function scopesForAction(actionInput: string): ToolPermissionScope[] {
  const action = actionInput.toLowerCase();
  if (action.includes("install")) return ["commands", "network", "filesystem.write", "install"];
  if (action.includes("update")) return ["commands", "network", "filesystem.write", "update"];
  if (action.includes("start") || action.includes("stop") || action.includes("execute")) return ["commands"];
  if (action.includes("write")) return ["filesystem.write"];
  if (action.includes("browser")) return ["browser"];
  if (action.includes("desktop")) return ["desktop"];
  if (action.includes("physical")) return ["physical"];
  if (action.includes("message") || action.includes("send")) return ["external_messages", "network"];
  return [];
}

function approvalPayloadFor(tool: ToolRecord, input: ToolCallInput): Record<string, unknown> {
  const raw = {
    traceId: `tool:${tool.id}`,
    toolId: tool.id,
    action: input.action,
    requestedScopes: uniqueScopes(input.requestedScopes ?? []),
    requiredScopes: uniqueScopes([...(input.requestedScopes ?? []), ...scopesForAction(input.action)]),
    runtimeMode: getCurrentRuntimeMode(),
    sandboxSatisfied: input.sandboxSatisfied === true,
    dryRun: input.dryRun === true,
    input: input.input ?? {},
  };
  return redactForMissionReplay(raw).value as Record<string, unknown>;
}

function riskTierFor(tool: ToolRecord): PermissionTier {
  if (tool.approvalRequirement === "manual_only" || tool.permissionScopes.includes("physical")) {
    return "tier5_manual_only_prohibited";
  }
  if (tool.permissionScopes.includes("external_messages")) return "tier4_external_communication";
  if (tool.permissionScopes.includes("filesystem.write")) return "tier3_file_modification";
  if (tool.permissionScopes.includes("commands") || tool.permissionScopes.includes("install") || tool.permissionScopes.includes("update")) {
    return "tier2_safe_local_execute";
  }
  return "tier1_draft_only";
}

function physicalTierFor(tool: ToolRecord): PhysicalTier | undefined {
  return tool.permissionScopes.includes("physical") || tool.type === "physical"
    ? "p5_manual_only_at_machine"
    : undefined;
}

function riskFromScopes(scopes: ToolPermissionScope[]): ToolRiskLevel {
  if (scopes.includes("physical")) return "critical";
  if (scopes.includes("desktop") || scopes.includes("secrets") || scopes.includes("external_messages")) return "critical";
  if (scopes.includes("commands") || scopes.includes("install") || scopes.includes("update") || scopes.includes("filesystem.write")) return "high";
  if (scopes.includes("network") || scopes.includes("browser")) return "medium";
  return "low";
}

function statusMessage(tool: ToolRecord, status: ToolStatus): string | null {
  if (status === "disabled") return `${tool.displayName} is disabled by the Phase 07A tool firewall.`;
  if (status === "not_configured") return tool.notConfiguredReason ?? `${tool.displayName} is not configured.`;
  if (status === "blocked") return `${tool.displayName} was blocked by the Phase 07A tool firewall.`;
  return null;
}

function evaluatePermissions(tool: ToolRecord, requiredScopes: ToolPermissionScope[], action: string): string | null {
  for (const scope of requiredScopes) {
    if (!tool.permissionScopes.includes(scope)) {
      return `Requested scope ${scope} is not declared for ${tool.displayName}.`;
    }
    const foundationScope = toFoundationScope(scope);
    if (!foundationScope) return `Scope ${scope} is manual-only until a dedicated safety layer exists.`;
    const decision = evaluatePermission(foundationScope, action);
    if (!decision.allowed) return decision.reason;
  }
  return null;
}

function approvalIsRequired(tool: ToolRecord, action: string, requiredScopes: ToolPermissionScope[]): boolean {
  if (tool.approvalRequirement !== "none") return true;
  if (DANGEROUS_ACTIONS.has(action.toLowerCase())) return true;
  return requiredScopes.some(scope => DANGEROUS_SCOPES.has(scope));
}

export function evaluateToolCall(input: ToolCallInput): ToolCallResult {
  seedFoundationDefaults();
  const registry = input.registry ?? buildToolRegistry();
  const tool = registry.find(candidate => candidate.id === input.toolId);
  if (!tool) return unregisteredResult(input);

  const requestedScopes = uniqueScopes(input.requestedScopes ?? []);
  const requiredScopes = uniqueScopes([...requestedScopes, ...scopesForAction(input.action)]);
  const sanitizedInput = redactForMissionReplay({
    input: input.input ?? {},
    requestedScopes,
    requiredScopes,
  });

  const auditBase = {
    action: input.action,
    requestedScopes,
    requiredScopes,
    runtimeMode: getCurrentRuntimeMode(),
    dryRun: input.dryRun === true,
    input: (sanitizedInput.value as Record<string, unknown>)["input"],
  };

  const currentMode = getCurrentRuntimeMode();
  if (!tool.runtimeModeCompatibility.includes(currentMode)) {
    const reason = `${tool.displayName} is not allowed in ${currentMode} mode.`;
    const auditId = recordToolAudit("runtime_blocked", tool, "blocked", { ...auditBase, reason }, input.actor);
    publishToolThought("warning", "Tool Runtime Blocked", reason, tool, auditBase);
    return resultFor(tool, input, "blocked", reason, { auditId, redacted: sanitizedInput.redacted });
  }

  const dockerMcpBlock = evaluateDockerMcpFirewall(tool, requiredScopes);
  if (dockerMcpBlock) {
    const auditId = recordToolAudit(dockerMcpBlock.auditAction, tool, "blocked", { ...auditBase, reason: dockerMcpBlock.reason }, input.actor);
    publishToolThought("warning", "Docker MCP Tool Blocked", dockerMcpBlock.reason, tool, auditBase);
    return resultFor(tool, input, dockerMcpBlock.status, dockerMcpBlock.reason, { auditId, redacted: sanitizedInput.redacted });
  }

  const clawGatewayBlock = evaluateClawGatewayFirewall(tool, requiredScopes);
  if (clawGatewayBlock) {
    const auditId = recordToolAudit(clawGatewayBlock.auditAction, tool, "blocked", { ...auditBase, reason: clawGatewayBlock.reason }, input.actor);
    publishToolThought("warning", "OpenClaw/NemoClaw Gateway Blocked", clawGatewayBlock.reason, tool, auditBase);
    return resultFor(tool, input, clawGatewayBlock.status, clawGatewayBlock.reason, { auditId, redacted: sanitizedInput.redacted });
  }

  const browserBlock = evaluateBrowserFirewall(tool, requiredScopes, input.action);
  if (browserBlock) {
    const auditId = recordToolAudit(browserBlock.auditAction, tool, "blocked", { ...auditBase, reason: browserBlock.reason }, input.actor);
    publishToolThought("warning", "Browser Automation Blocked", browserBlock.reason, tool, auditBase);
    return resultFor(tool, input, browserBlock.status, browserBlock.reason, { auditId, redacted: sanitizedInput.redacted });
  }

  const desktopBlock = evaluateDesktopFirewall(tool, requiredScopes, input.action, input.input?.["targetApp"] as string | undefined);
  if (desktopBlock) {
    const auditId = recordToolAudit(desktopBlock.auditAction, tool, "blocked", { ...auditBase, reason: desktopBlock.reason }, input.actor);
    publishToolThought("warning", "Desktop Automation Blocked", desktopBlock.reason, tool, auditBase);
    return resultFor(tool, input, desktopBlock.status, desktopBlock.reason, { auditId, redacted: sanitizedInput.redacted });
  }

  const codingAgentBlock = evaluateCodingAgentFirewall(tool, requiredScopes, input.action, input.input?.["workspacePath"] as string | undefined);
  if (codingAgentBlock) {
    const auditId = recordToolAudit(codingAgentBlock.auditAction, tool, "blocked", { ...auditBase, reason: codingAgentBlock.reason }, input.actor);
    publishToolThought("warning", "Coding Agent Blocked", codingAgentBlock.reason, tool, auditBase);
    return resultFor(tool, input, codingAgentBlock.status, codingAgentBlock.reason, { auditId, redacted: sanitizedInput.redacted });
  }

  if (!tool.enabled) {
    const reason = statusMessage(tool, "disabled")!;
    const auditId = recordToolAudit("disabled_blocked", tool, "blocked", { ...auditBase, reason }, input.actor);
    publishToolThought("warning", "Tool Disabled", reason, tool, auditBase);
    return resultFor(tool, input, "disabled", reason, { auditId, redacted: sanitizedInput.redacted });
  }

  if (tool.configuredStatus !== "configured" || tool.installStatus !== "installed") {
    const reason = statusMessage(tool, "not_configured")!;
    const auditId = recordToolAudit("not_configured_blocked", tool, "blocked", { ...auditBase, reason }, input.actor);
    publishToolThought("warning", "Tool Not Configured", reason, tool, auditBase);
    return resultFor(tool, input, "not_configured", reason, { auditId, redacted: sanitizedInput.redacted });
  }

  if (tool.sandboxMode !== "none" && input.sandboxSatisfied !== true) {
    const reason = `${tool.displayName} requires sandbox/isolation mode ${tool.sandboxMode}.`;
    const auditId = recordToolAudit("sandbox_blocked", tool, "blocked", { ...auditBase, reason }, input.actor);
    publishToolThought("warning", "Tool Sandbox Blocked", reason, tool, auditBase);
    return resultFor(tool, input, "blocked", reason, { auditId, redacted: sanitizedInput.redacted });
  }

  const permissionReason = evaluatePermissions(tool, requiredScopes, input.action);
  if (permissionReason) {
    const auditId = recordToolAudit("permission_blocked", tool, "blocked", { ...auditBase, reason: permissionReason }, input.actor);
    publishToolThought("warning", "Tool Permission Blocked", permissionReason, tool, auditBase);
    return resultFor(tool, input, "blocked", permissionReason, { auditId, redacted: sanitizedInput.redacted });
  }

  if (input.dryRun === true) {
    const reason = `${tool.displayName} dry-run passed policy evaluation; no tool adapter executed.`;
    const auditId = recordToolAudit("dry_run", tool, "success", { ...auditBase, reason }, input.actor);
    publishToolThought("info", "Tool Dry Run", reason, tool, auditBase);
    return resultFor(tool, input, "dry_run", reason, {
      allowed: true,
      blocked: false,
      auditId,
      redacted: sanitizedInput.redacted,
    });
  }

  const needsApproval = approvalIsRequired(tool, input.action, requiredScopes);
  const approvalPayload = approvalPayloadFor(tool, input);
  if (needsApproval) {
    if (!input.approvalId) {
      const riskTier = riskTierFor(tool);
      const payload = riskTier === "tier3_file_modification"
        ? {
          ...approvalPayload,
          diff: "Phase 07A tool firewall proposal only; no filesystem changes are included.",
          rollback: { mode: "not_applied", reason: "No tool adapter executed in Phase 07A." },
        }
        : approvalPayload;
      const approval = createApprovalRequest({
        type: TOOL_APPROVAL_TYPE,
        title: `Approve ${tool.displayName} tool action`,
        summary: `Action ${input.action} requires explicit approval before any adapter can execute.`,
        riskTier,
        physicalTier: physicalTierFor(tool),
        requestedAction: `tool.${tool.id}.${input.action}`,
        payload,
      });
      const auditId = recordToolAudit("approval_required", tool, "blocked", {
        ...auditBase,
        reason: "Approval is required before execution.",
        approvalId: approval.id,
      }, input.actor);
      publishToolThought("warning", "Tool Approval Required", `${tool.displayName} requires approval before ${input.action}.`, tool, {
        ...auditBase,
        approvalId: approval.id,
      });
      return resultFor(tool, input, "approval_required", "Approval is required before executing this tool action.", {
        approvalRequired: true,
        approval,
        auditId,
        redacted: sanitizedInput.redacted,
      });
    }

    const riskTier = riskTierFor(tool);
    const expectedPayload = riskTier === "tier3_file_modification"
      ? {
        ...approvalPayload,
        diff: "Phase 07A tool firewall proposal only; no filesystem changes are included.",
        rollback: { mode: "not_applied", reason: "No tool adapter executed in Phase 07A." },
      }
      : approvalPayload;
    const verification = verifyApprovedRequest(input.approvalId, expectedPayload, TOOL_APPROVAL_TYPE);
    if (!verification.allowed) {
      const status: ToolStatus = verification.approval?.status === "denied" ? "denied" : "approval_required";
      const auditId = recordToolAudit("approval_blocked", tool, "blocked", {
        ...auditBase,
        reason: verification.message,
        approvalId: input.approvalId,
        approvalStatus: verification.approval?.status,
      }, input.actor);
      publishToolThought("warning", "Tool Approval Blocked", verification.message, tool, {
        ...auditBase,
        approvalId: input.approvalId,
        approvalStatus: verification.approval?.status,
      });
      return resultFor(tool, input, status, verification.message, {
        approvalRequired: true,
        approval: verification.approval,
        auditId,
        redacted: sanitizedInput.redacted,
      });
    }
  }

  if (input.executeAdapterAvailable !== true) {
    const reason = `${tool.displayName} passed policy checks, but Phase 07A has no execution adapter configured.`;
    const auditId = recordToolAudit("adapter_not_configured", tool, "blocked", { ...auditBase, reason }, input.actor);
    publishToolThought("warning", "Tool Adapter Not Configured", reason, tool, auditBase);
    return resultFor(tool, input, "not_configured", reason, {
      approvalRequired: needsApproval,
      blocked: true,
      auditId,
      redacted: sanitizedInput.redacted,
    });
  }

  const reason = `${tool.displayName} execution is proposal-only in Phase 07A.`;
  const auditId = recordToolAudit("proposal_only", tool, "blocked", { ...auditBase, reason }, input.actor);
  return resultFor(tool, input, "proposal_only", reason, {
    blocked: true,
    auditId,
    redacted: sanitizedInput.redacted,
  });
}

function pluginScopes(plugin: ToolPluginSource): ToolPermissionScope[] {
  if (plugin.permissions.fileAccess === "read-write") return ["filesystem.read", "filesystem.write"];
  if (plugin.permissions.fileAccess === "read-only") return ["filesystem.read"];
  return [];
}

export function pluginManifestToTool(plugin: ToolPluginSource): ToolRecord {
  const scopes = pluginScopes(plugin);
  const riskLevel = riskFromScopes(scopes);
  const highRiskDefaultDisabled = riskLevel === "high" || riskLevel === "critical";
  return applyToolOverride({
    id: `plugin.${plugin.name}`,
    displayName: plugin.name,
    provider: plugin.author || "local-plugin",
    type: "plugin",
    sourceRef: plugin.manifestPath,
    sourceKind: "plugin_manifest",
    installStatus: "installed",
    configuredStatus: "configured",
    enabled: highRiskDefaultDisabled ? false : plugin.enabled !== false,
    runtimeModeCompatibility: NON_GAMING_RUNTIME_MODES,
    permissionScopes: scopes,
    networkAccess: "none",
    filesystemAccess: plugin.permissions.fileAccess === "read-write"
      ? "write"
      : plugin.permissions.fileAccess === "read-only"
        ? "read"
        : "none",
    commandExecutionRequired: false,
    secretsRequired: false,
    approvalRequirement: scopes.some(scope => DANGEROUS_SCOPES.has(scope)) ? "required" : "none",
    sandboxMode: scopes.includes("filesystem.write") ? "scoped_process" : "none",
    riskLevel,
    auditReplayBehavior: scopes.some(scope => DANGEROUS_SCOPES.has(scope))
      ? "record_decision_and_approval"
      : "record_decision_only",
    capabilities: ["plugin_manifest"],
    actions: ["inspect", "execute"],
    metadata: {
      version: plugin.version,
      description: plugin.description,
      routes: plugin.routes.length,
      pages: plugin.pages.length,
    },
  });
}

function integrationScopes(source: ToolIntegrationSource): ToolPermissionScope[] {
  const scopes: ToolPermissionScope[] = ["commands"];
  if (source.installCmd) scopes.push("install", "filesystem.write");
  if (source.updateCmd) scopes.push("update", "filesystem.write");
  if (source.repo || source.docs || source.healthUrl || source.localPort) scopes.push("network");
  if (source.category === "computer-use") scopes.push("desktop");
  if (/mcp|openapi/i.test(source.category) || /MCP|OpenAPI/i.test(source.name)) scopes.push("network");
  if (/desktop|computer-use|worldgui/i.test(`${source.name} ${source.description}`)) scopes.push("desktop");
  return uniqueScopes(scopes);
}

export function integrationSourceToTool(source: ToolIntegrationSource): ToolRecord {
  const scopes = integrationScopes(source);
  const riskLevel = riskFromScopes(scopes);
  const highRiskDefaultDisabled = riskLevel === "high" || riskLevel === "critical";
  const configuredStatus: ToolConfiguredStatus = source.installed ? "configured" : "not_configured";
  return applyToolOverride({
    id: `integration.${source.id}`,
    displayName: source.name,
    provider: source.installMethod,
    type: source.category === "mcp" ? "mcp" : "integration",
    sourceRef: source.repo || source.docs || source.id,
    sourceKind: "integration_catalog",
    installStatus: source.installed ? "installed" : "not_installed",
    configuredStatus,
    enabled: source.installed && !highRiskDefaultDisabled,
    runtimeModeCompatibility: source.category === "computer-use" || scopes.includes("desktop")
      ? ["Maker", "HomeShop"]
      : NON_GAMING_RUNTIME_MODES,
    permissionScopes: scopes,
    networkAccess: scopes.includes("network") ? "external" : "none",
    filesystemAccess: scopes.includes("filesystem.write") ? "write" : "none",
    commandExecutionRequired: scopes.includes("commands"),
    secretsRequired: false,
    approvalRequirement: "required",
    sandboxMode: "dry_run_only",
    riskLevel,
    auditReplayBehavior: "record_decision_and_approval",
    notConfiguredReason: source.installed
      ? undefined
      : `${source.name} is not installed/configured. Phase 07A can only create a proposal; it will not install or start it.`,
    capabilities: ["integration_catalog", source.installMethod],
    actions: ["inspect", "install", "start", "update"],
    metadata: {
      category: source.category,
      description: source.description,
      docs: source.docs,
      usedFor: source.usedFor,
      installed: source.installed,
      running: source.running,
      version: source.version,
      pinned: source.pinned,
      updateAvailable: source.updateAvailable,
      localPort: source.localPort,
      healthUrl: source.healthUrl,
    },
  });
}

function plannedFoundationTools(): ToolRecord[] {
  const planned: ToolRecord[] = [
    {
      id: "local.diagnostics.readonly",
      displayName: "LOCALAI Read-Only Diagnostics",
      provider: "localai",
      type: "local-script",
      sourceRef: "internal://diagnostics/read-only",
      sourceKind: "phase07a_foundation",
      installStatus: "installed",
      configuredStatus: "configured",
      enabled: true,
      runtimeModeCompatibility: ALL_RUNTIME_MODES,
      permissionScopes: ["filesystem.read"],
      networkAccess: "none",
      filesystemAccess: "read",
      commandExecutionRequired: false,
      secretsRequired: false,
      approvalRequirement: "none",
      sandboxMode: "none",
      riskLevel: "low",
      auditReplayBehavior: "record_decision_only",
      capabilities: ["dry_run", "policy_probe"],
      actions: ["inspect"],
      metadata: { phase: "07A", executor: "not_required_for_dry_run" },
    },
    {
      id: "mcp.docker-gateway",
      displayName: "Docker MCP Gateway",
      provider: "docker",
      type: "mcp",
      sourceRef: "watchlist://docker-mcp-gateway",
      sourceKind: "phase07a_foundation",
      installStatus: "not_installed",
      configuredStatus: "not_configured",
      enabled: false,
      runtimeModeCompatibility: NON_GAMING_RUNTIME_MODES,
      permissionScopes: ["network", "commands", "filesystem.write", "install"],
      networkAccess: "external",
      filesystemAccess: "write",
      commandExecutionRequired: true,
      secretsRequired: false,
      approvalRequirement: "required",
      sandboxMode: "not_configured",
      isolationMode: "docker_mcp_gateway",
      riskLevel: "high",
      auditReplayBehavior: "record_decision_and_approval",
      dockerMcp: {
        isolationMode: "docker_mcp_gateway",
        imageRef: "docker/mcp-gateway:unpinned-proposal",
        imagePinned: false,
        catalogSource: "docker_built_catalog",
        trustStatus: "unpinned",
        signatureStatus: "unknown",
        provenanceStatus: "unknown",
        sbomStatus: "unknown",
        vulnerabilityScanStatus: "unknown",
        containerNetworkMode: "none",
        filesystemMounts: [],
        secretsRequired: false,
        resourceLimits: { ...DEFAULT_DOCKER_MCP_SECURITY.resourceLimits },
        profileId: getDockerMcpProfile().id,
        profileAllowlisted: false,
        explicitlyApprovedSource: true,
        hiddenByDefault: false,
        blockSecrets: true,
        blockNetwork: true,
        deniedEnvVars: [...DEFAULT_DOCKER_MCP_SECURITY.deniedEnvVars],
        exposedEnvVars: [],
        notConfiguredReason: "Docker MCP Gateway is optional and not_configured until a safe profile is approved. No MCP server is installed or started.",
      },
      notConfiguredReason: "Docker MCP Gateway is optional and not_configured until a safe profile is approved. No MCP server is installed or started.",
      capabilities: ["mcp", "proposal_only", "docker_mcp_gateway", "profile_status"],
      actions: ["inspect", "status", "propose_config", "start", "stop"],
      metadata: {
        phase: "07B",
        externalRuntime: true,
        sourceOfTruth: DOCKER_MCP_SOURCE_OF_TRUTH,
        blockSecrets: true,
        blockNetwork: true,
      },
    },
    {
      id: "mcp.official-servers",
      displayName: "Official MCP Servers",
      provider: "mcp",
      type: "mcp",
      sourceRef: "watchlist://modelcontextprotocol/servers",
      sourceKind: "phase07a_foundation",
      installStatus: "not_installed",
      configuredStatus: "not_configured",
      enabled: false,
      runtimeModeCompatibility: NON_GAMING_RUNTIME_MODES,
      permissionScopes: ["network", "commands", "filesystem.write", "install"],
      networkAccess: "external",
      filesystemAccess: "write",
      commandExecutionRequired: true,
      secretsRequired: false,
      approvalRequirement: "required",
      sandboxMode: "not_configured",
      riskLevel: "high",
      auditReplayBehavior: "record_decision_and_approval",
      notConfiguredReason: "MCP servers are not configured in Phase 07A; this record exists for policy gating only.",
      capabilities: ["mcp", "proposal_only"],
      actions: ["inspect", "install", "start"],
      metadata: { phase: "07A", externalRuntime: true },
    },
    {
      id: "physical.manual-actions",
      displayName: "Physical Manual Actions",
      provider: "localai",
      type: "physical",
      sourceRef: "internal://physical-actions",
      sourceKind: "phase07a_foundation",
      installStatus: "unknown",
      configuredStatus: "not_configured",
      enabled: false,
      runtimeModeCompatibility: ["Maker", "HomeShop"],
      permissionScopes: ["physical"],
      networkAccess: "none",
      filesystemAccess: "none",
      commandExecutionRequired: false,
      secretsRequired: false,
      approvalRequirement: "manual_only",
      sandboxMode: "manual_only",
      riskLevel: "critical",
      auditReplayBehavior: "record_decision_and_approval",
      notConfiguredReason: "Physical actions are blocked/manual-only until the physical safety layer exists.",
      capabilities: ["physical_action", "manual_only"],
      actions: ["inspect", "physical_action"],
      metadata: { phase: "07A", physicalSafetyLayerRequired: true },
    },
  ];
  return planned.map(applyToolOverride);
}

export function buildToolRegistry(input: ToolRegistryInput = {}, options: ToolRegistryOptions = {}): ToolRecord[] {
  const dockerMcpProfile = getDockerMcpProfile();
  const clawGatewayProfile = getClawGatewayProfile();
  const browserProfile = getBrowserProfile();
  const desktopProfile = getDesktopProfile();
  const codingProfile = getCodingAgentProfile();
  const records = [
    ...plannedFoundationTools(),
    ...dockerMcpGatewayToolRecords(dockerMcpProfile),
    ...clawGatewayToolRecords(clawGatewayProfile),
    ...playwrightBrowserToolRecords(browserProfile),
    ...desktopAutomationToolRecords(desktopProfile),
    ...codingAgentToolRecords(codingProfile),
    ...(input.plugins ?? []).map(pluginManifestToTool),
    ...(input.integrations ?? []).map(integrationSourceToTool),
  ];
  const seen = new Set<string>();
  return records.filter(record => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    if (record.visibility === "hidden" && options.includeHidden !== true) return false;
    return true;
  }).sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function getToolRegistrySourceOfTruth(): string {
  return SOURCE_OF_TRUTH;
}
