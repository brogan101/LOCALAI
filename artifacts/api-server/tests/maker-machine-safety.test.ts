/**
 * MAKER MACHINE SAFETY - Phase 13D Tests
 * ======================================
 * Covers CNC/laser/CAM/electronics provider status, setup-sheet metadata,
 * manual-only dangerous actions, denied approval safety, and audit redaction
 * without requiring CNC, laser, CAM, serial, USB, firmware, relay, electronics,
 * network, cloud APIs, or hardware.
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
sqlite.prepare("DELETE FROM maker_cad_artifacts").run();
sqlite.prepare("DELETE FROM maker_materials").run();
sqlite.prepare("DELETE FROM maker_projects").run();
sqlite.prepare("DELETE FROM approval_requests WHERE type IN ('maker_physical_action', 'maker_print_action', 'maker_machine_action')").run();
sqlite.prepare("DELETE FROM audit_events WHERE event_type LIKE 'maker_%'").run();

import { denyRequest } from "../src/lib/approval-queue.js";
import {
  createMakerMachineSetupSheet,
  createMakerProject,
  getMakerStudioStatus,
  listMakerMachineProviders,
  proposeMakerMachineProviderAction,
  proposeMakerMachineWorkflowAction,
} from "../src/lib/maker-studio.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
    .then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch((err) => { console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`); failed++; });
}

const secretValue = "serial=USB-SECRET-123 api_key=sk-phase13D-secret customer=jane@example.com proprietary machine file";
const project = createMakerProject({
  name: "CNC laser bench safety fixture",
  type: "cnc",
  safetyTier: "simulate",
  cadFiles: [{ label: "fixture.step", path: "C:/private/customer-fixture.step" }],
  target: { kind: "cnc", name: "Shapeoko", status: "manual_only" },
  material: { name: "6061 aluminum", category: "stock", properties: { dimensions: { x: 120, y: 80, z: 10 } } },
  traceability: { note: secretValue },
});

await test("machine provider registry reports missing CNC/laser/CAM/electronics providers without fake success", () => {
  const providers = listMakerMachineProviders();
  const byId = new Map(providers.map(provider => [provider.id, provider]));
  assert.equal(byId.get("freecad-path-cam")?.status, "not_configured");
  assert.equal(byId.get("cncjs")?.status, "not_configured");
  assert.equal(byId.get("linuxcnc")?.status, "not_configured");
  assert.equal(byId.get("fluidnc")?.status, "not_configured");
  assert.equal(byId.get("bcnc")?.status, "not_configured");
  assert.equal(byId.get("lightburn-style-laser")?.status, "not_configured");
  assert.equal(byId.get("kicad-electronics-bench")?.status, "not_configured");
  assert.equal(byId.get("serial-usb-devices")?.status, "disabled");
  assert.ok(providers.every(provider => provider.executionEnabled === false));
  assert.ok(providers.every(provider => provider.hardwareWriteEnabled === false));
  assert.ok(providers.every(provider => provider.proposalOnly === true));
  assert.ok(providers.every(provider => provider.dataLeavesMachine === false));
});

await test("status exposes Phase 13D providers while preserving local-first no-cost hard limits", () => {
  const status = getMakerStudioStatus();
  assert.equal(status.localFirst, true);
  assert.equal(status.cloudRequired, false);
  assert.equal(status.executionEnabled, false);
  assert.equal(status.machineControlEnabled, false);
  assert.equal(status.hardLimits.sendsGCode, false);
  assert.equal(status.hardLimits.controlsHardware, false);
  assert.equal(status.hardLimits.flashesFirmware, false);
  assert.ok(status.machineProviders.some(provider => provider.id === "cncjs"));
  assert.ok(status.machineProviders.some(provider => provider.id === "lightburn-style-laser"));
});

await test("setup sheet is proposal-only and includes required CNC/laser safety metadata", () => {
  const sheet = createMakerMachineSetupSheet({
    projectId: project.id,
    providerId: "freecad-path-cam",
    operationType: "cnc_milling",
    targetFileName: "fixture-setup.md",
    machineProfile: "Shapeoko unverified",
    stock: { name: "6061 aluminum", category: "stock", dimensions: { xMm: 120, yMm: 80, zMm: 10 } },
    tool: { name: "1/8 flat endmill", type: "endmill", diameterMm: 3.175 },
    workholding: "Clamp in vise after human review",
    coordinateOrigin: "Front-left-top, verify at machine",
    units: "mm",
    speedFeedPowerEstimates: { spindleRpm: 12000, feedRateMmMin: 450, plungeRateMmMin: 120 },
    assumptions: ["Human verifies stock and origin"],
    ppeNotes: ["Eye protection", "Hearing protection"],
    verificationChecklist: ["Verify stock", "Verify tool", "Verify origin", "Verify simulation"],
  });
  assert.equal(sheet.success, true);
  assert.equal(sheet.status, "proposal");
  assert.equal(sheet.executed, false);
  assert.equal(sheet.provider.status, "not_configured");
  assert.equal(sheet.metadata.operationType, "cnc_milling");
  assert.equal(sheet.metadata.machineProfile, "Shapeoko unverified");
  assert.equal(sheet.metadata.units, "mm");
  assert.ok(sheet.metadata.assumptions.length > 0);
  assert.ok(sheet.metadata.safetyRisks.length > 0);
  assert.ok(sheet.metadata.ppeNotes.includes("Eye protection"));
  assert.ok(sheet.metadata.verificationChecklist.includes("Verify simulation"));
  assert.equal(sheet.metadata.manualConfirmationRequired, true);
  assert.equal(sheet.metadata.machineSideConfirmationRequired, true);
  assert.equal(sheet.metadata.productionReadyClaimed, false);
  assert.equal(sheet.metadata.machineReadyClaimed, false);
  assert.equal(sheet.metadata.toolpathGenerated, false);
  assert.equal(sheet.metadata.gcodeGenerated, false);
  assert.equal(sheet.metadata.gcodeSent, false);
  assert.equal(sheet.metadata.machineMotionCommandSent, false);
  assert.equal(sheet.metadata.spindleStarted, false);
  assert.equal(sheet.metadata.laserFired, false);
  assert.equal(sheet.metadata.serialOrUsbWriteAttempted, false);
  assert.equal(sheet.metadata.hardwareControlAttempted, false);
});

await test("CAM/toolpath actions default to approval-required proposal and do not execute", () => {
  const result = proposeMakerMachineWorkflowAction(project.id, {
    actionType: "generate_toolpath",
    providerId: "freecad-path-cam",
    operationType: "cnc_milling",
  });
  assert.equal(result.status, "approval_required");
  assert.equal(result.executed, false);
  assert.equal(result.approvalRequired, true);
  assert.equal(result.workflow?.toolpathGenerated, false);
  assert.equal(result.workflow?.apiCallsMade, false);
  assert.equal(result.approval?.physicalTier, "p2_prepare_queue");
});

await test("G-code send, motion, spindle, laser, firmware, relay, serial, and USB actions are manual-only", () => {
  for (const actionType of ["send_gcode", "axis_motion", "spindle_start", "laser_fire", "flash_firmware", "toggle_relay_power", "serial_write", "usb_write"]) {
    const result = proposeMakerMachineWorkflowAction(project.id, { actionType, providerId: "cncjs", operationType: "cnc_milling" });
    assert.equal(result.status, "manual_only", actionType);
    assert.equal(result.executed, false, actionType);
    assert.equal(result.workflow?.gcodeSent, false, actionType);
    assert.equal(result.workflow?.machineMotionCommandSent, false, actionType);
    assert.equal(result.workflow?.spindleStarted, false, actionType);
    assert.equal(result.workflow?.laserFired, false, actionType);
    assert.equal(result.workflow?.relayOrPowerCommandSent, false, actionType);
    assert.equal(result.workflow?.firmwareFlashed, false, actionType);
    assert.equal(result.workflow?.serialOrUsbWriteAttempted, false, actionType);
    assert.equal(result.workflow?.hardwareControlAttempted, false, actionType);
  }
});

await test("denied machine approvals and disabled provider actions do not execute", () => {
  const toolpath = proposeMakerMachineWorkflowAction(project.id, { actionType: "generate_toolpath", providerId: "freecad-path-cam" });
  denyRequest(toolpath.approval!.id, "test denial");
  const denied = proposeMakerMachineWorkflowAction(project.id, { actionType: "generate_toolpath", providerId: "freecad-path-cam", approvalId: toolpath.approval!.id });
  assert.equal(denied.status, "approval_required");
  assert.equal(denied.executed, false);
  assert.equal(denied.workflow?.toolpathGenerated, false);

  const serial = proposeMakerMachineProviderAction("serial-usb-devices", "serial_write");
  assert.equal(serial.status, "manual_only");
  assert.equal(serial.executed, false);
});

await test("electronics bench setup sheet plans KiCad/BOM/InvenTree work without hardware or serial calls", () => {
  const sheet = createMakerMachineSetupSheet({
    projectId: project.id,
    providerId: "kicad-electronics-bench",
    operationType: "electronics_bench",
    targetFileName: "bench-setup.md",
    tool: { name: "DMM and bench supply", type: "bench_equipment" },
    assumptions: ["KiCad project flow is proposal-only", "BOM export/import and InvenTree parts check require later configuration"],
  });
  assert.equal(sheet.provider.id, "kicad-electronics-bench");
  assert.equal(sheet.metadata.operationType, "electronics_bench");
  assert.equal(sheet.metadata.firmwareFlashed, false);
  assert.equal(sheet.metadata.relayOrPowerCommandSent, false);
  assert.equal(sheet.metadata.serialOrUsbWriteAttempted, false);
  assert.equal(sheet.metadata.apiCallsMade, false);
});

await test("audit and artifact records omit serial IDs, tokens, private paths, and secrets", () => {
  const artifacts = sqlite.prepare(`
    SELECT metadata_json, path FROM maker_cad_artifacts
    WHERE artifact_type = 'phase13d_machine_setup_sheet'
  `).all() as Array<{ metadata_json: string; path: string | null }>;
  assert.ok(artifacts.length >= 2);

  const auditRows = sqlite.prepare(`
    SELECT metadata_json FROM audit_events
    WHERE event_type LIKE 'maker_%'
  `).all() as Array<{ metadata_json: string }>;
  assert.ok(auditRows.length >= 6);
  const combined = JSON.stringify({ artifacts, auditRows });
  assert.ok(!combined.includes("USB-SECRET-123"));
  assert.ok(!combined.includes("sk-phase13D-secret"));
  assert.ok(!combined.includes("jane@example.com"));
  assert.ok(!combined.includes("customer-fixture.step"));
  assert.ok(!combined.includes("C:/private"));
  assert.ok(!combined.includes("proprietary machine file"));
});

if (failed > 0) {
  console.error(`\n${failed} Maker machine safety test(s) failed; ${passed} passed.`);
  process.exit(1);
}

console.log(`\nMaker machine safety tests passed: ${passed}`);
