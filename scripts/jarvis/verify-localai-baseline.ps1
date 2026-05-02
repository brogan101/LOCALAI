$ErrorActionPreference = "Stop"
Write-Host "== LOCALAI baseline verification =="
if (-not (Test-Path "pnpm-workspace.yaml")) { throw "Run this from the LOCALAI repo root. pnpm-workspace.yaml not found." }
if (-not (Test-Path "AGENTS.md")) { throw "AGENTS.md not found. Copy the Jarvis Build Kit into repo root first." }
$required = @(
  "docs/JARVIS_IMPLEMENTATION_LEDGER.md",
  "docs/JARVIS_CONTEXT_INDEX.md",
  "docs/JARVIS_DECISIONS.md",
  "docs/JARVIS_PHASE_MAP.md",
  "docs/JARVIS_BLOCKERS.md",
  "docs/JARVIS_TEST_MATRIX.md",
  "docs/JARVIS_LOCAL_AI_HANDOFF.md",
  "JARVIS_CODEX_PROMPT_PACK_v2.md"
)
foreach ($p in $required) {
  if (-not (Test-Path $p)) { throw "Required Jarvis context file missing: $p" }
}
Write-Host "Context files present."
Write-Host "Node:"; node --version
Write-Host "pnpm:"; pnpm --version
Write-Host "Running typecheck..."
pnpm -r typecheck
Write-Host "Running tests..."
pnpm test
Write-Host "Running frontend build..."
pnpm --filter localai-control-center build
Write-Host "Baseline verification complete."
