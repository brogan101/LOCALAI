/**
 * PROJECT FOREMAN — unified cross-system project orchestrator
 * ===========================================================
 * Phase 24. Closes B-012 by connecting the strongest existing modules into
 * one coherent workflow surface:
 *
 *   idea → plan → files/evidence → inventory → fabrication/IT/automotive
 *        → verification → final documentation package
 *
 * Project Foreman is the source of truth for project metadata, plan steps,
 * and cross-system links — it does NOT duplicate Inventory, Maker Studio,
 * Evidence Vault, Digital Twin, IT Support, or Automotive. It refers to them
 * by id and uses their existing routes for any real action.
 *
 * Storage: local SQLite, lazy DDL (matches existing repo style for newer libs).
 * Tables: project_foreman_projects, project_foreman_tasks, project_foreman_links.
 *
 * No physical actions executed here. All cross-system actions go through
 * existing approval queues and the approved-executor framework.
 */

import { randomUUID } from "crypto";
import { sqlite } from "../db/database.js";
import { thoughtLog } from "./thought-log.js";
import { recordAuditEvent } from "./platform-foundation.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ProjectKind =
  | "general"
  | "automotive"
  | "maker_3d_print"
  | "maker_cnc"
  | "maker_electronics"
  | "homelab_network"
  | "it_support"
  | "code_change"
  | "research";

export type ProjectStatus =
  | "draft"
  | "planning"
  | "in_progress"
  | "blocked"
  | "verifying"
  | "completed"
  | "archived";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type LinkKind =
  | "evidence"        // Evidence Vault record id
  | "rag_collection"  // RAG collection id
  | "inventory_item"  // Inventory item id
  | "maker_project"   // Maker Studio project id
  | "automotive_case" // Automotive diagnostics case id
  | "digital_twin"    // Digital Twin entity id
  | "it_support"      // IT Support artifact id
  | "approval"        // Approval request id
  | "durable_job"     // Durable job id
  | "code_workspace"  // Workspace path/id
  | "external_url";   // Reference URL

export type TaskState =
  | "todo"
  | "in_progress"
  | "blocked"
  | "awaiting_approval"
  | "executing"
  | "verifying"
  | "done"
  | "skipped";

export interface ProjectForemanProject {
  id: string;
  name: string;
  kind: ProjectKind;
  goal: string;
  status: ProjectStatus;
  riskLevel: RiskLevel;
  workspacePath?: string;
  brief: string;
  knownFacts: string[];
  unknowns: string[];
  assumptions: string[];
  safetyChecklist: string[];
  rollbackPlan: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  dueAt?: string;
  completedAt?: string;
}

export interface ProjectForemanTask {
  id: string;
  projectId: string;
  title: string;
  description: string;
  state: TaskState;
  orderIndex: number;
  proposedAction?: string;
  approvalId?: string;
  durableJobId?: string;
  proofRef?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ProjectForemanLink {
  id: string;
  projectId: string;
  kind: LinkKind;
  targetId: string;
  label: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreateProjectInput {
  name: string;
  kind: ProjectKind;
  goal: string;
  riskLevel?: RiskLevel;
  workspacePath?: string;
  brief?: string;
  dueAt?: string;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lazy DDL — runs once on first call
// ─────────────────────────────────────────────────────────────────────────────

let schemaReady = false;

function ensureSchema(): void {
  if (schemaReady) return;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS project_foreman_projects (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      kind            TEXT NOT NULL,
      goal            TEXT NOT NULL DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'draft',
      risk_level      TEXT NOT NULL DEFAULT 'medium',
      workspace_path  TEXT,
      brief           TEXT NOT NULL DEFAULT '',
      known_facts     TEXT NOT NULL DEFAULT '[]',
      unknowns        TEXT NOT NULL DEFAULT '[]',
      assumptions     TEXT NOT NULL DEFAULT '[]',
      safety_checks   TEXT NOT NULL DEFAULT '[]',
      rollback_plan   TEXT NOT NULL DEFAULT '',
      metadata        TEXT NOT NULL DEFAULT '{}',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      due_at          TEXT,
      completed_at    TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_pf_projects_status ON project_foreman_projects(status);
    CREATE INDEX IF NOT EXISTS idx_pf_projects_kind ON project_foreman_projects(kind);

    CREATE TABLE IF NOT EXISTS project_foreman_tasks (
      id                TEXT PRIMARY KEY,
      project_id        TEXT NOT NULL,
      title             TEXT NOT NULL,
      description       TEXT NOT NULL DEFAULT '',
      state             TEXT NOT NULL DEFAULT 'todo',
      order_index       INTEGER NOT NULL DEFAULT 0,
      proposed_action   TEXT,
      approval_id       TEXT,
      durable_job_id    TEXT,
      proof_ref         TEXT,
      metadata          TEXT NOT NULL DEFAULT '{}',
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL,
      completed_at      TEXT,
      FOREIGN KEY (project_id) REFERENCES project_foreman_projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pf_tasks_project ON project_foreman_tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_pf_tasks_state ON project_foreman_tasks(state);

    CREATE TABLE IF NOT EXISTS project_foreman_links (
      id           TEXT PRIMARY KEY,
      project_id   TEXT NOT NULL,
      kind         TEXT NOT NULL,
      target_id    TEXT NOT NULL,
      label        TEXT NOT NULL DEFAULT '',
      metadata     TEXT NOT NULL DEFAULT '{}',
      created_at   TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES project_foreman_projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pf_links_project ON project_foreman_links(project_id);
    CREATE INDEX IF NOT EXISTS idx_pf_links_target ON project_foreman_links(kind, target_id);
  `);
  schemaReady = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row mappers
// ─────────────────────────────────────────────────────────────────────────────

function projectFromRow(row: Record<string, unknown>): ProjectForemanProject {
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    kind: row["kind"] as ProjectKind,
    goal: row["goal"] as string,
    status: row["status"] as ProjectStatus,
    riskLevel: row["risk_level"] as RiskLevel,
    workspacePath: (row["workspace_path"] as string | null) ?? undefined,
    brief: row["brief"] as string,
    knownFacts: JSON.parse((row["known_facts"] as string) || "[]"),
    unknowns: JSON.parse((row["unknowns"] as string) || "[]"),
    assumptions: JSON.parse((row["assumptions"] as string) || "[]"),
    safetyChecklist: JSON.parse((row["safety_checks"] as string) || "[]"),
    rollbackPlan: row["rollback_plan"] as string,
    metadata: JSON.parse((row["metadata"] as string) || "{}"),
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
    dueAt: (row["due_at"] as string | null) ?? undefined,
    completedAt: (row["completed_at"] as string | null) ?? undefined,
  };
}

function taskFromRow(row: Record<string, unknown>): ProjectForemanTask {
  return {
    id: row["id"] as string,
    projectId: row["project_id"] as string,
    title: row["title"] as string,
    description: row["description"] as string,
    state: row["state"] as TaskState,
    orderIndex: row["order_index"] as number,
    proposedAction: (row["proposed_action"] as string | null) ?? undefined,
    approvalId: (row["approval_id"] as string | null) ?? undefined,
    durableJobId: (row["durable_job_id"] as string | null) ?? undefined,
    proofRef: (row["proof_ref"] as string | null) ?? undefined,
    metadata: JSON.parse((row["metadata"] as string) || "{}"),
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
    completedAt: (row["completed_at"] as string | null) ?? undefined,
  };
}

function linkFromRow(row: Record<string, unknown>): ProjectForemanLink {
  return {
    id: row["id"] as string,
    projectId: row["project_id"] as string,
    kind: row["kind"] as LinkKind,
    targetId: row["target_id"] as string,
    label: row["label"] as string,
    metadata: JSON.parse((row["metadata"] as string) || "{}"),
    createdAt: row["created_at"] as string,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Project CRUD
// ─────────────────────────────────────────────────────────────────────────────

export function createProject(input: CreateProjectInput): ProjectForemanProject {
  ensureSchema();
  const now = new Date().toISOString();
  const id = `pf_${randomUUID()}`;

  sqlite.prepare(`
    INSERT INTO project_foreman_projects
      (id, name, kind, goal, status, risk_level, workspace_path, brief,
       known_facts, unknowns, assumptions, safety_checks, rollback_plan,
       metadata, created_at, updated_at, due_at)
    VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, '[]', '[]', '[]', '[]', '', ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    input.kind,
    input.goal,
    input.riskLevel ?? "medium",
    input.workspacePath ?? null,
    input.brief ?? "",
    JSON.stringify(input.metadata ?? {}),
    now,
    now,
    input.dueAt ?? null,
  );

  recordAuditEvent({
    eventType: "project_foreman.created",
    action: "create",
    target: id,
    metadata: { name: input.name, kind: input.kind, riskLevel: input.riskLevel ?? "medium" },
  });

  thoughtLog.publish({
    category: "kernel",
    title: "Project Foreman: Project created",
    message: `${input.name} (${input.kind})`,
    metadata: { projectId: id },
  });

  return getProject(id)!;
}

export function getProject(id: string): ProjectForemanProject | null {
  ensureSchema();
  const row = sqlite.prepare("SELECT * FROM project_foreman_projects WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? projectFromRow(row) : null;
}

export function listProjects(filter?: { status?: ProjectStatus; kind?: ProjectKind; limit?: number }): ProjectForemanProject[] {
  ensureSchema();
  const limit = filter?.limit ?? 100;
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (filter?.status) { conditions.push("status = ?"); params.push(filter.status); }
  if (filter?.kind) { conditions.push("kind = ?"); params.push(filter.kind); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = sqlite
    .prepare(`SELECT * FROM project_foreman_projects ${where} ORDER BY updated_at DESC LIMIT ?`)
    .all(...params, limit) as Record<string, unknown>[];
  return rows.map(projectFromRow);
}

export interface UpdateProjectInput {
  name?: string;
  goal?: string;
  status?: ProjectStatus;
  riskLevel?: RiskLevel;
  brief?: string;
  knownFacts?: string[];
  unknowns?: string[];
  assumptions?: string[];
  safetyChecklist?: string[];
  rollbackPlan?: string;
  workspacePath?: string;
  dueAt?: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export function updateProject(id: string, update: UpdateProjectInput): ProjectForemanProject | null {
  ensureSchema();
  const existing = getProject(id);
  if (!existing) return null;

  const next = {
    name: update.name ?? existing.name,
    goal: update.goal ?? existing.goal,
    status: update.status ?? existing.status,
    riskLevel: update.riskLevel ?? existing.riskLevel,
    brief: update.brief ?? existing.brief,
    knownFacts: update.knownFacts ?? existing.knownFacts,
    unknowns: update.unknowns ?? existing.unknowns,
    assumptions: update.assumptions ?? existing.assumptions,
    safetyChecklist: update.safetyChecklist ?? existing.safetyChecklist,
    rollbackPlan: update.rollbackPlan ?? existing.rollbackPlan,
    workspacePath: update.workspacePath ?? existing.workspacePath ?? null,
    dueAt: update.dueAt ?? existing.dueAt ?? null,
    completedAt: update.completedAt ?? existing.completedAt ?? null,
    metadata: { ...existing.metadata, ...(update.metadata ?? {}) },
    updatedAt: new Date().toISOString(),
  };

  sqlite.prepare(`
    UPDATE project_foreman_projects
    SET name = ?, goal = ?, status = ?, risk_level = ?, workspace_path = ?, brief = ?,
        known_facts = ?, unknowns = ?, assumptions = ?, safety_checks = ?, rollback_plan = ?,
        metadata = ?, updated_at = ?, due_at = ?, completed_at = ?
    WHERE id = ?
  `).run(
    next.name, next.goal, next.status, next.riskLevel, next.workspacePath, next.brief,
    JSON.stringify(next.knownFacts), JSON.stringify(next.unknowns), JSON.stringify(next.assumptions),
    JSON.stringify(next.safetyChecklist), next.rollbackPlan,
    JSON.stringify(next.metadata), next.updatedAt, next.dueAt, next.completedAt,
    id,
  );

  recordAuditEvent({
    eventType: "project_foreman.updated",
    action: "update",
    target: id,
    metadata: { fieldsChanged: Object.keys(update) },
  });

  return getProject(id);
}

export function archiveProject(id: string, reason?: string): ProjectForemanProject | null {
  ensureSchema();
  return updateProject(id, { status: "archived", metadata: { archiveReason: reason ?? "User archived" } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan generation — produces a structured project plan from inputs
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanGenerationInput {
  brief?: string;
  knownFacts?: string[];
  unknowns?: string[];
  assumptions?: string[];
  proposedTasks?: Array<{ title: string; description?: string; proposedAction?: string }>;
  safetyChecklist?: string[];
  rollbackPlan?: string;
}

export interface PlanGenerationResult {
  project: ProjectForemanProject;
  tasksCreated: ProjectForemanTask[];
}

export function generatePlan(projectId: string, input: PlanGenerationInput): PlanGenerationResult | null {
  ensureSchema();
  const project = getProject(projectId);
  if (!project) return null;

  const updated = updateProject(projectId, {
    status: "planning",
    brief: input.brief ?? project.brief,
    knownFacts: input.knownFacts ?? project.knownFacts,
    unknowns: input.unknowns ?? project.unknowns,
    assumptions: input.assumptions ?? project.assumptions,
    safetyChecklist: input.safetyChecklist ?? project.safetyChecklist,
    rollbackPlan: input.rollbackPlan ?? project.rollbackPlan,
  });

  const tasksCreated: ProjectForemanTask[] = [];
  const startIndex = listTasks(projectId).length;
  if (input.proposedTasks?.length) {
    input.proposedTasks.forEach((t, i) => {
      const created = createTask(projectId, {
        title: t.title,
        description: t.description ?? "",
        proposedAction: t.proposedAction,
        orderIndex: startIndex + i,
      });
      tasksCreated.push(created);
    });
  }

  recordAuditEvent({
    eventType: "project_foreman.plan_generated",
    action: "generate_plan",
    target: projectId,
    metadata: { tasksCreated: tasksCreated.length },
  });

  return { project: updated!, tasksCreated };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateTaskInput {
  title: string;
  description?: string;
  proposedAction?: string;
  orderIndex?: number;
  metadata?: Record<string, unknown>;
}

export function createTask(projectId: string, input: CreateTaskInput): ProjectForemanTask {
  ensureSchema();
  const now = new Date().toISOString();
  const id = `pft_${randomUUID()}`;
  const orderIndex = input.orderIndex ?? listTasks(projectId).length;

  sqlite.prepare(`
    INSERT INTO project_foreman_tasks
      (id, project_id, title, description, state, order_index, proposed_action, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?)
  `).run(
    id,
    projectId,
    input.title,
    input.description ?? "",
    orderIndex,
    input.proposedAction ?? null,
    JSON.stringify(input.metadata ?? {}),
    now,
    now,
  );

  return getTask(id)!;
}

export function getTask(id: string): ProjectForemanTask | null {
  ensureSchema();
  const row = sqlite.prepare("SELECT * FROM project_foreman_tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? taskFromRow(row) : null;
}

export function listTasks(projectId: string): ProjectForemanTask[] {
  ensureSchema();
  const rows = sqlite
    .prepare("SELECT * FROM project_foreman_tasks WHERE project_id = ? ORDER BY order_index ASC, created_at ASC")
    .all(projectId) as Record<string, unknown>[];
  return rows.map(taskFromRow);
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  state?: TaskState;
  orderIndex?: number;
  proposedAction?: string;
  approvalId?: string;
  durableJobId?: string;
  proofRef?: string;
  metadata?: Record<string, unknown>;
}

export function updateTask(id: string, update: UpdateTaskInput): ProjectForemanTask | null {
  ensureSchema();
  const existing = getTask(id);
  if (!existing) return null;

  const next = {
    title: update.title ?? existing.title,
    description: update.description ?? existing.description,
    state: update.state ?? existing.state,
    orderIndex: update.orderIndex ?? existing.orderIndex,
    proposedAction: update.proposedAction ?? existing.proposedAction ?? null,
    approvalId: update.approvalId ?? existing.approvalId ?? null,
    durableJobId: update.durableJobId ?? existing.durableJobId ?? null,
    proofRef: update.proofRef ?? existing.proofRef ?? null,
    metadata: { ...existing.metadata, ...(update.metadata ?? {}) },
    updatedAt: new Date().toISOString(),
    completedAt: update.state === "done" ? new Date().toISOString() : existing.completedAt ?? null,
  };

  sqlite.prepare(`
    UPDATE project_foreman_tasks
    SET title = ?, description = ?, state = ?, order_index = ?, proposed_action = ?,
        approval_id = ?, durable_job_id = ?, proof_ref = ?, metadata = ?, updated_at = ?, completed_at = ?
    WHERE id = ?
  `).run(
    next.title, next.description, next.state, next.orderIndex, next.proposedAction,
    next.approvalId, next.durableJobId, next.proofRef,
    JSON.stringify(next.metadata), next.updatedAt, next.completedAt,
    id,
  );

  return getTask(id);
}

export function deleteTask(id: string): boolean {
  ensureSchema();
  const result = sqlite.prepare("DELETE FROM project_foreman_tasks WHERE id = ?").run(id);
  return result.changes > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-system links
// ─────────────────────────────────────────────────────────────────────────────

export function addLink(
  projectId: string,
  kind: LinkKind,
  targetId: string,
  label: string,
  metadata?: Record<string, unknown>,
): ProjectForemanLink {
  ensureSchema();
  const id = `pfl_${randomUUID()}`;
  const now = new Date().toISOString();
  sqlite.prepare(`
    INSERT INTO project_foreman_links (id, project_id, kind, target_id, label, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectId, kind, targetId, label, JSON.stringify(metadata ?? {}), now);

  recordAuditEvent({
    eventType: "project_foreman.link_added",
    action: "add_link",
    target: projectId,
    metadata: { kind, targetId, label },
  });

  return {
    id,
    projectId,
    kind,
    targetId,
    label,
    metadata: metadata ?? {},
    createdAt: now,
  };
}

export function listLinks(projectId: string, kindFilter?: LinkKind): ProjectForemanLink[] {
  ensureSchema();
  if (kindFilter) {
    const rows = sqlite
      .prepare("SELECT * FROM project_foreman_links WHERE project_id = ? AND kind = ? ORDER BY created_at DESC")
      .all(projectId, kindFilter) as Record<string, unknown>[];
    return rows.map(linkFromRow);
  }
  const rows = sqlite
    .prepare("SELECT * FROM project_foreman_links WHERE project_id = ? ORDER BY created_at DESC")
    .all(projectId) as Record<string, unknown>[];
  return rows.map(linkFromRow);
}

export function removeLink(linkId: string): boolean {
  ensureSchema();
  const result = sqlite.prepare("DELETE FROM project_foreman_links WHERE id = ?").run(linkId);
  return result.changes > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Project detail — full snapshot for UI
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectDetail {
  project: ProjectForemanProject;
  tasks: ProjectForemanTask[];
  links: ProjectForemanLink[];
  stats: {
    taskTotal: number;
    taskDone: number;
    taskBlocked: number;
    taskAwaitingApproval: number;
    progressPct: number;
  };
}

export function getProjectDetail(id: string): ProjectDetail | null {
  ensureSchema();
  const project = getProject(id);
  if (!project) return null;

  const tasks = listTasks(id);
  const links = listLinks(id);

  const taskDone = tasks.filter(t => t.state === "done").length;
  const taskBlocked = tasks.filter(t => t.state === "blocked").length;
  const taskAwaitingApproval = tasks.filter(t => t.state === "awaiting_approval").length;
  const progressPct = tasks.length === 0 ? 0 : Math.round((taskDone / tasks.length) * 100);

  return {
    project,
    tasks,
    links,
    stats: {
      taskTotal: tasks.length,
      taskDone,
      taskBlocked,
      taskAwaitingApproval,
      progressPct,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Status snapshot for the dashboard card
// ─────────────────────────────────────────────────────────────────────────────

export interface ForemanStatus {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalTasksAwaitingApproval: number;
  totalTasksBlocked: number;
  recentProjects: ProjectForemanProject[];
}

export function getStatus(): ForemanStatus {
  ensureSchema();
  const allProjects = listProjects({ limit: 1000 });
  const activeProjects = allProjects.filter(p => ["draft", "planning", "in_progress", "verifying"].includes(p.status)).length;
  const completedProjects = allProjects.filter(p => p.status === "completed").length;

  const taskCounts = sqlite.prepare(`
    SELECT state, COUNT(*) as count FROM project_foreman_tasks GROUP BY state
  `).all() as Array<{ state: string; count: number }>;

  const taskByState = Object.fromEntries(taskCounts.map(t => [t.state, t.count]));

  return {
    totalProjects: allProjects.length,
    activeProjects,
    completedProjects,
    totalTasksAwaitingApproval: taskByState["awaiting_approval"] ?? 0,
    totalTasksBlocked: taskByState["blocked"] ?? 0,
    recentProjects: listProjects({ limit: 5 }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Final documentation package — generates a markdown report
// ─────────────────────────────────────────────────────────────────────────────

export function buildFinalDocumentation(projectId: string): string | null {
  ensureSchema();
  const detail = getProjectDetail(projectId);
  if (!detail) return null;
  const { project, tasks, links, stats } = detail;

  const lines: string[] = [];
  lines.push(`# ${project.name}`);
  lines.push("");
  lines.push(`**Kind:** ${project.kind}  `);
  lines.push(`**Status:** ${project.status}  `);
  lines.push(`**Risk level:** ${project.riskLevel}  `);
  lines.push(`**Created:** ${project.createdAt}  `);
  if (project.completedAt) lines.push(`**Completed:** ${project.completedAt}  `);
  if (project.workspacePath) lines.push(`**Workspace:** \`${project.workspacePath}\`  `);
  lines.push("");

  lines.push("## Goal");
  lines.push(project.goal || "_(not specified)_");
  lines.push("");

  if (project.brief) {
    lines.push("## Brief");
    lines.push(project.brief);
    lines.push("");
  }

  if (project.knownFacts.length > 0) {
    lines.push("## Known facts");
    project.knownFacts.forEach(f => lines.push(`- ${f}`));
    lines.push("");
  }

  if (project.unknowns.length > 0) {
    lines.push("## Unknowns");
    project.unknowns.forEach(u => lines.push(`- ${u}`));
    lines.push("");
  }

  if (project.assumptions.length > 0) {
    lines.push("## Assumptions");
    project.assumptions.forEach(a => lines.push(`- ${a}`));
    lines.push("");
  }

  if (project.safetyChecklist.length > 0) {
    lines.push("## Safety checklist");
    project.safetyChecklist.forEach(s => lines.push(`- [ ] ${s}`));
    lines.push("");
  }

  lines.push("## Tasks");
  lines.push(`**Progress:** ${stats.taskDone}/${stats.taskTotal} (${stats.progressPct}%)`);
  lines.push("");
  tasks.forEach((t, i) => {
    const mark = t.state === "done" ? "x" : " ";
    lines.push(`${i + 1}. [${mark}] **${t.title}** — _${t.state}_`);
    if (t.description) lines.push(`   ${t.description}`);
    if (t.proofRef) lines.push(`   Proof: \`${t.proofRef}\``);
  });
  lines.push("");

  if (links.length > 0) {
    lines.push("## Linked records");
    const byKind = links.reduce<Record<string, ProjectForemanLink[]>>((acc, l) => {
      (acc[l.kind] ??= []).push(l);
      return acc;
    }, {});
    Object.entries(byKind).forEach(([kind, kindLinks]) => {
      lines.push(`### ${kind}`);
      kindLinks.forEach(l => lines.push(`- ${l.label} (\`${l.targetId}\`)`));
      lines.push("");
    });
  }

  if (project.rollbackPlan) {
    lines.push("## Rollback plan");
    lines.push(project.rollbackPlan);
    lines.push("");
  }

  lines.push("---");
  lines.push(`Generated by LOCALAI Project Foreman at ${new Date().toISOString()}`);
  return lines.join("\n");
}
