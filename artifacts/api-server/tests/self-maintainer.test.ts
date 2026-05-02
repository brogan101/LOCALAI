import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import chatRoute from "../src/routes/chat.js";
import updaterRoute from "../src/routes/updater.js";
import {
  classifyUpdateSource,
  createSelfImprovementProposal,
  proposeSelfMaintainerAction,
  runSelfMaintainerRadar,
} from "../src/lib/self-maintainer.js";
import {
  inferModelCapabilities,
  type ModelLifecycleSnapshot,
} from "../src/lib/model-lifecycle.js";

process.env.LOCALAI_TEST_AGENT_PERMISSIONS = JSON.stringify({
  allowAgentExec: true,
  allowAgentEdits: true,
  allowAgentSelfHeal: false,
  allowAgentRefactor: false,
});

const app = express();
app.use(express.json());
app.use(chatRoute);
app.use(updaterRoute);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const lockfilePath = path.join(repoRoot, "pnpm-lock.yaml");

function inject(method: string, routePath: string, body?: unknown): Promise<{ status: number; payload: any }> {
  return new Promise((resolve, reject) => {
    const request = {
      method,
      url: routePath,
      originalUrl: routePath,
      baseUrl: "",
      path: routePath,
      headers: { "content-type": "application/json" },
      body,
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
      if (error) {
        reject(error);
        return;
      }
      resolve({ status: 404, payload: undefined });
    });
  });
}

function fakeLifecycleSnapshot(overrides: Partial<ModelLifecycleSnapshot> = {}): ModelLifecycleSnapshot {
  return {
    success: true,
    generatedAt: new Date().toISOString(),
    routingSourceOfTruth: "test role_assignments plus model-orchestrator",
    localFirst: true,
    defaultProviderId: "ollama",
    ollamaReachable: false,
    runtimeMode: "Lightweight",
    telemetry: {
      gpuStatus: "ok",
      gpuProbedVia: "nvidia-smi",
      gpuTelemetryUnavailable: false,
      diskFreeBytes: 200 * 1024 ** 3,
      diskTotalBytes: 500 * 1024 ** 3,
    },
    backends: [],
    roles: [{ role: "chat", assignedModel: "llama3.1:8b", valid: true }],
    models: [
      {
        name: "llama3.1:8b",
        role: ["chat"],
        providerBackend: "ollama",
        capabilities: inferModelCapabilities("llama3.1:8b"),
        local: true,
        cloud: false,
        installed: true,
        running: false,
        status: "installed",
        sizeBytes: 5 * 1024 ** 3,
        sizeFormatted: "5.0 GB",
        estimatedRuntimeBytes: 6 * 1024 ** 3,
        estimatedRuntimeFormatted: "6.0 GB",
        diskEstimateBytes: 5 * 1024 ** 3,
        vramEstimateBytes: 6 * 1024 ** 3,
        evalScores: { benchmark: 8 },
        runtimeModeCompatibility: { currentMode: "Lightweight", compatible: true, reason: "test" },
        replacementCandidate: false,
        routeAffinity: "general",
      },
    ],
    rules: {
      localOllamaDefault: true,
      cloudProvidersOptionalOnly: true,
      modelActionsRequireApproval: true,
      replacementNeverAutoDeletesOldModel: true,
      replacementRequiresEvalProof: true,
      dryRunAvailable: true,
    },
    ...overrides,
  };
}

let assertions = 0;

try {
  const lockBefore = await readFile(lockfilePath, "utf-8").catch(() => "");
  const radar = await runSelfMaintainerRadar({
    dryRunOnly: true,
    includeNetworkChecks: false,
    runtimeMode: "Lightweight",
    currentBranch: "feature/self-maintainer",
    modelLifecycleSnapshot: fakeLifecycleSnapshot(),
  });

  assert.equal(radar.success, true);
  assert.equal(radar.localFirst, true);
  assert.equal(radar.noPaidApisRequired, true);
  assert.equal(radar.networkUsed, false);
  assert.ok(radar.proposals.length >= 6);
  assertions += 5;

  for (const proposal of radar.proposals) {
    assert.equal(proposal.approvalRequired, true, `${proposal.title} requires approval`);
    assert.equal(proposal.branchRequired, true, `${proposal.title} requires a branch/staged proposal`);
    assert.equal(proposal.applyDirectlyToMainAllowed, false, `${proposal.title} blocks direct main apply`);
    assert.ok(proposal.requiredTests.length > 0, `${proposal.title} records required tests`);
    assert.equal(proposal.rollbackPlan.snapshotRequired, true, `${proposal.title} records rollback snapshot`);
    assertions += 5;
  }

  const packageProposal = radar.proposals.find((proposal) => proposal.kind === "package_dependency");
  assert.equal(packageProposal?.metadata["lockfileMutated"], false);
  const optionalReleaseProposal = radar.proposals.find((proposal) => proposal.kind === "github_release");
  assert.equal(optionalReleaseProposal?.status, "not_configured");
  const mcpProposal = radar.proposals.find((proposal) => proposal.kind === "mcp_tool");
  assert.ok(["blocked", "not_configured"].includes(mcpProposal?.status ?? ""));
  const modelProposal = radar.proposals.find((proposal) => proposal.kind === "model");
  assert.equal(modelProposal?.metadata["autoDeletesOldModel"], false);
  assert.equal(modelProposal?.metadata["autoPullsModel"], false);
  assertions += 5;

  const lockAfter = await readFile(lockfilePath, "utf-8").catch(() => "");
  assert.equal(lockAfter, lockBefore, "self-maintainer radar must not mutate pnpm-lock.yaml");
  assertions += 1;

  const failedRadar = await runSelfMaintainerRadar({
    dryRunOnly: true,
    runtimeMode: "Lightweight",
    currentBranch: "feature/self-maintainer",
    watchlistPath: path.join(repoRoot, "docs", "missing-watchlist.md"),
    modelLifecycleSnapshot: fakeLifecycleSnapshot(),
  });
  assert.equal(failedRadar.success, false);
  assert.ok(failedRadar.proposals.some((proposal) => proposal.status === "failed"));
  assertions += 2;

  const unknownTrust = classifyUpdateSource("Unknown Tool", "https://example.invalid/install.sh", []);
  assert.equal(unknownTrust.status, "blocked");
  assertions += 1;

  const withoutApproval = await proposeSelfMaintainerAction({
    action: "stage",
    targetIds: ["git"],
    currentBranch: "feature/self-maintainer",
    runtimeMode: "Lightweight",
    dryRunOnly: false,
  });
  assert.equal(withoutApproval.applied, false);
  assert.equal(withoutApproval.approvalRequired, true);
  assert.equal(withoutApproval.approval?.status, "waiting_for_approval");
  assertions += 3;

  const mainApply = await proposeSelfMaintainerAction({
    action: "apply",
    targetIds: ["package-update"],
    currentBranch: "main",
    runtimeMode: "Lightweight",
    dryRunOnly: false,
  });
  assert.equal(mainApply.applied, false);
  assert.equal(mainApply.status, "blocked");
  assert.match(mainApply.message, /main/i);
  assertions += 3;

  const gamingAction = await proposeSelfMaintainerAction({
    action: "stage",
    targetIds: ["package-update"],
    currentBranch: "feature/self-maintainer",
    runtimeMode: "Gaming",
    dryRunOnly: false,
  });
  assert.equal(gamingAction.applied, false);
  assert.equal(gamingAction.status, "blocked");
  assert.match(gamingAction.message, /Gaming/i);
  assertions += 3;

  const dryRunAction = await proposeSelfMaintainerAction({
    action: "check",
    targetIds: ["package-update"],
    currentBranch: "main",
    runtimeMode: "Gaming",
    dryRunOnly: true,
  });
  assert.equal(dryRunAction.applied, false);
  assert.equal(dryRunAction.approvalRequired, false);
  assertions += 2;

  const selfImprovement = await createSelfImprovementProposal({
    request: "prepare a patch using token=sk-phase06-secret and password=super-secret",
    dryRunOnly: false,
  });
  const selfImprovementText = JSON.stringify(selfImprovement);
  assert.equal(selfImprovement.applied, false);
  assert.equal(selfImprovement.approvalRequired, true);
  assert.ok(!selfImprovementText.includes("sk-phase06-secret"));
  assert.ok(!selfImprovementText.includes("super-secret"));
  assertions += 4;

  const updateRoute = await inject("POST", "/updater/update", { ids: ["git"], type: "tool" });
  assert.equal(updateRoute.status, 202);
  assert.equal(updateRoute.payload.applied, false);
  assert.equal(updateRoute.payload.approvalRequired, true);
  assert.deepEqual(updateRoute.payload.launched, []);
  assertions += 4;

  const chatPatch = await inject("POST", "/chat/command", {
    command: "prepare patch tighten updater safety token=sk-phase06-chat-secret",
  });
  const chatPatchText = JSON.stringify(chatPatch.payload);
  assert.equal(chatPatch.status, 202);
  assert.equal(chatPatch.payload.approvalRequired, true);
  assert.ok(!chatPatchText.includes("sk-phase06-chat-secret"));
  assertions += 3;
} finally {
  delete process.env.LOCALAI_TEST_AGENT_PERMISSIONS;
}

console.log(`self-maintainer.test.ts passed (${assertions} assertions)`);
