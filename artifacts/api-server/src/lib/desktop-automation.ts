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

export type DesktopActionTier =
  | "read_only"
  | "list_windows"
  | "screenshot"
  | "screenshot_sensitive"
  | "focus"
  | "click"
  | "type"
  | "keys"
  | "form_fill"
  | "credential_entry"
  | "app_launch"
  | "app_close"
  | "destructive"
  | "macro"
  | "keylogger";

export type DesktopAppPolicy = "allow" | "block" | "require_approval";

export interface DesktopAutomationProfile {
  id: string;
  name: string;
  enabled: boolean;
  approved: boolean;
  allowedApps: string[];
  blockedApps: string[];
  requireApprovalApps: string[];
  modeCompatibility: RuntimeMode[];
  credentialEntryAllowed: false;
  keyloggerAllowed: false;
  screenshotSensitiveAllowed: false;
  maxMacroSteps: number;
  updatedAt: string;
}

export interface DesktopAutomationToolMetadata {
  actionTier: DesktopActionTier;
  hardBlocked: boolean;
  hardBlockReason?: string;
  credentialEntryAllowed: false;
  keyloggerAllowed: false;
  screenshotSensitiveAllowed: false;
  appPolicyApplied: boolean;
  sessionIsolated: boolean;
  screenshotRedacted: boolean;
  profileId: string;
  worldguiBacked: boolean;
  notConfiguredReason?: string;
}

export interface DesktopAutomationStatus {
  status: "available" | "not_configured" | "degraded";
  worldguiInstalled: boolean;
  worldguiRunning: boolean;
  windowsHost: boolean;
  unavailableReason?: string;
  checkedAt: string;
  dryRun: boolean;
  profile: DesktopAutomationProfile;
}

export interface DesktopActionProposal {
  status: "proposed";
  dryRun: true;
  source: string;
  actionTier: DesktopActionTier;
  targetApp?: string;
  appPolicyResult: DesktopAppPolicy;
  approvalRequired: boolean;
  hardBlocked: boolean;
  hardBlockReason?: string;
  notes: string[];
}

export const DESKTOP_AUTOMATION_PROFILE_STATE_ID = "desktop-automation:profile";
export const DESKTOP_AUTOMATION_SOURCE_OF_TRUTH =
  "Phase 09B desktop automation session profile stored in plugin_state; desktop actions evaluated by the Phase 07A tool-registry.ts firewall with hard limits on credential entry, keylogging, and sensitive-window screenshot capture. Execution backed by existing routes/worldgui.ts and lib/windows-system.ts physical routes.";

const DESKTOP_COMPATIBLE_MODES: RuntimeMode[] = [
  "Coding",
  "Maker",
  "HomeShop",
  "HomeLab",
];

const HARD_BLOCKED_TIERS = new Set<DesktopActionTier>([
  "credential_entry",
  "keylogger",
  "screenshot_sensitive",
]);

const APPROVAL_REQUIRED_TIERS = new Set<DesktopActionTier>([
  "click",
  "type",
  "keys",
  "form_fill",
  "app_launch",
  "app_close",
  "destructive",
  "macro",
]);

const EXCLUDED_APP_PATTERNS = [
  "keepass",
  "bitwarden",
  "1password",
  "lastpass",
  "dashlane",
  "credential",
  "vault",
  "bank",
  "paypal",
  "venmo",
  "windows security",
  "defender",
  "antivirus",
  "avast",
  "malwarebytes",
  "task manager",
  "registry editor",
  "regedit",
  "event viewer",
  "group policy",
  "local security",
  "certificate manager",
];

function nowIso(): string {
  return new Date().toISOString();
}

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

function uniq<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function normalizeProfile(input: Record<string, unknown> = {}): DesktopAutomationProfile {
  const allowedApps = Array.isArray(input["allowedApps"])
    ? input["allowedApps"].filter((v): v is string => typeof v === "string")
    : [];
  const blockedApps = Array.isArray(input["blockedApps"])
    ? input["blockedApps"].filter((v): v is string => typeof v === "string")
    : [...EXCLUDED_APP_PATTERNS];
  const requireApprovalApps = Array.isArray(input["requireApprovalApps"])
    ? input["requireApprovalApps"].filter((v): v is string => typeof v === "string")
    : [];
  const modeCompatibility = Array.isArray(input["modeCompatibility"])
    ? input["modeCompatibility"].filter((v): v is RuntimeMode => typeof v === "string")
    : DESKTOP_COMPATIBLE_MODES;
  return {
    id: typeof input["id"] === "string" ? input["id"] : "localai-desktop-safe",
    name: typeof input["name"] === "string" ? input["name"] : "LOCALAI Safe Desktop Profile",
    enabled: input["enabled"] === true,
    approved: input["approved"] === true,
    allowedApps: uniq(allowedApps),
    blockedApps: uniq(blockedApps),
    requireApprovalApps: uniq(requireApprovalApps),
    modeCompatibility: uniq(modeCompatibility),
    credentialEntryAllowed: false,
    keyloggerAllowed: false,
    screenshotSensitiveAllowed: false,
    maxMacroSteps: typeof input["maxMacroSteps"] === "number" ? input["maxMacroSteps"] : 10,
    updatedAt: typeof input["updatedAt"] === "string" ? input["updatedAt"] : nowIso(),
  };
}

export function getDesktopProfile(): DesktopAutomationProfile {
  seedFoundationDefaults();
  const row = sqlite
    .prepare("SELECT state_json FROM plugin_state WHERE id = ?")
    .get(DESKTOP_AUTOMATION_PROFILE_STATE_ID) as { state_json?: string } | undefined;
  return normalizeProfile(parseJson(row?.state_json));
}

export function saveDesktopProfile(
  patch: Partial<DesktopAutomationProfile>,
  actor = "localai",
): DesktopAutomationProfile {
  const current = getDesktopProfile();
  const next = normalizeProfile({
    ...current,
    ...patch,
    updatedAt: nowIso(),
  });
  const redacted = redactForMissionReplay(next);
  upsertPluginState(DESKTOP_AUTOMATION_PROFILE_STATE_ID, {
    enabled: next.enabled,
    installed: false,
    permissions: {
      allowedApps: next.allowedApps,
      blockedApps: next.blockedApps,
      credentialEntryAllowed: false,
      keyloggerAllowed: false,
      screenshotSensitiveAllowed: false,
    },
    ...(redacted.value as Record<string, unknown>),
  });
  recordAuditEvent({
    eventType: "desktop_automation",
    action: "profile_update",
    actor,
    target: next.id,
    result: "success",
    metadata: redacted.value as Record<string, unknown>,
  });
  return next;
}

export function classifyDesktopAction(action: string): DesktopActionTier {
  const a = action.toLowerCase();
  if (a.includes("credential") || a.includes("password_entry") || a.includes("api_key_type")) {
    return "credential_entry";
  }
  if (a.includes("keylog") || a.includes("key_log") || a.includes("capture_keys")) {
    return "keylogger";
  }
  if (a.includes("screenshot_sensitive") || a.includes("capture_sensitive") || a.includes("screen_sensitive")) {
    return "screenshot_sensitive";
  }
  if (a.includes("macro")) {
    return "macro";
  }
  if (a.includes("destroy") || a.includes("delete") || a.includes("uninstall") || a.includes("format")) {
    return "destructive";
  }
  if (a.includes("app_close") || a.includes("close_app") || a.includes("kill_app") || a.includes("terminate")) {
    return "app_close";
  }
  if (a.includes("app_launch") || a.includes("launch_app") || a.includes("open_app") || a.includes("start_app")) {
    return "app_launch";
  }
  if (a.includes("form_fill") || a.includes("fill_form")) {
    return "form_fill";
  }
  if (a.includes("type") || a.includes("text_input") || a.includes("type_text")) {
    return "type";
  }
  if (a.includes("keys") || a.includes("keystroke") || a.includes("sendkeys")) {
    return "keys";
  }
  if (a.includes("click") || a.includes("mouse_click") || a.includes("left_click") || a.includes("right_click")) {
    return "click";
  }
  if (a.includes("focus") || a.includes("activate_window") || a.includes("bring_to_front")) {
    return "focus";
  }
  if (a.includes("screenshot") || a.includes("capture_screen") || a.includes("snapshot")) {
    return "screenshot";
  }
  if (a.includes("list_windows") || a.includes("enum_windows") || a.includes("get_windows")) {
    return "list_windows";
  }
  return "read_only";
}

export function checkAppExclusionPolicy(
  appName: string,
  profile: DesktopAutomationProfile,
): DesktopAppPolicy {
  if (!appName || appName === "") return "allow";
  const lower = appName.toLowerCase();
  for (const pattern of profile.blockedApps) {
    if (lower.includes(pattern.toLowerCase())) return "block";
  }
  for (const pattern of profile.requireApprovalApps) {
    if (lower.includes(pattern.toLowerCase())) return "require_approval";
  }
  if (profile.allowedApps.length > 0) {
    const anyMatch = profile.allowedApps.some(a => lower.includes(a.toLowerCase()));
    if (!anyMatch) return "require_approval";
  }
  return "allow";
}

interface DesktopToolSpec {
  id: string;
  displayName: string;
  actionTier: DesktopActionTier;
  permissionScopes: ToolPermissionScope[];
  capabilities: string[];
  actions: string[];
  riskLevel: ToolRiskLevel;
  worldguiBacked: boolean;
}

const DESKTOP_TOOL_SPECS: DesktopToolSpec[] = [
  {
    id: "desktop.worldgui.screenshot",
    displayName: "Desktop Screenshot",
    actionTier: "screenshot",
    permissionScopes: ["desktop"],
    capabilities: ["desktop_control", "screenshot", "proposal_only"],
    actions: ["inspect", "propose_screenshot"],
    riskLevel: "medium",
    worldguiBacked: true,
  },
  {
    id: "desktop.worldgui.list-windows",
    displayName: "Desktop List Windows",
    actionTier: "list_windows",
    permissionScopes: ["desktop"],
    capabilities: ["desktop_control", "list_windows", "proposal_only"],
    actions: ["inspect", "propose_list_windows"],
    riskLevel: "low",
    worldguiBacked: true,
  },
  {
    id: "desktop.worldgui.focus",
    displayName: "Desktop Focus Window",
    actionTier: "focus",
    permissionScopes: ["desktop"],
    capabilities: ["desktop_control", "focus", "proposal_only"],
    actions: ["inspect", "propose_focus"],
    riskLevel: "medium",
    worldguiBacked: true,
  },
  {
    id: "desktop.worldgui.click",
    displayName: "Desktop Click",
    actionTier: "click",
    permissionScopes: ["desktop", "physical"],
    capabilities: ["desktop_control", "click", "proposal_only"],
    actions: ["inspect", "propose_click"],
    riskLevel: "high",
    worldguiBacked: true,
  },
  {
    id: "desktop.worldgui.type",
    displayName: "Desktop Type Text",
    actionTier: "type",
    permissionScopes: ["desktop", "physical"],
    capabilities: ["desktop_control", "type", "proposal_only"],
    actions: ["inspect", "propose_type"],
    riskLevel: "high",
    worldguiBacked: true,
  },
  {
    id: "desktop.worldgui.keys",
    displayName: "Desktop Send Keys",
    actionTier: "keys",
    permissionScopes: ["desktop", "physical"],
    capabilities: ["desktop_control", "keys", "proposal_only"],
    actions: ["inspect", "propose_keys"],
    riskLevel: "high",
    worldguiBacked: true,
  },
  {
    id: "desktop.worldgui.macro",
    displayName: "Desktop Macro",
    actionTier: "macro",
    permissionScopes: ["desktop", "physical", "commands"],
    capabilities: ["desktop_control", "macro", "proposal_only"],
    actions: ["inspect", "list_macros", "propose_run_macro"],
    riskLevel: "critical",
    worldguiBacked: true,
  },
];

function metadataForDesktopSpec(spec: DesktopToolSpec, profile: DesktopAutomationProfile): DesktopAutomationToolMetadata {
  const hardBlocked = HARD_BLOCKED_TIERS.has(spec.actionTier);
  return {
    actionTier: spec.actionTier,
    hardBlocked,
    hardBlockReason: hardBlocked
      ? `${spec.actionTier} is permanently blocked — credential entry, keylogging, and sensitive-window screenshot capture are hard-disabled.`
      : undefined,
    credentialEntryAllowed: false,
    keyloggerAllowed: false,
    screenshotSensitiveAllowed: false,
    appPolicyApplied: true,
    sessionIsolated: true,
    screenshotRedacted: true,
    profileId: profile.id,
    worldguiBacked: spec.worldguiBacked,
    notConfiguredReason: profile.enabled && profile.approved
      ? "WorldGUI must be installed and running before this desktop action can execute."
      : "Desktop automation tools are not_configured until the desktop automation profile is enabled and approved.",
  };
}

export function desktopAutomationToolRecords(profile: DesktopAutomationProfile = getDesktopProfile()): ToolRecord[] {
  return DESKTOP_TOOL_SPECS.map((spec) => {
    const desktopAutomation = metadataForDesktopSpec(spec, profile);
    const hardBlocked = HARD_BLOCKED_TIERS.has(spec.actionTier);
    const approvalRequired = APPROVAL_REQUIRED_TIERS.has(spec.actionTier);
    return {
      id: spec.id,
      displayName: spec.displayName,
      provider: "worldgui",
      type: "desktop" as const,
      sourceRef: `worldgui://${spec.actionTier}`,
      sourceKind: "phase09b_desktop_automation" as const,
      installStatus: "not_installed" as const,
      configuredStatus: "not_configured" as const,
      enabled: false,
      visibility: "visible" as const,
      runtimeModeCompatibility: profile.modeCompatibility.filter(
        mode => mode !== "Gaming" && mode !== "EmergencyStop",
      ),
      permissionScopes: spec.permissionScopes,
      networkAccess: "none" as const,
      filesystemAccess: "none" as const,
      commandExecutionRequired: spec.permissionScopes.includes("commands"),
      secretsRequired: false,
      approvalRequirement: hardBlocked
        ? "manual_only" as const
        : approvalRequired
          ? "required" as const
          : "none" as const,
      sandboxMode: "desktop_dry_run" as const,
      desktopAutomation,
      riskLevel: spec.riskLevel,
      auditReplayBehavior: "record_decision_and_approval" as const,
      notConfiguredReason: desktopAutomation.notConfiguredReason,
      capabilities: spec.capabilities,
      actions: spec.actions,
      metadata: {
        phase: "09B",
        sourceOfTruth: DESKTOP_AUTOMATION_SOURCE_OF_TRUTH,
        actionTier: spec.actionTier,
        hardBlocked,
        credentialEntryAllowed: false,
        keyloggerAllowed: false,
        screenshotSensitiveAllowed: false,
        worldguiBacked: spec.worldguiBacked,
      },
    };
  });
}

export function evaluateDesktopFirewall(
  tool: ToolRecord,
  _requiredScopes: ToolPermissionScope[],
  action?: string,
  targetApp?: string,
): { status: ToolStatus; reason: string; auditAction: string } | null {
  if (tool.sourceKind !== "phase09b_desktop_automation") return null;
  const metadata = tool.desktopAutomation;
  if (!metadata) {
    return {
      status: "blocked",
      reason: "Desktop automation tool is missing required Phase 09B policy metadata.",
      auditAction: "desktop_metadata_blocked",
    };
  }
  if (metadata.hardBlocked) {
    return {
      status: "blocked",
      reason: metadata.hardBlockReason ?? "This desktop action tier is permanently hard-blocked.",
      auditAction: "desktop_hard_blocked",
    };
  }
  if (metadata.credentialEntryAllowed !== false) {
    return {
      status: "blocked",
      reason: "Credential entry is permanently blocked in desktop automation.",
      auditAction: "desktop_credential_blocked",
    };
  }
  const actionTier = action ? classifyDesktopAction(action) : metadata.actionTier;
  if (HARD_BLOCKED_TIERS.has(actionTier)) {
    return {
      status: "blocked",
      reason: `Desktop action '${action ?? actionTier}' resolves to hard-blocked tier: ${actionTier}.`,
      auditAction: "desktop_action_hard_blocked",
    };
  }
  if (targetApp) {
    const profile = getDesktopProfile();
    const appPolicy = checkAppExclusionPolicy(targetApp, profile);
    if (appPolicy === "block") {
      return {
        status: "blocked",
        reason: `Target application '${targetApp.substring(0, 40)}' is in the desktop automation blocked-app list.`,
        auditAction: "desktop_app_blocked",
      };
    }
  }
  return null;
}

export async function getDesktopAutomationStatus(options: { dryRun?: boolean } = {}): Promise<DesktopAutomationStatus> {
  const profile = getDesktopProfile();
  const checkedAt = nowIso();
  return {
    status: "not_configured",
    worldguiInstalled: false,
    worldguiRunning: false,
    windowsHost: process.platform === "win32",
    unavailableReason: options.dryRun !== false
      ? "Dry-run status requested; no WorldGUI probe was executed."
      : "WorldGUI is optional and not detected. Install worldgui (pip install worldgui) and configure a desktop profile to enable.",
    checkedAt,
    dryRun: options.dryRun !== false,
    profile,
  };
}

export function proposeDesktopAction(options: {
  action?: string;
  targetApp?: string;
  profile?: DesktopAutomationProfile;
} = {}): DesktopActionProposal {
  const profile = options.profile ?? getDesktopProfile();
  const action = options.action ?? "list_windows";
  const actionTier = classifyDesktopAction(action);
  const hardBlocked = HARD_BLOCKED_TIERS.has(actionTier);
  const approvalRequired = hardBlocked || APPROVAL_REQUIRED_TIERS.has(actionTier);
  const appPolicy = options.targetApp
    ? checkAppExclusionPolicy(options.targetApp, profile)
    : "allow";
  const notes: string[] = [
    "Proposal only: no desktop action was executed, no window was focused, no input was sent, and no WorldGUI command was issued.",
    "Credential entry, keylogging, and sensitive-window screenshot capture are hard-blocked and cannot be enabled.",
    "Screenshot data and window titles are redacted before appearing in audit or mission replay logs.",
  ];
  if (hardBlocked) notes.push(`Action tier '${actionTier}' is permanently blocked and cannot be approved.`);
  if (approvalRequired && !hardBlocked) notes.push("This action tier requires explicit approval before execution.");
  if (appPolicy === "block") notes.push(`Target application is in the blocked list and cannot be automated.`);
  if (appPolicy === "require_approval") notes.push("Target application requires explicit approval before automation.");
  return {
    status: "proposed",
    dryRun: true,
    source: DESKTOP_AUTOMATION_SOURCE_OF_TRUTH,
    actionTier,
    targetApp: options.targetApp ? "[redacted-for-proposal]" : undefined,
    appPolicyResult: appPolicy,
    approvalRequired,
    hardBlocked,
    hardBlockReason: hardBlocked ? `${actionTier} is permanently blocked.` : undefined,
    notes,
  };
}
