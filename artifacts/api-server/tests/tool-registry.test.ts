import assert from "node:assert/strict";
import express from "express";
import pluginsRoute from "../src/routes/plugins.js";
import {
  buildToolRegistry,
  evaluateToolCall,
  type ToolRecord,
} from "../src/lib/tool-registry.js";
import { denyRequest } from "../src/lib/approval-queue.js";
import { listMissionReplayEvents } from "../src/lib/mission-replay.js";
import { listAuditEvents } from "../src/lib/platform-foundation.js";

process.env.LOCALAI_TEST_AGENT_PERMISSIONS = JSON.stringify({
  allowAgentExec: true,
  allowAgentEdits: true,
  allowAgentSelfHeal: false,
  allowAgentRefactor: false,
});

const baseTool: ToolRecord = {
  id: "test.readonly-tool",
  displayName: "Test Readonly Tool",
  provider: "test",
  type: "local-script",
  sourceRef: "test://readonly",
  sourceKind: "phase07a_foundation",
  installStatus: "installed",
  configuredStatus: "configured",
  enabled: true,
  runtimeModeCompatibility: ["Lightweight"],
  permissionScopes: ["filesystem.read"],
  networkAccess: "none",
  filesystemAccess: "read",
  commandExecutionRequired: false,
  secretsRequired: false,
  approvalRequirement: "none",
  sandboxMode: "none",
  riskLevel: "low",
  auditReplayBehavior: "record_decision_only",
  capabilities: ["test"],
  actions: ["inspect"],
  metadata: {},
};

const commandTool: ToolRecord = {
  ...baseTool,
  id: "test.command-tool",
  displayName: "Test Command Tool",
  sourceRef: "test://command",
  permissionScopes: ["commands"],
  filesystemAccess: "none",
  commandExecutionRequired: true,
  approvalRequirement: "required",
  riskLevel: "high",
  auditReplayBehavior: "record_decision_and_approval",
  actions: ["execute"],
};

function inject(method: string, routePath: string, body?: unknown): Promise<{ status: number; payload: any }> {
  const app = express();
  app.use(express.json());
  app.use(pluginsRoute);
  return new Promise((resolve, reject) => {
    const request = {
      method,
      url: routePath,
      originalUrl: routePath,
      baseUrl: "",
      path: routePath.split("?")[0],
      headers: { "content-type": "application/json" },
      body,
      query: Object.fromEntries(new URLSearchParams(routePath.split("?")[1] ?? "")),
      get(name: string) {
        return (this.headers as Record<string, string>)[name.toLowerCase()];
      },
      header(name: string) {
        return this.get(name);
      },
    };
    let statusCode = 200;
    const response = {
      status(code: number) {
        statusCode = code;
        return response;
      },
      json(payload: any) {
        resolve({ status: statusCode, payload });
        return response;
      },
      send(payload: any) {
        resolve({ status: statusCode, payload });
        return response;
      },
      end(payload?: any) {
        resolve({ status: statusCode, payload });
        return response;
      },
      setHeader() {},
      getHeader() {
        return undefined;
      },
      removeHeader() {},
    };
    app.handle(request as any, response as any, (error: unknown) => {
      if (error) reject(error);
      else resolve({ status: 404, payload: { success: false, message: "not found" } });
    });
  });
}

const unregistered = evaluateToolCall({
  toolId: "missing.tool",
  action: "execute",
  requestedScopes: ["commands"],
  registry: [baseTool],
});
assert.equal(unregistered.status, "not_configured");
assert.equal(unregistered.blocked, true);
assert.equal(unregistered.executed, false);

const unconfiguredTool: ToolRecord = {
  ...baseTool,
  id: "test.unconfigured-tool",
  displayName: "Test Unconfigured Tool",
  installStatus: "not_installed",
  configuredStatus: "not_configured",
  enabled: true,
  notConfiguredReason: "Test tool is intentionally not configured.",
};
const unconfigured = evaluateToolCall({
  toolId: unconfiguredTool.id,
  action: "inspect",
  registry: [unconfiguredTool],
});
assert.equal(unconfigured.status, "not_configured");
assert.equal(unconfigured.executed, false);

const missingPermission = evaluateToolCall({
  toolId: baseTool.id,
  action: "execute",
  requestedScopes: ["commands"],
  registry: [baseTool],
});
assert.equal(missingPermission.status, "blocked");
assert.match(missingPermission.message, /not declared/i);
assert.equal(missingPermission.executed, false);

const runtimeBlocked = evaluateToolCall({
  toolId: "test.coding-only",
  action: "inspect",
  registry: [{ ...baseTool, id: "test.coding-only", displayName: "Test Coding Only Tool", runtimeModeCompatibility: ["Coding"] }],
});
assert.equal(runtimeBlocked.status, "blocked");
assert.match(runtimeBlocked.message, /not allowed/i);
assert.equal(runtimeBlocked.executed, false);

const approvalRequired = evaluateToolCall({
  toolId: commandTool.id,
  action: "execute",
  requestedScopes: ["commands"],
  registry: [commandTool],
});
assert.equal(approvalRequired.status, "approval_required");
assert.equal(approvalRequired.approvalRequired, true);
assert.ok(approvalRequired.approval?.id);
assert.equal(approvalRequired.executed, false);

denyRequest(approvalRequired.approval!.id, "tool-registry test denial");
const denied = evaluateToolCall({
  toolId: commandTool.id,
  action: "execute",
  requestedScopes: ["commands"],
  approvalId: approvalRequired.approval!.id,
  registry: [commandTool],
});
assert.equal(denied.status, "denied");
assert.equal(denied.executed, false);

const secretValue = "sk-phase07a-super-secret";
const dryRun = evaluateToolCall({
  toolId: baseTool.id,
  action: "inspect",
  requestedScopes: ["filesystem.read"],
  dryRun: true,
  input: {
    apiKey: secretValue,
    token: "phase07a-token-secret",
    visible: "ok",
  },
  registry: [baseTool],
});
assert.equal(dryRun.status, "dry_run");
assert.equal(dryRun.executed, false);

const auditText = JSON.stringify(listAuditEvents(100));
assert.equal(auditText.includes(secretValue), false);
assert.equal(auditText.includes("phase07a-token-secret"), false);
assert.equal(auditText.includes("[redacted:"), true);

const replay = listMissionReplayEvents({ traceId: `tool:${baseTool.id}`, limit: 100 });
assert.ok(replay.events.some(event => event.kind === "tool_firewall.dry_run"));

const registry = buildToolRegistry();
const highRisk = registry.filter(tool => tool.riskLevel === "high" || tool.riskLevel === "critical");
assert.ok(highRisk.some(tool => tool.id === "mcp.docker-gateway" && tool.enabled === false));
assert.ok(highRisk.every(tool => tool.enabled === false || tool.sourceKind !== "phase07a_foundation" || tool.id === "local.diagnostics.readonly"));

const routeUnknown = await inject("POST", "/tools/not-real/execute", { action: "execute", requestedScopes: ["commands"] });
assert.equal(routeUnknown.status, 404);
assert.equal(routeUnknown.payload.status, "not_configured");
assert.equal(routeUnknown.payload.executed, false);

console.log("tool-registry.test.ts passed");
