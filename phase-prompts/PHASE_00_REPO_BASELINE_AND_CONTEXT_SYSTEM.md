# PHASE 00 - Repo Baseline And Context System

This is a compatibility alias for the canonical Phase 00 prompt:

`phase-prompts/PHASE_00_AGENT_MEMORY_REPO_TRUTH_AUDIT_AND_BUILD_BASELINE.md`

Use the canonical prompt as the source of truth. This alias exists so future agents and prompt packs that refer to `PHASE_00_REPO_BASELINE_AND_CONTEXT_SYSTEM.md` still resolve to the same Phase 00 work without creating a competing ledger, blocker file, test matrix, or context system.

## Required outcome

Run only Phase 00. Do not start Phase 00.5 or any later phase.

Phase 00 establishes the persistent Jarvis context system for the existing `brogan101/LOCALAI` repository:

- verify the repo is the existing LOCALAI base, not a blank project
- document the workspace layout: `artifacts/api-server`, `artifacts/localai-control-center`, and `lib/*`
- document current route/module systems, safety systems, tests, scripts, UI shell, and known blockers
- update the standard Jarvis memory files under `docs/JARVIS_*.md`
- wire local baseline verification scripts without requiring Ollama, Docker, Python, network, or GPU
- record exact blockers instead of claiming live readiness

## Canonical closeout files

Phase 00 must use the standard files below and must not create duplicate alternates:

- `docs/JARVIS_IMPLEMENTATION_LEDGER.md`
- `docs/JARVIS_PHASE_MAP.md`
- `docs/JARVIS_BLOCKERS.md`
- `docs/JARVIS_TEST_MATRIX.md`
- `docs/JARVIS_LOCAL_AI_HANDOFF.md`
- `docs/JARVIS_CONTEXT_INDEX.md`
- `docs/JARVIS_DECISIONS.md`
- `docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md`

## Required checks

Run the canonical Phase 00 checks:

```powershell
node scripts/jarvis/verify-build-kit.mjs
pnpm -r typecheck
pnpm test
pnpm run verify:baseline
pnpm run verify:jarvis
```
