/**
 * MODEL CONFIGURATION — Single Source of Truth
 * =============================================
 * Rule 4: No model name string literals anywhere else in the codebase.
 * All model names, role preferences, intent patterns, and affinity rules
 * are defined here and imported by all other modules.
 */

// ── Role type ─────────────────────────────────────────────────────────────────

export type ModelRole =
  | "reasoning"
  | "chat"
  | "deep-reasoning"
  | "primary-coding"
  | "fast-coding"
  | "autocomplete"
  | "vision"
  | "stt"
  | "imagegen"
  | "embedding";

// ── Model spec ────────────────────────────────────────────────────────────────

export interface ModelSpec {
  role:                ModelRole;
  /** Ollama model name used in API calls (e.g. "llama3.1:8b") */
  name:                string;
  /** Full Ollama pull string (e.g. "ollama pull llama3.1:8b") */
  pullString:          string;
  installMethod:       "ollama";
  /** Approximate VRAM requirement in bytes at this quant level */
  vramBytes:           number;
  /** Minimum VRAM to run (may be slow) */
  minVramBytes:        number;
  /** Preferred VRAM for full performance */
  preferredVramBytes:  number;
  modality:            "text" | "vision" | "embedding" | "audio" | "image";
  purpose:             string;
  quant:               string;
  runtimeClass:        "tiny" | "small" | "medium" | "large";
}

const GB = 1024 ** 3;

// ── USER_STACK — the 10 canonical models from Global Rules ────────────────────

export const USER_STACK: ModelSpec[] = [
  {
    role:               "reasoning",
    name:               "deepseek-v3-16b",
    pullString:         "ollama pull deepseek-v3:16b",
    installMethod:      "ollama",
    vramBytes:          10 * GB,
    minVramBytes:       8  * GB,
    preferredVramBytes: 12 * GB,
    modality:           "text",
    purpose:            "General reasoning, debugging, complex analysis",
    quant:              "Q4_K_M",
    runtimeClass:       "large",
  },
  {
    role:               "chat",
    name:               "llama3.1:8b",
    pullString:         "ollama pull llama3.1:8b",
    installMethod:      "ollama",
    vramBytes:          5 * GB,
    minVramBytes:       4 * GB,
    preferredVramBytes: 6 * GB,
    modality:           "text",
    purpose:            "General chat, research, writing",
    quant:              "Q4_K_M",
    runtimeClass:       "small",
  },
  {
    role:               "deep-reasoning",
    name:               "deepseek-r1-distill-qwen-14b",
    pullString:         "ollama pull deepseek-r1:14b",
    installMethod:      "ollama",
    vramBytes:          9  * GB,
    minVramBytes:       8  * GB,
    preferredVramBytes: 10 * GB,
    modality:           "text",
    purpose:            "Deep chain-of-thought reasoning, complex problem solving",
    quant:              "Q4_K_M",
    runtimeClass:       "medium",
  },
  {
    role:               "primary-coding",
    name:               "qwen3-coder:30b",
    pullString:         "ollama pull qwen3-coder:30b",
    installMethod:      "ollama",
    vramBytes:          19 * GB,
    minVramBytes:       12 * GB,
    preferredVramBytes: 20 * GB,
    modality:           "text",
    purpose:            "Primary code generation, multi-file edits, large codebase navigation",
    quant:              "Q4_K_M",
    runtimeClass:       "large",
  },
  {
    role:               "fast-coding",
    name:               "qwen2.5-coder:7b",
    pullString:         "ollama pull qwen2.5-coder:7b",
    installMethod:      "ollama",
    vramBytes:          Math.round(4.5 * GB),
    minVramBytes:       4 * GB,
    preferredVramBytes: 5 * GB,
    modality:           "text",
    purpose:            "Fast code edits, quick completions, autocomplete fallback",
    quant:              "Q4_K_M",
    runtimeClass:       "small",
  },
  {
    role:               "autocomplete",
    name:               "qwen2.5-coder:1.5b",
    pullString:         "ollama pull qwen2.5-coder:1.5b",
    installMethod:      "ollama",
    vramBytes:          1 * GB,
    minVramBytes:       512 * 1024 * 1024,
    preferredVramBytes: 1 * GB,
    modality:           "text",
    purpose:            "Inline tab-completion — smallest and fastest",
    quant:              "Q4_K_M",
    runtimeClass:       "tiny",
  },
  {
    role:               "vision",
    name:               "llava:v1.6",
    pullString:         "ollama pull llava:v1.6",
    installMethod:      "ollama",
    vramBytes:          12 * GB,
    minVramBytes:       8  * GB,
    preferredVramBytes: 12 * GB,
    modality:           "vision",
    purpose:            "Multimodal image understanding, visual Q&A, screenshot analysis",
    quant:              "Q4_K_M",
    runtimeClass:       "large",
  },
  {
    role:               "stt",
    name:               "faster-whisper-large-v3",
    pullString:         "pip install faster-whisper",
    installMethod:      "ollama",
    vramBytes:          3 * GB,
    minVramBytes:       2 * GB,
    preferredVramBytes: 3 * GB,
    modality:           "audio",
    purpose:            "Speech-to-text transcription",
    quant:              "float16",
    runtimeClass:       "medium",
  },
  {
    role:               "imagegen",
    name:               "flux.1-schnell",
    pullString:         "comfyui model install flux.1-schnell",
    installMethod:      "ollama",
    vramBytes:          8 * GB,
    minVramBytes:       6 * GB,
    preferredVramBytes: 8 * GB,
    modality:           "image",
    purpose:            "Fast image generation via ComfyUI or SD WebUI",
    quant:              "fp8",
    runtimeClass:       "large",
  },
  {
    role:               "embedding",
    name:               "nomic-embed-text",
    pullString:         "ollama pull nomic-embed-text",
    installMethod:      "ollama",
    vramBytes:          Math.round(0.274 * GB),
    minVramBytes:       128 * 1024 * 1024,
    preferredVramBytes: Math.round(0.5 * GB),
    modality:           "embedding",
    purpose:            "Semantic search, RAG pipelines, code context indexing",
    quant:              "F32",
    runtimeClass:       "tiny",
  },
];

// ── Convenience lookup ────────────────────────────────────────────────────────

/** Model name for a given role from USER_STACK */
export function stackModel(role: ModelRole): string {
  return USER_STACK.find(s => s.role === role)?.name ?? "";
}

// ── INTENT_PATTERNS — from supervisor-agent.ts CATEGORY_PATTERNS ─────────────

export type TaskCategory = "coding" | "sysadmin" | "hardware" | "general";

export const INTENT_PATTERNS: Record<TaskCategory, RegExp[]> = {
  coding: [
    /```[\s\S]*```/,
    /`[^`]+`/,
    /\b(code|debug|fix|refactor|typescript|javascript|python|function|class|stack ?trace|compile|build ?error|sql|regex|api|endpoint|component|hook|module|import|export|unit ?test|jest|vitest|eslint|prettier|git|commit|branch|merge|pull ?request|dockerfile|ci\/cd)\b/i,
  ],
  sysadmin: [
    /\b(server|deploy|nginx|docker|kubernetes|k8s|service|daemon|process|port|firewall|ssl|certificate|cron|systemd|pm2|bash|shell|script|install|upgrade|dependency|npm|pip|brew|apt|yum|winget|configure|environment|env|variable|restart|reload|permission|chmod|sudo|admin|ssh|vpn|network|dns)\b/i,
  ],
  hardware: [
    /\b(cad|3d|openscad|blender|fusion\s*360|solidworks|stl|g[-_]?code|printer|filament|pla|abs|petg|nozzle|slicer|freecad|mesh|render|brim|support|infill|layer|circuit|pcb|arduino|raspberry|gpio|sensor|actuator|motor|servo|cnc|milling|extrude)\b/i,
  ],
  general: [
    /\b(explain|what|how|why|help|write|create|summarize|translate|analyze|review|compare|list|describe|tell me|give me|show me)\b/i,
  ],
};

export const VISION_PATTERN =
  /\b(image|photo|picture|screenshot|diagram|chart|vision|ocr|look at|analyze this image|what do you see)\b/i;

// ── AFFINITY_PATTERNS — from model-orchestrator.ts inferIntentFromModelName ───

export type RouteAffinity = "code" | "vision" | "general";

export const AFFINITY_PATTERNS: Array<{
  test: (name: string) => boolean;
  affinity: RouteAffinity;
}> = [
  {
    test: (n) =>
      n.includes("llava") ||
      n.includes("-vl") ||
      n.includes("vision") ||
      n.includes("minicpm-v") ||
      n.includes("moondream"),
    affinity: "vision",
  },
  {
    test: (n) =>
      n.includes("coder") ||
      n.includes("codellama") ||
      n.includes("codegemma") ||
      n.includes("starcoder") ||
      n.includes("deepseek"),
    affinity: "code",
  },
];

export function inferAffinityFromName(modelName: string): RouteAffinity {
  const n = modelName.toLowerCase();
  for (const { test, affinity } of AFFINITY_PATTERNS) {
    if (test(n)) return affinity;
  }
  return "general";
}

// ── INTENT_PREFERENCES — model routing preferences per intent ─────────────────

export type RouteIntent = "code" | "vision" | "general";

/** Supervisor-agent category preferences (first installed wins) */
export const SUPERVISOR_PREFERENCES: Record<TaskCategory, string[]> = {
  coding:   ["deepseek-coder-v2", "deepseek-r1", "qwen3-coder", "qwen2.5-coder", "codellama", "starcoder2"],
  sysadmin: ["deepseek-r1", "qwen3", "llama3.1", "mistral", "phi4"],
  hardware: ["llava", "qwen2.5-vl", "minicpm-v", "moondream", "deepseek-r1", "qwen3"],
  general:  ["llama3.1", "llama3.2", "qwen3", "mistral", "gemma3", "phi4"],
};

/** Orchestrator canonical preferences per route intent */
export const INTENT_PREFERENCES: Record<RouteIntent, string[]> = {
  code:    ["deepseek-coder", "deepseek-r1", "qwen3-coder", "qwen2.5-coder", "codellama"],
  vision:  ["llava", "llava-phi3", "qwen2.5-vl", "minicpm-v", "moondream"],
  general: ["llama3.1", "llama3.2", "llama3", "qwen3", "mistral", "gemma3"],
};

/** Default model fallback when no role is assigned */
export const DEFAULT_FALLBACK_MODEL = "llama3.1";

/** Default coding model fallback */
export const DEFAULT_CODING_FALLBACK = "qwen2.5-coder:7b";

// ── DISCOVERY_SEEDS — from model-discovery.ts SEED_MODELS ────────────────────

export interface ModelSeed {
  modelName: string;
  tags:      string[];
  category:  "coding" | "general" | "reasoning" | "uncensored" | "vision" | "embedding";
  aliases?:  string[];
  keywords?: string[];
}

export const DISCOVERY_SEEDS: ModelSeed[] = [
  // ── Coding ────────────────────────────────────────────────────────────────
  { modelName: "qwen3-coder",           tags: ["30b", "8b"],              category: "coding",     aliases: ["qwen coder"] },
  { modelName: "qwen2.5-coder",         tags: ["32b", "14b", "7b", "1.5b"], category: "coding" },
  { modelName: "deepseek-coder-v2",     tags: ["16b"],                    category: "coding",     aliases: ["deepseek coder"] },
  { modelName: "deepseek-coder",        tags: ["33b", "6.7b", "1.3b"],   category: "coding" },
  { modelName: "codellama",             tags: ["70b", "34b", "13b", "7b"], category: "coding",    aliases: ["code llama"] },
  { modelName: "codegemma",             tags: ["7b", "2b"],               category: "coding" },
  { modelName: "starcoder2",            tags: ["15b", "7b", "3b"],        category: "coding" },
  { modelName: "starcoder",             tags: ["latest"],                  category: "coding" },
  { modelName: "phind-codellama",       tags: ["34b", "34b-v2"],          category: "coding" },
  { modelName: "wizardcoder",           tags: ["33b", "13b"],             category: "coding" },
  { modelName: "magicoder",             tags: ["7b"],                      category: "coding" },
  { modelName: "stable-code",           tags: ["3b"],                      category: "coding" },
  { modelName: "yi-coder",              tags: ["9b", "1.5b"],             category: "coding" },
  { modelName: "granite-code",          tags: ["34b", "20b", "8b", "3b"], category: "coding" },
  { modelName: "opencoder",             tags: ["8b", "1.5b"],             category: "coding" },
  { modelName: "qwen2.5-coder-abliterated", tags: ["7b"],                 category: "coding",     keywords: ["uncensored"] },

  // ── General ───────────────────────────────────────────────────────────────
  { modelName: "qwen3",                 tags: ["32b", "14b", "8b", "4b"], category: "general" },
  { modelName: "gemma3",                tags: ["27b", "12b", "4b", "1b"], category: "general" },
  { modelName: "gemma2",                tags: ["27b", "9b", "2b"],        category: "general" },
  { modelName: "llama3.3",              tags: ["70b"],                     category: "general",    aliases: ["llama 3.3"] },
  { modelName: "llama3.1",              tags: ["405b", "70b", "8b"],       category: "general",    aliases: ["llama 3.1"] },
  { modelName: "llama3.2",              tags: ["90b", "11b", "3b", "1b"], category: "general",    aliases: ["llama 3.2"] },
  { modelName: "llama3",                tags: ["70b", "8b"],               category: "general",    aliases: ["llama 3"] },
  { modelName: "llama2",                tags: ["70b", "13b", "7b"],        category: "general",    aliases: ["llama 2"] },
  { modelName: "mistral",               tags: ["7b"],                      category: "general" },
  { modelName: "mistral-small",         tags: ["24b"],                     category: "general",    aliases: ["mistral small"] },
  { modelName: "mistral-nemo",          tags: ["12b"],                     category: "general" },
  { modelName: "mixtral",               tags: ["8x22b", "8x7b"],           category: "general" },
  { modelName: "phi4",                  tags: ["latest"],                  category: "general" },
  { modelName: "phi4-mini",             tags: ["latest"],                  category: "general" },
  { modelName: "phi3.5",                tags: ["latest"],                  category: "general" },
  { modelName: "phi3",                  tags: ["medium", "mini"],          category: "general" },
  { modelName: "granite3.1-moe",        tags: ["3b", "1b"],               category: "general" },
  { modelName: "granite3-dense",        tags: ["8b", "2b"],               category: "general" },
  { modelName: "internlm2",             tags: ["20b", "7b", "1.8b"],      category: "general" },
  { modelName: "aya",                   tags: ["35b", "23b"],              category: "general",    aliases: ["aya-expanse"] },
  { modelName: "command-r",             tags: ["35b"],                     category: "general" },
  { modelName: "command-r-plus",        tags: ["104b"],                    category: "general" },
  { modelName: "nous-hermes2",          tags: ["34b", "10.7b"],           category: "general" },
  { modelName: "openhermes",            tags: ["2.5"],                     category: "general" },
  { modelName: "zephyr",                tags: ["7b", "141b"],              category: "general" },
  { modelName: "solar",                 tags: ["10.7b"],                   category: "general" },
  { modelName: "smollm2",               tags: ["1.7b", "360m", "135m"],   category: "general" },
  { modelName: "tinyllama",             tags: ["1.1b"],                    category: "general" },
  { modelName: "falcon3",               tags: ["10b", "7b", "3b", "1b"],  category: "general" },
  { modelName: "exaone3.5",             tags: ["7.8b", "2.4b", "0.5b"],   category: "general" },

  // ── Reasoning ─────────────────────────────────────────────────────────────
  { modelName: "deepseek-r1",           tags: ["70b", "32b", "14b", "8b", "7b", "1.5b"], category: "reasoning" },
  { modelName: "qwq",                   tags: ["32b"],                     category: "reasoning" },
  { modelName: "marco-o1",              tags: ["7b"],                      category: "reasoning" },
  { modelName: "openthinker",           tags: ["32b", "7b"],               category: "reasoning" },
  { modelName: "phi4-reasoning",        tags: ["plus", "latest"],          category: "reasoning" },
  { modelName: "granite3.1-dense",      tags: ["8b", "2b"],               category: "reasoning" },
  { modelName: "deepscaler",            tags: ["15b"],                     category: "reasoning" },
  { modelName: "sky-t1",                tags: ["32b"],                     category: "reasoning" },
  { modelName: "r1-1776",               tags: ["70b"],                     category: "reasoning" },

  // ── Uncensored / Abliterated ──────────────────────────────────────────────
  { modelName: "dolphin3",              tags: ["8b"],                      category: "uncensored", keywords: ["abliterated", "uncensored"] },
  { modelName: "dolphin-mixtral",       tags: ["8x22b", "8x7b"],           category: "uncensored", keywords: ["abliterated", "uncensored"] },
  { modelName: "dolphin-llama3",        tags: ["70b", "8b"],               category: "uncensored", keywords: ["abliterated"] },
  { modelName: "dolphin-phi",           tags: ["2.7b"],                    category: "uncensored", keywords: ["abliterated"] },
  { modelName: "neural-daredevil",      tags: ["8b"],                      category: "uncensored", keywords: ["abliterated", "uncensored"] },
  { modelName: "glm4",                  tags: ["9b"],                      category: "uncensored", keywords: ["abliterated", "storytelling"] },
  { modelName: "falcon3-abliterated",   tags: ["10b", "7b"],               category: "uncensored", keywords: ["abliterated"] },
  { modelName: "llama3-groq-tool-use",  tags: ["70b", "8b"],               category: "uncensored", keywords: ["tool-use"] },
  { modelName: "wizardlm2",             tags: ["8x22b", "7b"],             category: "uncensored" },
  { modelName: "samantha-mistral",      tags: ["7b"],                      category: "uncensored" },
  { modelName: "stablelm2",             tags: ["12b", "1.6b"],             category: "uncensored" },

  // ── Vision ────────────────────────────────────────────────────────────────
  { modelName: "qwen2.5-vl",            tags: ["72b", "7b", "3b"],         category: "vision" },
  { modelName: "minicpm-v",             tags: ["latest"],                  category: "vision" },
  { modelName: "llava",                 tags: ["34b", "13b", "7b"],        category: "vision" },
  { modelName: "llava-phi3",            tags: ["latest"],                  category: "vision" },
  { modelName: "llava-llama3",          tags: ["8b"],                      category: "vision" },
  { modelName: "moondream",             tags: ["latest"],                  category: "vision" },
  { modelName: "bakllava",              tags: ["7b"],                      category: "vision" },
  { modelName: "llama3.2-vision",       tags: ["90b", "11b"],              category: "vision" },
  { modelName: "granite3.2-vision",     tags: ["2b"],                      category: "vision" },
  { modelName: "gemma3",                tags: ["27b-it", "12b-it", "4b-it"], category: "vision" },
  { modelName: "internvl3",             tags: ["14b", "8b", "4b", "2b", "1b"], category: "vision" },

  // ── Embedding ─────────────────────────────────────────────────────────────
  { modelName: "nomic-embed-text",      tags: ["latest"],                  category: "embedding" },
  { modelName: "mxbai-embed-large",     tags: ["latest"],                  category: "embedding" },
  { modelName: "all-minilm",            tags: ["latest"],                  category: "embedding" },
  { modelName: "snowflake-arctic-embed", tags: ["335m", "137m", "33m", "22m"], category: "embedding" },
  { modelName: "bge-m3",                tags: ["latest"],                  category: "embedding" },
  { modelName: "bge-large",             tags: ["latest"],                  category: "embedding" },
  { modelName: "paraphrase-multilingual", tags: ["latest"],                category: "embedding" },
  { modelName: "nomic-embed-code",      tags: ["latest"],                  category: "embedding" },
];

// ── CODING_FALLBACK_SEARCH_ORDER — from global-workspace-intelligence.ts ──────

/** Ordered model name prefixes to search when picking a coding model from installed list */
export const CODING_FALLBACK_SEARCH_ORDER: string[] = [
  "qwen3-coder",
  "qwen2.5-coder",
];

/** Model used as benchmark judge (arbiter) */
export const JUDGE_MODEL = "llama3.1:8b";

/** Default benchmark prompt */
export const BENCHMARK_PROMPT =
  "Explain the difference between a mutex and a semaphore. Give a concrete code example for each in any language.";

/** Warm-up model count: preload top N most-used models on boot */
export const WARMUP_TOP_N = 2;
