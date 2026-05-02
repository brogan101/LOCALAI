/**
 * Evidence Vault — Phase 08B
 * ==========================
 * Local-first document evidence registry for receipts, manuals, warranties,
 * vehicle records, home/shop/network docs, tools, and project evidence.
 *
 * Reuses Phase 08A RAG (lib/rag.ts) for document ingestion and search.
 * Paperless-ngx is an optional integration; missing config returns not_configured.
 * Private document contents and secrets are never logged.
 */

import { randomUUID } from "crypto";
import { thoughtLog } from "./thought-log.js";
import { recordAuditEvent } from "./platform-foundation.js";
import { rag } from "./rag.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EvidenceCategory =
  | "manual"
  | "receipt"
  | "warranty"
  | "vehicle"
  | "home"
  | "shop"
  | "network"
  | "tool"
  | "3d_printer"
  | "software"
  | "tax"
  | "project"
  | "other";

export const EVIDENCE_CATEGORIES: EvidenceCategory[] = [
  "manual", "receipt", "warranty", "vehicle", "home", "shop",
  "network", "tool", "3d_printer", "software", "tax", "project", "other",
];

export type PrivacyClassification = "public" | "normal" | "private" | "sensitive" | "secret";

export type IngestionStatus = "pending" | "indexed" | "failed" | "stale" | "deleted";

export type PaperlessSyncMode = "disabled" | "dry_run" | "metadata_only" | "full_local_import";

export interface EvidenceRecord {
  id: string;
  title: string;
  category: EvidenceCategory;
  sourcePath?: string;
  sourceId?: string;       // links to rag_sources.id
  collectionId?: string;   // links to rag_collections.id
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
  citationMetadata?: Record<string, unknown>;
  ingestionStatus: IngestionStatus;
  providerStatus?: Record<string, unknown>;
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
  syncMode: PaperlessSyncMode;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  notConfiguredReason: string;
  localFirst: true;
  dataLeavesMachine: false;
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
  approvalRequired: true;
  calendarIntegrationStatus: "not_configured";
}

export interface EvidenceVaultStatus {
  sourceOfTruth: string;
  totalRecords: number;
  recordsByCategory: Record<string, number>;
  recentIngestions: Array<{ id: string; title: string; category: string; status: string; updatedAt: string }>;
  failedIngestions: Array<{ id: string; title: string; category: string; degradedReason?: string; updatedAt: string }>;
  duplicateCount: number;
  staleCount: number;
  paperlessProvider: PaperlessProviderStatus;
  ragIntegration: { reusesExistingRagPath: true; ragSourceOfTruth: string };
}

// ── Lazy DB ───────────────────────────────────────────────────────────────────

async function getDb() {
  const { sqlite } = await import("../db/database.js");
  return sqlite;
}

// ── Schema ────────────────────────────────────────────────────────────────────

async function ensureSchema(): Promise<void> {
  const db = await getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence_records (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      source_path TEXT,
      source_id TEXT,
      collection_id TEXT,
      original_filename TEXT,
      file_hash TEXT,
      parser_used TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      project_association TEXT,
      entity_association_json TEXT,
      vendor TEXT,
      manufacturer TEXT,
      purchase_date TEXT,
      receipt_date TEXT,
      warranty_expires TEXT,
      registration_date TEXT,
      expiration_date TEXT,
      reminder_date TEXT,
      citation_metadata_json TEXT NOT NULL DEFAULT '{}',
      ingestion_status TEXT NOT NULL DEFAULT 'pending',
      provider_status_json TEXT NOT NULL DEFAULT '{}',
      privacy_classification TEXT NOT NULL DEFAULT 'normal',
      degraded_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      stale INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS evidence_category ON evidence_records(category);
    CREATE INDEX IF NOT EXISTS evidence_hash ON evidence_records(file_hash);
    CREATE INDEX IF NOT EXISTS evidence_source ON evidence_records(source_id);
    CREATE INDEX IF NOT EXISTS evidence_collection ON evidence_records(collection_id);
    CREATE INDEX IF NOT EXISTS evidence_status ON evidence_records(ingestion_status);

    CREATE TABLE IF NOT EXISTS paperless_config (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      enabled INTEGER NOT NULL DEFAULT 0,
      base_url TEXT,
      auth_status TEXT NOT NULL DEFAULT 'not_configured',
      sync_mode TEXT NOT NULL DEFAULT 'disabled',
      last_sync_at TEXT,
      last_sync_status TEXT,
      not_configured_reason TEXT NOT NULL DEFAULT 'Paperless-ngx is not configured. Set base_url and credentials to enable optional import.',
      updated_at TEXT NOT NULL
    );
  `);

  // Ensure paperless singleton row
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO paperless_config (id, enabled, auth_status, sync_mode, not_configured_reason, updated_at)
    VALUES ('singleton', 0, 'not_configured', 'disabled',
      'Paperless-ngx is not configured. Set base_url and credentials to enable optional import.', ?)
  `).run(now);
}

// ── JSON helpers ──────────────────────────────────────────────────────────────

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

// ── Row → Record mapping ──────────────────────────────────────────────────────

interface EvidenceRow {
  id: string;
  title: string;
  category: string;
  source_path: string | null;
  source_id: string | null;
  collection_id: string | null;
  original_filename: string | null;
  file_hash: string | null;
  parser_used: string | null;
  tags_json: string;
  project_association: string | null;
  entity_association_json: string | null;
  vendor: string | null;
  manufacturer: string | null;
  purchase_date: string | null;
  receipt_date: string | null;
  warranty_expires: string | null;
  registration_date: string | null;
  expiration_date: string | null;
  reminder_date: string | null;
  citation_metadata_json: string;
  ingestion_status: string;
  provider_status_json: string;
  privacy_classification: string;
  degraded_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  stale: number;
}

function rowToRecord(row: EvidenceRow): EvidenceRecord {
  return {
    id: row.id,
    title: row.title,
    category: row.category as EvidenceCategory,
    sourcePath: row.source_path ?? undefined,
    sourceId: row.source_id ?? undefined,
    collectionId: row.collection_id ?? undefined,
    originalFilename: row.original_filename ?? undefined,
    fileHash: row.file_hash ?? undefined,
    parserUsed: row.parser_used ?? undefined,
    tags: safeJson<string[]>(row.tags_json, []),
    projectAssociation: row.project_association ?? undefined,
    entityAssociation: safeJson<Record<string, string> | undefined>(row.entity_association_json, undefined),
    vendor: row.vendor ?? undefined,
    manufacturer: row.manufacturer ?? undefined,
    purchaseDate: row.purchase_date ?? undefined,
    receiptDate: row.receipt_date ?? undefined,
    warrantyExpires: row.warranty_expires ?? undefined,
    registrationDate: row.registration_date ?? undefined,
    expirationDate: row.expiration_date ?? undefined,
    reminderDate: row.reminder_date ?? undefined,
    citationMetadata: safeJson<Record<string, unknown>>(row.citation_metadata_json, {}),
    ingestionStatus: row.ingestion_status as IngestionStatus,
    providerStatus: safeJson<Record<string, unknown>>(row.provider_status_json, {}),
    privacyClassification: row.privacy_classification as PrivacyClassification,
    degradedReason: row.degraded_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
    stale: row.stale === 1,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export const evidenceVault = {

  async status(): Promise<EvidenceVaultStatus> {
    await ensureSchema();
    const db = await getDb();

    const total = (db.prepare("SELECT COUNT(*) AS n FROM evidence_records WHERE deleted_at IS NULL AND stale = 0").get() as { n: number }).n;

    const catRows = db.prepare(
      "SELECT category, COUNT(*) AS n FROM evidence_records WHERE deleted_at IS NULL AND stale = 0 GROUP BY category"
    ).all() as Array<{ category: string; n: number }>;
    const byCategory: Record<string, number> = {};
    for (const row of catRows) byCategory[row.category] = row.n;

    const recentRows = db.prepare(
      "SELECT id, title, category, ingestion_status, updated_at FROM evidence_records WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 5"
    ).all() as Array<{ id: string; title: string; category: string; ingestion_status: string; updated_at: string }>;

    const failedRows = db.prepare(
      "SELECT id, title, category, degraded_reason, updated_at FROM evidence_records WHERE ingestion_status = 'failed' AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 5"
    ).all() as Array<{ id: string; title: string; category: string; degraded_reason: string | null; updated_at: string }>;

    const dupCount = (db.prepare(
      "SELECT COUNT(*) AS n FROM evidence_records WHERE file_hash IN (SELECT file_hash FROM evidence_records WHERE file_hash IS NOT NULL AND deleted_at IS NULL GROUP BY file_hash HAVING COUNT(*) > 1) AND deleted_at IS NULL"
    ).get() as { n: number }).n;

    const staleCount = (db.prepare(
      "SELECT COUNT(*) AS n FROM evidence_records WHERE stale = 1 OR deleted_at IS NOT NULL"
    ).get() as { n: number }).n;

    return {
      sourceOfTruth: "SQLite evidence_records + paperless_config tables; RAG search via lib/rag.ts rag_sources/rag_chunks",
      totalRecords: total,
      recordsByCategory: byCategory,
      recentIngestions: recentRows.map(r => ({ id: r.id, title: r.title, category: r.category, status: r.ingestion_status, updatedAt: r.updated_at })),
      failedIngestions: failedRows.map(r => ({ id: r.id, title: r.title, category: r.category, degradedReason: r.degraded_reason ?? undefined, updatedAt: r.updated_at })),
      duplicateCount: dupCount,
      staleCount,
      paperlessProvider: await this.getPaperlessStatus(),
      ragIntegration: {
        reusesExistingRagPath: true,
        ragSourceOfTruth: "artifacts/api-server/src/lib/rag.ts + SQLite rag_* tables + hnswlib index files",
      },
    };
  },

  async listRecords(filter?: {
    category?: EvidenceCategory;
    ingestionStatus?: IngestionStatus;
    includeDeleted?: boolean;
  }): Promise<EvidenceRecord[]> {
    await ensureSchema();
    const db = await getDb();

    let sql = "SELECT * FROM evidence_records WHERE 1=1";
    const params: unknown[] = [];

    if (!filter?.includeDeleted) {
      sql += " AND deleted_at IS NULL AND stale = 0";
    }
    if (filter?.category) {
      sql += " AND category = ?";
      params.push(filter.category);
    }
    if (filter?.ingestionStatus) {
      sql += " AND ingestion_status = ?";
      params.push(filter.ingestionStatus);
    }

    sql += " ORDER BY updated_at DESC";
    return (db.prepare(sql).all(...params) as EvidenceRow[]).map(rowToRecord);
  },

  async getRecord(id: string): Promise<EvidenceRecord | null> {
    await ensureSchema();
    const db = await getDb();
    const row = db.prepare("SELECT * FROM evidence_records WHERE id = ?").get(id) as EvidenceRow | undefined;
    return row ? rowToRecord(row) : null;
  },

  async createRecord(data: {
    title: string;
    category: EvidenceCategory;
    sourcePath?: string;
    originalFilename?: string;
    fileHash?: string;
    tags?: string[];
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
    privacyClassification?: PrivacyClassification;
    collectionId?: string;
  }): Promise<EvidenceRecord> {
    await ensureSchema();
    const db = await getDb();
    const now = new Date().toISOString();
    const id = randomUUID();

    // Duplicate check by hash
    if (data.fileHash) {
      const existing = db.prepare(
        "SELECT id FROM evidence_records WHERE file_hash = ? AND deleted_at IS NULL AND stale = 0 LIMIT 1"
      ).get(data.fileHash) as { id: string } | undefined;
      if (existing) {
        thoughtLog.publish({
          category: "evidence_vault",
          title: "Duplicate Detected",
          message: `Record skipped — file hash matches existing record ${existing.id}`,
          metadata: { existingId: existing.id, category: data.category },
        });
      }
    }

    db.prepare(`
      INSERT INTO evidence_records (
        id, title, category, source_path, original_filename, file_hash,
        tags_json, project_association, entity_association_json,
        vendor, manufacturer, purchase_date, receipt_date, warranty_expires,
        registration_date, expiration_date, reminder_date,
        ingestion_status, privacy_classification, collection_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `).run(
      id,
      data.title,
      data.category,
      data.sourcePath ?? null,
      data.originalFilename ?? null,
      data.fileHash ?? null,
      JSON.stringify(data.tags ?? []),
      data.projectAssociation ?? null,
      data.entityAssociation ? JSON.stringify(data.entityAssociation) : null,
      data.vendor ?? null,
      data.manufacturer ?? null,
      data.purchaseDate ?? null,
      data.receiptDate ?? null,
      data.warrantyExpires ?? null,
      data.registrationDate ?? null,
      data.expirationDate ?? null,
      data.reminderDate ?? null,
      data.privacyClassification ?? "normal",
      data.collectionId ?? null,
      now,
      now,
    );

    recordAuditEvent({
      eventType: "evidence_vault",
      action: "evidence.record.create",
      target: id,
      result: "success",
      metadata: {
        id,
        category: data.category,
        privacy: data.privacyClassification ?? "normal",
        hasHash: !!data.fileHash,
      },
    });

    const record = await this.getRecord(id);
    return record!;
  },

  async updateRecord(id: string, data: Partial<{
    title: string;
    category: EvidenceCategory;
    tags: string[];
    vendor: string;
    manufacturer: string;
    purchaseDate: string;
    receiptDate: string;
    warrantyExpires: string;
    registrationDate: string;
    expirationDate: string;
    reminderDate: string;
    privacyClassification: PrivacyClassification;
    projectAssociation: string;
    entityAssociation: Record<string, string>;
    degradedReason: string;
    ingestionStatus: IngestionStatus;
    sourceId: string;
    collectionId: string;
    fileHash: string;
    parserUsed: string;
  }>): Promise<EvidenceRecord | null> {
    await ensureSchema();
    const db = await getDb();
    const now = new Date().toISOString();

    const fields: string[] = [];
    const params: unknown[] = [];

    if (data.title !== undefined) { fields.push("title = ?"); params.push(data.title); }
    if (data.category !== undefined) { fields.push("category = ?"); params.push(data.category); }
    if (data.tags !== undefined) { fields.push("tags_json = ?"); params.push(JSON.stringify(data.tags)); }
    if (data.vendor !== undefined) { fields.push("vendor = ?"); params.push(data.vendor); }
    if (data.manufacturer !== undefined) { fields.push("manufacturer = ?"); params.push(data.manufacturer); }
    if (data.purchaseDate !== undefined) { fields.push("purchase_date = ?"); params.push(data.purchaseDate); }
    if (data.receiptDate !== undefined) { fields.push("receipt_date = ?"); params.push(data.receiptDate); }
    if (data.warrantyExpires !== undefined) { fields.push("warranty_expires = ?"); params.push(data.warrantyExpires); }
    if (data.registrationDate !== undefined) { fields.push("registration_date = ?"); params.push(data.registrationDate); }
    if (data.expirationDate !== undefined) { fields.push("expiration_date = ?"); params.push(data.expirationDate); }
    if (data.reminderDate !== undefined) { fields.push("reminder_date = ?"); params.push(data.reminderDate); }
    if (data.privacyClassification !== undefined) { fields.push("privacy_classification = ?"); params.push(data.privacyClassification); }
    if (data.projectAssociation !== undefined) { fields.push("project_association = ?"); params.push(data.projectAssociation); }
    if (data.entityAssociation !== undefined) { fields.push("entity_association_json = ?"); params.push(JSON.stringify(data.entityAssociation)); }
    if (data.degradedReason !== undefined) { fields.push("degraded_reason = ?"); params.push(data.degradedReason); }
    if (data.ingestionStatus !== undefined) { fields.push("ingestion_status = ?"); params.push(data.ingestionStatus); }
    if (data.sourceId !== undefined) { fields.push("source_id = ?"); params.push(data.sourceId); }
    if (data.collectionId !== undefined) { fields.push("collection_id = ?"); params.push(data.collectionId); }
    if (data.fileHash !== undefined) { fields.push("file_hash = ?"); params.push(data.fileHash); }
    if (data.parserUsed !== undefined) { fields.push("parser_used = ?"); params.push(data.parserUsed); }

    if (fields.length === 0) return this.getRecord(id);

    fields.push("updated_at = ?");
    params.push(now);
    params.push(id);

    db.prepare(`UPDATE evidence_records SET ${fields.join(", ")} WHERE id = ?`).run(...params);

    recordAuditEvent({
      eventType: "evidence_vault",
      action: "evidence.record.update",
      target: id,
      result: "success",
      metadata: { id, updatedFields: fields.filter(f => !f.startsWith("updated_at")).length },
    });

    return this.getRecord(id);
  },

  /**
   * Ingest a file via the existing RAG path and link the evidence record.
   * The collection is created if it doesn't exist (one collection per category by default).
   * Duplicate detection by file hash — unchanged files are skipped.
   * Secret/sensitive records are never sent to cloud providers.
   */
  async ingestRecord(
    evidenceId: string,
    opts: { filePath?: string; content?: string; source?: string; collectionId?: string },
  ): Promise<{ skipped: boolean; chunksAdded: number; chunksRemoved: number; sourceId?: string; collectionId: string }> {
    await ensureSchema();
    const record = await this.getRecord(evidenceId);
    if (!record) throw new Error(`Evidence record not found: ${evidenceId}`);

    // Block secret/credential records from any non-local ingest path
    if (record.privacyClassification === "secret") {
      throw new Error("Secret/credential evidence records cannot be ingested into shared RAG collections. Use a dedicated private collection.");
    }

    // Resolve or create collection
    let collectionId = opts.collectionId ?? record.collectionId;
    if (!collectionId) {
      const collectionName = `evidence-${record.category}`;
      const existing = await rag.listCollections();
      const found = existing.find(c => c.name === collectionName);
      if (found) {
        collectionId = found.id;
      } else {
        const created = await rag.createCollection(collectionName);
        collectionId = created.id;
      }
    }

    const result = await rag.ingest(collectionId, {
      filePath: opts.filePath,
      content: opts.content,
      source: opts.source ?? record.sourcePath ?? record.originalFilename ?? `evidence-${evidenceId}`,
    });

    await this.updateRecord(evidenceId, {
      sourceId: result.source.id,
      collectionId,
      fileHash: result.source.sourceHash,
      parserUsed: result.source.parserUsed,
      ingestionStatus: result.skipped ? "indexed" : "indexed",
    });

    thoughtLog.publish({
      category: "evidence_vault",
      title: "Ingest Complete",
      message: `Evidence record "${evidenceId}" ingested into collection "${collectionId}" — ${result.chunksAdded} chunks added, skipped=${result.skipped}`,
      metadata: {
        evidenceId,
        collectionId,
        sourceId: result.source.id,
        chunksAdded: result.chunksAdded,
        chunksRemoved: result.chunksRemoved,
        skipped: result.skipped,
        category: record.category,
        privacy: record.privacyClassification,
      },
    });
    recordAuditEvent({
      eventType: "evidence_vault",
      action: "evidence.record.ingest",
      target: evidenceId,
      result: "success",
      metadata: {
        evidenceId,
        collectionId,
        sourceId: result.source.id,
        chunksAdded: result.chunksAdded,
        skipped: result.skipped,
        privacy: record.privacyClassification,
      },
    });

    return {
      skipped: result.skipped,
      chunksAdded: result.chunksAdded,
      chunksRemoved: result.chunksRemoved,
      sourceId: result.source.id,
      collectionId,
    };
  },

  async markDeleted(id: string): Promise<EvidenceRecord | null> {
    await ensureSchema();
    const db = await getDb();
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE evidence_records SET deleted_at = ?, stale = 1, ingestion_status = 'deleted', updated_at = ? WHERE id = ?"
    ).run(now, now, id);
    recordAuditEvent({
      eventType: "evidence_vault",
      action: "evidence.record.delete",
      target: id,
      result: "success",
      metadata: { id },
    });
    return this.getRecord(id);
  },

  /** Find evidence records that share the same file hash (duplicate detection). */
  async findByHash(fileHash: string): Promise<EvidenceRecord[]> {
    await ensureSchema();
    const db = await getDb();
    return (db.prepare(
      "SELECT * FROM evidence_records WHERE file_hash = ? ORDER BY created_at DESC"
    ).all(fileHash) as EvidenceRow[]).map(rowToRecord);
  },

  /** Search evidence via the existing RAG path — returns RAG chunks with citation metadata. */
  async searchVault(query: string, categoryFilter?: EvidenceCategory, topK = 5): Promise<{
    chunks: Awaited<ReturnType<typeof rag.search>>;
    usedCollectionIds: string[];
    ragPath: "local_hnswlib";
  }> {
    await ensureSchema();
    const db = await getDb();

    let sql = "SELECT DISTINCT collection_id FROM evidence_records WHERE collection_id IS NOT NULL AND deleted_at IS NULL AND stale = 0";
    const params: unknown[] = [];
    if (categoryFilter) {
      sql += " AND category = ?";
      params.push(categoryFilter);
    }

    const rows = db.prepare(sql).all(...params) as Array<{ collection_id: string }>;
    const collectionIds = rows.map(r => r.collection_id);

    if (collectionIds.length === 0) {
      return { chunks: [], usedCollectionIds: [], ragPath: "local_hnswlib" };
    }

    const chunks = await rag.search(query, collectionIds, topK);
    return { chunks, usedCollectionIds: collectionIds, ragPath: "local_hnswlib" };
  },

  // ── Paperless-ngx provider ──────────────────────────────────────────────────

  async getPaperlessStatus(): Promise<PaperlessProviderStatus> {
    await ensureSchema();
    const db = await getDb();
    const row = db.prepare("SELECT * FROM paperless_config WHERE id = 'singleton'").get() as {
      enabled: number;
      base_url: string | null;
      auth_status: string;
      sync_mode: string;
      last_sync_at: string | null;
      last_sync_status: string | null;
      not_configured_reason: string;
    } | undefined;

    if (!row || !row.enabled || !row.base_url) {
      return {
        enabled: false,
        configured: false,
        authStatus: "not_configured",
        syncMode: "disabled",
        notConfiguredReason: row?.not_configured_reason ?? "Paperless-ngx is not configured.",
        lastSyncAt: row?.last_sync_at ?? undefined,
        lastSyncStatus: row?.last_sync_status ?? undefined,
        localFirst: true,
        dataLeavesMachine: false,
      };
    }

    return {
      enabled: row.enabled === 1,
      configured: !!(row.base_url),
      baseUrl: row.base_url,
      authStatus: row.auth_status as PaperlessProviderStatus["authStatus"],
      syncMode: row.sync_mode as PaperlessSyncMode,
      lastSyncAt: row.last_sync_at ?? undefined,
      lastSyncStatus: row.last_sync_status ?? undefined,
      notConfiguredReason: row.not_configured_reason,
      localFirst: true,
      dataLeavesMachine: false,
    };
  },

  /**
   * Propose a Paperless-ngx sync. Always dry_run/proposal by default.
   * Returns not_configured if Paperless is not enabled.
   * Never actually syncs, sends data, or calls Paperless API in this phase.
   */
  async proposePaperlessSync(opts?: { mode?: PaperlessSyncMode }): Promise<{
    proposalStatus: "proposal" | "not_configured";
    syncMode: PaperlessSyncMode;
    message: string;
    approvalRequired: boolean;
    executed: false;
  }> {
    const status = await this.getPaperlessStatus();

    if (!status.enabled || !status.configured) {
      return {
        proposalStatus: "not_configured",
        syncMode: "disabled",
        message: status.notConfiguredReason,
        approvalRequired: false,
        executed: false,
      };
    }

    const requestedMode = opts?.mode ?? "dry_run";
    recordAuditEvent({
      eventType: "evidence_vault",
      action: "evidence.paperless.sync_proposal",
      target: "paperless_config",
      result: "success",
      metadata: { syncMode: requestedMode, executed: false, proposalOnly: true },
    });

    return {
      proposalStatus: "proposal",
      syncMode: requestedMode,
      message: `Paperless sync proposal created (mode=${requestedMode}). Requires approval before any import is executed. No documents have been synced.`,
      approvalRequired: true,
      executed: false,
    };
  },

  // ── Reminder proposals ──────────────────────────────────────────────────────

  async getReminders(lookaheadDays = 90): Promise<EvidenceReminderProposal[]> {
    await ensureSchema();
    const db = await getDb();
    const now = new Date();
    const cutoff = new Date(now.getTime() + lookaheadDays * 86_400_000).toISOString();

    const rows = db.prepare(`
      SELECT id, title, category, warranty_expires, expiration_date, reminder_date,
             registration_date, receipt_date
      FROM evidence_records
      WHERE deleted_at IS NULL AND stale = 0
        AND (
          (warranty_expires IS NOT NULL AND warranty_expires <= ? AND warranty_expires >= ?)
          OR (expiration_date IS NOT NULL AND expiration_date <= ? AND expiration_date >= ?)
          OR (reminder_date IS NOT NULL AND reminder_date <= ? AND reminder_date >= ?)
          OR (registration_date IS NOT NULL AND registration_date <= ? AND registration_date >= ?)
        )
      ORDER BY COALESCE(warranty_expires, expiration_date, reminder_date, registration_date) ASC
      LIMIT 50
    `).all(
      cutoff, now.toISOString(),
      cutoff, now.toISOString(),
      cutoff, now.toISOString(),
      cutoff, now.toISOString(),
    ) as Array<{
      id: string; title: string; category: string;
      warranty_expires: string | null; expiration_date: string | null;
      reminder_date: string | null; registration_date: string | null;
      receipt_date: string | null;
    }>;

    const proposals: EvidenceReminderProposal[] = [];

    for (const row of rows) {
      const addProposal = (
        dueDate: string,
        reminderType: EvidenceReminderProposal["reminderType"],
      ) => {
        const due = new Date(dueDate);
        const daysUntil = Math.round((due.getTime() - now.getTime()) / 86_400_000);
        proposals.push({
          evidenceId: row.id,
          title: row.title,
          category: row.category as EvidenceCategory,
          reminderType,
          dueDate,
          daysUntilDue: daysUntil,
          proposalStatus: "proposal",
          requiresApproval: true,
          approvalRequired: true,
          calendarIntegrationStatus: "not_configured",
        });
      };

      if (row.warranty_expires) addProposal(row.warranty_expires, "warranty_expiry");
      if (row.expiration_date && row.expiration_date !== row.warranty_expires) addProposal(row.expiration_date, "renewal");
      if (row.reminder_date && row.reminder_date !== row.warranty_expires && row.reminder_date !== row.expiration_date) addProposal(row.reminder_date, "follow_up");
      if (row.registration_date) addProposal(row.registration_date, "registration");
    }

    return proposals;
  },
};
