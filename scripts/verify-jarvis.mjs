#!/usr/bin/env node
import fs from "node:fs";

const requiredDocs = [
  "docs/JARVIS_IMPLEMENTATION_LEDGER.md",
  "docs/JARVIS_CONTEXT_INDEX.md",
  "docs/JARVIS_DECISIONS.md",
  "docs/JARVIS_PHASE_MAP.md",
  "docs/JARVIS_BLOCKERS.md",
  "docs/JARVIS_TEST_MATRIX.md",
  "docs/JARVIS_LOCAL_AI_HANDOFF.md",
  "docs/JARVIS_PROMPT_RULES.md",
  "docs/JARVIS_LOCAL_FIRST_POLICY.md",
  "docs/JARVIS_SAFETY_TIERS.md",
  "docs/JARVIS_SOURCE_VERIFICATION.md",
  "docs/JARVIS_CODEX_WORKFLOW.md",
  "docs/JARVIS_UI_STYLE_GUARD.md",
  "docs/JARVIS_REQUIREMENTS_TRACEABILITY.md",
  "docs/JARVIS_PRESTART_ENHANCEMENTS.md",
  "docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md",
  "docs/JARVIS_PHASE_ACCEPTANCE_CONTRACT.md",
  "docs/JARVIS_EXPERT_MODES.md"
];

const checks = [
  ["AGENTS.md includes existing LOCALAI warning", () => fs.readFileSync("AGENTS.md", "utf8").includes("existing `brogan101/LOCALAI`")],
  ["Prompt pack exists", () => fs.existsSync("JARVIS_CODEX_PROMPT_PACK_v2.md")],
  ["Phase 00 prompt exists", () => fs.existsSync("phase-prompts/PHASE_00_AGENT_MEMORY_REPO_TRUTH_AUDIT_AND_BUILD_BASELINE.md")],
  ["Phase 00 compatibility prompt exists", () => fs.existsSync("phase-prompts/PHASE_00_REPO_BASELINE_AND_CONTEXT_SYSTEM.md")],
  ["Phase 00.5 compatibility prompt exists", () => fs.existsSync("phase-prompts/PHASE_00_5_REPAIR_CURRENT_RUNTIME_BLOCKERS.md")],
  ["Phase 04 compatibility prompt exists", () => fs.existsSync("phase-prompts/PHASE_04_OBSERVABILITY_EVALS_AND_MISSION_REPLAY.md")],
  ["PowerShell baseline wrapper exists", () => fs.existsSync("scripts/jarvis/verify-localai-baseline.ps1")],
  ["All Jarvis context docs exist", () => requiredDocs.every((file) => fs.existsSync(file))],
  ["Ledger contains Phase 00 acceptance block", () => fs.readFileSync("docs/JARVIS_IMPLEMENTATION_LEDGER.md", "utf8").includes("## Phase 00 - Agent Memory, Repo Truth Audit, And Build Baseline")],
  ["Phase map marks Phase 00 complete", () => fs.readFileSync("docs/JARVIS_PHASE_MAP.md", "utf8").includes("| 1 | PHASE 00") && fs.readFileSync("docs/JARVIS_PHASE_MAP.md", "utf8").includes("| Complete |")],
  ["Test matrix has Phase 00 audit columns", () => {
    const matrix = fs.readFileSync("docs/JARVIS_TEST_MATRIX.md", "utf8");
    return matrix.includes("Files changed") && matrix.includes("Blockers") && matrix.includes("Next action");
  }],
  ["Blockers table includes impact", () => fs.readFileSync("docs/JARVIS_BLOCKERS.md", "utf8").includes("| Impact |")],
  ["Local handoff marks next Phase 00.5", () => fs.readFileSync("docs/JARVIS_LOCAL_AI_HANDOFF.md", "utf8").includes("PHASE_00_5_REPAIR_CURRENT_RUNTIME_BLOCKERS_BEFORE_FEATURE_EXPANSION.md")],
  ["No legacy phase ledger file required", () => !fs.existsSync("docs/" + "JARVIS_" + "PHASE_" + "LEDGER.md")],
  ["Phase 04 mission replay route exists", () => fs.readFileSync("artifacts/api-server/src/routes/observability.ts", "utf8").includes("/observability/mission-replay")],
  ["Phase 04 local eval command exists", () => fs.readFileSync("package.json", "utf8").includes("eval:jarvis")],
  ["Phase 04 mission replay test exists", () => fs.existsSync("artifacts/api-server/tests/mission-replay.test.ts")]
];

let failed = false;
for (const [name, fn] of checks) {
  try {
    const ok = fn();
    console.log(`${ok ? "OK" : "FAIL"} ${name}`);
    if (!ok) failed = true;
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("Jarvis verifier complete.");
