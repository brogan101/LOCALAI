import { createHash, randomUUID } from "crypto";
import { sqlite } from "../db/database.js";
import { createApprovalRequest, verifyApprovedRequest, type ApprovalRequest } from "./approval-queue.js";
import { isDangerousCommand } from "./command-sanitizer.js";
import { recordAuditEvent, seedFoundationDefaults } from "./platform-foundation.js";
import { thoughtLog } from "./thought-log.js";

export const IT_SUPPORT_SOURCE_OF_TRUTH =
  "Phase 12B it-support.ts backed by SQLite it_support_artifacts, approval_requests, durable_jobs, audit_events, mission replay redaction, command-sanitizer, and existing system exec safety gates.";

export type ItSupportWorkflowType =
  | "diagnose_windows_issue"
  | "summarize_event_logs"
  | "generate_powershell_script"
  | "onboarding_checklist"
  | "offboarding_checklist"
  | "fortinet_helper_notes"
  | "ivanti_deployment_script_helper"
  | "exchange_365_troubleshooting_checklist";

export type ItSupportArtifactStatus = "draft" | "review_required" | "approval_pending" | "blocked" | "not_configured";
export type ItSupportExecutionMode = "review" | "dry_run" | "execute";
export type ItIntegrationStatus = "not_configured" | "degraded" | "disabled";

export interface ItSupportSafetyContract {
  purpose: string;
  adminRequired: boolean;
  reads: string[];
  changes: string[];
  risks: string[];
  backupRestorePlan: string;
  loggingPath: string;
  dryRunBehavior: string;
  exitCodes: Array<{ code: number; meaning: string }>;
  proofSteps: string[];
}

export interface ItSupportArtifact {
  id: string;
  workflowType: ItSupportWorkflowType;
  status: ItSupportArtifactStatus;
  title: string;
  requestSummary: string;
  scriptLanguage?: "powershell";
  scriptBody: string;
  safetyContract: ItSupportSafetyContract;
  integrationStatus: Array<{ id: string; name: string; status: ItIntegrationStatus; reason: string }>;
  approvalId?: string;
  executionMode: ItSupportExecutionMode;
  commandPreview: string;
  outputPreview: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateItSupportArtifactInput {
  workflowType: ItSupportWorkflowType;
  request: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface ItSupportActionResult {
  success: boolean;
  status: "draft" | "review" | "approval_required" | "blocked" | "not_configured";
  executed: false;
  message: string;
  artifact?: ItSupportArtifact;
  approvalRequired: boolean;
  approval?: ApprovalRequest;
  validation?: ScriptValidationResult;
}

export interface ScriptValidationResult {
  valid: boolean;
  missingFields: string[];
  blocked: boolean;
  riskTier: "tier1_draft_only" | "tier2_safe_local_execute" | "tier3_file_modification" | "tier5_manual_only_prohibited";
  reasons: string[];
}

const WORKFLOW_LABELS: Record<ItSupportWorkflowType, string> = {
  diagnose_windows_issue: "Diagnose Windows Issue",
  summarize_event_logs: "Summarize Event Logs",
  generate_powershell_script: "Generate PowerShell Script",
  onboarding_checklist: "Onboarding Checklist",
  offboarding_checklist: "Offboarding Checklist",
  fortinet_helper_notes: "Fortinet / FortiAnalyzer Helper Notes",
  ivanti_deployment_script_helper: "Ivanti Deployment Script Helper",
  exchange_365_troubleshooting_checklist: "Exchange / 365 Troubleshooting Checklist",
};

const OPTIONAL_INTEGRATIONS = [
  { id: "windows-event-log", name: "Windows Event Log API", status: "not_configured" as const, reason: "Live Event Log collection is not configured; paste sanitized snippets or run manual read-only checks." },
  { id: "active-directory-gpo", name: "AD / GPO", status: "not_configured" as const, reason: "Domain/tenant credentials are not configured and are never requested by default." },
  { id: "fortinet-fortianalyzer", name: "Fortinet / FortiAnalyzer", status: "not_configured" as const, reason: "No Fortinet endpoint or API token is configured; helper notes are offline drafts only." },
  { id: "ivanti", name: "Ivanti", status: "not_configured" as const, reason: "No Ivanti endpoint or package repository is configured; deployment scripts are review drafts only." },
  { id: "exchange-365", name: "Exchange / Microsoft 365", status: "not_configured" as const, reason: "No Microsoft Graph or Exchange connection is configured; troubleshooting output is checklist-only." },
  { id: "script-executor", name: "Approved Script Executor", status: "disabled" as const, reason: "Real script execution is disabled in Phase 12B; approved requests remain proposal/not_configured until a service-specific executor exists." },
];

let schemaEnsured = false;

function nowIso(): string {
  return new Date().toISOString();
}

function ensureItSupportSchema(): void {
  if (schemaEnsured) return;
  seedFoundationDefaults();
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS it_support_artifacts (
      id TEXT PRIMARY KEY,
      workflow_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      title TEXT NOT NULL,
      request_summary TEXT NOT NULL DEFAULT '',
      script_language TEXT,
      script_body TEXT NOT NULL DEFAULT '',
      safety_contract_json TEXT NOT NULL DEFAULT '{}',
      integration_status_json TEXT NOT NULL DEFAULT '[]',
      approval_id TEXT,
      execution_mode TEXT NOT NULL DEFAULT 'review',
      command_preview TEXT NOT NULL DEFAULT '',
      output_preview TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_it_support_artifacts_workflow
      ON it_support_artifacts(workflow_type, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_it_support_artifacts_status
      ON it_support_artifacts(status, updated_at DESC);
  `);
  schemaEnsured = true;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function redactSensitive(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(?:password|passwd|pwd|secret|token|apikey|api_key)\s*[:=]\s*\S+/gi, "[redacted-secret]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted-token]")
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+\b/gi, "[redacted-auth]");
}

function summarizeRequest(request: string): string {
  const redacted = redactSensitive(request.trim().replace(/\s+/g, " "));
  return redacted.length > 220 ? `${redacted.slice(0, 217)}...` : redacted;
}

function rowToArtifact(row: Record<string, unknown>): ItSupportArtifact {
  return {
    id: row["id"] as string,
    workflowType: row["workflow_type"] as ItSupportWorkflowType,
    status: row["status"] as ItSupportArtifactStatus,
    title: row["title"] as string,
    requestSummary: row["request_summary"] as string,
    scriptLanguage: (row["script_language"] as "powershell" | null) ?? undefined,
    scriptBody: row["script_body"] as string,
    safetyContract: parseJson(row["safety_contract_json"], emptyContract("")),
    integrationStatus: parseJson(row["integration_status_json"], []),
    approvalId: (row["approval_id"] as string | null) ?? undefined,
    executionMode: row["execution_mode"] as ItSupportExecutionMode,
    commandPreview: row["command_preview"] as string,
    outputPreview: row["output_preview"] as string,
    metadata: parseJson(row["metadata_json"], {}),
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

function emptyContract(purpose: string): ItSupportSafetyContract {
  return {
    purpose,
    adminRequired: false,
    reads: [],
    changes: [],
    risks: [],
    backupRestorePlan: "",
    loggingPath: "",
    dryRunBehavior: "",
    exitCodes: [],
    proofSteps: [],
  };
}

function contractFor(workflowType: ItSupportWorkflowType, summary: string): ItSupportSafetyContract {
  const base: ItSupportSafetyContract = {
    purpose: `${WORKFLOW_LABELS[workflowType]} for: ${summary || "operator-provided issue"}`,
    adminRequired: workflowType.includes("onboarding") || workflowType.includes("offboarding") || workflowType.includes("ivanti"),
    reads: ["Local machine state or pasted ticket/event-log text supplied by the operator"],
    changes: ["None by default; generated output is review/dry-run first"],
    risks: ["Incorrect remediation can disrupt user access or service availability if manually adapted without review"],
    backupRestorePlan: "Before any future change, export affected settings, record current values, and keep the generated script in dry-run mode until reviewed.",
    loggingPath: "$env:TEMP\\LOCALAI-ITSupport\\it-support-script.log",
    dryRunBehavior: "Uses -WhatIf / -DryRun behavior where possible and writes planned actions instead of modifying the system.",
    exitCodes: [
      { code: 0, meaning: "Completed or dry-run validation succeeded" },
      { code: 1, meaning: "Validation failed or required review was not satisfied" },
      { code: 2, meaning: "A guarded operation would require approval/manual execution" },
    ],
    proofSteps: ["Review transcript/log path", "Confirm no secrets were printed", "Verify expected service/user/system state manually"],
  };
  if (workflowType === "summarize_event_logs") {
    base.reads = ["Pasted/sanitized event log entries or a future read-only event-log adapter"];
    base.proofSteps = ["Compare summarized event IDs and timestamps against source excerpts", "Confirm missing log data is marked unavailable"];
  }
  if (workflowType === "generate_powershell_script" || workflowType === "ivanti_deployment_script_helper") {
    base.reads = ["Environment variables needed for logging path", "Optional local service/package state in dry-run mode"];
    base.changes = ["No changes unless -Execute is manually supplied after approval in a later executor phase"];
    base.risks.push("Package deployment or repair commands may require maintenance windows");
  }
  if (workflowType.includes("offboarding")) {
    base.risks.push("Account or license removal can be destructive and must remain checklist/manual approval only");
    base.changes = ["Checklist only; no AD, 365, device, mailbox, or license changes are executed"];
  }
  return base;
}

function scriptFor(workflowType: ItSupportWorkflowType, title: string, contract: ItSupportSafetyContract): string {
  const safeTitle = title.replace(/[^\w .:/()-]/g, "").slice(0, 120);
  const reads = contract.reads.map(item => `#   - ${item}`).join("\n");
  const changes = contract.changes.map(item => `#   - ${item}`).join("\n");
  const proof = contract.proofSteps.map(item => `#   - ${item}`).join("\n");
  return `# LOCALAI Phase 12B IT Support Script Draft
# Purpose: ${contract.purpose}
# Admin required: ${contract.adminRequired ? "yes" : "no"}
# What it reads:
${reads}
# What it changes:
${changes}
# Backup/restore: ${contract.backupRestorePlan}
# Logging path: ${contract.loggingPath}
# Dry-run behavior: ${contract.dryRunBehavior}
# Exit codes: 0 success/dry-run, 1 validation failed, 2 guarded/manual-only operation
# Proof steps:
${proof}

[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$DryRun = $true,
  [switch]$Execute
)

$ErrorActionPreference = "Stop"
$LogPath = "${contract.loggingPath}"
New-Item -ItemType Directory -Force -Path (Split-Path $LogPath) | Out-Null
"[$(Get-Date -Format o)] LOCALAI IT support draft: ${safeTitle}" | Out-File -FilePath $LogPath -Append -Encoding utf8

if (-not $Execute) {
  Write-Output "DRY RUN ONLY: review the safety contract before any manual execution."
}

Write-Output "Workflow: ${workflowType}"
Write-Output "Planned checks only. Missing live adapters are not_configured."

if ($PSCmdlet.ShouldProcess("${safeTitle}", "Review planned IT support checks")) {
  Write-Output "Proof: inspect $LogPath and verify results manually."
}

exit 0
`;
}

function commandPreviewFor(artifact: Pick<ItSupportArtifact, "id" | "executionMode">): string {
  return `pwsh -NoProfile -ExecutionPolicy Bypass -File <LOCALAI-it-support-${artifact.id}.ps1> -DryRun`;
}

export function listItSupportWorkflows() {
  return (Object.keys(WORKFLOW_LABELS) as ItSupportWorkflowType[]).map(id => ({
    id,
    name: WORKFLOW_LABELS[id],
    defaultMode: "review/dry_run" as const,
    executionEnabled: false,
    externalServicesRequired: false,
    approvalRequiredForExecution: true,
  }));
}

export function listItSupportIntegrations() {
  return OPTIONAL_INTEGRATIONS;
}

export function validateScriptSafety(scriptBody: string, contract: ItSupportSafetyContract): ScriptValidationResult {
  const missingFields: string[] = [];
  if (!contract.purpose) missingFields.push("purpose");
  if (typeof contract.adminRequired !== "boolean") missingFields.push("adminRequired");
  if (!contract.reads.length) missingFields.push("reads");
  if (!contract.changes.length) missingFields.push("changes");
  if (!contract.risks.length) missingFields.push("risks");
  if (!contract.backupRestorePlan) missingFields.push("backupRestorePlan");
  if (!contract.loggingPath) missingFields.push("loggingPath");
  if (!contract.dryRunBehavior) missingFields.push("dryRunBehavior");
  if (!contract.exitCodes.length) missingFields.push("exitCodes");
  if (!contract.proofSteps.length) missingFields.push("proofSteps");

  const reasons: string[] = [];
  if (!/-WhatIf|-DryRun|SupportsShouldProcess/i.test(scriptBody)) {
    reasons.push("Script must include -WhatIf, -DryRun, or SupportsShouldProcess behavior");
  }
  if (/\b(Get-Credential|Read-Host\s+-AsSecureString|ConvertTo-SecureString\s+-AsPlainText)\b/i.test(scriptBody)) {
    reasons.push("Credential capture or plaintext secret handling is blocked");
  }
  const dangerous = isDangerousCommand(scriptBody);
  if (dangerous.dangerous) reasons.push(dangerous.reason ?? "Dangerous command blocked");
  const destructive = /\b(Remove-ADUser|Disable-ADAccount|Remove-Mailbox|Remove-MgUser|Set-NetFirewall|New-NetFirewallRule|Remove-Item|Uninstall-Package|msiexec\s+\/x)\b/i.test(scriptBody);
  const manualOnly = /\b(format\s+[a-z]:|cipher\s+\/w|Remove-ADUser|Remove-MgUser)\b/i.test(scriptBody);

  return {
    valid: missingFields.length === 0 && reasons.length === 0 && !manualOnly,
    missingFields,
    blocked: manualOnly || reasons.length > 0,
    riskTier: manualOnly
      ? "tier5_manual_only_prohibited"
      : destructive || contract.adminRequired
        ? "tier3_file_modification"
        : "tier2_safe_local_execute",
    reasons,
  };
}

export function createItSupportArtifact(input: CreateItSupportArtifactInput): ItSupportActionResult {
  ensureItSupportSchema();
  const workflowType = input.workflowType;
  if (!WORKFLOW_LABELS[workflowType]) throw new Error("Unsupported IT support workflow type");
  const request = input.request.trim();
  if (!request) throw new Error("request is required");
  const requestSummary = summarizeRequest(request);
  const title = summarizeRequest(input.title || WORKFLOW_LABELS[workflowType]);
  const contract = contractFor(workflowType, requestSummary);
  const scriptBody = scriptFor(workflowType, title, contract);
  const validation = validateScriptSafety(scriptBody, contract);
  const createdAt = nowIso();
  const id = randomUUID();
  const artifact: ItSupportArtifact = {
    id,
    workflowType,
    status: validation.valid ? "review_required" : "blocked",
    title,
    requestSummary,
    scriptLanguage: "powershell",
    scriptBody,
    safetyContract: contract,
    integrationStatus: listItSupportIntegrations(),
    executionMode: "review",
    commandPreview: `pwsh -NoProfile -ExecutionPolicy Bypass -File <LOCALAI-it-support-${id}.ps1> -DryRun`,
    outputPreview: "Review/proposal only. No command has executed.",
    metadata: {
      requestHash: hashText(request),
      rawRequestStored: false,
      localFirst: true,
      cloudRequired: false,
      ...input.metadata,
    },
    createdAt,
    updatedAt: createdAt,
  };
  sqlite.prepare(`
    INSERT INTO it_support_artifacts
      (id, workflow_type, status, title, request_summary, script_language,
       script_body, safety_contract_json, integration_status_json, approval_id,
       execution_mode, command_preview, output_preview, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
  `).run(
    artifact.id,
    artifact.workflowType,
    artifact.status,
    artifact.title,
    artifact.requestSummary,
    artifact.scriptLanguage,
    artifact.scriptBody,
    JSON.stringify(artifact.safetyContract),
    JSON.stringify(artifact.integrationStatus),
    artifact.executionMode,
    artifact.commandPreview,
    artifact.outputPreview,
    JSON.stringify(artifact.metadata),
    artifact.createdAt,
    artifact.updatedAt,
  );
  recordAuditEvent({
    eventType: "it_support_artifact",
    action: "create",
    target: artifact.id,
    result: validation.valid ? "success" : "blocked",
    metadata: {
      workflowType,
      scriptHash: hashText(scriptBody),
      requestHash: artifact.metadata["requestHash"],
      status: artifact.status,
      validation,
    },
  });
  thoughtLog.publish({
    level: validation.valid ? "info" : "warning",
    category: "system",
    title: "IT Support Draft Created",
    message: `${WORKFLOW_LABELS[workflowType]} draft ${artifact.id} created in review mode`,
    metadata: { artifactId: artifact.id, workflowType, status: artifact.status },
  });
  return {
    success: validation.valid,
    status: validation.valid ? "review" : "blocked",
    executed: false,
    message: validation.valid
      ? "IT support artifact created in review/dry-run mode. No command executed."
      : "IT support artifact failed safety validation and was blocked.",
    artifact,
    approvalRequired: false,
    validation,
  };
}

export function getItSupportArtifact(id: string): ItSupportArtifact | null {
  ensureItSupportSchema();
  const row = sqlite.prepare("SELECT * FROM it_support_artifacts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToArtifact(row) : null;
}

export function listItSupportArtifacts(limit = 50): ItSupportArtifact[] {
  ensureItSupportSchema();
  return (sqlite.prepare(`
    SELECT * FROM it_support_artifacts
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(limit, 250))) as Array<Record<string, unknown>>).map(rowToArtifact);
}

export function getItSupportStatus() {
  ensureItSupportSchema();
  const counts = sqlite.prepare(`
    SELECT status, COUNT(*) as count
    FROM it_support_artifacts
    GROUP BY status
  `).all() as Array<{ status: string; count: number }>;
  return {
    sourceOfTruth: IT_SUPPORT_SOURCE_OF_TRUTH,
    localFirst: true,
    cloudRequired: false,
    defaultMode: "review/dry_run",
    realExecutionEnabled: false,
    hardLimits: {
      credentialCaptureAllowed: false,
      destructiveDefaultScriptsAllowed: false,
      productionChangesWithoutApprovalAllowed: false,
      generatedScriptsExecuteByDefault: false,
    },
    integrations: listItSupportIntegrations(),
    workflows: listItSupportWorkflows(),
    counts,
  };
}

export function proposeItSupportScriptExecution(
  artifactId: string,
  options: { mode?: ItSupportExecutionMode; approvalId?: string } = {},
): ItSupportActionResult {
  ensureItSupportSchema();
  const artifact = getItSupportArtifact(artifactId);
  if (!artifact) throw new Error("IT support artifact not found");
  const mode = options.mode ?? "dry_run";
  const validation = validateScriptSafety(artifact.scriptBody, artifact.safetyContract);
  if (!validation.valid) {
    recordAuditEvent({
      eventType: "it_support_execution",
      action: "blocked",
      target: artifact.id,
      result: "blocked",
      metadata: { scriptHash: hashText(artifact.scriptBody), validation },
    });
    return {
      success: false,
      status: "blocked",
      executed: false,
      message: "Script failed safety validation and cannot be executed.",
      artifact: { ...artifact, status: "blocked" },
      approvalRequired: false,
      validation,
    };
  }
  if (mode === "review") {
    return {
      success: true,
      status: "review",
      executed: false,
      message: "Review mode only. No command executed.",
      artifact,
      approvalRequired: false,
      validation,
    };
  }
  const commandPreview = commandPreviewFor({ id: artifact.id, executionMode: mode });
  const commandSafety = isDangerousCommand(commandPreview);
  if (commandSafety.dangerous) {
    const approval = createApprovalRequest({
      type: "it_support_script_execute",
      title: "Dangerous IT support script blocked",
      summary: commandSafety.reason ?? "Dangerous IT support command blocked",
      riskTier: "tier5_manual_only_prohibited",
      requestedAction: `it_support.script.${artifact.id}`,
      payload: {
        artifactId: artifact.id,
        scriptHash: hashText(artifact.scriptBody),
        mode,
        commandPreview,
      },
    });
    return {
      success: false,
      status: "blocked",
      executed: false,
      message: commandSafety.reason ?? "Dangerous IT support command blocked",
      artifact,
      approvalRequired: false,
      approval,
      validation,
    };
  }
  const approvalPayload = {
    artifactId: artifact.id,
    scriptHash: hashText(artifact.scriptBody),
    mode,
    commandPreview,
    diff: `IT support script ${artifact.id} execution proposal only; no filesystem diff is applied by LOCALAI in Phase 12B.`,
    rollback: {
      backupRestorePlan: artifact.safetyContract.backupRestorePlan,
      loggingPath: artifact.safetyContract.loggingPath,
      executorDisabled: true,
      noCommandExecutedByDefault: true,
    },
  };
  if (!options.approvalId) {
    const approval = createApprovalRequest({
      type: "it_support_script_execute",
      title: `Run IT support script draft: ${artifact.title.slice(0, 80)}`,
      summary: `Approve ${mode} proposal for IT support artifact ${artifact.id}. No command has executed.`,
      riskTier: mode === "execute" ? validation.riskTier : "tier2_safe_local_execute",
      requestedAction: `it_support.script.${artifact.id}`,
      payload: approvalPayload,
    });
    sqlite.prepare(`
      UPDATE it_support_artifacts
      SET status = ?, approval_id = ?, execution_mode = ?, command_preview = ?, updated_at = ?
      WHERE id = ?
    `).run("approval_pending", approval.id, mode, commandPreview, nowIso(), artifact.id);
    return {
      success: false,
      status: "approval_required",
      executed: false,
      message: "Approval is required before any IT support script run proposal. No command executed.",
      artifact: getItSupportArtifact(artifact.id) ?? artifact,
      approvalRequired: true,
      approval,
      validation,
    };
  }
  const verified = verifyApprovedRequest(options.approvalId, approvalPayload, "it_support_script_execute");
  if (!verified.allowed) {
    return {
      success: false,
      status: "approval_required",
      executed: false,
      message: verified.message,
      artifact,
      approvalRequired: true,
      approval: verified.approval,
      validation,
    };
  }
  recordAuditEvent({
    eventType: "it_support_execution",
    action: "not_configured",
    target: artifact.id,
    result: "blocked",
    metadata: {
      approvalId: options.approvalId,
      scriptHash: approvalPayload.scriptHash,
      mode,
      executed: false,
      reason: "Phase 12B approved script executor is disabled/not_configured",
    },
  });
  return {
    success: false,
    status: "not_configured",
    executed: false,
    message: "Approved script execution is not configured in Phase 12B. No command executed.",
    artifact,
    approvalRequired: false,
    approval: verified.approval,
    validation,
  };
}
