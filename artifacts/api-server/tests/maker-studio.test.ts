/**
 * MAKER STUDIO FOUNDATION - Phase 13A Tests
 * =========================================
 * Covers:
 *   - local-first Maker Studio status with no external tools required
 *   - disabled/not_configured optional maker integrations
 *   - project/material/CAD metadata persistence
 *   - physical action proposal, approval, and manual-only blocking behavior
 *   - audit records without private project data or secrets
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
sqlite.prepare("DELETE FROM approval_requests WHERE type = 'maker_physical_action'").run();
sqlite.prepare("DELETE FROM audit_events WHERE event_type LIKE 'maker_%'").run();

import { approveRequest } from "../src/lib/approval-queue.js";
import {
  createMakerCadArtifact,
  createMakerMaterial,
  createMakerProject,
  getMakerProject,
  getMakerStudioStatus,
  listMakerIntegrations,
  listMakerSafetyPolicies,
  MAKER_STUDIO_SOURCE_OF_TRUTH,
  proposeMakerIntegrationAction,
  proposeMakerPhysicalAction,
} from "../src/lib/maker-studio.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
    .then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch((err) => { console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`); failed++; });
}

await test("Maker Studio status is local-first and requires no external maker tools", () => {
  const status = getMakerStudioStatus();
  assert.equal(status.sourceOfTruth, MAKER_STUDIO_SOURCE_OF_TRUTH);
  assert.equal(status.localFirst, true);
  assert.equal(status.cloudRequired, false);
  assert.equal(status.executionEnabled, false);
  assert.equal(status.machineControlEnabled, false);
  assert.equal(status.hardLimits.sendsGCode, false);
  assert.equal(status.hardLimits.slicesFiles, false);
  assert.equal(status.hardLimits.startsMachines, false);
});

await test("physical safety policies cover read-only through manual-only at machine", () => {
  const policies = listMakerSafetyPolicies();
  assert.deepEqual(policies.map(policy => policy.id), [
    "read_only",
    "simulate",
    "prepare_queue",
    "approval_required_run",
    "manual_only_at_machine",
  ]);
  assert.ok(policies.some(policy => policy.physicalTier === "p5_manual_only_at_machine" && !policy.executionAllowed));
});

await test("optional maker integrations report not_configured/disabled and cannot execute", () => {
  const integrations = listMakerIntegrations();
  assert.ok(integrations.length >= 10);
  for (const id of [
    "freecad",
    "cadquery-build123d",
    "kicad",
    "octoprint",
    "freecad-path-cam",
    "lightburn-style-laser",
    "serial-usb-shop-devices",
  ]) {
    assert.ok(integrations.some(integration => integration.id === id), `missing maker integration ${id}`);
  }
  assert.ok(integrations.every(integration => ["not_configured", "disabled", "degraded"].includes(integration.status)));
  assert.ok(integrations.every(integration => integration.executionEnabled === false));
  const result = proposeMakerIntegrationAction("octoprint", "start_print");
  assert.equal(result.success, false);
  assert.equal(result.executed, false);
  assert.equal(result.status, "not_configured");
});

const secretValue = "owner=jane@example.com password=hunter2 sk-phase13A-secret";
let projectId = "";

await test("project model persists files, target, material, safety tier, and redacted traceability", () => {
  const project = createMakerProject({
    name: "Printer bracket",
    type: "3d_print",
    safetyTier: "simulate",
    relatedFiles: [{ label: "requirements", path: "C:/private/project-notes.md" }],
    cadFiles: [{ label: "bracket.scad", path: "C:/private/bracket.scad" }],
    slicedFiles: [{ label: "bracket.gcode", path: "C:/private/bracket.gcode" }],
    target: { kind: "printer", name: "Voron", status: "not_configured" },
    material: { name: "PLA", category: "filament" },
    traceability: { note: secretValue },
  });
  projectId = project.id;
  const stored = getMakerProject(project.id)!;
  assert.equal(stored.type, "3d_print");
  assert.equal(stored.safetyTier, "simulate");
  assert.equal(stored.physicalTier, "p1_suggest");
  assert.equal(stored.relatedFiles.length, 1);
  assert.equal(stored.cadFiles.length, 1);
  assert.equal(stored.slicedFiles.length, 1);
  assert.equal(stored.target.status, "not_configured");
  assert.equal(stored.material.name, "PLA");
  const storedText = JSON.stringify(stored);
  assert.ok(!storedText.includes("jane@example.com"));
  assert.ok(!storedText.includes("hunter2"));
  assert.ok(!storedText.includes("sk-phase13A-secret"));
});

await test("material and CAD artifact metadata persist without external services", () => {
  const material = createMakerMaterial({
    name: "6061 aluminum",
    category: "stock",
    properties: { thicknessMm: 6 },
    safetyNotes: ["Sharp edges after milling"],
  });
  assert.equal(material.category, "stock");

  const artifact = createMakerCadArtifact({
    projectId,
    artifactType: "openscad_metadata",
    name: "Bracket CAD metadata",
    path: "C:/private/bracket.scad",
    metadata: { source: "proposal", privateNote: secretValue },
  });
  assert.equal(artifact.projectId, projectId);
  assert.equal(artifact.status, "proposal");
  const artifactText = JSON.stringify(artifact);
  assert.ok(!artifactText.includes("jane@example.com"));
  assert.ok(!artifactText.includes("hunter2"));
  assert.ok(!artifactText.includes("sk-phase13A-secret"));
});

await test("simulate action records proposal only and does not require approval", () => {
  const result = proposeMakerPhysicalAction(projectId, { actionType: "simulate" });
  assert.equal(result.success, true);
  assert.equal(result.status, "proposal");
  assert.equal(result.executed, false);
  assert.equal(result.approvalRequired, false);
});

await test("physical run action is approval-required and still does not execute", () => {
  const result = proposeMakerPhysicalAction(projectId, { actionType: "start_print" });
  assert.equal(result.success, false);
  assert.equal(result.status, "approval_required");
  assert.equal(result.executed, false);
  assert.equal(result.approvalRequired, true);
  assert.equal(result.approval?.status, "waiting_for_approval");
  assert.equal(result.approval?.physicalTier, "p4_approval_required");

  approveRequest(result.approval!.id, "test approval");
  const approvedResult = proposeMakerPhysicalAction(projectId, { actionType: "start_print", approvalId: result.approval!.id });
  assert.equal(approvedResult.success, false);
  assert.equal(approvedResult.status, "not_configured");
  assert.equal(approvedResult.executed, false);
});

await test("dangerous CNC/laser-style action is manual-only and auto-denied", () => {
  const result = proposeMakerPhysicalAction(projectId, { actionType: "start_cnc" });
  assert.equal(result.success, false);
  assert.equal(result.executed, false);
  assert.equal(result.status, "manual_only");
  assert.equal(result.approval?.status, "denied");
  assert.equal(result.approval?.physicalTier, "p5_manual_only_at_machine");
});

await test("audit records do not expose private project data or secrets", () => {
  const auditRows = sqlite.prepare(`
    SELECT metadata_json FROM audit_events
    WHERE event_type LIKE 'maker_%'
  `).all() as Array<{ metadata_json: string }>;
  assert.ok(auditRows.length >= 5);
  const auditText = JSON.stringify(auditRows);
  assert.ok(!auditText.includes("jane@example.com"));
  assert.ok(!auditText.includes("hunter2"));
  assert.ok(!auditText.includes("sk-phase13A-secret"));
  assert.ok(!auditText.includes("C:/private/bracket.scad"));
});

if (failed > 0) {
  console.error(`\n${failed} Maker Studio test(s) failed; ${passed} passed.`);
  process.exit(1);
}

console.log(`\nMaker Studio tests passed: ${passed}`);
