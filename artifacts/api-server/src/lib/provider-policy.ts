import { randomUUID } from "crypto";
import {
  loadProviderPolicyConfig,
  saveProviderPolicyConfig,
  type ProviderConfigEntry,
  type ProviderKind,
  type ProviderPolicyConfig,
  type ProviderStatus,
} from "./secure-config.js";
import { thoughtLog } from "./thought-log.js";
import { recordAuditEvent } from "./platform-foundation.js";

export const DATA_CLASSIFICATIONS = [
  "public",
  "normal",
  "private",
  "sensitive",
  "secret",
  "credential",
  "private-file/RAG",
] as const;

export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

export interface ProviderDefinition {
  id: string;
  displayName: string;
  kind: ProviderKind;
  localFirst: boolean;
  requiresApiKey: boolean;
  dataLeavesMachine: boolean;
  defaultBaseUrl: string;
  statusWhenUnconfigured: ProviderStatus;
  notes: string;
}

export interface ProviderSummary extends ProviderDefinition {
  enabled: boolean;
  configured: boolean;
  firstUseApproved: boolean;
  allowPrivateFileData: boolean;
  baseUrl: string;
  model: string;
  apiKeySet: boolean;
  apiKeyPreview: string;
  status: ProviderStatus;
  costHintUsdPer1MTokens?: number;
}

export interface ProviderPolicySnapshot {
  success: true;
  defaultProviderId: string;
  localFirst: true;
  localOnlyByDefault: true;
  providers: ProviderSummary[];
  classifications: readonly DataClassification[];
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

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "ollama",
    displayName: "Ollama",
    kind: "local",
    localFirst: true,
    requiresApiKey: false,
    dataLeavesMachine: false,
    defaultBaseUrl: "http://127.0.0.1:11434",
    statusWhenUnconfigured: "available",
    notes: "Default local model runtime. No API key or cloud dependency.",
  },
  {
    id: "localai-gateway",
    displayName: "LOCALAI Gateway",
    kind: "local",
    localFirst: true,
    requiresApiKey: false,
    dataLeavesMachine: false,
    defaultBaseUrl: "http://127.0.0.1:3001/v1",
    statusWhenUnconfigured: "available",
    notes: "Existing OpenAI-compatible local endpoint exposed by this app.",
  },
  {
    id: "llama.cpp",
    displayName: "llama.cpp",
    kind: "local",
    localFirst: true,
    requiresApiKey: false,
    dataLeavesMachine: false,
    defaultBaseUrl: "",
    statusWhenUnconfigured: "not_configured",
    notes: "Optional local backend when a compatible server is configured.",
  },
  {
    id: "vllm",
    displayName: "vLLM",
    kind: "local",
    localFirst: true,
    requiresApiKey: false,
    dataLeavesMachine: false,
    defaultBaseUrl: "",
    statusWhenUnconfigured: "not_configured",
    notes: "Optional local or LAN backend; never auto-started by provider policy.",
  },
  {
    id: "sglang",
    displayName: "SGLang",
    kind: "local",
    localFirst: true,
    requiresApiKey: false,
    dataLeavesMachine: false,
    defaultBaseUrl: "",
    statusWhenUnconfigured: "not_configured",
    notes: "Optional local or LAN backend; never auto-started by provider policy.",
  },
  {
    id: "litellm",
    displayName: "LiteLLM",
    kind: "local",
    localFirst: true,
    requiresApiKey: false,
    dataLeavesMachine: false,
    defaultBaseUrl: "",
    statusWhenUnconfigured: "not_configured",
    notes: "Optional self-hosted gateway. Cloud forwarding remains governed by this policy.",
  },
  {
    id: "lm-studio",
    displayName: "LM Studio",
    kind: "local",
    localFirst: true,
    requiresApiKey: false,
    dataLeavesMachine: false,
    defaultBaseUrl: "http://127.0.0.1:1234/v1",
    statusWhenUnconfigured: "not_configured",
    notes: "Optional local OpenAI-compatible desktop backend; never required and never auto-started.",
  },
  {
    id: "openai-compatible",
    displayName: "OpenAI-compatible cloud",
    kind: "cloud",
    localFirst: false,
    requiresApiKey: true,
    dataLeavesMachine: true,
    defaultBaseUrl: "https://api.openai.com/v1",
    statusWhenUnconfigured: "not_configured",
    notes: "Optional only. Requires explicit configuration and approval before use.",
  },
  {
    id: "anthropic-compatible",
    displayName: "Anthropic-compatible cloud",
    kind: "cloud",
    localFirst: false,
    requiresApiKey: true,
    dataLeavesMachine: true,
    defaultBaseUrl: "https://api.anthropic.com",
    statusWhenUnconfigured: "not_configured",
    notes: "Optional only. Requires explicit configuration and approval before use.",
  },
  {
    id: "google-compatible",
    displayName: "Google-compatible cloud",
    kind: "cloud",
    localFirst: false,
    requiresApiKey: true,
    dataLeavesMachine: true,
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    statusWhenUnconfigured: "not_configured",
    notes: "Optional only. Requires explicit configuration and approval before use.",
  },
  {
    id: "openrouter-compatible",
    displayName: "OpenRouter-compatible cloud",
    kind: "cloud",
    localFirst: false,
    requiresApiKey: true,
    dataLeavesMachine: true,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    statusWhenUnconfigured: "not_configured",
    notes: "Optional only. Requires explicit configuration and approval before use.",
  },
  {
    id: "custom-base-url",
    displayName: "Custom OpenAI-compatible URL",
    kind: "cloud",
    localFirst: false,
    requiresApiKey: true,
    dataLeavesMachine: true,
    defaultBaseUrl: "",
    statusWhenUnconfigured: "not_configured",
    notes: "Optional custom provider. Treat non-loopback URLs as cloud/data-leaving.",
  },
];

const DEFINITION_BY_ID = new Map(PROVIDER_DEFINITIONS.map((provider) => [provider.id, provider]));

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeClassification(value: unknown): DataClassification {
  return DATA_CLASSIFICATIONS.includes(value as DataClassification)
    ? value as DataClassification
    : "normal";
}

function redactKey(apiKey: string): string {
  if (!apiKey) return "";
  if (apiKey.length <= 8) return "set";
  return `${apiKey.slice(0, 3)}...${apiKey.slice(-4)}`;
}

export function redactSecretsDeep(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/([A-Za-z0-9_\-]{8,})/g, (match) => {
      if (/^(http|https|localhost|localai|ollama)$/i.test(match)) return match;
      return match.length > 16 ? `${match.slice(0, 3)}...redacted` : match;
    });
  }
  if (Array.isArray(value)) return value.map(redactSecretsDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      /key|token|secret|credential/i.test(key) ? "[redacted]" : redactSecretsDeep(entry),
    ]));
  }
  return value;
}

function statusFor(definition: ProviderDefinition, config: ProviderConfigEntry): ProviderStatus {
  if (!config.enabled) return "disabled";
  if (definition.requiresApiKey && !config.apiKey) return "not_configured";
  if (!definition.defaultBaseUrl && !config.baseUrl) return "not_configured";
  return "available";
}

function summaryFor(definition: ProviderDefinition, config: ProviderConfigEntry): ProviderSummary {
  const baseUrl = config.baseUrl || definition.defaultBaseUrl;
  return {
    ...definition,
    enabled: config.enabled,
    configured: statusFor(definition, config) === "available",
    firstUseApproved: config.firstUseApproved,
    allowPrivateFileData: config.allowPrivateFileData,
    baseUrl,
    model: config.model,
    apiKeySet: !!config.apiKey,
    apiKeyPreview: redactKey(config.apiKey),
    status: statusFor(definition, config),
    costHintUsdPer1MTokens: config.costHintUsdPer1MTokens,
  };
}

export async function getProviderPolicySnapshot(): Promise<ProviderPolicySnapshot> {
  const config = await loadProviderPolicyConfig();
  return {
    success: true,
    defaultProviderId: config.defaultProviderId || "ollama",
    localFirst: true,
    localOnlyByDefault: true,
    providers: PROVIDER_DEFINITIONS.map((definition) => {
      const providerConfig = config.providers[definition.id] ?? {
        id: definition.id,
        enabled: definition.kind === "local" && definition.statusWhenUnconfigured === "available",
        baseUrl: definition.defaultBaseUrl,
        model: "",
        apiKey: "",
        firstUseApproved: definition.kind === "local",
        allowPrivateFileData: false,
        updatedAt: nowIso(),
      };
      return summaryFor(definition, providerConfig);
    }),
    classifications: DATA_CLASSIFICATIONS,
    rules: {
      cloudRequiresExplicitConfiguration: true,
      secretAndCredentialBlockedForCloud: true,
      privateFileRagBlockedForCloudByDefault: true,
      missingCloudProvidersDoNotBlockLocalMode: true,
    },
  };
}

export async function updateProviderConfig(
  providerId: string,
  patch: Partial<ProviderConfigEntry> & { makeDefault?: boolean },
): Promise<ProviderSummary> {
  const definition = DEFINITION_BY_ID.get(providerId);
  if (!definition) throw new Error(`Unknown provider: ${providerId}`);
  const current = await loadProviderPolicyConfig();
  const existing = current.providers[providerId] ?? {
    id: providerId,
    enabled: false,
    baseUrl: definition.defaultBaseUrl,
    model: "",
    apiKey: "",
    firstUseApproved: definition.kind === "local",
    allowPrivateFileData: false,
    updatedAt: nowIso(),
  };
  const nextEntry: ProviderConfigEntry = {
    ...existing,
    ...patch,
    id: providerId,
    baseUrl: typeof patch.baseUrl === "string" ? patch.baseUrl.trim() : existing.baseUrl,
    model: typeof patch.model === "string" ? patch.model.trim() : existing.model,
    apiKey: typeof patch.apiKey === "string" ? patch.apiKey : existing.apiKey,
    firstUseApproved: definition.kind === "local"
      ? true
      : typeof patch.firstUseApproved === "boolean" ? patch.firstUseApproved : existing.firstUseApproved,
    allowPrivateFileData: definition.kind === "local"
      ? true
      : typeof patch.allowPrivateFileData === "boolean" ? patch.allowPrivateFileData : existing.allowPrivateFileData,
    updatedAt: nowIso(),
  };
  if (!patch.apiKey && patch.apiKey !== "") nextEntry.apiKey = existing.apiKey;
  const nextPolicy: ProviderPolicyConfig = {
    ...current,
    defaultProviderId: patch.makeDefault && definition.kind === "local" ? providerId : current.defaultProviderId,
    providers: {
      ...current.providers,
      [providerId]: nextEntry,
    },
  };
  await saveProviderPolicyConfig(nextPolicy);
  const summary = summaryFor(definition, nextEntry);
  recordAuditEvent({
    eventType: "provider_policy",
    action: "provider-policy.update",
    target: providerId,
    metadata: redactSecretsDeep({
      enabled: summary.enabled,
      status: summary.status,
      kind: summary.kind,
      apiKeySet: summary.apiKeySet,
      firstUseApproved: summary.firstUseApproved,
      allowPrivateFileData: summary.allowPrivateFileData,
      makeDefault: !!patch.makeDefault,
    }) as Record<string, unknown>,
  });
  thoughtLog.publish({
    category: "config",
    title: "Provider Policy Updated",
    message: `${summary.displayName} is ${summary.status}`,
    metadata: {
      providerId,
      kind: summary.kind,
      status: summary.status,
      apiKeySet: summary.apiKeySet,
    },
  });
  return summary;
}

export async function evaluateProviderPolicy(args: {
  providerId?: string;
  dataClassification?: unknown;
  approvedForThisUse?: boolean;
  estimatedTokens?: number;
}): Promise<ProviderPolicyDecision> {
  const config = await loadProviderPolicyConfig();
  const providerId = args.providerId || config.defaultProviderId || "ollama";
  const definition = DEFINITION_BY_ID.get(providerId) ?? DEFINITION_BY_ID.get("ollama")!;
  const providerConfig = config.providers[definition.id] ?? {
    id: definition.id,
    enabled: definition.kind === "local",
    baseUrl: definition.defaultBaseUrl,
    model: "",
    apiKey: "",
    firstUseApproved: definition.kind === "local",
    allowPrivateFileData: false,
    updatedAt: nowIso(),
  };
  const classification = normalizeClassification(args.dataClassification);
  const status = statusFor(definition, providerConfig);

  if (definition.kind === "local") {
    return {
      allowed: true,
      providerId: definition.id,
      providerKind: "local",
      status,
      dataClassification: classification,
      dataLeavesMachine: false,
      reason: "Local provider path is allowed and remains the default.",
      requiresApproval: false,
      costEstimateUsd: 0,
    };
  }

  if (classification === "secret" || classification === "credential") {
    return blocked(definition, classification, "Secret and credential data may not be sent to cloud providers.");
  }
  if (classification === "private-file/RAG" && !providerConfig.allowPrivateFileData) {
    return blocked(definition, classification, "Private file/RAG context is blocked for cloud providers by default.");
  }
  if (status !== "available") {
    return blocked(definition, classification, `Provider is ${status}; LOCALAI remains in local-only mode.`);
  }
  if (!providerConfig.firstUseApproved || !args.approvedForThisUse) {
    return {
      allowed: false,
      providerId: definition.id,
      providerKind: "cloud",
      status: "blocked_by_policy",
      dataClassification: classification,
      dataLeavesMachine: true,
      reason: "Cloud provider use requires explicit user approval with provider/model/data awareness.",
      requiresApproval: true,
      costEstimateUsd: estimateCost(providerConfig, args.estimatedTokens),
    };
  }

  return {
    allowed: true,
    providerId: definition.id,
    providerKind: "cloud",
    status,
    dataClassification: classification,
    dataLeavesMachine: true,
    reason: "Cloud provider use allowed for this explicitly approved request.",
    requiresApproval: false,
    costEstimateUsd: estimateCost(providerConfig, args.estimatedTokens),
  };
}

export async function testProviderConnection(providerId: string): Promise<{
  success: true;
  providerId: string;
  status: ProviderStatus | "mock_configured";
  networkUsed: false;
  message: string;
}> {
  const snapshot = await getProviderPolicySnapshot();
  const provider = snapshot.providers.find((entry) => entry.id === providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  const status = provider.status === "available" ? "mock_configured" : provider.status;
  recordAuditEvent({
    eventType: "provider_policy",
    action: "provider-policy.test",
    target: providerId,
    metadata: { status, networkUsed: false, auditId: randomUUID() },
  });
  return {
    success: true,
    providerId,
    status,
    networkUsed: false,
    message: status === "mock_configured"
      ? "Configuration is present; no network call was made by this Phase 02 test."
      : `Provider is ${status}; no network call was made and local mode remains available.`,
  };
}

function blocked(
  definition: ProviderDefinition,
  classification: DataClassification,
  reason: string,
): ProviderPolicyDecision {
  return {
    allowed: false,
    providerId: definition.id,
    providerKind: definition.kind,
    status: "blocked_by_policy",
    dataClassification: classification,
    dataLeavesMachine: definition.dataLeavesMachine,
    reason,
    requiresApproval: definition.kind === "cloud",
    costEstimateUsd: null,
  };
}

function estimateCost(config: ProviderConfigEntry, estimatedTokens?: number): number | null {
  if (!estimatedTokens || !config.costHintUsdPer1MTokens) return null;
  return Number(((estimatedTokens / 1_000_000) * config.costHintUsdPer1MTokens).toFixed(6));
}
