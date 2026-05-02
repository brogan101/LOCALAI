import { Router } from "express";
import { readFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { toolsRoot, ensureDir } from "../lib/runtime.js";
import { writeManagedJson } from "../lib/snapshot-manager.js";
import { loadSettings, saveSettings } from "../lib/secure-config.js";

const router = Router();
const USAGE_DIR = path.join(toolsRoot(), "usage");

// Claude Sonnet 4 API pricing used for the "cost-saved" counter
const CLAUDE_COST_PER_INPUT_TOKEN  = 3  / 1_000_000; // $3 / 1M input tokens
const CLAUDE_COST_PER_OUTPUT_TOKEN = 15 / 1_000_000; // $15 / 1M output tokens

const DEFAULT_SETTINGS = {
  tokenWarningThreshold: 50000,
  dailyTokenLimit: 200000,
  defaultChatModel: "",
  defaultCodingModel: "",
  autoStartOllama: true,
  showTokenCounts: true,
  chatHistoryDays: 30,
  theme: "dark",
  notificationsEnabled: true,
  modelDownloadPath: "",
  preferredInstallMethod: "pip",
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function usageFile(d: string): string {
  return path.join(USAGE_DIR, `${d}.json`);
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

async function loadDay(date: string): Promise<any> {
  if (existsSync(usageFile(date))) {
    try {
      return JSON.parse(await readFile(usageFile(date), "utf-8"));
    } catch {}
  }
  return { date, totalTokens: 0, totalRequests: 0, byModel: {}, sessions: [] };
}

async function saveDay(day: any): Promise<void> {
  await ensureDir(USAGE_DIR);
  await writeManagedJson(usageFile(day.date), day);
}

async function loadAppSettings(): Promise<any> {
  try {
    return await loadSettings();
  } catch {}
  return DEFAULT_SETTINGS;
}

// ── Write usage_metrics to SQLite (fire-and-forget) ───────────────────────────

async function upsertUsageMetric(
  date: string,
  tokensIn: number,
  tokensOut: number,
  providerKind: "local" | "cloud",
  costEstimateUsd?: number | null,
): Promise<void> {
  try {
    const { sqlite } = await import("../db/database.js");
    const fallbackCostIn  = tokensIn  * CLAUDE_COST_PER_INPUT_TOKEN;
    const fallbackCostOut = tokensOut * CLAUDE_COST_PER_OUTPUT_TOKEN;
    const cost = providerKind === "local" ? 0 : costEstimateUsd ?? fallbackCostIn + fallbackCostOut;
    const localTokens = providerKind === "local" ? tokensIn + tokensOut : 0;
    const cloudTokens = providerKind === "cloud" ? tokensIn + tokensOut : 0;
    const localCost = providerKind === "local" ? 0 : 0;
    const cloudCost = providerKind === "cloud" ? cost : 0;
    sqlite.prepare(`
      INSERT INTO usage_metrics
        (date, tokens_in, tokens_out, cost_estimate_usd, local_tokens, cloud_tokens, local_cost_usd, cloud_cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        tokens_in         = tokens_in         + excluded.tokens_in,
        tokens_out        = tokens_out        + excluded.tokens_out,
        cost_estimate_usd = cost_estimate_usd + excluded.cost_estimate_usd,
        local_tokens      = local_tokens      + excluded.local_tokens,
        cloud_tokens      = cloud_tokens      + excluded.cloud_tokens,
        local_cost_usd    = local_cost_usd    + excluded.local_cost_usd,
        cloud_cost_usd    = cloud_cost_usd    + excluded.cloud_cost_usd
    `).run(date, tokensIn, tokensOut, cost, localTokens, cloudTokens, localCost, cloudCost);
  } catch { /* non-fatal */ }
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.post("/usage/record", async (req, res) => {
  const {
    model,
    inputText, outputText,
    inputTokens: rawIn, outputTokens: rawOut,
    durationMs = 0, sessionId,
    providerKind: rawProviderKind,
    costEstimateUsd: rawCostEstimateUsd,
  } = req.body;
  if (!model) return res.status(400).json({ success: false, message: "model required" });

  const providerKind: "local" | "cloud" = rawProviderKind === "cloud" ? "cloud" : "local";
  const costEstimateUsd = typeof rawCostEstimateUsd === "number" ? rawCostEstimateUsd : providerKind === "local" ? 0 : null;
  const inputTokens  = rawIn  ?? (inputText  ? estimateTokens(inputText)  : 0);
  const outputTokens = rawOut ?? (outputText ? estimateTokens(outputText) : 0);
  const totalTokens  = inputTokens + outputTokens;
  const today = todayKey();
  const day   = await loadDay(today);

  day.totalTokens   += totalTokens;
  day.totalRequests += 1;

  if (!day.byModel[model]) {
    day.byModel[model] = { tokens: 0, requests: 0, avgMs: 0, inputTokens: 0, outputTokens: 0 };
  }
  day.byProvider ||= {
    local: { tokens: 0, requests: 0, costEstimateUsd: 0 },
    cloud: { tokens: 0, requests: 0, costEstimateUsd: 0 },
  };
  day.byProvider[providerKind] ||= { tokens: 0, requests: 0, costEstimateUsd: 0 };
  day.byProvider[providerKind].tokens += totalTokens;
  day.byProvider[providerKind].requests += 1;
  day.byProvider[providerKind].costEstimateUsd += costEstimateUsd ?? 0;
  const m = day.byModel[model];
  m.tokens        += totalTokens;
  m.inputTokens    = (m.inputTokens  || 0) + inputTokens;
  m.outputTokens   = (m.outputTokens || 0) + outputTokens;
  m.requests      += 1;
  m.avgMs          = Math.round((m.avgMs * (m.requests - 1) + durationMs) / m.requests);

  if (sessionId) {
    const existing = day.sessions.find((s: any) => s.sessionId === sessionId);
    if (existing) {
      existing.tokens       += totalTokens;
      existing.inputTokens   = (existing.inputTokens  || 0) + inputTokens;
      existing.outputTokens  = (existing.outputTokens || 0) + outputTokens;
      existing.messageCount  = (existing.messageCount || 0) + 1;
      existing.endedAt       = new Date().toISOString();
    } else {
      day.sessions.push({
        sessionId, model, tokens: totalTokens, inputTokens, outputTokens,
        messageCount: 1, startedAt: new Date().toISOString(),
      });
    }
  }

  await saveDay(day);

  // Write-through to SQLite usage_metrics
  void upsertUsageMetric(today, inputTokens, outputTokens, providerKind, costEstimateUsd);

  const settings = await loadAppSettings();
  const limitHit = settings.dailyTokenLimit > 0 && day.totalTokens >= settings.dailyTokenLimit;
  const warnHit  = settings.tokenWarningThreshold > 0 && day.totalTokens >= settings.tokenWarningThreshold;
  return res.json({
    success: true,
    inputTokens,
    outputTokens,
    totalTokens,
    todayTotal: day.totalTokens,
    limitHit,
    warnHit,
    remainingToday: Math.max(0, settings.dailyTokenLimit - day.totalTokens),
    providerKind,
    costEstimateUsd,
  });
});

router.get("/usage/today", async (_req, res) => {
  const settings = await loadAppSettings();
  const day      = await loadDay(todayKey());
  const topModels = Object.entries(day.byModel)
    .sort((a: any, b: any) => b[1].tokens - a[1].tokens)
    .slice(0, 5)
    .map(([name, stats]) => ({ name, ...(stats as any) }));
  return res.json({
    ...day,
    topModels,
    byProvider: day.byProvider ?? {
      local: { tokens: day.totalTokens ?? 0, requests: day.totalRequests ?? 0, costEstimateUsd: 0 },
      cloud: { tokens: 0, requests: 0, costEstimateUsd: 0 },
    },
    limitHit: settings.dailyTokenLimit > 0 && day.totalTokens >= settings.dailyTokenLimit,
    warnHit:  settings.tokenWarningThreshold > 0 && day.totalTokens >= settings.tokenWarningThreshold,
    dailyLimit:         settings.dailyTokenLimit,
    warningThreshold:   settings.tokenWarningThreshold,
    remaining:          Math.max(0, settings.dailyTokenLimit - day.totalTokens),
    utilizationPct:     settings.dailyTokenLimit > 0
      ? Math.min(100, Math.round((day.totalTokens / settings.dailyTokenLimit) * 100))
      : 0,
  });
});

router.get("/usage/history", async (req, res) => {
  const days    = Math.min(Number(req.query.days) || 7, 30);
  const history: any[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    history.push(await loadDay(d.toISOString().slice(0, 10)));
  }
  const totalTokens   = history.reduce((s, d) => s + d.totalTokens, 0);
  const totalRequests = history.reduce((s, d) => s + d.totalRequests, 0);
  const nonZero       = history.filter((d) => d.totalTokens > 0);
  const peakDay       = nonZero.length
    ? nonZero.reduce((a, b) => (a.totalTokens > b.totalTokens ? a : b))
    : null;
  const allModels: Record<string, number> = {};
  const byProvider = {
    local: { tokens: 0, requests: 0, costEstimateUsd: 0 },
    cloud: { tokens: 0, requests: 0, costEstimateUsd: 0 },
  };
  for (const day of history) {
    const providers = day.byProvider ?? {};
    for (const kind of ["local", "cloud"] as const) {
      byProvider[kind].tokens += providers[kind]?.tokens ?? 0;
      byProvider[kind].requests += providers[kind]?.requests ?? 0;
      byProvider[kind].costEstimateUsd += providers[kind]?.costEstimateUsd ?? 0;
    }
    for (const [name, stats] of Object.entries(day.byModel)) {
      allModels[name] = (allModels[name] || 0) + (stats as any).tokens;
    }
  }
  const topModel = Object.entries(allModels).sort((a, b) => b[1] - a[1])[0];
  return res.json({
    history,
    days,
    totalTokens,
    totalRequests,
    averageDailyTokens: days > 0 ? Math.round(totalTokens / days) : 0,
    peakDay: peakDay ? { date: peakDay.date, tokens: peakDay.totalTokens } : null,
    topModel: topModel ? { name: topModel[0], tokens: topModel[1] } : null,
    byProvider,
  });
});

router.get("/usage/estimate", async (req, res) => {
  const text = String(req.query.text || "");
  return res.json({ estimatedTokens: estimateTokens(text), chars: text.length });
});

// ── GET /usage/lifetime — lifetime cost-saved counter (Step 5.6) ──────────────

router.get("/usage/lifetime", async (_req, res) => {
  try {
    const { sqlite } = await import("../db/database.js");

    // Sum all rows from usage_metrics
    const row = sqlite.prepare(`
      SELECT
        SUM(tokens_in)         AS totalIn,
        SUM(tokens_out)        AS totalOut,
        SUM(cost_estimate_usd) AS totalCost,
        SUM(local_tokens)      AS localTokens,
        SUM(cloud_tokens)      AS cloudTokens,
        SUM(local_cost_usd)    AS localCost,
        SUM(cloud_cost_usd)    AS cloudCost,
        MIN(date)              AS firstDate
      FROM usage_metrics
    `).get() as {
      totalIn: number | null;
      totalOut: number | null;
      totalCost: number | null;
      localTokens: number | null;
      cloudTokens: number | null;
      localCost: number | null;
      cloudCost: number | null;
      firstDate: string | null;
    } | undefined;

    const totalIn   = row?.totalIn   ?? 0;
    const totalOut  = row?.totalOut  ?? 0;
    const totalCost = row?.totalCost ?? 0;
    const firstDate = row?.firstDate ?? null;

    // Fall back to scanning JSON usage files if DB has no rows yet
    let fallbackIn = 0, fallbackOut = 0;
    if (totalIn === 0 && existsSync(USAGE_DIR)) {
      try {
        const files = await readdir(USAGE_DIR);
        for (const f of files) {
          if (!f.endsWith(".json")) continue;
          try {
            const day = JSON.parse(await readFile(path.join(USAGE_DIR, f), "utf-8")) as any;
            for (const stats of Object.values(day.byModel ?? {})) {
              fallbackIn  += (stats as any).inputTokens  ?? 0;
              fallbackOut += (stats as any).outputTokens ?? 0;
            }
          } catch {}
        }
      } catch {}
    }

    const effectiveIn   = totalIn   || fallbackIn;
    const effectiveOut  = totalOut  || fallbackOut;
    const effectiveCost = totalCost || (
      effectiveIn  * CLAUDE_COST_PER_INPUT_TOKEN +
      effectiveOut * CLAUDE_COST_PER_OUTPUT_TOKEN
    );

    return res.json({
      success:            true,
      totalTokensIn:      effectiveIn,
      totalTokensOut:     effectiveOut,
      totalTokens:        effectiveIn + effectiveOut,
      costEstimateUsd:    parseFloat(effectiveCost.toFixed(4)),
      byProvider: {
        local: {
          tokens: row?.localTokens ?? effectiveIn + effectiveOut,
          costEstimateUsd: row?.localCost ?? 0,
        },
        cloud: {
          tokens: row?.cloudTokens ?? 0,
          costEstimateUsd: row?.cloudCost ?? 0,
        },
      },
      firstDate,
      pricing: {
        inputPer1M:  3,
        outputPer1M: 15,
        model:       "Claude Sonnet 4",
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: String(err) });
  }
});

router.delete("/usage/purge", async (req, res) => {
  const settings      = await loadAppSettings();
  const olderThanDays = Number(req.query.olderThanDays) || settings.chatHistoryDays || 30;
  const cutoff        = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  if (!existsSync(USAGE_DIR)) return res.json({ success: true, removed: 0 });
  const files = await readdir(USAGE_DIR);
  let removed = 0;
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const date = file.replace(".json", "");
    if (new Date(date) < cutoff) {
      const { unlink } = await import("fs/promises");
      await unlink(path.join(USAGE_DIR, file)).catch(() => {});
      removed++;
    }
  }
  return res.json({ success: true, removed, cutoffDate: cutoff.toISOString().slice(0, 10) });
});

router.get("/settings", async (_req, res) => {
  return res.json({ settings: await loadAppSettings() });
});

router.put("/settings", async (req, res) => {
  const current = await loadAppSettings();
  const updated = { ...current, ...req.body };
  const saved   = await saveSettings(updated);
  return res.json({ success: true, settings: saved });
});

export default router;
