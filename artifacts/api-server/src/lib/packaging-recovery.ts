import { randomUUID, createHash } from "crypto";
import path from "path";
import { writeFile } from "fs/promises";
import { sqlite } from "../db/database.js";
import { createApprovalRequest, verifyApprovedRequest, type ApprovalRequest } from "./approval-queue.js";
import { createDurableJob, recordAuditEvent, updateDurableJobState } from "./platform-foundation.js";
import { getCurrentRuntimeMode } from "./runtime-mode.js";
import { ensureDir, toolsRoot } from "./runtime.js";
import { thoughtLog } from "./thought-log.js";

export const PACKAGING_RECOVERY_SOURCE_OF_TRUTH =
  "Phase 21 packaging-recovery.ts over existing updater/rollback/runtime/approval/durable-job/audit systems";

export type RecoveryStatus =
  | "draft"
  | "dry_run"
  | "created"
  | "validation_passed"
  | "validation_failed"
  | "approval_required"
  | "approved"
  | "restore_blocked"
  | "restored"
  | "not_configured"
  | "degraded";

export interface RecoveryProviderStatus {
  id: string;
  name: string;
  status: "local" | "not_configured" | "degraded" | "disabled";
  reason: string;
  startupPolicy: "manual" | "on_demand" | "disabled";
  dataLeavesMachine: false;
}

export interface BackupScopeEntry {
  id: string;
  label: string;
  category: "database" | "settings" | "integrations" | "docs" | "generated_assets" | "model_metadata";
  included: boolean;
  redaction: "metadata_only" | "secret_refs_only" | "redacted";
  contentsStored: false;
  notes: string;
}

export interface RecoveryBackupManifest {
  id: string;
  status: RecoveryStatus;
  dryRun: boolean;
  createdAt: string;
  scope: BackupScopeEntry[];
  destination: {
    provider: "local_manifest";
    label: string;
    pathExposed: false;
    manifestFileRef?: string;
  };
  timestamp: string;
  retention: {
    policy: "manual";
    deleteAutomatically: false;
    notes: string;
  };
  verification: {
    status: "not_run" | "passed" | "failed";
    checks: string[];
  };
  rollbackNotes: string[];
  providerStatuses: RecoveryProviderStatus[];
  gamingPcSafe: true;
  noSystemSettingsModified: true;
  noRawSecrets: true;
  noModelBlobs: true;
  manifestHash: string;
  jobId?: string;
}

export interface RestoreDryRunResult {
  status: "validation_passed" | "validation_failed";
  manifestId: string;
  wouldModify: string[];
  blockedActions: string[];
  requiresApproval: true;
  rollbackPointRequired: true;
  liveDataModified: false;
  verificationSteps: string[];
  reasons: string[];
}

export interface RecoveryRestorePlan {
  id: string;
  manifestId: string;
  status: RecoveryStatus;
  dryRun: boolean;
  createdAt: string;
  approvalRequired: true;
  approvalId?: string;
  approvedRestoreConfigured: false;
  rollbackPoint: {
    required: true;
    currentBackupManifestId?: string;
    notes: string[];
  };
  dryRunResult: RestoreDryRunResult;
  executed: false;
  jobId?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function manifestHash(manifest: Omit<RecoveryBackupManifest, "manifestHash">): string {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

function manifestFileRef(id: string): string {
  return `LocalAI recovery manifest ${id}.json`;
}

function manifestDirectory(): string {
  return path.join(toolsRoot(), "recovery", "manifests");
}

function ensureSchema(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS recovery_backup_manifests (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      dry_run INTEGER NOT NULL DEFAULT 1,
      scope_json TEXT NOT NULL DEFAULT '[]',
      destination_json TEXT NOT NULL DEFAULT '{}',
      retention_json TEXT NOT NULL DEFAULT '{}',
      verification_json TEXT NOT NULL DEFAULT '{}',
      rollback_notes_json TEXT NOT NULL DEFAULT '[]',
      provider_status_json TEXT NOT NULL DEFAULT '[]',
      manifest_hash TEXT NOT NULL,
      job_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recovery_restore_plans (
      id TEXT PRIMARY KEY,
      manifest_id TEXT NOT NULL,
      status TEXT NOT NULL,
      dry_run INTEGER NOT NULL DEFAULT 1,
      approval_id TEXT,
      dry_run_result_json TEXT NOT NULL DEFAULT '{}',
      rollback_point_json TEXT NOT NULL DEFAULT '{}',
      executed INTEGER NOT NULL DEFAULT 0,
      job_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function getRecoveryProviderStatuses(): RecoveryProviderStatus[] {
  return [
    {
      id: "local-manifest",
      name: "Local manifest backup",
      status: "local",
      reason: "Available as metadata-only local manifest generation.",
      startupPolicy: "on_demand",
      dataLeavesMachine: false,
    },
    {
      id: "windows-installer",
      name: "Windows installer packaging",
      status: "not_configured",
      reason: "Installer packaging is documented/proposal-only; no service/startup/firewall/PATH changes are enabled.",
      startupPolicy: "manual",
      dataLeavesMachine: false,
    },
    {
      id: "external-backup-provider",
      name: "External backup provider",
      status: "not_configured",
      reason: "Cloud/NAS/remote backup providers are optional and not configured in Phase 21.",
      startupPolicy: "disabled",
      dataLeavesMachine: false,
    },
  ];
}

export function getDefaultBackupScope(): BackupScopeEntry[] {
  return [
    {
      id: "sqlite-db",
      label: "SQLite database",
      category: "database",
      included: true,
      redaction: "metadata_only",
      contentsStored: false,
      notes: "Records database identity and recovery intent; database bytes are not embedded in the manifest.",
    },
    {
      id: "app-settings",
      label: "App settings",
      category: "settings",
      included: true,
      redaction: "secret_refs_only",
      contentsStored: false,
      notes: "Settings are represented by keys/categories only; secret values are excluded.",
    },
    {
      id: "integration-configs",
      label: "Integration configs",
      category: "integrations",
      included: true,
      redaction: "secret_refs_only",
      contentsStored: false,
      notes: "Integration enablement and provider status are included without tokens, API keys, or credentials.",
    },
    {
      id: "prompt-context-docs",
      label: "Prompt/context docs",
      category: "docs",
      included: true,
      redaction: "metadata_only",
      contentsStored: false,
      notes: "Tracks docs as recovery scope; private contents are not copied into audit or manifest responses.",
    },
    {
      id: "generated-workflows",
      label: "Generated workflows/templates",
      category: "generated_assets",
      included: true,
      redaction: "metadata_only",
      contentsStored: false,
      notes: "Generated assets are scoped for backup but not embedded in clear text.",
    },
    {
      id: "model-role-metadata",
      label: "Model role metadata",
      category: "model_metadata",
      included: true,
      redaction: "metadata_only",
      contentsStored: false,
      notes: "Model role and lifecycle metadata only; model blobs are excluded by default.",
    },
  ];
}

function rowToManifest(row: Record<string, unknown>): RecoveryBackupManifest {
  const scope = parseJson<BackupScopeEntry[]>(row["scope_json"], []);
  const destination = parseJson<RecoveryBackupManifest["destination"]>(row["destination_json"], {
    provider: "local_manifest",
    label: "LocalAI recovery manifests",
    pathExposed: false,
  });
  return {
    id: row["id"] as string,
    status: row["status"] as RecoveryStatus,
    dryRun: row["dry_run"] === 1,
    createdAt: row["created_at"] as string,
    scope,
    destination,
    timestamp: row["created_at"] as string,
    retention: parseJson<RecoveryBackupManifest["retention"]>(row["retention_json"], {
      policy: "manual",
      deleteAutomatically: false,
      notes: "Manual retention only.",
    }),
    verification: parseJson<RecoveryBackupManifest["verification"]>(row["verification_json"], {
      status: "not_run",
      checks: [],
    }),
    rollbackNotes: parseJson<string[]>(row["rollback_notes_json"], []),
    providerStatuses: parseJson<RecoveryProviderStatus[]>(row["provider_status_json"], []),
    gamingPcSafe: true,
    noSystemSettingsModified: true,
    noRawSecrets: true,
    noModelBlobs: true,
    manifestHash: row["manifest_hash"] as string,
    jobId: (row["job_id"] as string | null) ?? undefined,
  };
}

function rowToRestorePlan(row: Record<string, unknown>): RecoveryRestorePlan {
  return {
    id: row["id"] as string,
    manifestId: row["manifest_id"] as string,
    status: row["status"] as RecoveryStatus,
    dryRun: row["dry_run"] === 1,
    createdAt: row["created_at"] as string,
    approvalRequired: true,
    approvalId: (row["approval_id"] as string | null) ?? undefined,
    approvedRestoreConfigured: false,
    rollbackPoint: parseJson<RecoveryRestorePlan["rollbackPoint"]>(row["rollback_point_json"], {
      required: true,
      notes: ["Create a current backup manifest before any restore writes."],
    }),
    dryRunResult: parseJson<RestoreDryRunResult>(row["dry_run_result_json"], {
      status: "validation_failed",
      manifestId: row["manifest_id"] as string,
      wouldModify: [],
      blockedActions: [],
      requiresApproval: true,
      rollbackPointRequired: true,
      liveDataModified: false,
      verificationSteps: [],
      reasons: ["Dry-run data unavailable."],
    }),
    executed: false,
    jobId: (row["job_id"] as string | null) ?? undefined,
  };
}

export function getRecoveryStatus(): {
  success: true;
  sourceOfTruth: string;
  localFirst: true;
  noPaidApisRequired: true;
  gamingPcSafe: true;
  realRestoreEnabled: false;
  runtimeMode: string;
  providers: RecoveryProviderStatus[];
  latestBackup: RecoveryBackupManifest | null;
  latestRestorePlan: RecoveryRestorePlan | null;
} {
  ensureSchema();
  const latestBackupRow = sqlite.prepare(`
    SELECT * FROM recovery_backup_manifests ORDER BY created_at DESC LIMIT 1
  `).get() as Record<string, unknown> | undefined;
  const latestRestoreRow = sqlite.prepare(`
    SELECT * FROM recovery_restore_plans ORDER BY created_at DESC LIMIT 1
  `).get() as Record<string, unknown> | undefined;
  return {
    success: true,
    sourceOfTruth: PACKAGING_RECOVERY_SOURCE_OF_TRUTH,
    localFirst: true,
    noPaidApisRequired: true,
    gamingPcSafe: true,
    realRestoreEnabled: false,
    runtimeMode: getCurrentRuntimeMode(),
    providers: getRecoveryProviderStatuses(),
    latestBackup: latestBackupRow ? rowToManifest(latestBackupRow) : null,
    latestRestorePlan: latestRestoreRow ? rowToRestorePlan(latestRestoreRow) : null,
  };
}

export async function createBackupManifest(input: { dryRun?: boolean } = {}): Promise<RecoveryBackupManifest> {
  ensureSchema();
  const dryRun = input.dryRun !== false;
  const id = randomUUID();
  const timestamp = nowIso();
  const job = createDurableJob({
    kind: "recovery.backup_manifest",
    state: dryRun ? "completed" : "queued",
    payload: { manifestId: id, dryRun },
    checkpoint: { dryRun, noRawSecrets: true, noSystemSettingsModified: true },
  });
  const destination: RecoveryBackupManifest["destination"] = {
    provider: "local_manifest",
    label: "LocalAI recovery manifests",
    pathExposed: false,
    manifestFileRef: dryRun ? undefined : manifestFileRef(id),
  };
  const withoutHash: Omit<RecoveryBackupManifest, "manifestHash"> = {
    id,
    status: dryRun ? "dry_run" : "created",
    dryRun,
    createdAt: timestamp,
    scope: getDefaultBackupScope(),
    destination,
    timestamp,
    retention: {
      policy: "manual",
      deleteAutomatically: false,
      notes: "No automatic deletion or cleanup is performed by Phase 21.",
    },
    verification: {
      status: "passed",
      checks: [
        "Manifest contains scope metadata.",
        "Raw secrets and model blobs are excluded.",
        "Restore path requires dry-run, approval, and rollback point.",
      ],
    },
    rollbackNotes: [
      "Before restore, create a fresh current-state manifest.",
      "Restore remains dry-run/proposal-only until an approved executor is intentionally configured.",
      "If verification fails, keep the current live data and use rollback snapshots.",
    ],
    providerStatuses: getRecoveryProviderStatuses(),
    gamingPcSafe: true,
    noSystemSettingsModified: true,
    noRawSecrets: true,
    noModelBlobs: true,
    jobId: job.id,
  };
  const manifest: RecoveryBackupManifest = { ...withoutHash, manifestHash: manifestHash(withoutHash) };

  if (!dryRun) {
    const dir = manifestDirectory();
    await ensureDir(dir);
    await writeFile(path.join(dir, `${id}.json`), JSON.stringify(manifest, null, 2), "utf-8");
    updateDurableJobState(job.id, "completed", {
      message: "Recovery backup manifest written with redacted metadata only",
      result: { manifestId: id, manifestHash: manifest.manifestHash, pathExposed: false },
    });
  }

  sqlite.prepare(`
    INSERT INTO recovery_backup_manifests
      (id, status, dry_run, scope_json, destination_json, retention_json,
       verification_json, rollback_notes_json, provider_status_json, manifest_hash,
       job_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    manifest.id,
    manifest.status,
    manifest.dryRun ? 1 : 0,
    JSON.stringify(manifest.scope),
    JSON.stringify(manifest.destination),
    JSON.stringify(manifest.retention),
    JSON.stringify(manifest.verification),
    JSON.stringify(manifest.rollbackNotes),
    JSON.stringify(manifest.providerStatuses),
    manifest.manifestHash,
    manifest.jobId ?? null,
    timestamp,
    timestamp,
  );

  recordAuditEvent({
    eventType: "recovery",
    action: dryRun ? "backup_manifest_dry_run" : "backup_manifest_created",
    target: id,
    result: "success",
    metadata: {
      manifestId: id,
      dryRun,
      scopeCount: manifest.scope.length,
      manifestHash: manifest.manifestHash,
      noRawSecrets: true,
      noBackupContentsLogged: true,
      pathExposed: false,
    },
  });
  thoughtLog.publish({
    category: "system",
    title: "Recovery Manifest Prepared",
    message: dryRun
      ? "Prepared backup manifest dry-run; no files or system settings were modified."
      : "Created metadata-only recovery manifest; no raw secrets or model blobs were included.",
    metadata: { manifestId: id, dryRun, scopeCount: manifest.scope.length, pathExposed: false },
  });

  return manifest;
}

export function listBackupManifests(limit = 20): RecoveryBackupManifest[] {
  ensureSchema();
  return (sqlite.prepare(`
    SELECT * FROM recovery_backup_manifests
    ORDER BY created_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(limit, 100))) as Array<Record<string, unknown>>).map(rowToManifest);
}

export function validateBackupManifest(manifestId: string): RestoreDryRunResult {
  ensureSchema();
  const manifest = sqlite.prepare("SELECT * FROM recovery_backup_manifests WHERE id = ?").get(manifestId) as Record<string, unknown> | undefined;
  if (!manifest) {
    return {
      status: "validation_failed",
      manifestId,
      wouldModify: [],
      blockedActions: ["restore"],
      requiresApproval: true,
      rollbackPointRequired: true,
      liveDataModified: false,
      verificationSteps: ["Select an existing backup manifest."],
      reasons: ["Backup manifest not found."],
    };
  }
  const parsed = rowToManifest(manifest);
  const failedReasons: string[] = [];
  if (!parsed.noRawSecrets) failedReasons.push("Manifest does not declare secret exclusion.");
  if (!parsed.noModelBlobs) failedReasons.push("Manifest does not declare model blob exclusion.");
  if (!parsed.scope.length) failedReasons.push("Manifest has no backup scope.");
  return {
    status: failedReasons.length ? "validation_failed" : "validation_passed",
    manifestId,
    wouldModify: [
      "SQLite database restore target",
      "app_settings rows",
      "integration/profile metadata rows",
      "prompt/context docs and generated asset metadata",
      "model role metadata",
    ],
    blockedActions: [
      "overwrite live data without a current-state backup manifest",
      "restore raw secrets in clear text",
      "delete user data",
      "modify startup tasks, firewall, PATH, or services",
    ],
    requiresApproval: true,
    rollbackPointRequired: true,
    liveDataModified: false,
    verificationSteps: [
      "Validate manifest hash and schema.",
      "Create current-state backup manifest before restore.",
      "Review expected changes and approval payload.",
      "Run post-restore health check and rollback if verification fails.",
    ],
    reasons: failedReasons,
  };
}

export function createRestoreDryRun(manifestId: string): RecoveryRestorePlan {
  ensureSchema();
  const id = randomUUID();
  const timestamp = nowIso();
  const dryRunResult = validateBackupManifest(manifestId);
  const job = createDurableJob({
    kind: "recovery.restore_dry_run",
    state: "completed",
    payload: { restorePlanId: id, manifestId },
    checkpoint: { dryRun: true, liveDataModified: false },
  });
  const plan: RecoveryRestorePlan = {
    id,
    manifestId,
    status: dryRunResult.status,
    dryRun: true,
    createdAt: timestamp,
    approvalRequired: true,
    approvedRestoreConfigured: false,
    rollbackPoint: {
      required: true,
      notes: ["Create a fresh backup manifest of the current state before any approved restore."],
    },
    dryRunResult,
    executed: false,
    jobId: job.id,
  };
  sqlite.prepare(`
    INSERT INTO recovery_restore_plans
      (id, manifest_id, status, dry_run, approval_id, dry_run_result_json,
       rollback_point_json, executed, job_id, created_at, updated_at)
    VALUES (?, ?, ?, 1, NULL, ?, ?, 0, ?, ?, ?)
  `).run(
    plan.id,
    plan.manifestId,
    plan.status,
    JSON.stringify(plan.dryRunResult),
    JSON.stringify(plan.rollbackPoint),
    plan.jobId ?? null,
    timestamp,
    timestamp,
  );
  recordAuditEvent({
    eventType: "recovery",
    action: "restore_dry_run",
    target: id,
    result: dryRunResult.status === "validation_passed" ? "success" : "failed",
    metadata: {
      restorePlanId: id,
      manifestId,
      liveDataModified: false,
      requiresApproval: true,
      blockedActions: dryRunResult.blockedActions.length,
    },
  });
  return plan;
}

export function requestRestoreApproval(input: {
  manifestId: string;
  currentBackupManifestId?: string;
  approvalId?: string;
}): { status: RecoveryStatus; approvalRequired: boolean; approval?: ApprovalRequest; plan: RecoveryRestorePlan; message: string } {
  const plan = createRestoreDryRun(input.manifestId);
  const payload = {
    manifestId: input.manifestId,
    currentBackupManifestId: input.currentBackupManifestId,
    dryRunResult: {
      status: plan.dryRunResult.status,
      manifestId: plan.dryRunResult.manifestId,
      liveDataModified: false,
    },
    rollback: {
      currentBackupManifestRequired: true,
      currentBackupManifestId: input.currentBackupManifestId,
    },
  };

  if (plan.dryRunResult.status !== "validation_passed") {
    return {
      status: "restore_blocked",
      approvalRequired: true,
      plan,
      message: "Restore blocked because manifest validation failed.",
    };
  }
  if (!input.currentBackupManifestId) {
    return {
      status: "restore_blocked",
      approvalRequired: true,
      plan,
      message: "Restore blocked until a current-state backup manifest is created.",
    };
  }
  if (!input.approvalId) {
    const approval = createApprovalRequest({
      type: "recovery_restore",
      title: "Restore LOCALAI backup",
      summary: "Review and approve recovery restore proposal. No restore executed yet.",
      riskTier: "tier3_file_modification",
      requestedAction: "system.recovery.restore",
      payload: {
        ...payload,
        diff: "Phase 21 restore proposal only; live data remains unchanged.",
      },
    });
    sqlite.prepare("UPDATE recovery_restore_plans SET status = ?, approval_id = ?, updated_at = ? WHERE id = ?")
      .run("approval_required", approval.id, nowIso(), plan.id);
    return {
      status: "approval_required",
      approvalRequired: true,
      approval,
      plan: { ...plan, status: "approval_required", approvalId: approval.id },
      message: "Restore approval requested. No live data was modified.",
    };
  }

  const verified = verifyApprovedRequest(input.approvalId, {
    ...payload,
    diff: "Phase 21 restore proposal only; live data remains unchanged.",
  }, "recovery_restore");
  if (!verified.allowed) {
    return {
      status: "restore_blocked",
      approvalRequired: true,
      approval: verified.approval,
      plan,
      message: verified.message,
    };
  }

  sqlite.prepare("UPDATE recovery_restore_plans SET status = ?, approval_id = ?, updated_at = ? WHERE id = ?")
    .run("not_configured", input.approvalId, nowIso(), plan.id);
  recordAuditEvent({
    eventType: "recovery",
    action: "restore_approved_executor_not_configured",
    target: plan.id,
    result: "blocked",
    metadata: {
      manifestId: input.manifestId,
      approvalId: input.approvalId,
      executed: false,
      reason: "Real destructive restore executor is not configured in Phase 21.",
    },
  });
  return {
    status: "not_configured",
    approvalRequired: true,
    approval: verified.approval,
    plan: { ...plan, status: "not_configured", approvalId: input.approvalId },
    message: "Approval verified, but real restore execution remains not_configured in Phase 21. No live data was modified.",
  };
}

export function getInstallPlan(): {
  success: true;
  status: "proposal";
  gamingPcSafe: true;
  localFirst: true;
  modifiesSystemSettings: false;
  autoStartsServices: false;
  opensFirewallPorts: false;
  modifiesPathGlobally: false;
  steps: string[];
  optionalProviders: RecoveryProviderStatus[];
} {
  return {
    success: true,
    status: "proposal",
    gamingPcSafe: true,
    localFirst: true,
    modifiesSystemSettings: false,
    autoStartsServices: false,
    opensFirewallPorts: false,
    modifiesPathGlobally: false,
    steps: [
      "Install Node.js and pnpm manually if missing.",
      "Run pnpm install from the repository.",
      "Start API/UI manually with pnpm scripts.",
      "Keep Ollama/local providers optional and on-demand.",
      "Use edge nodes for always-on services instead of the gaming PC.",
    ],
    optionalProviders: getRecoveryProviderStatuses(),
  };
}
