# Phase 4 — Dashboard Polish + Studios as Real Workspaces

## Steps completed

### 4.1 — Dashboard layout reordered for information density
- **Row 1:** `SystemCard` (spans 2 cols) + VRAM Budget + `HealthCard` + Catalog stat + Kill Switch button
- **Row 2:** Running Models + Capabilities | Agent Goal | Token Usage Sparkline
- **Row 3:** Thought Log SSE (last 10 entries, live) | Quick Actions + Activity Feed
- **Row 4:** Quick Launch — 10 workspace preset tiles (readiness dots, click → Studios page)
- **Row 5:** Stack Summary + Storage + Model Recommend
- Kill Switch moved from header into Row 1 card column; header now has only Sync Catalog

### 4.2 — `artifacts/api-server/src/config/workspace-presets.ts` (new)
- Exports `WorkspacePreset` interface with: `id`, `name`, `description`, `icon` (Lucide name), `requiredRoles`, `optionalRoles`, `toolset` (8 boolean capabilities), `systemPrompt`, `startingLayout`, `defaultWorkspacePathTemplate`
- Exports `WORKSPACE_PRESETS` array: 10 presets — coding, cad, imagegen, writing, research, automotive, sysadmin, log-analysis, 3d-print-slicer, laser-engrave
- No model name literals — all roles resolved at runtime via `modelRolesService`
- Exports `getPreset(id)` convenience lookup

### 4.3 — Studios.tsx: preset grid replaces default tab
- New default tab: **Workspace Presets** (grid 2×5 on desktop, responsive)
- Each tile: icon, name, description, readiness dot (green/yellow/red), "Enter →" label
- Clicking tile opens **PresetModal**:
  - Workspace path input (prefilled from `defaultWorkspacePathTemplate`)
  - Model preflight table — per required role: installed (✓) vs missing (⚠)
  - Toolset capability badges
  - "Enter Workspace" button → calls `POST /studios/presets/enter` → opens `WorkspaceView` full-screen
- Existing tabs (Vibe Coding, VibeCheck, Image Gen, CAD) retained in full
- Refresh button now invalidates both catalog and presets queries

### 4.4 — `POST /studios/presets/enter` endpoint
- Validates `presetId` and `workspacePath`
- **Step 1:** Resolves each `requiredRole` via `modelRolesService.getRole()`
- **Step 2:** VRAM preflight — reads `probeHardware()`, sums required model VRAM from `USER_STACK`, returns HTTP 422 with suggestion if over budget (10% headroom)
- **Step 3:** Creates `workspacePath` directory via `ensureDir()` if absent
- **Step 4:** Preloads primary role model via `POST /api/generate { keep_alive: "30m" }` (non-fatal if Ollama is down)
- **Step 5:** Registers workspace in `workspace-projects.json` if not already there
- **Step 6 (4.6):** Writes `preferredRoleAssignments` to `model-roles.json` via `modelRolesService.setRole()` — only for models confirmed installed in Ollama tags
- Returns `{ success, sessionId, presetId, redirectPath, preset, roleModels }`

### Frontend additions to api.ts (steps 4.1–4.4)
- `WorkspacePreset`, `PresetToolset`, `StartingLayout`, `PresetEnterResult` TypeScript interfaces
- `api.studios.presets.list()` → `GET /studios/presets`
- `api.studios.presets.enter(presetId, workspacePath)` → `POST /studios/presets/enter`

### Dashboard additions
- `TokenSparkline` component: today's total token count + 7-day bar sparkline + top-3 models by token usage; refetches every 60s
- `QuickLaunchPresets` component: 5×2 grid of preset tiles with readiness dots; clicking navigates to `/studios`
- `presetIcon()` helper resolves icon name string → Lucide component (used in both Dashboard and Studios)

---

### 4.5 — Per-preset workspace views (`artifacts/localai-control-center/src/pages/WorkspaceView.tsx`)

**Full implementations (4 presets):**

**Coding** (`split-editor-chat` layout):
- Monaco-style textarea editor (left pane) + Chat (right pane, 320px)
- Ghost text autocomplete: 200ms debounce on keyUp → `POST /api/generate` with autocomplete role model → grey overlay text → Tab accepts, Esc dismisses
- "Open in VS Code" button → calls `api.studios.coding.writeContinueConfig()` → backend writes `.continue/config.json` then spawns `code <workspacePath>`
- Copy-to-clipboard button

**CAD** (`canvas-chat` layout):
- Three panes: OpenSCAD script editor | render preview image | Chat (320px)
- Render button → `POST /studios/cad/render` → shows base64 PNG in preview
- Install hint shown when OpenSCAD is missing (`winget install OpenSCAD.OpenSCAD`)
- G-code optimizer panel below editor: paste G-code left → click Optimize → optimized G-code right

**ImageGen** (`gallery-chat` layout):
- Left 320px controls: ComfyUI/SD WebUI status probing, prompt + negative prompt, style picker (4 options), steps/CFG sliders, Generate button
- Warning banner + install hint when no backend running
- Right: gallery grid (3 cols) from `GET /studios/imagegen/gallery` (refetched after each generation) + Chat (h-64) below
- Generate disabled until a backend is reachable

**Writing** (`split-editor-chat` layout):
- Textarea markdown editor (left) | `marked`-rendered HTML preview (middle) | Chat (right 320px)
- `marked` lazy-imported (`await import('marked')`) — lands in its own 41.57 kB chunk
- Drag-and-drop RAG upload zone below editor (wires to actual RAG in Phase 6)

**Skeletons (6 presets — Research, Automotive, SysAdmin, Log-Analysis, 3D-Print-Slicer, Laser-Engrave):**
- Each gets preset system prompt wired into the Chat session
- Preset-specific quick-action chips (5 per preset) pre-fill the chat input on click
- Full-height `ChatPanelControlled` component with external input binding

**Common `WorkspaceView` shell:**
- Full-screen overlay (`fixed inset-0 z-40`) with top bar showing preset name, workspace path, and role→model badges
- X button exits back to Studios
- Routes to correct implementation by `preset.id`

### 4.5 — Backend additions (`artifacts/api-server/src/routes/studios.ts`)

**`POST /studios/cad/render`:**
- Checks `commandExists('openscad')` — returns HTTP 422 with `installHint` if missing
- Writes temp `.scad` file, runs `openscad -o out.png in.scad --imgsize=800,600 --colorscheme=BeforeDawn`
- Returns `{ success, base64Png, mimeType }` on success; cleans up temp files in `finally`

**`GET /studios/imagegen/gallery`:**
- Lists `*.png` files from `~/LocalAI-Tools/studio-pipeline/imagegen/`
- Returns `{ success, files: [{ name, path, mtime }] }` sorted by mtime descending

**`POST /studios/coding/write-continue-config`:**
- Accepts `{ workspacePath, modelName }`
- Writes `.continue/config.json` with Ollama provider config to workspace root
- Spawns `code <workspacePath>` (detached, non-blocking)
- Returns `{ success, configPath }`

### 4.6 — Default role assignments on first preset entry

- Added `preferredRoleAssignments?: Partial<Record<ModelRole, string>>` field to `WorkspacePreset` interface
- Coding preset assigns: `primary-coding → qwen2.5-coder:7b`, `fast-coding + autocomplete → qwen2.5-coder:1.5b`
- CAD preset assigns: `reasoning → qwen2.5:14b`, `vision → llava:13b`
- Writing preset assigns: `chat → llama3.1:8b`
- `POST /studios/presets/enter` Step 6: fetches Ollama `/api/tags`, cross-references `preferredRoleAssignments` against installed models (base name match), calls `modelRolesService.setRole()` for each match (non-fatal)

### Additional api.ts additions (step 4.5)
- `api.studios.cad.render(scadScript)` → `POST /studios/cad/render`
- `api.studios.coding.writeContinueConfig(workspacePath, modelName)` → `POST /studios/coding/write-continue-config`
- `api.studios.imagegen.gallery()` → `GET /studios/imagegen/gallery`

### Package additions
- `marked@^18.0.2` added to `localai-control-center` devDependencies (markdown rendering in Writing workspace)

## Verification

```
pnpm -r typecheck   → Done (0 errors, both packages)
pnpm --filter localai-control-center build → ✓ built in 3.84s
  marked chunk: 41.57 kB (correctly code-split)
  main bundle:  534.53 kB (advisory warning only — not a build failure)
```

## Files modified / created in Phase 4

| File | Status |
|------|--------|
| `artifacts/api-server/src/config/workspace-presets.ts` | modified (added `preferredRoleAssignments` field + populated for coding/cad/writing) |
| `artifacts/api-server/src/routes/studios.ts` | modified (presets GET + enter POST + 3 new endpoints + step 4.6 role assignment) |
| `artifacts/localai-control-center/src/api.ts` | modified (interfaces + presets/coding/imagegen/cad API methods) |
| `artifacts/localai-control-center/src/pages/Dashboard.tsx` | modified (layout reorder, sparkline, quick launch) |
| `artifacts/localai-control-center/src/pages/Studios.tsx` | modified (preset grid + modal → WorkspaceView on enter) |
| `artifacts/localai-control-center/src/pages/WorkspaceView.tsx` | created (4 full + 6 skeleton workspace views) |
| `PHASE_4_REPORT.md` | updated |
