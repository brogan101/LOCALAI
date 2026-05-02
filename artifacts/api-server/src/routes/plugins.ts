import { Router } from "express";
import { readdir, readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { upsertPluginState } from "../lib/platform-foundation.js";
import { agentEditsGuard, agentExecGuard } from "../lib/route-guards.js";
import {
  getDockerMcpGatewayStatus,
  getDockerMcpProfile,
  proposeDockerMcpGatewayConfig,
  saveDockerMcpProfile,
} from "../lib/docker-mcp-gateway.js";
import {
  discoverClawSkill,
  getClawGatewayProfile,
  getClawGatewayStatus,
  proposeClawGatewayConfig,
  reviewClawSkill,
  saveClawGatewayProfile,
} from "../lib/claw-gateway.js";
import {
  getBrowserProfile,
  getPlaywrightMcpStatus,
  proposeBrowserAction,
  saveBrowserProfile,
} from "../lib/playwright-browser.js";
import {
  getDesktopProfile,
  getDesktopAutomationStatus,
  proposeDesktopAction,
  saveDesktopProfile,
} from "../lib/desktop-automation.js";
import {
  getCodingAgentProfile,
  getCodingAgentStatus,
  proposeCodingTask,
  saveCodingAgentProfile,
} from "../lib/coding-agent.js";
import {
  buildToolRegistry,
  evaluateToolCall,
  getToolRegistrySourceOfTruth,
  setToolEnabled,
  type ToolCallResult,
  type ToolPermissionScope,
} from "../lib/tool-registry.js";
import { listIntegrationToolSources } from "./integrations.js";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// plugins/ directory lives at repo root (four levels up from src/routes/)
const PLUGINS_DIR = path.resolve(__dirname, "../../../../../plugins");

export interface PluginManifest {
  name:        string;
  version:     string;
  description: string;
  author:      string;
  routes:      Array<{ method: string; path: string; handler: string }>;
  pages:       Array<{ label: string; path: string; component: string }>;
  permissions: {
    fileAccess: "none" | "read-only" | "read-write";
  };
  enabled:     boolean;
  manifestPath: string;
}

async function loadPlugins(): Promise<PluginManifest[]> {
  if (!existsSync(PLUGINS_DIR)) return [];
  let files: string[];
  try {
    const entries = await readdir(PLUGINS_DIR, { withFileTypes: true });
    files = entries
      .filter(e => e.isFile() && e.name.endsWith(".json"))
      .map(e => path.join(PLUGINS_DIR, e.name));
  } catch {
    return [];
  }
  const plugins: PluginManifest[] = [];
  for (const file of files) {
    try {
      const raw  = await readFile(file, "utf-8");
      const data = JSON.parse(raw) as Partial<PluginManifest>;
      plugins.push({
        name:         data.name        ?? path.basename(file, ".json"),
        version:      data.version     ?? "0.0.0",
        description:  data.description ?? "",
        author:       data.author      ?? "unknown",
        routes:       data.routes      ?? [],
        pages:        data.pages       ?? [],
        permissions:  data.permissions ?? { fileAccess: "read-only" },
        enabled:      data.enabled     !== false,
        manifestPath: file,
      });
      upsertPluginState(data.name ?? path.basename(file, ".json"), {
        enabled: data.enabled !== false,
        installed: true,
        permissions: data.permissions ?? { fileAccess: "read-only" },
        manifestPath: file,
      });
    } catch { /* skip malformed manifests */ }
  }
  return plugins;
}

function statusForToolResult(result: ToolCallResult): number {
  if (result.status === "approval_required") return 202;
  if (result.status === "not_configured") return 404;
  if (result.status === "disabled" || result.status === "blocked" || result.status === "denied") return 403;
  return result.success ? 200 : 409;
}

function readScopes(value: unknown): ToolPermissionScope[] {
  if (!Array.isArray(value)) return [];
  return value.filter((scope): scope is ToolPermissionScope => typeof scope === "string") as ToolPermissionScope[];
}

async function loadToolRegistry(skipLiveChecks = false, includeHidden = false) {
  const [plugins, integrations] = await Promise.all([
    loadPlugins(),
    listIntegrationToolSources({ liveChecks: !skipLiveChecks, persist: !skipLiveChecks }),
  ]);
  return buildToolRegistry({ plugins, integrations }, { includeHidden });
}

router.get("/plugins", async (_req, res) => {
  const plugins = await loadPlugins();
  return res.json({ success: true, plugins, pluginsDir: PLUGINS_DIR });
});

router.get("/tools", async (req, res) => {
  const skipLiveChecks = req.query["skipLiveChecks"] === "true";
  const includeHidden = req.query["includeHidden"] === "true";
  const tools = await loadToolRegistry(skipLiveChecks, includeHidden);
  return res.json({
    success: true,
    sourceOfTruth: getToolRegistrySourceOfTruth(),
    tools,
    rules: {
      phase: "09A",
      executionAdaptersEnabled: false,
      defaultHighRiskState: "disabled",
      unregisteredToolStatus: "not_configured",
      deniedOrUnapprovedExecution: "blocked",
      dockerMcpGateway: {
        defaultState: "not_configured",
        isolationMode: "docker_mcp_gateway",
        hiddenUnlessAllowlisted: true,
        blockSecretsDefault: true,
        blockNetworkDefault: true,
        realContainerExecutionEnabled: false,
      },
      clawGateway: {
        defaultState: "not_configured",
        highRiskDefaultState: "disabled",
        skillInstallUpdateMode: "proposal_only",
        unknownSkillsBlocked: true,
        quarantinedSkillsBlocked: true,
        externalCommunicationApprovalRequired: true,
        secretsExposedByDefault: false,
        realGatewayExecutionEnabled: false,
      },
    },
  });
});

router.get("/tools/docker-mcp/status", async (req, res) => {
  const live = req.query["live"] === "true";
  const status = await getDockerMcpGatewayStatus({ dryRun: !live });
  return res.json({ success: true, status });
});

router.get("/tools/docker-mcp/profile", async (_req, res) => {
  return res.json({ success: true, profile: getDockerMcpProfile() });
});

router.put("/tools/docker-mcp/profile", agentEditsGuard("update Docker MCP Gateway profile"), async (req, res) => {
  const profile = saveDockerMcpProfile(
    typeof req.body?.profile === "object" && req.body.profile !== null ? req.body.profile : req.body ?? {},
    "api",
  );
  return res.json({ success: true, profile, executed: false });
});

router.post("/tools/docker-mcp/config/propose", async (req, res) => {
  const proposal = proposeDockerMcpGatewayConfig({
    networkRequired: req.body?.networkRequired === true,
    imageRef: typeof req.body?.imageRef === "string" ? req.body.imageRef : undefined,
  });
  return res.json({ success: true, proposal, executed: false });
});

router.post("/tools/docker-mcp/run/propose", async (req, res) => {
  const toolId = typeof req.body?.toolId === "string" ? req.body.toolId : "";
  const tools = await loadToolRegistry(true, true);
  const result = evaluateToolCall({
    toolId,
    action: typeof req.body?.action === "string" ? req.body.action : "propose_run",
    requestedScopes: readScopes(req.body?.requestedScopes),
    input: typeof req.body?.input === "object" && req.body.input !== null ? req.body.input : {},
    dryRun: true,
    sandboxSatisfied: req.body?.sandboxSatisfied === true,
    registry: tools,
  });
  return res.status(statusForToolResult(result)).json(result);
});

router.get("/tools/claw-gateway/status", async (_req, res) => {
  return res.json({ success: true, status: getClawGatewayStatus() });
});

router.get("/tools/claw-gateway/profile", async (_req, res) => {
  return res.json({ success: true, profile: getClawGatewayProfile() });
});

router.put("/tools/claw-gateway/profile", agentEditsGuard("update OpenClaw/NemoClaw gateway profile"), async (req, res) => {
  const profile = saveClawGatewayProfile(
    typeof req.body?.profile === "object" && req.body.profile !== null ? req.body.profile : req.body ?? {},
    "api",
  );
  return res.json({ success: true, profile, executed: false });
});

router.post("/tools/claw-gateway/config/propose", async (req, res) => {
  const proposal = proposeClawGatewayConfig({
    gatewayType: typeof req.body?.gatewayType === "string" ? req.body.gatewayType : undefined,
    sourceRef: typeof req.body?.sourceRef === "string" ? req.body.sourceRef : undefined,
    sourceKind: typeof req.body?.sourceKind === "string" ? req.body.sourceKind : undefined,
  });
  return res.json({ success: true, proposal, executed: false });
});

router.post("/tools/claw-gateway/skills/discover", async (req, res) => {
  const skill = discoverClawSkill(typeof req.body === "object" && req.body !== null ? req.body : {});
  return res.json({
    success: true,
    skill,
    executed: false,
    message: "OpenClaw/NemoClaw skill discovery is dry-run/proposal only; no skill was installed or executed.",
  });
});

router.post("/tools/claw-gateway/skills/review", agentEditsGuard("review OpenClaw/NemoClaw gateway skill"), async (req, res) => {
  const skillId = typeof req.body?.skillId === "string" ? req.body.skillId : "";
  const decision = req.body?.decision === "approve" || req.body?.decision === "reject" || req.body?.decision === "quarantine"
    ? req.body.decision
    : "quarantine";
  if (!skillId) {
    return res.status(400).json({ success: false, executed: false, message: "skillId is required." });
  }
  const result = reviewClawSkill({
    skillId,
    decision,
    sourceRef: typeof req.body?.sourceRef === "string" ? req.body.sourceRef : undefined,
  }, "api");
  return res.json({ success: true, ...result });
});

router.post("/tools/claw-gateway/action/propose", async (req, res) => {
  const toolId = typeof req.body?.toolId === "string" ? req.body.toolId : "";
  const tools = await loadToolRegistry(true, true);
  const result = evaluateToolCall({
    toolId,
    action: typeof req.body?.action === "string" ? req.body.action : "propose_action",
    requestedScopes: readScopes(req.body?.requestedScopes),
    input: typeof req.body?.input === "object" && req.body.input !== null ? req.body.input : {},
    dryRun: req.body?.dryRun !== false,
    sandboxSatisfied: req.body?.sandboxSatisfied === true,
    registry: tools,
  });
  return res.status(statusForToolResult(result)).json(result);
});

router.get("/tools/browser-automation/status", async (req, res) => {
  const live = req.query["live"] === "true";
  const status = await getPlaywrightMcpStatus({ dryRun: !live });
  return res.json({ success: true, status });
});

router.get("/tools/browser-automation/profile", async (_req, res) => {
  return res.json({ success: true, profile: getBrowserProfile() });
});

router.put("/tools/browser-automation/profile", agentEditsGuard("update browser automation profile"), async (req, res) => {
  const profile = saveBrowserProfile(
    typeof req.body?.profile === "object" && req.body.profile !== null ? req.body.profile : req.body ?? {},
    "api",
  );
  return res.json({ success: true, profile, executed: false });
});

router.post("/tools/browser-automation/navigate/propose", async (req, res) => {
  const proposal = proposeBrowserAction({
    action: "navigate",
    targetUrl: typeof req.body?.targetUrl === "string" ? req.body.targetUrl : undefined,
  });
  return res.json({ success: true, proposal, executed: false });
});

router.post("/tools/browser-automation/action/propose", async (req, res) => {
  const action = typeof req.body?.action === "string" ? req.body.action : "navigate";
  const proposal = proposeBrowserAction({
    action,
    targetUrl: typeof req.body?.targetUrl === "string" ? req.body.targetUrl : undefined,
  });
  const toolId = typeof req.body?.toolId === "string" ? req.body.toolId : `browser.playwright-mcp.${action}`;
  const tools = await loadToolRegistry(true, true);
  const result = evaluateToolCall({
    toolId,
    action,
    requestedScopes: readScopes(req.body?.requestedScopes),
    input: typeof req.body?.input === "object" && req.body.input !== null ? req.body.input : {},
    dryRun: req.body?.dryRun !== false,
    sandboxSatisfied: req.body?.sandboxSatisfied === true,
    registry: tools,
  });
  return res.status(statusForToolResult(result)).json({ ...result, proposal });
});

router.get("/tools/desktop-automation/status", async (req, res) => {
  const live = req.query["live"] === "true";
  const status = await getDesktopAutomationStatus({ dryRun: !live });
  return res.json({ success: true, status });
});

router.get("/tools/desktop-automation/profile", async (_req, res) => {
  return res.json({ success: true, profile: getDesktopProfile() });
});

router.put("/tools/desktop-automation/profile", agentEditsGuard("update desktop automation profile"), async (req, res) => {
  const profile = saveDesktopProfile(
    typeof req.body?.profile === "object" && req.body.profile !== null ? req.body.profile : req.body ?? {},
    "api",
  );
  return res.json({ success: true, profile, executed: false });
});

router.post("/tools/desktop-automation/action/propose", async (req, res) => {
  const action = typeof req.body?.action === "string" ? req.body.action : "list_windows";
  const proposal = proposeDesktopAction({
    action,
    targetApp: typeof req.body?.targetApp === "string" ? req.body.targetApp : undefined,
  });
  const toolId = typeof req.body?.toolId === "string" ? req.body.toolId : `desktop.worldgui.${action}`;
  const tools = await loadToolRegistry(true, true);
  const result = evaluateToolCall({
    toolId,
    action,
    requestedScopes: readScopes(req.body?.requestedScopes),
    input: typeof req.body?.input === "object" && req.body.input !== null ? req.body.input : {},
    dryRun: req.body?.dryRun !== false,
    sandboxSatisfied: req.body?.sandboxSatisfied === true,
    registry: tools,
  });
  return res.status(statusForToolResult(result)).json({ ...result, proposal });
});

// ---------------------------------------------------------------------------
// Coding Agent routes  (Phase 10)
// ---------------------------------------------------------------------------

router.get("/tools/coding-agent/status", (_req, res) => {
  const status = getCodingAgentStatus(false);
  return res.json({ success: true, status });
});

router.get("/tools/coding-agent/profile", (_req, res) => {
  const profile = getCodingAgentProfile();
  return res.json({ success: true, profile });
});

router.put("/tools/coding-agent/profile", agentEditsGuard(() => "update coding agent profile"), (req, res) => {
  try {
    const body    = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
    const profile = saveCodingAgentProfile(body as Parameters<typeof saveCodingAgentProfile>[0]);
    return res.json({ success: true, profile });
  } catch (err) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }
});

router.post("/tools/coding-agent/task/propose", async (req, res) => {
  const body          = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
  const request       = typeof body["request"]       === "string" ? (body["request"] as string).trim()       : "";
  const workspacePath = typeof body["workspacePath"] === "string" ? (body["workspacePath"] as string).trim() : "";
  const targetFiles   = Array.isArray(body["targetFiles"])
    ? (body["targetFiles"] as unknown[]).filter((f): f is string => typeof f === "string")
    : undefined;
  if (!request)       return res.status(400).json({ success: false, message: "request is required" });
  if (!workspacePath) return res.status(400).json({ success: false, message: "workspacePath is required" });
  try {
    const result = await proposeCodingTask({ request, workspacePath, targetFiles });
    return res.status(result.success ? 200 : 202).json({ success: result.success, proposal: result.proposal });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.get("/tools/:id", async (req, res) => {
  const skipLiveChecks = req.query["skipLiveChecks"] === "true";
  const includeHidden = req.query["includeHidden"] === "true";
  const tools = await loadToolRegistry(skipLiveChecks, includeHidden);
  const tool = tools.find(candidate => candidate.id === req.params["id"]);
  if (!tool) {
    return res.status(404).json({
      success: false,
      status: "not_configured",
      blocked: true,
      executed: false,
      message: "Tool is not registered in the Phase 07A registry.",
    });
  }
  return res.json({ success: true, sourceOfTruth: getToolRegistrySourceOfTruth(), tool });
});

router.put("/tools/:id/enabled", agentEditsGuard((req) => `set tool ${req.params.id} enabled state`), async (req, res) => {
  const tools = await loadToolRegistry(true);
  const toolId = String(req.params["id"]);
  const tool = tools.find(candidate => candidate.id === toolId);
  if (!tool) {
    return res.status(404).json({
      success: false,
      status: "not_configured",
      blocked: true,
      executed: false,
      message: "Tool is not registered in the Phase 07A registry.",
    });
  }
  const enabled = req.body?.enabled === true;
  const updated = setToolEnabled(tool, enabled);
  return res.json({ success: true, tool: updated, executed: false });
});

router.post("/tools/:id/dry-run", async (req, res) => {
  const tools = await loadToolRegistry(true);
  const toolId = String(req.params["id"]);
  const result = evaluateToolCall({
    toolId,
    action: typeof req.body?.action === "string" ? req.body.action : "inspect",
    requestedScopes: readScopes(req.body?.requestedScopes),
    input: typeof req.body?.input === "object" && req.body.input !== null ? req.body.input : {},
    dryRun: true,
    sandboxSatisfied: req.body?.sandboxSatisfied === true,
    registry: tools,
  });
  return res.status(statusForToolResult(result)).json(result);
});

router.post("/tools/:id/execute", agentExecGuard((req) => `execute registered tool ${req.params.id}`), async (req, res) => {
  const tools = await loadToolRegistry(true);
  const toolId = String(req.params["id"]);
  const result = evaluateToolCall({
    toolId,
    action: typeof req.body?.action === "string" ? req.body.action : "execute",
    requestedScopes: readScopes(req.body?.requestedScopes),
    input: typeof req.body?.input === "object" && req.body.input !== null ? req.body.input : {},
    approvalId: typeof req.body?.approvalId === "string" ? req.body.approvalId : undefined,
    dryRun: req.body?.dryRun === true,
    sandboxSatisfied: req.body?.sandboxSatisfied === true,
    registry: tools,
    executeAdapterAvailable: false,
  });
  return res.status(statusForToolResult(result)).json(result);
});

router.get("/plugins/:name", async (req, res) => {
  const plugins = await loadPlugins();
  const plugin  = plugins.find(p => p.name === req.params["name"]!);
  if (!plugin) return res.status(404).json({ success: false, message: "Plugin not found" });
  return res.json({ success: true, plugin });
});

router.get("/plugins/:name/manifest", async (req, res) => {
  const plugins = await loadPlugins();
  const plugin  = plugins.find(p => p.name === req.params["name"]!);
  if (!plugin) return res.status(404).json({ success: false, message: "Plugin not found" });
  try {
    const raw = await readFile(plugin.manifestPath, "utf-8");
    return res.type("json").send(raw);
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
