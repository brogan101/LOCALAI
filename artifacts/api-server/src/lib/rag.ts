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
import { randomUUID } from "crypto";
import { fetchJson } from "./runtime.js";
import { getOllamaUrl } from "./ollama-url.js";
import { thoughtLog } from "./thought-log.js";
import { stackModel } from "../config/models.config.js";

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
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rag_chunks (
      id            TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL,
      label         INTEGER NOT NULL,
      source        TEXT NOT NULL,
      chunk_index   INTEGER NOT NULL,
      text          TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS rag_chunks_collection ON rag_chunks(collection_id);
    CREATE INDEX IF NOT EXISTS rag_chunks_label      ON rag_chunks(collection_id, label);
  `);
}

// ── Embedding ─────────────────────────────────────────────────────────────────

const EMBED_MODEL = stackModel("embedding"); // nomic-embed-text

async function embed(text: string): Promise<number[]> {
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

// ── Public API ────────────────────────────────────────────────────────────────

export interface RagChunk {
  id:           string;
  collectionId: string;
  source:       string;
  chunkIndex:   number;
  text:         string;
  score:        number;
}

export interface RagCollection {
  id:        string;
  name:      string;
  createdAt: string;
}

export const rag = {
  async createCollection(name: string): Promise<RagCollection> {
    await ensureSchema();
    const db = await getDb();
    const id  = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO rag_collections (id, name, created_at) VALUES (?, ?, ?)"
    ).run(id, name, now);
    await mkdir(collectionDir(id), { recursive: true });
    const meta: CollectionMeta = { id, name, dim: HNSW_DIM, count: 0, createdAt: now, updatedAt: now };
    await saveMeta(meta);
    thoughtLog.publish({ category: "rag", title: "Collection Created", message: `"${name}" (${id})` });
    return { id, name, createdAt: now };
  },

  async listCollections(): Promise<RagCollection[]> {
    await ensureSchema();
    const db = await getDb();
    return (db.prepare("SELECT id, name, created_at FROM rag_collections ORDER BY created_at DESC").all() as Array<{
      id: string; name: string; created_at: string;
    }>).map(r => ({ id: r.id, name: r.name, createdAt: r.created_at }));
  },

  async deleteCollection(collectionId: string): Promise<void> {
    await ensureSchema();
    const db = await getDb();
    db.prepare("DELETE FROM rag_chunks WHERE collection_id = ?").run(collectionId);
    db.prepare("DELETE FROM rag_collections WHERE id = ?").run(collectionId);
    // Remove HNSW files
    const { rm } = await import("fs/promises");
    await rm(collectionDir(collectionId), { recursive: true, force: true });
    thoughtLog.publish({ category: "rag", title: "Collection Deleted", message: collectionId });
  },

  async ingest(
    collectionId: string,
    opts: { filePath?: string; content?: string; source?: string },
  ): Promise<{ chunksAdded: number }> {
    await ensureSchema();

    const text = opts.content
      ? opts.content
      : opts.filePath
      ? await extractText(opts.filePath)
      : (() => { throw new Error("filePath or content required"); })();

    const source = opts.source ?? opts.filePath ?? "inline";
    const chunks  = chunkText(text);
    if (chunks.length === 0) return { chunksAdded: 0 };

    const meta = await loadMeta(collectionId) ?? {
      id: collectionId, name: collectionId, dim: HNSW_DIM,
      count: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };

    const idx = await loadOrCreateIndex(collectionId, meta.dim);
    const db  = await getDb();
    const now = new Date().toISOString();

    let startLabel = meta.count;

    // Resize HNSW if needed
    const needed = startLabel + chunks.length;
    if (needed > idx.getMaxElements()) {
      idx.resizeIndex(Math.max(needed + 500, idx.getMaxElements() * 2));
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vec   = await embed(chunk);
      const label = startLabel + i;
      idx.addPoint(vec, label);
      db.prepare(
        "INSERT OR IGNORE INTO rag_chunks (id, collection_id, label, source, chunk_index, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(randomUUID(), collectionId, label, source, i, chunk, now);
    }

    idx.writeIndex(indexPath(collectionId));

    meta.count    = startLabel + chunks.length;
    meta.updatedAt = now;
    await saveMeta(meta);

    thoughtLog.publish({
      category: "rag",
      title:    "Ingest Complete",
      message:  `${chunks.length} chunks from "${source}" → collection ${collectionId}`,
      metadata: { collectionId, source, chunksAdded: chunks.length },
    });

    return { chunksAdded: chunks.length };
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
        "SELECT id, collection_id, source, chunk_index, text FROM rag_chunks WHERE collection_id = ? AND label = ?"
      ).get(r.collectionId, r.label) as { id: string; collection_id: string; source: string; chunk_index: number; text: string } | undefined;
      if (row) {
        chunks.push({
          id:           row.id,
          collectionId: row.collection_id,
          source:       row.source,
          chunkIndex:   row.chunk_index,
          text:         row.text,
          score:        1 - r.distance, // convert to similarity score
        });
      }
    }
    return chunks;
  },

  /** Search across a set of collections and format results for system prompt injection */
  async buildRagContext(query: string, collectionIds: string[], topK = 5): Promise<string> {
    const chunks = await this.search(query, collectionIds, topK);
    if (chunks.length === 0) return "";
    const lines = chunks.map((c, i) =>
      `[RAG ${i + 1}] Source: ${c.source} (chunk ${c.chunkIndex}, score: ${c.score.toFixed(3)})\n${c.text}`
    );
    return `\n\n--- Retrieved Context (RAG) ---\n${lines.join("\n\n")}\n--- End Retrieved Context ---`;
  },
};
