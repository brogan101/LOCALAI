# Jarvis Control Center

> A fully local AI operating layer built on top of [LOCALAI](https://github.com/brogan101/LOCALAI).  
> No cloud required. No API keys. No data leaves the machine by default.

Jarvis extends LOCALAI into a comprehensive local-first AI workstation with expert-grade specialist modes, approval-gated automation, and a full suite of safety controls — all running on your own hardware with Ollama as the default model provider.

---

## Features

### Core Platform
- **Local-first provider policy** — Ollama is the default; optional cloud/API providers require explicit configuration and approval
- **Gaming-PC safe** — runtime modes (Lightweight, Coding, Gaming, Emergency Stop) throttle or pause heavy services on demand
- **Approval queue** — every powerful action (file edits, shell commands, model changes, physical actions) goes through an auditable approval gate with permission tiers
- **Mission replay & observability** — full audit log with redacted replay, local evals, and thought-log visibility
- **Model lifecycle manager** — approval-gated pull/load/unload/replace; replacement requires eval proof before retirement
- **Self-updating maintainer** — dry-run/proposal-first update radar; no auto-merge, no blind updates

### Expert Specialist Modes
| Mode | Phase | Description |
|---|---|---|
| **Master Tech** | 18 | Automotive diagnostics with Foxbody/LQ4/4L80E/ACES profile, DTC intake, test-before-parts planning |
| **Master Fabricator** | 13A–D | FreeCAD MCP, CAD-as-code (CadQuery/build123d/OpenSCAD), KiCad, 3D print, CNC/laser/CAM |
| **Master Network Architect** | 15A–B | HomeLab source-of-truth, VLAN/subnet/device inventory, validate-before-apply config pipeline |
| **Home SOC Analyst** | 16 | Security monitoring, alert analysis, approval-gated remediation |
| **Project Foreman** | 17A–B | Digital Twin, inventory/parts, project-to-reality pipeline |
| **Maintainer** | 6, 22 | Self-update radar + local AI self-build workflow (Ollama-powered) |
| **UI Custodian** | 20 | Style-guard enforced on every UI phase; no redesigns |

### Automation & Agents
- **Browser automation** — Playwright MCP (optional); credential/anti-bot/cookie actions permanently hard-blocked
- **Desktop automation** — WorldGUI (optional); keylogger/sensitive-screenshot permanently hard-blocked
- **Chat-driven code modification** — approval-gated diff/test/apply workflow; self-modification permanently hard-blocked
- **MCP tool firewall** — fail-closed registry; Docker MCP Gateway and OpenClaw/NemoClaw safety-wrapped
- **Voice & meeting** — push-to-talk default; no always-on capture; approval-gated follow-up sends

### Knowledge & Memory
- **Evidence Vault** — manuals, receipts, warranties, vehicle records, build logs (Paperless-ngx optional)
- **Professional RAG** — hnswlib default, optional LanceDB/Qdrant; hash-based incremental re-indexing
- **Digital Twin** — local relationship graph linking home/shop/network/vehicles/tools/projects
- **Inventory pipeline** — parts, materials, spools, assets linked to project-to-reality workflows

### Physical Systems (Proposal-only, Approval-gated)
- **Edge nodes & Home Assistant** — entity allowlist, MQTT topic allowlist, camera capture permanently blocked
- **HomeLab** — 18-route network inventory, config generation, validation, apply (blocked until approved + providers configured)
- **Automotive diagnostics** — OBD/CAN/ECU provider surfaces; all hardware actions `not_configured` or `manual_only`
- **Robotics Lab** — ROS 2/MoveIt 2/Nav2/Gazebo planning surface; `execute_motion`/`navigate` permanently blocked
- **Maker Studio** — FreeCAD/slicer/printer/CNC/laser safety console; all machine execution `manual_only` or `approval_required`
- **Packaging & DR** — gaming-PC-safe backup manifests, restore dry-run, approval-gated recovery

---

## Quick Start

### Prerequisites

| Requirement | Minimum | Notes |
|---|---|---|
| OS | Windows 11 | PowerShell 5.1+ for OS interop features |
| Node.js | 20.x LTS | 22.22.0+ recommended for browser automation |
| pnpm | 9.x | `npm i -g pnpm` |
| Ollama | Latest | Running on `127.0.0.1:11434` |
| Python | 3.10+ | Optional — faster-whisper STT sidecar |
| Piper TTS | Any | Optional — `winget install piper-tts` |

### Install

```powershell
git clone https://github.com/brogan101/LOCALAI.git
cd LOCALAI

pnpm install
```

### Run

```powershell
# Backend API (port 3001)
pnpm --filter api-server dev

# Frontend (port 5173) — in a second terminal
pnpm --filter localai-control-center dev
```

Open `http://127.0.0.1:5173` in your browser.

### Windows launcher (optional)

```powershell
.\LAUNCH_OS.ps1    # starts API + UI in separate windows
```

### First models

In the Chat page, pull your model stack one at a time:

```text
/install llama3.1:8b
/install qwen2.5-coder:7b
/install nomic-embed-text
```

---

## Architecture

```text
┌──────────────────────────────────────────────────────────┐
│  React 19 + Vite 7 + Tailwind v4  (port 5173)           │
│  Wouter · React Query · lucide-react · StatusBadges      │
└───────────────────┬──────────────────────────────────────┘
                    │  REST + SSE  (/api/*)
┌───────────────────▼──────────────────────────────────────┐
│  Express 5 TypeScript API  (port 3001)                   │
│  34+ route modules · Drizzle ORM · better-sqlite3        │
│  SQLite at ~/LocalAI-Tools/localai.db                    │
│                                                          │
│  Approval queue · Tool firewall · Audit log              │
│  Mission replay · Thought log · Durable jobs             │
│  VRAM guard · Runtime modes · Permission tiers           │
├──────────────────────────────────────────────────────────┤
│  hnswlib-node HNSW vectors  │  faster-whisper sidecar   │
│  (RAG, port-free)           │  (STT, port 3021)         │
└──────────────┬───────────────────────────────────────────┘
               │  HTTP
┌──────────────▼──────┐  ┌───────────────────────────────┐
│  Ollama  :11434      │  │  SearxNG (opt) :8888          │
│  Local model infer   │  │  DuckDuckGo fallback          │
└─────────────────────┘  └───────────────────────────────┘
```

All model inference is local-first via Ollama. Optional cloud/API providers require explicit configuration in Settings and are disabled by default.

---

## Model Stack

Model roles are defined in `artifacts/api-server/src/config/models.config.ts`.

| Role | Suggested model | VRAM |
|---|---|---|
| reasoning | `deepseek-v3-16b` | ~10 GB |
| chat | `llama3.1:8b` | ~5 GB |
| deep-reasoning | `deepseek-r1-distill-qwen-14b` | ~9 GB |
| primary-coding | `qwen3-coder:30b` | ~19 GB MoE |
| fast-coding | `qwen2.5-coder:7b` | ~4.5 GB |
| autocomplete | `qwen2.5-coder:1.5b` | ~1 GB |
| vision | `llava:v1.6` | ~12 GB |
| embedding | `nomic-embed-text` | ~274 MB |

VRAM is probed at runtime. The VRAM Guard blocks any model that would exceed available GPU memory.

---

## Safety System

All dangerous actions are governed by a layered safety contract. Key hard limits are **TypeScript literal types** — not runtime checks — making them structurally impossible to override:

| Limit | Enforced as |
|---|---|
| `selfModificationAllowed: false` | TypeScript literal type |
| `cloudEscalationEnabled: false` | TypeScript literal type |
| `requireApprovalForEdits: true` | TypeScript literal type |
| `physicalHardwarePresent: false` | TypeScript literal type (robotics) |
| `executed: false` | TypeScript literal type (all action evaluators) |
| Camera frame capture | Permanently blocked (`BLOCKED_HOME_ACTIONS` Set) |
| Credential entry / keylogging | Permanently blocked (browser + desktop automation) |
| `execute_motion` / `navigate` | Permanently blocked (robotics) |
| Direct `main` branch apply | Permanently blocked (self-maintainer) |

### Permission tiers

| Tier | Label | Examples |
|---|---|---|
| T1 | Read-only | File reads, status checks, health probes |
| T2 | Local state | Settings changes, config writes |
| T3 | File modification | Code edits — require diff + rollback metadata |
| T4 | External communication | Email, calendar, browser form submit |
| T5/P5 | Physical / destructive | Always denied by policy |

### Command sanitizer

Every shell command passes through `command-sanitizer.ts`. Blocked patterns include:
`rm -rf /`, `format C:`, `Remove-Item -Recurse`, `shutdown`, `reg delete HKLM`, `DROP DATABASE`, fork bombs, `curl|bash`, and 20+ other destructive patterns.

---

## Slash Commands

| Command | Description |
|---|---|
| `/install <model>` | Pull a model from Ollama |
| `/stop <model>` | Unload a model from VRAM |
| `/models` | List installed models |
| `/status` | Ollama status, VRAM, running models |
| `/hardware` | GPU / CPU / RAM / OS info |
| `/edit <path>` | Propose a file edit (approval required) |
| `/run <command>` | Propose a shell command (approval required) |
| `/refactor <request>` | Plan and execute a multi-file refactor |
| `/rollback <path>` | Revert a file to its last snapshot |
| `/pin <text>` | Save to personal-memory RAG |
| `/web <query>` | Web search (SearxNG or DuckDuckGo) |
| `/help` | Show all commands |

---

## Recovery Commands

```powershell
pnpm run health:check          # system health summary
pnpm run backup:config         # create metadata-only backup manifest
pnpm run restore:config:dry-run  # validate restore without touching data
pnpm run gaming-mode           # switch to Gaming runtime mode
pnpm run emergency-stop        # activate Emergency Stop
```

Backups exclude raw secrets, credentials, and model blobs. Restore is always dry-run / approval-gated. Destructive restore is not configured by default.

---

## Development

### Commands

```powershell
pnpm install              # install all workspace dependencies
pnpm -r typecheck         # TypeScript check (api-server + control-center)
pnpm test                 # full test suite
pnpm --filter localai-control-center build   # production UI build
node scripts/jarvis/verify-build-kit.mjs     # verify build kit integrity
```

### Project structure

```text
artifacts/
  api-server/             Express 5 TypeScript API
    src/
      lib/                Business logic (approval-queue, local-builder, etc.)
      routes/             Route modules (34+)
      db/                 Drizzle schema + migrations
    tests/                Test suites (one per lib module)
  localai-control-center/ React 19 + Vite 7 frontend
    src/
      pages/              Page components (one per route)
      components/         Shared components (StatusBadges, etc.)
      api.ts              Typed API client
    tests/                UI/SSR test suites
docs/
  JARVIS_*.md             Implementation control documents
  context-packs/          Compact context for local AI models
phase-prompts/            One prompt per development phase
scripts/
  jarvis/                 Build-kit verifier scripts
  *.mjs                   Recovery / maintenance helper scripts
```

### Adding a new phase

1. Read `docs/JARVIS_PHASE_MAP.md` to find the next incomplete phase
2. Run `node scripts/jarvis/verify-build-kit.mjs` first
3. Implement one phase only — do not batch phases
4. Update `docs/JARVIS_IMPLEMENTATION_LEDGER.md`, `docs/JARVIS_PHASE_MAP.md`, `docs/JARVIS_BLOCKERS.md`, `docs/JARVIS_TEST_MATRIX.md`, `docs/JARVIS_LOCAL_AI_HANDOFF.md`
5. Run `pnpm -r typecheck && pnpm test && pnpm --filter localai-control-center build`

See `docs/JARVIS_CONTEXT_INDEX.md` for the full file/route/lib ownership map.

---

## Troubleshooting

### Ollama offline

Start Ollama: `ollama serve`  
The app degrades gracefully when Ollama is unreachable — it never crashes.

### STT unavailable (Python sidecar missing)

```powershell
winget install Python.Python.3.11
pip install faster-whisper fastapi uvicorn
# Restart the API server
```

### VRAM exceeded

Stop a model first: `/stop <model-name>`  
Or use a smaller variant (e.g. `qwen2.5-coder:7b` instead of `:30b`).

### Build fails after pulling

```powershell
pnpm install --frozen-lockfile
pnpm -r typecheck
```

---

## Internal Documentation

The `docs/` directory contains the full Jarvis build system:

| File | Purpose |
|---|---|
| `JARVIS_IMPLEMENTATION_LEDGER.md` | Phase-by-phase implementation history |
| `JARVIS_PHASE_MAP.md` | Phase sequence and completion status |
| `JARVIS_BLOCKERS.md` | Active and resolved blockers |
| `JARVIS_TEST_MATRIX.md` | Test coverage per phase |
| `JARVIS_LOCAL_AI_HANDOFF.md` | Compact handoff for local AI models |
| `JARVIS_REQUIREMENTS_TRACEABILITY.md` | Requirements vs. implementation |
| `JARVIS_EXPERT_MODES.md` | Expert mode contracts |
| `JARVIS_EXTERNAL_PROJECT_WATCHLIST.md` | External project integration status |
| `JARVIS_UI_STYLE_GUARD.md` | UI consistency rules |
| `context-packs/` | Compact context docs for local Ollama models |

---

## License

This project builds on [brogan101/LOCALAI](https://github.com/brogan101/LOCALAI).  
Use at your own risk. No warranty is provided. All physical system integrations are proposal-only and require explicit human approval before any action is taken.
