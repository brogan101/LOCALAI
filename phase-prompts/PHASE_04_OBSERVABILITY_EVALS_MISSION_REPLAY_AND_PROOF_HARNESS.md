# PHASE 04 — Observability, Evals, Mission Replay, And Proof Harness

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add the flight recorder: trace every agent/tool/model/job/action enough to debug, replay, evaluate, and prove what happened. This must support self-improvement later.

Target files:
- artifacts/api-server/src/routes/observability.ts
- artifacts/api-server/src/lib/thought-log.ts
- artifacts/api-server/src/lib/model-orchestrator.ts
- artifacts/api-server/src/lib/task-queue.ts
- artifacts/api-server/src/routes/chat.ts
- artifacts/api-server/src/routes/benchmark.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Observability*,*Diagnostics*,*Logs*,*Operations*,*Chat*
- existing tests for observability/security/API

Implement:
1. Agent trace model/table if missing:
   - trace id, session/job id, phase, model/provider, prompt hash, input summary, output summary, tool calls, approvals, files touched, commands, timings, result, error
2. Mission replay route:
   - `GET /api/mission-replay/:traceId`
   - returns safe redacted replay data
3. Eval harness:
   - local JSON/YAML eval suites for model routing, RAG, coding, browser, permissions, physical safety
   - no network required
   - command: `pnpm run eval:jarvis` if safe
4. Proof harness:
   - phase-specific verification hooks in `scripts/verify-jarvis.mjs`
   - detect missing docs/routes/tests for completed phases
5. Metrics:
   - model latency, first-token latency where available, token estimates, local/cloud provider, job time, failures, retries, approval wait time
6. UI:
   - Mission Replay page/card
   - trace detail view from Chat/Operations
   - eval results summary
7. Tests:
   - trace is created for a mock model/tool/job event
   - replay redacts secrets
   - eval runner exits nonzero on failed required check

Hard limits:
- Do not log raw secrets, API keys, credentials, browser cookies, or full private-file content.
- Summaries are okay; raw payloads must be redacted or hashed unless local-only and explicitly allowed.

Closeout:
Update ledger/test matrix/local AI handoff.
```

---
