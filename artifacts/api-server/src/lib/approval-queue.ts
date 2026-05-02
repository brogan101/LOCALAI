import { createHash, randomUUID } from "crypto";
import { sqlite } from "../db/database.js";
import {
  appendJobEvent,
  createDurableJob,
  recordAuditEvent,
  updateDurableJobState,
  type DurableJob,
} from "./platform-foundation.js";
import { thoughtLog } from "./thought-log.js";

export type PermissionTier =
  | "tier0_read_only"
  | "tier1_draft_only"
  | "tier2_safe_local_execute"
  | "tier3_file_modification"
  | "tier4_external_communication"
  | "tier5_manual_only_prohibited";

export type PhysicalTier =
  | "p0_sensor_read"
  | "p1_suggest"
  | "p2_prepare_queue"
  | "p3_low_risk_automation"
  | "p4_approval_required"
  | "p5_manual_only_at_machine";

export type ApprovalStatus =
  | "waiting_for_approval"
  | "approved"
  | "denied"
  | "cancelled"
  | "expired"
  | "completed"
  | "failed";

export interface ApprovalRequestInput {
  type: string;
  title: string;
  summary: string;
  riskTier: PermissionTier;
  requestedAction: string;
  payload: Record<string, unknown>;
  physicalTier?: PhysicalTier;
  expiresAt?: string;
}

export interface ApprovalRequest {
  id: string;
  type: string;
  title: string;
  summary: string;
  riskTier: PermissionTier;
  physicalTier?: PhysicalTier;
  requestedAction: string;
  payloadHash: string;
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  jobId?: string;
  auditId?: string;
  requestedAt: string;
  approvedAt?: string;
  deniedAt?: string;
  cancelledAt?: string;
  expiresAt?: string;
  result?: Record<string, unknown>;
}

export interface ApprovalVerification {
  allowed: boolean;
  approval?: ApprovalRequest;
  message: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function stablePayloadHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function rowToApproval(row: Record<string, unknown>): ApprovalRequest {
  return {
    id: row["id"] as string,
    type: row["type"] as string,
    title: row["title"] as string,
    summary: row["summary"] as string,
    riskTier: row["risk_tier"] as PermissionTier,
    physicalTier: (row["physical_tier"] as PhysicalTier | null) ?? undefined,
    requestedAction: row["requested_action"] as string,
    payloadHash: row["payload_hash"] as string,
    payload: parseJson(row["payload_json"]),
    status: row["status"] as ApprovalStatus,
    jobId: (row["job_id"] as string | null) ?? undefined,
    auditId: (row["audit_id"] as string | null) ?? undefined,
    requestedAt: row["requested_at"] as string,
    approvedAt: (row["approved_at"] as string | null) ?? undefined,
    deniedAt: (row["denied_at"] as string | null) ?? undefined,
    cancelledAt: (row["cancelled_at"] as string | null) ?? undefined,
    expiresAt: (row["expires_at"] as string | null) ?? undefined,
    result: row["result_json"] ? parseJson(row["result_json"]) : undefined,
  };
}

function validateApproval(input: ApprovalRequestInput): string | null {
  if (!input.type.trim()) return "type is required";
  if (!input.title.trim()) return "title is required";
  if (!input.requestedAction.trim()) return "requestedAction is required";
  if (input.riskTier === "tier3_file_modification") {
    if (typeof input.payload["diff"] !== "string" || !input.payload["diff"]) {
      return "Tier 3 file modification approvals require diff metadata";
    }
    if (typeof input.payload["rollback"] !== "object" || input.payload["rollback"] === null) {
      return "Tier 3 file modification approvals require rollback metadata";
    }
  }
  return null;
}

export function createApprovalRequest(input: ApprovalRequestInput): ApprovalRequest {
  const validation = validateApproval(input);
  if (validation) throw new Error(validation);

  const id = randomUUID();
  const requestedAt = nowIso();
  const payloadHash = stablePayloadHash(input.payload);
  const prohibited =
    input.riskTier === "tier5_manual_only_prohibited" ||
    input.physicalTier === "p5_manual_only_at_machine";
  const status: ApprovalStatus = prohibited ? "denied" : "waiting_for_approval";
  const deniedAt = prohibited ? requestedAt : null;
  const result = prohibited
    ? { reason: "Manual-only/prohibited action cannot execute through software" }
    : undefined;

  const job = createDurableJob({
    kind: `approval.${input.type}`,
    state: prohibited ? "cancelled" : "waiting_for_approval",
    payload: {
      approvalId: id,
      type: input.type,
      requestedAction: input.requestedAction,
      payloadHash,
      riskTier: input.riskTier,
      physicalTier: input.physicalTier,
      expiresAt: input.expiresAt,
    },
    checkpoint: { approvalStatus: status },
  });

  const auditId = recordAuditEvent({
    eventType: "approval",
    action: status === "denied" ? "auto-deny-prohibited" : "request",
    target: id,
    result: status === "denied" ? "blocked" : "success",
    metadata: {
      type: input.type,
      riskTier: input.riskTier,
      physicalTier: input.physicalTier,
      jobId: job.id,
      payloadHash,
      reason: result?.reason,
    },
  });

  sqlite.prepare(`
    INSERT INTO approval_requests
      (id, type, title, summary, risk_tier, physical_tier, requested_action,
       payload_hash, payload_json, status, job_id, audit_id, requested_at,
       approved_at, denied_at, cancelled_at, expires_at, result_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)
  `).run(
    id,
    input.type,
    input.title,
    input.summary,
    input.riskTier,
    input.physicalTier ?? null,
    input.requestedAction,
    payloadHash,
    JSON.stringify(input.payload),
    status,
    job.id,
    auditId,
    requestedAt,
    deniedAt,
    input.expiresAt ?? null,
    result ? JSON.stringify(result) : null,
  );

  appendJobEvent(job.id, "approval.requested", status === "denied" ? "Approval denied because action is prohibited" : "Approval requested", {
    approvalId: id,
    status,
    riskTier: input.riskTier,
  });
  thoughtLog.publish({
    level: status === "denied" ? "warning" : "info",
    category: "approval",
    title: status === "denied" ? "Approval Denied" : "Approval Requested",
    message: `${input.title}: ${input.summary}`,
    metadata: { approvalId: id, jobId: job.id, riskTier: input.riskTier, physicalTier: input.physicalTier },
  });

  return getApprovalRequest(id)!;
}

export function getApprovalRequest(id: string): ApprovalRequest | null {
  const row = sqlite.prepare("SELECT * FROM approval_requests WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToApproval(row) : null;
}

export function listApprovalRequests(limit = 100): ApprovalRequest[] {
  return (sqlite.prepare(`
    SELECT * FROM approval_requests
    ORDER BY requested_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(limit, 500))) as Array<Record<string, unknown>>).map(rowToApproval);
}

function transitionApproval(id: string, status: ApprovalStatus, result?: Record<string, unknown>): ApprovalRequest | null {
  const approval = getApprovalRequest(id);
  if (!approval) return null;
  if (["completed", "failed", "cancelled", "denied"].includes(approval.status)) return approval;
  const timestamp = nowIso();
  const column =
    status === "approved" ? "approved_at" :
    status === "denied" ? "denied_at" :
    status === "cancelled" ? "cancelled_at" :
    null;
  const assignments = [`status = ?`, `result_json = ?`];
  if (column) assignments.push(`${column} = ?`);
  sqlite.prepare(`
    UPDATE approval_requests
    SET ${assignments.join(", ")}
    WHERE id = ?
  `).run(
    status,
    result ? JSON.stringify(result) : approval.result ? JSON.stringify(approval.result) : null,
    ...(column ? [timestamp] : []),
    id,
  );
  if (approval.jobId) {
    const jobState =
      status === "approved" ? "queued" :
      status === "denied" || status === "cancelled" ? "cancelled" :
      status === "failed" ? "failed" :
      status === "completed" ? "completed" :
      "waiting_for_approval";
    updateDurableJobState(approval.jobId, jobState, {
      message: `Approval ${status}`,
      checkpoint: { approvalStatus: status },
      result,
      error: status === "denied" || status === "cancelled" || status === "failed" ? String(result?.reason ?? status) : undefined,
    });
  }
  recordAuditEvent({
    eventType: "approval",
    action: status,
    target: id,
    result: status === "approved" || status === "completed" ? "success" : "blocked",
    metadata: { jobId: approval.jobId, riskTier: approval.riskTier, physicalTier: approval.physicalTier, result },
  });
  thoughtLog.publish({
    level: status === "approved" ? "info" : "warning",
    category: "approval",
    title: `Approval ${status}`,
    message: `${approval.title}: ${approval.summary}`,
    metadata: { approvalId: id, jobId: approval.jobId, result },
  });
  return getApprovalRequest(id);
}

export function approveRequest(id: string, note?: string): ApprovalRequest | null {
  return transitionApproval(id, "approved", { note: note ?? "Approved by local user" });
}

export function denyRequest(id: string, reason?: string): ApprovalRequest | null {
  return transitionApproval(id, "denied", { reason: reason ?? "Denied by local user" });
}

export function cancelRequest(id: string, reason?: string): ApprovalRequest | null {
  return transitionApproval(id, "cancelled", { reason: reason ?? "Cancelled by local user" });
}

export function completeApproval(id: string, result: Record<string, unknown>): ApprovalRequest | null {
  return transitionApproval(id, "completed", result);
}

export function failApproval(id: string, error: string): ApprovalRequest | null {
  return transitionApproval(id, "failed", { reason: error });
}

export function verifyApprovedRequest(
  approvalId: string | undefined,
  expectedPayload: Record<string, unknown>,
  expectedType: string,
): ApprovalVerification {
  if (!approvalId) return { allowed: false, message: "Approval is required before executing this action" };
  const approval = getApprovalRequest(approvalId);
  if (!approval) return { allowed: false, message: "Approval request not found" };
  if (approval.status !== "approved") return { allowed: false, approval, message: `Approval status is ${approval.status}` };
  if (approval.type !== expectedType) return { allowed: false, approval, message: `Approval type mismatch: expected ${expectedType}` };
  if (approval.expiresAt && approval.expiresAt < nowIso()) {
    transitionApproval(approval.id, "expired", { reason: "Approval expired" });
    return { allowed: false, approval: getApprovalRequest(approval.id) ?? approval, message: "Approval expired" };
  }
  const expectedHash = stablePayloadHash(expectedPayload);
  if (approval.payloadHash !== expectedHash) {
    return { allowed: false, approval, message: "Approval payload hash mismatch" };
  }
  return { allowed: true, approval, message: "Approved" };
}

export function approvalJobFor(approval: ApprovalRequest): DurableJob | null {
  if (!approval.jobId) return null;
  const row = sqlite.prepare("SELECT * FROM durable_jobs WHERE id = ?").get(approval.jobId) as Record<string, unknown> | undefined;
  return row as unknown as DurableJob | null;
}
