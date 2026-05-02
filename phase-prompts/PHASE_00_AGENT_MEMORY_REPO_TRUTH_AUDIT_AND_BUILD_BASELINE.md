# PHASE 00 — Agent Memory, Repo Truth Audit, And Build Baseline

```text
You are working inside my existing repo: brogan101/LOCALAI. This is not a blank project.

Goal:
Create the persistent context/memory system that every later prompt will use to reduce token usage and prevent missed context. Also create a repo truth baseline and lightweight verification script.

Read first:
- README.md
- AUDIT_REPORT.md
- REMAINING_PHASES_AND_REPO_RESEARCH.md
- package.json
- pnpm-workspace.yaml
- artifacts/api-server/package.json
- artifacts/localai-control-center/package.json
- artifacts/api-server/src/app.ts
- artifacts/api-server/src/routes/index.ts
- artifacts/api-server/src/db/schema.ts

Then inspect only direct imports needed to understand existing safety, settings, permissions, updater, rollback, task queue, observability, integrations, model routing, RAG, plugins, WorldGUI, and UI shell.

Implement/update:
1. `AGENTS.md`
   - Explain this repo is the existing LOCALAI base.
   - State all future agents must read the Jarvis context docs first.
   - Include hard rules: no rebuild, no fake success, local-first, permissioned risky actions, tests/proof required.
2. `docs/JARVIS_PROMPT_RULES.md`
   - Store the universal rules from this prompt pack.
   - Include prompt-efficiency rules: read the context docs first, inspect only target files, update ledger.
3. `docs/JARVIS_CONTEXT_INDEX.md`
   - Map existing route files, lib files, DB schema, UI areas, tests, scripts, docs, and known systems.
4. `docs/JARVIS_IMPLEMENTATION_LEDGER.md`
   - Create a table with phase, status, changed files, tests, blockers, next notes.
   - Add Phase 00 entry.
5. `docs/JARVIS_PHASE_MAP.md`
   - Create dependency order and feature coverage map.
6. `docs/JARVIS_TEST_MATRIX.md`
   - List root tests, API tests, UI tests, smoke checks, missing checks, and environment blockers.
7. `docs/JARVIS_DECISIONS.md`
   - Record architectural decisions: existing repo is base, local-first, gaming-PC-safe, approval-first, durable jobs before self-update, no heavy auto-start.
8. `docs/JARVIS_BLOCKERS.md`
   - Capture known blockers from AUDIT_REPORT.md exactly. Do not claim they are fixed.
9. `docs/JARVIS_LOCAL_AI_HANDOFF.md`
   - Compact summary for future local models to read before they work on the repo.
10. `docs/JARVIS_CODEX_WORKFLOW.md`
   - Document Codex App, CLI, IDE, cloud/delegated tasks, GitHub code review, skills/plugins, automations, branches/worktrees, approval modes, and when to avoid Full Auto.
11. `scripts/verify-localai-baseline.mjs`
   - Verify important files exist.
   - Verify root/package scripts exist.
   - Verify expected route index imports/usages exist.
   - Verify context docs exist.
   - Must not need Ollama, Docker, Python, network, or GPU.
12. `scripts/verify-jarvis.mjs`
   - If missing, create a generic verifier that can be extended by later phases.
   - It should read a manifest or internal checklist and report pass/fail.
13. Root `package.json`
   - Add safe scripts if missing:
     - `verify:baseline`
     - `verify:jarvis`

Rules:
- Do not change runtime behavior except adding docs and verification scripts.
- Do not remove old docs.
- Do not rewrite package scripts unrelated to this phase.

Tests:
- `pnpm -r typecheck`
- `pnpm test`
- `pnpm run verify:baseline`
- `pnpm run verify:jarvis`

Closeout:
Update all persistent context docs. Final answer must include changed files, commands, results, and blockers.
```

---
