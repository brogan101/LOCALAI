# BASELINE REPORT — Phase 0 Audit

Generated: 2026-04-18  
Working root: `LOCALAI-main/` (inner dir, double-nested zip extract)  
Monorepo: pnpm workspaces — `artifacts/api-server` + `artifacts/localai-control-center`

---

## A. Full File Tree — `artifacts/**/src/` grouped by layer

### Backend — `artifacts/api-server/src/`

**Routes (22 files)**
```
src/routes/index.ts          — mounts all routers under /api
src/routes/health.ts         — GET /healthz
src/routes/models.ts         — models CRUD, roles, pull, catalog
src/routes/chat.ts           — chat send/stream/assistant/command
src/routes/system.ts         — diagnostics, logs, cleanup, sovereign, macros, exec
src/routes/workspace.ts      — project CRUD, snapshots, profiles, studio-presets
src/routes/studios.ts        — vibe coding, CAD, imagegen, templates
src/routes/integrations.ts   — managed tool installs/start/update/pin
src/routes/remote.ts         — distributed node, network config, auth
src/routes/stack.ts          — component start/stop/restart, backup, github auth
src/routes/repair.ts         — health scan, run repairs, diagnose, setup-project-ai
src/routes/rollback.ts       — backup/restore file snapshots
src/routes/updater.ts        — model update checking, scheduling, backup-settings
src/routes/updates.ts        — system package updates (winget/pip)
src/routes/usage.ts          — token usage recording + /settings GET/PUT
src/routes/observability.ts  — thought log GET/stream/POST
src/routes/tasks.ts          — async job queue status
src/routes/kernel.ts         — capability state GET/PUT
src/routes/context.ts        — workspace code-context index/search/file
src/routes/intelligence.ts   — global refactor planner/executor
src/routes/continue.ts       — continue.dev config + rules CRUD
src/routes/filebrowser.ts    — simple directory list + file read
```

**Lib (12 files)**
```
src/lib/runtime.ts                    — fetchJson, toolsRoot(), ollamaReachable, shellQuote
src/lib/model-orchestrator.ts         — gateway tags, routing, pull queue, VRAM guard
src/lib/model-discovery.ts            — verified model catalog, spec verification
src/lib/state-orchestrator.ts         — in-memory capability + sovereign state
src/lib/code-context.ts               — file indexing + symbol extraction
src/lib/global-workspace-intelligence.ts — refactor planner using code-context
src/lib/file-execution-agent.ts       — exec/run, exec/file, self-heal, diagnose
src/lib/studio-pipeline.ts            — vibe coding, CAD, imagegen pipeline
src/lib/supervisor-agent.ts           — intent detection + model preference selection
src/lib/network-proxy.ts              — distributed node proxy + heartbeat
src/lib/secure-config.ts             — distributed node config persistence
src/lib/snapshot-manager.ts           — writeManagedJson (JSON w/ backup)
src/lib/task-queue.ts                 — in-memory async job queue
src/lib/thought-log.ts                — thought log ring buffer + SSE
src/lib/logger.ts                     — pino logger setup
src/lib/windows-system.ts            — Windows-specific: window enumerate/focus
src/lib/self-edit.ts                  — sovereign file diff/edit helper
```

**Config (missing — see §E)**
```
MISSING: src/config/models.config.ts  — required by Rule 4, does not exist
```

**App entry**
```
src/app.ts     — Express app setup, CORS, pino-http, static serve
src/index.ts   — HTTP server startup
src/types/diff.d.ts — ambient type for 'diff' package
```

---

### Frontend — `artifacts/localai-control-center/src/`

**Pages (12 files)**
```
src/pages/Dashboard.tsx     — live agent state, VRAM budget, thought log
src/pages/Chat.tsx          — streaming AI chat with repo context
src/pages/Models.tsx        — model catalog, pull, delete, VRAM guard
src/pages/Workspace.tsx     — project management, code context, refactor planner
src/pages/Studios.tsx       — vibe coding, imagegen, CAD scripting
src/pages/Diagnostics.tsx   — health checks, component repair, port status
src/pages/Logs.tsx          — thought log SSE, system logs, activity history
src/pages/Cleanup.tsx       — stale artifact scanner + disk recovery
src/pages/Remote.tsx        — tunnel config, distributed node, auth tokens
src/pages/Integrations.tsx  — managed tool installs
src/pages/SettingsPage.tsx  — model defaults, token tracking, continue.dev rules
src/pages/Operations.tsx    — stack status, async job queue, rollback
```

**Core**
```
src/App.tsx    — router, nav sidebar, Ollama-down guard, QueryClient
src/api.ts     — typed fetch wrappers for all backend endpoints (818 lines)
src/main.tsx   — React root mount + unhandledrejection suppressor
src/index.css  — Tailwind v4 base styles
```

---

## B. Endpoint-to-UI Matrix

| Backend endpoint | api.ts wrapper | Frontend page | Status |
|---|---|---|---|
| GET /healthz | health.ping | App.tsx (Ollama guard via /tags) | WIRED |
| GET /tags | models.tags | Dashboard.tsx, App.tsx | WIRED |
| GET /models/list | models.list | Models.tsx | WIRED |
| GET /models/running | models.running | Dashboard.tsx | WIRED |
| POST /models/refresh | models.refresh | Models.tsx | WIRED |
| GET /models/catalog/status | models.catalogStatus | Models.tsx | WIRED |
| POST /models/pull | models.pull | Models.tsx | WIRED |
| POST /models/load | models.load | Models.tsx | WIRED |
| POST /models/stop | models.stop | Models.tsx | WIRED |
| DELETE /models/:name/delete | models.delete | Models.tsx | WIRED |
| GET /models/pull-status | models.pullStatus | Models.tsx | WIRED |
| GET /models/roles | models.roles | Models.tsx | WIRED |
| PUT /models/roles | models.setRoles | Models.tsx | WIRED |
| GET /models/catalog | models.catalog | Models.tsx | WIRED |
| GET /models/discover | modelsExtra.discover | Models.tsx | WIRED |
| GET /models/verify | modelsExtra.verify | (wrapper only) | WRAPPER-ONLY |
| POST /models/recommend | modelsExtra.recommend | (wrapper only) | WRAPPER-ONLY |
| POST /models/verify-install | modelsExtra.verifyInstall | (wrapper only) | WRAPPER-ONLY |
| POST /chat/send | chat.send | Chat.tsx | WIRED |
| POST /chat/stream | chat.stream | Chat.tsx | WIRED |
| POST /chat/assistant | chat.assistant | (wrapper only) | WRAPPER-ONLY |
| POST /chat/command | chat.command | (wrapper only) | WRAPPER-ONLY |
| GET /chat/models | chat.chatModels | Chat.tsx | WIRED |
| GET /kernel/state | kernel.getState | Dashboard.tsx | WIRED |
| PUT /kernel/capabilities/:id | kernel.setCapability | Dashboard.tsx | WIRED |
| GET /system/diagnostics | system.diagnostics | Diagnostics.tsx | WIRED |
| GET /remote/heartbeat | system.heartbeat | Dashboard.tsx | WIRED |
| POST /system/process/kill-switch | system.killSwitch | Operations.tsx | WIRED |
| GET /system/cleanup/scan | system.cleanupScan | Cleanup.tsx | WIRED |
| POST /system/cleanup/execute | system.cleanupRun | Cleanup.tsx | WIRED |
| GET /system/activity | system.activity | Logs.tsx | WIRED |
| POST /system/sovereign/restart | system.restart | Operations.tsx | WIRED |
| POST /system/sovereign/edit | system.sovereignEdit | (wrapper only) | WRAPPER-ONLY |
| POST /system/sovereign/preview | system.sovereignPreview | (wrapper only) | WRAPPER-ONLY |
| GET /system/macros | system.macros | Operations.tsx | WIRED |
| POST /system/macros/:name/run | system.runMacro | Operations.tsx | WIRED |
| GET /system/windows | system.windows | (wrapper only) | WRAPPER-ONLY |
| POST /system/exec/run | system.execRun | (wrapper only) | WRAPPER-ONLY |
| POST /system/exec/file | system.execFile | (wrapper only) | WRAPPER-ONLY |
| POST /system/exec/self-heal | system.execSelfHeal | (wrapper only) | WRAPPER-ONLY |
| POST /system/exec/diagnose | system.execDiagnose | (wrapper only) | WRAPPER-ONLY |
| GET /system/logs | systemExtra.logs | Logs.tsx | WIRED |
| GET /system/process/status | systemExtra.processStatus | Operations.tsx | WIRED |
| GET /system/storage | systemExtra.storage | Dashboard.tsx | WIRED |
| GET /system/setup/inspect | systemExtra.setupInspect | Diagnostics.tsx | WIRED |
| POST /system/setup/repair | systemExtra.setupRepair | Diagnostics.tsx | WIRED |
| POST /system/windows/focus | systemExtra.focusWindow | (wrapper only) | WRAPPER-ONLY |
| POST /system/macros | systemExtra.registerMacro | (wrapper only) | WRAPPER-ONLY |
| GET /system/updates/check | systemExtra.updatesCheck | Operations.tsx | WIRED |
| POST /system/updates/run | systemExtra.updatesRun | Operations.tsx | WIRED |
| GET /workspace/projects | workspace.projects | Workspace.tsx | WIRED |
| GET /workspace/readiness | workspace.readiness | Workspace.tsx | WIRED |
| GET /workspace/templates | workspace.templates | Workspace.tsx | WIRED |
| POST /workspace/projects | workspaceExtra.createProject | Workspace.tsx | WIRED |
| POST /workspace/projects/:id/open | workspaceExtra.openProject | Workspace.tsx | WIRED |
| POST /workspace/projects/:id/pin | workspaceExtra.pinProject | Workspace.tsx | WIRED |
| DELETE /workspace/projects/:id | workspaceExtra.deleteProject | Workspace.tsx | WIRED |
| GET /workspace/snapshots | workspaceExtra.snapshots | Workspace.tsx | WIRED |
| POST /workspace/projects/:id/snapshots | workspaceExtra.createSnapshot | Workspace.tsx | WIRED |
| POST /workspace/projects/:id/archive | workspaceExtra.archiveProject | Workspace.tsx | WIRED |
| POST /workspace/projects/:id/clone | workspaceExtra.cloneProject | Workspace.tsx | WIRED |
| GET /workspace/profiles | workspaceExtra.profiles | (wrapper only) | WRAPPER-ONLY |
| PUT /workspace/profiles/:id | workspaceExtra.updateProfile | (wrapper only) | WRAPPER-ONLY |
| GET /workspace/studio-presets | workspaceExtra.studioPresets | Workspace.tsx | WIRED |
| POST /workspace/studio-presets | workspaceExtra.saveStudioPresets | Workspace.tsx | WIRED |
| GET /studios/templates | studios.templates | Studios.tsx | WIRED |
| GET /studios/catalog | studios.catalog | Studios.tsx | WIRED |
| POST /studios/plan | studios.plan | Studios.tsx | WIRED |
| POST /studios/build | studios.build | Studios.tsx | WIRED |
| GET /studios/build/:jobId | studios.buildStatus | Studios.tsx | WIRED |
| GET /studios/integrations | studios.integrations | Studios.tsx | WIRED |
| POST /studios/vibecheck | studios.vibeCheck | Studios.tsx | WIRED |
| POST /studios/cad/openscad | studios.cad.openscad | Studios.tsx | WIRED |
| POST /studios/cad/blender | studios.cad.blender | Studios.tsx | WIRED |
| POST /studios/cad/gcode | studios.cad.gcode | Studios.tsx | WIRED |
| GET /studios/imagegen/status | studios.imagegen.status | Studios.tsx | WIRED |
| POST /studios/imagegen/expand-prompt | studios.imagegen.expandPrompt | Studios.tsx | WIRED |
| POST /studios/imagegen/generate | studios.imagegen.generate | Studios.tsx | WIRED |
| GET /integrations | integrations.list | Integrations.tsx | WIRED |
| POST /integrations/:id/pin | integrations.pin | Integrations.tsx | WIRED |
| POST /integrations/:id/install | integrations.install | Integrations.tsx | WIRED |
| POST /integrations/:id/start | integrations.start | Integrations.tsx | WIRED |
| GET /integrations/updates | integrations.updates | Integrations.tsx | WIRED |
| POST /integrations/:id/update | integrations.update | Integrations.tsx | WIRED |
| GET /remote/overview | remote.overview | Remote.tsx | WIRED |
| GET /remote/network | remote.network | Remote.tsx | WIRED |
| PUT /remote/network | remote.updateNetwork | Remote.tsx | WIRED |
| GET /remote/network/status | remote.networkStatus | Remote.tsx | WIRED |
| GET /remote/auth/status | remote.authStatus | Remote.tsx | WIRED |
| POST /remote/auth/authorize | remote.authAuthorize | Remote.tsx | WIRED |
| POST /remote/auth/rotate | remote.authRotate | Remote.tsx | WIRED |
| POST /remote/generate-configs | remote.generateConfigs | Remote.tsx | WIRED |
| GET /continue/config | continueApi.config | SettingsPage.tsx | WIRED |
| GET /continue/rules | continueApi.rules | SettingsPage.tsx | WIRED |
| POST /continue/rules | continueApi.saveRule | SettingsPage.tsx | WIRED |
| DELETE /continue/rules/:filename | continueApi.deleteRule | SettingsPage.tsx | WIRED |
| GET /context/status | context.status | Workspace.tsx | WIRED |
| GET /context/workspaces | context.workspaces | Workspace.tsx | WIRED |
| POST /context/index | context.index | Workspace.tsx | WIRED |
| POST /context/search | context.search | Workspace.tsx | WIRED |
| GET /context/file | context.file | (wrapper only) | WRAPPER-ONLY |
| POST /context/read-write-verify | context.readWriteVerify | (wrapper only) | WRAPPER-ONLY |
| POST /intelligence/refactors/plan | intelligence.planRefactor | Workspace.tsx | WIRED |
| GET /intelligence/refactors/plan/:id | intelligence.getPlan | Workspace.tsx | WIRED |
| POST /intelligence/refactors/:id/execute | intelligence.executeRefactor | Workspace.tsx | WIRED |
| GET /intelligence/refactors/jobs | intelligence.jobs | Workspace.tsx | WIRED |
| GET /intelligence/refactors/jobs/:id | intelligence.job | (wrapper only) | WRAPPER-ONLY |
| GET /filebrowser/list | filebrowser.list | Chat.tsx | WIRED |
| GET /filebrowser/read | filebrowser.read | (wrapper only) | WRAPPER-ONLY |
| GET /stack/status | stack.status | Operations.tsx | WIRED |
| POST /stack/components/:id/start | stack.startComponent | Operations.tsx | WIRED |
| POST /stack/components/:id/stop | stack.stopComponent | Operations.tsx | WIRED |
| POST /stack/components/:id/restart | stack.restartComponent | Operations.tsx | WIRED |
| POST /stack/backup | stack.backup | Operations.tsx | WIRED |
| POST /stack/github-auth | stack.githubAuth | Operations.tsx | WIRED |
| GET /stack/github-status | stack.githubStatus | Operations.tsx | WIRED |
| GET /repair/health | repair.health | Diagnostics.tsx + Dashboard.tsx | WIRED |
| POST /repair/run | repair.run | Diagnostics.tsx | WIRED |
| GET /repair/log | repair.log | Operations.tsx | WIRED |
| POST /repair/diagnose-integration/:id | repair.diagnoseIntegration | Diagnostics.tsx | WIRED |
| POST /repair/detect-project-context | repair.detectProjectContext | Workspace.tsx | WIRED |
| POST /repair/setup-project-ai | repair.setupProjectAi | Workspace.tsx | WIRED |
| GET /rollback/backup | rollback.getBackup | (wrapper only) | WRAPPER-ONLY |
| GET /rollback/backups | rollback.listBackups | (wrapper only) | WRAPPER-ONLY |
| POST /rollback | rollback.rollback | (wrapper only) | WRAPPER-ONLY |
| GET /updater/manifest | updater.manifest | Operations.tsx | WIRED |
| POST /updater/check | updater.check | Operations.tsx | WIRED |
| POST /updater/update | updater.update | Operations.tsx | WIRED |
| POST /updater/rollback/:model | updater.rollbackModel | (wrapper only) | WRAPPER-ONLY |
| GET /updater/model-states | updater.modelStates | Operations.tsx | WIRED |
| PATCH /updater/model-states/:model | updater.updateModelState | (wrapper only) | WRAPPER-ONLY |
| POST /updater/backup-settings | updater.backupSettings | (wrapper only) | WRAPPER-ONLY |
| GET /updater/schedule | updater.schedule | Operations.tsx | WIRED |
| PUT /updater/schedule | updater.setSchedule | Operations.tsx | WIRED |
| POST /usage/record | usage.record | (wrapper only) | WRAPPER-ONLY |
| GET /usage/today | usage.today | (wrapper only) | WRAPPER-ONLY |
| GET /usage/history | usage.history | (wrapper only) | WRAPPER-ONLY |
| GET /usage/estimate | usage.estimate | (wrapper only) | WRAPPER-ONLY |
| DELETE /usage/purge | usage.purge | (wrapper only) | WRAPPER-ONLY |
| GET /settings | settings.get | SettingsPage.tsx | WIRED |
| PUT /settings | settings.set | SettingsPage.tsx | WIRED |
| GET /observability/thoughts | observability.thoughts | Logs.tsx + Dashboard.tsx | WIRED |
| GET /observability/thoughts/stream | observability.streamThoughts | Logs.tsx + Dashboard.tsx | WIRED |
| POST /observability/thoughts | (no wrapper) | — | ORPHANED |
| GET /tasks | tasks.list | Operations.tsx | WIRED |
| GET /tasks/:id | tasks.get | Operations.tsx | WIRED |

**Summary:** ~130 endpoints — 100 WIRED, 25 WRAPPER-ONLY (typed but no page calls yet), 1 ORPHANED (POST /observability/thoughts)

---

## C. Export-to-Import Map — Backend Lib Files

| Lib file | Exported symbol | Call-site count | Dead? |
|---|---|---|---|
| runtime.ts | fetchJson | 8+ | LIVE |
| runtime.ts | postJson | 5+ | LIVE |
| runtime.ts | fetchText | 1 | LIVE |
| runtime.ts | ollamaReachable | 2 | LIVE |
| runtime.ts | toolsRoot | 8+ | LIVE |
| runtime.ts | ensureDir | 3+ | LIVE |
| runtime.ts | execCommand | 3+ | LIVE |
| runtime.ts | commandExists | 3+ | LIVE |
| runtime.ts | maybeVersion | 5+ | LIVE |
| runtime.ts | shellQuote | 2+ | LIVE |
| runtime.ts | httpReachable | 2+ | LIVE |
| runtime.ts | getStreamingBufferProfile | 1 | LIVE |
| runtime.ts | LatencyOptimizedTokenBuffer | 1 | LIVE |
| model-orchestrator.ts | getUniversalGatewayTags | 3 | LIVE |
| model-orchestrator.ts | routeModelForMessages | 2 | LIVE |
| model-orchestrator.ts | sendGatewayChat | 2 | LIVE |
| model-orchestrator.ts | streamGatewayChatToSse | 1 | LIVE |
| model-orchestrator.ts | pullModelFromOllama | 1 | LIVE |
| model-orchestrator.ts | queueUniversalModelPull | 1 | LIVE |
| model-orchestrator.ts | loadOllamaModel | 1 | LIVE |
| model-orchestrator.ts | unloadOllamaModel | 1 | LIVE |
| model-orchestrator.ts | deleteOllamaModel | 1 | LIVE |
| model-orchestrator.ts | getRunningGatewayModels | 1 | LIVE |
| model-orchestrator.ts | invalidateCatalogCache | 1 | LIVE |
| model-orchestrator.ts | getCatalogCacheAge | 1 | LIVE |
| model-discovery.ts | discoverVerifiedModels | 1 | LIVE |
| model-discovery.ts | verifyOllamaModelSpec | 1 | LIVE |
| state-orchestrator.ts | stateOrchestrator | 3 | LIVE |
| code-context.ts | workspaceContextService | 2 | LIVE (via context.ts, intelligence.ts) |
| global-workspace-intelligence.ts | createRefactorPlan | 1 | LIVE |
| global-workspace-intelligence.ts | executeRefactorPlan | 1 | LIVE |
| global-workspace-intelligence.ts | getRefactorPlan | 1 | LIVE |
| global-workspace-intelligence.ts | getRefactorJob | 1 | LIVE |
| global-workspace-intelligence.ts | listRefactorJobs | 1 | LIVE |
| file-execution-agent.ts | runCommand | 1 | LIVE |
| file-execution-agent.ts | runFile | 1 | LIVE |
| file-execution-agent.ts | selfHealingRun | 1 | LIVE |
| file-execution-agent.ts | diagnoseError | 1 | LIVE |
| file-execution-agent.ts | runBatch | 0 | DEAD (no caller found) |
| studio-pipeline.ts | (all exports via studios.ts) | 1+ | LIVE |
| supervisor-agent.ts | (used in chat.ts) | 1 | LIVE |
| network-proxy.ts | startDistributedNodeHeartbeat | 1 | LIVE |
| network-proxy.ts | getLastHeartbeat | 2 | LIVE |
| network-proxy.ts | distributedNodeAuthMiddleware | 1 | LIVE |
| network-proxy.ts | getActiveGatewayBaseUrl | 2 | LIVE |
| network-proxy.ts | runDistributedNodeHeartbeat | 1 | LIVE |
| network-proxy.ts | distributedFetchJson | 1 | LIVE |
| network-proxy.ts | buildDistributedProxyHeaders | 1 | LIVE |
| network-proxy.ts | validateDistributedToken | 1 | LIVE |
| network-proxy.ts | authorizeDistributedRequest | 1 | LIVE |
| network-proxy.ts | getDistributedNodeConfig | 2 | LIVE |
| network-proxy.ts | updateDistributedNodeConfig | 1 | LIVE |
| network-proxy.ts | rotateDistributedAuthToken | 1 | LIVE |
| secure-config.ts | (used by network-proxy.ts) | 1 | LIVE |
| snapshot-manager.ts | writeManagedJson | 5+ | LIVE |
| task-queue.ts | taskQueue | 5+ | LIVE |
| thought-log.ts | thoughtLog | 3+ | LIVE |
| logger.ts | logger | 3+ | LIVE |
| windows-system.ts | listOpenWindows, focusWindow | 1 | LIVE |
| self-edit.ts | (used by system.ts) | 1 | LIVE |

**Dead exports: `runBatch` in `file-execution-agent.ts`** — no call site in any route or lib.

---

## D. Dependency Audit

### Backend — `artifacts/api-server/package.json`

| Package | Status | Evidence |
|---|---|---|
| express | USED | src/app.ts |
| cors | USED | src/app.ts |
| cookie-parser | USED | src/app.ts |
| pino | USED | src/lib/logger.ts |
| pino-http | USED | src/app.ts |
| pino-pretty | USED | src/index.ts (dev transport) |
| diff | USED | src/lib/self-edit.ts, diff.d.ts |
| drizzle-orm | UNUSED | Zero imports in src/. **Defer to Phase 5** |
| @types/cookie-parser | TYPES-ONLY | devDep, used for cookie-parser types |
| @types/cors | TYPES-ONLY | devDep |
| @types/diff | TYPES-ONLY | devDep |
| @types/express | TYPES-ONLY | devDep |
| @types/node | TYPES-ONLY | devDep |
| cross-env | USED | package.json scripts |
| tsx | USED | package.json scripts |
| typescript | USED | typecheck |

### Frontend — `artifacts/localai-control-center/package.json`

Source files import **only**: `react`, `react-dom`, `@tanstack/react-query`, `wouter`, `lucide-react`

| Package | Grepped in src/ | Status |
|---|---|---|
| react | YES | USED |
| react-dom | YES | USED |
| @tanstack/react-query | YES | USED |
| wouter | YES | USED |
| lucide-react | YES | USED |
| @radix-ui/* (all 27) | NO | UNUSED — REMOVE |
| framer-motion | NO | UNUSED — REMOVE |
| sonner | NO | UNUSED — REMOVE |
| recharts | NO | UNUSED — REMOVE |
| cmdk | NO | UNUSED — REMOVE |
| vaul | NO | UNUSED — REMOVE |
| embla-carousel-react | NO | UNUSED — REMOVE |
| react-day-picker | NO | UNUSED — REMOVE |
| react-hook-form | NO | UNUSED — REMOVE |
| @hookform/resolvers | NO | UNUSED — REMOVE |
| react-icons | NO | UNUSED — REMOVE |
| react-resizable-panels | NO | UNUSED — REMOVE |
| tailwind-merge | NO | UNUSED — REMOVE |
| tw-animate-css | NO | UNUSED — REMOVE |
| next-themes | NO | UNUSED — REMOVE |
| input-otp | NO | UNUSED — REMOVE |
| zod | NO | UNUSED — REMOVE |
| date-fns | NO | UNUSED — REMOVE |
| clsx | NO | UNUSED — REMOVE |
| class-variance-authority | NO | UNUSED — REMOVE |
| @vitejs/plugin-react | USED (vite.config.ts) | devDep — KEEP |
| @tailwindcss/vite | USED (vite.config.ts) | devDep — KEEP |
| tailwindcss | USED (vite.config.ts) | devDep — KEEP |
| @types/node | USED (tsconfig path resolution) | devDep — KEEP |
| @types/react | TYPES-ONLY | devDep — KEEP |
| @types/react-dom | TYPES-ONLY | devDep — KEEP |
| typescript | USED (build) | devDep — KEEP |
| vite | USED (build/dev) | devDep — KEEP |

**Total unused frontend production deps to remove: 26 packages**

---

## E. Hardcoded Strings to Centralize

### `127.0.0.1:11434` hits (12 sites, not 11)

| File | Lines | Note |
|---|---|---|
| lib/file-execution-agent.ts | 33 | `const OLLAMA_BASE = "http://127.0.0.1:11434"` |
| lib/global-workspace-intelligence.ts | 100, 360 | direct URL literals |
| lib/runtime.ts | 98 | direct URL literal |
| lib/secure-config.ts | 195 | default config value |
| lib/studio-pipeline.ts | 34 | `const OLLAMA_BASE = "http://127.0.0.1:11434"` |
| routes/repair.ts | 276 | direct URL literal |
| routes/studios.ts | 270, 366, 428 | direct URL literals |
| routes/system.ts | 110 | direct URL literal |
| routes/updater.ts | 188, 276 | direct URL literals |

**Action needed (Phase 1+):** centralize into `OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434"` in `src/lib/runtime.ts`.

### Model name literals outside config/models.config.ts

`config/models.config.ts` **does not exist**. Model names are scattered across:

| File | Examples |
|---|---|
| lib/file-execution-agent.ts | `"llama3.1"`, `"primary-coding"` fallbacks |
| lib/global-workspace-intelligence.ts | `"qwen2.5-coder:7b"`, `"qwen3-coder"`, `"qwen2.5-coder"` |
| lib/model-discovery.ts | full catalog: qwen3-coder, qwen2.5-coder, deepseek-coder-v2, qwen3, deepseek-r1, nomic-embed-text, llama3.3, … |
| lib/model-orchestrator.ts | affinity strings: `"llava"`, `"deepseek"`, `"qwen3-coder"`, routing arrays |
| lib/studio-pipeline.ts | `"llama3.1"` fallbacks |
| lib/supervisor-agent.ts | MODEL_PREFERENCES arrays: deepseek-coder-v2, qwen3-coder, llama3.1, mistral, … |
| routes/models.ts | POPULAR_MODELS array + ROLE_DEFINITIONS |

**Action needed (Phase 1+):** create `src/config/models.config.ts` and import from it everywhere.

### Direct `readFile` of `model-roles.json` (9 sites across 5 files)

| File | Lines |
|---|---|
| lib/file-execution-agent.ts | 88 |
| lib/model-orchestrator.ts | 36, 234–235 |
| lib/studio-pipeline.ts | 64, 69–70 |
| routes/models.ts | 24, 73–74 |
| routes/repair.ts | 194, 322 |
| routes/studios.ts | 31, 69–70 |
| routes/updater.ts | 307 |

Each reads/writes `model-roles.json` independently (no shared accessor). `model-orchestrator.ts` has `loadRoleAssignments()` which could be the single canonical reader — but callers bypass it directly. **Action needed (Phase 1+):** route all reads through one function in `model-orchestrator.ts`.

---

## F. WorldGUI Submodule

`.gitmodules` declares `artifacts/api-server/WorldGUI` → `https://github.com/showlab/WorldGUI`.  
Directory exists (submodule initialized) but contains upstream files unrelated to this codebase.  
No TypeScript source references WorldGUI at all.  
README already documents it as reference-only.  
**No action needed.**

---

## G. vite.config.ts — manualChunks Issue

Current `build.rollupOptions.output.manualChunks` has a `radix` key referencing:
- `@radix-ui/react-dialog`
- `@radix-ui/react-dropdown-menu`
- `@radix-ui/react-tabs`
- `@radix-ui/react-select`

None of these packages are imported in `src/`. This will cause a build warning or error after dep removal. **Removed in Step 0.3.**

---

## H. pnpm-workspace.yaml

```yaml
packages:
  - "artifacts/api-server"
  - "artifacts/localai-control-center"
  - "lib/*"
```

No `-` override entries for native binaries. **Compliant with Rule 5.**

---

## I. Dead Code Summary

| Item | Location | Action |
|---|---|---|
| `runBatch` export | lib/file-execution-agent.ts | Defer — harmless, low risk |
| POST /observability/thoughts | observability.ts | No frontend caller; route stays for future use |
| 26 unused frontend deps | package.json | **Removed in Step 0.2** |
| `radix` manualChunks | vite.config.ts | **Removed in Step 0.3** |
| drizzle-orm | api-server/package.json | Defer to Phase 5 |
| `config/models.config.ts` | Missing entirely | Defer to Phase 1+ |
| 12× `127.0.0.1:11434` literals | backend src/ | Defer to Phase 1+ |
| 9× model-roles.json direct reads | backend src/ | Defer to Phase 1+ |
