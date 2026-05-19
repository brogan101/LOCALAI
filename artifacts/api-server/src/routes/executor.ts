/**
 * EXECUTOR ROUTES
 * ===============
 * Routes that drive the approved-executor framework.
 *
 * IT Support script execution:
 *   POST /it-support/executor/validate          { artifactId }
 *   POST /it-support/executor/dry-run           { artifactId }
 *   POST /it-support/executor/execute           { artifactId, approvalId }
 *   POST /it-support/executor/verify            { artifactId, approvalId? }
 *
 * Proof retrieval:
 *   GET  /executions/:jobId/proof               — manifest of files
 *   GET  /executions/:jobId/proof/:filename     — single file (read)
 *
 * Emergency stop:
 *   POST /executor/emergency-stop               { active, reason }
 *   GET  /executor/emergency-stop               — current state
 */

import { Router } from "express";
import { readFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { createHash } from "crypto";
import {
  executeApproved,
  listProofManifest,
  getProofDir,
  isEmergencyStopActive,
  activateEmergencyStop,
  clearEmergencyStop,
  redact,
} from "../lib/approved-executor.js";
import { ensureItExecutorRegistered, IT_EXECUTOR_KIND } from "../lib/it-support-executor.js";
import { getItSupportArtifact } from "../lib/it-support.js";
import { createApprovalRequest } from "../lib/approval-queue.js";

const router = Router();

// Ensure the IT executor is registered on first request
ensureItExecutorRegistered();

function bad(message: string) {
  return { success: false, message };
}

function buildItPayload(artifactId: string, scriptBody: string) {
  return {
    artifactId,
    scriptBodyHash: createHash("sha256").update(scriptBody).digest("hex"),
  };
}

// ─── IT Support: validate ───────────────────────────────────────────────────

router.post("/it-support/executor/validate", async (req, res) => {
  const artifactId = typeof req.body?.artifactId === "string" ? req.body.artifactId : "";
  if (!artifactId) return res.status(400).json(bad("artifactId required"));

  const artifact = getItSupportArtifact(artifactId);
  if (!artifact) return res.status(404).json(bad("Artifact not found"));

  // Validate doesn't require approval — pass an empty approvalId and skip checks
  const result = await executeApproved({
    executorKind: IT_EXECUTOR_KIND,
    approvalId: "",
    requestedAction: `Validate IT support script: ${artifact.title}`,
    mode: "validate",
    payload: buildItPayload(artifactId, artifact.scriptBody),
    skipRuntimeModeCheck: true,
  });

  return res.json(result);
});

// ─── IT Support: dry run ────────────────────────────────────────────────────

router.post("/it-support/executor/dry-run", async (req, res) => {
  const artifactId = typeof req.body?.artifactId === "string" ? req.body.artifactId : "";
  if (!artifactId) return res.status(400).json(bad("artifactId required"));

  const artifact = getItSupportArtifact(artifactId);
  if (!artifact) return res.status(404).json(bad("Artifact not found"));

  // Dry-run requires an approval, but we'll auto-create a tier2 one for it
  const payload = buildItPayload(artifactId, artifact.scriptBody);
  const approval = createApprovalRequest({
    type: IT_EXECUTOR_KIND,
    title: `Dry-run: ${artifact.title}`,
    summary: `Dry-run only (no real execution) of script ${artifactId}`,
    riskTier: "tier2_safe_local_execute",
    requestedAction: `Dry-run IT support script ${artifactId}`,
    payload,
  });

  // Auto-approve dry-runs — they're sandboxed by -WhatIf
  const { approveRequest } = await import("../lib/approval-queue.js");
  approveRequest(approval.id, "Auto-approved: dry-run only (-WhatIf)");

  const result = await executeApproved({
    executorKind: IT_EXECUTOR_KIND,
    approvalId: approval.id,
    requestedAction: `Dry-run IT support script: ${artifact.title}`,
    mode: "dry_run",
    payload,
  });

  return res.json(result);
});

// ─── IT Support: execute (real) ─────────────────────────────────────────────

router.post("/it-support/executor/execute", async (req, res) => {
  const artifactId = typeof req.body?.artifactId === "string" ? req.body.artifactId : "";
  const approvalId = typeof req.body?.approvalId === "string" ? req.body.approvalId : "";
  if (!artifactId) return res.status(400).json(bad("artifactId required"));
  if (!approvalId) return res.status(400).json(bad("approvalId required for execute mode"));

  const artifact = getItSupportArtifact(artifactId);
  if (!artifact) return res.status(404).json(bad("Artifact not found"));

  const result = await executeApproved({
    executorKind: IT_EXECUTOR_KIND,
    approvalId,
    requestedAction: `Execute IT support script: ${artifact.title}`,
    mode: "execute",
    payload: buildItPayload(artifactId, artifact.scriptBody),
  });

  return res.json(result);
});

// ─── IT Support: verify ─────────────────────────────────────────────────────

router.post("/it-support/executor/verify", async (req, res) => {
  const artifactId = typeof req.body?.artifactId === "string" ? req.body.artifactId : "";
  const approvalId = typeof req.body?.approvalId === "string" ? req.body.approvalId : "";
  if (!artifactId) return res.status(400).json(bad("artifactId required"));

  const artifact = getItSupportArtifact(artifactId);
  if (!artifact) return res.status(404).json(bad("Artifact not found"));

  // Verify is metadata-only — no real execution. Use validate-only path if no approval.
  let useApprovalId = approvalId;
  if (!useApprovalId) {
    const a = createApprovalRequest({
      type: IT_EXECUTOR_KIND,
      title: `Verify: ${artifact.title}`,
      summary: `Verification step listing for artifact ${artifactId}`,
      riskTier: "tier2_safe_local_execute",
      requestedAction: `Verify IT support script ${artifactId}`,
      payload: buildItPayload(artifactId, artifact.scriptBody),
    });
    const { approveRequest } = await import("../lib/approval-queue.js");
    approveRequest(a.id, "Auto-approved: verification metadata only");
    useApprovalId = a.id;
  }

  const result = await executeApproved({
    executorKind: IT_EXECUTOR_KIND,
    approvalId: useApprovalId,
    requestedAction: `Verify IT support script: ${artifact.title}`,
    mode: "verify",
    payload: buildItPayload(artifactId, artifact.scriptBody),
  });

  return res.json(result);
});

// ─── Proof retrieval ────────────────────────────────────────────────────────

router.get("/executions/:jobId/proof", async (req, res) => {
  const jobId = req.params["jobId"]!;
  const dir = getProofDir(jobId);
  if (!existsSync(dir)) return res.status(404).json(bad("Proof bundle not found"));
  const manifest = await listProofManifest(jobId);
  return res.json({
    success: true,
    jobId,
    proofDir: dir,
    manifest,
  });
});

router.get("/executions/:jobId/proof/:filename", async (req, res) => {
  const jobId = req.params["jobId"]!;
  const filename = req.params["filename"]!;

  // Path traversal guard
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return res.status(400).json(bad("Invalid filename"));
  }

  const dir = getProofDir(jobId);
  const fp = path.join(dir, filename);
  if (!existsSync(fp)) return res.status(404).json(bad("Proof file not found"));

  try {
    const content = await readFile(fp, "utf-8");
    // Redact log files automatically; show JSON/MD raw
    const isLog = filename.endsWith(".log");
    const body = isLog ? redact(content, 100_000) : content;

    if (filename.endsWith(".json")) {
      res.setHeader("Content-Type", "application/json");
    } else if (filename.endsWith(".md")) {
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    } else {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    return res.send(body);
  } catch (err) {
    return res.status(500).json(bad(`Failed to read proof file: ${(err as Error).message}`));
  }
});

// ─── Emergency stop ─────────────────────────────────────────────────────────

router.get("/executor/emergency-stop", (_req, res) => {
  return res.json({ success: true, active: isEmergencyStopActive() });
});

router.post("/executor/emergency-stop", (req, res) => {
  const active = req.body?.active === true;
  const reason = typeof req.body?.reason === "string" ? req.body.reason : "User-initiated";
  if (active) {
    activateEmergencyStop(reason);
  } else {
    clearEmergencyStop(reason);
  }
  return res.json({ success: true, active });
});

export default router;
