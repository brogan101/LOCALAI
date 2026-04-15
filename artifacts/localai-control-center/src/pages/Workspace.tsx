import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Folder, FolderOpen, Pin, Trash2, Plus, RefreshCw, ExternalLink,
  CheckCircle, AlertTriangle, XCircle, GitBranch,
  Brain, Search, Play, ChevronDown, ChevronRight,
  FileCode, Loader2, Database,
} from "lucide-react";
import api, {
  type ContextWorkspaceSummary,
  type ContextSearchFile,
  type RefactorPlan,
  type RefactorJob,
  type RefactorStep,
} from "../api.js";

// ── Types (local — backend returns `unknown[]` but we know the shape) ─────────

interface WorkspaceProject {
  id: string;
  name: string;
  path: string;
  type: string;
  pinned: boolean;
  lastOpened: string;
  profile?: Record<string, unknown>;
  hasGit?: boolean;
  hasContinue?: boolean;
  aiReadiness?: "ready" | "partial" | "not-ready";
  aiReadinessIssues?: string[];
}

interface WorkspaceTemplate {
  id: string;
  name?: string;
  type?: string;
  files?: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function readinessBadge(r?: string) {
  if (r === "ready")     return { label: "AI ready",  color: "var(--color-success)" };
  if (r === "partial")   return { label: "Partial",   color: "var(--color-warn)" };
  return                        { label: "Not ready",  color: "var(--color-muted)" };
}

function typeLabel(t: string) {
  const m: Record<string, string> = { node: "Node.js", python: "Python", dotnet: ".NET", rust: "Rust", docs: "Docs", "ui-vibe-lab": "Vibe Lab", other: "Other" };
  return m[t] ?? t;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl overflow-hidden ${className}`}
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      {children}
    </div>
  );
}

// ── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onOpen,
  onPin,
  onDelete,
  busy,
}: {
  project: WorkspaceProject;
  onOpen: (mode: "vscode" | "terminal" | "vscode-aider") => void;
  onPin: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const { label: rLabel, color: rColor } = readinessBadge(project.aiReadiness);

  return (
    <div className="rounded-xl p-4"
      style={{
        background: "var(--color-surface)",
        border: `1px solid ${project.pinned ? "var(--color-accent)" : "var(--color-border)"}`,
      }}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {project.pinned
            ? <FolderOpen size={18} style={{ color: "var(--color-accent)" }} />
            : <Folder size={18} style={{ color: "var(--color-muted)" }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm" style={{ color: "var(--color-foreground)" }}>{project.name}</span>
            <span className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
              {typeLabel(project.type)}
            </span>
            <span className="text-xs" style={{ color: rColor }}>{rLabel}</span>
            {project.hasGit && (
              <GitBranch size={11} style={{ color: "var(--color-muted)" }} />
            )}
          </div>
          <div className="text-xs mt-1 truncate font-mono" style={{ color: "var(--color-muted)" }}>
            {project.path}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            Opened {new Date(project.lastOpened).toLocaleDateString()}
          </div>
          {project.aiReadinessIssues && project.aiReadinessIssues.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {project.aiReadinessIssues.slice(0, 2).map((issue, i) => (
                <div key={i} className="text-xs flex items-center gap-1" style={{ color: "var(--color-warn)" }}>
                  <AlertTriangle size={10} /> {issue}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            disabled={busy}
            onClick={() => onOpen("vscode")}
            title="Open in VS Code"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "var(--color-accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}>
            <ExternalLink size={11} /> Code
          </button>
          <button
            disabled={busy}
            onClick={() => onOpen("vscode-aider")}
            title="Open in VS Code + Aider"
            className="px-2 py-1.5 rounded-lg text-xs"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
            +Aider
          </button>
          <button onClick={onPin} title={project.pinned ? "Unpin" : "Pin"}
            className="p-1.5 rounded-lg"
            style={{ background: "var(--color-elevated)", color: project.pinned ? "var(--color-accent)" : "var(--color-muted)" }}>
            <Pin size={13} />
          </button>
          <button onClick={onDelete} title="Delete"
            className="p-1.5 rounded-lg"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────────

function CreateModal({
  templates,
  onClose,
  onCreate,
  creating,
}: {
  templates: WorkspaceTemplate[];
  onClose: () => void;
  onCreate: (data: { name: string; path: string; templateId: string; brief?: string; bootstrapRepo?: boolean; openInVscode?: boolean }) => void;
  creating: boolean;
}) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [brief, setBrief] = useState("");
  const [bootstrapRepo, setBootstrapRepo] = useState(true);
  const [openInVscode, setOpenInVscode] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="rounded-xl p-6 w-full max-w-lg space-y-4"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <h2 className="text-base font-semibold" style={{ color: "var(--color-foreground)" }}>New Workspace</h2>

        {[
          { label: "Name", value: name, onChange: setName, placeholder: "my-project" },
          { label: "Path", value: path, onChange: setPath, placeholder: "C:\\Users\\you\\projects\\my-project" },
        ].map(({ label, value, onChange, placeholder }) => (
          <div key={label}>
            <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>{label}</div>
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            />
          </div>
        ))}

        <div>
          <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Template</div>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.id}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Brief (optional)</div>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Describe what this project is for…"
            rows={2}
            className="w-full px-3 py-2 rounded-lg text-sm resize-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
          />
        </div>

        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer" style={{ color: "var(--color-muted)" }}>
            <input type="checkbox" checked={bootstrapRepo} onChange={(e) => setBootstrapRepo(e.target.checked)}
              style={{ accentColor: "var(--color-accent)" }} />
            git init
          </label>
          <label className="flex items-center gap-2 cursor-pointer" style={{ color: "var(--color-muted)" }}>
            <input type="checkbox" checked={openInVscode} onChange={(e) => setOpenInVscode(e.target.checked)}
              style={{ accentColor: "var(--color-accent)" }} />
            Open in VS Code
          </label>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            disabled={!name || !path || !templateId || creating}
            onClick={() => onCreate({ name, path, templateId, brief: brief || undefined, bootstrapRepo, openInVscode })}
            className="flex-1 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--color-accent)", color: "#fff", opacity: (!name || !path || creating) ? 0.5 : 1 }}>
            {creating ? "Creating…" : "Create"}
          </button>
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Intelligence tab ──────────────────────────────────────────────────────────

function stepStatusColor(s: RefactorStep["status"]): string {
  if (s === "completed") return "var(--color-success)";
  if (s === "failed")    return "var(--color-error)";
  if (s === "running")   return "var(--color-warn)";
  return "var(--color-muted)";
}

function StepRow({ step }: { step: RefactorStep }) {
  const [open, setOpen] = useState(false);
  const hasDiff = !!step.diff;
  return (
    <div style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div
        className="flex items-center gap-2 px-4 py-2.5 text-sm cursor-pointer select-none"
        onClick={() => hasDiff && setOpen(o => !o)}>
        {step.status === "running"
          ? <Loader2 size={13} className="animate-spin" style={{ color: stepStatusColor(step.status) }} />
          : step.status === "completed"
            ? <CheckCircle size={13} style={{ color: stepStatusColor(step.status) }} />
            : step.status === "failed"
              ? <XCircle size={13} style={{ color: stepStatusColor(step.status) }} />
              : <div className="w-3 h-3 rounded-full border" style={{ borderColor: "var(--color-border)" }} />
        }
        <span className="font-mono text-xs flex-1 truncate" style={{ color: "var(--color-foreground)" }}>
          {step.relativePath}
        </span>
        <span className="text-xs shrink-0" style={{ color: stepStatusColor(step.status) }}>
          {step.status}
        </span>
        {hasDiff && (
          <span style={{ color: "var(--color-muted)" }}>
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
        )}
      </div>
      {step.reason && (
        <div className="px-4 pb-1.5 text-xs" style={{ color: "var(--color-muted)" }}>{step.reason}</div>
      )}
      {open && step.diff && (
        <pre className="mx-4 mb-2 text-xs p-2 rounded overflow-x-auto whitespace-pre"
          style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", fontFamily: "monospace", maxHeight: 300 }}>
          {step.diff}
        </pre>
      )}
      {step.verificationMessage && (
        <div className="px-4 pb-1.5 text-xs font-mono"
          style={{ color: step.status === "completed" ? "var(--color-success)" : "var(--color-error)" }}>
          {step.verificationMessage}
        </div>
      )}
      {step.error && (
        <div className="px-4 pb-1.5 text-xs" style={{ color: "var(--color-error)" }}>{step.error}</div>
      )}
    </div>
  );
}

function JobPanel({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["refactor-job", jobId],
    queryFn: () => api.intelligence.job(jobId),
    refetchInterval: (query) => {
      const job = query.state.data?.job;
      return job && (job.status === "running" || job.status === "queued") ? 2000 : false;
    },
    staleTime: 0,
  });

  const job = data?.job;

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <Brain size={14} style={{ color: "var(--color-accent)" }} />
        <span className="text-sm font-semibold flex-1" style={{ color: "var(--color-foreground)" }}>
          Refactor Job
        </span>
        {job && (
          <span className="text-xs px-2 py-0.5 rounded"
            style={{
              background: job.status === "completed" ? "color-mix(in srgb, var(--color-success) 15%, transparent)"
                : job.status === "failed" ? "color-mix(in srgb, var(--color-error) 15%, transparent)"
                : job.status === "running" ? "color-mix(in srgb, var(--color-warn) 15%, transparent)"
                : "var(--color-elevated)",
              color: job.status === "completed" ? "var(--color-success)"
                : job.status === "failed" ? "var(--color-error)"
                : job.status === "running" ? "var(--color-warn)"
                : "var(--color-muted)",
            }}>
            {job.status}
          </span>
        )}
        <button onClick={onClose} className="text-xs px-2 py-0.5 rounded"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
          Close
        </button>
      </div>
      {isLoading && <div className="p-6 text-sm text-center" style={{ color: "var(--color-muted)" }}>Loading…</div>}
      {job && (
        <>
          <div className="px-4 py-2 text-xs" style={{ color: "var(--color-muted)", borderBottom: "1px solid var(--color-border)" }}>
            <span className="font-mono">{job.model}</span>
            {job.startedAt && <> · started {new Date(job.startedAt).toLocaleTimeString()}</>}
            {job.finishedAt && <> · finished {new Date(job.finishedAt).toLocaleTimeString()}</>}
          </div>
          <div className="px-4 py-2 text-xs italic" style={{ color: "var(--color-muted)", borderBottom: "1px solid var(--color-border)" }}>
            "{job.request}"
          </div>
          {job.steps.map((step) => <StepRow key={step.id} step={step} />)}
          {job.error && (
            <div className="px-4 py-2 text-xs" style={{ color: "var(--color-error)" }}>{job.error}</div>
          )}
        </>
      )}
    </div>
  );
}

function IntelligenceTab({ projects }: { projects: WorkspaceProject[] }) {
  const qc = useQueryClient();

  // Context status
  const statusQ = useQuery({
    queryKey: ["context-status"],
    queryFn: () => api.context.status(),
    staleTime: 20_000,
  });

  // Context search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchWorkspace, setSearchWorkspace] = useState("");
  const [searchResults, setSearchResults] = useState<ContextSearchFile[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Refactor plan
  const [planRequest, setPlanRequest] = useState("");
  const [planWorkspace, setPlanWorkspace] = useState("");
  const [planData, setPlanData] = useState<RefactorPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  // Active job
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const indexMut = useMutation({
    mutationFn: ({ workspacePath, force }: { workspacePath?: string; force?: boolean }) =>
      api.context.index(workspacePath || undefined, force),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["context-status"] }),
  });

  const planMut = useMutation({
    mutationFn: ({ workspacePath, request }: { workspacePath: string; request: string }) =>
      api.intelligence.planRefactor(workspacePath, request),
    onSuccess: (data) => {
      setPlanData(data.plan);
      setPlanError(null);
    },
    onError: (e) => setPlanError(e instanceof Error ? e.message : "Plan failed"),
  });

  const executeMut = useMutation({
    mutationFn: (planId: string) => api.intelligence.executeRefactor(planId),
    onSuccess: (data) => setActiveJobId(data.job.id),
  });

  async function runSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const r = await api.context.search(searchQuery, searchWorkspace || undefined, 10, 8000);
      setSearchResults(r.files ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  const workspaces: ContextWorkspaceSummary[] = statusQ.data?.workspaces ?? [];
  const totalFiles = statusQ.data?.totalFiles ?? 0;
  const totalSymbols = statusQ.data?.totalSymbols ?? 0;

  return (
    <div className="space-y-6">

      {/* In-memory warning */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl text-xs"
        style={{ background: "color-mix(in srgb, var(--color-warn) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--color-warn) 30%, transparent)", color: "var(--color-warn)" }}>
        <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span>
        <span>
          Refactor plans and jobs are stored in server memory and will be lost if the API server restarts.
          Save important plans as files before restarting.
        </span>
      </div>

      {/* Context Index Status */}
      <div className="rounded-xl overflow-hidden"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="flex items-center gap-2">
            <Database size={14} style={{ color: "var(--color-accent)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>Context Index</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void qc.invalidateQueries({ queryKey: ["context-status"] })}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
              <RefreshCw size={11} />
            </button>
            <button
              disabled={indexMut.isPending}
              onClick={() => indexMut.mutate({ force: true })}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium"
              style={{ background: "var(--color-accent)", color: "#fff", opacity: indexMut.isPending ? 0.6 : 1 }}>
              {indexMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Brain size={11} />}
              {indexMut.isPending ? "Indexing…" : "Re-index All"}
            </button>
          </div>
        </div>

        {statusQ.isLoading && (
          <div className="p-6 text-sm text-center" style={{ color: "var(--color-muted)" }}>Loading…</div>
        )}

        {!statusQ.isLoading && workspaces.length === 0 && (
          <div className="p-6 text-sm text-center" style={{ color: "var(--color-muted)" }}>
            No workspaces indexed. Open a project and click Re-index.
          </div>
        )}

        {workspaces.map((ws) => (
          // Backend WorkspaceSummary uses rootPath, workspaceName, fileCount, indexedAt (no stale/symbolCount)
          <div key={ws.rootPath} className="flex items-center gap-3 px-4 py-2.5 text-sm"
            style={{ borderBottom: "1px solid var(--color-border)" }}>
            <CheckCircle size={13} style={{ color: ws.indexedAt ? "var(--color-success)" : "var(--color-muted)" }} />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-xs" style={{ color: "var(--color-foreground)" }}>{ws.workspaceName}</div>
              <div className="font-mono text-xs truncate" style={{ color: "var(--color-muted)" }}>{ws.rootPath}</div>
            </div>
            <div className="text-xs shrink-0" style={{ color: "var(--color-muted)" }}>
              {ws.fileCount}f
              {ws.indexedAt && <> · {new Date(ws.indexedAt).toLocaleDateString()}</>}
            </div>
            <button
              disabled={indexMut.isPending}
              onClick={() => indexMut.mutate({ workspacePath: ws.rootPath, force: true })}
              className="text-xs px-2 py-0.5 rounded"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
              Index
            </button>
          </div>
        ))}

        {(totalFiles > 0 || totalSymbols > 0) && (
          <div className="px-4 py-2 text-xs" style={{ color: "var(--color-muted)" }}>
            Total: {totalFiles} files · {totalSymbols} symbols across {workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""}
          </div>
        )}

        {indexMut.isSuccess && indexMut.data && (
          <div className="px-4 py-2 text-xs" style={{ color: "var(--color-success)" }}>
            Indexed {indexMut.data.fileCount ?? 0} files · {indexMut.data.symbolCount ?? 0} symbols
          </div>
        )}
      </div>

      {/* Context Search */}
      <div className="rounded-xl overflow-hidden"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <Search size={14} style={{ color: "var(--color-accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>Context Search</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void runSearch()}
              placeholder="Search symbols, functions, types…"
              className="flex-1 px-3 py-1.5 rounded-lg text-sm"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            />
            <select
              value={searchWorkspace}
              onChange={(e) => setSearchWorkspace(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none", maxWidth: 160 }}>
              <option value="">All workspaces</option>
              {workspaces.map((ws) => (
                <option key={ws.rootPath} value={ws.rootPath}>{ws.workspaceName}</option>
              ))}
            </select>
            <button
              disabled={searching || !searchQuery.trim()}
              onClick={() => void runSearch()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: "var(--color-accent)", color: "#fff", opacity: searching || !searchQuery.trim() ? 0.5 : 1 }}>
              {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            </button>
          </div>

          {searchResults !== null && searchResults.length === 0 && (
            <div className="text-sm text-center py-4" style={{ color: "var(--color-muted)" }}>No matches found</div>
          )}

          {searchResults !== null && searchResults.length > 0 && (
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
              {searchResults.map((f, i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-2 text-xs"
                  style={{ borderBottom: i < searchResults.length - 1 ? "1px solid var(--color-border)" : undefined }}>
                  <FileCode size={12} style={{ color: "var(--color-muted)", flexShrink: 0, marginTop: 2 }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono truncate" style={{ color: "var(--color-foreground)" }}>{f.relativePath}</div>
                    {f.matchedSymbols.length > 0 && (
                      <div style={{ color: "var(--color-muted)" }}>{f.matchedSymbols.slice(0, 5).map(s => s.name).join(", ")}</div>
                    )}
                  </div>
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-xs"
                    style={{
                      background: "color-mix(in srgb, var(--color-info) 12%, transparent)",
                      color: "var(--color-info)",
                    }}>
                    {f.score.toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Refactor Planner */}
      <div className="rounded-xl overflow-hidden"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <Brain size={14} style={{ color: "var(--color-accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>Refactor Planner</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <select
              value={planWorkspace}
              onChange={(e) => setPlanWorkspace(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none", maxWidth: 180 }}>
              <option value="">Pick workspace…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.path}>{p.name}</option>
              ))}
            </select>
          </div>
          <textarea
            value={planRequest}
            onChange={(e) => setPlanRequest(e.target.value)}
            placeholder="Describe the refactor — e.g. 'Rename UserService to AccountService across all files'"
            rows={3}
            className="w-full px-3 py-2 rounded-lg text-sm resize-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
          />
          <div className="flex gap-2">
            <button
              disabled={!planRequest.trim() || !planWorkspace || planMut.isPending}
              onClick={() => planMut.mutate({ workspacePath: planWorkspace, request: planRequest })}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: "var(--color-accent)", color: "#fff", opacity: (!planRequest.trim() || !planWorkspace || planMut.isPending) ? 0.5 : 1 }}>
              {planMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Brain size={13} />}
              {planMut.isPending ? "Planning…" : "Create Plan"}
            </button>
          </div>

          {planError && (
            <div className="text-xs" style={{ color: "var(--color-error)" }}>{planError}</div>
          )}
        </div>

        {planData !== null && (
          <div style={{ borderTop: "1px solid var(--color-border)" }}>
            {/* Plan header */}
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold" style={{ color: "var(--color-foreground)" }}>
                  Plan: {planData.steps.length} file{planData.steps.length !== 1 ? "s" : ""} · {planData.workspaceName}
                </span>
                <button
                  disabled={executeMut.isPending}
                  onClick={() => executeMut.mutate(planData.id)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ml-auto"
                  style={{ background: "var(--color-success)", color: "#fff", opacity: executeMut.isPending ? 0.6 : 1 }}>
                  {executeMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                  {executeMut.isPending ? "Launching…" : "Execute"}
                </button>
              </div>
              {planData.summary && (
                <div className="text-xs" style={{ color: "var(--color-muted)" }}>{planData.summary}</div>
              )}
            </div>

            {/* Impacted files */}
            <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div className="text-xs font-semibold mb-2" style={{ color: "var(--color-muted)" }}>
                IMPACTED FILES
              </div>
              <div className="space-y-1">
                {planData.impactedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <FileCode size={11} style={{ color: "var(--color-muted)", flexShrink: 0 }} />
                    <span className="font-mono flex-1 truncate" style={{ color: "var(--color-foreground)" }}>{f.relativePath}</span>
                    <span style={{ color: "var(--color-muted)" }} className="shrink-0">{f.reason}</span>
                    <span className="px-1 rounded shrink-0"
                      style={{
                        background: "color-mix(in srgb, var(--color-info) 12%, transparent)",
                        color: "var(--color-info)",
                      }}>
                      {f.score.toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Steps preview */}
            <div>
              {planData.steps.map((step) => <StepRow key={step.id} step={step} />)}
            </div>
          </div>
        )}
      </div>

      {/* Active job panel */}
      {activeJobId && (
        <JobPanel jobId={activeJobId} onClose={() => setActiveJobId(null)} />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"projects" | "intelligence">("projects");
  const [showCreate, setShowCreate] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<Record<string, string>>({});

  const projectsQ = useQuery({
    queryKey: ["workspace-projects"],
    queryFn: () => api.workspace.projects(),
    staleTime: 20_000,
  });

  const templatesQ = useQuery({
    queryKey: ["workspace-templates"],
    queryFn: () => api.workspace.templates(),
    staleTime: 60_000,
  });

  const createMut = useMutation({
    mutationFn: (data: Parameters<typeof api.workspaceExtra.createProject>[0]) =>
      api.workspaceExtra.createProject(data),
    onSuccess: () => {
      setShowCreate(false);
      void qc.invalidateQueries({ queryKey: ["workspace-projects"] });
    },
  });

  function setBusy(id: string, busy: boolean) {
    setBusyIds((prev) => { const s = new Set(prev); if (busy) s.add(id); else s.delete(id); return s; });
  }

  function setMsg(id: string, msg: string) {
    setMessages((prev) => ({ ...prev, [id]: msg }));
    setTimeout(() => setMessages((prev) => { const n = { ...prev }; delete n[id]; return n; }), 4000);
  }

  async function openProject(id: string, mode: "vscode" | "terminal" | "vscode-aider") {
    setBusy(id, true);
    try {
      const r = await api.workspaceExtra.openProject(id, mode);
      setMsg(id, r.message);
    } catch (e) {
      setMsg(id, e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(id, false);
    }
  }

  async function pinProject(id: string) {
    setBusy(id, true);
    try {
      await api.workspaceExtra.pinProject(id);
      void qc.invalidateQueries({ queryKey: ["workspace-projects"] });
    } finally {
      setBusy(id, false);
    }
  }

  async function deleteProject(id: string) {
    if (!confirm("Remove this project from the registry? (Files are not deleted.)")) return;
    setBusy(id, true);
    try {
      await api.workspaceExtra.deleteProject(id);
      void qc.invalidateQueries({ queryKey: ["workspace-projects"] });
    } finally {
      setBusy(id, false);
    }
  }

  const projects = (projectsQ.data?.projects ?? []) as WorkspaceProject[];
  const templates = (templatesQ.data?.templates ?? []) as WorkspaceTemplate[];
  const pinned  = projects.filter((p) => p.pinned);
  const recent  = projects.filter((p) => !p.pinned);

  const readinessGroups = {
    ready:     projects.filter((p) => p.aiReadiness === "ready").length,
    partial:   projects.filter((p) => p.aiReadiness === "partial").length,
    notReady:  projects.filter((p) => p.aiReadiness === "not-ready" || !p.aiReadiness).length,
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6"
      style={{ background: "var(--color-background)" }}>

      {showCreate && (
        <CreateModal
          templates={templates}
          onClose={() => setShowCreate(false)}
          onCreate={(data) => createMut.mutate(data)}
          creating={createMut.isPending}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-foreground)" }}>Workspace</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            {projects.length} project{projects.length !== 1 ? "s" : ""} · {projectsQ.data?.pinnedCount ?? 0} pinned
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "projects" && (
            <>
              <button onClick={() => void qc.invalidateQueries({ queryKey: ["workspace-projects"] })}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
                style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
                <RefreshCw size={13} />
              </button>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{ background: "var(--color-accent)", color: "#fff" }}>
                <Plus size={13} /> New Project
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg p-1"
        style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", width: "fit-content" }}>
        {([
          { id: "projects", label: "Projects", icon: Folder },
          { id: "intelligence", label: "Intelligence", icon: Brain },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors"
            style={{
              background: tab === id ? "var(--color-surface)" : "transparent",
              color: tab === id ? "var(--color-foreground)" : "var(--color-muted)",
              fontWeight: tab === id ? 500 : 400,
            }}>
            <Icon size={13} style={{ color: tab === id ? "var(--color-accent)" : "inherit" }} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Projects tab ── */}
      {tab === "projects" && (
        <>
          {/* AI readiness summary */}
          {projects.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "AI Ready",   count: readinessGroups.ready,    color: "var(--color-success)", Icon: CheckCircle },
                { label: "Partial",    count: readinessGroups.partial,   color: "var(--color-warn)",    Icon: AlertTriangle },
                { label: "Not ready",  count: readinessGroups.notReady,  color: "var(--color-muted)",   Icon: XCircle },
              ].map(({ label, count, color, Icon }) => (
                <div key={label} className="rounded-xl p-4 flex items-center gap-3"
                  style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
                  <Icon size={18} style={{ color }} />
                  <div>
                    <div className="text-lg font-bold" style={{ color: "var(--color-foreground)" }}>{count}</div>
                    <div className="text-xs" style={{ color: "var(--color-muted)" }}>{label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {projectsQ.isLoading && (
            <div className="text-sm text-center py-12" style={{ color: "var(--color-muted)" }}>Loading projects…</div>
          )}

          {/* Pinned */}
          {pinned.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: "var(--color-muted)" }}>Pinned</div>
              <div className="grid gap-3">
                {pinned.map((p) => (
                  <div key={p.id}>
                    <ProjectCard
                      project={p}
                      busy={busyIds.has(p.id)}
                      onOpen={(mode) => openProject(p.id, mode)}
                      onPin={() => pinProject(p.id)}
                      onDelete={() => deleteProject(p.id)}
                    />
                    {messages[p.id] && (
                      <div className="mt-1 text-xs px-2" style={{ color: "var(--color-muted)" }}>{messages[p.id]}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent */}
          {recent.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: "var(--color-muted)" }}>Recent</div>
              <div className="grid gap-3">
                {recent.map((p) => (
                  <div key={p.id}>
                    <ProjectCard
                      project={p}
                      busy={busyIds.has(p.id)}
                      onOpen={(mode) => openProject(p.id, mode)}
                      onPin={() => pinProject(p.id)}
                      onDelete={() => deleteProject(p.id)}
                    />
                    {messages[p.id] && (
                      <div className="mt-1 text-xs px-2" style={{ color: "var(--color-muted)" }}>{messages[p.id]}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!projectsQ.isLoading && projects.length === 0 && (
            <Card>
              <div className="flex flex-col items-center gap-3 py-12 text-center px-8">
                <Folder size={32} style={{ color: "var(--color-muted)" }} />
                <div className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>No workspaces yet</div>
                <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                  Create a new project or register an existing directory.
                </div>
                <button onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--color-accent)", color: "#fff" }}>
                  <Plus size={13} /> New Project
                </button>
              </div>
            </Card>
          )}
        </>
      )}

      {/* ── Intelligence tab ── */}
      {tab === "intelligence" && (
        <IntelligenceTab projects={projects} />
      )}
    </div>
  );
}
