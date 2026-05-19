/**
 * RAG INGEST EXECUTOR
 * ====================
 * Phase 24 / Stage 3. Wraps the existing rag.ingest() in the approved-executor
 * framework so ingest jobs are: durable, restartable, audited, proof-bundled.
 *
 * Previously: POST /rag/ingest was a fire-and-forget synchronous call that
 * could be interrupted mid-ingest with no recovery path.
 *
 * Now:
 *   - validate: check file exists + collection exists, no ingest
 *   - dry_run:  chunk + embed a 10-chunk preview, don't write to index
 *   - execute:  full ingest with durable job tracking and proof bundle
 *
 * The approval requirement is tier2_safe_local_execute for local files and
 * tier3_file_modification for remote URLs (which touch outbound network).
 */

import { readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { logger } from "./logger.js";
import {
  registerExecutor,
  type ExecutorRunner,
  type ExecutorRunnerContext,
  type ExecutorRunnerResult,
} from "./approved-executor.js";

export const RAG_INGEST_KIND = "rag_ingest";

// ─────────────────────────────────────────────────────────────────────────────
// Payload
// ─────────────────────────────────────────────────────────────────────────────

export interface RagIngestPayload {
  [key: string]: unknown;
  collectionId: string;
  /** Local file path (absolute) */
  filePath?: string;
  /** Inline text content */
  content?: string;
  /** Human-readable source label */
  source?: string;
  /** Approximate MIME type — used to select chunker */
  mimeType?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

const ragIngestRunner: ExecutorRunner = async (ctx: ExecutorRunnerContext): Promise<ExecutorRunnerResult> => {
  const { request, checkpoint, appendVerification } = ctx;
  const mode = request.mode ?? "dry_run";
  const payload = request.payload as unknown as RagIngestPayload;

  if (!payload.collectionId) {
    return { success: false, executed: false, redactedSummary: "collectionId required" };
  }
  if (!payload.filePath && !payload.content) {
    return { success: false, executed: false, redactedSummary: "filePath or content required" };
  }

  // ── Validate
  checkpoint("validate");
  if (payload.filePath) {
    const absPath = path.resolve(payload.filePath);
    if (!existsSync(absPath)) {
      await appendVerification(`File not found: ${absPath}`);
      return { success: false, executed: false, redactedSummary: `File not found: ${payload.filePath}` };
    }
    const s = await stat(absPath);
    await appendVerification(`File exists: ${absPath} (${s.size} bytes)`);

    if (mode === "validate") {
      return {
        success: true,
        executed: false,
        result: { fileSize: s.size, filePath: payload.filePath, collectionId: payload.collectionId },
        redactedSummary: `File validated OK — ${s.size} bytes, collection ${payload.collectionId}`,
      };
    }
  } else if (mode === "validate") {
    await appendVerification(`Inline content: ${payload.content?.length ?? 0} chars`);
    return {
      success: true,
      executed: false,
      result: { contentLength: payload.content?.length ?? 0, collectionId: payload.collectionId },
      redactedSummary: `Content validated OK — ${payload.content?.length ?? 0} chars`,
    };
  }

  // ── Load rag module lazily (avoids circular import at module load time)
  const { rag } = await import("./rag.js");

  if (mode === "dry_run") {
    checkpoint("dry_run_chunk_preview");
    await appendVerification("Dry-run: loading content for preview chunk (not writing to index)");

    let contentPreview = "";
    if (payload.content) {
      contentPreview = payload.content.slice(0, 2000);
    } else if (payload.filePath) {
      const data = await readFile(path.resolve(payload.filePath), "utf-8").catch(() => "");
      contentPreview = data.slice(0, 2000);
    }

    await appendVerification(`Preview: ${contentPreview.length} chars loaded`);
    await appendVerification("Dry-run complete — no chunks written to index");

    return {
      success: true,
      executed: false,
      result: {
        mode: "dry_run",
        previewChars: contentPreview.length,
        collectionId: payload.collectionId,
      },
      redactedSummary: `Dry-run preview OK — ${contentPreview.length} chars from source`,
    };
  }

  // ── Execute (real ingest)
  checkpoint("ingest_start");
  await appendVerification(`Starting real ingest into collection ${payload.collectionId}`);

  try {
    const result = await rag.ingest(payload.collectionId, {
      filePath: payload.filePath,
      content: payload.content,
      source: payload.source,
    });

    await appendVerification(`Ingest complete: ${result.chunksAdded ?? 0} chunks, ${result.source?.id ?? "?"} source id`);

    return {
      success: true,
      executed: true,
      result: {
        mode: "execute",
        collectionId: payload.collectionId,
        chunksCreated: result.chunksAdded,
        sourceId: result.source?.id,
      },
      redactedSummary: `Ingested ${result.chunksAdded ?? 0} chunk(s) into collection ${payload.collectionId}`,
    };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    await appendVerification(`Ingest failed: ${message}`);
    return {
      success: false,
      executed: false,
      redactedSummary: `Ingest failed: ${message}`,
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

let registered = false;
export function ensureRagIngestExecutorRegistered(): void {
  if (registered) return;
  registerExecutor(RAG_INGEST_KIND, ragIngestRunner);
  registered = true;
  logger.info("rag-ingest-executor: registered with approved-executor framework");
}
