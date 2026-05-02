First, verify the build kit placement by checking these files exist from the repo root:

- `AGENTS.md`
- `JARVIS_CODEX_PROMPT_PACK_v2.md`
- `docs/JARVIS_CODEX_WORKFLOW.md`
- `docs/JARVIS_IMPLEMENTATION_LEDGER.md`
- `docs/JARVIS_PHASE_ACCEPTANCE_CONTRACT.md`
- `docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md`
- `docs/JARVIS_PRESTART_ENHANCEMENTS.md`
- `docs/JARVIS_REQUIREMENTS_TRACEABILITY.md`
- `docs/JARVIS_UI_STYLE_GUARD.md`
- `docs/JARVIS_EXPERT_MODES.md`
- `phase-prompts/PHASE_00_REPO_BASELINE_AND_CONTEXT_SYSTEM.md`
- `phase-prompts/PHASE_00_AGENT_MEMORY_REPO_TRUTH_AUDIT_AND_BUILD_BASELINE.md`

If `node` is available, run this before editing:

```powershell
node scripts/jarvis/verify-build-kit.mjs
```

If it fails, stop and report the exact missing file.

Read these files before editing:

- `AGENTS.md`
- `JARVIS_CODEX_PROMPT_PACK_v2.md`
- `docs/JARVIS_EXECUTION_GUIDE.md`
- `docs/JARVIS_CODEX_WORKFLOW.md`
- `docs/JARVIS_PROMPT_RULES.md`
- `docs/JARVIS_CONTEXT_INDEX.md`
- `docs/JARVIS_DECISIONS.md`
- `docs/JARVIS_IMPLEMENTATION_LEDGER.md`
- `docs/JARVIS_PHASE_MAP.md`
- `docs/JARVIS_BLOCKERS.md`
- `docs/JARVIS_TEST_MATRIX.md`
- `docs/JARVIS_LOCAL_AI_HANDOFF.md`
- `docs/JARVIS_LOCAL_FIRST_POLICY.md`
- `docs/JARVIS_SAFETY_TIERS.md`
- `docs/JARVIS_SOURCE_VERIFICATION.md`
- `docs/JARVIS_UI_STYLE_GUARD.md`
- `docs/JARVIS_EXPERT_MODES.md`
- `docs/JARVIS_REQUIREMENTS_TRACEABILITY.md`
- `docs/JARVIS_PRESTART_ENHANCEMENTS.md`
- `docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md`
- `docs/JARVIS_PHASE_ACCEPTANCE_CONTRACT.md`
- `phase-prompts/PHASE_00_REPO_BASELINE_AND_CONTEXT_SYSTEM.md`
- `phase-prompts/PHASE_00_AGENT_MEMORY_REPO_TRUTH_AUDIT_AND_BUILD_BASELINE.md`

Run only PHASE 00.
Do not start Phase 00.5 or any later phase.

Before editing, inspect the existing `brogan101/LOCALAI` repo and summarize what already exists in 10 bullets max.
Use the existing project as the base. Do not create a new app.

Required closeout:

- Update `docs/JARVIS_IMPLEMENTATION_LEDGER.md`
- Update `docs/JARVIS_CONTEXT_INDEX.md`
- Update `docs/JARVIS_DECISIONS.md`
- Update `docs/JARVIS_PHASE_MAP.md`
- Update `docs/JARVIS_BLOCKERS.md`
- Update `docs/JARVIS_TEST_MATRIX.md`
- Update `docs/JARVIS_LOCAL_AI_HANDOFF.md`
- Append the phase acceptance block from `docs/JARVIS_PHASE_ACCEPTANCE_CONTRACT.md` to `docs/JARVIS_IMPLEMENTATION_LEDGER.md`
- Update `docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md` if any external project/dependency/integration is referenced or added
- Run the checks required by the phase and `AGENTS.md`
- Show changed files, tests/checks, blockers, what was deliberately not changed, and the next exact phase

Fail loudly if anything required cannot be completed.
