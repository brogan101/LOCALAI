import { sqlite } from "../db/database.js";
import { getRunningGatewayModels, unloadOllamaModel } from "./model-orchestrator.js";
import { recordAuditEvent } from "./platform-foundation.js";
import { taskQueue, type AsyncJob } from "./task-queue.js";
import { thoughtLog } from "./thought-log.js";

export const RUNTIME_MODES = [
  "Lightweight",
  "Coding",
  "Vision",
  "Media",
  "Business",
  "Maker",
  "HomeLab",
  "HomeShop",
  "Gaming",
  "EmergencyStop",
] as const;

export type RuntimeMode = typeof RUNTIME_MODES[number];
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
  type: "model_unload" | "task_pause" | "task_cancel" | "service_stop" | "physical_disable" | "skipped";
  target: string;
  status: "success" | "failed" | "skipped";
  message: string;
}

export interface RuntimeModeState {
  mode: RuntimeMode;
  physicalActionsDisabled: boolean;
  servicePolicies: ServicePolicy[];
  updatedAt: string;
}

const MODE_KEY = "runtime.mode";
const PHYSICAL_DISABLED_KEY = "runtime.physicalActionsDisabled";
const HEAVY_RESOURCE_CLASSES = new Set<ResourceClass>(["heavy", "gpu", "physical"]);

const STARTUP_POLICIES: StartupPolicy[] = ["disabled", "manual", "on_demand", "mode_based"];
const RESOURCE_CLASSES: ResourceClass[] = ["light", "medium", "heavy", "gpu", "physical", "network"];
const EMERGENCY_BEHAVIORS: EmergencyStopBehavior[] = ["keep_running", "unload_models", "pause_tasks", "stop_managed", "disable"];

const ALL_MODES = [...RUNTIME_MODES];
const NON_GAMING_MODES = RUNTIME_MODES.filter(mode => mode !== "Gaming" && mode !== "EmergencyStop");

const DEFAULT_POLICIES: ServicePolicy[] = [
  {
    id: "localai-api",
    displayName: "LOCALAI API Server",
    startupPolicy: "manual",
    allowedModes: ALL_MODES,
    resourceClass: "light",
    healthCheck: "http://127.0.0.1:3001/api/health",
    emergencyStopBehavior: "keep_running",
    requiresApproval: false,
    updatedAt: "",
  },
  {
    id: "localai-control-center",
    displayName: "LOCALAI Control Center",
    startupPolicy: "manual",
    allowedModes: ALL_MODES,
    resourceClass: "light",
    healthCheck: "http://127.0.0.1:5173",
    emergencyStopBehavior: "keep_running",
    requiresApproval: false,
    updatedAt: "",
  },
  {
    id: "ollama-models",
    displayName: "Ollama Running Models",
    startupPolicy: "mode_based",
    allowedModes: NON_GAMING_MODES,
    resourceClass: "gpu",
    healthCheck: "http://127.0.0.1:11434/api/tags",
    emergencyStopBehavior: "unload_models",
    requiresApproval: true,
    updatedAt: "",
  },
  {
    id: "open-webui",
    displayName: "Open WebUI",
    startupPolicy: "manual",
    allowedModes: NON_GAMING_MODES,
    resourceClass: "medium",
    healthCheck: "http://127.0.0.1:8080",
    emergencyStopBehavior: "stop_managed",
    requiresApproval: true,
    updatedAt: "",
  },
  {
    id: "litellm",
    displayName: "LiteLLM Gateway",
    startupPolicy: "on_demand",
    allowedModes: NON_GAMING_MODES,
    resourceClass: "network",
    healthCheck: "http://127.0.0.1:4000/health",
    emergencyStopBehavior: "stop_managed",
    requiresApproval: true,
    updatedAt: "",
  },
  {
    id: "worldgui",
    displayName: "WorldGUI Desktop Automation",
    startupPolicy: "manual",
    allowedModes: ["Maker", "HomeShop"],
    resourceClass: "physical",
    healthCheck: "http://127.0.0.1:7681",
    emergencyStopBehavior: "disable",
    requiresApproval: true,
    updatedAt: "",
  },
  {
    id: "physical-actions",
    displayName: "Physical Action Execution",
    startupPolicy: "disabled",
    allowedModes: ["Maker", "HomeShop"],
    resourceClass: "physical",
    emergencyStopBehavior: "disable",
    requiresApproval: true,
    updatedAt: "",
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function readSetting<T>(key: string, fallback: T): T {
  const row = sqlite.prepare("SELECT value_json FROM app_settings WHERE key = ?").get(key) as { value_json?: string } | undefined;
  if (!row?.value_json) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

function writeSetting(key: string, value: unknown): void {
  sqlite.prepare(`
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), nowIso());
}

function isRuntimeMode(value: unknown): value is RuntimeMode {
  return typeof value === "string" && (RUNTIME_MODES as readonly string[]).includes(value);
}

export function assertRuntimeMode(value: unknown): RuntimeMode {
  if (!isRuntimeMode(value)) {
    throw new Error(`Invalid runtime mode. Expected one of: ${RUNTIME_MODES.join(", ")}`);
  }
  return value;
}

function parsePolicyRow(row: Record<string, unknown>): ServicePolicy {
  return {
    id:                    String(row["id"]),
    displayName:           String(row["display_name"]),
    startupPolicy:         row["startup_policy"] as StartupPolicy,
    allowedModes:          JSON.parse(String(row["allowed_modes_json"])) as RuntimeMode[],
    resourceClass:         row["resource_class"] as ResourceClass,
    healthCheck:           (row["health_check"] as string | null) ?? undefined,
    stopCommand:           (row["stop_command"] as string | null) ?? undefined,
    emergencyStopBehavior: row["emergency_stop_behavior"] as EmergencyStopBehavior,
    requiresApproval:      Boolean(row["requires_approval"]),
    updatedAt:             String(row["updated_at"]),
  };
}

function upsertPolicy(policy: ServicePolicy): void {
  sqlite.prepare(`
    INSERT INTO service_policies
      (id, display_name, startup_policy, allowed_modes_json, resource_class, health_check,
       stop_command, emergency_stop_behavior, requires_approval, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      startup_policy = excluded.startup_policy,
      allowed_modes_json = excluded.allowed_modes_json,
      resource_class = excluded.resource_class,
      health_check = excluded.health_check,
      stop_command = excluded.stop_command,
      emergency_stop_behavior = excluded.emergency_stop_behavior,
      requires_approval = excluded.requires_approval,
      updated_at = excluded.updated_at
  `).run(
    policy.id,
    policy.displayName,
    policy.startupPolicy,
    JSON.stringify(policy.allowedModes),
    policy.resourceClass,
    policy.healthCheck ?? null,
    policy.stopCommand ?? null,
    policy.emergencyStopBehavior,
    policy.requiresApproval ? 1 : 0,
    policy.updatedAt,
  );
}

export function seedRuntimePolicyDefaults(): void {
  const existing = sqlite.prepare("SELECT id FROM service_policies").all() as Array<{ id: string }>;
  const existingIds = new Set(existing.map(row => row.id));
  const timestamp = nowIso();
  for (const policy of DEFAULT_POLICIES) {
    if (existingIds.has(policy.id)) continue;
    upsertPolicy({ ...policy, updatedAt: timestamp });
  }
  if (!readSetting<RuntimeMode | null>(MODE_KEY, null)) writeSetting(MODE_KEY, "Lightweight");
  if (readSetting<boolean | null>(PHYSICAL_DISABLED_KEY, null) === null) writeSetting(PHYSICAL_DISABLED_KEY, false);
}

export function getCurrentRuntimeMode(): RuntimeMode {
  const stored = readSetting<unknown>(MODE_KEY, "Lightweight");
  return isRuntimeMode(stored) ? stored : "Lightweight";
}

export function arePhysicalActionsDisabled(): boolean {
  return getCurrentRuntimeMode() === "EmergencyStop" || readSetting<boolean>(PHYSICAL_DISABLED_KEY, false) === true;
}

export function getServicePolicies(): ServicePolicy[] {
  seedRuntimePolicyDefaults();
  const rows = sqlite.prepare(`
    SELECT id, display_name, startup_policy, allowed_modes_json, resource_class, health_check,
           stop_command, emergency_stop_behavior, requires_approval, updated_at
    FROM service_policies
    ORDER BY display_name ASC
  `).all() as Array<Record<string, unknown>>;
  return rows.map(parsePolicyRow);
}

export function getRuntimeModeState(): RuntimeModeState {
  seedRuntimePolicyDefaults();
  return {
    mode: getCurrentRuntimeMode(),
    physicalActionsDisabled: arePhysicalActionsDisabled(),
    servicePolicies: getServicePolicies(),
    updatedAt: nowIso(),
  };
}

function validatePolicyUpdate(existing: ServicePolicy, update: Partial<ServicePolicy>): ServicePolicy {
  const next: ServicePolicy = {
    ...existing,
    ...update,
    id: existing.id,
    displayName: typeof update.displayName === "string" && update.displayName.trim() ? update.displayName.trim() : existing.displayName,
    updatedAt: nowIso(),
  };
  if (!STARTUP_POLICIES.includes(next.startupPolicy)) throw new Error(`Invalid startupPolicy: ${next.startupPolicy}`);
  if (!RESOURCE_CLASSES.includes(next.resourceClass)) throw new Error(`Invalid resourceClass: ${next.resourceClass}`);
  if (!EMERGENCY_BEHAVIORS.includes(next.emergencyStopBehavior)) throw new Error(`Invalid emergencyStopBehavior: ${next.emergencyStopBehavior}`);
  if (!Array.isArray(next.allowedModes) || next.allowedModes.length === 0) throw new Error("allowedModes must include at least one runtime mode");
  for (const mode of next.allowedModes) assertRuntimeMode(mode);
  next.healthCheck = typeof next.healthCheck === "string" && next.healthCheck.trim() ? next.healthCheck.trim() : undefined;
  next.stopCommand = typeof next.stopCommand === "string" && next.stopCommand.trim() ? next.stopCommand.trim() : undefined;
  next.requiresApproval = Boolean(next.requiresApproval);
  return next;
}

export function updateServicePolicy(id: string, update: Partial<ServicePolicy>): ServicePolicy {
  seedRuntimePolicyDefaults();
  const existing = getServicePolicies().find(policy => policy.id === id);
  if (!existing) throw new Error(`Unknown service policy: ${id}`);
  const next = validatePolicyUpdate(existing, update);
  upsertPolicy(next);
  recordAuditEvent({
    eventType: "runtime_mode",
    action: "service_policy_update",
    target: id,
    metadata: { startupPolicy: next.startupPolicy, resourceClass: next.resourceClass, allowedModes: next.allowedModes },
  });
  thoughtLog.publish({
    category: "system",
    title:    "Service Policy Updated",
    message:  `${next.displayName} policy changed to ${next.startupPolicy}`,
    metadata: { id, resourceClass: next.resourceClass },
  });
  return next;
}

function isHeavyJob(job: AsyncJob): boolean {
  const resourceClass = typeof job.metadata?.["resourceClass"] === "string"
    ? job.metadata["resourceClass"] as ResourceClass
    : undefined;
  const type = job.type.toLowerCase();
  const capability = (job.capability ?? "").toLowerCase();
  return Boolean(
    resourceClass && HEAVY_RESOURCE_CLASSES.has(resourceClass)
    || /model|vision|media|benchmark|index|rag|gpu|download|pull/.test(type)
    || /model|vision|media|benchmark|rag|gpu/.test(capability),
  );
}

async function unloadRunningModels(reason: string): Promise<RuntimeAction[]> {
  const actions: RuntimeAction[] = [];
  const running = await getRunningGatewayModels();
  if (!running.ollamaReachable) {
    actions.push({ type: "skipped", target: "ollama-models", status: "skipped", message: "Ollama is not reachable; no model unload required." });
    return actions;
  }
  for (const model of running.models) {
    try {
      await unloadOllamaModel(model.name);
      actions.push({ type: "model_unload", target: model.name, status: "success", message: reason });
    } catch (error) {
      actions.push({
        type: "model_unload",
        target: model.name,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (running.models.length === 0) {
    actions.push({ type: "skipped", target: "ollama-models", status: "skipped", message: "No running models were reported." });
  }
  return actions;
}

async function applyGamingMode(): Promise<RuntimeAction[]> {
  const actions: RuntimeAction[] = [];
  actions.push(...await unloadRunningModels("Gaming mode unloaded running model to preserve VRAM."));
  const paused = taskQueue.pauseQueuedJobs(isHeavyJob, "Paused by Gaming runtime mode");
  actions.push(...paused.map(job => ({ type: "task_pause" as const, target: job.id, status: "success" as const, message: job.message })));
  if (paused.length === 0) {
    actions.push({ type: "skipped", target: "heavy-queued-tasks", status: "skipped", message: "No heavy queued tasks were present." });
  }
  return actions;
}

export async function setRuntimeMode(modeInput: unknown, reason = "Runtime mode changed"): Promise<{ state: RuntimeModeState; actions: RuntimeAction[] }> {
  seedRuntimePolicyDefaults();
  const mode = assertRuntimeMode(modeInput);
  writeSetting(MODE_KEY, mode);
  if (mode !== "EmergencyStop") writeSetting(PHYSICAL_DISABLED_KEY, false);

  const actions = mode === "Gaming"
    ? await applyGamingMode()
    : mode === "EmergencyStop"
      ? await performEmergencyStop(reason)
      : [];

  recordAuditEvent({
    eventType: "runtime_mode",
    action: "set_runtime_mode",
    target: mode,
    metadata: { reason, actions },
  });
  thoughtLog.publish({
    category: "system",
    title:    "Runtime Mode Changed",
    message:  `Runtime mode set to ${mode}`,
    metadata: { mode, reason, actions },
  });
  return { state: getRuntimeModeState(), actions };
}

export async function performEmergencyStop(reason = "Emergency Stop requested"): Promise<RuntimeAction[]> {
  seedRuntimePolicyDefaults();
  writeSetting(MODE_KEY, "EmergencyStop");
  writeSetting(PHYSICAL_DISABLED_KEY, true);

  const actions: RuntimeAction[] = [
    { type: "physical_disable", target: "physical-actions", status: "success", message: "Physical action execution disabled." },
  ];
  actions.push(...await unloadRunningModels("Emergency Stop unloaded running model."));

  const cancelled = taskQueue.cancelQueuedJobs("Cancelled by Emergency Stop");
  actions.push(...cancelled.map(job => ({ type: "task_cancel" as const, target: job.id, status: "success" as const, message: job.message })));
  if (cancelled.length === 0) {
    actions.push({ type: "skipped", target: "queued-tasks", status: "skipped", message: "No queued tasks were present." });
  }

  for (const policy of getServicePolicies()) {
    if (policy.emergencyStopBehavior !== "stop_managed") continue;
    if (policy.stopCommand) {
      actions.push({
        type: "service_stop",
        target: policy.id,
        status: "skipped",
        message: "Managed stop command is recorded but not auto-executed without an explicit service-specific adapter.",
      });
    } else {
      actions.push({ type: "skipped", target: policy.id, status: "skipped", message: "No safe managed stop command configured." });
    }
  }

  recordAuditEvent({
    eventType: "runtime_mode",
    action: "emergency_stop",
    target: "runtime",
    metadata: { reason, actions },
  });
  thoughtLog.publish({
    level:    "warning",
    category: "security",
    title:    "Emergency Stop Activated",
    message:  reason,
    metadata: { actions },
  });
  return actions;
}

export function assertPhysicalActionsAllowed(action: string): { allowed: true } | { allowed: false; status: number; payload: Record<string, unknown> } {
  if (!arePhysicalActionsDisabled()) return { allowed: true };
  const message = `Physical action "${action}" blocked because Emergency Stop is active.`;
  recordAuditEvent({
    eventType: "runtime_mode",
    action: "physical_action_blocked",
    target: action,
    result: "blocked",
    metadata: { mode: getCurrentRuntimeMode() },
  });
  thoughtLog.publish({
    level:    "warning",
    category: "security",
    title:    "Physical Action Blocked",
    message,
    metadata: { action },
  });
  return {
    allowed: false,
    status: 423,
    payload: { success: false, blocked: true, mode: "EmergencyStop", message },
  };
}

export function modelWarmupsAllowed(): boolean {
  const mode = getCurrentRuntimeMode();
  return mode !== "Gaming" && mode !== "EmergencyStop";
}
