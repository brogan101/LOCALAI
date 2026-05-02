import { Router } from "express";
import {
  createItSupportArtifact,
  getItSupportArtifact,
  getItSupportStatus,
  listItSupportArtifacts,
  listItSupportIntegrations,
  listItSupportWorkflows,
  proposeItSupportScriptExecution,
  validateScriptSafety,
  type ItSupportExecutionMode,
  type ItSupportWorkflowType,
} from "../lib/it-support.js";

const router = Router();

router.get("/it-support/status", (_req, res) => {
  try {
    return res.json({ success: true, status: getItSupportStatus() });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.get("/it-support/workflows", (_req, res) => {
  return res.json({ success: true, workflows: listItSupportWorkflows() });
});

router.get("/it-support/integrations", (_req, res) => {
  return res.json({ success: true, integrations: listItSupportIntegrations() });
});

router.get("/it-support/artifacts", (req, res) => {
  const limit = Number.parseInt(String(req.query["limit"] ?? "50"), 10);
  return res.json({ success: true, artifacts: listItSupportArtifacts(Number.isFinite(limit) ? limit : 50) });
});

router.get("/it-support/artifacts/:id", (req, res) => {
  const artifact = getItSupportArtifact(req.params["id"]!);
  if (!artifact) return res.status(404).json({ success: false, message: "IT support artifact not found" });
  return res.json({ success: true, artifact });
});

router.post("/it-support/artifacts", (req, res) => {
  try {
    const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
    const workflowType = typeof body["workflowType"] === "string" ? body["workflowType"] as ItSupportWorkflowType : undefined;
    const request = typeof body["request"] === "string" ? body["request"] : "";
    const title = typeof body["title"] === "string" ? body["title"] : undefined;
    if (!workflowType) return res.status(400).json({ success: false, message: "workflowType is required" });
    const result = createItSupportArtifact({ workflowType, request, title });
    return res.status(result.success ? 200 : 422).json(result);
  } catch (err) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }
});

router.post("/it-support/scripts/:id/validate", (req, res) => {
  const artifact = getItSupportArtifact(req.params["id"]!);
  if (!artifact) return res.status(404).json({ success: false, message: "IT support artifact not found" });
  const validation = validateScriptSafety(artifact.scriptBody, artifact.safetyContract);
  return res.status(validation.valid ? 200 : 422).json({ success: validation.valid, validation, artifact });
});

router.post("/it-support/scripts/:id/execute", (req, res) => {
  try {
    const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
    const mode = typeof body["mode"] === "string" ? body["mode"] as ItSupportExecutionMode : "dry_run";
    const approvalId = typeof body["approvalId"] === "string" ? body["approvalId"] : undefined;
    const result = proposeItSupportScriptExecution(req.params["id"]!, { mode, approvalId });
    const status =
      result.status === "approval_required" ? 202 :
      result.status === "blocked" ? 403 :
      result.status === "not_configured" ? 409 :
      200;
    return res.status(status).json(result);
  } catch (err) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }
});

export default router;
