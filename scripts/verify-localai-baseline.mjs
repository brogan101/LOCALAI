#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const required = [
  "package.json",
  "pnpm-workspace.yaml",
  "artifacts/api-server/package.json",
  "artifacts/localai-control-center/package.json",
  "artifacts/api-server/src/app.ts",
  "artifacts/api-server/src/routes/index.ts",
  "artifacts/api-server/src/db/schema.ts",
  "artifacts/localai-control-center/src/App.tsx",
  "AGENTS.md",
  "JARVIS_CODEX_PROMPT_PACK_v2.md",
  "docs/JARVIS_EXECUTION_GUIDE.md",
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
  "docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md",
  "docs/JARVIS_REQUIREMENTS_TRACEABILITY.md",
  "docs/JARVIS_UI_STYLE_GUARD.md",
  "docs/JARVIS_EXPERT_MODES.md",
  "docs/JARVIS_PHASE_ACCEPTANCE_CONTRACT.md",
  "phase-prompts/PHASE_00_REPO_BASELINE_AND_CONTEXT_SYSTEM.md",
  "phase-prompts/PHASE_00_AGENT_MEMORY_REPO_TRUTH_AUDIT_AND_BUILD_BASELINE.md",
  "phase-prompts/PHASE_00_5_REPAIR_CURRENT_RUNTIME_BLOCKERS.md",
  "scripts/jarvis/verify-build-kit.mjs",
  "scripts/jarvis/verify-localai-baseline.ps1"
];

let failed = false;
function fail(message) {
  console.error(`FAIL ${message}`);
  failed = true;
}

for (const file of required) {
  if (!fs.existsSync(path.resolve(file))) {
    fail(`missing: ${file}`);
  } else {
    console.log(`OK ${file}`);
  }
}

const rootPackage = JSON.parse(fs.readFileSync("package.json", "utf8"));
for (const script of ["typecheck", "test", "verify:baseline", "verify:jarvis"]) {
  if (!rootPackage.scripts?.[script]) {
    fail(`root package script missing: ${script}`);
  } else {
    console.log(`OK root script ${script}`);
  }
}

const routeIndex = fs.existsSync("artifacts/api-server/src/routes/index.ts")
  ? fs.readFileSync("artifacts/api-server/src/routes/index.ts", "utf8")
  : "";
for (const token of ["health", "models", "integrations", "updater", "repair", "observability", "tasks", "rollback", "rag", "plugins", "worldgui", "foundation"]) {
  if (!routeIndex.includes(token)) {
    fail(`expected route token not found in route index: ${token}`);
  } else {
    console.log(`OK route token ${token}`);
  }
}

if (failed) process.exit(1);
console.log("Baseline file verification complete.");
