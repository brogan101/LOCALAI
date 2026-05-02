/**
 * RAG ROUTES
 * ==========
 * POST   /rag/collections              create collection
 * GET    /rag/collections              list all
 * DELETE /rag/collections/:id          delete
 * POST   /rag/ingest                   { collectionId, filePath | content, source? }
 * POST   /rag/search                   { query, collectionIds, topK? }
 */

import { Router } from "express";
import { rag } from "../lib/rag.js";

const router = Router();

// POST /rag/collections
router.post("/rag/collections", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return res.status(400).json({ success: false, error: "name required" });
  try {
    const collection = await rag.createCollection(name);
    return res.json({ success: true, collection });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /rag/collections
router.get("/rag/collections", async (_req, res) => {
  try {
    const collections = await rag.listCollections();
    return res.json({ success: true, collections });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /rag/status
router.get("/rag/status", async (_req, res) => {
  try {
    return res.json({ success: true, ...rag.providerStatus() });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /rag/collections/:id/sources
router.get("/rag/collections/:id/sources", async (req, res) => {
  try {
    const sources = await rag.listSources(req.params.id);
    return res.json({ success: true, sources });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /rag/collections/:id/chunks
router.get("/rag/collections/:id/chunks", async (req, res) => {
  const sourceId = typeof req.query.sourceId === "string" ? req.query.sourceId : undefined;
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;
  try {
    const chunks = await rag.listChunks(req.params.id, sourceId, limit);
    return res.json({ success: true, chunks });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /rag/collections/:id/sources/:sourceId/delete
router.post("/rag/collections/:id/sources/:sourceId/delete", async (req, res) => {
  try {
    const result = await rag.markSourceDeleted(req.params.id, req.params.sourceId);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// DELETE /rag/collections/:id
router.delete("/rag/collections/:id", async (req, res) => {
  const id = req.params.id;
  try {
    await rag.deleteCollection(id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /rag/ingest
router.post("/rag/ingest", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const collectionId = typeof body.collectionId === "string" ? body.collectionId.trim() : "";
  const filePath     = typeof body.filePath     === "string" ? body.filePath.trim()     : undefined;
  const content      = typeof body.content      === "string" ? body.content             : undefined;
  const source       = typeof body.source       === "string" ? body.source.trim()       : undefined;

  if (!collectionId) return res.status(400).json({ success: false, error: "collectionId required" });
  if (!filePath && !content) return res.status(400).json({ success: false, error: "filePath or content required" });

  try {
    const result = await rag.ingest(collectionId, { filePath, content, source });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /rag/reindex
router.post("/rag/reindex", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const collectionId = typeof body.collectionId === "string" ? body.collectionId.trim() : "";
  const filePath     = typeof body.filePath     === "string" ? body.filePath.trim()     : undefined;
  const content      = typeof body.content      === "string" ? body.content             : undefined;
  const source       = typeof body.source       === "string" ? body.source.trim()       : undefined;

  if (!collectionId) return res.status(400).json({ success: false, error: "collectionId required" });
  if (!filePath && !content) return res.status(400).json({ success: false, error: "filePath or content required" });

  try {
    const result = await rag.ingest(collectionId, { filePath, content, source });
    return res.json({ success: true, reindexed: !result.skipped, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /rag/search
router.post("/rag/search", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const query         = typeof body.query === "string" ? body.query.trim() : "";
  const collectionIds = Array.isArray(body.collectionIds) ? (body.collectionIds as unknown[]).filter(x => typeof x === "string") as string[] : [];
  const topK          = typeof body.topK === "number" ? body.topK : 5;

  if (!query)                 return res.status(400).json({ success: false, error: "query required" });
  if (!collectionIds.length)  return res.status(400).json({ success: false, error: "collectionIds required" });

  try {
    const chunks = await rag.search(query, collectionIds, topK);
    return res.json({ success: true, chunks });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
