/**
 * STT ROUTE — Speech-to-text via faster-whisper Python sidecar
 * ============================================================
 * POST /stt/transcribe  (multipart, field: file, wav or webm)
 *   → { text, language, durationMs }
 *
 * Returns 503 with { error, unavailable: true } when sidecar is down.
 */

import { Router } from "express";
import { thoughtLog } from "../lib/thought-log.js";

const router = Router();

const SIDECAR_URL = "http://127.0.0.1:3021";
const TIMEOUT_MS  = 30_000;

async function sidecarAlive(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(`${SIDECAR_URL}/health`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// POST /stt/transcribe
router.post("/stt/transcribe", async (req, res) => {
  const alive = await sidecarAlive();
  if (!alive) {
    thoughtLog.publish({
      level:    "warning",
      category: "stt",
      title:    "STT Sidecar Unavailable",
      message:  "faster-whisper sidecar not responding on port 3021",
    });
    return res.status(503).json({
      success:     false,
      unavailable: true,
      error:       "STT unavailable — install Python 3.10+ and run: pip install faster-whisper uvicorn fastapi",
    });
  }

  // req.body is a Buffer when Content-Type is multipart; we proxy the raw request
  // Express's raw body parser is not wired here — we use the content-type header
  // and pipe the raw request bytes to the sidecar.
  const contentType = req.headers["content-type"] ?? "application/octet-stream";

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    // Read raw body chunks
    const chunks: Buffer[] = [];
    for await (const chunk of req as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks);

    const sidecarRes = await fetch(`${SIDECAR_URL}/transcribe`, {
      method:  "POST",
      headers: { "Content-Type": contentType, "Content-Length": String(rawBody.length) },
      body:    rawBody,
      signal:  ctrl.signal,
    });

    if (!sidecarRes.ok) {
      const txt = await sidecarRes.text().catch(() => "");
      return res.status(sidecarRes.status).json({ success: false, error: txt || `Sidecar error ${sidecarRes.status}` });
    }

    const data = await sidecarRes.json() as { text: string; language: string; durationMs: number };
    thoughtLog.publish({
      category: "stt",
      title:    "Transcription Complete",
      message:  `${data.durationMs}ms — "${data.text.slice(0, 80)}${data.text.length > 80 ? "…" : ""}"`,
      metadata: { language: data.language, durationMs: data.durationMs },
    });
    return res.json({ success: true, ...data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(503).json({ success: false, error: `Transcription failed: ${msg}` });
  } finally {
    clearTimeout(timer);
  }
});

// GET /stt/status — check sidecar health
router.get("/stt/status", async (_req, res) => {
  const alive = await sidecarAlive();
  return res.json({ available: alive, sidecarUrl: SIDECAR_URL });
});

export default router;
