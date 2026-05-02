import assert from "node:assert/strict";
import express from "express";
import pluginsRoute from "../src/routes/plugins.js";
import {
  DEFAULT_DOCKER_MCP_SECURITY,
  dockerMcpGatewayToolRecords,
  getDockerMcpGatewayStatus,
  getDockerMcpProfile,
  proposeDockerMcpGatewayConfig,
  saveDockerMcpProfile,
  type DockerMcpToolMetadata,
} from "../src/lib/docker-mcp-gateway.js";
import {
  buildToolRegistry,
  evaluateToolCall,
  type ToolRecord,
} from "../src/lib/tool-registry.js";
import { denyRequest } from "../src/lib/approval-queue.js";
import { listAuditEvents } from "../src/lib/platform-foundation.js";

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

function dockerMetadata(overrides: Partial<DockerMcpToolMetadata> = {}): DockerMcpToolMetadata {
  return {
    isolationMode: "docker_mcp_gateway",
    imageRef: "docker/mcp-test:unpinned",
    imagePinned: false,
    catalogSource: "docker_built_catalog",
    trustStatus: "trusted_catalog",
    signatureStatus: "unknown",
    provenanceStatus: "unknown",
    sbomStatus: "unknown",
    vulnerabilityScanStatus: "unknown",
    containerNetworkMode: "none",
    filesystemMounts: [],
    secretsRequired: false,
    resourceLimits: { cpus: 0.5, memoryMb: 512 },
    profileId: "test-profile",
    profileAllowlisted: true,
    explicitlyApprovedSource: true,
    hiddenByDefault: false,
    blockSecrets: true,
    blockNetwork: true,
    deniedEnvVars: DEFAULT_DOCKER_MCP_SECURITY.deniedEnvVars,
    exposedEnvVars: [],
    ...overrides,
  };
}

function dockerTool(overrides: Partial<ToolRecord> = {}, metadataOverrides: Partial<DockerMcpToolMetadata> = {}): ToolRecord {
  const dockerMcp = dockerMetadata(metadataOverrides);
  return {
    id: "docker-mcp.test.safe",
    displayName: "Docker MCP Test Tool",
    provider: "docker-mcp-gateway",
    type: "mcp",
    sourceRef: "docker-mcp://test/safe",
    sourceKind: "phase07b_docker_mcp_gateway",
    installStatus: "installed",
    configuredStatus: "configured",
    enabled: true,
    visibility: "visible",
    isolationMode: "docker_mcp_gateway",
    dockerMcp,
    runtimeModeCompatibility: ["Lightweight"],
    permissionScopes: ["filesystem.read"],
    networkAccess: "none",
    filesystemAccess: "scoped",
    commandExecutionRequired: false,
    secretsRequired: false,
    approvalRequirement: "required",
    sandboxMode: "none",
    riskLevel: "medium",
    auditReplayBehavior: "record_decision_and_approval",
    capabilities: ["mcp", "docker_mcp_gateway"],
    actions: ["inspect", "propose_run"],
    metadata: { phase: "07B" },
    ...overrides,
  };
}

const originalProfile = getDockerMcpProfile();

try {
  const dryRunStatus = await getDockerMcpGatewayStatus({ dryRun: true });
  assert.equal(dryRunStatus.status, "not_configured");
  assert.equal(dryRunStatus.dryRun, true);
  assert.equal(dryRunStatus.dockerInstalled, false);

  const missingDocker = await getDockerMcpGatewayStatus({
    dryRun: false,
    runner: async () => {
      throw new Error("docker missing API_KEY=super-secret");
    },
  });
  assert.equal(missingDocker.status, "not_configured");
  assert.equal(missingDocker.dockerInstalled, false);
  assert.equal(JSON.stringify(missingDocker).includes("super-secret"), false);

  const proposal = proposeDockerMcpGatewayConfig();
  assert.equal(proposal.status, "proposed");
  assert.equal(proposal.dryRun, true);
  assert.equal(proposal.security.blockSecrets, true);
  assert.equal(proposal.security.blockNetwork, true);
  assert.deepEqual(proposal.security.allowedMounts, []);
  assert.deepEqual(proposal.clientConfig.environment, {});
  assert.equal(proposal.security.resourceLimits.cpus > 0, true);
  assert.equal(proposal.security.resourceLimits.memoryMb > 0, true);

  const networkProposal = proposeDockerMcpGatewayConfig({ networkRequired: true });
  assert.equal(networkProposal.security.blockSecrets, true);
  assert.equal(networkProposal.security.blockNetwork, false);

  const defaultRegistry = buildToolRegistry();
  assert.equal(defaultRegistry.some(tool => tool.id.startsWith("docker-mcp.catalog.")), false);

  const hiddenRegistry = buildToolRegistry({}, { includeHidden: true });
  assert.ok(hiddenRegistry.some(tool => tool.id === "docker-mcp.catalog.filesystem-readonly"));
  assert.ok(hiddenRegistry.filter(tool => tool.id.startsWith("docker-mcp.")).every(tool => tool.enabled === false));
  assert.ok(hiddenRegistry.some(tool => tool.id === "docker-mcp.community.shell" && tool.riskLevel === "high" && tool.enabled === false));

  const saved = saveDockerMcpProfile({
    enabled: true,
    approved: true,
    allowedTools: ["docker-mcp.catalog.filesystem-readonly"],
    security: {
      ...DEFAULT_DOCKER_MCP_SECURITY,
      allowedTools: ["docker-mcp.catalog.filesystem-readonly"],
    },
  }, "test");
  assert.equal(saved.enabled, true);
  assert.deepEqual(getDockerMcpProfile().allowedTools, ["docker-mcp.catalog.filesystem-readonly"]);
  const allowlistedTools = dockerMcpGatewayToolRecords(saved);
  assert.equal(allowlistedTools.find(tool => tool.id === "docker-mcp.catalog.filesystem-readonly")?.visibility, "visible");
  assert.equal(allowlistedTools.find(tool => tool.id === "docker-mcp.catalog.fetch")?.visibility, "hidden");

  const unregistered = evaluateToolCall({
    toolId: "docker-mcp.not-registered",
    action: "propose_run",
    registry: hiddenRegistry,
  });
  assert.equal(unregistered.status, "not_configured");
  assert.equal(unregistered.executed, false);

  const hidden = evaluateToolCall({
    toolId: "docker-mcp.hidden",
    action: "propose_run",
    registry: [dockerTool({ id: "docker-mcp.hidden", visibility: "hidden" }, { profileAllowlisted: false })],
  });
  assert.equal(hidden.status, "not_configured");
  assert.match(hidden.message, /allowlist/i);
  assert.equal(hidden.executed, false);

  const unknownSource = evaluateToolCall({
    toolId: "docker-mcp.unknown",
    action: "propose_run",
    registry: [
      dockerTool(
        { id: "docker-mcp.unknown", riskLevel: "critical" },
        { catalogSource: "unknown_untrusted", trustStatus: "blocked" },
      ),
    ],
  });
  assert.equal(unknownSource.status, "blocked");
  assert.match(unknownSource.message, /untrusted/i);

  const communitySource = evaluateToolCall({
    toolId: "docker-mcp.community",
    action: "propose_run",
    registry: [
      dockerTool(
        { id: "docker-mcp.community", riskLevel: "high" },
        { catalogSource: "community_catalog", trustStatus: "unverified", explicitlyApprovedSource: false },
      ),
    ],
  });
  assert.equal(communitySource.status, "blocked");
  assert.match(communitySource.message, /Community or custom/i);

  const unsafeSecret = evaluateToolCall({
    toolId: "docker-mcp.secret",
    action: "propose_run",
    requestedScopes: ["secrets"],
    input: { token: "phase07b-secret-token" },
    registry: [dockerTool({ id: "docker-mcp.secret", permissionScopes: ["secrets"], secretsRequired: true }, { secretsRequired: true })],
  });
  assert.equal(unsafeSecret.status, "blocked");
  assert.match(unsafeSecret.message, /secrets/i);
  assert.equal(unsafeSecret.executed, false);

  const unsafeNetwork = evaluateToolCall({
    toolId: "docker-mcp.network",
    action: "propose_run",
    requestedScopes: ["network"],
    registry: [dockerTool({ id: "docker-mcp.network", permissionScopes: ["network"], networkAccess: "external" }, { blockNetwork: true, containerNetworkMode: "restricted_egress" })],
  });
  assert.equal(unsafeNetwork.status, "blocked");
  assert.match(unsafeNetwork.message, /network/i);

  const approvalRequired = evaluateToolCall({
    toolId: "docker-mcp.approval",
    action: "propose_run",
    requestedScopes: ["filesystem.read"],
    sandboxSatisfied: true,
    registry: [dockerTool({ id: "docker-mcp.approval" }, { blockNetwork: true })],
  });
  assert.equal(approvalRequired.status, "approval_required");
  assert.equal(approvalRequired.executed, false);

  denyRequest(approvalRequired.approval!.id, "docker mcp denial test");
  const denied = evaluateToolCall({
    toolId: "docker-mcp.approval",
    action: "propose_run",
    requestedScopes: ["filesystem.read"],
    approvalId: approvalRequired.approval!.id,
    sandboxSatisfied: true,
    registry: [dockerTool({ id: "docker-mcp.approval" }, { blockNetwork: true })],
  });
  assert.equal(denied.status, "denied");
  assert.equal(denied.executed, false);

  const auditText = JSON.stringify(listAuditEvents(100));
  assert.equal(auditText.includes("phase07b-secret-token"), false);
  assert.equal(auditText.includes("API_KEY=super-secret"), false);

  const routeStatus = await inject("GET", "/tools/docker-mcp/status");
  assert.equal(routeStatus.status, 200);
  assert.equal(routeStatus.payload.status.status, "not_configured");
  assert.equal(routeStatus.payload.status.dryRun, true);

  const routeProposal = await inject("POST", "/tools/docker-mcp/config/propose", {});
  assert.equal(routeProposal.status, 200);
  assert.equal(routeProposal.payload.proposal.security.blockSecrets, true);
  assert.equal(routeProposal.payload.proposal.security.blockNetwork, true);
  assert.deepEqual(routeProposal.payload.proposal.clientConfig.environment, {});

  const routeRunProposal = await inject("POST", "/tools/docker-mcp/run/propose", { toolId: "docker-mcp.not-registered" });
  assert.equal(routeRunProposal.status, 404);
  assert.equal(routeRunProposal.payload.status, "not_configured");
  assert.equal(routeRunProposal.payload.executed, false);
} finally {
  saveDockerMcpProfile(originalProfile, "test-restore");
}

console.log("docker-mcp-gateway.test.ts passed");
