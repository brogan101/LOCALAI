/**
 * LOCAL BUILDER TEST SUITE — Phase 22
 *
 * Covers:
 *   1.  localFirst = true in status
 *   2.  cloudEscalationEnabled = false (hard limit, never toggleable)
 *   3.  selfModificationAllowed = false (hard limit)
 *   4.  requireApprovalForEdits = true (hard limit)
 *   5.  All 4 roles present in profiles by default
 *   6.  All 4 context packs exist on disk
 *   7.  Context pack content is non-empty
 *   8.  Shell metacharacter in phaseId → hard block
 *   9.  Self-modification target → hard block
 *  10.  Hard-blocked proposal returns success=false, not executed
 *  11.  Denied proposal does not execute (approvalRequired=true on proposal)
 *  12.  Missing model → status = not_configured
 *  13.  saveLocalBuilderProfile preserves hard limits
 *  14.  All 4 evals run without network (usedNetwork=false)
 *  15.  Eval output contains no secrets or API keys
 *  16.  Eval history persists across calls
 *  17.  getContextPack returns null for unknown name
 *  18.  getContextPacks returns array of known packs
 */

import assert from "assert";
import path from "path";
import { fileURLToPath } from "url";
import {
  getLocalBuilderStatus,
  getLocalBuilderProfiles,
  saveLocalBuilderProfile,
  getContextPacks,
  getContextPack,
  proposeBuildTask,
  runLocalBuilderEval,
  getEvalHistory,
  LOCAL_BUILDER_SOURCE_OF_TRUTH,
} from "../src/lib/local-builder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { console.log(`  ✓  ${name}`); passed++; })
    .catch((err: unknown) => {
      console.error(`  ✗  ${name}`);
      console.error(`       ${(err as Error).message}`);
      failed++;
    });
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n── Local Builder tests ──────────────────────────────────────────");

  // 1. localFirst = true
  await test("status.localFirst is always true", () => {
    const s = getLocalBuilderStatus();
    assert.strictEqual(s.localFirst, true, "localFirst must be true");
  });

  // 2. cloudEscalationEnabled = false (hard limit)
  await test("status.cloudEscalationEnabled is always false", () => {
    const s = getLocalBuilderStatus();
    assert.strictEqual(s.cloudEscalationEnabled, false, "cloudEscalationEnabled must be false");
  });

  // 3. selfModificationAllowed = false (hard limit)
  await test("status.selfModificationAllowed is always false", () => {
    const s = getLocalBuilderStatus();
    assert.strictEqual(s.selfModificationAllowed, false, "selfModificationAllowed must be false");
  });

  // 4. requireApprovalForEdits = true (hard limit)
  await test("status.requireApprovalForEdits is always true", () => {
    const s = getLocalBuilderStatus();
    assert.strictEqual(s.requireApprovalForEdits, true, "requireApprovalForEdits must be true");
  });

  // 5. All 4 roles present in profiles
  await test("getLocalBuilderProfiles returns all 4 roles", () => {
    const profiles = getLocalBuilderProfiles();
    const roles = profiles.map((p) => p.role);
    assert.ok(roles.includes("fast_code"),     "missing fast_code role");
    assert.ok(roles.includes("deep_code"),     "missing deep_code role");
    assert.ok(roles.includes("reviewer"),      "missing reviewer role");
    assert.ok(roles.includes("rag_embedding"), "missing rag_embedding role");
  });

  // 6. All 4 context packs exist on disk
  await test("all 4 context packs exist in docs/context-packs/", async () => {
    const packs = await getContextPacks();
    const names = packs.map((p) => p.name);
    assert.ok(names.includes("core-architecture"),      "missing core-architecture.md");
    assert.ok(names.includes("safety-and-permissions"), "missing safety-and-permissions.md");
    assert.ok(names.includes("current-build-state"),    "missing current-build-state.md");
    assert.ok(names.includes("next-phase-template"),    "missing next-phase-template.md");
  });

  // 7. Context pack content is non-empty
  await test("context packs have non-empty content and sizeBytes > 100", async () => {
    const packs = await getContextPacks();
    assert.ok(packs.length >= 4, `expected 4 packs, got ${packs.length}`);
    for (const pack of packs) {
      assert.ok(pack.sizeBytes > 100, `pack ${pack.name} is suspiciously small (${pack.sizeBytes} bytes)`);
      assert.ok(pack.content.length > 50,  `pack ${pack.name} content is too short`);
    }
  });

  // 8. Shell metacharacter in phaseId → hard block
  await test("phaseId with semicolon triggers hard block", async () => {
    const result = await proposeBuildTask({
      phaseId:      "22; rm -rf /",
      taskSummary:  "test unsafe chars",
      contextPacks: [],
    });
    assert.strictEqual(result.proposal.hardBlocked, true, "should be hard blocked");
    assert.strictEqual(result.success, false, "success must be false on hard block");
  });

  // 9. Self-modification target → hard block
  await test("targetFiles pointing at own source triggers hard block", async () => {
    const result = await proposeBuildTask({
      phaseId:     "22",
      taskSummary: "test self-mod block",
      contextPacks: [],
      targetFiles: ["artifacts/api-server/src/lib/local-builder.ts"],
    });
    assert.strictEqual(result.proposal.hardBlocked, true, "self-mod must be hard blocked");
  });

  // 10. Hard-blocked proposal never returns success=true
  await test("hard-blocked proposal has success=false and no execution side effect", async () => {
    const result = await proposeBuildTask({
      phaseId:      "22|attack",
      taskSummary:  "malicious task",
      contextPacks: [],
    });
    assert.strictEqual(result.success, false, "hard blocked must not return success=true");
    assert.strictEqual(result.proposal.hardBlocked, true);
    // Proposal must still carry hard limit fields
    assert.strictEqual(result.proposal.cloudEscalationEnabled,  false);
    assert.strictEqual(result.proposal.selfModificationAllowed, false);
    assert.strictEqual(result.proposal.approvalRequired,        true);
  });

  // 11. Normal proposal → approvalRequired=true, not executed
  await test("normal proposal returns approvalRequired=true and is not executed", async () => {
    const result = await proposeBuildTask({
      phaseId:      "test-phase",
      taskSummary:  "Add a new utility function to helpers.ts",
      contextPacks: ["core-architecture"],
      targetFiles:  ["artifacts/api-server/src/lib/helpers.ts"],
    });
    // success=false because approval is pending
    assert.strictEqual(result.proposal.approvalRequired, true, "approvalRequired must be true");
    assert.strictEqual(result.proposal.status, "proposed");
    // Hard limits still enforced on approved proposals
    assert.strictEqual(result.proposal.cloudEscalationEnabled,  false);
    assert.strictEqual(result.proposal.selfModificationAllowed, false);
  });

  // 12. Missing model → not_configured status
  await test("unconfigured profile has status=not_configured", () => {
    // Reset fast_code to unconfigured
    const saved = saveLocalBuilderProfile("fast_code", { modelName: null, status: "not_configured" });
    assert.strictEqual(saved.status, "not_configured");
    assert.strictEqual(saved.modelName, null);
  });

  // 13. saveLocalBuilderProfile — hard limits survive patch
  await test("saving a profile cannot enable cloud escalation or self-modification", () => {
    // Profile doesn't have these fields — confirm status returned never has them true
    const saved = saveLocalBuilderProfile("fast_code", {
      modelName: "qwen2.5-coder:7b",
      status:    "configured",
    });
    // The profile object itself doesn't expose cloudEscalationEnabled —
    // but status from getLocalBuilderStatus must still have them false
    const s = getLocalBuilderStatus();
    assert.strictEqual(s.cloudEscalationEnabled,  false);
    assert.strictEqual(s.selfModificationAllowed, false);
    assert.strictEqual(s.requireApprovalForEdits, true);
    // Cleanup
    saveLocalBuilderProfile("fast_code", { modelName: null, status: "not_configured" });
  });

  // 14. All 4 evals run without network
  const evalNames = ["repo_summary", "safe_patch_plan", "unsafe_action_detection", "ledger_update"] as const;
  for (const evalName of evalNames) {
    await test(`eval '${evalName}' runs and has usedNetwork=false`, async () => {
      const result = await runLocalBuilderEval(evalName);
      assert.strictEqual(result.usedNetwork, false, `${evalName} must not use network`);
      assert.ok(typeof result.score === "number",  "score must be a number");
      assert.ok(result.score >= 0 && result.score <= 1, "score must be 0-1");
      assert.ok(typeof result.details === "string", "details must be a string");
      assert.ok(result.ranAt.length > 0, "ranAt must be set");
    });
  }

  // 15. Eval output has no secrets
  await test("eval results contain no secret patterns", async () => {
    const result = await runLocalBuilderEval("safe_patch_plan");
    const text = JSON.stringify(result);
    assert.ok(!/sk-[a-zA-Z0-9]{20,}/i.test(text), "no OpenAI API key patterns");
    assert.ok(!/password\s*[:=]\s*\S+/i.test(text), "no password patterns");
    assert.ok(!/token\s*[:=]\s*[a-zA-Z0-9_-]{20,}/i.test(text), "no token patterns");
  });

  // 16. Eval history persists
  await test("getEvalHistory returns persisted eval results", async () => {
    const before = getEvalHistory(100).length;
    await runLocalBuilderEval("repo_summary");
    const after = getEvalHistory(100).length;
    assert.ok(after > before, `history should grow after eval run (before=${before}, after=${after})`);
  });

  // 17. getContextPack returns null for unknown name
  await test("getContextPack returns null for unknown pack name", async () => {
    const result = await getContextPack("this-pack-does-not-exist");
    assert.strictEqual(result, null, "unknown pack should return null");
  });

  // 18. getContextPacks returns array of known packs
  await test("getContextPacks returns array with correct structure", async () => {
    const packs = await getContextPacks();
    assert.ok(Array.isArray(packs), "should return array");
    for (const p of packs) {
      assert.ok(typeof p.name    === "string",  `pack.name must be string`);
      assert.ok(typeof p.title   === "string",  `pack.title must be string`);
      assert.ok(typeof p.content === "string",  `pack.content must be string`);
      assert.ok(typeof p.sizeBytes === "number", `pack.sizeBytes must be number`);
    }
  });

  // Summary
  console.log(`\n── Results: ${passed} passed, ${failed} failed ───────────────────────────`);
  if (failed > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
