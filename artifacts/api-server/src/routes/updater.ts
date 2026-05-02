import { Router } from "express";
import { readFile, copyFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { ollamaReachable, fetchJson, isWindows, toolsRoot, ensureDir } from "../lib/runtime.js";
import { writeManagedJson } from "../lib/snapshot-manager.js";
import { getOllamaUrl } from "../lib/ollama-url.js";
import { modelRolesService } from "../lib/model-roles-service.js";
import { agentEditsGuard, agentExecGuard } from "../lib/route-guards.js";
import {
  createSelfImprovementProposal,
  getSelfMaintainerSnapshot,
  proposeSelfMaintainerAction,
  runSelfMaintainerRadar,
} from "../lib/self-maintainer.js";

const execAsync = promisify(exec);
const router = Router();
const TOOLS_DIR = toolsRoot();
const MANIFEST_FILE = path.join(TOOLS_DIR, "updater-manifest.json");
const MODEL_STATES_FILE = path.join(TOOLS_DIR, "model-states.json");
const SNAPSHOTS_DIR = path.join(TOOLS_DIR, "snapshots");

async function loadManifest(): Promise<any> {
  if (existsSync(MANIFEST_FILE)) {
    try {
      return JSON.parse(await readFile(MANIFEST_FILE, "utf-8"));
    } catch {}
  }
  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    core: { installedVersion: "1.0.0", updateAvailable: false },
    repoPacks: {},
    models: {},
    systemTools: {},
    schedule: {
      checkIntervalSeconds: 86400,
      autoInstallPatches: false,
      requireApprovalForMinor: true,
      requireApprovalForMajor: true,
    },
  };
}

async function saveManifest(m: any): Promise<void> {
  await ensureDir(TOOLS_DIR);
  m.generatedAt = new Date().toISOString();
  await writeManagedJson(MANIFEST_FILE, m);
}

async function loadModelStates(): Promise<Record<string, any>> {
  if (existsSync(MODEL_STATES_FILE)) {
    try {
      return JSON.parse(await readFile(MODEL_STATES_FILE, "utf-8"));
    } catch {}
  }
  return {};
}

async function saveModelStates(states: Record<string, any>): Promise<void> {
  await ensureDir(TOOLS_DIR);
  await writeManagedJson(MODEL_STATES_FILE, states);
}

async function getPipLatestVersion(packageName: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await execAsync(`pip index versions ${packageName}`, { timeout: 15000 });
    const text = `${stdout}\n${stderr}`;
    const latestMatch = text.match(/LATEST:\s*([^\s\n]+)/i);
    if (latestMatch) return latestMatch[1];
    const versionsMatch = text.match(/Available versions:\s*([^\n]+)/);
    if (versionsMatch) return versionsMatch[1].split(",")[0].trim();
    return null;
  } catch {
    return null;
  }
}

async function getPipInstalledVersion(packageName: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`pip show ${packageName}`, { timeout: 8000 });
    const match = stdout.match(/^Version:\s*(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

async function getWingetInstalledVersion(wingetId: string): Promise<string | null> {
  if (!isWindows) return null;
  try {
    const { stdout } = await execAsync(`winget show --id ${wingetId} --exact`, { timeout: 20000 });
    const match = stdout.match(/Version:\s*([^\r\n]+)/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

async function getWingetAvailableVersion(wingetId: string): Promise<{ available: string | null; updateAvailable: boolean }> {
  if (!isWindows) return { available: null, updateAvailable: false };
  try {
    const { stdout } = await execAsync(`winget upgrade --id ${wingetId} --exact 2>&1`, { timeout: 30000 });
    if (stdout.toLowerCase().includes("no applicable update") || stdout.toLowerCase().includes("already installed")) {
      return { available: null, updateAvailable: false };
    }
    const versionMatch = stdout.match(/[\d]+\.[\d]+\.[\d]+[\.\d]*/);
    return { available: versionMatch ? versionMatch[0] : null, updateAvailable: !!versionMatch };
  } catch {
    return { available: null, updateAvailable: false };
  }
}

async function checkOllamaModelUpdate(modelName: string, installedDigest: string): Promise<{ updateAvailable: boolean; latestDigest?: string }> {
  const [name, tag] = modelName.includes(":") ? modelName.split(":") : [modelName, "latest"];
  try {
    const data = await fetchJson<{ digest?: string }>(
      `https://registry.ollama.ai/v2/library/${name}/manifests/${tag}`,
      { headers: { Accept: "application/vnd.docker.distribution.manifest.v2+json" } },
      10000
    );
    const latestDigest = data?.digest?.slice(0, 12) || "";
    if (!latestDigest) return { updateAvailable: false };
    const updateAvailable = latestDigest !== installedDigest && !!installedDigest;
    return { updateAvailable, latestDigest };
  } catch {
    return { updateAvailable: false };
  }
}

async function snapshotModel(modelName: string, digest: string): Promise<string> {
  const snapshotId = `${modelName.replace(/[:/]/g, "-")}-${digest}-${Date.now()}`;
  await ensureDir(SNAPSHOTS_DIR);
  const snapFile = path.join(SNAPSHOTS_DIR, `${snapshotId}.json`);
  await writeManagedJson(snapFile, { modelName, digest, createdAt: new Date().toISOString() });
  return snapshotId;
}

router.get("/updater/manifest", async (_req, res) => {
  const manifest = await loadManifest();
  return res.json({ manifest });
});

router.post("/updater/check", async (req, res) => {
  const { scope = "all" } = req.body;
  const manifest = await loadManifest();
  const results: any[] = [];
  if (scope === "all" || scope === "tools") {
    const SYSTEM_TOOLS = [
      { id: "pwsh", name: "PowerShell 7", wingetId: "Microsoft.PowerShell" },
      { id: "git", name: "Git", wingetId: "Git.Git" },
      { id: "node", name: "Node.js LTS", wingetId: "OpenJS.NodeJS.LTS" },
      { id: "python", name: "Python 3.12", wingetId: "Python.Python.3.12" },
      { id: "code", name: "VS Code", wingetId: "Microsoft.VisualStudioCode" },
      { id: "ollama", name: "Ollama", wingetId: "Ollama.Ollama" },
      { id: "aider", name: "Aider", pip: "aider-chat" },
      { id: "litellm", name: "LiteLLM", pip: "litellm" },
      { id: "fabric", name: "Fabric", pip: "fabric-ai" },
      { id: "open-webui", name: "Open WebUI", pip: "open-webui" },
      { id: "langflow", name: "Langflow", pip: "langflow" },
    ];
    for (const tool of SYSTEM_TOOLS) {
      let installed: string | null = null;
      let available: string | null = null;
      let updateAvailable = false;
      if ((tool as any).wingetId) {
        installed = await getWingetInstalledVersion((tool as any).wingetId);
        if (installed) {
          const check = await getWingetAvailableVersion((tool as any).wingetId);
          available = check.available;
          updateAvailable = check.updateAvailable;
        }
      } else if ((tool as any).pip) {
        installed = await getPipInstalledVersion((tool as any).pip);
        if (installed) {
          available = await getPipLatestVersion((tool as any).pip);
          updateAvailable = !!available && available !== installed;
        }
      }
      manifest.systemTools[tool.id] = {
        installedVersion: installed || undefined,
        checkedAt: new Date().toISOString(),
        latestVersion: available || undefined,
        updateAvailable,
        wingetId: (tool as any).wingetId,
        pipName: (tool as any).pip,
      };
      results.push({ id: tool.id, type: "tool", name: tool.name, installed: installed || undefined, available: available || undefined, updateAvailable });
    }
  }
  if (scope === "all" || scope === "models") {
    const states = await loadModelStates();
    if (await ollamaReachable()) {
      const data = await fetchJson<{ models?: Array<{ name: string; digest?: string; size?: number }> }>(`${await getOllamaUrl()}/api/tags`, undefined, 10000).catch(() => ({ models: [] as Array<{ name: string; digest?: string; size?: number }> }));
      for (const m of data.models || []) {
        const shortDigest = m.digest?.slice(0, 12) || "";
        const check = await checkOllamaModelUpdate(m.name, shortDigest);
        manifest.models[m.name] = {
          installedDigest: shortDigest,
          checkedAt: new Date().toISOString(),
          latestDigest: check.latestDigest,
          updateAvailable: check.updateAvailable,
          sizeBytes: m.size,
          snapshotDigest: manifest.models[m.name]?.snapshotDigest,
        };
        if (!states[m.name]) {
          states[m.name] = { name: m.name, lifecycle: "installed", installedDigest: shortDigest, sizeBytes: m.size };
        }
        if (check.updateAvailable) {
          states[m.name].lifecycle = "update-available";
          states[m.name].availableDigest = check.latestDigest;
        }
        results.push({ id: m.name, type: "model", name: m.name, installed: shortDigest, available: check.latestDigest, updateAvailable: check.updateAvailable });
      }
      await saveModelStates(states);
    }
  }
  manifest.schedule.lastFullCheckAt = new Date().toISOString();
  manifest.schedule.nextFullCheckAt = new Date(Date.now() + manifest.schedule.checkIntervalSeconds * 1000).toISOString();
  await saveManifest(manifest);
  const totalUpdates = results.filter((r) => r.updateAvailable).length;
  return res.json({ success: true, results, totalUpdates, checkedAt: manifest.generatedAt });
});

router.get("/updater/self-maintainer", async (_req, res) => {
  return res.json(await getSelfMaintainerSnapshot());
});

router.post("/updater/self-maintainer/radar", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  const snapshot = await runSelfMaintainerRadar({
    dryRunOnly: body["dryRunOnly"] !== false,
    includeNetworkChecks: body["includeNetworkChecks"] === true,
  });
  return res.status(snapshot.success ? 200 : 500).json(snapshot);
});

router.post("/updater/self-maintainer/proposals", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  const request = typeof body["request"] === "string" ? body["request"].trim() : "";
  const files = Array.isArray(body["files"])
    ? body["files"].filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : undefined;
  if (!request) return res.status(400).json({ success: false, message: "request is required" });
  const result = await createSelfImprovementProposal({
    request,
    files,
    dryRunOnly: body["dryRunOnly"] === true,
  });
  return res.status(result.approvalRequired ? 202 : 200).json(result);
});

router.post("/updater/self-maintainer/actions/propose", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  const action = typeof body["action"] === "string" ? body["action"] as any : "stage";
  const targetIds = Array.isArray(body["targetIds"])
    ? body["targetIds"].filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : undefined;
  const result = await proposeSelfMaintainerAction({
    action,
    targetIds,
    dryRunOnly: body["dryRunOnly"] === true,
    approvalId: typeof body["approvalId"] === "string" ? body["approvalId"] : undefined,
    details: typeof body["details"] === "object" && body["details"] !== null ? body["details"] as Record<string, unknown> : undefined,
  });
  return res.status(result.status === "blocked" ? 423 : result.approvalRequired ? 202 : 200).json(result);
});

router.post("/updater/update", agentExecGuard("run updater"), async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  const { ids, toolIds, type } = body;
  const selectedIds = Array.isArray(ids) ? ids : Array.isArray(toolIds) ? toolIds : [];
  if (!selectedIds.length) return res.status(400).json({ success: false, message: "ids required" });
  const result = await proposeSelfMaintainerAction({
    action: "stage",
    targetIds: selectedIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0),
    sourceKind: type === "model" ? "model" : "package_dependency",
    dryRunOnly: false,
    approvalId: typeof body["approvalId"] === "string" ? body["approvalId"] : undefined,
    details: {
      legacyRoute: "/updater/update",
      noWingetPipOrOllamaCommandExecuted: true,
      requestedType: type ?? "unknown",
    },
  });
  return res.status(result.approvalRequired ? 202 : result.status === "blocked" ? 423 : 200).json({
    ...result,
    launched: [],
    message: result.message,
  });
});

router.post("/updater/rollback/:modelName", agentEditsGuard((req) => `prepare rollback for model ${String(req.params.modelName)}`), async (req, res) => {
  const modelName = decodeURIComponent(String(req.params.modelName));
  const manifest = await loadManifest();
  const states = await loadModelStates();
  const entry = manifest.models[modelName];
  const state = states[modelName];
  if (!entry?.snapshotDigest) return res.status(400).json({ success: false, message: "No snapshot available for rollback" });
  const snapFile = path.join(SNAPSHOTS_DIR, `${entry.snapshotDigest}.json`);
  if (!existsSync(snapFile)) return res.status(404).json({ success: false, message: "Snapshot file missing" });
  const snap = JSON.parse(await readFile(snapFile, "utf-8"));
  if (state) state.lifecycle = "rollback-available";
  await saveModelStates(states);
  return res.json({
    success: true,
    snapshotDigest: snap.digest,
    message: `Rollback snapshot found (digest: ${snap.digest}). To restore, re-pull the model with the specific tag or use: ollama pull ${modelName}`,
    rollbackCmd: `ollama pull ${modelName}`,
  });
});

router.get("/updater/model-states", async (_req, res) => {
  const states = await loadModelStates();
  if (await ollamaReachable()) {
    const running = await fetchJson<{ models?: Array<{ name: string }> }>(`${await getOllamaUrl()}/api/ps`, undefined, 5000).catch(() => ({ models: [] as Array<{ name: string }> }));
    const runningSet = new Set((running.models || []).map((m) => m.name));
    for (const [name, state] of Object.entries(states)) {
      if (runningSet.has(name) && (state as any).lifecycle !== "running") {
        (state as any).lifecycle = "running";
      } else if (!runningSet.has(name) && (state as any).lifecycle === "running") {
        (state as any).lifecycle = "stopped";
      }
    }
    await saveModelStates(states);
  }
  return res.json({ states });
});

router.patch("/updater/model-states/:modelName", agentEditsGuard((req) => `update lifecycle state for model ${String(req.params.modelName)}`), async (req, res) => {
  const modelName = decodeURIComponent(String(req.params.modelName));
  const { lifecycle, lastError } = req.body;
  const states = await loadModelStates();
  if (!states[modelName]) states[modelName] = { name: modelName, lifecycle: "not-installed" };
  states[modelName].lifecycle = lifecycle;
  if (lastError) states[modelName].lastError = lastError;
  await saveModelStates(states);
  return res.json({ success: true, state: states[modelName] });
});

router.post("/updater/backup-settings", agentEditsGuard("backup updater settings"), async (_req, res) => {
  const backupId = `backup-${Date.now()}`;
  const backupDir = path.join(SNAPSHOTS_DIR, backupId);
  await ensureDir(backupDir);
  const filesToBackup = [
    path.join(TOOLS_DIR, "config.json"),
    modelRolesService.filePath,
    path.join(TOOLS_DIR, "projects.json"),
    path.join(TOOLS_DIR, "integrations-state.json"),
    path.join(TOOLS_DIR, "updater-manifest.json"),
  ];
  const backed: string[] = [];
  for (const f of filesToBackup) {
    if (existsSync(f)) {
      await copyFile(f, path.join(backupDir, path.basename(f)));
      backed.push(path.basename(f));
    }
  }
  return res.json({ success: true, backupId, backupDir, files: backed });
});

router.get("/updater/schedule", async (_req, res) => {
  const manifest = await loadManifest();
  return res.json({ schedule: manifest.schedule });
});

router.put("/updater/schedule", agentEditsGuard("update updater schedule"), async (req, res) => {
  const manifest = await loadManifest();
  manifest.schedule = { ...manifest.schedule, ...req.body };
  await saveManifest(manifest);
  return res.json({ success: true, schedule: manifest.schedule });
});

export default router;
