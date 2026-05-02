import assert from "node:assert/strict";
import express from "express";
import modelsRoute from "../src/routes/models.js";
import { getProviderPolicySnapshot } from "../src/lib/provider-policy.js";
import {
  inferModelCapabilities,
  proposeModelLifecycleAction,
  validateRoleAssignment,
  type ModelLifecycleSnapshot,
} from "../src/lib/model-lifecycle.js";
import { setRuntimeMode } from "../src/lib/runtime-mode.js";

process.env.LOCALAI_TEST_AGENT_PERMISSIONS = JSON.stringify({
  allowAgentExec: true,
  allowAgentEdits: true,
  allowAgentSelfHeal: false,
  allowAgentRefactor: false,
});

const app = express();
app.use(express.json());
app.use(modelsRoute);

function inject(method: string, path: string, body?: unknown): Promise<{ status: number; payload: any }> {
  return new Promise((resolve, reject) => {
    const request = {
      method,
      url: path,
      originalUrl: path,
      baseUrl: "",
      path,
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

function fakeSnapshot(overrides: Partial<ModelLifecycleSnapshot> = {}): ModelLifecycleSnapshot {
  return {
    success: true,
    generatedAt: new Date().toISOString(),
    routingSourceOfTruth: "test role_assignments",
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
    roles: [],
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
        evalScores: { benchmark: 7 },
        runtimeModeCompatibility: { currentMode: "Lightweight", compatible: true, reason: "test" },
        replacementCandidate: false,
        routeAffinity: "general",
      },
      {
        name: "qwen2.5-coder:7b",
        role: [],
        providerBackend: "ollama",
        capabilities: inferModelCapabilities("qwen2.5-coder:7b"),
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
        routeAffinity: "code",
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
  const embeddingCapabilities = inferModelCapabilities("nomic-embed-text");
  assert.equal(embeddingCapabilities.embeddings, true);
  assert.equal(embeddingCapabilities.chat, false);
  assertions += 2;

  const badChatRole = validateRoleAssignment("chat", "nomic-embed-text");
  assert.equal(badChatRole.allowed, false, "Embedding model cannot be assigned to chat by default");
  const goodEmbeddingRole = validateRoleAssignment("embedding", "nomic-embed-text");
  assert.equal(goodEmbeddingRole.allowed, true, "Embedding model remains valid for embedding role");
  assertions += 2;

  const providerPolicy = await getProviderPolicySnapshot();
  assert.equal(providerPolicy.defaultProviderId, "ollama");
  assert.equal(providerPolicy.localOnlyByDefault, true);
  assert.ok(["disabled", "not_configured"].includes(providerPolicy.providers.find((provider) => provider.id === "lm-studio")?.status ?? ""));
  assert.equal(providerPolicy.rules.missingCloudProvidersDoNotBlockLocalMode, true);
  assertions += 4;

  const lifecycle = await inject("GET", "/models/lifecycle");
  assert.equal(lifecycle.status, 200);
  assert.equal(lifecycle.payload.defaultProviderId, "ollama");
  assert.equal(lifecycle.payload.rules.modelActionsRequireApproval, true);
  assert.ok(lifecycle.payload.backends.some((backend: any) => backend.id === "ollama" && backend.localFirst === true));
  assertions += 4;

  const roleRejection = await inject("PUT", "/models/roles", {
    roles: [{ role: "chat", model: "nomic-embed-text" }],
  });
  assert.equal(roleRejection.status, 400);
  assert.match(roleRejection.payload.message, /Embedding model/);
  assertions += 2;

  await setRuntimeMode("Gaming", "model lifecycle test gaming mode");
  const gamingProposal = await proposeModelLifecycleAction({
    action: "pull",
    modelName: "qwen3-coder:30b",
    dryRunOnly: true,
    snapshot: fakeSnapshot({
      runtimeMode: "Gaming",
      telemetry: {
        gpuStatus: "degraded",
        gpuProbedVia: "pnputil",
        gpuTelemetryUnavailable: true,
        diskFreeBytes: "unknown",
        diskTotalBytes: "unknown",
      },
    }),
  });
  assert.equal(gamingProposal.approvalRequired, true);
  assert.equal(gamingProposal.safeToRecommend, false);
  assert.equal(gamingProposal.status, "blocked_by_runtime_mode");
  assert.equal(gamingProposal.autoPullsModel, false);
  assertions += 4;

  const replacementWithoutEval = await proposeModelLifecycleAction({
    action: "replace",
    currentModelName: "llama3.1:8b",
    candidateModelName: "qwen2.5-coder:7b",
    role: "chat",
    dryRunOnly: true,
    snapshot: fakeSnapshot(),
  });
  assert.equal(replacementWithoutEval.safeToRecommend, false);
  assert.equal(replacementWithoutEval.oldModelRetained, true);
  assert.equal(replacementWithoutEval.autoDeletesOldModel, false);
  assertions += 3;

  const approvedShape = await proposeModelLifecycleAction({
    action: "replace",
    currentModelName: "llama3.1:8b",
    candidateModelName: "llama3.1:8b",
    role: "chat",
    dryRunOnly: true,
    evalProof: { chat: 8, latency: 7 },
    snapshot: fakeSnapshot(),
  });
  assert.equal(approvedShape.oldModelRetained, true);
  assert.equal(approvedShape.autoDeletesOldModel, false);
  assert.equal(approvedShape.autoPullsModel, false);
  assertions += 3;

  const pullRoute = await inject("POST", "/models/pull", { modelName: "llama3.2:3b" });
  assert.equal(pullRoute.status, 202);
  assert.equal(pullRoute.payload.approvalRequired, true);
  assert.equal(Boolean(pullRoute.payload.jobId), false, "Pull route must not start a pull before approval");
  assertions += 3;

  const deleteRoute = await inject("DELETE", "/models/llama3.2%3A3b/delete", {});
  assert.equal(deleteRoute.status, 202);
  assert.equal(deleteRoute.payload.approvalRequired, true);
  assert.equal(deleteRoute.payload.proposal.autoDeletesOldModel, false);
  assertions += 3;

  const routeSource = await inject("GET", "/models/lifecycle/routing-source");
  assert.equal(routeSource.status, 200);
  assert.match(routeSource.payload.routingSourceOfTruth, /role_assignments/);
  assertions += 2;
} finally {
  await setRuntimeMode("Lightweight", "model lifecycle test cleanup").catch(() => undefined);
  delete process.env.LOCALAI_TEST_AGENT_PERMISSIONS;
}

console.log(`model-lifecycle.test.ts passed (${assertions} assertions)`);
