# Core Architecture — LOCALAI Context Pack

Compact reference for local models building LOCALAI. Read before proposing any structural change.

## Repo layout

```
LOCALAI-main/
  artifacts/
    api-server/          ← Express 5 API, TypeScript ESM, port 3001
      src/
        db/              ← SQLite (better-sqlite3 + drizzle-orm)
          database.ts    ← singleton `sqlite` export
          schema.ts      ← table definitions (DO NOT destructively alter)
          migrate.ts     ← migration runner
        lib/             ← business logic modules (one concern per file)
        routes/          ← Express routers (one domain per file)
          index.ts       ← registers all routers
        index.ts         ← server entry point
      tests/             ← one test file per lib module (tsx runner)
      package.json       ← "type":"module", pnpm scripts
    localai-control-center/  ← React 18 + Vite SPA, port 5173
      src/
        api.ts           ← all backend calls via fetch wrappers
        pages/           ← top-level pages (no router nesting)
        components/      ← shared components
      tests/             ← vitest + testing-library
  docs/                  ← planning, ledger, phase map, context packs
  scripts/jarvis/        ← automation helpers (verify-build-kit.mjs, etc.)
  pnpm-workspace.yaml    ← monorepo workspace
```

## Key patterns

### Lazy DDL (preferred for new tables)
Add tables in the lib file that owns them using `sqlite.exec("CREATE TABLE IF NOT EXISTS ...")`.
Do NOT modify `schema.ts` or `migrate.ts` unless the schema change is cross-cutting.

### Route registration
- Add a new route file in `routes/`, export a Router, import + `router.use(...)` in `routes/index.ts`.
- OR append routes to an existing domain file (e.g., `routes/intelligence.ts`) when the feature is a sub-concern.

### Approval gate pattern
```ts
// Step 1 — no approvalId → create approval, return 202
const approval = await createApprovalRequest({ type, title, summary, riskTier, requestedAction, payload });
return res.status(202).json({ approvalRequired: true, approval });

// Step 2 — approvalId provided → verify, then proceed
const v = verifyApprovedRequest(approvalId, payload, APPROVAL_TYPE);  // 3 args
if (!v.allowed) return res.status(403).json({ message: v.message });
```

### Plugin state persistence
```ts
upsertPluginState(STATE_ID, stateObject);   // serialize to plugin_state table
// retrieve:
sqlite.prepare("SELECT state_json FROM plugin_state WHERE id = ?").get(STATE_ID)
```

### Audit logging
```ts
void recordAuditEvent({ action, target, outcome, metadata });
```

### Thought log
```ts
void thoughtLog({ category, level, title, message, metadata });
// categories: "system" | "security" | "kernel" | "approval" | ...
```

## Frontend conventions

- All backend calls go through `src/api.ts` fetch wrappers — never raw `fetch()` in components.
- Design tokens: `var(--color-*)`, `var(--radius-*)`, `var(--font-*)`.
- Card/pill/badge components defined locally per page — no external UI library.
- `StatusPill` for pass/fail/unknown states.
- Tabs use a local `Tab` string union; `useState<TabType>` drives active tab.

## Technology versions

- Node: 20+
- TypeScript: 5.9 (strict)
- Express: 5.2
- SQLite: better-sqlite3 12 (synchronous API)
- React: 18, Vite 6
- pnpm workspaces (no npm/yarn)

## What NOT to do

- Do not call cloud APIs without an explicit user-approved provider policy.
- Do not modify `schema.ts` with destructive changes — add migrations.
- Do not replace working systems with stubs.
- Do not add placeholder routes, fake statuses, or "coming soon" UI.
- Do not skip tests or claim success without running them.
