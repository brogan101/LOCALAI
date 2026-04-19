import { Router } from "express";
import { fetchJson } from "../lib/runtime.js";
import { getOllamaUrl } from "../lib/ollama-url.js";
import { DEFAULT_FALLBACK_MODEL } from "../config/models.config.js";

const router = Router();

async function getDb() {
  const { sqlite } = await import("../db/database.js");
  return sqlite;
}

router.get("/token-budget/:sessionId", async (req, res) => {
  try {
    const db  = await getDb();
    const row = db.prepare(
      "SELECT * FROM session_token_budgets WHERE session_id = ?",
    ).get(req.params["sessionId"]!) as { session_id: string; budget_tokens: number; used_tokens: number; updated_at: string } | undefined;
    if (!row) return res.json({ success: true, budget: null });
    return res.json({
      success: true,
      budget: {
        sessionId:    row.session_id,
        budgetTokens: row.budget_tokens,
        usedTokens:   row.used_tokens,
        updatedAt:    row.updated_at,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.put("/token-budget/:sessionId", async (req, res) => {
  const body         = (req.body as Record<string, unknown>) ?? {};
  const budgetTokens = typeof body["budgetTokens"] === "number" ? Math.max(1000, Math.floor(body["budgetTokens"])) : 0;
  const usedTokens   = typeof body["usedTokens"]   === "number" ? Math.floor(body["usedTokens"])   : 0;
  if (!budgetTokens) return res.status(400).json({ success: false, message: "budgetTokens required" });
  try {
    const db  = await getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO session_token_budgets (session_id, budget_tokens, used_tokens, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET budget_tokens=excluded.budget_tokens, used_tokens=excluded.used_tokens, updated_at=excluded.updated_at
    `).run(req.params["sessionId"]!, budgetTokens, usedTokens, now);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.delete("/token-budget/:sessionId", async (req, res) => {
  try {
    const db = await getDb();
    db.prepare("DELETE FROM session_token_budgets WHERE session_id = ?").run(req.params["sessionId"]!);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// POST /token-budget/:sessionId/summarize
// Summarizes the older portion of messages and returns a compact preamble.
router.post("/token-budget/:sessionId/summarize", async (req, res) => {
  const body     = (req.body as Record<string, unknown>) ?? {};
  const messages = Array.isArray(body["messages"]) ? (body["messages"] as Array<{ role: string; content: string }>) : [];
  const model    = typeof body["model"] === "string" ? body["model"] : DEFAULT_FALLBACK_MODEL;
  if (messages.length < 4) {
    return res.json({ success: true, preamble: "", trimmedCount: 0 });
  }

  const keepLast    = Math.ceil(messages.length * 0.3);
  const toSummarize = messages.slice(0, messages.length - keepLast);

  const summaryPrompt = [
    "Summarize the following conversation history into a compact preamble.",
    "Preserve all key facts, decisions, and context. Maximum 300 words.",
    "Output only the summary, no headers.",
    "",
    ...toSummarize.map(m => `${m.role.toUpperCase()}: ${m.content}`),
  ].join("\n");

  try {
    const base = await getOllamaUrl();
    const resp = await fetchJson<{ message?: { content?: string } }>(
      `${base}/api/chat`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          model,
          stream:   false,
          messages: [{ role: "user", content: summaryPrompt }],
        }),
      },
      60_000,
    );
    const preamble = resp.message?.content ?? "";
    return res.json({ success: true, preamble, trimmedCount: toSummarize.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
