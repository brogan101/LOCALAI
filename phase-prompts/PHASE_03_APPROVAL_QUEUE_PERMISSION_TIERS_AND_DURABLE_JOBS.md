# PHASE 03 — Approval Queue, Permission Tiers, And Durable Jobs

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Build the approval and durable-job backbone before self-updating, tool use, or physical automation. All risky actions must become resumable, auditable jobs with explicit approval states.

Target files:
- artifacts/api-server/src/db/schema.ts
- artifacts/api-server/src/db/migrate.ts
- artifacts/api-server/src/lib/task-queue.ts
- artifacts/api-server/src/lib/route-guards.ts
- artifacts/api-server/src/lib/thought-log.ts
- artifacts/api-server/src/routes/tasks.ts
- artifacts/api-server/src/routes/system.ts
- artifacts/api-server/src/routes/intelligence.ts
- artifacts/api-server/src/routes/rollback.ts
- artifacts/api-server/src/routes/index.ts
- artifacts/localai-control-center/src/**/*Operations*,*Chat*,*Settings*,*Permission*,*Task*,*Approval*
- tests related to security, route guards, permission routes

Implement:
1. Permission tiers:
   - Tier 0 read-only
   - Tier 1 draft-only
   - Tier 2 safe local execute
   - Tier 3 file modification with diff/rollback
   - Tier 4 external communication with approval
   - Tier 5 manual-only/prohibited
2. Physical action tiers:
   - P0 sensor/read state
   - P1 suggest
   - P2 prepare/queue
   - P3 low-risk automation
   - P4 approval required
   - P5 manual-only at machine
3. Approval queue table/model if missing:
   - id, type, title, summary, risk tier, requested action, payload hash, requestedAt, approvedAt, deniedAt, status, expiresAt, result, auditId
4. Durable job improvements:
   - queued/running/waiting_for_approval/completed/failed/cancelled/paused
   - checkpoint JSON
   - retry count
   - resumable after API restart
5. Routes:
   - list approvals
   - approve/deny/cancel
   - list jobs
   - pause/resume/cancel jobs
6. Audit:
   - every approval/denial/job transition logs to audit/thought log
7. UI:
   - Approval Center surface
   - task/job detail view
   - Chat action cards use the approval queue when applicable
8. Tests:
   - prohibited Tier 5 denied
   - Tier 3 requires diff/rollback metadata
   - Tier 4 cannot execute without approval
   - physical P5 cannot execute through software
   - jobs survive hydrate/restart path where practical

Hard limits:
- Do not implement full LangGraph/Temporal here unless already present. Build the local durable foundation first.
- Do not allow approval bypass via API route.

Closeout:
Update context docs and ledger.
```

---
