# PHASE 1 REPORT — Windows Hardening + Hardware Probe + Central Model Config

**Completed:** 2026-04-18  
**Typecheck result:** 0 errors (both workspaces)  
**Frontend build result:** success (vite 7.3.2, 3.82s)

---

## Steps Completed

### 1.1 — Unhandled rejection + error suppressors (`main.tsx`)
Added `window.addEventListener("unhandledrejection", ...)` and `window.addEventListener("error", ...)` before `createRoot` to prevent uncaught promise rejections from crashing the React tree on Windows.

### 1.2 — QueryClient `retry: 0` (`App.tsx`)
Changed `retry: 1` → `retry: 0` in `defaultOptions.queries`. Prevents UI from hammering a down Ollama instance.

### 1.3 — Central model config (`config/models.config.ts`)
New file: single source of truth for all model names. Exports:
- `USER_STACK: ModelSpec[]` — 10 model entries with role, name, VRAM budgets, modality, quant
- `INTENT_PATTERNS`, `VISION_PATTERN`, `AFFINITY_PATTERNS` — intent routing tables
- `SUPERVISOR_PREFERENCES`, `INTENT_PREFERENCES` — priority preference lists
- `inferAffinityFromName()` — runtime affinity inference
- `DEFAULT_FALLBACK_MODEL`, `DEFAULT_CODING_FALLBACK`, `CODING_FALLBACK_SEARCH_ORDER`
- `DISCOVERY_SEEDS: ModelSeed[]` — Ollama Hub seed list

### 1.4 — Model-name literal refactor (6 backend files)
All hardcoded model names removed from:
- `lib/model-orchestrator.ts` — `inferIntentFromModelName` + `canonicalPreferencesForIntent` delegate to config
- `lib/supervisor-agent.ts` — `CATEGORY_PATTERNS` + `MODEL_PREFERENCES` + fallback literal
- `lib/file-execution-agent.ts` — `DEFAULT_FALLBACK_MODEL` + dynamic model-roles import
- `lib/studio-pipeline.ts` — `DEFAULT_FALLBACK_MODEL` + dynamic imports
- `lib/global-workspace-intelligence.ts` — `CODING_FALLBACK_SEARCH_ORDER` + dynamic URL import
- `lib/model-discovery.ts` — `SEED_MODELS` replaced with `DISCOVERY_SEEDS` re-export

### 1.5 — Default model roles + first-boot copy
- `config/default-model-roles.json`: canonical defaults for all 10 roles
- `model-roles-service.ts` copies this file to `~/LocalAI-Tools/model-roles.json` on first boot, publishing a thought-log event

### 1.6 — `model-roles-service.ts` singleton
10-second TTL cache. Centralises all model-roles.json reads across:
- `routes/models.ts`, `routes/studios.ts`, `routes/repair.ts`, `routes/updater.ts`
- `lib/file-execution-agent.ts`, `lib/studio-pipeline.ts`

Fallback chain: `~/LocalAI-Tools/model-roles.json` → secure settings → installed models → `null`.

### 1.7 — `lib/ollama-url.ts` + 11-site refactor
`getOllamaUrl()` priority: `OLLAMA_BASE_URL` env → distributed-node remote config → `http://127.0.0.1:11434`.  
Replaced hardcoded URL in: `routes/system.ts`, `routes/updater.ts`, `routes/repair.ts`, `routes/studios.ts`, `lib/file-execution-agent.ts`, `lib/studio-pipeline.ts`, `lib/global-workspace-intelligence.ts`.  
`runtime.ts` reads `process.env["OLLAMA_BASE_URL"]` directly (circular dep avoidance).

### 1.8 — `lib/hardware-probe.ts` + `GET /api/system/hardware`
30-second TTL cache. GPU detection chain: `nvidia-smi` → PowerShell `Win32_VideoController` → safe-mode (20% totalmem).  
Also probes: CPU (WMI friendly name + cores), RAM (os module), disk (statfs on repo dir), OS (platform + DisplayVersion), Ollama reachability.  
Route added to `routes/system.ts`.

### 1.9 — Dashboard `SystemCard` component
New `SystemCard` sub-component in `Dashboard.tsx`:
- Polls `GET /api/system/hardware` every 10 seconds via `api.hardware.probe()`
- Shows: GPU name + VRAM free/total + probe-mode badge + progress bar
- Shows: CPU model + cores/threads + GHz
- Shows: RAM free/total + usage bar
- Shows: disk free/total, OS string (platform + release + build + arch)
- Shows: Ollama reachable/unreachable (green Wifi / red WifiOff icon) + URL
- Spans 2 columns in the 4-column stat cards row

`api.ts` additions: `HardwareSnapshot` interface (+ 6 sub-interfaces) and `api.hardware.probe()` wrapper.

### 1.10 — Shell auto-minimize (`app.ts`)
After `stateOrchestrator.hydrate()`:
```typescript
trackWindowForIdleMinimize("api-server", 30_000);
trackWindowForIdleMinimize("localai-control-center", 30_000);
```

### 1.11 — Windows tray sidecar
`scripts/windows/LocalAI.Tray.ps1`: PowerShell `NotifyIcon` with:
- Custom 16×16 icon (filled circle, accent color `#6366f1`) built in memory
- "Open Control Center" → `Start-Process http://localhost:5173`
- "Kill AI Processes" → `POST /api/system/process/kill-switch` with confirmation dialog
- "Exit" → removes tray icon and exits

Spawned from `app.ts` via `child_process.spawn` (detached, `stdio: "ignore"`, Windows-only guard).  
Thought-log event published on spawn.

---

## Verification

| Check | Result |
|---|---|
| `pnpm -r typecheck` | **0 errors** |
| `pnpm --filter localai-control-center build` | **Success** (vite 7.3.2, 3.82s) |
| All model names centralised in one file | **Yes** — `config/models.config.ts` |
| No hardcoded Ollama URLs | **Yes** — `getOllamaUrl()` used everywhere except `runtime.ts` (circular-dep exception) |
| No hardcoded `~/LocalAI-Tools/` model-roles path in routes | **Yes** — `modelRolesService.filePath` used |
| Hardware probed at runtime | **Yes** — `hardware-probe.ts` with 30s cache |
| `retry: 0` on QueryClient | **Yes** |
| Unhandled rejection suppressor | **Yes** |
| Tray sidecar Windows-only guarded | **Yes** — `os.platform() !== "win32"` early return |
