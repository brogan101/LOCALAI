/**
 * LOCALAI CONTROL CENTER — API CLIENT
 * =====================================
 * Typed wrappers around every backend endpoint.
 * All requests are relative to /api so Vite's proxy works in dev
 * and the production build serves both from the same origin.
 */

const BASE = "/api";

export type AgentPermission =
  | "allowAgentExec"
  | "allowAgentEdits"
  | "allowAgentSelfHeal"
  | "allowAgentRefactor";

export interface ApiErrorPayload {
  success?: false;
  blocked?: boolean;
  permission?: AgentPermission;
  message?: string;
  reason?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  status: number;
  payload?: ApiErrorPayload;

  constructor(status: number, message: string, payload?: ApiErrorPayload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function isJsonResponse(res: Response): boolean {
  return res.headers.get("content-type")?.includes("application/json") ?? false;
}

export function isBlockedApiError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.payload?.blocked === true;
}

export function apiErrorMessage(error: unknown, fallback = "Request failed"): string {
  if (isBlockedApiError(error)) return error.payload?.message || "Action blocked by agent permissions.";
  if (error instanceof ApiError) return error.payload?.message || error.payload?.reason || error.message || fallback;
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    if (isJsonResponse(res)) {
      const payload = await res.json().catch(() => undefined) as ApiErrorPayload | undefined;
      throw new ApiError(res.status, payload?.message || payload?.reason || `HTTP ${res.status}`, payload);
    }
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const get  = <T>(path: string)                   => req<T>("GET",    path);
const post = <T>(path: string, body?: unknown)   => req<T>("POST",   path, body);
const put  = <T>(path: string, body?: unknown)   => req<T>("PUT",    path, body);
const del  = <T>(path: string, body?: unknown)   => req<T>("DELETE", path, body);

// ── Types (mirroring backend) ─────────────────────────────────────────────────

export interface GatewayModel {
  name: string;
  size: number;
  sizeFormatted: string;
  estimatedRuntimeBytes: number;
  estimatedRuntimeFormatted: string;
  modifiedAt: string;
  digest: string;
  parameterSize?: string;
  quantizationLevel?: string;
  isRunning: boolean;
  sizeVram: number;
  sizeVramFormatted: string;
  assignedRole?: string;
  routeAffinity: "code" | "vision" | "general";
  runtimeClass: "tiny" | "small" | "medium" | "large";
}

export interface VramGuard {
  mode: "nvidia-smi" | "safe-mode";
  status: "healthy" | "degraded";
  provider: string;
  reason: string;
  gpuName?: string;
  totalBytes?: number;
  freeBytes?: number;
  safeBudgetBytes: number;
  reserveBytes: number;
  detectedAt: string;
}

export interface GatewayTagsResult {
  models: GatewayModel[];
  ollamaReachable: boolean;
  totalSize: number;
  totalSizeFormatted: string;
  totalRunningVram: number;
  totalRunningVramFormatted: string;
  vramGuard: VramGuard;
}

export interface SovereignState {
  activeGoal?: string;
  activeAgentName?: string;
  activeStep: number;
  currentStepDescription?: string;
  totalSteps: number;
  executionPlan: string[];
  taskCategory?: "coding" | "sysadmin" | "hardware" | "general";
  lastCatalogSync?: string;
  catalogModelCount: number;
}

export interface CapabilityState {
  id: string;
  enabled: boolean;
  active: boolean;
  phase: string;
  detail?: string;
  assignedJobId?: string;
  lastUpdatedAt: string;
}

export interface KernelState {
  activeCapability?: string;
  lastUpdatedAt: string;
  capabilities: Record<string, CapabilityState>;
  sovereign: SovereignState;
}

export interface ThoughtEntry {
  id: string;
  timestamp: string;
  level: "debug" | "info" | "warning" | "error";
  category: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AsyncJob {
  id: string;
  name: string;
  type: string;
  status: "queued" | "running" | "completed" | "failed" | "paused" | "cancelled";
  progress: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  capability?: string;
  message: string;
  error?: string;
  result?: unknown;
  metadata?: Record<string, unknown>;
}

export type ReplayDataStatus = "recorded" | "missing" | "blocked" | "redacted";

export interface MissionReplayEvent {
  id: string;
  traceId: string;
  timestamp: string;
  source: string;
  kind: string;
  actor?: string;
  target?: string;
  result?: string;
  dataStatus: ReplayDataStatus;
  message: string;
  metadata: Record<string, unknown>;
}

export interface MissionReplay {
  traceId?: string;
  generatedAt: string;
  sourceOfTruth: string;
  events: MissionReplayEvent[];
  summary: {
    totalEvents: number;
    recorded: number;
    missing: number;
    blocked: number;
    redacted: number;
  };
}

export interface LocalEvalResult {
  id: string;
  name: string;
  status: "pass" | "fail";
  message: string;
  details?: Record<string, unknown>;
}

export interface LocalEvalReport {
  success: boolean;
  generatedAt: string;
  localOnly: true;
  networkUsed: false;
  externalProvidersRequired: false;
  results: LocalEvalResult[];
}

export type PermissionTier =
  | "tier0_read_only"
  | "tier1_draft_only"
  | "tier2_safe_local_execute"
  | "tier3_file_modification"
  | "tier4_external_communication"
  | "tier5_manual_only_prohibited";

export type PhysicalTier =
  | "p0_sensor_read"
  | "p1_suggest"
  | "p2_prepare_queue"
  | "p3_low_risk_automation"
  | "p4_approval_required"
  | "p5_manual_only_at_machine";

export interface ApprovalRequest {
  id: string;
  type: string;
  title: string;
  summary: string;
  riskTier: PermissionTier;
  physicalTier?: PhysicalTier;
  requestedAction: string;
  payloadHash: string;
  payload: Record<string, unknown>;
  status: "waiting_for_approval" | "approved" | "denied" | "cancelled" | "expired" | "completed" | "failed";
  jobId?: string;
  auditId?: string;
  requestedAt: string;
  approvedAt?: string;
  deniedAt?: string;
  cancelledAt?: string;
  expiresAt?: string;
  result?: Record<string, unknown>;
}

export interface ApprovalRequiredResponse {
  success: false;
  approvalRequired: true;
  approval: ApprovalRequest;
  message: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface SupervisorInfo {
  category: string;
  agentName: string;
  goal: string;
  steps: string[];
  confidence: number;
  manualOverride: boolean;
  toolset: string;
}

export interface ChatSendResult {
  success: boolean;
  model: string;
  route: unknown;
  message: ChatMessage;
  sessionId?: string;
  context: unknown;
  supervisor: SupervisorInfo;
}

export interface ModelListItem {
  name: string;
  size: number;
  sizeFormatted: string;
  modifiedAt: string;
  digest: string;
  parameterSize?: string;
  quantizationLevel?: string;
  isRunning: boolean;
  assignedRole?: string;
  vramWarning: boolean;
  sizeVram: number;
  sizeVramFormatted: string;
  lifecycle: string;
  updateAvailable: boolean;
  lastError?: string;
  routeAffinity: string;
  estimatedRuntimeFormatted: string;
}

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
  status: string;
  sizeFormatted: string;
  estimatedRuntimeFormatted: string;
  evalScores: Record<string, number>;
  runtimeModeCompatibility: { currentMode: RuntimeMode; compatible: boolean; reason: string };
  replacementCandidate: boolean;
  routeAffinity: string;
}

export interface BackendProfile {
  id: string;
  displayName: string;
  kind: ProviderKind;
  localFirst: boolean;
  default: boolean;
  status: ProviderStatus;
  configured: boolean;
  requiresApiKey: boolean;
  dataLeavesMachine: boolean;
  startupPolicy: string;
  allowedRuntimeModes: RuntimeMode[];
  notes: string;
}

export interface ModelLifecycleSnapshot {
  success: boolean;
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
  roles: Array<{ role: string; assignedModel: string; valid: boolean; warning?: string }>;
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

export interface ModelLifecycleProposal {
  id: string;
  action: string;
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
  status: string;
  reasons: string[];
  constraints: Record<string, unknown>;
}

export type MaintainerUpdateState =
  | "detected"
  | "proposed"
  | "staged"
  | "testing"
  | "passed"
  | "failed"
  | "approved"
  | "applied"
  | "rolled_back"
  | "blocked"
  | "not_configured";

export interface SelfMaintainerProposal {
  id: string;
  kind: string;
  title: string;
  source: string;
  sourceUrl?: string;
  sourceTrust: { status: string; reason: string; watchlistProject?: string };
  currentVersionOrState: string;
  candidateVersionOrState: string;
  riskLevel: "low" | "medium" | "high" | "blocked";
  affectedFiles: string[];
  affectedServices: string[];
  requiredTests: string[];
  rollbackPlan: { required: true; summary: string; snapshotRequired: true; steps: string[] };
  approvalRequired: true;
  branchRequired: true;
  applyDirectlyToMainAllowed: false;
  dryRun: boolean;
  localOnly: boolean;
  networkUsed: boolean;
  status: MaintainerUpdateState;
  resultStatus: "not_applied" | "not_configured" | "blocked" | "failed" | "proposal_only";
  resultMessage: string;
  approval?: ApprovalRequest;
  modelProposal?: ModelLifecycleProposal;
  metadata: Record<string, unknown>;
}

export interface SelfMaintainerSnapshot {
  success: boolean;
  generatedAt: string;
  sourceOfTruth: string;
  updaterRepairSourceOfTruth: string;
  localFirst: true;
  noPaidApisRequired: true;
  dryRunOnly: boolean;
  networkUsed: boolean;
  runtimeMode: RuntimeMode;
  git: {
    available: boolean;
    branch: string;
    directMainApplyBlocked: true;
    dirtyFileCount: number | "unknown";
  };
  lockfile: { present: boolean; path: string; hash?: string };
  proposals: SelfMaintainerProposal[];
  rules: Record<string, true>;
}

export interface SelfMaintainerActionResult {
  success: false;
  applied: false;
  approvalRequired: boolean;
  approval?: ApprovalRequest;
  dryRun: boolean;
  status: MaintainerUpdateState;
  resultStatus: string;
  message: string;
  proposal: SelfMaintainerProposal;
}

export interface HeartbeatStatus {
  state: "local" | "online" | "degraded" | "offline";
  mode: string;
  provider: string;
  targetBaseUrl: string;
  authEnabled: boolean;
  connectedRemotely: boolean;
  latencyMs?: number;
  lastCheckedAt?: string;
  message: string;
}

export interface DiagnosticItem {
  category: string;
  label: string;
  status: "ok" | "warning" | "error" | "unknown";
  value: string;
  details?: string;
}

// ── Health ────────────────────────────────────────────────────────────────────

export const health = {
  ping: () => get<{ status: string }>("/healthz"),
};

// ── Kernel / State ────────────────────────────────────────────────────────────

export const kernel = {
  getState:   () => get<{ state: KernelState }>("/kernel/state"),
  setCapability: (id: string, body: Partial<CapabilityState>) =>
    put<{ success: boolean; state: KernelState }>(`/kernel/capabilities/${encodeURIComponent(id)}`, body),
};

// ── Models ────────────────────────────────────────────────────────────────────

export const models = {
  tags:          () => get<GatewayTagsResult>("/tags"),
  list:          () => get<{ models: ModelListItem[]; ollamaReachable: boolean; vramGuard: VramGuard; totalSizeFormatted: string }>("/models/list"),
  running:       () => get<{ models: Array<{ name: string; sizeVram: number; sizeVramFormatted: string }>; ollamaReachable: boolean; totalVramFormatted: string }>("/models/running"),
  refresh:       () => post<{ success: boolean; message: string; modelCount: number; syncedAt: string }>("/models/refresh"),
  catalogStatus: () => get<{ cacheAgeMs: number | null; isCached: boolean; lastCatalogSync?: string; catalogModelCount: number }>("/models/catalog/status"),
  lifecycle:     () => get<ModelLifecycleSnapshot>("/models/lifecycle"),
  proposeLifecycleAction: (body: { action: string; modelName?: string; currentModelName?: string; candidateModelName?: string; role?: string; dryRunOnly?: boolean; evalProof?: Record<string, number> }) =>
    post<{ success: boolean; proposal: ModelLifecycleProposal }>("/models/lifecycle/actions/propose", body),
  proposeReplacement: (body: { currentModelName?: string; candidateModelName?: string; role?: string; dryRunOnly?: boolean; evalProof?: Record<string, number> }) =>
    post<{ success: boolean; proposal: ModelLifecycleProposal }>("/models/lifecycle/replacements/propose", body),
  pull:          (modelName: string, approvalId?: string) => post<{ success: boolean; jobId?: string; approvalRequired?: true; approval?: ApprovalRequest; proposal?: ModelLifecycleProposal; message?: string }>("/models/pull", { modelName, approvalId }),
  load:          (modelName: string, approvalId?: string) => post<{ success: boolean; message: string; approvalRequired?: true; approval?: ApprovalRequest; proposal?: ModelLifecycleProposal }>("/models/load", { modelName, approvalId }),
  stop:          (modelName: string, approvalId?: string) => post<{ success: boolean; message: string; approvalRequired?: true; approval?: ApprovalRequest; proposal?: ModelLifecycleProposal }>("/models/stop", { modelName, approvalId }),
  delete:        (modelName: string, approvalId?: string) => del<{ success: boolean; message: string; approvalRequired?: true; approval?: ApprovalRequest; proposal?: ModelLifecycleProposal }>(`/models/${encodeURIComponent(modelName)}/delete`, { approvalId }),
  pullStatus:    () => get<{ jobs: Array<{ modelName: string; status: string; progress: number; message: string; jobId: string }> }>("/models/pull-status"),
  roles:         () => get<{ roles: Array<{ role: string; label: string; description: string; assignedModel: string; isValid: boolean; warning?: string }>; installedModels: string[]; popularModels: unknown[] }>("/models/roles"),
  setRoles:      (roles: Array<{ role: string; model: string }>) => put("/models/roles", { roles }),
  catalog:       () => get<{ catalog: unknown[] }>("/models/catalog"),
};

// ── Chat ──────────────────────────────────────────────────────────────────────

export const chat = {
  send: (messages: ChatMessage[], model?: string, sessionId?: string, workspacePath?: string, useCodeContext?: boolean) =>
    post<ChatSendResult>("/chat/send", { messages, model, sessionId, workspacePath, useCodeContext }),

  assistant: (prompt: string, context?: string, workspacePath?: string) =>
    post<{ success: boolean; result: string; model: string; route: unknown }>("/chat/assistant", { prompt, context, workspacePath }),

  command: (command: string) =>
    post<{ success: boolean; action?: string; message: string }>("/chat/command", { command }),

  chatModels: () =>
    get<{ models: Array<{ name: string; paramSize?: string }>; ollamaReachable: boolean; vramGuard: VramGuard }>("/chat/models"),

  /** Open a streaming SSE connection for chat. Returns an EventSource. */
  stream: (messages: ChatMessage[], model?: string, workspacePath?: string, useCodeContext?: boolean) => {
    const body = JSON.stringify({ messages, model, workspacePath, useCodeContext });
    return fetch(`${BASE}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  },
};

// ── Observability ─────────────────────────────────────────────────────────────

export const observability = {
  thoughts:     (limit = 100) => get<{ entries: ThoughtEntry[] }>(`/observability/thoughts?limit=${limit}`),
  streamThoughts: () => new EventSource(`${BASE}/observability/thoughts/stream`),
  missionReplay: (traceId?: string, limit = 200) =>
    get<{ success: boolean; replay: MissionReplay }>(
      `/observability/mission-replay?limit=${limit}${traceId ? `&traceId=${encodeURIComponent(traceId)}` : ""}`
    ),
  traceReplay: (traceId: string, limit = 200) =>
    get<{ success: boolean; replay: MissionReplay }>(`/mission-replay/${encodeURIComponent(traceId)}?limit=${limit}`),
  evalSuites: () =>
    get<{ success: boolean; localOnly: true; networkUsed: false; externalProvidersRequired: false; suites: string[]; sourceOfTruth: string }>(
      "/observability/evals"
    ),
  runEvals: () =>
    post<{ success: boolean; report: LocalEvalReport }>("/observability/evals/run"),
};

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const tasks = {
  list: () => get<{ jobs: AsyncJob[] }>("/tasks"),
  get:  (id: string) => get<{ job: AsyncJob }>(`/tasks/${encodeURIComponent(id)}`),
};

// ── Approval Queue ───────────────────────────────────────────────────────────

export const approvals = {
  list: (limit = 100) =>
    get<{ success: boolean; approvals: ApprovalRequest[] }>(`/approvals?limit=${limit}`),
  get: (id: string) =>
    get<{ success: boolean; approval: ApprovalRequest }>(`/approvals/${encodeURIComponent(id)}`),
  request: (body: {
    type: string;
    title: string;
    summary: string;
    riskTier: PermissionTier;
    physicalTier?: PhysicalTier;
    requestedAction: string;
    payload: Record<string, unknown>;
    expiresAt?: string;
  }) =>
    post<{ success: boolean; approvalRequired: true; approval: ApprovalRequest }>("/approvals", body),
  approve: (id: string, note?: string) =>
    post<{ success: boolean; approval: ApprovalRequest }>(`/approvals/${encodeURIComponent(id)}/approve`, { note }),
  deny: (id: string, reason?: string) =>
    post<{ success: boolean; approval: ApprovalRequest }>(`/approvals/${encodeURIComponent(id)}/deny`, { reason }),
  cancel: (id: string, reason?: string) =>
    post<{ success: boolean; approval: ApprovalRequest }>(`/approvals/${encodeURIComponent(id)}/cancel`, { reason }),
};

// ── Runtime Modes ────────────────────────────────────────────────────────────

export type RuntimeMode =
  | "Lightweight"
  | "Coding"
  | "Vision"
  | "Media"
  | "Business"
  | "Maker"
  | "HomeLab"
  | "HomeShop"
  | "Gaming"
  | "EmergencyStop";

export type StartupPolicy = "disabled" | "manual" | "on_demand" | "mode_based";
export type ResourceClass = "light" | "medium" | "heavy" | "gpu" | "physical" | "network";
export type EmergencyStopBehavior = "keep_running" | "unload_models" | "pause_tasks" | "stop_managed" | "disable";

export interface ServicePolicy {
  id: string;
  displayName: string;
  startupPolicy: StartupPolicy;
  allowedModes: RuntimeMode[];
  resourceClass: ResourceClass;
  healthCheck?: string;
  stopCommand?: string;
  emergencyStopBehavior: EmergencyStopBehavior;
  requiresApproval: boolean;
  updatedAt: string;
}

export interface RuntimeAction {
  type: string;
  target: string;
  status: "success" | "failed" | "skipped";
  message: string;
}

export interface RuntimeModeState {
  success: boolean;
  mode: RuntimeMode;
  physicalActionsDisabled: boolean;
  servicePolicies: ServicePolicy[];
  updatedAt: string;
  actions?: RuntimeAction[];
}

export const runtime = {
  get:           () => get<RuntimeModeState>("/runtime-mode"),
  setMode:       (mode: RuntimeMode, reason?: string) => post<RuntimeModeState>("/runtime-mode/set", { mode, reason }),
  servicePolicies: () => get<{ success: boolean; policies: ServicePolicy[] }>("/service-policies"),
  updatePolicy:  (id: string, body: Partial<ServicePolicy>) =>
    post<{ success: boolean; policy: ServicePolicy }>(`/service-policies/${encodeURIComponent(id)}/update`, body),
  emergencyStop: (reason?: string) => post<RuntimeModeState>("/emergency-stop", { reason }),
};

// ── Local-first Provider Policy ──────────────────────────────────────────────

export type DataClassification =
  | "public"
  | "normal"
  | "private"
  | "sensitive"
  | "secret"
  | "credential"
  | "private-file/RAG";

export type ProviderKind = "local" | "cloud";
export type ProviderStatus = "available" | "disabled" | "not_configured";

export interface ProviderSummary {
  id: string;
  displayName: string;
  kind: ProviderKind;
  localFirst: boolean;
  requiresApiKey: boolean;
  dataLeavesMachine: boolean;
  defaultBaseUrl: string;
  enabled: boolean;
  configured: boolean;
  firstUseApproved: boolean;
  allowPrivateFileData: boolean;
  baseUrl: string;
  model: string;
  apiKeySet: boolean;
  apiKeyPreview: string;
  status: ProviderStatus;
  notes: string;
  costHintUsdPer1MTokens?: number;
}

export interface ProviderPolicySnapshot {
  success: boolean;
  defaultProviderId: string;
  localFirst: true;
  localOnlyByDefault: true;
  providers: ProviderSummary[];
  classifications: DataClassification[];
  rules: {
    cloudRequiresExplicitConfiguration: true;
    secretAndCredentialBlockedForCloud: true;
    privateFileRagBlockedForCloudByDefault: true;
    missingCloudProvidersDoNotBlockLocalMode: true;
  };
}

export interface ProviderPolicyDecision {
  allowed: boolean;
  providerId: string;
  providerKind: ProviderKind;
  status: ProviderStatus | "blocked_by_policy";
  dataClassification: DataClassification;
  dataLeavesMachine: boolean;
  reason: string;
  requiresApproval: boolean;
  costEstimateUsd: number | null;
}

export const providerPolicy = {
  get: () => get<ProviderPolicySnapshot>("/provider-policy"),
  updateProvider: (id: string, body: Partial<ProviderSummary> & { apiKey?: string; makeDefault?: boolean }) =>
    put<{ success: boolean; provider: ProviderSummary }>(`/provider-policy/providers/${encodeURIComponent(id)}`, body),
  testProvider: (id: string) =>
    post<{ success: boolean; providerId: string; status: ProviderStatus | "mock_configured"; networkUsed: false; message: string }>(
      `/provider-policy/providers/${encodeURIComponent(id)}/test`,
    ),
  evaluate: (body: { providerId?: string; dataClassification?: DataClassification; approvedForThisUse?: boolean; estimatedTokens?: number }) =>
    post<{ success: boolean; decision: ProviderPolicyDecision }>("/provider-policy/evaluate", body),
};

// ── System ────────────────────────────────────────────────────────────────────

export interface CleanupArtifact {
  id: string;
  path: string;
  type: string;
  description: string;
  risk: "safe" | "moderate" | "high";
  selected: boolean;
  sizeBytes: number;
}

export interface LogLine {
  timestamp?: string;
  level?: string;
  message: string;
  source: string;
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  action: string;
  component?: string;
  status: string;
  message: string;
}

export interface StorageItem {
  label: string;
  path: string;
  sizeBytes: number;
  sizeFormatted: string;
  category: string;
}

export interface AppSettings {
  tokenWarningThreshold: number;
  dailyTokenLimit: number;
  defaultChatModel: string;
  defaultCodingModel: string;
  autoStartOllama: boolean;
  showTokenCounts: boolean;
  chatHistoryDays: number;
  theme: string;
  notificationsEnabled: boolean;
  modelDownloadPath: string;
  preferredInstallMethod: string;
  autoUpdateCheck: boolean;
  updateCheckInterval: number;
  backupBeforeUpdate: boolean;
  maxConcurrentModels: number;
  vramAlertThreshold: number;
  sidebarCollapsed: boolean;
  // Agent permissions
  allowAgentEdits:           boolean;
  allowAgentExec:            boolean;
  allowAgentSelfHeal:        boolean;
  allowAgentRefactor:        boolean;
  requireActionConfirmation: boolean;
  // Phase 6
  speakReplies:               boolean;
  enableWebSearch:            boolean;
  strictLocalMode:            boolean;
  adaptiveForegroundProfiles: boolean;
  ttsVoice:                   string;
  // Theme customization
  themePreset:    string;
  themeOverrides: Record<string, string>;
}

export const system = {
  diagnostics:  () => get<{ items: DiagnosticItem[]; generatedAt: string; recommendations: string[] }>("/system/diagnostics"),
  heartbeat:    () => get<HeartbeatStatus>("/remote/heartbeat"),  // alias at /remote/heartbeat → /remote/network/status
  killSwitch:   () => post<{ success: boolean; message: string }>("/system/process/kill-switch"),
  cleanupScan:  () => get<{ artifacts: CleanupArtifact[]; totalFound: number; staleWrappers: number; obsoleteScripts: number; safeCount: number; spaceSavable: string; spaceSavableBytes: number }>("/system/cleanup/scan"),
  cleanupRun:   (artifactIds: string[]) => post<{ success: boolean; message: string; removedPaths: string[]; scheduledForReboot: string[]; skipped: Array<{ path: string; reason: string }> }>("/system/cleanup/execute", { artifactIds }),
  activity:     () => get<{ entries: ActivityEntry[]; total: number }>("/system/activity"),
  restart:      (reason?: string) => post<{ success: boolean; message: string }>("/system/sovereign/restart", { reason }),
  sovereignEdit: (filePath: string, newContent: string, approvalId?: string) =>
    post<{ success: boolean; filePath: string; diff: string; message: string } | ApprovalRequiredResponse>("/system/sovereign/edit", { filePath, newContent, approvalId }),
  sovereignPreview: (filePath: string, newContent: string) =>
    post<{ success: boolean; proposal: { filePath: string; diff: string } }>("/system/sovereign/preview", { filePath, newContent }),
  macros:       () => get<{ macros: unknown[] }>("/system/macros"),
  runMacro:     (name: string) => post<{ success: boolean; stepsExecuted: number; error?: string }>(`/system/macros/${encodeURIComponent(name)}/run`),
  windows:      (pattern?: string) => get<{ windows: unknown[] }>(`/system/windows${pattern ? `?pattern=${encodeURIComponent(pattern)}` : ""}`),

  // ── File Execution Agent ───────────────────────────────────────────────────
  execRun:      (command: string, cwd?: string, timeoutMs?: number, approvalId?: string) =>
    post<ExecRunResult | ApprovalRequiredResponse>("/system/exec/run", { command, cwd, timeoutMs, approvalId }),
  execFile:     (filePath: string, cwd?: string, timeoutMs?: number) =>
    post<ExecRunResult>("/system/exec/file", { filePath, cwd, timeoutMs }),
  execSelfHeal: (filePath: string, cwd?: string, maxAttempts?: number) =>
    post<SelfHealResult>("/system/exec/self-heal", { filePath, cwd, maxAttempts }),
  execDiagnose: (stderr: string, sourceCode?: string, filePath?: string) =>
    post<{ success: boolean; rootCause: string; explanation: string; suggestions: string[]; model: string }>(
      "/system/exec/diagnose", { stderr, sourceCode, filePath }),
};

// ── Phase 21 recovery / packaging / disaster recovery ───────────────────────

export interface RecoveryProviderStatus {
  id: string;
  name: string;
  status: "local" | "not_configured" | "degraded" | "disabled";
  reason: string;
  startupPolicy: "manual" | "on_demand" | "disabled";
  dataLeavesMachine: false;
}

export interface RecoveryBackupManifest {
  id: string;
  status: string;
  dryRun: boolean;
  createdAt: string;
  scope: Array<{ id: string; label: string; category: string; included: boolean; redaction: string; contentsStored: false; notes: string }>;
  destination: { provider: "local_manifest"; label: string; pathExposed: false; manifestFileRef?: string };
  timestamp: string;
  retention: { policy: "manual"; deleteAutomatically: false; notes: string };
  verification: { status: "not_run" | "passed" | "failed"; checks: string[] };
  rollbackNotes: string[];
  providerStatuses: RecoveryProviderStatus[];
  gamingPcSafe: true;
  noSystemSettingsModified: true;
  noRawSecrets: true;
  noModelBlobs: true;
  manifestHash: string;
  jobId?: string;
}

export interface RecoveryRestorePlan {
  id: string;
  manifestId: string;
  status: string;
  dryRun: boolean;
  createdAt: string;
  approvalRequired: true;
  approvalId?: string;
  approvedRestoreConfigured: false;
  rollbackPoint: { required: true; currentBackupManifestId?: string; notes: string[] };
  dryRunResult: {
    status: "validation_passed" | "validation_failed";
    manifestId: string;
    wouldModify: string[];
    blockedActions: string[];
    requiresApproval: true;
    rollbackPointRequired: true;
    liveDataModified: false;
    verificationSteps: string[];
    reasons: string[];
  };
  executed: false;
  jobId?: string;
}

export const recoveryApi = {
  status: () =>
    get<{
      success: true;
      sourceOfTruth: string;
      localFirst: true;
      noPaidApisRequired: true;
      gamingPcSafe: true;
      realRestoreEnabled: false;
      runtimeMode: string;
      providers: RecoveryProviderStatus[];
      latestBackup: RecoveryBackupManifest | null;
      latestRestorePlan: RecoveryRestorePlan | null;
    }>("/system/recovery/status"),
  installPlan: () =>
    get<{ success: true; status: "proposal"; gamingPcSafe: true; localFirst: true; modifiesSystemSettings: false; autoStartsServices: false; opensFirewallPorts: false; modifiesPathGlobally: false; steps: string[]; optionalProviders: RecoveryProviderStatus[] }>("/system/recovery/install-plan"),
  backups: (limit = 20) =>
    get<{ success: boolean; backups: RecoveryBackupManifest[] }>(`/system/recovery/backups?limit=${limit}`),
  createBackup: (dryRun = true) =>
    post<{ success: boolean; manifest: RecoveryBackupManifest; message: string }>("/system/recovery/backups", { dryRun }),
  validateRestore: (manifestId: string) =>
    post<{ success: boolean; result: RecoveryRestorePlan["dryRunResult"] }>("/system/recovery/restore/validate", { manifestId }),
  restoreDryRun: (manifestId: string) =>
    post<{ success: boolean; plan: RecoveryRestorePlan; message: string }>("/system/recovery/restore/dry-run", { manifestId }),
  proposeRestore: (manifestId: string, currentBackupManifestId?: string, approvalId?: string) =>
    post<{ success: boolean; status: string; approvalRequired: boolean; approval?: ApprovalRequest; plan: RecoveryRestorePlan; message: string }>(
      "/system/recovery/restore/propose", { manifestId, currentBackupManifestId, approvalId },
    ),
};

// ── Workspace ─────────────────────────────────────────────────────────────────

export const workspace = {
  projects:    () => get<{ projects: unknown[]; recentCount: number; pinnedCount: number }>("/workspace/projects"),
  readiness:   () => get<{ overallStatus: string; items: unknown[]; recommendations: string[] }>("/workspace/readiness"),
  templates:   () => get<{ templates: unknown[] }>("/workspace/templates"),
};

// ── Execution agent types ─────────────────────────────────────────────────────

export interface ExecRunResult {
  success:    boolean;
  exitCode:   number | null;
  stdout:     string;
  stderr:     string;
  durationMs: number;
  command:    string;
  timedOut:   boolean;
}

export interface RepairAttempt {
  attempt:      number;
  errorSummary: string;
  proposedFix?: string;
  appliedFix:   boolean;
  runAfterFix:  ExecRunResult;
}

export interface SelfHealResult {
  success:       boolean;
  attempts:      number;
  finalRun:      ExecRunResult;
  repairs:       RepairAttempt[];
  filePath:      string;
  finalContent?: string;
}

// ── Studio pipeline types ─────────────────────────────────────────────────────

export interface CadScriptResult {
  type: "openscad" | "blender" | "gcode";
  script: string;
  description: string;
  savedPath?: string;
  generatedAt: string;
  model: string;
}

export interface GCodeOptimizeResult {
  originalLineCount: number;
  optimizedLineCount: number;
  optimizedGCode: string;
  changes: string[];
  savedPath?: string;
  optimizedAt: string;
}

export interface ImageGenStatus {
  comfyuiReachable: boolean;
  sdWebuiReachable: boolean;
  preferredBackend: "comfyui" | "sdwebui" | "none";
}

export type ImageStyle = "photorealistic" | "anime" | "oil-painting" | "sketch" | "cinematic";

export interface PromptArchitectResult {
  originalPrompt: string;
  expandedPrompt: string;
  negativePrompt: string;
  style: ImageStyle;
  model: string;
  expandedAt: string;
}

export interface ImageGenResult {
  success: boolean;
  backend: "comfyui" | "sdwebui";
  promptId?: string;
  images: string[];
  savedPaths: string[];
  prompt: string;
  expandedPrompt?: string;
  generatedAt: string;
  error?: string;
}

export interface VibeCodingTestResult {
  success: boolean;
  status?: number;
  body?: string;
  error?: string;
  endpointUrl: string;
  testedAt: string;
}

export type MakerProjectType = "cad" | "3d_print" | "cnc" | "laser" | "electronics" | "shop" | "other";
export type MakerSafetyTier = "read_only" | "simulate" | "prepare_queue" | "approval_required_run" | "manual_only_at_machine";

export interface MakerFileRef {
  id: string;
  label: string;
  path?: string;
  hash?: string;
  kind?: string;
}

export interface MakerProject {
  id: string;
  name: string;
  type: MakerProjectType;
  status: string;
  safetyTier: MakerSafetyTier;
  physicalTier: string;
  relatedFiles: MakerFileRef[];
  cadFiles: MakerFileRef[];
  slicedFiles: MakerFileRef[];
  target: Record<string, unknown>;
  material: Record<string, unknown>;
  traceability: Record<string, unknown>;
  approvalId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MakerMaterial {
  id: string;
  name: string;
  category: string;
  properties: Record<string, unknown>;
  safetyNotes: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface MakerIntegration {
  id: string;
  name: string;
  category: string;
  status: "disabled" | "not_configured" | "degraded";
  configured: boolean;
  detected: boolean;
  executionEnabled: false;
  startupPolicy: "disabled";
  reason: string;
  nextAction: string;
}

export interface MakerCadProvider {
  id: string;
  name: string;
  kind: string;
  localFirst: boolean;
  cloudProvider: boolean;
  apiKeyRequired: boolean;
  status: "disabled" | "not_installed" | "not_configured" | "ready" | "error" | "degraded";
  configured: boolean;
  detected: boolean;
  proposalOnly: true;
  executionEnabled: false;
  dataLeavesMachine: false;
  approvalRequiredForExecution: boolean;
  safeWorkspaceRequired: boolean;
  supportedActions: string[];
  reason: string;
  nextAction: string;
}

export interface MakerPrintProvider {
  id: string;
  name: string;
  kind: string;
  localFirst: boolean;
  apiKeyRequired: boolean;
  status: "disabled" | "not_installed" | "not_configured" | "ready" | "error" | "degraded";
  configured: boolean;
  detected: boolean;
  proposalOnly: true;
  executionEnabled: false;
  dataLeavesMachine: false;
  approvalRequiredForExecution: boolean;
  supportedActions: string[];
  reason: string;
  nextAction: string;
}

export interface MakerMachineProvider {
  id: string;
  name: string;
  kind: string;
  localFirst: boolean;
  apiKeyRequired: boolean;
  status: "disabled" | "not_installed" | "not_configured" | "ready" | "error" | "degraded";
  configured: boolean;
  detected: boolean;
  proposalOnly: true;
  executionEnabled: false;
  dataLeavesMachine: false;
  hardwareWriteEnabled: false;
  approvalRequiredForExecution: boolean;
  physicalConfirmationRequired: boolean;
  manualOnlyDangerousActions: true;
  supportedActions: string[];
  reason: string;
  nextAction: string;
}

export interface MakerSafetyPolicy {
  id: MakerSafetyTier;
  label: string;
  physicalTier: string;
  approvalRequired: boolean;
  executionAllowed: boolean;
  description: string;
}

export interface MakerStudioStatus {
  sourceOfTruth: string;
  localFirst: boolean;
  cloudRequired: boolean;
  executionEnabled: boolean;
  machineControlEnabled: boolean;
  hardLimits: Record<string, boolean>;
  counts: { projects: number; materials: number; cadArtifacts: number };
  integrations: MakerIntegration[];
  cadProviders: MakerCadProvider[];
  printProviders: MakerPrintProvider[];
  machineProviders: MakerMachineProvider[];
  safetyPolicies: MakerSafetyPolicy[];
}

export interface MakerDesignProposal {
  success: true;
  status: "proposal";
  executed: false;
  proposalMode: "review" | "dry_run";
  provider: MakerCadProvider;
  artifact: {
    id: string;
    projectId: string;
    artifactType: string;
    name: string;
    path?: string;
    metadata: Record<string, unknown>;
    safetyTier: MakerSafetyTier;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  metadata: {
    targetFileNames: string[];
    workspaceRelativePath: string;
    scriptLanguage: string;
    designKind: string;
    units: string;
    dimensions: Record<string, number | string>;
    constraints: string[];
    assumptions: string[];
    previewIntent: string;
    exportTargets: string[];
    validationSteps: string[];
    riskNotes: string[];
    reviewRequired: true;
    physicallySafeClaimed: false;
    manufacturableClaimed: false;
    executionEnabled: false;
    toolExecutionAttempted: false;
    dataLeavesMachine: false;
    cloudRequired: false;
    scriptStored: false;
    scriptPreview: string[];
  };
  reason: string;
}

export interface MakerActionResult {
  success: boolean;
  status: string;
  executed: false;
  approvalRequired: boolean;
  approval?: { id: string; status: string; physicalTier?: string };
  project?: MakerProject;
  integration?: MakerIntegration;
  safetyTier?: MakerSafetyTier;
  physicalTier?: string;
  reason: string;
}

export interface MakerSlicingProposal {
  success: true;
  status: "proposal";
  executed: false;
  proposalMode: "dry_run" | "config_validation";
  provider: MakerPrintProvider;
  artifact: {
    id: string;
    projectId: string;
    artifactType: string;
    name: string;
    path?: string;
    metadata: Record<string, unknown>;
    safetyTier: MakerSafetyTier;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  materialCheck: {
    status: "manual_review" | "blocked" | "not_configured";
    providerId: "spoolman";
    providerStatus: string;
    materialName: string;
    available: "unverified" | false;
    blocksQueue: boolean;
    reason: string;
  };
  metadata: Record<string, unknown>;
  reason: string;
}

export interface MakerMachineSetupSheet {
  success: true;
  status: "proposal";
  executed: false;
  proposalMode: "dry_run" | "review" | "simulation_metadata";
  provider: MakerMachineProvider;
  artifact: {
    id: string;
    projectId: string;
    artifactType: string;
    name: string;
    path?: string;
    metadata: Record<string, unknown>;
    safetyTier: MakerSafetyTier;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  metadata: Record<string, unknown> & {
    operationType?: string;
    workspaceRelativePath?: string;
    machineProfile?: string;
    verificationChecklist?: string[];
    ppeNotes?: string[];
  };
  reason: string;
}

// ── Robotics Lab types (Phase 19 — simulator-first, no real hardware) ────────

export type RoboticsProviderStatus = "not_configured" | "degraded" | "disabled";

export type RoboticsCapabilityTier =
  | "simulation_only"
  | "read_state"
  | "plan_motion"
  | "execute_motion"
  | "manual_only";

export type RoboticsActionType =
  | "sim_run"
  | "read_state"
  | "plan_motion"
  | "execute_motion"
  | "gripper_open"
  | "gripper_close"
  | "arm_move"
  | "navigate"
  | "firmware_flash"
  | "relay_toggle"
  | "serial_write";

export interface RoboticsProvider {
  id: string;
  name: string;
  category: string;
  status: RoboticsProviderStatus;
  configured: false;
  executionEnabled: false;
  hardwareEnabled: false;
  simulationEnabled: false;
  externalApiCallsMade: false;
  dataLeavesMachine: false;
  reason: string;
  nextAction: string;
  supportedCapabilities: RoboticsCapabilityTier[];
}

export interface RobotProfile {
  id: string;
  name: string;
  robotType: "arm" | "rover" | "drone" | "humanoid" | "custom";
  simModel: string;
  urdfRef: string;
  joints: Array<{ name: string; type: string; status: string }>;
  sensors: Array<{ name: string; type: string; status: string }>;
  safeWorkspace: string;
  safetyNotes: string[];
  physicalHardwarePresent: false;
  providerStatus: "local" | "not_configured";
  linkedDigitalTwinId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoboticsSimPlan {
  id: string;
  profileId: string;
  name: string;
  taskDescription: string;
  planStatus: "draft" | "proposal" | "simulated" | "blocked";
  simulationOnly: true;
  simulatorStatus: "not_configured" | "proposed" | "simulation_only" | "unavailable";
  poseEstimateStatus: "unknown" | "not_configured";
  mapStatus: "unknown" | "not_configured";
  safetyState: "unknown" | "not_configured";
  motionSequence: Array<{
    step: number;
    action: string;
    capabilityTier: RoboticsCapabilityTier;
    note: string;
  }>;
  assumptions: string[];
  hardwareExecutionBlocked: true;
  reviewRequired: true;
  localOnly: true;
  externalApiCallsMade: false;
  createdAt: string;
  updatedAt: string;
}

export interface RoboticsActionProposal {
  id: string;
  profileId: string;
  simPlanId?: string;
  actionType: RoboticsActionType;
  capabilityTier: RoboticsCapabilityTier;
  status:
    | "proposal"
    | "simulation_only"
    | "approval_required"
    | "denied"
    | "not_configured"
    | "blocked"
    | "manual_only";
  approvalRequired: boolean;
  approval?: { id: string; status: string };
  executed: false;
  hardwareEnabled: false;
  externalApiCallsMade: false;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface RoboticsStatus {
  sourceOfTruth: string;
  localFirst: true;
  cloudRequired: false;
  externalApiCallsMade: false;
  realHardwareCallsEnabled: false;
  physicalMotionBlocked: true;
  actuatorControlBlocked: true;
  serialWriteBlocked: true;
  firmwareFlashBlocked: true;
  simulatorFirstWorkflow: true;
  phase: "19_future_planning_only";
  profileCount: number;
  simPlanCount: number;
  providers: RoboticsProvider[];
}

// ── Studios ───────────────────────────────────────────────────────────────────

// ── Workspace Preset types (mirrors workspace-presets.ts) ─────────────────────

export type StartingLayout =
  | "split-editor-chat"
  | "single-chat"
  | "canvas-chat"
  | "gallery-chat";

export interface PresetToolset {
  rag:        boolean;
  vision:     boolean;
  fileExec:   boolean;
  webSearch:  boolean;
  osInterop:  boolean;
  gcode:      boolean;
  openscad:   boolean;
  comfyui:    boolean;
}

export interface WorkspacePreset {
  id:                           string;
  name:                         string;
  description:                  string;
  icon:                         string;
  requiredRoles:                string[];
  optionalRoles:                string[];
  toolset:                      PresetToolset;
  systemPrompt:                 string;
  startingLayout:               StartingLayout;
  defaultWorkspacePathTemplate: string;
  /** Added by server: 'ready' | 'partial' | 'missing' */
  readiness?:  string;
  roleStatus?: Array<{ role: string; modelName: string | null; installed: boolean }>;
}

export interface PresetEnterResult {
  success:      boolean;
  sessionId:    string;
  presetId:     string;
  redirectPath: string;
  preset: {
    id:             string;
    name:           string;
    systemPrompt:   string;
    startingLayout: StartingLayout;
    toolset:        PresetToolset;
  };
  roleModels: Array<{ role: string; modelName: string | null }>;
}

export const studios = {
  templates:    () => get<{ templates: unknown[] }>("/studios/templates"),
  catalog:      () => get<{ workspaces: unknown[]; parameterBlocks: unknown[] }>("/studios/catalog"),
  plan:         (brief: string, templateId?: string) =>
    post<{ success: boolean; plan: unknown; generatedBy: string }>("/studios/plan", { brief, templateId }),
  build:        (name: string, brief: string, templateId: string, aiPlan?: unknown) =>
    post<{ success: boolean; jobId: string; studioPath: string }>("/studios/build", { name, brief, templateId, aiPlan }),
  buildStatus:  (jobId: string) =>
    get<{ success: boolean; job: unknown }>(`/studios/build/${encodeURIComponent(jobId)}`),
  integrations: () => get<{ repos: unknown[] }>("/studios/integrations"),

  // ── Workspace Presets ──────────────────────────────────────────────────────
  presets: {
    list:  () => get<{ presets: WorkspacePreset[] }>("/studios/presets"),
    enter: (presetId: string, workspacePath: string) =>
      post<PresetEnterResult>("/studios/presets/enter", { presetId, workspacePath }),
  },

  // ── Vibe Coding ────────────────────────────────────────────────────────────
  vibeCheck: (studioPath: string, port?: number, endpointPath?: string, startCommand?: string) =>
    post<{ success: boolean; result: VibeCodingTestResult }>("/studios/vibecheck", {
      studioPath, port, endpointPath, startCommand,
    }),

  // ── CAD / Hardware ─────────────────────────────────────────────────────────
  cad: {
    openscad: (description: string, save = true) =>
      post<{ success: boolean; result: CadScriptResult }>("/studios/cad/openscad", { description, save }),
    blender: (description: string, save = true) =>
      post<{ success: boolean; result: CadScriptResult }>("/studios/cad/blender", { description, save }),
    gcode: (gcode: string, printerType: "fdm" | "laser" = "fdm", save = true) =>
      post<{ success: boolean; result: GCodeOptimizeResult }>("/studios/cad/gcode", { gcode, printerType, save }),
    render: (scadScript: string) =>
      post<{ success: boolean; base64Png?: string; mimeType?: string; message?: string; installHint?: string }>(
        "/studios/cad/render", { scadScript }
      ),
  },

  // ── Maker Studio Foundation ────────────────────────────────────────────────
  maker: {
    status: () => get<{ success: boolean; status: MakerStudioStatus }>("/studios/maker/status"),
    safetyPolicies: () => get<{ success: boolean; policies: MakerSafetyPolicy[] }>("/studios/maker/safety-policies"),
    integrations: () => get<{ success: boolean; integrations: MakerIntegration[] }>("/studios/maker/integrations"),
    cadProviders: () => get<{ success: boolean; providers: MakerCadProvider[] }>("/studios/maker/cad/providers"),
    proposeCadProviderAction: (providerId: string, action = "execute") =>
      post<MakerActionResult>(`/studios/maker/cad/providers/${encodeURIComponent(providerId)}/action`, { action }),
    printProviders: () => get<{ success: boolean; providers: MakerPrintProvider[] }>("/studios/maker/print/providers"),
    proposePrintProviderAction: (providerId: string, action = "status") =>
      post<MakerActionResult>(`/studios/maker/print/providers/${encodeURIComponent(providerId)}/action`, { action }),
    machineProviders: () => get<{ success: boolean; providers: MakerMachineProvider[] }>("/studios/maker/machine/providers"),
    proposeMachineProviderAction: (providerId: string, action = "status") =>
      post<MakerActionResult>(`/studios/maker/machine/providers/${encodeURIComponent(providerId)}/action`, { action }),
    proposeIntegrationAction: (integrationId: string, action = "execute") =>
      post<MakerActionResult>(`/studios/maker/integrations/${encodeURIComponent(integrationId)}/action`, { action }),
    projects: (limit = 100) =>
      get<{ success: boolean; projects: MakerProject[] }>(`/studios/maker/projects?limit=${limit}`),
    createProject: (input: {
      name: string;
      type: MakerProjectType;
      safetyTier?: MakerSafetyTier;
      material?: Record<string, unknown>;
      target?: Record<string, unknown>;
      traceability?: Record<string, unknown>;
    }) => post<{ success: boolean; project: MakerProject }>("/studios/maker/projects", input),
    proposeAction: (projectId: string, actionType: string, approvalId?: string) =>
      post<MakerActionResult>(`/studios/maker/projects/${encodeURIComponent(projectId)}/actions/propose`, { actionType, approvalId }),
    materials: (limit = 100) =>
      get<{ success: boolean; materials: MakerMaterial[] }>(`/studios/maker/materials?limit=${limit}`),
    createMaterial: (input: { name: string; category?: string; properties?: Record<string, unknown>; safetyNotes?: string[]; source?: string }) =>
      post<{ success: boolean; material: MakerMaterial }>("/studios/maker/materials", input),
    createCadArtifact: (projectId: string, input: { artifactType?: string; name: string; path?: string; metadata?: Record<string, unknown>; safetyTier?: MakerSafetyTier }) =>
      post<{ success: boolean; artifact: unknown }>(`/studios/maker/projects/${encodeURIComponent(projectId)}/cad-artifacts`, input),
    createDesignProposal: (projectId: string, input: {
      providerId?: string;
      designKind?: "cadquery" | "build123d" | "openscad" | "freecad_macro" | "kicad_project";
      targetFileName?: string;
      units?: string;
      dimensions?: Record<string, number | string>;
      constraints?: string[];
      assumptions?: string[];
      previewIntent?: string;
      exportTargets?: string[];
      validationSteps?: string[];
      riskNotes?: string[];
    }) => post<MakerDesignProposal>(`/studios/maker/projects/${encodeURIComponent(projectId)}/design-proposals`, input),
    createSlicingProposal: (projectId: string, input: {
      providerId?: string;
      designArtifactId?: string;
      sourceModel?: MakerFileRef;
      targetFileName?: string;
      printerProfile?: string;
      material?: Record<string, unknown>;
      layerHeightMm?: number;
      nozzleMm?: number;
      infillPercent?: number;
    }) => post<MakerSlicingProposal>(`/studios/maker/projects/${encodeURIComponent(projectId)}/slicing/proposals`, input),
    proposePrintAction: (projectId: string, input: {
      actionType?: string;
      providerId?: string;
      material?: Record<string, unknown>;
      approvalId?: string;
    }) => post<MakerActionResult>(`/studios/maker/projects/${encodeURIComponent(projectId)}/print/propose`, input),
    createMachineSetupSheet: (projectId: string, input: {
      providerId?: string;
      operationType?: string;
      targetFileName?: string;
      machineProfile?: string;
      stock?: Record<string, unknown>;
      tool?: Record<string, unknown>;
      workholding?: string;
      coordinateOrigin?: string;
      units?: string;
      speedFeedPowerEstimates?: Record<string, unknown>;
      assumptions?: string[];
      ppeNotes?: string[];
      verificationChecklist?: string[];
      simulationStatus?: string;
    }) => post<MakerMachineSetupSheet>(`/studios/maker/projects/${encodeURIComponent(projectId)}/machine/setup-sheets`, input),
    proposeMachineAction: (projectId: string, input: {
      actionType?: string;
      providerId?: string;
      operationType?: string;
      approvalId?: string;
    }) => post<MakerActionResult>(`/studios/maker/projects/${encodeURIComponent(projectId)}/machine/propose`, input),
  },

  // ── Coding ─────────────────────────────────────────────────────────────────
  coding: {
    writeContinueConfig: (workspacePath: string, modelName: string) =>
      post<{ success: boolean; configPath?: string; message?: string }>(
        "/studios/coding/write-continue-config", { workspacePath, modelName }
      ),
  },

  // ── Image Generation ───────────────────────────────────────────────────────
  imagegen: {
    status: () => get<ImageGenStatus>("/studios/imagegen/status"),
    expandPrompt: (prompt: string, style?: PromptArchitectResult["style"]) =>
      post<{ success: boolean; result: PromptArchitectResult }>("/studios/imagegen/expand-prompt", { prompt, style }),
    gallery: () =>
      get<{ success: boolean; files: Array<{ name: string; path: string; mtime: number }> }>(
        "/studios/imagegen/gallery"
      ),
    generate: (
      prompt: string,
      options?: {
        expandPrompt?: boolean;
        style?: PromptArchitectResult["style"];
        steps?: number;
        cfgScale?: number;
        width?: number;
        height?: number;
        seed?: number;
        saveImages?: boolean;
      },
    ) => post<{ success: boolean; result: ImageGenResult }>("/studios/imagegen/generate", { prompt, ...options }),
  },

  // ── Robotics Lab (Phase 19 — simulator-first, no real hardware) ────────────
  robotics: {
    status: () =>
      get<{ success: boolean; status: RoboticsStatus }>("/studios/robotics/status"),
    providers: () =>
      get<{ success: boolean; providers: RoboticsProvider[] }>("/studios/robotics/providers"),
    profiles: (robotType?: string) =>
      get<{ success: boolean; profiles: RobotProfile[] }>(
        `/studios/robotics/profiles${robotType ? `?robotType=${encodeURIComponent(robotType)}` : ""}`,
      ),
    createProfile: (input: {
      name: string;
      robotType?: RobotProfile["robotType"];
      simModel?: string;
      urdfRef?: string;
      joints?: Array<{ name: string; type: string; status?: string }>;
      sensors?: Array<{ name: string; type: string; status?: string }>;
      safeWorkspace?: string;
      safetyNotes?: string[];
    }) => post<{ success: boolean; profile: RobotProfile }>("/studios/robotics/profiles", input),
    getProfile: (profileId: string) =>
      get<{ success: boolean; profile: RobotProfile }>(
        `/studios/robotics/profiles/${encodeURIComponent(profileId)}`,
      ),
    createSimPlan: (input: {
      profileId: string;
      name: string;
      taskDescription?: string;
      motionSequence?: Array<{ action: string; capabilityTier?: RoboticsCapabilityTier; note?: string }>;
      assumptions?: string[];
    }) => post<{ success: boolean; plan: RoboticsSimPlan }>("/studios/robotics/sim-plans", input),
    simPlans: (profileId?: string) =>
      get<{ success: boolean; plans: RoboticsSimPlan[] }>(
        `/studios/robotics/sim-plans${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`,
      ),
    proposeAction: (input: {
      profileId: string;
      simPlanId?: string;
      actionType: RoboticsActionType;
      approvalId?: string;
      metadata?: Record<string, unknown>;
    }) => post<{ success: boolean; proposal: RoboticsActionProposal }>("/studios/robotics/actions/propose", input),
  },
};

// ── Models (additional endpoints) ────────────────────────────────────────────

export interface DiscoveredModelCard {
  spec:                string;
  modelName:           string;
  tag:                 string;
  category:            string;
  novelty:             "recommended" | "fresh" | "trending" | "abliterated";
  whyRecommended:      string;
  hardwareRequirement: string;
  vramEstimateGb?:     number;
  verificationSource:  string;
  sourceLabels:        string[];
  discoveredAt:        string;
}

// These extend the `models` namespace above with unwrapped backend routes.
export const modelsExtra = {
  discover:      () => get<{ cards: DiscoveredModelCard[]; discoveredAt: string }>("/models/discover"),
  verify:        (modelName: string) =>
    get<{ success: boolean; verification: unknown }>(`/models/verify?modelName=${encodeURIComponent(modelName)}`),
  pullHistory:   (model?: string, limit?: number) =>
    get<{ success: boolean; history: ModelPullHistoryEntry[] }>(
      `/models/pull-history?limit=${limit ?? 50}${model ? `&model=${encodeURIComponent(model)}` : ""}`
    ),
  recommend:     (prompt: string) =>
    post<{ recommendation: unknown; installed: string[] }>("/models/recommend", { prompt }),
  verifyInstall: (modelName: string) =>
    post<{ success: boolean; message: string; verification: unknown; jobId?: string }>("/models/verify-install", { modelName }),
};

// ── System (additional endpoints) ────────────────────────────────────────────

export const systemExtra = {
  logs:          (source: "all" | "ollama" | "webui" = "all", lines = 200) =>
    get<{ lines: LogLine[]; source: string; truncated: boolean }>(`/system/logs?source=${source}&lines=${lines}`),
  processStatus: () => get<{ integration: { state: string; message: string } }>("/system/process/status"),
  storage:       () => get<{ items: StorageItem[]; totalBytes: number; totalFormatted: string; modelsBytes: number; modelsFormatted: string }>("/system/storage"),
  setupInspect:  () => get<unknown>("/system/setup/inspect"),
  setupRepair:   (componentIds?: string[]) =>
    post<SelfMaintainerActionResult & { message: string }>("/system/setup/repair", { componentIds }),
  focusWindow:   (windowId: string) =>
    post<{ success: boolean }>("/system/windows/focus", { windowId }),
  registerMacro: (macro: unknown) => post<{ success: boolean }>("/system/macros", macro),
  updatesCheck:  () => get<{ items: Array<{ id: string; name: string; category: string; currentVersion: string; availableVersion: string; updateAvailable: boolean; status: string }>; checkedAt: string; updatesAvailable: number }>("/system/updates/check"),
  updatesRun:    (itemIds?: string[], updateAll?: boolean) =>
    post<SelfMaintainerActionResult>("/system/updates/run", { itemIds, updateAll: updateAll ?? !itemIds?.length }),
};

// ── Workspace (additional endpoints) ─────────────────────────────────────────

export interface CreateProjectData {
  name: string;
  path: string;
  type?: string;
  brief?: string;
  templateId?: string;
  bootstrapRepo?: boolean;
  openInVscode?: boolean;
  openAider?: boolean;
}

export const workspaceExtra = {
  createProject:  (data: CreateProjectData) => post<unknown>("/workspace/projects", data),
  openProject:    (projectId: string, mode: "vscode" | "terminal" | "vscode-aider") =>
    post<{ success: boolean; message: string }>(`/workspace/projects/${encodeURIComponent(projectId)}/open`, { mode }),
  pinProject:     (projectId: string) =>
    post<{ success: boolean; message: string }>(`/workspace/projects/${encodeURIComponent(projectId)}/pin`),
  deleteProject:  (projectId: string) =>
    del<{ success: boolean; message: string }>(`/workspace/projects/${encodeURIComponent(projectId)}`),
  snapshots:      () => get<{ snapshots: unknown[] }>("/workspace/snapshots"),
  createSnapshot: (projectId: string, label?: string) =>
    post<{ success: boolean; snapshot: unknown }>(`/workspace/projects/${encodeURIComponent(projectId)}/snapshots`, { label }),
  archiveProject: (projectId: string) =>
    post<{ success: boolean; archivePath: string }>(`/workspace/projects/${encodeURIComponent(projectId)}/archive`),
  cloneProject:   (projectId: string, path: string, name?: string) =>
    post<{ success: boolean; project: unknown }>(`/workspace/projects/${encodeURIComponent(projectId)}/clone`, { path, name }),
  profiles:       () => get<{ profiles: Record<string, unknown> }>("/workspace/profiles"),
  updateProfile:  (projectId: string, profile: unknown) =>
    put<{ success: boolean; profile: unknown }>(`/workspace/profiles/${encodeURIComponent(projectId)}`, profile),
  studioPresets:  () => get<{ presets: unknown[]; templates: unknown[] }>("/workspace/studio-presets"),
  saveStudioPresets: (presets: unknown[]) =>
    post<{ success: boolean; count: number }>("/workspace/studio-presets", { presets }),
};

// ── Integrations ──────────────────────────────────────────────────────────────

export interface IntegrationEntry {
  id: string;
  name: string;
  repo: string;
  category: string;
  description: string;
  installMethod: string;
  installed: boolean;
  running: boolean;
  version: string | null;
  localPort?: number;
  healthUrl?: string;
  localAiConfig?: Record<string, unknown>;
  aiderTip?: string;
  installCmd: string;
  startCmd: string;
  updateCmd: string;
  docs: string;
  usedFor: string;
  pinned: boolean;
  updateAvailable: boolean;
}

export interface IntegrationUpdate {
  id: string;
  name: string;
  currentVersion: string | null;
  latestVersion: string | null;
  updateCmd: string;
}

export const integrations = {
  list:    () => get<{ integrations: IntegrationEntry[] }>("/integrations"),
  pin:     (id: string) => post<{ success: boolean }>(`/integrations/${encodeURIComponent(id)}/pin`),
  install: (id: string) => post<{ success: boolean; output: string }>(`/integrations/${encodeURIComponent(id)}/install`),
  start:   (id: string) => post<{ success: boolean; output: string }>(`/integrations/${encodeURIComponent(id)}/start`),
  updates: () => get<{ updates: IntegrationUpdate[] }>("/integrations/updates"),
  update:  (id: string) => post<{ success: boolean; output: string }>(`/integrations/${encodeURIComponent(id)}/update`),
};

// ── WorldGUI (Computer-Use) ───────────────────────────────────────────────────

export interface WorldGuiWindowInfo { title: string; processName: string; handle?: number; }

export const worldgui = {
  status:     () => get<{ installed: boolean; running: boolean; port: number; url: string }>("/worldgui/status"),
  install:    () => post<{ success: boolean; output: string }>("/worldgui/install"),
  launch:     () => post<{ success: boolean; message: string }>("/worldgui/launch"),
  stop:       () => post<{ success: boolean; message: string }>("/worldgui/stop"),
  screenshot: () => get<{ success: boolean; base64: string; mimeType: string; capturedAt: string }>("/worldgui/screenshot"),
  click:      (x: number, y: number) => post<{ success: boolean; x: number; y: number }>("/worldgui/click", { x, y }),
  type:       (text: string) => post<{ success: boolean }>("/worldgui/type", { text }),
  keys:       (keys: string) => post<{ success: boolean }>("/worldgui/keys", { keys }),
  focus:      (window: string) => post<{ success: boolean; window: string }>("/worldgui/focus", { window }),
  windows:    (pattern?: string) => get<{ success: boolean; windows: WorldGuiWindowInfo[] }>(`/worldgui/windows${pattern ? `?pattern=${encodeURIComponent(pattern)}` : ""}`),
};

// ── Remote (expanded) ────────────────────────────────────────────────────────

export interface DistributedNodeConfig {
  mode: "local" | "remote";
  provider: "tailscale" | "zerotier" | "custom";
  localBaseUrl: string;
  remoteHost?: string;
  remotePort?: number;
  remoteProtocol: "http" | "https";
  heartbeatPath: string;
  heartbeatIntervalSeconds: number;
  remoteRequestTimeoutMs: number;
  latencyBufferMinMs: number;
  latencyBufferMaxMs: number;
  authEnabled: boolean;
}

export interface RemoteSettings {
  browserIdePort: number;
  openvscodePort: number;
  litellmPort: number;
  webuiPort: number;
  preferredBrowserIde: string;
  tunnelProvider: string;
  hostnameWebUi: string;
  hostnameIde: string;
}

export interface RemoteTool {
  id: string;
  label: string;
  installed: boolean;
  version: string | null;
  purpose: string;
}

export interface RemoteOverview {
  settings: RemoteSettings;
  distributedNode: DistributedNodeConfig;
  heartbeat: HeartbeatStatus;
  tools: RemoteTool[];
  guides: Array<{ id: string; label: string; target: string }>;
}

export interface RemoteConfigResult {
  success: boolean;
  directory: string;
  files: string[];
}

export const remote = {
  overview:        () => get<RemoteOverview>("/remote/overview"),
  network:         () => get<{ config: DistributedNodeConfig; heartbeat: HeartbeatStatus }>("/remote/network"),
  updateNetwork:   (config: Partial<DistributedNodeConfig>) =>
    put<{ success: boolean; config: DistributedNodeConfig; heartbeat: HeartbeatStatus }>("/remote/network", config),
  networkStatus:   () => get<HeartbeatStatus>("/remote/network/status"),
  authStatus:      () => get<{ authorized: boolean }>("/remote/auth/status"),
  authAuthorize:   (token: string) =>
    post<{ success: boolean }>("/remote/auth/authorize", { token }),
  authRotate:      () => post<{ success: boolean; token: string }>("/remote/auth/rotate"),
  generateConfigs: (settings: Partial<RemoteSettings>) =>
    post<RemoteConfigResult>("/remote/generate-configs", settings),
};

// ── Edge Node Registry (Phase 14A) ────────────────────────────────────────────

export type EdgeNodeType = "mini_pc" | "raspberry_pi" | "nas" | "gaming_pc" | "server" | "unknown";
export type EdgeNodeRole =
  | "home_assistant" | "printer_host" | "camera_nvr" | "nas_storage"
  | "shop_controller" | "homelab_node" | "worker_node" | "coordinator" | "ai_brain";
export type EdgeNodeHealth = "online" | "offline" | "degraded" | "not_configured" | "unknown";
export type EdgeActionRisk = "read_only" | "dry_run" | "proposal" | "approval_required" | "blocked" | "manual_only";

export interface EdgeNodeCapability {
  id: string;
  label: string;
  riskTier: EdgeActionRisk;
  enabled: boolean;
}

export interface EdgeNodeProfile {
  id: string;
  name: string;
  nodeType: EdgeNodeType;
  roles: EdgeNodeRole[];
  endpoint: string;
  authProfile: { authType: "none" | "token" | "basic" | "certificate" };
  health: EdgeNodeHealth;
  lastSeenAt: string | null;
  allowedCapabilities: EdgeNodeCapability[];
  isGamingPc: boolean;
  alwaysOn: boolean;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface EdgeNodeHealthResult {
  nodeId: string;
  health: EdgeNodeHealth;
  latencyMs?: number;
  message: string;
  checkedAt: string;
}

export interface EdgeActionEvalResult {
  allowed: boolean;
  riskTier: EdgeActionRisk;
  requiresApproval: boolean;
  message: string;
  executed: false;
}

export const edgeNodesApi = {
  sourceOfTruth: () => get<{ sourceOfTruth: string }>("/edge-nodes/source-of-truth"),
  gamingPcRole:  () => get<Record<string, unknown>>("/edge-nodes/gaming-pc/role"),
  list:          () => get<{ nodes: EdgeNodeProfile[]; count: number }>("/edge-nodes"),
  get:           (id: string) => get<{ profile: EdgeNodeProfile }>(`/edge-nodes/${encodeURIComponent(id)}`),
  register:      (body: Partial<EdgeNodeProfile> & { name: string }) =>
    post<{ profile: EdgeNodeProfile }>("/edge-nodes", body),
  update:        (id: string, body: Partial<EdgeNodeProfile>) =>
    put<{ profile: EdgeNodeProfile }>(`/edge-nodes/${encodeURIComponent(id)}`, body),
  remove:        (id: string) =>
    del<{ success: boolean }>(`/edge-nodes/${encodeURIComponent(id)}`),
  healthCheck:   (id: string) =>
    post<EdgeNodeHealthResult>(`/edge-nodes/${encodeURIComponent(id)}/health-check`, {}),
  evaluateAction: (id: string, capabilityId: string) =>
    post<EdgeActionEvalResult>(`/edge-nodes/${encodeURIComponent(id)}/capabilities/${encodeURIComponent(capabilityId)}/evaluate`, {}),
};

// ── Home Autopilot (Phase 14B) ────────────────────────────────────────────────

export type HomeActionRisk =
  | "read_only" | "dry_run" | "proposal"
  | "approval_required" | "blocked" | "manual_only";

export type HomeDeviceType =
  | "robot_vacuum" | "camera_nvr" | "shop_light" | "shop_fan"
  | "air_filter" | "compressor" | "garage_door" | "lock"
  | "smart_plug" | "wled_strip" | "sensor" | "unknown";

export type HomeDeviceProvider =
  | "valetudo" | "frigate" | "home_assistant" | "esphome"
  | "zigbee2mqtt" | "node_red" | "wled" | "unknown";

export interface HaEntityEntry {
  entityId: string;
  friendlyName: string;
  controlRiskTier: HomeActionRisk;
  enabled: boolean;
}

export interface HaProfile {
  id: string;
  name: string;
  endpoint: string;
  haMcpEnabled: boolean;
  haMcpProfile: Record<string, unknown>;
  entityAllowlist: HaEntityEntry[];
  configured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MqttTopicEntry {
  topic: string;
  description: string;
  publishRiskTier: HomeActionRisk;
  subscribeAllowed: boolean;
}

export interface MqttProfile {
  id: string;
  name: string;
  brokerHost: string;
  brokerPort: number;
  topicAllowlist: MqttTopicEntry[];
  configured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HomeDeviceProfile {
  id: string;
  name: string;
  deviceType: HomeDeviceType;
  provider: HomeDeviceProvider;
  endpoint: string;
  configured: boolean;
  actionPolicy: Record<string, HomeActionRisk>;
  createdAt: string;
  updatedAt: string;
}

export interface HomeActionEvalResult {
  allowed: boolean;
  riskTier: HomeActionRisk;
  requiresApproval: boolean;
  message: string;
  executed: false;
}

export interface HomeAutopilotStatus {
  haConfigured: boolean;
  mqttConfigured: boolean;
  devicesConfigured: number;
  robotVacuumConfigured: boolean;
  cameraConfigured: boolean;
  shopDevicesConfigured: number;
  sourceOfTruth: string;
}

export const homeAutopilotApi = {
  sourceOfTruth: () =>
    get<{ sourceOfTruth: string }>("/home-autopilot/source-of-truth"),
  status: () =>
    get<HomeAutopilotStatus>("/home-autopilot/status"),
  ha: {
    profile: () =>
      get<{ profile: HaProfile | null; configured: boolean; message?: string }>("/home-autopilot/ha/profile"),
    saveProfile: (body: Partial<HaProfile> & { name: string }) =>
      post<{ profile: HaProfile }>("/home-autopilot/ha/profile", body),
    evaluateEntity: (entityId: string, action: string, profileId?: string) =>
      post<{ result: HomeActionEvalResult }>(
        `/home-autopilot/ha/entities/${encodeURIComponent(entityId)}/evaluate`,
        { action, profileId },
      ),
  },
  mqtt: {
    profile: () =>
      get<{ profile: MqttProfile | null; configured: boolean; message?: string }>("/home-autopilot/mqtt/profile"),
    saveProfile: (body: Partial<MqttProfile> & { name: string }) =>
      post<{ profile: MqttProfile }>("/home-autopilot/mqtt/profile", body),
    evaluateTopic: (topic: string, profileId?: string) =>
      post<{ result: HomeActionEvalResult }>("/home-autopilot/mqtt/topics/evaluate", { topic, profileId }),
  },
  devices: {
    list: () =>
      get<{ devices: HomeDeviceProfile[]; count: number }>("/home-autopilot/devices"),
    get: (id: string) =>
      get<{ device: HomeDeviceProfile }>(`/home-autopilot/devices/${encodeURIComponent(id)}`),
    register: (body: Partial<HomeDeviceProfile> & { name: string }) =>
      post<{ device: HomeDeviceProfile }>("/home-autopilot/devices", body),
    evaluateAction: (deviceId: string, action: string) =>
      post<{ result: HomeActionEvalResult }>(
        `/home-autopilot/devices/${encodeURIComponent(deviceId)}/action/evaluate`,
        { action },
      ),
  },
};

// ── HomeLab Architect ─────────────────────────────────────────────────────────

export type HomelabProviderStatus = "not_configured" | "degraded" | "disabled" | "read_only";
export type HomelabDataConfidence = "confirmed" | "proposed" | "unknown";
export type HomelabDeviceRole =
  | "router" | "switch" | "firewall" | "access_point" | "server" | "nas"
  | "hypervisor" | "mini_pc" | "workstation" | "gaming_pc" | "printer"
  | "camera" | "iot_hub" | "ups" | "patch_panel" | "unknown";
export type HomelabDeviceStatus = "online" | "offline" | "not_configured" | "unknown";
export type HomelabServiceProtocol = "tcp" | "udp" | "http" | "https" | "unknown";

export interface HomelabSite {
  id: string;
  name: string;
  description: string;
  location: string;
  confidence: HomelabDataConfidence;
  createdAt: string;
  updatedAt: string;
}

export interface HomelabDevice {
  id: string;
  name: string;
  role: HomelabDeviceRole;
  siteId: string;
  make: string;
  model: string;
  serialNumber: string;
  managementIpRef: string;
  status: HomelabDeviceStatus;
  confidence: HomelabDataConfidence;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface HomelabVlan {
  id: string;
  vlanId: number;
  name: string;
  description: string;
  siteId: string;
  confidence: HomelabDataConfidence;
  createdAt: string;
  updatedAt: string;
}

export interface HomelabSubnet {
  id: string;
  prefix: string;
  description: string;
  vlanId: string;
  siteId: string;
  gatewayRef: string;
  confidence: HomelabDataConfidence;
  createdAt: string;
  updatedAt: string;
}

export interface HomelabService {
  id: string;
  name: string;
  serviceType: string;
  hostDeviceId: string;
  containerName: string;
  port: number;
  protocol: HomelabServiceProtocol;
  confidence: HomelabDataConfidence;
  status: HomelabDeviceStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface HomelabProviderProfile {
  providerId: string;
  name: string;
  status: HomelabProviderStatus;
  reason: string;
  lastSyncAt?: string;
  recordCount: number;
}

export interface HomelabBlueprint {
  id: string;
  generatedAt: string;
  overallConfidence: HomelabDataConfidence;
  sites: HomelabSite[];
  devices: HomelabDevice[];
  vlans: HomelabVlan[];
  subnets: HomelabSubnet[];
  services: HomelabService[];
  providers: HomelabProviderProfile[];
  notes: string[];
  applied: false;
}

export interface HomelabInventoryStatus {
  sitesCount: number;
  devicesCount: number;
  vlansCount: number;
  subnetsCount: number;
  servicesCount: number;
  providers: HomelabProviderProfile[];
  sourceOfTruth: string;
}

export type HomelabConfigProviderId =
  | "netbox" | "nautobot" | "proxmox" | "opnsense" | "unifi"
  | "ansible" | "opentofu" | "docker-compose" | "batfish";
export type HomelabConfigProposalType =
  | "vlan_ip_dns_dhcp_firewall" | "proxmox_layout" | "docker_compose_stack"
  | "backup_monitoring_plan" | "ansible_playbook" | "opentofu_terraform"
  | "opnsense_draft" | "unifi_draft" | "netbox_nautobot_draft";
export type HomelabPipelineState =
  | "drafted" | "validation_required" | "validation_passed" | "validation_failed"
  | "approval_required" | "approved" | "apply_blocked" | "applied"
  | "rollback_required" | "rolled_back" | "not_configured" | "dry_run";
export type HomelabConfigValidationKind = "static" | "simulated" | "unavailable_provider" | "real_provider";
export type HomelabConfigValidationStatus = "not_run" | "passed" | "failed" | "not_configured" | "degraded";
export type HomelabConfigApprovalStatus = "not_required" | "waiting_for_approval" | "approved" | "denied";

export interface HomelabConfigSafetyPlan {
  required: boolean;
  available: boolean;
  mode: "proposal_only" | "manual" | "configured";
  summary: string;
  steps: string[];
}

export interface HomelabConfigProposal {
  id: string;
  sourceInventoryRef: string;
  sourceBlueprintId: string;
  proposalType: HomelabConfigProposalType;
  targetProvider: HomelabConfigProviderId;
  targetType: string;
  draftMetadata: Record<string, unknown>;
  expectedChanges: Array<Record<string, unknown>>;
  diffSummary: Record<string, unknown>;
  validationStatus: HomelabConfigValidationStatus;
  validationKind: HomelabConfigValidationKind;
  validationNotes: string[];
  approvalStatus: HomelabConfigApprovalStatus;
  approvalId?: string;
  backupPlan: HomelabConfigSafetyPlan;
  rollbackPlan: HomelabConfigSafetyPlan;
  applyStatus: HomelabPipelineState;
  notConfiguredReason: string;
  providerStatus: HomelabProviderStatus;
  dryRun: boolean;
  executed: boolean;
  apiCallsMade: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HomelabConfigValidationOutcome {
  proposal: HomelabConfigProposal;
  status: HomelabConfigValidationStatus;
  kind: HomelabConfigValidationKind;
  notes: string[];
  realProviderCheck: boolean;
}

export interface HomelabConfigApplyOutcome {
  proposal: HomelabConfigProposal;
  allowed: boolean;
  status: HomelabPipelineState;
  reason: string;
  approvalId?: string;
  executed: false;
  apiCallsMade: false;
}

export type HomelabSocProviderId =
  | "wazuh" | "zeek" | "suricata" | "opnsense-ids" | "pihole"
  | "adguard-home" | "librenms" | "zabbix" | "netdata" | "uptime-kuma" | "osquery";
export type HomelabSocSeverity = "info" | "low" | "medium" | "high" | "critical";
export type HomelabSocAlertStatus = "open" | "acknowledged" | "resolved" | "not_configured";
export type HomelabSocReportKind =
  | "unknown_device_report" | "suspicious_dns_summary" | "wan_outage_timeline"
  | "noisy_iot_device_summary" | "what_changed_report";
export type HomelabSocRemediationAction =
  | "read_only_review" | "collect_logs" | "block_device" | "firewall_rule_change"
  | "isolate_vlan" | "dns_filter_change" | "kill_process" | "delete_file"
  | "disable_account" | "packet_capture";
export type HomelabSocActionMode =
  | "read_only" | "dry_run" | "proposal" | "approval_required"
  | "blocked" | "manual_only" | "not_configured";

export interface HomelabSocProviderProfile extends HomelabProviderProfile {
  providerId: HomelabSocProviderId;
  category: "siem" | "ids" | "dns" | "monitoring" | "endpoint";
  startupPolicy: "disabled";
  dataLeavesMachine: false;
}

export interface HomelabSocAlertSummary {
  confirmedFacts: string[];
  inferredPossibilities: string[];
  unknowns: string[];
  proposedNextActions: string[];
}

export interface HomelabSocAlert {
  id: string;
  title: string;
  severity: HomelabSocSeverity;
  category: string;
  sourceProvider: HomelabSocProviderId;
  deviceRef: string;
  summary: HomelabSocAlertSummary;
  status: HomelabSocAlertStatus;
  evidenceRefs: string[];
  providerStatus: HomelabProviderStatus;
  notConfiguredReason: string;
  localOnly: true;
  apiCallsMade: false;
  createdAt: string;
  updatedAt: string;
}

export interface HomelabSocReport {
  id: string;
  kind: HomelabSocReportKind;
  generatedAt: string;
  sourceInventoryRef: string;
  modelProvider: "local";
  localFirst: true;
  cloudRequired: false;
  apiCallsMade: false;
  summary: HomelabSocAlertSummary;
  counts: Record<string, number>;
  providerStatus: HomelabProviderStatus;
  notConfiguredReason: string;
}

export interface HomelabSocRemediationProposal {
  id: string;
  alertId: string;
  action: HomelabSocRemediationAction;
  mode: HomelabSocActionMode;
  status: "proposal" | "approval_required" | "denied" | "blocked" | "not_configured" | "dry_run" | "read_only";
  reason: string;
  approvalId?: string;
  linkedConfigProposalId?: string;
  dryRun: true;
  executed: false;
  apiCallsMade: false;
  createdAt: string;
  updatedAt: string;
}

export interface HomelabSocStatus {
  alertsCount: number;
  openAlertsCount: number;
  providers: HomelabSocProviderProfile[];
  sourceOfTruth: string;
  localFirst: true;
  cloudRequired: false;
  realSecurityApiCallsEnabled: false;
}

export const homelabApi = {
  sourceOfTruth: () =>
    get<{ sourceOfTruth: string }>("/homelab/source-of-truth"),
  status: () =>
    get<{ status: HomelabInventoryStatus }>("/homelab/status"),
  blueprint: () =>
    get<{ blueprint: HomelabBlueprint }>("/homelab/blueprint"),
  providers: () =>
    get<{ providers: HomelabProviderProfile[] }>("/homelab/providers"),
  config: {
    providers: () =>
      get<{ providers: HomelabProviderProfile[] }>("/homelab/config/providers"),
    proposals: () =>
      get<{ proposals: HomelabConfigProposal[]; count: number }>("/homelab/config/proposals"),
    createProposal: (body: {
      proposalType?: HomelabConfigProposalType;
      targetProvider?: HomelabConfigProviderId;
      sourceInventoryRef?: string;
      backupPlan?: Partial<HomelabConfigSafetyPlan>;
      rollbackPlan?: Partial<HomelabConfigSafetyPlan>;
    }) => post<{ proposal: HomelabConfigProposal }>("/homelab/config/proposals", body),
    validate: (id: string, kind: HomelabConfigValidationKind = "static") =>
      post<{ outcome: HomelabConfigValidationOutcome }>(`/homelab/config/proposals/${encodeURIComponent(id)}/validate`, { kind }),
    apply: (id: string, approvalId?: string) =>
      post<{ outcome: HomelabConfigApplyOutcome }>(`/homelab/config/proposals/${encodeURIComponent(id)}/apply`, { approvalId }),
    rollback: (id: string) =>
      post<{ outcome: HomelabConfigApplyOutcome }>(`/homelab/config/proposals/${encodeURIComponent(id)}/rollback`, {}),
  },
  soc: {
    status: () =>
      get<{ status: HomelabSocStatus }>("/homelab/soc/status"),
    providers: () =>
      get<{ providers: HomelabSocProviderProfile[] }>("/homelab/soc/providers"),
    alerts: (limit = 100) =>
      get<{ alerts: HomelabSocAlert[]; count: number }>(`/homelab/soc/alerts?limit=${limit}`),
    createAlert: (body: {
      title: string;
      severity?: HomelabSocSeverity;
      category?: string;
      sourceProvider?: HomelabSocProviderId;
      deviceRef?: string;
      summary?: Partial<HomelabSocAlertSummary>;
      evidenceRefs?: string[];
    }) => post<{ alert: HomelabSocAlert }>("/homelab/soc/alerts", body),
    report: (kind: HomelabSocReportKind) =>
      post<{ report: HomelabSocReport }>("/homelab/soc/reports", { kind }),
    remediations: (limit = 100) =>
      get<{ remediations: HomelabSocRemediationProposal[]; count: number }>(`/homelab/soc/remediations?limit=${limit}`),
    proposeRemediation: (alertId: string, action: HomelabSocRemediationAction, approvalId?: string) =>
      post<{
        outcome: {
          proposal: HomelabSocRemediationProposal;
          approvalRequired: boolean;
          approval?: ApprovalRequest;
          executed: false;
          apiCallsMade: false;
        };
      }>(`/homelab/soc/alerts/${encodeURIComponent(alertId)}/remediation`, { action, approvalId }),
  },
  sites: {
    list: () => get<{ sites: HomelabSite[]; count: number }>("/homelab/sites"),
    get: (id: string) => get<{ site: HomelabSite }>(`/homelab/sites/${encodeURIComponent(id)}`),
    create: (body: Partial<HomelabSite> & { name: string }) =>
      post<{ site: HomelabSite }>("/homelab/sites", body),
  },
  devices: {
    list: () => get<{ devices: HomelabDevice[]; count: number }>("/homelab/devices"),
    get: (id: string) => get<{ device: HomelabDevice }>(`/homelab/devices/${encodeURIComponent(id)}`),
    create: (body: Partial<HomelabDevice> & { name: string }) =>
      post<{ device: HomelabDevice }>("/homelab/devices", body),
  },
  vlans: {
    list: () => get<{ vlans: HomelabVlan[]; count: number }>("/homelab/vlans"),
    get: (id: string) => get<{ vlan: HomelabVlan }>(`/homelab/vlans/${encodeURIComponent(id)}`),
    create: (body: Partial<HomelabVlan> & { name: string; vlanId: number }) =>
      post<{ vlan: HomelabVlan }>("/homelab/vlans", body),
  },
  subnets: {
    list: () => get<{ subnets: HomelabSubnet[]; count: number }>("/homelab/subnets"),
    get: (id: string) => get<{ subnet: HomelabSubnet }>(`/homelab/subnets/${encodeURIComponent(id)}`),
    create: (body: Partial<HomelabSubnet> & { prefix: string }) =>
      post<{ subnet: HomelabSubnet }>("/homelab/subnets", body),
  },
  services: {
    list: () => get<{ services: HomelabService[]; count: number }>("/homelab/services"),
    get: (id: string) => get<{ service: HomelabService }>(`/homelab/services/${encodeURIComponent(id)}`),
    create: (body: Partial<HomelabService> & { name: string }) =>
      post<{ service: HomelabService }>("/homelab/services", body),
  },
  validate: {
    vlan: (vlanId: number) => post<{ valid: boolean; reason?: string }>("/homelab/validate/vlan", { vlanId }),
    subnet: (prefix: string) => post<{ valid: boolean; reason?: string }>("/homelab/validate/subnet", { prefix }),
  },
};

// ── Continue.dev ──────────────────────────────────────────────────────────────

export interface ContinueConfigModel {
  title: string;
  provider: string;
  model: string;
}

export interface ContinueConfig {
  configExists: boolean;
  configPath: string;
  rawConfig: string | null;
  models: ContinueConfigModel[];
  rulesDir: string;
}

export interface ContinueRule {
  filename: string;
  content: string;
  sizeBytes: number;
  modifiedAt: string;
}

export const continueApi = {
  config:     () => get<ContinueConfig>("/continue/config"),
  rules:      () => get<{ rules: ContinueRule[]; rulesDir: string; count: number }>("/continue/rules"),
  saveRule:   (filename: string, content: string) =>
    post<{ success: boolean; message: string }>("/continue/rules", { filename, content }),
  deleteRule: (filename: string) =>
    del<{ success: boolean; message: string }>(`/continue/rules/${encodeURIComponent(filename)}`),
};

// ── Code Context ──────────────────────────────────────────────────────────────

// Mirrors backend Symbol interface from code-context.ts
export interface CodeSymbol {
  kind: "function" | "class" | "interface" | "type" | "variable" | "export" | "method";
  name: string;
  lineStart: number;
  lineEnd: number;
  exported: boolean;
}

// Mirrors backend WorkspaceSummary (private, returned by getStatus/getWorkspaceSummaries)
export interface ContextWorkspaceSummary {
  rootPath: string;
  workspaceName: string;
  fileCount: number;
  indexedAt: string;
}

// Mirrors backend getStatus() return shape
export interface ContextStatusResult {
  workspaces: ContextWorkspaceSummary[];
  totalFiles: number;
  totalSymbols: number;
}

// Mirrors backend IndexedFile & { score, matchedSymbols }
export interface ContextSearchFile {
  path: string;
  relativePath: string;
  score: number;
  matchedSymbols: CodeSymbol[];
  preview: string;
  symbols: CodeSymbol[];
  hash: string;
  sizeBytes: number;
  indexedAt: string;
}

// Mirrors backend ContextSearchResult (then route spreads + adds success:true)
export interface ContextSearchResult {
  success: boolean;
  files: ContextSearchFile[];
  sections: Array<{ file: ContextSearchFile; excerpt: string }>;
  promptContext: string;
  totalTokenEstimate: number;
  workspace: { workspaceName: string; rootPath: string };
}

export type DigitalTwinEntityType =
  | "room" | "zone" | "tool" | "printer" | "camera" | "sensor" | "vehicle"
  | "network_device" | "vm" | "container" | "document" | "part" | "filament"
  | "project" | "automation" | "service";

export type DigitalTwinRelationshipStatus = "confirmed" | "proposed" | "inferred" | "stale" | "deleted" | "blocked" | "unknown";
export type DigitalTwinPrivacyClassification = "public" | "normal" | "private" | "sensitive" | "secret";

export interface DigitalTwinSourceRef {
  system: "evidence_vault" | "rag" | "homelab" | "home_soc" | "maker_studio" | "edge_node" | "home_autopilot" | "inventory" | "vehicle" | "tool" | "project" | "manual";
  kind: string;
  id: string;
  status?: "confirmed" | "proposed" | "unknown" | "not_configured";
}

export interface DigitalTwinEntity {
  id: string;
  type: DigitalTwinEntityType;
  name: string;
  description: string;
  metadata: Record<string, unknown>;
  sourceRefs: DigitalTwinSourceRef[];
  privacyClassification: DigitalTwinPrivacyClassification;
  sensitivity: DigitalTwinPrivacyClassification;
  stateConfidence: "confirmed" | "proposed" | "unknown";
  providerStatus: "local" | "not_configured" | "degraded";
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface DigitalTwinRelationship {
  id: string;
  sourceEntityId: string;
  relationType: string;
  targetEntityId: string;
  confidence: number;
  status: DigitalTwinRelationshipStatus;
  provenance: {
    source: "manual" | "ai" | "import" | "system";
    sourceRef: string;
    evidenceRefs: string[];
    note: string;
  };
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface DigitalTwinEntityDetail {
  entity: DigitalTwinEntity;
  relationships: DigitalTwinRelationship[];
  linkedDocuments: Array<{ id: string; title: string; category: string; privacyClassification: string }>;
  linkedJobs: Array<{ id: string; kind: string; state: string; createdAt: string }>;
  linkedEvents: Array<{ id: string; eventType: string; action: string; result: string; createdAt: string }>;
  linkedSourceStatus: Record<string, unknown>;
  externalApiCallsMade: false;
}

export interface DigitalTwinStatus {
  sourceOfTruth: string;
  localFirst: true;
  cloudRequired: false;
  externalApiCallsMade: false;
  entityCount: number;
  relationshipCount: number;
  archivedEntityCount: number;
  deletedRelationshipCount: number;
}

export interface DigitalTwinActionSafetyResult {
  entityId: string;
  action: string;
  allowed: boolean;
  riskTier: string;
  requiresApproval: boolean;
  status: "read_only" | "dry_run" | "proposal" | "approval_required" | "blocked" | "manual_only" | "not_configured";
  message: string;
  executed: false;
  delegatedTo?: string;
}

export const context = {
  status:         () => get<ContextStatusResult>("/context/status"),
  workspaces:     () => get<{ workspaces: ContextWorkspaceSummary[] }>("/context/workspaces"),
  index:          (workspacePath?: string, force?: boolean) =>
    post<{ success: boolean; workspace?: string; fileCount?: number; symbolCount?: number; workspaces?: ContextWorkspaceSummary[] }>(
      "/context/index", { workspacePath, force }),
  search:         (query: string, workspacePath?: string, maxFiles?: number, maxChars?: number) =>
    post<ContextSearchResult>("/context/search", { query, workspacePath, maxFiles, maxChars }),
  file:           (filePath: string, workspacePath?: string) =>
    // Backend ApplyResult spreads: { success, path, relativePath, content, symbols, sizeBytes }
    get<{ success: boolean; path: string; relativePath: string; content: string; symbols: CodeSymbol[]; sizeBytes: number }>(
      `/context/file?path=${encodeURIComponent(filePath)}${workspacePath ? `&workspacePath=${encodeURIComponent(workspacePath)}` : ""}`),
  readWriteVerify: (filePath: string, updatedContent: string, workspacePath?: string) =>
    // Backend ApplyResult: { success, diff, message, verification: { success, diagnostics } }
    post<{ success: boolean; diff: string; message: string; verification: { success: boolean; diagnostics: string[] } }>(
      "/context/read-write-verify", { filePath, updatedContent, workspacePath }),
};

export const digitalTwinApi = {
  status: () =>
    get<{ success: boolean; status: DigitalTwinStatus }>("/context/digital-twin/status"),
  entities: (params?: { type?: DigitalTwinEntityType; includeArchived?: boolean; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.includeArchived) qs.set("includeArchived", "true");
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return get<{ success: boolean; entities: DigitalTwinEntity[]; count: number }>(`/context/digital-twin/entities${q ? "?" + q : ""}`);
  },
  createEntity: (body: {
    type: DigitalTwinEntityType;
    name: string;
    description?: string;
    metadata?: Record<string, unknown>;
    sourceRefs?: DigitalTwinSourceRef[];
    privacyClassification?: DigitalTwinPrivacyClassification;
    sensitivity?: DigitalTwinPrivacyClassification;
    stateConfidence?: "confirmed" | "proposed" | "unknown";
  }) =>
    post<{ success: boolean; entity: DigitalTwinEntity }>("/context/digital-twin/entities", body),
  detail: (id: string) =>
    get<{ success: boolean; detail: DigitalTwinEntityDetail }>(`/context/digital-twin/entities/${encodeURIComponent(id)}`),
  archiveEntity: (id: string, forceArchive = false) =>
    post<{ success: boolean; archived: boolean; blocked: boolean; reason: string; entity?: DigitalTwinEntity }>(
      `/context/digital-twin/entities/${encodeURIComponent(id)}/archive`, { forceArchive },
    ),
  relationships: (entityId?: string) =>
    get<{ success: boolean; relationships: DigitalTwinRelationship[]; count: number }>(
      `/context/digital-twin/relationships${entityId ? "?entityId=" + encodeURIComponent(entityId) : ""}`,
    ),
  createRelationship: (body: {
    sourceEntityId: string;
    relationType: string;
    targetEntityId: string;
    confidence?: number;
    status?: DigitalTwinRelationshipStatus;
    provenance?: DigitalTwinRelationship["provenance"];
  }) =>
    post<{ success: boolean; relationship: DigitalTwinRelationship }>("/context/digital-twin/relationships", body),
  deleteRelationship: (id: string) =>
    post<{ success: boolean; deleted: boolean; relationship?: DigitalTwinRelationship; reason: string }>(
      `/context/digital-twin/relationships/${encodeURIComponent(id)}/delete`,
    ),
  search: (query: string, limit = 50) =>
    post<{ success: boolean; entities: DigitalTwinEntity[]; relationships: DigitalTwinRelationship[]; localOnly: true; externalApiCallsMade: false }>(
      "/context/digital-twin/search", { query, limit },
    ),
  actionSafety: (id: string, action: string, input: Record<string, string> = {}) =>
    post<{ success: boolean; result: DigitalTwinActionSafetyResult }>(
      `/context/digital-twin/entities/${encodeURIComponent(id)}/action-safety`, { action, input },
    ),
};

export type InventoryTruthStatus = "confirmed" | "proposed" | "inferred" | "stale" | "missing" | "unknown";
export type InventoryItemType = "part" | "tool" | "material" | "filament" | "asset" | "consumable" | "spare" | "other";

export interface InventoryProvider {
  id: "inventree" | "snipe_it" | "homebox" | "spoolman" | "partkeepr";
  name: string;
  category: string;
  status: "not_configured" | "degraded" | "disabled";
  configured: false;
  syncEnabled: false;
  executionEnabled: false;
  externalApiCallsMade: false;
  dataLeavesMachine: false;
  reason: string;
  nextAction: string;
  supportedActions: string[];
}

export interface InventoryItem {
  id: string;
  name: string;
  itemType: InventoryItemType;
  category: string;
  location: string;
  bin: string;
  quantity: number | null;
  unit: string;
  projectLink?: string;
  reorderThreshold: number | null;
  supplierLink?: string;
  notes: string;
  availabilityStatus: InventoryTruthStatus;
  quantityStatus: InventoryTruthStatus;
  suitabilityStatus: InventoryTruthStatus;
  privacyClassification: DigitalTwinPrivacyClassification;
  sourceRefs: Array<Record<string, unknown>>;
  evidenceRefs: string[];
  makerProjectId?: string;
  digitalTwinEntityId?: string;
  providerStatus: "local" | "not_configured" | "degraded";
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface InventoryAvailabilityCheck {
  itemId?: string;
  requestedName: string;
  availabilityStatus: InventoryTruthStatus;
  quantityStatus: InventoryTruthStatus;
  suitabilityStatus: InventoryTruthStatus;
  available: boolean;
  blocksProject: boolean;
  reason: string;
}

export interface ProjectRealityPipeline {
  id: string;
  title: string;
  projectId?: string;
  makerProjectId?: string;
  digitalTwinEntityId?: string;
  currentStage: string;
  stages: Array<{ id: string; status: "draft" | "proposal" | "blocked" | "complete"; evidenceRefs: string[] }>;
  inventoryChecks: InventoryAvailabilityCheck[];
  purchaseList: Array<Record<string, unknown>>;
  labelPlan: Record<string, unknown>;
  approvalStatus: string;
  status: "draft" | "proposal" | "blocked" | "ready_for_review";
  localOnly: true;
  externalApiCallsMade: false;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryStatus {
  sourceOfTruth: string;
  localFirst: true;
  cloudRequired: false;
  externalApiCallsMade: false;
  purchaseExecutionEnabled: false;
  providerSyncEnabled: false;
  labelPrintingEnabled: false;
  nfcWritingEnabled: false;
  providers: InventoryProvider[];
  counts: { items: number; pipelines: number };
  hardLimits: Record<string, unknown>;
}

export interface InventoryActionProposal {
  id: string;
  actionType: "purchase" | "reorder" | "vendor_quote" | "label_print" | "nfc_write" | "delete";
  status: "proposal" | "approval_required" | "denied" | "not_configured" | "blocked";
  approvalRequired: boolean;
  approval?: { id: string; status: string };
  executed: false;
  externalApiCallsMade: false;
  itemIds: string[];
  pipelineId?: string;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const inventoryApi = {
  status: () => get<{ success: boolean; status: InventoryStatus }>("/context/inventory/status"),
  providers: () => get<{ success: boolean; providers: InventoryProvider[] }>("/context/inventory/providers"),
  items: (params?: { includeDeleted?: boolean; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.includeDeleted) qs.set("includeDeleted", "true");
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return get<{ success: boolean; items: InventoryItem[]; count: number }>(`/context/inventory/items${q ? "?" + q : ""}`);
  },
  createItem: (body: Partial<InventoryItem> & { name?: string }) =>
    post<{ success: boolean; item: InventoryItem }>("/context/inventory/items", body),
  availability: (items: Array<{ itemId?: string; name?: string; requiredQuantity?: number }>) =>
    post<{ success: boolean; checks: InventoryAvailabilityCheck[] }>("/context/inventory/availability", { items }),
  labelPlan: (id: string, labelType: "qr" | "nfc" | "both" = "qr") =>
    post<Record<string, unknown>>(`/context/inventory/items/${encodeURIComponent(id)}/label-plan`, { labelType }),
  pipelines: (limit = 100) =>
    get<{ success: boolean; pipelines: ProjectRealityPipeline[]; count: number }>(`/context/inventory/pipelines?limit=${limit}`),
  createPipeline: (body: { title?: string; projectId?: string; makerProjectId?: string; itemRequests?: Array<{ itemId?: string; name?: string; requiredQuantity?: number }> }) =>
    post<{ success: boolean; pipeline: ProjectRealityPipeline }>("/context/inventory/pipelines", body),
  proposeAction: (body: { actionType?: InventoryActionProposal["actionType"]; itemIds?: string[]; pipelineId?: string; approvalId?: string }) =>
    post<InventoryActionProposal>("/context/inventory/actions/propose", body),
  reorderSuggestions: () =>
    post<{ success: boolean; suggestions: InventoryActionProposal[]; count: number }>("/context/inventory/reorder-suggestions", {}),
};

export type AutomotiveFactStatus = "confirmed" | "user_provided" | "inferred" | "stale" | "unknown" | "not_configured";
export type AutomotiveProviderStatus = "not_configured" | "degraded" | "disabled";
export type AutomotiveActionType =
  | "obd_scan"
  | "can_capture"
  | "clear_dtcs"
  | "actuator_test"
  | "bidirectional_test"
  | "ecu_write"
  | "tune_change"
  | "firmware_flash";

export interface AutomotiveProvider {
  id: string;
  name: string;
  category: string;
  status: AutomotiveProviderStatus;
  configured: false;
  executionEnabled: false;
  captureEnabled: false;
  writeEnabled: false;
  externalApiCallsMade: false;
  dataLeavesMachine: false;
  reason: string;
  nextAction: string;
  supportedActions: string[];
}

export interface AutomotiveFact {
  key: string;
  label: string;
  value: string;
  status: AutomotiveFactStatus;
  source: "manual" | "profile" | "evidence" | "import" | "system";
}

export interface VehicleProfile {
  id: string;
  name: string;
  year: string;
  make: string;
  model: string;
  body: string;
  drivetrain: string;
  engine: string;
  transmission: string;
  ecu: string;
  mods: AutomotiveFact[];
  wiringNotes: AutomotiveFact[];
  calibrationNotes: AutomotiveFact[];
  partsList: AutomotiveFact[];
  linkedEvidenceRefs: string[];
  maintenanceLog: Array<Record<string, unknown>>;
  repairLog: Array<Record<string, unknown>>;
  dtcHistory: Array<Record<string, unknown>>;
  liveDataSnapshots: Array<Record<string, unknown>>;
  factStatus: AutomotiveFactStatus;
  privacyClassification: DigitalTwinPrivacyClassification;
  digitalTwinEntityId?: string;
  providerStatus: "local" | "not_configured" | "degraded";
  createdAt: string;
  updatedAt: string;
}

export interface DiagnosticCase {
  id: string;
  vehicleId: string;
  title: string;
  symptomSummary: string;
  intakeStatus: "proposal" | "draft" | "blocked";
  evidenceRefs: string[];
  dtcs: Array<{ code: string; status: "user_provided" | "imported" | "not_configured"; description?: string }>;
  freezeFrameStatus: "not_configured" | "user_provided" | "unavailable";
  liveDataStatus: "not_configured" | "user_provided" | "unavailable";
  workflow: string[];
  likelyCauses: Array<{ system: string; cause: string; confidence: number; status: string; evidence: string[]; confirmationTests: string[]; confirmedFault: false }>;
  confirmedFaults: [];
  testPlan: Array<{ id: string; title: string; purpose: string; method: string; expectedEvidence: string; safetyNote: string; status: string }>;
  assumptions: string[];
  partsCannonWarning: string;
  humanVerificationRequired: true;
  repairLogRefs: string[];
  localOnly: true;
  externalApiCallsMade: false;
  createdAt: string;
  updatedAt: string;
}

export interface AutomotiveStatus {
  sourceOfTruth: string;
  localFirst: true;
  cloudRequired: false;
  externalApiCallsMade: false;
  realHardwareCallsEnabled: false;
  writeActionsEnabled: false;
  providers: AutomotiveProvider[];
  counts: { vehicles: number; diagnosticCases: number };
  hardLimits: Record<string, boolean>;
}

export interface AutomotiveActionProposal {
  id: string;
  vehicleId: string;
  caseId?: string;
  actionType: AutomotiveActionType;
  status: "proposal" | "approval_required" | "denied" | "not_configured" | "blocked" | "manual_only";
  approvalRequired: boolean;
  approval?: Pick<ApprovalRequest, "id" | "status">;
  executed: false;
  externalApiCallsMade: false;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const automotiveApi = {
  status: () => get<{ success: boolean; status: AutomotiveStatus }>("/context/automotive/status"),
  providers: () => get<{ success: boolean; providers: AutomotiveProvider[] }>("/context/automotive/providers"),
  vehicles: (limit = 100) => get<{ success: boolean; vehicles: VehicleProfile[]; count: number }>(`/context/automotive/vehicles?limit=${limit}`),
  createVehicle: (body: Partial<VehicleProfile> & { name?: string }) =>
    post<{ success: boolean; vehicle: VehicleProfile }>("/context/automotive/vehicles", body),
  preloadFoxbody: () =>
    post<{ success: boolean; vehicle: VehicleProfile }>("/context/automotive/vehicles/foxbody/preload", {}),
  vehicle: (id: string) =>
    get<{ success: boolean; vehicle: VehicleProfile }>(`/context/automotive/vehicles/${encodeURIComponent(id)}`),
  addRepairLog: (id: string, body: { caseId?: string; summary?: string; finalFix?: string; evidenceRefs?: string[] }) =>
    post<{ success: boolean; vehicle: VehicleProfile }>(`/context/automotive/vehicles/${encodeURIComponent(id)}/repair-log`, body),
  cases: (vehicleId?: string, limit = 100) =>
    get<{ success: boolean; cases: DiagnosticCase[]; count: number }>(
      `/context/automotive/cases?limit=${limit}${vehicleId ? `&vehicleId=${encodeURIComponent(vehicleId)}` : ""}`,
    ),
  createCase: (body: { vehicleId: string; title?: string; symptoms?: string; dtcs?: Array<{ code: string; description?: string }>; evidenceRefs?: string[] }) =>
    post<{ success: boolean; case: DiagnosticCase }>("/context/automotive/cases", body),
  proposeAction: (body: { vehicleId: string; caseId?: string; actionType?: AutomotiveActionType; approvalId?: string; metadata?: Record<string, unknown> }) =>
    post<AutomotiveActionProposal>("/context/automotive/actions/propose", body),
};

// ── Intelligence ──────────────────────────────────────────────────────────────

// Mirrors backend ImpactedFileEntry from global-workspace-intelligence.ts
export interface ImpactedFileEntry {
  path: string;        // backend uses "path" not "filePath"
  relativePath: string;
  score: number;
  reason: string;
  matchedSymbols: string[];
  relatedFiles: string[];
}

// Mirrors backend RefactorStep — status values match backend exactly
export interface RefactorStep {
  id: string;
  filePath: string;
  relativePath: string;
  status: "pending" | "running" | "completed" | "failed";  // backend: no "done"/"skipped"
  reason: string;
  diff?: string;
  verificationMessage?: string;
  error?: string;
}

export interface RefactorPlan {
  id: string;
  workspacePath: string;
  workspaceName: string;
  request: string;
  createdAt: string;
  impactedFiles: ImpactedFileEntry[];
  steps: RefactorStep[];
  summary: string;
}

// Mirrors backend RefactorJob — status values match backend exactly
export interface RefactorJob {
  id: string;
  planId: string;
  workspacePath: string;
  request: string;
  model: string;
  status: "queued" | "running" | "completed" | "failed";  // backend: "queued" not "pending", "completed" not "done"
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  steps: RefactorStep[];
  error?: string;
}

export const intelligence = {
  // Backend returns { success, plan } — no planId at top level; use data.plan.id
  planRefactor:    (workspacePath: string, request: string) =>
    post<{ success: boolean; plan: RefactorPlan }>("/intelligence/refactors/plan", { workspacePath, request }),
  getPlan:         (planId: string) =>
    get<{ success: boolean; plan: RefactorPlan }>(`/intelligence/refactors/plan/${encodeURIComponent(planId)}`),
  // Backend returns { success, job } — no jobId at top level; use data.job.id
  executeRefactor: (planId: string, model?: string) =>
    post<{ success: boolean; job: RefactorJob }>(`/intelligence/refactors/${encodeURIComponent(planId)}/execute`, { model }),
  jobs:            () => get<{ success: boolean; jobs: RefactorJob[] }>("/intelligence/refactors/jobs"),
  job:             (jobId: string) =>
    get<{ success: boolean; job: RefactorJob }>(`/intelligence/refactors/jobs/${encodeURIComponent(jobId)}`),
};

// ── File Browser ──────────────────────────────────────────────────────────────

export interface FilebrowserEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: string;
}

export const filebrowser = {
  list: (path: string) =>
    get<{ entries: FilebrowserEntry[] }>(`/filebrowser/list?path=${encodeURIComponent(path)}`),
  read: (path: string) =>
    get<{ content: string; path: string }>(`/filebrowser/read?path=${encodeURIComponent(path)}`),
};

// ── Stack ─────────────────────────────────────────────────────────────────────

export interface StackComponent {
  id: string;
  name: string;
  category: string;
  installed: boolean;
  running: boolean;
  version: string | null;
  path?: string;
}

export const stack = {
  status:          () => get<{ components: StackComponent[] }>("/stack/status"),
  startComponent:  (componentId: string) =>
    post<{ success: boolean; message: string }>(`/stack/components/${encodeURIComponent(componentId)}/start`),
  stopComponent:   (componentId: string) =>
    post<{ success: boolean; message: string }>(`/stack/components/${encodeURIComponent(componentId)}/stop`),
  restartComponent:(componentId: string) =>
    post<{ success: boolean; message: string }>(`/stack/components/${encodeURIComponent(componentId)}/restart`),
  backup:          () => post<{ success: boolean; message: string }>("/stack/backup"),
  githubAuth:      () => post<{ success: boolean; message: string }>("/stack/github-auth"),
  githubStatus:    () => get<{ authenticated: boolean; username?: string }>("/stack/github-status"),
};

// ── Repair ────────────────────────────────────────────────────────────────────

export interface RepairHealthEntry {
  id: string;
  name: string;
  category: string;
  status: "ok" | "warning" | "error";
  installed: boolean;
  running?: boolean;
  version?: string | null;
  value?: string;
  details?: string;
  canRepair: boolean;
  repairAction: string;
  repairCmd: string;
  repairDescription: string;
}

export interface RepairPortStatus {
  port: number;
  name: string;
  id: string;
  reachable: boolean;
}

export interface RepairHealthResult {
  items: RepairHealthEntry[];
  portStatus: RepairPortStatus[];
  healthScore: number;
  errors: number;
  warnings: number;
  ok: number;
  recommendations: string[];
  checkedAt: string;
  isFreshPC: boolean;
}

export interface RepairLogEntry {
  id: string;
  timestamp: string;
  action: string;
  success: boolean;
  message: string;
}

export const repair = {
  health:               () => get<RepairHealthResult>("/repair/health"),
  run:                  (ids: string[], mode?: "selective" | "all-broken" | "all") =>
    post<{ success: boolean; approvalRequired?: boolean; approval?: ApprovalRequest; proposal?: SelfMaintainerProposal; results: unknown[]; launched?: number; skipped?: number; message?: string }>("/repair/run", { ids, mode }),
  log:                  () => get<{ log: RepairLogEntry[] }>("/repair/log"),
  diagnoseIntegration:  (id: string) =>
    post<{ success: boolean; diagnosis: string }>(`/repair/diagnose-integration/${encodeURIComponent(id)}`),
  detectProjectContext: (projectPath: string) =>
    post<{ success: boolean; context: unknown }>("/repair/detect-project-context", { projectPath }),
  setupProjectAi:       (projectPath: string) =>
    post<{ success: boolean; message: string }>("/repair/setup-project-ai", { projectPath }),
};

// ── Rollback ──────────────────────────────────────────────────────────────────

export interface BackupEntry {
  filePath:   string;
  backupPath: string;
  createdAt:  string;
  sizeBytes?: number;
}

export const rollback = {
  getBackup:    (filePath: string) =>
    get<{ backup: BackupEntry | null }>(`/rollback/backup?filePath=${encodeURIComponent(filePath)}`),
  listBackups:  (directoryPath: string) =>
    get<{ backups: BackupEntry[] }>(`/rollback/backups?directoryPath=${encodeURIComponent(directoryPath)}`),
  rollback:     (filePath: string) =>
    post<{ success: boolean; backup: BackupEntry }>("/rollback", { filePath }),
  scanBackups:  (workspacePath: string) =>
    get<{ backups: BackupEntry[] }>(`/rollback/scan?workspacePath=${encodeURIComponent(workspacePath)}`),
};

// ── Updater ───────────────────────────────────────────────────────────────────

export interface UpdaterModelState {
  lifecycle?: string;
  lastError?: string;
  updateAvailable?: boolean;
  lastChecked?: string;
}

export const updater = {
  manifest:          () => get<{ models: Record<string, UpdaterModelState> }>("/updater/manifest"),
  check:             (scope?: "all" | "tools" | "models") =>
    post<{ success: boolean; results: Array<{ id: string; type: string; name: string; installed: string; available: string; updateAvailable: boolean }>; totalUpdates: number; checkedAt: string }>("/updater/check", { scope: scope ?? "all" }),
  update:            (ids: string[]) =>
    post<SelfMaintainerActionResult & { launched: string[] }>("/updater/update", { ids }),
  selfMaintainer:    () => get<SelfMaintainerSnapshot>("/updater/self-maintainer"),
  runMaintainerRadar: (body: { dryRunOnly?: boolean; includeNetworkChecks?: boolean } = {}) =>
    post<SelfMaintainerSnapshot>("/updater/self-maintainer/radar", body),
  createMaintainerProposal: (body: { request: string; files?: string[]; dryRunOnly?: boolean }) =>
    post<SelfMaintainerActionResult>("/updater/self-maintainer/proposals", body),
  proposeMaintainerAction: (body: { action: string; targetIds?: string[]; dryRunOnly?: boolean; approvalId?: string; details?: Record<string, unknown> }) =>
    post<SelfMaintainerActionResult>("/updater/self-maintainer/actions/propose", body),
  rollbackModel:     (modelName: string) =>
    post<{ success: boolean; message: string }>(`/updater/rollback/${encodeURIComponent(modelName)}`),
  modelStates:       () => get<{ states: Record<string, UpdaterModelState> }>("/updater/model-states"),
  updateModelState:  (modelName: string, state: Partial<UpdaterModelState>) =>
    req<{ success: boolean }>("PATCH", `/updater/model-states/${encodeURIComponent(modelName)}`, state),
  backupSettings:    () => post<{ success: boolean; backupId: string; backupDir: string; files: string[] }>("/updater/backup-settings"),
  schedule:          () => get<{ schedule: unknown }>("/updater/schedule"),
  setSchedule:       (schedule: unknown) => put<{ success: boolean }>("/updater/schedule", { schedule }),
};

// ── Usage ─────────────────────────────────────────────────────────────────────

export interface UsageRecord {
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  category?: string;
  sessionId?: string;
}

export interface LifetimeUsage {
  success:         boolean;
  totalTokensIn:   number;
  totalTokensOut:  number;
  totalTokens:     number;
  costEstimateUsd: number;
  firstDate:       string | null;
  pricing: { inputPer1M: number; outputPer1M: number; model: string };
}

export interface ModelPullHistoryEntry {
  id:          string;
  modelName:   string;
  startedAt:   string;
  completedAt: string | null;
  bytes:       number | null;
  status:      string;
  error:       string | null;
}

export interface AuditEntry {
  id:            string;
  timestamp:     string;
  action:        string;
  filePath:      string | null;
  oldHash:       string | null;
  newHash:       string | null;
  userConfirmed: boolean | null;
  result:        string | null;
  backupPath:    string | null;
}

export const usage = {
  record:   (entry: UsageRecord) => post<{ success: boolean }>("/usage/record", entry),
  today:    () => get<unknown>("/usage/today"),
  history:  (days?: number) =>
    get<unknown>(`/usage/history${days !== undefined ? `?days=${days}` : ""}`),
  estimate: () => get<unknown>("/usage/estimate"),
  lifetime: () => get<LifetimeUsage>("/usage/lifetime"),
  purge:    (before?: string) =>
    del<{ success: boolean; removed: number }>(`/usage/purge${before ? `?before=${encodeURIComponent(before)}` : ""}`),
};

export const audit = {
  history:            (limit?: number, types?: string) =>
    get<{ success: boolean; entries: AuditEntry[]; total: number }>(
      `/audit/history?limit=${limit ?? 100}${types ? `&types=${encodeURIComponent(types)}` : ""}`
    ),
  rollbackCandidates: () =>
    get<{ success: boolean; candidates: Array<{ id: string; timestamp: string; action: string; filePath: string | null; backupPath: string | null }> }>(
      "/audit/rollback-candidates"
    ),
};

// ── Settings ──────────────────────────────────────────────────────────────────

export const settings = {
  get: () => get<{ settings: AppSettings }>("/settings"),
  set: (data: Partial<AppSettings>) => put<{ success: boolean; settings: AppSettings }>("/settings", data),
};

// ── Hardware probe ────────────────────────────────────────────────────────────

export interface HardwareGpu {
  name:           string;
  driver?:        string;
  totalVramBytes: number;
  freeVramBytes:  number;
  probedVia:      "nvidia-smi" | "wmic" | "safe-mode";
}

export interface HardwareCpu {
  model:         string;
  physicalCores: number;
  logicalCores:  number;
  speedMhz:      number;
}

export interface HardwareRam {
  totalBytes: number;
  freeBytes:  number;
}

export interface HardwareDisk {
  installDriveFreeBytes:  number;
  installDriveTotalBytes: number;
}

export interface HardwareOs {
  platform: string;
  release:  string;
  build?:   string;
  arch:     string;
}

export interface HardwareOllama {
  reachable: boolean;
  url:       string;
}

export interface HardwareSnapshot {
  gpu:      HardwareGpu;
  cpu:      HardwareCpu;
  ram:      HardwareRam;
  disk:     HardwareDisk;
  os:       HardwareOs;
  ollama:   HardwareOllama;
  probedAt: string;
}

export const hardware = {
  probe: () => get<HardwareSnapshot>("/system/hardware"),
};

// ── OS Interop ────────────────────────────────────────────────────────────────

export interface OsWindow {
  title: string;
  handle?: number;
  processName?: string;
}

export const os = {
  windows:    (pattern?: string) =>
    get<{ success: boolean; windows: OsWindow[] }>(`/system/os/windows${pattern ? `?pattern=${encodeURIComponent(pattern)}` : ""}`),
  focus:      (pattern: string) =>
    post<{ success: boolean; focused: boolean }>("/system/os/focus", { pattern }),
  sendKeys:   (keys: string) =>
    post<{ success: boolean }>("/system/os/send-keys", { keys }),
  typeText:   (text: string) =>
    post<{ success: boolean }>("/system/os/type-text", { text }),
  click:      (x: number, y: number) =>
    post<{ success: boolean }>("/system/os/click", { x, y }),
  screenshot: () =>
    post<{ success: boolean; base64: string; path: string }>("/system/os/screenshot"),
};

// ── Chat Sessions ─────────────────────────────────────────────────────────────

export interface ChatSession {
  id:            string;
  name:          string;
  workspacePath: string | null;
  createdAt:     string;
  updatedAt:     string;
  preview?:      { role: string; content: string } | null;
}

export interface StoredMessage {
  id:             string;
  sessionId:      string;
  role:           "system" | "user" | "assistant";
  content:        string;
  imagesJson:     string | null;
  supervisorJson: string | null;
  contextJson:    string | null;
  createdAt:      string;
}

export const sessions = {
  list:    () =>
    get<{ sessions: ChatSession[] }>("/chat/sessions"),
  get:     (id: string) =>
    get<{ session: ChatSession; messages: StoredMessage[] }>(`/chat/sessions/${encodeURIComponent(id)}`),
  create:  (name?: string, workspacePath?: string) =>
    post<{ session: ChatSession }>("/chat/sessions", { name, workspacePath }),
  rename:  (id: string, name: string) =>
    fetch(`/api/chat/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(r => r.json() as Promise<{ session: ChatSession }>),
  delete:  (id: string) =>
    fetch(`/api/chat/sessions/${encodeURIComponent(id)}`, { method: "DELETE" })
      .then(r => r.json() as Promise<{ success: boolean }>),
  branch:  (id: string, messageId: string) =>
    post<{ session: ChatSession }>(`/chat/sessions/${encodeURIComponent(id)}/branch`, { messageId }),
  addMessage: (id: string, role: string, content: string, extras?: { imagesJson?: string; supervisorJson?: string; contextJson?: string }) =>
    post<{ success: boolean; id: string }>(`/chat/sessions/${encodeURIComponent(id)}/messages`, { role, content, ...extras }),
};

// ── STT ───────────────────────────────────────────────────────────────────────

export const stt = {
  status: () => get<{ available: boolean; sidecarUrl: string }>("/stt/status"),
};

// ── TTS ───────────────────────────────────────────────────────────────────────

export const tts = {
  status: () => get<{ available: boolean; voices: string[]; defaultVoice: string; voicesDir: string }>("/tts/status"),
};

// ── Voice & Meeting Intelligence (Phase 11) ────────────────────────────────────

export type CaptureMode = "disabled" | "push_to_talk" | "wake_word" | "meeting" | "silent_command";
export type FollowUpType = "email" | "calendar_invite" | "message" | "task";
export type FollowUpStatus = "draft" | "pending_approval" | "approved" | "denied" | "sent";
export type MeetingSessionStatus = "idle" | "recording" | "processing" | "completed" | "failed";

export interface VoiceCapturePolicyProfile {
  captureMode:                     CaptureMode;
  preferredActiveMode:             "push_to_talk" | "wake_word" | "meeting" | "silent_command";
  captureIndicatorVisible:         true;
  alwaysOnCaptureEnabled:          false;
  cloudSttEnabled:                 false;
  cloudTtsEnabled:                 false;
  meetingFollowUpApprovalRequired: true;
  screenpipeEnabled:               false;
  wakeWordEnabled:                 boolean;
  rawAudioAutoDelete:              boolean;
  rawAudioRetentionSec:            number;
  transcriptRetentionDays:         number;
  excludedApps:                    string[];
  excludedZones:                   string[];
  localSttPreferred:               boolean;
  localTtsPreferred:               boolean;
  maxMeetingTranscriptLengthWords: number;
}

export interface VoiceStatus {
  captureMode:      CaptureMode;
  captureActive:    boolean;
  captureIndicator: true;
  sttAvailable:     boolean;
  sttSidecarUrl:    string;
  ttsAvailable:     boolean;
  wakeWordStatus:   "not_configured" | "configured" | "unavailable";
  alwaysOnEnabled:  false;
  cloudSttEnabled:  false;
  cloudTtsEnabled:  false;
}

export interface FollowUpDraft {
  id:          string;
  meetingId:   string;
  type:        FollowUpType;
  subject:     string;
  bodyPreview: string;
  status:      FollowUpStatus;
  approvalId?: string;
  createdAt:   string;
  updatedAt:   string;
}

export interface MeetingSession {
  id:                   string;
  status:               MeetingSessionStatus;
  captureMode:          CaptureMode;
  startedAt:            string | null;
  stoppedAt:            string | null;
  transcriptWordCount:  number;
  summaryText:          string;
  decisions:            string[];
  actionItems:          Array<{ text: string; assignee?: string; dueDate?: string }>;
  followUps:            FollowUpDraft[];
  createdAt:            string;
  updatedAt:            string;
}

export interface ScreenContextProfile {
  manualScreenshotEnabled:       boolean;
  maxScreenshotAttachPerSession: number;
  screenpipeEnabled:             false;
  screenpipeStatus:              "not_configured";
  alwaysOnScreenCapture:         false;
  excludedApps:                  string[];
}

export const voiceApi = {
  policy: () => get<{ success: boolean; policy: VoiceCapturePolicyProfile }>("/voice/policy"),
  updatePolicy: (p: Partial<VoiceCapturePolicyProfile>) =>
    put<{ success: boolean; policy: VoiceCapturePolicyProfile }>("/voice/policy", p),
  status: () => get<{ success: boolean; status: VoiceStatus }>("/voice/status"),
  sourceOfTruth: () => get<{ success: boolean; sourceOfTruth: string }>("/voice/source-of-truth"),
  meeting: {
    list:  (limit?: number) =>
      get<{ success: boolean; sessions: MeetingSession[] }>(`/voice/meeting/sessions${limit ? `?limit=${limit}` : ""}`),
    start: (captureMode?: CaptureMode) =>
      post<{ success: boolean; session: MeetingSession }>("/voice/meeting/start", { captureMode }),
    get:   (id: string) => get<{ success: boolean; session: MeetingSession }>(`/voice/meeting/${id}`),
    stop:  (id: string, data?: { transcriptWordCount?: number; summaryText?: string; decisions?: string[]; actionItems?: Array<{ text: string }> }) =>
      post<{ success: boolean; session: MeetingSession }>(`/voice/meeting/${id}/stop`, data),
    draftFollowUp: (id: string, body: { type: FollowUpType; subject: string; body: string }) =>
      post<{ success: boolean; draft: FollowUpDraft }>(`/voice/meeting/${id}/followup/draft`, body),
    proposeSend: (meetingId: string, draftId: string) =>
      post<{ success: boolean; approvalRequired: true; approvalId: string; message: string }>(
        `/voice/meeting/${meetingId}/followup/${draftId}/propose-send`,
      ),
    denyFollowUp: (meetingId: string, draftId: string) =>
      post<{ success: boolean; draft: FollowUpDraft }>(
        `/voice/meeting/${meetingId}/followup/${draftId}/deny`,
      ),
  },
};

export const screenContextApi = {
  status: () => get<{ success: boolean; profile: ScreenContextProfile; screenpipeStatus: string; alwaysOnCapture: boolean }>("/screen-context/status"),
  updateProfile: (p: Partial<ScreenContextProfile>) =>
    put<{ success: boolean; profile: ScreenContextProfile }>("/screen-context/profile", p),
};

// ── RAG ───────────────────────────────────────────────────────────────────────

export interface RagCollection {
  id:         string;
  name:       string;
  chunkCount: number;
  sourceCount: number;
  vectorProvider: string;
  providerStatus: RagProviderStatus;
  createdAt:  string;
  updatedAt?: string;
}

export interface RagProviderStatus {
  id: string;
  displayName: string;
  kind: "ingestion" | "vector";
  status: "available" | "unavailable" | "not_configured" | "not_installed" | "degraded";
  default: boolean;
  configured: boolean;
  localFirst: true;
  dataLeavesMachine: false;
  startupPolicy: "manual" | "on_demand" | "disabled";
  reason?: string;
  supportedExtensions?: string[];
}

export interface RagCitationMetadata {
  file?: string;
  path?: string;
  page?: number | "unavailable";
  section?: string | "unavailable";
  lineStart?: number | "unavailable";
  lineEnd?: number | "unavailable";
}

export interface RagSource {
  id: string;
  collectionId: string;
  source: string;
  sourcePath?: string;
  sourceHash: string;
  parserUsed: string;
  chunkCount: number;
  citation: RagCitationMetadata;
  providerStatus: RagProviderStatus;
  status: "indexed" | "skipped_unchanged" | "reindexed" | "deleted" | "failed";
  updatedAt: string;
  deletedAt?: string;
}

export interface RagChunk {
  id:           string;
  collectionId: string;
  sourceId?:     string;
  source:       string;
  chunkIndex:   number;
  text:         string;
  score:        number;
  citation:     RagCitationMetadata;
}

export const ragApi = {
  status: () =>
    get<{
      success: boolean;
      sourceOfTruth: string;
      ingestion: RagProviderStatus[];
      vectorStores: RagProviderStatus[];
      defaults: Record<string, unknown>;
    }>("/rag/status"),
  createCollection: (name: string) =>
    post<{ success: boolean; collection: RagCollection }>("/rag/collections", { name }),
  listCollections: () =>
    get<{ success: boolean; collections: RagCollection[] }>("/rag/collections"),
  deleteCollection: (id: string) =>
    del<{ success: boolean }>(`/rag/collections/${encodeURIComponent(id)}`),
  ingest: (collectionId: string, opts: { filePath?: string; content?: string; source?: string }) =>
    post<{ success: boolean; chunksAdded: number; chunksRemoved: number; skipped: boolean; source: RagSource }>("/rag/ingest", { collectionId, ...opts }),
  reindex: (collectionId: string, opts: { filePath?: string; content?: string; source?: string }) =>
    post<{ success: boolean; chunksAdded: number; chunksRemoved: number; skipped: boolean; reindexed: boolean; source: RagSource }>("/rag/reindex", { collectionId, ...opts }),
  listSources: (collectionId: string) =>
    get<{ success: boolean; sources: RagSource[] }>(`/rag/collections/${encodeURIComponent(collectionId)}/sources`),
  listChunks: (collectionId: string, sourceId?: string, limit = 50) =>
    get<{ success: boolean; chunks: RagChunk[] }>(
      `/rag/collections/${encodeURIComponent(collectionId)}/chunks?limit=${limit}${sourceId ? `&sourceId=${encodeURIComponent(sourceId)}` : ""}`,
    ),
  deleteSource: (collectionId: string, sourceId: string) =>
    post<{ success: boolean; chunksRemoved: number; source: RagSource | null }>(
      `/rag/collections/${encodeURIComponent(collectionId)}/sources/${encodeURIComponent(sourceId)}/delete`,
    ),
  search: (query: string, collectionIds: string[], topK?: number) =>
    post<{ success: boolean; chunks: RagChunk[] }>("/rag/search", { query, collectionIds, topK }),
};

// ── Web Search ────────────────────────────────────────────────────────────────

export interface WebSearchResult {
  title:   string;
  url:     string;
  snippet: string;
}

export const webSearch = {
  search: (query: string) =>
    post<{ success: boolean; results: WebSearchResult[]; backend: string }>("/web/search", { query }),
  fetch: (url: string) =>
    post<{ success: boolean; markdown: string; url: string }>("/web/fetch", { url }),
};

// ── Benchmark ─────────────────────────────────────────────────────────────────

export interface BenchmarkResult {
  model:       string;
  output:      string;
  tokensOut:   number;
  durationMs:  number;
  score:       number;
  scoreReason: string;
}

export interface BenchmarkRun {
  id:         string;
  prompt:     string;
  createdAt:  string;
  judgeModel: string;
  status:     "running" | "completed" | "failed";
  results:    BenchmarkResult[];
  error?:     string;
}

export const benchmarkApi = {
  start: (models: string[], prompt?: string) =>
    post<{ success: boolean; run: BenchmarkRun }>("/benchmark/runs", { models, prompt }),
  list: () =>
    get<{ success: boolean; runs: BenchmarkRun[] }>("/benchmark/runs"),
  get: (id: string) =>
    get<{ success: boolean; run: BenchmarkRun }>(`/benchmark/runs/${encodeURIComponent(id)}`),
};

// ── Pinboard ──────────────────────────────────────────────────────────────────

export interface PinboardItem {
  id:            string;
  kind:          "text" | "file" | "snippet";
  title:         string;
  content:       string;
  filePath?:     string;
  workspacePath?: string;
  createdAt:     string;
}

export const pinboard = {
  list: () =>
    get<{ success: boolean; items: PinboardItem[] }>("/pinboard"),
  add: (item: Omit<PinboardItem, "id" | "createdAt">) =>
    post<{ success: boolean; item: PinboardItem }>("/pinboard", item),
  remove: (id: string) =>
    del<{ success: boolean }>(`/pinboard/${encodeURIComponent(id)}`),
};

// ── Token Budget ──────────────────────────────────────────────────────────────

export interface TokenBudget {
  sessionId:    string;
  budgetTokens: number;
  usedTokens:   number;
  updatedAt:    string;
}

export const tokenBudget = {
  get: (sessionId: string) =>
    get<{ success: boolean; budget: TokenBudget | null }>(`/token-budget/${encodeURIComponent(sessionId)}`),
  set: (sessionId: string, budgetTokens: number, usedTokens?: number) =>
    put<{ success: boolean }>(`/token-budget/${encodeURIComponent(sessionId)}`, { budgetTokens, usedTokens }),
  remove: (sessionId: string) =>
    del<{ success: boolean }>(`/token-budget/${encodeURIComponent(sessionId)}`),
  summarize: (sessionId: string, messages: Array<{ role: string; content: string }>, model?: string) =>
    post<{ success: boolean; preamble: string; trimmedCount: number }>(`/token-budget/${encodeURIComponent(sessionId)}/summarize`, { messages, model }),
};

// ── Time Travel ───────────────────────────────────────────────────────────────

export interface TimeTravelBackup {
  filePath:   string;
  bakPath:    string;
  sizeBytes:  number;
  modifiedAt: string;
  isReadable: boolean;
}

export interface TimeTravelDiff {
  bakPath:     string;
  origPath:    string;
  origExists:  boolean;
  bakContent:  string;
  origContent: string;
  diff:        string;
  hasChanges:  boolean;
}

export const timeTravel = {
  scan: (root?: string) =>
    get<{ success: boolean; backups: TimeTravelBackup[]; scannedRoot: string }>(
      `/timetravel/backups${root ? `?root=${encodeURIComponent(root)}` : ""}`,
    ),
  diff: (bakPath: string) =>
    get<{ success: boolean } & TimeTravelDiff>(
      `/timetravel/diff?bak=${encodeURIComponent(bakPath)}`,
    ),
  restore: (bakPath: string) =>
    post<{ success: boolean; restored: string }>("/timetravel/restore", { bakPath }),
};

// ── Plugins ───────────────────────────────────────────────────────────────────

export interface PluginManifest {
  name:         string;
  version:      string;
  description:  string;
  author:       string;
  routes:       Array<{ method: string; path: string; handler: string }>;
  pages:        Array<{ label: string; path: string; component: string }>;
  permissions:  { fileAccess: "none" | "read-only" | "read-write" };
  enabled:      boolean;
  manifestPath: string;
}

export const pluginsApi = {
  list: () =>
    get<{ success: boolean; plugins: PluginManifest[]; pluginsDir: string }>("/plugins"),
  get: (name: string) =>
    get<{ success: boolean; plugin: PluginManifest }>(`/plugins/${encodeURIComponent(name)}`),
};

// ── Tool Registry / Firewall ─────────────────────────────────────────────────

export type ToolRiskLevel = "low" | "medium" | "high" | "critical";
export type ToolStatus =
  | "available"
  | "disabled"
  | "not_configured"
  | "blocked"
  | "approval_required"
  | "denied"
  | "dry_run"
  | "proposal_only";
export type ToolPermissionScope =
  | "filesystem.read"
  | "filesystem.write"
  | "network"
  | "commands"
  | "secrets"
  | "browser"
  | "desktop"
  | "physical"
  | "model"
  | "external_messages"
  | "install"
  | "update";

export interface ToolRecord {
  id: string;
  displayName: string;
  provider: string;
  type: string;
  sourceRef: string;
  sourceKind: string;
  installStatus: "installed" | "not_installed" | "unknown";
  configuredStatus: "configured" | "not_configured" | "degraded";
  enabled: boolean;
  runtimeModeCompatibility: string[];
  permissionScopes: ToolPermissionScope[];
  networkAccess: "none" | "local_only" | "external";
  filesystemAccess: "none" | "read" | "write" | "scoped";
  commandExecutionRequired: boolean;
  secretsRequired: boolean;
  approvalRequirement: "none" | "required" | "manual_only";
  sandboxMode: string;
  isolationMode?: "none" | "dry_run" | "docker_mcp_gateway" | "future_sandbox";
  visibility?: "visible" | "hidden";
  dockerMcp?: {
    isolationMode: "none" | "dry_run" | "docker_mcp_gateway" | "future_sandbox";
    imageRef?: string;
    imagePinned: boolean;
    catalogSource: "docker_built_catalog" | "community_catalog" | "custom_local" | "unknown_untrusted";
    trustStatus: "trusted_catalog" | "unverified" | "unpinned" | "blocked";
    containerNetworkMode: "none" | "restricted_egress" | "host_required";
    filesystemMounts: Array<{ hostPath: string; containerPath: string; mode: "read_only" | "read_write" }>;
    secretsRequired: boolean;
    resourceLimits: { cpus: number; memoryMb: number };
    profileId: string;
    profileAllowlisted: boolean;
    explicitlyApprovedSource: boolean;
    hiddenByDefault: boolean;
    blockSecrets: boolean;
    blockNetwork: boolean;
    deniedEnvVars: string[];
    exposedEnvVars: string[];
    notConfiguredReason?: string;
    degradedReason?: string;
  };
  clawGateway?: {
    gatewayType: "openclaw" | "nemoclaw" | "openshell" | "messaging_bridge" | "skill_adapter";
    gatewayState: "not_configured" | "proposed" | "configured" | "enabled" | "degraded" | "blocked" | "disabled";
    skillLifecycleState: "discovered" | "proposed" | "quarantined" | "reviewed" | "approved" | "rejected" | "disabled" | "blocked" | "not_configured";
    supportedChannels: string[];
    sourceTrust: {
      sourceUrl?: string;
      versionRef?: string;
      checksumOrDigest?: string;
      signatureStatus: "present" | "missing" | "unknown";
      provenanceStatus: "present" | "missing" | "unknown";
      reviewStatus: "not_reviewed" | "reviewed" | "approved" | "rejected";
      sourceKind: "allowlisted" | "community" | "custom_local" | "unknown";
      trustStatus: "allowlisted" | "explicitly_approved" | "unverified" | "blocked";
      explicitlyApprovedSource: boolean;
    };
    networkAccessRequired: boolean;
    filesystemAccessRequired: "none" | "read" | "write" | "scoped";
    commandExecutionRequired: boolean;
    messagingRequired: boolean;
    browserDesktopRequired: boolean;
    secretsRequired: boolean;
    physicalActionPotential: boolean;
    dockerMcpCompatible: boolean;
    preferredIsolation: "dry_run" | "docker_mcp_gateway" | "future_sandbox";
    profileAllowlisted: boolean;
    blockSecrets: boolean;
    requireApprovalForExternalMessages: boolean;
    updateInstallBehavior: "none" | "proposal_only" | "blocked";
  };
  riskLevel: ToolRiskLevel;
  auditReplayBehavior: "record_decision_only" | "record_decision_and_approval";
  degradedReason?: string;
  notConfiguredReason?: string;
  capabilities: string[];
  actions: string[];
  metadata: Record<string, unknown>;
}

export interface ToolCallResult {
  success: boolean;
  status: ToolStatus;
  blocked: boolean;
  executed: false;
  message: string;
  tool?: ToolRecord;
  approvalRequired?: boolean;
  approval?: Record<string, unknown>;
  decision: {
    status: ToolStatus;
    allowed: boolean;
    blocked: boolean;
    executed: false;
    reason: string;
    runtimeMode: string;
    requestedScopes: ToolPermissionScope[];
    requiredScopes: ToolPermissionScope[];
    approvalRequired: boolean;
    approvalId?: string;
    auditId?: string;
    redacted: boolean;
  };
}

export interface DockerMcpProfile {
  id: string;
  name: string;
  enabled: boolean;
  approved: boolean;
  allowedServers: string[];
  allowedTools: string[];
  modeCompatibility: string[];
  security: {
    blockSecrets: boolean;
    blockNetwork: boolean;
    resourceLimits: { cpus: number; memoryMb: number };
    allowedProfiles: string[];
    allowedTools: string[];
    allowedCatalogs: string[];
    allowedRegistries: string[];
    allowedMounts: Array<{ hostPath: string; containerPath: string; mode: string }>;
    deniedEnvVars: string[];
    exposedEnvVars: string[];
  };
  updatedAt: string;
}

export interface DockerMcpGatewayStatus {
  status: "available" | "not_configured" | "degraded";
  dockerInstalled: boolean;
  dockerDaemonReachable: boolean;
  dockerMcpAvailable: boolean;
  gatewayConfigured: boolean;
  gatewayRunning: boolean;
  unavailableReason?: string;
  checkedAt: string;
  dryRun: boolean;
  dockerVersion?: string;
  dockerServerVersion?: string;
  profile: DockerMcpProfile;
}

export interface DockerMcpGatewayProposal {
  status: "proposed";
  dryRun: true;
  source: string;
  imageRef: string;
  catalogSource: string;
  trustStatus: string;
  security: DockerMcpProfile["security"];
  clientConfig: { mcpServers: Record<string, unknown>; environment: Record<string, never> };
  notes: string[];
}

export interface ClawGatewayProfile {
  id: string;
  name: string;
  enabled: boolean;
  approved: boolean;
  gatewayStates: Record<string, string>;
  allowedGateways: string[];
  allowedSkills: string[];
  blockedSkills: string[];
  quarantinedSkills: string[];
  rejectedSkills: string[];
  approvedSkillSources: string[];
  allowedChannels: string[];
  modeCompatibility: string[];
  blockSecrets: boolean;
  requireApprovalForExternalMessages: boolean;
  allowDockerMcpIsolation: boolean;
  updatedAt: string;
}

export interface ClawSkillRecord {
  id: string;
  displayName: string;
  gatewayType: string;
  lifecycleState: string;
  sourceRef: string;
  supportedChannels: string[];
  declaredPermissions: ToolPermissionScope[];
  networkAccessRequired: boolean;
  filesystemAccessRequired: "none" | "read" | "write" | "scoped";
  commandExecutionRequired: boolean;
  messagingRequired: boolean;
  browserDesktopRequired: boolean;
  secretsRequired: boolean;
  physicalActionPotential: boolean;
  updateInstallBehavior: string;
  dockerMcpCompatible: boolean;
  preferredIsolation: string;
  riskLevel: ToolRiskLevel;
  sourceTrust: Record<string, unknown>;
  notConfiguredReason?: string;
  degradedReason?: string;
}

export interface ClawGatewayStatus {
  status: "not_configured" | "degraded" | "available";
  openclawConfigured: boolean;
  nemoclawConfigured: boolean;
  openshellConfigured: boolean;
  gatewayReachable: false;
  skillRegistryStatus: "not_configured" | "quarantined" | "review_required" | "ready";
  unavailableReason?: string;
  degradedReason?: string;
  checkedAt: string;
  dryRun: true;
  profile: ClawGatewayProfile;
  skills: ClawSkillRecord[];
}

export interface ClawGatewayProposal {
  status: "proposed";
  dryRun: true;
  actionState: string;
  gatewayType: string;
  sourceRef: string;
  sourceTrust: Record<string, unknown>;
  requiredApprovals: string[];
  permissions: ToolPermissionScope[];
  rollbackPlan: string;
  testPlan: string[];
  notes: string[];
}

// ── Phase 09A — Browser Automation ───────────────────────────────────────────

export interface BrowserSessionProfile {
  id: string;
  name: string;
  enabled: boolean;
  approved: boolean;
  allowedDomains: string[];
  blockedDomains: string[];
  requireApprovalDomains: string[];
  modeCompatibility: string[];
  credentialEntryAllowed: false;
  antiBoEvasionAllowed: false;
  cookieStorageAllowed: false;
  maxConcurrentSessions: number;
  sessionTimeoutSeconds: number;
  updatedAt: string;
}

export interface PlaywrightBrowserStatus {
  status: "available" | "not_configured" | "degraded";
  playwrightInstalled: boolean;
  mcpServerReachable: boolean;
  sessionActive: boolean;
  unavailableReason?: string;
  checkedAt: string;
  dryRun: boolean;
  profile: BrowserSessionProfile;
}

export interface BrowserActionProposal {
  status: "proposed";
  dryRun: true;
  source: string;
  actionTier: string;
  targetUrl?: string;
  domainPolicyResult: "allow" | "block" | "require_approval";
  approvalRequired: boolean;
  hardBlocked: boolean;
  hardBlockReason?: string;
  notes: string[];
}

export const browserAutomationApi = {
  status: (live = false) =>
    get<{ success: boolean; status: PlaywrightBrowserStatus }>(
      `/tools/browser-automation/status?live=${live ? "true" : "false"}`,
    ),
  profile: () =>
    get<{ success: boolean; profile: BrowserSessionProfile }>("/tools/browser-automation/profile"),
  updateProfile: (profile: Partial<BrowserSessionProfile>) =>
    put<{ success: boolean; profile: BrowserSessionProfile; executed: false }>(
      "/tools/browser-automation/profile",
      { profile },
    ),
  proposeNavigate: (body: { targetUrl?: string } = {}) =>
    post<{ success: boolean; proposal: BrowserActionProposal; executed: false }>(
      "/tools/browser-automation/navigate/propose",
      body,
    ),
  proposeAction: (body: {
    toolId?: string;
    action?: string;
    targetUrl?: string;
    requestedScopes?: ToolPermissionScope[];
    input?: Record<string, unknown>;
    dryRun?: boolean;
    sandboxSatisfied?: boolean;
  }) =>
    post<ToolCallResult & { proposal: BrowserActionProposal }>(
      "/tools/browser-automation/action/propose",
      body,
    ),
};

// ── Phase 09B — Desktop Automation ───────────────────────────────────────────

export interface DesktopAutomationProfile {
  id: string;
  name: string;
  enabled: boolean;
  approved: boolean;
  allowedApps: string[];
  blockedApps: string[];
  requireApprovalApps: string[];
  modeCompatibility: string[];
  credentialEntryAllowed: false;
  keyloggerAllowed: false;
  screenshotSensitiveAllowed: false;
  maxMacroSteps: number;
  updatedAt: string;
}

export interface DesktopAutomationStatus {
  status: "available" | "not_configured" | "degraded";
  worldguiInstalled: boolean;
  worldguiRunning: boolean;
  windowsHost: boolean;
  unavailableReason?: string;
  checkedAt: string;
  dryRun: boolean;
  profile: DesktopAutomationProfile;
}

export interface DesktopActionProposal {
  status: "proposed";
  dryRun: true;
  source: string;
  actionTier: string;
  targetApp?: string;
  appPolicyResult: "allow" | "block" | "require_approval";
  approvalRequired: boolean;
  hardBlocked: boolean;
  hardBlockReason?: string;
  notes: string[];
}

export const desktopAutomationApi = {
  status: (live = false) =>
    get<{ success: boolean; status: DesktopAutomationStatus }>(
      `/tools/desktop-automation/status?live=${live ? "true" : "false"}`,
    ),
  profile: () =>
    get<{ success: boolean; profile: DesktopAutomationProfile }>("/tools/desktop-automation/profile"),
  updateProfile: (profile: Partial<DesktopAutomationProfile>) =>
    put<{ success: boolean; profile: DesktopAutomationProfile; executed: false }>(
      "/tools/desktop-automation/profile",
      { profile },
    ),
  proposeAction: (body: {
    toolId?: string;
    action?: string;
    targetApp?: string;
    requestedScopes?: ToolPermissionScope[];
    input?: Record<string, unknown>;
    dryRun?: boolean;
    sandboxSatisfied?: boolean;
  }) =>
    post<ToolCallResult & { proposal: DesktopActionProposal }>(
      "/tools/desktop-automation/action/propose",
      body,
    ),
};

// ── Phase 10 — Coding Agent ───────────────────────────────────────────────────

export interface CodingAgentProfile {
  id: string;
  name: string;
  enabled: boolean;
  approved: boolean;
  allowedWorkspaceRoots: string[];
  requireApprovalForEdits: true;
  selfModificationAllowed: false;
  directMainApplyAllowed: false;
  destructiveCommandsAllowed: false;
  maxFilesPerJob: number;
  activeAdapter: string;
  modeCompatibility: string[];
  updatedAt: string;
}

export interface OptionalAdapterStatus {
  adapter: string;
  status: "not_configured" | "configured" | "unavailable";
  unavailableReason?: string;
}

export interface CodingAgentStatus {
  status: "available" | "not_configured" | "degraded";
  builtInAvailable: boolean;
  activeAdapter: string;
  adapterStatuses: OptionalAdapterStatus[];
  workspaceRootsConfigured: number;
  approvalGateActive: true;
  unavailableReason?: string;
  checkedAt: string;
  dryRun: boolean;
  profile: CodingAgentProfile;
}

export interface CodingTaskProposal {
  status: "proposed";
  dryRun: true;
  source: string;
  approvalRequired: true;
  actionTier: string;
  workspacePath: string;
  request: string;
  targetFiles: string[];
  targetFilesCount: number;
  diffPreviewAvailable: boolean;
  selfModificationAllowed: false;
  directMainApplyAllowed: false;
  destructiveCommandsAllowed: false;
  workspaceRootEnforced: boolean;
  hardBlocked: boolean;
  hardBlockReason?: string;
  redactedPayload: Record<string, unknown>;
  approval?: ApprovalRequest;
  proposedAt: string;
}

export const codingAgentApi = {
  status: () =>
    get<{ success: boolean; status: CodingAgentStatus }>("/tools/coding-agent/status"),
  profile: () =>
    get<{ success: boolean; profile: CodingAgentProfile }>("/tools/coding-agent/profile"),
  updateProfile: (profile: Partial<CodingAgentProfile>) =>
    put<{ success: boolean; profile: CodingAgentProfile }>("/tools/coding-agent/profile", profile),
  proposeTask: (body: { request: string; workspacePath: string; targetFiles?: string[] }) =>
    post<{ success: boolean; proposal: CodingTaskProposal }>("/tools/coding-agent/task/propose", body),
  intelligenceStatus: () =>
    get<{ success: boolean; status: CodingAgentStatus }>("/intelligence/coding-agent/status"),
  intelligenceProfile: () =>
    get<{ success: boolean; profile: CodingAgentProfile }>("/intelligence/coding-agent/profile"),
};

export const tools = {
  list: (skipLiveChecks = true, includeHidden = false) =>
    get<{ success: boolean; sourceOfTruth: string; tools: ToolRecord[]; rules: Record<string, unknown> }>(
      `/tools?skipLiveChecks=${skipLiveChecks ? "true" : "false"}&includeHidden=${includeHidden ? "true" : "false"}`,
    ),
  get: (id: string) =>
    get<{ success: boolean; sourceOfTruth: string; tool: ToolRecord }>(`/tools/${encodeURIComponent(id)}?skipLiveChecks=true`),
  setEnabled: (id: string, enabled: boolean) =>
    put<{ success: boolean; tool: ToolRecord; executed: false }>(`/tools/${encodeURIComponent(id)}/enabled`, { enabled }),
  dryRun: (id: string, body: { action?: string; requestedScopes?: ToolPermissionScope[]; input?: Record<string, unknown>; sandboxSatisfied?: boolean } = {}) =>
    post<ToolCallResult>(`/tools/${encodeURIComponent(id)}/dry-run`, body),
  execute: (id: string, body: { action?: string; requestedScopes?: ToolPermissionScope[]; input?: Record<string, unknown>; approvalId?: string; dryRun?: boolean; sandboxSatisfied?: boolean } = {}) =>
    post<ToolCallResult>(`/tools/${encodeURIComponent(id)}/execute`, body),
  dockerMcpStatus: (live = false) =>
    get<{ success: boolean; status: DockerMcpGatewayStatus }>(`/tools/docker-mcp/status?live=${live ? "true" : "false"}`),
  dockerMcpProfile: () =>
    get<{ success: boolean; profile: DockerMcpProfile }>("/tools/docker-mcp/profile"),
  updateDockerMcpProfile: (profile: Partial<DockerMcpProfile>) =>
    put<{ success: boolean; profile: DockerMcpProfile; executed: false }>("/tools/docker-mcp/profile", { profile }),
  proposeDockerMcpConfig: (body: { networkRequired?: boolean; imageRef?: string } = {}) =>
    post<{ success: boolean; proposal: DockerMcpGatewayProposal; executed: false }>("/tools/docker-mcp/config/propose", body),
  proposeDockerMcpRun: (body: { toolId: string; action?: string; requestedScopes?: ToolPermissionScope[]; input?: Record<string, unknown>; sandboxSatisfied?: boolean }) =>
    post<ToolCallResult>("/tools/docker-mcp/run/propose", body),
  clawGatewayStatus: () =>
    get<{ success: boolean; status: ClawGatewayStatus }>("/tools/claw-gateway/status"),
  clawGatewayProfile: () =>
    get<{ success: boolean; profile: ClawGatewayProfile }>("/tools/claw-gateway/profile"),
  updateClawGatewayProfile: (profile: Partial<ClawGatewayProfile>) =>
    put<{ success: boolean; profile: ClawGatewayProfile; executed: false }>("/tools/claw-gateway/profile", { profile }),
  proposeClawGatewayConfig: (body: { gatewayType?: string; sourceRef?: string; sourceKind?: string } = {}) =>
    post<{ success: boolean; proposal: ClawGatewayProposal; executed: false }>("/tools/claw-gateway/config/propose", body),
  discoverClawSkill: (body: Record<string, unknown>) =>
    post<{ success: boolean; skill: ClawSkillRecord; executed: false; message: string }>("/tools/claw-gateway/skills/discover", body),
  reviewClawSkill: (body: { skillId: string; decision: "approve" | "reject" | "quarantine"; sourceRef?: string }) =>
    post<{ success: boolean; profile: ClawGatewayProfile; executed: false; message: string }>("/tools/claw-gateway/skills/review", body),
  proposeClawGatewayAction: (body: { toolId: string; action?: string; requestedScopes?: ToolPermissionScope[]; input?: Record<string, unknown>; dryRun?: boolean; sandboxSatisfied?: boolean }) =>
    post<ToolCallResult>("/tools/claw-gateway/action/propose", body),
};

// ── Durable Platform Foundation ──────────────────────────────────────────────

export interface FoundationSummary {
  workspaceRoots: number;
  permissionPolicies: number;
  approvalRequests: number;
  durableJobs: number;
  jobEvents: number;
  auditEvents: number;
  artifacts: number;
}

export interface WorkspaceRoot {
  id: string;
  label: string;
  rootPath: string;
  source: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DurableFoundationJob {
  id: string;
  kind: string;
  state: string;
  priority: number;
  payload: Record<string, unknown>;
  checkpoint: Record<string, unknown>;
  retryCount: number;
  result?: Record<string, unknown>;
  error?: string;
  sessionId?: string;
  workspaceId?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FoundationAuditEvent {
  id: string;
  eventType: string;
  action: string;
  actor: string;
  target?: string;
  result: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export const foundation = {
  summary: () =>
    get<{ success: boolean; summary: FoundationSummary }>("/foundation/summary"),
  workspaceRoots: () =>
    get<{ success: boolean; roots: WorkspaceRoot[] }>("/foundation/workspace-roots"),
  jobs: () =>
    get<{ success: boolean; jobs: DurableFoundationJob[] }>("/foundation/jobs"),
  createJob: (kind: string, payload: Record<string, unknown> = {}, priority = 0) =>
    post<{ success: boolean; job: DurableFoundationJob }>("/foundation/jobs", { kind, payload, priority }),
  leaseJob: (owner = "ui-verification", leaseMs = 60_000) =>
    post<{ success: boolean; job: DurableFoundationJob | null }>("/foundation/jobs/lease", { owner, leaseMs }),
  auditEvents: (limit = 50) =>
    get<{ success: boolean; events: FoundationAuditEvent[] }>(`/foundation/audit-events?limit=${limit}`),
  checkPath: (pathValue: string, scope: "file.read" | "file.write" = "file.read") =>
    post<{ success: boolean; decision: { allowed: boolean; reason: string; scope: string; action: string } }>("/foundation/path/check", { path: pathValue, scope }),
};

// ── Evidence Vault ────────────────────────────────────────────────────────────

export type EvidenceCategory =
  | "manual" | "receipt" | "warranty" | "vehicle" | "home" | "shop"
  | "network" | "tool" | "3d_printer" | "software" | "tax" | "project" | "other";

export type PrivacyClassification = "public" | "normal" | "private" | "sensitive" | "secret";

export interface EvidenceRecord {
  id: string;
  title: string;
  category: EvidenceCategory;
  sourcePath?: string;
  sourceId?: string;
  collectionId?: string;
  originalFilename?: string;
  fileHash?: string;
  parserUsed?: string;
  tags: string[];
  projectAssociation?: string;
  entityAssociation?: Record<string, string>;
  vendor?: string;
  manufacturer?: string;
  purchaseDate?: string;
  receiptDate?: string;
  warrantyExpires?: string;
  registrationDate?: string;
  expirationDate?: string;
  reminderDate?: string;
  ingestionStatus: "pending" | "indexed" | "failed" | "stale" | "deleted";
  privacyClassification: PrivacyClassification;
  degradedReason?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  stale: boolean;
}

export interface PaperlessProviderStatus {
  enabled: boolean;
  configured: boolean;
  baseUrl?: string;
  authStatus: "not_configured" | "ok" | "error";
  syncMode: "disabled" | "dry_run" | "metadata_only" | "full_local_import";
  lastSyncAt?: string;
  lastSyncStatus?: string;
  notConfiguredReason: string;
  localFirst: boolean;
  dataLeavesMachine: boolean;
}

export interface EvidenceReminderProposal {
  evidenceId: string;
  title: string;
  category: EvidenceCategory;
  reminderType: "warranty_expiry" | "renewal" | "registration" | "service" | "follow_up" | "maintenance";
  dueDate: string;
  daysUntilDue: number;
  proposalStatus: "proposal";
  requiresApproval: boolean;
  calendarIntegrationStatus: "not_configured";
}

export const evidenceVaultApi = {
  status: () =>
    get<{
      success: boolean;
      sourceOfTruth: string;
      totalRecords: number;
      recordsByCategory: Record<string, number>;
      recentIngestions: Array<{ id: string; title: string; category: string; status: string; updatedAt: string }>;
      failedIngestions: Array<{ id: string; title: string; category: string; degradedReason?: string; updatedAt: string }>;
      duplicateCount: number;
      staleCount: number;
      paperlessProvider: PaperlessProviderStatus;
      ragIntegration: { reusesExistingRagPath: boolean; ragSourceOfTruth: string };
    }>("/evidence/status"),

  listRecords: (params?: { category?: EvidenceCategory; status?: string; includeDeleted?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set("category", params.category);
    if (params?.status) qs.set("status", params.status);
    if (params?.includeDeleted) qs.set("includeDeleted", "true");
    const q = qs.toString();
    return get<{ success: boolean; records: EvidenceRecord[] }>(`/evidence/records${q ? "?" + q : ""}`);
  },

  getRecord: (id: string) =>
    get<{ success: boolean; record: EvidenceRecord }>(`/evidence/records/${encodeURIComponent(id)}`),

  createRecord: (data: {
    title: string;
    category: EvidenceCategory;
    sourcePath?: string;
    originalFilename?: string;
    fileHash?: string;
    tags?: string[];
    vendor?: string;
    manufacturer?: string;
    purchaseDate?: string;
    receiptDate?: string;
    warrantyExpires?: string;
    registrationDate?: string;
    expirationDate?: string;
    reminderDate?: string;
    privacyClassification?: PrivacyClassification;
    projectAssociation?: string;
    entityAssociation?: Record<string, string>;
    collectionId?: string;
  }) =>
    post<{ success: boolean; record: EvidenceRecord }>("/evidence/records", data),

  updateRecord: (id: string, data: Partial<EvidenceRecord>) =>
    patch<{ success: boolean; record: EvidenceRecord }>(`/evidence/records/${encodeURIComponent(id)}`, data),

  ingestRecord: (id: string, opts: { filePath?: string; content?: string; source?: string; collectionId?: string }) =>
    post<{ success: boolean; skipped: boolean; chunksAdded: number; chunksRemoved: number; sourceId?: string; collectionId: string }>(
      `/evidence/records/${encodeURIComponent(id)}/ingest`, opts,
    ),

  deleteRecord: (id: string) =>
    post<{ success: boolean; record: EvidenceRecord | null }>(`/evidence/records/${encodeURIComponent(id)}/delete`),

  getPaperlessStatus: () =>
    get<{ success: boolean; paperless: PaperlessProviderStatus }>("/evidence/paperless/status"),

  proposePaperlessSync: (mode?: string) =>
    post<{ success: boolean; proposalStatus: string; syncMode: string; message: string; approvalRequired: boolean; executed: false }>(
      "/evidence/paperless/sync", { mode: mode ?? "dry_run" },
    ),

  search: (query: string, category?: EvidenceCategory, topK?: number) =>
    post<{ success: boolean; chunks: RagChunk[]; usedCollectionIds: string[]; ragPath: string }>(
      "/evidence/search", { query, category, topK },
    ),

  getReminders: (lookaheadDays?: number) =>
    get<{ success: boolean; reminders: EvidenceReminderProposal[]; lookaheadDays: number; proposalOnly: boolean; calendarIntegrationStatus: string }>(
      `/evidence/reminders${lookaheadDays ? "?lookaheadDays=" + lookaheadDays : ""}`,
    ),

  getCategories: () =>
    get<{ success: boolean; categories: EvidenceCategory[] }>("/evidence/categories"),
};

// ── Phase 12B — IT Support Copilot ───────────────────────────────────────────

export type ItSupportWorkflowType =
  | "diagnose_windows_issue"
  | "summarize_event_logs"
  | "generate_powershell_script"
  | "onboarding_checklist"
  | "offboarding_checklist"
  | "fortinet_helper_notes"
  | "ivanti_deployment_script_helper"
  | "exchange_365_troubleshooting_checklist";

export type ItSupportExecutionMode = "review" | "dry_run" | "execute";

export interface ItSupportWorkflow {
  id: ItSupportWorkflowType;
  name: string;
  defaultMode: "review/dry_run";
  executionEnabled: false;
}

export interface ItSupportIntegration {
  id: string;
  name: string;
  status: "not_configured" | "degraded" | "disabled";
  reason: string;
}

export interface ItSupportSafetyContract {
  purpose: string;
  adminRequired: boolean;
  reads: string[];
  changes: string[];
  risks: string[];
  backupRestorePlan: string;
  loggingPath: string;
  dryRunBehavior: string;
  exitCodes: Array<{ code: number; meaning: string }>;
  proofSteps: string[];
}

export interface ItSupportArtifact {
  id: string;
  workflowType: ItSupportWorkflowType;
  status: "draft" | "review_required" | "approval_pending" | "blocked" | "not_configured";
  title: string;
  requestSummary: string;
  scriptLanguage?: "powershell";
  scriptBody: string;
  safetyContract: ItSupportSafetyContract;
  integrationStatus: ItSupportIntegration[];
  approvalId?: string;
  executionMode: ItSupportExecutionMode;
  commandPreview: string;
  outputPreview: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ItSupportActionResult {
  success: boolean;
  status: "draft" | "review" | "approval_required" | "blocked" | "not_configured";
  executed: false;
  message: string;
  artifact?: ItSupportArtifact;
  approvalRequired: boolean;
  approval?: ApprovalRequest;
  validation?: {
    valid: boolean;
    missingFields: string[];
    blocked: boolean;
    riskTier: PermissionTier;
    reasons: string[];
  };
}

export interface ItSupportStatus {
  success: boolean;
  sourceOfTruth: string;
  localFirst: true;
  cloudRequired: false;
  defaultMode: "review/dry_run";
  realExecutionEnabled: false;
  hardLimits: Record<string, boolean>;
  integrations: ItSupportIntegration[];
  workflows: ItSupportWorkflow[];
  counts: Array<{ status: string; count: number }>;
}

export const itSupportApi = {
  status: () =>
    get<ItSupportStatus>("/it-support/status"),
  workflows: () =>
    get<{ success: boolean; workflows: ItSupportWorkflow[] }>("/it-support/workflows"),
  integrations: () =>
    get<{ success: boolean; integrations: ItSupportIntegration[] }>("/it-support/integrations"),
  artifacts: (limit = 50) =>
    get<{ success: boolean; artifacts: ItSupportArtifact[] }>(`/it-support/artifacts?limit=${limit}`),
  createArtifact: (body: {
    workflowType: ItSupportWorkflowType;
    title?: string;
    request: string;
    metadata?: Record<string, unknown>;
  }) =>
    post<ItSupportActionResult>("/it-support/artifacts", body),
  validateScript: (id: string) =>
    post<ItSupportActionResult>(`/it-support/scripts/${encodeURIComponent(id)}/validate`),
  proposeScript: (id: string, mode: ItSupportExecutionMode = "dry_run", approvalId?: string) =>
    post<ItSupportActionResult>(`/it-support/scripts/${encodeURIComponent(id)}/execute`, { mode, approvalId }),
};

// ── Phase 12A — Business Modules ─────────────────────────────────────────────

export type BusinessModuleId =
  | "immediate-response-agency"
  | "customer-support-copilot"
  | "lead-generation"
  | "content-factory"
  | "it-support-copilot";

export type BusinessAdapterId =
  | "chatwoot"
  | "twenty-crm"
  | "cal-com"
  | "postiz"
  | "email"
  | "sms";

export interface BusinessModule {
  id: BusinessModuleId;
  name: string;
  status: "available";
  description: string;
  defaultAdapterIds: BusinessAdapterId[];
  capabilities: string[];
  hardLimits: {
    draftOnly: true;
    approvalRequiredForExternalActions: true;
    externalSendEnabled: false;
  };
}

export interface BusinessAdapterProfile {
  id: BusinessAdapterId;
  name: string;
  provider: string;
  status: "disabled" | "not_configured" | "configured" | "degraded";
  enabled: boolean;
  configured: boolean;
  reason: string;
  requiresApproval: true;
  externalCommunication: boolean;
  secretsConfigured: boolean;
  updatedAt: string;
}

export interface BusinessDraft {
  id: string;
  moduleId: BusinessModuleId;
  type: string;
  status: "draft" | "approval_pending" | "approved" | "blocked" | "sent" | "failed";
  adapterId?: BusinessAdapterId;
  inboundSummary: string;
  suggestedResponse: string;
  crmNote: string;
  calendarSlot?: Record<string, unknown>;
  approvalId?: string;
  source: string;
  privacy: {
    rawContentStored: false;
    privateContentLogged: false;
    redacted: boolean;
  };
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessStatus {
  success: boolean;
  sourceOfTruth: string;
  hardLimits: Record<string, boolean>;
  modules: BusinessModule[];
  adapters: BusinessAdapterProfile[];
  draftCounts: Record<string, number>;
  localFirst: true;
  externalActionsExecuted: false;
}

export interface BusinessActionResult {
  success: boolean;
  status: string;
  executed: false;
  message: string;
  draft?: BusinessDraft;
  adapter?: BusinessAdapterProfile;
  approvalRequired: boolean;
  approval?: ApprovalRequest;
}

export const businessApi = {
  status: () =>
    get<BusinessStatus>("/business/status"),
  modules: () =>
    get<{ success: boolean; modules: BusinessModule[] }>("/business/modules"),
  adapters: () =>
    get<{ success: boolean; adapters: BusinessAdapterProfile[] }>("/business/adapters"),
  updateAdapterProfile: (id: BusinessAdapterId, body: { enabled?: boolean; endpointUrl?: string; apiKeyRef?: string }) =>
    put<{ success: boolean; adapter: BusinessAdapterProfile; executed: false }>(
      `/business/adapters/${encodeURIComponent(id)}/profile`, body,
    ),
  syncAdapter: (id: BusinessAdapterId, approvalId?: string) =>
    post<BusinessActionResult>(`/business/adapters/${encodeURIComponent(id)}/sync`, { approvalId }),
  drafts: (limit = 100) =>
    get<{ success: boolean; drafts: BusinessDraft[] }>(`/business/drafts?limit=${limit}`),
  createDraft: (body: {
    moduleId: BusinessModuleId;
    type?: string;
    adapterId?: BusinessAdapterId;
    inboundText?: string;
    customerName?: string;
    source?: string;
    requestedAction?: string;
    metadata?: Record<string, unknown>;
  }) =>
    post<BusinessActionResult>("/business/drafts", body),
  proposeDraftSend: (id: string, approvalId?: string) =>
    post<BusinessActionResult>(`/business/drafts/${encodeURIComponent(id)}/propose-send`, { approvalId }),
};

// ── Patch helper (used by evidence update) ────────────────────────────────────

function patch<T>(path: string, body?: unknown): Promise<T> {
  return req<T>("PATCH", path, body);
}

// ---------------------------------------------------------------------------
// Local Builder — Phase 22
// ---------------------------------------------------------------------------

export type LocalBuilderModelRole = "fast_code" | "deep_code" | "reviewer" | "rag_embedding";
export type LocalBuilderModelStatus = "not_configured" | "configured" | "unavailable";
export type LocalBuilderEvalName = "repo_summary" | "safe_patch_plan" | "unsafe_action_detection" | "ledger_update";

export interface LocalBuilderModelProfile {
  role:              LocalBuilderModelRole;
  modelName:         string | null;
  status:            LocalBuilderModelStatus;
  unavailableReason?: string;
  updatedAt:         string;
}

export interface LocalBuilderStatus {
  localFirst:                true;
  cloudEscalationEnabled:    false;
  selfModificationAllowed:   false;
  requireApprovalForEdits:   true;
  profiles:                  LocalBuilderModelProfile[];
  contextPacksAvailable:     number;
  contextPackNames:          string[];
  evalHistoryCount:          number;
  readyForBuild:             boolean;
  notReadyReasons:           string[];
  checkedAt:                 string;
}

export interface ContextPackMeta {
  name:        string;
  title:       string;
  description: string;
  sizeBytes:   number;
  loadedAt:    string;
}

export interface ContextPack extends ContextPackMeta {
  content: string;
}

export interface BuildProposal {
  id:                       string;
  status:                   "proposed";
  phaseId:                  string;
  taskSummary:              string;
  contextPacksUsed:         string[];
  targetFiles:              string[];
  diffPreviewAvailable:     boolean;
  approvalRequired:         true;
  cloudEscalationEnabled:   false;
  selfModificationAllowed:  false;
  hardBlocked:              boolean;
  hardBlockReason?:         string;
  redactedPayload:          Record<string, unknown>;
  approval?:                ApprovalRequest;
  proposedAt:               string;
}

export interface LocalBuilderEvalResult {
  evalName:    LocalBuilderEvalName;
  passed:      boolean;
  score:       number;
  details:     string;
  usedNetwork: false;
  ranAt:       string;
}

export const localBuilderApi = {
  status: () =>
    get<{ success: boolean; status: LocalBuilderStatus }>("/intelligence/local-builder/status"),
  profiles: () =>
    get<{ success: boolean; profiles: LocalBuilderModelProfile[] }>("/intelligence/local-builder/profiles"),
  updateProfile: (role: LocalBuilderModelRole, body: { modelName?: string | null; status?: LocalBuilderModelStatus; unavailableReason?: string }) =>
    put<{ success: boolean; profile: LocalBuilderModelProfile }>(
      `/intelligence/local-builder/profiles/${encodeURIComponent(role)}`, body,
    ),
  contextPacks: () =>
    get<{ success: boolean; packs: ContextPackMeta[] }>("/intelligence/local-builder/context-packs"),
  contextPack: (name: string) =>
    get<{ success: boolean; pack: ContextPack }>(`/intelligence/local-builder/context-packs/${encodeURIComponent(name)}`),
  proposeBuild: (body: { phaseId: string; taskSummary: string; contextPacks: string[]; targetFiles?: string[]; workspacePath?: string }) =>
    post<{ success: boolean; proposal: BuildProposal }>("/intelligence/local-builder/build/propose", body),
  runEval: (evalName: LocalBuilderEvalName) =>
    post<{ success: boolean; result: LocalBuilderEvalResult }>("/intelligence/local-builder/eval/run", { evalName }),
  evalHistory: () =>
    get<{ success: boolean; history: LocalBuilderEvalResult[] }>("/intelligence/local-builder/eval/history"),
};

export default {
  health, kernel, models, modelsExtra, chat, observability, tasks, approvals,
  system, systemExtra, workspace, workspaceExtra, runtime, providerPolicy,
  studios, integrations, worldgui, remote, continueApi, context, intelligence,
  filebrowser, stack, repair, rollback, updater, usage, audit, settings,
  hardware, os, sessions, stt, tts, ragApi, webSearch,
  benchmarkApi, pinboard, tokenBudget, timeTravel, pluginsApi, tools, foundation,
  evidenceVaultApi, businessApi, itSupportApi, digitalTwinApi, inventoryApi,
  automotiveApi,
  recoveryApi,
  browserAutomationApi,
  desktopAutomationApi,
  codingAgentApi,
  voiceApi,
  screenContextApi,
  edgeNodesApi,
  homeAutopilotApi,
  homelabApi,
  localBuilderApi,
};
