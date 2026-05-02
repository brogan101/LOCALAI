# PHASE 10 — Chat-Driven Program Modification And Coding Agent Runtime

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Let me change/improve the LOCALAI/Jarvis program from inside its own chat window safely. It must inspect, propose, edit, diff, test, and prove changes before moving on.

Prerequisites:
- Approval queue
- durable jobs
- observability/replay
- rollback
- local-first model policy

Target files:
- artifacts/api-server/src/routes/chat.ts
- artifacts/api-server/src/routes/intelligence.ts
- artifacts/api-server/src/routes/workspace.ts
- artifacts/api-server/src/routes/rollback.ts
- artifacts/api-server/src/lib/global-workspace-intelligence.ts
- artifacts/api-server/src/lib/task-queue.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Chat*,*Workspace*,*Operations*,*Approval*,*Diff*
- tests for permissions/intelligence/API

Implement:
1. Chat command/action flow:
   - user asks to modify program
   - agent creates plan
   - plan lists target files only
   - approval required before edits
   - patches/diffs shown before applying where possible
   - tests run after edits
   - result summarized in mission replay
2. Change job model:
   - request
   - target files
   - branch/staging info if available
   - diff summary
   - test commands
   - rollback paths
   - status
3. Local builder mode:
   - default model local
   - cloud disabled unless Phase 02 policy explicitly allows
4. Proof checks:
   - changed files list
   - git diff or generated diff
   - tests run
   - If the API/UI can run in the current environment, perform an app smoke check; otherwise record the exact blocker and evidence
5. Optional integrations:
   - Aider/OpenHands/Roo/Cline/Continue adapters as disabled-until-configured providers unless real integration exists
6. UI:
   - coding task card in chat
   - diff viewer or file change summary
   - approve/reject/apply/rollback controls
7. Tests:
   - code edit cannot happen without approval
   - path allowlist enforced
   - rollback path exists for file edits
   - no meaningful change = fail-loud status

Hard limits:
- No silent self-modification.
- No direct destructive shell commands.
- No changes outside approved workspace roots.

Closeout:
Update ledger and local AI handoff so future local models can continue.
```

---
