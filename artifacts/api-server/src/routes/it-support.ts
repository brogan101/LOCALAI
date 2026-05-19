import { Router } from "express";
import { createHash } from "crypto";
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
import { executeApproved } from "../lib/approved-executor.js";
import { ensureItExecutorRegistered, IT_EXECUTOR_KIND } from "../lib/it-support-executor.js";
import { createApprovalRequest, approveRequest } from "../lib/approval-queue.js";

const router = Router();
ensureItExecutorRegistered();

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

router.post("/it-support/scripts/:id/execute", async (req, res) => {
  try {
    const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
    const mode = (typeof body["mode"] === "string" ? body["mode"] : "dry_run") as "validate" | "dry_run" | "execute" | "verify";
    const approvalId = typeof body["approvalId"] === "string" ? body["approvalId"] : "";

    const artifact = getItSupportArtifact(req.params["id"]!);
    if (!artifact) return res.status(404).json({ success: false, message: "Artifact not found" });

    const payload = {
      artifactId: artifact.id,
      scriptBodyHash: createHash("sha256").update(artifact.scriptBody ?? "").digest("hex"),
    };

    // For non-execute modes: auto-create and auto-approve
    let useApprovalId = approvalId;
    if (!useApprovalId && mode !== "execute") {
      const approval = createApprovalRequest({
        type: IT_EXECUTOR_KIND,
        title: `${mode}: ${artifact.title}`,
        summary: `Auto-approved ${mode} for IT support artifact`,
        riskTier: "tier2_safe_local_execute",
        requestedAction: `it_support.${mode}.${artifact.id}`,
        payload,
      });
      approveRequest(approval.id, `Auto-approved: ${mode} only`);
      useApprovalId = approval.id;
    }

    const result = await executeApproved({
      executorKind: IT_EXECUTOR_KIND,
      approvalId: useApprovalId,
      requestedAction: `${mode} IT support script: ${artifact.title}`,
      mode,
      payload,
      skipRuntimeModeCheck: mode !== "execute",
    });

    const httpStatus = result.blocked ? 403 : result.success ? 200 : 400;
    return res.status(httpStatus).json(result);
  } catch (err) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }
});

export default router;
