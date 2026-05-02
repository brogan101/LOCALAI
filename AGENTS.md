# AGENTS.md — LOCALAI Jarvis Build Rules

These instructions apply to all AI coding agents working inside this repository.

## Project truth

This is the existing `brogan101/LOCALAI` project. Do not treat it like a blank repo.

Known workspace layout:

```text
artifacts/api-server
artifacts/localai-control-center
lib/*
```

Known existing systems to extend before creating anything new:

- Express API server under `artifacts/api-server/src`
- React/Vite control center under `artifacts/localai-control-center`
- SQLite/Drizzle schema under `artifacts/api-server/src/db`
- existing routes in `artifacts/api-server/src/routes`
- existing model orchestration, RAG, STT/TTS, web, integrations, updater, repair, observability, tasks, rollback, plugins, and WorldGUI concepts
- existing tests under package `tests/` folders


## Codex surface guidance

This kit is designed for Codex App, Codex CLI, Codex IDE extension, cloud/delegated Codex tasks, GitHub code review, Codex skills/plugins, and Codex automations. Use the safest surface for the job:

- Early phases: use Codex App/CLI/IDE in Suggest or Auto Edit mode only. Do not use unrestricted Full Auto until safety, approval, rollback, observability, and emergency-stop gates are working.
- Use a separate git branch or Codex worktree per phase. Do not let two agents edit the same phase or files at the same time.
- Parallel Codex agents are allowed only after Phase 04, and only for independent review/audit prompts unless the phase map says dependencies are complete.
- Codex cloud/delegated tasks may be used for isolated review, tests, or PR preparation, but the repo ledger remains the source of truth. Pull results back and update the ledger before moving on.
- Codex code review should be used after phase PRs, but review comments do not replace running local tests.
- Codex skills/plugins/automations can be added later, but must follow the same permission, safety, local-first, and audit rules as Jarvis tools.

## Required context files

Before every phase, read these files first if present:

```text
JARVIS_CODEX_PROMPT_PACK_v2.md
docs/JARVIS_EXECUTION_GUIDE.md
docs/JARVIS_IMPLEMENTATION_LEDGER.md
docs/JARVIS_CONTEXT_INDEX.md
docs/JARVIS_DECISIONS.md
docs/JARVIS_PHASE_MAP.md
docs/JARVIS_BLOCKERS.md
docs/JARVIS_TEST_MATRIX.md
docs/JARVIS_LOCAL_AI_HANDOFF.md
docs/JARVIS_PROMPT_RULES.md
docs/JARVIS_LOCAL_FIRST_POLICY.md
docs/JARVIS_SAFETY_TIERS.md
docs/JARVIS_SOURCE_VERIFICATION.md
docs/JARVIS_CODEX_WORKFLOW.md
docs/JARVIS_UI_STYLE_GUARD.md
docs/JARVIS_REQUIREMENTS_TRACEABILITY.md
docs/JARVIS_PRESTART_ENHANCEMENTS.md
docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md
docs/JARVIS_PHASE_ACCEPTANCE_CONTRACT.md
docs/JARVIS_EXPERT_MODES.md
docs/JARVIS_FINAL_PRESTART_REVIEW.md
```

## One phase only

Run only the phase the user explicitly requested. Do not start later phases. Do not batch multiple phases unless the user explicitly asks.

## Preflight before editing

Before editing code:

1. Inspect only the relevant files first.
2. Summarize existing implementation in 10 bullets maximum.
3. List files/functions/routes/types to reuse.
4. Identify conflicts, blockers, or partial existing implementations.
5. Extend existing systems instead of creating duplicates.
6. State the intended changed files before making large edits.

## No fake completion

Do not create fake success paths, dead UI, fake adapters, fake integrations, or silent no-op implementations.

If a real integration cannot be implemented safely in the current phase, create a disabled adapter only when useful. Disabled adapters must:

- visibly return `not_configured`, `not_installed`, or `disabled`
- never claim a successful action
- be covered by a test proving they cannot execute
- add the missing real implementation to `docs/JARVIS_BLOCKERS.md` with exact next action

## Gaming-PC safety

This repo targets a gaming PC, not a dedicated server.

No new heavy service may auto-start by default. Every new service/integration must declare:

- startup policy: `manual`, `on_demand`, `mode_based`, or `disabled`
- allowed runtime modes
- estimated CPU/RAM/VRAM impact if known
- stop command
- health check
- emergency-stop behavior

## Local-first policy

Local AI is the default. Paid/cloud APIs are optional only.

Before any cloud/API provider is used, the app must:

- show provider/model
- show whether data leaves the machine
- classify data sensitivity
- block secrets/credentials/private files by default
- require explicit user approval for first use
- work with no API keys installed

## Physical action safety

Physical systems require stricter rules than software actions.

Any feature controlling printers, CNC, lasers, garage doors, robot vacuums, shop devices, cameras, relays, sensors, Home Assistant, vehicles, drones, robots, or machines must include:

- simulator/mock mode
- read-only mode
- dry-run mode
- approval-required execution mode
- physical action tier
- audit event
- emergency stop

Machine-start actions for CNC/laser/dangerous shop tools are manual-only unless the user later creates a specific hardware-safe workflow.

## Required files to update every phase

Every phase must update, at minimum:

```text
docs/JARVIS_IMPLEMENTATION_LEDGER.md
docs/JARVIS_PHASE_MAP.md
docs/JARVIS_BLOCKERS.md
docs/JARVIS_TEST_MATRIX.md
docs/JARVIS_LOCAL_AI_HANDOFF.md
docs/JARVIS_CONTEXT_INDEX.md if new files, routes, services, scripts, or UI areas were added
docs/JARVIS_DECISIONS.md if architecture or safety decisions changed
```

If a phase changes policies, also update:

```text
docs/JARVIS_PROMPT_RULES.md
docs/JARVIS_LOCAL_FIRST_POLICY.md
docs/JARVIS_SAFETY_TIERS.md
docs/JARVIS_SOURCE_VERIFICATION.md
docs/JARVIS_CODEX_WORKFLOW.md
docs/JARVIS_UI_STYLE_GUARD.md
docs/JARVIS_REQUIREMENTS_TRACEABILITY.md
docs/JARVIS_PRESTART_ENHANCEMENTS.md
docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md
docs/JARVIS_PHASE_ACCEPTANCE_CONTRACT.md
docs/JARVIS_EXPERT_MODES.md
```

## Required checks

Use the most specific checks possible. At minimum, run what applies:

```powershell
pnpm install --frozen-lockfile
pnpm -r typecheck
pnpm test
pnpm --filter localai-control-center build
```

For small docs-only changes, explain why full tests were not required and still run a lightweight validation where possible.

## Proof required before finishing

Every final response must include and must not claim completion without:

- changed files
- summary of actual changes
- tests/checks run and results
- blockers, if any
- what was deliberately not changed
- next exact phase to run
- whether the implementation ledger and local AI handoff were updated


## Phase acceptance contract

Every phase must obey `docs/JARVIS_PHASE_ACCEPTANCE_CONTRACT.md
docs/JARVIS_EXPERT_MODES.md`.

At the end of each phase, append a concise acceptance block to `docs/JARVIS_IMPLEMENTATION_LEDGER.md` and update `docs/JARVIS_LOCAL_AI_HANDOFF.md` for future local-model continuation.

Do not claim completion if the acceptance block, test results, changed files, blockers, or next phase are missing.

## External project watchlist

Before adding any third-party integration, dependency, MCP server, external service, model backend, physical-device adapter, or tool runtime, update `docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md`.

Do not make a project core until its local-first behavior, license/risk status, update method, runtime mode, and security boundaries are recorded.

## Degraded-mode behavior

Missing dependencies are not failures unless the phase requires them. They must produce visible states such as `not_installed`, `not_configured`, `offline`, or `blocked_by_policy`.

Never fake success when Docker, Ollama, GPU telemetry, Python, Git, Node/pnpm, internet, or API keys are missing.


## Fail loudly

If the required files are missing, tests cannot run, dependencies are missing, a tool cannot be accessed, or the phase cannot be completed safely, stop and say exactly why. Update `docs/JARVIS_BLOCKERS.md` before finishing.


## Build-kit self-check

Before Phase 00, run this from the repo root after dropping in the kit:

```powershell
node scripts/jarvis/verify-build-kit.mjs
```

If it fails, fix the kit placement before asking Codex to run Phase 00.

## Expert-mode requirements

Do not downgrade advanced modules into generic helpers. Use `docs/JARVIS_EXPERT_MODES.md` as a contract. Examples:

- Automotive must become Master Tech diagnostics, not only an OBD code explainer.
- Maker/CAD must become Master Fabricator/CAD Engineer workflow, including local CAD-as-code and optional text-to-CAD providers.
- HomeLab must become Master Network Architect workflow, including source-of-truth, validation, diff, approval, verify, rollback.
- UI work must use the UI Custodian rule and preserve the existing LOCALAI style.

If an expert workflow cannot be implemented safely in the current phase, create a disabled/no-fake-success adapter and record the exact blocker.
