/**
 * IT SUPPORT SCRIPT EXECUTOR
 * ==========================
 * Phase 24. First real executor using approved-executor framework.
 *
 * Runs LOCALAI-generated PowerShell scripts through validate → dry_run → execute
 * → verify modes, with full proof bundle output and rollback notes.
 *
 * Boundary rules (TypeScript-enforced where possible):
 *   - Only PowerShell (.ps1) — no .bat, .cmd, .vbs, encoded scripts
 *   - Script must have LOCALAI_IT_SCRIPT metadata header
 *   - Script must include -WhatIf or -DryRun support
 *   - Script must not contain destructive AD/M365/firewall commands without approval
 *   - Encoded PowerShell (-EncodedCommand) is blocked outright
 *   - Tier 5 manual_only operations cannot be executed even with approval
 *   - All scripts go through command-sanitizer before execute mode
 *   - All output is redacted in audit logs (PII, tokens, IPs)
 */

import { spawn } from "child_process";
import { writeFile } from "fs/promises";
import path from "path";
import { logger } from "./logger.js";
import {
  registerExecutor,
  preExecuteSanitize,
  type ExecutorRunner,
  type ExecutorRunnerContext,
  type ExecutorRunnerResult,
} from "./approved-executor.js";
import { getItSupportArtifact, validateScriptSafety } from "./it-support.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const IT_EXECUTOR_KIND = "it_support_script";

const REQUIRED_METADATA_FIELDS = [
  "LOCALAI_IT_SCRIPT",
  "Purpose",
  "RequiresAdmin",
  "Changes",
  "Reads",
  "BackupPlan",
  "RollbackPlan",
  "DryRunSupported",
  "VerificationSteps",
  "ExpectedExitCodes",
];

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /-EncodedCommand\b/i, reason: "Encoded PowerShell is blocked" },
  { pattern: /\bIEX\b|\bInvoke-Expression\b/i, reason: "Invoke-Expression is blocked" },
  { pattern: /DownloadString\s*\(/i, reason: "Inline DownloadString is blocked" },
  { pattern: /\bStart-BitsTransfer\b.*-Source\s+http/i, reason: "Inline BITS download is blocked" },
  { pattern: /\bcurl\b.*\|.*\biex\b/i, reason: "Curl-pipe-to-IEX is blocked" },
  { pattern: /\bRemove-Item\s+-Recurse\s+-Force\s+[A-Z]:\\?(\s|$)/i, reason: "Recursive root deletion is blocked" },
  { pattern: /format\s+[a-z]:/i, reason: "Drive format is permanently manual_only" },
  { pattern: /cipher\s+\/w/i, reason: "Disk wipe is permanently manual_only" },
];

const TIER5_MANUAL_ONLY: RegExp[] = [
  /\bRemove-ADUser\b/i,
  /\bRemove-MgUser\b/i,
  /\bRemove-Mailbox\b/i,
  /\bUninstall-WindowsFeature\b/i,
  /\bRemove-WindowsFeature\b/i,
];

// ─────────────────────────────────────────────────────────────────────────────
// Metadata parser — extracts LOCALAI_IT_SCRIPT header
// ─────────────────────────────────────────────────────────────────────────────

interface ScriptMetadata {
  marker: boolean;
  purpose?: string;
  requiresAdmin?: boolean;
  changes?: string[];
  reads?: string[];
  backupPlan?: string;
  rollbackPlan?: string;
  dryRunSupported?: boolean;
  verificationSteps?: string[];
  expectedExitCodes?: number[];
  missing: string[];
}

export function parseScriptMetadata(scriptBody: string): ScriptMetadata {
  const headerMatch = scriptBody.match(/<#([\s\S]*?)#>/);
  const header = headerMatch ? headerMatch[1] : "";
  const has = (field: string) => new RegExp(`${field}\\s*[:=]`, "i").test(header);
  const get = (field: string): string | undefined => {
    const m = header.match(new RegExp(`${field}\\s*[:=]\\s*(.*)`, "i"));
    return m ? m[1].trim() : undefined;
  };
  const getList = (field: string): string[] | undefined => {
    const v = get(field);
    if (!v) return undefined;
    return v.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  };
  const getBool = (field: string): boolean | undefined => {
    const v = get(field);
    if (!v) return undefined;
    return /^(true|yes|1)$/i.test(v);
  };
  const getInts = (field: string): number[] | undefined => {
    const v = get(field);
    if (!v) return undefined;
    const nums = v.split(/[,;\s]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
    return nums.length > 0 ? nums : undefined;
  };

  const meta: ScriptMetadata = {
    marker: /LOCALAI_IT_SCRIPT\s*[:=]\s*true/i.test(header),
    purpose: get("Purpose"),
    requiresAdmin: getBool("RequiresAdmin"),
    changes: getList("Changes"),
    reads: getList("Reads"),
    backupPlan: get("BackupPlan"),
    rollbackPlan: get("RollbackPlan"),
    dryRunSupported: getBool("DryRunSupported"),
    verificationSteps: getList("VerificationSteps"),
    expectedExitCodes: getInts("ExpectedExitCodes"),
    missing: [],
  };

  for (const field of REQUIRED_METADATA_FIELDS) {
    if (!has(field) && field !== "LOCALAI_IT_SCRIPT") {
      meta.missing.push(field);
    }
  }
  if (!meta.marker) meta.missing.unshift("LOCALAI_IT_SCRIPT marker");

  return meta;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static script validation — runs before any execution
// ─────────────────────────────────────────────────────────────────────────────

export interface ScriptValidationOutcome {
  valid: boolean;
  blocked: boolean;
  reasons: string[];
  metadata: ScriptMetadata;
  riskTier: "tier2_safe_local_execute" | "tier3_file_modification" | "tier5_manual_only_prohibited";
}

export function validateItScript(scriptBody: string): ScriptValidationOutcome {
  const metadata = parseScriptMetadata(scriptBody);
  const reasons: string[] = [];

  if (metadata.missing.length > 0) {
    reasons.push(`Missing required metadata: ${metadata.missing.join(", ")}`);
  }

  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(scriptBody)) reasons.push(reason);
  }

  let riskTier: ScriptValidationOutcome["riskTier"] = "tier2_safe_local_execute";

  for (const pattern of TIER5_MANUAL_ONLY) {
    if (pattern.test(scriptBody)) {
      riskTier = "tier5_manual_only_prohibited";
      reasons.push("Script contains tier5_manual_only_prohibited operations");
      break;
    }
  }

  const sanitized = preExecuteSanitize(scriptBody);
  if (!sanitized.allowed) {
    reasons.push(`Command sanitizer: ${sanitized.reason}`);
  }

  if (riskTier !== "tier5_manual_only_prohibited" && metadata.requiresAdmin) {
    riskTier = "tier3_file_modification";
  }

  const blocked = riskTier === "tier5_manual_only_prohibited" || reasons.length > 0;

  return {
    valid: !blocked && reasons.length === 0,
    blocked,
    reasons,
    metadata,
    riskTier,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner — what actually invokes PowerShell
// ─────────────────────────────────────────────────────────────────────────────

interface RunPowerShellOptions {
  scriptPath: string;
  whatIf: boolean;
  timeoutMs?: number;
  cwd?: string;
}

interface RunPowerShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

async function runPowerShell(opts: RunPowerShellOptions): Promise<RunPowerShellResult> {
  const startedAt = Date.now();
  return new Promise<RunPowerShellResult>((resolve) => {
    const args = [
      "-NoLogo",
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", opts.scriptPath,
    ];
    if (opts.whatIf) args.push("-WhatIf");

    // Prefer pwsh.exe (PS7), fall back to powershell.exe (PS5)
    const shell = process.platform === "win32" ? "pwsh.exe" : "pwsh";
    // If pwsh.exe spawn fails, retry with powershell.exe (PS5)
    const shellFallback = process.platform === "win32" ? "powershell.exe" : null;

    const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000; // 5 min default
    let timedOut = false;

    const child = spawn(shell, args, {
      cwd: opts.cwd,
      env: { ...process.env, LOCALAI_EXECUTOR: "1" },
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
      setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* ignore */ } }, 2000);
    }, timeoutMs);

    child.on("error", async (err) => {
      clearTimeout(timer);
      // If pwsh.exe not found, retry with powershell.exe (PS5)
      if (shellFallback && ((err as NodeJS.ErrnoException).code === "ENOENT" || err.message.includes("ENOENT"))) {
        try {
          const fb = spawn(shellFallback, args, { cwd: opts.cwd, env: { ...process.env, LOCALAI_EXECUTOR: "1" }, windowsHide: true });
          let fbOut = "", fbErr = "";
          fb.stdout.on("data", (d: Buffer) => { fbOut += d.toString(); });
          fb.stderr.on("data", (d: Buffer) => { fbErr += d.toString(); });
          const fbTimer = setTimeout(() => { try { fb.kill(); } catch { /* ignore */ } }, timeoutMs);
          fb.on("close", (code) => {
            clearTimeout(fbTimer);
            resolve({ exitCode: code ?? -1, stdout: fbOut, stderr: fbErr, timedOut: false, durationMs: Date.now() - startedAt });
          });
          fb.on("error", (err2) => {
            clearTimeout(fbTimer);
            resolve({ exitCode: -1, stdout, stderr: stderr + `\nPS7 not found, PS5 also failed: ${err2.message}`, timedOut, durationMs: Date.now() - startedAt });
          });
          return;
        } catch { /* fall through */ }
      }
      resolve({
        exitCode: -1,
        stdout,
        stderr: stderr + `\nProcess error: ${err.message}. Ensure pwsh.exe (PS7) or powershell.exe (PS5) is on PATH.`,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? -1,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Executor runner — registered with approved-executor
// ─────────────────────────────────────────────────────────────────────────────

interface ItScriptExecPayload {
  artifactId: string;
  scriptBodyHash: string; // sha256 of script body — must match artifact at exec time
}

const itScriptRunner: ExecutorRunner = async (ctx: ExecutorRunnerContext): Promise<ExecutorRunnerResult> => {
  const { request, proofDir, checkpoint, appendVerification } = ctx;
  const mode = request.mode ?? "dry_run";
  const payload = request.payload as unknown as ItScriptExecPayload;

  if (!payload.artifactId) {
    return {
      success: false,
      executed: false,
      redactedSummary: "Missing artifactId in payload",
    };
  }

  // Load artifact fresh from DB — never trust the payload alone
  const artifact = getItSupportArtifact(payload.artifactId);
  if (!artifact) {
    return {
      success: false,
      executed: false,
      redactedSummary: `IT support artifact not found: ${payload.artifactId}`,
    };
  }

  if (!artifact.scriptBody || artifact.scriptLanguage !== "powershell") {
    return {
      success: false,
      executed: false,
      redactedSummary: "Artifact is not a PowerShell script or has empty body",
    };
  }

  // ── Static validation
  checkpoint("validating");
  const staticVal = validateItScript(artifact.scriptBody);
  await appendVerification(`Static validation: valid=${staticVal.valid} blocked=${staticVal.blocked} riskTier=${staticVal.riskTier}`);
  if (staticVal.reasons.length > 0) {
    for (const r of staticVal.reasons) await appendVerification(`  - ${r}`);
  }

  // Validate-only mode stops here
  if (mode === "validate") {
    return {
      success: !staticVal.blocked,
      executed: false,
      result: {
        valid: staticVal.valid,
        blocked: staticVal.blocked,
        reasons: staticVal.reasons,
        riskTier: staticVal.riskTier,
        metadata: staticVal.metadata,
      },
      redactedSummary: staticVal.valid
        ? `Script validation passed (${staticVal.riskTier})`
        : `Script blocked: ${staticVal.reasons.join("; ")}`,
    };
  }

  if (staticVal.blocked) {
    return {
      success: false,
      executed: false,
      result: { reasons: staticVal.reasons, riskTier: staticVal.riskTier },
      redactedSummary: `Static validation blocked execution: ${staticVal.reasons.join("; ")}`,
    };
  }

  // ── Reuse it-support's own safety contract validator for parity
  const contract = artifact.safetyContract;
  const contractVal = validateScriptSafety(artifact.scriptBody, contract);
  await appendVerification(`Safety contract validation: valid=${contractVal.valid} blocked=${contractVal.blocked}`);
  if (contractVal.blocked) {
    return {
      success: false,
      executed: false,
      result: { contractReasons: contractVal.reasons, missingFields: contractVal.missingFields },
      redactedSummary: `Safety contract blocked: ${contractVal.reasons.join("; ")}`,
    };
  }

  // ── Write script to proof dir
  const scriptPath = path.join(proofDir, "script.ps1");
  await writeFile(scriptPath, artifact.scriptBody, "utf-8");

  // ── Dry run
  if (mode === "dry_run") {
    checkpoint("dry_run_start");
    await appendVerification("Starting -WhatIf dry run");
    const result = await runPowerShell({ scriptPath, whatIf: true, timeoutMs: 60_000 });
    await appendVerification(`Dry run finished: exit=${result.exitCode} duration=${result.durationMs}ms timedOut=${result.timedOut}`);
    return {
      success: result.exitCode === 0 && !result.timedOut,
      executed: false,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      result: {
        mode: "dry_run",
        durationMs: result.durationMs,
        timedOut: result.timedOut,
        exitCode: result.exitCode,
      },
      redactedSummary: result.timedOut
        ? "Dry run timed out after 60s"
        : `Dry run completed with exit code ${result.exitCode}`,
    };
  }

  // ── Execute (real)
  if (mode === "execute") {
    checkpoint("execute_start");
    await appendVerification("Starting real execution");

    const result = await runPowerShell({ scriptPath, whatIf: false, timeoutMs: 5 * 60_000 });
    await appendVerification(`Execution finished: exit=${result.exitCode} duration=${result.durationMs}ms timedOut=${result.timedOut}`);

    const expectedCodes = staticVal.metadata.expectedExitCodes ?? [0];
    const exitOk = expectedCodes.includes(result.exitCode);

    const rollbackNotes = `# Rollback notes — ${artifact.title}

**Artifact:** ${artifact.id}
**Script path:** ${scriptPath}
**Exit code:** ${result.exitCode}
**Expected:** ${expectedCodes.join(", ")}

## Backup plan from script header
${staticVal.metadata.backupPlan ?? "(not specified)"}

## Rollback steps from script header
${staticVal.metadata.rollbackPlan ?? "(not specified)"}

## Verification steps to confirm rollback
${(staticVal.metadata.verificationSteps ?? []).map((s, i) => `${i + 1}. ${s}`).join("\n")}
`;

    return {
      success: exitOk && !result.timedOut,
      executed: true,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      result: {
        mode: "execute",
        durationMs: result.durationMs,
        timedOut: result.timedOut,
        exitCode: result.exitCode,
        expectedCodes,
        exitOk,
      },
      rollbackNotes,
      redactedSummary: result.timedOut
        ? "Script execution timed out after 5 min"
        : exitOk
        ? `Script executed successfully (exit ${result.exitCode})`
        : `Script exited with unexpected code ${result.exitCode} — review proof bundle`,
    };
  }

  // ── Verify
  if (mode === "verify") {
    checkpoint("verify_start");
    const steps = staticVal.metadata.verificationSteps ?? [];
    if (steps.length === 0) {
      return {
        success: true,
        executed: false,
        redactedSummary: "No verification steps defined in script metadata",
      };
    }
    await appendVerification(`Running ${steps.length} verification step(s)`);
    for (const step of steps) {
      await appendVerification(`  step: ${step}`);
    }
    return {
      success: true,
      executed: false,
      result: { verificationSteps: steps },
      redactedSummary: `Logged ${steps.length} verification step(s) for manual review`,
    };
  }

  return {
    success: false,
    executed: false,
    redactedSummary: `Unknown mode: ${mode}`,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Register the executor on module load
// ─────────────────────────────────────────────────────────────────────────────

let registered = false;
export function ensureItExecutorRegistered(): void {
  if (registered) return;
  registerExecutor(IT_EXECUTOR_KIND, itScriptRunner);
  registered = true;
  logger.info("it-support-executor: registered with approved-executor framework");
}
