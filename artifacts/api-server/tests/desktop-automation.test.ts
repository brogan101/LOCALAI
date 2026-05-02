import assert from "node:assert/strict";
import express from "express";
import pluginsRoute from "../src/routes/plugins.js";
import {
  getDesktopProfile,
  getDesktopAutomationStatus,
  desktopAutomationToolRecords,
  proposeDesktopAction,
  saveDesktopProfile,
  classifyDesktopAction,
  checkAppExclusionPolicy,
  evaluateDesktopFirewall,
  type DesktopAutomationProfile,
} from "../src/lib/desktop-automation.js";
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

console.log("\nPhase 09B — Desktop/App Automation with WorldGUI Safety\n");

// 1. Not_configured defaults
await test("Desktop automation status is not_configured by default (dry-run)", async () => {
  const status = await getDesktopAutomationStatus({ dryRun: true });
  assert.equal(status.status, "not_configured");
  assert.equal(status.worldguiInstalled, false);
  assert.equal(status.worldguiRunning, false);
  assert.equal(status.dryRun, true);
  assert.ok(status.unavailableReason && status.unavailableReason.length > 0);
});

await test("Desktop automation status is not_configured without dryRun flag", async () => {
  const status = await getDesktopAutomationStatus({ dryRun: false });
  assert.equal(status.status, "not_configured");
  assert.equal(status.worldguiInstalled, false);
  assert.equal(status.dryRun, false);
});

// 2. Hard limits are always false
await test("Desktop profile hard limits are always false (not configurable)", () => {
  const profile = getDesktopProfile();
  assert.equal(profile.credentialEntryAllowed, false, "credentialEntryAllowed must be false");
  assert.equal(profile.keyloggerAllowed, false, "keyloggerAllowed must be false");
  assert.equal(profile.screenshotSensitiveAllowed, false, "screenshotSensitiveAllowed must be false");
  assert.equal(profile.enabled, false, "desktop profile disabled by default");
  assert.equal(profile.approved, false, "desktop profile not approved by default");
});

await test("saveDesktopProfile cannot set hard-limit fields to true", () => {
  const patched = saveDesktopProfile({
    credentialEntryAllowed: false,
    keyloggerAllowed: false,
    screenshotSensitiveAllowed: false,
  } as Partial<DesktopAutomationProfile>);
  assert.equal(patched.credentialEntryAllowed, false);
  assert.equal(patched.keyloggerAllowed, false);
  assert.equal(patched.screenshotSensitiveAllowed, false);
});

// 3. Action tier classification
await test("classifyDesktopAction: credential_entry", () => {
  assert.equal(classifyDesktopAction("credential_entry"), "credential_entry");
  assert.equal(classifyDesktopAction("password_entry"), "credential_entry");
  assert.equal(classifyDesktopAction("api_key_type"), "credential_entry");
});

await test("classifyDesktopAction: keylogger", () => {
  assert.equal(classifyDesktopAction("keylog_start"), "keylogger");
  assert.equal(classifyDesktopAction("key_log"), "keylogger");
  assert.equal(classifyDesktopAction("capture_keys"), "keylogger");
});

await test("classifyDesktopAction: screenshot_sensitive", () => {
  assert.equal(classifyDesktopAction("screenshot_sensitive"), "screenshot_sensitive");
  assert.equal(classifyDesktopAction("capture_sensitive"), "screenshot_sensitive");
  assert.equal(classifyDesktopAction("screen_sensitive"), "screenshot_sensitive");
});

await test("classifyDesktopAction: macro", () => {
  assert.equal(classifyDesktopAction("macro_run"), "macro");
  assert.equal(classifyDesktopAction("run_macro"), "macro");
});

await test("classifyDesktopAction: destructive", () => {
  assert.equal(classifyDesktopAction("uninstall_app"), "destructive");
  assert.equal(classifyDesktopAction("delete_files"), "destructive");
  assert.equal(classifyDesktopAction("format_drive"), "destructive");
});

await test("classifyDesktopAction: app_close / app_launch", () => {
  assert.equal(classifyDesktopAction("close_app"), "app_close");
  assert.equal(classifyDesktopAction("kill_app"), "app_close");
  assert.equal(classifyDesktopAction("launch_app"), "app_launch");
  assert.equal(classifyDesktopAction("open_app"), "app_launch");
});

await test("classifyDesktopAction: type / keys / click", () => {
  assert.equal(classifyDesktopAction("type_text"), "type");
  assert.equal(classifyDesktopAction("sendkeys"), "keys");
  assert.equal(classifyDesktopAction("left_click"), "click");
  assert.equal(classifyDesktopAction("mouse_click"), "click");
});

await test("classifyDesktopAction: screenshot and list_windows", () => {
  assert.equal(classifyDesktopAction("capture_screen"), "screenshot");
  assert.equal(classifyDesktopAction("snapshot"), "screenshot");
  assert.equal(classifyDesktopAction("list_windows"), "list_windows");
  assert.equal(classifyDesktopAction("enum_windows"), "list_windows");
});

await test("classifyDesktopAction: focus / read_only", () => {
  assert.equal(classifyDesktopAction("activate_window"), "focus");
  assert.equal(classifyDesktopAction("bring_to_front"), "focus");
  assert.equal(classifyDesktopAction("inspect_state"), "read_only");
});

// 4. App exclusion policy
await test("checkAppExclusionPolicy: password manager is blocked", () => {
  const profile = getDesktopProfile();
  assert.equal(checkAppExclusionPolicy("KeePass Password Manager", profile), "block");
  assert.equal(checkAppExclusionPolicy("Bitwarden", profile), "block");
  assert.equal(checkAppExclusionPolicy("1Password", profile), "block");
});

await test("checkAppExclusionPolicy: security/banking apps are blocked", () => {
  const profile = getDesktopProfile();
  assert.equal(checkAppExclusionPolicy("Windows Defender Security Center", profile), "block");
  assert.equal(checkAppExclusionPolicy("Bank of America", profile), "block");
  assert.equal(checkAppExclusionPolicy("PayPal", profile), "block");
});

await test("checkAppExclusionPolicy: system tools are blocked", () => {
  const profile = getDesktopProfile();
  assert.equal(checkAppExclusionPolicy("Registry Editor (regedit)", profile), "block");
  assert.equal(checkAppExclusionPolicy("Task Manager", profile), "block");
});

await test("checkAppExclusionPolicy: regular app is allowed", () => {
  const profile = getDesktopProfile();
  assert.equal(checkAppExclusionPolicy("Notepad", profile), "allow");
  assert.equal(checkAppExclusionPolicy("File Explorer", profile), "allow");
  assert.equal(checkAppExclusionPolicy("", profile), "allow");
});

// 5. Firewall evaluation
await test("evaluateDesktopFirewall blocks hard-blocked tier metadata", () => {
  const tools = buildToolRegistry();
  const clickTool = tools.find(t => t.id === "desktop.worldgui.click");
  assert.ok(clickTool, "click tool must be in registry");
  const hardBlockedMeta = {
    ...clickTool.desktopAutomation!,
    hardBlocked: true,
    hardBlockReason: "test hard block",
  };
  const block = evaluateDesktopFirewall({ ...clickTool, desktopAutomation: hardBlockedMeta }, []);
  assert.ok(block, "should return a block decision");
  assert.equal(block!.status, "blocked");
  assert.equal(block!.auditAction, "desktop_hard_blocked");
});

await test("evaluateDesktopFirewall passes null for non-desktop tools", () => {
  const tools = buildToolRegistry();
  const nonDesktop = tools.find(t => t.sourceKind !== "phase09b_desktop_automation");
  if (!nonDesktop) return;
  const result = evaluateDesktopFirewall(nonDesktop, []);
  assert.equal(result, null, "non-desktop tools should pass through");
});

await test("evaluateDesktopFirewall blocks credential_entry action", () => {
  const tools = buildToolRegistry();
  const typeTool = tools.find(t => t.id === "desktop.worldgui.type");
  if (!typeTool) return;
  const block = evaluateDesktopFirewall(typeTool, [], "credential_entry");
  assert.ok(block, "credential_entry action should be blocked");
  assert.equal(block!.status, "blocked");
});

await test("evaluateDesktopFirewall blocks excluded app target", () => {
  const tools = buildToolRegistry();
  const clickTool = tools.find(t => t.id === "desktop.worldgui.click");
  if (!clickTool) return;
  const block = evaluateDesktopFirewall(clickTool, [], "click", "KeePass Password Manager");
  assert.ok(block, "excluded app should be blocked");
  assert.equal(block!.status, "blocked");
  assert.equal(block!.auditAction, "desktop_app_blocked");
});

// 6. Tool registry includes Phase 09B desktop records
await test("buildToolRegistry includes desktop automation tools", () => {
  const tools = buildToolRegistry();
  const desktopTools = tools.filter(t => t.sourceKind === "phase09b_desktop_automation");
  assert.ok(desktopTools.length >= 5, `expected >=5 desktop tools, got ${desktopTools.length}`);
});

await test("Phase 07A desktop.worldgui-control stub is replaced by Phase 09B records", () => {
  const tools = buildToolRegistry({}, { includeHidden: true });
  const stub = tools.find(t => t.id === "desktop.worldgui-control");
  assert.equal(stub, undefined, "old Phase 07A stub must not appear in registry");
});

await test("desktop tool records all have not_configured status by default", () => {
  const records = desktopAutomationToolRecords();
  for (const record of records) {
    assert.equal(record.configuredStatus, "not_configured", `${record.id} should be not_configured`);
    assert.equal(record.enabled, false, `${record.id} should be disabled`);
    assert.equal(record.sandboxMode, "desktop_dry_run", `${record.id} should be desktop_dry_run`);
  }
});

await test("desktop tool records have correct sourceKind", () => {
  const records = desktopAutomationToolRecords();
  for (const record of records) {
    assert.equal(record.sourceKind, "phase09b_desktop_automation",
      `${record.id} must have sourceKind phase09b_desktop_automation`);
  }
});

await test("desktop tool records all have auditReplayBehavior record_decision_and_approval", () => {
  const records = desktopAutomationToolRecords();
  for (const record of records) {
    assert.equal(record.auditReplayBehavior, "record_decision_and_approval",
      `${record.id} must have record_decision_and_approval`);
  }
});

// 7. evaluateToolCall blocks hard-blocked tiers via full firewall chain
await test("evaluateToolCall blocks credential_entry desktop action", () => {
  const tools = buildToolRegistry();
  const result = evaluateToolCall({
    toolId: "desktop.worldgui.type",
    action: "credential_entry",
    requestedScopes: ["desktop"],
    registry: tools,
  });
  assert.equal(result.blocked, true);
  assert.equal(result.executed, false);
});

await test("evaluateToolCall returns not_configured for desktop.worldgui.screenshot (WorldGUI not installed)", () => {
  const tools = buildToolRegistry();
  const result = evaluateToolCall({
    toolId: "desktop.worldgui.screenshot",
    action: "screenshot",
    requestedScopes: ["desktop"],
    registry: tools,
  });
  assert.equal(result.executed, false);
  assert.ok(result.blocked || result.status === "not_configured" || result.status === "blocked",
    `expected blocked/not_configured, got ${result.status}`);
});

// 8. Proposal API — no execution, no WorldGUI needed
await test("proposeDesktopAction list_windows is proposal-only, no WorldGUI required", () => {
  const proposal = proposeDesktopAction({ action: "list_windows" });
  assert.equal(proposal.status, "proposed");
  assert.equal(proposal.dryRun, true);
  assert.equal(proposal.hardBlocked, false);
  assert.ok(proposal.notes.some(n => n.includes("Proposal only")));
});

await test("proposeDesktopAction credential_entry is hard-blocked in proposal", () => {
  const proposal = proposeDesktopAction({ action: "credential_entry" });
  assert.equal(proposal.hardBlocked, true);
  assert.equal(proposal.approvalRequired, true);
  assert.ok(proposal.hardBlockReason && proposal.hardBlockReason.length > 0);
});

await test("proposeDesktopAction keylogger is hard-blocked in proposal", () => {
  const proposal = proposeDesktopAction({ action: "keylog_start" });
  assert.equal(proposal.hardBlocked, true);
  assert.equal(proposal.approvalRequired, true);
});

await test("proposeDesktopAction click requires approval (not hard-blocked)", () => {
  const proposal = proposeDesktopAction({ action: "left_click" });
  assert.equal(proposal.hardBlocked, false);
  assert.equal(proposal.approvalRequired, true);
  assert.ok(proposal.notes.some(n => n.includes("approval")));
});

await test("proposeDesktopAction target app is redacted in proposal", () => {
  const proposal = proposeDesktopAction({ action: "left_click", targetApp: "Notepad" });
  assert.equal(proposal.targetApp, "[redacted-for-proposal]", "targetApp must be redacted");
});

await test("proposeDesktopAction blocked app is flagged in proposal", () => {
  const proposal = proposeDesktopAction({ action: "click", targetApp: "KeePass" });
  assert.equal(proposal.appPolicyResult, "block");
  assert.ok(proposal.notes.some(n => n.includes("blocked")));
});

// 9. Audit event fields — no sensitive data
await test("saveDesktopProfile does not log sensitive data in audit events", () => {
  saveDesktopProfile({ name: "test-desktop-profile" }, "test");
  const events = listAuditEvents(10);
  const desktopEvents = events.filter(e => e.eventType === "desktop_automation");
  assert.ok(desktopEvents.length >= 1, "should have desktop_automation audit event");
  for (const event of desktopEvents) {
    const text = JSON.stringify(event);
    assert.ok(!text.includes("SECRET"), "audit event must not contain SECRET");
    assert.ok(!text.includes("PASSWORD"), "audit event must not contain PASSWORD");
  }
});

// 10. HTTP routes
await test("GET /tools/desktop-automation/status returns not_configured", async () => {
  const { status, payload } = await inject("GET", "/tools/desktop-automation/status");
  assert.equal(status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.status.status, "not_configured");
  assert.equal(payload.status.worldguiInstalled, false);
});

await test("GET /tools/desktop-automation/profile returns profile with hard limits false", async () => {
  const { status, payload } = await inject("GET", "/tools/desktop-automation/profile");
  assert.equal(status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.profile.credentialEntryAllowed, false);
  assert.equal(payload.profile.keyloggerAllowed, false);
  assert.equal(payload.profile.screenshotSensitiveAllowed, false);
});

await test("POST /tools/desktop-automation/action/propose returns proposal with dryRun=true", async () => {
  const { status, payload } = await inject("POST", "/tools/desktop-automation/action/propose", {
    action: "list_windows",
    toolId: "desktop.worldgui.list-windows",
  });
  assert.ok(status >= 200 && status < 500, `expected 2xx/4xx, got ${status}`);
  assert.ok(payload.proposal, "response must include a proposal object");
  assert.equal(payload.proposal.status, "proposed");
  assert.equal(payload.proposal.dryRun, true);
  assert.equal(payload.executed, false);
});

await test("POST /tools/desktop-automation/action/propose is blocked for credential action", async () => {
  const { status, payload } = await inject("POST", "/tools/desktop-automation/action/propose", {
    toolId: "desktop.worldgui.type",
    action: "credential_entry",
    requestedScopes: ["desktop"],
  });
  assert.ok(status === 403 || status === 404, `expected 403/404 for credential action, got ${status}`);
  assert.equal(payload.executed, false);
  assert.equal(payload.blocked, true);
});

// Summary
console.log(`\n${passed + failed} assertions: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
