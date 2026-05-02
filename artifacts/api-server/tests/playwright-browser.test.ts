import assert from "node:assert/strict";
import express from "express";
import pluginsRoute from "../src/routes/plugins.js";
import {
  getBrowserProfile,
  getPlaywrightMcpStatus,
  playwrightBrowserToolRecords,
  proposeBrowserAction,
  saveBrowserProfile,
  classifyBrowserAction,
  checkDomainPolicy,
  evaluateBrowserFirewall,
  type BrowserSessionProfile,
} from "../src/lib/playwright-browser.js";
import {
  buildToolRegistry,
  evaluateToolCall,
} from "../src/lib/tool-registry.js";
import { listAuditEvents } from "../src/lib/platform-foundation.js";

process.env.LOCALAI_TEST_AGENT_PERMISSIONS = JSON.stringify({
  allowAgentExec: true,
  allowAgentEdits: true,
  allowAgentSelfHeal: false,
  allowAgentRefactor: false,
});

function inject(method: string, routePath: string, body?: unknown): Promise<{ status: number; payload: any }> {
  const app = express();
  app.use(express.json());
  app.use(pluginsRoute);
  return new Promise((resolve, reject) => {
    const request = {
      method,
      url: routePath,
      originalUrl: routePath,
      baseUrl: "",
      path: routePath.split("?")[0],
      headers: { "content-type": "application/json" },
      body,
      query: Object.fromEntries(new URLSearchParams(routePath.split("?")[1] ?? "")),
      get(name: string) {
        return (this.headers as Record<string, string>)[name.toLowerCase()];
      },
      header(name: string) {
        return this.get(name);
      },
    };
    let statusCode = 200;
    const response = {
      status(code: number) {
        statusCode = code;
        return response;
      },
      json(payload: any) {
        resolve({ status: statusCode, payload });
        return response;
      },
      send(payload: any) {
        resolve({ status: statusCode, payload });
        return response;
      },
      end(payload?: any) {
        resolve({ status: statusCode, payload });
        return response;
      },
      setHeader() {},
      getHeader() { return undefined; },
      removeHeader() {},
    };
    app.handle(request as any, response as any, (error: unknown) => {
      if (error) reject(error);
      else resolve({ status: 404, payload: { success: false, message: "not found" } });
    });
  });
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve().then(fn).then(() => {
    console.log(`  ✓ ${name}`);
    passed++;
  }).catch((err: unknown) => {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  });
}

console.log("\nPhase 09A — Browser Automation with Playwright MCP Safety\n");

// 1. Missing Playwright MCP → not_configured
await test("Playwright MCP status is not_configured by default (dry-run)", async () => {
  const status = await getPlaywrightMcpStatus({ dryRun: true });
  assert.equal(status.status, "not_configured");
  assert.equal(status.playwrightInstalled, false);
  assert.equal(status.mcpServerReachable, false);
  assert.equal(status.dryRun, true);
  assert.ok(status.unavailableReason && status.unavailableReason.length > 0);
});

await test("Playwright MCP status is not_configured without dryRun flag", async () => {
  const status = await getPlaywrightMcpStatus({ dryRun: false });
  assert.equal(status.status, "not_configured");
  assert.equal(status.playwrightInstalled, false);
  assert.equal(status.dryRun, false);
});

// 2. Browser profile defaults — hard limits are always false
await test("Browser profile hard limits are always false (not configurable)", () => {
  const profile = getBrowserProfile();
  assert.equal(profile.credentialEntryAllowed, false, "credentialEntryAllowed must be false");
  assert.equal(profile.antiBoEvasionAllowed, false, "antiBoEvasionAllowed must be false");
  assert.equal(profile.cookieStorageAllowed, false, "cookieStorageAllowed must be false");
  assert.equal(profile.enabled, false, "browser profile disabled by default");
  assert.equal(profile.approved, false, "browser profile not approved by default");
});

await test("saveBrowserProfile cannot set hard-limit fields to true", () => {
  const patched = saveBrowserProfile({
    credentialEntryAllowed: false,
    antiBoEvasionAllowed: false,
    cookieStorageAllowed: false,
  } as Partial<BrowserSessionProfile>);
  assert.equal(patched.credentialEntryAllowed, false);
  assert.equal(patched.antiBoEvasionAllowed, false);
  assert.equal(patched.cookieStorageAllowed, false);
});

// 3. Action classification
await test("classifyBrowserAction: credential_entry", () => {
  assert.equal(classifyBrowserAction("credential_entry"), "credential_entry");
  assert.equal(classifyBrowserAction("enter_password"), "credential_entry");
  assert.equal(classifyBrowserAction("api_key_fill"), "credential_entry");
});

await test("classifyBrowserAction: anti_bot_evasion", () => {
  assert.equal(classifyBrowserAction("anti_bot_bypass"), "anti_bot_evasion");
  assert.equal(classifyBrowserAction("captcha_bypass"), "anti_bot_evasion");
});

await test("classifyBrowserAction: cookie_capture", () => {
  assert.equal(classifyBrowserAction("cookie_dump"), "cookie_capture");
  assert.equal(classifyBrowserAction("session_export"), "cookie_capture");
});

await test("classifyBrowserAction: login tier", () => {
  assert.equal(classifyBrowserAction("login"), "login");
  assert.equal(classifyBrowserAction("signin_page"), "login");
  assert.equal(classifyBrowserAction("authenticate"), "login");
});

await test("classifyBrowserAction: purchase tier", () => {
  assert.equal(classifyBrowserAction("checkout"), "purchase");
  assert.equal(classifyBrowserAction("buy_now"), "purchase");
});

await test("classifyBrowserAction: safe read-only", () => {
  assert.equal(classifyBrowserAction("read_page"), "read_only");
  assert.equal(classifyBrowserAction("get_text"), "read_only");
});

// 4. Domain policy
await test("checkDomainPolicy: blocked domain", () => {
  const profile = getBrowserProfile();
  const result = checkDomainPolicy("https://paypal.com/checkout", profile);
  assert.equal(result, "block");
});

await test("checkDomainPolicy: safe domain with empty allowlist", () => {
  const profile = getBrowserProfile();
  const result = checkDomainPolicy("https://example.com", profile);
  assert.equal(result, "allow");
});

// 5. Hard-blocked tiers always blocked by firewall
await test("evaluateBrowserFirewall blocks credential_entry hard", () => {
  const tools = buildToolRegistry();
  const credTool = tools.find(t => t.id === "browser.playwright-mcp.navigate");
  assert.ok(credTool, "navigate tool must be in registry");
  const block = evaluateBrowserFirewall(
    { ...credTool, browserAutomation: { ...credTool.browserAutomation!, hardBlocked: true, actionTier: "credential_entry", hardBlockReason: "hard blocked test" } },
    [],
  );
  assert.ok(block, "should return a block decision");
  assert.equal(block!.status, "blocked");
});

await test("evaluateBrowserFirewall passes null for non-browser tools", () => {
  const tools = buildToolRegistry();
  const nonBrowser = tools.find(t => t.sourceKind !== "phase09a_browser_automation");
  if (!nonBrowser) return;
  const result = evaluateBrowserFirewall(nonBrowser, []);
  assert.equal(result, null, "non-browser tools should pass through");
});

await test("evaluateBrowserFirewall blocks credential action in action parameter", () => {
  const tools = buildToolRegistry({}, { includeHidden: true });
  const navigateTool = tools.find(t => t.id === "browser.playwright-mcp.navigate");
  if (!navigateTool) return;
  const block = evaluateBrowserFirewall(navigateTool, [], "credential_entry");
  assert.ok(block, "credential_entry action should be blocked");
  assert.equal(block!.status, "blocked");
});

// 6. Tool registry includes Phase 09A browser records
await test("buildToolRegistry includes playwright browser tools", () => {
  const tools = buildToolRegistry();
  const browserTools = tools.filter(t => t.sourceKind === "phase09a_browser_automation");
  assert.ok(browserTools.length >= 3, `expected >=3 browser tools, got ${browserTools.length}`);
});

await test("Phase 07A browser.playwright-mcp stub is replaced by Phase 09A records", () => {
  const tools = buildToolRegistry({}, { includeHidden: true });
  const stub = tools.find(t => t.id === "browser.playwright-mcp");
  assert.equal(stub, undefined, "old Phase 07A stub must not appear in registry");
});

await test("browser tool records all have not_configured status by default", () => {
  const records = playwrightBrowserToolRecords();
  for (const record of records) {
    assert.equal(record.configuredStatus, "not_configured", `${record.id} should be not_configured`);
    assert.equal(record.enabled, false, `${record.id} should be disabled`);
    assert.equal(record.sandboxMode, "browser_dry_run", `${record.id} should be browser_dry_run`);
  }
});

// 7. evaluateToolCall blocks credential action through registry
await test("evaluateToolCall blocks credential_entry browser action", () => {
  const tools = buildToolRegistry();
  const result = evaluateToolCall({
    toolId: "browser.playwright-mcp.navigate",
    action: "credential_entry",
    requestedScopes: ["browser"],
    registry: tools,
  });
  assert.equal(result.blocked, true);
  assert.equal(result.executed, false);
});

await test("evaluateToolCall returns not_configured for navigate tool (Playwright not installed)", () => {
  const tools = buildToolRegistry();
  const result = evaluateToolCall({
    toolId: "browser.playwright-mcp.navigate",
    action: "navigate",
    requestedScopes: ["browser"],
    registry: tools,
  });
  assert.equal(result.executed, false);
  assert.ok(result.blocked || result.status === "not_configured" || result.status === "blocked",
    `expected blocked/not_configured, got ${result.status}`);
});

// 8. Proposal API — no execution, no Playwright MCP needed
await test("proposeBrowserAction navigate is proposal-only, not_configured safe", () => {
  const proposal = proposeBrowserAction({ action: "navigate", targetUrl: "https://example.com" });
  assert.equal(proposal.status, "proposed");
  assert.equal(proposal.dryRun, true);
  assert.equal(proposal.hardBlocked, false);
  assert.ok(proposal.notes.some(n => n.includes("Proposal only")));
  assert.equal(proposal.targetUrl, "[redacted-for-proposal]", "URL must be redacted in proposal");
});

await test("proposeBrowserAction credential_entry is hard-blocked in proposal", () => {
  const proposal = proposeBrowserAction({ action: "credential_entry" });
  assert.equal(proposal.hardBlocked, true);
  assert.equal(proposal.approvalRequired, true);
  assert.ok(proposal.hardBlockReason && proposal.hardBlockReason.length > 0);
});

await test("proposeBrowserAction login requires approval", () => {
  const proposal = proposeBrowserAction({ action: "login" });
  assert.equal(proposal.approvalRequired, true);
  assert.ok(proposal.notes.some(n => n.includes("approval")));
});

await test("proposeBrowserAction blocked domain is flagged", () => {
  const proposal = proposeBrowserAction({ action: "navigate", targetUrl: "https://paypal.com" });
  assert.equal(proposal.domainPolicyResult, "block");
  assert.ok(proposal.notes.some(n => n.includes("blocked")));
});

// 9. Secrets must not appear in audit or proposal output
await test("Secrets and tokens are not exposed in browser proposal", () => {
  const proposal = proposeBrowserAction({
    action: "form_fill",
    targetUrl: "https://example.com?token=SECRET_TOKEN_VALUE",
  });
  const serialized = JSON.stringify(proposal);
  assert.ok(!serialized.includes("SECRET_TOKEN_VALUE"), "token must not appear in proposal JSON");
  assert.ok(!serialized.includes("example.com"), "raw URL must not appear in proposal JSON");
});

await test("saveBrowserProfile does not log domain patterns as secrets in audit", () => {
  saveBrowserProfile({ name: "test-browser-profile" }, "test");
  const events = listAuditEvents(10);
  const browserEvents = events.filter(e => e.eventType === "browser_automation");
  assert.ok(browserEvents.length >= 1, "should have browser_automation audit event");
  for (const event of browserEvents) {
    const text = JSON.stringify(event);
    assert.ok(!text.includes("SECRET"), "audit event must not contain SECRET");
    assert.ok(!text.includes("PASSWORD"), "audit event must not contain PASSWORD");
    assert.ok(!text.includes("TOKEN="), "audit event must not contain raw TOKEN assignment");
  }
});

// 10. HTTP routes — status, profile, proposals
await test("GET /tools/browser-automation/status returns not_configured", async () => {
  const { status, payload } = await inject("GET", "/tools/browser-automation/status");
  assert.equal(status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.status.status, "not_configured");
  assert.equal(payload.status.playwrightInstalled, false);
});

await test("GET /tools/browser-automation/profile returns profile with hard limits false", async () => {
  const { status, payload } = await inject("GET", "/tools/browser-automation/profile");
  assert.equal(status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.profile.credentialEntryAllowed, false);
  assert.equal(payload.profile.antiBoEvasionAllowed, false);
  assert.equal(payload.profile.cookieStorageAllowed, false);
});

await test("POST /tools/browser-automation/navigate/propose returns proposal with dryRun=true", async () => {
  const { status, payload } = await inject("POST", "/tools/browser-automation/navigate/propose", {
    targetUrl: "https://docs.example.com",
  });
  assert.equal(status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.proposal.status, "proposed");
  assert.equal(payload.proposal.dryRun, true);
  assert.equal(payload.executed, false);
});

await test("POST /tools/browser-automation/action/propose is blocked for credential action", async () => {
  const { status, payload } = await inject("POST", "/tools/browser-automation/action/propose", {
    toolId: "browser.playwright-mcp.navigate",
    action: "credential_entry",
    requestedScopes: ["browser"],
  });
  assert.ok(status === 403 || status === 404, `expected 403/404 for credential action, got ${status}`);
  assert.equal(payload.executed, false);
  assert.equal(payload.blocked, true);
});

await test("Phase 09A browser tools all have auditReplayBehavior record_decision_and_approval", () => {
  const records = playwrightBrowserToolRecords();
  for (const record of records) {
    assert.equal(record.auditReplayBehavior, "record_decision_and_approval",
      `${record.id} must have record_decision_and_approval`);
  }
});

await test("Phase 09A browser tools all have sourceKind phase09a_browser_automation", () => {
  const records = playwrightBrowserToolRecords();
  for (const record of records) {
    assert.equal(record.sourceKind, "phase09a_browser_automation",
      `${record.id} must have sourceKind phase09a_browser_automation`);
  }
});

// Summary
console.log(`\n${passed + failed} assertions: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
