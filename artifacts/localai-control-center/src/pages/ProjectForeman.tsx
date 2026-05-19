/**
 * PROJECT FOREMAN PAGE
 * ====================
 * Phase 24. Unified cross-system command center — closes B-012.
 *
 * Layout:
 *   - Status strip (project counts + alerts)
 *   - Project list (left) with create button
 *   - Selected project detail (right):
 *     * Brief, goal, status, risk, progress
 *     * Plan generator (known facts, unknowns, assumptions, safety, rollback)
 *     * Task board (drag-free reorder by orderIndex, state pills)
 *     * Linked records (Evidence, RAG, Inventory, Maker, Auto, IT, Approvals)
 *     * Final documentation (download as MD)
 */

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Folder, FileText, Wrench, Car, Network, Cpu, Code2, Microscope,
  CheckCircle, XCircle, AlertTriangle, Clock, ChevronRight, Trash2, Link as LinkIcon,
  Download, FileBox, Boxes, Archive, ScrollText, ShieldAlert, ListChecks,
} from "lucide-react";
import api from "../api.js";

// ─────────────────────────────────────────────────────────────────────────────
// API helpers — direct fetches to /project-foreman/* (api.ts hasn't been
// regenerated yet; these are local typed wrappers)
// ─────────────────────────────────────────────────────────────────────────────

const PF_BASE = "/api/project-foreman";

async function pfGet<T>(path: string): Promise<T> {
  const res = await fetch(`${PF_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function pfPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${PF_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function pfPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${PF_BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function pfDel<T>(path: string): Promise<T> {
  const res = await fetch(`${PF_BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirror backend)
// ─────────────────────────────────────────────────────────────────────────────

type ProjectKind = "general" | "automotive" | "maker_3d_print" | "maker_cnc" | "maker_electronics" | "homelab_network" | "it_support" | "code_change" | "research";
type ProjectStatus = "draft" | "planning" | "in_progress" | "blocked" | "verifying" | "completed" | "archived";
type RiskLevel = "low" | "medium" | "high" | "critical";
type TaskState = "todo" | "in_progress" | "blocked" | "awaiting_approval" | "executing" | "verifying" | "done" | "skipped";
type LinkKind = "evidence" | "rag_collection" | "inventory_item" | "maker_project" | "automotive_case" | "digital_twin" | "it_support" | "approval" | "durable_job" | "code_workspace" | "external_url";

interface Project {
  id: string; name: string; kind: ProjectKind; goal: string; status: ProjectStatus;
  riskLevel: RiskLevel; brief: string; knownFacts: string[]; unknowns: string[];
  assumptions: string[]; safetyChecklist: string[]; rollbackPlan: string;
  workspacePath?: string; createdAt: string; updatedAt: string; completedAt?: string; dueAt?: string;
  metadata: Record<string, unknown>;
}

interface Task {
  id: string; projectId: string; title: string; description: string;
  state: TaskState; orderIndex: number;
  proposedAction?: string; approvalId?: string; durableJobId?: string; proofRef?: string;
  createdAt: string; updatedAt: string; completedAt?: string;
}

interface Link {
  id: string; projectId: string; kind: LinkKind; targetId: string;
  label: string; createdAt: string; metadata: Record<string, unknown>;
}

interface ProjectDetail {
  project: Project;
  tasks: Task[];
  links: Link[];
  stats: {
    taskTotal: number; taskDone: number; taskBlocked: number;
    taskAwaitingApproval: number; progressPct: number;
  };
}

interface ForemanStatus {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalTasksAwaitingApproval: number;
  totalTasksBlocked: number;
  recentProjects: Project[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual config
// ─────────────────────────────────────────────────────────────────────────────

const KIND_ICON: Record<ProjectKind, React.ElementType> = {
  general: Folder,
  automotive: Car,
  maker_3d_print: FileBox,
  maker_cnc: Wrench,
  maker_electronics: Cpu,
  homelab_network: Network,
  it_support: ShieldAlert,
  code_change: Code2,
  research: Microscope,
};

const KIND_LABEL: Record<ProjectKind, string> = {
  general: "General",
  automotive: "Automotive",
  maker_3d_print: "3D Print",
  maker_cnc: "CNC",
  maker_electronics: "Electronics",
  homelab_network: "HomeLab",
  it_support: "IT Support",
  code_change: "Code Change",
  research: "Research",
};

const RISK_COLOR: Record<RiskLevel, string> = {
  low: "var(--color-success)",
  medium: "var(--color-info)",
  high: "var(--color-warn)",
  critical: "var(--color-error)",
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  planning: "Planning",
  in_progress: "In Progress",
  blocked: "Blocked",
  verifying: "Verifying",
  completed: "Completed",
  archived: "Archived",
};

const STATUS_COLOR: Record<ProjectStatus, string> = {
  draft: "var(--color-muted)",
  planning: "var(--color-info)",
  in_progress: "var(--color-accent)",
  blocked: "var(--color-error)",
  verifying: "var(--color-warn)",
  completed: "var(--color-success)",
  archived: "var(--color-muted)",
};

const TASK_STATE_COLOR: Record<TaskState, string> = {
  todo: "var(--color-muted)",
  in_progress: "var(--color-accent)",
  blocked: "var(--color-error)",
  awaiting_approval: "var(--color-warn)",
  executing: "var(--color-info)",
  verifying: "var(--color-warn)",
  done: "var(--color-success)",
  skipped: "var(--color-muted)",
};

const LINK_KIND_ICON: Record<LinkKind, React.ElementType> = {
  evidence: Archive,
  rag_collection: ScrollText,
  inventory_item: Boxes,
  maker_project: FileBox,
  automotive_case: Car,
  digital_twin: Network,
  it_support: ShieldAlert,
  approval: CheckCircle,
  durable_job: Clock,
  code_workspace: Code2,
  external_url: LinkIcon,
};

// ─────────────────────────────────────────────────────────────────────────────
// Reusable components
// ─────────────────────────────────────────────────────────────────────────────

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium"
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}
    >
      <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>{label}</div>
      <div className="text-xl font-semibold" style={{ color: accent ?? "var(--color-foreground)" }}>{value}</div>
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// New project modal
// ─────────────────────────────────────────────────────────────────────────────

function NewProjectModal({ open, onClose, onCreate }: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; kind: ProjectKind; goal: string; riskLevel: RiskLevel }) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ProjectKind>("general");
  const [goal, setGoal] = useState("");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("medium");

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold mb-4" style={{ color: "var(--color-foreground)" }}>New project</h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--color-muted)" }}>Name</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
              placeholder="e.g. Replace strut tower brace"
            />
          </div>

          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--color-muted)" }}>Kind</label>
            <select
              value={kind} onChange={(e) => setKind(e.target.value as ProjectKind)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            >
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--color-muted)" }}>Goal</label>
            <textarea
              value={goal} onChange={(e) => setGoal(e.target.value)}
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-sm resize-none"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
              placeholder="What does done look like?"
            />
          </div>

          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--color-muted)" }}>Risk level</label>
            <div className="flex gap-2">
              {(["low", "medium", "high", "critical"] as RiskLevel[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRiskLevel(r)}
                  className="flex-1 py-1.5 text-xs rounded-lg capitalize"
                  style={{
                    background: riskLevel === r ? `color-mix(in srgb, ${RISK_COLOR[r]} 15%, transparent)` : "var(--color-elevated)",
                    border: `1px solid ${riskLevel === r ? RISK_COLOR[r] : "var(--color-border)"}`,
                    color: riskLevel === r ? RISK_COLOR[r] : "var(--color-muted)",
                    fontWeight: riskLevel === r ? 500 : 400,
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            type="button" onClick={onClose}
            className="flex-1 py-2 text-sm rounded-lg"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || !goal.trim()}
            onClick={() => {
              onCreate({ name: name.trim(), kind, goal: goal.trim(), riskLevel });
              setName(""); setGoal(""); setKind("general"); setRiskLevel("medium");
            }}
            className="flex-1 py-2 text-sm rounded-lg font-medium disabled:opacity-40"
            style={{ background: "var(--color-accent)", color: "#fff" }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Project list (left column)
// ─────────────────────────────────────────────────────────────────────────────

function ProjectList({
  projects, selectedId, onSelect, onNew,
}: {
  projects: Project[]; selectedId: string | null;
  onSelect: (id: string) => void; onNew: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
          Projects ({projects.length})
        </span>
        <button
          type="button" onClick={onNew}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium"
          style={{ background: "var(--color-accent)", color: "#fff" }}
        >
          <Plus size={12} /> New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {projects.length === 0 && (
          <div className="p-6 text-center text-sm" style={{ color: "var(--color-muted)" }}>
            No projects yet. Click <strong>New</strong> to start.
          </div>
        )}

        {projects.map((p) => {
          const Icon = KIND_ICON[p.kind] ?? Folder;
          const active = p.id === selectedId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className="w-full text-left flex items-start gap-3 p-3 transition-colors"
              style={{
                background: active ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent",
                borderLeft: active ? "3px solid var(--color-accent)" : "3px solid transparent",
                borderBottom: "1px solid var(--color-border)",
                color: "inherit",
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: `color-mix(in srgb, ${STATUS_COLOR[p.status]} 12%, transparent)` }}
              >
                <Icon size={14} style={{ color: STATUS_COLOR[p.status] }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: "var(--color-foreground)" }}>{p.name}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>{KIND_LABEL[p.kind]}</span>
                  <span className="text-xs" style={{ color: STATUS_COLOR[p.status] }}>● {STATUS_LABEL[p.status]}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan editor — for known facts, unknowns, assumptions, safety, rollback
// ─────────────────────────────────────────────────────────────────────────────

function ListEditor({
  label, items, onChange, placeholder,
}: { label: string; items: string[]; onChange: (next: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="mb-3">
      <div className="text-xs mb-1.5" style={{ color: "var(--color-muted)" }}>{label}</div>
      <div className="space-y-1 mb-2">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex items-start gap-2 px-3 py-1.5 rounded-lg text-sm"
            style={{ background: "var(--color-elevated)" }}
          >
            <span className="flex-1" style={{ color: "var(--color-foreground)" }}>{item}</span>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              style={{ background: "none", border: "none", color: "var(--color-muted)", cursor: "pointer" }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              onChange([...items, draft.trim()]);
              setDraft("");
            }
          }}
          placeholder={placeholder ?? "Add item, press Enter"}
          className="flex-1 rounded-lg px-3 py-1.5 text-xs"
          style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
        />
        <button
          type="button"
          disabled={!draft.trim()}
          onClick={() => { onChange([...items, draft.trim()]); setDraft(""); }}
          className="px-3 text-xs rounded-lg disabled:opacity-40"
          style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Project detail panel (right column)
// ─────────────────────────────────────────────────────────────────────────────

function ProjectDetailPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Project> | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [linkKind, setLinkKind] = useState<LinkKind>("evidence");
  const [linkTargetId, setLinkTargetId] = useState("");
  const [linkLabel, setLinkLabel] = useState("");

  const detailQ = useQuery<{ success: boolean } & ProjectDetail>({
    queryKey: ["pf-detail", projectId],
    queryFn: () => pfGet<{ success: boolean } & ProjectDetail>(`/projects/${projectId}`),
    enabled: !!projectId,
    refetchInterval: 10_000,
  });

  const detail = detailQ.data;

  const planMut = useMutation({
    mutationFn: (body: unknown) => pfPost(`/projects/${projectId}/plan`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pf-detail", projectId] }),
  });

  const updateMut = useMutation({
    mutationFn: (body: Partial<Project>) => pfPatch(`/projects/${projectId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pf-detail", projectId] });
      qc.invalidateQueries({ queryKey: ["pf-list"] });
      setEditing(false);
    },
  });

  const createTaskMut = useMutation({
    mutationFn: (title: string) => pfPost(`/projects/${projectId}/tasks`, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pf-detail", projectId] });
      setNewTaskTitle("");
    },
  });

  const updateTaskMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Task> }) => pfPatch(`/tasks/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pf-detail", projectId] }),
  });

  const deleteTaskMut = useMutation({
    mutationFn: (id: string) => pfDel(`/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pf-detail", projectId] }),
  });

  const addLinkMut = useMutation({
    mutationFn: (body: { kind: LinkKind; targetId: string; label: string }) => pfPost(`/projects/${projectId}/links`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pf-detail", projectId] });
      setLinkTargetId(""); setLinkLabel("");
    },
  });

  const removeLinkMut = useMutation({
    mutationFn: (id: string) => pfDel(`/links/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pf-detail", projectId] }),
  });

  // Initialise draft when entering edit mode
  useEffect(() => {
    if (editing && detail) {
      setDraft({
        brief: detail.project.brief,
        knownFacts: detail.project.knownFacts,
        unknowns: detail.project.unknowns,
        assumptions: detail.project.assumptions,
        safetyChecklist: detail.project.safetyChecklist,
        rollbackPlan: detail.project.rollbackPlan,
        status: detail.project.status,
      });
    }
  }, [editing, detail]);

  if (detailQ.isLoading) {
    return <div className="p-6 text-sm" style={{ color: "var(--color-muted)" }}>Loading project…</div>;
  }
  if (!detail) {
    return <div className="p-6 text-sm" style={{ color: "var(--color-error)" }}>Project not found</div>;
  }

  const { project, tasks, links, stats } = detail;
  const Icon = KIND_ICON[project.kind] ?? Folder;

  function downloadDocumentation() {
    const url = `${PF_BASE}/projects/${projectId}/documentation`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/[^a-z0-9]/gi, "_")}_documentation.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-start gap-3 mb-5">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `color-mix(in srgb, ${STATUS_COLOR[project.status]} 14%, transparent)` }}
        >
          <Icon size={20} style={{ color: STATUS_COLOR[project.status] }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h2 className="text-lg font-semibold truncate" style={{ color: "var(--color-foreground)" }}>{project.name}</h2>
            <Pill color={STATUS_COLOR[project.status]}>{STATUS_LABEL[project.status]}</Pill>
            <Pill color={RISK_COLOR[project.riskLevel]}>risk: {project.riskLevel}</Pill>
          </div>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>{project.goal}</p>
        </div>
        <button
          type="button" onClick={downloadDocumentation}
          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg"
          style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
        >
          <Download size={12} /> Docs
        </button>
      </div>

      {/* Progress */}
      <div className="mb-6 p-3 rounded-xl" style={{ background: "var(--color-elevated)" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            Progress: {stats.taskDone}/{stats.taskTotal} tasks
          </span>
          <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>{stats.progressPct}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-border)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${stats.progressPct}%`, background: "var(--color-accent)" }}
          />
        </div>
        {(stats.taskBlocked > 0 || stats.taskAwaitingApproval > 0) && (
          <div className="mt-2 flex gap-3 text-xs">
            {stats.taskBlocked > 0 && <span style={{ color: "var(--color-error)" }}>● {stats.taskBlocked} blocked</span>}
            {stats.taskAwaitingApproval > 0 && <span style={{ color: "var(--color-warn)" }}>● {stats.taskAwaitingApproval} awaiting approval</span>}
          </div>
        )}
      </div>

      {/* Plan */}
      <Section
        title="Plan"
        action={
          <button
            type="button" onClick={() => setEditing(!editing)}
            className="text-xs px-2 py-1 rounded-lg"
            style={{ background: editing ? "var(--color-accent)" : "var(--color-elevated)", color: editing ? "#fff" : "var(--color-foreground)", border: "1px solid var(--color-border)" }}
          >
            {editing ? "Cancel" : "Edit plan"}
          </button>
        }
      >
        {!editing ? (
          <div className="space-y-2 text-sm">
            {project.brief && <p style={{ color: "var(--color-foreground)" }}>{project.brief}</p>}
            {project.knownFacts.length > 0 && (
              <div><strong style={{ color: "var(--color-muted)" }}>Known:</strong> <span style={{ color: "var(--color-foreground)" }}>{project.knownFacts.join("; ")}</span></div>
            )}
            {project.unknowns.length > 0 && (
              <div><strong style={{ color: "var(--color-muted)" }}>Unknowns:</strong> <span style={{ color: "var(--color-warn)" }}>{project.unknowns.join("; ")}</span></div>
            )}
            {project.assumptions.length > 0 && (
              <div><strong style={{ color: "var(--color-muted)" }}>Assumptions:</strong> <span style={{ color: "var(--color-foreground)" }}>{project.assumptions.join("; ")}</span></div>
            )}
            {project.safetyChecklist.length > 0 && (
              <div>
                <strong style={{ color: "var(--color-muted)" }}>Safety:</strong>
                <ul className="ml-4 mt-1 space-y-0.5">
                  {project.safetyChecklist.map((s, i) => (
                    <li key={i} className="text-xs" style={{ color: "var(--color-foreground)" }}>☐ {s}</li>
                  ))}
                </ul>
              </div>
            )}
            {project.rollbackPlan && (
              <div><strong style={{ color: "var(--color-muted)" }}>Rollback:</strong> <span style={{ color: "var(--color-foreground)" }}>{project.rollbackPlan}</span></div>
            )}
            {!project.brief && !project.knownFacts.length && !project.unknowns.length && (
              <p style={{ color: "var(--color-muted)" }}>No plan yet. Click <strong>Edit plan</strong> to fill it in.</p>
            )}
          </div>
        ) : draft && (
          <div>
            <div className="mb-3">
              <label className="text-xs block mb-1" style={{ color: "var(--color-muted)" }}>Brief</label>
              <textarea
                value={draft.brief ?? ""} onChange={(e) => setDraft({ ...draft, brief: e.target.value })}
                rows={3}
                className="w-full rounded-lg px-3 py-2 text-sm resize-none"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
              />
            </div>
            <ListEditor label="Known facts" items={draft.knownFacts ?? []} onChange={(next) => setDraft({ ...draft, knownFacts: next })} placeholder="A fact you know for certain" />
            <ListEditor label="Unknowns" items={draft.unknowns ?? []} onChange={(next) => setDraft({ ...draft, unknowns: next })} placeholder="Something you need to figure out" />
            <ListEditor label="Assumptions" items={draft.assumptions ?? []} onChange={(next) => setDraft({ ...draft, assumptions: next })} placeholder="An assumption to validate" />
            <ListEditor label="Safety checklist" items={draft.safetyChecklist ?? []} onChange={(next) => setDraft({ ...draft, safetyChecklist: next })} placeholder="Safety step (e.g. wear PPE)" />
            <div className="mb-3">
              <label className="text-xs block mb-1" style={{ color: "var(--color-muted)" }}>Rollback plan</label>
              <textarea
                value={draft.rollbackPlan ?? ""} onChange={(e) => setDraft({ ...draft, rollbackPlan: e.target.value })}
                rows={2}
                className="w-full rounded-lg px-3 py-2 text-sm resize-none"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
                placeholder="If this fails, how do we get back to a known-good state?"
              />
            </div>
            <div className="mb-3">
              <label className="text-xs block mb-1" style={{ color: "var(--color-muted)" }}>Status</label>
              <select
                value={draft.status ?? project.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ProjectStatus })}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
              >
                {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>

            <button
              type="button"
              onClick={() => updateMut.mutate(draft)}
              disabled={updateMut.isPending}
              className="w-full py-2 text-sm rounded-lg font-medium disabled:opacity-50"
              style={{ background: "var(--color-accent)", color: "#fff" }}
            >
              {updateMut.isPending ? "Saving…" : "Save plan"}
            </button>
          </div>
        )}
      </Section>

      {/* Tasks */}
      <Section title={`Tasks (${tasks.length})`}>
        <div className="space-y-1.5 mb-3">
          {tasks.length === 0 && (
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>No tasks yet. Add one below.</p>
          )}
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: "var(--color-elevated)" }}
            >
              <select
                value={task.state}
                onChange={(e) => updateTaskMut.mutate({ id: task.id, body: { state: e.target.value as TaskState } })}
                className="text-xs rounded px-1.5 py-0.5 shrink-0"
                style={{
                  background: `color-mix(in srgb, ${TASK_STATE_COLOR[task.state]} 14%, transparent)`,
                  color: TASK_STATE_COLOR[task.state],
                  border: `1px solid color-mix(in srgb, ${TASK_STATE_COLOR[task.state]} 25%, transparent)`,
                  outline: "none",
                }}
              >
                {(Object.keys(TASK_STATE_COLOR) as TaskState[]).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="flex-1 text-sm" style={{ color: "var(--color-foreground)" }}>{task.title}</span>
              {task.proofRef && <Pill color="var(--color-success)">proof</Pill>}
              {task.approvalId && <Pill color="var(--color-warn)">approval</Pill>}
              <button
                type="button" onClick={() => deleteTaskMut.mutate(task.id)}
                style={{ background: "none", border: "none", color: "var(--color-muted)", cursor: "pointer" }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newTaskTitle.trim()) createTaskMut.mutate(newTaskTitle.trim()); }}
            placeholder="New task…"
            className="flex-1 rounded-lg px-3 py-1.5 text-sm"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
          />
          <button
            type="button"
            disabled={!newTaskTitle.trim()}
            onClick={() => createTaskMut.mutate(newTaskTitle.trim())}
            className="flex items-center gap-1 px-3 text-sm rounded-lg disabled:opacity-40"
            style={{ background: "var(--color-accent)", color: "#fff" }}
          >
            <Plus size={13} /> Add
          </button>
        </div>
      </Section>

      {/* Linked records */}
      <Section title={`Linked records (${links.length})`}>
        {links.length === 0 && (
          <p className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
            Connect this project to evidence, inventory, RAG collections, maker projects, automotive cases, or external URLs.
          </p>
        )}
        <div className="space-y-1.5 mb-3">
          {links.map((link) => {
            const LinkIcon = LINK_KIND_ICON[link.kind];
            return (
              <div
                key={link.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: "var(--color-elevated)" }}
              >
                <LinkIcon size={14} style={{ color: "var(--color-muted)", flexShrink: 0 }} />
                <span className="text-xs uppercase shrink-0" style={{ color: "var(--color-muted)" }}>{link.kind.replace("_", " ")}</span>
                <span className="flex-1 text-sm truncate" style={{ color: "var(--color-foreground)" }}>{link.label}</span>
                <code className="text-xs truncate max-w-[120px]" style={{ color: "var(--color-muted)" }}>{link.targetId}</code>
                <button
                  type="button" onClick={() => removeLinkMut.mutate(link.id)}
                  style={{ background: "none", border: "none", color: "var(--color-muted)", cursor: "pointer" }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-12 gap-2">
          <select
            value={linkKind} onChange={(e) => setLinkKind(e.target.value as LinkKind)}
            className="col-span-3 rounded-lg px-2 py-1.5 text-xs"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
          >
            {(Object.keys(LINK_KIND_ICON) as LinkKind[]).map(k => <option key={k} value={k}>{k.replace("_", " ")}</option>)}
          </select>
          <input
            type="text" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="Label"
            className="col-span-4 rounded-lg px-3 py-1.5 text-xs"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
          />
          <input
            type="text" value={linkTargetId} onChange={(e) => setLinkTargetId(e.target.value)}
            placeholder="Target ID / URL"
            className="col-span-4 rounded-lg px-3 py-1.5 text-xs"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
          />
          <button
            type="button"
            disabled={!linkLabel.trim() || !linkTargetId.trim()}
            onClick={() => addLinkMut.mutate({ kind: linkKind, targetId: linkTargetId.trim(), label: linkLabel.trim() })}
            className="col-span-1 rounded-lg text-xs disabled:opacity-40"
            style={{ background: "var(--color-accent)", color: "#fff" }}
          >
            <Plus size={13} className="mx-auto" />
          </button>
        </div>
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function ProjectForemanPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const statusQ = useQuery<{ success: boolean; status: ForemanStatus }>({
    queryKey: ["pf-status"],
    queryFn: () => pfGet("/status"),
    refetchInterval: 15_000,
  });

  const listQ = useQuery<{ success: boolean; projects: Project[] }>({
    queryKey: ["pf-list"],
    queryFn: () => pfGet("/projects"),
    refetchInterval: 15_000,
  });

  const createMut = useMutation({
    mutationFn: (input: { name: string; kind: ProjectKind; goal: string; riskLevel: RiskLevel }) =>
      pfPost<{ success: boolean; project: Project }>("/projects", input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pf-list"] });
      qc.invalidateQueries({ queryKey: ["pf-status"] });
      setShowNewModal(false);
      if (data.project?.id) setSelectedId(data.project.id);
    },
  });

  const projects = listQ.data?.projects ?? [];
  const status = statusQ.data?.status;

  // Auto-select first project on load if nothing selected
  useEffect(() => {
    if (!selectedId && projects.length > 0) setSelectedId(projects[0].id);
  }, [selectedId, projects]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Status strip */}
      <div className="px-6 pt-4 pb-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-2 mb-3">
          <ListChecks size={18} style={{ color: "var(--color-accent)" }} />
          <h1 className="text-base font-semibold" style={{ color: "var(--color-foreground)" }}>Project Foreman</h1>
          <span className="text-xs ml-1" style={{ color: "var(--color-muted)" }}>
            Unified workflow: idea → plan → files → inventory → fabrication → verification → docs
          </span>
        </div>

        {status && (
          <div className="grid grid-cols-4 gap-2">
            <StatCard label="Active" value={status.activeProjects} accent="var(--color-accent)" />
            <StatCard label="Completed" value={status.completedProjects} accent="var(--color-success)" />
            <StatCard label="Awaiting approval" value={status.totalTasksAwaitingApproval} accent={status.totalTasksAwaitingApproval > 0 ? "var(--color-warn)" : undefined} />
            <StatCard label="Blocked tasks" value={status.totalTasksBlocked} accent={status.totalTasksBlocked > 0 ? "var(--color-error)" : undefined} />
          </div>
        )}
      </div>

      {/* Main two-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Project list */}
        <div className="w-72 shrink-0" style={{ borderRight: "1px solid var(--color-border)" }}>
          <ProjectList
            projects={projects}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onNew={() => setShowNewModal(true)}
          />
        </div>

        {/* Detail */}
        {selectedId ? (
          <ProjectDetailPanel projectId={selectedId} />
        ) : (
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <div>
              <Folder size={32} className="mx-auto mb-3" style={{ color: "var(--color-muted)" }} />
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                {projects.length === 0
                  ? "No projects yet. Create one to get started."
                  : "Select a project to view its plan, tasks, and links."}
              </p>
            </div>
          </div>
        )}
      </div>

      <NewProjectModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreate={(input) => createMut.mutate(input)}
      />
    </div>
  );
}
