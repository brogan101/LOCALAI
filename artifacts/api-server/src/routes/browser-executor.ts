/**
 * BROWSER EXECUTOR ROUTES
 * + OpenAI-compat registration fix
 * =================================
 *
 * This file contains:
 *   A) Browser executor routes (new Stage 4)
 *   B) Instructions to register openai.ts which was missing from index.ts
 */

// ─────────────────────────────────────────────────────────────────────────────
// A) Browser executor routes
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import {
  executeApproved,
} from "../lib/approved-executor.js";
import {
  ensureBrowserExecutorRegistered,
  BROWSER_EXECUTOR_KIND,
  type BrowserExecutorPayload,
} from "../lib/browser-playwright-executor.js";
import { createApprovalRequest, approveRequest } from "../lib/approval-queue.js";
import { classifyBrowserAction } from "../lib/playwright-browser.js";

const router = Router();
ensureBrowserExecutorRegistered();

function bad(msg: string) { return { success: false, message: msg }; }

function buildPayload(body: Record<string, unknown>): BrowserExecutorPayload {
  return {
    action: typeof body["action"] === "string" ? body["action"] : "",
    url: typeof body["url"] === "string" ? body["url"] : "",
    selector: typeof body["selector"] === "string" ? body["selector"] : undefined,
    fields: typeof body["fields"] === "object" ? body["fields"] as Record<string, string> : undefined,
    timeoutMs: typeof body["timeoutMs"] === "number" ? body["timeoutMs"] : undefined,
  };
}

// POST /browser/validate
router.post("/browser/validate", async (req, res) => {
  const payload = buildPayload(req.body ?? {});
  if (!payload.action || !payload.url) return res.status(400).json(bad("action and url required"));

  const result = await executeApproved({
    executorKind: BROWSER_EXECUTOR_KIND,
    approvalId: "",
    requestedAction: `Validate browser action: ${payload.action}`,
    mode: "validate",
    payload: payload as Record<string, unknown>,
    skipRuntimeModeCheck: true,
  });
  return res.json(result);
});

// POST /browser/dry-run
router.post("/browser/dry-run", async (req, res) => {
  const payload = buildPayload(req.body ?? {});
  if (!payload.action || !payload.url) return res.status(400).json(bad("action and url required"));

  const tier = classifyBrowserAction(payload.action);
  const approval = createApprovalRequest({
    type: BROWSER_EXECUTOR_KIND,
    title: `Browser dry-run: ${payload.action}`,
    summary: `Dry-run only — no real browser action. Tier: ${tier}`,
    riskTier: "tier2_safe_local_execute",
    requestedAction: `browser.dry_run.${payload.action}`,
    payload: payload as Record<string, unknown>,
  });
  approveRequest(approval.id, "Auto-approved: dry-run only");

  const result = await executeApproved({
    executorKind: BROWSER_EXECUTOR_KIND,
    approvalId: approval.id,
    requestedAction: `Browser dry-run: ${payload.action}`,
    mode: "dry_run",
    payload: payload as Record<string, unknown>,
    skipRuntimeModeCheck: true,
  });
  return res.json(result);
});

// POST /browser/execute
router.post("/browser/execute", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const payload = buildPayload(body);
  const approvalId = typeof body["approvalId"] === "string" ? body["approvalId"] : "";

  if (!payload.action || !payload.url) return res.status(400).json(bad("action and url required"));
  if (!approvalId) return res.status(400).json(bad("approvalId required for execute"));

  const result = await executeApproved({
    executorKind: BROWSER_EXECUTOR_KIND,
    approvalId,
    requestedAction: `Browser execute: ${payload.action}`,
    mode: "execute",
    payload: payload as Record<string, unknown>,
  });
  return res.json(result);
});

export default router;

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * B) PATCH: Register openai.ts in routes/index.ts (it was missing)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The OpenAI-compat route (openai.ts) provides:
 *   GET  /v1/models            — list models (OpenAI format)
 *   POST /v1/chat/completions  — chat with streaming (OpenAI format)
 *   POST /v1/embeddings        — embeddings (OpenAI format)
 *
 * This is what tools like Continue.dev, Open WebUI direct-API mode,
 * and any OpenAI SDK-based client use to connect to your local stack.
 *
 * ADD to routes/index.ts imports:
 *
 *   import openai from "./openai.js";
 *
 * ADD to the router.use() section:
 *
 *   router.use(openai);
 *
 * VERIFY it works:
 *
 *   curl http://127.0.0.1:3001/v1/models
 *   # Should return a JSON list of your installed Ollama models
 *
 * Stage 4 new route imports summary (add all of these):
 *
 *   import openai        from "./openai.js";           // was missing
 *   import browserRoute  from "./browser-executor.js"; // NEW Stage 4
 *
 *   router.use(openai);
 *   router.use(browserRoute);
 */
