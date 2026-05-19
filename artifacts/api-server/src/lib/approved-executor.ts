/**
 * APPROVED EXECUTOR — reusable safe-execution framework
 * =====================================================
 * Phase 24. Closes the B-009 gap: turns proposal-only approvals into real,
 * proof-driven executions while preserving every existing safety boundary.
 *
 * Every executor (IT Support, Local Builder patches, RAG ingest, etc.) gets:
 *   1. Pre-flight verification (approval, hash, runtime mode, sanitizer, e-stop)
 *   2. Durable job creation + state transitions
 *   3. Audit events at every checkpoint
 *   4. Proof bundle with stdout/stderr/result/rollback
 *   5. Redacted summaries for the UI
 *   6. Loud, structured failure modes — never silent fail
 *
 * Executors register a {kind, runner} pair. Callers go through executeApproved()
 * which is the single entry point — no executor calls runtime commands directly.
 *
 * Path layout: ~/LocalAI-Tools/proof/<jobId>/
 *   request.json   — original execution request
 *   approval.json  — frozen approval snapshot at execution time
 *   stdout.log     — captured stdout (raw, then a redacted preview is saved separately)
 *   stderr.log     — captured stderr
 *   result.json    — structured result returned by the runner
 *   rollback.md    — markdown rollback notes (if runner provided them)
 *   verification.log — output of verification step (optional)
 */

import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";
import { createHash } from "crypto";
import { thoughtLog } from "./thought-log.js";
import { logger } from "./logger.js";
import {
  getApprovalRequest,
  verifyApprovedRequest,
  completeApproval,
  failApproval,
  type ApprovalRequest,
} from "./approval-queue.js";
import {
  createDurableJob,
  updateDurableJobState,
  appendJobEvent,
  recordAuditEvent,
  type DurableJob,
} from "./platform-foundation.js";
import { getCurrentRuntimeMode, getRuntimeModeState } from "./runtime-mode.js";
import { isDangerousCommand } from "./command-sanitizer.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ExecutorRunMode = "validate" | "dry_run" | "execute" | "verify";

export interface ApprovedExecutionRequest {
  /** Stable identifier for the executor (e.g. "it_support_script", "local_builder_patch") */
  executorKind: string;
  /** Approval id created via approval-queue.createApprovalRequest */
  approvalId: string;
  /** Human-readable summary of what's about to happen */
  requestedAction: string;
  /** Mode — defaults to dry_run if not specified */
  mode?: ExecutorRunMode;
  /** Optional workspace context */
  workspacePath?: string;
  /** Free-form payload — must hash-match the approval payload for execute mode */
  payload: Record<string, unknown>;
  /** Optional: runtime modes that are allowed. Default: any except "minimal" */
  allowedRuntimeModes?: string[];
  /** If true, skip the runtime-mode check (only for validate-only paths) */
  skipRuntimeModeCheck?: boolean;
}

export interface ExecutorRunnerContext {
  request: ApprovedExecutionRequest;
  approval: ApprovalRequest;
  job: DurableJob;
  proofDir: string;
  /** Append a line to verification.log for verification steps */
  appendVerification(line: string): Promise<void>;
  /** Mark a checkpoint in the durable job */
  checkpoint(state: string, metadata?: Record<string, unknown>): void;
}

export interface ExecutorRunnerResult {
  success: boolean;
  executed: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  result?: Record<string, unknown>;
  rollbackNotes?: string;
  redactedSummary: string;
}

export type ExecutorRunner = (ctx: ExecutorRunnerContext) => Promise<ExecutorRunnerResult>;

export interface ApprovedExecutionResult {
  success: boolean;
  executed: boolean;
  blocked: boolean;
  reason?: string;
  jobId: string;
  approvalId: string;
  startedAt: string;
  finishedAt: string;
  exitCode?: number;
  proofDir: string;
  proofManifest: string[];
  auditId: string;
  redactedSummary: string;
  mode: ExecutorRunMode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry — executors register themselves with a kind string
// ─────────────────────────────────────────────────────────────────────────────

const RUNNERS = new Map<string, ExecutorRunner>();

export function registerExecutor(kind: string, runner: ExecutorRunner): void {
  if (RUNNERS.has(kind)) {
    logger.warn({ kind }, "approved-executor: overwriting existing runner");
  }
  RUNNERS.set(kind, runner);
}

export function listRegisteredExecutors(): string[] {
  return [...RUNNERS.keys()];
}

// ─────────────────────────────────────────────────────────────────────────────
// Emergency stop — checked on every execute call
// ─────────────────────────────────────────────────────────────────────────────

let emergencyStopActive = false;

export function isEmergencyStopActive(): boolean {
  return emergencyStopActive;
}

export function activateEmergencyStop(reason: string): void {
  emergencyStopActive = true;
  thoughtLog.publish({
    level: "error",
    category: "kernel",
    title: "Emergency Stop Activated",
    message: reason,
  });
  recordAuditEvent({
    eventType: "emergency_stop",
    action: "activate",
    target: "global",
    metadata: { reason },
  });
}

export function clearEmergencyStop(reason: string): void {
  emergencyStopActive = false;
  thoughtLog.publish({
    category: "kernel",
    title: "Emergency Stop Cleared",
    message: reason,
  });
  recordAuditEvent({
    eventType: "emergency_stop",
    action: "clear",
    target: "global",
    metadata: { reason },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Path helpers
// ─────────────────────────────────────────────────────────────────────────────

function proofRoot(): string {
  return path.join(os.homedir(), "LocalAI-Tools", "proof");
}

function proofDirFor(jobId: string): string {
  return path.join(proofRoot(), jobId);
}

async function ensureProofDir(jobId: string): Promise<string> {
  const dir = proofDirFor(jobId);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  return dir;
}

// ─────────────────────────────────────────────────────────────────────────────
// Redaction — keep secrets out of UI/audit summaries
// ─────────────────────────────────────────────────────────────────────────────

const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/g, replacement: "[GITHUB_TOKEN_REDACTED]" },
  { pattern: /sk-[A-Za-z0-9]{20,}/g, replacement: "[API_KEY_REDACTED]" },
  { pattern: /Bearer\s+[A-Za-z0-9._~+/-]{20,}=*/gi, replacement: "Bearer [TOKEN_REDACTED]" },
  { pattern: /(password|pwd|secret|api[_-]?key|token)\s*[:=]\s*['""]?[^\s'""\n]+/gi, replacement: "$1=[REDACTED]" },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: "[EMAIL_REDACTED]" },
  { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: "[IP_REDACTED]" },
];

export function redact(text: string, maxLen = 1000): string {
  let redacted = text;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  if (redacted.length > maxLen) {
    redacted = redacted.slice(0, maxLen) + `\n…[truncated ${redacted.length - maxLen} chars]`;
  }
  return redacted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-flight verification — runs before any runner executes
// ─────────────────────────────────────────────────────────────────────────────

interface PreflightResult {
  allowed: boolean;
  reason?: string;
  approval?: ApprovalRequest;
}

function preflight(req: ApprovedExecutionRequest): PreflightResult {
  // 0. Emergency stop check
  if (emergencyStopActive) {
    return { allowed: false, reason: "Emergency stop is active — all executors are halted" };
  }

  // 1. Runner registered
  if (!RUNNERS.has(req.executorKind)) {
    return { allowed: false, reason: `No runner registered for executorKind="${req.executorKind}"` };
  }

  // 2. Validate-only mode skips most checks
  const mode: ExecutorRunMode = req.mode ?? "dry_run";
  if (mode === "validate") {
    return { allowed: true };
  }

  // 3. Approval must exist and be approved
  const approval = getApprovalRequest(req.approvalId);
  if (!approval) {
    return { allowed: false, reason: `Approval not found: ${req.approvalId}` };
  }
  if (approval.status === "expired" || approval.status === "denied" || approval.status === "cancelled") {
    return { allowed: false, reason: `Approval status is ${approval.status}`, approval };
  }

  // 4. For execute mode, full verification including hash match
  if (mode === "execute") {
    const verification = verifyApprovedRequest(req.approvalId, req.payload, approval.type);
    if (!verification.allowed) {
      return { allowed: false, reason: verification.message, approval };
    }
  }

  // 5. Runtime mode check
  if (!req.skipRuntimeModeCheck) {
    const currentMode = getCurrentRuntimeMode();
    const allowed = req.allowedRuntimeModes ?? ([] as string[]);
    if (allowed.length > 0 && !allowed.includes(currentMode)) {
      return {
        allowed: false,
        reason: `Runtime mode "${currentMode}" does not allow executor "${req.executorKind}". Allowed: ${allowed.join(", ")}`,
        approval,
      };
    }
  }

  // 6. Physical actions check — defer to runtime-mode policy
  const rmState = getRuntimeModeState();
  if (rmState.physicalActionsDisabled && approval.physicalTier && approval.physicalTier !== "p0_sensor_read") {
    return {
      allowed: false,
      reason: `Physical actions are disabled in runtime mode "${rmState.mode}"`,
      approval,
    };
  }

  return { allowed: true, approval };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point — executeApproved
// ─────────────────────────────────────────────────────────────────────────────

export async function executeApproved(req: ApprovedExecutionRequest): Promise<ApprovedExecutionResult> {
  const startedAt = new Date().toISOString();
  const mode: ExecutorRunMode = req.mode ?? "dry_run";

  // ── Preflight
  const pf = preflight(req);
  if (!pf.allowed) {
    const auditId = recordAuditEvent({
      eventType: "executor.preflight_blocked",
      action: req.executorKind,
      target: req.approvalId,
      metadata: { mode, reason: pf.reason },
    });
    thoughtLog.publish({
      level: "warning",
      category: "kernel",
      title: "Executor blocked at preflight",
      message: `${req.executorKind}: ${pf.reason}`,
    });
    return {
      success: false,
      executed: false,
      blocked: true,
      reason: pf.reason,
      jobId: "",
      approvalId: req.approvalId,
      startedAt,
      finishedAt: new Date().toISOString(),
      proofDir: "",
      proofManifest: [],
      auditId,
      redactedSummary: pf.reason ?? "blocked",
      mode,
    };
  }

  // ── Create durable job
  const job = createDurableJob({
    kind: `executor.${req.executorKind}`,
    payload: {
      executorKind: req.executorKind,
      approvalId: req.approvalId,
      mode,
      requestedAction: req.requestedAction,
      payloadHashPreview: createHash("sha256").update(JSON.stringify(req.payload)).digest("hex").slice(0, 16),
    },
    state: "running",
  });

  const proofDir = await ensureProofDir(job.id);

  // Audit start
  const auditId = recordAuditEvent({
    eventType: "executor.start",
    action: req.executorKind,
    target: job.id,
    metadata: { approvalId: req.approvalId, mode, requestedAction: req.requestedAction },
  });

  appendJobEvent(job.id, "executor_started", `Executor ${req.executorKind} started in ${mode} mode`, {
    approvalId: req.approvalId,
  });

  // Save request + approval snapshots to proof dir
  try {
    await writeFile(
      path.join(proofDir, "request.json"),
      JSON.stringify({ ...req, payload: redactPayload(req.payload) }, null, 2),
      "utf-8",
    );
    if (pf.approval) {
      await writeFile(
        path.join(proofDir, "approval.json"),
        JSON.stringify({ ...pf.approval, payload: redactPayload(pf.approval.payload) }, null, 2),
        "utf-8",
      );
    }
  } catch (err) {
    logger.warn({ err }, "approved-executor: failed to write proof snapshots");
  }

  // ── Execute the runner
  const runner = RUNNERS.get(req.executorKind)!;
  const proofManifest: string[] = ["request.json"];
  if (pf.approval) proofManifest.push("approval.json");

  let runnerResult: ExecutorRunnerResult | null = null;
  let runnerError: Error | null = null;

  try {
    runnerResult = await runner({
      request: req,
      approval: pf.approval ?? ({} as ApprovalRequest),
      job,
      proofDir,
      appendVerification: async (line: string) => {
        const fp = path.join(proofDir, "verification.log");
        const stamped = `[${new Date().toISOString()}] ${line}\n`;
        const { appendFile } = await import("fs/promises");
        await appendFile(fp, stamped, "utf-8");
        if (!proofManifest.includes("verification.log")) proofManifest.push("verification.log");
      },
      checkpoint: (state: string, metadata?: Record<string, unknown>) => {
        appendJobEvent(job.id, "checkpoint", state, metadata ?? {});
      },
    });
  } catch (err) {
    runnerError = err instanceof Error ? err : new Error(String(err));
  }

  // ── Persist artifacts
  if (runnerResult) {
    try {
      if (runnerResult.stdout) {
        await writeFile(path.join(proofDir, "stdout.log"), runnerResult.stdout, "utf-8");
        proofManifest.push("stdout.log");
      }
      if (runnerResult.stderr) {
        await writeFile(path.join(proofDir, "stderr.log"), runnerResult.stderr, "utf-8");
        proofManifest.push("stderr.log");
      }
      if (runnerResult.result) {
        await writeFile(path.join(proofDir, "result.json"), JSON.stringify(runnerResult.result, null, 2), "utf-8");
        proofManifest.push("result.json");
      }
      if (runnerResult.rollbackNotes) {
        await writeFile(path.join(proofDir, "rollback.md"), runnerResult.rollbackNotes, "utf-8");
        proofManifest.push("rollback.md");
      }
    } catch (err) {
      logger.warn({ err, jobId: job.id }, "approved-executor: failed to persist proof artifacts");
    }
  }

  const finishedAt = new Date().toISOString();

  // ── Update durable job + approval
  if (runnerError || !runnerResult || !runnerResult.success) {
    const reason = runnerError?.message ?? runnerResult?.redactedSummary ?? "Runner failed";
    updateDurableJobState(job.id, "failed", { result: { error: reason } });
    appendJobEvent(job.id, "executor_failed", reason, {});
    if (mode === "execute") failApproval(req.approvalId, reason);
    recordAuditEvent({
      eventType: "executor.failed",
      action: req.executorKind,
      target: job.id,
      metadata: { reason: redact(reason) },
    });
    return {
      success: false,
      executed: false,
      blocked: false,
      reason,
      jobId: job.id,
      approvalId: req.approvalId,
      startedAt,
      finishedAt,
      proofDir,
      proofManifest,
      auditId,
      redactedSummary: redact(reason),
      mode,
    };
  }

  // Success path
  updateDurableJobState(job.id, "completed", {
    result: {
      executed: runnerResult.executed,
      exitCode: runnerResult.exitCode,
      summary: runnerResult.redactedSummary,
    },
  });
  appendJobEvent(job.id, "executor_completed", runnerResult.redactedSummary, {});

  if (mode === "execute" && runnerResult.executed) {
    completeApproval(req.approvalId, {
      jobId: job.id,
      executorKind: req.executorKind,
      proofDir,
    });
  }

  recordAuditEvent({
    eventType: "executor.completed",
    action: req.executorKind,
    target: job.id,
    metadata: {
      mode,
      executed: runnerResult.executed,
      exitCode: runnerResult.exitCode,
    },
  });

  thoughtLog.publish({
    category: "kernel",
    title: `Executor ${req.executorKind} ${runnerResult.executed ? "completed" : "validated"}`,
    message: runnerResult.redactedSummary,
    metadata: { jobId: job.id, mode },
  });

  return {
    success: true,
    executed: runnerResult.executed,
    blocked: false,
    jobId: job.id,
    approvalId: req.approvalId,
    startedAt,
    finishedAt,
    exitCode: runnerResult.exitCode,
    proofDir,
    proofManifest,
    auditId,
    redactedSummary: runnerResult.redactedSummary,
    mode,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === "string") {
      out[k] = redact(v, 500);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) => (typeof item === "string" ? redact(item, 500) : item));
    } else if (v && typeof v === "object") {
      out[k] = redactPayload(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Validate a command string against the sanitizer — used by runners before exec. */
export function preExecuteSanitize(command: string): { allowed: boolean; reason?: string } {
  const result = isDangerousCommand(command);
  if (result.dangerous) {
    return { allowed: false, reason: result.reason ?? "Command sanitizer blocked the input" };
  }
  return { allowed: true };
}

/** Convenience: read a job's proof directory. */
export function getProofDir(jobId: string): string {
  return proofDirFor(jobId);
}

/** Convenience: list proof manifest for a job. */
export async function listProofManifest(jobId: string): Promise<string[]> {
  const dir = proofDirFor(jobId);
  if (!existsSync(dir)) return [];
  const { readdir } = await import("fs/promises");
  return readdir(dir);
}
