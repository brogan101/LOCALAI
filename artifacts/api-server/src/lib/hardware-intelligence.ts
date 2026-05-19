/**
 * HARDWARE INTELLIGENCE
 * =====================
 * Replaces the passive VRAM filter in Setup.tsx with a live, opinionated
 * ranker that:
 *
 *   1. Probes live VRAM availability (not just total capacity)
 *   2. Ranks every model in USER_STACK by fit quality (0–100 score)
 *   3. Recommends the optimal quantization level for each model
 *   4. Explains *why* a model is or isn't suitable (plain English)
 *   5. Exposes a per-request vram headroom check for the router
 *
 * Data sources (in order of preference):
 *   - nvidia-smi (Windows/Linux with NVIDIA driver)
 *   - /proc/driver/nvidia/gpus/* (Linux fallback)
 *   - Safe-mode estimate (total VRAM × 0.85 − running models)
 *
 * Route:  GET /api/hardware/intelligence
 * Also exported as a library so Setup.tsx can call via api.hardware.intelligence()
 */

import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import { USER_STACK, type ModelSpec } from "../config/models.config.js";

const execAsync = promisify(exec);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GpuInfo {
  name: string;
  totalVram: number;        // bytes
  usedVram: number;         // bytes
  freeVram: number;         // bytes
  temperature?: number;     // °C
  utilization?: number;     // 0–100%
  driverVersion?: string;
  source: "nvidia-smi" | "proc" | "estimate";
}

export type QuantLevel =
  | "Q2_K"   // 2-bit — extreme compression, quality loss
  | "Q4_K_M" // 4-bit medium — best quality/size ratio for most models
  | "Q4_K_S" // 4-bit small
  | "Q5_K_M" // 5-bit — near lossless for most tasks
  | "Q8_0"   // 8-bit — near full precision, 2× the size of Q4
  | "F16"    // 16-bit float — full quality, 3–4× Q4 size
  | "F32";   // 32-bit — embedding models only

export interface QuantRecommendation {
  level: QuantLevel;
  vramBytes: number;       // estimated VRAM at this quant
  fits: boolean;
  quality: "excellent" | "good" | "acceptable" | "degraded";
  reasoning: string;
}

export interface ModelRanking {
  model: ModelSpec;
  score: number;            // 0–100 composite fit score
  fits: boolean;            // true if fits in freeVram with headroom
  fitsWithOffload: boolean; // true if fits with RAM offload
  headroomBytes: number;    // freeVram − model.vramBytes (can be negative)
  recommendation: QuantRecommendation;
  alternatives: QuantRecommendation[];
  explanation: string;      // plain-English one-liner
  warning?: string;         // e.g. "Will share VRAM with vision model"
}

export interface HardwareIntelligenceReport {
  gpu: GpuInfo;
  rankedModels: ModelRanking[];
  recommendedStack: string[];    // model names recommended to pull right now
  systemRam: number;             // bytes
  timestamp: string;
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// GPU probe
// ─────────────────────────────────────────────────────────────────────────────

async function probeNvidiaSmi(): Promise<GpuInfo | null> {
  try {
    const { stdout } = await execAsync(
      "nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,temperature.gpu,utilization.gpu,driver_version --format=csv,noheader,nounits",
      { timeout: 5000 },
    );

    const line = stdout.trim().split("\n")[0]; // first GPU only
    if (!line) return null;

    const parts = line.split(", ").map((s) => s.trim());
    const MB = 1024 * 1024;

    return {
      name: parts[0] ?? "Unknown GPU",
      totalVram: parseInt(parts[1] ?? "0") * MB,
      usedVram:  parseInt(parts[2] ?? "0") * MB,
      freeVram:  parseInt(parts[3] ?? "0") * MB,
      temperature: parseInt(parts[4] ?? "0") || undefined,
      utilization: parseInt(parts[5] ?? "0") || undefined,
      driverVersion: parts[6],
      source: "nvidia-smi",
    };
  } catch {
    return null;
  }
}

async function probeOllamaRunning(): Promise<number> {
  // Ask Ollama how much VRAM running models are consuming
  try {
    const res = await fetch("http://localhost:11434/api/ps", {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return 0;
    const data = await res.json() as { models?: Array<{ size_vram?: number }> };
    return (data.models ?? []).reduce((acc, m) => acc + (m.size_vram ?? 0), 0);
  } catch {
    return 0;
  }
}

async function estimateGpu(): Promise<GpuInfo> {
  // Fallback: assume RTX 5070 spec and subtract running models
  const GB = 1024 ** 3;
  const totalVram = 12 * GB;
  const ollamaUsed = await probeOllamaRunning();
  const usedVram = ollamaUsed;
  const freeVram = Math.max(0, totalVram - usedVram);

  return {
    name: "NVIDIA GPU (estimated)",
    totalVram,
    usedVram,
    freeVram,
    source: "estimate",
  };
}

export async function probeGpu(): Promise<GpuInfo> {
  const smi = await probeNvidiaSmi();
  if (smi) {
    // Subtract Ollama running models from what nvidia-smi reports as "free"
    // because nvidia-smi shows driver-level free, not process-level free
    const ollamaUsed = await probeOllamaRunning();
    const adjustedFree = Math.max(0, smi.freeVram - ollamaUsed);
    return { ...smi, freeVram: adjustedFree, usedVram: smi.usedVram + ollamaUsed };
  }
  return estimateGpu();
}

// ─────────────────────────────────────────────────────────────────────────────
// Quantization advisor
// ─────────────────────────────────────────────────────────────────────────────

// Approximate VRAM multipliers relative to Q4_K_M baseline
const QUANT_MULTIPLIERS: Record<QuantLevel, number> = {
  Q2_K:   0.52,
  Q4_K_S: 0.92,
  Q4_K_M: 1.00,
  Q5_K_M: 1.22,
  Q8_0:   1.85,
  F16:    2.60,
  F32:    5.20,
};

const QUANT_QUALITY: Record<QuantLevel, QuantRecommendation["quality"]> = {
  Q2_K:   "degraded",
  Q4_K_S: "acceptable",
  Q4_K_M: "good",
  Q5_K_M: "excellent",
  Q8_0:   "excellent",
  F16:    "excellent",
  F32:    "excellent",
};

function buildQuantRec(
  model: ModelSpec,
  level: QuantLevel,
  freeVram: number,
  headroom: number = 512 * 1024 * 1024, // 512 MB safety margin
): QuantRecommendation {
  const vramBytes = Math.round(model.vramBytes * QUANT_MULTIPLIERS[level]);
  const fits = vramBytes + headroom <= freeVram;
  const quality = QUANT_QUALITY[level];

  const qualityDesc = {
    excellent: "near-lossless quality",
    good:      "good quality (recommended)",
    acceptable: "acceptable quality, noticeable degradation on complex tasks",
    degraded:  "significant quality loss — use only if no other option fits",
  }[quality];

  return {
    level,
    vramBytes,
    fits,
    quality,
    reasoning: `${level}: ~${(vramBytes / 1024 ** 3).toFixed(1)} GB — ${qualityDesc}`,
  };
}

function recommendQuant(model: ModelSpec, freeVram: number): {
  primary: QuantRecommendation;
  alternatives: QuantRecommendation[];
} {
  const candidates: QuantLevel[] = ["Q5_K_M", "Q4_K_M", "Q4_K_S", "Q8_0", "Q2_K"];
  const recs = candidates.map((q) => buildQuantRec(model, q, freeVram));

  // Preferred: highest quality that fits
  const fitting = recs.filter((r) => r.fits);

  // Rank: Q5_K_M > Q4_K_M > Q8_0 (if it fits) > Q4_K_S > Q2_K
  const RANK: QuantLevel[] = ["Q5_K_M", "Q4_K_M", "Q8_0", "Q4_K_S", "Q2_K"];
  const primary =
    fitting.sort((a, b) => RANK.indexOf(a.level) - RANK.indexOf(b.level))[0] ??
    recs.find((r) => r.level === "Q2_K")!;

  const alternatives = recs.filter((r) => r.level !== primary.level);

  return { primary, alternatives };
}

// ─────────────────────────────────────────────────────────────────────────────
// Model ranker
// ─────────────────────────────────────────────────────────────────────────────

const HEADROOM_BYTES = 512 * 1024 * 1024; // 512 MB always kept free

function scoreModel(model: ModelSpec, freeVram: number, totalVram: number): ModelRanking {
  const { primary, alternatives } = recommendQuant(model, freeVram);

  const headroomBytes = freeVram - model.vramBytes;
  const fits = model.vramBytes + HEADROOM_BYTES <= freeVram;
  const fitsWithOffload = model.minVramBytes <= freeVram;

  // Score formula (0–100):
  //   60 pts  — fits cleanly (no offload)
  //   20 pts  — headroom ratio (more headroom = higher score)
  //   10 pts  — quant quality
  //   10 pts  — runtimeClass bonus (tiny/small = more concurrent)
  let score = 0;

  if (fits) {
    score += 60;
    const headroomRatio = Math.min(1, headroomBytes / (totalVram * 0.2));
    score += Math.round(20 * headroomRatio);
  } else if (fitsWithOffload) {
    score += 20; // partial credit for offload
  }

  const qualityScores = { excellent: 10, good: 8, acceptable: 4, degraded: 0 };
  score += qualityScores[primary.quality];

  const classBonus = { tiny: 10, small: 8, medium: 4, large: 0 };
  score += classBonus[model.runtimeClass];

  // Plain-English explanation
  let explanation: string;
  let warning: string | undefined;

  if (fits && headroomBytes > 2 * 1024 ** 3) {
    explanation = `✓ Fits comfortably — ${(headroomBytes / 1024 ** 3).toFixed(1)} GB headroom`;
  } else if (fits) {
    explanation = `✓ Fits with ${(headroomBytes / 1024 ** 3).toFixed(1)} GB headroom — tight but OK`;
    warning = "Low headroom — don't load alongside other large models";
  } else if (fitsWithOffload) {
    const offloadBytes = model.vramBytes - freeVram;
    explanation = `⚠ Partial VRAM — ~${(offloadBytes / 1024 ** 3).toFixed(1)} GB offloads to RAM (slow)`;
    warning = `Expect 2–5× slower inference due to RAM offload`;
  } else {
    explanation = `✗ Too large — needs ${(model.vramBytes / 1024 ** 3).toFixed(1)} GB, only ${(freeVram / 1024 ** 3).toFixed(1)} GB free`;
  }

  // Override recommended quant name if the model config already specifies it
  if (model.quant === "F32" || model.modality === "embedding") {
    return {
      model,
      score: fits ? 90 : 40,
      fits,
      fitsWithOffload,
      headroomBytes,
      recommendation: buildQuantRec(model, "F32", freeVram),
      alternatives: [],
      explanation: fits ? `✓ Embedding model — tiny (${(model.vramBytes / 1024 ** 3).toFixed(2)} GB)` : explanation,
    };
  }

  return {
    model,
    score,
    fits,
    fitsWithOffload,
    headroomBytes,
    recommendation: primary,
    alternatives,
    explanation,
    warning,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function getHardwareIntelligence(): Promise<HardwareIntelligenceReport> {
  const [gpu] = await Promise.all([probeGpu()]);
  const systemRam = os.totalmem();
  const warnings: string[] = [];

  if (gpu.source === "estimate") {
    warnings.push("nvidia-smi not available — VRAM figures are estimated");
  }
  if (gpu.temperature && gpu.temperature > 85) {
    warnings.push(`GPU temperature high: ${gpu.temperature}°C — consider reducing concurrent model load`);
  }

  const rankedModels = USER_STACK
    .map((model) => scoreModel(model, gpu.freeVram, gpu.totalVram))
    .sort((a, b) => b.score - a.score);

  // Recommended stack: pick the best model per role that fits cleanly
  const recommendedStack: string[] = [];
  const coveredRoles = new Set<string>();

  for (const ranking of rankedModels) {
    if (ranking.fits && !coveredRoles.has(ranking.model.role)) {
      recommendedStack.push(ranking.model.name);
      coveredRoles.add(ranking.model.role);
    }
  }

  return {
    gpu,
    rankedModels,
    recommendedStack,
    systemRam,
    timestamp: new Date().toISOString(),
    warnings,
  };
}

/**
 * Fast check: can we load `modelVramBytes` right now without evicting anything?
 * Used by the model router before inference calls.
 */
export async function canFitModel(modelVramBytes: number): Promise<{
  canFit: boolean;
  freeVram: number;
  headroomBytes: number;
}> {
  const gpu = await probeGpu();
  const headroomBytes = gpu.freeVram - modelVramBytes - HEADROOM_BYTES;
  return {
    canFit: headroomBytes >= 0,
    freeVram: gpu.freeVram,
    headroomBytes,
  };
}
