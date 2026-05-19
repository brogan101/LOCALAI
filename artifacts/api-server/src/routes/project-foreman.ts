/**
 * PROJECT FOREMAN ROUTES
 * ======================
 * REST API for the unified workflow surface.
 *
 * GET    /project-foreman/status                       — dashboard summary
 * GET    /project-foreman/projects                     — list projects (filters: status, kind)
 * POST   /project-foreman/projects                     — create
 * GET    /project-foreman/projects/:id                 — full detail (tasks + links)
 * PATCH  /project-foreman/projects/:id                 — update fields
 * POST   /project-foreman/projects/:id/archive         — archive
 * POST   /project-foreman/projects/:id/plan            — generate plan + tasks
 * GET    /project-foreman/projects/:id/documentation   — final markdown package
 *
 * POST   /project-foreman/projects/:id/tasks           — add task
 * PATCH  /project-foreman/tasks/:taskId                — update task state/fields
 * DELETE /project-foreman/tasks/:taskId                — remove
 *
 * POST   /project-foreman/projects/:id/links           — add cross-system link
 * GET    /project-foreman/projects/:id/links           — list links
 * DELETE /project-foreman/links/:linkId                — remove link
 */

import { Router } from "express";
import {
  createProject,
  getProject,
  getProjectDetail,
  listProjects,
  updateProject,
  archiveProject,
  generatePlan,
  createTask,
  updateTask,
  deleteTask,
  addLink,
  listLinks,
  removeLink,
  getStatus,
  buildFinalDocumentation,
  type ProjectKind,
  type ProjectStatus,
  type RiskLevel,
  type LinkKind,
  type TaskState,
} from "../lib/project-foreman.js";

const router = Router();

const VALID_KINDS: ProjectKind[] = [
  "general", "automotive", "maker_3d_print", "maker_cnc", "maker_electronics",
  "homelab_network", "it_support", "code_change", "research",
];
const VALID_RISKS: RiskLevel[] = ["low", "medium", "high", "critical"];
const VALID_TASK_STATES: TaskState[] = [
  "todo", "in_progress", "blocked", "awaiting_approval", "executing", "verifying", "done", "skipped",
];
const VALID_LINK_KINDS: LinkKind[] = [
  "evidence", "rag_collection", "inventory_item", "maker_project", "automotive_case",
  "digital_twin", "it_support", "approval", "durable_job", "code_workspace", "external_url",
];

function bad(message: string): { success: false; message: string } {
  return { success: false, message };
}

// ─── GET /project-foreman/status ────────────────────────────────────────────

router.get("/project-foreman/status", (_req, res) => {
  return res.json({ success: true, status: getStatus() });
});

// ─── List + create ──────────────────────────────────────────────────────────

router.get("/project-foreman/projects", (req, res) => {
  const status = typeof req.query["status"] === "string" ? req.query["status"] as ProjectStatus : undefined;
  const kind = typeof req.query["kind"] === "string" ? req.query["kind"] as ProjectKind : undefined;
  const limit = Number(req.query["limit"]) || 100;
  return res.json({ success: true, projects: listProjects({ status, kind, limit }) });
});

router.post("/project-foreman/projects", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof body["name"] === "string" ? body["name"].trim() : "";
  const kind = body["kind"] as ProjectKind;
  const goal = typeof body["goal"] === "string" ? body["goal"].trim() : "";

  if (!name) return res.status(400).json(bad("name is required"));
  if (!VALID_KINDS.includes(kind)) return res.status(400).json(bad(`kind must be one of: ${VALID_KINDS.join(", ")}`));
  if (!goal) return res.status(400).json(bad("goal is required"));

  const riskLevel = (body["riskLevel"] as RiskLevel) || "medium";
  if (!VALID_RISKS.includes(riskLevel)) return res.status(400).json(bad(`riskLevel must be one of: ${VALID_RISKS.join(", ")}`));

  const project = createProject({
    name,
    kind,
    goal,
    riskLevel,
    workspacePath: typeof body["workspacePath"] === "string" ? body["workspacePath"] : undefined,
    brief: typeof body["brief"] === "string" ? body["brief"] : undefined,
    dueAt: typeof body["dueAt"] === "string" ? body["dueAt"] : undefined,
    metadata: typeof body["metadata"] === "object" ? body["metadata"] as Record<string, unknown> : undefined,
  });

  return res.json({ success: true, project });
});

// ─── Detail / update / archive ─────────────────────────────────────────────

router.get("/project-foreman/projects/:id", (req, res) => {
  const detail = getProjectDetail(req.params["id"]!);
  if (!detail) return res.status(404).json(bad("Project not found"));
  return res.json({ success: true, ...detail });
});

router.patch("/project-foreman/projects/:id", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body["riskLevel"] && !VALID_RISKS.includes(body["riskLevel"] as RiskLevel)) {
    return res.status(400).json(bad(`riskLevel must be one of: ${VALID_RISKS.join(", ")}`));
  }
  const updated = updateProject(req.params["id"]!, body);
  if (!updated) return res.status(404).json(bad("Project not found"));
  return res.json({ success: true, project: updated });
});

router.post("/project-foreman/projects/:id/archive", (req, res) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
  const project = archiveProject(req.params["id"]!, reason);
  if (!project) return res.status(404).json(bad("Project not found"));
  return res.json({ success: true, project });
});

// ─── Plan generation ───────────────────────────────────────────────────────

router.post("/project-foreman/projects/:id/plan", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const result = generatePlan(req.params["id"]!, {
    brief: typeof body["brief"] === "string" ? body["brief"] : undefined,
    knownFacts: Array.isArray(body["knownFacts"]) ? body["knownFacts"] as string[] : undefined,
    unknowns: Array.isArray(body["unknowns"]) ? body["unknowns"] as string[] : undefined,
    assumptions: Array.isArray(body["assumptions"]) ? body["assumptions"] as string[] : undefined,
    safetyChecklist: Array.isArray(body["safetyChecklist"]) ? body["safetyChecklist"] as string[] : undefined,
    rollbackPlan: typeof body["rollbackPlan"] === "string" ? body["rollbackPlan"] : undefined,
    proposedTasks: Array.isArray(body["proposedTasks"]) ? body["proposedTasks"] as Array<{ title: string; description?: string; proposedAction?: string }> : undefined,
  });
  if (!result) return res.status(404).json(bad("Project not found"));
  return res.json({ success: true, ...result });
});

// ─── Documentation ─────────────────────────────────────────────────────────

router.get("/project-foreman/projects/:id/documentation", (req, res) => {
  const md = buildFinalDocumentation(req.params["id"]!);
  if (!md) return res.status(404).json(bad("Project not found"));
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  return res.send(md);
});

// ─── Tasks ─────────────────────────────────────────────────────────────────

router.post("/project-foreman/projects/:id/tasks", (req, res) => {
  const project = getProject(req.params["id"]!);
  if (!project) return res.status(404).json(bad("Project not found"));

  const body = (req.body ?? {}) as Record<string, unknown>;
  const title = typeof body["title"] === "string" ? body["title"].trim() : "";
  if (!title) return res.status(400).json(bad("title is required"));

  const task = createTask(req.params["id"]!, {
    title,
    description: typeof body["description"] === "string" ? body["description"] : undefined,
    proposedAction: typeof body["proposedAction"] === "string" ? body["proposedAction"] : undefined,
    orderIndex: typeof body["orderIndex"] === "number" ? body["orderIndex"] : undefined,
    metadata: typeof body["metadata"] === "object" ? body["metadata"] as Record<string, unknown> : undefined,
  });

  return res.json({ success: true, task });
});

router.patch("/project-foreman/tasks/:taskId", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body["state"] && !VALID_TASK_STATES.includes(body["state"] as TaskState)) {
    return res.status(400).json(bad(`state must be one of: ${VALID_TASK_STATES.join(", ")}`));
  }
  const updated = updateTask(req.params["taskId"]!, body);
  if (!updated) return res.status(404).json(bad("Task not found"));
  return res.json({ success: true, task: updated });
});

router.delete("/project-foreman/tasks/:taskId", (req, res) => {
  const ok = deleteTask(req.params["taskId"]!);
  if (!ok) return res.status(404).json(bad("Task not found"));
  return res.json({ success: true });
});

// ─── Links ─────────────────────────────────────────────────────────────────

router.get("/project-foreman/projects/:id/links", (req, res) => {
  const kind = typeof req.query["kind"] === "string" ? req.query["kind"] as LinkKind : undefined;
  const links = listLinks(req.params["id"]!, kind);
  return res.json({ success: true, links });
});

router.post("/project-foreman/projects/:id/links", (req, res) => {
  const project = getProject(req.params["id"]!);
  if (!project) return res.status(404).json(bad("Project not found"));

  const body = (req.body ?? {}) as Record<string, unknown>;
  const kind = body["kind"] as LinkKind;
  const targetId = typeof body["targetId"] === "string" ? body["targetId"] : "";
  const label = typeof body["label"] === "string" ? body["label"] : "";

  if (!VALID_LINK_KINDS.includes(kind)) return res.status(400).json(bad(`kind must be one of: ${VALID_LINK_KINDS.join(", ")}`));
  if (!targetId) return res.status(400).json(bad("targetId is required"));
  if (!label) return res.status(400).json(bad("label is required"));

  const link = addLink(req.params["id"]!, kind, targetId, label,
    typeof body["metadata"] === "object" ? body["metadata"] as Record<string, unknown> : undefined);

  return res.json({ success: true, link });
});

router.delete("/project-foreman/links/:linkId", (req, res) => {
  const ok = removeLink(req.params["linkId"]!);
  if (!ok) return res.status(404).json(bad("Link not found"));
  return res.json({ success: true });
});

export default router;
