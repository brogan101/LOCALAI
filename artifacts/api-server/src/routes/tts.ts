/**
 * TTS ROUTE — Text-to-speech via Piper
 * =====================================
 * POST /tts/speak { text: string; voice?: string }
 *   → audio/wav stream
 *
 * GET /tts/status
 *   → { available: boolean; voices: string[] }
 *
 * Piper is a fast local TTS engine:
 *   winget install piper-tts OR pip install piper-tts
 * Voice models stored at ~/LocalAI-Tools/tts/voices/
 * Default voice: en_US-libritts_r-medium
 */

import { Router } from "express";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { readdir, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import { thoughtLog } from "../lib/thought-log.js";

const execAsync = promisify(exec);
const router = Router();

const VOICES_DIR   = path.join(os.homedir(), "LocalAI-Tools", "tts", "voices");
const DEFAULT_VOICE = "en_US-libritts_r-medium";
const MAX_TEXT_LEN  = 4000;

async function piperAvailable(): Promise<boolean> {
  try {
    await execAsync("piper --version", { timeout: 3000 });
    return true;
  } catch {
    // Try pip-installed piper
    try {
      await execAsync("python -m piper --version", { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }
}

async function listVoices(): Promise<string[]> {
  if (!existsSync(VOICES_DIR)) return [];
  try {
    const entries = await readdir(VOICES_DIR);
    return entries.filter(e => e.endsWith(".onnx")).map(e => e.replace(/\.onnx$/, ""));
  } catch {
    return [];
  }
}

function voicePath(voice: string): string {
  return path.join(VOICES_DIR, `${voice}.onnx`);
}

// POST /tts/speak
router.post("/tts/speak", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const text  = typeof body.text  === "string" ? body.text.trim()  : "";
  const voice = typeof body.voice === "string" ? body.voice.trim() : DEFAULT_VOICE;

  if (!text) {
    return res.status(400).json({ success: false, error: "text is required" });
  }
  if (text.length > MAX_TEXT_LEN) {
    return res.status(400).json({ success: false, error: `text exceeds max length ${MAX_TEXT_LEN}` });
  }

  const available = await piperAvailable();
  if (!available) {
    return res.status(503).json({
      success:     false,
      unavailable: true,
      error:       "Piper TTS not installed. Run: winget install piper-tts",
    });
  }

  const vPath = voicePath(voice);
  if (!existsSync(vPath)) {
    return res.status(404).json({
      success: false,
      error:   `Voice "${voice}" not found. Place <voice>.onnx in ~/LocalAI-Tools/tts/voices/`,
    });
  }

  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Transfer-Encoding", "chunked");

  // Spawn piper: echo text | piper --model <voice> --output_raw | pipe to response
  const proc = spawn("piper", [
    "--model",      vPath,
    "--output_raw",            // raw PCM; piper adds wav header with --output-file
  ], { stdio: ["pipe", "pipe", "pipe"] });

  proc.stdin.write(text);
  proc.stdin.end();

  proc.stdout.pipe(res, { end: true });

  proc.stderr.on("data", (d: Buffer) => {
    // Piper logs to stderr even on success — ignore unless it causes issues
    void d;
  });

  proc.on("error", (err) => {
    thoughtLog.publish({
      level:    "warning",
      category: "tts",
      title:    "TTS Piper Error",
      message:  err.message,
    });
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  proc.on("close", (code) => {
    if (code !== 0) {
      thoughtLog.publish({
        level:    "warning",
        category: "tts",
        title:    "TTS Piper Non-zero Exit",
        message:  `piper exited ${code} for voice=${voice}`,
      });
    }
  });
});

// GET /tts/status
router.get("/tts/status", async (_req, res) => {
  const [available, voices] = await Promise.all([piperAvailable(), listVoices()]);
  return res.json({ available, voices, defaultVoice: DEFAULT_VOICE, voicesDir: VOICES_DIR });
});

export default router;
