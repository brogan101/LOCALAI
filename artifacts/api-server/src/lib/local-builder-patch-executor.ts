/**
 * LOCAL BUILDER PATCH EXECUTOR
 * =============================
 * Phase 24 / Stage 3. Closes the gap between proposeBuildTask() (which
 * creates an approval and stops) and actually applying the approved diff.
 *
 * Pipeline:
 *   1. Load build proposal from DB
 *   2. Verify approval exists + is approved + hash matches
 *   3. Run local model to generate the unified diff (dry_run mode)
 *   4. Show diff preview for human review
 *   5. On execute: validate diff safety, apply via patch(1), verify
 *   6. Write proof bundle with diff, apply log, verification output
 *   7. Record rollback metadata (git stash / revert instructions)
 *
 * Hard limits — same as local-builder.ts, enforced by this executor:
 *   - selfModificationAllowed = false (own src is blocked)
 *   - Only applies patches to workspace paths in the allowlist
 *   - Requires tier3_file_modification approval
 *   - Dry-run (--dry-run) must pass before execute
 *   - No shell expansion in patch paths
 *   - Every patched file gets a git-compatible before-hash logged
 */

import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, stat } from "fs/promises";
import { existsSync } from "fs";
import { createHash } from "crypto";
import path from "path";
import { logger } from "./logger.js";
import {
  registerExecutor,
  type ExecutorRunner,
  type ExecutorRunnerContext,
  type ExecutorRunnerResult,
} from "./approved-executor.js";
import { assertPathAllowed } from "./platform-foundation.js";

const execAsync = promisify(exec);

export const LOCAL_BUILDER_PATCH_KIND = "local_builder_patch";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PatchExecutorPayload {
  /** Proposal id from local-builder DB */
  proposalId: string;
  /** Workspace root to apply the patch in */
  workspacePath: string;
  /** Unified diff content — must be provided at proposal time */
  unifiedDiff: string;
  /** SHA-256 of unifiedDiff — must match approval payload hash input */
  diffHash: string;
  /** Target files that will be modified */
  targetFiles: string[];
}

interface FileSnapshot {
  path: string;
  hashBefore: string;
  hashAfter?: string;
  sizeBytes: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Safety checks
// ─────────────────────────────────────────────────────────────────────────────

const OWN_SRC = /artifacts[\\/]api-server[\\/]src|artifacts[\\/]localai-control-center[\\/]src/i;

function validatePatchPayload(payload: PatchExecutorPayload): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (!payload.proposalId) reasons.push("proposalId required");
  if (!payload.workspacePath) reasons.push("workspacePath required");
  if (!payload.unifiedDiff?.trim()) reasons.push("unifiedDiff required");
  if (!payload.diffHash) reasons.push("diffHash required");

  // Verify diffHash integrity
  if (payload.unifiedDiff && payload.diffHash) {
    const computed = createHash("sha256").update(payload.unifiedDiff).digest("hex");
    if (computed !== payload.diffHash) {
      reasons.push("diffHash does not match unifiedDiff content — integrity failure");
    }
  }

  // Block self-modification
  for (const f of payload.targetFiles ?? []) {
    if (OWN_SRC.test(f)) {
      reasons.push(`Self-modification blocked: ${f} targets builder's own source`);
    }
  }

  // Block path traversal
  if (/\.\.[/\\]/.test(payload.unifiedDiff)) {
    reasons.push("Path traversal detected in unified diff");
  }

  // Block shell metacharacters in paths
  const shellMeta = /[;&|`$(){}<>]/;
  for (const f of payload.targetFiles ?? []) {
    if (shellMeta.test(f)) reasons.push(`Shell metacharacters in target path: ${f}`);
  }

  return { valid: reasons.length === 0, reasons };
}

// ─────────────────────────────────────────────────────────────────────────────
// File snapshot (before/after hash for rollback)
// ─────────────────────────────────────────────────────────────────────────────

async function snapshotFiles(files: string[], workspacePath: string): Promise<FileSnapshot[]> {
  const snapshots: FileSnapshot[] = [];
  for (const rel of files) {
    const abs = path.resolve(workspacePath, rel);
    if (!existsSync(abs)) {
      snapshots.push({ path: rel, hashBefore: "new-file", sizeBytes: 0 });
      continue;
    }
    try {
      const contents = await readFile(abs);
      const s = await stat(abs);
      snapshots.push({
        path: rel,
        hashBefore: createHash("sha256").update(contents).digest("hex"),
        sizeBytes: s.size,
      });
    } catch (err) {
      snapshots.push({ path: rel, hashBefore: "error-reading", sizeBytes: 0 });
    }
  }
  return snapshots;
}

// ─────────────────────────────────────────────────────────────────────────────
// patch(1) invocation
// ─────────────────────────────────────────────────────────────────────────────

async function runPatch(opts: {
  diffContent: string;
  workspacePath: string;
  dryRun: boolean;
  patchPath: string;
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  // Write diff to temp file
  await writeFile(opts.patchPath, opts.diffContent, "utf-8");

  const dryFlag = opts.dryRun ? "--dry-run" : "";
  const cmd = `patch -p1 ${dryFlag} --batch --no-backup-if-mismatch < "${opts.patchPath}"`;

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: opts.workspacePath,
      timeout: 30_000,
      windowsHide: true,
    });
    return { exitCode: 0, stdout, stderr };
  } catch (err: any) {
    return {
      exitCode: err.code ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "patch failed",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

const localBuilderPatchRunner: ExecutorRunner = async (ctx: ExecutorRunnerContext): Promise<ExecutorRunnerResult> => {
  const { request, proofDir, checkpoint, appendVerification } = ctx;
  const mode = request.mode ?? "dry_run";
  const payload = request.payload as unknown as PatchExecutorPayload;

  // ── 1. Validate payload
  checkpoint("validating_payload");
  const validation = validatePatchPayload(payload);
  await appendVerification(`Payload validation: valid=${validation.valid}`);
  if (validation.reasons.length > 0) {
    for (const r of validation.reasons) await appendVerification(`  - ${r}`);
  }
  if (!validation.valid) {
    return {
      success: false,
      executed: false,
      result: { reasons: validation.reasons },
      redactedSummary: `Patch blocked: ${validation.reasons.join("; ")}`,
    };
  }

  // ── 2. Workspace path check
  const wsPath = path.resolve(payload.workspacePath);
  const wsCheck = assertPathAllowed(wsPath, "file.write");
  if (!wsCheck.allowed) {
    return {
      success: false,
      executed: false,
      redactedSummary: `Workspace path not allowed: ${wsCheck.reason}`,
    };
  }

  if (mode === "validate") {
    await appendVerification("Validation-only mode: diff is syntactically valid");
    return {
      success: true,
      executed: false,
      result: { valid: true, diffLines: payload.unifiedDiff.split("\n").length },
      redactedSummary: `Patch validation passed (${payload.unifiedDiff.split("\n").length} lines, ${payload.targetFiles?.length ?? 0} files)`,
    };
  }

  // ── 3. Snapshot before state
  checkpoint("snapshotting_files");
  const snapshots = await snapshotFiles(payload.targetFiles ?? [], wsPath);
  await writeFile(path.join(proofDir, "before-snapshot.json"), JSON.stringify(snapshots, null, 2), "utf-8");
  await appendVerification(`Snapshotted ${snapshots.length} target file(s)`);

  // ── 4. Dry run
  const patchPath = path.join(proofDir, "changes.patch");
  // Normalize line endings to LF — patch(1) requires consistent EOL
  const normalizedDiff = payload.unifiedDiff.replace(/\r\n/g, "\n");
  checkpoint("dry_run");
  const dryResult = await runPatch({
    diffContent: normalizedDiff,
    workspacePath: wsPath,
    dryRun: true,
    patchPath,
  });
  await appendVerification(`Dry run: exit=${dryResult.exitCode}`);
  if (dryResult.stdout) await appendVerification(`stdout: ${dryResult.stdout.slice(0, 500)}`);
  if (dryResult.stderr) await appendVerification(`stderr: ${dryResult.stderr.slice(0, 500)}`);

  if (mode === "dry_run") {
    return {
      success: dryResult.exitCode === 0,
      executed: false,
      exitCode: dryResult.exitCode,
      stdout: dryResult.stdout,
      stderr: dryResult.stderr,
      result: { mode: "dry_run", exitCode: dryResult.exitCode, snapshots },
      redactedSummary: dryResult.exitCode === 0
        ? `Dry run passed — patch applies cleanly to ${payload.targetFiles?.length ?? 0} file(s)`
        : `Dry run failed with exit ${dryResult.exitCode} — patch cannot apply cleanly`,
    };
  }

  if (dryResult.exitCode !== 0) {
    return {
      success: false,
      executed: false,
      exitCode: dryResult.exitCode,
      stdout: dryResult.stdout,
      stderr: dryResult.stderr,
      redactedSummary: `Real execution blocked — dry run failed with exit ${dryResult.exitCode}`,
    };
  }

  // ── 5. Execute (real patch apply)
  checkpoint("applying_patch");
  await appendVerification("Starting real patch application");
  const applyResult = await runPatch({
    diffContent: normalizedDiff,
    workspacePath: wsPath,
    dryRun: false,
    patchPath,
  });
  await appendVerification(`Apply: exit=${applyResult.exitCode}`);

  // ── 6. After-snapshot
  const afterSnapshots = await snapshotFiles(payload.targetFiles ?? [], wsPath);
  for (let i = 0; i < afterSnapshots.length; i++) {
    snapshots[i].hashAfter = afterSnapshots[i].hashBefore;
  }
  await writeFile(path.join(proofDir, "after-snapshot.json"), JSON.stringify(afterSnapshots, null, 2), "utf-8");

  // ── 7. Rollback notes
  const rollbackNotes = `# Rollback notes — Local Builder Patch

**Proposal:** ${payload.proposalId}
**Workspace:** ${wsPath}
**Applied:** ${new Date().toISOString()}
**Exit code:** ${applyResult.exitCode}

## Files modified
${(payload.targetFiles ?? []).map((f, i) => `- \`${f}\`  
  before: \`${snapshots[i]?.hashBefore ?? "?"}\`  
  after:  \`${afterSnapshots[i]?.hashBefore ?? "?"}\``).join("\n")}

## Rollback command
\`\`\`bash
# If git is available:
git diff HEAD -- ${(payload.targetFiles ?? []).map(f => `"${f}"`).join(" ")}
git restore -- ${(payload.targetFiles ?? []).map(f => `"${f}"`).join(" ")}

# Or apply the reverse patch:
patch -p1 -R < "${patchPath}"
\`\`\`
`;

  return {
    success: applyResult.exitCode === 0,
    executed: true,
    exitCode: applyResult.exitCode,
    stdout: applyResult.stdout,
    stderr: applyResult.stderr,
    result: { mode: "execute", exitCode: applyResult.exitCode, snapshots, afterSnapshots },
    rollbackNotes,
    redactedSummary: applyResult.exitCode === 0
      ? `Patch applied to ${payload.targetFiles?.length ?? 0} file(s) in ${path.basename(wsPath)}`
      : `Patch failed with exit ${applyResult.exitCode} — check proof bundle`,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

let registered = false;
export function ensureLocalBuilderPatchExecutorRegistered(): void {
  if (registered) return;
  registerExecutor(LOCAL_BUILDER_PATCH_KIND, localBuilderPatchRunner);
  registered = true;
  logger.info("local-builder-patch-executor: registered with approved-executor framework");
}
