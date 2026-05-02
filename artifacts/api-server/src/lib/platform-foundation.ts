import { randomUUID } from "crypto";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { sqlite } from "../db/database.js";
import { toolsRoot } from "./runtime.js";

export type PermissionScope =
  | "file.read"
  | "file.write"
  | "command.execute"
  | "network"
  | "browser"
  | "desktop.worldgui"
  | "secrets"
  | "model.access";

export interface PermissionDecision {
  allowed: boolean;
  scope: PermissionScope;
  action: string;
  reason: string;
}

export interface DurableJobInput {
  kind: string;
  priority?: number;
  payload?: Record<string, unknown>;
  state?: DurableJobState;
  checkpoint?: Record<string, unknown>;
  sessionId?: string;
  workspaceId?: string;
}

export type DurableJobState =
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

export interface DurableJob {
  id: string;
  kind: string;
  state: DurableJobState;
  priority: number;
  payload: Record<string, unknown>;
  checkpoint: Record<string, unknown>;
  retryCount: number;
  result?: Record<string, unknown>;
  error?: string;
  sessionId?: string;
  workspaceId?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEventInput {
  eventType: string;
  action: string;
  actor?: string;
  target?: string;
  result?: "success" | "blocked" | "failed";
  metadata?: Record<string, unknown>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../../..");

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

function normalizePath(value: string): string {
  return path.resolve(value).toLowerCase();
}

function isInsidePath(candidate: string, root: string): boolean {
  const resolvedCandidate = normalizePath(candidate);
  const resolvedRoot = normalizePath(root);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

const DEFAULT_POLICIES: Array<{ id: string; scope: PermissionScope; action: string; effect: "allow"; reason: string }> = [
  { id: "default-file-read", scope: "file.read", action: "*", effect: "allow", reason: "Default local workspace compatibility" },
  { id: "default-file-write", scope: "file.write", action: "*", effect: "allow", reason: "Existing local agent edit behavior is preserved" },
  { id: "default-command", scope: "command.execute", action: "*", effect: "allow", reason: "Existing command execution remains controlled by legacy agent permissions" },
  { id: "default-network", scope: "network", action: "*", effect: "allow", reason: "Existing network behavior is preserved" },
  { id: "default-browser", scope: "browser", action: "*", effect: "allow", reason: "Browser runtime is feature-gated separately" },
  { id: "default-worldgui", scope: "desktop.worldgui", action: "*", effect: "allow", reason: "Existing WorldGUI routes remain controlled by allowAgentExec" },
  { id: "default-secrets", scope: "secrets", action: "*", effect: "allow", reason: "Existing secret handling is preserved" },
  { id: "default-model", scope: "model.access", action: "*", effect: "allow", reason: "Existing Ollama/local model access is preserved" },
];

let schemaEnsured = false;

function ensureFoundationSchema(): void {
  if (schemaEnsured) return;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workspace_roots (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      root_path TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL DEFAULT 'system',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_profiles (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      name TEXT NOT NULL,
      settings_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS integration_state (
      id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL DEFAULT '{}',
      installed INTEGER NOT NULL DEFAULT 0,
      running INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      last_checked_at TEXT,
      last_error TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plugin_state (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      installed INTEGER NOT NULL DEFAULT 0,
      permissions_json TEXT NOT NULL DEFAULT '{}',
      state_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permission_policies (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '*',
      action TEXT NOT NULL,
      effect TEXT NOT NULL DEFAULT 'allow',
      reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS durable_jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'queued',
      priority INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL DEFAULT '{}',
      checkpoint_json TEXT NOT NULL DEFAULT '{}',
      retry_count INTEGER NOT NULL DEFAULT 0,
      result_json TEXT,
      error TEXT,
      session_id TEXT,
      workspace_id TEXT,
      lease_owner TEXT,
      lease_expires_at TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      risk_tier TEXT NOT NULL,
      physical_tier TEXT,
      requested_action TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'waiting_for_approval',
      job_id TEXT,
      audit_id TEXT,
      requested_at TEXT NOT NULL,
      approved_at TEXT,
      denied_at TEXT,
      cancelled_at TEXT,
      expires_at TEXT,
      result_json TEXT
    );

    CREATE TABLE IF NOT EXISTS job_events (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT 'local-user',
      target TEXT,
      result TEXT NOT NULL DEFAULT 'success',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS artifact_records (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT,
      workspace_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  for (const column of [
    ["checkpoint_json", "TEXT NOT NULL DEFAULT '{}'"],
    ["retry_count", "INTEGER NOT NULL DEFAULT 0"],
    ["result_json", "TEXT"],
    ["error", "TEXT"],
    ["started_at", "TEXT"],
    ["finished_at", "TEXT"],
  ] as const) {
    const existing = sqlite.prepare("PRAGMA table_info(durable_jobs)").all() as Array<{ name: string }>;
    if (!existing.some((entry) => entry.name === column[0])) {
      sqlite.exec(`ALTER TABLE durable_jobs ADD COLUMN ${column[0]} ${column[1]}`);
    }
  }
  schemaEnsured = true;
}

export function seedFoundationDefaults(): void {
  ensureFoundationSchema();
  const timestamp = nowIso();
  const defaultRoots = [
    { id: "root-home", label: "Home directory", rootPath: os.homedir(), source: "system" },
    { id: "root-tools", label: "LocalAI tools", rootPath: toolsRoot(), source: "system" },
    { id: "root-repo", label: "LOCALAI repository", rootPath: REPO_ROOT, source: "system" },
  ];

  const insertRoot = sqlite.prepare(`
    INSERT OR IGNORE INTO workspace_roots
      (id, label, root_path, source, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `);
  for (const root of defaultRoots) {
    insertRoot.run(root.id, root.label, path.resolve(root.rootPath), root.source, timestamp, timestamp);
  }

  const projectRows = sqlite.prepare("SELECT id, name, root_path FROM workspace_registry").all() as Array<{ id: string; name: string; root_path: string }>;
  for (const row of projectRows) {
    if (!row.root_path) continue;
    insertRoot.run(`workspace-${row.id}`, row.name || path.basename(row.root_path), path.resolve(row.root_path), "workspace_registry", timestamp, timestamp);
  }

  const insertPolicy = sqlite.prepare(`
    INSERT OR IGNORE INTO permission_policies
      (id, scope, subject, action, effect, reason, created_at, updated_at)
    VALUES (?, ?, '*', ?, ?, ?, ?, ?)
  `);
  for (const policy of DEFAULT_POLICIES) {
    insertPolicy.run(policy.id, policy.scope, policy.action, policy.effect, policy.reason, timestamp, timestamp);
  }

  sqlite.prepare(`
    INSERT OR IGNORE INTO local_profiles
      (id, scope, name, settings_json, created_at, updated_at)
    VALUES ('default-local', 'local', 'Default Local Profile', '{}', ?, ?)
  `).run(timestamp, timestamp);
}

export function listWorkspaceRoots(): Array<Record<string, unknown>> {
  seedFoundationDefaults();
  return sqlite.prepare(`
    SELECT id, label, root_path AS rootPath, source, enabled, created_at AS createdAt, updated_at AS updatedAt
    FROM workspace_roots
    ORDER BY label ASC
  `).all() as Array<Record<string, unknown>>;
}

export function assertPathAllowed(targetPath: string, scope: "file.read" | "file.write"): PermissionDecision {
  seedFoundationDefaults();
  const roots = sqlite.prepare("SELECT root_path FROM workspace_roots WHERE enabled = 1").all() as Array<{ root_path: string }>;
  const matched = roots.some((root) => isInsidePath(targetPath, root.root_path));
  if (!matched) {
    const decision: PermissionDecision = {
      allowed: false,
      scope,
      action: targetPath,
      reason: `Path is outside approved workspace roots: ${targetPath}`,
    };
    recordPermissionDecision(decision);
    return decision;
  }
  const decision = evaluatePermission(scope, targetPath);
  recordPermissionDecision(decision);
  return decision;
}

export function evaluatePermission(scope: PermissionScope, action = "*", subject = "local-user"): PermissionDecision {
  seedFoundationDefaults();
  const row = sqlite.prepare(`
    SELECT effect, reason FROM permission_policies
    WHERE scope = ?
      AND (subject = ? OR subject = '*')
      AND (action = ? OR action = '*')
    ORDER BY
      CASE WHEN subject = ? THEN 0 ELSE 1 END,
      CASE WHEN action = ? THEN 0 ELSE 1 END,
      updated_at DESC
    LIMIT 1
  `).get(scope, subject, action, subject, action) as { effect: string; reason?: string } | undefined;

  if (!row) {
    return { allowed: false, scope, action, reason: `No permission policy allows ${scope}` };
  }
  return {
    allowed: row.effect !== "deny",
    scope,
    action,
    reason: row.reason || (row.effect === "deny" ? "Denied by policy" : "Allowed by policy"),
  };
}

export function recordPermissionDecision(decision: PermissionDecision): void {
  recordAuditEvent({
    eventType: "permission_decision",
    action: decision.action,
    target: decision.scope,
    result: decision.allowed ? "success" : "blocked",
    metadata: { reason: decision.reason },
  });
}

export function recordAuditEvent(input: AuditEventInput): string {
  const id = randomUUID();
  sqlite.prepare(`
    INSERT INTO audit_events
      (id, event_type, action, actor, target, result, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.eventType,
    input.action,
    input.actor ?? "local-user",
    input.target ?? null,
    input.result ?? "success",
    JSON.stringify(input.metadata ?? {}),
    nowIso(),
  );
  return id;
}

export function listAuditEvents(limit = 100): Array<Record<string, unknown>> {
  return (sqlite.prepare(`
    SELECT id, event_type AS eventType, action, actor, target, result,
           metadata_json AS metadataJson, created_at AS createdAt
    FROM audit_events
    ORDER BY created_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(limit, 500))) as Array<Record<string, unknown>>)
    .map((row) => ({ ...row, metadata: parseJson(row["metadataJson"]) }));
}

export function createDurableJob(input: DurableJobInput): DurableJob {
  seedFoundationDefaults();
  const id = randomUUID();
  const timestamp = nowIso();
  const payload = input.payload ?? {};
  const state = input.state ?? "queued";
  sqlite.prepare(`
    INSERT INTO durable_jobs
      (id, kind, state, priority, payload_json, checkpoint_json, retry_count,
       result_json, error, session_id, workspace_id, lease_owner, lease_expires_at,
       started_at, finished_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?, NULL, NULL, NULL, NULL, ?, ?)
  `).run(
    id,
    input.kind,
    state,
    input.priority ?? 0,
    JSON.stringify(payload),
    JSON.stringify(input.checkpoint ?? {}),
    input.sessionId ?? null,
    input.workspaceId ?? null,
    timestamp,
    timestamp,
  );
  appendJobEvent(id, state, `${state === "waiting_for_approval" ? "Waiting for approval" : "Queued"} ${input.kind}`, { priority: input.priority ?? 0 });
  recordAuditEvent({ eventType: "job", action: "create", target: id, metadata: { kind: input.kind } });
  return getDurableJob(id)!;
}

export function appendJobEvent(jobId: string, eventType: string, message: string, metadata: Record<string, unknown> = {}): string {
  const id = randomUUID();
  sqlite.prepare(`
    INSERT INTO job_events
      (id, job_id, event_type, message, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, jobId, eventType, message, JSON.stringify(metadata), nowIso());
  return id;
}

function rowToDurableJob(row: Record<string, unknown>): DurableJob {
  return {
    id: row["id"] as string,
    kind: row["kind"] as string,
    state: row["state"] as DurableJobState,
    priority: row["priority"] as number,
    payload: parseJson(row["payload_json"]),
    checkpoint: parseJson(row["checkpoint_json"]),
    retryCount: Number(row["retry_count"] ?? 0),
    result: row["result_json"] ? parseJson(row["result_json"]) : undefined,
    error: (row["error"] as string | null) ?? undefined,
    sessionId: (row["session_id"] as string | null) ?? undefined,
    workspaceId: (row["workspace_id"] as string | null) ?? undefined,
    leaseOwner: (row["lease_owner"] as string | null) ?? undefined,
    leaseExpiresAt: (row["lease_expires_at"] as string | null) ?? undefined,
    startedAt: (row["started_at"] as string | null) ?? undefined,
    finishedAt: (row["finished_at"] as string | null) ?? undefined,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

export function getDurableJob(id: string): DurableJob | null {
  const row = sqlite.prepare("SELECT * FROM durable_jobs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToDurableJob(row) : null;
}

export function listDurableJobs(limit = 100): DurableJob[] {
  return (sqlite.prepare(`
    SELECT * FROM durable_jobs
    ORDER BY created_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(limit, 500))) as Array<Record<string, unknown>>)
    .map(rowToDurableJob);
}

export function updateDurableJobState(
  jobId: string,
  state: DurableJobState,
  options: {
    message?: string;
    checkpoint?: Record<string, unknown>;
    result?: Record<string, unknown>;
    error?: string;
    leaseOwner?: string | null;
    leaseExpiresAt?: string | null;
    incrementRetry?: boolean;
  } = {},
): DurableJob | null {
  seedFoundationDefaults();
  const current = getDurableJob(jobId);
  if (!current) return null;
  const timestamp = nowIso();
  const startedAt = state === "running" && !current.startedAt ? timestamp : current.startedAt ?? null;
  const finishedAt = ["completed", "failed", "cancelled"].includes(state) ? timestamp : current.finishedAt ?? null;
  sqlite.prepare(`
    UPDATE durable_jobs
    SET state = ?,
        checkpoint_json = ?,
        retry_count = retry_count + ?,
        result_json = ?,
        error = ?,
        lease_owner = ?,
        lease_expires_at = ?,
        started_at = ?,
        finished_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    state,
    JSON.stringify(options.checkpoint ?? current.checkpoint ?? {}),
    options.incrementRetry ? 1 : 0,
    options.result ? JSON.stringify(options.result) : current.result ? JSON.stringify(current.result) : null,
    options.error ?? current.error ?? null,
    options.leaseOwner === undefined ? current.leaseOwner ?? null : options.leaseOwner,
    options.leaseExpiresAt === undefined ? current.leaseExpiresAt ?? null : options.leaseExpiresAt,
    startedAt,
    finishedAt,
    timestamp,
    jobId,
  );
  appendJobEvent(jobId, state, options.message ?? `Job ${state}`, {
    state,
    error: options.error,
  });
  recordAuditEvent({
    eventType: "job",
    action: state,
    target: jobId,
    result: state === "failed" || state === "cancelled" ? "failed" : "success",
    metadata: { kind: current.kind, error: options.error },
  });
  return getDurableJob(jobId);
}

export function pauseDurableJob(jobId: string, reason = "Paused by user"): DurableJob | null {
  const job = getDurableJob(jobId);
  if (!job || !["queued", "running", "waiting_for_approval"].includes(job.state)) return null;
  return updateDurableJobState(jobId, "paused", { message: reason });
}

export function resumeDurableJob(jobId: string, reason = "Resumed by user"): DurableJob | null {
  const job = getDurableJob(jobId);
  if (!job || job.state !== "paused") return null;
  const state: DurableJobState = job.kind.startsWith("approval.") ? "waiting_for_approval" : "queued";
  return updateDurableJobState(jobId, state, { message: reason });
}

export function cancelDurableJob(jobId: string, reason = "Cancelled by user"): DurableJob | null {
  const job = getDurableJob(jobId);
  if (!job || ["completed", "failed", "cancelled"].includes(job.state)) return null;
  return updateDurableJobState(jobId, "cancelled", { message: reason, error: reason });
}

export function listJobEvents(jobId: string): Array<Record<string, unknown>> {
  return (sqlite.prepare(`
    SELECT id, job_id AS jobId, event_type AS eventType, message,
           metadata_json AS metadataJson, created_at AS createdAt
    FROM job_events
    WHERE job_id = ?
    ORDER BY created_at ASC
  `).all(jobId) as Array<Record<string, unknown>>)
    .map((row) => ({ ...row, metadata: parseJson(row["metadataJson"]) }));
}

export function leaseNextJob(owner: string, leaseMs = 60_000): DurableJob | null {
  seedFoundationDefaults();
  const row = sqlite.prepare(`
    SELECT * FROM durable_jobs
    WHERE state = 'queued'
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
  `).get() as Record<string, unknown> | undefined;
  if (!row) return null;
  const leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
  const updatedAt = nowIso();
  sqlite.prepare(`
    UPDATE durable_jobs
    SET state = 'running', lease_owner = ?, lease_expires_at = ?, started_at = COALESCE(started_at, ?), updated_at = ?
    WHERE id = ? AND state = 'queued'
  `).run(owner, leaseExpiresAt, updatedAt, updatedAt, row["id"]);
  appendJobEvent(row["id"] as string, "running", `Leased by ${owner}`, { leaseExpiresAt });
  return getDurableJob(row["id"] as string);
}

export function hydrateDurableJobsForRestart(): { requeued: number; failed: number } {
  seedFoundationDefaults();
  const timestamp = nowIso();
  const runningRows = sqlite.prepare(`
    SELECT id, kind FROM durable_jobs
    WHERE state = 'running'
  `).all() as Array<{ id: string; kind: string }>;
  for (const row of runningRows) {
    sqlite.prepare(`
      UPDATE durable_jobs
      SET state = 'queued',
          retry_count = retry_count + 1,
          lease_owner = NULL,
          lease_expires_at = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(timestamp, row.id);
    appendJobEvent(row.id, "queued", "Re-queued after API restart", { previousState: "running", kind: row.kind });
    recordAuditEvent({ eventType: "job", action: "restart_requeue", target: row.id, metadata: { kind: row.kind } });
  }
  const expiredApprovals = sqlite.prepare(`
    SELECT id, kind FROM durable_jobs
    WHERE state = 'waiting_for_approval'
      AND json_extract(payload_json, '$.expiresAt') IS NOT NULL
      AND json_extract(payload_json, '$.expiresAt') < ?
  `).all(timestamp) as Array<{ id: string; kind: string }>;
  for (const row of expiredApprovals) {
    updateDurableJobState(row.id, "cancelled", { message: "Approval expired during restart hydration", error: "Approval expired" });
  }
  return { requeued: runningRows.length, failed: expiredApprovals.length };
}

export function upsertIntegrationState(id: string, state: Record<string, unknown>): void {
  seedFoundationDefaults();
  const timestamp = nowIso();
  sqlite.prepare(`
    INSERT INTO integration_state
      (id, state_json, installed, running, pinned, last_checked_at, last_error, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      state_json = excluded.state_json,
      installed = excluded.installed,
      running = excluded.running,
      pinned = excluded.pinned,
      last_checked_at = excluded.last_checked_at,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at
  `).run(
    id,
    JSON.stringify(state),
    state["installed"] === true ? 1 : 0,
    state["running"] === true ? 1 : 0,
    state["pinned"] === true ? 1 : 0,
    state["lastCheckedAt"] ?? timestamp,
    typeof state["lastError"] === "string" ? state["lastError"] : null,
    timestamp,
  );
}

export function upsertPluginState(id: string, state: Record<string, unknown>): void {
  seedFoundationDefaults();
  const timestamp = nowIso();
  sqlite.prepare(`
    INSERT INTO plugin_state
      (id, enabled, installed, permissions_json, state_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      enabled = excluded.enabled,
      installed = excluded.installed,
      permissions_json = excluded.permissions_json,
      state_json = excluded.state_json,
      updated_at = excluded.updated_at
  `).run(
    id,
    state["enabled"] === false ? 0 : 1,
    state["installed"] === true ? 1 : 0,
    JSON.stringify(state["permissions"] ?? {}),
    JSON.stringify(state),
    timestamp,
  );
}

export function createArtifactRecord(input: { kind: string; name: string; path?: string; workspaceId?: string; metadata?: Record<string, unknown> }): string {
  const id = randomUUID();
  const timestamp = nowIso();
  sqlite.prepare(`
    INSERT INTO artifact_records
      (id, kind, name, path, workspace_id, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.kind, input.name, input.path ?? null, input.workspaceId ?? null, JSON.stringify(input.metadata ?? {}), timestamp, timestamp);
  recordAuditEvent({ eventType: "artifact", action: "create", target: id, metadata: { kind: input.kind, name: input.name } });
  return id;
}

export function getFoundationSummary(): Record<string, unknown> {
  seedFoundationDefaults();
  const scalar = (sql: string) => (sqlite.prepare(sql).get() as { count: number }).count;
  return {
    workspaceRoots: scalar("SELECT COUNT(*) AS count FROM workspace_roots"),
    permissionPolicies: scalar("SELECT COUNT(*) AS count FROM permission_policies"),
    approvalRequests: scalar("SELECT COUNT(*) AS count FROM approval_requests"),
    durableJobs: scalar("SELECT COUNT(*) AS count FROM durable_jobs"),
    jobEvents: scalar("SELECT COUNT(*) AS count FROM job_events"),
    auditEvents: scalar("SELECT COUNT(*) AS count FROM audit_events"),
    artifacts: scalar("SELECT COUNT(*) AS count FROM artifact_records"),
  };
}
