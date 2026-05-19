/**
 * LOCAL BUILDER ROUTES
 * ====================
 * Phase 22 + Phase 24. These routes expose the local-builder lib + the new
 * patch executor to the frontend Workspace page.
 *
 * GET  /local-builder/status              — profiles, context packs, eval history
 * GET  /local-builder/profiles            — all model role profiles
 * POST /local-builder/profiles            — update a role profile
 * GET  /local-builder/context-packs       — list context packs
 * GET  /local-builder/evals               — eval history
 * POST /local-builder/evals/:evalName     — run an eval
 * POST /local-builder/proposals           — create a build proposal
 * GET  /local-builder/proposals           — list proposals
 * POST /local-builder/proposals/:id/dry-run  — run patch dry-run via executor
 * POST /local-builder/proposals/:id/execute  — apply patch via executor
 */

import { Router } from "express";
import { createHash } from "crypto";
import {
  getLocalBuilderStatus,
  getLocalBuilderProfiles,
  saveLocalBuilderProfile,
  getContextPacks,
  getEvalHistory,
  runLocalBuilderEval,
  proposeBuildTask,
  type LocalBuilderModelRole,
  type LocalBuilderEvalName,
} from "../lib/local-builder.js";
import { ensureLocalBuilderPatchExecutorRegistered, LOCAL_BUILDER_PATCH_KIND } from "../lib/local-builder-patch-executor.js";
import { executeApproved } from "../lib/approved-executor.js";
import { createApprovalRequest, approveRequest } from "../lib/approval-queue.js";
import { sqlite } from "../db/database.js";

const router = Router();
ensureLocalBuilderPatchExecutorRegistered();

function bad(message: string) {
  return { success: false, message };
}

// ─── Status ────────────────────────────────────────────────────────────────

router.get("/local-builder/status", (_req, res) => {
  return res.json({ success: true, status: getLocalBuilderStatus() });
});

// ─── Profiles ──────────────────────────────────────────────────────────────

router.get("/local-builder/profiles", (_req, res) => {
  return res.json({ success: true, profiles: getLocalBuilderProfiles() });
});

router.post("/local-builder/profiles", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const role = body["role"] as LocalBuilderModelRole;
  const modelName = typeof body["modelName"] === "string" ? body["modelName"] : null;
  const status = (body["status"] as "not_configured" | "configured" | "unavailable") ?? "configured";

  const validRoles: LocalBuilderModelRole[] = ["fast_code", "deep_code", "reviewer", "rag_embedding"];
  if (!validRoles.includes(role)) return res.status(400).json(bad(`role must be one of: ${validRoles.join(", ")}`));

  saveLocalBuilderProfile(role, { modelName, status });
  return res.json({ success: true, profiles: getLocalBuilderProfiles() });
});

// ─── Context packs ─────────────────────────────────────────────────────────

router.get("/local-builder/context-packs", async (_req, res) => {
  const packs = await getContextPacks();
  return res.json({ success: true, packs });
});

// ─── Evals ─────────────────────────────────────────────────────────────────

router.get("/local-builder/evals", (_req, res) => {
  return res.json({ success: true, history: getEvalHistory() });
});

router.post("/local-builder/evals/:evalName", async (req, res) => {
  const evalName = req.params["evalName"] as LocalBuilderEvalName;
  const validEvals: LocalBuilderEvalName[] = ["repo_summary", "safe_patch_plan"];
  if (!validEvals.includes(evalName)) {
    return res.status(400).json(bad(`evalName must be one of: ${validEvals.join(", ")}`));
  }
  try {
    const result = await runLocalBuilderEval(evalName);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json(bad((err as Error).message));
  }
});

// ─── Proposals ─────────────────────────────────────────────────────────────

router.get("/local-builder/proposals", (_req, res) => {
  // Proposals are stored as approval_requests with type="local_builder_build_task"
  try {
    const rows = sqlite.prepare(
      `SELECT id, type, title, summary, status, requested_at, payload_hash
       FROM approval_requests
       WHERE type = 'local_builder_build_task'
       ORDER BY requested_at DESC LIMIT 50`
    ).all() as Array<Record<string, unknown>>;
    const proposals = rows.map(r => ({
      id: r["id"],
      status: r["status"],
      phaseId: "", // stored in payload — would need JSON parse for full data
      taskSummary: r["title"],
      proposedAt: r["requested_at"],
      approvalStatus: r["status"],
    }));
    return res.json({ success: true, proposals });
  } catch {
    return res.json({ success: true, proposals: [] });
  }
});

router.post("/local-builder/proposals", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const phaseId = typeof body["phaseId"] === "string" ? body["phaseId"] : "";
  const taskSummary = typeof body["taskSummary"] === "string" ? body["taskSummary"] : "";
  const contextPacks = Array.isArray(body["contextPacks"]) ? body["contextPacks"] as string[] : [];
  const targetFiles = Array.isArray(body["targetFiles"]) ? body["targetFiles"] as string[] : [];

  if (!phaseId) return res.status(400).json(bad("phaseId required"));
  if (!taskSummary) return res.status(400).json(bad("taskSummary required"));

  try {
    const result = await proposeBuildTask({ phaseId, taskSummary, contextPacks, targetFiles });
    return res.json({ ...(result as Record<string, unknown>), success: true });
  } catch (err) {
    return res.status(500).json(bad((err as Error).message));
  }
});

// ─── Patch executor: dry-run ────────────────────────────────────────────────

router.post("/local-builder/proposals/:id/dry-run", async (req, res) => {
  const proposalId = req.params["id"]!;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const unifiedDiff = typeof body["unifiedDiff"] === "string" ? body["unifiedDiff"] : "";
  const workspacePath = typeof body["workspacePath"] === "string" ? body["workspacePath"] : "";
  const targetFiles = Array.isArray(body["targetFiles"]) ? body["targetFiles"] as string[] : [];

  if (!unifiedDiff) return res.status(400).json(bad("unifiedDiff required"));
  if (!workspacePath) return res.status(400).json(bad("workspacePath required"));

  const diffHash = createHash("sha256").update(unifiedDiff).digest("hex");
  const payload = { proposalId, workspacePath, unifiedDiff, diffHash, targetFiles };

  // Auto-create and auto-approve a dry-run approval (no real write)
  const approval = createApprovalRequest({
    type: LOCAL_BUILDER_PATCH_KIND,
    title: `Dry-run patch for proposal ${proposalId}`,
    summary: "Dry-run only — no files will be modified",
    riskTier: "tier2_safe_local_execute",
    requestedAction: `local_builder.patch.dry_run.${proposalId}`,
    payload,
  });
  approveRequest(approval.id, "Auto-approved: dry-run only");

  const result = await executeApproved({
    executorKind: LOCAL_BUILDER_PATCH_KIND,
    approvalId: approval.id,
    requestedAction: `Dry-run patch for proposal ${proposalId}`,
    mode: "dry_run",
    payload,
    skipRuntimeModeCheck: true,
  });

  return res.json(result);
});

// ─── Patch executor: execute ────────────────────────────────────────────────

router.post("/local-builder/proposals/:id/execute", async (req, res) => {
  const proposalId = req.params["id"]!;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const approvalId = typeof body["approvalId"] === "string" ? body["approvalId"] : "";
  const unifiedDiff = typeof body["unifiedDiff"] === "string" ? body["unifiedDiff"] : "";
  const workspacePath = typeof body["workspacePath"] === "string" ? body["workspacePath"] : "";
  const targetFiles = Array.isArray(body["targetFiles"]) ? body["targetFiles"] as string[] : [];

  if (!approvalId) return res.status(400).json(bad("approvalId required for execute"));
  if (!unifiedDiff) return res.status(400).json(bad("unifiedDiff required"));
  if (!workspacePath) return res.status(400).json(bad("workspacePath required"));

  const diffHash = createHash("sha256").update(unifiedDiff).digest("hex");
  const payload = { proposalId, workspacePath, unifiedDiff, diffHash, targetFiles };

  const result = await executeApproved({
    executorKind: LOCAL_BUILDER_PATCH_KIND,
    approvalId,
    requestedAction: `Apply patch for proposal ${proposalId}`,
    mode: "execute",
    payload,
  });

  return res.json(result);
});

export default router;
