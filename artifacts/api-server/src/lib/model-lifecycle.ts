import { randomUUID } from "crypto";
import { sqlite } from "../db/database.js";
import { createApprovalRequest, verifyApprovedRequest, type ApprovalRequest } from "./approval-queue.js";
import {
  getProviderPolicySnapshot,
  PROVIDER_DEFINITIONS,
  type ProviderSummary,
} from "./provider-policy.js";
import { getRuntimeModeState, type RuntimeMode } from "./runtime-mode.js";
import { probeHardware, type HardwareSnapshot } from "./hardware-probe.js";
import { getUniversalGatewayTags, type GatewayModel, type GatewayTagsResult } from "./model-orchestrator.js";
import { modelRolesService } from "./model-roles-service.js";
import { recordAuditEvent } from "./platform-foundation.js";
import { thoughtLog } from "./thought-log.js";
import { USER_STACK, type ModelRole } from "../config/models.config.js";

export type ModelLifecycleAction =
  | "pull"
  | "install"
  | "load"
  | "unload"
  | "delete"
  | "replace"
  | "retire"
  | "backend-change"
  | "benchmark"
  | "evaluate";

export interface ModelCapabilities {
  chat: boolean;
  coding: boolean;
  embeddings: boolean;
  vision: boolean;
  toolCalling: boolean | "unknown";
  structuredOutput: boolean | "unknown";
  contextWindow: number | "unknown";
}

export interface ModelLifecycleEntry {
  name: string;
  role: string[];
  providerBackend: "ollama";
  capabilities: ModelCapabilities;
  local: true;
  cloud: false;
  installed: boolean;
  running: boolean;
  status: "installed" | "running" | "available" | "deprecated" | "replacement_candidate";
  sizeBytes: number;
  sizeFormatted: string;
  estimatedRuntimeBytes: number;
  estimatedRuntimeFormatted: string;
  diskEstimateBytes: number | "unknown";
  vramEstimateBytes: number | "unknown";
  evalScores: Record<string, number>;
  runtimeModeCompatibility: {
    currentMode: RuntimeMode;
    compatible: boolean;
    reason: string;
  };
  replacementCandidate: boolean;
  routeAffinity: GatewayModel["routeAffinity"];
  parameterSize?: string;
  quantizationLevel?: string;
}

export interface BackendProfile {
  id: string;
  displayName: string;
  kind: ProviderSummary["kind"];
  localFirst: boolean;
  default: boolean;
  status: ProviderSummary["status"];
  configured: boolean;
  requiresApiKey: boolean;
  dataLeavesMachine: boolean;
  startupPolicy: "manual" | "on_demand" | "mode_based" | "disabled";
  allowedRuntimeModes: RuntimeMode[];
  notes: string;
}

export interface ModelLifecycleSnapshot {
  success: true;
  generatedAt: string;
  routingSourceOfTruth: string;
  localFirst: true;
  defaultProviderId: string;
  ollamaReachable: boolean;
  runtimeMode: RuntimeMode;
  telemetry: {
    gpuStatus: "ok" | "degraded" | "safe-mode" | "unknown";
    gpuProbedVia: string;
    gpuTelemetryUnavailable: boolean;
    diskFreeBytes: number | "unknown";
    diskTotalBytes: number | "unknown";
  };
  backends: BackendProfile[];
  roles: Array<{
    role: string;
    assignedModel: string;
    valid: boolean;
    warning?: string;
  }>;
  models: ModelLifecycleEntry[];
  rules: {
    localOllamaDefault: true;
    cloudProvidersOptionalOnly: true;
    modelActionsRequireApproval: true;
    replacementNeverAutoDeletesOldModel: true;
    replacementRequiresEvalProof: true;
    dryRunAvailable: true;
  };
}

export interface LifecycleActionProposal {
  id: string;
  action: ModelLifecycleAction;
  modelName?: string;
  currentModelName?: string;
  candidateModelName?: string;
  role?: string;
  dryRun: boolean;
  approvalRequired: boolean;
  approval?: ApprovalRequest;
  executionAllowed: boolean;
  safeToRecommend: boolean;
  oldModelRetained: boolean;
  autoDeletesOldModel: false;
  autoPullsModel: false;
  status:
    | "proposal"
    | "approval_required"
    | "blocked_by_runtime_mode"
    | "blocked_by_eval"
    | "blocked_by_capability"
    | "blocked_by_telemetry"
    | "not_configured";
  reasons: string[];
  constraints: {
    runtimeMode: RuntimeMode;
    gpuTelemetry: "healthy" | "degraded" | "unknown";
    diskFreeBytes: number | "unknown";
    estimatedRuntimeBytes: number | "unknown";
    estimatedDiskBytes: number | "unknown";
    evalProofRequired: boolean;
    evalProofPresent: boolean;
  };
}

const GB = 1024 ** 3;
const EMBEDDING_PATTERNS = [
  "embed",
  "embedding",
  "nomic-embed",
  "mxbai-embed",
  "all-minilm",
  "minilm",
  "bge",
  "sentence-transformer",
  "text-embedding",
  "jina-embeddings",
  "gte-",
];

const BACKEND_RUNTIME_MODES: RuntimeMode[] = ["Lightweight", "Coding", "Vision", "Media", "Business", "Maker", "HomeLab", "HomeShop"];

function nowIso(): string {
  return new Date().toISOString();
}

function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export function inferModelCapabilities(modelName: string): ModelCapabilities {
  const name = normalizeName(modelName);
  const embeddings = EMBEDDING_PATTERNS.some((pattern) => name.includes(pattern));
  const vision = /llava|vision|-vl|minicpm-v|moondream|bakllava|internvl/.test(name);
  const coding = /coder|codellama|codegemma|starcoder|deepseek|granite-code|yi-coder|opencoder/.test(name);
  const toolCalling = /tool|qwen3|llama3\.1|llama3\.3|mistral|command-r/.test(name) ? true : "unknown";
  const structuredOutput = /qwen|llama3|mistral|gemma|phi|deepseek/.test(name) ? true : "unknown";
  const contextWindow = /qwen3|llama3\.1|llama3\.3|command-r/.test(name) ? 128_000 : "unknown";
  return {
    chat: !embeddings,
    coding: coding && !embeddings,
    embeddings,
    vision,
    toolCalling: embeddings ? false : toolCalling,
    structuredOutput: embeddings ? false : structuredOutput,
    contextWindow,
  };
}

function requiredCapabilityForRole(role: string): keyof ModelCapabilities {
  if (role === "embedding" || role === "embeddings") return "embeddings";
  if (role === "vision") return "vision";
  if (role === "primary-coding" || role === "fast-coding" || role === "autocomplete") return "coding";
  return "chat";
}

export function validateRoleAssignment(role: string, modelName: string, options: { allowEmbeddingForChat?: boolean } = {}): { allowed: boolean; reason: string } {
  const capabilities = inferModelCapabilities(modelName);
  const required = requiredCapabilityForRole(role);
  if (required === "chat" && capabilities.embeddings && !options.allowEmbeddingForChat) {
    return {
      allowed: false,
      reason: `Embedding model ${modelName} cannot be assigned to ${role}; choose a chat-capable model or explicitly allow the unsafe override.`,
    };
  }
  if (capabilities[required] === true) return { allowed: true, reason: `${modelName} satisfies ${role} (${required}).` };
  return {
    allowed: false,
    reason: `${modelName} does not advertise required ${required} capability for ${role}.`,
  };
}

function latestBenchmarkScores(): Record<string, number> {
  try {
    const rows = sqlite.prepare(`
      SELECT results_json FROM benchmark_runs
      ORDER BY created_at DESC
      LIMIT 25
    `).all() as Array<{ results_json: string }>;
    const scores: Record<string, number> = {};
    for (const row of rows) {
      const results = JSON.parse(row.results_json || "[]") as Array<{ model?: string; score?: number }>;
      for (const result of results) {
        if (!result.model || typeof result.score !== "number") continue;
        scores[result.model] = Math.max(scores[result.model] ?? 0, result.score);
      }
    }
    return scores;
  } catch {
    return {};
  }
}

function rolesByModel(roles: Record<string, string>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [role, modelName] of Object.entries(roles)) {
    if (!modelName) continue;
    (result[modelName] ??= []).push(role);
  }
  return result;
}

function isGpuHeavyModel(model: Pick<GatewayModel, "estimatedRuntimeBytes" | "runtimeClass">): boolean {
  return model.runtimeClass === "large" || model.estimatedRuntimeBytes >= 8 * GB;
}

function runtimeCompatibility(model: GatewayModel, mode: RuntimeMode): ModelLifecycleEntry["runtimeModeCompatibility"] {
  if (mode === "EmergencyStop") {
    return { currentMode: mode, compatible: false, reason: "Emergency Stop blocks model lifecycle execution." };
  }
  if (mode === "Gaming" && isGpuHeavyModel(model)) {
    return { currentMode: mode, compatible: false, reason: "Gaming mode blocks GPU-heavy model actions." };
  }
  if (mode === "Gaming") {
    return { currentMode: mode, compatible: false, reason: "Gaming mode keeps local model execution/manual pulls paused by policy." };
  }
  return { currentMode: mode, compatible: true, reason: `${mode} permits local model routing.` };
}

function backendProfileForProvider(provider: ProviderSummary, defaultProviderId: string): BackendProfile {
  return {
    id: provider.id,
    displayName: provider.displayName,
    kind: provider.kind,
    localFirst: provider.localFirst,
    default: provider.id === defaultProviderId,
    status: provider.status,
    configured: provider.configured,
    requiresApiKey: provider.requiresApiKey,
    dataLeavesMachine: provider.dataLeavesMachine,
    startupPolicy: provider.id === "ollama" ? "mode_based" : provider.kind === "local" ? "on_demand" : "disabled",
    allowedRuntimeModes: provider.kind === "local" ? BACKEND_RUNTIME_MODES : [],
    notes: provider.notes,
  };
}

async function buildBackendProfiles(defaultProviderId: string): Promise<BackendProfile[]> {
  const snapshot = await getProviderPolicySnapshot();
  const profiles = snapshot.providers.map((provider) => backendProfileForProvider(provider, defaultProviderId));
  const configuredIds = new Set(profiles.map((profile) => profile.id));
  for (const definition of PROVIDER_DEFINITIONS) {
    if (configuredIds.has(definition.id)) continue;
    profiles.push({
      id: definition.id,
      displayName: definition.displayName,
      kind: definition.kind,
      localFirst: definition.localFirst,
      default: definition.id === defaultProviderId,
      status: definition.statusWhenUnconfigured,
      configured: false,
      requiresApiKey: definition.requiresApiKey,
      dataLeavesMachine: definition.dataLeavesMachine,
      startupPolicy: "disabled",
      allowedRuntimeModes: definition.kind === "local" ? BACKEND_RUNTIME_MODES : [],
      notes: definition.notes,
    });
  }
  return profiles;
}

export async function getModelLifecycleSnapshot(options: {
  gateway?: GatewayTagsResult;
  hardware?: HardwareSnapshot;
} = {}): Promise<ModelLifecycleSnapshot> {
  const [providerSnapshot, runtimeState, roles, gateway, hardware] = await Promise.all([
    getProviderPolicySnapshot(),
    Promise.resolve(getRuntimeModeState()),
    modelRolesService.getRoles(),
    options.gateway ? Promise.resolve(options.gateway) : getUniversalGatewayTags(),
    options.hardware ? Promise.resolve(options.hardware) : probeHardware(),
  ]);
  const assigned = rolesByModel(roles);
  const installed = new Set(gateway.models.map((model) => model.name));
  const evalScores = latestBenchmarkScores();

  const models = gateway.models.map((model): ModelLifecycleEntry => {
    const capabilities = inferModelCapabilities(model.name);
    const compatibility = runtimeCompatibility(model, runtimeState.mode);
    return {
      name: model.name,
      role: assigned[model.name] ?? [],
      providerBackend: "ollama",
      capabilities,
      local: true,
      cloud: false,
      installed: true,
      running: model.isRunning,
      status: model.isRunning ? "running" : "installed",
      sizeBytes: model.size,
      sizeFormatted: model.sizeFormatted,
      estimatedRuntimeBytes: model.estimatedRuntimeBytes,
      estimatedRuntimeFormatted: model.estimatedRuntimeFormatted,
      diskEstimateBytes: model.size || "unknown",
      vramEstimateBytes: model.estimatedRuntimeBytes || "unknown",
      evalScores: evalScores[model.name] !== undefined ? { benchmark: evalScores[model.name]! } : {},
      runtimeModeCompatibility: compatibility,
      replacementCandidate: false,
      routeAffinity: model.routeAffinity,
      parameterSize: model.parameterSize,
      quantizationLevel: model.quantizationLevel,
    };
  });

  return {
    success: true,
    generatedAt: nowIso(),
    routingSourceOfTruth: "SQLite role_assignments via modelRolesService plus Ollama gateway tags from model-orchestrator",
    localFirst: true,
    defaultProviderId: providerSnapshot.defaultProviderId,
    ollamaReachable: gateway.ollamaReachable,
    runtimeMode: runtimeState.mode,
    telemetry: {
      gpuStatus: hardware.gpu.status ?? "ok",
      gpuProbedVia: hardware.gpu.probedVia,
      gpuTelemetryUnavailable: hardware.gpu.telemetryUnavailable === true,
      diskFreeBytes: hardware.disk.installDriveFreeBytes > 0 ? hardware.disk.installDriveFreeBytes : "unknown",
      diskTotalBytes: hardware.disk.installDriveTotalBytes > 0 ? hardware.disk.installDriveTotalBytes : "unknown",
    },
    backends: await buildBackendProfiles(providerSnapshot.defaultProviderId),
    roles: Object.entries(roles).map(([role, assignedModel]) => ({
      role,
      assignedModel,
      valid: !assignedModel || installed.has(assignedModel),
      warning: assignedModel && !installed.has(assignedModel) ? `Not installed: ${assignedModel}` : undefined,
    })),
    models,
    rules: {
      localOllamaDefault: true,
      cloudProvidersOptionalOnly: true,
      modelActionsRequireApproval: true,
      replacementNeverAutoDeletesOldModel: true,
      replacementRequiresEvalProof: true,
      dryRunAvailable: true,
    },
  };
}

function estimateFromName(modelName: string): number | "unknown" {
  const spec = USER_STACK.find((entry) => entry.name === modelName || entry.name.split(":")[0] === modelName.split(":")[0]);
  if (spec) return spec.vramBytes;
  const match = /(\d+(?:\.\d+)?)\s*b/i.exec(modelName);
  if (match) return Math.round(Number(match[1]) * GB * 0.75);
  return "unknown";
}

function modelByName(snapshot: ModelLifecycleSnapshot, modelName: string | undefined): ModelLifecycleEntry | undefined {
  if (!modelName) return undefined;
  return snapshot.models.find((model) => model.name === modelName);
}

export async function proposeModelLifecycleAction(input: {
  action: ModelLifecycleAction;
  modelName?: string;
  currentModelName?: string;
  candidateModelName?: string;
  role?: string;
  dryRunOnly?: boolean;
  evalProof?: Record<string, number>;
  approved?: boolean;
  snapshot?: ModelLifecycleSnapshot;
}): Promise<LifecycleActionProposal> {
  const snapshot = input.snapshot ?? await getModelLifecycleSnapshot();
  const modelName = input.modelName || input.candidateModelName || input.currentModelName;
  const existingModel = modelByName(snapshot, modelName);
  const candidateModel = modelByName(snapshot, input.candidateModelName);
  const estimatedRuntimeBytes = existingModel?.estimatedRuntimeBytes
    ?? candidateModel?.estimatedRuntimeBytes
    ?? estimateFromName(modelName ?? "");
  const estimatedDiskBytes = existingModel?.sizeBytes
    ?? candidateModel?.sizeBytes
    ?? estimatedRuntimeBytes;
  const reasons: string[] = [];
  const needsEvalProof = input.action === "replace" || input.action === "benchmark" || input.action === "evaluate";
  const evalProofPresent = Boolean(input.evalProof && Object.keys(input.evalProof).length > 0);
  let status: LifecycleActionProposal["status"] = "proposal";
  let safeToRecommend = true;

  if (snapshot.runtimeMode === "EmergencyStop") {
    safeToRecommend = false;
    status = "blocked_by_runtime_mode";
    reasons.push("Emergency Stop blocks model lifecycle execution.");
  } else if (snapshot.runtimeMode === "Gaming" && ["pull", "install", "load", "replace", "backend-change", "benchmark", "evaluate"].includes(input.action)) {
    safeToRecommend = false;
    status = "blocked_by_runtime_mode";
    reasons.push("Gaming mode blocks GPU-heavy model lifecycle actions; switch to Coding/Lightweight after gaming.");
  }

  if (snapshot.telemetry.gpuTelemetryUnavailable && ["pull", "install", "load", "replace", "benchmark", "evaluate"].includes(input.action)) {
    safeToRecommend = false;
    if (status === "proposal") status = "blocked_by_telemetry";
    reasons.push("GPU/VRAM telemetry is degraded; lifecycle decision is conservative and not marked safe.");
  }

  if (snapshot.telemetry.diskFreeBytes === "unknown" && ["pull", "install", "replace"].includes(input.action)) {
    safeToRecommend = false;
    if (status === "proposal") status = "blocked_by_telemetry";
    reasons.push("Disk free space is unknown; large model pulls cannot be recommended as safe.");
  } else if (
    typeof snapshot.telemetry.diskFreeBytes === "number" &&
    typeof estimatedDiskBytes === "number" &&
    estimatedDiskBytes > snapshot.telemetry.diskFreeBytes * 0.8
  ) {
    safeToRecommend = false;
    if (status === "proposal") status = "blocked_by_telemetry";
    reasons.push(`Model estimate ${formatBytes(estimatedDiskBytes)} is too close to free disk space.`);
  }

  if (needsEvalProof && !evalProofPresent) {
    safeToRecommend = false;
    if (status === "proposal") status = "blocked_by_eval";
    reasons.push("Replacement/evaluation actions require role-specific eval proof first.");
  }

  if (input.action === "replace" && input.role && input.candidateModelName) {
    const validation = validateRoleAssignment(input.role, input.candidateModelName);
    if (!validation.allowed) {
      safeToRecommend = false;
      status = "blocked_by_capability";
      reasons.push(validation.reason);
    }
  }

  if (reasons.length === 0) {
    reasons.push("Dry-run proposal only; no model process or filesystem mutation executed.");
  }

  const approvalRequired = ["pull", "install", "load", "unload", "delete", "replace", "retire", "backend-change", "benchmark", "evaluate"].includes(input.action);
  let approval: ApprovalRequest | undefined;
  if (approvalRequired && !input.dryRunOnly) {
    approval = createApprovalRequest({
      type: "model.lifecycle",
      title: `Approve model ${input.action}`,
      summary: `${input.action} ${modelName ?? input.candidateModelName ?? "model/backend"} requires explicit approval before execution.`,
      riskTier: "tier2_safe_local_execute",
      requestedAction: `model.lifecycle.${input.action}`,
      payload: buildModelActionPayload({
        action: input.action,
        modelName: input.modelName,
        currentModelName: input.currentModelName,
        candidateModelName: input.candidateModelName,
        role: input.role,
      }),
    });
  }

  recordAuditEvent({
    eventType: "model_lifecycle",
    action: `proposal.${input.action}`,
    target: modelName,
    result: safeToRecommend ? "success" : "blocked",
    metadata: {
      dryRunOnly: input.dryRunOnly === true,
      approvalRequired,
      approvalId: approval?.id,
      safeToRecommend,
      status,
      reasons,
      oldModelRetained: true,
      autoDeletesOldModel: false,
      autoPullsModel: false,
    },
  });
  thoughtLog.publish({
    level: safeToRecommend ? "info" : "warning",
    category: "system",
    title: "Model Lifecycle Proposal",
    message: `${input.action} proposal for ${modelName ?? "model/backend"}: ${status}`,
    metadata: { approvalId: approval?.id, safeToRecommend, reasons },
  });

  return {
    id: randomUUID(),
    action: input.action,
    modelName: input.modelName,
    currentModelName: input.currentModelName,
    candidateModelName: input.candidateModelName,
    role: input.role,
    dryRun: true,
    approvalRequired,
    approval,
    executionAllowed: false,
    safeToRecommend,
    oldModelRetained: true,
    autoDeletesOldModel: false,
    autoPullsModel: false,
    status: approval ? "approval_required" : status,
    reasons,
    constraints: {
      runtimeMode: snapshot.runtimeMode,
      gpuTelemetry: snapshot.telemetry.gpuTelemetryUnavailable ? "degraded" : "healthy",
      diskFreeBytes: snapshot.telemetry.diskFreeBytes,
      estimatedRuntimeBytes,
      estimatedDiskBytes,
      evalProofRequired: needsEvalProof,
      evalProofPresent,
    },
  };
}

export function buildModelActionPayload(input: {
  action: ModelLifecycleAction;
  modelName?: string;
  currentModelName?: string;
  candidateModelName?: string;
  role?: string;
}): Record<string, unknown> {
  return {
    action: input.action,
    modelName: input.modelName ?? "",
    currentModelName: input.currentModelName ?? "",
    candidateModelName: input.candidateModelName ?? "",
    role: input.role ?? "",
  };
}

export function verifyModelActionApproval(approvalId: string | undefined, payload: Record<string, unknown>) {
  return verifyApprovedRequest(approvalId, payload, "model.lifecycle");
}

