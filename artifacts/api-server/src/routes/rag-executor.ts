/**
 * RAG EXECUTOR ROUTES
 * ====================
 * Replaces the fire-and-forget /rag/ingest with a durable, executor-backed version.
 *
 * POST /rag/executor/validate     { collectionId, filePath?, content?, source? }
 * POST /rag/executor/dry-run      { collectionId, filePath?, content?, source? }
 * POST /rag/executor/ingest       { collectionId, filePath?, content?, source?, approvalId? }
 * GET  /rag/executor/jobs         — list recent ingest jobs
 */

import { Router } from "express";
import {
  executeApproved,
} from "../lib/approved-executor.js";
import {
  ensureRagIngestExecutorRegistered,
  RAG_INGEST_KIND,
  type RagIngestPayload,
} from "../lib/rag-ingest-executor.js";
import { createApprovalRequest, approveRequest } from "../lib/approval-queue.js";
import { listDurableJobs } from "../lib/platform-foundation.js";

const router = Router();
ensureRagIngestExecutorRegistered();

function bad(msg: string) { return { success: false, message: msg }; }

function buildPayload(body: Record<string, unknown>): RagIngestPayload {
  return {
    collectionId: typeof body["collectionId"] === "string" ? body["collectionId"] : "",
    filePath: typeof body["filePath"] === "string" ? body["filePath"] : undefined,
    content: typeof body["content"] === "string" ? body["content"] : undefined,
    source: typeof body["source"] === "string" ? body["source"] : undefined,
    mimeType: typeof body["mimeType"] === "string" ? body["mimeType"] : undefined,
  };
}

// Validate — no approval needed
router.post("/rag/executor/validate", async (req, res) => {
  const payload = buildPayload(req.body ?? {});
  if (!payload.collectionId) return res.status(400).json(bad("collectionId required"));

  const result = await executeApproved({
    executorKind: RAG_INGEST_KIND,
    approvalId: "",
    requestedAction: `Validate RAG ingest for collection ${payload.collectionId}`,
    mode: "validate",
    payload,
    skipRuntimeModeCheck: true,
  });
  return res.json(result);
});

// Dry run — auto-approved (no index write)
router.post("/rag/executor/dry-run", async (req, res) => {
  const payload = buildPayload(req.body ?? {});
  if (!payload.collectionId) return res.status(400).json(bad("collectionId required"));

  const approval = createApprovalRequest({
    type: RAG_INGEST_KIND,
    title: `RAG dry-run preview: ${payload.source ?? payload.filePath ?? "inline content"}`,
    summary: "Dry-run preview — no chunks written",
    riskTier: "tier2_safe_local_execute",
    requestedAction: `rag.ingest.dry_run.${payload.collectionId}`,
    payload,
  });
  approveRequest(approval.id, "Auto-approved: dry-run only");

  const result = await executeApproved({
    executorKind: RAG_INGEST_KIND,
    approvalId: approval.id,
    requestedAction: `RAG dry-run for collection ${payload.collectionId}`,
    mode: "dry_run",
    payload,
    skipRuntimeModeCheck: true,
  });
  return res.json(result);
});

// Real ingest — requires approval (auto-created if not provided)
router.post("/rag/executor/ingest", async (req, res) => {
  const body = req.body as Record<string, unknown> ?? {};
  const payload = buildPayload(body);
  if (!payload.collectionId) return res.status(400).json(bad("collectionId required"));
  if (!payload.filePath && !payload.content) return res.status(400).json(bad("filePath or content required"));

  let approvalId = typeof body["approvalId"] === "string" ? body["approvalId"] : "";

  // If no approvalId, create one automatically (tier2 local file)
  if (!approvalId) {
    const approval = createApprovalRequest({
      type: RAG_INGEST_KIND,
      title: `RAG ingest: ${payload.source ?? payload.filePath ?? "inline content"}`,
      summary: `Ingest into collection ${payload.collectionId}`,
      riskTier: "tier2_safe_local_execute",
      requestedAction: `rag.ingest.${payload.collectionId}`,
      payload,
    });
    approveRequest(approval.id, "Auto-approved: local file ingest");
    approvalId = approval.id;
  }

  const result = await executeApproved({
    executorKind: RAG_INGEST_KIND,
    approvalId,
    requestedAction: `RAG ingest into collection ${payload.collectionId}`,
    mode: "execute",
    payload,
  });
  return res.json(result);
});

// Recent ingest jobs
router.get("/rag/executor/jobs", (_req, res) => {
  const jobs = listDurableJobs(50).filter(j => j.kind === `executor.${RAG_INGEST_KIND}`);
  return res.json({ success: true, jobs });
});

export default router;
