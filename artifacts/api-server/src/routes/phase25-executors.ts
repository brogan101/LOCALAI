/**
 * NEW EXECUTOR ROUTES — Phase 25
 * ================================
 * Extends new-executors.ts with Phase 25 executor endpoints.
 * Mount point (in routes/index.ts):
 *   /automotive/executor/*
 *   /studios/executor/*
 *   /homelab/executor/*
 *   /rag/agentic          — Agentic RAG query endpoint
 */

import { Router, type Request, type Response } from "express";
import { executeApproved } from "../lib/approved-executor.js";
import { ensureAutomotiveLogExecutorRegistered, AUTOMOTIVE_LOG_KIND } from "../lib/automotive-log-executor.js";
import { ensureStudiosExecutorsRegistered, STUDIOS_IMAGE_GEN_KIND, STUDIOS_TTS_KIND, STUDIOS_STT_KIND } from "../lib/studios-executor.js";
import { ensureHomelabExecutorsRegistered, HOMELAB_PROXMOX_KIND, HOMELAB_OPNSENSE_KIND, HOMELAB_NETBOX_KIND } from "../lib/homelab-executor.js";
import { agenticRag, simpleRag } from "../lib/agentic-rag.js";
import { logger } from "../lib/logger.js";

// Register all executors at import time
ensureAutomotiveLogExecutorRegistered();
ensureStudiosExecutorsRegistered();
ensureHomelabExecutorsRegistered();

// ─────────────────────────────────────────────────────────────────────────────
// Generic executor dispatch helper
// ─────────────────────────────────────────────────────────────────────────────

function makeExecutorRoute(kind: string) {
  return async (req: Request, res: Response): Promise<void> => {
    const { approvalId, mode, payload, requestedAction, workspacePath } = req.body as {
      approvalId: string;
      mode?: string;
      payload: Record<string, unknown>;
      requestedAction: string;
      workspacePath?: string;
    };

    if (!approvalId || !payload) {
      res.status(400).json({ success: false, message: "approvalId and payload required" });
      return;
    }

    try {
      const result = await executeApproved({
        executorKind: kind,
        approvalId,
        requestedAction: requestedAction ?? kind,
        mode: (mode ?? "dry_run") as any,
        payload,
        workspacePath,
      });
      res.json(result);
    } catch (err) {
      logger.error({ err, kind }, "executor route error");
      res.status(500).json({ success: false, message: (err as Error).message });
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Automotive routes
// ─────────────────────────────────────────────────────────────────────────────

export const automotiveExecutorRouter = Router();

automotiveExecutorRouter.post("/execute", makeExecutorRoute(AUTOMOTIVE_LOG_KIND));

automotiveExecutorRouter.get("/supported-pids", (_req, res) => {
  res.json({
    success: true,
    logTypes: ["obd_csv", "ecu_csv", "hptuners_csv", "acesjackpot_csv", "generic_csv"],
    note: "Known PID detection runs automatically on import",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Studios routes
// ─────────────────────────────────────────────────────────────────────────────

export const studiosExecutorRouter = Router();

studiosExecutorRouter.post("/image",      makeExecutorRoute(STUDIOS_IMAGE_GEN_KIND));
studiosExecutorRouter.post("/tts",        makeExecutorRoute(STUDIOS_TTS_KIND));
studiosExecutorRouter.post("/stt",        makeExecutorRoute(STUDIOS_STT_KIND));

// ─────────────────────────────────────────────────────────────────────────────
// HomeLab routes
// ─────────────────────────────────────────────────────────────────────────────

export const homelabExecutorRouter = Router();

homelabExecutorRouter.post("/proxmox",   makeExecutorRoute(HOMELAB_PROXMOX_KIND));
homelabExecutorRouter.post("/opnsense",  makeExecutorRoute(HOMELAB_OPNSENSE_KIND));
homelabExecutorRouter.post("/netbox",    makeExecutorRoute(HOMELAB_NETBOX_KIND));

// ─────────────────────────────────────────────────────────────────────────────
// Agentic RAG routes
// ─────────────────────────────────────────────────────────────────────────────

export const agenticRagRouter = Router();

/**
 * POST /api/rag/agentic
 * Body: { query, collections?, maxIterations?, includeTrace? }
 */
agenticRagRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  const { query, collections, maxIterations, includeTrace, relevanceThreshold, maxChunks } = req.body as {
    query: string;
    collections?: string[];
    maxIterations?: number;
    includeTrace?: boolean;
    relevanceThreshold?: number;
    maxChunks?: number;
  };

  if (!query?.trim()) {
    res.status(400).json({ success: false, message: "query required" });
    return;
  }

  try {
    const result = await agenticRag(query, {
      collections,
      maxIterations,
      includeTrace,
      relevanceThreshold,
      maxChunks,
      verbose: true,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error({ err }, "agentic-rag route error");
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

/**
 * POST /api/rag/simple
 * Body: { query, collections? }
 */
agenticRagRouter.post("/simple", async (req: Request, res: Response): Promise<void> => {
  const { query, collections } = req.body as { query: string; collections?: string[] };
  if (!query?.trim()) {
    res.status(400).json({ success: false, message: "query required" });
    return;
  }
  try {
    const result = await simpleRag(query, collections ?? []);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});
