import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import type { Options as PinoHttpOptions } from "pino-http";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";
import { logger } from "./lib/logger.js";
import { thoughtLog } from "./lib/thought-log.js";
import { stateOrchestrator } from "./lib/state-orchestrator.js";
import { distributedNodeAuthMiddleware, startDistributedNodeHeartbeat } from "./lib/network-proxy.js";
import { getUniversalGatewayTags } from "./lib/model-orchestrator.js";
import { trackWindowForIdleMinimize } from "./lib/windows-system.js";
import { foregroundWatcher } from "./lib/foreground-watcher.js";
import routes from "./routes/index.js";
import { initDatabase } from "./db/migrate.js";
import { taskQueue } from "./lib/task-queue.js";
import { loadSettings } from "./lib/secure-config.js";
import { WARMUP_TOP_N } from "./config/models.config.js";
import { localBrowserRequestGuard } from "./lib/route-guards.js";
import openaiCompatRoutes from "./routes/openai.js";
import { clearRuntimeDiagnostic, recordRuntimeDiagnostic } from "./lib/runtime-diagnostics.js";
import { modelWarmupsAllowed, seedRuntimePolicyDefaults } from "./lib/runtime-mode.js";
import { hydrateDurableJobsForRestart } from "./lib/platform-foundation.js";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── STT sidecar boot ──────────────────────────────────────────────────────────

async function maybeSpawnSttSidecar(): Promise<void> {
  try {
    const { stdout } = await execAsync("python --version", { timeout: 4000 });
    const version = stdout.trim(); // e.g. "Python 3.11.2"
    const match   = /Python (\d+)\.(\d+)/.exec(version);
    if (!match) throw new Error("Could not parse Python version");
    const [, major, minor] = match.map(Number);
    if (major < 3 || (major === 3 && minor < 10)) throw new Error(`Python ${major}.${minor} < 3.10`);

    const sidecarScript = path.resolve(
      __dirname, "../sidecars/stt-server.py",
    );
    const sidecar = spawn("python", [sidecarScript], {
      detached: true,
      stdio:    "ignore",
      env:      { ...process.env },
    });
    sidecar.once("error", (error) => {
      recordRuntimeDiagnostic({
        id: "sidecar.stt",
        component: "stt-sidecar",
        status: "degraded",
        severity: "warning",
        message: `STT sidecar failed after launch: ${error.message}`,
      });
      thoughtLog.publish({
        level:    "warning",
        category: "kernel",
        title:    "STT: Sidecar Failed",
        message:  error.message,
      });
    });
    sidecar.unref();
    clearRuntimeDiagnostic("sidecar.stt");
    thoughtLog.publish({
      category: "kernel",
      title:    "STT: Sidecar Spawned",
      message:  `faster-whisper STT server started (pid ${sidecar.pid ?? "?"}) using ${version}`,
    });
  } catch (err) {
    recordRuntimeDiagnostic({
      id: "sidecar.stt",
      component: "stt-sidecar",
      status: "degraded",
      severity: "warning",
      message:  err instanceof Error ? err.message : String(err),
    });
    thoughtLog.publish({
      level:    "warning",
      category: "kernel",
      title:    "STT unavailable: Python 3.10+ not found",
      message:  err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Windows tray sidecar ──────────────────────────────────────────────────────

async function resolvePowerShellForSidecar(): Promise<string | null> {
  for (const candidate of ["pwsh.exe", "powershell.exe"]) {
    try {
      await execAsync(`where ${candidate}`, { timeout: 2500, windowsHide: true });
      return candidate;
    } catch {
      // Try the next shell.
    }
  }
  return null;
}

async function spawnTraySidecar(): Promise<void> {
  if (os.platform() !== "win32") return;
  try {
    const shell = await resolvePowerShellForSidecar();
    if (!shell) throw new Error("No PowerShell host found for optional tray sidecar.");

    const script = path.resolve(__dirname, "../../../scripts/windows/LocalAI.Tray.ps1");
    const proc = spawn(
      shell,
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", script],
      { detached: true, stdio: "ignore", windowsHide: true },
    );
    proc.once("error", (error) => {
      recordRuntimeDiagnostic({
        id: "sidecar.tray",
        component: "windows-tray-sidecar",
        status: "degraded",
        severity: "warning",
        message: `Optional Windows tray sidecar failed to launch: ${error.message}`,
        details: { shell },
      });
      thoughtLog.publish({
        level:    "warning",
        category: "kernel",
        title:    "Tray: Sidecar Unavailable",
        message:  error.message,
        metadata: { shell },
      });
    });
    proc.once("exit", (code, signal) => {
      if (code && code !== 0) {
        recordRuntimeDiagnostic({
          id: "sidecar.tray",
          component: "windows-tray-sidecar",
          status: "degraded",
          severity: "warning",
          message: `Optional Windows tray sidecar exited early with code ${code}.`,
          details: { shell, signal },
        });
      }
    });
    proc.unref();
    clearRuntimeDiagnostic("sidecar.tray");
    thoughtLog.publish({
      category: "kernel",
      title:    "Tray: Sidecar Spawned",
      message:  `Windows tray icon launched (pid ${proc.pid ?? "?"}) using ${shell}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordRuntimeDiagnostic({
      id: "sidecar.tray",
      component: "windows-tray-sidecar",
      status: "degraded",
      severity: "warning",
      message: `Optional Windows tray sidecar unavailable: ${message}`,
    });
    thoughtLog.publish({
      level:    "warning",
      category: "kernel",
      title:    "Tray: Sidecar Unavailable",
      message,
    });
  }
}

const app = express();

// ── Structured request logging ────────────────────────────────────────────────

const pinoHttpOptions: PinoHttpOptions = {
  logger,
  serializers: {
    req(req: { id: unknown; method: string; url?: string }) {
      return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
    },
    res(res: { statusCode: number }) {
      return { statusCode: res.statusCode };
    },
  },
};

// pino-http v10 ESM types don't expose a call signature — runtime is fine
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((pinoHttp as any)(pinoHttpOptions));

// ── Standard middleware ───────────────────────────────────────────────────────

app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(distributedNodeAuthMiddleware);
app.use(localBrowserRequestGuard);

// ── Strict Local Mode — intercepts outbound fetches from server routes ────────
// Applied as Express middleware that patches globalThis.fetch when enabled.
// The actual per-request blocking happens in the fetch patch installed below.
let _strictLocalModeActive = false;

const _originalFetch = globalThis.fetch.bind(globalThis);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const TAILSCALE_CIDR_PREFIX = "100."; // 100.64.0.0/10

function isAllowedHost(hostname: string): boolean {
  if (LOOPBACK_HOSTS.has(hostname)) return true;
  if (hostname.startsWith(TAILSCALE_CIDR_PREFIX)) return true;
  return false;
}

// Replace global fetch with a strict-local-aware version
globalThis.fetch = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  if (_strictLocalModeActive) {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    try {
      const parsed = new URL(urlStr);
      if (!isAllowedHost(parsed.hostname)) {
        const { thoughtLog: tl } = await import("./lib/thought-log.js");
        tl.publish({
          level:    "error",
          category: "security",
          title:    "Strict Local Mode Blocked",
          message:  `Outbound request to ${parsed.hostname} blocked`,
          metadata: { url: urlStr },
        });
        throw new Error(`Strict Local Mode blocked outbound request to ${urlStr}`);
      }
    } catch (e) {
      if (e instanceof TypeError) { /* invalid URL — let it fail naturally */ }
      else throw e;
    }
  }
  return _originalFetch(input, init);
};

// Expose toggle for settings changes
export function setStrictLocalMode(enabled: boolean): void {
  _strictLocalModeActive = enabled;
}

// Wire to settings on boot
void loadSettings().then(s => {
  _strictLocalModeActive = s.strictLocalMode ?? false;
}).catch(() => {});

app.use("/api", routes);
app.use("/v1", openaiCompatRoutes);
app.use("/api/v1", openaiCompatRoutes);

// ── Background service boot sequence ─────────────────────────────────────────
//
// Order matters:
//   1. Hydrate the capability registry from encrypted config.
//   2. Start the distributed-node heartbeat monitor.
//   3. Run the boot-time Ollama catalog sync — populates the model cache and
//      updates sovereign state with lastCatalogSync + catalogModelCount.

// Boot database — creates all 11 tables, migrates legacy JSON vaults
void initDatabase()
  .then(async () => {
    // Hydrate in-memory services from SQLite after migrations complete
    await Promise.all([
      thoughtLog.hydrate(),
      taskQueue.hydrate(),
    ]);
    const durableHydration = hydrateDurableJobsForRestart();
    seedRuntimePolicyDefaults();
    thoughtLog.publish({
      category: "kernel",
      title:    "DB: Hydration Complete",
      message:  "thought_log, async_jobs, and durable_jobs hydrated from localai.db",
      metadata: durableHydration,
    });
  })
  .catch((err) => {
    logger.error({ err }, "DB init failed");
  });

void stateOrchestrator.hydrate();

trackWindowForIdleMinimize("api-server", 30_000);
trackWindowForIdleMinimize("localai-control-center", 30_000);
void spawnTraySidecar();
void maybeSpawnSttSidecar();

// Start foreground watcher if adaptive profiles enabled (default on)
void loadSettings().then(settings => {
  if (settings.adaptiveForegroundProfiles !== false) {
    foregroundWatcher.start();
  }
}).catch(() => {
  foregroundWatcher.start(); // default on if settings unreadable
});

startDistributedNodeHeartbeat();

// ── Model warm-up scheduler (8.5) ─────────────────────────────────────────────
// Reads usage_metrics to find top-N most-used models, sends keep_alive pings
// so the first chat turn is instant.
void (async () => {
  try {
    await new Promise(r => setTimeout(r, 8000)); // let Ollama finish starting
    if (!modelWarmupsAllowed()) {
      thoughtLog.publish({
        category: "kernel",
        title:    "Warm-up: Skipped",
        message:  "Runtime mode disables background model warm-ups.",
      });
      return;
    }
    const { sqlite } = await import("./db/database.js");
    const topModels = sqlite.prepare(`
      SELECT m.model_name, SUM(1) as cnt
      FROM chat_messages m
      WHERE m.role = 'assistant' AND json_valid(m.supervisor_json)
      GROUP BY m.model_name
      ORDER BY cnt DESC
      LIMIT ?
    `).all(WARMUP_TOP_N) as Array<{ model_name: string; cnt: number }>;

    if (topModels.length === 0) return;

    const { getOllamaUrl } = await import("./lib/ollama-url.js");
    const { ollamaReachable } = await import("./lib/runtime.js");
    if (!await ollamaReachable()) return;

    const base = await getOllamaUrl();
    for (const row of topModels) {
      try {
        await fetch(`${base}/api/generate`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ model: row.model_name, prompt: "", keep_alive: "1m" }),
        });
        thoughtLog.publish({
          category: "kernel",
          title:    "Warm-up: Model Pre-loaded",
          message:  `${row.model_name} pre-loaded for instant first turn`,
          metadata: { model: row.model_name },
        });
      } catch { /* non-fatal */ }
    }
  } catch { /* non-fatal — usage_metrics table may be empty on first boot */ }
})();

thoughtLog.publish({
  category: "kernel",
  title:    "Boot: Services Starting",
  message:  "Express application bootstrapped — initiating background service startup",
});

void getUniversalGatewayTags(true)
  .then((gateway) => {
    // Update sovereign state with catalog sync results
    stateOrchestrator.setSovereignState({
      lastCatalogSync:    new Date().toISOString(),
      catalogModelCount:  gateway.models.length,
    });

    thoughtLog.publish({
      category: "kernel",
      title:    "Boot: Catalog Synced",
      message:  `Ollama catalog sync complete — ${gateway.models.length} model(s) available, VRAM guard: ${gateway.vramGuard.mode} (${gateway.vramGuard.status})`,
      metadata: {
        modelCount:      gateway.models.length,
        ollamaReachable: gateway.ollamaReachable,
        vramMode:        gateway.vramGuard.mode,
        vramStatus:      gateway.vramGuard.status,
        gpuName:         gateway.vramGuard.gpuName,
        totalVram:       gateway.vramGuard.totalBytes,
        freeVram:        gateway.vramGuard.freeBytes,
        models:          gateway.models.map(m => m.name),
      },
    });
  })
  .catch((err: unknown) => {
    thoughtLog.publish({
      level:    "warning",
      category: "kernel",
      title:    "Boot: Catalog Sync Skipped",
      message:  "Ollama not reachable at startup — catalog will sync on first API request",
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
  });

export default app;
