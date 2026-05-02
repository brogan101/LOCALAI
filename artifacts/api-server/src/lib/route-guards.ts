import type { NextFunction, Request, RequestHandler, Response } from "express";
import { loadSettings, type AppSettings } from "./secure-config.js";
import { thoughtLog } from "./thought-log.js";
import { evaluatePermission, recordPermissionDecision, type PermissionScope } from "./platform-foundation.js";

type PermissionName =
  | "allowAgentExec"
  | "allowAgentEdits"
  | "allowAgentSelfHeal"
  | "allowAgentRefactor";

type GuardAction = string | ((request: Request) => string);

const PERMISSION_MESSAGES: Record<PermissionName, string> = {
  allowAgentExec:     "Command execution and desktop automation are disabled. Enable Agent execution in Settings -> Agent Permissions.",
  allowAgentEdits:    "Agent file edits are disabled. Enable Agent edits in Settings -> Agent Permissions.",
  allowAgentSelfHeal: "Agent self-heal is disabled. Enable Agent self-heal in Settings -> Agent Permissions.",
  allowAgentRefactor: "Agent refactors are disabled. Enable Agent refactors in Settings -> Agent Permissions.",
};

function loadTestPermissionOverrides(): Partial<Pick<AppSettings, PermissionName>> | null {
  if (!process.env.LOCALAI_TEST_AGENT_PERMISSIONS) return null;
  try {
    const parsed = JSON.parse(process.env.LOCALAI_TEST_AGENT_PERMISSIONS) as Partial<Record<PermissionName, unknown>>;
    return {
      allowAgentExec: typeof parsed.allowAgentExec === "boolean" ? parsed.allowAgentExec : undefined,
      allowAgentEdits: typeof parsed.allowAgentEdits === "boolean" ? parsed.allowAgentEdits : undefined,
      allowAgentSelfHeal: typeof parsed.allowAgentSelfHeal === "boolean" ? parsed.allowAgentSelfHeal : undefined,
      allowAgentRefactor: typeof parsed.allowAgentRefactor === "boolean" ? parsed.allowAgentRefactor : undefined,
    };
  } catch {
    return null;
  }
}

async function loadPermissionSettings(): Promise<Pick<AppSettings, PermissionName>> {
  const settings = await loadSettings();
  const testOverrides = loadTestPermissionOverrides();
  return { ...settings, ...testOverrides };
}

function scopedPermissionForLegacy(permission: PermissionName): PermissionScope {
  switch (permission) {
    case "allowAgentExec": return "command.execute";
    case "allowAgentEdits": return "file.write";
    case "allowAgentSelfHeal": return "command.execute";
    case "allowAgentRefactor": return "file.write";
  }
}

export async function requirePermission(
  res: Response,
  permission: PermissionName,
  action: string,
): Promise<boolean> {
  const settings = await loadPermissionSettings();
  if (settings[permission]) {
    const scopedDecision = evaluatePermission(scopedPermissionForLegacy(permission), action);
    recordPermissionDecision(scopedDecision);
    if (scopedDecision.allowed) return true;
    res.status(403).json({
      success: false,
      blocked: true,
      permission,
      scope: scopedDecision.scope,
      message: scopedDecision.reason,
    });
    return false;
  }

  const message = PERMISSION_MESSAGES[permission];
  recordPermissionDecision({
    allowed: false,
    scope: scopedPermissionForLegacy(permission),
    action,
    reason: message,
  });
  thoughtLog.publish({
    level: "warning",
    category: "security",
    title: "Privileged Action Blocked",
    message: `${action}: ${message}`,
    metadata: { permission, action },
  });
  res.status(403).json({ success: false, blocked: true, permission, message });
  return false;
}

function resolveGuardAction(action: GuardAction, request: Request): string {
  return typeof action === "function" ? action(request) : action;
}

export function permissionGuard(permission: PermissionName, action: GuardAction): RequestHandler {
  return async (request, response, next) => {
    if (!await requirePermission(response, permission, resolveGuardAction(action, request))) return;
    next();
  };
}

export function agentExecGuard(action: GuardAction): RequestHandler {
  return permissionGuard("allowAgentExec", action);
}

export function agentEditsGuard(action: GuardAction): RequestHandler {
  return permissionGuard("allowAgentEdits", action);
}

export function agentSelfHealGuard(action: GuardAction): RequestHandler {
  return permissionGuard("allowAgentSelfHeal", action);
}

export function agentRefactorGuard(action: GuardAction): RequestHandler {
  return permissionGuard("allowAgentRefactor", action);
}

export async function requireAgentExec(res: Response, action: string): Promise<boolean> {
  return requirePermission(res, "allowAgentExec", action);
}

export async function requireAgentEdits(res: Response, action: string): Promise<boolean> {
  return requirePermission(res, "allowAgentEdits", action);
}

export async function requireAgentSelfHeal(res: Response, action: string): Promise<boolean> {
  return requirePermission(res, "allowAgentSelfHeal", action);
}

export async function requireAgentRefactor(res: Response, action: string): Promise<boolean> {
  return requirePermission(res, "allowAgentRefactor", action);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TRUSTED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function normalizeHostname(value: string): string {
  return value.replace(/^\[|\]$/g, "").replace(/^::ffff:/, "").toLowerCase();
}

function isTrustedHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return TRUSTED_HOSTS.has(normalized) || normalized.startsWith("100.");
}

export function isTrustedBrowserOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (origin === "null") return false;
  try {
    const parsed = new URL(origin);
    return ["http:", "https:"].includes(parsed.protocol) && isTrustedHostname(parsed.hostname);
  } catch {
    return false;
  }
}

export function localBrowserRequestGuard(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) {
    next();
    return;
  }

  const secFetchSite = request.header("sec-fetch-site")?.toLowerCase();
  if (secFetchSite === "cross-site") {
    response.status(403).json({
      success: false,
      blocked: true,
      message: "Cross-site browser requests are blocked for local API mutations.",
    });
    return;
  }

  if (!isTrustedBrowserOrigin(request.header("origin"))) {
    response.status(403).json({
      success: false,
      blocked: true,
      message: "Untrusted browser origin blocked for local API mutation.",
    });
    return;
  }

  next();
}
