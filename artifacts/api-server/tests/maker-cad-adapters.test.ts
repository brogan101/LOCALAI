/**
 * MAKER CAD ADAPTERS - Phase 13B Tests
 * =====================================
 * Covers:
 *   - optional FreeCAD/CAD-as-code/KiCad/cloud provider status
 *   - CAD-as-code and KiCad proposal metadata without external tool execution
 *   - blocked/manual-only fabrication/manufacturing actions
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
sqlite.prepare("DELETE FROM audit_events WHERE event_type LIKE 'maker_%'").run();

import {
  createMakerDesignProposal,
  createMakerProject,
  getMakerStudioStatus,
  listMakerCadProviders,
  listMakerCadArtifacts,
  proposeMakerCadProviderAction,
} from "../src/lib/maker-studio.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
    .then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch((err) => { console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`); failed++; });
}

await test("CAD provider registry is local-first by default and reports missing optional tools", () => {
  const providers = listMakerCadProviders();
  const byId = new Map(providers.map(provider => [provider.id, provider]));
  assert.equal(byId.get("freecad-mcp")?.status, "not_configured");
  assert.equal(byId.get("cadquery")?.status, "not_configured");
  assert.equal(byId.get("build123d")?.status, "not_configured");
  assert.equal(byId.get("openscad-style")?.status, "not_configured");
  assert.equal(byId.get("kicad-mcp")?.status, "not_configured");
  assert.equal(byId.get("gnucleus-text-to-cad")?.status, "disabled");
  assert.equal(byId.get("buildcad-ai")?.status, "disabled");
  assert.ok(providers.every(provider => provider.executionEnabled === false));
  assert.ok(providers.every(provider => provider.proposalOnly === true));
  assert.ok(providers.every(provider => provider.dataLeavesMachine === false));
  assert.ok(byId.get("gnucleus-text-to-cad")?.cloudProvider);
  assert.ok(byId.get("gnucleus-text-to-cad")?.apiKeyRequired);
});

const secretValue = "customer=jane@example.com api_key=sk-phase13B-secret proprietary design notes";
const project = createMakerProject({
  name: "CAD adapter bracket",
  type: "cad",
  safetyTier: "simulate",
  material: { name: "6061 aluminum", category: "stock" },
  traceability: { note: secretValue },
});

await test("status exposes Phase 13B providers without enabling execution or cloud", () => {
  const status = getMakerStudioStatus();
  assert.equal(status.localFirst, true);
  assert.equal(status.cloudRequired, false);
  assert.equal(status.executionEnabled, false);
  assert.equal(status.machineControlEnabled, false);
  assert.ok(status.cadProviders.some(provider => provider.id === "freecad-mcp"));
  assert.ok(status.cadProviders.some(provider => provider.id === "kicad-mcp"));
  assert.ok(status.cadProviders.every(provider => provider.executionEnabled === false));
});

await test("CAD-as-code proposals are represented without executing external CAD tools", () => {
  const proposal = createMakerDesignProposal({
    projectId: project.id,
    providerId: "cadquery",
    designKind: "cadquery",
    targetFileName: "fixture.py",
    units: "mm",
    dimensions: { widthMm: 80, depthMm: 40, heightMm: 12 },
    assumptions: ["Draft parametric block", "Human validates tolerances"],
    constraints: ["Approved Maker workspace before execution"],
    exportTargets: ["STEP proposal", "STL proposal"],
    validationSteps: ["Review units", "Check bounding box"],
    riskNotes: ["Not printable or manufacturable without review", secretValue],
  });
  assert.equal(proposal.success, true);
  assert.equal(proposal.status, "proposal");
  assert.equal(proposal.executed, false);
  assert.equal(proposal.proposalMode, "dry_run");
  assert.equal(proposal.provider.status, "not_configured");
  assert.equal(proposal.metadata.toolExecutionAttempted, false);
  assert.equal(proposal.metadata.executionEnabled, false);
  assert.equal(proposal.metadata.scriptStored, false);
  assert.equal(proposal.metadata.dataLeavesMachine, false);
  assert.equal(proposal.metadata.cloudRequired, false);
  assert.deepEqual(proposal.metadata.targetFileNames, ["fixture.py"]);
  assert.equal(proposal.metadata.units, "mm");
  assert.equal(proposal.metadata.dimensions.widthMm, 80);
  assert.ok(proposal.metadata.constraints.length > 0);
  assert.ok(proposal.metadata.assumptions.length > 0);
  assert.ok(proposal.metadata.exportTargets.includes("STEP proposal"));
  assert.ok(proposal.metadata.validationSteps.includes("Review units"));
  assert.equal(proposal.metadata.reviewRequired, true);
  assert.equal(proposal.metadata.physicallySafeClaimed, false);
  assert.equal(proposal.metadata.manufacturableClaimed, false);
  assert.ok(proposal.metadata.workspaceRelativePath.startsWith(`maker/${project.id}/proposals/`));
  assert.ok(!JSON.stringify(proposal).includes("jane@example.com"));
  assert.ok(!JSON.stringify(proposal).includes("sk-phase13B-secret"));
});

await test("KiCad proposal metadata works without KiCad execution", () => {
  const proposal = createMakerDesignProposal({
    projectId: project.id,
    providerId: "kicad-mcp",
    designKind: "kicad_project",
    targetFileName: "controller.kicad_pro",
    exportTargets: ["ERC report proposal", "DRC report proposal", "BOM report proposal"],
  });
  assert.equal(proposal.provider.id, "kicad-mcp");
  assert.equal(proposal.provider.status, "not_configured");
  assert.equal(proposal.metadata.designKind, "kicad_project");
  assert.equal(proposal.metadata.toolExecutionAttempted, false);
  assert.ok(proposal.metadata.exportTargets.includes("BOM report proposal"));
});

await test("cloud text-to-CAD providers are disabled/not_configured and cannot fake success", () => {
  assert.throws(() => createMakerDesignProposal({
    projectId: project.id,
    providerId: "gnucleus-text-to-cad",
    designKind: "cadquery",
    targetFileName: "cloud.step",
  }), /disabled\/not_configured/);
  const result = proposeMakerCadProviderAction("gnucleus-text-to-cad", "cloud_text_to_cad");
  assert.equal(result.success, false);
  assert.equal(result.executed, false);
  assert.equal(result.status, "disabled");
  assert.equal(result.approvalRequired, false);
});

await test("CAD provider actions do not execute and fabrication remains manual-only", () => {
  const render = proposeMakerCadProviderAction("freecad-mcp", "render_export");
  assert.equal(render.success, false);
  assert.equal(render.executed, false);
  assert.equal(render.status, "not_configured");

  const manufacture = proposeMakerCadProviderAction("cadquery", "manufacture");
  assert.equal(manufacture.success, false);
  assert.equal(manufacture.executed, false);
  assert.equal(manufacture.status, "manual_only");
  assert.match(manufacture.reason, /manual-only|blocked/i);
});

await test("stored proposal metadata and audit records omit private project data and secrets", () => {
  const artifacts = listMakerCadArtifacts(project.id);
  assert.ok(artifacts.length >= 2);
  const artifactText = JSON.stringify(artifacts);
  assert.ok(!artifactText.includes("jane@example.com"));
  assert.ok(!artifactText.includes("sk-phase13B-secret"));

  const auditRows = sqlite.prepare(`
    SELECT metadata_json FROM audit_events
    WHERE event_type LIKE 'maker_%'
  `).all() as Array<{ metadata_json: string }>;
  assert.ok(auditRows.length >= 4);
  const auditText = JSON.stringify(auditRows);
  assert.ok(!auditText.includes("jane@example.com"));
  assert.ok(!auditText.includes("sk-phase13B-secret"));
  assert.ok(!auditText.includes("proprietary design notes"));
});

if (failed > 0) {
  console.error(`\n${failed} Maker CAD adapter test(s) failed; ${passed} passed.`);
  process.exit(1);
}

console.log(`\nMaker CAD adapter tests passed: ${passed}`);
