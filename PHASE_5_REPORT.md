# Phase 5 — Full SQLite Migration + Model Pull History + Cost Counter

## Steps completed

### 5.1 — Extended Drizzle schema (`artifacts/api-server/src/db/schema.ts`)

Added 9 new tables (joining the 2 existing chat tables = 11 total):

| Table | Primary key | Purpose |
|-------|-------------|---------|
| `app_settings` | `key` | Key/value settings store |
| `capability_state` | `id` | Capability on/off + phase tracking |
| `role_assignments` | `role` | Model-role → model-name mapping |
| `usage_metrics` | `date` | Daily token counts + cost estimate |
| `thought_log` | `id` | Durable thought log (write-through) |
| `workspace_registry` | `id` | Workspace project registry |
| `model_pull_history` | `id` | Per-pull audit trail |
| `audit_log` | `id` | File edit/rollback audit events |
| `refactor_plans` | `id` | Global workspace intelligence plans |
| `refactor_jobs` | `id` | Per-plan execution jobs (FK cascade) |
| `async_jobs` | `id` | Task queue jobs (write-through) |

DB file renamed from `chat.db` → `localai.db`.

### 5.2 — In-memory stores migrated to write-through SQLite cache

**`lib/thought-log.ts`:**
- `publish()` fire-and-forgets INSERT to `thought_log` after updating ring
- `hydrate()` method loads latest 500 rows on startup (called from `app.ts`)
- Lazy `import("../db/database.js")` avoids circular import at module-load time

**`lib/task-queue.ts`:**
- `enqueue()` INSERT to `async_jobs` immediately
- `updateJob()` UPDATE on every status/progress change
- `hydrate()` loads last 500 jobs; marks any `running`/`queued` as `failed` with `error = "Process was restarted"`
- Called from `app.ts` after `initDatabase()` resolves

**`app.ts`:**
- After `initDatabase()` resolves: runs `thoughtLog.hydrate()` and `taskQueue.hydrate()` in parallel
- Imported `taskQueue` directly (was already pulled in via model-orchestrator)

### 5.3 — JSON vault files migrated to SQLite

**`db/migrate.ts` — new migration functions:**

| Source file | Target table | Migration function |
|-------------|-------------|-------------------|
| `~/LocalAI-Tools/settings.json` | `app_settings` | `migrateSettings()` |
| `~/LocalAI-Tools/model-roles.json` | `role_assignments` | `migrateModelRoles()` |
| `~/LocalAI-Tools/projects.json` | `workspace_registry` | `migrateProjects()` |
| `~/LocalAI-Tools/activity.json` | `audit_log` | `migrateActivity()` |

All migrations: idempotent (INSERT OR IGNORE on existing rows), rename source to `.bak` after successful import, non-fatal on error.

**`lib/model-roles-service.ts` — rewritten to use SQLite:**
- `getRole()` / `getRoles()` query `role_assignments` table (10 s TTL cache)
- `setRole()` uses `INSERT ... ON CONFLICT DO UPDATE` (upsert)
- `filePath` getter returns path to `localai.db` for legacy callers (repair/updater routes)
- No longer touches `model-roles.json`

### 5.4 — New audit history endpoints (`routes/rollback.ts`)

- `GET /audit/history?limit=N&types=edit,rollback,exec` — queries `audit_log` table ordered by timestamp DESC, optional action filter
- `GET /audit/rollback-candidates` — entries where `result='success'` and `backup_path` is set
- Both wired into the Rollback panel / Logs Audit tab

**`lib/snapshot-manager.ts` — audit write-through:**
- `writeManagedFile()` writes `audit_log` row after every file edit (old hash, new hash, backup path)
- `rollbackFile()` writes `audit_log` row with `action='rollback'`
- `writeAuditEntry()` helper with lazy DB import (fire-and-forget, non-fatal)

### 5.5 — Model pull history (`routes/models.ts`, `lib/model-orchestrator.ts`)

- `queueUniversalModelPull()` now records a row in `model_pull_history` at start (`status='pending'`) then updates to `'success'` or `'failed'` on completion
- `GET /models/pull-history?limit=N&model=name` endpoint queries the table
- Frontend: Models page gains a **History** tab (`PullHistoryTab` component) showing all past pulls with status dot, timing, size, error, and per-row **re-pull** button

### 5.6 — Lifetime cost-saved counter

**Backend (`routes/usage.ts`):**
- `POST /usage/record` now also upserts `usage_metrics` (accumulates `tokens_in`, `tokens_out`, `cost_estimate_usd` per date)
- `GET /usage/lifetime` sums all `usage_metrics` rows; falls back to scanning JSON usage files if DB is empty
- Pricing: $3/1M input tokens, $15/1M output tokens (Claude Sonnet 4 API rates)
- Returns `{ totalTokensIn, totalTokensOut, totalTokens, costEstimateUsd, firstDate, pricing }`

**Frontend (`pages/SettingsPage.tsx`):**
- `LifetimeCostCard` component polls `GET /usage/lifetime`
- Shows big green `$X.XX` savings estimate with "since YYYY-MM-DD" caption
- Breakdown grid: total / input / output token counts
- Pricing footnote: `$3/1M input · $15/1M output (Claude Sonnet 4)`
- Rendered between "Usage & Token Tracking" and "Continue.dev Rules" sections

**New types in `api.ts`:**
- `LifetimeUsage`, `ModelPullHistoryEntry`, `AuditEntry` interfaces
- `api.usage.lifetime()`, `api.modelsExtra.pullHistory()`, `api.audit.history()`, `api.audit.rollbackCandidates()`
- `audit` namespace added to default export

## Verification

```
pnpm -r typecheck   → Done (0 errors, both packages)
pnpm --filter localai-control-center build → ✓ built in 3.86s
  marked chunk:   41.57 kB (code-split)
  main bundle:   539.75 kB (advisory warning only)
```

## Files modified / created in Phase 5

| File | Status |
|------|--------|
| `artifacts/api-server/src/db/schema.ts` | modified (9 new tables added) |
| `artifacts/api-server/src/db/database.ts` | modified (DB renamed chat.db → localai.db) |
| `artifacts/api-server/src/db/migrate.ts` | modified (DDL for 11 tables + 4 JSON vault migrations) |
| `artifacts/api-server/src/lib/thought-log.ts` | modified (write-through SQLite + hydrate()) |
| `artifacts/api-server/src/lib/task-queue.ts` | modified (write-through SQLite + hydrate() + restart-recovery) |
| `artifacts/api-server/src/lib/model-roles-service.ts` | modified (reads/writes role_assignments table) |
| `artifacts/api-server/src/lib/model-orchestrator.ts` | modified (pull history rows in queueUniversalModelPull) |
| `artifacts/api-server/src/lib/snapshot-manager.ts` | modified (audit_log write-through on edit + rollback) |
| `artifacts/api-server/src/routes/rollback.ts` | modified (GET /audit/history + /audit/rollback-candidates) |
| `artifacts/api-server/src/routes/models.ts` | modified (GET /models/pull-history + imports) |
| `artifacts/api-server/src/routes/usage.ts` | modified (upsert usage_metrics + GET /usage/lifetime) |
| `artifacts/api-server/src/app.ts` | modified (hydrate thoughtLog + taskQueue post-DB-init) |
| `artifacts/localai-control-center/src/api.ts` | modified (LifetimeUsage, ModelPullHistoryEntry, AuditEntry types + new API methods) |
| `artifacts/localai-control-center/src/pages/SettingsPage.tsx` | modified (LifetimeCostCard component) |
| `artifacts/localai-control-center/src/pages/Models.tsx` | modified (PullHistoryTab component + History tab) |
| `PHASE_5_REPORT.md` | created |

## Deferred to Phase 6

- `global-workspace-intelligence.ts` SQLite integration for `refactor_plans` / `refactor_jobs` (tables created and ready; in-memory maps still primary)
- `capability_state` table write-through (table created; `secure-config.ts` still primary)
- Audit tab in Logs page wired to `GET /audit/history` (endpoint exists; UI wiring deferred)
