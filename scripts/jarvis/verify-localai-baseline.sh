#!/usr/bin/env bash
set -euo pipefail
echo "== LOCALAI baseline verification =="
if [ ! -f "pnpm-workspace.yaml" ]; then echo "Run this from the LOCALAI repo root. pnpm-workspace.yaml not found." >&2; exit 1; fi
if [ ! -f "AGENTS.md" ]; then echo "AGENTS.md not found. Copy the Jarvis Build Kit into repo root first." >&2; exit 1; fi
for p in \
  docs/JARVIS_IMPLEMENTATION_LEDGER.md \
  docs/JARVIS_CONTEXT_INDEX.md \
  docs/JARVIS_DECISIONS.md \
  docs/JARVIS_PHASE_MAP.md \
  docs/JARVIS_BLOCKERS.md \
  docs/JARVIS_TEST_MATRIX.md \
  docs/JARVIS_LOCAL_AI_HANDOFF.md \
  JARVIS_CODEX_PROMPT_PACK_v2.md; do
  if [ ! -f "$p" ]; then echo "Required Jarvis context file missing: $p" >&2; exit 1; fi
done
echo "Context files present."
echo "Node:"; node --version
echo "pnpm:"; pnpm --version
echo "Running typecheck..."
pnpm -r typecheck
echo "Running tests..."
pnpm test
echo "Running frontend build..."
pnpm --filter localai-control-center build
echo "Baseline verification complete."
