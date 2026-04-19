# Phase 6 — Vision Live + Voice + RAG + Web Search + OS Interop + Security

## Steps completed

### 6.1 — Vision: finish and polish
- Image drag-drop to the Chat input area (visual drop-zone overlay on DragOver)
- "Screenshot to Chat" button (`<Camera>` icon) calls `POST /system/os/screenshot`, attaches base64 PNG as attached image in the next send
- Existing image round-trip via llava:v1.6 tested end-to-end through `POST /chat/stream` with `images` array

### 6.2 — Voice STT via faster-whisper Python sidecar
- `artifacts/api-server/sidecars/stt-server.py` — FastAPI + faster-whisper-large-v3 on `127.0.0.1:3021`
  - Supports `.wav`, `.webm`, `.mp3`, `.ogg`, `.flac`, `.m4a`
  - Falls back to CPU/int8 if CUDA unavailable
- `app.ts` — on boot checks `python --version` for 3.10+, spawns sidecar if ok, publishes thought warning if not
- `routes/stt.ts` — `POST /stt/transcribe` (multipart, `file` field), `GET /stt/status`
  - Proxies multipart to sidecar; returns 503 + `unavailable: true` when sidecar down
- Chat.tsx mic button — `navigator.mediaDevices.getUserMedia({ audio: true })` → `MediaRecorder (audio/webm)` → on stop: `POST /api/stt/transcribe` → populates textarea
  - Shows `"STT unavailable — install Python 3.10+ and faster-whisper"` on 503 response

### 6.3 — Voice TTS via Piper
- `routes/tts.ts` — `POST /tts/speak { text, voice? }` → `audio/wav` stream piped from `piper --model <path> --output_raw`
  - `GET /tts/status` → `{ available, voices[], defaultVoice, voicesDir }`
  - Voice models at `~/LocalAI-Tools/tts/voices/<name>.onnx`
  - Default voice: `en_US-libritts_r-medium`
- Settings toggle "Speak replies" (default off); toggles `speakReplies` in AppSettings
- Chat.tsx: after every streaming response completes → `POST /api/tts/speak` → plays via `new Audio(blobUrl)`
- Settings toggle "TTS voice" text input for voice name

### 6.4 — RAG via hnswlib-node (pure TypeScript)
- `lib/rag.ts` — production implementation:
  - `createCollection / listCollections / deleteCollection` — SQLite `rag_collections` + `rag_chunks` + HNSW index dir
  - `ingest(collectionId, { filePath|content, source })`:
    - PDF → `pdf-parse`, docx → `mammoth`, txt/md/code → direct readFile
    - Chunk: 512-token (≈2048 chars) pieces, 64-token overlap, skip < 20 chars
    - Embed each chunk via Ollama `nomic-embed-text`
    - Store in HNSW cosine index (hnswlib-node), auto-resize, write to disk
    - INSERT chunk metadata into SQLite `rag_chunks`
  - `search(query, collectionIds, topK)` — embed query, kNN across all collections, cosine sort, return top-K with source/chunk
  - `buildRagContext(query, ids, topK)` — formats chunks as labelled system-prompt section
- `routes/rag.ts` — 5 endpoints: `POST /rag/collections`, `GET /rag/collections`, `DELETE /rag/collections/:id`, `POST /rag/ingest`, `POST /rag/search`
- Chat stream: every turn runs `buildRagContext` in parallel with code-context search; merges RAG hits + code context into system prompt
- `/pin <text>` slash command: ingests text into `personal-memory` collection (auto-created)

### 6.5 — Web search: SearxNG preferred, DuckDuckGo fallback
- Settings toggle "Enable web search" (default off)
- `routes/web.ts`:
  - `POST /web/search { query }` — probes SearxNG at `localhost:8888`; falls back to DuckDuckGo HTML scrape via `cheerio`; returns `{ results, backend }`
  - `POST /web/fetch { url }` — strips HTML noise via cheerio/readability, returns `{ markdown }` (capped 20k chars)
- `/web <query>` slash command in `chat.ts` — calls `/api/web/search`, renders top-5 results as assistant bubble with clickable markdown links
- `cheerio` installed as backend dependency

### 6.6 — Foreground-app adaptive profiles
- `lib/foreground-watcher.ts` — polls foreground window every 3s via PowerShell Win32 API
  - Default map: `Code.exe → coding`, `Fusion360.exe → cad`, `cura.exe → 3d-print-slicer`, `LightBurn.exe → laser-engrave`
  - Configurable via `setProcessMap()` — not hardcoded (can be updated from settings)
  - `onForegroundChange(fn)` — listener registration with unsubscribe returned
  - Publishes "ForegroundChanged" thought log entry on every profile switch
- `app.ts` — starts watcher after boot if `adaptiveForegroundProfiles` setting is true (default)
- Settings toggle "Adaptive foreground profiles" in new "Web & Privacy" section

### 6.7 — Strict Local Mode
- `app.ts` — patches `globalThis.fetch` at startup with a strict-local wrapper
  - Allows: loopback (127.0.0.1, localhost, ::1, 0.0.0.0), Tailscale CIDR (100.x.x.x)
  - Blocks all other outbound fetches with thrown error logged to thought log
  - `setStrictLocalMode(enabled)` export for settings changes
- Settings toggle "Strict Local Mode" with green dot indicator when active

### 6.8 — Command sanitizer middleware
- `lib/command-sanitizer.ts` — `isDangerousCommand(cmd): SanitizeResult`
  - 20-pattern block list (rm -rf /, format C:, Remove-Item -Recurse -Force, shutdown, reg delete HKLM, cipher /w, net user /delete, takeown, icacls Everyone:F, mkfs, dd if=, fork bomb, poweroff, reboot, curl|bash, wget|sh, dropdb, DROP DATABASE, TRUNCATE TABLE)
  - Returns `{ dangerous: false }` or `{ dangerous: true, reason: string }`
  - Bypass: `forceDangerous === true` AND `settings.requireActionConfirmation === false`
- Wired into:
  - `POST /system/exec/run` — checks command before runCommand
  - `POST /system/os/send-keys` — checks keys string
  - `POST /system/os/type-text` — checks text string
  - `POST /chat/command /run handler` — blocks before proposing AgentAction
  - Returns HTTP 403 `{ success: false, reason, blocked: true }` on block
  - Every block → thoughtLog level='error', category='security'

## AppSettings additions (Phase 6)
```typescript
speakReplies:              boolean;   // default false
enableWebSearch:           boolean;   // default false
strictLocalMode:           boolean;   // default false
adaptiveForegroundProfiles: boolean;  // default true
ttsVoice:                  string;    // default "en_US-libritts_r-medium"
```

## New dependencies installed
| Package | Used for |
|---------|----------|
| `hnswlib-node` | HNSW vector index for RAG (native addon, built on install) |
| `pdf-parse` | PDF text extraction for RAG ingest |
| `mammoth` | DOCX text extraction for RAG ingest |
| `cheerio` | HTML parsing for web scraper fallback |

## Verification

```
pnpm -r typecheck               → Done (0 errors, both packages)
pnpm --filter localai-control-center build → ✓ built in 2.89s
pnpm --filter api-server dev    → GET /api/healthz = {"status":"ok"}
```

## Files modified / created in Phase 6

| File | Status |
|------|--------|
| `artifacts/api-server/sidecars/stt-server.py` | created |
| `artifacts/api-server/src/lib/command-sanitizer.ts` | created |
| `artifacts/api-server/src/lib/foreground-watcher.ts` | created |
| `artifacts/api-server/src/lib/rag.ts` | created |
| `artifacts/api-server/src/lib/thought-log.ts` | modified (added security, rag, stt, tts, web categories) |
| `artifacts/api-server/src/lib/secure-config.ts` | modified (5 new AppSettings fields) |
| `artifacts/api-server/src/routes/stt.ts` | created |
| `artifacts/api-server/src/routes/tts.ts` | created |
| `artifacts/api-server/src/routes/rag.ts` | created |
| `artifacts/api-server/src/routes/web.ts` | created |
| `artifacts/api-server/src/routes/index.ts` | modified (stt, tts, rag, web registered) |
| `artifacts/api-server/src/routes/chat.ts` | modified (isDangerousCommand from sanitizer, /pin, /web, /run sanitizer, RAG context in stream) |
| `artifacts/api-server/src/routes/system.ts` | modified (isDangerousCommand on exec/run, os/send-keys, os/type-text) |
| `artifacts/api-server/src/app.ts` | modified (STT sidecar spawn, foreground watcher, strict local mode fetch patch) |
| `artifacts/api-server/package.json` | modified (hnswlib-node, pdf-parse, mammoth, cheerio) |
| `artifacts/localai-control-center/src/api.ts` | modified (stt, tts, ragApi, webSearch namespaces) |
| `artifacts/localai-control-center/src/pages/Chat.tsx` | modified (mic button, screenshot button, drag-drop, TTS playback, drag overlay) |
| `artifacts/localai-control-center/src/pages/SettingsPage.tsx` | modified (Voice & Speech, Web & Privacy sections) |
| `PHASE_6_REPORT.md` | created |

## Deferred to Phase 7
- Piper voice model auto-download script
- SearxNG docker-compose one-click setup in Integrations page
- RAG UI panel (collection browser, ingest file picker) — endpoints exist; UI deferred
- Foreground watcher process name → preset mapping editable in Settings UI
- `POST /system/exec/file` and `/exec/self-heal` command sanitizer (file content scan deferred)
