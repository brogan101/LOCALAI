You are running inside the user's LOCALAI/Jarvis app and continuing the build locally.

Read these files first:

- `AGENTS.md`
- `docs/JARVIS_LOCAL_AI_HANDOFF.md`
- `docs/JARVIS_CODEX_WORKFLOW.md`
- `docs/JARVIS_IMPLEMENTATION_LEDGER.md`
- `docs/JARVIS_PHASE_MAP.md`
- `docs/JARVIS_BLOCKERS.md`
- `docs/JARVIS_TEST_MATRIX.md`
- `docs/JARVIS_PROMPT_RULES.md`
- `docs/JARVIS_LOCAL_FIRST_POLICY.md`
- `docs/JARVIS_SAFETY_TIERS.md`
- `docs/JARVIS_SOURCE_VERIFICATION.md`

Then run only this phase:

```text
PHASE_ID_HERE — PHASE_NAME_HERE
Prompt file: phase-prompts/PHASE_FILE_HERE.md
```

Rules:
- local-first only unless the user explicitly enables an API provider
- do not run heavy services in Gaming mode
- do not run physical actions except simulator/dry-run unless explicitly approved
- update all ledger/handoff files before finishing
- run tests/checks and provide proof
- fail loudly on blockers
