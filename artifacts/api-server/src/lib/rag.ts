/**
 * RAG — Retrieval-Augmented Generation via hnswlib-node + SQLite
 * ==============================================================
 * Pure TypeScript, no Python required.
 * Embeddings: Ollama nomic-embed-text /api/embeddings
 * Index: HNSW (hnswlib-node) per collection, persisted to disk
 * Metadata: SQLite rag_chunks table
 *
 * Functions:
 *   ingest(collectionId, filePath | content) — chunks → embed → index
 *   search(query, collectionIds, topK)        — embed → cosine → top-K
 */

import { createRequire } from "module";
import path from "path";
import os from "os";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { createHash, randomUUID } from "crypto";
import { fetchJson } from "./runtime.js";
import { getOllamaUrl } from "./ollama-url.js";
import { thoughtLog } from "./thought-log.js";
import { stackModel } from "../config/models.config.js";
import { recordAuditEvent } from "./platform-foundation.js";

// ── Lazy hnswlib-node ─────────────────────────────────────────────────────────

const _require = createRequire(import.meta.url);

function getHnswlib() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return _require("hnswlib-node") as {
    HierarchicalNSW: new (space: string, dim: number) => HnswIndex;
  };
}

interface HnswIndex {
  initIndex(maxElements: number, efConstruction?: number, M?: number): void;
  addPoint(point: number[], label: number): void;
  searchKnn(query: number[], k: number): { neighbors: number[]; distances: number[] };
  writeIndex(path: string): void;
  readIndex(path: string): void;
  getCurrentCount(): number;
  getMaxElements(): number;
  resizeIndex(newSize: number): void;
}

// ── Lazy DB import ────────────────────────────────────────────────────────────

async function getDb() {
  const { sqlite } = await import("../db/database.js");
  return sqlite;
}

// ── Paths ─────────────────────────────────────────────────────────────────────

const RAG_DIR = path.join(os.homedir(), "LocalAI-Tools", "rag");

function collectionDir(collectionId: string): string {
  return path.join(RAG_DIR, collectionId);
}

function indexPath(collectionId: string): string {
  return path.join(collectionDir(collectionId), "index.hnsw");
}

function metaPath(collectionId: string): string {
  return path.join(collectionDir(collectionId), "meta.json");
}

// ── Collection meta ───────────────────────────────────────────────────────────

interface CollectionMeta {
  id: string;
  name: string;
  dim: number;
  count: number;
  createdAt: string;
  updatedAt: string;
  vectorProvider: string;
}

async function loadMeta(collectionId: string): Promise<CollectionMeta | null> {
  const p = metaPath(collectionId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(await readFile(p, "utf-8")) as CollectionMeta;
  } catch {
    return null;
  }
}

async function saveMeta(meta: CollectionMeta): Promise<void> {
  await mkdir(collectionDir(meta.id), { recursive: true });
  await writeFile(metaPath(meta.id), JSON.stringify(meta, null, 2), "utf-8");
}

// ── SQLite helpers (lazy DDL) ─────────────────────────────────────────────────

async function ensureSchema(): Promise<void> {
  const db = await getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_collections (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      vector_provider TEXT NOT NULL DEFAULT 'hnswlib',
      provider_status_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS rag_sources (
      id                   TEXT PRIMARY KEY,
      collection_id        TEXT NOT NULL,
      source               TEXT NOT NULL,
      source_path          TEXT,
      source_hash          TEXT NOT NULL,
      parser_used          TEXT NOT NULL,
      chunk_count          INTEGER NOT NULL DEFAULT 0,
      citation_metadata_json TEXT NOT NULL DEFAULT '{}',
      provider_status_json TEXT NOT NULL DEFAULT '{}',
      status               TEXT NOT NULL DEFAULT 'indexed',
      updated_at           TEXT NOT NULL,
      deleted_at           TEXT
    );
    CREATE TABLE IF NOT EXISTS rag_chunks (
      id            TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL,
      source_id     TEXT,
      label         INTEGER NOT NULL,
      source        TEXT NOT NULL,
      chunk_index   INTEGER NOT NULL,
      text          TEXT NOT NULL,
      embedding_json TEXT,
      citation_metadata_json TEXT NOT NULL DEFAULT '{}',
      provider_status_json TEXT NOT NULL DEFAULT '{}',
      stale          INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL,
      updated_at    TEXT,
      deleted_at    TEXT
    );
    CREATE INDEX IF NOT EXISTS rag_chunks_collection ON rag_chunks(collection_id);
    CREATE INDEX IF NOT EXISTS rag_chunks_label      ON rag_chunks(collection_id, label);
    CREATE INDEX IF NOT EXISTS rag_sources_collection_source ON rag_sources(collection_id, source);
  `);
  for (const [table, column, ddl] of [
    ["rag_collections", "updated_at", "TEXT"],
    ["rag_collections", "vector_provider", "TEXT NOT NULL DEFAULT 'hnswlib'"],
    ["rag_collections", "provider_status_json", "TEXT NOT NULL DEFAULT '{}'"],
    ["rag_chunks", "source_id", "TEXT"],
    ["rag_chunks", "embedding_json", "TEXT"],
    ["rag_chunks", "citation_metadata_json", "TEXT NOT NULL DEFAULT '{}'"],
    ["rag_chunks", "provider_status_json", "TEXT NOT NULL DEFAULT '{}'"],
    ["rag_chunks", "stale", "INTEGER NOT NULL DEFAULT 0"],
    ["rag_chunks", "updated_at", "TEXT"],
    ["rag_chunks", "deleted_at", "TEXT"],
  ] as const) {
    const existing = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!existing.some((entry) => entry.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }
  }
  db.exec("CREATE INDEX IF NOT EXISTS rag_chunks_source ON rag_chunks(source_id)");
}

// ── Embedding ─────────────────────────────────────────────────────────────────

const EMBED_MODEL = stackModel("embedding"); // nomic-embed-text

let embedderOverride: ((text: string) => Promise<number[]>) | null = null;

async function embed(text: string): Promise<number[]> {
  if (embedderOverride) return embedderOverride(text);
  const base = await getOllamaUrl();
  const data = await fetchJson<{ embedding: number[] }>(
    `${base}/api/embeddings`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
    },
    15000,
  );
  if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
    throw new Error("Embedding returned empty vector");
  }
  return data.embedding;
}

// ── Chunking ──────────────────────────────────────────────────────────────────

const CHUNK_TOKENS = 512;
const OVERLAP_TOKENS = 64;

function roughTokenCount(text: string): number {
  // ~4 chars per token is a reasonable approximation
  return Math.ceil(text.length / 4);
}

function chunkText(text: string): string[] {
  const words = text.split(/\s+/);
  const chunkWords = CHUNK_TOKENS * 4 / 1; // char-based
  const overlapWords = OVERLAP_TOKENS * 4 / 1;

  // Use character-based chunking for simplicity + accuracy
  const charChunk  = CHUNK_TOKENS  * 4;
  const charOverlap = OVERLAP_TOKENS * 4;

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + charChunk, text.length);
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = end - charOverlap;
  }
  return chunks.filter(c => c.length > 20); // skip trivial chunks
}

function sha256(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

type ProviderState = "available" | "unavailable" | "not_configured" | "not_installed" | "degraded";

export interface RagProviderStatus {
  id: string;
  displayName: string;
  kind: "ingestion" | "vector";
  status: ProviderState;
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

export interface RagProviderSnapshot {
  sourceOfTruth: string;
  ingestion: RagProviderStatus[];
  vectorStores: RagProviderStatus[];
  defaults: {
    ingestionProvider: "builtin";
    vectorStore: "hnswlib";
    localFirst: true;
    externalProvidersDisabledByDefault: true;
  };
}

export interface RagSourceRecord {
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

function builtInProviderStatus(): RagProviderStatus {
  return {
    id: "builtin",
    displayName: "Built-in LOCALAI parser",
    kind: "ingestion",
    status: "available",
    default: true,
    configured: true,
    localFirst: true,
    dataLeavesMachine: false,
    startupPolicy: "on_demand",
    supportedExtensions: [".txt", ".md", ".json", ".ts", ".js", ".py", ".pdf", ".docx"],
  };
}

function optionalProviderStatus(id: string, displayName: string, kind: "ingestion" | "vector", reason: string): RagProviderStatus {
  return {
    id,
    displayName,
    kind,
    status: "not_configured",
    default: false,
    configured: false,
    localFirst: true,
    dataLeavesMachine: false,
    startupPolicy: "disabled",
    reason,
  };
}

function providerSnapshot(): RagProviderSnapshot {
  return {
    sourceOfTruth: "artifacts/api-server/src/lib/rag.ts + SQLite rag_* tables + hnswlib index files",
    ingestion: [
      builtInProviderStatus(),
      optionalProviderStatus("markitdown", "MarkItDown adapter", "ingestion", "Adapter is optional and not configured; local files are not sent anywhere."),
      optionalProviderStatus("docling", "Docling adapter", "ingestion", "Adapter is optional and not configured; Python/service dependency is not required by default tests."),
      optionalProviderStatus("ocr", "OCR provider", "ingestion", "OCR tooling is optional and not configured; missing OCR never blocks the built-in parser."),
    ],
    vectorStores: [
      {
        id: "hnswlib",
        displayName: "hnswlib local vector index",
        kind: "vector",
        status: "available",
        default: true,
        configured: true,
        localFirst: true,
        dataLeavesMachine: false,
        startupPolicy: "on_demand",
        reason: "Default embedded vector store used by existing LOCALAI RAG.",
      },
      optionalProviderStatus("lancedb", "LanceDB vector store", "vector", "Optional vector store is not configured; hnswlib remains active."),
      optionalProviderStatus("qdrant", "Qdrant vector store", "vector", "Optional service is not configured; no Docker/service is required."),
    ],
    defaults: {
      ingestionProvider: "builtin",
      vectorStore: "hnswlib",
      localFirst: true,
      externalProvidersDisabledByDefault: true,
    },
  };
}

// ── File reading helpers ──────────────────────────────────────────────────────

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = _require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
    const buf = await readFile(filePath);
    const result = await pdfParse(buf);
    return result.text;
  }

  if (ext === ".docx") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = _require("mammoth") as {
      extractRawText: (opts: { path: string }) => Promise<{ value: string }>;
    };
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  // txt, md, ts, js, py, etc.
  return readFile(filePath, "utf-8");
}

function citationForSource(input: { source: string; filePath?: string; content?: string }): RagCitationMetadata {
  const file = input.filePath ? path.basename(input.filePath) : undefined;
  const lineCount = input.content ? input.content.split(/\r?\n/).length : "unavailable";
  return {
    file,
    path: input.filePath,
    page: "unavailable",
    section: "unavailable",
    lineStart: typeof lineCount === "number" ? 1 : "unavailable",
    lineEnd: typeof lineCount === "number" ? lineCount : "unavailable",
  };
}

// ── HNSW index management ─────────────────────────────────────────────────────

const HNSW_DIM = 768; // nomic-embed-text dimension
const HNSW_MAX_INIT = 1000;
const HNSW_EF = 200;
const HNSW_M  = 16;

async function loadOrCreateIndex(collectionId: string, dim: number): Promise<HnswIndex> {
  const lib = getHnswlib();
  const idx = new lib.HierarchicalNSW("cosine", dim);
  const idxFile = indexPath(collectionId);
  await mkdir(collectionDir(collectionId), { recursive: true });
  if (existsSync(idxFile)) {
    idx.readIndex(idxFile);
  } else {
    idx.initIndex(HNSW_MAX_INIT, HNSW_EF, HNSW_M);
  }
  return idx;
}

async function createEmptyIndex(collectionId: string, dim: number, maxElements: number): Promise<HnswIndex> {
  const lib = getHnswlib();
  const idx = new lib.HierarchicalNSW("cosine", dim);
  await mkdir(collectionDir(collectionId), { recursive: true });
  idx.initIndex(Math.max(HNSW_MAX_INIT, maxElements + 100), HNSW_EF, HNSW_M);
  return idx;
}

async function rebuildCollectionIndex(collectionId: string, dim: number): Promise<number> {
  const db = await getDb();
  const rows = db.prepare(
    "SELECT id, embedding_json FROM rag_chunks WHERE collection_id = ? AND deleted_at IS NULL AND stale = 0 ORDER BY created_at ASC, chunk_index ASC"
  ).all(collectionId) as Array<{ id: string; embedding_json: string | null }>;
  const idx = await createEmptyIndex(collectionId, dim, rows.length);
  const update = db.prepare("UPDATE rag_chunks SET label = ?, updated_at = ? WHERE id = ?");
  const now = new Date().toISOString();
  let label = 0;
  for (const row of rows) {
    const vec = safeJsonParse<number[]>(row.embedding_json, []);
    if (vec.length !== dim) continue;
    idx.addPoint(vec, label);
    update.run(label, now, row.id);
    label += 1;
  }
  idx.writeIndex(indexPath(collectionId));
  const meta = await loadMeta(collectionId);
  if (meta) {
    meta.count = label;
    meta.updatedAt = now;
    await saveMeta(meta);
  }
  db.prepare("UPDATE rag_collections SET updated_at = ? WHERE id = ?").run(now, collectionId);
  return label;
}

// ── Public API ────────────────────────────────────────────────────────────────

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

export interface RagCollection {
  id:        string;
  name:      string;
  chunkCount: number;
  sourceCount: number;
  vectorProvider: string;
  providerStatus: RagProviderStatus;
  createdAt: string;
  updatedAt?: string;
}

export const rag = {
  providerStatus(): RagProviderSnapshot {
    return providerSnapshot();
  },

  async createCollection(name: string): Promise<RagCollection> {
    await ensureSchema();
    const db = await getDb();
    const id  = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO rag_collections (id, name, created_at, updated_at, vector_provider, provider_status_json) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, name, now, now, "hnswlib", JSON.stringify(providerSnapshot().vectorStores[0]));
    await mkdir(collectionDir(id), { recursive: true });
    const meta: CollectionMeta = { id, name, dim: HNSW_DIM, count: 0, createdAt: now, updatedAt: now, vectorProvider: "hnswlib" };
    await saveMeta(meta);
    thoughtLog.publish({ category: "rag", title: "Collection Created", message: `"${name}" (${id})` });
    return {
      id,
      name,
      chunkCount: 0,
      sourceCount: 0,
      vectorProvider: "hnswlib",
      providerStatus: providerSnapshot().vectorStores[0],
      createdAt: now,
      updatedAt: now,
    };
  },

  async listCollections(): Promise<RagCollection[]> {
    await ensureSchema();
    const db = await getDb();
    return (db.prepare(`
      SELECT c.id, c.name, c.created_at, c.updated_at, c.vector_provider, c.provider_status_json,
        COUNT(DISTINCT CASE WHEN s.deleted_at IS NULL THEN s.id END) AS source_count,
        COUNT(CASE WHEN ch.deleted_at IS NULL AND ch.stale = 0 THEN ch.id END) AS chunk_count
      FROM rag_collections c
      LEFT JOIN rag_sources s ON s.collection_id = c.id
      LEFT JOIN rag_chunks ch ON ch.collection_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `).all() as Array<{
      id: string; name: string; created_at: string; updated_at: string | null; vector_provider: string | null;
      provider_status_json: string | null; source_count: number; chunk_count: number;
    }>).map(r => ({
      id: r.id,
      name: r.name,
      chunkCount: r.chunk_count,
      sourceCount: r.source_count,
      vectorProvider: r.vector_provider ?? "hnswlib",
      providerStatus: safeJsonParse<RagProviderStatus>(r.provider_status_json, providerSnapshot().vectorStores[0]),
      createdAt: r.created_at,
      updatedAt: r.updated_at ?? undefined,
    }));
  },

  async listSources(collectionId: string): Promise<RagSourceRecord[]> {
    await ensureSchema();
    const db = await getDb();
    return (db.prepare(`
      SELECT id, collection_id, source, source_path, source_hash, parser_used, chunk_count,
        citation_metadata_json, provider_status_json, status, updated_at, deleted_at
      FROM rag_sources
      WHERE collection_id = ?
      ORDER BY updated_at DESC
    `).all(collectionId) as Array<{
      id: string; collection_id: string; source: string; source_path: string | null; source_hash: string;
      parser_used: string; chunk_count: number; citation_metadata_json: string; provider_status_json: string;
      status: RagSourceRecord["status"]; updated_at: string; deleted_at: string | null;
    }>).map(row => ({
      id: row.id,
      collectionId: row.collection_id,
      source: row.source,
      sourcePath: row.source_path ?? undefined,
      sourceHash: row.source_hash,
      parserUsed: row.parser_used,
      chunkCount: row.chunk_count,
      citation: safeJsonParse<RagCitationMetadata>(row.citation_metadata_json, {}),
      providerStatus: safeJsonParse<RagProviderStatus>(row.provider_status_json, builtInProviderStatus()),
      status: row.status,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? undefined,
    }));
  },

  async listChunks(collectionId: string, sourceId?: string, limit = 50): Promise<RagChunk[]> {
    await ensureSchema();
    const db = await getDb();
    const rows = sourceId
      ? db.prepare(`
          SELECT id, collection_id, source_id, source, chunk_index, text, citation_metadata_json
          FROM rag_chunks
          WHERE collection_id = ? AND source_id = ? AND deleted_at IS NULL AND stale = 0
          ORDER BY chunk_index ASC
          LIMIT ?
        `).all(collectionId, sourceId, limit)
      : db.prepare(`
          SELECT id, collection_id, source_id, source, chunk_index, text, citation_metadata_json
          FROM rag_chunks
          WHERE collection_id = ? AND deleted_at IS NULL AND stale = 0
          ORDER BY created_at DESC
          LIMIT ?
        `).all(collectionId, limit);
    return (rows as Array<{
      id: string; collection_id: string; source_id: string | null; source: string; chunk_index: number; text: string; citation_metadata_json: string;
    }>).map(row => ({
      id: row.id,
      collectionId: row.collection_id,
      sourceId: row.source_id ?? undefined,
      source: row.source,
      chunkIndex: row.chunk_index,
      text: row.text,
      score: 1,
      citation: safeJsonParse<RagCitationMetadata>(row.citation_metadata_json, {}),
    }));
  },

  async deleteCollection(collectionId: string): Promise<void> {
    await ensureSchema();
    const db = await getDb();
    db.prepare("DELETE FROM rag_chunks WHERE collection_id = ?").run(collectionId);
    db.prepare("DELETE FROM rag_sources WHERE collection_id = ?").run(collectionId);
    db.prepare("DELETE FROM rag_collections WHERE id = ?").run(collectionId);
    // Remove HNSW files
    const { rm } = await import("fs/promises");
    await rm(collectionDir(collectionId), { recursive: true, force: true });
    thoughtLog.publish({ category: "rag", title: "Collection Deleted", message: collectionId });
  },

  async ingest(
    collectionId: string,
    opts: { filePath?: string; content?: string; source?: string },
  ): Promise<{ chunksAdded: number; chunksRemoved: number; skipped: boolean; source: RagSourceRecord; providerStatus: RagProviderStatus; vectorProviderStatus: RagProviderStatus }> {
    await ensureSchema();

    const text = opts.content
      ? opts.content
      : opts.filePath
      ? await extractText(opts.filePath)
      : (() => { throw new Error("filePath or content required"); })();

    const source = opts.source ?? opts.filePath ?? "inline";
    const sourceHash = sha256(text);
    const citation = citationForSource({ source, filePath: opts.filePath, content: text });
    const parserStatus = builtInProviderStatus();
    const vectorStatus = providerSnapshot().vectorStores[0];
    const db  = await getDb();
    const now = new Date().toISOString();
    const existingSource = db.prepare(
      "SELECT id, source_hash, chunk_count FROM rag_sources WHERE collection_id = ? AND source = ? ORDER BY updated_at DESC LIMIT 1"
    ).get(collectionId, source) as { id: string; source_hash: string; chunk_count: number } | undefined;

    if (existingSource?.source_hash === sourceHash) {
      db.prepare("UPDATE rag_sources SET status = ?, updated_at = ?, provider_status_json = ? WHERE id = ?")
        .run("skipped_unchanged", now, JSON.stringify(parserStatus), existingSource.id);
      const skipped = (await this.listSources(collectionId)).find(s => s.id === existingSource.id)!;
      recordAuditEvent({
        eventType: "rag_ingestion",
        action: "rag.ingest.skip_unchanged",
        target: collectionId,
        result: "success",
        metadata: { collectionId, source, sourceHash, parserUsed: "builtin", status: "skipped_unchanged" },
      });
      return { chunksAdded: 0, chunksRemoved: 0, skipped: true, source: skipped, providerStatus: parserStatus, vectorProviderStatus: vectorStatus };
    }

    const chunks  = chunkText(text);
    if (chunks.length === 0) {
      throw new Error("No indexable text chunks produced by built-in parser");
    }

    const meta = await loadMeta(collectionId) ?? {
      id: collectionId, name: collectionId, dim: HNSW_DIM,
      count: 0, createdAt: now, updatedAt: now, vectorProvider: "hnswlib",
    };

    let chunksRemoved = 0;
    if (existingSource) {
      chunksRemoved = (db.prepare("SELECT COUNT(*) AS count FROM rag_chunks WHERE (source_id = ? OR (collection_id = ? AND source = ?)) AND deleted_at IS NULL")
        .get(existingSource.id, collectionId, source) as { count: number }).count;
      if (chunksRemoved === 0 && existingSource.chunk_count > 0) {
        chunksRemoved = existingSource.chunk_count;
      }
      db.prepare("UPDATE rag_chunks SET stale = 1, deleted_at = ?, updated_at = ? WHERE (source_id = ? OR (collection_id = ? AND source = ?)) AND deleted_at IS NULL")
        .run(now, now, existingSource.id, collectionId, source);
      db.prepare("UPDATE rag_sources SET deleted_at = ?, status = ?, updated_at = ? WHERE id = ?")
        .run(now, "deleted", now, existingSource.id);
    }

    const sourceId = randomUUID();
    db.prepare(`
      INSERT INTO rag_sources (
        id, collection_id, source, source_path, source_hash, parser_used, chunk_count,
        citation_metadata_json, provider_status_json, status, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      sourceId,
      collectionId,
      source,
      opts.filePath ?? null,
      sourceHash,
      "builtin",
      chunks.length,
      JSON.stringify(citation),
      JSON.stringify(parserStatus),
      existingSource ? "reindexed" : "indexed",
      now,
    );

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vec   = await embed(chunk);
      db.prepare(
        `INSERT INTO rag_chunks (
          id, collection_id, source_id, label, source, chunk_index, text, embedding_json,
          citation_metadata_json, provider_status_json, stale, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL)`
      ).run(
        randomUUID(),
        collectionId,
        sourceId,
        -1,
        source,
        i,
        chunk,
        JSON.stringify(vec),
        JSON.stringify(citation),
        JSON.stringify(parserStatus),
        now,
        now,
      );
    }

    const activeCount = await rebuildCollectionIndex(collectionId, meta.dim);
    meta.count = activeCount;
    meta.updatedAt = now;
    await saveMeta(meta);
    db.prepare("UPDATE rag_collections SET updated_at = ?, vector_provider = ?, provider_status_json = ? WHERE id = ?")
      .run(now, "hnswlib", JSON.stringify(vectorStatus), collectionId);

    thoughtLog.publish({
      category: "rag",
      title:    "Ingest Complete",
      message:  `${chunks.length} chunks indexed from "${source}" into collection ${collectionId}`,
      metadata: { collectionId, source, sourceHash, parserUsed: "builtin", chunksAdded: chunks.length, chunksRemoved, providerStatus: parserStatus.status },
    });
    recordAuditEvent({
      eventType: "rag_ingestion",
      action: existingSource ? "rag.ingest.reindex" : "rag.ingest",
      target: collectionId,
      result: "success",
      metadata: { collectionId, source, sourceHash, parserUsed: "builtin", chunksAdded: chunks.length, chunksRemoved, providerStatus: parserStatus.status, vectorProvider: "hnswlib" },
    });

    const sourceRecord = (await this.listSources(collectionId)).find(s => s.id === sourceId)!;
    return { chunksAdded: chunks.length, chunksRemoved, skipped: false, source: sourceRecord, providerStatus: parserStatus, vectorProviderStatus: vectorStatus };
  },

  async markSourceDeleted(collectionId: string, sourceId: string): Promise<{ chunksRemoved: number; source: RagSourceRecord | null }> {
    await ensureSchema();
    const db = await getDb();
    const now = new Date().toISOString();
    const count = (db.prepare("SELECT COUNT(*) AS count FROM rag_chunks WHERE source_id = ? AND deleted_at IS NULL").get(sourceId) as { count: number }).count;
    db.prepare("UPDATE rag_chunks SET stale = 1, deleted_at = ?, updated_at = ? WHERE source_id = ? AND deleted_at IS NULL")
      .run(now, now, sourceId);
    db.prepare("UPDATE rag_sources SET deleted_at = ?, status = ?, updated_at = ? WHERE id = ? AND collection_id = ?")
      .run(now, "deleted", now, sourceId, collectionId);
    await rebuildCollectionIndex(collectionId, HNSW_DIM);
    recordAuditEvent({
      eventType: "rag_ingestion",
      action: "rag.source.delete",
      target: collectionId,
      result: "success",
      metadata: { collectionId, sourceId, chunksRemoved: count },
    });
    const source = (await this.listSources(collectionId)).find(s => s.id === sourceId) ?? null;
    return { chunksRemoved: count, source };
  },

  async search(
    query: string,
    collectionIds: string[],
    topK = 5,
  ): Promise<RagChunk[]> {
    if (collectionIds.length === 0) return [];
    await ensureSchema();

    const queryVec = await embed(query);
    const db = await getDb();
    const allResults: Array<{ label: number; distance: number; collectionId: string }> = [];

    for (const cid of collectionIds) {
      const meta = await loadMeta(cid);
      if (!meta || meta.count === 0) continue;
      try {
        const idx = await loadOrCreateIndex(cid, meta.dim);
        const k   = Math.min(topK * 2, idx.getCurrentCount());
        if (k === 0) continue;
        const result = idx.searchKnn(queryVec, k);
        for (let i = 0; i < result.neighbors.length; i++) {
          allResults.push({ label: result.neighbors[i], distance: result.distances[i], collectionId: cid });
        }
      } catch { /* skip corrupt index */ }
    }

    // Sort by ascending distance (cosine — lower = more similar)
    allResults.sort((a, b) => a.distance - b.distance);
    const topResults = allResults.slice(0, topK);

    const chunks: RagChunk[] = [];
    for (const r of topResults) {
      const row = db.prepare(
        "SELECT id, collection_id, source_id, source, chunk_index, text, citation_metadata_json FROM rag_chunks WHERE collection_id = ? AND label = ? AND deleted_at IS NULL AND stale = 0"
      ).get(r.collectionId, r.label) as { id: string; collection_id: string; source_id: string | null; source: string; chunk_index: number; text: string; citation_metadata_json: string } | undefined;
      if (row) {
        chunks.push({
          id:           row.id,
          collectionId: row.collection_id,
          sourceId:     row.source_id ?? undefined,
          source:       row.source,
          chunkIndex:   row.chunk_index,
          text:         row.text,
          score:        1 - r.distance, // convert to similarity score
          citation:     safeJsonParse<RagCitationMetadata>(row.citation_metadata_json, {}),
        });
      }
    }
    if (chunks.length > 0) return chunks;

    const terms = query.toLowerCase().split(/\W+/).filter(term => term.length > 2);
    if (terms.length === 0) return [];
    const placeholders = collectionIds.map(() => "?").join(",");
    const rows = db.prepare(`
      SELECT id, collection_id, source_id, source, chunk_index, text, citation_metadata_json
      FROM rag_chunks
      WHERE collection_id IN (${placeholders}) AND deleted_at IS NULL AND stale = 0
    `).all(...collectionIds) as Array<{
      id: string; collection_id: string; source_id: string | null; source: string; chunk_index: number; text: string; citation_metadata_json: string;
    }>;
    return rows
      .map(row => {
        const lower = row.text.toLowerCase();
        const matches = terms.filter(term => lower.includes(term)).length;
        return { row, matches };
      })
      .filter(item => item.matches > 0)
      .sort((a, b) => b.matches - a.matches)
      .slice(0, topK)
      .map(item => ({
        id: item.row.id,
        collectionId: item.row.collection_id,
        sourceId: item.row.source_id ?? undefined,
        source: item.row.source,
        chunkIndex: item.row.chunk_index,
        text: item.row.text,
        score: item.matches / terms.length,
        citation: safeJsonParse<RagCitationMetadata>(item.row.citation_metadata_json, {}),
      }));
  },

  /** Search across a set of collections and format results for system prompt injection */
  async buildRagContext(query: string, collectionIds: string[], topK = 5): Promise<string> {
    const chunks = await this.search(query, collectionIds, topK);
    if (chunks.length === 0) return "";
    const lines = chunks.map((c, i) =>
      `[RAG ${i + 1}] Source: ${c.source} (chunk ${c.chunkIndex}, page ${c.citation.page ?? "unavailable"}, section ${c.citation.section ?? "unavailable"}, score: ${c.score.toFixed(3)})\n${c.text}`
    );
    return `\n\n--- Retrieved Context (RAG) ---\n${lines.join("\n\n")}\n--- End Retrieved Context ---`;
  },
};

export const ragTestHooks = {
  setEmbedderForTests(embedder: ((text: string) => Promise<number[]>) | null): void {
    embedderOverride = embedder;
  },
};
