import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import {
  Zap, Image, Box, RefreshCw, Play, Loader, CheckCircle, AlertTriangle,
  Code2, Printer, X, FolderOpen, ChevronRight,
  BookOpen, Car, Terminal, FileSearch, FileText, ChevronDown,
} from "lucide-react";
import api, {
  type CadScriptResult, type ImageGenResult, type ImageGenStatus,
  type GCodeOptimizeResult, type PromptArchitectResult, type WorkspacePreset,
  type PresetEnterResult, type ContextWorkspaceSummary,
} from "../api.js";
import { WorkspaceView } from "./WorkspaceView.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudioTemplate {
  id: string;
  label: string;
  category: string;
  icon: string;
  description: string;
  stack: string[];
}

type StudioTab = "presets" | "vibe" | "imagegen" | "cad" | "vibecheck";

// ── Helpers ───────────────────────────────────────────────────────────────────

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl overflow-hidden ${className}`}
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      {children}
    </div>
  );
}

function CardHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      <Icon size={15} style={{ color: "var(--color-accent)" }} />
      <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>{title}</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "completed" ? "var(--color-success)" :
    status === "running"   ? "var(--color-info)" :
    status === "failed"    ? "var(--color-error)" :
                             "var(--color-muted)";
  return (
    <span className="text-xs px-2 py-0.5 rounded-full"
      style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
      {status}
    </span>
  );
}

// ── Icon resolver — maps preset icon string to Lucide component ───────────────

function PresetIcon({ name, size = 20 }: { name: string; size?: number }) {
  const style = { flexShrink: 0 as const };
  switch (name) {
    case "Code2":       return <Code2       size={size} style={style} />;
    case "Box":         return <Box         size={size} style={style} />;
    case "Image":       return <Image       size={size} style={style} />;
    case "FileText":    return <FileText    size={size} style={style} />;
    case "BookOpen":    return <BookOpen    size={size} style={style} />;
    case "Car":         return <Car         size={size} style={style} />;
    case "Terminal":    return <Terminal    size={size} style={style} />;
    case "FileSearch":  return <FileSearch  size={size} style={style} />;
    case "Printer":     return <Printer     size={size} style={style} />;
    case "Zap":         return <Zap         size={size} style={style} />;
    default:            return <Zap         size={size} style={style} />;
  }
}

// ── Readiness dot ─────────────────────────────────────────────────────────────

function ReadinessDot({ readiness }: { readiness?: string }) {
  const color =
    readiness === "ready"   ? "var(--color-success)" :
    readiness === "partial" ? "var(--color-warn)"    :
                              "var(--color-error)";
  const label =
    readiness === "ready"   ? "All models available" :
    readiness === "partial" ? "Some models missing"  :
                              "Models not installed";
  return (
    <div
      title={label}
      className="w-2.5 h-2.5 rounded-full shrink-0"
      style={{ background: color, boxShadow: `0 0 4px ${color}` }}
    />
  );
}

// ── Preset Enter Modal ────────────────────────────────────────────────────────

function WorkspacePicker({ onSelect }: { onSelect: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const wsQ = useQuery({
    queryKey: ["context-workspaces-picker"],
    queryFn: () => api.context.workspaces(),
    staleTime: 30_000,
    enabled: open,
  });

  const workspaces: ContextWorkspaceSummary[] = wsQ.data?.workspaces ?? [];

  function openPicker() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 240) });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={openPicker}
        title="Pick from indexed workspaces"
        className="px-2.5 py-2 rounded-lg flex items-center gap-1"
        style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
        <FolderOpen size={14} />
        <ChevronDown size={10} />
      </button>
      {open && (
        <div
          ref={ref}
          className="fixed z-[9999] rounded-xl overflow-hidden shadow-xl"
          style={{ top: pos.top, left: pos.left, width: pos.width, background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          {wsQ.isLoading ? (
            <div className="p-3 text-xs flex items-center gap-2" style={{ color: "var(--color-muted)" }}>
              <Loader size={12} className="animate-spin" /> Loading…
            </div>
          ) : workspaces.length === 0 ? (
            <div className="p-3 text-xs" style={{ color: "var(--color-muted)" }}>
              No indexed workspaces — use Context tab to index one.
            </div>
          ) : workspaces.map((ws) => (
            <button
              key={ws.rootPath}
              onClick={() => { onSelect(ws.rootPath); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs hover:opacity-80 transition-opacity"
              style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div className="font-medium" style={{ color: "var(--color-foreground)" }}>{ws.workspaceName}</div>
              <div className="font-mono truncate" style={{ color: "var(--color-muted)" }}>{ws.rootPath}</div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function PresetModal({
  preset,
  onClose,
}: {
  preset: WorkspacePreset;
  onClose: () => void;
}) {
  const defaultPath = preset.defaultWorkspacePathTemplate
    .replace("%USERPROFILE%", "~");
  const [workspacePath, setWorkspacePath] = useState(defaultPath);
  const [enterResult, setEnterResult] = useState<PresetEnterResult | null>(null);

  const enterMut = useMutation({
    mutationFn: () => api.studios.presets.enter(preset.id, workspacePath.trim()),
    onSuccess: (data) => {
      if (data.success) {
        setEnterResult(data);
      }
    },
  });

  // Show full-screen workspace view when entered
  if (enterResult) {
    return (
      <WorkspaceView
        preset={preset}
        workspacePath={workspacePath.trim()}
        enterResult={enterResult}
        onClose={() => { setEnterResult(null); onClose(); }}
      />
    );
  }

  const missing = preset.roleStatus?.filter(r => !r.installed) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "color-mix(in srgb, var(--color-accent) 15%, transparent)" }}>
            <PresetIcon name={preset.icon} size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold" style={{ color: "var(--color-foreground)" }}>{preset.name}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{preset.description}</div>
          </div>
          <button onClick={onClose} style={{ color: "var(--color-muted)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Workspace path */}
          <div>
            <div className="text-xs font-medium mb-1.5" style={{ color: "var(--color-muted)" }}>
              Workspace path
            </div>
            <div className="flex gap-2">
              <input
                value={workspacePath}
                onChange={e => setWorkspacePath(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-mono outline-none"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
              />
              <WorkspacePicker onSelect={setWorkspacePath} />
            </div>
          </div>

          {/* Model preflight */}
          <div>
            <div className="text-xs font-medium mb-1.5" style={{ color: "var(--color-muted)" }}>
              Model preflight
            </div>
            <div className="rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--color-border)" }}>
              {(preset.roleStatus ?? preset.requiredRoles.map(r => ({ role: r, modelName: null, installed: false }))).map((rs, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2 text-xs"
                  style={{ borderBottom: i < (preset.roleStatus?.length ?? 0) - 1 ? "1px solid var(--color-border)" : undefined }}>
                  {rs.installed
                    ? <CheckCircle size={12} style={{ color: "var(--color-success)", flexShrink: 0 }} />
                    : <AlertTriangle size={12} style={{ color: "var(--color-warn)", flexShrink: 0 }} />}
                  <span style={{ color: "var(--color-muted)" }}>{rs.role}</span>
                  <span className="flex-1 truncate font-mono text-right" style={{ color: rs.installed ? "var(--color-foreground)" : "var(--color-warn)" }}>
                    {rs.modelName ?? "not assigned"}
                  </span>
                </div>
              ))}
            </div>
            {missing.length > 0 && (
              <div className="mt-1.5 text-xs" style={{ color: "var(--color-warn)" }}>
                {missing.length} model{missing.length !== 1 ? "s" : ""} missing — pull them in Models → Catalog before entering.
              </div>
            )}
          </div>

          {/* Toolset badges */}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(preset.toolset)
              .filter(([, v]) => v)
              .map(([k]) => (
                <span key={k} className="text-xs px-2 py-0.5 rounded"
                  style={{ background: "color-mix(in srgb, var(--color-accent) 12%, transparent)", color: "var(--color-accent)", border: "1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)" }}>
                  {k}
                </span>
              ))}
          </div>

          {/* Enter button */}
          <button
            onClick={() => enterMut.mutate()}
            disabled={enterMut.isPending || !workspacePath.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: "var(--color-accent)", color: "#fff" }}>
            {enterMut.isPending
              ? <><Loader size={14} className="animate-spin" /> Entering…</>
              : <><Play size={14} /> Enter Workspace</>}
          </button>

          {enterMut.isError && (
            <div className="text-xs text-center" style={{ color: "var(--color-error)" }}>
              {enterMut.error instanceof Error ? enterMut.error.message : "Failed to enter workspace"}
            </div>
          )}
          {enterMut.data && !enterMut.data.success && (
            <div className="text-xs text-center" style={{ color: "var(--color-error)" }}>
              {(enterMut.data as { message?: string }).message ?? "Server returned failure"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Preset Grid (step 4.3) ────────────────────────────────────────────────────

function PresetGrid() {
  const [selected, setSelected] = useState<WorkspacePreset | null>(null);

  const presetsQ = useQuery({
    queryKey: ["studios-presets"],
    queryFn: () => api.studios.presets.list(),
    staleTime: 60_000,
  });

  const presets = presetsQ.data?.presets ?? [];

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {presetsQ.isLoading && (
          <div className="col-span-5 py-12 text-center text-sm" style={{ color: "var(--color-muted)" }}>
            <Loader size={20} className="animate-spin inline mb-2" />
            <div>Loading presets…</div>
          </div>
        )}
        {presets.map((preset) => {
          const isReady   = preset.readiness === "ready";
          const isPartial = preset.readiness === "partial";
          const dotColor  = isReady ? "var(--color-success)" : isPartial ? "var(--color-warn)" : "var(--color-error)";
          return (
            <button
              key={preset.id}
              onClick={() => setSelected(preset)}
              className="relative flex flex-col items-start gap-2 p-4 rounded-xl text-left transition-all hover:opacity-90 active:scale-[0.98]"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
              }}>
              {/* Readiness dot */}
              <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full"
                style={{ background: dotColor, boxShadow: `0 0 5px ${dotColor}` }} />

              <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: "color-mix(in srgb, var(--color-accent) 12%, transparent)", color: "var(--color-accent)" }}>
                <PresetIcon name={preset.icon} size={17} />
              </div>

              <div>
                <div className="text-sm font-semibold leading-tight" style={{ color: "var(--color-foreground)" }}>
                  {preset.name}
                </div>
                <div className="text-xs mt-0.5 line-clamp-2 leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  {preset.description}
                </div>
              </div>

              <div className="flex items-center gap-1 text-xs mt-auto" style={{ color: "var(--color-accent)" }}>
                Enter <ChevronRight size={11} />
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <PresetModal preset={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// ── Vibe Coding Tab ───────────────────────────────────────────────────────────

function VibeCodingTab() {
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [brief, setBrief] = useState("");
  const [projectName, setProjectName] = useState("");
  const [planData, setPlanData] = useState<unknown>(null);
  const [buildJobId, setBuildJobId] = useState<string | null>(null);

  const templatesQ = useQuery({
    queryKey: ["studios-templates"],
    queryFn: () => api.studios.templates(),
    staleTime: 300_000,
  });

  const buildStatusQ = useQuery({
    queryKey: ["studio-build", buildJobId],
    queryFn: () => buildJobId ? api.studios.buildStatus(buildJobId) : null,
    enabled: !!buildJobId,
    staleTime: 0,
    refetchInterval: (query) => {
      const status = (query.state.data as { success?: boolean; job?: { status?: string } } | null)?.job?.status;
      return status === "running" || status === "queued" ? 2000 : false;
    },
  });

  const planMut = useMutation({
    mutationFn: ({ brief, templateId }: { brief: string; templateId: string }) =>
      api.studios.plan(brief, templateId),
    onSuccess: (data) => setPlanData(data.plan),
  });

  const buildMut = useMutation({
    mutationFn: () => api.studios.build(projectName, brief, selectedTemplate, planData ?? undefined),
    onSuccess: (data) => {
      if (data.success) setBuildJobId(data.jobId);
    },
  });

  const templates = (templatesQ.data?.templates ?? []) as StudioTemplate[];
  const categories = [...new Set(templates.map((t) => t.category))];

  const buildJob = (buildStatusQ.data as { success?: boolean; job?: { status?: string; progress?: number; message?: string; result?: { studioPath?: string } } } | null)?.job;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Zap} title="Choose Template" />
        <div className="p-4 space-y-4">
          {categories.map((cat) => (
            <div key={cat}>
              <div className="text-xs font-semibold uppercase tracking-widest mb-2"
                style={{ color: "var(--color-muted)" }}>{cat}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {templates.filter((t) => t.category === cat).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    className="text-left p-3 rounded-xl transition-colors"
                    style={{
                      background: selectedTemplate === t.id
                        ? "color-mix(in srgb, var(--color-accent) 18%, var(--color-elevated))"
                        : "var(--color-elevated)",
                      border: `1px solid ${selectedTemplate === t.id ? "var(--color-accent)" : "var(--color-border)"}`,
                    }}>
                    <div className="text-base mb-1">{t.icon}</div>
                    <div className="text-xs font-medium" style={{ color: "var(--color-foreground)" }}>{t.label}</div>
                    <div className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--color-muted)" }}>{t.description}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader icon={Play} title="Build Config" />
        <div className="p-4 space-y-4">
          <div>
            <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Project name</div>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="my-studio-app"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            />
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Brief — describe what to build</div>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="A todo app with drag-and-drop, local storage persistence, and a minimal dark theme…"
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            />
          </div>

          <div className="flex gap-2">
            <button
              disabled={!brief || !selectedTemplate || planMut.isPending}
              onClick={() => planMut.mutate({ brief, templateId: selectedTemplate })}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)", opacity: (!brief || !selectedTemplate || planMut.isPending) ? 0.5 : 1 }}>
              {planMut.isPending ? "Planning…" : planData ? "Re-plan" : "Plan first"}
            </button>
            <button
              disabled={!brief || !selectedTemplate || !projectName || buildMut.isPending}
              onClick={() => buildMut.mutate()}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: "var(--color-accent)", color: "#fff", opacity: (!brief || !selectedTemplate || !projectName || buildMut.isPending) ? 0.5 : 1 }}>
              {buildMut.isPending ? <><Loader size={13} className="animate-spin" /> Building…</> : <><Play size={13} /> Build</>}
            </button>
          </div>

          {planMut.isError && (
            <div className="text-xs" style={{ color: "var(--color-error)" }}>
              {planMut.error instanceof Error ? planMut.error.message : "Plan failed"}
            </div>
          )}

          {planData !== null && (
            <div>
              <div className="text-xs mb-1 font-semibold" style={{ color: "var(--color-muted)" }}>Plan</div>
              <pre className="text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap"
                style={{ background: "var(--color-elevated)", color: "var(--color-muted)", fontFamily: "monospace" }}>
                {JSON.stringify(planData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </Card>

      {buildJobId && (
        <Card>
          <CardHeader icon={Loader} title="Build Status" />
          <div className="p-4 space-y-2">
            {buildStatusQ.isLoading ? (
              <div className="text-sm" style={{ color: "var(--color-muted)" }}>Loading…</div>
            ) : buildJob ? (
              <>
                <div className="flex items-center gap-3">
                  <StatusPill status={buildJob.status ?? "unknown"} />
                  <span className="text-sm" style={{ color: "var(--color-muted)" }}>
                    {buildJob.message}
                  </span>
                </div>
                {typeof buildJob.progress === "number" && (
                  <div className="h-1.5 rounded-full overflow-hidden"
                    style={{ background: "var(--color-elevated)" }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${buildJob.progress}%`, background: "var(--color-accent)" }} />
                  </div>
                )}
                {buildJob.status === "completed" && (buildJob.result as { studioPath?: string })?.studioPath && (
                  <div className="text-xs font-mono" style={{ color: "var(--color-success)" }}>
                    Built: {(buildJob.result as { studioPath?: string }).studioPath}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Image Gen Tab ─────────────────────────────────────────────────────────────

function ImageGenTab() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<"photorealistic" | "anime" | "oil-painting" | "sketch" | "cinematic">("photorealistic");
  const [expandPrompt, setExpandPrompt] = useState(true);
  const [result, setResult] = useState<ImageGenResult | null>(null);

  const statusQ = useQuery({
    queryKey: ["imagegen-status"],
    queryFn: () => api.studios.imagegen.status(),
    staleTime: 30_000,
  });

  const genMut = useMutation({
    mutationFn: () => api.studios.imagegen.generate(prompt, { expandPrompt, style }),
    onSuccess: (data) => { if (data.success) setResult(data.result); },
  });

  const status: ImageGenStatus | undefined = statusQ.data;
  const backendOk = status?.comfyuiReachable || status?.sdWebuiReachable;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Image} title="Image Generation" />
        <div className="p-4 space-y-4">
          {status && (
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1"
                style={{ color: status.comfyuiReachable ? "var(--color-success)" : "var(--color-muted)" }}>
                {status.comfyuiReachable ? <CheckCircle size={11} /> : <AlertTriangle size={11} />}
                ComfyUI
              </span>
              <span className="flex items-center gap-1"
                style={{ color: status.sdWebuiReachable ? "var(--color-success)" : "var(--color-muted)" }}>
                {status.sdWebuiReachable ? <CheckCircle size={11} /> : <AlertTriangle size={11} />}
                SD WebUI
              </span>
              {!backendOk && (
                <span style={{ color: "var(--color-warn)" }}>No image backend reachable — start ComfyUI or SD WebUI first</span>
              )}
            </div>
          )}

          <div>
            <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Prompt</div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A cyberpunk city at night, neon reflections on wet streets…"
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            />
          </div>

          <div className="flex items-center gap-4">
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Style</div>
              <select value={style} onChange={(e) => setStyle(e.target.value as typeof style)}
                className="px-2 py-1.5 rounded-lg text-sm"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}>
                {(["photorealistic", "anime", "oil-painting", "sketch", "cinematic"] as const).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer"
              style={{ color: "var(--color-muted)" }}>
              <input type="checkbox" checked={expandPrompt} onChange={(e) => setExpandPrompt(e.target.checked)}
                style={{ accentColor: "var(--color-accent)" }} />
              Expand prompt with AI
            </label>
          </div>

          <button
            disabled={!prompt || genMut.isPending}
            onClick={() => genMut.mutate()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--color-accent)", color: "#fff", opacity: (!prompt || genMut.isPending) ? 0.5 : 1 }}>
            {genMut.isPending ? <><Loader size={13} className="animate-spin" /> Generating…</> : <><Image size={13} /> Generate</>}
          </button>

          {genMut.isError && (
            <div className="text-xs" style={{ color: "var(--color-error)" }}>
              {genMut.error instanceof Error ? genMut.error.message : "Generation failed"}
            </div>
          )}
        </div>
      </Card>

      {result && (
        <Card>
          <CardHeader icon={Image} title="Generated Images" />
          <div className="p-4 space-y-2">
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>
              Backend: {result.backend} · {new Date(result.generatedAt).toLocaleTimeString()}
            </div>
            {result.expandedPrompt && (
              <div className="text-xs p-2 rounded"
                style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
                Expanded: {result.expandedPrompt}
              </div>
            )}
            {result.savedPaths.map((p, i) => (
              <div key={i} className="text-xs font-mono" style={{ color: "var(--color-success)" }}>{p}</div>
            ))}
            {result.error && (
              <div className="text-xs" style={{ color: "var(--color-error)" }}>{result.error}</div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── CAD Tab ───────────────────────────────────────────────────────────────────

function CadTab() {
  const [mode, setMode] = useState<"openscad" | "blender">("openscad");
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<CadScriptResult | null>(null);

  const cadMut = useMutation({
    mutationFn: () =>
      mode === "openscad"
        ? api.studios.cad.openscad(description)
        : api.studios.cad.blender(description),
    onSuccess: (data) => { if (data.success) setResult(data.result); },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Box} title="CAD Script Generation" />
        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            {(["openscad", "blender"] as const).map((m) => (
              <button key={m}
                onClick={() => setMode(m)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  background: mode === m ? "var(--color-accent)" : "var(--color-elevated)",
                  color: mode === m ? "#fff" : "var(--color-muted)",
                  border: `1px solid ${mode === m ? "var(--color-accent)" : "var(--color-border)"}`,
                }}>
                {m === "openscad" ? "OpenSCAD" : "Blender Python"}
              </button>
            ))}
          </div>

          <div>
            <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Description</div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={mode === "openscad"
                ? "A gear with 20 teeth, 5mm module, 10mm thick…"
                : "A low-poly mountain scene with snow caps and a lake…"}
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            />
          </div>

          <button
            disabled={!description || cadMut.isPending}
            onClick={() => cadMut.mutate()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--color-accent)", color: "#fff", opacity: (!description || cadMut.isPending) ? 0.5 : 1 }}>
            {cadMut.isPending ? <><Loader size={13} className="animate-spin" /> Generating…</> : <><Box size={13} /> Generate Script</>}
          </button>
        </div>
      </Card>

      {result && (
        <Card>
          <div className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid var(--color-border)" }}>
            <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>
              {result.type.toUpperCase()} Script
            </span>
            {result.savedPath && (
              <span className="text-xs font-mono" style={{ color: "var(--color-success)" }}>{result.savedPath}</span>
            )}
          </div>
          <div className="p-4">
            <div className="text-xs mb-2" style={{ color: "var(--color-muted)" }}>{result.description}</div>
            <pre className="text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-96"
              style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", fontFamily: "monospace" }}>
              {result.script}
            </pre>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── VibeCheck Tab ─────────────────────────────────────────────────────────────

function VibeCheckTab() {
  const [studioPath, setStudioPath] = useState("");
  const [port, setPort] = useState(3000);
  const [endpointPath, setEndpointPath] = useState("/");
  const [startCommand, setStartCommand] = useState("");
  const [result, setResult] = useState<{ success: boolean; result?: { status?: number; body?: string; endpointUrl?: string; error?: string; testedAt?: string } } | null>(null);

  const checkMut = useMutation({
    mutationFn: () => api.studios.vibeCheck(studioPath, port, endpointPath, startCommand || undefined),
    onSuccess: (data) => setResult(data),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Code2} title="VibeCheck — Test Running Studio" />
        <div className="p-4 space-y-4">
          <div>
            <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Studio path</div>
            <input
              value={studioPath}
              onChange={(e) => setStudioPath(e.target.value)}
              placeholder="C:\Users\you\LocalAI-Tools\studios\my-app"
              className="w-full px-3 py-2 rounded-lg text-sm font-mono"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Port</div>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
              />
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Endpoint path</div>
              <input
                value={endpointPath}
                onChange={(e) => setEndpointPath(e.target.value)}
                placeholder="/"
                className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
              />
            </div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Start command (optional)</div>
            <input
              value={startCommand}
              onChange={(e) => setStartCommand(e.target.value)}
              placeholder="npm start"
              className="w-full px-3 py-2 rounded-lg text-sm font-mono"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            />
          </div>
          <button
            disabled={!studioPath || checkMut.isPending}
            onClick={() => checkMut.mutate()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--color-accent)", color: "#fff", opacity: (!studioPath || checkMut.isPending) ? 0.5 : 1 }}>
            {checkMut.isPending ? <><Loader size={13} className="animate-spin" /> Checking…</> : <><Code2 size={13} /> VibeCheck</>}
          </button>
          {checkMut.isError && (
            <div className="text-xs" style={{ color: "var(--color-error)" }}>
              {checkMut.error instanceof Error ? checkMut.error.message : "Check failed"}
            </div>
          )}
        </div>
      </Card>

      {result && (
        <Card>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
            {result.success
              ? <CheckCircle size={14} style={{ color: "var(--color-success)" }} />
              : <AlertTriangle size={14} style={{ color: "var(--color-error)" }} />}
            <span className="text-sm font-semibold" style={{ color: result.success ? "var(--color-success)" : "var(--color-error)" }}>
              {result.success ? "Endpoint reachable" : "Check failed"}
            </span>
            {result.result?.status && (
              <span className="text-xs px-2 py-0.5 rounded"
                style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
                HTTP {result.result.status}
              </span>
            )}
          </div>
          <div className="p-4 space-y-2 text-xs">
            {result.result?.endpointUrl && (
              <div><span style={{ color: "var(--color-muted)" }}>URL: </span>
                <span className="font-mono" style={{ color: "var(--color-foreground)" }}>{result.result.endpointUrl}</span>
              </div>
            )}
            {result.result?.body && (
              <pre className="p-2 rounded overflow-x-auto whitespace-pre-wrap max-h-40"
                style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", fontFamily: "monospace" }}>
                {result.result.body.slice(0, 500)}
              </pre>
            )}
            {result.result?.error && (
              <div style={{ color: "var(--color-error)" }}>{result.result.error}</div>
            )}
            {result.result?.testedAt && (
              <div style={{ color: "var(--color-muted)" }}>Tested at {new Date(result.result.testedAt).toLocaleTimeString()}</div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── GCode Optimizer ───────────────────────────────────────────────────────────

function GCodeTab() {
  const [gcode, setGcode] = useState("");
  const [printerType, setPrinterType] = useState<"fdm" | "laser">("fdm");
  const [result, setResult] = useState<GCodeOptimizeResult | null>(null);

  const gcodeOptMut = useMutation({
    mutationFn: () => api.studios.cad.gcode(gcode, printerType),
    onSuccess: (data) => { if (data.success) setResult(data.result); },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Printer} title="G-Code Optimizer" />
        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            {(["fdm", "laser"] as const).map((t) => (
              <button key={t}
                onClick={() => setPrinterType(t)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  background: printerType === t ? "var(--color-accent)" : "var(--color-elevated)",
                  color: printerType === t ? "#fff" : "var(--color-muted)",
                  border: `1px solid ${printerType === t ? "var(--color-accent)" : "var(--color-border)"}`,
                }}>
                {t === "fdm" ? "FDM Printer" : "Laser Cutter"}
              </button>
            ))}
          </div>

          <div>
            <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Paste G-Code to optimize</div>
            <textarea
              value={gcode}
              onChange={(e) => setGcode(e.target.value)}
              placeholder={`G28 ; home all axes\nG1 Z5 F5000 ; raise nozzle\n…`}
              rows={8}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none font-mono"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            />
          </div>

          <button
            disabled={!gcode.trim() || gcodeOptMut.isPending}
            onClick={() => gcodeOptMut.mutate()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--color-accent)", color: "#fff", opacity: (!gcode.trim() || gcodeOptMut.isPending) ? 0.5 : 1 }}>
            {gcodeOptMut.isPending ? <><Loader size={13} className="animate-spin" /> Optimizing…</> : <><Printer size={13} /> Optimize</>}
          </button>
          {gcodeOptMut.isError && (
            <div className="text-xs" style={{ color: "var(--color-error)" }}>
              {gcodeOptMut.error instanceof Error ? gcodeOptMut.error.message : "Optimization failed"}
            </div>
          )}
        </div>
      </Card>

      {result && (
        <Card>
          <div className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid var(--color-border)" }}>
            <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>
              Optimized G-Code
            </span>
            <div className="flex items-center gap-3 text-xs" style={{ color: "var(--color-muted)" }}>
              <span>{result.originalLineCount} → {result.optimizedLineCount} lines</span>
              {result.savedPath && (
                <span className="font-mono" style={{ color: "var(--color-success)" }}>{result.savedPath}</span>
              )}
            </div>
          </div>
          <div className="p-4 space-y-3">
            {result.changes.length > 0 && (
              <div>
                <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Changes made</div>
                {result.changes.map((c, i) => (
                  <div key={i} className="text-xs flex items-center gap-1.5" style={{ color: "var(--color-foreground)" }}>
                    <CheckCircle size={10} style={{ color: "var(--color-success)" }} />
                    {c}
                  </div>
                ))}
              </div>
            )}
            <pre className="text-xs p-3 rounded-lg overflow-x-auto whitespace-pre max-h-96"
              style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", fontFamily: "monospace" }}>
              {result.optimizedGCode}
            </pre>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Prompt Expand Panel ───────────────────────────────────────────────────────

function PromptExpandCard() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<PromptArchitectResult["style"]>("photorealistic");
  const [result, setResult] = useState<PromptArchitectResult | null>(null);

  const expandMut = useMutation({
    mutationFn: () => api.studios.imagegen.expandPrompt(prompt, style),
    onSuccess: (data) => { if (data.success) setResult(data.result); },
  });

  return (
    <Card>
      <CardHeader icon={Zap} title="Expand Prompt with AI" />
      <div className="p-4 space-y-4">
        <div>
          <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Short prompt to expand</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="cat in space"
            rows={2}
            className="w-full px-3 py-2 rounded-lg text-sm resize-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
          />
        </div>
        <div className="flex items-center gap-4">
          <div>
            <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Style</div>
            <select value={style} onChange={(e) => setStyle(e.target.value as typeof style)}
              className="px-2 py-1.5 rounded-lg text-sm"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}>
              {(["photorealistic", "anime", "oil-painting", "sketch", "cinematic"] as const).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <button
            disabled={!prompt || expandMut.isPending}
            onClick={() => expandMut.mutate()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium mt-3.5"
            style={{ background: "var(--color-accent)", color: "#fff", opacity: (!prompt || expandMut.isPending) ? 0.5 : 1 }}>
            {expandMut.isPending ? <><Loader size={13} className="animate-spin" /> Expanding…</> : "Expand"}
          </button>
        </div>
        {expandMut.isError && (
          <div className="text-xs" style={{ color: "var(--color-error)" }}>
            {expandMut.error instanceof Error ? expandMut.error.message : "Expand failed"}
          </div>
        )}
        {result && (
          <div className="rounded-lg p-3 space-y-2 text-xs"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
            <div>
              <div className="font-semibold mb-0.5" style={{ color: "var(--color-muted)" }}>Expanded prompt</div>
              <div style={{ color: "var(--color-foreground)" }}>{result.expandedPrompt}</div>
            </div>
            {result.negativePrompt && (
              <div>
                <div className="font-semibold mb-0.5" style={{ color: "var(--color-muted)" }}>Negative prompt</div>
                <div style={{ color: "var(--color-foreground)" }}>{result.negativePrompt}</div>
              </div>
            )}
            <div style={{ color: "var(--color-muted)" }}>Model: {result.model}</div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StudiosPage() {
  const [tab, setTab] = useState<StudioTab>("presets");
  const qc = useQueryClient();

  const catalogQ = useQuery({
    queryKey: ["studios-catalog"],
    queryFn: () => api.studios.catalog(),
    staleTime: 60_000,
  });

  const workspaces = (catalogQ.data?.workspaces ?? []) as Array<{ name?: string; path?: string; createdAt?: string }>;

  const tabs: Array<{ id: StudioTab; label: string; icon: React.ElementType }> = [
    { id: "presets",    label: "Workspace Presets", icon: Zap },
    { id: "vibe",       label: "Vibe Coding",       icon: Code2 },
    { id: "vibecheck",  label: "VibeCheck",         icon: CheckCircle },
    { id: "imagegen",   label: "Image Gen",         icon: Image },
    { id: "cad",        label: "CAD / Hardware",    icon: Box },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6"
      style={{ background: "var(--color-background)" }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-foreground)" }}>Studios</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            Workspace presets · vibe coding · image generation · CAD scripting
          </p>
        </div>
        <button onClick={() => {
          void qc.invalidateQueries({ queryKey: ["studios-catalog"] });
          void qc.invalidateQueries({ queryKey: ["studios-presets"] });
        }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Existing studios strip */}
      {workspaces.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {workspaces.map((ws, i) => (
            <div key={i} className="rounded-lg px-3 py-2 shrink-0 text-xs"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
              <div className="font-medium" style={{ color: "var(--color-foreground)" }}>{ws.name ?? "Studio"}</div>
              {ws.createdAt && (
                <div style={{ color: "var(--color-muted)" }}>{new Date(ws.createdAt).toLocaleDateString()}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id}
            onClick={() => setTab(id)}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: tab === id ? "var(--color-accent)" : "transparent",
              color: tab === id ? "#fff" : "var(--color-muted)",
            }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "presets"   && <PresetGrid />}
      {tab === "vibe"      && <VibeCodingTab />}
      {tab === "vibecheck" && <VibeCheckTab />}
      {tab === "imagegen"  && (
        <div className="space-y-6">
          <PromptExpandCard />
          <ImageGenTab />
        </div>
      )}
      {tab === "cad" && (
        <div className="space-y-6">
          <CadTab />
          <GCodeTab />
        </div>
      )}
    </div>
  );
}
