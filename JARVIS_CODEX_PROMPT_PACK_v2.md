# LOCALAI -> Jarvis Control Center Codex Prompt Pack v2.6

Purpose: copy/paste one phase prompt at a time into Codex, Claude Code, OpenHands, Aider, Roo/Cline, or eventually your own LOCALAI/Jarvis chat window. This pack is written for the existing `brogan101/LOCALAI` repository. It is **not** a blank-project scaffold.

Generated: 2026-04-24
Revision: v2.6 - LOCALAI-specific Codex workflow, current Codex app/CLI/cloud/code-review/skills/automation guidance, build-kit self-verification, stricter copy/paste execution, external project retention, expert-mode contracts, and Phase 00 context verification.


## Codex execution surfaces this pack supports

This pack accounts for the newer Codex workflow surfaces:

- Codex App: use project threads and worktrees, one phase per branch/worktree.
- Codex CLI: use Suggest or Auto Edit for early phases; Full Auto only after safety gates exist.
- Codex IDE extension: useful for targeted edits after the phase identifies exact files.
- Codex cloud/delegated tasks: allowed for isolated review/tests/PR prep, but local tests and ledger updates still control completion.
- Codex GitHub code review: use after phase PRs, but do not treat review as a substitute for tests.
- Codex skills and automations: future repeatable workflows must be permissioned, disabled-by-default, and ledger-updating.

Read `docs/JARVIS_CODEX_WORKFLOW.md` before running phases.

## What v2 fixes from v1

- Adds a persistent repo memory/ledger system so each later prompt can read a compact source of truth instead of re-scanning the whole project.
- Adds a hard Phase 00.5 to repair current runtime blockers before stacking more features.
- Moves approval queues, durable jobs, observability, evals, and mission replay before self-updating/self-improvement.
- Splits large phases into smaller A/B/C prompts so Codex does not waste usage or half-implement giant modules.
- Removes fake-success wording. If a real integration cannot run yet, it must be a disabled adapter with clear `not_configured`, `not_installed`, or `blocked` states and tests proving it cannot execute.
- Adds gaming-PC safety gates before new integrations.
- Adds local-first / optional-API-only policy with data-classification before cloud calls.
- Adds physical-action simulator/dry-run/approval tiers before any real-world automation.
- Adds final coverage audit prompts that force Codex to compare implementation against this entire plan and the repo ledger.

## Existing repo assumptions Codex must preserve

The current repo already includes or references:

- Root pnpm workspace: `artifacts/api-server`, `artifacts/localai-control-center`, `lib/*`.
- Express API server under `artifacts/api-server`.
- React/Vite UI under `artifacts/localai-control-center`.
- SQLite/Drizzle schema, app settings, thought log, task queue, audit log, rollback, refactor plans/jobs, async jobs, benchmark runs, pinboard, model pull history.
- Existing routes for health, stack, models, workspace, system, updates, Continue, studios, remote, chat, file browser, context, intelligence, integrations, usage, updater, repair, kernel, observability, tasks, rollback, sessions, STT, TTS, RAG, web, benchmark, pinboard, token budget, time travel, plugins, and WorldGUI.
- Existing README, audit report, and remaining phases/repo research docs.

## Verified prompt-design and implementation principles used

These prompts are intentionally structured around current best practices:

1. Define success criteria and empirical tests before optimizing prompts.
2. Be explicit, scoped, and direct; give the model an out when a fact or dependency is unavailable.
3. Use durable execution, checkpoints, and human approval for long-running or risky workflows.
4. Run tools through permissioned/sandboxed gateways instead of unrestricted host execution.
5. Prefer structured browser/app state over blind screenshots when possible.
6. Require tests, proof, diffs, and failure reporting after every phase.
7. Keep local-first operation mandatory; optional cloud keys must be opt-in and policy-gated.

## Copy/paste usage rule

Run **one prompt at a time**. Do not paste multiple phase prompts into one run. Each prompt updates the persistent ledger files so the next prompt can start from a short, current summary.

## Persistent context files every phase must maintain

Phase 00 creates these files. Later phases must read and update them:

- `AGENTS.md` — global instructions for Codex/local agents working in this repo.
- `docs/JARVIS_PROMPT_RULES.md` — immutable build/prompt rules.
- `docs/JARVIS_CONTEXT_INDEX.md` — compact map of where key systems live.
- `docs/JARVIS_IMPLEMENTATION_LEDGER.md` — one short entry per phase: done, files changed, tests, blockers, next phase notes.
- `docs/JARVIS_PHASE_MAP.md` — dependency map and feature coverage.
- `docs/JARVIS_TEST_MATRIX.md` — commands, smoke checks, feature checks, current pass/fail.
- `docs/JARVIS_DECISIONS.md` — architectural decisions and why.
- `docs/JARVIS_BLOCKERS.md` — unresolved blockers with exact reason and next action.
- `docs/JARVIS_LOCAL_AI_HANDOFF.md` — compact context for transitioning from cloud Codex to local models.
- `docs/JARVIS_CODEX_WORKFLOW.md` — how to use Codex App/CLI/IDE/cloud/code review/skills/automations without losing phase control.

## Universal rules for every phase

Every phase prompt below repeats the most important rules, but these always apply:

1. Work inside the existing `brogan101/LOCALAI` repo. Do not rebuild the app.
2. Read `AGENTS.md`, `docs/JARVIS_CONTEXT_INDEX.md`, `docs/JARVIS_IMPLEMENTATION_LEDGER.md`, `docs/JARVIS_TEST_MATRIX.md`, and the target files listed in the phase. Do not scan the whole repo unless blocked.
3. Preflight before editing: summarize what already exists, what you will reuse, exact files to change, and risks/blockers.
4. Extend existing systems first: routes, DB, settings, task queue, permissions, audit, rollback, updater, observability, integrations, plugins, RAG, model orchestrator, UI shell.
5. No duplicate systems. If a similar feature exists, refactor/extend it.
6. No fake success paths. Disabled adapters must return explicit unavailable states and be tested.
7. No destructive defaults. Anything that writes files, runs commands, installs packages, deletes models, posts externally, messages customers, controls physical devices, changes network/firewall config, or touches secrets requires permission checks and approval.
8. No heavy service may auto-start by default. Each service/integration must declare startup policy, mode compatibility, stop command, health check, and resource impact.
9. Local-first is mandatory. API keys/cloud providers are optional and must never be required for boot, chat, local RAG, local model routing, or core workflows.
10. Update the persistent ledger and test matrix at the end of every phase.
11. Run available tests. If environment blocks a test, record the command, exact error, and next action.
12. Final response must include changed files, diffs summary, commands run, pass/fail results, blockers, and proof the feature is wired into existing routes/UI/docs.

## Standard closeout each prompt must perform

At the end of each phase, Codex must update:

- `docs/JARVIS_IMPLEMENTATION_LEDGER.md`
- `docs/JARVIS_TEST_MATRIX.md`
- `docs/JARVIS_BLOCKERS.md` if anything is unresolved
- `docs/JARVIS_CONTEXT_INDEX.md` if new files/routes/services were added
- `docs/JARVIS_LOCAL_AI_HANDOFF.md` with a 5-10 bullet compressed summary suitable for local models

Recommended root commands after each phase:

```powershell
pnpm -r typecheck
pnpm test
pnpm run verify:baseline
pnpm run verify:jarvis
node scripts/jarvis/verify-build-kit.mjs
```

If a command does not exist yet, the prompt should create it in an early phase or record why it cannot run yet.


## v2.6 final prestart enhancement

This pack now includes full external project retention and expert-mode contracts. Before running Phase 00, ensure these files exist and are read by Codex/local AI:

- `docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md`
- `docs/JARVIS_REQUIREMENTS_TRACEABILITY.md`
- `docs/JARVIS_EXPERT_MODES.md`
- `docs/JARVIS_UI_STYLE_GUARD.md`
- `docs/JARVIS_PRESTART_ENHANCEMENTS.md`
- `docs/JARVIS_PHASE_ACCEPTANCE_CONTRACT.md`

Text-to-CAD is explicitly retained through local-first CAD-as-code/FreeCAD and optional disabled cloud/API adapters such as `gNucleus/text-to-cad-mcp` and BuildCAD AI. Automotive is upgraded to Master Tech mode.

---

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
   - Document how to use Codex App, CLI, IDE extension, cloud tasks, code review, skills, automations, branches, worktrees, and approval modes safely for this phased LOCALAI build.
   - State that early phases use Suggest or Auto Edit only and that parallel agents are review-only until Phase 04 is complete.
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
- `node scripts/jarvis/verify-build-kit.mjs`

Closeout:
Update all persistent context docs. Final answer must include changed files, commands, results, and blockers.
```

---

# PHASE 00.5 — Repair Current Runtime Blockers Before Feature Expansion

```text
Work inside the existing LOCALAI repo. Start by reading:
- AGENTS.md
- docs/JARVIS_CONTEXT_INDEX.md
- docs/JARVIS_IMPLEMENTATION_LEDGER.md
- docs/JARVIS_TEST_MATRIX.md
- docs/JARVIS_BLOCKERS.md
- AUDIT_REPORT.md

Goal:
Fix or harden the current runtime blockers before adding big new modules. Do not add new major features in this phase.

Target files to inspect first:
- artifacts/api-server/src/index.ts
- artifacts/api-server/src/app.ts
- artifacts/api-server/src/routes/health.ts
- artifacts/api-server/src/lib/hardware-probe.ts
- artifacts/api-server/src/lib/runtime.ts
- artifacts/api-server/src/lib/windows-system.ts
- artifacts/localai-control-center/vite.config.ts
- LAUNCH_OS.ps1
- scripts/windows/*
- package.json
- README.md

Known blockers to address from audit:
1. API/UI local socket binding failures.
2. Child `powershell.exe` failure for launched sidecars.
3. NVML / `nvidia-smi` failures despite RTX GPU presence.
4. Node version mismatch for browser/runtime tooling.
5. Inconsistent `localhost` vs `127.0.0.1` behavior.
6. Sidecar failures must be fail-soft and visible, not fatal.
7. Dependency audit timeout must be recorded and handled safely.
8. Root clean script must not be unsafe/non-Windows-native.

Implement:
- Add robust host binding config with safe default `127.0.0.1`.
- Add clear diagnostics when socket binding fails.
- Make tray/STT/sidecar startup fail-soft with thought-log and health visibility.
- Add `pwsh` fallback detection where appropriate, but do not require it.
- Make GPU telemetry fail-soft: GPU identity can be detected even if NVML fails; VRAM guard must degrade safely.
- Standardize docs/config toward `127.0.0.1` for local app URLs unless a route explicitly supports LAN/Tailscale.
- Replace unsafe root clean behavior with a cross-platform script or document why not changed.
- Add or update tests for health route, fail-soft sidecar behavior, and hardware probe fallback where practical.

Hard limits:
- Do not introduce Docker, OpenClaw, MCP, CAD, Home Assistant, or new services in this phase.
- Do not claim live browser/E2E works unless you actually launched it and verified it.

Tests:
- `pnpm -r typecheck`
- `pnpm test`
- `pnpm run verify:baseline`
- `pnpm run verify:jarvis
node scripts/jarvis/verify-build-kit.mjs`
- Attempt API start if environment allows: `pnpm --filter api-server start`
- Attempt UI dev start if environment allows: `pnpm --filter localai-control-center dev`

Closeout:
Update blockers with fixed vs remaining. Update ledger and local AI handoff.
```

---

# PHASE 01 — Gaming-PC-Safe Runtime Modes, Service Policies, And Emergency Stop

```text
Work inside the existing LOCALAI repo. Read the persistent context docs first.

Goal:
Make Jarvis safe on my gaming PC. Add service/runtime modes, startup policies, resource controls, and emergency stop before adding heavy integrations.

Target files:
- artifacts/api-server/src/app.ts
- artifacts/api-server/src/routes/system.ts
- artifacts/api-server/src/routes/models.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/updates.ts
- artifacts/api-server/src/lib/model-orchestrator.ts
- artifacts/api-server/src/lib/hardware-probe.ts
- artifacts/api-server/src/lib/task-queue.ts
- artifacts/api-server/src/lib/thought-log.ts
- artifacts/api-server/src/lib/secure-config.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Settings*,*Operations*,*Diagnostics*,*Models*,*Sidebar*,*Layout*
- scripts/windows/*

Implement:
1. Runtime modes:
   - Lightweight
   - Coding
   - Vision
   - Media
   - Business
   - Maker
   - HomeLab
   - HomeShop
   - Gaming
   - EmergencyStop
2. Store current mode persistently in SQLite/settings.
3. Service policy model for every managed integration/service:
   - service id
   - display name
   - startup policy: disabled/manual/on_demand/mode_based
   - allowed runtime modes
   - resource class: light/medium/heavy/gpu/physical/network
   - health check command or URL
   - stop command
   - emergency stop behavior
   - requires approval boolean
4. API endpoints:
   - `GET /api/runtime-mode`
   - `POST /api/runtime-mode/set`
   - `GET /api/service-policies`
   - `POST /api/service-policies/:id/update`
   - `POST /api/emergency-stop`
5. Gaming mode behavior:
   - stop GPU-heavy services/models safely
   - stop/disable background model warmups
   - pause heavy tasks
   - leave lightweight UI/API available
   - log exactly what was stopped or skipped
6. Emergency stop behavior:
   - stop active queued jobs where safe
   - unload models where safe
   - stop managed services with defined stop commands
   - disable physical action execution
   - write audit/thought-log event
7. UI:
   - Add runtime mode status/control in existing settings/operations area.
   - Add emergency stop button with confirmation.
   - Show service startup policies and resource impact.
8. Tests:
   - mode persistence
   - service policy validation
   - emergency stop denies physical actions
   - Gaming mode does not require Docker/Ollama/cloud

Hard limits:
- Do not auto-start new services.
- Do not kill arbitrary user processes except explicitly managed Jarvis services/models.
- Do not run destructive shell commands.

Closeout:
Update ledger, test matrix, context index, blockers, and local AI handoff.
```

---

# PHASE 02 — Local-First Provider Policy With Optional API Keys

```text
Work inside the existing LOCALAI repo. Read persistent context docs first.

Goal:
Prioritize local AI with zero required cost. Add optional cloud/API-key support as a provider choice only, with data classification and explicit approval. The app must remain fully usable with no API keys.

Target files:
- artifacts/api-server/src/lib/model-orchestrator.ts
- artifacts/api-server/src/routes/models.ts
- artifacts/api-server/src/routes/openai.ts
- artifacts/api-server/src/lib/secure-config.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/api-server/src/routes/usage.ts
- artifacts/localai-control-center/src/**/*Settings*,*Models*,*Integrations*,*Usage*
- README.md

Implement:
1. Provider policy registry:
   - local providers: Ollama, LocalAI gateway, llama.cpp/vLLM/SGLang/LiteLLM as optional backends when configured
   - optional cloud providers: OpenAI-compatible, Anthropic-compatible, Google-compatible, OpenRouter-compatible, custom base URL
   - no provider may be required for boot
2. Data classification before any non-local provider call:
   - public
   - normal
   - private
   - sensitive
   - secret
   - credential
   - private-file/RAG
3. Default policy:
   - local-only for all classifications unless user opts in
   - block secret/credential automatically
   - block private-file/RAG cloud use by default
   - first cloud use requires approval and visible provider/model/cost/data summary
4. API key storage:
   - use existing secure config pattern if present
   - never log raw keys
   - redact in thought log/audit/logs/UI
5. Cost/usage visibility:
   - local calls cost $0
   - cloud calls estimate cost when configured, otherwise show unknown
   - usage metrics separate local vs cloud
6. UI:
   - Provider settings page/section
   - “Local-first” badge/status
   - Optional API key forms with redaction and test connection
   - Per-task provider choice but default local
7. Tests:
   - app works with no keys
   - cloud call blocked for secret/credential data
   - private-file cloud use blocked by default
   - keys redacted in logs/output
   - local provider remains default

Hard limits:
- Do not put real API keys in files.
- Do not require network for tests.
- Do not route chat to cloud unless explicit configured/approved path exists.

Closeout:
Update context docs and test matrix.
```

---

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

# PHASE 05 — Unified AI Gateway, Model Router, And Model Lifecycle Manager

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Strengthen the local model router and lifecycle manager. Local models stay first. Optional backends are profiles. New models replace old models only after eval proof, VRAM fit, and approval.

Target files:
- artifacts/api-server/src/lib/model-orchestrator.ts
- artifacts/api-server/src/config/models.config.ts
- artifacts/api-server/src/routes/models.ts
- artifacts/api-server/src/routes/openai.ts
- artifacts/api-server/src/routes/benchmark.ts
- artifacts/api-server/src/lib/hardware-probe.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Models*,*Settings*,*Usage*,*Benchmark*
- tests for openai compat, model routes, benchmark

Implement:
1. Model capability registry:
   - chat
   - coding
   - embeddings
   - vision
   - tool calling
   - JSON/structured output
   - context window
   - VRAM/RAM estimate
   - local/cloud provider
   - installed/available/deprecated/replacement candidate
2. Backend profiles:
   - Ollama default
   - LiteLLM optional
   - llama.cpp optional
   - vLLM optional
   - SGLang optional
   - LM Studio optional
   - custom OpenAI-compatible optional
3. Lifecycle rules:
   - never delete old model before replacement passes evals
   - replacement must fit GPU/RAM policy
   - replacement must be same or better for role capability
   - replacement requires approval
   - old model can be retired/unloaded, not immediately deleted
4. Model eval packs:
   - chat quality smoke
   - coding edit smoke
   - RAG answer/citation smoke
   - tool calling smoke
   - latency/resource smoke
   - vision smoke only when vision model installed; otherwise explicit skipped/unavailable result
5. UI:
   - model roles and capability table
   - replacement recommendations
   - retire/delete approval card
   - local-first status
6. Tests:
   - embedding model cannot be assigned to chat role unless allowed
   - cloud model not used by default
   - replacement blocked without eval proof
   - delete blocked without approval

Hard limits:
- No model deletion by default.
- No cloud fallback unless explicitly enabled by Phase 02 policy.
- Do not require network/Ollama for unit tests; mock where needed.

Closeout:
Update docs and ledger.
```

---

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

# PHASE 07A — MCP Tool Registry And Tool Firewall Foundation

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Create the MCP/tool registry and firewall foundation before adding OpenClaw/NemoClaw or many tools. Tools must be visible, permissioned, sandbox-aware, and auditable.

Target files:
- artifacts/api-server/src/routes/plugins.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/index.ts
- artifacts/api-server/src/lib/route-guards.ts
- artifacts/api-server/src/lib/task-queue.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Plugins*,*Integrations*,*Tools*,*Settings*,*Operations*
- plugins/*
- tests for route guards/security/permissions

Implement:
1. Tool registry model:
   - id, name, type: mcp/openapi/local-script/browser/desktop/physical
   - provider/source
   - install state
   - permissions: filesystem/network/secrets/commands/browser/desktop/physical/model
   - allowed modes
   - risk tier
   - startup policy
   - health status
   - audit counts
2. Tool firewall:
   - before any tool execution, validate registry entry, permission tier, runtime mode, approval state, and egress/file scopes
3. Disabled adapter behavior:
   - if a tool is not installed/configured, return explicit `not_installed` or `not_configured`
   - no fake success path
4. Routes:
   - list tools
   - inspect tool schema/permissions
   - enable/disable tool
   - dry-run tool call
   - execute tool call only with permission/approval
5. UI:
   - Tool Registry page/card
   - risk badges
   - enable/disable controls
   - dry-run and approval state
6. Tests:
   - unregistered tool cannot run
   - disabled tool cannot run
   - high-risk tool requires approval
   - dry-run logs but does not execute

Hard limits:
- Do not install random MCP servers yet.
- Do not expose host filesystem/network by default.

Closeout:
Update docs and ledger.
```

---

# PHASE 07B — Docker MCP Gateway Integration

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Integrate Docker MCP Gateway as the preferred isolation path for MCP tools. It should be managed, visible, and optional. The app must work without Docker.

Target files:
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/plugins.ts
- artifacts/api-server/src/lib/task-queue.ts
- artifacts/api-server/src/lib/thought-log.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Integrations*,*Tools*,*Settings*,*Operations*
- scripts/*
- docs/JARVIS_CONTEXT_INDEX.md

Implement:
1. Docker availability detection:
   - Docker Desktop/Engine present?
   - `docker mcp` available?
   - gateway running?
   - version/status output redacted/safe
2. MCP Gateway profile model:
   - profile name
   - allowed servers
   - allowed tools
   - secret requirements
   - network policy summary
   - mode compatibility
3. Gateway actions:
   - status
   - list enabled servers/tools
   - connect client config output
   - run/start/stop only through approval where needed
4. Tool filtering:
   - allow only selected tools to reduce token/tool noise
5. UI:
   - Docker MCP Gateway card in integrations/tools
   - status, setup steps, enabled servers, tool count
6. Tests:
   - no Docker = disabled with clear status, not failure
   - gateway command execution requires permission
   - tool filtering config persists

Hard limits:
- Do not require Docker for app startup.
- Do not install MCP servers automatically.
- Do not pass secrets into Docker without explicit configured secret mapping.

Closeout:
Update ledger and local AI handoff.
```

---

# PHASE 07C — OpenClaw And NemoClaw Full-Potential Gateway With Safety Wrappers

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Use OpenClaw and NemoClaw as first-class high-power gateways for chat/phone/messaging/skills while wrapping them with Jarvis permissions, tool firewall, approval queue, logging, and sandboxing.

Target files:
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/plugins.ts
- artifacts/api-server/src/routes/remote.ts
- artifacts/api-server/src/routes/chat.ts
- artifacts/api-server/src/lib/task-queue.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Integrations*,*Remote*,*Chat*,*Tools*,*Settings*
- plugins/*
- scripts/*

Implement:
1. OpenClaw/NemoClaw integration profiles:
   - install path/config path
   - enabled channels
   - allowed skills
   - skill quarantine path
   - approved skills path
   - disabled skills path
   - model endpoint mapping to LOCALAI/LiteLLM/local gateway
2. Channel safety:
   - phone/chat messages can request actions
   - risky actions create approval cards, not immediate execution
   - external send/post/message actions require Tier 4 approval
3. Skill safety:
   - skill manifest scanner
   - permission manifest required
   - quarantine first
   - no host execution by default
   - approved move requires user approval
4. OpenClaw command bridge:
   - route messages into LOCALAI chat/session context
   - local model default
   - tool firewall enforced
5. NemoClaw wrapper support:
   - configure as safety layer when available
   - if unavailable, show disabled `not_installed` status with setup steps
6. UI:
   - OpenClaw/NemoClaw dashboard
   - channel status
   - skill quarantine/approval list
   - recent remote commands
7. Tests:
   - remote command cannot execute risky action without approval
   - unapproved skill cannot run
   - skill scanner detects missing permission manifest
   - local model endpoint used by default

Hard limits:
- Do not connect real WhatsApp/Signal/Teams/etc. in tests.
- Do not bypass Jarvis permission system.
- Do not install skills directly into approved path.

Closeout:
Update ledger and local AI handoff.
```

---

# PHASE 08A — Professional RAG Engine And Document Ingestion Interfaces

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Upgrade RAG without breaking existing personal memory. Add pluggable ingestion and vector-store interfaces with citations, incremental updates, and reliable unavailable states for optional external parsers.

Target files:
- artifacts/api-server/src/routes/rag.ts
- artifacts/api-server/src/lib/rag.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/api-server/src/lib/model-orchestrator.ts
- artifacts/localai-control-center/src/**/*RAG*,*Settings*,*Workspace*,*Chat*
- tests related to RAG/API

Implement:
1. Ingestion provider interface:
   - built-in current parser
   - MarkItDown adapter config
   - Docling adapter config
   - OCR provider config
   - each optional provider must return explicit unavailable status when missing
2. Vector store interface:
   - existing hnswlib provider preserved
   - LanceDB/Qdrant provider config only if not implemented fully now; unavailable states only
3. Collection metadata:
   - source file, hash, parser used, chunk count, updatedAt, deletedAt, citation info
4. Incremental re-indexing:
   - skip unchanged file hashes
   - remove stale chunks for deleted/changed files
5. Citations:
   - store enough source metadata for answers to cite file/page/section where available
6. UI:
   - collection status
   - parser status
   - re-index button
   - source/chunk inspector
7. Tests:
   - unchanged file skipped
   - changed file re-indexes
   - unavailable parser does not fake success
   - citation metadata stored for simple file

Hard limits:
- Do not remove existing RAG features.
- Do not require Docker/Python/network for default RAG tests.

Closeout:
Update docs and ledger.
```

---

# PHASE 08B — Evidence Vault And Paperless/Manuals/Receipts Workflow

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add an Evidence Vault workflow for receipts, manuals, warranties, car documents, shop documents, home network docs, and project records.

Target files:
- artifacts/api-server/src/routes/rag.ts
- artifacts/api-server/src/routes/filebrowser.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*RAG*,*Evidence*,*Files*,*Workspace*,*Settings*
- docs/JARVIS_CONTEXT_INDEX.md

Implement:
1. Evidence Vault entity model:
   - document id
   - category: vehicle/home/shop/network/receipt/manual/warranty/tax/project/other
   - source path/hash
   - OCR/parser status
   - tags
   - linked entity ids from Digital Twin when available later
2. Paperless-ngx integration profile:
   - disabled until configured
   - endpoint/token stored securely
   - status/check connection only
   - import/sync action requires approval
3. Manual/receipt workflows:
   - add document
   - tag/categorize
   - ask question over category
   - generate warranty/maintenance reminder proposal
4. UI:
   - Evidence Vault page/card
   - category filters
   - ingestion status
   - ask-over-vault entry point
5. Tests:
   - category stored
   - disabled Paperless integration cannot sync
   - ask-over-vault uses local RAG path by default

Hard limits:
- Do not upload documents to cloud.
- Do not store secrets in logs.
- Do not delete original files.

Closeout:
Update ledger and local AI handoff.
```

---

# PHASE 09A — Browser Automation With Playwright MCP Safety

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add browser automation through Playwright MCP-style structured browser state first, not blind clicking. Browser actions must be sandboxed/profiled and approval-gated for risky actions.

Target files:
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/worldgui.ts
- artifacts/api-server/src/routes/plugins.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Browser*,*Automation*,*Integrations*,*Tools*,*Chat*
- tests for permissions/tools

Implement:
1. Browser session profiles:
   - isolated profile
   - persistent profile only if user configures
   - download sandbox path
   - allowed domains
   - blocked domains
   - credential entry manual-only
2. Playwright MCP integration profile:
   - installed/configured/running status
   - tool schema discovery when available
   - unavailable when missing
3. Browser action safety:
   - read/navigate/screenshot allowed by tier
   - form fill requires approval depending on domain/data
   - login credentials manual-only
   - purchases/posts/messages/external submits require approval
4. Trace capture:
   - URL, action, DOM/snapshot summary, screenshot path if available, result
5. UI:
   - Browser Agent Studio card
   - session status
   - action replay list
6. Tests:
   - submit/post action blocked without approval
   - missing Playwright MCP returns unavailable
   - domain allow/deny rules enforced

Hard limits:
- Do not store cookies/passwords.
- Do not let AI enter credentials.
- Do not automate anti-bot evasion.

Closeout:
Update docs and ledger.
```

---

# PHASE 09B — Desktop/App Automation Drivers With WorldGUI Fallback

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Create a desktop/app automation driver architecture. Browser goes through Playwright first. Desktop apps use Windows UI Automation/driver approach where possible, with WorldGUI/screenshot control as fallback only.

Target files:
- artifacts/api-server/src/routes/worldgui.ts
- artifacts/api-server/src/lib/windows-system.ts
- artifacts/api-server/src/lib/foreground-watcher.ts
- artifacts/api-server/src/routes/system.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Automation*,*WorldGUI*,*Settings*,*Operations*

Implement:
1. App driver registry:
   - browser driver routes to Phase 09A
   - file explorer driver: disabled adapter unless real safe implementation is added
   - VS Code driver: disabled adapter unless real safe implementation is added
   - FreeCAD driver reserved for Maker phase
   - generic WorldGUI fallback driver
2. Driver capability model:
   - read state
   - focus app
   - screenshot
   - click/type
   - hotkey
   - file write
   - command execution
3. Safety:
   - excluded apps list
   - redaction zones/apps
   - emergency stop hotkey/config
   - approval gates for write/submit/delete
4. UI:
   - app driver registry/status
   - allowed/excluded apps
   - recent desktop actions
5. Tests:
   - excluded app cannot be controlled
   - disabled drivers cannot execute
   - WorldGUI fallback requires explicit approval for click/type

Hard limits:
- Do not give unrestricted desktop control.
- Do not inspect password managers, banking, HR/private apps, browser cookies, crypto wallets, or secrets.

Closeout:
Update ledger and local AI handoff.
```

---

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

# PHASE 11 — Voice, Screen Context, Meeting Intelligence, And Local Interaction Modes

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add strong local voice/screen/meeting workflows while preserving privacy. Push-to-talk/default local only. Always-visible capture state. No hidden recording.

Target files:
- artifacts/api-server/src/routes/stt.ts
- artifacts/api-server/src/routes/tts.ts
- artifacts/api-server/src/routes/context.ts
- artifacts/api-server/src/routes/chat.ts
- artifacts/api-server/src/lib/task-queue.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Voice*,*Chat*,*Settings*,*Meeting*,*Context*
- sidecars/*

Implement:
1. Voice modes:
   - push-to-talk
   - wake word disabled until configured
   - meeting mode
   - silent command mode
2. Capture policy:
   - visible indicator
   - local-only transcripts by default
   - excluded apps/zones
   - retention policy
   - raw audio auto-delete option
3. Meeting workflow:
   - transcribe
   - summarize
   - extract decisions/action items/dates
   - draft follow-up/email/calendar/task only, no send without approval
4. Screen context:
   - manual screenshot/context attach
   - Screenpipe-style integration profile disabled until configured
   - no always-on capture by default
5. TTS:
   - local TTS default
   - cloud TTS optional only under Phase 02 policy
6. UI:
   - voice settings
   - capture status
   - meeting summary card
   - follow-up approval cards
7. Tests:
   - recording disabled by default
   - follow-up send blocked without approval
   - retention config persists
   - unavailable sidecars fail-soft

Hard limits:
- No covert recording.
- No automatic external sending.
- No cloud transcription by default.

Closeout:
Update ledger and local AI handoff.
```

---

# PHASE 12A — Business Module Foundation And CRM/Support Adapters

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add the business automation foundation without sending messages or spamming. Everything starts draft/approval-first.

Target files:
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/chat.ts
- artifacts/api-server/src/routes/tasks.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Business*,*Integrations*,*Approval*,*Chat*,*Operations*

Implement:
1. Business module registry:
   - Immediate Response Agency
   - Customer Support Copilot
   - Lead Generation
   - Content Factory
   - IT Support Copilot
2. Adapter profiles:
   - Chatwoot disabled until configured
   - Twenty CRM disabled until configured
   - Cal.diy/Cal.com disabled until configured
   - Postiz disabled until configured
   - email/SMS disabled until configured
3. Draft-first workflow:
   - inbound item summary
   - suggested response
   - CRM note proposal
   - calendar slot suggestion
   - human approval before sending/updating external systems
4. Tests:
   - no external send without approval
   - disabled adapter cannot sync
   - lead draft creates approval item
5. UI:
   - Business modules dashboard
   - adapter status cards
   - draft approval queue

Hard limits:
- No stealth bots.
- No spam blasting.
- No platform anti-bot evasion.
- No external posting/messaging without approval.

Closeout:
Update docs and ledger.
```

---

# PHASE 12B — IT Support Copilot And Safe Script Generator

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Build the IT support/sysadmin module using your strengths: Windows repair, Event Logs, AD/GPO checklists, Fortinet/Ivanti/Exchange/365 helpers, onboarding/offboarding, scripts with rollback and proof.

Target files:
- artifacts/api-server/src/routes/system.ts
- artifacts/api-server/src/routes/intelligence.ts
- artifacts/api-server/src/routes/workspace.ts
- artifacts/api-server/src/lib/task-queue.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*IT*,*Diagnostics*,*Scripts*,*Chat*,*Operations*
- scripts/windows/*

Implement:
1. IT support workflow types:
   - diagnose Windows issue
   - summarize event logs
   - generate PowerShell script
   - create onboarding/offboarding checklist
   - Fortinet/FortiAnalyzer helper notes
   - Ivanti deployment script helper
   - Exchange/365 troubleshooting checklist
2. Script safety contract:
   - what it reads
   - what it changes
   - admin required?
   - backup/restore behavior
   - `-WhatIf` where possible
   - logging path
   - exit codes
   - proof section
3. Script execution:
   - draft by default
   - run requires approval and safe command sanitizer
   - destructive scripts manual-only unless explicitly allowed
4. UI:
   - IT Support Studio
   - script preview
   - run/dry-run controls
   - output/log viewer
5. Tests:
   - script missing safety contract is rejected
   - dangerous command blocked
   - dry-run does not execute real command

Hard limits:
- No production/business system changes without manual approval.
- No credential capture.
- No destructive default scripts.

Closeout:
Update ledger and local AI handoff.
```

---

# PHASE 13A — Maker Studio Foundation: Project, CAD, Material, And Safety Model

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add the Maker Studio foundation for CAD, 3D printing, CNC/laser, electronics, shop projects, and physical safety. This phase defines models, safety, and UI shell only.

Target files:
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Studios*,*Maker*,*Settings*,*Operations*
- docs/JARVIS_CONTEXT_INDEX.md

Implement:
1. Maker project model:
   - project id/name/type
   - related files
   - CAD files
   - sliced files
   - printer/CNC/device target
   - material/filament/stock
   - safety tier
   - status
2. Physical machine safety model:
   - read-only
   - simulate
   - prepare/queue
   - approval-required run
   - manual-only at machine
3. Maker integrations registry:
   - FreeCAD
   - CadQuery/build123d
   - KiCad
   - OrcaSlicer/PrusaSlicer/SuperSlicer
   - OctoPrint
   - Moonraker/Mainsail/Fluidd
   - Obico
   - Spoolman
   - CNCjs/LinuxCNC/FluidNC
   - InvenTree
4. All integrations start disabled/unconfigured unless detected.
5. UI:
   - Maker Studio dashboard
   - safety policy badges
   - project list
   - integration status
6. Tests:
   - physical run action blocked by default
   - disabled machine integration cannot execute
   - project model persists

Hard limits:
- Do not start machines.
- Do not send G-code.
- Do not auto-start prints/CNC/laser.

Closeout:
Update ledger and local AI handoff.
```

---

# PHASE 13B — FreeCAD, CAD-as-Code, And KiCad Adapters

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add AI-controlled design interfaces for FreeCAD/CAD-as-code/KiCad safely. Jarvis can draft, inspect, render, and revise models. It cannot physically fabricate in this phase.

Target files:
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/plugins.ts
- artifacts/api-server/src/lib/task-queue.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Maker*,*Studios*,*CAD*,*Integrations*

Implement:
1. FreeCAD adapter:
   - detect install/config
   - support configured MCP endpoint or command profile
   - status: not_installed/not_configured/ready/error
   - actions: inspect, create draft, render screenshot, run safe Python macro in sandboxed/temp project when configured
2. CAD-as-code adapter:
   - CadQuery/build123d config
   - generate parametric script file
   - run only in safe workspace with approval
3. KiCad adapter:
   - detect/config only initially unless real safe CLI integration exists
   - allow project/doc linking and future electronics workflow
4. UI:
   - CAD project card
   - generated script/model preview
   - approve revision button
5. Tests:
   - unavailable FreeCAD cannot report success
   - CAD script generation writes to approved workspace only
   - macro execution requires approval

Hard limits:
- No arbitrary Python macro execution without approval.
- No writing outside Maker project workspace.
- No physical fabrication commands.

Closeout:
Update docs and ledger.
```

---

# PHASE 13C — 3D Printer, Slicer, Spoolman, And Obico Workflow

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Build 3D printing workflow: slice, check filament, queue, monitor, detect failure, and log results. Real print start must require approval and default disabled.

Target files:
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Maker*,*Printer*,*Studios*,*Integrations*,*Approval*

Implement:
1. Slicer adapter profiles:
   - OrcaSlicer
   - PrusaSlicer/SuperSlicer CLI
   - status/detect/config
   - slice dry-run/config validation where available
2. Printer adapters:
   - OctoPrint
   - Moonraker/Klipper
   - Mainsail/Fluidd profile references
   - FDM Monster optional
3. Filament inventory:
   - Spoolman adapter status/config
   - check material availability before queueing
4. Failure monitoring:
   - Obico adapter status/config
   - print monitoring state only when configured
5. Workflow:
   - design/model selected
   - slice proposal
   - filament check
   - queue print proposal
   - start print approval
   - monitoring/logging
6. UI:
   - printer dashboard
   - spool/material status
   - slice job card
   - print approval card
7. Tests:
   - start print blocked without approval
   - unavailable printer returns not_configured
   - filament check can block queue
   - monitoring unavailable state is visible

Hard limits:
- No unattended print start by default.
- No temperature/heater commands without approval.
- No printer API token logging.

Closeout:
Update ledger/local AI handoff.
```

---

# PHASE 13D — CNC, Laser, CAM, And Electronics Bench Safety Console

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add CNC/laser/CAM/electronics bench planning safely. Jarvis can prepare, simulate, inspect, and generate setup sheets. Dangerous machine start remains manual-only.

Target files:
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Maker*,*CNC*,*Laser*,*Electronics*,*Studios*

Implement:
1. CAM/CNC adapters:
   - FreeCAD Path profile
   - CNCjs profile
   - LinuxCNC profile
   - FluidNC profile
   - all disabled until configured
2. Safety tiers:
   - G-code generation = prepare/approval
   - simulation = allowed when local/offline
   - sending G-code = approval-required
   - spindle/laser/plasma/motion start = manual-only at machine by default
3. Setup sheet generator:
   - stock dimensions
   - tool list
   - workholding notes
   - PPE/safety checklist
   - human verification checklist
4. Electronics bench:
   - KiCad project flow
   - BOM export/import plan
   - InvenTree parts check when configured
   - serial/USB hardware control disabled unless later explicitly implemented
5. UI:
   - CAM safety console
   - setup sheet preview
   - manual-only gates clearly visible
6. Tests:
   - spindle/laser start cannot run through software
   - G-code send blocked without approval
   - disabled CNC adapter cannot execute

Hard limits:
- Never start spindle, laser, plasma, router, or machine motion automatically.
- Never bypass manual safety checklist.

Closeout:
Update docs and ledger.
```

---

# PHASE 14A — Edge Node Architecture And Home/Shop Autopilot Foundation

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Prevent the gaming PC from becoming a fragile always-on server. Add edge-node architecture so always-on Home Assistant, printer, camera, NAS, and shop tasks can live on mini PCs/Pis/NAS while the gaming PC remains the heavy AI brain.

Target files:
- artifacts/api-server/src/routes/remote.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/system.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Remote*,*Nodes*,*Home*,*Shop*,*Settings*,*Operations*

Implement:
1. Edge node registry:
   - node id/name/type
   - role: home-assistant/printer/camera/nas/shop/homelab/worker
   - endpoint
   - auth profile
   - health
   - last seen
   - allowed capabilities
2. Gaming PC role:
   - heavy local AI
   - CAD/coding/media
   - optional coordinator
   - not required for critical home safety automations
3. Node health checks:
   - ping/status route
   - service summary
   - unavailable state
4. UI:
   - Edge Nodes dashboard
   - node health/status
   - role assignment
5. Tests:
   - unavailable node does not break app
   - edge action requires node capability and approval if risky

Hard limits:
- Do not assume always-on gaming PC.
- Do not install services to remote nodes in this phase.

Closeout:
Update ledger/local AI handoff.
```

---

# PHASE 14B — Home Assistant, Robot Vacuum, Cameras, MQTT, And Shop Devices

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Integrate home/shop automation safely: Home Assistant, HA MCP, ESPHome, Zigbee2MQTT, MQTT, Valetudo robot vacuum, Frigate cameras, WLED/lights, shop devices.

Target files:
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/plugins.ts
- artifacts/api-server/src/routes/remote.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Home*,*Shop*,*Devices*,*Integrations*,*Approval*

Implement:
1. Home Assistant adapter:
   - endpoint/token stored securely
   - exposed entity allowlist
   - read state by default
   - service calls require tier check
2. HA MCP profile:
   - disabled until configured
   - route through tool firewall
3. MQTT profile:
   - broker config
   - topics allowlist
   - publish actions require approval unless low-risk preset
4. Robot vacuum:
   - Valetudo profile
   - read status/map/rooms
   - clean zone requires approval or explicit low-risk rule
5. Cameras:
   - Frigate profile
   - read events/detections
   - no hidden recording changes
6. Shop devices:
   - lights/fans/air filter/compressor/garage door profiles
   - compressor/garage door/unlock = approval required
7. UI:
   - Home/Shop Autopilot dashboard
   - entity allowlist
   - physical action tier badges
   - recent events
8. Tests:
   - unallowlisted entity cannot be controlled
   - garage/lock/compressor action requires approval
   - read-only mode cannot execute service calls
   - missing HA/Valetudo/Frigate shows unavailable

Hard limits:
- No physical action without configured entity allowlist.
- No door/lock/garage/compressor/heater action without explicit approval.
- No cloud smart-home dependency.

Closeout:
Update docs and ledger.
```

---

# PHASE 15A — HomeLab Architect Source Of Truth: NetBox/Nautobot, Inventory, And Diagrams

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add HomeLab Architect foundation: source of truth for network/devices/VLANs/IPs/VMs/services before applying any config.

Target files:
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*HomeLab*,*Network*,*Integrations*,*Diagrams*,*Settings*

Implement:
1. HomeLab entities:
   - sites/rooms/racks
   - devices
   - interfaces
   - VLANs
   - subnets/IP ranges
   - DNS zones/records
   - services/containers/VMs
   - firewall zones
2. NetBox/Nautobot adapters:
   - disabled until configured
   - read-only sync first
   - write/update requires later approval flow
3. Blueprint generator:
   - network diagram data structure
   - VLAN/IP plan
   - service placement plan
4. UI:
   - HomeLab Architect page
   - device/VLAN/IP plan views
   - source-of-truth sync status
5. Tests:
   - read-only adapter cannot write
   - invalid VLAN/subnet data rejected
   - blueprint can be generated locally

Hard limits:
- No network/firewall changes in this phase.
- No remote device config writes.

Closeout:
Update ledger/local AI handoff.
```

---

# PHASE 15B — HomeLab Config Generation, Validation, And Apply Pipeline

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Let Jarvis design and safely propose homelab/network/server stacks: Proxmox, Docker, OpenTofu/Terraform, Ansible, OPNsense/UniFi, DNS, monitoring. Apply is gated and rollback-aware.

Target files:
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/tasks.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*HomeLab*,*Network*,*Approval*,*Operations*
- scripts/*

Implement:
1. Config-generation adapters:
   - Ansible profile
   - OpenTofu/Terraform profile
   - Proxmox profile
   - OPNsense profile
   - UniFi profile
   - Docker Compose profile
   - Batfish validation profile
2. Strict pipeline:
   - inventory/read-only
   - generate proposed topology/config
   - validate config
   - backup current config if applicable
   - show diff
   - approval
   - apply
   - verify
   - rollback if failed
3. No direct apply until all stages exist.
4. UI:
   - generated config viewer
   - validation results
   - diff/approval card
   - rollback plan
5. Tests:
   - apply blocked before validation
   - apply blocked without backup plan for mutable targets
   - firewall/DHCP/VLAN write requires approval
   - Batfish unavailable does not fake validation

Hard limits:
- No firewall/network/Proxmox/UniFi changes without staged approval.
- No SSH credentials in logs.
- No remote destructive commands by default.

Closeout:
Update docs and ledger.
```

---

# PHASE 16 — Home SOC And Security Monitoring Copilot

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add a local security/SOC copilot for home network and shop: Wazuh, Zeek, Suricata, LibreNMS/Zabbix/Netdata/Uptime Kuma, AdGuard/Pi-hole, logs, DNS, unknown devices, change timelines.

Target files:
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/observability.ts
- artifacts/api-server/src/routes/system.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Security*,*SOC*,*Network*,*Diagnostics*,*Integrations*

Implement:
1. SOC adapter profiles:
   - Wazuh
   - Zeek
   - Suricata/OPNsense IDS
   - LibreNMS
   - Zabbix
   - Netdata
   - Uptime Kuma
   - AdGuard Home/Pi-hole
2. Read-only first:
   - alerts/events/status/DNS summary
   - no rule changes in this phase
3. Analysis workflows:
   - unknown device report
   - suspicious DNS summary
   - WAN outage timeline
   - noisy IoT device summary
   - “what changed?” report
4. UI:
   - Home SOC dashboard
   - alert summaries
   - DNS/security timeline
5. Tests:
   - disabled adapters return unavailable
   - rule changes blocked without later approval pipeline
   - summaries use local model by default

Hard limits:
- No production/security changes without manual approval.
- No credential logging.
- No invasive scanning outside configured network scope.

Closeout:
Update ledger/local AI handoff.
```

---

# PHASE 17A — Digital Twin Core For Home, Shop, Network, Vehicles, Tools, And Projects

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Create the Digital Twin: one shared relationship graph for rooms, shop zones, tools, printers, cameras, sensors, vehicles, network devices, VMs, containers, documents, parts, filament, projects, and automations.

Target files:
- artifacts/api-server/src/db/schema.ts
- artifacts/api-server/src/routes/context.ts
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/routes/rag.ts
- artifacts/localai-control-center/src/**/*DigitalTwin*,*Inventory*,*Projects*,*Context*

Implement:
1. Entity model:
   - id, type, name, description, metadata, createdAt, updatedAt
2. Relationship model:
   - source entity, relation type, target entity, confidence, provenance
3. Entity types:
   - room, zone, tool, printer, camera, sensor, vehicle, network_device, vm, container, document, part, filament, project, automation, service
4. API:
   - create/read/update entity
   - create/read/delete relationship
   - search graph
   - entity detail with linked docs/jobs/events
5. UI:
   - Digital Twin explorer
   - entity detail
   - linked documents/projects/devices
6. Tests:
   - entity/relationship CRUD
   - provenance required for AI-created relation
   - deletion does not orphan silently; mark as archived or block with linked refs

Hard limits:
- Do not replace existing RAG/memory; link to it.
- Do not infer high-confidence facts without source/provenance.

Closeout:
Update docs and ledger.
```

---

# PHASE 17B — Inventory, Parts, Tools, Spool, Asset, And Project-To-Reality Pipeline

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add inventory/parts/tools/materials workflow and connect it to the Maker Studio, Evidence Vault, Digital Twin, vehicle projects, and shop projects.

Target files:
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/routes/context.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Inventory*,*Parts*,*Tools*,*Projects*,*Maker*

Implement:
1. Inventory adapters:
   - InvenTree
   - PartKeepr
   - Snipe-IT
   - HomeBox
   - Spoolman
   - all disabled until configured
2. Local inventory model if no external system configured:
   - item, category, location/bin, quantity, unit, project link, reorder threshold, supplier link, notes
3. Project-to-reality pipeline:
   - idea
   - research
   - requirements
   - design/CAD
   - parts/material check
   - purchase list
   - fabrication/print/CNC
   - assembly guide
   - test checklist
   - documentation
   - maintenance reminders
4. QR/NFC label plan:
   - generate label data
   - no external printing required initially
5. UI:
   - inventory dashboard
   - project pipeline board
   - material/parts availability check
6. Tests:
   - unavailable external inventory does not block local inventory
   - low stock creates reorder suggestion, not purchase
   - project pipeline state persists

Hard limits:
- No automatic purchasing.
- No inventory deletion without approval.

Closeout:
Update ledger/local AI handoff.
```

---

# PHASE 18 — Automotive Mechanic And Vehicle Diagnostics Assistant

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Build the automotive assistant for your Foxbody/LQ4 project and future vehicles: OBD-II, live data, DTC explanation, repair logs, wiring notes, part history, photo/audio symptom notes.

Target files:
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/rag.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Automotive*,*Mechanic*,*Vehicle*,*Studios*

Implement:
1. Vehicle profile model:
   - year/make/model/body
   - drivetrain/engine/trans/ECU
   - mods
   - known wiring notes
   - parts list
   - linked docs/receipts
2. Preload/create your Foxbody profile:
   - 1988 Mustang GT hatchback
   - LQ4
   - 4L80E
   - ACES Jackpot ECU
   - BTR Stage 3 NA cam
   - FAST 102mm throttle body
   - JEGS intake
   - Z28 radiator/fans
   - On3 central fuel hat / 3-pump system
   - Foxbody wiring notes field
3. OBD adapters:
   - python-OBD profile disabled until configured
   - ELM327 emulator profile for development/testing
   - SavvyCAN profile disabled until configured
4. Workflows:
   - read DTC/freeze frame when configured
   - symptom intake
   - diagnostic test plan
   - live sensor graph metadata
   - repair log and final fix
5. UI:
   - Mechanic Studio
   - vehicle profile
   - DTC/test plan/repair log views
6. Tests:
   - real OBD unavailable returns not_configured
   - emulator/sample DTC produces diagnostic plan
   - repair log links to vehicle

Hard limits:
- Do not claim repair certainty.
- Do not command vehicle ECU writes.
- No safety-critical tune changes without manual review.

Closeout:
Update ledger/local AI handoff.
```

---

# PHASE 19 — Robotics Lab Future Layer

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Prepare for future ROS 2 / MoveIt / Nav2 / Gazebo robotics without risking physical hardware. This phase is architecture and simulator-first.

Target files:
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Robotics*,*Studios*,*Integrations*

Implement:
1. Robotics integration profiles:
   - ROS 2
   - MoveIt 2
   - Nav2
   - Gazebo/Ignition simulator
   - depth camera profile
   - all disabled until configured
2. Robot capability model:
   - simulation only
   - read state
   - plan motion
   - execute motion approval-required
   - manual-only for unsafe actuators
3. Simulator-first workflow:
   - import robot/project profile
   - plan task
   - simulate
   - show result
   - physical execution blocked by default
4. UI:
   - Robotics Lab page/card
   - simulator status
   - motion safety tier badges
5. Tests:
   - physical motion blocked by default
   - simulator unavailable is explicit
   - manual-only tier cannot execute through API

Hard limits:
- No physical robot movement in this phase.
- No actuator control without explicit future implementation and safety review.

Closeout:
Update docs and ledger.
```

---

# PHASE 20 — UI/UX Integration And Control Center Polish

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Unify all new modules into the existing control center UI without making it cluttered. Every user-facing phase should already have minimal UI; this pass organizes, polishes, and reduces friction.

Target files:
- artifacts/localai-control-center/src/**/*
- artifacts/api-server/src/routes/index.ts
- artifacts/api-server/src/routes/* relevant to module status
- docs/JARVIS_CONTEXT_INDEX.md

Implement:
1. Navigation groups:
   - Home / Dashboard
   - Chat / Build
   - Models / Providers
   - Tools / MCP / OpenClaw
   - Automation
   - Maker Studio
   - HomeLab / Network
   - Home/Shop
   - Evidence / Memory
   - Security / SOC
   - Operations / Logs / Replay
   - Settings
2. Dashboard status cards:
   - runtime mode
   - local-first status
   - active models
   - pending approvals
   - jobs
   - updater proposals
   - service health
   - blockers
3. Shared components:
   - risk badge
   - unavailable state card
   - approval button group
   - resource impact badge
   - local/cloud badge
   - physical action tier badge
4. UX rules:
   - do not bury Emergency Stop
   - do not show fake online/ready states
   - settings must make startup policy obvious
   - cloud/API optional status must be clear
5. Tests:
   - major pages render
   - unavailable states render
   - permission notice components still pass
   - build passes

Hard limits:
- Do not redesign the whole app from scratch.
- Do not remove existing pages unless replaced with working equivalents.

Closeout:
Update ledger/local AI handoff.
```

---

# PHASE 21 — Packaging, Install, Backup, Restore, And Disaster Recovery

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Make the project installable, recoverable, and safe for a gaming PC. Add backup/restore/snapshot behavior for config, DB, docs, model metadata, integration configs, and generated assets.

Target files:
- package.json
- README.md
- SETUP/installer docs if present
- scripts/*
- artifacts/api-server/src/routes/system.ts
- artifacts/api-server/src/routes/updater.ts
- artifacts/api-server/src/routes/rollback.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Backup*,*Settings*,*Operations*

Implement:
1. Backup plan:
   - SQLite DB
   - app settings
   - integration configs excluding secrets or with redaction
   - prompt/context docs
   - generated workflows/templates
   - model role metadata, not model blobs by default
2. Restore plan:
   - validate backup manifest
   - dry-run restore
   - approval required
   - rollback point before restore
3. Installer/update docs:
   - Windows-first setup
   - gaming-PC safety
   - optional edge nodes
   - local-first model setup
4. Scripts:
   - backup-config
   - restore-config dry-run
   - health-check
   - emergency-stop
   - gaming-mode
5. UI:
   - Backup/Restore page/card
   - latest backup status
   - dry-run restore result
6. Tests:
   - backup manifest generated
   - restore dry-run does not modify live data
   - secrets redacted

Hard limits:
- No destructive restore without approval.
- No backing up raw secrets in clear text.
- No deleting user data.

Closeout:
Update ledger/local AI handoff.
```

---

# PHASE 22 — Local AI Transition: Make LOCALAI Capable Of Building Itself

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Prepare for the transition from paid/cloud Codex usage to local models controlling development. Create compact context, model presets, evals, and workflows so local AI can keep building the project with less token/usage cost.

Target files:
- docs/JARVIS_LOCAL_AI_HANDOFF.md
- docs/JARVIS_CONTEXT_INDEX.md
- docs/JARVIS_PROMPT_RULES.md
- docs/JARVIS_TEST_MATRIX.md
- artifacts/api-server/src/routes/models.ts
- artifacts/api-server/src/routes/openai.ts
- artifacts/api-server/src/routes/chat.ts
- artifacts/api-server/src/routes/intelligence.ts
- artifacts/localai-control-center/src/**/*Models*,*Chat*,*Workspace*,*Settings*
- README.md

Implement:
1. Local builder profiles:
   - fast local code model
   - deep local code model
   - local reviewer model
   - local RAG model/embedding model
   - optional cloud escape hatch disabled by default
2. Context packs:
   - `docs/context-packs/core-architecture.md`
   - `docs/context-packs/safety-and-permissions.md`
   - `docs/context-packs/current-build-state.md`
   - `docs/context-packs/next-phase-template.md`
3. In-app “Build Jarvis” workflow:
   - select phase/task
   - read compact context docs
   - propose target files
   - approval
   - edit
   - test
   - update ledger
4. Local evals:
   - ensure local model can summarize repo state
   - propose safe patch plan
   - detect unsafe action request
   - update ledger format
5. UI:
   - Local Builder setup card
   - context pack viewer
   - model readiness checklist
6. Tests:
   - context packs exist
   - local builder refuses to proceed if ledger missing
   - optional cloud remains disabled by default

Hard limits:
- Do not require cloud.
- Do not hide token-heavy context in prompts; use context docs.
- Do not allow local model to self-modify without approval.

Closeout:
Update all persistent docs.
```

---

# PHASE 23 — Final Coverage Audit And Gap Closer

```text
Work inside existing LOCALAI. Read the entire persistent context set first:
- AGENTS.md
- docs/JARVIS_PROMPT_RULES.md
- docs/JARVIS_CONTEXT_INDEX.md
- docs/JARVIS_IMPLEMENTATION_LEDGER.md
- docs/JARVIS_PHASE_MAP.md
- docs/JARVIS_TEST_MATRIX.md
- docs/JARVIS_DECISIONS.md
- docs/JARVIS_BLOCKERS.md
- docs/JARVIS_LOCAL_AI_HANDOFF.md
- README.md
- AUDIT_REPORT.md
- REMAINING_PHASES_AND_REPO_RESEARCH.md

Goal:
Hard audit the implementation against the entire Jarvis/Stark Lab plan and this prompt pack. Find missing work, duplicate systems, weak tests, unsafe flows, fake-ready integrations, and token-waste issues. Fix small gaps directly; document larger blockers.

Audit categories:
1. Existing repo reused, not rebuilt.
2. Persistent context/memory/ledger exists and is current.
3. Gaming-PC safety and runtime modes.
4. Local-first optional API keys.
5. Approval queue and durable jobs.
6. Observability, evals, and mission replay.
7. Model lifecycle/replacement rules.
8. Self-updater/self-maintainer safety.
9. MCP/OpenClaw/NemoClaw tool firewall.
10. RAG/Evidence Vault.
11. Browser/desktop automation.
12. Chat-driven program modification.
13. Voice/screen/meeting workflows.
14. Business modules.
15. Maker/CAD/3D printer/CNC/electronics.
16. Home/shop/robot vacuum/cameras/edge nodes.
17. HomeLab/network architect.
18. Home SOC.
19. Digital twin/inventory/project pipeline.
20. Automotive assistant.
21. Robotics lab.
22. UI/UX integration.
23. Backup/restore/install.
24. Local AI transition.
25. Tests, smoke checks, docs, blockers.

Implement:
1. Create/update `docs/JARVIS_FINAL_COVERAGE_AUDIT.md`.
2. Add/extend `scripts/verify-jarvis.mjs` to check every completed phase has:
   - doc/ledger entry
   - API route or intentional no-route reason
   - UI surface or intentional API-only reason
   - tests or documented test blocker
   - unavailable states for unconfigured integrations
   - no unsafe auto-start policy
3. Fix small missing wiring where safe.
4. Add unresolved items to `docs/JARVIS_BLOCKERS.md` with exact next action.
5. Update `docs/JARVIS_LOCAL_AI_HANDOFF.md` with final build status.

Tests:
- `pnpm -r typecheck`
- `pnpm test`
- `pnpm run verify:baseline`
- `pnpm run verify:jarvis
node scripts/jarvis/verify-build-kit.mjs`
- `pnpm run eval:jarvis` if implemented
- UI build if available: `pnpm --filter localai-control-center build`

Hard limits:
- Do not mark a phase complete unless it has code/docs/tests/proof.
- Do not hide missing work.
- Do not skip blockers.

Final answer:
Provide a blunt coverage summary: complete, partial, blocked, unsafe/not implemented, next actions.
```


---

# Fast-Follow Micro Prompts

Use these only when a phase fails or gets too large.

## Micro Prompt — Repair Failed Phase Without Expanding Scope

```text
Work inside existing LOCALAI. Read AGENTS.md and docs/JARVIS_IMPLEMENTATION_LEDGER.md first.

The previous phase failed. Do not add new features. Repair only the failure.

Required:
1. Identify the exact failing command/test/error.
2. Identify files changed by the previous phase.
3. Fix only the cause of failure.
4. Run the failed command again plus relevant targeted tests.
5. Update docs/JARVIS_IMPLEMENTATION_LEDGER.md and docs/JARVIS_BLOCKERS.md.
6. Final answer must include before/after failure evidence.
```

## Micro Prompt — Reduce Token Usage Before Continuing

```text
Work inside existing LOCALAI. Compact context for future local/cloud agents.

Read:
- docs/JARVIS_IMPLEMENTATION_LEDGER.md
- docs/JARVIS_CONTEXT_INDEX.md
- docs/JARVIS_TEST_MATRIX.md
- docs/JARVIS_BLOCKERS.md

Update:
- docs/JARVIS_LOCAL_AI_HANDOFF.md
- docs/context-packs/current-build-state.md if it exists

Goal:
Produce a compact, accurate state summary under 2500 words covering current architecture, completed phases, incomplete phases, tests, blockers, and next prompt to run. Do not change runtime code.
```

## Micro Prompt — Verify No Fake Ready States

```text
Work inside existing LOCALAI. Audit unavailable/not_configured/not_installed states.

Goal:
Find any integration/tool/provider/device that can report ready/success without real configuration or proof. Fix by making it return explicit unavailable status and adding a test.

Areas:
- integrations
- plugins/tools/MCP
- OpenClaw/NemoClaw
- RAG parsers
- browser automation
- Maker/CAD/3D printers/CNC
- Home Assistant/robot vacuum/cameras
- HomeLab/network/SOC
- local/cloud providers

Run typecheck/tests and update ledger.
```

## Micro Prompt — Create The Next Best Local-AI Prompt

```text
Work inside existing LOCALAI. Read the persistent context docs and create one compact prompt for the next local model run.

Output only:
1. Goal
2. Files to inspect
3. Files to update
4. Implementation requirements
5. Tests
6. Closeout ledger updates

Keep it under 1200 words. Do not edit runtime code.
```


## AUTHORITATIVE PHASE OVERRIDES FOR v2.6

The split files in `phase-prompts/` are the source of truth. Phase 13B and Phase 18 were strengthened after the combined prompt pack was generated. Use the split phase files if there is any mismatch.

- Phase 13B = `phase-prompts/PHASE_13B_FREECAD_CAD_AS_CODE_AND_KICAD_ADAPTERS.md`
- Phase 18 = `phase-prompts/PHASE_18_AUTOMOTIVE_MECHANIC_AND_VEHICLE_DIAGNOSTICS_ASSISTANT.md`

Do not use older weaker wording for these phases.
