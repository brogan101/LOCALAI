/**
 * BUSINESS DRAFT EXECUTOR ROUTES
 * POST /business/executor/validate   { draftId }
 * POST /business/executor/dry-run    { draftId }
 * POST /business/executor/send       { draftId, approvalId }
 */
import { Router } from "express";
import { executeApproved } from "../lib/approved-executor.js";
import { ensureBusinessDraftExecutorRegistered, BUSINESS_DRAFT_EXECUTOR_KIND } from "../lib/business-draft-executor.js";
import { createApprovalRequest, approveRequest } from "../lib/approval-queue.js";

const router = Router();
ensureBusinessDraftExecutorRegistered();

function bad(msg: string) { return { success: false, message: msg }; }

router.post("/business/executor/validate", async (req, res) => {
  const draftId = typeof req.body?.draftId === "string" ? req.body.draftId : "";
  if (!draftId) return res.status(400).json(bad("draftId required"));
  const result = await executeApproved({
    executorKind: BUSINESS_DRAFT_EXECUTOR_KIND,
    approvalId: "",
    requestedAction: `Validate business draft ${draftId}`,
    mode: "validate",
    payload: { draftId },
    skipRuntimeModeCheck: true,
  });
  return res.json(result);
});

router.post("/business/executor/dry-run", async (req, res) => {
  const draftId = typeof req.body?.draftId === "string" ? req.body.draftId : "";
  if (!draftId) return res.status(400).json(bad("draftId required"));
  const a = createApprovalRequest({ type: BUSINESS_DRAFT_EXECUTOR_KIND, title: `Dry-run draft ${draftId}`, summary: "No send", riskTier: "tier2_safe_local_execute", requestedAction: `business.dry_run.${draftId}`, payload: { draftId } });
  approveRequest(a.id, "Auto-approved: dry-run");
  const result = await executeApproved({
    executorKind: BUSINESS_DRAFT_EXECUTOR_KIND,
    approvalId: a.id,
    requestedAction: `Dry-run business draft ${draftId}`,
    mode: "dry_run",
    payload: { draftId },
    skipRuntimeModeCheck: true,
  });
  return res.json(result);
});

router.post("/business/executor/send", async (req, res) => {
  const draftId = typeof req.body?.draftId === "string" ? req.body.draftId : "";
  const approvalId = typeof req.body?.approvalId === "string" ? req.body.approvalId : "";
  if (!draftId) return res.status(400).json(bad("draftId required"));
  if (!approvalId) return res.status(400).json(bad("approvalId required for send"));
  const result = await executeApproved({
    executorKind: BUSINESS_DRAFT_EXECUTOR_KIND,
    approvalId,
    requestedAction: `Send business draft ${draftId}`,
    mode: "execute",
    payload: { draftId },
  });
  return res.json(result);
});

export default router;
