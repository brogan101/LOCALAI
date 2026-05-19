/**
 * STUDIOS EXECUTOR
 * =================
 * Phase 25 / B-009 family. Activates the "Studios" advanced nav item.
 *
 * Studios covers local media generation and processing pipelines:
 *   - Image generation via ComfyUI or AUTOMATIC1111 (local REST)
 *   - Audio processing via ffmpeg (installed separately)
 *   - TTS via Piper (~/LocalAI-Tools/tts/voices/)
 *   - STT job dispatch to the faster-whisper sidecar (:3021)
 *
 * Every action goes through the approved-executor framework.
 * No cloud APIs. No credentials required for local ops.
 *
 * executor kinds:
 *   studios_image_gen    — text-to-image via local ComfyUI
 *   studios_audio_proc   — ffmpeg transcode/normalise
 *   studios_tts_render   — Piper TTS to WAV
 *   studios_stt_job      — faster-whisper transcription job
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";
import { logger } from "./logger.js";
import {
  registerExecutor,
  type ExecutorRunner,
  type ExecutorRunnerContext,
  type ExecutorRunnerResult,
} from "./approved-executor.js";

const execFileAsync = promisify(execFile);

const STUDIOS_OUTPUT_DIR = path.join(os.homedir(), "LocalAI-Tools", "studios", "output");
const TTS_VOICES_DIR     = path.join(os.homedir(), "LocalAI-Tools", "tts", "voices");
const COMFYUI_BASE       = "http://localhost:8188";
const WHISPER_BASE       = "http://localhost:3021";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

async function ensureOutputDir(subdir: string): Promise<string> {
  const d = path.join(STUDIOS_OUTPUT_DIR, subdir);
  await mkdir(d, { recursive: true });
  return d;
}

function ts(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// ─────────────────────────────────────────────────────────────────────────────
// Image generation — ComfyUI REST API
// ─────────────────────────────────────────────────────────────────────────────

export const STUDIOS_IMAGE_GEN_KIND = "studios_image_gen";

export interface ImageGenPayload {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  model?: string;       // ComfyUI checkpoint name
  seed?: number;
  outputFilename?: string;
}

const imageGenRunner: ExecutorRunner = async (ctx: ExecutorRunnerContext): Promise<ExecutorRunnerResult> => {
  const { request, checkpoint, appendVerification } = ctx;
  const mode = request.mode ?? "dry_run";
  const payload = request.payload as unknown as ImageGenPayload;

  if (!payload.prompt?.trim()) {
    return { success: false, executed: false, redactedSummary: "prompt required" };
  }

  checkpoint("validate");
  // Check ComfyUI health
  try {
    const health = await fetch(`${COMFYUI_BASE}/system_stats`, { signal: AbortSignal.timeout(3000) });
    if (!health.ok) throw new Error(`HTTP ${health.status}`);
    await appendVerification("ComfyUI: reachable");
  } catch (err) {
    const msg = `ComfyUI not reachable at ${COMFYUI_BASE}: ${(err as Error).message}`;
    await appendVerification(msg);
    if (mode !== "validate") {
      return { success: false, executed: false, redactedSummary: msg };
    }
  }

  if (mode === "validate" || mode === "dry_run") {
    return {
      success: true,
      executed: false,
      result: {
        prompt: payload.prompt,
        width:  payload.width  ?? 512,
        height: payload.height ?? 512,
        steps:  payload.steps  ?? 20,
      },
      redactedSummary: `Dry-run: would generate ${payload.width ?? 512}×${payload.height ?? 512} image`,
    };
  }

  checkpoint("generate");
  const outDir = await ensureOutputDir("images");
  const filename = payload.outputFilename ?? `img_${ts()}.png`;
  const outputPath = path.join(outDir, filename);

  // ComfyUI workflow (minimal API2 format)
  const workflow = {
    "3": { inputs: { seed: payload.seed ?? Math.floor(Math.random() * 1e9), steps: payload.steps ?? 20,
                     cfg: payload.cfgScale ?? 7, sampler_name: "euler", scheduler: "normal",
                     denoise: 1, model: ["4", 0], positive: ["6", 0], negative: ["7", 0],
                     latent_image: ["5", 0] }, class_type: "KSampler" },
    "4": { inputs: { ckpt_name: payload.model ?? "flux.1-schnell" }, class_type: "CheckpointLoaderSimple" },
    "5": { inputs: { width: payload.width ?? 512, height: payload.height ?? 512,
                     batch_size: 1 }, class_type: "EmptyLatentImage" },
    "6": { inputs: { text: payload.prompt, clip: ["4", 1] }, class_type: "CLIPTextEncode" },
    "7": { inputs: { text: payload.negativePrompt ?? "", clip: ["4", 1] }, class_type: "CLIPTextEncode" },
    "8": { inputs: { samples: ["3", 0], vae: ["4", 2] }, class_type: "VAEDecode" },
    "9": { inputs: { filename_prefix: filename.replace(".png", ""), images: ["8", 0] }, class_type: "SaveImage" },
  };

  const promptRes = await fetch(`${COMFYUI_BASE}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!promptRes.ok) {
    const errText = await promptRes.text().catch(() => "");
    return { success: false, executed: false, redactedSummary: `ComfyUI prompt failed: ${errText.slice(0, 200)}` };
  }

  const promptData = await promptRes.json() as { prompt_id?: string };
  await appendVerification(`ComfyUI prompt queued: ${promptData.prompt_id}`);

  return {
    success: true,
    executed: true,
    result: { promptId: promptData.prompt_id, outputDir: outDir, filename },
    rollbackNotes: `Delete generated file: ${outputPath}`,
    redactedSummary: `Image generation queued (promptId=${promptData.prompt_id}) → ${filename}`,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// TTS render — Piper
// ─────────────────────────────────────────────────────────────────────────────

export const STUDIOS_TTS_KIND = "studios_tts_render";

export interface TtsPayload {
  text: string;
  voice?: string;        // voice model filename without path
  outputFilename?: string;
  speed?: number;        // 0.5–2.0
}

const ttsRunner: ExecutorRunner = async (ctx: ExecutorRunnerContext): Promise<ExecutorRunnerResult> => {
  const { request, checkpoint, appendVerification } = ctx;
  const mode = request.mode ?? "dry_run";
  const payload = request.payload as unknown as TtsPayload;

  if (!payload.text?.trim()) {
    return { success: false, executed: false, redactedSummary: "text required" };
  }

  checkpoint("validate");
  const piperPath = await findExecutable(["piper", "piper.exe"]);
  if (!piperPath) {
    await appendVerification("piper not found — install: winget install piper-tts");
    return { success: false, executed: false,
             redactedSummary: "Piper TTS not installed. Run: winget install piper-tts" };
  }

  const voiceName = payload.voice ?? "en_US-lessac-medium.onnx";
  const voicePath = path.join(TTS_VOICES_DIR, voiceName);
  if (!existsSync(voicePath)) {
    await appendVerification(`Voice model not found: ${voicePath}`);
    return { success: false, executed: false,
             redactedSummary: `Voice model not found: ${voiceName}. Place .onnx file in ${TTS_VOICES_DIR}` };
  }

  await appendVerification(`Piper: ${piperPath}, voice: ${voiceName}`);

  if (mode === "validate" || mode === "dry_run") {
    return {
      success: true, executed: false,
      result: { piper: piperPath, voice: voiceName, textLength: payload.text.length },
      redactedSummary: `Dry-run: would render "${payload.text.slice(0, 40)}…" using ${voiceName}`,
    };
  }

  checkpoint("render");
  const outDir = await ensureOutputDir("tts");
  const filename = payload.outputFilename ?? `tts_${ts()}.wav`;
  const outputPath = path.join(outDir, filename);

  await execFileAsync(piperPath, [
    "--model", voicePath,
    "--output_file", outputPath,
    ...(payload.speed ? ["--length_scale", String(1 / payload.speed)] : []),
  ], { input: payload.text, timeout: 60_000 } as any);

  const s = await stat(outputPath);
  await appendVerification(`TTS rendered: ${outputPath} (${(s.size / 1024).toFixed(1)} KB)`);

  return {
    success: true, executed: true,
    result: { outputPath, filename, fileSizeBytes: s.size },
    rollbackNotes: `Delete: ${outputPath}`,
    redactedSummary: `TTS rendered to ${filename} (${(s.size / 1024).toFixed(1)} KB)`,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// STT job — faster-whisper sidecar
// ─────────────────────────────────────────────────────────────────────────────

export const STUDIOS_STT_KIND = "studios_stt_job";

export interface SttPayload {
  audioFilePath: string;
  language?: string;
  outputFormat?: "txt" | "json" | "srt";
}

const sttRunner: ExecutorRunner = async (ctx: ExecutorRunnerContext): Promise<ExecutorRunnerResult> => {
  const { request, checkpoint, appendVerification } = ctx;
  const mode = request.mode ?? "dry_run";
  const payload = request.payload as unknown as SttPayload;

  if (!payload.audioFilePath) {
    return { success: false, executed: false, redactedSummary: "audioFilePath required" };
  }

  checkpoint("validate");
  const absPath = path.resolve(payload.audioFilePath);
  if (!existsSync(absPath)) {
    return { success: false, executed: false, redactedSummary: `Audio file not found: ${absPath}` };
  }

  // Check whisper sidecar
  try {
    const health = await fetch(`${WHISPER_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    await appendVerification(`Whisper sidecar: ${health.ok ? "reachable" : "unreachable (" + health.status + ")"}`);
    if (!health.ok && mode === "execute") {
      return { success: false, executed: false,
               redactedSummary: `Whisper sidecar not running at :3021. Start it with: python stt_server.py` };
    }
  } catch {
    await appendVerification("Whisper sidecar: not reachable — start with: python stt_server.py");
    if (mode === "execute") {
      return { success: false, executed: false, redactedSummary: "Whisper sidecar not running" };
    }
  }

  if (mode === "validate" || mode === "dry_run") {
    const s = await stat(absPath);
    return {
      success: true, executed: false,
      result: { audioFile: absPath, fileSizeBytes: s.size },
      redactedSummary: `Dry-run: would transcribe ${path.basename(absPath)} (${(s.size / 1024 ** 2).toFixed(1)} MB)`,
    };
  }

  checkpoint("transcribe");
  const { FormData, Blob } = await import("node:buffer") as any; // Node 18+
  const audioBuffer = await (await import("fs/promises")).readFile(absPath);
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer]), path.basename(absPath));
  if (payload.language) formData.append("language", payload.language);
  formData.append("response_format", payload.outputFormat ?? "json");

  const res = await fetch(`${WHISPER_BASE}/v1/audio/transcriptions`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(300_000),
  });

  if (!res.ok) {
    return { success: false, executed: false,
             redactedSummary: `Whisper transcription failed: HTTP ${res.status}` };
  }

  const result = await res.json() as { text?: string; segments?: unknown[] };
  const outDir = await ensureOutputDir("stt");
  const outFile = path.join(outDir, `${path.basename(absPath, path.extname(absPath))}_${ts()}.json`);
  await writeFile(outFile, JSON.stringify(result, null, 2), "utf-8");

  await appendVerification(`Transcript saved: ${outFile}`);

  return {
    success: true, executed: true,
    result: { transcriptPath: outFile, textPreview: result.text?.slice(0, 200) },
    rollbackNotes: `Delete transcript: ${outFile}`,
    redactedSummary: `Transcription complete — ${result.text?.split(" ").length ?? 0} words → ${path.basename(outFile)}`,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: find executable in PATH
// ─────────────────────────────────────────────────────────────────────────────

async function findExecutable(names: string[]): Promise<string | null> {
  // @ts-ignore — shelljs is optional; graceful fallback if not installed
  const { which } = await import("shelljs").catch(() => ({ which: null }));
  for (const name of names) {
    try {
      if (which) {
        const found = (which as any)(name);
        if (found) return found;
      } else {
        await execFileAsync(name, ["--version"], { timeout: 2000 });
        return name;
      }
    } catch { /* try next */ }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

let registered = false;
export function ensureStudiosExecutorsRegistered(): void {
  if (registered) return;
  registerExecutor(STUDIOS_IMAGE_GEN_KIND, imageGenRunner);
  registerExecutor(STUDIOS_TTS_KIND, ttsRunner);
  registerExecutor(STUDIOS_STT_KIND, sttRunner);
  registered = true;
  logger.info("studios-executor: registered image_gen, tts_render, stt_job");
}
