/**
 * CODING AGENT SAFETY LAYER — Phase 10
 *
 * Approval-gated code modification with diff/proposal-first behaviour.
 *
 * Hard limits (cannot be enabled by profile or approval):
 *   selfModificationAllowed    = false  (permanent)
 *   directMainApplyAllowed     = false  (permanent)
 *   destructiveCommandsAllowed = false  (permanent)
 *
 * Optional runtime adapters (Aider / OpenHands / Roo / Cline / Continue)
 * default to not_configured and must not break the built-in refactor path.
 *
 * All file modification actions require tier3_file_modification approval
 * before execution. Plans and diff previews are read-only and free.
 */

import { sqlite } from "../db/database.js";
import {
  recordAuditEvent,
  seedFoundationDefaults,
  upsertPluginState,
} from "./platform-foundation.js";
import { createApprovalRequest } from "./approval-queue.js";
import { redactForMissionReplay } from "./mission-replay.js";
import type { RuntimeMode } from "./runtime-mode.js";
import type {
  ToolPermissionScope,
  ToolRecord,
  ToolRiskLevel,
  ToolStatus,
} from "./tool-registry.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CODING_AGENT_PROFILE_STATE_ID = "coding-agent:profile";

export const CODING_AGENT_SOURCE_OF_TRUTH =
  "Phase 10 coding-agent.ts: approval-gated chat-driven program modification. " +
  "Hard limits: selfModificationAllowed=false, directMainApplyAllowed=false, " +
  "destructiveCommandsAllowed=false — permanent, not patchable by profile or approval. " +
  "Optional adapters (Aider/OpenHands/Roo/Cline/Continue) return not_configured until " +
  "explicitly installed and configured. All file edits require tier3_file_modification " +
  "approval before execution. Diff/proposal-first enforced. No secrets in audit/replay logs.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CodingAgentActionTier =
  | "read_only"
  | "plan_only"
  | "diff_preview"
  | "file_modification"
  | "destructive_modification"
  | "shell_command"
  | "direct_main_apply"
  | "self_modification";

export type OptionalRuntimeAdapter =
  | "aider"
  | "openhands"
  | "roo"
  | "cline"
  | "continue";

export interface CodingAgentProfile {
  id:                        string;
  name:                      string;
  enabled:                   boolean;
  approved:                  boolean;
  allowedWorkspaceRoots:     string[];
  requireApprovalForEdits:   true;
  selfModificationAllowed:   false;
  directMainApplyAllowed:    false;
  destructiveCommandsAllowed: false;
  maxFilesPerJob:            number;
  activeAdapter:             OptionalRuntimeAdapter | "built_in";
  modeCompatibility:         RuntimeMode[];
  updatedAt:                 string;
}

export interface CodingAgentToolMetadata {
  actionTier:                CodingAgentActionTier;
  hardBlocked:               boolean;
  hardBlockReason?:          string;
  requireApprovalForEdits:   true;
  selfModificationAllowed:   false;
  directMainApplyAllowed:    false;
  destructiveCommandsAllowed: false;
  workspaceRootEnforced:     boolean;
  adapterBacked:             boolean;
  adapterName:               string;
  notConfiguredReason?:      string;
}

export interface OptionalAdapterStatus {
  adapter:           OptionalRuntimeAdapter;
  status:            "not_configured" | "configured" | "unavailable";
  unavailableReason?: string;
}

export interface CodingAgentStatus {
  status:                    "available" | "not_configured" | "degraded";
  builtInAvailable:          boolean;
  activeAdapter:             string;
  adapterStatuses:           OptionalAdapterStatus[];
  workspaceRootsConfigured:  number;
  approvalGateActive:        true;
  unavailableReason?:        string;
  checkedAt:                 string;
  dryRun:                    boolean;
  profile:                   CodingAgentProfile;
}

export interface CodingTaskProposal {
  status:                    "proposed";
  dryRun:                    true;
  source:                    string;
  approvalRequired:          true;
  actionTier:                CodingAgentActionTier;
  workspacePath:             string;
  request:                   string;
  targetFiles:               string[];
  targetFilesCount:          number;
  diffPreviewAvailable:      boolean;
  selfModificationAllowed:   false;
  directMainApplyAllowed:    false;
  destructiveCommandsAllowed: false;
  workspaceRootEnforced:     boolean;
  hardBlocked:               boolean;
  hardBlockReason?:          string;
  redactedPayload:           Record<string, unknown>;
  approval?:                 unknown;
  proposedAt:                string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const CODING_COMPATIBLE_MODES: RuntimeMode[] = [
  "Lightweight",
  "Coding",
  "Business",
  "Maker",
  "HomeLab",
  "HomeShop",
];

function nowIso(): string {
  return new Date().toISOString();
}

function defaultCodingAgentProfile(): CodingAgentProfile {
  return {
    id:                        CODING_AGENT_PROFILE_STATE_ID,
    name:                      "Default Coding Agent Profile",
    enabled:                   true,
    approved:                  false,
    allowedWorkspaceRoots:     [],
    requireApprovalForEdits:   true,
    selfModificationAllowed:   false,
    directMainApplyAllowed:    false,
    destructiveCommandsAllowed: false,
    maxFilesPerJob:            20,
    activeAdapter:             "built_in",
    modeCompatibility:         CODING_COMPATIBLE_MODES,
    updatedAt:                 nowIso(),
  };
}

// ---------------------------------------------------------------------------
// Profile persistence
// ---------------------------------------------------------------------------

function parseJson(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function getCodingAgentProfile(): CodingAgentProfile {
  seedFoundationDefaults();
  const row = sqlite
    .prepare("SELECT state_json FROM plugin_state WHERE id = ?")
    .get(CODING_AGENT_PROFILE_STATE_ID) as { state_json?: string } | undefined;
  if (!row?.state_json) return defaultCodingAgentProfile();
  const parsed = parseJson(row.state_json);
  return {
    ...defaultCodingAgentProfile(),
    ...(parsed as Partial<CodingAgentProfile>),
    // Hard limits — always reset to literal false; never trust stored value
    requireApprovalForEdits:   true,
    selfModificationAllowed:   false,
    directMainApplyAllowed:    false,
    destructiveCommandsAllowed: false,
  };
}

export function saveCodingAgentProfile(
  patch: Partial<Omit<CodingAgentProfile,
    | "requireApprovalForEdits"
    | "selfModificationAllowed"
    | "directMainApplyAllowed"
    | "destructiveCommandsAllowed"
  >>,
  actor = "localai",
): CodingAgentProfile {
  const current = getCodingAgentProfile();
  const next: CodingAgentProfile = {
    ...current,
    ...patch,
    requireApprovalForEdits:   true,
    selfModificationAllowed:   false,
    directMainApplyAllowed:    false,
    destructiveCommandsAllowed: false,
    updatedAt:                 nowIso(),
  };
  const redacted = redactForMissionReplay(next as unknown as Record<string, unknown>);
  upsertPluginState(CODING_AGENT_PROFILE_STATE_ID, {
    enabled:    next.enabled,
    installed:  true,
    permissions: {
      allowedWorkspaceRoots:    next.allowedWorkspaceRoots,
      requireApprovalForEdits:  true,
      selfModificationAllowed:  false,
      directMainApplyAllowed:   false,
    },
    ...(redacted.value as Record<string, unknown>),
  });
  recordAuditEvent({
    eventType: "coding_agent",
    action:    "profile_update",
    actor,
    target:    next.id,
    result:    "success",
    metadata:  redacted.value as Record<string, unknown>,
  });
  return next;
}

// ---------------------------------------------------------------------------
// Optional adapter status
// ---------------------------------------------------------------------------

const OPTIONAL_ADAPTERS: OptionalRuntimeAdapter[] = [
  "aider", "openhands", "roo", "cline", "continue",
];

export function getAdapterStatuses(): OptionalAdapterStatus[] {
  return OPTIONAL_ADAPTERS.map(adapter => ({
    adapter,
    status:            "not_configured" as const,
    unavailableReason: `${adapter} adapter is not installed or configured. Install and configure it to enable.`,
  }));
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export function getCodingAgentStatus(live = false): CodingAgentStatus {
  void live; // future: check adapter process health
  const profile = getCodingAgentProfile();
  return {
    status:                   profile.enabled ? "available" : "not_configured",
    builtInAvailable:         true,
    activeAdapter:            profile.activeAdapter,
    adapterStatuses:          getAdapterStatuses(),
    workspaceRootsConfigured: profile.allowedWorkspaceRoots.length,
    approvalGateActive:       true,
    checkedAt:                nowIso(),
    dryRun:                   false,
    profile,
  };
}

// ---------------------------------------------------------------------------
// Workspace path validation
// ---------------------------------------------------------------------------

export function validateWorkspacePath(
  workspacePath: string,
  profile: CodingAgentProfile,
): { allowed: boolean; reason: string } {
  if (!workspacePath.trim()) {
    return { allowed: false, reason: "workspacePath must not be empty" };
  }
  if (!profile.allowedWorkspaceRoots.length) {
    // No allowlist configured — allow all paths (first-run / dev mode)
    return { allowed: true, reason: "No workspace root allowlist configured; all paths are accepted." };
  }
  const normalised = workspacePath.replace(/\\/g, "/").toLowerCase();
  const hit = profile.allowedWorkspaceRoots.some(root => {
    const r = root.replace(/\\/g, "/").toLowerCase();
    return normalised.startsWith(r);
  });
  if (!hit) {
    return {
      allowed: false,
      reason:  `workspacePath "${workspacePath}" is outside every configured allowedWorkspaceRoot.`,
    };
  }
  return { allowed: true, reason: "Within an allowed workspace root." };
}

// ---------------------------------------------------------------------------
// Action tier classification
// ---------------------------------------------------------------------------

export function classifyCodingAction(action: string): CodingAgentActionTier {
  const a = action.toLowerCase();
  if (a.includes("self_modif") || a.includes("self_edit") || a.includes("selfmodif")) return "self_modification";
  if (a.includes("direct_main") || a.includes("apply_main") || a.includes("push_main"))  return "direct_main_apply";
  if (a.includes("shell") || a.includes("exec_command") || a.includes("run_script"))      return "shell_command";
  if (a.includes("destructive") || a.includes("delete_file") || a.includes("force_overwrite")) return "destructive_modification";
  if (a.includes("apply_diff") || a.includes("file_modification") || (a.includes("write") && !a.includes("overwrite"))) return "file_modification";
  if (a.includes("diff") || a.includes("preview"))                                        return "diff_preview";
  if (a.includes("plan") || a.includes("analyze") || a.includes("impact"))                return "plan_only";
  return "read_only";
}

// ---------------------------------------------------------------------------
// Firewall hook (called from tool-registry.ts evaluateToolCall chain)
// ---------------------------------------------------------------------------

export function evaluateCodingAgentFirewall(
  tool: ToolRecord,
  _requiredScopes: ToolPermissionScope[],
  action: string,
  _workspacePath?: string,
): null | { status: ToolStatus; reason: string; auditAction: string } {
  const meta = tool.codingAgent;
  if (!meta) return null;

  if (meta.hardBlocked) {
    return {
      status:      "blocked",
      reason:      meta.hardBlockReason ?? "Hard-blocked coding agent action.",
      auditAction: "coding_agent_hard_blocked",
    };
  }

  if (meta.actionTier === "self_modification") {
    return {
      status:      "blocked",
      reason:      "Self-modification is permanently hard-blocked and cannot be enabled by profile or approval.",
      auditAction: "coding_agent_self_modification_blocked",
    };
  }

  if (meta.actionTier === "direct_main_apply") {
    return {
      status:      "blocked",
      reason:      "Direct apply to main branch is permanently hard-blocked.",
      auditAction: "coding_agent_direct_main_blocked",
    };
  }

  if (meta.actionTier === "destructive_modification") {
    return {
      status:      "blocked",
      reason:      "Destructive file modification is blocked by coding agent safety policy.",
      auditAction: "coding_agent_destructive_blocked",
    };
  }

  if (meta.actionTier === "shell_command") {
    return {
      status:      "blocked",
      reason:      "Direct shell command execution is blocked by coding agent safety policy.",
      auditAction: "coding_agent_shell_blocked",
    };
  }

  void action; // future: richer action-based checks
  return null;
}

// ---------------------------------------------------------------------------
// Tool records
// ---------------------------------------------------------------------------

interface CodingToolSpec {
  id:           string;
  displayName:  string;
  actionTier:   CodingAgentActionTier;
  scopes:       ToolPermissionScope[];
  capabilities: string[];
  actions:      string[];
  riskLevel:    ToolRiskLevel;
  fsAccess:     "none" | "read" | "write" | "scoped";
  hardBlocked:  boolean;
  hardBlockReason?: string;
  approvalReq:  "none" | "required" | "manual_only";
  sandboxMode:  "none" | "dry_run_only" | "manual_only" | "not_configured";
}

const CODING_TOOL_SPECS: CodingToolSpec[] = [
  {
    id:           "coding.list-jobs",
    displayName:  "List Coding Jobs",
    actionTier:   "read_only",
    scopes:       [],
    capabilities: ["job-status", "replay-support"],
    actions:      ["list", "status"],
    riskLevel:    "low",
    fsAccess:     "none",
    hardBlocked:  false,
    approvalReq:  "none",
    sandboxMode:  "none",
  },
  {
    id:           "coding.plan-refactor",
    displayName:  "Plan Refactor",
    actionTier:   "plan_only",
    scopes:       ["filesystem.read"],
    capabilities: ["analyze-files", "impact-scoring", "plan-generation"],
    actions:      ["plan", "analyze", "impact"],
    riskLevel:    "low",
    fsAccess:     "read",
    hardBlocked:  false,
    approvalReq:  "none",
    sandboxMode:  "none",
  },
  {
    id:           "coding.diff-preview",
    displayName:  "Diff Preview",
    actionTier:   "diff_preview",
    scopes:       ["filesystem.read"],
    capabilities: ["diff-generation", "preview-changes"],
    actions:      ["diff", "preview", "propose"],
    riskLevel:    "low",
    fsAccess:     "read",
    hardBlocked:  false,
    approvalReq:  "none",
    sandboxMode:  "none",
  },
  {
    id:           "coding.execute-refactor",
    displayName:  "Execute Refactor (Approval Required)",
    actionTier:   "file_modification",
    scopes:       ["filesystem.read", "filesystem.write"],
    capabilities: ["apply-diffs", "file-modification", "test-after-edit"],
    actions:      ["write", "modify", "apply_diff", "file_modification"],
    riskLevel:    "medium",
    fsAccess:     "write",
    hardBlocked:  false,
    approvalReq:  "required",
    sandboxMode:  "dry_run_only",
  },
  {
    id:              "coding.self-modification",
    displayName:     "Self-Modification (Hard Blocked)",
    actionTier:      "self_modification",
    scopes:          ["filesystem.write"],
    capabilities:    [],
    actions:         ["self_modification", "self_edit"],
    riskLevel:       "critical",
    fsAccess:        "write",
    hardBlocked:     true,
    hardBlockReason: "Self-modification is permanently hard-blocked and cannot be enabled by profile or approval.",
    approvalReq:     "manual_only",
    sandboxMode:     "manual_only",
  },
  {
    id:              "coding.direct-main-apply",
    displayName:     "Direct Main Apply (Hard Blocked)",
    actionTier:      "direct_main_apply",
    scopes:          ["filesystem.write"],
    capabilities:    [],
    actions:         ["direct_main_apply", "apply_main"],
    riskLevel:       "critical",
    fsAccess:        "write",
    hardBlocked:     true,
    hardBlockReason: "Direct apply to main branch is permanently hard-blocked.",
    approvalReq:     "manual_only",
    sandboxMode:     "manual_only",
  },
];

export function codingAgentToolRecords(profile: CodingAgentProfile): ToolRecord[] {
  return CODING_TOOL_SPECS.map((spec): ToolRecord => ({
    id:                     spec.id,
    displayName:            spec.displayName,
    provider:               "LOCALAI Built-in",
    type:                   "integration",
    sourceRef:              "lib/coding-agent.ts",
    sourceKind:             "phase10_coding_agent",
    installStatus:          "installed",
    configuredStatus:       spec.hardBlocked ? "not_configured" : "configured",
    enabled:                spec.hardBlocked ? false : profile.enabled,
    runtimeModeCompatibility: CODING_COMPATIBLE_MODES,
    permissionScopes:       spec.scopes,
    networkAccess:          "none",
    filesystemAccess:       spec.fsAccess,
    commandExecutionRequired: false,
    secretsRequired:        false,
    approvalRequirement:    spec.approvalReq,
    sandboxMode:            spec.sandboxMode,
    riskLevel:              spec.riskLevel,
    auditReplayBehavior:    "record_decision_and_approval",
    capabilities:           spec.capabilities,
    actions:                spec.actions,
    notConfiguredReason:    spec.hardBlocked ? spec.hardBlockReason : undefined,
    metadata:               {} as Record<string, unknown>,
    codingAgent: {
      actionTier:                spec.actionTier,
      hardBlocked:               spec.hardBlocked,
      hardBlockReason:           spec.hardBlockReason,
      requireApprovalForEdits:   true,
      selfModificationAllowed:   false,
      directMainApplyAllowed:    false,
      destructiveCommandsAllowed: false,
      workspaceRootEnforced:     profile.allowedWorkspaceRoots.length > 0,
      adapterBacked:             profile.activeAdapter !== "built_in",
      adapterName:               profile.activeAdapter,
      notConfiguredReason:       spec.hardBlocked ? spec.hardBlockReason : undefined,
    },
  }));
}

// ---------------------------------------------------------------------------
// Propose coding task  (creates approval request; does NOT execute)
// ---------------------------------------------------------------------------

export async function proposeCodingTask(input: {
  request:      string;
  workspacePath: string;
  targetFiles?: string[];
}): Promise<{ success: boolean; proposal: CodingTaskProposal }> {
  const profile   = getCodingAgentProfile();
  const pathCheck = validateWorkspacePath(input.workspacePath, profile);
  const blocked   = !pathCheck.allowed;

  const redactedPayload = redactForMissionReplay({
    request:           input.request,
    workspacePath:     input.workspacePath,
    targetFilesCount:  input.targetFiles?.length ?? 0,
  }).value as Record<string, unknown>;

  let approval: unknown;
  if (!blocked && profile.enabled) {
    approval = await createApprovalRequest({
      type:            "coding_agent_task",
      title:           `Code modification: ${input.request.slice(0, 80)}`,
      summary:
        `Approve code modification in ${input.workspacePath}. ` +
        `${input.targetFiles?.length ?? 0} target file(s). ` +
        `Request: ${input.request.slice(0, 200)}`,
      riskTier:        "tier3_file_modification",
      requestedAction: "execute_refactor",
      payload: {
        ...redactedPayload,
        // Tier 3 requires diff + rollback metadata
        diff:     "Coding agent proposal only — no filesystem changes until execution approval is granted.",
        rollback: { mode: "not_applied", reason: "No files modified in proposal phase." },
      },
    });
  }

  recordAuditEvent({
    eventType: "coding_agent",
    action:    "task_proposed",
    actor:     "system",
    target:    "coding-agent:task",
    result:    blocked ? "blocked" : "success",
    metadata:  redactedPayload,
  });

  const proposal: CodingTaskProposal = {
    status:                    "proposed",
    dryRun:                    true,
    source:                    CODING_AGENT_SOURCE_OF_TRUTH,
    approvalRequired:          true,
    actionTier:                "file_modification",
    workspacePath:             input.workspacePath,
    request:                   input.request,
    targetFiles:               input.targetFiles ?? [],
    targetFilesCount:          input.targetFiles?.length ?? 0,
    diffPreviewAvailable:      true,
    selfModificationAllowed:   false,
    directMainApplyAllowed:    false,
    destructiveCommandsAllowed: false,
    workspaceRootEnforced:     profile.allowedWorkspaceRoots.length > 0,
    hardBlocked:               blocked,
    hardBlockReason:           blocked ? pathCheck.reason : undefined,
    redactedPayload,
    approval,
    proposedAt:                nowIso(),
  };

  return { success: !blocked, proposal };
}
