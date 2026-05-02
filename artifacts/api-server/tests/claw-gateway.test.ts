import assert from "node:assert/strict";
import express from "express";
import pluginsRoute from "../src/routes/plugins.js";
import {
  discoverClawSkill,
  getClawGatewayProfile,
  getClawGatewayStatus,
  proposeClawGatewayConfig,
  saveClawGatewayProfile,
  type ClawGatewayToolMetadata,
} from "../src/lib/claw-gateway.js";
import {
  buildToolRegistry,
  evaluateToolCall,
  type ToolRecord,
} from "../src/lib/tool-registry.js";
import { denyRequest } from "../src/lib/approval-queue.js";
import { listAuditEvents } from "../src/lib/platform-foundation.js";
import { listMissionReplayEvents } from "../src/lib/mission-replay.js";

process.env.LOCALAI_TEST_AGENT_PERMISSIONS = JSON.stringify({
  allowAgentExec: true,
  allowAgentEdits: true,
  allowAgentSelfHeal: false,
  allowAgentRefactor: false,
});

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

function clawMetadata(overrides: Partial<ClawGatewayToolMetadata> = {}): ClawGatewayToolMetadata {
  return {
    gatewayType: "openclaw",
    gatewayState: "enabled",
    skillLifecycleState: "approved",
    supportedChannels: ["chat", "mobile"],
    sourceTrust: {
      sourceUrl: "localai://allowlisted/openclaw",
      signatureStatus: "unknown",
      provenanceStatus: "unknown",
      reviewStatus: "approved",
      sourceKind: "allowlisted",
      trustStatus: "allowlisted",
      explicitlyApprovedSource: true,
    },
    networkAccessRequired: false,
    filesystemAccessRequired: "none",
    commandExecutionRequired: false,
    messagingRequired: true,
    browserDesktopRequired: false,
    secretsRequired: false,
    physicalActionPotential: false,
    dockerMcpCompatible: true,
    preferredIsolation: "dry_run",
    profileAllowlisted: true,
    blockSecrets: true,
    requireApprovalForExternalMessages: true,
    updateInstallBehavior: "proposal_only",
    ...overrides,
  };
}

function clawTool(overrides: Partial<ToolRecord> = {}, metadataOverrides: Partial<ClawGatewayToolMetadata> = {}): ToolRecord {
  const clawGateway = clawMetadata(metadataOverrides);
  return {
    id: "claw.test.approved-message",
    displayName: "Claw Approved Message",
    provider: "localai-claw-gateway",
    type: "gateway",
    sourceRef: "claw://test/approved-message",
    sourceKind: "phase07c_claw_gateway",
    installStatus: "installed",
    configuredStatus: "configured",
    enabled: true,
    visibility: "visible",
    isolationMode: "dry_run",
    clawGateway,
    runtimeModeCompatibility: ["Lightweight"],
    permissionScopes: ["external_messages", "network"],
    networkAccess: "external",
    filesystemAccess: "none",
    commandExecutionRequired: false,
    secretsRequired: false,
    approvalRequirement: "required",
    sandboxMode: "none",
    riskLevel: "critical",
    auditReplayBehavior: "record_decision_and_approval",
    capabilities: ["claw_gateway", "messaging_bridge"],
    actions: ["send", "propose_action"],
    metadata: { phase: "07C" },
    ...overrides,
  };
}

const originalProfile = getClawGatewayProfile();

try {
  const status = getClawGatewayStatus();
  assert.equal(status.status, "not_configured");
  assert.equal(status.openclawConfigured, false);
  assert.equal(status.nemoclawConfigured, false);
  assert.equal(status.gatewayReachable, false);
  assert.equal(status.unavailableReason?.includes("no OpenClaw/NemoClaw service was installed"), true);

  const proposal = proposeClawGatewayConfig({ gatewayType: "openclaw" });
  assert.equal(proposal.status, "proposed");
  assert.equal(proposal.dryRun, true);
  assert.equal(proposal.sourceTrust.trustStatus, "blocked");
  assert.equal(proposal.notes.some(note => note.toLowerCase().includes("no clone")), true);

  const registry = buildToolRegistry({}, { includeHidden: true });
  assert.ok(registry.some(tool => tool.id === "claw.openclaw.gateway"));
  assert.ok(registry.some(tool => tool.id === "claw.nemoclaw.gateway"));
  assert.ok(registry.filter(tool => tool.sourceKind === "phase07c_claw_gateway").every(tool => tool.enabled === false));

  const visibleRegistry = buildToolRegistry();
  assert.equal(visibleRegistry.some(tool => tool.id.startsWith("claw.")), false);

  const unregistered = evaluateToolCall({
    toolId: "claw.not-registered",
    action: "send",
    requestedScopes: ["external_messages", "network"],
    registry,
  });
  assert.equal(unregistered.status, "not_configured");
  assert.equal(unregistered.executed, false);

  const unknownSource = evaluateToolCall({
    toolId: "claw.unknown",
    action: "propose_action",
    registry: [clawTool({ id: "claw.unknown" }, { sourceTrust: { ...clawMetadata().sourceTrust, sourceKind: "unknown", trustStatus: "blocked", explicitlyApprovedSource: false } })],
  });
  assert.equal(unknownSource.status, "blocked");
  assert.match(unknownSource.message, /Unknown OpenClaw\/NemoClaw/i);

  const quarantined = evaluateToolCall({
    toolId: "claw.quarantined",
    action: "propose_action",
    registry: [clawTool({ id: "claw.quarantined" }, { skillLifecycleState: "quarantined" })],
  });
  assert.equal(quarantined.status, "blocked");
  assert.match(quarantined.message, /quarantined/i);

  const rejected = evaluateToolCall({
    toolId: "claw.rejected",
    action: "propose_action",
    registry: [clawTool({ id: "claw.rejected" }, { skillLifecycleState: "rejected" })],
  });
  assert.equal(rejected.status, "blocked");
  assert.match(rejected.message, /rejected/i);

  const missingPermission = evaluateToolCall({
    toolId: "claw.missing-permission",
    action: "send",
    requestedScopes: ["external_messages", "network"],
    registry: [clawTool({ id: "claw.missing-permission", permissionScopes: ["network"] })],
  });
  assert.equal(missingPermission.status, "blocked");
  assert.match(missingPermission.message, /external_messages permission/i);

  const approvalRequired = evaluateToolCall({
    toolId: "claw.external-message",
    action: "send",
    requestedScopes: ["external_messages", "network"],
    registry: [clawTool({ id: "claw.external-message" })],
  });
  assert.equal(approvalRequired.status, "approval_required");
  assert.equal(approvalRequired.executed, false);
  assert.ok(approvalRequired.approval?.id);

  denyRequest(approvalRequired.approval!.id, "phase 07c denied gateway action");
  const denied = evaluateToolCall({
    toolId: "claw.external-message",
    action: "send",
    requestedScopes: ["external_messages", "network"],
    approvalId: approvalRequired.approval!.id,
    registry: [clawTool({ id: "claw.external-message" })],
  });
  assert.equal(denied.status, "denied");
  assert.equal(denied.executed, false);

  const secretValue = "phase07c-secret-token";
  const secretBlocked = evaluateToolCall({
    toolId: "claw.secret",
    action: "propose_action",
    requestedScopes: ["secrets"],
    input: { token: secretValue, env: { API_KEY: "phase07c-env-secret" } },
    registry: [clawTool({ id: "claw.secret", permissionScopes: ["secrets"], secretsRequired: true }, { secretsRequired: true })],
  });
  assert.equal(secretBlocked.status, "blocked");
  assert.match(secretBlocked.message, /secrets/i);

  const physicalBlocked = evaluateToolCall({
    toolId: "claw.physical",
    action: "physical_action",
    requestedScopes: ["physical"],
    registry: [clawTool({ id: "claw.physical", permissionScopes: ["physical"], type: "physical" }, { physicalActionPotential: true })],
  });
  assert.equal(physicalBlocked.status, "blocked");

  const updateProposal = evaluateToolCall({
    toolId: "claw.update",
    action: "update_proposal",
    requestedScopes: ["update"],
    dryRun: true,
    registry: [clawTool({
      id: "claw.update",
      permissionScopes: ["commands", "network", "filesystem.write", "update"],
      approvalRequirement: "required",
      riskLevel: "high",
      filesystemAccess: "write",
      commandExecutionRequired: true,
    }, { messagingRequired: false, commandExecutionRequired: true, filesystemAccessRequired: "write" })],
  });
  assert.equal(updateProposal.status, "dry_run");
  assert.equal(updateProposal.executed, false);

  const discoveredUnknown = discoverClawSkill({
    id: "community.unknown",
    sourceKind: "unknown",
    declaredPermissions: ["commands", "secrets"],
  });
  assert.equal(discoveredUnknown.lifecycleState, "blocked");
  assert.equal(discoveredUnknown.sourceTrust.trustStatus, "blocked");

  const discoveredCommunity = discoverClawSkill({
    id: "community.skill",
    sourceKind: "community",
    declaredPermissions: ["external_messages", "network"],
  });
  assert.equal(discoveredCommunity.lifecycleState, "quarantined");
  assert.equal(discoveredCommunity.messagingRequired, true);

  const routeStatus = await inject("GET", "/tools/claw-gateway/status");
  assert.equal(routeStatus.status, 200);
  assert.equal(routeStatus.payload.status.status, "not_configured");

  const routeProposal = await inject("POST", "/tools/claw-gateway/config/propose", { gatewayType: "nemoclaw" });
  assert.equal(routeProposal.status, 200);
  assert.equal(routeProposal.payload.proposal.gatewayType, "nemoclaw");
  assert.equal(routeProposal.payload.executed, false);

  const routeDiscover = await inject("POST", "/tools/claw-gateway/skills/discover", {
    id: "custom.remote-sender",
    sourceKind: "custom_local",
    declaredPermissions: ["external_messages", "network"],
  });
  assert.equal(routeDiscover.status, 200);
  assert.equal(routeDiscover.payload.skill.lifecycleState, "quarantined");
  assert.equal(routeDiscover.payload.executed, false);

  const routeAction = await inject("POST", "/tools/claw-gateway/action/propose", { toolId: "claw.not-registered", action: "send" });
  assert.equal(routeAction.status, 404);
  assert.equal(routeAction.payload.status, "not_configured");
  assert.equal(routeAction.payload.executed, false);

  const saved = saveClawGatewayProfile({
    enabled: true,
    approved: true,
    allowedGateways: ["openclaw"],
    allowedSkills: ["openclaw.gateway"],
    approvedSkillSources: ["watchlist://OpenClaw"],
    gatewayStates: { openclaw: "enabled" },
  }, "test");
  assert.equal(saved.enabled, true);
  assert.equal(saved.allowedSkills.includes("openclaw.gateway"), true);

  const auditText = JSON.stringify(listAuditEvents(200));
  assert.equal(auditText.includes(secretValue), false);
  assert.equal(auditText.includes("phase07c-env-secret"), false);
  assert.equal(auditText.includes("[redacted:"), true);

  const replay = listMissionReplayEvents({ traceId: "tool:claw.external-message", limit: 100 });
  assert.ok(replay.events.some(event => event.kind === "tool_firewall.approval_blocked" || event.kind === "tool_firewall.approval_required"));
} finally {
  saveClawGatewayProfile(originalProfile, "test-restore");
}

console.log("claw-gateway.test.ts passed");
