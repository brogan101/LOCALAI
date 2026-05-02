/**
 * IT SUPPORT COPILOT - Phase 12B Tests
 * ====================================
 * Covers:
 *   - Draft/proposal defaults for generated scripts
 *   - Required script safety metadata
 *   - Approval gating and denied/invalid approval behavior
 *   - Optional integration not_configured/disabled reporting
 *   - Dangerous IT commands blocked by the shared sanitizer
 *   - Audit records without private document or secret contents
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
sqlite.prepare("DELETE FROM it_support_artifacts").run();
sqlite.prepare("DELETE FROM approval_requests WHERE type = 'it_support_script_execute'").run();
sqlite.prepare("DELETE FROM audit_events WHERE event_type LIKE 'it_support_%'").run();
sqlite.prepare("DELETE FROM thought_log WHERE title LIKE 'IT Support%'").run();

import { approveRequest, denyRequest } from "../src/lib/approval-queue.js";
import { isDangerousCommand } from "../src/lib/command-sanitizer.js";
import {
  createItSupportArtifact,
  getItSupportArtifact,
  getItSupportStatus,
  IT_SUPPORT_SOURCE_OF_TRUTH,
  listItSupportIntegrations,
  listItSupportWorkflows,
  proposeItSupportScriptExecution,
  validateScriptSafety,
  type ItSupportSafetyContract,
} from "../src/lib/it-support.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
    .then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch((err) => { console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`); failed++; });
}

const completeContract: ItSupportSafetyContract = {
  purpose: "Validate a local Windows service in dry-run mode",
  adminRequired: false,
  reads: ["Local service metadata"],
  changes: ["None unless a later approved executor exists"],
  risks: ["Incorrect remediation could affect a service if manually adapted"],
  backupRestorePlan: "Export current service state and keep the draft log before future manual changes.",
  loggingPath: "$env:TEMP\\LOCALAI-ITSupport\\it-support-script.log",
  dryRunBehavior: "Uses -DryRun and SupportsShouldProcess / WhatIf behavior.",
  exitCodes: [
    { code: 0, meaning: "Dry-run succeeded" },
    { code: 1, meaning: "Validation failed" },
    { code: 2, meaning: "Approval/manual action required" },
  ],
  proofSteps: ["Review the generated log", "Confirm service state manually"],
};

await test("Phase 12B workflow registry exposes IT support copilot modes", () => {
  const workflows = listItSupportWorkflows();
  assert.equal(workflows.length, 8);
  assert.ok(workflows.some(workflow => workflow.id === "generate_powershell_script"));
  assert.ok(workflows.every(workflow => workflow.defaultMode === "review/dry_run"));
});

await test("optional IT integrations report not_configured or disabled without fake success", () => {
  const integrations = listItSupportIntegrations();
  assert.equal(integrations.length, 6);
  assert.ok(integrations.every(integration => ["not_configured", "disabled"].includes(integration.status)));
  assert.ok(integrations.some(integration => integration.id === "script-executor" && integration.status === "disabled"));
});

let artifactId = "";
const privateRequest = "Create a PowerShell diagnostic for jane@example.com password=hunter2 sk-phase12B-secret";

await test("generated scripts default to review/dry-run mode with required metadata", () => {
  const result = createItSupportArtifact({
    workflowType: "generate_powershell_script",
    title: "Service diagnostic helper",
    request: privateRequest,
  });
  assert.equal(result.success, true);
  assert.equal(result.executed, false);
  assert.equal(result.approvalRequired, false);
  assert.equal(result.status, "review");
  assert.equal(result.artifact?.status, "review_required");
  assert.equal(result.artifact?.executionMode, "review");
  assert.match(result.artifact!.scriptBody, /SupportsShouldProcess/);
  assert.match(result.artifact!.scriptBody, /\$DryRun/);
  assert.match(result.artifact!.scriptBody, /-WhatIf/);
  assert.ok(result.artifact!.safetyContract.purpose);
  assert.ok(result.artifact!.safetyContract.reads.length > 0);
  assert.ok(result.artifact!.safetyContract.changes.length > 0);
  assert.ok(result.artifact!.safetyContract.risks.length > 0);
  assert.ok(result.artifact!.safetyContract.backupRestorePlan);
  assert.ok(result.artifact!.safetyContract.loggingPath);
  assert.ok(result.artifact!.safetyContract.exitCodes.length >= 3);
  assert.ok(result.artifact!.safetyContract.proofSteps.length > 0);
  artifactId = result.artifact!.id;
});

await test("missing safety metadata is blocked instead of guessed", () => {
  const validation = validateScriptSafety("Write-Output 'hello'", {
    purpose: "",
    adminRequired: false,
    reads: [],
    changes: [],
    risks: [],
    backupRestorePlan: "",
    loggingPath: "",
    dryRunBehavior: "",
    exitCodes: [],
    proofSteps: [],
  });
  assert.equal(validation.valid, false);
  assert.ok(validation.blocked);
  assert.ok(validation.missingFields.includes("purpose"));
  assert.ok(validation.reasons.some(reason => reason.includes("WhatIf")));
});

await test("dangerous IT commands are blocked by the shared command sanitizer", () => {
  assert.equal(isDangerousCommand("Remove-ADUser -Identity jane").dangerous, true);
  assert.equal(isDangerousCommand("Set-NetFirewallProfile -Profile Domain -Enabled False").dangerous, true);
  assert.equal(isDangerousCommand("msiexec.exe /x {00000000-0000-0000-0000-000000000000}").dangerous, true);
});

await test("destructive script validation blocks manual-only commands", () => {
  const validation = validateScriptSafety("Remove-ADUser -Identity jane -WhatIf", completeContract);
  assert.equal(validation.valid, false);
  assert.equal(validation.blocked, true);
  assert.equal(validation.riskTier, "tier5_manual_only_prohibited");
});

let approvalId = "";

await test("script execution proposal requires approval and does not execute", () => {
  const result = proposeItSupportScriptExecution(artifactId, { mode: "dry_run" });
  assert.equal(result.success, false);
  assert.equal(result.executed, false);
  assert.equal(result.status, "approval_required");
  assert.equal(result.approvalRequired, true);
  assert.equal(result.approval?.status, "waiting_for_approval");
  approvalId = result.approval!.id;
  const stored = getItSupportArtifact(artifactId)!;
  assert.equal(stored.status, "approval_pending");
  assert.equal(stored.executionMode, "dry_run");
});

await test("denied script approval does not execute", () => {
  denyRequest(approvalId, "test denial");
  const result = proposeItSupportScriptExecution(artifactId, { mode: "dry_run", approvalId });
  assert.equal(result.success, false);
  assert.equal(result.executed, false);
  assert.equal(result.status, "approval_required");
  assert.equal(result.approval?.status, "denied");
});

await test("approved script proposal reports executor not_configured and still does not execute", () => {
  const pending = proposeItSupportScriptExecution(artifactId, { mode: "dry_run" });
  const approved = approveRequest(pending.approval!.id, "test approval");
  assert.equal(approved?.status, "approved");
  const result = proposeItSupportScriptExecution(artifactId, { mode: "dry_run", approvalId: pending.approval!.id });
  assert.equal(result.success, false);
  assert.equal(result.executed, false);
  assert.equal(result.status, "not_configured");
  assert.equal(result.approvalRequired, false);
});

await test("IT support status is local-first and requires no cloud or provider", () => {
  const status = getItSupportStatus();
  assert.equal(status.sourceOfTruth, IT_SUPPORT_SOURCE_OF_TRUTH);
  assert.equal(status.localFirst, true);
  assert.equal(status.cloudRequired, false);
  assert.equal(status.realExecutionEnabled, false);
  assert.equal(status.hardLimits.generatedScriptsExecuteByDefault, false);
});

await test("audit records do not expose private ticket contents or secrets", () => {
  const artifact = getItSupportArtifact(artifactId)!;
  const artifactText = JSON.stringify(artifact);
  assert.ok(!artifactText.includes("jane@example.com"));
  assert.ok(!artifactText.includes("hunter2"));
  assert.ok(!artifactText.includes("sk-phase12B-secret"));
  assert.equal(artifact.metadata["rawRequestStored"], false);

  const auditRows = sqlite.prepare(`
    SELECT metadata_json FROM audit_events
    WHERE event_type LIKE 'it_support_%'
  `).all() as Array<{ metadata_json: string }>;
  const auditText = JSON.stringify(auditRows);
  assert.ok(!auditText.includes("jane@example.com"));
  assert.ok(!auditText.includes("hunter2"));
  assert.ok(!auditText.includes("sk-phase12B-secret"));
  assert.ok(auditRows.length >= 2);
});

if (failed > 0) {
  console.error(`\n${failed} IT support test(s) failed; ${passed} passed.`);
  process.exit(1);
}

console.log(`\nIT support tests passed: ${passed}`);
