import { Router } from "express";
import {
  createRefactorPlan,
  executeRefactorPlan,
  getRefactorPlan,
  getRefactorJob,
  listRefactorJobs,
} from "../lib/global-workspace-intelligence.js";
import { agentEditsGuard, agentRefactorGuard } from "../lib/route-guards.js";
import {
  createApprovalRequest,
  verifyApprovedRequest,
} from "../lib/approval-queue.js";
import {
  getCodingAgentStatus,
  getCodingAgentProfile,
  saveCodingAgentProfile,
  validateWorkspacePath,
  proposeCodingTask,
} from "../lib/coding-agent.js";
import {
  getLocalBuilderStatus,
  getLocalBuilderProfiles,
  saveLocalBuilderProfile,
  getContextPacks,
  getContextPack,
  proposeBuildTask,
  runLocalBuilderEval,
  getEvalHistory,
  ALL_ROLES as LOCAL_BUILDER_ALL_ROLES,
  type LocalBuilderModelRole,
  type LocalBuilderEvalName,
} from "../lib/local-builder.js";

const router = Router();

// ---------------------------------------------------------------------------
// Refactor plan
// ---------------------------------------------------------------------------

router.post("/intelligence/refactors/plan", async (req, res) => {
  const body          = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
  const request       = typeof body["request"]       === "string" ? (body["request"] as string).trim()       : "";
  const workspacePath = typeof body["workspacePath"] === "string" ? (body["workspacePath"] as string).trim() : undefined;
  if (!request) return res.status(400).json({ success: false, message: "request is required" });
  try {
    const plan = await createRefactorPlan(request, workspacePath);
    return res.json({ success: true, plan });
  } catch (err) { return res.status(400).json({ success: false, message: (err as Error).message }); }
});

router.get("/intelligence/refactors/plan/:planId", (req, res) => {
  const plan = getRefactorPlan(req.params["planId"]!);
  if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });
  return res.json({ success: true, plan });
});

// ---------------------------------------------------------------------------
// Execute — requires approval before execution (Phase 10 gate)
// ---------------------------------------------------------------------------

router.post("/intelligence/refactors/:planId/execute", agentRefactorGuard((req) => `execute refactor plan ${String(req.params["planId"])}`), agentEditsGuard((req) => `execute refactor plan ${String(req.params["planId"])}`), async (req, res) => {
    const body       = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
    const model      = typeof body["model"]      === "string" ? (body["model"] as string).trim()      : undefined;
    const approvalId = typeof body["approvalId"] === "string" ? (body["approvalId"] as string).trim() : undefined;

    const plan = getRefactorPlan(String(req.params["planId"]));
    if (!plan) return res.status(400).json({ success: false, message: "Plan not found" });

    // Phase 10: validate workspace path against coding agent profile allowlist
    const profile = getCodingAgentProfile();
    if (plan.workspacePath) {
      const pathCheck = validateWorkspacePath(plan.workspacePath, profile);
      if (!pathCheck.allowed) {
        return res.status(403).json({
          success: false,
          message: pathCheck.reason,
          approvalRequired: false,
          workspaceBlocked: true,
        });
      }
    }

    // Phase 10: require approval before any file modification
    const APPROVAL_TYPE = "coding_agent_execute_refactor";

    if (!approvalId) {
      // No approval provided — create one and return 202
      const approval = await createApprovalRequest({
        type:            APPROVAL_TYPE,
        title:           `Execute refactor plan: ${plan.request.slice(0, 80)}`,
        summary:
          `Approve execution of refactor plan ${plan.id} in ${plan.workspacePath ?? "workspace"}. ` +
          `${plan.steps.length} step(s). Request: ${plan.request.slice(0, 200)}`,
        riskTier:        "tier3_file_modification",
        requestedAction: `execute_refactor.${plan.id}`,
        payload: {
          planId:        plan.id,
          workspacePath: plan.workspacePath,
          stepsCount:    plan.steps.length,
          request:       plan.request.slice(0, 200),
        },
      });
      return res.status(202).json({
        success:          false,
        approvalRequired: true,
        message:          "Approval is required before executing a refactor plan. Submit the returned approvalId to proceed.",
        approval,
      });
    }

    // Approval ID provided — verify it
    const verification = verifyApprovedRequest(approvalId, {
      planId:        plan.id,
      workspacePath: plan.workspacePath,
      stepsCount:    plan.steps.length,
      request:       plan.request.slice(0, 200),
    }, APPROVAL_TYPE);

    if (!verification.allowed) {
      return res.status(403).json({
        success:  false,
        message:  verification.message,
        approval: verification.approval,
      });
    }

    try {
      const job = await executeRefactorPlan(String(req.params["planId"]), model);
      return res.json({ success: true, job });
    } catch (err) { return res.status(400).json({ success: false, message: (err as Error).message }); }
  },
);

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

router.get("/intelligence/refactors/jobs", (_req, res) => res.json({ success: true, jobs: listRefactorJobs() }));

router.get("/intelligence/refactors/jobs/:jobId", (req, res) => {
  const job = getRefactorJob(req.params["jobId"]!);
  if (!job) return res.status(404).json({ success: false, message: "Job not found" });
  return res.json({ success: true, job });
});

// ---------------------------------------------------------------------------
// Coding-agent status / profile routes
// ---------------------------------------------------------------------------

router.get("/intelligence/coding-agent/status", (_req, res) => {
  try {
    const status = getCodingAgentStatus(false);
    return res.json({ success: true, status });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.get("/intelligence/coding-agent/profile", (_req, res) => {
  try {
    const profile = getCodingAgentProfile();
    return res.json({ success: true, profile });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.put("/intelligence/coding-agent/profile", agentEditsGuard(() => "update coding agent profile"), (req, res) => {
  try {
    const body = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
    const profile = saveCodingAgentProfile(body as Parameters<typeof saveCodingAgentProfile>[0]);
    return res.json({ success: true, profile });
  } catch (err) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }
});

router.post("/intelligence/coding-agent/task/propose", async (req, res) => {
  try {
    const body          = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
    const request       = typeof body["request"]       === "string" ? (body["request"] as string).trim()       : "";
    const workspacePath = typeof body["workspacePath"] === "string" ? (body["workspacePath"] as string).trim() : "";
    const targetFiles   = Array.isArray(body["targetFiles"])
      ? (body["targetFiles"] as unknown[]).filter((f): f is string => typeof f === "string")
      : undefined;
    if (!request)       return res.status(400).json({ success: false, message: "request is required" });
    if (!workspacePath) return res.status(400).json({ success: false, message: "workspacePath is required" });
    const result = await proposeCodingTask({ request, workspacePath, targetFiles });
    return res.status(result.success ? 200 : 202).json({ success: result.success, proposal: result.proposal });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Local Builder — Phase 22
// ---------------------------------------------------------------------------

router.get("/intelligence/local-builder/status", (_req, res) => {
  try {
    const status = getLocalBuilderStatus();
    return res.json({ success: true, status });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.get("/intelligence/local-builder/profiles", (_req, res) => {
  try {
    const profiles = getLocalBuilderProfiles();
    return res.json({ success: true, profiles });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.put("/intelligence/local-builder/profiles/:role", agentEditsGuard((req) => `update local-builder profile for role ${String(req.params["role"])}`), (req, res) => {
  try {
    const role = req.params["role"] as string;
    if (!(LOCAL_BUILDER_ALL_ROLES as readonly string[]).includes(role)) {
      return res.status(400).json({ success: false, message: `Unknown builder role: ${role}` });
    }
    const body       = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
    const modelName  = typeof body["modelName"]  === "string" ? (body["modelName"] as string).trim() || null : undefined;
    const status     = typeof body["status"]     === "string" ? (body["status"] as string).trim()           : undefined;
    const unavailableReason = typeof body["unavailableReason"] === "string" ? (body["unavailableReason"] as string).trim() : undefined;
    const profile = saveLocalBuilderProfile(role as LocalBuilderModelRole, {
      modelName:  modelName as string | null | undefined,
      status:     status as "not_configured" | "configured" | "unavailable" | undefined,
      unavailableReason,
    });
    return res.json({ success: true, profile });
  } catch (err) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }
});

router.get("/intelligence/local-builder/context-packs", async (_req, res) => {
  try {
    const packs = await getContextPacks();
    // Return metadata only (no full content) for list view
    return res.json({
      success: true,
      packs: packs.map(({ name, title, description, sizeBytes, loadedAt }) => ({
        name, title, description, sizeBytes, loadedAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.get("/intelligence/local-builder/context-packs/:name", async (req, res) => {
  try {
    const pack = await getContextPack(req.params["name"]!);
    if (!pack) return res.status(404).json({ success: false, message: "Context pack not found" });
    return res.json({ success: true, pack });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.post("/intelligence/local-builder/build/propose", async (req, res) => {
  try {
    const body         = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
    const phaseId      = typeof body["phaseId"]      === "string" ? (body["phaseId"] as string).trim()      : "";
    const taskSummary  = typeof body["taskSummary"]  === "string" ? (body["taskSummary"] as string).trim()  : "";
    const contextPacks = Array.isArray(body["contextPacks"])
      ? (body["contextPacks"] as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    const targetFiles  = Array.isArray(body["targetFiles"])
      ? (body["targetFiles"] as unknown[]).filter((v): v is string => typeof v === "string")
      : undefined;
    const workspacePath = typeof body["workspacePath"] === "string" ? (body["workspacePath"] as string).trim() : undefined;
    if (!phaseId)     return res.status(400).json({ success: false, message: "phaseId is required" });
    if (!taskSummary) return res.status(400).json({ success: false, message: "taskSummary is required" });
    const result = await proposeBuildTask({ phaseId, taskSummary, contextPacks, targetFiles, workspacePath });
    return res.status(result.success ? 200 : 202).json({ success: result.success, proposal: result.proposal });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.post("/intelligence/local-builder/eval/run", async (req, res) => {
  try {
    const body     = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
    const evalName = typeof body["evalName"] === "string" ? (body["evalName"] as string).trim() : "";
    const VALID_EVALS: LocalBuilderEvalName[] = ["repo_summary", "safe_patch_plan", "unsafe_action_detection", "ledger_update"];
    if (!VALID_EVALS.includes(evalName as LocalBuilderEvalName)) {
      return res.status(400).json({ success: false, message: `evalName must be one of: ${VALID_EVALS.join(", ")}` });
    }
    const result = await runLocalBuilderEval(evalName as LocalBuilderEvalName);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.get("/intelligence/local-builder/eval/history", (_req, res) => {
  try {
    const history = getEvalHistory(50);
    return res.json({ success: true, history });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
