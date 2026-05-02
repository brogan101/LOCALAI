# Next Phase Template — LOCALAI Context Pack

Template for a local model to propose and run the next LOCALAI build phase.

## Proposal format

When asked to run the next phase, the model MUST:

1. Read `current-build-state.md` → identify the next phase ID and requirements.
2. Read `core-architecture.md` → understand which files to touch.
3. Read `safety-and-permissions.md` → confirm no hard limits are violated.
4. Call `POST /intelligence/local-builder/build/propose` with the structure below.
5. Wait for approval — never apply changes before receiving `approved: true`.
6. After approval, implement in small verifiable steps.
7. Run `pnpm -r typecheck && pnpm test && pnpm --filter localai-control-center build`.
8. Report exact results — pass or fail, never claim success without running.
9. Update all 5 Jarvis docs as the final step.

## Proposal body

```json
{
  "phaseId": "23",
  "taskSummary": "One sentence describing what this phase implements",
  "contextPacks": [
    "core-architecture",
    "safety-and-permissions",
    "current-build-state"
  ],
  "targetFiles": [
    "artifacts/api-server/src/lib/new-module.ts",
    "artifacts/api-server/src/routes/new-route.ts",
    "artifacts/api-server/tests/new-module.test.ts",
    "artifacts/localai-control-center/src/pages/AffectedPage.tsx"
  ]
}
```

Rules for `targetFiles`:
- List only files that will be created or modified.
- Do NOT list `artifacts/api-server/src/` or `artifacts/localai-control-center/src/` root paths — be specific.
- Proposals touching `artifacts/*/src/lib/local-builder.ts` itself are always hard-blocked.

## Implementation checklist

For each new lib module:
- [ ] `export const MODULE_SOURCE_OF_TRUTH = "..."` constant
- [ ] `ensureTables()` with lazy DDL if new DB tables needed
- [ ] All exported functions call `seedFoundationDefaults()` and `ensureTables()` first
- [ ] Hard limits as TypeScript literal types (`false`, `true`) not runtime booleans
- [ ] `void recordAuditEvent(...)` on all state changes
- [ ] `void thoughtLog(...)` on meaningful lifecycle events
- [ ] `redactForMissionReplay(payload)` before storing in audit/replay logs

For each new route file (or route addition):
- [ ] Input validation: check type of every body field before use
- [ ] Return `{ success: true, ... }` on success, `{ success: false, message }` on error
- [ ] HTTP 400 for bad input, 403 for permission denied, 404 for not found, 500 for internal
- [ ] 202 + `{ approvalRequired: true, approval }` when approval is needed

For tests:
- [ ] At least 10 assertions per module
- [ ] Test hard limits cannot be bypassed
- [ ] Test graceful degradation when optional services unavailable
- [ ] Test that approval is required for any mutating action

## Jarvis docs update order

Update these 5 files last, after all checks pass:

1. `docs/JARVIS_IMPLEMENTATION_LEDGER.md` — add phase entry, update current/next
2. `docs/JARVIS_PHASE_MAP.md` — mark row Complete
3. `docs/JARVIS_BLOCKERS.md` — clear resolved blockers, note new ones
4. `docs/JARVIS_TEST_MATRIX.md` — add phase test log row with results
5. `docs/JARVIS_LOCAL_AI_HANDOFF.md` — advance current state, update minimal prompt

## Minimal prompt for next session

After completing a phase, the handoff doc's minimal prompt should read:

```
Run only PHASE {N+1} — {Phase Title}.
First verify Phase {N} is COMPLETE in ledger and phase map.
Then implement: [bullet list of this phase's requirements].
Hard limits: no cloud required; no self-modification without approval; no token-heavy context in prompts.
```

## Token budget guidance

- Keep context packs under 2 000 tokens each.
- Use pack names in proposals — do NOT paste pack content into the proposal body.
- For code proposals, describe the change in prose; do NOT paste full file contents.
- The approval payload field `taskSummary` is capped at 200 chars for safety.
