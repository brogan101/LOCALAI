import { Router } from "express";
import {
  approveRequest,
  cancelRequest,
  createApprovalRequest,
  denyRequest,
  getApprovalRequest,
  listApprovalRequests,
  type PermissionTier,
  type PhysicalTier,
} from "../lib/approval-queue.js";

const router = Router();

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
}

function parseRiskTier(value: unknown): PermissionTier | null {
  const allowed: PermissionTier[] = [
    "tier0_read_only",
    "tier1_draft_only",
    "tier2_safe_local_execute",
    "tier3_file_modification",
    "tier4_external_communication",
    "tier5_manual_only_prohibited",
  ];
  return typeof value === "string" && allowed.includes(value as PermissionTier) ? value as PermissionTier : null;
}

function parsePhysicalTier(value: unknown): PhysicalTier | undefined {
  const allowed: PhysicalTier[] = [
    "p0_sensor_read",
    "p1_suggest",
    "p2_prepare_queue",
    "p3_low_risk_automation",
    "p4_approval_required",
    "p5_manual_only_at_machine",
  ];
  return typeof value === "string" && allowed.includes(value as PhysicalTier) ? value as PhysicalTier : undefined;
}

router.get("/approvals", (req, res) => {
  const limit = Number(req.query["limit"]) || 100;
  return res.json({ success: true, approvals: listApprovalRequests(limit) });
});

router.get("/approvals/:approvalId", (req, res) => {
  const approval = getApprovalRequest(req.params["approvalId"]!);
  if (!approval) return res.status(404).json({ success: false, message: "Approval request not found" });
  return res.json({ success: true, approval });
});

router.post("/approvals", (req, res) => {
  const body = bodyRecord(req.body);
  const riskTier = parseRiskTier(body["riskTier"]);
  if (!riskTier) return res.status(400).json({ success: false, message: "valid riskTier is required" });
  const payload = typeof body["payload"] === "object" && body["payload"] !== null ? body["payload"] as Record<string, unknown> : {};
  try {
    const approval = createApprovalRequest({
      type: typeof body["type"] === "string" ? body["type"] : "",
      title: typeof body["title"] === "string" ? body["title"] : "",
      summary: typeof body["summary"] === "string" ? body["summary"] : "",
      riskTier,
      physicalTier: parsePhysicalTier(body["physicalTier"]),
      requestedAction: typeof body["requestedAction"] === "string" ? body["requestedAction"] : "",
      payload,
      expiresAt: typeof body["expiresAt"] === "string" ? body["expiresAt"] : undefined,
    });
    return res.status(approval.status === "denied" ? 403 : 202).json({ success: approval.status !== "denied", approvalRequired: true, approval });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/approvals/:approvalId/approve", (req, res) => {
  const body = bodyRecord(req.body);
  const approval = approveRequest(req.params["approvalId"]!, typeof body["note"] === "string" ? body["note"] : undefined);
  if (!approval) return res.status(404).json({ success: false, message: "Approval request not found" });
  return res.json({ success: true, approval });
});

router.post("/approvals/:approvalId/deny", (req, res) => {
  const body = bodyRecord(req.body);
  const approval = denyRequest(req.params["approvalId"]!, typeof body["reason"] === "string" ? body["reason"] : undefined);
  if (!approval) return res.status(404).json({ success: false, message: "Approval request not found" });
  return res.json({ success: true, approval });
});

router.post("/approvals/:approvalId/cancel", (req, res) => {
  const body = bodyRecord(req.body);
  const approval = cancelRequest(req.params["approvalId"]!, typeof body["reason"] === "string" ? body["reason"] : undefined);
  if (!approval) return res.status(404).json({ success: false, message: "Approval request not found" });
  return res.json({ success: true, approval });
});

export default router;
