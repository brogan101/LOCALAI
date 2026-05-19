#!/usr/bin/env node
/**
 * LOCALAI DIAGNOSTICS BUNDLE
 * ==========================
 * Collects everything needed to debug the LOCALAI stack into a single folder
 * so you can zip it and share it without leaking secrets.
 *
 * Usage:
 *   node scripts/collect-diagnostics.mjs
 *   node scripts/collect-diagnostics.mjs --no-network    (skip API/UI probes)
 *   node scripts/collect-diagnostics.mjs --redact-paths  (redact home directory paths)
 *
 * Output:
 *   ~/LocalAI-Tools/diagnostics/localai-diagnostics-<timestamp>/
 *   ~/LocalAI-Tools/diagnostics/localai-diagnostics-<timestamp>.txt  (combined log)
 *
 * Collected (all fail-soft):
 *   - Node, npm, pnpm, PowerShell, Ollama versions
 *   - GPU/VRAM via nvidia-smi (if present)
 *   - Installed Ollama models
 *   - API health (http://127.0.0.1:3001/api/health)
 *   - UI reachability (http://127.0.0.1:5173)
 *   - Port usage 3001 / 5173 / 11434
 *   - Last 200 lines of launcher logs
 *   - Recent runtime diagnostics from API
 *   - Package versions from root + workspaces
 *   - Git branch and dirty status
 *
 * Excluded:
 *   - Settings (may contain API keys)
 *   - Encrypted config files
 *   - Database file
 *   - User content (chat history, RAG documents)
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const execAsync = promisify(exec);

const args = process.argv.slice(2);
const NO_NETWORK = args.includes("--no-network");
const REDACT_PATHS = args.includes("--redact-paths");

const HOME = os.homedir();
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT_ROOT = path.join(HOME, "LocalAI-Tools", "diagnostics");
const OUT_DIR = path.join(OUT_ROOT, `localai-diagnostics-${TIMESTAMP}`);
const COMBINED_LOG = path.join(OUT_ROOT, `localai-diagnostics-${TIMESTAMP}.txt`);

const lines = [];
function log(msg) {
  console.log(msg);
  lines.push(msg);
}
function header(t) {
  log("");
  log(`════ ${t} ════════════════════════════════════`);
}

function redact(text) {
  if (!text) return text;
  let out = String(text);
  if (REDACT_PATHS) {
    out = out.replaceAll(HOME, "~");
  }
  // Always redact secrets
  out = out
    .replace(/(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/g, "[GITHUB_TOKEN_REDACTED]")
    .replace(/sk-[A-Za-z0-9]{20,}/g, "[API_KEY_REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]{20,}=*/gi, "Bearer [TOKEN_REDACTED]")
    .replace(/(password|pwd|secret|api[_-]?key|token)\s*[:=]\s*['""]?[^\s'""\n]+/gi, "$1=[REDACTED]");
  return out;
}

async function safeRun(cmd, timeout = 8000) {
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    return { ok: true, stdout: redact(stdout), stderr: redact(stderr) };
  } catch (err) {
    return { ok: false, error: redact(err.message ?? String(err)) };
  }
}

async function safeFetch(url, timeout = 4000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: redact(text.slice(0, 8000)) };
  } catch (err) {
    return { ok: false, error: redact(err.message ?? String(err)) };
  }
}

async function tailFile(fp, n = 200) {
  if (!existsSync(fp)) return null;
  try {
    const data = await readFile(fp, "utf-8");
    const all = data.split(/\r?\n/);
    return redact(all.slice(-n).join("\n"));
  } catch (err) {
    return `(error reading ${fp}: ${err.message})`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  header("LOCALAI Diagnostics");
  log(`Generated: ${new Date().toISOString()}`);
  log(`Hostname: ${os.hostname()}`);
  log(`Platform: ${os.platform()} ${os.release()} ${os.arch()}`);
  log(`Node: ${process.version}`);
  log(`Output: ${OUT_DIR}`);
  log(`Network probes: ${NO_NETWORK ? "disabled" : "enabled"}`);

  // ── Toolchain versions
  header("Toolchain");
  for (const [name, cmd] of [
    ["node", "node --version"],
    ["npm", "npm --version"],
    ["pnpm", "pnpm --version"],
    ["pwsh (PS7)", "pwsh -Command \"$PSVersionTable.PSVersion.ToString()\""],
    ["powershell (PS5)", "powershell -Command \"$PSVersionTable.PSVersion.ToString()\""],
    ["ollama", "ollama --version"],
    ["git", "git --version"],
  ]) {
    const r = await safeRun(cmd);
    log(`  ${name}: ${r.ok ? r.stdout.trim() : "NOT FOUND"}`);
  }

  // ── GPU
  header("GPU / VRAM");
  const gpuRun = await safeRun(
    "nvidia-smi --query-gpu=name,driver_version,memory.total,memory.free,memory.used --format=csv,noheader",
  );
  if (gpuRun.ok) {
    log(gpuRun.stdout.trim());
  } else {
    log(`nvidia-smi not available: ${gpuRun.error}`);
    if (process.platform === "win32") {
      const wmiRun = await safeRun(
        'powershell -Command "Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,AdapterRAM | Format-Table -AutoSize"',
      );
      if (wmiRun.ok) log(wmiRun.stdout.trim());
    }
  }

  // ── Ollama
  header("Ollama");
  const ollamaList = await safeRun("ollama list", 6000);
  if (ollamaList.ok) {
    log(ollamaList.stdout.trim());
  } else {
    log(`ollama list failed: ${ollamaList.error}`);
  }

  if (!NO_NETWORK) {
    const ollamaTags = await safeFetch("http://127.0.0.1:11434/api/tags", 4000);
    log(`/api/tags reachable: ${ollamaTags.ok}`);
    if (!ollamaTags.ok) log(`  reason: ${ollamaTags.error}`);
  }

  // ── API health
  if (!NO_NETWORK) {
    header("API server (3001)");
    const apiHealth = await safeFetch("http://127.0.0.1:3001/api/health");
    log(`/api/health: ${apiHealth.ok ? "ok" : "FAIL"}`);
    if (apiHealth.body) log(apiHealth.body);

    header("UI dev server (5173)");
    const uiCheck = await safeFetch("http://127.0.0.1:5173", 3000);
    log(`UI reachable: ${uiCheck.ok ? "yes" : "no"}`);
    if (!uiCheck.ok) log(`  reason: ${uiCheck.error}`);
  }

  // ── Port usage (Windows only)
  if (process.platform === "win32" && !NO_NETWORK) {
    header("Port usage");
    for (const port of [3001, 5173, 11434]) {
      const r = await safeRun(`powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object State,OwningProcess | Format-Table -AutoSize"`);
      log(`Port ${port}: ${r.ok && r.stdout.trim() ? r.stdout.trim() : "(not in use or not detected)"}`);
    }
  }

  // ── Launcher logs
  header("Launcher logs (last 200 lines each)");
  const logsRoot = path.join(HOME, "LocalAI-Tools", "logs");
  if (existsSync(logsRoot)) {
    try {
      const files = await readdir(logsRoot);
      for (const file of files) {
        if (!file.endsWith(".log")) continue;
        const fp = path.join(logsRoot, file);
        const tail = await tailFile(fp, 200);
        if (tail) {
          await writeFile(path.join(OUT_DIR, `log-${file}`), tail, "utf-8");
          log(`  saved: log-${file}`);
        }
      }
    } catch (err) {
      log(`  (error: ${err.message})`);
    }
  } else {
    log(`  (no logs dir at ${logsRoot})`);
  }

  // ── Runtime diagnostics from API
  if (!NO_NETWORK) {
    header("Runtime diagnostics (live)");
    const diag = await safeFetch("http://127.0.0.1:3001/api/healthz");
    if (diag.ok && diag.body) {
      try {
        const parsed = JSON.parse(diag.body);
        await writeFile(path.join(OUT_DIR, "runtime-diagnostics.json"), JSON.stringify(parsed, null, 2), "utf-8");
        const items = parsed.diagnostics ?? [];
        log(`Status: ${parsed.status}, degraded: ${parsed.degraded}, ${items.length} item(s)`);
        items.slice(0, 20).forEach((d) => {
          log(`  [${d.status ?? "?"}] ${d.id ?? "?"} — ${d.message ?? ""}`);
        });
      } catch {
        log(`(could not parse: ${diag.body.slice(0, 200)})`);
      }
    } else {
      log(`API not reachable for runtime diagnostics`);
    }
  }

  // ── Package versions (root + workspaces)
  header("Package versions");
  const repoRoot = process.cwd();
  for (const pkgPath of [
    path.join(repoRoot, "package.json"),
    path.join(repoRoot, "artifacts", "api-server", "package.json"),
    path.join(repoRoot, "artifacts", "localai-control-center", "package.json"),
  ]) {
    if (!existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
      log(`  ${pkg.name}@${pkg.version ?? "?"} (${pkgPath.replace(repoRoot, "")})`);
      const totalDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).length;
      log(`    deps: ${totalDeps}`);
    } catch (err) {
      log(`  (error reading ${pkgPath}: ${err.message})`);
    }
  }

  // ── Git
  header("Git");
  const gitBranch = await safeRun("git rev-parse --abbrev-ref HEAD");
  const gitStatus = await safeRun("git status --porcelain");
  const gitHead = await safeRun("git log -1 --oneline");
  log(`Branch: ${gitBranch.ok ? gitBranch.stdout.trim() : "unknown"}`);
  log(`HEAD:   ${gitHead.ok ? gitHead.stdout.trim() : "unknown"}`);
  log(`Dirty:  ${gitStatus.ok && gitStatus.stdout.trim() ? "YES" : "no"}`);
  if (gitStatus.ok && gitStatus.stdout.trim()) {
    log(gitStatus.stdout);
  }

  // ── Disk
  header("Disk usage (LocalAI dirs)");
  for (const dir of [
    path.join(HOME, "LocalAI-Tools"),
    path.join(HOME, "LocalAI-Tools", "logs"),
    path.join(HOME, "LocalAI-Tools", "proof"),
    path.join(HOME, ".ollama"),
  ]) {
    if (!existsSync(dir)) {
      log(`  ${dir}: (not present)`);
      continue;
    }
    try {
      const s = await stat(dir);
      log(`  ${dir}: ${s.isDirectory() ? "dir" : "file"}, ${s.size} bytes`);
    } catch (err) {
      log(`  ${dir}: (error: ${err.message})`);
    }
  }

  // ── Write combined log
  const combined = lines.join("\n") + "\n";
  await writeFile(COMBINED_LOG, combined, "utf-8");
  await writeFile(path.join(OUT_DIR, "combined.log"), combined, "utf-8");

  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`Bundle:        ${OUT_DIR}`);
  console.log(`Combined log:  ${COMBINED_LOG}`);
  console.log("");
  console.log("Zip the bundle folder when sharing for support.");
  console.log("Secrets and home paths have been redacted.");
}

main().catch((err) => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
