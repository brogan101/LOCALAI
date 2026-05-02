/**
 * INVENTORY / PROJECT-TO-REALITY - Phase 17B Tests
 * =================================================
 * Covers local inventory records, optional provider not_configured status,
 * project-to-reality proposals, purchase/reorder approval gating, QR/NFC data
 * plans without device writes, Digital Twin links, and private data log safety.
 */

import assert from "node:assert/strict";

process.env["DATABASE_URL"] = ":memory:";
process.env["LOCALAI_TEST_AGENT_PERMISSIONS"] = JSON.stringify({
  allowAgentExec: true,
  allowAgentEdits: true,
});

import { runMigrations } from "../src/db/migrate.js";
runMigrations();

import { sqlite } from "../src/db/database.js";

for (const table of [
  "inventory_action_proposals",
  "project_reality_pipelines",
  "inventory_items",
  "digital_twin_relationships",
  "digital_twin_entities",
  "maker_projects",
  "maker_materials",
  "approval_requests",
  "audit_events",
  "job_events",
  "durable_jobs",
  "thought_log",
]) {
  try { sqlite.prepare(`DELETE FROM ${table}`).run(); } catch { /* optional table */ }
}

import { approveRequest, denyRequest } from "../src/lib/approval-queue.js";
import { getDigitalTwinEntity, listDigitalTwinRelationships } from "../src/lib/digital-twin.js";
import {
  INVENTORY_SOURCE_OF_TRUTH,
  checkInventoryAvailability,
  createInventoryItem,
  createInventoryLabelPlan,
  createLowStockReorderSuggestions,
  createProjectRealityPipeline,
  getInventoryStatus,
  getProjectRealityPipeline,
  listInventoryProviders,
  proposeInventoryAction,
  requestInventoryItemDeletion,
} from "../src/lib/inventory-pipeline.js";
import { createMakerProject } from "../src/lib/maker-studio.js";
import { listAuditEvents } from "../src/lib/platform-foundation.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
    .then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch((err) => { console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`); failed++; });
}

console.log("\nPhase 17B - Inventory/project-to-reality tests\n");

let confirmedPartId = "";
let unknownPartId = "";
let lowStockItemId = "";
let pipelineId = "";
const privateSecret = "owner=jane@example.com password=hunter2 vendor_token_123456";

await test("inventory status is local-first and external providers are not_configured", () => {
  const status = getInventoryStatus();
  assert.equal(status.sourceOfTruth, INVENTORY_SOURCE_OF_TRUTH);
  assert.equal(status.localFirst, true);
  assert.equal(status.cloudRequired, false);
  assert.equal(status.externalApiCallsMade, false);
  assert.equal(status.purchaseExecutionEnabled, false);
  assert.equal(status.providerSyncEnabled, false);

  const providers = listInventoryProviders();
  for (const id of ["inventree", "snipe_it", "homebox", "spoolman", "partkeepr"]) {
    const provider = providers.find(entry => entry.id === id);
    assert.ok(provider, `missing provider ${id}`);
    assert.equal(provider!.status, "not_configured");
    assert.equal(provider!.configured, false);
    assert.equal(provider!.executionEnabled, false);
    assert.equal(provider!.externalApiCallsMade, false);
    assert.equal(provider!.dataLeavesMachine, false);
  }
});

await test("inventory and asset records can be represented locally without external providers", () => {
  const confirmed = createInventoryItem({
    name: "M3 socket head screw",
    itemType: "part",
    category: "fastener",
    location: "private bin A1",
    bin: "A1",
    quantity: 48,
    unit: "each",
    availabilityStatus: "confirmed",
    quantityStatus: "confirmed",
    suitabilityStatus: "confirmed",
    supplierLink: `https://vendor.example/order?${privateSecret}`,
    notes: privateSecret,
  });
  confirmedPartId = confirmed.id;
  assert.equal(confirmed.providerStatus, "local");
  assert.ok(confirmed.digitalTwinEntityId);
  assert.ok(getDigitalTwinEntity(confirmed.digitalTwinEntityId!));
  assert.ok(!JSON.stringify(confirmed).includes("hunter2"));
  assert.ok(!JSON.stringify(confirmed).includes("vendor_token_123456"));

  const unknown = createInventoryItem({
    name: "Unknown bracket stock",
    itemType: "material",
    category: "stock",
  });
  unknownPartId = unknown.id;
  assert.equal(unknown.availabilityStatus, "unknown");
  assert.equal(unknown.quantityStatus, "unknown");
  assert.equal(unknown.suitabilityStatus, "unknown");
});

await test("availability, quantity, and suitability distinguish confirmed, missing, and unknown without guessing", () => {
  const checks = checkInventoryAvailability({
    items: [
      { itemId: confirmedPartId, requiredQuantity: 4 },
      { itemId: unknownPartId, requiredQuantity: 1 },
      { name: "Uncataloged gearmotor", requiredQuantity: 1 },
    ],
  });
  assert.equal(checks[0]!.available, true);
  assert.equal(checks[0]!.blocksProject, false);
  assert.equal(checks[1]!.availabilityStatus, "unknown");
  assert.equal(checks[1]!.available, false);
  assert.equal(checks[1]!.blocksProject, true);
  assert.match(checks[1]!.reason, /not confirmed|not guess/i);
  assert.equal(checks[2]!.availabilityStatus, "unknown");
  assert.equal(checks[2]!.available, false);
});

await test("low stock creates reorder suggestion, not a purchase or external call", () => {
  const item = createInventoryItem({
    name: "PETG spool",
    itemType: "filament",
    category: "filament",
    quantity: 1,
    unit: "spool",
    reorderThreshold: 2,
    availabilityStatus: "confirmed",
    quantityStatus: "confirmed",
    suitabilityStatus: "confirmed",
  });
  lowStockItemId = item.id;
  const suggestions = createLowStockReorderSuggestions();
  const suggestion = suggestions.find(entry => entry.itemIds.includes(lowStockItemId));
  assert.ok(suggestion);
  assert.equal(suggestion!.actionType, "reorder");
  assert.equal(suggestion!.status, "approval_required");
  assert.equal(suggestion!.approvalRequired, true);
  assert.equal(suggestion!.executed, false);
  assert.equal(suggestion!.externalApiCallsMade, false);
  assert.equal(suggestion!.metadata.purchaseExecuted, false);
});

await test("project-to-reality pipeline persists proposal stages and blocks on unknown inventory", () => {
  const makerProject = createMakerProject({ name: "Inventory-backed bracket", type: "3d_print", status: "planning" });
  const pipeline = createProjectRealityPipeline({
    title: "Inventory-backed bracket",
    makerProjectId: makerProject.id,
    itemRequests: [
      { itemId: confirmedPartId, requiredQuantity: 4 },
      { itemId: unknownPartId, requiredQuantity: 1 },
    ],
  });
  pipelineId = pipeline.id;
  assert.equal(pipeline.localOnly, true);
  assert.equal(pipeline.externalApiCallsMade, false);
  assert.equal(pipeline.status, "blocked");
  assert.ok(pipeline.stages.some(stage => stage.id === "parts_material_check" && stage.status === "blocked"));
  assert.ok(pipeline.purchaseList.every(entry => entry["purchaseExecuted"] === false));

  const stored = getProjectRealityPipeline(pipeline.id)!;
  assert.equal(stored.id, pipeline.id);
  assert.equal(stored.inventoryChecks.length, 2);
  assert.ok(stored.digitalTwinEntityId);
  const relationships = listDigitalTwinRelationships({ entityId: stored.digitalTwinEntityId });
  assert.ok(relationships.some(rel => rel.relationType === "requires_inventory_item"));
});

await test("purchase, reorder, vendor, label, NFC, and delete actions are approval-gated and non-executing", () => {
  for (const actionType of ["purchase", "reorder", "vendor_quote", "label_print", "nfc_write", "delete"] as const) {
    const proposal = proposeInventoryAction({ actionType, itemIds: [confirmedPartId], pipelineId });
    assert.equal(proposal.approvalRequired, true);
    assert.equal(proposal.executed, false);
    assert.equal(proposal.externalApiCallsMade, false);
    assert.equal(proposal.approval?.status, "waiting_for_approval");
    assert.equal(proposal.status, "approval_required");
  }
});

await test("denied inventory actions do not execute", () => {
  const proposal = proposeInventoryAction({ actionType: "purchase", itemIds: [confirmedPartId] });
  denyRequest(proposal.approval!.id, "test denial");
  const denied = proposeInventoryAction({ actionType: "purchase", itemIds: [confirmedPartId], approvalId: proposal.approval!.id });
  assert.equal(denied.status, "denied");
  assert.equal(denied.executed, false);
  assert.equal(denied.externalApiCallsMade, false);
});

await test("approved proposals still report not_configured instead of fake success for external providers", () => {
  const proposal = proposeInventoryAction({ actionType: "vendor_quote", itemIds: [confirmedPartId] });
  approveRequest(proposal.approval!.id, "test approval");
  const approved = proposeInventoryAction({ actionType: "vendor_quote", itemIds: [confirmedPartId], approvalId: proposal.approval!.id });
  assert.equal(approved.status, "not_configured");
  assert.equal(approved.executed, false);
  assert.equal(approved.externalApiCallsMade, false);
});

await test("QR/NFC label plan generates local data only", () => {
  const labelPlan = createInventoryLabelPlan(confirmedPartId, "both") as any;
  assert.equal(labelPlan.success, true);
  assert.equal(labelPlan.status, "proposal");
  assert.equal(labelPlan.executed, false);
  assert.equal(labelPlan.externalApiCallsMade, false);
  assert.equal(labelPlan.printingEnabled, false);
  assert.equal(labelPlan.nfcWritingEnabled, false);
  assert.equal(labelPlan.payload.itemId, confirmedPartId);
});

await test("inventory deletion requires approval and remains non-executing by default", () => {
  const blocked = requestInventoryItemDeletion(confirmedPartId);
  assert.equal(blocked.status, "approval_required");
  assert.equal(blocked.approvalRequired, true);
  assert.equal(blocked.executed, false);
  denyRequest(blocked.approval!.id, "test denial");
  const denied = requestInventoryItemDeletion(confirmedPartId, blocked.approval!.id);
  assert.equal(denied.status, "denied");
  assert.equal(denied.executed, false);
});

await test("audit/replay records are metadata-only and do not contain private inventory secrets", () => {
  const events = listAuditEvents(100).filter(event => event["eventType"] === "inventory_pipeline");
  assert.ok(events.length >= 5);
  const eventText = JSON.stringify(events);
  assert.ok(!eventText.includes("jane@example.com"));
  assert.ok(!eventText.includes("hunter2"));
  assert.ok(!eventText.includes("vendor_token_123456"));
  assert.ok(events.every(event => (event["metadata"] as any)?.externalApiCallsMade === false));
});

if (failed > 0) {
  console.error(`\nPhase 17B inventory tests failed: ${failed}/${passed + failed}`);
  process.exit(1);
}

console.log(`\nPhase 17B inventory tests passed: ${passed}/${passed + failed}`);
