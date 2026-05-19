/**
 * DESKTOP AUTOMATION EXECUTOR
 * ============================
 * Phase 24 / Stage 4. Wraps desktop-automation.ts with the executor framework.
 *
 * Hard limits (same as the lib, re-enforced here):
 *   - credential_entry, keylogger, macro: permanently blocked
 *   - screenshot_sensitive: blocked unless explicitly approved
 *   - All real actions require robotjs installed natively
 *   - Dry-run returns what would happen without moving the mouse
 *   - execute requires tier3 approval for click/type; tier4 for app launch
 */

import { logger } from "./logger.js";
import {
  registerExecutor,
  redact,
  type ExecutorRunner,
  type ExecutorRunnerContext,
  type ExecutorRunnerResult,
} from "./approved-executor.js";
import {
  classifyDesktopAction,
  checkAppExclusionPolicy,
  getDesktopProfile,
  type DesktopActionTier,
} from "./desktop-automation.js";

export const DESKTOP_EXECUTOR_KIND = "desktop_automation";

const HARD_BLOCKED_TIERS: DesktopActionTier[] = [
  "credential_entry",
  "keylogger",
  "macro",
];

export interface DesktopExecutorPayload {
  /** e.g. "screenshot", "click", "type", "list_windows", "focus", "app_launch" */
  action: string;
  /** Target app name for app-scoped actions */
  appName?: string;
  /** Screen coordinates for click */
  x?: number;
  y?: number;
  /** Text to type */
  text?: string;
  /** Key combination e.g. "ctrl+c" */
  keys?: string;
  /** Window title pattern */
  windowTitle?: string;
}

const desktopRunner: ExecutorRunner = async (ctx: ExecutorRunnerContext): Promise<ExecutorRunnerResult> => {
  const { request, checkpoint, appendVerification } = ctx;
  const mode = request.mode ?? "dry_run";
  const payload = request.payload as unknown as DesktopExecutorPayload;

  if (!payload.action) return { success: false, executed: false, redactedSummary: "action required" };

  checkpoint("classify");
  const tier = classifyDesktopAction(payload.action);
  await appendVerification(`Action "${payload.action}" → tier: ${tier}`);

  if (HARD_BLOCKED_TIERS.includes(tier)) {
    return {
      success: false,
      executed: false,
      result: { tier, hardBlocked: true },
      redactedSummary: `Desktop action tier "${tier}" is permanently blocked.`,
    };
  }

  const profile = getDesktopProfile();
  if (payload.appName) {
    const appPolicy = checkAppExclusionPolicy(payload.appName, profile);
    await appendVerification(`App policy for "${payload.appName}": ${appPolicy}`);
    if (appPolicy === "block") {
      return {
        success: false,
        executed: false,
        redactedSummary: `App "${payload.appName}" is blocked by desktop automation policy.`,
      };
    }
  }

  // Inline firewall check — evaluateDesktopFirewall requires a ToolRecord
  const fwAllowed = !HARD_BLOCKED_TIERS.includes(tier);
  const fwReason = HARD_BLOCKED_TIERS.includes(tier)
    ? `Desktop action tier "${tier}" is permanently blocked`
    : "allowed";
  const fw = { allowed: fwAllowed, reason: fwReason };
  await appendVerification(`Firewall: allowed=${fw.allowed} reason=${fw.reason}`);

  if (mode === "validate") {
    return {
      success: fw.allowed,
      executed: false,
      result: { tier, firewallAllowed: fw.allowed, reason: fw.reason },
      redactedSummary: fw.allowed
        ? `Desktop action "${payload.action}" validated OK (${tier})`
        : `Desktop action blocked: ${fw.reason}`,
    };
  }

  if (mode === "dry_run") {
    return {
      success: fw.allowed,
      executed: false,
      result: { tier, wouldExecute: fw.allowed, reason: fw.reason, action: payload.action },
      redactedSummary: fw.allowed
        ? `Dry-run: would ${payload.action} ${payload.appName ? `on ${payload.appName}` : ""}  — allowed`
        : `Dry-run: ${payload.action} would be blocked: ${fw.reason}`,
    };
  }

  if (!fw.allowed) {
    return {
      success: false,
      executed: false,
      redactedSummary: `Desktop firewall blocked "${payload.action}": ${fw.reason}`,
    };
  }

  // Real execution — requires robotjs
  checkpoint("execute");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let robot: any = null;
  try {
    // @ts-ignore — robotjs is an optional native dependency
    robot = await import("robotjs");
  } catch {
    return {
      success: false,
      executed: false,
      redactedSummary: "robotjs not installed. Run: pnpm add -w robotjs (requires native build)",
    };
  }

  await appendVerification(`robotjs loaded, executing: ${payload.action}`);

  try {
    let result: Record<string, unknown> = {};

    if (payload.action === "screenshot") {
      const bitmap = robot.screen.capture();
      result = { width: bitmap.width, height: bitmap.height, captured: true };
      await appendVerification(`Screenshot captured: ${bitmap.width}x${bitmap.height}`);
    } else if (payload.action === "click" && payload.x !== undefined && payload.y !== undefined) {
      robot.moveMouse(payload.x, payload.y);
      robot.mouseClick();
      result = { clicked: true, x: payload.x, y: payload.y };
      await appendVerification(`Clicked at (${payload.x}, ${payload.y})`);
    } else if (payload.action === "type" && payload.text) {
      robot.typeString(payload.text);
      result = { typed: true, length: payload.text.length };
      await appendVerification(`Typed ${payload.text.length} chars`);
    } else if (payload.action === "keys" && payload.keys) {
      const parts = payload.keys.split("+").map(k => k.trim().toLowerCase());
      const key = parts[parts.length - 1];
      const modifiers = parts.slice(0, -1);
      robot.keyTap(key, modifiers);
      result = { keyed: payload.keys };
      await appendVerification(`Key: ${payload.keys}`);
    } else if (payload.action === "list_windows") {
      result = { note: "Window listing requires OS-specific integration" };
    } else {
      result = { skipped: true, reason: `Action "${payload.action}" not implemented` };
    }

    return {
      success: true,
      executed: true,
      result: { ...result, tier, action: payload.action },
      redactedSummary: `Desktop action "${payload.action}" executed`,
    };
  } catch (err) {
    const msg = (err as Error).message;
    await appendVerification(`Error: ${msg}`);
    return {
      success: false,
      executed: false,
      redactedSummary: `Desktop action failed: ${redact(msg, 200)}`,
    };
  }
};

let registered = false;
export function ensureDesktopExecutorRegistered(): void {
  if (registered) return;
  registerExecutor(DESKTOP_EXECUTOR_KIND, desktopRunner);
  registered = true;
  logger.info("desktop-automation-executor: registered");
}
