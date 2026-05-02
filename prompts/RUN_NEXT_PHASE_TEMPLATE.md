Read these first:

- `AGENTS.md`
- `JARVIS_CODEX_PROMPT_PACK_v2.md`
- `docs/JARVIS_EXECUTION_GUIDE.md`
- `docs/JARVIS_IMPLEMENTATION_LEDGER.md`
- `docs/JARVIS_CONTEXT_INDEX.md`
- `docs/JARVIS_DECISIONS.md`
- `docs/JARVIS_PHASE_MAP.md`
- `docs/JARVIS_BLOCKERS.md`
- `docs/JARVIS_TEST_MATRIX.md`
- `docs/JARVIS_LOCAL_AI_HANDOFF.md`
- `docs/JARVIS_CODEX_WORKFLOW.md`
- `docs/JARVIS_PROMPT_RULES.md`
- `docs/JARVIS_LOCAL_FIRST_POLICY.md`
- `docs/JARVIS_SAFETY_TIERS.md`
- `docs/JARVIS_SOURCE_VERIFICATION.md`
- `docs/JARVIS_PRESTART_ENHANCEMENTS.md`
- `docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md`
- `docs/JARVIS_REQUIREMENTS_TRACEABILITY.md`
- `docs/JARVIS_UI_STYLE_GUARD.md`
- `docs/JARVIS_PHASE_ACCEPTANCE_CONTRACT.md`
- `docs/JARVIS_EXPERT_MODES.md`

Run only this phase:

```text
PHASE_ID_HERE — PHASE_NAME_HERE
Prompt file: phase-prompts/PHASE_FILE_HERE.md
```

Do not run any later phase.
Do not start multiple phase prompts.
Do not create a new app.
Use the existing `brogan101/LOCALAI` project as the base.
Use `docs/JARVIS_IMPLEMENTATION_LEDGER.md` as the source of truth for what has already been completed.
Extend existing LOCALAI systems instead of creating duplicates.
Preserve the existing LOCALAI UI style using `docs/JARVIS_UI_STYLE_GUARD.md`.

Before editing:

1. Inspect relevant existing files only.
2. Summarize what already exists in 10 bullets max.
3. List exact files/functions/routes/types to reuse.
4. Identify blockers, conflicts, or partial existing implementations.
5. State the intended changed files before large edits.

After implementation:

- Update `docs/JARVIS_IMPLEMENTATION_LEDGER.md`
- Update `docs/JARVIS_PHASE_MAP.md`
- Update `docs/JARVIS_BLOCKERS.md`
- Update `docs/JARVIS_TEST_MATRIX.md`
- Update `docs/JARVIS_LOCAL_AI_HANDOFF.md`
- Update `docs/JARVIS_CONTEXT_INDEX.md` if new files, routes, services, scripts, or UI areas were added
- Update `docs/JARVIS_DECISIONS.md` if architecture or safety decisions changed
- Update policy/watchlist/traceability docs if this phase touched safety, local-first behavior, source verification, prompt rules, external projects, UI, or expert modes
- Append the phase acceptance block from `docs/JARVIS_PHASE_ACCEPTANCE_CONTRACT.md` to `docs/JARVIS_IMPLEMENTATION_LEDGER.md`
- Run relevant tests/checks
- Show changed files, diff summary, tests/checks, blockers, what was deliberately not changed, and next exact phase

Fail loudly if anything required cannot be completed.
