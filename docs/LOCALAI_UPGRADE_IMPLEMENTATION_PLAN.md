# LOCALAI Upgrade Implementation Plan

Date: 2026-04-23
Scope: repo-aware implementation audit and phased upgrade map only. No feature implementation, UI redesign, route rewrite, or endpoint behavior change is included in this document.

## Baseline Result

Baseline checks passed before this plan was written.

Commands identified from package scripts:

- Root `package.json`
  - `pnpm run dev:api` -> `pnpm --filter api-server dev`
  - `pnpm run dev:ui` -> `pnpm --filter localai-control-center dev`
  - `pnpm run dev` -> `pnpm run dev:api & pnpm run dev:ui`
  - `pnpm run start:api` -> `pnpm --filter api-server start`
  - `pnpm run typecheck` -> `pnpm -r typecheck`
  - `pnpm test` -> `pnpm --filter api-server test && pnpm --filter localai-control-center test`
- `artifacts/api-server/package.json`
  - `pnpm --filter api-server typecheck`
  - `pnpm --filter api-server test`
  - `pnpm --filter api-server test:security`
  - `pnpm --filter api-server test:openai-compat`
  - `pnpm --filter api-server test:route-guards`
  - `pnpm --filter api-server test:permission-routes`
- `artifacts/localai-control-center/package.json`
  - `pnpm --filter localai-control-center typecheck`
  - `pnpm --filter localai-control-center test`
  - `pnpm --filter localai-control-center build`
  - `pnpm --filter localai-control-center test:api`
  - `pnpm --filter localai-control-center test:permission-notice`
  - `pnpm --filter localai-control-center test:page-permissions`

Checks run:

- `pnpm -r typecheck`: passed for `api-server` and `localai-control-center`.
- `pnpm test`: passed all API and UI tests.
- `pnpm --filter localai-control-center build`: passed Vite production build.

## Current Repo Map

Workspace packages:

- `artifacts/api-server`: Express/TypeScript backend.
- `artifacts/localai-control-center`: React/Vite control center.
- `plugins`: static plugin manifest directory.

Backend application and route mounts:

- `artifacts/api-server/src/app.ts`
  - Express app setup, CORS, JSON body parsing, cookie parsing, pino logging.
  - Distributed-node auth middleware and local browser request guard.
  - Strict Local Mode outbound fetch patch.
  - Mounts main routes at `/api`.
  - Mounts OpenAI-compatible routes at `/v1` and `/api/v1`.
  - Boots database migrations, thought log hydration, task queue hydration, tray sidecar, STT sidecar, foreground watcher, distributed heartbeat, and model catalog sync.
- `artifacts/api-server/src/routes/index.ts`
  - Mounts health, stack, models, workspace, system, updates, Continue, studios, remote, chat, sessions, filebrowser, context, intelligence, integrations, usage, updater, repair, kernel, observability, tasks, rollback, STT, TTS, RAG, web, benchmark, pinboard, token budget, time travel, plugins, and WorldGUI routes.

OpenAI-compatible endpoints to preserve:

- `artifacts/api-server/src/routes/openai.ts`
  - `/models`
  - `/chat/completions`
  - `/responses`
  - `/embeddings`
- Mounted by `artifacts/api-server/src/app.ts` at:
  - `/v1`
  - `/api/v1`
- Guarded by:
  - `artifacts/api-server/src/tests/openai-compat.test.ts`

Database and migrations:

- `artifacts/api-server/src/db/database.ts`
  - SQLite via `better-sqlite3`.
  - DB path: `~/LocalAI-Tools/localai.db`.
  - WAL mode and foreign keys enabled.
- `artifacts/api-server/src/db/migrate.ts`
  - Creates core tables and migrates legacy JSON state.
  - Existing tables include `chat_sessions`, `chat_messages`, `app_settings`, `capability_state`, `role_assignments`, `usage_metrics`, `thought_log`, `workspace_registry`, `model_pull_history`, `audit_log`, `refactor_plans`, `refactor_jobs`, `async_jobs`, `benchmark_runs`, `pinboard_items`, and `session_token_budgets`.
- `artifacts/api-server/src/db/schema.ts`
  - Drizzle schema for current durable tables.
- `artifacts/api-server/src/lib/rag.ts`
  - Lazily creates RAG-specific SQLite tables: `rag_collections` and `rag_chunks`.

UI navigation and route definitions:

- `artifacts/localai-control-center/src/App.tsx`
  - Defines `NAV_ITEMS`.
  - Defines app routes with `wouter` `Switch` and `Route`.
  - Current routes: `/`, `/chat`, `/models`, `/workspace`, `/studios`, `/diagnostics`, `/logs`, `/cleanup`, `/remote`, `/integrations`, `/operations`, `/settings`.
  - Existing visual system uses LOCALAI dark surfaces, CSS variables, sidebar status, offline banner, and native card/button patterns.
- `artifacts/localai-control-center/src/api.ts`
  - Central API client and typed endpoint wrappers.

Model orchestration:

- `artifacts/api-server/src/lib/model-orchestrator.ts`
  - Primary Ollama model gateway.
  - VRAM guard, model catalog cache, routing, pull/load/unload/delete, streaming SSE, OpenAI-compatible response helpers, and embedding-model exclusion logic.
- `artifacts/api-server/src/lib/model-roles-service.ts`
  - SQLite-backed model role assignment service.
- `artifacts/api-server/src/config/models.config.ts`
  - Model roles, route hints, stack defaults, VRAM estimates, benchmark defaults.
- `artifacts/api-server/src/config/default-model-roles.json`
  - Default role assignments.
- `artifacts/api-server/src/routes/models.ts`
  - Model list, catalog, pull, load, unload, delete, role management, pull history.
- `artifacts/api-server/src/routes/chat.ts`
  - Chat sessions, supervisor routing, code context, RAG context, streaming, slash commands, proposed agent actions.
- UI surfaces:
  - `artifacts/localai-control-center/src/pages/Models.tsx`
  - `artifacts/localai-control-center/src/pages/Chat.tsx`

RAG and document intelligence:

- `artifacts/api-server/src/lib/rag.ts`
  - hnswlib-node vector index plus SQLite metadata.
  - Supports text, PDF via `pdf-parse`, DOCX via `mammoth`, simple chunking, collection CRUD, ingest, search, and context building.
- `artifacts/api-server/src/routes/rag.ts`
  - `/rag/collections`
  - `/rag/ingest`
  - `/rag/search`
- `artifacts/api-server/src/routes/web.ts`
  - SearxNG search, DuckDuckGo HTML fallback, and web fetch.
- UI/API:
  - `artifacts/localai-control-center/src/api.ts`
  - `artifacts/localai-control-center/src/pages/Chat.tsx`
  - `artifacts/localai-control-center/src/pages/SettingsPage.tsx`

Integrations:

- `artifacts/api-server/src/routes/integrations.ts`
  - Hardcoded integration catalog and JSON state file.
  - Includes Open WebUI, Open WebUI Pipelines, LiteLLM, MCPO, Aider, Continue, LibreChat, Jan, AnythingLLM, Langflow, WorldGUI, Fabric, Taskfile, OpenClaw, IronClaw, Nerve, OpenClaw Windows Node, MCP-UI, Renovate, and Release Please.
  - Supports list, install, start, update, and pin.
  - Privileged install/start/update actions use `agentExecGuard`.
- `artifacts/localai-control-center/src/pages/Integrations.tsx`
  - Integration cards and WorldGUI control panel.
- `artifacts/localai-control-center/src/api.ts`
  - `integrations` and `worldgui` wrappers.

Plugin manifests:

- `artifacts/api-server/src/routes/plugins.ts`
  - Reads static JSON manifests from repo-root `plugins`.
  - Provides `/plugins`, `/plugins/:name`, and `/plugins/:name/manifest`.
  - Malformed manifests are silently skipped.
- `plugins/example-plugin.json`
  - Example manifest with routes, pages, and file access permission.
- `artifacts/localai-control-center/src/api.ts`
  - `pluginsApi` wrapper.

Permissions and safety:

- `artifacts/api-server/src/lib/secure-config.ts`
  - Encrypted config file using AES-256-GCM.
  - Stores agent permissions, settings, capability registry, and distributed-node config.
  - Defaults: edits enabled, exec disabled, self-heal enabled, refactor enabled, action confirmation required.
- `artifacts/api-server/src/lib/route-guards.ts`
  - `agentExecGuard`, `agentEditsGuard`, `agentSelfHealGuard`, `agentRefactorGuard`.
  - Local browser mutation guard blocks cross-site/untrusted browser mutations.
- `artifacts/api-server/src/lib/command-sanitizer.ts`
  - Blocks known destructive commands.
- `artifacts/api-server/src/lib/snapshot-manager.ts`
  - Managed writes, rollback backups, audit log write-through.
- Tests:
  - `artifacts/api-server/src/tests/security.test.ts`
  - `artifacts/api-server/src/tests/route-guard-coverage.test.ts`
  - `artifacts/api-server/src/tests/permission-routes.test.ts`
  - `artifacts/localai-control-center/src/tests/permission-notice.test.tsx`
  - `artifacts/localai-control-center/src/tests/page-permission-ssr.test.tsx`

Coding agent and workspace automation:

- `artifacts/api-server/src/lib/file-execution-agent.ts`
  - Runs files/commands and self-healing repair loops.
- `artifacts/api-server/src/lib/code-context.ts`
  - Workspace context and indexing support.
- `artifacts/api-server/src/lib/global-workspace-intelligence.ts`
  - Workspace intelligence/search.
- `artifacts/api-server/src/routes/workspace.ts`
  - Project registry, templates, snapshots, clone, archive, delete, readiness, profiles.
- `artifacts/api-server/src/routes/filebrowser.ts`
  - File listing and read-only file reads.
- `artifacts/api-server/src/routes/repair.ts`
  - Repair workflows.
- `artifacts/api-server/src/routes/rollback.ts`
  - Rollback and audit history.
- UI:
  - `artifacts/localai-control-center/src/pages/Workspace.tsx`
  - `artifacts/localai-control-center/src/pages/Operations.tsx`
  - `artifacts/localai-control-center/src/pages/SettingsPage.tsx`

Browser and computer-use surfaces:

- `artifacts/api-server/src/routes/worldgui.ts`
  - WorldGUI install/launch/stop/status.
  - Desktop screenshot, click, type, keys, focus, windows list.
  - Privileged desktop actions use `agentExecGuard`.
- `artifacts/api-server/src/lib/windows-system.ts`
  - Windows interaction helpers.
- `artifacts/api-server/src/routes/web.ts`
  - Web search/fetch, not browser session automation.
- UI:
  - `artifacts/localai-control-center/src/pages/Integrations.tsx`
  - `artifacts/localai-control-center/src/pages/Operations.tsx`

Observability, evals, and hardening:

- `artifacts/api-server/src/lib/thought-log.ts`
  - Thought/event stream and SQLite hydration.
- `artifacts/api-server/src/lib/task-queue.ts`
  - Async job queue and hydration.
- `artifacts/api-server/src/routes/observability.ts`
  - Thought history, SSE thought stream, and thought publishing.
- `artifacts/api-server/src/routes/benchmark.ts`
  - Model benchmark runs, in-memory store, lazy SQLite persistence.
- `artifacts/api-server/src/routes/usage.ts`
  - Usage metrics.
- `artifacts/api-server/src/routes/rollback.ts`
  - Audit history and rollback candidates.
- UI:
  - `artifacts/localai-control-center/src/pages/Diagnostics.tsx`
  - `artifacts/localai-control-center/src/pages/Logs.tsx`
  - `artifacts/localai-control-center/src/pages/Operations.tsx`
  - `artifacts/localai-control-center/src/pages/Models.tsx`

Studio, CAD, and artifact generation:

- `artifacts/api-server/src/lib/studio-pipeline.ts`
  - Vibe coding install/test helpers.
  - OpenSCAD generation, Blender script generation, G-Code optimization.
  - Image generation integrations for ComfyUI and Stable Diffusion Web UI.
- `artifacts/api-server/src/routes/studios.ts`
  - Manifest-driven Plan-Act-Verify studio generation.
  - Workspace presets.
  - CAD routes: OpenSCAD, Blender, G-Code, OpenSCAD render.
  - Image generation gallery and prompt expansion.
  - Continue config writer.
- `artifacts/api-server/src/config/workspace-presets.ts`
  - Includes CAD-related workspace preset/toolset metadata.
- UI:
  - `artifacts/localai-control-center/src/pages/Studios.tsx`
  - `artifacts/localai-control-center/src/pages/WorkspaceView.tsx`

## Current Gaps and Risks

- Workspace scaffold issue: `artifacts/api-server/src/routes/workspace.ts` generates `tests/test_health.py` with a scaffold-only test name. This is generated scaffold content, not active app runtime logic, but it conflicts with the policy against unfinished scaffold output in generated projects.
- Integration catalog state is split between hardcoded route data and JSON state under `~/LocalAI-Tools`; it is not yet a fully durable SQLite-backed control plane.
- Plugin loading is static and permissive: malformed manifests are silently skipped, manifest schema is not versioned, and enable/disable/install state is not durable in SQLite.
- RAG has working local ingestion/search, but it lacks a professional document pipeline: no extraction job table, no source-level citation objects, no OCR path, no reindex queue, and no structured document metadata beyond the current chunk metadata.
- Browser agent is not a true browser session runtime. Current functionality is WorldGUI desktop automation plus web search/fetch.
- MCP/tool runtime is not implemented as a first-class runtime. Current repo has MCPO/MCP-UI integration references and plugin manifests, but no durable tool registry, invocation history, consent model, or MCP session manager.
- Coding agent command execution exists, but sandboxing is policy-based rather than process/container isolation. File reads through `filebrowser` are broad and should be tightened before higher-agency tooling.
- Benchmark/eval support exists but is model-comparison oriented. It does not yet provide regression eval suites, golden datasets, score history by feature, or release gates.
- CAD Studio can generate scripts and render OpenSCAD when installed, but there is no artifact graph, provenance graph, assembly tree, parametric revision model, or text-to-CAD verification loop.
- Several surfaces depend on local host tools and services: Ollama, OpenSCAD, Python, WorldGUI, ComfyUI, Stable Diffusion Web UI, VS Code, Aider, and Continue. UI must keep showing real disabled states or errors when these are absent.

## Implementation Phases

### Phase 1: Durable State and Permissions

Goal: make state, permissions, feature flags, and audit policy durable, queryable, and test-covered without breaking existing encrypted settings.

Current files to modify:

- `artifacts/api-server/src/db/schema.ts`
- `artifacts/api-server/src/db/migrate.ts`
- `artifacts/api-server/src/lib/secure-config.ts`
- `artifacts/api-server/src/lib/route-guards.ts`
- `artifacts/api-server/src/lib/snapshot-manager.ts`
- `artifacts/api-server/src/routes/settings.ts`
- `artifacts/api-server/src/routes/kernel.ts`
- `artifacts/api-server/src/routes/usage.ts`
- `artifacts/localai-control-center/src/api.ts`
- `artifacts/localai-control-center/src/hooks/useAgentPermissions.ts`
- `artifacts/localai-control-center/src/components/PermissionNotice.tsx`
- `artifacts/localai-control-center/src/pages/SettingsPage.tsx`
- `artifacts/api-server/src/tests/permission-routes.test.ts`
- `artifacts/api-server/src/tests/route-guard-coverage.test.ts`
- `artifacts/localai-control-center/src/tests/permission-notice.test.tsx`

Implementation plan:

- Add SQLite tables for `feature_flags`, `permission_grants`, `permission_decisions`, and `policy_events`.
- Keep `secure-config.ts` as the backward-compatible source for existing settings, then mirror permission changes into SQLite.
- Add a feature flag read path that defaults to current behavior when no DB row exists.
- Expand permission tests for every privileged route and every new feature flag.
- Do not remove encrypted config until after a migration release proves SQLite state is stable.

### Phase 2: Unified Model Gateway

Goal: standardize all chat, embeddings, model role, OpenAI-compatible, and VRAM-guard behavior behind the existing model gateway.

Current files to modify:

- `artifacts/api-server/src/lib/model-orchestrator.ts`
- `artifacts/api-server/src/lib/model-roles-service.ts`
- `artifacts/api-server/src/config/models.config.ts`
- `artifacts/api-server/src/config/default-model-roles.json`
- `artifacts/api-server/src/routes/models.ts`
- `artifacts/api-server/src/routes/chat.ts`
- `artifacts/api-server/src/routes/openai.ts`
- `artifacts/api-server/src/routes/benchmark.ts`
- `artifacts/localai-control-center/src/api.ts`
- `artifacts/localai-control-center/src/pages/Models.tsx`
- `artifacts/localai-control-center/src/pages/Chat.tsx`
- `artifacts/api-server/src/tests/openai-compat.test.ts`

Implementation plan:

- Preserve `/v1/models`, `/v1/chat/completions`, `/v1/responses`, `/v1/embeddings`, and `/api/v1` mirrors exactly.
- Add a typed gateway adapter contract for chat, responses, embeddings, vision, and rerank roles.
- Keep embedding-only models excluded from chat candidate routing.
- Add route-level tests for selected model role, fallback model, VRAM blocked state, and OpenAI-compatible error shape.
- Add UI status indicators only in existing Models/Chat patterns.

### Phase 3: MCP and Tool Runtime

Goal: add a real tool runtime without replacing integrations or static plugin manifest support.

Current files to modify:

- `artifacts/api-server/src/db/schema.ts`
- `artifacts/api-server/src/db/migrate.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/routes/plugins.ts`
- `artifacts/api-server/src/routes/integrations.ts`
- `artifacts/api-server/src/lib/route-guards.ts`
- `artifacts/localai-control-center/src/api.ts`
- `artifacts/localai-control-center/src/App.tsx`
- `artifacts/localai-control-center/src/pages/Integrations.tsx`
- `plugins/*.json`

New files/directories likely needed:

- `artifacts/api-server/src/lib/tool-runtime.ts`
- `artifacts/api-server/src/lib/mcp-runtime.ts`
- `artifacts/api-server/src/routes/tools.ts`
- `artifacts/api-server/src/tests/tool-runtime.test.ts`
- `artifacts/localai-control-center/src/pages/Tools.tsx`

Implementation plan:

- Add `tool_servers`, `tool_manifests`, `tool_invocations`, and `tool_permissions` tables.
- Implement a feature-flagged MCP runtime adapter.
- Keep MCPO and MCP-UI as integrations, not as the only runtime path.
- Record every tool call with input hash, output summary, permission decision, duration, and error state.
- Hide any new UI route behind a feature flag until the runtime has at least one working local tool server.

### Phase 4: Sandboxed Coding Agent

Goal: keep existing workspace/code features but enforce a stronger sandbox and consent model before raising agent autonomy.

Current files to modify:

- `artifacts/api-server/src/lib/file-execution-agent.ts`
- `artifacts/api-server/src/lib/code-context.ts`
- `artifacts/api-server/src/lib/global-workspace-intelligence.ts`
- `artifacts/api-server/src/lib/command-sanitizer.ts`
- `artifacts/api-server/src/lib/snapshot-manager.ts`
- `artifacts/api-server/src/routes/chat.ts`
- `artifacts/api-server/src/routes/workspace.ts`
- `artifacts/api-server/src/routes/filebrowser.ts`
- `artifacts/api-server/src/routes/repair.ts`
- `artifacts/api-server/src/routes/rollback.ts`
- `artifacts/localai-control-center/src/pages/Chat.tsx`
- `artifacts/localai-control-center/src/pages/Workspace.tsx`
- `artifacts/localai-control-center/src/pages/Operations.tsx`

Implementation plan:

- Add workspace allowlist enforcement to file read, write, execution, and snapshot paths.
- Add command execution profiles: disabled, propose-only, allowlisted commands, and full local exec.
- Add a dry-run diff preview before managed writes where possible.
- Fix the generated scaffold test name in `workspace.ts` by renaming it to a concrete generated test.
- Extend tests to cover denied path traversal, denied destructive commands, and permission notice rendering.

### Phase 5: Professional RAG and Document Intelligence

Goal: evolve current RAG into a durable document-intelligence pipeline while preserving existing `/rag` behavior.

Current files to modify:

- `artifacts/api-server/src/lib/rag.ts`
- `artifacts/api-server/src/routes/rag.ts`
- `artifacts/api-server/src/routes/web.ts`
- `artifacts/api-server/src/routes/chat.ts`
- `artifacts/api-server/src/db/schema.ts`
- `artifacts/api-server/src/db/migrate.ts`
- `artifacts/localai-control-center/src/api.ts`
- `artifacts/localai-control-center/src/pages/Chat.tsx`
- `artifacts/localai-control-center/src/pages/SettingsPage.tsx`

New files/directories likely needed:

- `artifacts/api-server/src/lib/document-intelligence.ts`
- `artifacts/api-server/src/lib/rag-index-jobs.ts`
- `artifacts/api-server/src/routes/documents.ts`
- `artifacts/localai-control-center/src/pages/Documents.tsx`

Implementation plan:

- Add tables for documents, document pages, extracted entities, citations, indexing jobs, and reindex events.
- Keep existing `rag_collections` and `rag_chunks` compatible.
- Add source citation IDs to chat RAG context and UI citation display.
- Add explicit disabled/error states for OCR or parser dependencies that are missing.
- Add ingestion tests for text, PDF parser failure, DOCX parser failure, and collection delete cleanup.

### Phase 6: Browser Agent

Goal: introduce a browser-session agent distinct from WorldGUI desktop automation.

Current files to modify:

- `artifacts/api-server/src/routes/web.ts`
- `artifacts/api-server/src/routes/worldgui.ts`
- `artifacts/api-server/src/lib/windows-system.ts`
- `artifacts/api-server/src/lib/route-guards.ts`
- `artifacts/localai-control-center/src/api.ts`
- `artifacts/localai-control-center/src/pages/Integrations.tsx`
- `artifacts/localai-control-center/src/pages/Operations.tsx`

New files/directories likely needed:

- `artifacts/api-server/src/lib/browser-agent.ts`
- `artifacts/api-server/src/routes/browser-agent.ts`
- `artifacts/api-server/src/tests/browser-agent-routes.test.ts`
- `artifacts/localai-control-center/src/pages/BrowserAgent.tsx`

Implementation plan:

- Add a feature flag such as `browserAgent.enabled`.
- Keep WorldGUI routes intact and label them as desktop automation, not browser automation.
- Add browser sessions, screenshots, DOM summaries, navigation, click/type actions, and per-action audit entries.
- Require `allowAgentExec` and action confirmation for mutation actions.
- Do not show the new UI route until the backend reports the browser runtime is available.

### Phase 7: Integration Control Plane

Goal: turn the current integration catalog into a durable, health-checked control plane.

Current files to modify:

- `artifacts/api-server/src/routes/integrations.ts`
- `artifacts/api-server/src/db/schema.ts`
- `artifacts/api-server/src/db/migrate.ts`
- `artifacts/api-server/src/lib/route-guards.ts`
- `artifacts/api-server/src/lib/runtime.ts`
- `artifacts/localai-control-center/src/api.ts`
- `artifacts/localai-control-center/src/pages/Integrations.tsx`

Implementation plan:

- Move integration state from JSON into SQLite while preserving JSON migration.
- Add install state, health state, version, last check, last error, pin state, and managed/reference-only mode.
- Add a health-check worker with bounded timeouts.
- Keep reference-only integrations visible only with clear non-installable state.
- Add route tests for install/start/update permission guards and state transitions.

### Phase 8: Observability, Evals, and Hardening

Goal: add release-quality observability and eval gates on top of the existing thought log, benchmark, audit, and task queue.

Current files to modify:

- `artifacts/api-server/src/lib/thought-log.ts`
- `artifacts/api-server/src/lib/task-queue.ts`
- `artifacts/api-server/src/routes/observability.ts`
- `artifacts/api-server/src/routes/benchmark.ts`
- `artifacts/api-server/src/routes/usage.ts`
- `artifacts/api-server/src/routes/rollback.ts`
- `artifacts/api-server/src/db/schema.ts`
- `artifacts/api-server/src/db/migrate.ts`
- `artifacts/localai-control-center/src/api.ts`
- `artifacts/localai-control-center/src/pages/Diagnostics.tsx`
- `artifacts/localai-control-center/src/pages/Logs.tsx`
- `artifacts/localai-control-center/src/pages/Operations.tsx`

New files/directories likely needed:

- `artifacts/api-server/src/lib/evals.ts`
- `artifacts/api-server/src/routes/evals.ts`
- `artifacts/api-server/src/tests/evals.test.ts`

Implementation plan:

- Add `eval_suites`, `eval_cases`, `eval_runs`, `eval_results`, and `trace_spans`.
- Keep `benchmark_runs` for model comparisons but add eval suites for regression checks.
- Add route latency, model latency, tokens/sec, error class, and guard-decision telemetry.
- Add a hardening checklist command in package scripts only after tests exist.
- Do not block app boot on eval or telemetry initialization failures.

### Phase 9: Plugin Marketplace

Goal: evolve static plugin manifests into a local plugin marketplace with explicit permissions and no arbitrary code execution by default.

Current files to modify:

- `artifacts/api-server/src/routes/plugins.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/db/schema.ts`
- `artifacts/api-server/src/db/migrate.ts`
- `artifacts/api-server/src/lib/route-guards.ts`
- `artifacts/localai-control-center/src/api.ts`
- `artifacts/localai-control-center/src/App.tsx`
- `plugins/example-plugin.json`

New files/directories likely needed:

- `artifacts/api-server/src/lib/plugin-manifest.ts`
- `artifacts/api-server/src/lib/plugin-registry.ts`
- `artifacts/api-server/src/tests/plugin-manifest.test.ts`
- `artifacts/localai-control-center/src/pages/Plugins.tsx`

Implementation plan:

- Add manifest schema validation and versioning.
- Stop silently skipping malformed manifests; return manifest diagnostics in `/plugins`.
- Add SQLite plugin install/enable/disable state.
- Add route/page contribution support only after route permissions and feature flags exist.
- Keep existing `plugins/*.json` compatibility.

### Phase 10: CAD Studio and Artifact Graph

Goal: build a durable artifact graph for text-to-CAD workflows while preserving current Studios UI and CAD routes.

Current files to modify:

- `artifacts/api-server/src/lib/studio-pipeline.ts`
- `artifacts/api-server/src/routes/studios.ts`
- `artifacts/api-server/src/config/workspace-presets.ts`
- `artifacts/api-server/src/db/schema.ts`
- `artifacts/api-server/src/db/migrate.ts`
- `artifacts/localai-control-center/src/api.ts`
- `artifacts/localai-control-center/src/pages/Studios.tsx`
- `artifacts/localai-control-center/src/pages/WorkspaceView.tsx`

New files/directories likely needed:

- `artifacts/api-server/src/lib/artifact-graph.ts`
- `artifacts/api-server/src/lib/text-to-cad.ts`
- `artifacts/api-server/src/routes/artifacts.ts`
- `artifacts/api-server/src/tests/artifact-graph.test.ts`
- `artifacts/localai-control-center/src/components/ArtifactGraphPanel.tsx`

Implementation plan:

- Add tables for `artifact_projects`, `artifact_nodes`, `artifact_edges`, `artifact_versions`, `artifact_renders`, and `artifact_checks`.
- Treat OpenSCAD, Blender scripts, G-Code, images, and generated app files as graph nodes with provenance.
- Add text-to-CAD adapters that generate parametric scripts and validation checks.
- Keep OpenSCAD render route behavior, including explicit `422` when OpenSCAD is unavailable.
- Add UI panels inside existing Studios/Workspace visual language, not a redesign.

## Test Strategy for Future Implementation

Every phase should run at minimum:

- `pnpm -r typecheck`
- `pnpm test`
- `pnpm --filter localai-control-center build`

Phase-specific tests:

- OpenAI/model gateway changes: `pnpm --filter api-server test:openai-compat`
- Permission/security changes: `pnpm --filter api-server test:security`, `pnpm --filter api-server test:route-guards`, `pnpm --filter api-server test:permission-routes`
- UI permission/navigation changes: `pnpm --filter localai-control-center test:permission-notice`, `pnpm --filter localai-control-center test:page-permissions`
- API client changes: `pnpm --filter localai-control-center test:api`

Do not merge feature phases if baseline checks fail. If a host-level runtime issue prevents live app verification, report the exact error and keep the code changes limited to areas covered by tests.
