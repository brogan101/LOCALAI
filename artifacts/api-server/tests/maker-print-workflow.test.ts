/**
 * MAKER PRINT WORKFLOW - Phase 13C Tests
 * ======================================
 * Covers slicer/printer/material/monitoring provider status, dry-run slicing,
 * print approval gates, denied action safety, material blocking, and audit
 * redaction without requiring slicers, printers, Spoolman, Obico, network, or
 * external services.
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
sqlite.prepare("DELETE FROM approval_requests WHERE type IN ('maker_physical_action', 'maker_print_action')").run();
sqlite.prepare("DELETE FROM audit_events WHERE event_type LIKE 'maker_%'").run();

import { approveRequest, denyRequest } from "../src/lib/approval-queue.js";
import {
  checkMakerFilamentAvailability,
  createMakerProject,
  createMakerSlicingProposal,
  getMakerStudioStatus,
  listMakerPrintProviders,
  proposeMakerPrintProviderAction,
  proposeMakerPrintWorkflowAction,
} from "../src/lib/maker-studio.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
    .then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch((err) => { console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`); failed++; });
}

const secretValue = "printer_url=http://10.0.0.55 api_key=sk-phase13C-secret customer=jane@example.com";
const project = createMakerProject({
  name: "Printer workflow bracket",
  type: "3d_print",
  safetyTier: "simulate",
  cadFiles: [{ label: "bracket.stl", path: "C:/private/customer-bracket.stl" }],
  target: { kind: "printer", name: "Voron", status: "not_configured" },
  material: { name: "PLA", category: "filament", properties: { spoolId: "local-only" } },
  traceability: { note: secretValue },
});

await test("print provider registry reports missing slicers, printers, Spoolman, and Obico without fake success", () => {
  const providers = listMakerPrintProviders();
  const byId = new Map(providers.map(provider => [provider.id, provider]));
  assert.equal(byId.get("orcaslicer")?.status, "not_configured");
  assert.equal(byId.get("prusa-superslicer")?.status, "not_configured");
  assert.equal(byId.get("octoprint")?.status, "not_configured");
  assert.equal(byId.get("moonraker-klipper")?.status, "not_configured");
  assert.equal(byId.get("spoolman")?.status, "not_configured");
  assert.equal(byId.get("obico")?.status, "not_configured");
  assert.equal(byId.get("fdm-monster")?.status, "disabled");
  assert.ok(providers.every(provider => provider.executionEnabled === false));
  assert.ok(providers.every(provider => provider.proposalOnly === true));
  assert.ok(providers.every(provider => provider.dataLeavesMachine === false));
});

await test("status exposes Phase 13C providers while preserving local-first no-cost hard limits", () => {
  const status = getMakerStudioStatus();
  assert.equal(status.localFirst, true);
  assert.equal(status.cloudRequired, false);
  assert.equal(status.executionEnabled, false);
  assert.equal(status.machineControlEnabled, false);
  assert.equal(status.hardLimits.sendsGCode, false);
  assert.equal(status.hardLimits.slicesFiles, false);
  assert.equal(status.hardLimits.startsMachines, false);
  assert.ok(status.printProviders.some(provider => provider.id === "orcaslicer"));
  assert.ok(status.printProviders.some(provider => provider.id === "obico"));
});

await test("slicing proposal defaults to dry-run/config-validation without executing slicer or generating G-code", () => {
  const proposal = createMakerSlicingProposal({
    projectId: project.id,
    providerId: "orcaslicer",
    targetFileName: "bracket.gcode",
    printerProfile: "Voron 2.4 draft",
    material: { name: "PLA", category: "filament" },
    layerHeightMm: 0.2,
    nozzleMm: 0.4,
    infillPercent: 25,
  });
  assert.equal(proposal.success, true);
  assert.equal(proposal.status, "proposal");
  assert.equal(proposal.executed, false);
  assert.equal(proposal.proposalMode, "dry_run");
  assert.equal(proposal.provider.status, "not_configured");
  assert.equal(proposal.materialCheck.status, "manual_review");
  assert.equal(proposal.materialCheck.available, "unverified");
  assert.equal(proposal.metadata.toolExecutionAttempted, false);
  assert.equal(proposal.metadata.realFileSliced, false);
  assert.equal(proposal.metadata.gcodeGenerated, false);
  assert.equal(proposal.metadata.fileUploaded, false);
  assert.equal(proposal.metadata.dataLeavesMachine, false);
  assert.equal(proposal.metadata.cloudRequired, false);
  assert.equal(proposal.metadata.physicallySafeClaimed, false);
  assert.equal(proposal.metadata.manufacturableClaimed, false);
});

await test("filament/material check blocks queue proposals when material is missing or unknown", () => {
  const missingCheck = checkMakerFilamentAvailability({ material: { name: "unknown", category: "filament" } });
  assert.equal(missingCheck.status, "blocked");
  assert.equal(missingCheck.blocksQueue, true);
  assert.equal(missingCheck.available, false);

  const queueResult = proposeMakerPrintWorkflowAction(project.id, {
    actionType: "queue_print",
    providerId: "octoprint",
    material: { name: "unknown", category: "filament" },
  });
  assert.equal(queueResult.success, false);
  assert.equal(queueResult.status, "blocked");
  assert.equal(queueResult.executed, false);
  assert.equal(queueResult.approvalRequired, false);
  assert.equal(queueResult.workflow?.printQueued, false);
  assert.equal(queueResult.workflow?.apiCallsMade, false);
});

await test("print queue/start and heater/motor actions require approval and do not execute", () => {
  const queue = proposeMakerPrintWorkflowAction(project.id, { actionType: "queue_print", providerId: "octoprint" });
  assert.equal(queue.status, "approval_required");
  assert.equal(queue.executed, false);
  assert.equal(queue.approvalRequired, true);
  assert.equal(queue.approval?.physicalTier, "p2_prepare_queue");
  assert.equal(queue.workflow?.printQueued, false);
  assert.equal(queue.workflow?.fileUploaded, false);

  const start = proposeMakerPrintWorkflowAction(project.id, { actionType: "start_print", providerId: "octoprint" });
  assert.equal(start.status, "approval_required");
  assert.equal(start.approval?.physicalTier, "p4_approval_required");
  assert.equal(start.workflow?.printStarted, false);

  const heat = proposeMakerPrintWorkflowAction(project.id, { actionType: "set_temperature", providerId: "moonraker-klipper" });
  assert.equal(heat.status, "approval_required");
  assert.equal(heat.workflow?.heaterOrMotorCommandSent, false);
});

await test("denied print approvals and approved-but-unconfigured approvals do not execute", () => {
  const start = proposeMakerPrintWorkflowAction(project.id, { actionType: "start_print", providerId: "octoprint" });
  denyRequest(start.approval!.id, "test denial");
  const denied = proposeMakerPrintWorkflowAction(project.id, { actionType: "start_print", providerId: "octoprint", approvalId: start.approval!.id });
  assert.equal(denied.status, "approval_required");
  assert.equal(denied.executed, false);
  assert.equal(denied.workflow?.printStarted, false);

  const queue = proposeMakerPrintWorkflowAction(project.id, { actionType: "queue_print", providerId: "octoprint" });
  approveRequest(queue.approval!.id, "test approval");
  const approved = proposeMakerPrintWorkflowAction(project.id, { actionType: "queue_print", providerId: "octoprint", approvalId: queue.approval!.id });
  assert.equal(approved.status, "not_configured");
  assert.equal(approved.executed, false);
  assert.equal(approved.workflow?.apiCallsMade, false);
  assert.equal(approved.workflow?.fileUploaded, false);
});

await test("Obico monitoring unavailable state is visible and does not fake monitoring", () => {
  const monitor = proposeMakerPrintWorkflowAction(project.id, { actionType: "monitor_failure", providerId: "obico" });
  assert.equal(monitor.success, false);
  assert.equal(monitor.status, "not_configured");
  assert.equal(monitor.executed, false);
  assert.equal(monitor.workflow?.monitoringActive, false);
  assert.equal(monitor.workflow?.apiCallsMade, false);

  const providerAction = proposeMakerPrintProviderAction("obico", "monitoring_status");
  assert.equal(providerAction.status, "not_configured");
  assert.equal(providerAction.executed, false);
});

await test("audit records omit printer tokens, private URLs, project paths, and secrets", () => {
  const auditRows = sqlite.prepare(`
    SELECT metadata_json FROM audit_events
    WHERE event_type LIKE 'maker_%'
  `).all() as Array<{ metadata_json: string }>;
  assert.ok(auditRows.length >= 6);
  const auditText = JSON.stringify(auditRows);
  assert.ok(!auditText.includes("10.0.0.55"));
  assert.ok(!auditText.includes("sk-phase13C-secret"));
  assert.ok(!auditText.includes("jane@example.com"));
  assert.ok(!auditText.includes("customer-bracket.stl"));
  assert.ok(!auditText.includes("C:/private"));
});

if (failed > 0) {
  console.error(`\n${failed} Maker print workflow test(s) failed; ${passed} passed.`);
  process.exit(1);
}

console.log(`\nMaker print workflow tests passed: ${passed}`);
