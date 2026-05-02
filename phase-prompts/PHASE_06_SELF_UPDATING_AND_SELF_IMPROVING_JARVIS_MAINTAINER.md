# PHASE 06 — Self-Updating And Self-Improving Jarvis Maintainer

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Build the Self-Updating / Self-Improving Jarvis Maintainer safely. It checks for updates, bugs, integration releases, model candidates, dependency changes, and proposes tested patches. It must never silently modify itself, merge itself, or restart itself without approval.

Prerequisites that must already exist:
- Approval queue
- durable jobs
- observability/mission replay
- model lifecycle manager
- rollback/audit
If missing, stop and update blockers instead of implementing unsafe self-update.

Target files:
- artifacts/api-server/src/routes/updater.ts
- artifacts/api-server/src/routes/updates.ts
- artifacts/api-server/src/routes/repair.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/models.ts
- artifacts/api-server/src/lib/task-queue.ts
- artifacts/api-server/src/lib/model-orchestrator.ts
- artifacts/api-server/src/lib/thought-log.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Updater*,*Updates*,*Repair*,*Operations*,*Models*,*Integrations*
- package.json
- scripts/*

Implement:
1. Update radar:
   - repo dependency updates through Renovate config/proposal, not direct auto-update
   - integration GitHub release checks
   - Docker image update checks when integration is Docker-based
   - MCP server/tool update checks
   - OpenClaw/NemoClaw skill/source update checks when configured
   - model registry update checks for installed roles
2. Update proposal model:
   - source
   - current version
   - candidate version
   - changelog URL/summary when available
   - risk level
   - affected files/services
   - tests required
   - rollback plan
   - approval state
3. Self-repair loop:
   - detect failed test/build/smoke result
   - create repair proposal
   - patch on branch/staging only when possible
   - run targeted tests
   - show diff/proof
4. Chat-driven maintainer commands:
   - “check updates”
   - “explain update”
   - “prepare patch”
   - “run tests”
   - “rollback proposal”
5. Safety rules:
   - never update directly on main
   - never auto-merge
   - never delete old models before replacement evals pass
   - never update during Gaming Mode
   - network failure becomes `update_check_unavailable`, not app failure
   - all changes require approval
6. UI:
   - Maintainer dashboard
   - update proposals list
   - model replacement candidates
   - failed checks / repair suggestions
7. Tests:
   - no direct update without approval
   - network unavailable handled safely
   - update proposal requires tests/rollback plan
   - model replacement blocked without eval pass

Hard limits:
- Do not enable Renovate automerge.
- Do not install external services automatically.
- Do not use real GitHub tokens in tests.

Closeout:
Update ledger and local AI handoff.
```

---
