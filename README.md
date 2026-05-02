# LocalAI Control Center

A fully local AI workstation running entirely on your hardware.
No cloud required. No API keys. No data leaves the machine.

Optional API/cloud providers can be configured later from Settings, but they are disabled or not configured by default. Ollama and the local OpenAI-compatible gateway remain the default path, and private file/RAG data, credentials, and secrets are blocked from cloud provider use by policy.

---

## Quick Start

### Prerequisites

| Requirement | Minimum | Notes |
| ----------- | ------- | ----- |
| OS | Windows 11 | PowerShell 5.1+ required for OS interop features |
| Node.js | 20.x LTS | 22.22.0+ recommended for browser automation |
| pnpm | 9.x | `npm i -g pnpm` |
| Ollama | Latest | Must be running on `127.0.0.1:11434` |
| Python | 3.10+ | Optional — required for faster-whisper STT sidecar |
| Piper TTS | Any | Optional — `winget install piper-tts` for voice output |

### Install and run

```powershell
# Install all dependencies (both packages)
pnpm install

# Start the backend API server (port 3001)
pnpm --filter api-server dev

# In a second terminal: start the frontend (port 5173)
pnpm --filter localai-control-center dev
```

Open `http://127.0.0.1:5173` in your browser.

### Packaging, backup, and disaster recovery

LOCALAI is packaged for manual, gaming-PC-safe startup. It does not auto-install
services, enable startup tasks, open firewall ports, or modify PATH globally by
default. Use optional edge nodes for always-on workloads instead of assuming the
gaming PC is a server.

Phase 21 recovery commands are local-first helpers:

```powershell
pnpm run health:check
pnpm run backup:config
pnpm run restore:config:dry-run
pnpm run gaming-mode
pnpm run emergency-stop
```

Backups create a metadata-only recovery manifest for the SQLite DB, app settings,
integration config references, prompt/context docs, generated workflow/template
metadata, and model role metadata. Raw secrets, credentials, private backup
contents, and model blobs are excluded by default. Restore remains dry-run and
approval-gated: a current-state backup manifest is required before any restore
proposal, and destructive restore execution is not configured by default.

### Pull the model stack (first run)

In the Chat page, type these slash commands one at a time:

```text
/install llama3.1:8b
/install qwen2.5-coder:7b
/install nomic-embed-text
```

For the full model stack see [Model Stack](#model-stack) below.

---

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────┐
│  React 19 + Vite 7 + Tailwind v4  (port 5173)          │
│  Wouter routing · React Query (retry:0) · lucide-react  │
└───────────────────┬─────────────────────────────────────┘
                    │  REST + SSE  (/api/*)
┌───────────────────▼─────────────────────────────────────┐
│  Express 5 API server  (port 3001)                      │
│  26 route modules · Drizzle ORM · better-sqlite3        │
│  SQLite at ~/LocalAI-Tools/localai.db                   │
├──────────────────────────────────────────────────────────┤
│  hnswlib-node HNSW vectors  │  faster-whisper sidecar   │
│  (RAG, port-free)           │  (STT, port 3021)         │
└──────────────┬───────────────────────────────────────────┘
               │  HTTP
┌──────────────▼──────┐   ┌──────────────────────────────┐
│  Ollama  :11434      │   │  SearxNG (opt) :8888         │
│  Model inference     │   │  DuckDuckGo fallback scraper │
└─────────────────────┘   └──────────────────────────────┘
```

### Local-first provider policy

LOCALAI runs normally with no API keys installed. Provider policy is exposed in Settings and through `/api/provider-policy`:

- local providers are the default and cost `$0`
- Ollama remains the default model provider
- optional cloud/API providers require explicit configuration and approval
- secrets, credentials, and private file/RAG context are not sent to cloud providers by default
- provider connection tests in the current phase are policy checks and do not require network access

**Phase reports** document every capability in detail:
`PHASE_0_REPORT.md` through `PHASE_7_REPORT.md` in the repo root.

---

## Model Stack

All model names are defined in one file:
`artifacts/api-server/src/config/models.config.ts`

| Role | Model | VRAM |
| ---- | ----- | ---- |
| reasoning | deepseek-v3-16b | ~10 GB |
| chat | llama3.1:8b | ~5 GB |
| deep-reasoning | deepseek-r1-distill-qwen-14b | ~9 GB |
| primary-coding | qwen3-coder:30b | ~19 GB MoE |
| fast-coding | qwen2.5-coder:7b | ~4.5 GB |
| autocomplete | qwen2.5-coder:1.5b | ~1 GB |
| vision | llava:v1.6 | ~12 GB |
| stt | faster-whisper-large-v3 | ~3 GB |
| imagegen | flux.1-schnell | ~8 GB |
| embedding | nomic-embed-text | ~274 MB |

VRAM is probed at runtime via `hardware-probe.ts`. The VRAM Guard automatically
refuses to load a model that would exceed available GPU memory.

---

## What the AI Can Do

### Slash commands (Chat page)

| Command | Description |
| ------- | ----------- |
| `/install <model>` | Pull a model from Ollama registry |
| `/stop <model>` | Unload a model from VRAM |
| `/models` | List all locally installed models |
| `/status` | Show Ollama status, VRAM guard, running models |
| `/hardware` | Display GPU / CPU / RAM / Disk / OS info |
| `/models-catalog` | Browse top 10 recommended models |
| `/index` | Refresh the code-context index for open workspaces |
| `/edit <path>` | Propose a file edit (requires agent permission) |
| `/run <command>` | Propose a shell command (requires agent permission) |
| `/refactor <request>` | Plan and execute a multi-file refactor |
| `/rollback <path>` | Revert a file to its last backup snapshot |
| `/pin <text>` | Save text to personal-memory RAG collection |
| `/web <query>` | Web search via SearxNG or DuckDuckGo |
| `/help` | Show all commands |

### Agent actions (agentAction cards in Chat)

The supervisor agent classifies every message and may emit one of these action cards
for user approval:

| Action | Description |
| ------ | ----------- |
| `propose_edit` | Edit a file via read → LLM patch → write → verify |
| `propose_command` | Run a shell command with output streamed into the card |
| `propose_refactor` | Multi-file refactor via `intelligence.planRefactor` |
| `propose_self_heal` | Auto-fix loop: up to 3 LLM attempts on typecheck errors |

All actions require user approval unless `requireActionConfirmation` is disabled.
Dangerous shell commands are blocked by the command sanitizer (20 block-list patterns).

### Studio presets

Studios page offers purpose-built AI workflows:

| Preset | Models used | Description |
| ------ | ----------- | ----------- |
| coding | qwen2.5-coder:7b + qwen2.5-coder:1.5b | Autocomplete + multi-file edit |
| cad | llava:v1.6 + deepseek-v3-16b | OpenSCAD generation from natural language |
| 3d-print-slicer | llama3.1:8b | Cura profile recommendations |
| laser-engrave | llama3.1:8b | LightBurn settings guidance |
| imagegen | flux.1-schnell | Local image generation |

### Vision

- Drag and drop any image onto the Chat input area
- Click the **Camera** button to screenshot the active window and attach it
- Images are sent to `llava:v1.6` via Ollama's multimodal API

### Voice

- **STT**: Click the **Mic** button — speech is recorded as WebM, sent to the
  faster-whisper Python sidecar, and the transcript populates the chat input
- **TTS**: Enable "Speak replies" in Settings → Voice — assistant replies are
  read aloud by Piper TTS after each streaming response completes

### RAG (Retrieval-Augmented Generation)

- **Personal memory**: Use `/pin <text>` to store notes that are automatically
  retrieved and injected into future chat context
- **File ingest**: `POST /api/rag/ingest` accepts PDF, DOCX, TXT, MD, and code files
- **Collections**: Manage collections in Settings → RAG
- Embeddings use `nomic-embed-text` via Ollama; vector index via `hnswlib-node`

### Web Search

- Enable in Settings → Voice → "Enable web search"
- `/web <query>` searches SearxNG (if running on `127.0.0.1:8888`) or falls back
  to DuckDuckGo HTML scraping via `cheerio`
- `POST /api/web/fetch { url }` strips HTML noise and returns plain text (capped 20 KB)

### Multi-file Refactor (Golden Thread)

1. Type a natural language refactor request in Chat
2. Supervisor classifies as `coding` and emits `propose_refactor`
3. Approve → `intelligence.planRefactor` returns a `RefactorPlan` with impacted files
4. Approve execute → `executeRefactorPlan` loops per file:
   - `applyReadWriteVerify`: read → LLM patch → write → `tsc --noEmit`
   - Auto-rollback if typecheck fails (`.bak` snapshot restored)
5. If errors remain → `propose_self_heal` fires up to 3 LLM fix attempts
6. Every file edit is written to `audit_log` with `old_hash`, `new_hash`, `backup_path`
7. Rollback any file via the Audit tab or `/rollback <path>`

---

## Safety

### Sandbox boundaries

The AI **cannot**:

- Make outbound network requests when Strict Local Mode is enabled
- Execute shell commands without user approval (toggle in Settings → Agent Permissions)
- Apply file edits without user approval

The AI **can** (when permitted):

- Read any file on the local filesystem
- Write files with user confirmation
- Run shell commands with user confirmation
- Browse the web when web search is enabled

### Command sanitizer

Every shell command proposed by the agent passes through `command-sanitizer.ts`
before reaching the user. Blocked patterns include:

`rm -rf /`, `format C:`, `Remove-Item -Recurse -Force`, `shutdown`, `reg delete HKLM`,
`cipher /w`, `net user /delete`, `takeown /f C:\`, `icacls Everyone:F /T`, `mkfs`,
`dd if=`, fork bombs, `poweroff`, `reboot`, `curl|bash`, `wget|sh`,
`dropdb`, `DROP DATABASE`, `TRUNCATE TABLE`

Blocked commands return HTTP 403 and are logged to the Thought Log at level `error`.

### Strict Local Mode

Toggle in Settings → Remote → "Strict Local Mode".
When active, `globalThis.fetch` is patched to block all outbound requests to
non-loopback addresses. Only `127.0.0.1`, `localhost`, `::1`, `0.0.0.0`, and
Tailscale addresses (`100.x.x.x`) are allowed. Blocked fetches are logged.

### Rollback

Every file modified by the agent is backed up with `snapshot-manager.ts`:

- Backup written to `<originalPath>.bak` before any write
- `GET /api/rollback/backups/:filePath` — list snapshots for a file
- `POST /api/rollback/rollback` — restore a specific snapshot
- Audit tab in Operations page shows all edits with rollback buttons

---

## Troubleshooting

### "Ollama not running" in the sidebar

The sidebar shows an **offline** / red dot when Ollama isn't reachable at `127.0.0.1:11434`.

1. Start Ollama: run `ollama serve` in a terminal
2. Wait ~5 seconds for the heartbeat to recover
3. If Ollama is on a non-default port, set `OLLAMA_HOST` env var before starting the API server

The app will never crash when Ollama is down — all model calls degrade gracefully.

### Python sidecar missing (STT unavailable)

The Thought Log will show: *"STT unavailable: Python 3.10+ not found"*

1. Install Python 3.10+: `winget install Python.Python.3.11`
2. Install faster-whisper: `pip install faster-whisper fastapi uvicorn`
3. Restart the API server — it re-probes `python --version` on boot

### VRAM exceeded

The VRAM Guard checks free GPU memory before loading any model.
If a model is too large it will be rejected with a clear error in the Thought Log.

Options:

- Stop another model first: `/stop <model-name>`
- Use a smaller model variant (e.g. `qwen2.5-coder:7b` instead of `:30b`)
- Set `maxConcurrentModels: 1` in Settings → Models

### OpenSCAD not found (CAD studio)

The CAD pipeline calls `openscad` from PATH.

1. Install OpenSCAD: `winget install OpenSCAD.OpenSCAD`
2. Restart the API server (PATH is read on boot)

### Piper TTS not working

1. Install Piper: `winget install piper-tts`
2. Download a voice model to `~/LocalAI-Tools/tts/voices/<name>.onnx`
3. Set the voice name in Settings → Voice → TTS voice
4. Check `GET /api/tts/status` for diagnostics

### SearxNG not found (web search falls back to DuckDuckGo)

Web search falls back to DuckDuckGo HTML scraping automatically.
To run SearxNG locally for better results:

```bash
docker run -d -p 8888:8080 searxng/searxng
```
