# Phase 8 Report — Power-User Additions

All 13 optional power-user features implemented. Backend typecheck: 0 errors. Frontend typecheck: 0 errors. Production build: success.

---

## 8.1 Model Benchmark Suite

**Backend** (`artifacts/api-server/src/routes/benchmark.ts`)
- `POST /benchmark/runs` — starts async benchmark across all installed models
- `GET /benchmark/runs` — list all past runs
- `GET /benchmark/runs/:id` — get a specific run with results
- Each model is tested with a standard coding prompt; a judge model (`llama3.1:8b`) scores output 1–10 with reasoning
- Results stored in `benchmark_runs` SQLite table (added in Phase 8 schema)

**Frontend** (`artifacts/localai-control-center/src/pages/Models.tsx`)
- New "Benchmark" tab in the Models page tab bar
- Bar chart score visualization per model, ranked by judge score
- Live polling while run is in progress; past run selector

---

## 8.2 Conversation Tree View

**Frontend** (`artifacts/localai-control-center/src/pages/Chat.tsx`)
- "Tree" button in the Chat page header opens a modal overlay
- Pure SVG grid layout of all sessions — nodes are clickable to navigate directly to that session
- Active session highlighted with accent border
- No D3 dependency — uses native SVG

---

## 8.3 Package Workspace for GitHub

**Frontend** (`artifacts/localai-control-center/src/pages/Workspace.tsx`)
- New Git branch button on every ProjectCard
- One click uses `api.system.sovereignEdit` pipeline to write `.gitignore` (Node/common patterns) and `README.md` (name + getting-started scaffold) into the project directory
- Feedback message shown inline below the card on success/error

---

## 8.4 Cross-Workspace Pinboard

**Backend** (`artifacts/api-server/src/routes/pinboard.ts`)
- `GET /pinboard` — list all pins
- `POST /pinboard` — add a pin (kind, title, content, optional filePath/workspacePath)
- `DELETE /pinboard/:id` — remove a pin
- Persisted in `pinboard_items` SQLite table

**Frontend** (`artifacts/localai-control-center/src/pages/Chat.tsx`)
- Collapsible pinboard rail between the session sidebar and the message pane
- Pins any text note with one click; supports expand/collapse
- Delete pins with a hover-revealed ×

---

## 8.5 Model Warm-Up Scheduler

**Backend** (`artifacts/api-server/src/app.ts`)
- On boot (after 8 s startup delay), queries `chat_messages` for the top-N most-used models
- Sends `POST /api/generate keep_alive=1m` to Ollama for each, pre-loading weights
- Controlled by `WARMUP_TOP_N = 2` constant in `models.config.ts`
- Fully non-fatal — wrapped in try/catch

---

## 8.6 Global Ctrl+Shift+Z Rollback Hotkey

**Frontend** (`artifacts/localai-control-center/src/pages/Chat.tsx`)
- `useEffect` keyboard listener active whenever the Chat page is mounted
- On Ctrl+Shift+Z: fetches most recent rollback candidate from `/audit/rollback-candidates`, calls `/rollback` for that file
- Success/failure shown as a toast notification

---

## 8.7 Offline-First Detection

**Frontend** (`artifacts/localai-control-center/src/App.tsx`)
- `OfflineBanner` component queries `/remote/heartbeat` every 15 s
- When state is `"offline"`, a red banner appears at the top of the main content area explaining which capabilities are disabled
- The existing `SidebarStatus` still shows per-link connectivity status

---

## 8.8 Plugin Manifest Skeleton

**Backend** (`artifacts/api-server/src/routes/plugins.ts`)
- `GET /plugins` — list all plugin manifests from `plugins/` directory at repo root
- `GET /plugins/:name` — get a specific plugin
- `GET /plugins/:name/manifest` — raw JSON manifest

**Skeleton** (`plugins/example-plugin.json`)
- Reference manifest with name, version, description, author, routes, pages, permissions fields

---

## 8.9 Time-Travel Inspector

**Backend** (`artifacts/api-server/src/routes/timetravel.ts`)
- `GET /timetravel/backups?root=<dir>` — recursive scan for `.bak` files (max depth 6)
- `GET /timetravel/diff?bak=<path>` — line-by-line diff of `.bak` vs current file
- `POST /timetravel/restore` — copy `.bak` → original path

**Frontend** (`artifacts/localai-control-center/src/pages/Operations.tsx`)
- New "Time Travel" tab in Operations page
- Directory scan input + Scan button
- Split-pane: file list on left, diff view + one-click Restore on right

---

## 8.10 Personal Knowledge-Graph Visualizer

**Frontend** (`artifacts/localai-control-center/src/pages/Workspace.tsx`)
- `KnowledgeGraphPanel` component renders at the bottom of the Intelligence tab
- Pure SVG circle layout: RAG collections as nodes, hub-and-spoke edges from central "RAG" node
- Node size proportional to chunk count
- No D3 dependency

---

## 8.11 Chat-to-Chat Piping

**Frontend** (`artifacts/localai-control-center/src/pages/Chat.tsx`)
- "Send to new chat" option in every assistant message's kebab context menu
- Creates a new session, navigates to it with `?pipe=<content>` URL param
- On bootstrap, the piped content is pre-loaded into the textarea for empty sessions

---

## 8.12 Token Budget Per Session

**Backend** (`artifacts/api-server/src/routes/token-budget.ts`)
- `GET /token-budget/:sessionId` — get current budget and usage
- `PUT /token-budget/:sessionId` — set budget and used count
- `DELETE /token-budget/:sessionId` — remove budget
- `POST /token-budget/:sessionId/summarize` — LLM summarizes oldest 70% of messages into compact preamble

**Frontend** (`artifacts/localai-control-center/src/pages/Chat.tsx`)
- `TokenBudgetBar` renders above the message area when a budget is set
- Visual progress bar, "Summarize" button appears when over budget
- Inline budget editor (click "Edit" to change the token cap)

---

## 8.13 "Why This Model?" Tooltip

**Frontend** (`artifacts/localai-control-center/src/pages/Chat.tsx`)
- Every assistant message's model chip is now a clickable button (`ModelChipWithTooltip`)
- Click opens a popover showing: supervisor goal, category, confidence bar, and reasoning steps
- Closes on second click or when clicking elsewhere

---

## Schema additions (Phase 8)

Three new SQLite tables via `artifacts/api-server/src/db/migrate.ts`:
- `benchmark_runs` — benchmark run metadata + results JSON
- `pinboard_items` — cross-workspace pinned text/snippets
- `session_token_budgets` — per-session token cap and usage counter

## New constants in models.config.ts

```typescript
export const JUDGE_MODEL    = "llama3.1:8b";
export const BENCHMARK_PROMPT = "Explain the difference between a mutex and a semaphore...";
export const WARMUP_TOP_N   = 2;
```
