# JARVIS_PHASE_ACCEPTANCE_CONTRACT.md

Purpose: define the exact “done” format every phase must use.

At the end of every phase, append this block to `docs/JARVIS_IMPLEMENTATION_LEDGER.md`.

```text
## Phase XX — <Name>
STATUS: complete | partial | blocked
DATE:
BRANCH_OR_WORKTREE:
SUMMARY:
CHANGED_FILES:
- path: reason
TESTS_RUN:
- command: result
FEATURE_PROOF:
- route/UI/script/test/log proof
SAFETY_PROOF:
- permission guard / runtime mode / dry-run / rollback / emergency-stop proof
BLOCKERS:
- none OR exact blocker + next action
LOCAL_AI_HANDOFF_SUMMARY:
- <=500 words unless blocked
NEXT_PHASE:
- exact file/prompt to run next
```

## Completion rules

A phase is not complete if:

- the ledger was not updated
- blockers were found but not recorded
- tests were not run and no reason was given
- user-facing UI was added without style-guard proof
- a new service lacks runtime mode + stop behavior
- an integration returns fake success
- physical actions lack simulator/dry-run/read-only/approval tiers
- cloud/API calls can happen without explicit opt-in
- local AI handoff was not updated

## Final response required format

Codex/local AI must end every phase with:

```text
Changed files:
Tests/checks:
Result:
Blockers:
Ledger updated:
Local AI handoff updated:
Next phase:
```
