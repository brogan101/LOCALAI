import { createHash } from "crypto";
import { DEFAULT_FALLBACK_MODEL } from "../config/models.config.js";
import { sqlite } from "../db/database.js";
import { createApprovalRequest, verifyApprovedRequest } from "./approval-queue.js";
import {
  createDurableJob,
  getDurableJob,
  recordAuditEvent,
  seedFoundationDefaults,
  updateDurableJobState,
} from "./platform-foundation.js";

export type ReplayDataStatus = "recorded" | "missing" | "blocked" | "redacted";

export interface MissionReplayEvent {
  id: string;
  traceId: string;
  timestamp: string;
  source:
    | "audit_events"
    | "approval_requests"
    | "durable_jobs"
    | "async_jobs"
    | "job_events"
    | "thought_log"
    | "audit_log"
    | "replay_integrity";
  kind: string;
  actor?: string;
  target?: string;
  result?: string;
  dataStatus: ReplayDataStatus;
  message: string;
  metadata: Record<string, unknown>;
}

export interface MissionReplay {
  traceId?: string;
  generatedAt: string;
  sourceOfTruth: string;
  events: MissionReplayEvent[];
  summary: {
    totalEvents: number;
    recorded: number;
    missing: number;
    blocked: number;
    redacted: number;
  };
}

export interface EvalResult {
  id: string;
  name: string;
  status: "pass" | "fail";
  message: string;
  details?: Record<string, unknown>;
}

export interface EvalReport {
  success: boolean;
  generatedAt: string;
  localOnly: true;
  networkUsed: false;
  externalProvidersRequired: false;
  results: EvalResult[];
}

const SOURCE_OF_TRUTH =
  "SQLite mission replay projection over audit_events, approval_requests, durable_jobs, async_jobs, job_events, thought_log, and legacy audit_log.";

const SENSITIVE_KEY = /(api[_-]?key|token|secret|credential|cookie|authorization|password|privateFileContents)/i;
const SENSITIVE_PAYLOAD_KEY = /^(prompt|messages|content|text|body|newContent|oldContent|fileContents|privateFileContent|rawInput|rawOutput)$/i;
const SECRET_LIKE_VALUE = /(sk-[a-z0-9_-]{8,}|api[_-]?key\s*[:=]|authorization\s*[:=]|bearer\s+[a-z0-9._-]+|password\s*[:=]|token\s*[:=])/i;

function nowIso(): string {
  return new Date().toISOString();
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
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

function stringifyForHash(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function redactForMissionReplay(value: unknown, key = ""): { value: unknown; redacted: boolean } {
  if (value === null || value === undefined) return { value, redacted: false };

  if (SENSITIVE_KEY.test(key) || SENSITIVE_PAYLOAD_KEY.test(key)) {
    return { value: `[redacted:${shortHash(stringifyForHash(value))}]`, redacted: true };
  }

  if (typeof value === "string") {
    if (SECRET_LIKE_VALUE.test(value)) {
      return { value: `[redacted:${shortHash(value)}]`, redacted: true };
    }
    return { value, redacted: false };
  }

  if (Array.isArray(value)) {
    let redacted = false;
    const next = value.map((item, index) => {
      const result = redactForMissionReplay(item, `${key}.${index}`);
      redacted = redacted || result.redacted;
      return result.value;
    });
    return { value: next, redacted };
  }

  if (typeof value === "object") {
    let redacted = false;
    const next: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      const result = redactForMissionReplay(childValue, childKey);
      redacted = redacted || result.redacted;
      next[childKey] = result.value;
    }
    return { value: next, redacted };
  }

  return { value, redacted: false };
}

function sourceTraceId(candidates: Array<unknown>, fallback: string): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return fallback;
}

function eventStatus(base: ReplayDataStatus, redacted: boolean, result?: string): ReplayDataStatus {
  if (base !== "recorded") return base;
  if (result === "blocked") return "blocked";
  return redacted ? "redacted" : "recorded";
}

function eventSort(left: MissionReplayEvent, right: MissionReplayEvent): number {
  const byTime = right.timestamp.localeCompare(left.timestamp);
  if (byTime !== 0) return byTime;
  return right.id.localeCompare(left.id);
}

function includeTrace(event: MissionReplayEvent, traceId?: string): boolean {
  if (!traceId) return true;
  if (event.traceId === traceId || event.id === traceId || event.target === traceId) return true;
  const haystack = JSON.stringify(event.metadata);
  return haystack.includes(traceId);
}

export function listMissionReplayEvents(options: { traceId?: string; limit?: number } = {}): MissionReplay {
  seedFoundationDefaults();
  const limit = Math.max(1, Math.min(options.limit ?? 200, 1000));
  const events: MissionReplayEvent[] = [];
  const durableJobIds = new Set<string>();

  const auditRows = sqlite.prepare(`
    SELECT id, event_type, action, actor, target, result, metadata_json, created_at
    FROM audit_events
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Array<Record<string, unknown>>;
  for (const row of auditRows) {
    const metadata = parseJson(row["metadata_json"]);
    const redacted = redactForMissionReplay(metadata);
    const result = String(row["result"] ?? "success");
    events.push({
      id: row["id"] as string,
      traceId: sourceTraceId([metadata["traceId"], metadata["sessionId"], metadata["jobId"], row["target"]], row["id"] as string),
      timestamp: row["created_at"] as string,
      source: "audit_events",
      kind: `${row["event_type"]}.${row["action"]}`,
      actor: row["actor"] as string,
      target: (row["target"] as string | null) ?? undefined,
      result,
      dataStatus: eventStatus("recorded", redacted.redacted, result),
      message: `${row["event_type"]}.${row["action"]} ${result}`,
      metadata: redacted.value as Record<string, unknown>,
    });
  }

  const approvalRows = sqlite.prepare(`
    SELECT *
    FROM approval_requests
    ORDER BY requested_at DESC
    LIMIT ?
  `).all(limit) as Array<Record<string, unknown>>;
  for (const row of approvalRows) {
    const payload = parseJson(row["payload_json"]);
    const result = row["result_json"] ? parseJson(row["result_json"]) : {};
    const metadataRaw = {
      type: row["type"],
      riskTier: row["risk_tier"],
      physicalTier: row["physical_tier"],
      requestedAction: row["requested_action"],
      payloadHash: row["payload_hash"],
      payload,
      result,
      jobId: row["job_id"],
      auditId: row["audit_id"],
    };
    const redacted = redactForMissionReplay(metadataRaw);
    const status = String(row["status"] ?? "unknown");
    const dataStatus: ReplayDataStatus = ["denied", "cancelled", "expired"].includes(status)
      ? "blocked"
      : eventStatus("recorded", redacted.redacted);
    events.push({
      id: row["id"] as string,
      traceId: sourceTraceId([row["id"], row["job_id"], row["audit_id"]], row["id"] as string),
      timestamp: row["denied_at"] as string || row["approved_at"] as string || row["cancelled_at"] as string || row["requested_at"] as string,
      source: "approval_requests",
      kind: `approval.${status}`,
      target: row["id"] as string,
      result: status,
      dataStatus,
      message: `${row["title"]}: ${row["summary"]}`,
      metadata: redacted.value as Record<string, unknown>,
    });

    const jobId = row["job_id"];
    if (typeof jobId === "string" && jobId) {
      durableJobIds.add(jobId);
      const job = getDurableJob(jobId);
      if (!job) {
        events.push({
          id: `missing-job-${jobId}`,
          traceId: row["id"] as string,
          timestamp: row["requested_at"] as string,
          source: "replay_integrity",
          kind: "missing.linked_job",
          target: jobId,
          result: "missing",
          dataStatus: "missing",
          message: `Approval ${row["id"] as string} references missing durable job ${jobId}`,
          metadata: { approvalId: row["id"], jobId },
        });
      }
    }
  }

  const jobRows = sqlite.prepare(`
    SELECT *
    FROM durable_jobs
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(limit) as Array<Record<string, unknown>>;
  for (const row of jobRows) {
    durableJobIds.add(row["id"] as string);
    const metadataRaw = {
      kind: row["kind"],
      state: row["state"],
      priority: row["priority"],
      payload: parseJson(row["payload_json"]),
      checkpoint: parseJson(row["checkpoint_json"]),
      retryCount: row["retry_count"],
      result: row["result_json"] ? parseJson(row["result_json"]) : undefined,
      error: row["error"],
      sessionId: row["session_id"],
      workspaceId: row["workspace_id"],
    };
    const redacted = redactForMissionReplay(metadataRaw);
    const state = String(row["state"] ?? "unknown");
    events.push({
      id: row["id"] as string,
      traceId: sourceTraceId([row["session_id"], row["workspace_id"], row["id"]], row["id"] as string),
      timestamp: row["updated_at"] as string,
      source: "durable_jobs",
      kind: `job.${state}`,
      target: row["id"] as string,
      result: state,
      dataStatus: ["failed", "cancelled"].includes(state) ? "blocked" : eventStatus("recorded", redacted.redacted),
      message: `${row["kind"] as string} is ${state}`,
      metadata: redacted.value as Record<string, unknown>,
    });
  }

  const asyncJobRows = sqlite.prepare(`
    SELECT id, name, type, status, progress, message, error, result_json, metadata_json,
           capability, created_at, started_at, finished_at
    FROM async_jobs
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Array<Record<string, unknown>>;
  for (const row of asyncJobRows) {
    const metadataRaw = {
      name: row["name"],
      type: row["type"],
      progress: row["progress"],
      message: row["message"],
      error: row["error"],
      result: row["result_json"] ? parseJson(row["result_json"]) : undefined,
      metadata: row["metadata_json"] ? parseJson(row["metadata_json"]) : undefined,
      capability: row["capability"],
      startedAt: row["started_at"],
      finishedAt: row["finished_at"],
    };
    const redacted = redactForMissionReplay(metadataRaw);
    const status = String(row["status"] ?? "unknown");
    events.push({
      id: row["id"] as string,
      traceId: sourceTraceId([
        (metadataRaw.metadata as Record<string, unknown> | undefined)?.["traceId"],
        row["id"],
      ], row["id"] as string),
      timestamp: row["finished_at"] as string || row["started_at"] as string || row["created_at"] as string,
      source: "async_jobs",
      kind: `async_job.${status}`,
      target: row["id"] as string,
      result: status,
      dataStatus: ["failed", "cancelled", "paused"].includes(status) ? "blocked" : eventStatus("recorded", redacted.redacted),
      message: `${row["name"] as string} ${status}: ${row["message"] as string}`,
      metadata: redacted.value as Record<string, unknown>,
    });
  }

  const jobEventRows = sqlite.prepare(`
    SELECT id, job_id, event_type, message, metadata_json, created_at
    FROM job_events
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Array<Record<string, unknown>>;
  for (const row of jobEventRows) {
    const metadata = parseJson(row["metadata_json"]);
    const redacted = redactForMissionReplay(metadata);
    const jobId = row["job_id"] as string;
    events.push({
      id: row["id"] as string,
      traceId: sourceTraceId([metadata["traceId"], metadata["approvalId"], jobId], jobId),
      timestamp: row["created_at"] as string,
      source: "job_events",
      kind: `job_event.${row["event_type"] as string}`,
      target: jobId,
      result: row["event_type"] as string,
      dataStatus: durableJobIds.has(jobId) ? eventStatus("recorded", redacted.redacted) : "missing",
      message: row["message"] as string,
      metadata: redacted.value as Record<string, unknown>,
    });
  }

  const thoughtRows = sqlite.prepare(`
    SELECT id, timestamp, level, category, title, message, metadata_json
    FROM thought_log
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(limit) as Array<Record<string, unknown>>;
  for (const row of thoughtRows) {
    const metadata = parseJson(row["metadata_json"]);
    const redacted = redactForMissionReplay(metadata);
    events.push({
      id: row["id"] as string,
      traceId: sourceTraceId([metadata["traceId"], metadata["sessionId"], metadata["jobId"], metadata["approvalId"], row["id"]], row["id"] as string),
      timestamp: row["timestamp"] as string,
      source: "thought_log",
      kind: `${row["category"]}.${row["level"]}`,
      result: row["level"] as string,
      dataStatus: eventStatus("recorded", redacted.redacted, row["level"] === "error" ? "blocked" : undefined),
      message: `${row["title"] as string}: ${row["message"] as string}`,
      metadata: redacted.value as Record<string, unknown>,
    });
  }

  const legacyRows = sqlite.prepare(`
    SELECT id, timestamp, action, file_path, old_hash, new_hash, user_confirmed, result, backup_path
    FROM audit_log
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(limit) as Array<Record<string, unknown>>;
  for (const row of legacyRows) {
    const metadataRaw = {
      filePath: row["file_path"],
      oldHash: row["old_hash"],
      newHash: row["new_hash"],
      userConfirmed: row["user_confirmed"],
      backupPath: row["backup_path"],
    };
    const redacted = redactForMissionReplay(metadataRaw);
    events.push({
      id: row["id"] as string,
      traceId: sourceTraceId([row["file_path"], row["id"]], row["id"] as string),
      timestamp: row["timestamp"] as string,
      source: "audit_log",
      kind: `rollback.${row["action"] as string}`,
      target: (row["file_path"] as string | null) ?? undefined,
      result: (row["result"] as string | null) ?? undefined,
      dataStatus: eventStatus("recorded", redacted.redacted, row["result"] === "failed" ? "blocked" : undefined),
      message: `${row["action"] as string} ${row["file_path"] ?? ""}`.trim(),
      metadata: redacted.value as Record<string, unknown>,
    });
  }

  const filtered = events.filter(event => includeTrace(event, options.traceId)).sort(eventSort).slice(0, limit);
  const summary = {
    totalEvents: filtered.length,
    recorded: filtered.filter(event => event.dataStatus === "recorded").length,
    missing: filtered.filter(event => event.dataStatus === "missing").length,
    blocked: filtered.filter(event => event.dataStatus === "blocked").length,
    redacted: filtered.filter(event => event.dataStatus === "redacted").length,
  };

  return {
    traceId: options.traceId,
    generatedAt: nowIso(),
    sourceOfTruth: SOURCE_OF_TRUTH,
    events: filtered,
    summary,
  };
}

function evalResult(id: string, name: string, passed: boolean, message: string, details?: Record<string, unknown>): EvalResult {
  return { id, name, status: passed ? "pass" : "fail", message, details };
}

export function runLocalJarvisEvals(): EvalReport {
  seedFoundationDefaults();
  const results: EvalResult[] = [];

  results.push(evalResult(
    "local_chat_model_routing",
    "Local chat/model routing default is available without cloud keys",
    typeof DEFAULT_FALLBACK_MODEL === "string" && DEFAULT_FALLBACK_MODEL.length > 0,
    `Default local fallback model is ${DEFAULT_FALLBACK_MODEL}.`,
    { provider: "ollama/local", cloudRequired: false },
  ));

  const denied = createApprovalRequest({
    type: "eval_denial",
    title: "Eval denied command",
    summary: "Tier 5 eval action must not execute.",
    riskTier: "tier5_manual_only_prohibited",
    requestedAction: "eval.dangerous",
    payload: { command: "Remove-Item -Recurse C:\\", traceId: "eval-approval-denial" },
  });
  const deniedJob = denied.jobId ? getDurableJob(denied.jobId) : null;
  results.push(evalResult(
    "approval_denial",
    "Denied approvals remain denied and jobs are cancelled",
    denied.status === "denied" && deniedJob?.state === "cancelled",
    "Tier 5 approval was denied locally before execution.",
    { approvalId: denied.id, jobId: denied.jobId, jobState: deniedJob?.state },
  ));

  const failedJob = createDurableJob({
    kind: "eval.job_failure",
    payload: { traceId: "eval-job-failure" },
  });
  updateDurableJobState(failedJob.id, "failed", {
    message: "Eval job failed intentionally",
    error: "intentional eval failure",
  });
  const failedReloaded = getDurableJob(failedJob.id);
  results.push(evalResult(
    "job_failure",
    "Failed jobs retain error details",
    failedReloaded?.state === "failed" && failedReloaded.error === "intentional eval failure",
    "Durable eval job failed with stored error text.",
    { jobId: failedJob.id, state: failedReloaded?.state, error: failedReloaded?.error },
  ));

  const blockedTool = verifyApprovedRequest(undefined, { command: "echo blocked" }, "command_execution");
  results.push(evalResult(
    "tool_blocking",
    "Tool execution without approval is blocked",
    blockedTool.allowed === false,
    blockedTool.message,
  ));

  const secretAuditId = recordAuditEvent({
    eventType: "eval",
    action: "secret-redaction",
    target: "eval-secret-redaction",
    metadata: {
      traceId: "eval-secret-redaction",
      apiKey: "sk-phase04-secret",
      prompt: "private prompt payload should not replay raw",
      normal: "visible",
    },
  });
  const secretReplay = listMissionReplayEvents({ traceId: "eval-secret-redaction", limit: 50 });
  const secretReplayText = JSON.stringify(secretReplay);
  results.push(evalResult(
    "secret_redaction",
    "Secrets and raw prompt payloads are redacted from replay",
    secretReplayText.includes("[redacted:") &&
      !secretReplayText.includes("sk-phase04-secret") &&
      !secretReplayText.includes("private prompt payload should not replay raw"),
    "Replay redacted secret-like fields and prompt payloads.",
    { auditId: secretAuditId },
  ));

  const deniedReplay = listMissionReplayEvents({ traceId: denied.id, limit: 100 });
  results.push(evalResult(
    "mission_replay_event_integrity",
    "Mission replay exposes recorded denied approval and blocked status",
    deniedReplay.events.some(event => event.kind === "approval.denied" && event.dataStatus === "blocked"),
    "Denied approval is replayable from recorded approval/audit/job data.",
    { approvalId: denied.id, replayEvents: deniedReplay.summary.totalEvents },
  ));

  return {
    success: results.every(result => result.status === "pass"),
    generatedAt: nowIso(),
    localOnly: true,
    networkUsed: false,
    externalProvidersRequired: false,
    results,
  };
}

export function getMissionReplaySourceOfTruth(): string {
  return SOURCE_OF_TRUTH;
}
