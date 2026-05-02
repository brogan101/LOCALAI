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

export type BrowserActionTier =
  | "read_only"
  | "navigate"
  | "screenshot"
  | "form_fill"
  | "credential_entry"
  | "login"
  | "purchase"
  | "form_submit"
  | "post_message"
  | "download"
  | "destructive"
  | "anti_bot_evasion"
  | "cookie_capture";

export type BrowserDomainPolicy = "allow" | "block" | "require_approval";

export interface BrowserDomainRule {
  pattern: string;
  policy: BrowserDomainPolicy;
  reason: string;
}

export interface BrowserSessionProfile {
  id: string;
  name: string;
  enabled: boolean;
  approved: boolean;
  allowedDomains: string[];
  blockedDomains: string[];
  requireApprovalDomains: string[];
  modeCompatibility: RuntimeMode[];
  credentialEntryAllowed: false;
  antiBoEvasionAllowed: false;
  cookieStorageAllowed: false;
  maxConcurrentSessions: number;
  sessionTimeoutSeconds: number;
  updatedAt: string;
}

export interface PlaywrightBrowserToolMetadata {
  actionTier: BrowserActionTier;
  hardBlocked: boolean;
  hardBlockReason?: string;
  credentialEntryAllowed: false;
  antiBoEvasionAllowed: false;
  cookieStorageAllowed: false;
  domainPolicyApplied: boolean;
  domainAllowed: boolean;
  screenshotRedacted: boolean;
  sessionIsolated: boolean;
  profileId: string;
  notConfiguredReason?: string;
}

export interface PlaywrightMcpStatus {
  status: "available" | "not_configured" | "degraded";
  playwrightInstalled: boolean;
  mcpServerReachable: boolean;
  sessionActive: boolean;
  unavailableReason?: string;
  checkedAt: string;
  dryRun: boolean;
  profile: BrowserSessionProfile;
}

export interface BrowserActionProposal {
  status: "proposed";
  dryRun: true;
  source: string;
  actionTier: BrowserActionTier;
  targetUrl?: string;
  domainPolicyResult: BrowserDomainPolicy;
  approvalRequired: boolean;
  hardBlocked: boolean;
  hardBlockReason?: string;
  notes: string[];
}

export const PLAYWRIGHT_BROWSER_PROFILE_STATE_ID = "playwright-browser:profile";
export const PLAYWRIGHT_BROWSER_SOURCE_OF_TRUTH =
  "Phase 09A Playwright browser session profile stored in plugin_state; browser actions evaluated by the Phase 07A tool-registry.ts firewall with hard limits on credential entry, anti-bot evasion, and cookie capture.";

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

const BROWSER_COMPATIBLE_MODES: RuntimeMode[] = [
  "Coding",
  "Business",
  "HomeLab",
];

const HARD_BLOCKED_TIERS = new Set<BrowserActionTier>([
  "credential_entry",
  "anti_bot_evasion",
  "cookie_capture",
]);

const APPROVAL_REQUIRED_TIERS = new Set<BrowserActionTier>([
  "login",
  "purchase",
  "form_submit",
  "post_message",
  "download",
  "destructive",
]);

const BLOCKED_DOMAIN_PATTERNS = [
  "bank",
  "paypal",
  "stripe",
  "venmo",
  "coinbase",
  "crypto",
  "wallet",
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

function normalizeProfile(input: Record<string, unknown> = {}): BrowserSessionProfile {
  const allowedDomains = Array.isArray(input["allowedDomains"])
    ? input["allowedDomains"].filter((v): v is string => typeof v === "string")
    : [];
  const blockedDomains = Array.isArray(input["blockedDomains"])
    ? input["blockedDomains"].filter((v): v is string => typeof v === "string")
    : [...BLOCKED_DOMAIN_PATTERNS];
  const requireApprovalDomains = Array.isArray(input["requireApprovalDomains"])
    ? input["requireApprovalDomains"].filter((v): v is string => typeof v === "string")
    : [];
  const modeCompatibility = Array.isArray(input["modeCompatibility"])
    ? input["modeCompatibility"].filter((v): v is RuntimeMode => typeof v === "string")
    : BROWSER_COMPATIBLE_MODES;
  return {
    id: typeof input["id"] === "string" ? input["id"] : "localai-browser-safe",
    name: typeof input["name"] === "string" ? input["name"] : "LOCALAI Safe Browser Profile",
    enabled: input["enabled"] === true,
    approved: input["approved"] === true,
    allowedDomains: uniq(allowedDomains),
    blockedDomains: uniq(blockedDomains),
    requireApprovalDomains: uniq(requireApprovalDomains),
    modeCompatibility: uniq(modeCompatibility),
    credentialEntryAllowed: false,
    antiBoEvasionAllowed: false,
    cookieStorageAllowed: false,
    maxConcurrentSessions: typeof input["maxConcurrentSessions"] === "number" ? input["maxConcurrentSessions"] : 1,
    sessionTimeoutSeconds: typeof input["sessionTimeoutSeconds"] === "number" ? input["sessionTimeoutSeconds"] : 300,
    updatedAt: typeof input["updatedAt"] === "string" ? input["updatedAt"] : nowIso(),
  };
}

export function getBrowserProfile(): BrowserSessionProfile {
  seedFoundationDefaults();
  const row = sqlite
    .prepare("SELECT state_json FROM plugin_state WHERE id = ?")
    .get(PLAYWRIGHT_BROWSER_PROFILE_STATE_ID) as { state_json?: string } | undefined;
  return normalizeProfile(parseJson(row?.state_json));
}

export function saveBrowserProfile(
  patch: Partial<BrowserSessionProfile>,
  actor = "localai",
): BrowserSessionProfile {
  const current = getBrowserProfile();
  const next = normalizeProfile({
    ...current,
    ...patch,
    updatedAt: nowIso(),
  });
  const redacted = redactForMissionReplay(next);
  upsertPluginState(PLAYWRIGHT_BROWSER_PROFILE_STATE_ID, {
    enabled: next.enabled,
    installed: false,
    permissions: {
      allowedDomains: next.allowedDomains,
      blockedDomains: next.blockedDomains,
      credentialEntryAllowed: false,
      antiBoEvasionAllowed: false,
      cookieStorageAllowed: false,
    },
    ...(redacted.value as Record<string, unknown>),
  });
  recordAuditEvent({
    eventType: "browser_automation",
    action: "profile_update",
    actor,
    target: next.id,
    result: "success",
    metadata: redacted.value as Record<string, unknown>,
  });
  return next;
}

export function classifyBrowserAction(action: string): BrowserActionTier {
  const a = action.toLowerCase();
  if (a.includes("credential") || a.includes("password") || a.includes("api_key") || a.includes("token_entry")) {
    return "credential_entry";
  }
  if (a.includes("anti_bot") || a.includes("captcha_bypass") || a.includes("fingerprint_spoof")) {
    return "anti_bot_evasion";
  }
  if (a.includes("cookie_dump") || a.includes("session_export") || a.includes("cookie_capture")) {
    return "cookie_capture";
  }
  if (a.includes("login") || a.includes("signin") || a.includes("sign_in") || a.includes("authenticate")) {
    return "login";
  }
  if (a.includes("purchase") || a.includes("checkout") || a.includes("buy") || a.includes("payment")) {
    return "purchase";
  }
  if (a.includes("submit") || a.includes("form_submit") || a.includes("post_form")) {
    return "form_submit";
  }
  if (a.includes("message") || a.includes("send") || a.includes("post_message") || a.includes("tweet") || a.includes("comment")) {
    return "post_message";
  }
  if (a.includes("download") || a.includes("save_file") || a.includes("export_data")) {
    return "download";
  }
  if (a.includes("delete") || a.includes("destroy") || a.includes("remove") || a.includes("drop")) {
    return "destructive";
  }
  if (a.includes("fill") || a.includes("type") || a.includes("input") || a.includes("form_fill")) {
    return "form_fill";
  }
  if (a.includes("screenshot") || a.includes("capture") || a.includes("snapshot")) {
    return "screenshot";
  }
  if (a.includes("navigate") || a.includes("goto") || a.includes("open_url") || a.includes("visit")) {
    return "navigate";
  }
  return "read_only";
}

export function checkDomainPolicy(url: string, profile: BrowserSessionProfile): BrowserDomainPolicy {
  if (!url || url === "") return "allow";
  const lower = url.toLowerCase();
  for (const pattern of profile.blockedDomains) {
    if (lower.includes(pattern.toLowerCase())) return "block";
  }
  for (const pattern of profile.requireApprovalDomains) {
    if (lower.includes(pattern.toLowerCase())) return "require_approval";
  }
  if (profile.allowedDomains.length > 0) {
    const anyMatch = profile.allowedDomains.some(d => lower.includes(d.toLowerCase()));
    if (!anyMatch) return "require_approval";
  }
  return "allow";
}

interface BrowserToolSpec {
  id: string;
  displayName: string;
  actionTier: BrowserActionTier;
  permissionScopes: ToolPermissionScope[];
  capabilities: string[];
  actions: string[];
  riskLevel: ToolRiskLevel;
}

const BROWSER_TOOL_SPECS: BrowserToolSpec[] = [
  {
    id: "browser.playwright-mcp.navigate",
    displayName: "Browser Navigate",
    actionTier: "navigate",
    permissionScopes: ["browser", "network"],
    capabilities: ["browser_control", "navigate", "proposal_only"],
    actions: ["inspect", "propose_navigate"],
    riskLevel: "medium",
  },
  {
    id: "browser.playwright-mcp.screenshot",
    displayName: "Browser Screenshot",
    actionTier: "screenshot",
    permissionScopes: ["browser"],
    capabilities: ["browser_control", "screenshot", "proposal_only"],
    actions: ["inspect", "propose_screenshot"],
    riskLevel: "low",
  },
  {
    id: "browser.playwright-mcp.form-fill",
    displayName: "Browser Form Fill",
    actionTier: "form_fill",
    permissionScopes: ["browser", "network"],
    capabilities: ["browser_control", "form_fill", "proposal_only"],
    actions: ["inspect", "propose_form_fill"],
    riskLevel: "medium",
  },
  {
    id: "browser.playwright-mcp.form-submit",
    displayName: "Browser Form Submit",
    actionTier: "form_submit",
    permissionScopes: ["browser", "network", "external_messages"],
    capabilities: ["browser_control", "form_submit", "proposal_only"],
    actions: ["inspect", "propose_form_submit"],
    riskLevel: "high",
  },
  {
    id: "browser.playwright-mcp.download",
    displayName: "Browser Download",
    actionTier: "download",
    permissionScopes: ["browser", "network", "filesystem.write"],
    capabilities: ["browser_control", "download", "proposal_only"],
    actions: ["inspect", "propose_download"],
    riskLevel: "high",
  },
];

function metadataForBrowserSpec(spec: BrowserToolSpec, profile: BrowserSessionProfile): PlaywrightBrowserToolMetadata {
  const hardBlocked = HARD_BLOCKED_TIERS.has(spec.actionTier);
  return {
    actionTier: spec.actionTier,
    hardBlocked,
    hardBlockReason: hardBlocked
      ? `${spec.actionTier} is permanently blocked — credential entry, anti-bot evasion, and cookie capture are hard-disabled.`
      : undefined,
    credentialEntryAllowed: false,
    antiBoEvasionAllowed: false,
    cookieStorageAllowed: false,
    domainPolicyApplied: true,
    domainAllowed: true,
    screenshotRedacted: true,
    sessionIsolated: true,
    profileId: profile.id,
    notConfiguredReason: profile.enabled && profile.approved
      ? "Playwright MCP must be installed and configured before this tool can run."
      : "Browser automation tools are not_configured until the Playwright MCP profile is enabled and approved.",
  };
}

export function playwrightBrowserToolRecords(profile: BrowserSessionProfile = getBrowserProfile()): ToolRecord[] {
  return BROWSER_TOOL_SPECS.map((spec) => {
    const browserAutomation = metadataForBrowserSpec(spec, profile);
    const hardBlocked = HARD_BLOCKED_TIERS.has(spec.actionTier);
    const approvalTier = APPROVAL_REQUIRED_TIERS.has(spec.actionTier);
    return {
      id: spec.id,
      displayName: spec.displayName,
      provider: "playwright-mcp",
      type: "browser" as const,
      sourceRef: `playwright-mcp://${spec.actionTier}`,
      sourceKind: "phase09a_browser_automation" as const,
      installStatus: "not_installed" as const,
      configuredStatus: "not_configured" as const,
      enabled: false,
      visibility: "visible" as const,
      runtimeModeCompatibility: profile.modeCompatibility.filter(
        mode => mode !== "Gaming" && mode !== "EmergencyStop",
      ),
      permissionScopes: spec.permissionScopes,
      networkAccess: spec.permissionScopes.includes("network") ? "external" as const : "none" as const,
      filesystemAccess: spec.permissionScopes.includes("filesystem.write") ? "write" as const : "none" as const,
      commandExecutionRequired: false,
      secretsRequired: false,
      approvalRequirement: hardBlocked ? "manual_only" as const : approvalTier ? "required" as const : "required" as const,
      sandboxMode: "browser_dry_run" as const,
      browserAutomation,
      riskLevel: spec.riskLevel,
      auditReplayBehavior: "record_decision_and_approval" as const,
      notConfiguredReason: browserAutomation.notConfiguredReason,
      capabilities: spec.capabilities,
      actions: spec.actions,
      metadata: {
        phase: "09A",
        sourceOfTruth: PLAYWRIGHT_BROWSER_SOURCE_OF_TRUTH,
        actionTier: spec.actionTier,
        hardBlocked,
        credentialEntryAllowed: false,
        antiBoEvasionAllowed: false,
        cookieStorageAllowed: false,
      },
    };
  });
}

export function evaluateBrowserFirewall(
  tool: ToolRecord,
  _requiredScopes: ToolPermissionScope[],
  action?: string,
): { status: ToolStatus; reason: string; auditAction: string } | null {
  if (tool.sourceKind !== "phase09a_browser_automation") return null;
  const metadata = tool.browserAutomation;
  if (!metadata) {
    return {
      status: "blocked",
      reason: "Browser automation tool is missing required Phase 09A policy metadata.",
      auditAction: "browser_metadata_blocked",
    };
  }
  if (metadata.hardBlocked) {
    return {
      status: "blocked",
      reason: metadata.hardBlockReason ?? "This browser action tier is permanently hard-blocked.",
      auditAction: "browser_hard_blocked",
    };
  }
  if (metadata.credentialEntryAllowed !== false) {
    return {
      status: "blocked",
      reason: "Credential entry is permanently blocked in browser automation.",
      auditAction: "browser_credential_blocked",
    };
  }
  const actionTier = action ? classifyBrowserAction(action) : metadata.actionTier;
  if (HARD_BLOCKED_TIERS.has(actionTier)) {
    return {
      status: "blocked",
      reason: `Browser action '${action ?? actionTier}' resolves to hard-blocked tier: ${actionTier}.`,
      auditAction: "browser_action_hard_blocked",
    };
  }
  return null;
}

export async function getPlaywrightMcpStatus(options: { dryRun?: boolean } = {}): Promise<PlaywrightMcpStatus> {
  const profile = getBrowserProfile();
  const checkedAt = nowIso();
  return {
    status: "not_configured",
    playwrightInstalled: false,
    mcpServerReachable: false,
    sessionActive: false,
    unavailableReason: options.dryRun !== false
      ? "Dry-run status requested; no Playwright MCP check was executed."
      : "Playwright MCP is optional and not installed. Install @playwright/mcp and configure a browser profile to enable.",
    checkedAt,
    dryRun: options.dryRun !== false,
    profile,
  };
}

export function proposeBrowserAction(options: {
  action?: string;
  targetUrl?: string;
  profile?: BrowserSessionProfile;
} = {}): BrowserActionProposal {
  const profile = options.profile ?? getBrowserProfile();
  const action = options.action ?? "navigate";
  const actionTier = classifyBrowserAction(action);
  const hardBlocked = HARD_BLOCKED_TIERS.has(actionTier);
  const approvalRequired = hardBlocked || APPROVAL_REQUIRED_TIERS.has(actionTier);
  const domainPolicy = options.targetUrl
    ? checkDomainPolicy(options.targetUrl, profile)
    : "allow";
  const notes: string[] = [
    "Proposal only: no browser was launched, no page was navigated, and no Playwright MCP command was executed.",
    "Credential entry, anti-bot evasion, and cookie capture are hard-blocked and cannot be enabled.",
    "Screenshot data is redacted before appearing in audit or mission replay logs.",
  ];
  if (hardBlocked) notes.push(`Action tier '${actionTier}' is permanently blocked and cannot be approved.`);
  if (approvalRequired && !hardBlocked) notes.push("This action tier requires explicit approval before execution.");
  if (domainPolicy === "block") notes.push(`Target domain is in the blocked list and cannot be navigated.`);
  if (domainPolicy === "require_approval") notes.push("Target domain requires explicit domain approval before navigation.");
  return {
    status: "proposed",
    dryRun: true,
    source: PLAYWRIGHT_BROWSER_SOURCE_OF_TRUTH,
    actionTier,
    targetUrl: options.targetUrl ? "[redacted-for-proposal]" : undefined,
    domainPolicyResult: domainPolicy,
    approvalRequired,
    hardBlocked,
    hardBlockReason: hardBlocked
      ? `${actionTier} is permanently blocked.`
      : undefined,
    notes,
  };
}
