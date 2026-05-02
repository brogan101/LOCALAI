import { randomUUID } from "node:crypto";
import { sqlite } from "../db/database.js";
import { createApprovalRequest, verifyApprovedRequest, type ApprovalRequest } from "./approval-queue.js";
import { createDigitalTwinEntity, createDigitalTwinRelationship, getDigitalTwinEntity, type DigitalTwinEntityType } from "./digital-twin.js";
import { recordAuditEvent } from "./platform-foundation.js";

export const INVENTORY_SOURCE_OF_TRUTH =
  "lib/inventory-pipeline.ts + SQLite inventory_items/project_reality_pipelines/inventory_action_proposals + Digital Twin source refs + Maker Studio/Evidence Vault links";

export type InventoryProviderStatus = "not_configured" | "degraded" | "disabled";
export type InventoryTruthStatus = "confirmed" | "proposed" | "inferred" | "stale" | "missing" | "unknown";
export type InventoryItemType = "part" | "tool" | "material" | "filament" | "asset" | "consumable" | "spare" | "other";
export type InventoryActionType = "purchase" | "reorder" | "vendor_quote" | "label_print" | "nfc_write" | "delete";
export type ProjectRealityStage =
  | "idea"
  | "research"
  | "requirements"
  | "design_cad"
  | "parts_material_check"
  | "purchase_list"
  | "fabrication_print_cnc"
  | "assembly_guide"
  | "test_checklist"
  | "documentation"
  | "maintenance_reminders";

export interface InventoryProvider {
  id: "inventree" | "snipe_it" | "homebox" | "spoolman" | "partkeepr";
  name: string;
  category: "parts" | "assets" | "home_inventory" | "filament";
  status: InventoryProviderStatus;
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
  privacyClassification: "public" | "normal" | "private" | "sensitive" | "secret";
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
  currentStage: ProjectRealityStage;
  stages: Array<{ id: ProjectRealityStage; status: "draft" | "proposal" | "blocked" | "complete"; evidenceRefs: string[] }>;
  inventoryChecks: InventoryAvailabilityCheck[];
  purchaseList: Array<Record<string, unknown>>;
  labelPlan: Record<string, unknown>;
  approvalStatus: "proposal" | "approval_required" | "approved" | "denied" | "not_required";
  status: "draft" | "proposal" | "blocked" | "ready_for_review";
  localOnly: true;
  externalApiCallsMade: false;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryActionProposal {
  id: string;
  actionType: InventoryActionType;
  status: "proposal" | "approval_required" | "denied" | "not_configured" | "blocked";
  approvalRequired: boolean;
  approval?: Pick<ApprovalRequest, "id" | "status">;
  executed: false;
  externalApiCallsMade: false;
  itemIds: string[];
  pipelineId?: string;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const PROVIDERS: InventoryProvider[] = [
  ["inventree", "InvenTree", "parts"],
  ["snipe_it", "Snipe-IT", "assets"],
  ["homebox", "HomeBox", "home_inventory"],
  ["spoolman", "Spoolman", "filament"],
  ["partkeepr", "PartKeepr", "parts"],
].map(([id, name, category]) => ({
  id: id as InventoryProvider["id"],
  name,
  category: category as InventoryProvider["category"],
  status: "not_configured",
  configured: false,
  syncEnabled: false,
  executionEnabled: false,
  externalApiCallsMade: false,
  dataLeavesMachine: false,
  reason: `${name} is optional and has not been configured for Phase 17B.`,
  nextAction: `Configure ${name} credentials and read/sync policy in a later approved workflow.`,
  supportedActions: ["status", "local_mapping_only"],
}));

const STAGES: ProjectRealityStage[] = [
  "idea",
  "research",
  "requirements",
  "design_cad",
  "parts_material_check",
  "purchase_list",
  "fabrication_print_cnc",
  "assembly_guide",
  "test_checklist",
  "documentation",
  "maintenance_reminders",
];

let ensured = false;

function nowIso(): string {
  return new Date().toISOString();
}

function stringify(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function redactString(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(password|token|secret|credential|api[_-]?key|vendor[_-]?token)[-_a-z0-9]*\b[:=]?\s*[\w.-]*/gi, "[redacted-secret]")
    .replace(/\b(sk|pk|ghp|gho)[-_a-z0-9]{6,}\b/gi, "[redacted-secret]");
}

function cleanString(value: unknown, fallback = ""): string {
  return redactString(String(value ?? fallback).trim() || fallback);
}

function cleanTruthStatus(value: unknown, fallback: InventoryTruthStatus = "unknown"): InventoryTruthStatus {
  return (["confirmed", "proposed", "inferred", "stale", "missing", "unknown"] as const).includes(value as InventoryTruthStatus)
    ? value as InventoryTruthStatus
    : fallback;
}

function cleanItemType(value: unknown): InventoryItemType {
  return (["part", "tool", "material", "filament", "asset", "consumable", "spare", "other"] as const).includes(value as InventoryItemType)
    ? value as InventoryItemType
    : "other";
}

function cleanPrivacy(value: unknown): InventoryItem["privacyClassification"] {
  return (["public", "normal", "private", "sensitive", "secret"] as const).includes(value as InventoryItem["privacyClassification"])
    ? value as InventoryItem["privacyClassification"]
    : "private";
}

function numericOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function ensureInventoryTables(): void {
  if (ensured) return;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      item_type TEXT NOT NULL,
      category TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT 'unknown',
      bin TEXT NOT NULL DEFAULT 'unknown',
      quantity REAL,
      unit TEXT NOT NULL DEFAULT 'each',
      project_link TEXT,
      reorder_threshold REAL,
      supplier_link TEXT,
      notes TEXT NOT NULL DEFAULT '',
      availability_status TEXT NOT NULL DEFAULT 'unknown',
      quantity_status TEXT NOT NULL DEFAULT 'unknown',
      suitability_status TEXT NOT NULL DEFAULT 'unknown',
      privacy_classification TEXT NOT NULL DEFAULT 'private',
      source_refs_json TEXT NOT NULL DEFAULT '[]',
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      maker_project_id TEXT,
      digital_twin_entity_id TEXT,
      provider_status TEXT NOT NULL DEFAULT 'local',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS inventory_items_type_idx ON inventory_items(item_type);
    CREATE INDEX IF NOT EXISTS inventory_items_deleted_idx ON inventory_items(deleted_at);

    CREATE TABLE IF NOT EXISTS project_reality_pipelines (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      project_id TEXT,
      maker_project_id TEXT,
      digital_twin_entity_id TEXT,
      current_stage TEXT NOT NULL,
      stages_json TEXT NOT NULL,
      inventory_checks_json TEXT NOT NULL DEFAULT '[]',
      purchase_list_json TEXT NOT NULL DEFAULT '[]',
      label_plan_json TEXT NOT NULL DEFAULT '{}',
      approval_status TEXT NOT NULL DEFAULT 'proposal',
      status TEXT NOT NULL DEFAULT 'proposal',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_action_proposals (
      id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      status TEXT NOT NULL,
      approval_required INTEGER NOT NULL DEFAULT 1,
      approval_id TEXT,
      item_ids_json TEXT NOT NULL DEFAULT '[]',
      pipeline_id TEXT,
      reason TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
  `);
  ensured = true;
}

function rowToItem(row: Record<string, unknown>): InventoryItem {
  return {
    id: String(row["id"]),
    name: String(row["name"]),
    itemType: cleanItemType(row["item_type"]),
    category: String(row["category"] ?? "uncategorized"),
    location: String(row["location"] ?? "unknown"),
    bin: String(row["bin"] ?? "unknown"),
    quantity: numericOrNull(row["quantity"]),
    unit: String(row["unit"] ?? "each"),
    projectLink: row["project_link"] ? String(row["project_link"]) : undefined,
    reorderThreshold: numericOrNull(row["reorder_threshold"]),
    supplierLink: row["supplier_link"] ? String(row["supplier_link"]) : undefined,
    notes: String(row["notes"] ?? ""),
    availabilityStatus: cleanTruthStatus(row["availability_status"]),
    quantityStatus: cleanTruthStatus(row["quantity_status"]),
    suitabilityStatus: cleanTruthStatus(row["suitability_status"]),
    privacyClassification: cleanPrivacy(row["privacy_classification"]),
    sourceRefs: parseJson<Array<Record<string, unknown>>>(row["source_refs_json"], []),
    evidenceRefs: parseJson<string[]>(row["evidence_refs_json"], []),
    makerProjectId: row["maker_project_id"] ? String(row["maker_project_id"]) : undefined,
    digitalTwinEntityId: row["digital_twin_entity_id"] ? String(row["digital_twin_entity_id"]) : undefined,
    providerStatus: (["local", "not_configured", "degraded"].includes(String(row["provider_status"])) ? row["provider_status"] : "local") as InventoryItem["providerStatus"],
    createdAt: String(row["created_at"]),
    updatedAt: String(row["updated_at"]),
    deletedAt: row["deleted_at"] ? String(row["deleted_at"]) : undefined,
  };
}

function rowToPipeline(row: Record<string, unknown>): ProjectRealityPipeline {
  return {
    id: String(row["id"]),
    title: String(row["title"]),
    projectId: row["project_id"] ? String(row["project_id"]) : undefined,
    makerProjectId: row["maker_project_id"] ? String(row["maker_project_id"]) : undefined,
    digitalTwinEntityId: row["digital_twin_entity_id"] ? String(row["digital_twin_entity_id"]) : undefined,
    currentStage: (STAGES.includes(row["current_stage"] as ProjectRealityStage) ? row["current_stage"] : "idea") as ProjectRealityStage,
    stages: parseJson<ProjectRealityPipeline["stages"]>(row["stages_json"], []),
    inventoryChecks: parseJson<InventoryAvailabilityCheck[]>(row["inventory_checks_json"], []),
    purchaseList: parseJson<Array<Record<string, unknown>>>(row["purchase_list_json"], []),
    labelPlan: parseJson<Record<string, unknown>>(row["label_plan_json"], {}),
    approvalStatus: String(row["approval_status"] ?? "proposal") as ProjectRealityPipeline["approvalStatus"],
    status: String(row["status"] ?? "proposal") as ProjectRealityPipeline["status"],
    localOnly: true,
    externalApiCallsMade: false,
    createdAt: String(row["created_at"]),
    updatedAt: String(row["updated_at"]),
  };
}

function audit(action: string, target: string, result: "success" | "blocked" | "failed", metadata: Record<string, unknown>): string {
  return recordAuditEvent({
    eventType: "inventory_pipeline",
    action,
    target,
    result,
    metadata: {
      ...metadata,
      localOnly: true,
      externalApiCallsMade: false,
      privateContentsLogged: false,
    },
  });
}

function entityTypeForItem(itemType: InventoryItemType): DigitalTwinEntityType {
  if (itemType === "tool") return "tool";
  if (itemType === "filament") return "filament";
  if (itemType === "asset") return "tool";
  return "part";
}

export function listInventoryProviders(): InventoryProvider[] {
  return PROVIDERS.map(provider => ({ ...provider, supportedActions: [...provider.supportedActions] }));
}

export function getInventoryStatus() {
  ensureInventoryTables();
  const itemCount = sqlite.prepare("SELECT COUNT(*) AS count FROM inventory_items WHERE deleted_at IS NULL").get() as { count: number };
  const pipelineCount = sqlite.prepare("SELECT COUNT(*) AS count FROM project_reality_pipelines").get() as { count: number };
  return {
    sourceOfTruth: INVENTORY_SOURCE_OF_TRUTH,
    localFirst: true,
    cloudRequired: false,
    externalApiCallsMade: false,
    purchaseExecutionEnabled: false,
    providerSyncEnabled: false,
    labelPrintingEnabled: false,
    nfcWritingEnabled: false,
    providers: listInventoryProviders(),
    counts: { items: itemCount.count, pipelines: pipelineCount.count },
    hardLimits: {
      purchases: "proposal_only",
      reorders: "proposal_only",
      vendorCalls: "not_configured",
      externalInventoryWrites: "not_configured",
      deletionRequiresApproval: true,
    },
  };
}

export function createInventoryItem(input: Partial<InventoryItem> & { name?: string }): InventoryItem {
  ensureInventoryTables();
  const name = cleanString(input.name, "Unnamed inventory item");
  const timestamp = nowIso();
  const itemType = cleanItemType(input.itemType);
  const sourceRefs = Array.isArray(input.sourceRefs) ? input.sourceRefs : [];
  const evidenceRefs = Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [];
  const privacy = cleanPrivacy(input.privacyClassification);
  const entity = createDigitalTwinEntity({
    type: entityTypeForItem(itemType),
    name,
    description: "Local inventory item metadata.",
    privacyClassification: privacy,
    sensitivity: privacy,
    stateConfidence: cleanTruthStatus(input.availabilityStatus) === "confirmed" ? "confirmed" : "unknown",
    providerStatus: "local",
    metadata: {
      itemType,
      category: cleanString(input.category, "uncategorized"),
      availabilityStatus: cleanTruthStatus(input.availabilityStatus),
      quantityStatus: cleanTruthStatus(input.quantityStatus),
      suitabilityStatus: cleanTruthStatus(input.suitabilityStatus),
    },
    sourceRefs: [
      { system: "inventory", kind: "item", id: input.id ?? "pending", status: cleanTruthStatus(input.availabilityStatus) === "confirmed" ? "confirmed" : "unknown" },
      ...sourceRefs as any,
    ],
  });
  const id = input.id ?? randomUUID();
  sqlite.prepare(`
    INSERT INTO inventory_items
      (id, name, item_type, category, location, bin, quantity, unit, project_link, reorder_threshold,
       supplier_link, notes, availability_status, quantity_status, suitability_status, privacy_classification,
       source_refs_json, evidence_refs_json, maker_project_id, digital_twin_entity_id, provider_status,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    itemType,
    cleanString(input.category, "uncategorized"),
    cleanString(input.location, "unknown"),
    cleanString(input.bin, "unknown"),
    numericOrNull(input.quantity),
    cleanString(input.unit, "each"),
    input.projectLink ? cleanString(input.projectLink) : null,
    numericOrNull(input.reorderThreshold),
    input.supplierLink ? redactString(String(input.supplierLink)) : null,
    cleanString(input.notes),
    cleanTruthStatus(input.availabilityStatus),
    cleanTruthStatus(input.quantityStatus),
    cleanTruthStatus(input.suitabilityStatus),
    privacy,
    stringify(sourceRefs),
    stringify(evidenceRefs),
    input.makerProjectId ?? null,
    entity.id,
    "local",
    timestamp,
    timestamp,
  );
  sqlite.prepare("UPDATE digital_twin_entities SET source_refs_json = ? WHERE id = ?").run(
    stringify([{ system: "inventory", kind: "item", id, status: cleanTruthStatus(input.availabilityStatus) === "confirmed" ? "confirmed" : "unknown" }, ...sourceRefs]),
    entity.id,
  );
  audit("create_item", id, "success", { itemType, category: cleanString(input.category, "uncategorized"), digitalTwinEntityId: entity.id });
  return getInventoryItem(id)!;
}

export function getInventoryItem(id: string): InventoryItem | null {
  ensureInventoryTables();
  const row = sqlite.prepare("SELECT * FROM inventory_items WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToItem(row) : null;
}

export function listInventoryItems(opts: { includeDeleted?: boolean; limit?: number } = {}): InventoryItem[] {
  ensureInventoryTables();
  const limit = Math.max(1, Math.min(opts.limit ?? 200, 500));
  const rows = sqlite.prepare(`
    SELECT * FROM inventory_items
    WHERE (? = 1 OR deleted_at IS NULL)
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(opts.includeDeleted ? 1 : 0, limit) as Array<Record<string, unknown>>;
  return rows.map(rowToItem);
}

export function checkInventoryAvailability(input: { items?: Array<{ itemId?: string; name?: string; requiredQuantity?: number }> }): InventoryAvailabilityCheck[] {
  ensureInventoryTables();
  return (input.items ?? []).map(request => {
    const item = request.itemId ? getInventoryItem(request.itemId) : null;
    const requestedName = cleanString(request.name ?? item?.name, "unknown item");
    if (!item || item.deletedAt) {
      return {
        requestedName,
        availabilityStatus: "unknown",
        quantityStatus: "unknown",
        suitabilityStatus: "unknown",
        available: false,
        blocksProject: true,
        reason: "Inventory item is missing or unknown; availability is not guessed.",
      };
    }
    const required = numericOrNull(request.requiredQuantity) ?? 1;
    const hasConfirmedQuantity = item.quantityStatus === "confirmed" && item.quantity !== null && item.quantity >= required;
    const explicitlyAvailable = item.availabilityStatus === "confirmed" && hasConfirmedQuantity && item.suitabilityStatus === "confirmed";
    const missing = item.availabilityStatus === "missing" || item.quantityStatus === "missing" || (item.quantityStatus === "confirmed" && (item.quantity ?? 0) < required);
    return {
      itemId: item.id,
      requestedName: item.name,
      availabilityStatus: item.availabilityStatus,
      quantityStatus: item.quantityStatus,
      suitabilityStatus: item.suitabilityStatus,
      available: explicitlyAvailable,
      blocksProject: !explicitlyAvailable || missing,
      reason: explicitlyAvailable
        ? "Availability, quantity, and suitability are confirmed locally."
        : missing
          ? "Required material/part is missing or below threshold."
          : "Inventory data is not confirmed; LOCALAI will not guess availability.",
    };
  });
}

export function createProjectRealityPipeline(input: {
  title?: string;
  projectId?: string;
  makerProjectId?: string;
  itemRequests?: Array<{ itemId?: string; name?: string; requiredQuantity?: number }>;
}): ProjectRealityPipeline {
  ensureInventoryTables();
  const id = randomUUID();
  const title = cleanString(input.title, "Untitled project-to-reality pipeline");
  const timestamp = nowIso();
  const checks = checkInventoryAvailability({ items: input.itemRequests ?? [] });
  const blocked = checks.some(check => check.blocksProject);
  const stages = STAGES.map(stage => ({
    id: stage,
    status: stage === "parts_material_check" && blocked ? "blocked" as const : "proposal" as const,
    evidenceRefs: [],
  }));
  const entity = createDigitalTwinEntity({
    type: "project",
    name: title,
    description: "Local project-to-reality pipeline proposal.",
    privacyClassification: "private",
    sensitivity: "private",
    stateConfidence: "proposed",
    providerStatus: "local",
    metadata: { pipelineId: id, status: blocked ? "blocked" : "proposal", externalApiCallsMade: false },
    sourceRefs: [
      { system: "inventory", kind: "project_reality_pipeline", id, status: "proposed" },
      ...(input.makerProjectId ? [{ system: "maker_studio" as const, kind: "project", id: input.makerProjectId, status: "proposed" as const }] : []),
    ],
  });
  sqlite.prepare(`
    INSERT INTO project_reality_pipelines
      (id, title, project_id, maker_project_id, digital_twin_entity_id, current_stage, stages_json,
       inventory_checks_json, purchase_list_json, label_plan_json, approval_status, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title,
    input.projectId ?? null,
    input.makerProjectId ?? null,
    entity.id,
    "idea",
    stringify(stages),
    stringify(checks),
    stringify(checks.filter(check => check.blocksProject).map(check => ({
      requestedName: check.requestedName,
      status: "proposal_only",
      approvalRequired: true,
      purchaseExecuted: false,
    }))),
    stringify({ mode: "qr_nfc_data_only", printingEnabled: false, nfcWritingEnabled: false }),
    "proposal",
    blocked ? "blocked" : "proposal",
    timestamp,
    timestamp,
  );
  if (input.makerProjectId && getDigitalTwinEntity(entity.id)) {
    for (const check of checks.filter(check => check.itemId)) {
      const item = getInventoryItem(check.itemId!);
      if (item?.digitalTwinEntityId) {
        createDigitalTwinRelationship({
          sourceEntityId: entity.id,
          relationType: "requires_inventory_item",
          targetEntityId: item.digitalTwinEntityId,
          confidence: check.available ? 0.95 : 0.2,
          status: check.available ? "confirmed" : check.availabilityStatus === "missing" ? "blocked" : "unknown",
          provenance: { source: "system", sourceRef: id, evidenceRefs: [], note: "Phase 17B local inventory check." },
        });
      }
    }
  }
  audit("create_project_reality_pipeline", id, blocked ? "blocked" : "success", { checkCount: checks.length, blocked });
  return getProjectRealityPipeline(id)!;
}

export function getProjectRealityPipeline(id: string): ProjectRealityPipeline | null {
  ensureInventoryTables();
  const row = sqlite.prepare("SELECT * FROM project_reality_pipelines WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToPipeline(row) : null;
}

export function listProjectRealityPipelines(limit = 100): ProjectRealityPipeline[] {
  ensureInventoryTables();
  const rows = sqlite.prepare("SELECT * FROM project_reality_pipelines ORDER BY updated_at DESC LIMIT ?")
    .all(Math.max(1, Math.min(limit, 500))) as Array<Record<string, unknown>>;
  return rows.map(rowToPipeline);
}

export function createInventoryLabelPlan(itemId: string, labelType: "qr" | "nfc" | "both" = "qr") {
  const item = getInventoryItem(itemId);
  if (!item || item.deletedAt) {
    return { success: false, status: "blocked", executed: false, externalApiCallsMade: false, reason: "Inventory item not found." };
  }
  const payload = {
    version: 1,
    itemId: item.id,
    itemType: item.itemType,
    source: "LOCALAI_INVENTORY",
    privacyClassification: item.privacyClassification,
  };
  audit("create_label_plan", item.id, "success", { labelType, printingEnabled: false, nfcWritingEnabled: false });
  return {
    success: true,
    status: "proposal",
    executed: false,
    externalApiCallsMade: false,
    labelType,
    printingEnabled: false,
    nfcWritingEnabled: false,
    payload,
    reason: "QR/NFC label data generated locally; printing/writing is disabled in Phase 17B.",
  };
}

function actionPayload(actionType: InventoryActionType, itemIds: string[], pipelineId?: string): Record<string, unknown> {
  return { actionType, itemIds: [...itemIds].sort(), pipelineId: pipelineId ?? null, phase: "17B" };
}

export function proposeInventoryAction(input: {
  actionType?: InventoryActionType;
  itemIds?: string[];
  pipelineId?: string;
  approvalId?: string;
  metadata?: Record<string, unknown>;
}): InventoryActionProposal {
  ensureInventoryTables();
  const actionType = (["purchase", "reorder", "vendor_quote", "label_print", "nfc_write", "delete"] as const).includes(input.actionType as InventoryActionType)
    ? input.actionType as InventoryActionType
    : "reorder";
  const itemIds = (input.itemIds ?? []).filter(Boolean);
  const payload = actionPayload(actionType, itemIds, input.pipelineId);
  const approvalRequired = true;
  let approval: ApprovalRequest | undefined;
  let status: InventoryActionProposal["status"] = "approval_required";
  let reason = "Inventory action is proposal-only and requires explicit approval; no external provider call or purchase was made.";

  if (input.approvalId) {
    const verification = verifyApprovedRequest(input.approvalId, payload, "inventory_action");
    approval = verification.approval;
    if (!verification.allowed) {
      status = verification.approval?.status === "denied" ? "denied" : "approval_required";
      reason = verification.message;
    } else if (["purchase", "reorder", "vendor_quote", "label_print", "nfc_write"].includes(actionType)) {
      status = "not_configured";
      reason = "Approved proposal cannot execute in Phase 17B because external purchase/vendor/label/NFC providers are not configured.";
    } else if (actionType === "delete") {
      status = "blocked";
      reason = "Deletion is approval-gated and remains soft-delete only through the dedicated deletion workflow.";
    }
  } else {
    approval = createApprovalRequest({
      type: "inventory_action",
      title: `Inventory ${actionType} proposal`,
      summary: "Proposal-only inventory action. This does not purchase, sync, print, write NFC, or delete inventory.",
      riskTier: "tier1_draft_only",
      requestedAction: actionType,
      payload,
    });
  }

  const id = randomUUID();
  const timestamp = nowIso();
  const proposal: InventoryActionProposal = {
    id,
    actionType,
    status,
    approvalRequired,
    approval: approval ? { id: approval.id, status: approval.status } : undefined,
    executed: false,
    externalApiCallsMade: false,
    itemIds,
    pipelineId: input.pipelineId,
    reason,
    metadata: { ...(input.metadata ?? {}), providerStatus: "not_configured", purchaseExecuted: false },
    createdAt: timestamp,
  };
  sqlite.prepare(`
    INSERT INTO inventory_action_proposals
      (id, action_type, status, approval_required, approval_id, item_ids_json, pipeline_id, reason, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, actionType, status, 1, approval?.id ?? null, stringify(itemIds), input.pipelineId ?? null, reason, stringify(proposal.metadata), timestamp);
  audit("propose_action", id, status === "denied" || status === "blocked" ? "blocked" : "success", {
    actionType,
    itemCount: itemIds.length,
    approvalStatus: approval?.status,
    executed: false,
  });
  return proposal;
}

export function createLowStockReorderSuggestions(): InventoryActionProposal[] {
  return listInventoryItems()
    .filter(item => item.quantityStatus === "confirmed" && item.quantity !== null && item.reorderThreshold !== null && item.quantity <= item.reorderThreshold)
    .map(item => proposeInventoryAction({
      actionType: "reorder",
      itemIds: [item.id],
      metadata: { trigger: "low_stock_threshold", quantityStatus: item.quantityStatus },
    }));
}

export function requestInventoryItemDeletion(itemId: string, approvalId?: string): InventoryActionProposal {
  return proposeInventoryAction({ actionType: "delete", itemIds: [itemId], approvalId });
}
