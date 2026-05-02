/**
 * Evidence Vault Tests — Phase 08B
 * ================================
 * Covers: record CRUD, category storage, hash-based dedup, stale/deleted handling,
 * Paperless not_configured behavior, privacy classification preservation,
 * RAG path reuse for search, private content not in logs, reminder proposals.
 *
 * No Paperless-ngx, Docker, Python, network, or cloud required.
 */

import assert from "node:assert/strict";
import express from "express";
import { initDatabase } from "../src/db/migrate.js";
import { sqlite } from "../src/db/database.js";
import { evidenceVault } from "../src/lib/evidence-vault.js";
import { rag, ragTestHooks } from "../src/lib/rag.js";
import evidenceRoute from "../src/routes/evidence.js";

await initDatabase();

// Inject fake embedder so tests are deterministic (no Ollama required)
function fakeEmbedding(text: string): number[] {
  const vec = new Array(768).fill(0);
  for (let i = 0; i < text.length; i++) vec[i % 768] += text.charCodeAt(i) / 255;
  vec[0] += 1;
  return vec;
}
ragTestHooks.setEmbedderForTests(async (t) => fakeEmbedding(t));

let assertions = 0;
const ts = Date.now();

// ── HTTP injection helper (mirrors rag.test.ts pattern) ─────────────────────

function inject(method: string, routePath: string, body?: unknown): Promise<{ status: number; payload: any }> {
  const app = express();
  app.use(express.json());
  app.use(evidenceRoute);

  return new Promise((resolve, reject) => {
    const [pathname, qs] = routePath.split("?");
    const query: Record<string, string> = {};
    if (qs) for (const [k, v] of new URLSearchParams(qs)) query[k] = v;

    const request = {
      method,
      url: routePath,
      originalUrl: routePath,
      baseUrl: "",
      path: pathname,
      headers: { "content-type": "application/json" },
      body,
      query,
      params: {} as Record<string, string>,
      get(name: string) { return (this.headers as Record<string, string>)[name.toLowerCase()]; },
      header(name: string) { return this.get(name); },
    };
    let statusCode = 200;
    const response = {
      status(code: number) { statusCode = code; return response; },
      json(payload: any) { resolve({ status: statusCode, payload }); return response; },
      send(payload: any) { resolve({ status: statusCode, payload }); return response; },
      end(payload?: any) { resolve({ status: statusCode, payload }); return response; },
      setHeader() {}, getHeader() { return undefined; }, removeHeader() {},
    };
    app.handle(request as any, response as any, (error: unknown) => {
      if (error) reject(error);
      else resolve({ status: 404, payload: undefined });
    });
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Existing RAG path still works after Phase 08B
// ────────────────────────────────────────────────────────────────────────────

const ragCollection = await rag.createCollection(`evidence-rag-regression-${ts}`);
const ragResult = await rag.ingest(ragCollection.id, {
  content: "Phase 08B regression: existing RAG still indexes local content without Ollama.",
  source: "regression-source.md",
});
assert.equal(ragResult.skipped, false);
assert.ok(ragResult.chunksAdded > 0);
assert.equal(ragCollection.vectorProvider, "hnswlib");
assertions += 3;

// ────────────────────────────────────────────────────────────────────────────
// 2. Evidence Vault record created without Paperless
// ────────────────────────────────────────────────────────────────────────────

const manual = await evidenceVault.createRecord({
  title: "Bosch Dishwasher Manual",
  category: "manual",
  originalFilename: "bosch-she55h.pdf",
  vendor: "Bosch",
  privacyClassification: "normal",
});
assert.ok(manual.id, "Record should have an id");
assert.equal(manual.category, "manual");
assert.equal(manual.vendor, "Bosch");
assert.equal(manual.privacyClassification, "normal");
assert.equal(manual.ingestionStatus, "pending");
assert.ok(!manual.stale, "New record should not be stale");
assertions += 6;

const receipt = await evidenceVault.createRecord({
  title: "GPU Receipt 2024",
  category: "receipt",
  fileHash: `fakehash-gpu-${ts}`,
  privacyClassification: "private",
  purchaseDate: "2024-11-15",
  vendor: "Newegg",
});
assert.equal(receipt.category, "receipt");
assert.equal(receipt.privacyClassification, "private");
assertions += 2;

const warranty = await evidenceVault.createRecord({
  title: "RTX 5070 Warranty",
  category: "warranty",
  warrantyExpires: new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10),
  vendor: "NVIDIA",
  privacyClassification: "normal",
});
assert.equal(warranty.category, "warranty");
assertions += 1;

const vehicleRec = await evidenceVault.createRecord({
  title: "F-150 Title",
  category: "vehicle",
  privacyClassification: "sensitive",
  entityAssociation: { vehicle: "Ford F-150 2018", vin: "NOT_REAL_VIN" },
});
assert.equal(vehicleRec.category, "vehicle");
assert.equal(vehicleRec.privacyClassification, "sensitive");
assertions += 2;

// ────────────────────────────────────────────────────────────────────────────
// 3. Category is stored and filterable
// ────────────────────────────────────────────────────────────────────────────

const allRecords = await evidenceVault.listRecords();
const manualRecords = await evidenceVault.listRecords({ category: "manual" });
const receiptRecords = await evidenceVault.listRecords({ category: "receipt" });

assert.ok(allRecords.length >= 4, "All records should include our test records");
assert.ok(manualRecords.every(r => r.category === "manual"), "Category filter returns only manuals");
assert.ok(receiptRecords.every(r => r.category === "receipt"), "Category filter returns only receipts");
assertions += 3;

// ────────────────────────────────────────────────────────────────────────────
// 4. Missing Paperless-ngx returns not_configured/degraded — not fake success
// ────────────────────────────────────────────────────────────────────────────

const paperlessStatus = await evidenceVault.getPaperlessStatus();
assert.equal(paperlessStatus.enabled, false, "Paperless must be disabled by default");
assert.equal(paperlessStatus.configured, false, "Paperless must be not_configured by default");
assert.equal(paperlessStatus.authStatus, "not_configured");
assert.equal(paperlessStatus.syncMode, "disabled");
assert.ok(paperlessStatus.notConfiguredReason.length > 0, "Reason must be present");
assert.equal(paperlessStatus.localFirst, true);
assert.equal(paperlessStatus.dataLeavesMachine, false);
assertions += 7;

// ────────────────────────────────────────────────────────────────────────────
// 5. Paperless sync defaults to dry_run proposal, not real import
// ────────────────────────────────────────────────────────────────────────────

const syncProposal = await evidenceVault.proposePaperlessSync({ mode: "dry_run" });
assert.equal(syncProposal.proposalStatus, "not_configured", "Sync must return not_configured when Paperless is not enabled");
assert.equal(syncProposal.executed, false, "Sync must never execute");
assertions += 2;

// ────────────────────────────────────────────────────────────────────────────
// 6. Duplicate detection by file hash
// ────────────────────────────────────────────────────────────────────────────

const dupHash = `dup-hash-${ts}`;
const first = await evidenceVault.createRecord({
  title: "Receipt Original",
  category: "receipt",
  fileHash: dupHash,
  privacyClassification: "normal",
});
const second = await evidenceVault.createRecord({
  title: "Receipt Duplicate",
  category: "receipt",
  fileHash: dupHash,
  privacyClassification: "normal",
});
const byHash = await evidenceVault.findByHash(dupHash);
assert.ok(byHash.length >= 2, "Both records with same hash should be found");
assert.ok(byHash.every(r => r.fileHash === dupHash), "findByHash returns records matching the hash");
assertions += 2;

// ────────────────────────────────────────────────────────────────────────────
// 7. Unchanged content ingested via RAG is skipped by hash
// ────────────────────────────────────────────────────────────────────────────

const ingestRec = await evidenceVault.createRecord({
  title: "Shop Manual Ingest Test",
  category: "shop",
  privacyClassification: "normal",
});
const ingestResult1 = await evidenceVault.ingestRecord(ingestRec.id, {
  content: "Shop equipment manual content for ingest test.",
  source: `shop-manual-${ts}.md`,
});
assert.equal(ingestResult1.skipped, false);
assert.ok(ingestResult1.chunksAdded > 0);
assertions += 2;

const ingestResult2 = await evidenceVault.ingestRecord(ingestRec.id, {
  content: "Shop equipment manual content for ingest test.",
  source: `shop-manual-${ts}.md`,
});
assert.equal(ingestResult2.skipped, true, "Unchanged content must be skipped by hash");
assert.equal(ingestResult2.chunksAdded, 0);
assertions += 2;

// ────────────────────────────────────────────────────────────────────────────
// 8. Changed content causes re-index
// ────────────────────────────────────────────────────────────────────────────

const ingestResult3 = await evidenceVault.ingestRecord(ingestRec.id, {
  content: "Shop equipment manual REVISED content — new torque spec added.",
  source: `shop-manual-${ts}.md`,
});
assert.equal(ingestResult3.skipped, false, "Changed content must trigger re-index");
assert.ok(ingestResult3.chunksAdded > 0);
assertions += 2;

// ────────────────────────────────────────────────────────────────────────────
// 9. Deleted record is marked stale/deleted
// ────────────────────────────────────────────────────────────────────────────

const deleteRec = await evidenceVault.createRecord({
  title: "To Be Deleted Receipt",
  category: "receipt",
  privacyClassification: "normal",
});
await evidenceVault.markDeleted(deleteRec.id);
const afterDelete = await evidenceVault.getRecord(deleteRec.id);
assert.ok(afterDelete?.deletedAt, "Deleted record must have deletedAt set");
assert.equal(afterDelete?.ingestionStatus, "deleted");
assert.ok(afterDelete?.stale, "Deleted record must be stale");

const activeOnly = await evidenceVault.listRecords();
assert.ok(!activeOnly.some(r => r.id === deleteRec.id), "Deleted record must not appear in active list");
assertions += 4;

// ────────────────────────────────────────────────────────────────────────────
// 10. Missing citation/date/vendor metadata is unavailable, not guessed
// ────────────────────────────────────────────────────────────────────────────

const noDateRec = await evidenceVault.createRecord({
  title: "Network Doc No Dates",
  category: "network",
  privacyClassification: "normal",
});
assert.equal(noDateRec.purchaseDate, undefined, "purchaseDate is undefined, not guessed");
assert.equal(noDateRec.warrantyExpires, undefined, "warrantyExpires is undefined, not guessed");
assert.equal(noDateRec.vendor, undefined, "vendor is undefined, not guessed");
assertions += 3;

// ────────────────────────────────────────────────────────────────────────────
// 11. Private/sensitive/secret classifications are preserved
// ────────────────────────────────────────────────────────────────────────────

const secretRec = await evidenceVault.createRecord({
  title: "Network Password Sheet",
  category: "network",
  privacyClassification: "secret",
});
assert.equal(secretRec.privacyClassification, "secret");

const fetchedSecret = await evidenceVault.getRecord(secretRec.id);
assert.equal(fetchedSecret?.privacyClassification, "secret", "Privacy classification persists after fetch");
assertions += 2;

// Secret records must be blocked from ingestion into shared RAG
let ingestBlocked = false;
try {
  await evidenceVault.ingestRecord(secretRec.id, {
    content: "TOP_SECRET_NETWORK_PASSWORD=SHOULD_NOT_BE_INDEXED",
    source: "secret-doc",
  });
} catch (err) {
  ingestBlocked = String(err).includes("secret") || String(err).includes("Secret");
}
assert.ok(ingestBlocked, "Secret records must be blocked from shared RAG ingestion");
assertions += 1;

// ────────────────────────────────────────────────────────────────────────────
// 12. Evidence search reuses existing RAG path
// ────────────────────────────────────────────────────────────────────────────

const shopSearchRec = await evidenceVault.createRecord({
  title: "CNC Router Manual",
  category: "shop",
  privacyClassification: "normal",
});
await evidenceVault.ingestRecord(shopSearchRec.id, {
  content: "CNC router spindle speed and feed rate calibration guide.",
  source: `cnc-manual-${ts}.md`,
});

const searchResult = await evidenceVault.searchVault("spindle speed calibration", "shop", 3);
assert.equal(searchResult.ragPath, "local_hnswlib", "Search must use local hnswlib path");
assert.ok(Array.isArray(searchResult.chunks), "Search result must include chunks array");
assert.ok(searchResult.usedCollectionIds.length > 0, "Search must use evidence collection IDs");
assertions += 3;

// ────────────────────────────────────────────────────────────────────────────
// 13. Reminder proposals from warranty/expiration dates
// ────────────────────────────────────────────────────────────────────────────

const reminders = await evidenceVault.getReminders(90);
const warrantyReminder = reminders.find(r => r.evidenceId === warranty.id);
assert.ok(warrantyReminder, "Warranty record with future expiry should generate a reminder proposal");
assert.equal(warrantyReminder?.reminderType, "warranty_expiry");
assert.equal(warrantyReminder?.proposalStatus, "proposal");
assert.equal(warrantyReminder?.requiresApproval, true);
assert.equal(warrantyReminder?.calendarIntegrationStatus, "not_configured");
assertions += 5;

// ────────────────────────────────────────────────────────────────────────────
// 14. Private document contents / secrets not in audit/thought logs
// ────────────────────────────────────────────────────────────────────────────

const auditRows = sqlite.prepare(`
  SELECT metadata_json FROM audit_events
  WHERE event_type = 'evidence_vault'
  ORDER BY created_at DESC LIMIT 50
`).all() as Array<{ metadata_json: string }>;

const thoughtRows = sqlite.prepare(`
  SELECT message, metadata_json FROM thought_log
  WHERE category = 'evidence_vault'
  ORDER BY timestamp DESC LIMIT 50
`).all() as Array<{ message: string; metadata_json: string | null }>;

const logText = JSON.stringify({ auditRows, thoughtRows });

// VIN / sensitive entity data must not appear in logs
assert.ok(!logText.includes("NOT_REAL_VIN"), "VIN data must not be logged");
// Receipt account numbers / secret credentials must not appear
assert.ok(!logText.includes("TOP_SECRET_NETWORK_PASSWORD"), "Secret credentials must not be logged");
// Vendor names in audit metadata are OK — but only if they come from title/category fields, not document content
assertions += 2;

// ────────────────────────────────────────────────────────────────────────────
// 15. HTTP Routes — via inject helper
// ────────────────────────────────────────────────────────────────────────────

// GET /evidence/status
const statusRes = await inject("GET", "/evidence/status");
assert.equal(statusRes.status, 200);
assert.equal(statusRes.payload.success, true);
assert.ok(typeof statusRes.payload.totalRecords === "number");
assert.ok(statusRes.payload.paperlessProvider.enabled === false);
assert.ok(statusRes.payload.ragIntegration.reusesExistingRagPath === true);
assertions += 5;

// GET /evidence/records
const listRes = await inject("GET", "/evidence/records");
assert.equal(listRes.status, 200);
assert.ok(Array.isArray(listRes.payload.records));
assertions += 2;

// POST /evidence/records — via route
const createRes = await inject("POST", "/evidence/records", {
  title: "Tool Manual Via Route",
  category: "tool",
  vendor: "DeWalt",
  privacyClassification: "normal",
});
assert.equal(createRes.status, 201);
assert.equal(createRes.payload.success, true);
assert.equal(createRes.payload.record.category, "tool");
assertions += 3;

// GET /evidence/records — category filter via route
const catFilterRes = await inject("GET", "/evidence/records?category=tool");
assert.equal(catFilterRes.status, 200);
assert.ok(catFilterRes.payload.records.every((r: any) => r.category === "tool"));
assertions += 2;

// GET /evidence/paperless/status
const paperlessRes = await inject("GET", "/evidence/paperless/status");
assert.equal(paperlessRes.status, 200);
assert.equal(paperlessRes.payload.paperless.enabled, false);
assert.equal(paperlessRes.payload.paperless.authStatus, "not_configured");
assertions += 3;

// POST /evidence/paperless/sync — must return not_configured, not fake success
const syncRes = await inject("POST", "/evidence/paperless/sync", { mode: "dry_run" });
assert.equal(syncRes.status, 200);
assert.equal(syncRes.payload.proposalStatus, "not_configured");
assert.equal(syncRes.payload.executed, false);
assertions += 3;

// GET /evidence/reminders
const remindersRes = await inject("GET", "/evidence/reminders?lookaheadDays=90");
assert.equal(remindersRes.status, 200);
assert.equal(remindersRes.payload.proposalOnly, true);
assert.equal(remindersRes.payload.calendarIntegrationStatus, "not_configured");
assert.ok(Array.isArray(remindersRes.payload.reminders));
assertions += 4;

// GET /evidence/categories
const categoriesRes = await inject("GET", "/evidence/categories");
assert.equal(categoriesRes.status, 200);
assert.ok(Array.isArray(categoriesRes.payload.categories));
assert.ok(categoriesRes.payload.categories.includes("manual"));
assert.ok(categoriesRes.payload.categories.includes("vehicle"));
assert.ok(categoriesRes.payload.categories.includes("receipt"));
assertions += 5;

// Missing title returns 400
const badCreate = await inject("POST", "/evidence/records", { category: "manual" });
assert.equal(badCreate.status, 400);
assertions += 1;

// Non-existent record returns 404
const notFound = await inject("GET", "/evidence/records/does-not-exist-phase08b");
assert.equal(notFound.status, 404);
assertions += 1;

// ────────────────────────────────────────────────────────────────────────────
// 16. Status overview shows categories correctly
// ────────────────────────────────────────────────────────────────────────────

const vaultStatus = await evidenceVault.status();
assert.ok(typeof vaultStatus.totalRecords === "number", "Status has totalRecords");
assert.ok(typeof vaultStatus.recordsByCategory === "object", "Status has recordsByCategory");
assert.ok(vaultStatus.ragIntegration.reusesExistingRagPath === true, "RAG integration flag is set");
assert.equal(vaultStatus.paperlessProvider.enabled, false, "Paperless shows disabled in status");
assertions += 4;

// ────────────────────────────────────────────────────────────────────────────

ragTestHooks.setEmbedderForTests(null);

console.log(`evidence-vault.test.ts passed (${assertions} assertions)`);
