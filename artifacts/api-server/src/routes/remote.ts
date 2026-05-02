import { Router } from "express";
import path from "path";
import os from "os";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import {
  commandExists,
  maybeVersion,
  toolsRoot,
  ensureDir,
} from "../lib/runtime.js";
import { writeManagedJson, writeManagedFile } from "../lib/snapshot-manager.js";
import {
  getDistributedNodeConfig,
  runDistributedNodeHeartbeat,
  updateDistributedNodeConfig,
  authorizeDistributedRequest,
  validateDistributedToken,
  rotateDistributedAuthToken,
} from "../lib/network-proxy.js";
import { agentEditsGuard, agentExecGuard } from "../lib/route-guards.js";
import {
  listEdgeNodes,
  getEdgeNode,
  upsertEdgeNode,
  deleteEdgeNode,
  checkEdgeNodeHealth,
  evaluateEdgeAction,
  getGamingPcRoleDescription,
  EDGE_NODE_SOURCE_OF_TRUTH,
} from "../lib/edge-node.js";

const router = Router();
const REMOTE_DIR = path.join(toolsRoot(), "remote");
const REMOTE_SETTINGS = path.join(REMOTE_DIR, "remote-settings.json");

interface RemoteSettings {
  browserIdePort: number;
  openvscodePort: number;
  litellmPort: number;
  webuiPort: number;
  preferredBrowserIde: string;
  tunnelProvider: string;
  hostnameWebUi: string;
  hostnameIde: string;
}

async function loadSettings(): Promise<RemoteSettings> {
  const defaults: RemoteSettings = {
    browserIdePort: 8443,
    openvscodePort: 3000,
    litellmPort: 4000,
    webuiPort: 8080,
    preferredBrowserIde: "openvscode-server",
    tunnelProvider: "cloudflare",
    hostnameWebUi: "ai.example.com",
    hostnameIde: "code.example.com",
  };
  try {
    if (existsSync(REMOTE_SETTINGS)) {
      return JSON.parse(await readFile(REMOTE_SETTINGS, "utf-8"));
    }
  } catch {}
  return defaults;
}

router.get("/remote/overview", async (_req, res) => {
  const [settings, distributedNode, heartbeat] = await Promise.all([
    loadSettings(),
    getDistributedNodeConfig(),
    runDistributedNodeHeartbeat(),
  ]);
  const tools = [
    {
      id: "tailscale",
      label: "Tailscale",
      installed: await commandExists("tailscale"),
      version: await maybeVersion("tailscale version"),
      purpose: "Private mesh VPN lane for remote node connectivity",
    },
    {
      id: "zerotier",
      label: "ZeroTier",
      installed: await commandExists("zerotier-cli"),
      version: await maybeVersion("zerotier-cli -v"),
      purpose: "Alternative private overlay network for remote node access",
    },
    {
      id: "cloudflared",
      label: "Cloudflare Tunnel",
      installed: await commandExists("cloudflared"),
      version: await maybeVersion("cloudflared --version"),
      purpose: "Secure browser access without opening inbound ports",
    },
    {
      id: "code-server",
      label: "code-server",
      installed: await commandExists("code-server"),
      version: await maybeVersion("code-server --version"),
      purpose: "Browser IDE fallback",
    },
    {
      id: "openvscode-server",
      label: "OpenVSCode Server",
      installed: await commandExists("openvscode-server"),
      version: await maybeVersion("openvscode-server --version"),
      purpose: "Upstream browser VS Code lane",
    },
    {
      id: "litellm",
      label: "LiteLLM",
      installed: await commandExists("litellm"),
      version: await maybeVersion("litellm --version"),
      purpose: "Model alias / routing gateway",
    },
  ];
  return res.json({
    settings,
    distributedNode,
    heartbeat,
    tools,
    guides: [
      { id: "browser-chat", label: "Browser Chat Access", target: "Open WebUI + Cloudflare Tunnel" },
      { id: "browser-ide", label: "Browser IDE Access", target: "OpenVSCode Server or code-server behind Access" },
      { id: "gateway", label: "Distributed Node Gateway", target: "Tailscale/ZeroTier route + sovereign token handshake" },
    ],
  });
});

router.get("/remote/network", async (_req, res) => {
  const [config, heartbeat] = await Promise.all([getDistributedNodeConfig(), runDistributedNodeHeartbeat()]);
  return res.json({ config, heartbeat });
});

router.put("/remote/network", agentExecGuard("update remote network routing"), async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const config = await updateDistributedNodeConfig({
    mode: body.mode === "remote" ? "remote" : body.mode === "local" ? "local" : undefined,
    provider: body.provider === "zerotier" || body.provider === "custom" ? body.provider : body.provider === "tailscale" ? "tailscale" : undefined,
    localBaseUrl: typeof body.localBaseUrl === "string" ? body.localBaseUrl : undefined,
    remoteHost: typeof body.remoteHost === "string" ? body.remoteHost : undefined,
    remotePort: typeof body.remotePort === "number" ? body.remotePort : undefined,
    remoteProtocol: body.remoteProtocol === "https" ? "https" : body.remoteProtocol === "http" ? "http" : undefined,
    heartbeatPath: typeof body.heartbeatPath === "string" ? body.heartbeatPath : undefined,
    heartbeatIntervalSeconds: typeof body.heartbeatIntervalSeconds === "number" ? body.heartbeatIntervalSeconds : undefined,
    remoteRequestTimeoutMs: typeof body.remoteRequestTimeoutMs === "number" ? body.remoteRequestTimeoutMs : undefined,
    latencyBufferMinMs: typeof body.latencyBufferMinMs === "number" ? body.latencyBufferMinMs : undefined,
    latencyBufferMaxMs: typeof body.latencyBufferMaxMs === "number" ? body.latencyBufferMaxMs : undefined,
    authEnabled: typeof body.authEnabled === "boolean" ? body.authEnabled : undefined,
    authToken: typeof body.authToken === "string" ? body.authToken : undefined,
  });
  const heartbeat = await runDistributedNodeHeartbeat();
  return res.json({ success: true, config, heartbeat });
});

router.get("/remote/network/status", async (_req, res) => {
  const heartbeat = await runDistributedNodeHeartbeat();
  return res.json(heartbeat);
});

// Alias used by the frontend api.ts client
router.get("/remote/heartbeat", async (_req, res) => {
  const heartbeat = await runDistributedNodeHeartbeat();
  return res.json(heartbeat);
});

router.post("/remote/auth/authorize", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return res.status(400).json({ success: false, message: "token required" });
  }
  const success = await authorizeDistributedRequest(res, token);
  if (!success) {
    return res.status(401).json({ success: false, message: "Invalid sovereign handshake token" });
  }
  return res.json({ success: true });
});

router.get("/remote/auth/status", async (req, res) => {
  const authorization = req.header("authorization");
  const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  const headerToken = req.header("x-localai-token")?.trim() || "";
  const cookieToken = typeof (req as any).cookies?.localai_remote_token === "string" ? String((req as any).cookies.localai_remote_token).trim() : "";
  const token = bearerToken || headerToken || cookieToken;
  const authorized = token ? await validateDistributedToken(token) : false;
  return res.json({ authorized });
});

router.post("/remote/auth/rotate", agentExecGuard("rotate remote auth token"), async (_req, res) => {
  const token = await rotateDistributedAuthToken();
  return res.json({ success: true, token });
});

router.post("/remote/generate-configs", agentEditsGuard("generate remote stack config files"), async (req, res) => {
  const incoming = req.body;
  const settings = { ...await loadSettings(), ...incoming };
  const distributedNode = await getDistributedNodeConfig();
  await ensureDir(REMOTE_DIR);
  await writeManagedJson(REMOTE_SETTINGS, settings);

  const cloudflareYaml = `tunnel: REPLACE_WITH_TUNNEL_ID
credentials-file: C:/Users/${os.userInfo().username}/.cloudflared/REPLACE_WITH_TUNNEL_ID.json
ingress:
  - hostname: ${settings.hostnameWebUi}
    service: http://127.0.0.1:${settings.webuiPort}
  - hostname: ${settings.hostnameIde}
    service: http://127.0.0.1:${settings.preferredBrowserIde === "code-server" ? settings.browserIdePort : settings.openvscodePort}
  - service: http_status:404
`;

  const codeServerYaml = `bind-addr: 127.0.0.1:${settings.browserIdePort}
auth: password
cert: false
user-data-dir: ${path.join(os.homedir(), "LocalAI-Tools", "browser-ide", "userdata")}
extensions-dir: ${path.join(os.homedir(), "LocalAI-Tools", "browser-ide", "extensions")}
`;

  const proxyBaseUrl =
    distributedNode.mode === "remote" && distributedNode.remoteHost
      ? `${distributedNode.remoteProtocol}://${distributedNode.remoteHost}:${distributedNode.remotePort}`
      : distributedNode.localBaseUrl;

  const litellmConfig = `model_list:
  - model_name: coding-primary
    litellm_params:
      model: ollama/qwen3-coder:30b
      api_base: ${proxyBaseUrl}
  - model_name: coding-fast
    litellm_params:
      model: ollama/qwen2.5-coder:7b
      api_base: ${proxyBaseUrl}
  - model_name: reasoning
    litellm_params:
      model: ollama/deepseek-r1:8b
      api_base: ${proxyBaseUrl}
  - model_name: embeddings
    litellm_params:
      model: ollama/nomic-embed-text
      api_base: ${proxyBaseUrl}
router_settings:
  fallbacks:
    - ['coding-primary', 'coding-fast']
`;

  const launchBat = `@echo off
setlocal
start "Open WebUI" cmd /c "cd /d %USERPROFILE%\\LocalAI-OpenWebUI\\Scripts && open-webui.exe serve"
start "Browser IDE" cmd /k "${settings.preferredBrowserIde === "code-server" ? `code-server --config %USERPROFILE%\\LocalAI-Tools\\remote\\code-server.yaml` : `openvscode-server --host 127.0.0.1 --port ${settings.openvscodePort}`}"
start "LiteLLM" cmd /k "litellm --config %USERPROFILE%\\LocalAI-Tools\\remote\\litellm-config.yaml --port ${settings.litellmPort}"
`;

  await writeManagedFile(path.join(REMOTE_DIR, "cloudflared-config.yaml"), cloudflareYaml);
  await writeManagedFile(path.join(REMOTE_DIR, "code-server.yaml"), codeServerYaml);
  await writeManagedFile(path.join(REMOTE_DIR, "litellm-config.yaml"), litellmConfig);
  await writeManagedFile(path.join(REMOTE_DIR, "start-remote-stack.bat"), launchBat);

  return res.json({
    success: true,
    directory: REMOTE_DIR,
    files: [
      path.join(REMOTE_DIR, "cloudflared-config.yaml"),
      path.join(REMOTE_DIR, "code-server.yaml"),
      path.join(REMOTE_DIR, "litellm-config.yaml"),
      path.join(REMOTE_DIR, "start-remote-stack.bat"),
      REMOTE_SETTINGS,
    ],
  });
});

// ── Edge Node Registry ────────────────────────────────────────────────────────

router.get("/edge-nodes/source-of-truth", (_req, res) => {
  return res.json({ sourceOfTruth: EDGE_NODE_SOURCE_OF_TRUTH.trim() });
});

router.get("/edge-nodes/gaming-pc/role", (_req, res) => {
  return res.json(getGamingPcRoleDescription());
});

router.get("/edge-nodes", (_req, res) => {
  const nodes = listEdgeNodes();
  return res.json({ nodes, count: nodes.length });
});

router.post("/edge-nodes", (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }
  const profile = upsertEdgeNode({
    name,
    nodeType: body.nodeType,
    roles: Array.isArray(body.roles) ? body.roles : undefined,
    endpoint: typeof body.endpoint === "string" ? body.endpoint.trim() : undefined,
    authType: body.authType,
    isGamingPc: body.isGamingPc === true,
    alwaysOn: body.alwaysOn === true,
    description: typeof body.description === "string" ? body.description.trim() : undefined,
  });
  return res.status(201).json({ profile });
});

router.get("/edge-nodes/:id", (req, res) => {
  const node = getEdgeNode(req.params.id);
  if (!node) return res.status(404).json({ error: "Node not found" });
  return res.json({ profile: node });
});

router.put("/edge-nodes/:id", (req, res) => {
  const existing = getEdgeNode(req.params.id);
  if (!existing) return res.status(404).json({ error: "Node not found" });
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const name = typeof body.name === "string" ? body.name.trim() : existing.name;
  if (!name) return res.status(400).json({ error: "name cannot be empty" });
  const profile = upsertEdgeNode({
    id: req.params.id,
    name,
    nodeType: body.nodeType,
    roles: Array.isArray(body.roles) ? body.roles : undefined,
    endpoint: typeof body.endpoint === "string" ? body.endpoint.trim() : undefined,
    authType: body.authType,
    isGamingPc: typeof body.isGamingPc === "boolean" ? body.isGamingPc : undefined,
    alwaysOn: typeof body.alwaysOn === "boolean" ? body.alwaysOn : undefined,
    description: typeof body.description === "string" ? body.description.trim() : undefined,
  });
  return res.json({ profile });
});

router.delete("/edge-nodes/:id", (req, res) => {
  const removed = deleteEdgeNode(req.params.id);
  if (!removed) return res.status(404).json({ error: "Node not found" });
  return res.json({ success: true });
});

router.post("/edge-nodes/:id/health-check", async (req, res) => {
  const node = getEdgeNode(req.params.id);
  if (!node) return res.status(404).json({ error: "Node not found" });
  const result = await checkEdgeNodeHealth(req.params.id);
  return res.json(result);
});

router.post("/edge-nodes/:id/capabilities/:capabilityId/evaluate", (req, res) => {
  const result = evaluateEdgeAction(req.params.id, req.params.capabilityId);
  const status = result.requiresApproval ? 202 : 200;
  return res.status(status).json(result);
});

// ── Phase 14B: Home Autopilot ─────────────────────────────────────────────────

import {
  HOME_AUTOPILOT_SOURCE_OF_TRUTH,
  getHomeAutopilotStatus,
  getDefaultHaProfile,
  getHaProfile,
  upsertHaProfile,
  getDefaultMqttProfile,
  upsertMqttProfile,
  listHomeDevices,
  getHomeDevice,
  upsertHomeDevice,
  evaluateHaAction,
  evaluateMqttPublish,
  evaluateDeviceAction,
  type HomeDeviceType,
  type HomeDeviceProvider,
  type HomeActionRisk,
} from "../lib/home-autopilot.js";

router.get("/home-autopilot/source-of-truth", (_req, res) => {
  res.json({ sourceOfTruth: HOME_AUTOPILOT_SOURCE_OF_TRUTH });
});

router.get("/home-autopilot/status", (_req, res) => {
  const status = getHomeAutopilotStatus();
  res.json(status);
});

// ── HA routes ─────────────────────────────────────────────────────────────────

router.get("/home-autopilot/ha/profile", (_req, res) => {
  const profile = getDefaultHaProfile();
  if (!profile) {
    return res.json({ profile: null, configured: false, message: "Home Assistant not configured" });
  }
  return res.json({ profile, configured: profile.configured });
});

router.post("/home-autopilot/ha/profile", (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const name = typeof body.name === "string" && body.name ? body.name : "Home Assistant";
  const profile = upsertHaProfile({
    id:              typeof body.id === "string"             ? body.id           : undefined,
    name,
    endpoint:        typeof body.endpoint === "string"       ? body.endpoint     : undefined,
    haMcpEnabled:    typeof body.haMcpEnabled === "boolean"  ? body.haMcpEnabled : undefined,
    haMcpProfile:    (typeof body.haMcpProfile === "object" && body.haMcpProfile !== null)
                       ? body.haMcpProfile as Record<string, unknown> : undefined,
    entityAllowlist: Array.isArray(body.entityAllowlist)     ? body.entityAllowlist : undefined,
    configured:      typeof body.configured === "boolean"    ? body.configured   : undefined,
  });
  return res.status(201).json({ profile });
});

router.post("/home-autopilot/ha/entities/:entityId/evaluate", (req, res) => {
  const { entityId } = req.params;
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const action = typeof body.action === "string" ? body.action : "read_state";
  const profileId = typeof body.profileId === "string" ? body.profileId : "";

  let resolvedProfileId = profileId;
  if (!resolvedProfileId) {
    const def = getDefaultHaProfile();
    if (!def) {
      return res.json({ result: { allowed: false, riskTier: "blocked", requiresApproval: false, message: "Home Assistant not configured", executed: false } });
    }
    resolvedProfileId = def.id;
  }

  const result = evaluateHaAction(resolvedProfileId, entityId, action);
  return res.status(result.requiresApproval ? 202 : 200).json({ result });
});

// ── MQTT routes ───────────────────────────────────────────────────────────────

router.get("/home-autopilot/mqtt/profile", (_req, res) => {
  const profile = getDefaultMqttProfile();
  if (!profile) {
    return res.json({ profile: null, configured: false, message: "MQTT not configured" });
  }
  return res.json({ profile, configured: profile.configured });
});

router.post("/home-autopilot/mqtt/profile", (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const name = typeof body.name === "string" && body.name ? body.name : "MQTT Broker";
  const profile = upsertMqttProfile({
    id:             typeof body.id === "string"                ? body.id           : undefined,
    name,
    brokerHost:     typeof body.brokerHost === "string"        ? body.brokerHost   : undefined,
    brokerPort:     typeof body.brokerPort === "number"        ? body.brokerPort   : undefined,
    topicAllowlist: Array.isArray(body.topicAllowlist)         ? body.topicAllowlist : undefined,
    configured:     typeof body.configured === "boolean"       ? body.configured   : undefined,
  });
  return res.status(201).json({ profile });
});

router.post("/home-autopilot/mqtt/topics/evaluate", (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const topic = typeof body.topic === "string" ? body.topic : "";
  if (!topic) return res.status(400).json({ error: "topic is required" });
  const profileId = typeof body.profileId === "string" ? body.profileId : "";
  const result = evaluateMqttPublish(profileId, topic);
  return res.status(result.requiresApproval ? 202 : 200).json({ result });
});

// ── Device routes ─────────────────────────────────────────────────────────────

router.get("/home-autopilot/devices", (_req, res) => {
  const devices = listHomeDevices();
  return res.json({ devices, count: devices.length });
});

router.post("/home-autopilot/devices", (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  if (typeof body.name !== "string" || !body.name) {
    return res.status(400).json({ error: "name is required" });
  }
  const device = upsertHomeDevice({
    name:         body.name as string,
    deviceType:   typeof body.deviceType === "string"  ? body.deviceType as HomeDeviceType   : undefined,
    provider:     typeof body.provider === "string"    ? body.provider as HomeDeviceProvider  : undefined,
    endpoint:     typeof body.endpoint === "string"    ? body.endpoint   : undefined,
    configured:   typeof body.configured === "boolean" ? body.configured : undefined,
    actionPolicy: (typeof body.actionPolicy === "object" && body.actionPolicy !== null)
                    ? body.actionPolicy as Record<string, HomeActionRisk> : undefined,
  });
  return res.status(201).json({ device });
});

router.get("/home-autopilot/devices/:deviceId", (req, res) => {
  const device = getHomeDevice(req.params.deviceId);
  if (!device) return res.status(404).json({ error: "Device not found" });
  return res.json({ device });
});

router.post("/home-autopilot/devices/:deviceId/action/evaluate", (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const action = typeof body.action === "string" ? body.action : "status_read";
  const result = evaluateDeviceAction(req.params.deviceId, action);
  return res.status(result.requiresApproval ? 202 : 200).json({ result });
});

export default router;
