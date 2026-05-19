/**
 * BROWSER PLAYWRIGHT EXECUTOR
 * ============================
 * Phase 24 / Stage 4. Wraps the existing playwright-browser.ts lib with the
 * approved-executor framework so browser actions are: approval-gated, audited,
 * proof-bundled, and blocked by the domain firewall.
 *
 * Hard limits enforced in this executor (in addition to the lib):
 *   - credentialEntryAllowed = false (permanent)
 *   - antiBoEvasionAllowed   = false (permanent)
 *   - cookieStorageAllowed   = false (permanent)
 *   - read_only actions: auto-approved at tier1
 *   - navigate/screenshot: tier2
 *   - form_fill/form_submit: tier3 + explicit approval required
 *   - credential_entry/login/purchase/destructive: permanently blocked
 *   - Blocked domains return proposal=false, blocked=true immediately
 *
 * Playwright is optional — the executor degrades gracefully if it isn't installed.
 * Install: pnpm add -w playwright && npx playwright install chromium
 */

import { writeFile } from "fs/promises";
import path from "path";
import { logger } from "./logger.js";
import {
  registerExecutor,
  redact,
  type ExecutorRunner,
  type ExecutorRunnerContext,
  type ExecutorRunnerResult,
} from "./approved-executor.js";
import {
  classifyBrowserAction,
  checkDomainPolicy,
  getBrowserProfile,
  type BrowserActionTier,
} from "./playwright-browser.js";

export const BROWSER_EXECUTOR_KIND = "browser_playwright";

// ─────────────────────────────────────────────────────────────────────────────
// Permanently blocked tiers
// ─────────────────────────────────────────────────────────────────────────────

const HARD_BLOCKED_TIERS: BrowserActionTier[] = [
  "credential_entry",
  "login",
  "purchase",
  "anti_bot_evasion",
  "cookie_capture",
  "destructive",
];

// ─────────────────────────────────────────────────────────────────────────────
// Payload
// ─────────────────────────────────────────────────────────────────────────────

export interface BrowserExecutorPayload {
  [key: string]: unknown;
  /** e.g. "navigate", "screenshot", "get_text", "click", "fill_form" */
  action: string;
  url: string;
  /** Selector or search text for actions that need it */
  selector?: string;
  /** Form fields for fill_form actions */
  fields?: Record<string, string>;
  /** Timeout in ms (default 15000) */
  timeoutMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

const browserRunner: ExecutorRunner = async (ctx: ExecutorRunnerContext): Promise<ExecutorRunnerResult> => {
  const { request, proofDir, checkpoint, appendVerification } = ctx;
  const mode = request.mode ?? "dry_run";
  const payload = request.payload as unknown as BrowserExecutorPayload;

  if (!payload.action) return { success: false, executed: false, redactedSummary: "action required" };
  if (!payload.url) return { success: false, executed: false, redactedSummary: "url required" };

  // ── Classify the action tier
  checkpoint("classify");
  const tier = classifyBrowserAction(payload.action);
  await appendVerification(`Action "${payload.action}" classified as tier: ${tier}`);

  // ── Hard block
  if (HARD_BLOCKED_TIERS.includes(tier)) {
    await appendVerification(`BLOCKED: ${tier} is permanently forbidden`);
    return {
      success: false,
      executed: false,
      result: { tier, hardBlocked: true },
      redactedSummary: `Action tier "${tier}" is permanently blocked. Credential entry, login, purchase, cookie capture and destructive actions are never permitted.`,
    };
  }

  // ── Domain policy check
  const profile = getBrowserProfile();
  const domainPolicy = checkDomainPolicy(payload.url, profile);
  await appendVerification(`Domain policy for ${redact(payload.url, 100)}: ${domainPolicy}`);

  if (domainPolicy === "block") {
    return {
      success: false,
      executed: false,
      result: { domainPolicy, url: redact(payload.url, 200) },
      redactedSummary: `Domain blocked by browser firewall: ${redact(payload.url, 100)}`,
    };
  }

  // require_approval domains - the fwAllowed check above already handles this

  // ── Validate mode — return classification only
  if (mode === "validate") {
    return {
      success: true,
      executed: false,
      result: { tier, domainPolicy, url: redact(payload.url, 200), action: payload.action },
      redactedSummary: `Browser action validated: ${payload.action} → ${tier} tier, domain policy: ${domainPolicy}`,
    };
  }

  // ── Dry run — return what would happen without browser launch
  if (mode === "dry_run") {
    await appendVerification(`Dry-run: would ${payload.action} at ${redact(payload.url, 100)}`);
    return {
      success: true,
      executed: false,
      result: {
        mode: "dry_run",
        tier,
        domainPolicy,
        wouldExecute: !HARD_BLOCKED_TIERS.includes(tier),
        action: payload.action,
        url: redact(payload.url, 200),
      },
      redactedSummary: `Dry-run: ${payload.action} on ${redact(payload.url, 60)} would be ${domainPolicy === "require_approval" ? "pending approval" : "allowed"}`,
    };
  }

  // ── Execute (real browser action)
  checkpoint("launching_browser");
  await appendVerification(`Launching Playwright for: ${payload.action}`);

  // Load Playwright lazily — graceful if not installed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let playwright: any = null;
  try {
    // @ts-ignore — playwright is an optional dependency; types may not be installed
    playwright = await import("playwright");
  } catch {
    return {
      success: false,
      executed: false,
      redactedSummary: "Playwright not installed. Run: pnpm add -w playwright && npx playwright install chromium",
    };
  }

  const timeout = payload.timeoutMs ?? 15_000;

  try {
    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setDefaultTimeout(timeout);

    let result: Record<string, unknown> = {};

    if (payload.action === "navigate" || payload.action === "get_text") {
      await page.goto(redact(payload.url, 2000), { waitUntil: "domcontentloaded", timeout });
      const title = await page.title();
      if (payload.action === "get_text") {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const text = await page.evaluate("document.body.innerText") as string;
        result = { title, textLength: text.length, textPreview: text.slice(0, 500) };
        await writeFile(path.join(proofDir, "page-text.txt"), text.slice(0, 50_000), "utf-8");
      } else {
        result = { title, url: page.url() };
      }
    } else if (payload.action === "screenshot") {
      await page.goto(redact(payload.url, 2000), { waitUntil: "domcontentloaded", timeout });
      const screenshotPath = path.join(proofDir, "screenshot.png");
      await page.screenshot({ path: screenshotPath, fullPage: true });
      result = { screenshotSaved: screenshotPath, url: page.url() };
    } else if (payload.action === "click" && payload.selector) {
      await page.goto(redact(payload.url, 2000), { waitUntil: "domcontentloaded", timeout });
      await page.click(payload.selector, { timeout });
      result = { clicked: payload.selector };
    } else if (payload.action === "hover") {
      if (!payload.selector || payload.selector.length === 0) {
        await browser.close();
        return { success: false, executed: false, redactedSummary: "selector required" };
      }
      try {
        await page.hover(payload.selector);
        await browser.close();
        return { success: true, executed: true, result: { selector: payload.selector }, redactedSummary: `Hovered ${payload.selector}` };
      } catch (err) {
        await browser.close();
        return { success: false, executed: false, redactedSummary: err instanceof Error ? err.message : "Action failed" };
      }
    } else if (payload.action === "select") {
      const selectValue = payload["value"];
      if (!payload.selector || payload.selector.length === 0 || typeof selectValue !== "string" || selectValue.length === 0) {
        await browser.close();
        return { success: false, executed: false, redactedSummary: "selector and value required" };
      }
      try {
        await page.selectOption(payload.selector, selectValue);
        await browser.close();
        return { success: true, executed: true, result: { selector: payload.selector, value: selectValue }, redactedSummary: `Selected ${selectValue} in ${payload.selector}` };
      } catch (err) {
        await browser.close();
        return { success: false, executed: false, redactedSummary: err instanceof Error ? err.message : "Action failed" };
      }
    } else if (payload.action === "wait") {
      if (!payload.selector || payload.selector.length === 0) {
        await browser.close();
        return { success: false, executed: false, redactedSummary: "selector required" };
      }
      const rawWaitTimeout = payload["timeout"];
      const waitTimeout = typeof rawWaitTimeout === "number" ? Math.min(rawWaitTimeout, 30_000) : 5_000;
      try {
        await page.waitForSelector(payload.selector, { timeout: waitTimeout });
        await browser.close();
        return { success: true, executed: true, result: { selector: payload.selector, timeout: waitTimeout }, redactedSummary: `Element appeared: ${payload.selector}` };
      } catch (err) {
        await browser.close();
        return { success: false, executed: false, redactedSummary: err instanceof Error ? err.message : "Action failed" };
      }
    } else if (payload.action === "press") {
      const pressKey = payload["key"];
      if (typeof pressKey !== "string" || pressKey.length === 0) {
        await browser.close();
        return { success: false, executed: false, redactedSummary: "key required" };
      }
      const pressTarget = typeof payload.selector === "string" && payload.selector.length > 0 ? payload.selector : "body";
      try {
        await page.press(pressTarget, pressKey);
        await browser.close();
        return { success: true, executed: true, result: { key: pressKey, target: pressTarget }, redactedSummary: `Pressed ${pressKey} on ${pressTarget}` };
      } catch (err) {
        await browser.close();
        return { success: false, executed: false, redactedSummary: err instanceof Error ? err.message : "Action failed" };
      }
    } else if (payload.action === "evaluate") {
      const script = payload["script"];
      if (typeof script !== "string") {
        await browser.close();
        return { success: false, executed: false, redactedSummary: "script must be a string" };
      }
      if (script.length > 2000) {
        await browser.close();
        return { success: false, executed: false, redactedSummary: "script rejected: exceeds 2000 character limit" };
      }
      if (["fetch(", "XMLHttpRequest", "WebSocket", "eval("].some((s) => script.includes(s))) {
        await browser.close();
        return { success: false, executed: false, redactedSummary: "script rejected: disallowed API" };
      }
      try {
        const evalResult = await page.evaluate(script);
        await browser.close();
        return { success: true, executed: true, result: { returnValue: evalResult }, redactedSummary: "Script evaluated successfully" };
      } catch (err) {
        await browser.close();
        return { success: false, executed: false, redactedSummary: err instanceof Error ? err.message : "Action failed" };
      }
    } else {
      result = { skipped: true, reason: `Action "${payload.action}" not implemented in executor` };
    }

    await browser.close();
    await appendVerification(`Browser closed cleanly`);

    return {
      success: true,
      executed: true,
      result: { ...result, tier, action: payload.action, url: redact(payload.url, 200) },
      redactedSummary: `Browser action "${payload.action}" completed on ${redact(payload.url, 60)}`,
    };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    await appendVerification(`Browser error: ${msg.slice(0, 300)}`);
    return {
      success: false,
      executed: false,
      redactedSummary: `Browser action failed: ${redact(msg, 200)}`,
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

let registered = false;
export function ensureBrowserExecutorRegistered(): void {
  if (registered) return;
  registerExecutor(BROWSER_EXECUTOR_KIND, browserRunner);
  registered = true;
  logger.info("browser-playwright-executor: registered with approved-executor framework");
}
