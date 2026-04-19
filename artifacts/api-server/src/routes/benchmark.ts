import { Router } from "express";
import { randomUUID } from "crypto";
import { fetchJson, ollamaReachable } from "../lib/runtime.js";
import { getOllamaUrl } from "../lib/ollama-url.js";
import { thoughtLog } from "../lib/thought-log.js";
import { JUDGE_MODEL, BENCHMARK_PROMPT } from "../config/models.config.js";

const router = Router();

// In-memory run store (persisted to SQLite lazily)
const runStore = new Map<string, BenchmarkRun>();

export interface BenchmarkResult {
  model:      string;
  output:     string;
  tokensOut:  number;
  durationMs: number;
  score:      number;   // 1-10 from judge
  scoreReason: string;
}

export interface BenchmarkRun {
  id:        string;
  prompt:    string;
  createdAt: string;
  judgeModel: string;
  status:    "running" | "completed" | "failed";
  results:   BenchmarkResult[];
  error?:    string;
}

async function generateWithModel(
  base: string,
  model: string,
  prompt: string,
): Promise<{ output: string; tokensOut: number; durationMs: number }> {
  const start = Date.now();
  const res = await fetchJson<{
    message?: { content?: string };
    eval_count?: number;
  }>(
    `${base}/api/chat`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        model,
        stream:   false,
        messages: [{ role: "user", content: prompt }],
      }),
    },
    120_000,
  );
  return {
    output:     res.message?.content ?? "",
    tokensOut:  res.eval_count ?? 0,
    durationMs: Date.now() - start,
  };
}

async function judgeOutput(
  base: string,
  judgeModel: string,
  prompt: string,
  output: string,
): Promise<{ score: number; reason: string }> {
  const judgePrompt = [
    "You are an impartial judge. Score the following AI response on a scale of 1-10.",
    "Consider: correctness, clarity, completeness, and conciseness.",
    "Reply with ONLY a JSON object: {\"score\": <1-10>, \"reason\": \"<one sentence>\"}",
    "",
    `Original prompt: ${prompt}`,
    "",
    `Response to judge: ${output.slice(0, 2000)}`,
  ].join("\n");

  try {
    const res = await fetchJson<{ message?: { content?: string } }>(
      `${base}/api/chat`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          model:    judgeModel,
          stream:   false,
          messages: [{ role: "user", content: judgePrompt }],
        }),
      },
      60_000,
    );
    const text = res.message?.content ?? "{}";
    const match = /\{[\s\S]*\}/.exec(text);
    if (match) {
      const parsed = JSON.parse(match[0]) as { score?: number; reason?: string };
      return {
        score:  Math.min(10, Math.max(1, Number(parsed.score) || 5)),
        reason: parsed.reason ?? "No reason provided",
      };
    }
  } catch { /* fall through */ }
  return { score: 5, reason: "Judge failed — score defaulted to 5" };
}

async function runBenchmark(runId: string, models: string[]): Promise<void> {
  const run = runStore.get(runId);
  if (!run) return;

  const base = await getOllamaUrl();

  for (const model of models) {
    thoughtLog.publish({
      category: "kernel",
      title:    "Benchmark Running",
      message:  `Testing model ${model}`,
      metadata: { runId, model },
    });

    try {
      const { output, tokensOut, durationMs } = await generateWithModel(base, model, run.prompt);
      const { score, reason }                 = await judgeOutput(base, run.judgeModel, run.prompt, output);

      run.results.push({ model, output, tokensOut, durationMs, score, scoreReason: reason });
    } catch (err) {
      run.results.push({
        model,
        output:      "",
        tokensOut:   0,
        durationMs:  0,
        score:       0,
        scoreReason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  run.results.sort((a, b) => b.score - a.score || a.durationMs - b.durationMs);
  run.status = "completed";

  // Persist to SQLite lazily
  void import("../db/database.js").then(({ sqlite }) => {
    sqlite.prepare(`
      INSERT OR REPLACE INTO benchmark_runs (id, prompt, created_at, judge_model, results_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(run.id, run.prompt, run.createdAt, run.judgeModel, JSON.stringify(run.results));
  }).catch(() => {});

  thoughtLog.publish({
    category: "kernel",
    title:    "Benchmark Complete",
    message:  `Tested ${models.length} model(s). Top: ${run.results[0]?.model ?? "none"} (score ${run.results[0]?.score ?? 0})`,
    metadata: { runId },
  });
}

router.post("/benchmark/runs", async (req, res) => {
  if (!await ollamaReachable()) {
    return res.status(503).json({ success: false, message: "Ollama not running" });
  }

  const body    = (req.body as Record<string, unknown>) ?? {};
  const models  = Array.isArray(body["models"]) ? (body["models"] as string[]).filter(m => typeof m === "string") : [];
  const prompt  = typeof body["prompt"] === "string" && body["prompt"].trim()
    ? (body["prompt"] as string).trim()
    : BENCHMARK_PROMPT;

  if (models.length === 0) {
    return res.status(400).json({ success: false, message: "models[] array is required" });
  }

  const base       = await getOllamaUrl();
  const tagsRes    = await fetchJson<{ models?: Array<{ name: string }> }>(`${base}/api/tags`, undefined, 5000).catch(() => ({ models: [] }));
  const installed  = new Set((tagsRes.models ?? []).map(m => m.name));
  const judgeModel = models.find(m => installed.has(m)) ?? JUDGE_MODEL;

  const run: BenchmarkRun = {
    id:         randomUUID(),
    prompt,
    createdAt:  new Date().toISOString(),
    judgeModel,
    status:     "running",
    results:    [],
  };
  runStore.set(run.id, run);

  void runBenchmark(run.id, models);

  return res.json({ success: true, run });
});

router.get("/benchmark/runs", (_req, res) => {
  const runs = [...runStore.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return res.json({ success: true, runs });
});

router.get("/benchmark/runs/:id", (req, res) => {
  const run = runStore.get(req.params["id"]!);
  if (!run) return res.status(404).json({ success: false, message: "Run not found" });
  return res.json({ success: true, run });
});

// Load persisted runs from SQLite on first use
void import("../db/database.js").then(({ sqlite }) => {
  try {
    const rows = sqlite.prepare("SELECT * FROM benchmark_runs ORDER BY created_at DESC LIMIT 50").all() as Array<{
      id: string; prompt: string; created_at: string; judge_model: string; results_json: string;
    }>;
    for (const row of rows) {
      if (!runStore.has(row.id)) {
        runStore.set(row.id, {
          id:         row.id,
          prompt:     row.prompt,
          createdAt:  row.created_at,
          judgeModel: row.judge_model,
          status:     "completed",
          results:    JSON.parse(row.results_json) as BenchmarkResult[],
        });
      }
    }
  } catch { /* ignore on first boot */ }
}).catch(() => {});

export default router;
