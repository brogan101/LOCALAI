/**
 * BUSINESS MODULE FOUNDATION - Phase 12A Tests
 * ============================================
 * Covers:
 *   - Business module registry and hard limits
 *   - Optional adapter disabled/not_configured defaults
 *   - Disabled adapter sync cannot execute
 *   - Lead draft creates an approval item
 *   - No external send without approval
 *   - Approved draft still cannot send through unavailable adapters
 *   - Draft metadata stores redacted/source-safe details
 *   - Mission replay/audit do not expose private content or secrets
 */

import assert from "node:assert/strict";

process.env["DATABASE_URL"] = ":memory:";
process.env["LOCALAI_TEST_AGENT_PERMISSIONS"] = JSON.stringify({
  allowAgentExec: true,
  allowAgentEdits: true,
  allowAgentSelfHeal: true,
  allowAgentRefactor: true,
});

import { runMigrations } from "../src/db/migrate.js";
runMigrations();

import { sqlite } from "../src/db/database.js";
sqlite.prepare("DELETE FROM plugin_state WHERE id LIKE 'business-adapter:%'").run();
sqlite.prepare("DELETE FROM business_drafts").run();
sqlite.prepare("DELETE FROM approval_requests WHERE type = 'business_external_action'").run();
sqlite.prepare("DELETE FROM audit_events WHERE event_type LIKE 'business_%'").run();
sqlite.prepare("DELETE FROM thought_log WHERE category = 'business'").run();

import {
  BUSINESS_HARD_LIMITS,
  BUSINESS_MODULES_SOURCE_OF_TRUTH,
  createBusinessDraft,
  getBusinessStatus,
  listBusinessAdapters,
  listBusinessDrafts,
  listBusinessModules,
  proposeBusinessDraftSend,
  saveBusinessAdapterProfile,
  syncBusinessAdapter,
} from "../src/lib/business-modules.js";
import { approveRequest } from "../src/lib/approval-queue.js";
import { listMissionReplayEvents } from "../src/lib/mission-replay.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
    .then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch((err) => { console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`); failed++; });
}

await test("business module registry includes all Phase 12A modules", () => {
  const ids = listBusinessModules().map(module => module.id).sort();
  assert.deepEqual(ids, [
    "content-factory",
    "customer-support-copilot",
    "immediate-response-agency",
    "it-support-copilot",
    "lead-generation",
  ]);
});

await test("hard limits disallow spam, stealth bots, anti-bot evasion, and unapproved sends", () => {
  assert.equal(BUSINESS_HARD_LIMITS.spamBlastingAllowed, false);
  assert.equal(BUSINESS_HARD_LIMITS.stealthBotsAllowed, false);
  assert.equal(BUSINESS_HARD_LIMITS.antiBotEvasionAllowed, false);
  assert.equal(BUSINESS_HARD_LIMITS.externalSendWithoutApprovalAllowed, false);
});

await test("optional adapters default to disabled/not_configured without fake success", () => {
  const adapters = listBusinessAdapters();
  assert.equal(adapters.length, 6);
  assert.ok(adapters.every(adapter => adapter.status === "disabled" && adapter.enabled === false));
  assert.ok(adapters.every(adapter => adapter.configured === false));
  assert.ok(adapters.every(adapter => adapter.secretsConfigured === false));
});

await test("disabled Chatwoot adapter sync cannot execute", () => {
  const result = syncBusinessAdapter("chatwoot");
  assert.equal(result.success, false);
  assert.equal(result.executed, false);
  assert.equal(result.status, "disabled");
});

await test("enabled adapter missing endpoint/secret reports not_configured", () => {
  const adapter = saveBusinessAdapterProfile("chatwoot", { enabled: true, endpointUrl: "" });
  assert.equal(adapter.status, "not_configured");
  assert.equal(adapter.configured, false);
  const sync = syncBusinessAdapter("chatwoot");
  assert.equal(sync.status, "not_configured");
  assert.equal(sync.executed, false);
});

let leadDraftId = "";
let leadApprovalId = "";
const privateInbound = "Lead asks for pricing. email alice@example.com password=secret-token sk-phase12A-secret";

await test("lead draft creates approval item and stores redacted/source metadata", () => {
  const result = createBusinessDraft({
    moduleId: "lead-generation",
    adapterId: "email",
    inboundText: privateInbound,
    customerName: "Alice",
    source: "manual-test",
  });
  assert.equal(result.success, true);
  assert.equal(result.executed, false);
  assert.equal(result.approvalRequired, true);
  assert.ok(result.approval?.id);
  assert.equal(result.approval?.riskTier, "tier4_external_communication");
  assert.equal(result.draft?.status, "approval_pending");
  assert.equal(result.draft?.privacy.rawContentStored, false);
  assert.equal(result.draft?.privacy.privateContentLogged, false);
  assert.equal(result.draft?.calendarSlot?.["page"], "unavailable");
  assert.equal(result.draft?.calendarSlot?.["section"], "unavailable");
  assert.equal(result.draft?.calendarSlot?.["line"], "unavailable");
  assert.ok(!JSON.stringify(result.draft).includes("alice@example.com"));
  assert.ok(!JSON.stringify(result.draft).includes("sk-phase12A-secret"));
  leadDraftId = result.draft!.id;
  leadApprovalId = result.approval!.id;
});

await test("no external send occurs without approval", () => {
  const draft = createBusinessDraft({
    moduleId: "customer-support-copilot",
    adapterId: "chatwoot",
    inboundText: "Support customer asks for order status.",
  }).draft!;
  const result = proposeBusinessDraftSend(draft.id);
  assert.equal(result.success, false);
  assert.equal(result.executed, false);
  assert.equal(result.status, "approval_required");
  assert.equal(result.approvalRequired, true);
  assert.ok(result.approval?.id);
});

await test("approved lead still cannot send when adapter is disabled/not_configured", () => {
  approveRequest(leadApprovalId, "test approval");
  const result = proposeBusinessDraftSend(leadDraftId, leadApprovalId);
  assert.equal(result.success, false);
  assert.equal(result.executed, false);
  assert.ok(result.status === "disabled" || result.status === "not_configured");
});

await test("business status reports source of truth and no executed external actions", () => {
  const status = getBusinessStatus();
  assert.equal(status["sourceOfTruth"], BUSINESS_MODULES_SOURCE_OF_TRUTH);
  assert.equal(status["localFirst"], true);
  assert.equal(status["externalActionsExecuted"], false);
  assert.ok(Array.isArray(status["modules"]));
  assert.ok(Array.isArray(status["adapters"]));
});

await test("draft list contains created drafts", () => {
  const drafts = listBusinessDrafts();
  assert.ok(drafts.length >= 2);
  assert.ok(drafts.some(draft => draft.id === leadDraftId));
});

await test("audit and mission replay do not expose private business contents or secrets", () => {
  const auditRows = sqlite.prepare(`
    SELECT metadata_json FROM audit_events
    WHERE event_type LIKE 'business_%'
  `).all() as Array<{ metadata_json: string }>;
  const auditText = JSON.stringify(auditRows);
  assert.ok(!auditText.includes("alice@example.com"));
  assert.ok(!auditText.includes("sk-phase12A-secret"));
  assert.ok(!auditText.includes("password=secret-token"));

  const replay = listMissionReplayEvents({ traceId: `business:${leadDraftId}`, limit: 200 });
  const replayText = JSON.stringify(replay);
  assert.ok(!replayText.includes("alice@example.com"));
  assert.ok(!replayText.includes("sk-phase12A-secret"));
  assert.ok(!replayText.includes("password=secret-token"));
});

if (failed > 0) {
  console.error(`\n${failed} business module test(s) failed; ${passed} passed.`);
  process.exit(1);
}

console.log(`\nBusiness module tests passed: ${passed}`);
