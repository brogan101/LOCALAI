import { Router } from "express";
import {
  createBusinessDraft,
  getBusinessStatus,
  listBusinessAdapters,
  listBusinessDrafts,
  listBusinessModules,
  proposeBusinessDraftSend,
  saveBusinessAdapterProfile,
  syncBusinessAdapter,
  type BusinessAdapterId,
} from "../lib/business-modules.js";

const router = Router();

function statusFor(result: { status?: string; success?: boolean }): number {
  if (result.success) return 200;
  if (result.status === "approval_required") return 202;
  if (result.status === "disabled" || result.status === "not_configured") return 409;
  return 403;
}

router.get("/business/status", (_req, res) => {
  res.json(getBusinessStatus());
});

router.get("/business/modules", (_req, res) => {
  res.json({ success: true, modules: listBusinessModules() });
});

router.get("/business/adapters", (_req, res) => {
  res.json({ success: true, adapters: listBusinessAdapters() });
});

router.put("/business/adapters/:id/profile", (req, res) => {
  try {
    const adapter = saveBusinessAdapterProfile(req.params.id as BusinessAdapterId, req.body ?? {});
    res.json({ success: true, adapter, executed: false });
  } catch (error) {
    res.status(400).json({
      success: false,
      executed: false,
      status: "blocked",
      message: error instanceof Error ? error.message : "Could not update adapter profile.",
    });
  }
});

router.post("/business/adapters/:id/sync", (req, res) => {
  const approvalId = typeof req.body?.approvalId === "string" ? req.body.approvalId : undefined;
  const result = syncBusinessAdapter(req.params.id as BusinessAdapterId, approvalId);
  res.status(statusFor(result)).json(result);
});

router.get("/business/drafts", (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  res.json({ success: true, drafts: listBusinessDrafts(Number.isFinite(limit) ? limit : 100) });
});

router.post("/business/drafts", (req, res) => {
  try {
    const result = createBusinessDraft(req.body ?? {});
    res.status(statusFor(result)).json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      executed: false,
      status: "blocked",
      message: error instanceof Error ? error.message : "Could not create business draft.",
    });
  }
});

router.post("/business/drafts/:id/propose-send", (req, res) => {
  const approvalId = typeof req.body?.approvalId === "string" ? req.body.approvalId : undefined;
  const result = proposeBusinessDraftSend(req.params.id, approvalId);
  res.status(statusFor(result)).json(result);
});

export default router;
