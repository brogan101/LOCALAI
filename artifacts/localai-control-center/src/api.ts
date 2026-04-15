/**
 * LOCALAI CONTROL CENTER — API CLIENT
 * =====================================
 * Typed wrappers around every backend endpoint.
 * All requests are relative to /api so Vite's proxy works in dev
 * and the production build serves both from the same origin.
 */

const BASE = "/api";

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
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
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
  status: "queued" | "running" | "completed" | "failed";
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
  pull:          (modelName: string) => post<{ success: boolean; jobId: string }>("/models/pull", { modelName }),
  load:          (modelName: string) => post<{ success: boolean; message: string }>("/models/load", { modelName }),
  stop:          (modelName: string) => post<{ success: boolean; message: string }>("/models/stop", { modelName }),
  delete:        (modelName: string) => del<{ success: boolean; message: string }>(`/models/${encodeURIComponent(modelName)}/delete`),
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
};

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const tasks = {
  list: () => get<{ jobs: AsyncJob[] }>("/tasks"),
  get:  (id: string) => get<{ job: AsyncJob }>(`/tasks/${encodeURIComponent(id)}`),
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
}

export const system = {
  diagnostics:  () => get<{ items: DiagnosticItem[]; generatedAt: string; recommendations: string[] }>("/system/diagnostics"),
  heartbeat:    () => get<HeartbeatStatus>("/remote/heartbeat"),  // alias at /remote/heartbeat → /remote/network/status
  killSwitch:   () => post<{ success: boolean; message: string }>("/system/process/kill-switch"),
  cleanupScan:  () => get<{ artifacts: CleanupArtifact[]; totalFound: number; staleWrappers: number; obsoleteScripts: number; safeCount: number; spaceSavable: string; spaceSavableBytes: number }>("/system/cleanup/scan"),
  cleanupRun:   (artifactIds: string[]) => post<{ success: boolean; message: string; removedPaths: string[]; scheduledForReboot: string[]; skipped: Array<{ path: string; reason: string }> }>("/system/cleanup/execute", { artifactIds }),
  activity:     () => get<{ entries: ActivityEntry[]; total: number }>("/system/activity"),
  restart:      (reason?: string) => post<{ success: boolean; message: string }>("/system/sovereign/restart", { reason }),
  sovereignEdit: (filePath: string, newContent: string) =>
    post<{ success: boolean; filePath: string; diff: string; message: string }>("/system/sovereign/edit", { filePath, newContent }),
  sovereignPreview: (filePath: string, newContent: string) =>
    post<{ success: boolean; proposal: { filePath: string; diff: string } }>("/system/sovereign/preview", { filePath, newContent }),
  macros:       () => get<{ macros: unknown[] }>("/system/macros"),
  runMacro:     (name: string) => post<{ success: boolean; stepsExecuted: number; error?: string }>(`/system/macros/${encodeURIComponent(name)}/run`),
  windows:      (pattern?: string) => get<{ windows: unknown[] }>(`/system/windows${pattern ? `?pattern=${encodeURIComponent(pattern)}` : ""}`),

  // ── File Execution Agent ───────────────────────────────────────────────────
  execRun:      (command: string, cwd?: string, timeoutMs?: number) =>
    post<ExecRunResult>("/system/exec/run", { command, cwd, timeoutMs }),
  execFile:     (filePath: string, cwd?: string, timeoutMs?: number) =>
    post<ExecRunResult>("/system/exec/file", { filePath, cwd, timeoutMs }),
  execSelfHeal: (filePath: string, cwd?: string, maxAttempts?: number) =>
    post<SelfHealResult>("/system/exec/self-heal", { filePath, cwd, maxAttempts }),
  execDiagnose: (stderr: string, sourceCode?: string, filePath?: string) =>
    post<{ success: boolean; rootCause: string; explanation: string; suggestions: string[]; model: string }>(
      "/system/exec/diagnose", { stderr, sourceCode, filePath }),
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

// ── Studios ───────────────────────────────────────────────────────────────────

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
  },

  // ── Image Generation ───────────────────────────────────────────────────────
  imagegen: {
    status: () => get<ImageGenStatus>("/studios/imagegen/status"),
    expandPrompt: (prompt: string, style?: PromptArchitectResult["style"]) =>
      post<{ success: boolean; result: PromptArchitectResult }>("/studios/imagegen/expand-prompt", { prompt, style }),
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
};

// ── Models (additional endpoints) ────────────────────────────────────────────

// These extend the `models` namespace above with unwrapped backend routes.
export const modelsExtra = {
  discover:      () => get<{ cards: unknown[]; discoveredAt: string }>("/models/discover"),
  verify:        (modelName: string) =>
    get<{ success: boolean; verification: unknown }>(`/models/verify?modelName=${encodeURIComponent(modelName)}`),
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
    post<{ success: boolean; results: unknown[] }>("/system/setup/repair", { componentIds }),
  focusWindow:   (windowId: string) =>
    post<{ success: boolean }>("/system/windows/focus", { windowId }),
  registerMacro: (macro: unknown) => post<{ success: boolean }>("/system/macros", macro),
  updatesCheck:  () => get<{ updates: unknown[]; checkedAt: string }>("/system/updates/check"),
  updatesRun:    (components?: string[]) =>
    post<{ success: boolean; results: unknown[] }>("/system/updates/run", { components }),
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
  backup:          () => post<{ success: boolean; backupPath: string }>("/stack/backup"),
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
  component: string;
  action: string;
  status: string;
  message: string;
}

export const repair = {
  health:               () => get<RepairHealthResult>("/repair/health"),
  run:                  (componentIds: string[]) =>
    post<{ success: boolean; results: unknown[] }>("/repair/run", { componentIds }),
  log:                  () => get<{ entries: RepairLogEntry[] }>("/repair/log"),
  diagnoseIntegration:  (id: string) =>
    post<{ success: boolean; diagnosis: string }>(`/repair/diagnose-integration/${encodeURIComponent(id)}`),
  detectProjectContext: (projectPath: string) =>
    post<{ success: boolean; context: unknown }>("/repair/detect-project-context", { projectPath }),
  setupProjectAi:       (projectPath: string) =>
    post<{ success: boolean; message: string }>("/repair/setup-project-ai", { projectPath }),
};

// ── Rollback ──────────────────────────────────────────────────────────────────

export const rollback = {
  getBackup:   (filePath: string) =>
    get<{ backup: unknown }>(`/rollback/backup?filePath=${encodeURIComponent(filePath)}`),
  listBackups: (directoryPath: string) =>
    get<{ backups: unknown[] }>(`/rollback/backups?directoryPath=${encodeURIComponent(directoryPath)}`),
  rollback:    (filePath: string) =>
    post<{ success: boolean; backup: unknown }>("/rollback", { filePath }),
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
  check:             (modelNames?: string[]) =>
    post<{ success: boolean; results: unknown[] }>("/updater/check", { modelNames }),
  update:            (modelName: string) =>
    post<{ success: boolean; jobId: string }>("/updater/update", { modelName }),
  rollbackModel:     (modelName: string) =>
    post<{ success: boolean; message: string }>(`/updater/rollback/${encodeURIComponent(modelName)}`),
  modelStates:       () => get<{ states: Record<string, UpdaterModelState> }>("/updater/model-states"),
  updateModelState:  (modelName: string, state: Partial<UpdaterModelState>) =>
    req<{ success: boolean }>("PATCH", `/updater/model-states/${encodeURIComponent(modelName)}`, state),
  backupSettings:    () => post<{ success: boolean; backupPath: string }>("/updater/backup-settings"),
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

export const usage = {
  record:  (entry: UsageRecord) => post<{ success: boolean }>("/usage/record", entry),
  today:   () => get<unknown>("/usage/today"),
  history: (days?: number) =>
    get<unknown>(`/usage/history${days !== undefined ? `?days=${days}` : ""}`),
  estimate:() => get<unknown>("/usage/estimate"),
  purge:   (before?: string) =>
    del<{ success: boolean; removed: number }>(`/usage/purge${before ? `?before=${encodeURIComponent(before)}` : ""}`),
};

// ── Settings ──────────────────────────────────────────────────────────────────

export const settings = {
  get: () => get<{ settings: AppSettings }>("/settings"),
  set: (data: Partial<AppSettings>) => put<{ success: boolean; settings: AppSettings }>("/settings", data),
};

export default {
  health, kernel, models, modelsExtra, chat, observability, tasks,
  system, systemExtra, workspace, workspaceExtra,
  studios, integrations, remote, continueApi, context, intelligence,
  filebrowser, stack, repair, rollback, updater, usage, settings,
};
