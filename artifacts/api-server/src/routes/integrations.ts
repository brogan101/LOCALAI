import { Router } from "express";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";
import {
  commandExists,
  maybeVersion,
  fetchText,
  isWindows,
  toolsRoot,
  ensureDir,
} from "../lib/runtime.js";
import { writeManagedJson } from "../lib/snapshot-manager.js";
import { agentExecGuard } from "../lib/route-guards.js";
import { recordAuditEvent, upsertIntegrationState } from "../lib/platform-foundation.js";
import {
  evaluateToolCall,
  integrationSourceToTool,
  type ToolCallResult,
  type ToolIntegrationSource,
  type ToolPermissionScope,
} from "../lib/tool-registry.js";

const router = Router();
const TOOLS_DIR = toolsRoot();
const INTEGRATIONS_STATE_FILE = path.join(TOOLS_DIR, "integrations-state.json");

interface Integration {
  id: string;
  name: string;
  repo: string;
  category: string;
  description: string;
  installMethod: string;
  pipPackage?: string;
  wingetId?: string;
  packageId?: string;
  localPort?: number;
  healthUrl?: string;
  localAiConfig?: Record<string, unknown>;
  aiderTip?: string;
  usedFor: string;
  docs: string;
  installCmd: string;
  startCmd: string;
  updateCmd: string;
  detect: () => Promise<boolean>;
  version: () => Promise<string | null>;
  running: () => Promise<boolean>;
}

export interface IntegrationListEntry extends ToolIntegrationSource {
  localAiConfig?: Record<string, unknown>;
  aiderTip?: string;
}

const INTEGRATIONS: Integration[] = [
  {
    id: "open-webui", name: "Open WebUI", repo: "https://github.com/open-webui/open-webui", category: "core",
    description: "Polished browser-first chat interface for any local or remote LLM. Supports RAG, tools, model management, and collaborative workspaces.",
    installMethod: "pip", pipPackage: "open-webui", localPort: 8080, healthUrl: "http://127.0.0.1:8080",
    detect: async () => commandExists("open-webui"),
    version: async () => maybeVersion("open-webui --version"),
    running: async () => fetchText("http://127.0.0.1:8080", undefined, 2500).then(() => true).catch(() => false),
    installCmd: "pip install open-webui",
    startCmd: isWindows ? 'start "Open WebUI" cmd /k "open-webui serve"' : "open-webui serve",
    updateCmd: "pip install --upgrade open-webui",
    docs: "https://docs.openwebui.com", usedFor: "Main chat UI, RAG, model management, team workspaces",
    localAiConfig: {
      openAiApiBaseUrl: "http://127.0.0.1:3001/v1",
      openAiApiKey: "localai",
      supportedEndpoints: ["/v1/models", "/v1/chat/completions", "/v1/embeddings", "/v1/responses"],
    },
  },
  {
    id: "open-webui-pipelines", name: "Open WebUI Pipelines", repo: "https://github.com/open-webui/pipelines", category: "core",
    description: "Workflow and pipeline engine for Open WebUI — RAG pipelines, function calling, agent chains, and custom tools exposed as callable endpoints.",
    installMethod: "pip", pipPackage: "open-webui-pipelines", localPort: 9099, healthUrl: "http://127.0.0.1:9099",
    detect: async () => fetchText("http://127.0.0.1:9099", undefined, 2000).then(() => true).catch(() => false),
    version: async () => null,
    running: async () => fetchText("http://127.0.0.1:9099", undefined, 2000).then(() => true).catch(() => false),
    installCmd: "pip install open-webui-pipelines",
    startCmd: "uvicorn main:app --host 0.0.0.0 --port 9099",
    updateCmd: "pip install --upgrade open-webui-pipelines",
    docs: "https://github.com/open-webui/pipelines", usedFor: "Visual workflow builder, RAG pipelines, custom tool endpoints",
  },
  {
    id: "litellm", name: "LiteLLM Gateway", repo: "https://github.com/BerriAI/litellm", category: "core",
    description: `OpenAI-compatible proxy that unifies all your local and remote models under one endpoint. Enables model aliases, fallbacks, load balancing, and cost tracking. Fixes Aider's "LLM Provider NOT provided" error.`,
    installMethod: "pip", pipPackage: "litellm[proxy]", localPort: 4000, healthUrl: "http://127.0.0.1:4000/health",
    detect: async () => commandExists("litellm"),
    version: async () => maybeVersion("litellm --version"),
    running: async () => fetchText("http://127.0.0.1:4000/health", undefined, 2000).then(() => true).catch(() => false),
    installCmd: 'pip install "litellm[proxy]"',
    startCmd: isWindows ? `start "LiteLLM" cmd /k "litellm --model ollama/qwen2.5-coder:7b --port 4000"` : "litellm --model ollama/qwen2.5-coder:7b --port 4000",
    updateCmd: 'pip install --upgrade "litellm[proxy]"',
    docs: "https://docs.litellm.ai", usedFor: "Unified model gateway, Aider integration, Continue integration, cost tracking",
    aiderTip: "Direct LocalAI endpoint: aider --model openai/<model-name> --openai-api-base http://127.0.0.1:3001/v1 --openai-api-key localai",
    localAiConfig: {
      directBaseUrl: "http://127.0.0.1:3001/v1",
      proxyBaseUrl: "http://127.0.0.1:4000",
      exampleCommand: "litellm --model openai/qwen2.5-coder:7b --api_base http://127.0.0.1:3001/v1 --api_key localai --port 4000",
    },
  },
  {
    id: "mcpo", name: "MCPO (MCP→OpenAPI)", repo: "https://github.com/open-webui/mcpo", category: "core",
    description: "Exposes MCP (Model Context Protocol) tool servers as OpenAPI REST endpoints. Bridges Claude's tool ecosystem into Open WebUI and LiteLLM.",
    installMethod: "pip", pipPackage: "mcpo", localPort: 8200, healthUrl: "http://127.0.0.1:8200",
    detect: async () => commandExists("mcpo"),
    version: async () => null,
    running: async () => fetchText("http://127.0.0.1:8200", undefined, 2000).then(() => true).catch(() => false),
    installCmd: "pip install mcpo", startCmd: "mcpo --port 8200", updateCmd: "pip install --upgrade mcpo",
    docs: "https://github.com/open-webui/mcpo", usedFor: "Expose MCP tools to Open WebUI and LiteLLM as callable REST endpoints",
  },
  {
    id: "aider", name: "Aider", repo: "https://github.com/Aider-AI/aider", category: "coding",
    description: "High-agency AI coding assistant that edits your repo files directly. Supports architect/ask/code modes, git integration, auto-linting, and multi-file edits. Use with LiteLLM to fix the model provider error.",
    installMethod: "pip", pipPackage: "aider-chat",
    detect: async () => commandExists("aider"),
    version: async () => maybeVersion("aider --version"),
    running: async () => false,
    installCmd: "pip install aider-chat", startCmd: "aider", updateCmd: "pip install --upgrade aider-chat",
    docs: "https://aider.chat/docs", usedFor: "Repo-level code editing, architect mode, multi-file changes",
    localAiConfig: {
      baseUrl: "http://127.0.0.1:3001/v1",
      apiKey: "localai",
      exampleCommand: "aider --model openai/qwen2.5-coder:7b --openai-api-base http://127.0.0.1:3001/v1 --openai-api-key localai",
    },
  },
  {
    id: "continue", name: "Continue (VS Code)", repo: "https://github.com/continuedev/continue", category: "coding",
    description: "Best VS Code AI coding extension. Inline completions, chat sidebar, codebase context, and rules files. Managed from the Continue page in this app.",
    installMethod: "vscode",
    detect: async () => existsSync(path.join(os.homedir(), ".continue")),
    version: async () => null,
    running: async () => false,
    installCmd: "code --install-extension Continue.continue", startCmd: "", updateCmd: "code --install-extension Continue.continue",
    docs: "https://docs.continue.dev", usedFor: "VS Code inline completions, codebase chat, rule packs",
    localAiConfig: {
      provider: "openai",
      apiBase: "http://127.0.0.1:3001/v1",
      apiKey: "localai",
      modelsEndpoint: "http://127.0.0.1:3001/v1/models",
    },
  },
  {
    id: "freecad", name: "FreeCAD", repo: "https://github.com/FreeCAD/FreeCAD", category: "maker",
    description: "Parametric CAD workbench. Phase 13B exposes proposal/status surfaces only; no FreeCAD or macro execution is wired here.",
    installMethod: "manual",
    detect: async () => commandExists("freecad") || commandExists("FreeCAD"),
    version: async () => maybeVersion("freecad --version"),
    running: async () => false,
    installCmd: "manual install only", startCmd: "", updateCmd: "",
    docs: "https://wiki.freecad.org", usedFor: "FreeCAD MCP/command profile status and future approval-gated local CAD review",
  },
  {
    id: "cadquery-build123d", name: "CadQuery / build123d", repo: "https://github.com/CadQuery/cadquery", category: "maker",
    description: "CAD-as-code libraries. Phase 13B creates review-only proposal metadata; no Python CAD runtime is executed.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "manual install only", startCmd: "", updateCmd: "",
    docs: "https://cadquery.readthedocs.io", usedFor: "Future local CAD-as-code generation after explicit configuration",
  },
  {
    id: "kicad", name: "KiCad", repo: "https://gitlab.com/kicad/code/kicad", category: "maker",
    description: "Electronics CAD suite. Phase 13B supports disabled/not_configured adapter status and project-link proposals only.",
    installMethod: "manual",
    detect: async () => commandExists("kicad-cli") || commandExists("kicad"),
    version: async () => maybeVersion("kicad-cli version"),
    running: async () => false,
    installCmd: "manual install only", startCmd: "", updateCmd: "",
    docs: "https://docs.kicad.org", usedFor: "Future schematic/PCB metadata workflows after explicit configuration",
  },
  {
    id: "gnucleus-text-to-cad", name: "gNucleus Text-to-CAD MCP", repo: "https://github.com/gNucleus/text-to-cad-mcp", category: "maker",
    description: "Optional cloud/API text-to-CAD provider. Disabled by default; requires explicit configuration, data classification, and approval before any data leaves the machine.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "manual configure only", startCmd: "", updateCmd: "",
    docs: "https://github.com/gNucleus/text-to-cad-mcp", usedFor: "Future optional text-to-CAD cloud workflow after explicit approval",
  },
  {
    id: "buildcad-ai", name: "BuildCAD AI", repo: "https://buildcad.ai", category: "maker",
    description: "Optional cloud/account text or image-to-CAD provider. Disabled by default and never used by LOCALAI without explicit configuration and approval.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "manual configure only", startCmd: "", updateCmd: "",
    docs: "https://buildcad.ai", usedFor: "Future optional cloud CAD generation with data-leaves-machine warning",
  },
  {
    id: "orca-prusa-superslicer", name: "OrcaSlicer / PrusaSlicer / SuperSlicer", repo: "https://github.com/SoftFever/OrcaSlicer", category: "maker",
    description: "Slicer family for 3D-print preparation. Phase 13C exposes dry-run/config-validation proposal status only; no slicer process runs.",
    installMethod: "manual",
    detect: async () => commandExists("orca-slicer") || commandExists("prusa-slicer") || commandExists("superslicer"),
    version: async () => null,
    running: async () => false,
    installCmd: "manual install only", startCmd: "", updateCmd: "",
    docs: "https://github.com/SoftFever/OrcaSlicer/wiki", usedFor: "Phase 13C slicer status and dry-run proposal workflow; no real slicing or G-code generation",
  },
  {
    id: "octoprint", name: "OctoPrint", repo: "https://github.com/OctoPrint/OctoPrint", category: "maker",
    description: "3D printer server. Phase 13C represents queue/start approval proposals only; no files upload and no printer API calls occur.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "manual install only", startCmd: "", updateCmd: "",
    docs: "https://docs.octoprint.org", usedFor: "Phase 13C printer status and approval-required queue/start proposals; execution remains not_configured",
  },
  {
    id: "moonraker-mainsail-fluidd", name: "Moonraker / Mainsail / Fluidd", repo: "https://github.com/Arksine/moonraker", category: "maker",
    description: "Klipper printer API/UI stack. Phase 13C represents printer workflow proposals only; heater/motor commands are approval-gated and no API calls occur.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "manual install only", startCmd: "", updateCmd: "",
    docs: "https://moonraker.readthedocs.io", usedFor: "Phase 13C printer API/profile status and approval-required heater/motor/print proposals",
  },
  {
    id: "obico", name: "Obico", repo: "https://github.com/TheSpaghettiDetective/obico-server", category: "maker",
    description: "3D printer monitoring. Phase 13C reports not_configured/degraded monitoring state only and does not fake failure detection.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "manual install only", startCmd: "", updateCmd: "",
    docs: "https://www.obico.io/docs", usedFor: "Phase 13C monitoring status visibility; no camera, cloud, or Obico API calls by default",
  },
  {
    id: "spoolman", name: "Spoolman", repo: "https://github.com/Donkie/Spoolman", category: "maker",
    description: "Filament inventory tracker. Phase 13C uses local material metadata by default and blocks queue proposals when material is missing/unknown.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "manual install only", startCmd: "", updateCmd: "",
    docs: "https://github.com/Donkie/Spoolman", usedFor: "Phase 13C filament check status; inventory remains unverified until explicitly configured",
  },
  {
    id: "cncjs-linuxcnc-fluidnc", name: "CNCjs / LinuxCNC / FluidNC", repo: "https://github.com/cncjs/cncjs", category: "maker",
    description: "CNC controller ecosystem. Phase 13D exposes safety-console/setup-sheet status only; G-code send, motion, and spindle start are manual-only or blocked.",
    installMethod: "manual",
    detect: async () => commandExists("cncjs") || commandExists("linuxcnc"),
    version: async () => null,
    running: async () => false,
    installCmd: "manual install only", startCmd: "", updateCmd: "",
    docs: "https://cnc.js.org", usedFor: "Phase 13D CNC provider status, setup-sheet proposals, and manual-only dangerous-action gates; no controller/API/serial execution",
  },
  {
    id: "freecad-path-cam", name: "FreeCAD Path / CAM", repo: "https://wiki.freecad.org/Path_Workbench", category: "maker",
    description: "CAM/profile planning surface. Phase 13D creates proposal-only setup sheets and never generates live toolpaths or posts G-code.",
    installMethod: "manual",
    detect: async () => commandExists("freecad") || commandExists("FreeCAD"),
    version: async () => maybeVersion("freecad --version"),
    running: async () => false,
    installCmd: "manual install only", startCmd: "", updateCmd: "",
    docs: "https://wiki.freecad.org/Path_Workbench", usedFor: "Phase 13D CAM setup-sheet metadata and offline simulation status; no CAM execution or G-code output",
  },
  {
    id: "bcnc", name: "bCNC", repo: "https://github.com/vlachoudis/bCNC", category: "maker",
    description: "CNC sender reference. Disabled/not_configured until a later hardware-safe executor phase; Phase 13D never streams G-code.",
    installMethod: "manual",
    detect: async () => commandExists("bcnc"),
    version: async () => null,
    running: async () => false,
    installCmd: "manual install only", startCmd: "", updateCmd: "",
    docs: "https://github.com/vlachoudis/bCNC", usedFor: "Phase 13D sender status only; send/stream/jog remains manual-only",
  },
  {
    id: "lightburn-style-laser", name: "LightBurn-style laser workflow", repo: "https://lightburnsoftware.com", category: "maker",
    description: "Laser planning reference. Phase 13D setup sheets can record power/speed/PPE review, but laser fire, motion, and relay/power control are manual-only.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "manual configure only", startCmd: "", updateCmd: "",
    docs: "https://docs.lightburnsoftware.com", usedFor: "Phase 13D laser setup-sheet metadata and blocked/manual-only laser actions; no laser API/tool execution",
  },
  {
    id: "serial-usb-shop-devices", name: "Serial / USB shop devices", repo: "local hardware profile", category: "maker",
    description: "Serial and USB hardware access profile. Disabled in Phase 13D; no writes, firmware flashing, relay toggles, or bench equipment control occur.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "manual configure only in a later hardware-safe phase", startCmd: "", updateCmd: "",
    docs: "local hardware safety policy", usedFor: "Phase 13D explicit disabled/not_configured state for serial/USB/electronics bench writes",
  },
  {
    id: "inventree", name: "InvenTree", repo: "https://github.com/inventree/InvenTree", category: "maker",
    description: "Parts inventory system. Phase 17B uses local inventory records by default and does not sync external inventory.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "manual install only", startCmd: "", updateCmd: "",
    docs: "https://docs.inventree.org", usedFor: "Phase 17B optional inventory provider status; sync remains not_configured until explicitly approved",
  },
  {
    id: "snipe-it", name: "Snipe-IT", repo: "https://github.com/snipe/snipe-it", category: "maker",
    description: "Asset inventory system. Phase 17B records local asset metadata only; external writes and sync are disabled.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "manual install only", startCmd: "", updateCmd: "",
    docs: "https://snipe-it.readme.io", usedFor: "Phase 17B optional asset provider status; not_configured by default",
  },
  {
    id: "homebox", name: "HomeBox", repo: "https://github.com/sysadminsmedia/homebox", category: "maker",
    description: "Home inventory tracker. Phase 17B can map local inventory concepts without calling HomeBox.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "manual install only", startCmd: "", updateCmd: "",
    docs: "https://homebox.software", usedFor: "Phase 17B optional home inventory provider status; not_configured by default",
  },
  {
    id: "partkeepr", name: "PartKeepr", repo: "https://github.com/partkeepr/PartKeepr", category: "maker",
    description: "Parts inventory tracker. Phase 17B keeps LOCALAI local-first and does not call PartKeepr.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "manual install only", startCmd: "", updateCmd: "",
    docs: "https://github.com/partkeepr/PartKeepr", usedFor: "Phase 17B optional parts provider status; not_configured by default",
  },
  {
    id: "python-obd", name: "python-OBD", repo: "https://github.com/brendan-w/python-OBD", category: "automotive",
    description: "Optional OBD-II adapter library. Phase 18 represents provider status only; no vehicle hardware connection, scan, or clear-code action is executed.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "manual configure only in a later hardware-safe phase", startCmd: "", updateCmd: "",
    docs: "https://github.com/brendan-w/python-OBD", usedFor: "Phase 18 Master Tech provider status and future approval-gated read-only OBD workflows",
  },
  {
    id: "elm327-emulator", name: "ELM327 emulator", repo: "verify current repo before install", category: "automotive",
    description: "Development/test emulator profile. Phase 18 can use sample DTC metadata but does not start emulator processes.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "manual configure only", startCmd: "", updateCmd: "",
    docs: "verify current repo before install", usedFor: "Phase 18 sample/emulator status only; no emulator process or network call",
  },
  {
    id: "savvycan", name: "SavvyCAN", repo: "https://www.savvycan.com/", category: "automotive",
    description: "CAN capture/review tool. Phase 18 keeps CAN capture disabled/not_configured and blocks CAN injection.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "manual install only", startCmd: "", updateCmd: "",
    docs: "https://www.savvycan.com/", usedFor: "Future read-only CAN capture review after explicit configuration; no injection by default",
  },
  {
    id: "ovms", name: "OVMS", repo: "https://github.com/openvehicles/Open-Vehicle-Monitoring-System-3", category: "automotive",
    description: "Optional vehicle telemetry hardware. Phase 18 reports not_configured and does not contact OVMS hardware or APIs.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "manual configure only", startCmd: "", updateCmd: "",
    docs: "https://github.com/openvehicles/Open-Vehicle-Monitoring-System-3", usedFor: "Future vehicle telemetry with approval and privacy review; not configured by default",
  },
  {
    id: "aces-ecu-log-import", name: "ACES ECU log import", repo: "local workspace file import", category: "automotive",
    description: "ACES ECU/log/tuning note import concept. Phase 18 is file/workspace metadata only; ECU writes and tuning changes are blocked.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "manual workspace import only", startCmd: "", updateCmd: "",
    docs: "local vehicle project notes", usedFor: "Phase 18 ACES log/tuning note metadata; no ECU API/tool execution",
  },
  {
    id: "librechat", name: "LibreChat", repo: "https://github.com/danny-avila/LibreChat", category: "chat",
    description: "Advanced self-hosted chat workstation with agents, MCP support, code interpreter, artifacts, multi-model switching, message search, and actions/functions. More powerful than Open WebUI for serious agentic workflows.",
    installMethod: "docker", localPort: 3080, healthUrl: "http://127.0.0.1:3080",
    detect: async () => fetchText("http://127.0.0.1:3080", undefined, 2000).then(() => true).catch(() => false),
    version: async () => null,
    running: async () => fetchText("http://127.0.0.1:3080", undefined, 2000).then(() => true).catch(() => false),
    installCmd: "docker compose up -d  # See https://www.librechat.ai/docs/local",
    startCmd: "docker compose up -d", updateCmd: "docker compose pull && docker compose up -d",
    docs: "https://www.librechat.ai/docs", usedFor: "Agents, MCP tools, artifacts, code interpreter, serious agentic work",
  },
  {
    id: "jan", name: "Jan", repo: "https://github.com/janhq/jan", category: "local-models",
    description: "Local-first desktop app for downloading, running, and managing local models. Provides its own OpenAI-compatible server. Alternative to Ollama for users who prefer a GUI-first model manager.",
    installMethod: "winget", wingetId: "janhq.jan", localPort: 1337, healthUrl: "http://127.0.0.1:1337",
    detect: async () => fetchText("http://127.0.0.1:1337", undefined, 2000).then(() => true).catch(() => false),
    version: async () => null,
    running: async () => fetchText("http://127.0.0.1:1337", undefined, 2000).then(() => true).catch(() => false),
    installCmd: isWindows ? "winget install janhq.jan" : "Download from https://jan.ai",
    startCmd: isWindows ? 'start "" "jan"' : "jan",
    updateCmd: isWindows ? "winget upgrade janhq.jan" : "Download latest from https://jan.ai",
    docs: "https://jan.ai/docs", usedFor: "GUI model manager, local-first runtime, offline model downloads",
  },
  {
    id: "anythingllm", name: "AnythingLLM", repo: "https://github.com/Mintplex-Labs/anything-llm", category: "local-models",
    description: "Self-hosted RAG platform. Drop in documents and chat with them using local models. No cloud required.",
    installMethod: "manual", localPort: 3001,
    detect: async () => false,
    version: async () => null,
    running: async () => fetchText("http://127.0.0.1:3001/api/ping", undefined, 2000).then(() => true).catch(() => false),
    installCmd: "Download installer from https://useanything.com", startCmd: "", updateCmd: "Download latest from https://useanything.com",
    docs: "https://docs.useanything.com", usedFor: "Local RAG on your documents, private knowledge base",
  },
  {
    id: "chatwoot", name: "Chatwoot", repo: "https://github.com/chatwoot/chatwoot", category: "business",
    description: "Optional customer support inbox adapter profile for Phase 12A draft-first workflows. Disabled until explicitly configured.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "Configure a self-hosted/local Chatwoot endpoint in the Business page.",
    startCmd: "",
    updateCmd: "",
    docs: "https://www.chatwoot.com/docs",
    usedFor: "Support inbox status and approved response draft handoff. No external send occurs in Phase 12A.",
  },
  {
    id: "twenty-crm", name: "Twenty CRM", repo: "https://github.com/twentyhq/twenty", category: "business",
    description: "Optional CRM adapter profile for Phase 12A notes and lead drafts. Disabled until explicitly configured.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "Configure a self-hosted/local Twenty endpoint in the Business page.",
    startCmd: "",
    updateCmd: "",
    docs: "https://twenty.com/developers",
    usedFor: "CRM note proposals and lead draft handoff. No external update occurs in Phase 12A.",
  },
  {
    id: "cal-com", name: "Cal.com / Cal.diy", repo: "https://github.com/calcom/cal.com", category: "business",
    description: "Optional calendar scheduling adapter profile for slot suggestions. Disabled until explicitly configured.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "Configure a self-hosted/local Cal endpoint in the Business page.",
    startCmd: "",
    updateCmd: "",
    docs: "https://cal.com/docs",
    usedFor: "Calendar slot suggestions only. No booking occurs in Phase 12A.",
  },
  {
    id: "postiz", name: "Postiz", repo: "https://github.com/gitroomhq/postiz-app", category: "business",
    description: "Optional social content adapter profile for post drafts. Disabled until explicitly configured.",
    installMethod: "manual",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "Configure a self-hosted/local Postiz endpoint in the Business page.",
    startCmd: "",
    updateCmd: "",
    docs: "https://docs.postiz.com",
    usedFor: "Content draft and scheduling proposals only. No posting occurs in Phase 12A.",
  },
  {
    id: "langflow", name: "Langflow", repo: "https://github.com/langflow-ai/langflow", category: "workflows",
    description: "Visual agent and workflow builder. Drag-and-drop LLM pipeline construction. Exposes flows as API endpoints and MCP servers. Best pick for visual automation without writing code.",
    installMethod: "pip", pipPackage: "langflow", localPort: 7860, healthUrl: "http://127.0.0.1:7860",
    detect: async () => commandExists("langflow"),
    version: async () => maybeVersion("langflow --version"),
    running: async () => fetchText("http://127.0.0.1:7860", undefined, 2000).then(() => true).catch(() => false),
    installCmd: "pip install langflow",
    startCmd: isWindows ? 'start "Langflow" cmd /k "langflow run"' : "langflow run",
    updateCmd: "pip install --upgrade langflow",
    docs: "https://docs.langflow.org", usedFor: "Visual agent/workflow builder, flow-as-API, MCP server authoring",
  },
  {
    id: "worldgui", name: "WorldGUI (Computer Use)", repo: "https://github.com/showlab/WorldGUI", category: "computer-use",
    description: "Computer-use agent framework. AI can control your Windows desktop — click buttons, fill forms, launch apps, and execute multi-step GUI tasks. Adds \"AI can control my PC\" capability.",
    installMethod: "pip", pipPackage: "worldgui",
    detect: async () => commandExists("worldgui"),
    version: async () => null,
    running: async () => false,
    installCmd: "pip install worldgui  # or: git clone https://github.com/showlab/WorldGUI && pip install -e .",
    startCmd: "python -m worldgui", updateCmd: "pip install --upgrade worldgui",
    docs: "https://github.com/showlab/WorldGUI", usedFor: "AI desktop automation, GUI task execution, computer-use agent",
  },
  {
    id: "fabric", name: "Fabric", repo: "https://github.com/danielmiessler/fabric", category: "tools",
    description: "AI augmentation framework with 100+ prompt patterns. Pipe any content through patterns like summarize, extract wisdom, create quiz, write essay. Runs locally with Ollama.",
    installMethod: "pip", pipPackage: "fabric-ai",
    detect: async () => commandExists("fabric"),
    version: async () => maybeVersion("fabric --version"),
    running: async () => false,
    installCmd: "pip install fabric-ai", startCmd: "", updateCmd: "pip install --upgrade fabric-ai",
    docs: "https://github.com/danielmiessler/fabric", usedFor: "Prompt pattern library, summarization, extraction, writing augmentation",
  },
  {
    id: "taskfile", name: "Taskfile (Task runner)", repo: "https://github.com/go-task/task", category: "tools",
    description: "Modern Makefile replacement using YAML. Define lint/test/build/run tasks per project. Integrates with VS Code and runs from Workspace page.",
    installMethod: "winget", wingetId: "Task.Task",
    detect: async () => commandExists("task"),
    version: async () => maybeVersion("task --version"),
    running: async () => false,
    installCmd: isWindows ? "winget install Task.Task" : 'sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d',
    startCmd: "task",
    updateCmd: isWindows ? "winget upgrade Task.Task" : 'sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d',
    docs: "https://taskfile.dev", usedFor: "Project task runner, lint/test/build shortcuts from VS Code",
  },
  {
    id: "openclaw", name: "OpenClaw", repo: "https://github.com/openclaw/openclaw", category: "assistant",
    description: 'Base assistant/runtime reference architecture. Defines the channel/routine pattern for "AI assistant running on your own devices." Use for overall assistant product direction and multi-routine orchestration.',
    installMethod: "git-clone",
    detect: async () => existsSync(path.join(os.homedir(), "LocalAI-Tools", "repos", "openclaw")),
    version: async () => null,
    running: async () => false,
    installCmd: `git clone https://github.com/openclaw/openclaw "${path.join(os.homedir(), "LocalAI-Tools", "repos", "openclaw")}"`,
    startCmd: "",
    updateCmd: `git -C "${path.join(os.homedir(), "LocalAI-Tools", "repos", "openclaw")}" pull`,
    docs: "https://github.com/openclaw/openclaw", usedFor: "Assistant architecture reference, channel/routine ideas, multi-device AI patterns",
  },
  {
    id: "ironclaw", name: "IronClaw (Security)", repo: "https://github.com/nearai/ironclaw", category: "security",
    description: "Security and backend safety reference. Provides sandboxing patterns, capability permissions, endpoint allowlists, secrets handling, routines, audit logs. Use to harden the local AI stack against misuse.",
    installMethod: "git-clone",
    detect: async () => existsSync(path.join(os.homedir(), "LocalAI-Tools", "repos", "ironclaw")),
    version: async () => null,
    running: async () => false,
    installCmd: `git clone https://github.com/nearai/ironclaw "${path.join(os.homedir(), "LocalAI-Tools", "repos", "ironclaw")}"`,
    startCmd: "",
    updateCmd: `git -C "${path.join(os.homedir(), "LocalAI-Tools", "repos", "ironclaw")}" pull`,
    docs: "https://github.com/nearai/ironclaw", usedFor: "Sandboxing, capability permissions, secrets handling, auditability",
  },
  {
    id: "nerve", name: "Nerve (Cockpit GUI)", repo: "https://github.com/daggerhashimoto/openclaw-nerve", category: "assistant",
    description: "Main GUI inspiration for the command-center shell. Provides patterns for voice control, workspace/file control, kanban/taskboard, sessions, charts, usage visibility, and the cockpit layout. Also contains health-check/rollback patterns used in our updater.",
    installMethod: "git-clone",
    detect: async () => existsSync(path.join(os.homedir(), "LocalAI-Tools", "repos", "nerve")),
    version: async () => null,
    running: async () => false,
    installCmd: `git clone https://github.com/daggerhashimoto/openclaw-nerve "${path.join(os.homedir(), "LocalAI-Tools", "repos", "nerve")}"`,
    startCmd: "",
    updateCmd: `git -C "${path.join(os.homedir(), "LocalAI-Tools", "repos", "nerve")}" pull`,
    docs: "https://github.com/daggerhashimoto/openclaw-nerve", usedFor: "Cockpit UI patterns, voice controls, kanban, health-check/rollback architecture",
  },
  {
    id: "openclaw-windows-node", name: "OpenClaw Windows Node", repo: "https://github.com/openclaw/openclaw-windows-node", category: "windows",
    description: "Windows integration reference. Provides tray app behavior, Windows helper/node services, and PowerToys/desktop-side integration patterns for running AI as a background Windows service.",
    installMethod: "git-clone",
    detect: async () => existsSync(path.join(os.homedir(), "LocalAI-Tools", "repos", "openclaw-windows-node")),
    version: async () => null,
    running: async () => false,
    installCmd: `git clone https://github.com/openclaw/openclaw-windows-node "${path.join(os.homedir(), "LocalAI-Tools", "repos", "openclaw-windows-node")}"`,
    startCmd: "",
    updateCmd: `git -C "${path.join(os.homedir(), "LocalAI-Tools", "repos", "openclaw-windows-node")}" pull`,
    docs: "https://github.com/openclaw/openclaw-windows-node", usedFor: "Tray app, Windows helper services, PowerToys integration patterns",
  },
  {
    id: "mcp-ui", name: "MCP-UI (Tool Renderer)", repo: "https://github.com/MCP-UI-Org/mcp-ui", category: "mcp",
    description: "Plugin/tool UI renderer for MCP. Makes tools render cards, inspectors, dialogs, mini-dashboards, and rich widgets instead of raw text blobs. Bridges MCP tool results into the chat UI.",
    installMethod: "npm", packageId: "@mcp-ui/core",
    detect: async () => false,
    version: async () => null,
    running: async () => false,
    installCmd: "npm install @mcp-ui/core", startCmd: "", updateCmd: "npm update @mcp-ui/core",
    docs: "https://github.com/MCP-UI-Org/mcp-ui", usedFor: "Rich tool output rendering in chat — cards, tables, charts instead of text",
  },
  {
    id: "renovate", name: "Renovate", repo: "https://github.com/renovatebot/renovate", category: "devops",
    description: "Automated dependency update tracking and PR creation. Used behind the scenes for detecting when npm/pip/winget packages in the stack have new versions available. Powers the updater's dependency detection.",
    installMethod: "npm", packageId: "renovate",
    detect: async () => commandExists("renovate"),
    version: async () => maybeVersion("renovate --version"),
    running: async () => false,
    installCmd: "npm install -g renovate", startCmd: "renovate", updateCmd: "npm update -g renovate",
    docs: "https://docs.renovatebot.com", usedFor: "Automated dependency tracking, update detection, PR generation for version bumps",
  },
  {
    id: "release-please", name: "Release Please", repo: "https://github.com/googleapis/release-please", category: "devops",
    description: "Release/changelog automation. Generates clean release PRs, version bumps, and structured CHANGELOG notes that the updater page can display as human-readable release notes.",
    installMethod: "npm", packageId: "release-please",
    detect: async () => commandExists("release-please"),
    version: async () => maybeVersion("release-please --version"),
    running: async () => false,
    installCmd: "npm install -g release-please", startCmd: "", updateCmd: "npm update -g release-please",
    docs: "https://github.com/googleapis/release-please", usedFor: "Changelog generation, version bump PRs, structured release notes for the updater page",
  },
];

async function loadState(): Promise<Record<string, any>> {
  try {
    if (existsSync(INTEGRATIONS_STATE_FILE)) return JSON.parse(await readFile(INTEGRATIONS_STATE_FILE, "utf-8"));
  } catch {}
  return {};
}

async function saveState(state: Record<string, any>): Promise<void> {
  await ensureDir(TOOLS_DIR);
  await writeManagedJson(INTEGRATIONS_STATE_FILE, state);
}

async function integrationListEntry(
  intg: Integration,
  state: Record<string, any>,
  options: { liveChecks?: boolean; persist?: boolean } = {},
): Promise<IntegrationListEntry> {
  const liveChecks = options.liveChecks !== false;
  let installed = Boolean(state[intg.id]?.installed);
  let running = Boolean(state[intg.id]?.running);
  let version: string | null = typeof state[intg.id]?.version === "string" ? state[intg.id].version : null;

  if (liveChecks) {
    try { installed = await intg.detect(); } catch {}
    try { running = installed && await intg.running(); } catch {}
    try { version = installed ? await intg.version() : null; } catch {}
  }

  const pinned = Boolean(state[intg.id]?.pinned);
  const mergedState = {
    ...state[intg.id],
    installed,
    running,
    version,
    pinned,
    lastCheckedAt: new Date().toISOString(),
  };
  if (options.persist !== false) upsertIntegrationState(intg.id, mergedState);
  return {
    id: intg.id,
    name: intg.name,
    repo: intg.repo,
    category: intg.category,
    description: intg.description,
    installMethod: intg.installMethod,
    installCmd: intg.installCmd,
    startCmd: intg.startCmd,
    updateCmd: intg.updateCmd,
    docs: intg.docs,
    usedFor: intg.usedFor,
    localPort: intg.localPort,
    healthUrl: intg.healthUrl,
    localAiConfig: intg.localAiConfig,
    aiderTip: intg.aiderTip,
    installed,
    running,
    version,
    pinned,
    updateAvailable: false,
  };
}

export async function listIntegrationToolSources(options: { liveChecks?: boolean; persist?: boolean } = {}): Promise<IntegrationListEntry[]> {
  const state = await loadState();
  return Promise.all(INTEGRATIONS.map(intg => integrationListEntry(intg, state, options)));
}

router.get("/integrations", async (_req, res) => {
  const results = await listIntegrationToolSources();
  return res.json({ integrations: results });
});

router.post("/integrations/:id/pin", async (req, res) => {
  const state = await loadState();
  const current = state[req.params.id] || {};
  state[req.params.id] = { ...current, pinned: !current.pinned };
  await saveState(state);
  upsertIntegrationState(req.params.id, state[req.params.id]);
  recordAuditEvent({ eventType: "integration", action: "pin", target: req.params.id, metadata: { pinned: state[req.params.id].pinned } });
  return res.json({ success: true, pinned: state[req.params.id].pinned });
});

function actionScopes(action: "install" | "start" | "update"): ToolPermissionScope[] {
  if (action === "install") return ["commands", "network", "filesystem.write", "install"];
  if (action === "update") return ["commands", "network", "filesystem.write", "update"];
  return ["commands"];
}

function statusForToolResult(result: ToolCallResult): number {
  if (result.status === "approval_required") return 202;
  if (result.status === "not_configured") return 409;
  if (result.status === "disabled" || result.status === "blocked" || result.status === "denied") return 403;
  return result.success ? 200 : 409;
}

async function evaluateIntegrationAction(
  integrationId: string,
  action: "install" | "start" | "update",
  body: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  const intg = INTEGRATIONS.find((i) => i.id === integrationId);
  if (!intg) return null;
  const state = await loadState();
  const source = await integrationListEntry(intg, state, { liveChecks: false, persist: false });
  const tool = integrationSourceToTool(source);
  return evaluateToolCall({
    toolId: tool.id,
    action,
    requestedScopes: actionScopes(action),
    input: {
      integrationId: intg.id,
      installMethod: intg.installMethod,
      proposalOnly: true,
    },
    approvalId: typeof body["approvalId"] === "string" ? body["approvalId"] : undefined,
    dryRun: body["dryRun"] === true,
    sandboxSatisfied: body["sandboxSatisfied"] === true,
    registry: [tool],
  });
}

router.post("/integrations/:id/install", agentExecGuard((req) => `install integration ${req.params.id}`), async (req, res) => {
  const integrationId = String(req.params.id);
  const result = await evaluateIntegrationAction(integrationId, "install", req.body ?? {});
  if (!result) return res.status(404).json({ success: false, status: "not_configured", executed: false, message: "Integration not found" });
  recordAuditEvent({ eventType: "integration", action: "install_proposal", target: integrationId, result: result.blocked ? "blocked" : "success", metadata: { toolStatus: result.status, executed: false } });
  return res.status(statusForToolResult(result)).json(result);
});

router.post("/integrations/:id/start", agentExecGuard((req) => `start integration ${req.params.id}`), async (req, res) => {
  const integrationId = String(req.params.id);
  const result = await evaluateIntegrationAction(integrationId, "start", req.body ?? {});
  if (!result) return res.status(404).json({ success: false, status: "not_configured", executed: false, message: "Cannot start this integration" });
  recordAuditEvent({ eventType: "integration", action: "start_proposal", target: integrationId, result: result.blocked ? "blocked" : "success", metadata: { toolStatus: result.status, executed: false } });
  return res.status(statusForToolResult(result)).json(result);
});

router.get("/integrations/updates", async (_req, res) => {
  const updates: any[] = [];
  for (const intg of INTEGRATIONS) {
    let installed = false;
    try { installed = await intg.detect(); } catch {}
    if (!installed) continue;
    updates.push({ id: intg.id, name: intg.name, updateCmd: intg.updateCmd, hasUpdate: false });
  }
  return res.json({ updates, checkedAt: new Date().toISOString() });
});

router.post("/integrations/:id/update", agentExecGuard((req) => `update integration ${req.params.id}`), async (req, res) => {
  const integrationId = String(req.params.id);
  const result = await evaluateIntegrationAction(integrationId, "update", req.body ?? {});
  if (!result) return res.status(404).json({ success: false, status: "not_configured", executed: false, message: "Not found" });
  recordAuditEvent({ eventType: "integration", action: "update_proposal", target: integrationId, result: result.blocked ? "blocked" : "success", metadata: { toolStatus: result.status, executed: false } });
  return res.status(statusForToolResult(result)).json(result);
});

export default router;
