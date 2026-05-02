import { createHash, randomUUID } from "crypto";
import { sqlite } from "../db/database.js";
import { createApprovalRequest, verifyApprovedRequest, type ApprovalRequest } from "./approval-queue.js";
import { recordAuditEvent, seedFoundationDefaults, upsertPluginState } from "./platform-foundation.js";
import { redactForMissionReplay } from "./mission-replay.js";
import { thoughtLog } from "./thought-log.js";

export const BUSINESS_MODULES_SOURCE_OF_TRUTH =
  "Phase 12A business-modules.ts backed by SQLite business_drafts, plugin_state business adapter profiles, approval_requests, durable_jobs, audit_events, mission replay redaction, and existing integration/tool safety gates.";

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

export type BusinessAdapterStatus = "disabled" | "not_configured" | "configured" | "degraded";
export type BusinessDraftStatus = "draft" | "approval_pending" | "approved" | "blocked" | "sent" | "failed";
export type BusinessDraftType = "response" | "lead" | "content" | "support" | "crm_note" | "calendar";

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
  status: BusinessAdapterStatus;
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
  type: BusinessDraftType;
  status: BusinessDraftStatus;
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

export interface CreateBusinessDraftInput {
  moduleId: BusinessModuleId;
  type?: BusinessDraftType;
  adapterId?: BusinessAdapterId;
  inboundText?: string;
  customerName?: string;
  source?: string;
  requestedAction?: string;
  metadata?: Record<string, unknown>;
}

export interface BusinessActionResult {
  success: boolean;
  status: "draft" | "approval_required" | "not_configured" | "disabled" | "blocked";
  executed: false;
  message: string;
  draft?: BusinessDraft;
  adapter?: BusinessAdapterProfile;
  approvalRequired: boolean;
  approval?: ApprovalRequest;
}

export const BUSINESS_HARD_LIMITS = {
  stealthBotsAllowed: false,
  spamBlastingAllowed: false,
  antiBotEvasionAllowed: false,
  externalSendWithoutApprovalAllowed: false,
  defaultLocalFirstNoCost: true,
} as const;

export const BUSINESS_MODULES: BusinessModule[] = [
  {
    id: "immediate-response-agency",
    name: "Immediate Response Agency",
    status: "available",
    description: "Draft-first triage, reply, note, and handoff proposals.",
    defaultAdapterIds: ["chatwoot", "email", "sms", "twenty-crm"],
    capabilities: ["inbound_summary", "suggested_response", "crm_note_proposal"],
    hardLimits: { draftOnly: true, approvalRequiredForExternalActions: true, externalSendEnabled: false },
  },
  {
    id: "customer-support-copilot",
    name: "Customer Support Copilot",
    status: "available",
    description: "Support reply drafts and case note proposals.",
    defaultAdapterIds: ["chatwoot", "twenty-crm"],
    capabilities: ["support_reply", "crm_note_proposal", "escalation_summary"],
    hardLimits: { draftOnly: true, approvalRequiredForExternalActions: true, externalSendEnabled: false },
  },
  {
    id: "lead-generation",
    name: "Lead Generation",
    status: "available",
    description: "Lead research summaries and outreach drafts requiring approval.",
    defaultAdapterIds: ["twenty-crm", "email", "sms"],
    capabilities: ["lead_summary", "outreach_draft", "crm_note_proposal"],
    hardLimits: { draftOnly: true, approvalRequiredForExternalActions: true, externalSendEnabled: false },
  },
  {
    id: "content-factory",
    name: "Content Factory",
    status: "available",
    description: "Content calendar and post copy proposals.",
    defaultAdapterIds: ["postiz"],
    capabilities: ["content_draft", "post_schedule_proposal"],
    hardLimits: { draftOnly: true, approvalRequiredForExternalActions: true, externalSendEnabled: false },
  },
  {
    id: "it-support-copilot",
    name: "IT Support Copilot",
    status: "available",
    description: "Ticket summaries and safe support drafts only; script execution belongs to Phase 12B.",
    defaultAdapterIds: ["chatwoot", "twenty-crm"],
    capabilities: ["ticket_summary", "safe_response_draft"],
    hardLimits: { draftOnly: true, approvalRequiredForExternalActions: true, externalSendEnabled: false },
  },
];

const ADAPTER_DEFAULTS: Array<Omit<BusinessAdapterProfile, "status" | "enabled" | "configured" | "reason" | "secretsConfigured" | "updatedAt">> = [
  { id: "chatwoot", name: "Chatwoot", provider: "chatwoot", requiresApproval: true, externalCommunication: true },
  { id: "twenty-crm", name: "Twenty CRM", provider: "twenty", requiresApproval: true, externalCommunication: true },
  { id: "cal-com", name: "Cal.com / Cal.diy", provider: "cal", requiresApproval: true, externalCommunication: true },
  { id: "postiz", name: "Postiz", provider: "postiz", requiresApproval: true, externalCommunication: true },
  { id: "email", name: "Email", provider: "smtp/imap", requiresApproval: true, externalCommunication: true },
  { id: "sms", name: "SMS", provider: "sms-gateway", requiresApproval: true, externalCommunication: true },
];

let schemaEnsured = false;

function nowIso(): string {
  return new Date().toISOString();
}

function ensureBusinessSchema(): void {
  if (schemaEnsured) return;
  seedFoundationDefaults();
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS business_drafts (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      adapter_id TEXT,
      inbound_summary TEXT NOT NULL DEFAULT '',
      suggested_response TEXT NOT NULL DEFAULT '',
      crm_note TEXT NOT NULL DEFAULT '',
      calendar_slot_json TEXT NOT NULL DEFAULT '{}',
      approval_id TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      privacy_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_business_drafts_status
      ON business_drafts(status, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_business_drafts_module
      ON business_drafts(module_id, created_at DESC);
  `);
  schemaEnsured = true;
}

function parseJson(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function textHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function scrubText(value: string, maxChars = 320): { text: string; redacted: boolean } {
  const trimmed = value.replace(/\s+/g, " ").trim();
  const replay = redactForMissionReplay(trimmed, "body");
  const base = typeof replay.value === "string" ? replay.value : "[redacted]";
  const secretRedacted = replay.redacted || base.includes("[redacted:");
  const piiRedacted = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/i.test(base);
  const withoutPii = base
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[redacted-phone]");
  const truncated = withoutPii.length > maxChars ? `${withoutPii.slice(0, maxChars)}...` : withoutPii;
  return { text: truncated || "No inbound content provided.", redacted: secretRedacted || piiRedacted || withoutPii !== trimmed };
}

function assertModule(id: string): BusinessModuleId {
  if (BUSINESS_MODULES.some(module => module.id === id)) return id as BusinessModuleId;
  throw new Error(`Unknown business module: ${id}`);
}

function assertAdapter(id: string | undefined, moduleId: BusinessModuleId): BusinessAdapterId {
  if (id && ADAPTER_DEFAULTS.some(adapter => adapter.id === id)) return id as BusinessAdapterId;
  return BUSINESS_MODULES.find(module => module.id === moduleId)?.defaultAdapterIds[0] ?? "email";
}

function defaultType(moduleId: BusinessModuleId): BusinessDraftType {
  if (moduleId === "lead-generation") return "lead";
  if (moduleId === "content-factory") return "content";
  if (moduleId === "customer-support-copilot" || moduleId === "it-support-copilot") return "support";
  return "response";
}

function rowToDraft(row: Record<string, unknown>): BusinessDraft {
  return {
    id: row["id"] as string,
    moduleId: row["module_id"] as BusinessModuleId,
    type: row["type"] as BusinessDraftType,
    status: row["status"] as BusinessDraftStatus,
    adapterId: (row["adapter_id"] as BusinessAdapterId | null) ?? undefined,
    inboundSummary: row["inbound_summary"] as string,
    suggestedResponse: row["suggested_response"] as string,
    crmNote: row["crm_note"] as string,
    calendarSlot: parseJson(row["calendar_slot_json"]),
    approvalId: (row["approval_id"] as string | null) ?? undefined,
    source: row["source"] as string,
    privacy: parseJson(row["privacy_json"]) as BusinessDraft["privacy"],
    metadata: parseJson(row["metadata_json"]),
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

function approvalPayloadForDraft(draft: Pick<BusinessDraft, "id" | "moduleId" | "type" | "adapterId" | "source" | "metadata">): Record<string, unknown> {
  return {
    traceId: `business:${draft.id}`,
    draftId: draft.id,
    moduleId: draft.moduleId,
    type: draft.type,
    adapterId: draft.adapterId,
    source: draft.source,
    payloadPolicy: "redacted_preview_only",
    externalExecution: false,
    metadata: {
      contentHash: draft.metadata["contentHash"],
      inboundLength: draft.metadata["inboundLength"],
      piiOrSecretRedacted: draft.metadata["piiOrSecretRedacted"],
    },
  };
}

function createExternalApproval(draft: BusinessDraft, action = "business.external.send"): ApprovalRequest {
  return createApprovalRequest({
    type: "business_external_action",
    title: `Approve ${draft.type} draft for ${draft.adapterId ?? "business adapter"}`,
    summary: `${draft.moduleId} prepared a draft. External send/update remains blocked until the adapter is configured.`,
    riskTier: "tier4_external_communication",
    requestedAction: action,
    payload: approvalPayloadForDraft(draft),
  });
}

function updateDraftApproval(id: string, approvalId: string, status: BusinessDraftStatus): BusinessDraft {
  ensureBusinessSchema();
  const timestamp = nowIso();
  sqlite.prepare(`
    UPDATE business_drafts
    SET approval_id = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(approvalId, status, timestamp, id);
  const draft = getBusinessDraft(id);
  if (!draft) throw new Error(`Business draft not found after approval update: ${id}`);
  return draft;
}

export function listBusinessModules(): BusinessModule[] {
  return BUSINESS_MODULES;
}

export function listBusinessAdapters(): BusinessAdapterProfile[] {
  ensureBusinessSchema();
  const timestamp = nowIso();
  return ADAPTER_DEFAULTS.map(adapter => {
    const row = sqlite.prepare("SELECT state_json AS stateJson FROM plugin_state WHERE id = ?")
      .get(`business-adapter:${adapter.id}`) as { stateJson?: string } | undefined;
    const saved = parseJson(row?.stateJson);
    const hasEndpoint = typeof saved["endpointUrl"] === "string" && !!String(saved["endpointUrl"]).trim();
    const hasSecret = saved["secretConfigured"] === true || typeof saved["apiKeyRef"] === "string";
    const enabled = saved["enabled"] === true;
    const configured = enabled && hasEndpoint && hasSecret;
    const status: BusinessAdapterStatus = configured ? "configured" : enabled ? "not_configured" : "disabled";
    const profile: BusinessAdapterProfile = {
      ...adapter,
      enabled,
      configured,
      status,
      secretsConfigured: hasSecret,
      reason: configured
        ? "Configured profile exists, but Phase 12A still requires approval before any external action."
        : enabled
          ? "Adapter is enabled but missing endpoint and/or secret reference."
          : "Adapter is disabled by default and not configured.",
      updatedAt: typeof saved["updatedAt"] === "string" ? saved["updatedAt"] as string : timestamp,
    };
    return profile;
  });
}

export function saveBusinessAdapterProfile(id: BusinessAdapterId, input: Record<string, unknown>): BusinessAdapterProfile {
  ensureBusinessSchema();
  const endpointUrl = typeof input["endpointUrl"] === "string" ? String(input["endpointUrl"]).trim() : "";
  const apiKeyRef = typeof input["apiKeyRef"] === "string" ? String(input["apiKeyRef"]).trim() : "";
  const enabled = input["enabled"] === true;
  upsertPluginState(`business-adapter:${id}`, {
    enabled,
    endpointUrl,
    apiKeyRef: apiKeyRef ? "[configured-secret-ref]" : "",
    secretConfigured: !!apiKeyRef,
    updatedAt: nowIso(),
  });
  recordAuditEvent({
    eventType: "business_adapter",
    action: "profile_update",
    target: id,
    metadata: { enabled, endpointConfigured: !!endpointUrl, secretConfigured: !!apiKeyRef },
  });
  return listBusinessAdapters().find(adapter => adapter.id === id)!;
}

export function getBusinessStatus(): Record<string, unknown> {
  ensureBusinessSchema();
  const draftCounts = sqlite.prepare(`
    SELECT status, COUNT(*) AS count
    FROM business_drafts
    GROUP BY status
  `).all() as Array<{ status: string; count: number }>;
  return {
    success: true,
    sourceOfTruth: BUSINESS_MODULES_SOURCE_OF_TRUTH,
    hardLimits: BUSINESS_HARD_LIMITS,
    modules: listBusinessModules(),
    adapters: listBusinessAdapters(),
    draftCounts: Object.fromEntries(draftCounts.map(row => [row.status, row.count])),
    localFirst: true,
    externalActionsExecuted: false,
  };
}

export function listBusinessDrafts(limit = 100): BusinessDraft[] {
  ensureBusinessSchema();
  return (sqlite.prepare(`
    SELECT *
    FROM business_drafts
    ORDER BY created_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(limit, 500))) as Array<Record<string, unknown>>).map(rowToDraft);
}

export function getBusinessDraft(id: string): BusinessDraft | null {
  ensureBusinessSchema();
  const row = sqlite.prepare("SELECT * FROM business_drafts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToDraft(row) : null;
}

export function createBusinessDraft(input: CreateBusinessDraftInput): BusinessActionResult {
  ensureBusinessSchema();
  const moduleId = assertModule(input.moduleId);
  const adapterId = assertAdapter(input.adapterId, moduleId);
  const type = input.type ?? defaultType(moduleId);
  const raw = input.inboundText ?? "";
  const scrubbed = scrubText(raw);
  const timestamp = nowIso();
  const id = randomUUID();
  const inboundSummary = scrubbed.text;
  const suggestedResponse = `Draft response for ${input.customerName?.trim() || "the contact"}: ${inboundSummary}`;
  const crmNote = `CRM note proposal: ${inboundSummary}`;
  const calendarSlot = moduleId === "immediate-response-agency" || moduleId === "lead-generation"
    ? { status: "proposal", page: "unavailable", section: "unavailable", line: "unavailable" }
    : {};
  const metadata: Record<string, unknown> = {
    ...(input.metadata ?? {}),
    contentHash: textHash(raw),
    inboundLength: raw.length,
    piiOrSecretRedacted: scrubbed.redacted,
    requestedAction: input.requestedAction ?? "draft_only",
  };
  const privacy: BusinessDraft["privacy"] = {
    rawContentStored: false,
    privateContentLogged: false,
    redacted: scrubbed.redacted,
  };

  sqlite.prepare(`
    INSERT INTO business_drafts
      (id, module_id, type, status, adapter_id, inbound_summary, suggested_response, crm_note,
       calendar_slot_json, approval_id, source, privacy_json, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
  `).run(
    id,
    moduleId,
    type,
    adapterId,
    inboundSummary,
    suggestedResponse,
    crmNote,
    JSON.stringify(calendarSlot),
    input.source ?? "manual",
    JSON.stringify(privacy),
    JSON.stringify(metadata),
    timestamp,
    timestamp,
  );

  let draft = getBusinessDraft(id)!;
  let approval: ApprovalRequest | undefined;
  if (moduleId === "lead-generation") {
    approval = createExternalApproval(draft, "business.lead.approve_draft");
    draft = updateDraftApproval(id, approval.id, "approval_pending");
  }

  recordAuditEvent({
    eventType: "business_draft",
    action: "create",
    target: id,
    metadata: {
      traceId: `business:${id}`,
      moduleId,
      type,
      adapterId,
      status: draft.status,
      contentHash: metadata["contentHash"],
      inboundLength: metadata["inboundLength"],
      redacted: scrubbed.redacted,
      rawContentStored: false,
      externalExecuted: false,
    },
  });
  thoughtLog.publish({
    category: "system",
    title: "Business Draft Created",
    message: `${moduleId} created ${type} draft ${id}`,
    metadata: { draftId: id, moduleId, type, adapterId, rawContentStored: false, redacted: scrubbed.redacted },
  });

  return {
    success: true,
    status: "draft",
    executed: false,
    message: approval ? "Draft created and approval item opened." : "Draft created. No external action executed.",
    draft,
    approvalRequired: !!approval,
    approval,
  };
}

export function proposeBusinessDraftSend(draftId: string, approvalId?: string): BusinessActionResult {
  ensureBusinessSchema();
  const draft = getBusinessDraft(draftId);
  if (!draft) {
    return { success: false, status: "blocked", executed: false, message: "Draft not found.", approvalRequired: true };
  }
  const adapter = listBusinessAdapters().find(item => item.id === draft.adapterId);
  if (!approvalId) {
    const approval = createExternalApproval(draft);
    const nextDraft = updateDraftApproval(draft.id, approval.id, "approval_pending");
    return {
      success: false,
      status: "approval_required",
      executed: false,
      message: "Human approval is required before any external business action.",
      draft: nextDraft,
      adapter,
      approvalRequired: true,
      approval,
    };
  }
  const verification = verifyApprovedRequest(approvalId, approvalPayloadForDraft(draft), "business_external_action");
  if (!verification.allowed) {
    recordAuditEvent({
      eventType: "business_draft",
      action: "send_blocked",
      target: draft.id,
      result: "blocked",
      metadata: { traceId: `business:${draft.id}`, reason: verification.message, executed: false },
    });
    return {
      success: false,
      status: "blocked",
      executed: false,
      message: verification.message,
      draft,
      adapter,
      approvalRequired: true,
      approval: verification.approval,
    };
  }
  if (!adapter || adapter.status !== "configured") {
    recordAuditEvent({
      eventType: "business_draft",
      action: "send_not_configured",
      target: draft.id,
      result: "blocked",
      metadata: { traceId: `business:${draft.id}`, adapterId: draft.adapterId, adapterStatus: adapter?.status ?? "not_configured", executed: false },
    });
    return {
      success: false,
      status: adapter?.status === "disabled" ? "disabled" : "not_configured",
      executed: false,
      message: "Adapter is disabled/not_configured; no external send or sync was attempted.",
      draft,
      adapter,
      approvalRequired: true,
      approval: verification.approval,
    };
  }
  return {
    success: false,
    status: "not_configured",
    executed: false,
    message: "Phase 12A is draft/approval only. External execution adapter follow-through is not enabled.",
    draft,
    adapter,
    approvalRequired: true,
    approval: verification.approval,
  };
}

export function syncBusinessAdapter(adapterId: BusinessAdapterId, approvalId?: string): BusinessActionResult {
  ensureBusinessSchema();
  const adapter = listBusinessAdapters().find(item => item.id === adapterId);
  if (!adapter || adapter.status !== "configured") {
    recordAuditEvent({
      eventType: "business_adapter",
      action: "sync_not_configured",
      target: adapterId,
      result: "blocked",
      metadata: { adapterStatus: adapter?.status ?? "not_configured", approvalProvided: !!approvalId, executed: false },
    });
    return {
      success: false,
      status: adapter?.status === "disabled" ? "disabled" : "not_configured",
      executed: false,
      message: "Adapter is disabled/not_configured; sync was not attempted.",
      adapter,
      approvalRequired: true,
    };
  }
  return {
    success: false,
    status: "not_configured",
    executed: false,
    message: "Phase 12A does not execute adapter syncs. A later approved workflow must implement provider-specific follow-through.",
    adapter,
    approvalRequired: true,
  };
}
