import { randomUUID } from "crypto";
import { sqlite } from "../db/database.js";
import { evaluateEdgeAction } from "./edge-node.js";
import { evidenceVault, type PrivacyClassification } from "./evidence-vault.js";
import { evaluateDeviceAction, evaluateHaAction, evaluateMqttPublish } from "./home-autopilot.js";
import { generateBlueprint, getHomelabSocAlert, type HomelabDataConfidence } from "./homelab-architect.js";
import { getMakerProject, proposeMakerPhysicalAction } from "./maker-studio.js";
import { listAuditEvents, listDurableJobs, recordAuditEvent } from "./platform-foundation.js";
import { thoughtLog } from "./thought-log.js";

export const DIGITAL_TWIN_SOURCE_OF_TRUTH = `
Digital Twin Source of Truth (Phase 17A)
=======================================
Purpose: Local-first relationship graph for home, shop, network, vehicles,
tools, projects, documents, materials, services, automations, and safety policy
records. This layer links existing LOCALAI sources of truth; it does not replace
RAG, Evidence Vault, HomeLab, Home SOC, Maker Studio, Edge Nodes, or Home
Autopilot.

Hard limits:
- No discovery, scan, pairing, sync, actuation, vehicle/tool/device control, or
  external API call happens from the Digital Twin by default.
- Unknown entity fields, state, location, owner, configuration, and relationships
  are marked unknown/proposed/not_configured; they are never guessed.
- Relationships distinguish confirmed, proposed, inferred, stale, deleted,
  blocked, and unknown data.
- AI-created or inferred relationships require provenance.
- Privacy/sensitivity classification is stored on every entity.
- Physical actions remain delegated to existing Edge/Home/Maker safety policies
  and return executed=false.
- Secrets, API keys, device tokens, private URLs, IP maps, location/presence
  details, vehicle records, proprietary project data, and sensitive contents are
  not written to audit or thought-log metadata.
`;

export type DigitalTwinEntityType =
  | "room"
  | "zone"
  | "tool"
  | "printer"
  | "camera"
  | "sensor"
  | "vehicle"
  | "network_device"
  | "vm"
  | "container"
  | "document"
  | "part"
  | "filament"
  | "project"
  | "automation"
  | "service";

export type DigitalTwinRelationshipStatus =
  | "confirmed"
  | "proposed"
  | "inferred"
  | "stale"
  | "deleted"
  | "blocked"
  | "unknown";

export type DigitalTwinProviderStatus = "local" | "not_configured" | "degraded";

export type DigitalTwinSourceSystem =
  | "evidence_vault"
  | "rag"
  | "homelab"
  | "home_soc"
  | "maker_studio"
  | "edge_node"
  | "home_autopilot"
  | "inventory"
  | "vehicle"
  | "tool"
  | "project"
  | "manual";

export interface DigitalTwinSourceRef {
  system: DigitalTwinSourceSystem;
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
  privacyClassification: PrivacyClassification;
  sensitivity: "public" | "normal" | "private" | "sensitive" | "secret";
  stateConfidence: HomelabDataConfidence;
  providerStatus: DigitalTwinProviderStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface DigitalTwinProvenance {
  source: "manual" | "ai" | "import" | "system";
  sourceRef: string;
  evidenceRefs: string[];
  note: string;
}

export interface DigitalTwinRelationship {
  id: string;
  sourceEntityId: string;
  relationType: string;
  targetEntityId: string;
  confidence: number;
  status: DigitalTwinRelationshipStatus;
  provenance: DigitalTwinProvenance;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
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

export interface DigitalTwinSearchResult {
  entities: DigitalTwinEntity[];
  relationships: DigitalTwinRelationship[];
  localOnly: true;
  externalApiCallsMade: false;
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

export interface DigitalTwinActionSafetyResult {
  entityId: string;
  action: string;
  allowed: boolean;
  riskTier: string;
  requiresApproval: boolean;
  status: "read_only" | "dry_run" | "proposal" | "approval_required" | "blocked" | "manual_only" | "not_configured";
  message: string;
  executed: false;
  delegatedTo?: DigitalTwinSourceSystem;
}

let tablesEnsured = false;

export function ensureDigitalTwinTables(): void {
  if (tablesEnsured) return;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS digital_twin_entities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      source_refs_json TEXT NOT NULL DEFAULT '[]',
      privacy_classification TEXT NOT NULL DEFAULT 'normal',
      sensitivity TEXT NOT NULL DEFAULT 'normal',
      state_confidence TEXT NOT NULL DEFAULT 'unknown',
      provider_status TEXT NOT NULL DEFAULT 'local',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );
    CREATE INDEX IF NOT EXISTS digital_twin_entity_type ON digital_twin_entities(type);
    CREATE INDEX IF NOT EXISTS digital_twin_entity_name ON digital_twin_entities(name);
    CREATE INDEX IF NOT EXISTS digital_twin_entity_archived ON digital_twin_entities(archived_at);

    CREATE TABLE IF NOT EXISTS digital_twin_relationships (
      id TEXT PRIMARY KEY,
      source_entity_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      target_entity_id TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unknown',
      provenance_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS digital_twin_relationship_source ON digital_twin_relationships(source_entity_id);
    CREATE INDEX IF NOT EXISTS digital_twin_relationship_target ON digital_twin_relationships(target_entity_id);
    CREATE INDEX IF NOT EXISTS digital_twin_relationship_status ON digital_twin_relationships(status);
  `);
  tablesEnsured = true;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const SENSITIVE_KEY_PATTERN = /(secret|token|password|credential|cookie|privateIp|publicIp|ipMap|vpn|location|presence|cameraFrame|apiKey|url|endpoint)/i;

function sanitizeMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> {
  const input = value ?? {};
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(input)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = "[redacted]";
      continue;
    }
    if (Array.isArray(child)) {
      output[key] = child.slice(0, 25).map((entry) => typeof entry === "object" && entry !== null ? "[object]" : entry);
      continue;
    }
    if (typeof child === "object" && child !== null) {
      output[key] = "[object]";
      continue;
    }
    output[key] = child;
  }
  return output;
}

function auditMetadataForEntity(entity: DigitalTwinEntity): Record<string, unknown> {
  return {
    entityId: entity.id,
    type: entity.type,
    sourceRefCount: entity.sourceRefs.length,
    privacyClassification: entity.privacyClassification,
    sensitivity: entity.sensitivity,
    stateConfidence: entity.stateConfidence,
    providerStatus: entity.providerStatus,
    metadataKeys: Object.keys(entity.metadata),
  };
}

function normalizePrivacy(value: unknown): PrivacyClassification {
  return ["public", "normal", "private", "sensitive", "secret"].includes(String(value))
    ? String(value) as PrivacyClassification
    : "normal";
}

function normalizeEntityType(value: unknown): DigitalTwinEntityType {
  const type = String(value || "tool");
  const allowed: DigitalTwinEntityType[] = [
    "room", "zone", "tool", "printer", "camera", "sensor", "vehicle", "network_device",
    "vm", "container", "document", "part", "filament", "project", "automation", "service",
  ];
  return allowed.includes(type as DigitalTwinEntityType) ? type as DigitalTwinEntityType : "tool";
}

function normalizeRelationshipStatus(value: unknown, confidence: number): DigitalTwinRelationshipStatus {
  const status = String(value || "");
  const allowed: DigitalTwinRelationshipStatus[] = ["confirmed", "proposed", "inferred", "stale", "deleted", "blocked", "unknown"];
  if (allowed.includes(status as DigitalTwinRelationshipStatus)) return status as DigitalTwinRelationshipStatus;
  return confidence >= 0.95 ? "confirmed" : confidence > 0 ? "proposed" : "unknown";
}

function rowToEntity(row: Record<string, unknown>): DigitalTwinEntity {
  return {
    id: String(row["id"]),
    type: normalizeEntityType(row["type"]),
    name: String(row["name"] ?? ""),
    description: String(row["description"] ?? ""),
    metadata: parseJson<Record<string, unknown>>(row["metadata_json"], {}),
    sourceRefs: parseJson<DigitalTwinSourceRef[]>(row["source_refs_json"], []),
    privacyClassification: normalizePrivacy(row["privacy_classification"]),
    sensitivity: normalizePrivacy(row["sensitivity"]) as DigitalTwinEntity["sensitivity"],
    stateConfidence: (["confirmed", "proposed", "unknown"].includes(String(row["state_confidence"])) ? row["state_confidence"] : "unknown") as HomelabDataConfidence,
    providerStatus: (["local", "not_configured", "degraded"].includes(String(row["provider_status"])) ? row["provider_status"] : "local") as DigitalTwinProviderStatus,
    createdAt: String(row["created_at"]),
    updatedAt: String(row["updated_at"]),
    archivedAt: row["archived_at"] ? String(row["archived_at"]) : undefined,
  };
}

function rowToRelationship(row: Record<string, unknown>): DigitalTwinRelationship {
  return {
    id: String(row["id"]),
    sourceEntityId: String(row["source_entity_id"]),
    relationType: String(row["relation_type"]),
    targetEntityId: String(row["target_entity_id"]),
    confidence: Number(row["confidence"] ?? 0),
    status: normalizeRelationshipStatus(row["status"], Number(row["confidence"] ?? 0)),
    provenance: parseJson<DigitalTwinProvenance>(row["provenance_json"], { source: "manual", sourceRef: "unknown", evidenceRefs: [], note: "" }),
    createdAt: String(row["created_at"]),
    updatedAt: String(row["updated_at"]),
    deletedAt: row["deleted_at"] ? String(row["deleted_at"]) : undefined,
  };
}

function defaultProviderStatus(sourceRefs: DigitalTwinSourceRef[]): DigitalTwinProviderStatus {
  if (sourceRefs.some((ref) => ref.status === "not_configured")) return "not_configured";
  if (sourceRefs.some((ref) => ref.status === "unknown")) return "degraded";
  return "local";
}

export function createDigitalTwinEntity(input: {
  id?: string;
  type: DigitalTwinEntityType;
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
  sourceRefs?: DigitalTwinSourceRef[];
  privacyClassification?: PrivacyClassification;
  sensitivity?: DigitalTwinEntity["sensitivity"];
  stateConfidence?: HomelabDataConfidence;
  providerStatus?: DigitalTwinProviderStatus;
}): DigitalTwinEntity {
  ensureDigitalTwinTables();
  const name = input.name.trim();
  if (!name) throw new Error("name is required");
  const timestamp = nowIso();
  const id = input.id ?? randomUUID();
  const sourceRefs = input.sourceRefs ?? [];
  const privacy = normalizePrivacy(input.privacyClassification);
  const sensitivity = normalizePrivacy(input.sensitivity ?? privacy) as DigitalTwinEntity["sensitivity"];
  const entityType = normalizeEntityType(input.type);
  sqlite.prepare(`
    INSERT INTO digital_twin_entities
      (id, type, name, description, metadata_json, source_refs_json,
       privacy_classification, sensitivity, state_confidence, provider_status,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      name = excluded.name,
      description = excluded.description,
      metadata_json = excluded.metadata_json,
      source_refs_json = excluded.source_refs_json,
      privacy_classification = excluded.privacy_classification,
      sensitivity = excluded.sensitivity,
      state_confidence = excluded.state_confidence,
      provider_status = excluded.provider_status,
      archived_at = NULL,
      updated_at = excluded.updated_at
  `).run(
    id,
    entityType,
    name,
    input.description ?? "",
    JSON.stringify(sanitizeMetadata(input.metadata)),
    JSON.stringify(sourceRefs),
    privacy,
    sensitivity,
    input.stateConfidence ?? "unknown",
    input.providerStatus ?? defaultProviderStatus(sourceRefs),
    timestamp,
    timestamp,
  );
  const entity = getDigitalTwinEntity(id)!;
  recordAuditEvent({
    eventType: "digital_twin",
    action: "entity_upsert",
    target: entity.id,
    result: "success",
    metadata: auditMetadataForEntity(entity),
  });
  thoughtLog.publish({
    category: "system",
    title: "Digital Twin Entity Updated",
    message: "Digital Twin entity metadata updated.",
    metadata: auditMetadataForEntity(entity),
  });
  return entity;
}

export function getDigitalTwinEntity(id: string): DigitalTwinEntity | null {
  ensureDigitalTwinTables();
  const row = sqlite.prepare("SELECT * FROM digital_twin_entities WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToEntity(row) : null;
}

export function updateDigitalTwinEntity(id: string, input: Partial<Omit<DigitalTwinEntity, "id" | "createdAt" | "updatedAt">>): DigitalTwinEntity {
  const existing = getDigitalTwinEntity(id);
  if (!existing) throw new Error(`Digital Twin entity not found: ${id}`);
  return createDigitalTwinEntity({
    ...existing,
    ...input,
    id,
    type: input.type ?? existing.type,
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    metadata: input.metadata ?? existing.metadata,
    sourceRefs: input.sourceRefs ?? existing.sourceRefs,
    privacyClassification: input.privacyClassification ?? existing.privacyClassification,
    sensitivity: input.sensitivity ?? existing.sensitivity,
    stateConfidence: input.stateConfidence ?? existing.stateConfidence,
    providerStatus: input.providerStatus ?? existing.providerStatus,
  });
}

export function listDigitalTwinEntities(filter: { includeArchived?: boolean; type?: DigitalTwinEntityType; limit?: number } = {}): DigitalTwinEntity[] {
  ensureDigitalTwinTables();
  let sql = "SELECT * FROM digital_twin_entities WHERE 1=1";
  const params: unknown[] = [];
  if (!filter.includeArchived) sql += " AND archived_at IS NULL";
  if (filter.type) {
    sql += " AND type = ?";
    params.push(filter.type);
  }
  sql += " ORDER BY updated_at DESC LIMIT ?";
  params.push(Math.max(1, Math.min(filter.limit ?? 200, 500)));
  return (sqlite.prepare(sql).all(...params) as Record<string, unknown>[]).map(rowToEntity);
}

export function archiveDigitalTwinEntity(id: string, opts: { forceArchive?: boolean } = {}): { archived: boolean; blocked: boolean; reason: string; entity?: DigitalTwinEntity } {
  ensureDigitalTwinTables();
  const entity = getDigitalTwinEntity(id);
  if (!entity) return { archived: false, blocked: true, reason: "Entity not found." };
  const refs = listDigitalTwinRelationships({ entityId: id, includeDeleted: false });
  if (refs.length > 0 && !opts.forceArchive) {
    return {
      archived: false,
      blocked: true,
      reason: "Entity has active relationships. Archive with forceArchive=true or remove/mark relationships deleted first.",
      entity,
    };
  }
  const timestamp = nowIso();
  sqlite.prepare("UPDATE digital_twin_entities SET archived_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, id);
  for (const rel of refs) {
    sqlite.prepare("UPDATE digital_twin_relationships SET status = 'stale', updated_at = ? WHERE id = ?").run(timestamp, rel.id);
  }
  const archived = getDigitalTwinEntity(id)!;
  recordAuditEvent({
    eventType: "digital_twin",
    action: "entity_archived",
    target: id,
    result: "success",
    metadata: { entityId: id, relationshipCount: refs.length, forceArchive: !!opts.forceArchive },
  });
  return { archived: true, blocked: false, reason: "Entity archived locally; active relationships marked stale when present.", entity: archived };
}

function validateProvenance(status: DigitalTwinRelationshipStatus, provenance?: Partial<DigitalTwinProvenance>): DigitalTwinProvenance {
  const source = provenance?.source ?? (status === "inferred" ? "ai" : "manual");
  const sourceRef = provenance?.sourceRef?.trim() ?? "";
  const note = provenance?.note?.trim() ?? "";
  const evidenceRefs = provenance?.evidenceRefs ?? [];
  if ((source === "ai" || status === "inferred") && !sourceRef && evidenceRefs.length === 0 && !note) {
    throw new Error("AI-created or inferred relationships require provenance.");
  }
  return {
    source,
    sourceRef: sourceRef || "manual-local-entry",
    evidenceRefs,
    note,
  };
}

export function createDigitalTwinRelationship(input: {
  id?: string;
  sourceEntityId: string;
  relationType: string;
  targetEntityId: string;
  confidence?: number;
  status?: DigitalTwinRelationshipStatus;
  provenance?: Partial<DigitalTwinProvenance>;
}): DigitalTwinRelationship {
  ensureDigitalTwinTables();
  const source = getDigitalTwinEntity(input.sourceEntityId);
  const target = getDigitalTwinEntity(input.targetEntityId);
  if (!source || source.archivedAt) throw new Error("source entity is missing or archived");
  if (!target || target.archivedAt) throw new Error("target entity is missing or archived");
  const relationType = input.relationType.trim();
  if (!relationType) throw new Error("relationType is required");
  const confidence = Math.max(0, Math.min(input.confidence ?? 0, 1));
  const status = normalizeRelationshipStatus(input.status, confidence);
  if (status === "confirmed" && confidence < 0.95) {
    throw new Error("Confirmed relationships require confidence >= 0.95.");
  }
  const provenance = validateProvenance(status, input.provenance);
  const timestamp = nowIso();
  const id = input.id ?? randomUUID();
  sqlite.prepare(`
    INSERT INTO digital_twin_relationships
      (id, source_entity_id, relation_type, target_entity_id, confidence,
       status, provenance_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source_entity_id = excluded.source_entity_id,
      relation_type = excluded.relation_type,
      target_entity_id = excluded.target_entity_id,
      confidence = excluded.confidence,
      status = excluded.status,
      provenance_json = excluded.provenance_json,
      deleted_at = NULL,
      updated_at = excluded.updated_at
  `).run(id, source.id, relationType, target.id, confidence, status, JSON.stringify(provenance), timestamp, timestamp);
  const relationship = getDigitalTwinRelationship(id)!;
  recordAuditEvent({
    eventType: "digital_twin",
    action: "relationship_upsert",
    target: relationship.id,
    result: "success",
    metadata: {
      relationshipId: relationship.id,
      sourceEntityId: relationship.sourceEntityId,
      targetEntityId: relationship.targetEntityId,
      relationType: relationship.relationType,
      status: relationship.status,
      confidence: relationship.confidence,
      provenanceSource: relationship.provenance.source,
      evidenceRefCount: relationship.provenance.evidenceRefs.length,
    },
  });
  return relationship;
}

export function getDigitalTwinRelationship(id: string): DigitalTwinRelationship | null {
  ensureDigitalTwinTables();
  const row = sqlite.prepare("SELECT * FROM digital_twin_relationships WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToRelationship(row) : null;
}

export function listDigitalTwinRelationships(filter: { entityId?: string; includeDeleted?: boolean; limit?: number } = {}): DigitalTwinRelationship[] {
  ensureDigitalTwinTables();
  let sql = "SELECT * FROM digital_twin_relationships WHERE 1=1";
  const params: unknown[] = [];
  if (!filter.includeDeleted) sql += " AND deleted_at IS NULL AND status != 'deleted'";
  if (filter.entityId) {
    sql += " AND (source_entity_id = ? OR target_entity_id = ?)";
    params.push(filter.entityId, filter.entityId);
  }
  sql += " ORDER BY updated_at DESC LIMIT ?";
  params.push(Math.max(1, Math.min(filter.limit ?? 200, 500)));
  return (sqlite.prepare(sql).all(...params) as Record<string, unknown>[]).map(rowToRelationship);
}

export function deleteDigitalTwinRelationship(id: string): { deleted: boolean; relationship?: DigitalTwinRelationship; reason: string } {
  ensureDigitalTwinTables();
  const relationship = getDigitalTwinRelationship(id);
  if (!relationship) return { deleted: false, reason: "Relationship not found." };
  const timestamp = nowIso();
  sqlite.prepare("UPDATE digital_twin_relationships SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, id);
  const deleted = getDigitalTwinRelationship(id)!;
  recordAuditEvent({
    eventType: "digital_twin",
    action: "relationship_deleted",
    target: id,
    result: "success",
    metadata: { relationshipId: id, sourceEntityId: relationship.sourceEntityId, targetEntityId: relationship.targetEntityId },
  });
  return { deleted: true, relationship: deleted, reason: "Relationship marked deleted locally; no linked entity was removed." };
}

export function searchDigitalTwinGraph(query: string, limit = 50): DigitalTwinSearchResult {
  ensureDigitalTwinTables();
  const q = query.trim().toLowerCase();
  if (!q) return { entities: [], relationships: [], localOnly: true, externalApiCallsMade: false };
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const like = `%${q}%`;
  const entities = (sqlite.prepare(`
    SELECT * FROM digital_twin_entities
    WHERE archived_at IS NULL AND (lower(name) LIKE ? OR lower(type) LIKE ? OR lower(description) LIKE ?)
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(like, like, like, safeLimit) as Record<string, unknown>[]).map(rowToEntity);
  const relationships = (sqlite.prepare(`
    SELECT * FROM digital_twin_relationships
    WHERE deleted_at IS NULL AND status != 'deleted'
      AND (lower(relation_type) LIKE ? OR lower(status) LIKE ?)
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(like, like, safeLimit) as Record<string, unknown>[]).map(rowToRelationship);
  return { entities, relationships, localOnly: true, externalApiCallsMade: false };
}

function sourceStatusForEntity(entity: DigitalTwinEntity): Record<string, unknown> {
  const refs = entity.sourceRefs;
  const status: Record<string, unknown> = {
    sourceRefCount: refs.length,
    unknownRefs: refs.filter((ref) => ref.status === "unknown").length,
    notConfiguredRefs: refs.filter((ref) => ref.status === "not_configured").length,
  };
  if (refs.some((ref) => ref.system === "homelab")) {
    const blueprint = generateBlueprint();
    status["homelab"] = { devices: blueprint.devices.length, services: blueprint.services.length, source: "local" };
  }
  if (refs.some((ref) => ref.system === "home_soc")) {
    status["homeSoc"] = { linkedAlerts: refs.filter((ref) => ref.system === "home_soc").length, source: "local" };
  }
  if (refs.some((ref) => ref.system === "maker_studio")) {
    status["makerStudio"] = { linkedProjects: refs.filter((ref) => ref.system === "maker_studio" && ref.kind === "project").length, source: "local" };
  }
  return status;
}

export async function getDigitalTwinEntityDetail(id: string): Promise<DigitalTwinEntityDetail | null> {
  ensureDigitalTwinTables();
  const entity = getDigitalTwinEntity(id);
  if (!entity) return null;
  const relationships = listDigitalTwinRelationships({ entityId: id, includeDeleted: true, limit: 200 });
  const records = await evidenceVault.listRecords({ includeDeleted: false }).catch(() => []);
  const linkedDocuments = records
    .filter((record) => {
      const association = record.entityAssociation ?? {};
      if (association["digitalTwinEntityId"] === id) return true;
      return entity.sourceRefs.some((ref) =>
        ref.system === "evidence_vault" && (ref.id === record.id || ref.id === record.sourceId || ref.id === record.collectionId)
      );
    })
    .map((record) => ({
      id: record.id,
      title: record.title,
      category: record.category,
      privacyClassification: record.privacyClassification,
    }));
  const linkedJobs = listDurableJobs(100)
    .filter((job) => JSON.stringify(job.payload).includes(id) || JSON.stringify(job.checkpoint).includes(id))
    .map((job) => ({ id: job.id, kind: job.kind, state: job.state, createdAt: job.createdAt }));
  const linkedEvents = listAuditEvents(100)
    .filter((event) => String(event["target"] ?? "") === id || JSON.stringify(event["metadata"] ?? {}).includes(id))
    .map((event) => ({
      id: String(event["id"]),
      eventType: String(event["eventType"]),
      action: String(event["action"]),
      result: String(event["result"]),
      createdAt: String(event["createdAt"]),
    }));
  return {
    entity,
    relationships,
    linkedDocuments,
    linkedJobs,
    linkedEvents,
    linkedSourceStatus: sourceStatusForEntity(entity),
    externalApiCallsMade: false,
  };
}

export function getDigitalTwinStatus(): DigitalTwinStatus {
  ensureDigitalTwinTables();
  const entityCount = (sqlite.prepare("SELECT COUNT(*) AS count FROM digital_twin_entities WHERE archived_at IS NULL").get() as { count: number }).count;
  const relationshipCount = (sqlite.prepare("SELECT COUNT(*) AS count FROM digital_twin_relationships WHERE deleted_at IS NULL AND status != 'deleted'").get() as { count: number }).count;
  const archivedEntityCount = (sqlite.prepare("SELECT COUNT(*) AS count FROM digital_twin_entities WHERE archived_at IS NOT NULL").get() as { count: number }).count;
  const deletedRelationshipCount = (sqlite.prepare("SELECT COUNT(*) AS count FROM digital_twin_relationships WHERE deleted_at IS NOT NULL OR status = 'deleted'").get() as { count: number }).count;
  return {
    sourceOfTruth: DIGITAL_TWIN_SOURCE_OF_TRUTH,
    localFirst: true,
    cloudRequired: false,
    externalApiCallsMade: false,
    entityCount,
    relationshipCount,
    archivedEntityCount,
    deletedRelationshipCount,
  };
}

function statusFromRisk(riskTier: string, allowed = false): DigitalTwinActionSafetyResult["status"] {
  if (riskTier === "manual_only") return "manual_only";
  if (riskTier === "blocked") return "blocked";
  if (riskTier === "approval_required") return "approval_required";
  if (riskTier === "read_only") return "read_only";
  if (riskTier === "dry_run") return "dry_run";
  if (riskTier === "proposal") return "proposal";
  return allowed ? "proposal" : "not_configured";
}

export function evaluateDigitalTwinActionSafety(entityId: string, action: string, input: Record<string, string> = {}): DigitalTwinActionSafetyResult {
  const entity = getDigitalTwinEntity(entityId);
  if (!entity) {
    return { entityId, action, allowed: false, riskTier: "blocked", requiresApproval: false, status: "blocked", message: "Digital Twin entity not found.", executed: false };
  }
  const makerRef = entity.sourceRefs.find((ref) => ref.system === "maker_studio" && ref.kind === "project");
  if (makerRef && getMakerProject(makerRef.id) && /print|cnc|laser|machine|fabricat|export|start|simulate|prepare/i.test(action)) {
    const result = proposeMakerPhysicalAction(makerRef.id, { actionType: action });
    return {
      entityId,
      action,
      allowed: result.success,
      riskTier: result.physicalTier ?? result.safetyTier ?? result.status,
      requiresApproval: result.approvalRequired,
      status: result.status === "approval_required" ? "approval_required" : result.status === "manual_only" ? "manual_only" : result.status === "blocked" ? "blocked" : "proposal",
      message: result.reason,
      executed: false,
      delegatedTo: "maker_studio",
    };
  }
  const edgeRef = entity.sourceRefs.find((ref) => ref.system === "edge_node");
  if (edgeRef) {
    const result = evaluateEdgeAction(edgeRef.id, input["capabilityId"] || action);
    return {
      entityId,
      action,
      allowed: result.allowed,
      riskTier: result.riskTier,
      requiresApproval: result.requiresApproval,
      status: statusFromRisk(result.riskTier, result.allowed),
      message: result.message,
      executed: false,
      delegatedTo: "edge_node",
    };
  }
  const homeRef = entity.sourceRefs.find((ref) => ref.system === "home_autopilot");
  if (homeRef?.kind === "device") {
    const result = evaluateDeviceAction(homeRef.id, action);
    return {
      entityId,
      action,
      allowed: result.allowed,
      riskTier: result.riskTier,
      requiresApproval: result.requiresApproval,
      status: statusFromRisk(result.riskTier, result.allowed),
      message: result.message,
      executed: false,
      delegatedTo: "home_autopilot",
    };
  }
  if (homeRef?.kind === "ha_entity") {
    const result = evaluateHaAction(homeRef.id, input["entityId"] || entity.name, action);
    return {
      entityId,
      action,
      allowed: result.allowed,
      riskTier: result.riskTier,
      requiresApproval: result.requiresApproval,
      status: statusFromRisk(result.riskTier, result.allowed),
      message: result.message,
      executed: false,
      delegatedTo: "home_autopilot",
    };
  }
  if (homeRef?.kind === "mqtt_topic") {
    const result = evaluateMqttPublish(homeRef.id, input["topic"] || entity.name);
    return {
      entityId,
      action,
      allowed: result.allowed,
      riskTier: result.riskTier,
      requiresApproval: result.requiresApproval,
      status: statusFromRisk(result.riskTier, result.allowed),
      message: result.message,
      executed: false,
      delegatedTo: "home_autopilot",
    };
  }
  if (makerRef && getMakerProject(makerRef.id)) {
    const result = proposeMakerPhysicalAction(makerRef.id, { actionType: action });
    return {
      entityId,
      action,
      allowed: result.success,
      riskTier: result.physicalTier ?? result.safetyTier ?? result.status,
      requiresApproval: result.approvalRequired,
      status: result.status === "approval_required" ? "approval_required" : result.status === "manual_only" ? "manual_only" : result.status === "blocked" ? "blocked" : "proposal",
      message: result.reason,
      executed: false,
      delegatedTo: "maker_studio",
    };
  }
  const socRef = entity.sourceRefs.find((ref) => ref.system === "home_soc" && ref.kind === "alert");
  if (socRef && getHomelabSocAlert(socRef.id)) {
    return {
      entityId,
      action,
      allowed: false,
      riskTier: "approval_required",
      requiresApproval: true,
      status: "approval_required",
      message: "Home SOC remediation must use the existing Home SOC approval-gated remediation pipeline.",
      executed: false,
      delegatedTo: "home_soc",
    };
  }
  return {
    entityId,
    action,
    allowed: false,
    riskTier: "not_configured",
    requiresApproval: false,
    status: "not_configured",
    message: "No configured source policy is linked to this entity. Digital Twin is read-only/proposal-only for unknown actions.",
    executed: false,
  };
}
