# Phase 3 — Chat Rebuild: Sessions Persist, Branches, Inline Reasoning

## Completed steps

### 3.1 — Drizzle schema + SQLite migration
- `artifacts/api-server/src/db/schema.ts` — Drizzle table definitions for `chat_sessions` and `chat_messages` (FK cascade, WAL mode)
- `artifacts/api-server/src/db/database.ts` — `better-sqlite3` instance at `~/LocalAI-Tools/chat.db`, WAL + FK enabled
- `artifacts/api-server/src/db/migrate.ts` — `runMigrations()` (DDL CREATE TABLE IF NOT EXISTS) + `importLegacyJsonFiles()` (idempotent JSON→SQLite import, renames `.json` → `.json.bak`)
- `artifacts/api-server/src/app.ts` — calls `initDatabase()` at startup

### 3.2 — Replace JSON storage with Drizzle in chat.ts
- `artifacts/api-server/src/routes/chat.ts` — streaming endpoint now persists user + assistant messages via Drizzle inserts; session auto-created if it doesn't exist; `ensureHistoryDir()` and `writeManagedJson` removed

### 3.3 — Session management endpoints
- `artifacts/api-server/src/routes/sessions.ts` (new):
  - `GET /chat/sessions` — list (newest first) with last-message preview
  - `GET /chat/sessions/:id` — full session + ordered messages
  - `POST /chat/sessions` — create with optional name + workspacePath
  - `PATCH /chat/sessions/:id` — rename (updates updatedAt)
  - `DELETE /chat/sessions/:id` — cascades to messages
  - `POST /chat/sessions/:id/branch` — copies messages ≤ pivot.createdAt into new session
  - `POST /chat/sessions/:id/messages` — persist individual message, update session updatedAt
- `artifacts/api-server/src/routes/index.ts` — registered `sessions` router

### 3.4 — Session sidebar (260 px, collapsible)
- `SessionSidebar` component in `Chat.tsx`:
  - 260 px fixed width, collapsible via `PanelLeft` toggle in header
  - `useQuery` polling (`staleTime: 5s`, `refetchInterval: 15s`)
  - Filter input searches name + preview text
  - Per-session context menu: Rename (inline input), Branch, Delete
  - New Chat button in sidebar header
  - Active session highlighted with accent border

### 3.5 — Session persistence (URL-based)
- `ChatPage` reads `?session=id` from URL via `useSearch()`
- On mount: if URL has session ID → load messages from DB; else → create session + redirect to `?session=<newId>`
- On send: `api.sessions.addMessage()` persists user message before SSE; persists assistant reply after stream completes, capturing DB `id` into the `Message` object
- Sidebar invalidated after each exchange to keep preview current

### 3.6 — Conversation branching
- `MessageBubble` shows `MoreVertical` kebab on hover for assistant messages
- "Branch from here" menu item: calls `api.sessions.branch(sessionId, msg.id)` → navigates to `?session=<newId>`
- Session sidebar "Branch" context menu: branches from last message in that session
- Both paths invalidate the `chat-sessions` query so the sidebar updates immediately

### 3.7 — Code-block copy + Apply-to-file
- `CopyButton` component: clipboard write with 1.8 s "Copied" feedback (check icon + green tint)
- `RenderedContent` component: splits content on ```` ```lang\n...\n``` ```` fences, renders each fence in a toolbar card with:
  - Language/file-path label
  - `CopyButton` (small variant)
  - "Ask AI to apply to \<filename\>" button when info string contains a path or extension (triggers `/edit <filePath>` in the input + focus)
- Plain text segments rendered with `whitespace-pre-wrap`
- Streaming cursor still appended during live output

## Verification

```
pnpm -r typecheck   → Done (0 errors, both packages)
pnpm --filter localai-control-center build → ✓ built in 2.43s, 494.28 kB
```

## Files modified / created in Phase 3

| File | Status |
|------|--------|
| `artifacts/api-server/src/db/schema.ts` | created |
| `artifacts/api-server/src/db/database.ts` | created |
| `artifacts/api-server/src/db/migrate.ts` | created |
| `artifacts/api-server/src/app.ts` | modified |
| `artifacts/api-server/src/routes/chat.ts` | modified |
| `artifacts/api-server/src/routes/sessions.ts` | created |
| `artifacts/api-server/src/routes/index.ts` | modified |
| `artifacts/localai-control-center/src/api.ts` | modified |
| `artifacts/localai-control-center/src/pages/Chat.tsx` | modified |
| `PHASE_3_REPORT.md` | created |
