/**
 * AUTOMOTIVE / MASTER TECH - Phase 18 Tests
 * =========================================
 * Covers local vehicle profiles, Foxbody build facts, diagnostic proposals,
 * optional provider status, vehicle action approval gates, and private data
 * log safety without touching OBD/CAN/ECU hardware or external services.
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
  "automotive_action_proposals",
  "automotive_diagnostic_cases",
  "automotive_vehicle_profiles",
  "inventory_action_proposals",
  "project_reality_pipelines",
  "inventory_items",
  "digital_twin_relationships",
  "digital_twin_entities",
  "approval_requests",
  "audit_events",
  "job_events",
  "durable_jobs",
  "thought_log",
]) {
  try { sqlite.prepare(`DELETE FROM ${table}`).run(); } catch { /* optional table */ }
}

import { approveRequest, denyRequest } from "../src/lib/approval-queue.js";
import { getDigitalTwinEntity } from "../src/lib/digital-twin.js";
import {
  AUTOMOTIVE_SOURCE_OF_TRUTH,
  addRepairLogEntry,
  createDiagnosticCase,
  createVehicleProfile,
  getAutomotiveStatus,
  getOrCreateFoxbodyProfile,
  listAutomotiveProviders,
  proposeVehicleAction,
} from "../src/lib/automotive-diagnostics.js";
import { listAuditEvents } from "../src/lib/platform-foundation.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
    .then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch((err) => { console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`); failed++; });
}

console.log("\nPhase 18 - Automotive diagnostics tests\n");

let vehicleId = "";
let caseId = "";
const privateVehicleSecret = "VIN=1HGCM82633A004352 title=private password=hunter2 token=vehicle_token_123";

await test("automotive status is local-first with optional providers not_configured or disabled", () => {
  const status = getAutomotiveStatus();
  assert.equal(status.sourceOfTruth, AUTOMOTIVE_SOURCE_OF_TRUTH);
  assert.equal(status.localFirst, true);
  assert.equal(status.cloudRequired, false);
  assert.equal(status.externalApiCallsMade, false);
  assert.equal(status.realHardwareCallsEnabled, false);
  assert.equal(status.writeActionsEnabled, false);
  assert.equal(status.hardLimits.testBeforePartsReplacement, true);

  const providers = listAutomotiveProviders();
  for (const id of ["python_obd", "elm327", "elm327_emulator", "savvycan", "ovms", "aces_log_import", "can_interface"]) {
    const provider = providers.find(entry => entry.id === id);
    assert.ok(provider, `missing provider ${id}`);
    assert.equal(provider!.status, "not_configured");
    assert.equal(provider!.configured, false);
    assert.equal(provider!.executionEnabled, false);
    assert.equal(provider!.captureEnabled, false);
    assert.equal(provider!.writeEnabled, false);
    assert.equal(provider!.externalApiCallsMade, false);
    assert.equal(provider!.dataLeavesMachine, false);
  }
  assert.equal(providers.find(entry => entry.id === "external_vehicle_data")?.status, "disabled");
});

await test("vehicle profiles are local records linked to Digital Twin without OBD/CAN providers", () => {
  const vehicle = createVehicleProfile({
    name: `Daily driver ${privateVehicleSecret}`,
    year: "2004",
    make: "Ford",
    model: "Ranger",
    engine: "4.0",
    transmission: "5R55E",
    factStatus: "user_provided",
    privacyClassification: "sensitive",
    maintenanceLog: [{ note: privateVehicleSecret }],
    dtcHistory: [{ code: "P0171", note: privateVehicleSecret }],
    mods: [{ key: "intake", label: "Intake", value: privateVehicleSecret, status: "user_provided", source: "manual" }],
  });
  vehicleId = vehicle.id;
  assert.equal(vehicle.providerStatus, "local");
  assert.equal(vehicle.factStatus, "user_provided");
  assert.ok(vehicle.digitalTwinEntityId);
  const entity = getDigitalTwinEntity(vehicle.digitalTwinEntityId!);
  assert.ok(entity);
  assert.equal(entity!.type, "vehicle");

  const vehicleText = JSON.stringify(vehicle);
  assert.ok(!vehicleText.includes("1HGCM82633A004352"));
  assert.ok(!vehicleText.includes("hunter2"));
  assert.ok(!vehicleText.includes("vehicle_token_123"));
});

await test("Foxbody build profile preserves required project facts", () => {
  const foxbody = getOrCreateFoxbodyProfile();
  const profileText = JSON.stringify(foxbody);
  for (const expected of [
    "1988",
    "Mustang GT",
    "hatchback",
    "LQ4",
    "4L80E",
    "ACES Jackpot ECU",
    "BTR Stage 3 NA cam",
    "FAST 102mm throttle body",
    "JEGS intake",
    "Z28 radiator/fans",
    "On3 central fuel hat / 3-pump system",
    "Foxbody wiring notes",
  ]) {
    assert.ok(profileText.includes(expected), `missing ${expected}`);
  }
});

await test("symptom intake creates diagnostic proposal and test plan without hardware calls", () => {
  const diagnostic = createDiagnosticCase({
    vehicleId,
    title: "No-start with intermittent fan issue",
    symptoms: `Cranks no-start after LS swap, fan does not run, ACES log unavailable. ${privateVehicleSecret}`,
    dtcs: [{ code: "P0335", description: "Crankshaft position sensor A circuit" }],
    evidenceRefs: ["rag:evidence/manual-page-local"],
  });
  caseId = diagnostic.id;
  assert.equal(diagnostic.localOnly, true);
  assert.equal(diagnostic.externalApiCallsMade, false);
  assert.equal(diagnostic.intakeStatus, "proposal");
  assert.equal(diagnostic.freezeFrameStatus, "user_provided");
  assert.equal(diagnostic.liveDataStatus, "not_configured");
  assert.ok(diagnostic.workflow.includes("test_first_plan"));
  assert.ok(diagnostic.testPlan.some(step => step.id === "test_before_parts"));
  assert.ok(diagnostic.testPlan.some(step => step.id === "foxbody_ls_swap_checklist"));
  assert.match(diagnostic.partsCannonWarning, /Do not replace parts/i);
  assert.equal(diagnostic.humanVerificationRequired, true);
});

await test("likely causes are not represented as confirmed faults without evidence", () => {
  const diagnostic = createDiagnosticCase({
    vehicleId,
    title: "Shift concern",
    symptoms: "4L80E intermittent shift flare; no line-pressure reading yet.",
  });
  assert.equal(diagnostic.confirmedFaults.length, 0);
  assert.ok(diagnostic.likelyCauses.length > 0);
  assert.ok(diagnostic.likelyCauses.every(cause => cause.confirmedFault === false));
  assert.ok(diagnostic.likelyCauses.every(cause => cause.status !== "confirmed"));
  assert.ok(diagnostic.assumptions.some(assumption => /hypotheses/i.test(assumption)));
});

await test("repair log captures final-fix notes as user-provided and links to the diagnostic case", () => {
  const updated = addRepairLogEntry(vehicleId, {
    caseId,
    summary: "Verified crank signal wiring and repaired connector pin tension.",
    finalFix: "Connector repair reported by user after test plan.",
    evidenceRefs: ["rag:evidence/repair-note-local"],
  });
  assert.ok(updated.repairLog.length > 0);
  const latest = updated.repairLog.at(-1)!;
  assert.equal(latest["caseId"], caseId);
  assert.equal(latest["finalFixStatus"], "user_provided");
});

await test("safe/read actions report not_configured and make no OBD/CAN/ECU calls", () => {
  const scan = proposeVehicleAction({ vehicleId, caseId, actionType: "obd_scan" });
  assert.equal(scan.status, "not_configured");
  assert.equal(scan.approvalRequired, false);
  assert.equal(scan.executed, false);
  assert.equal(scan.externalApiCallsMade, false);
});

await test("clear-code, CAN, actuator, and bidirectional actions require approval", () => {
  for (const actionType of ["clear_dtcs", "can_capture", "actuator_test", "bidirectional_test"] as const) {
    const proposal = proposeVehicleAction({ vehicleId, caseId, actionType });
    assert.equal(proposal.status, "approval_required");
    assert.equal(proposal.approvalRequired, true);
    assert.equal(proposal.executed, false);
    assert.equal(proposal.externalApiCallsMade, false);
    assert.equal(proposal.approval?.status, "waiting_for_approval");
  }
});

await test("denied vehicle actions do not execute", () => {
  const proposal = proposeVehicleAction({ vehicleId, caseId, actionType: "clear_dtcs" });
  denyRequest(proposal.approval!.id, "test denial");
  const denied = proposeVehicleAction({ vehicleId, caseId, actionType: "clear_dtcs", approvalId: proposal.approval!.id });
  assert.equal(denied.status, "denied");
  assert.equal(denied.executed, false);
  assert.equal(denied.externalApiCallsMade, false);
});

await test("approved vehicle actions still report not_configured instead of fake success", () => {
  const proposal = proposeVehicleAction({ vehicleId, caseId, actionType: "clear_dtcs" });
  approveRequest(proposal.approval!.id, "test approval");
  const approved = proposeVehicleAction({ vehicleId, caseId, actionType: "clear_dtcs", approvalId: proposal.approval!.id });
  assert.equal(approved.status, "not_configured");
  assert.equal(approved.executed, false);
  assert.equal(approved.externalApiCallsMade, false);
});

await test("ECU write, tune, and firmware actions are manual-only/blocked", () => {
  for (const actionType of ["ecu_write", "tune_change", "firmware_flash"] as const) {
    const proposal = proposeVehicleAction({ vehicleId, caseId, actionType, metadata: { note: privateVehicleSecret } });
    assert.equal(proposal.status, "manual_only");
    assert.equal(proposal.approvalRequired, false);
    assert.equal(proposal.executed, false);
    assert.equal(proposal.externalApiCallsMade, false);
    assert.ok(!JSON.stringify(proposal).includes("hunter2"));
  }
});

await test("audit records are metadata-only and do not contain private vehicle data", () => {
  const events = listAuditEvents(100).filter(event => event["eventType"] === "automotive_diagnostics");
  assert.ok(events.length >= 5);
  const eventText = JSON.stringify(events);
  assert.ok(!eventText.includes("1HGCM82633A004352"));
  assert.ok(!eventText.includes("hunter2"));
  assert.ok(!eventText.includes("vehicle_token_123"));
  assert.ok(events.every(event => (event["metadata"] as any)?.externalApiCallsMade === false));
  assert.ok(events.every(event => (event["metadata"] as any)?.privateContentsLogged === false));
});

if (failed > 0) {
  console.error(`\nPhase 18 automotive tests failed: ${failed}/${passed + failed}`);
  process.exit(1);
}

console.log(`\nPhase 18 automotive tests passed: ${passed}/${passed + failed}`);
