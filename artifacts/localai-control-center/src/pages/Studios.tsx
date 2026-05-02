import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import {
  Zap, Image, Box, RefreshCw, Play, Loader, CheckCircle, AlertTriangle,
  Code2, Printer, X, FolderOpen, ChevronRight,
  BookOpen, Car, Terminal, FileSearch, FileText, ChevronDown, ShieldAlert, Bot,
} from "lucide-react";
import api, {
  type CadScriptResult, type ImageGenResult, type ImageGenStatus,
  type GCodeOptimizeResult, type PromptArchitectResult, type WorkspacePreset,
  type PresetEnterResult, type ContextWorkspaceSummary,
  type MakerCadProvider, type MakerDesignProposal, type MakerMachineProvider, type MakerMachineSetupSheet, type MakerPrintProvider, type MakerProject,
  type MakerProjectType, type MakerSafetyTier, type MakerSlicingProposal,
  type RoboticsStatus, type RoboticsProvider, type RoboticsCapabilityTier,
  type LocalBuilderStatus, type LocalBuilderModelProfile, type LocalBuilderEvalResult,
  type ContextPackMeta, localBuilderApi,
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

type StudioTab = "presets" | "vibe" | "imagegen" | "cad" | "maker" | "vibecheck" | "robotics" | "local-builder";

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

// ── Maker Studio Tab ─────────────────────────────────────────────────────────

function providerForKind(
  providers: MakerCadProvider[],
  kind: "cadquery" | "build123d" | "openscad" | "freecad_macro" | "kicad_project",
): MakerCadProvider | undefined {
  if (kind === "build123d") return providers.find((provider) => provider.id === "build123d");
  if (kind === "openscad") return providers.find((provider) => provider.id === "openscad-style");
  if (kind === "freecad_macro") return providers.find((provider) => provider.id === "freecad-mcp");
  if (kind === "kicad_project") return providers.find((provider) => provider.id === "kicad-mcp");
  return providers.find((provider) => provider.id === "cadquery");
}

function printProviderForKind(providers: MakerPrintProvider[], kind: "slicer" | "printer_api" | "material_inventory" | "failure_monitoring"): MakerPrintProvider | undefined {
  if (kind === "slicer") return providers.find((provider) => provider.kind === "slicer");
  if (kind === "printer_api") return providers.find((provider) => provider.kind === "printer_api");
  return providers.find((provider) => provider.kind === kind);
}

function machineProviderForOperation(providers: MakerMachineProvider[], operation: string): MakerMachineProvider | undefined {
  if (operation.startsWith("laser")) return providers.find((provider) => provider.kind === "laser_workflow");
  if (operation.includes("electronics") || operation.includes("firmware")) return providers.find((provider) => provider.kind === "electronics_bench");
  if (operation.includes("cnc")) return providers.find((provider) => provider.kind === "cnc_controller");
  return providers.find((provider) => provider.kind === "cam");
}

function MakerStudioTab() {
  const [name, setName] = useState("Bench project");
  const [type, setType] = useState<MakerProjectType>("3d_print");
  const [safetyTier, setSafetyTier] = useState<MakerSafetyTier>("simulate");
  const [materialName, setMaterialName] = useState("PLA");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [designKind, setDesignKind] = useState<"cadquery" | "build123d" | "openscad" | "freecad_macro" | "kicad_project">("cadquery");
  const [targetFileName, setTargetFileName] = useState("bracket-proposal.py");
  const [sliceFileName, setSliceFileName] = useState("bracket.gcode");
  const [printerProfile, setPrinterProfile] = useState("Unconfigured printer profile");
  const [machineOperation, setMachineOperation] = useState("cnc_milling");
  const [machineProfile, setMachineProfile] = useState("Unconfigured CNC profile");
  const [setupSheetFileName, setSetupSheetFileName] = useState("setup-sheet.md");
  const [designProposal, setDesignProposal] = useState<MakerDesignProposal | null>(null);
  const [slicingProposal, setSlicingProposal] = useState<MakerSlicingProposal | null>(null);
  const [setupSheet, setSetupSheet] = useState<MakerMachineSetupSheet | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const qc = useQueryClient();

  const statusQ = useQuery({ queryKey: ["maker-status"], queryFn: () => api.studios.maker.status(), staleTime: 30_000 });
  const projectsQ = useQuery({ queryKey: ["maker-projects"], queryFn: () => api.studios.maker.projects(), staleTime: 15_000 });
  const integrationsQ = useQuery({ queryKey: ["maker-integrations"], queryFn: () => api.studios.maker.integrations(), staleTime: 30_000 });
  const cadProvidersQ = useQuery({ queryKey: ["maker-cad-providers"], queryFn: () => api.studios.maker.cadProviders(), staleTime: 30_000 });
  const printProvidersQ = useQuery({ queryKey: ["maker-print-providers"], queryFn: () => api.studios.maker.printProviders(), staleTime: 30_000 });
  const machineProvidersQ = useQuery({ queryKey: ["maker-machine-providers"], queryFn: () => api.studios.maker.machineProviders(), staleTime: 30_000 });
  const status = statusQ.data?.status;
  const projects = projectsQ.data?.projects ?? [];
  const integrations = integrationsQ.data?.integrations ?? status?.integrations ?? [];
  const cadProviders = cadProvidersQ.data?.providers ?? status?.cadProviders ?? [];
  const printProviders = printProvidersQ.data?.providers ?? status?.printProviders ?? [];
  const machineProviders = machineProvidersQ.data?.providers ?? status?.machineProviders ?? [];
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const selectedProvider = providerForKind(cadProviders, designKind);
  const selectedSlicer = printProviderForKind(printProviders, "slicer");
  const selectedPrinterProvider = printProviderForKind(printProviders, "printer_api");
  const spoolmanProvider = printProviderForKind(printProviders, "material_inventory");
  const obicoProvider = printProviderForKind(printProviders, "failure_monitoring");
  const selectedMachineProvider = machineProviderForOperation(machineProviders, machineOperation);

  const createProjectMut = useMutation({
    mutationFn: () => api.studios.maker.createProject({
      name,
      type,
      safetyTier,
      material: { name: materialName, category: type === "3d_print" ? "filament" : "stock" },
      target: { status: "not_configured", kind: type === "3d_print" ? "printer" : type },
      traceability: { workflow: "proposal_only", evidenceRequired: true },
    }),
    onSuccess: (data) => {
      setSelectedProjectId(data.project.id);
      void qc.invalidateQueries({ queryKey: ["maker-projects"] });
      void qc.invalidateQueries({ queryKey: ["maker-status"] });
    },
  });

  const proposeActionMut = useMutation({
    mutationFn: ({ project, actionType }: { project: MakerProject; actionType: string }) =>
      api.studios.maker.proposeAction(project.id, actionType),
    onSuccess: (data) => {
      setActionResult(`${data.status}: ${data.reason}`);
      void qc.invalidateQueries({ queryKey: ["maker-projects"] });
      void qc.invalidateQueries({ queryKey: ["maker-status"] });
    },
  });

  const disabledIntegrationMut = useMutation({
    mutationFn: (integrationId: string) => api.studios.maker.proposeIntegrationAction(integrationId),
    onSuccess: (data) => setActionResult(`${data.status}: ${data.reason}`),
  });

  const cadProviderActionMut = useMutation({
    mutationFn: ({ providerId, action }: { providerId: string; action: string }) =>
      api.studios.maker.proposeCadProviderAction(providerId, action),
    onSuccess: (data) => setActionResult(`${data.status}: ${data.reason}`),
  });

  const createDesignProposalMut = useMutation({
    mutationFn: ({ project }: { project: MakerProject }) =>
      api.studios.maker.createDesignProposal(project.id, {
        providerId: selectedProvider?.id,
        designKind,
        targetFileName,
        units: "mm",
        dimensions: { widthMm: 40, depthMm: 20, heightMm: 10 },
        assumptions: ["Draft geometry only", "Review tolerances and material before export"],
        constraints: ["No external CAD or PCB tool execution", "Approved Maker workspace required before execution"],
        exportTargets: designKind === "kicad_project" ? ["ERC report proposal", "DRC report proposal", "BOM report proposal"] : ["STEP proposal", "STL proposal"],
        validationSteps: ["Review units", "Check bounding box", "Approve before render or export"],
        riskNotes: ["No manufacturability, printability, or electrical safety claim is made"],
      }),
    onSuccess: (data) => {
      setDesignProposal(data);
      setActionResult(`${data.status}: ${data.reason}`);
      void qc.invalidateQueries({ queryKey: ["maker-status"] });
    },
  });

  const createSlicingProposalMut = useMutation({
    mutationFn: ({ project }: { project: MakerProject }) =>
      api.studios.maker.createSlicingProposal(project.id, {
        providerId: selectedSlicer?.id,
        targetFileName: sliceFileName,
        printerProfile,
        material: project.material,
        layerHeightMm: 0.2,
        nozzleMm: 0.4,
        infillPercent: 20,
      }),
    onSuccess: (data) => {
      setSlicingProposal(data);
      setActionResult(`${data.status}: ${data.reason}`);
      void qc.invalidateQueries({ queryKey: ["maker-status"] });
    },
  });

  const printWorkflowMut = useMutation({
    mutationFn: ({ project, actionType, providerId }: { project: MakerProject; actionType: string; providerId?: string }) =>
      api.studios.maker.proposePrintAction(project.id, {
        actionType,
        providerId,
        material: project.material,
      }),
    onSuccess: (data) => setActionResult(`${data.status}: ${data.reason}`),
  });

  const createSetupSheetMut = useMutation({
    mutationFn: ({ project }: { project: MakerProject }) =>
      api.studios.maker.createMachineSetupSheet(project.id, {
        providerId: selectedMachineProvider?.id,
        operationType: machineOperation,
        targetFileName: setupSheetFileName,
        machineProfile,
        stock: project.material,
        tool: machineOperation.startsWith("laser")
          ? { name: "unverified laser profile", type: "laser", laserPowerWatts: "review_required" }
          : { name: "unverified endmill", type: "endmill", diameterMm: 3.175 },
        workholding: "Verify clamps/fixture manually before any physical work",
        coordinateOrigin: "Set and verify at the machine",
        units: "mm",
        speedFeedPowerEstimates: { spindleRpm: "estimate_unavailable", feedRateMmMin: "estimate_unavailable", laserPowerPercent: "estimate_unavailable" },
        assumptions: ["Machine profile is not configured", "Simulation/preview must be reviewed before any machine-side action"],
        ppeNotes: ["Wear task-appropriate eye, hearing, dust/fume, and hand protection", "Keep emergency stop and fire controls reachable"],
        verificationChecklist: ["Verify stock, tool, origin, workholding, units, PPE, simulation status, and emergency stop before machine-side work"],
        simulationStatus: "metadata_only",
      }),
    onSuccess: (data) => {
      setSetupSheet(data);
      setActionResult(`${data.status}: ${data.reason}`);
      void qc.invalidateQueries({ queryKey: ["maker-status"] });
    },
  });

  const machineWorkflowMut = useMutation({
    mutationFn: ({ project, actionType }: { project: MakerProject; actionType: string }) =>
      api.studios.maker.proposeMachineAction(project.id, {
        actionType,
        providerId: selectedMachineProvider?.id,
        operationType: machineOperation,
      }),
    onSuccess: (data) => setActionResult(`${data.status}: ${data.reason}`),
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader icon={Printer} title="Maker Studio Foundation" />
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Project name</div>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }} />
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Type</div>
                <select value={type} onChange={(e) => setType(e.target.value as MakerProjectType)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
                  {(["cad", "3d_print", "cnc", "laser", "electronics", "shop", "other"] as MakerProjectType[]).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Safety tier</div>
                <select value={safetyTier} onChange={(e) => setSafetyTier(e.target.value as MakerSafetyTier)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
                  {(status?.safetyPolicies ?? []).map((policy) => (
                    <option key={policy.id} value={policy.id}>{policy.label}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Material / stock</div>
                <input value={materialName} onChange={(e) => setMaterialName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }} />
              </div>
              <div className="md:col-span-2 flex items-end">
                <button onClick={() => createProjectMut.mutate()} disabled={!name.trim() || createProjectMut.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--color-accent)", color: "#fff", opacity: (!name.trim() || createProjectMut.isPending) ? 0.5 : 1 }}>
                  {createProjectMut.isPending ? <Loader size={14} className="animate-spin" /> : <Box size={14} />}
                  Create Project
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {(status?.safetyPolicies ?? []).map((policy) => (
                <div key={policy.id} className="rounded-lg p-3"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                  <div className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>{policy.label}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>{policy.physicalTier}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader icon={AlertTriangle} title="Safety Status" />
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: "var(--color-muted)" }}>Machine control</span>
              <StatusPill status={status?.machineControlEnabled ? "enabled" : "blocked"} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: "var(--color-muted)" }}>Cloud required</span>
              <StatusPill status={status?.cloudRequired ? "enabled" : "disabled"} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: "var(--color-muted)" }}>Projects</span>
              <span style={{ color: "var(--color-foreground)" }}>{status?.counts.projects ?? projects.length}</span>
            </div>
            {actionResult && <div className="text-xs rounded-lg p-3" style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>{actionResult}</div>}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader icon={FileText} title="Projects" />
          <div className="p-4 space-y-3">
            {projects.length === 0 ? (
              <div className="text-sm" style={{ color: "var(--color-muted)" }}>No Maker projects yet.</div>
            ) : projects.map((project) => (
              <button key={project.id} onClick={() => setSelectedProjectId(project.id)}
                className="w-full text-left rounded-lg p-3"
                style={{ background: selectedProject?.id === project.id ? "var(--color-elevated)" : "transparent", border: "1px solid var(--color-border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium" style={{ color: "var(--color-foreground)" }}>{project.name}</div>
                  <StatusPill status={project.safetyTier} />
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                  {project.type} · {String(project.material?.name ?? "material not set")} · {project.status}
                </div>
              </button>
            ))}
            {selectedProject && (
              <div className="flex flex-wrap gap-2 pt-2">
                {[
                  ["simulate", "Simulate"],
                  ["start_print", "Print Proposal"],
                  ["start_cnc", "CNC Manual Check"],
                ].map(([actionType, label]) => (
                  <button key={actionType} onClick={() => proposeActionMut.mutate({ project: selectedProject, actionType })}
                    className="px-3 py-1.5 rounded-lg text-xs"
                    style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader icon={Box} title="CAD Engineer" />
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Design kind</div>
                <select value={designKind} onChange={(e) => setDesignKind(e.target.value as typeof designKind)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
                  {(["cadquery", "build123d", "openscad", "freecad_macro", "kicad_project"] as const).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Target file</div>
                <input value={targetFileName} onChange={(e) => setTargetFileName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }} />
              </div>
            </div>
            <div className="rounded-lg p-3"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>{selectedProvider?.name ?? "Provider"}</span>
                <StatusPill status={selectedProvider?.status ?? "not_configured"} />
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                {selectedProvider?.cloudProvider ? "cloud disabled by default" : "local-first proposal path"} · execution disabled
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => selectedProject && createDesignProposalMut.mutate({ project: selectedProject })}
                disabled={!selectedProject || !targetFileName.trim() || createDesignProposalMut.isPending}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: "var(--color-accent)", color: "#fff", opacity: (!selectedProject || !targetFileName.trim() || createDesignProposalMut.isPending) ? 0.5 : 1 }}>
                {createDesignProposalMut.isPending ? <Loader size={13} className="animate-spin" /> : <FileText size={13} />}
                Create Proposal
              </button>
              <button onClick={() => selectedProvider && cadProviderActionMut.mutate({ providerId: selectedProvider.id, action: "render_export" })}
                disabled={!selectedProvider}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)", opacity: selectedProvider ? 1 : 0.5 }}>
                Render / Export Check
              </button>
              <button onClick={() => selectedProvider && cadProviderActionMut.mutate({ providerId: selectedProvider.id, action: "manufacture" })}
                disabled={!selectedProvider}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)", opacity: selectedProvider ? 1 : 0.5 }}>
                Manufacture Check
              </button>
            </div>
            {designProposal && (
              <div className="rounded-lg p-3 text-xs space-y-2"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
                <div className="font-medium" style={{ color: "var(--color-foreground)" }}>
                  {designProposal.metadata.targetFileNames.join(", ")} · {designProposal.metadata.units}
                </div>
                <div>{designProposal.metadata.workspaceRelativePath}</div>
                <pre className="whitespace-pre-wrap text-xs overflow-x-auto" style={{ color: "var(--color-foreground)" }}>
                  {designProposal.metadata.scriptPreview.join("\n")}
                </pre>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader icon={Printer} title="3D Print Workflow" />
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[
                ["Slicer", selectedSlicer],
                ["Printer", selectedPrinterProvider],
                ["Spoolman", spoolmanProvider],
                ["Obico", obicoProvider],
              ].map(([label, provider]) => {
                const item = provider as MakerPrintProvider | undefined;
                return (
                  <div key={String(label)} className="rounded-lg p-3"
                    style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>{String(label)}</span>
                      <StatusPill status={item?.status ?? "not_configured"} />
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                      {item?.name ?? "Provider missing"} · execution disabled
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Slice output</div>
                <input value={sliceFileName} onChange={(e) => setSliceFileName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }} />
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Printer profile</div>
                <input value={printerProfile} onChange={(e) => setPrinterProfile(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => selectedProject && createSlicingProposalMut.mutate({ project: selectedProject })}
                disabled={!selectedProject || createSlicingProposalMut.isPending}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: "var(--color-accent)", color: "#fff", opacity: (!selectedProject || createSlicingProposalMut.isPending) ? 0.5 : 1 }}>
                {createSlicingProposalMut.isPending ? <Loader size={13} className="animate-spin" /> : <FileText size={13} />}
                Slice Proposal
              </button>
              <button onClick={() => selectedProject && printWorkflowMut.mutate({ project: selectedProject, actionType: "queue_print", providerId: selectedPrinterProvider?.id })}
                disabled={!selectedProject}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)", opacity: selectedProject ? 1 : 0.5 }}>
                Queue Check
              </button>
              <button onClick={() => selectedProject && printWorkflowMut.mutate({ project: selectedProject, actionType: "start_print", providerId: selectedPrinterProvider?.id })}
                disabled={!selectedProject}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)", opacity: selectedProject ? 1 : 0.5 }}>
                Start Approval
              </button>
              <button onClick={() => selectedProject && printWorkflowMut.mutate({ project: selectedProject, actionType: "set_temperature", providerId: selectedPrinterProvider?.id })}
                disabled={!selectedProject}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)", opacity: selectedProject ? 1 : 0.5 }}>
                Heater Gate
              </button>
              <button onClick={() => selectedProject && printWorkflowMut.mutate({ project: selectedProject, actionType: "monitor_failure", providerId: obicoProvider?.id })}
                disabled={!selectedProject}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)", opacity: selectedProject ? 1 : 0.5 }}>
                Monitor Status
              </button>
            </div>
            {slicingProposal && (
              <div className="rounded-lg p-3 text-xs space-y-1"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium" style={{ color: "var(--color-foreground)" }}>{slicingProposal.artifact.name}</span>
                  <StatusPill status={slicingProposal.materialCheck.status} />
                </div>
                <div>{String(slicingProposal.metadata.workspaceRelativePath ?? "")}</div>
                <div>{slicingProposal.materialCheck.reason}</div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader icon={ShieldAlert} title="CNC / Laser / Bench Safety" />
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[
                ["CAM", machineProviders.find((provider) => provider.kind === "cam")],
                ["CNC", machineProviders.find((provider) => provider.kind === "cnc_controller")],
                ["Laser", machineProviders.find((provider) => provider.kind === "laser_workflow")],
                ["Bench", machineProviders.find((provider) => provider.kind === "electronics_bench")],
              ].map(([label, provider]) => {
                const item = provider as MakerMachineProvider | undefined;
                return (
                  <div key={String(label)} className="rounded-lg p-3"
                    style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>{String(label)}</span>
                      <StatusPill status={item?.status ?? "not_configured"} />
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                      {item?.name ?? "Provider missing"} · manual gates visible
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Operation</div>
                <select value={machineOperation} onChange={(e) => setMachineOperation(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
                  <option value="cnc_milling">CNC milling</option>
                  <option value="laser_cutting">Laser cutting</option>
                  <option value="laser_engraving">Laser engraving</option>
                  <option value="electronics_bench">Electronics bench</option>
                  <option value="simulation">Simulation</option>
                </select>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Machine profile</div>
                <input value={machineProfile} onChange={(e) => setMachineProfile(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }} />
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Setup sheet</div>
                <input value={setupSheetFileName} onChange={(e) => setSetupSheetFileName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }} />
              </div>
            </div>
            <div className="rounded-lg p-3 text-xs space-y-1"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium" style={{ color: "var(--color-foreground)" }}>{selectedMachineProvider?.name ?? "Machine provider"}</span>
                <StatusPill status={selectedMachineProvider?.status ?? "not_configured"} />
              </div>
              <div>G-code send, motion, spindle, laser, relay, firmware, and serial/USB writes remain manual-only or blocked.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => selectedProject && createSetupSheetMut.mutate({ project: selectedProject })}
                disabled={!selectedProject || createSetupSheetMut.isPending}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: "var(--color-accent)", color: "#fff", opacity: (!selectedProject || createSetupSheetMut.isPending) ? 0.5 : 1 }}>
                {createSetupSheetMut.isPending ? <Loader size={13} className="animate-spin" /> : <FileText size={13} />}
                Setup Sheet
              </button>
              <button onClick={() => selectedProject && machineWorkflowMut.mutate({ project: selectedProject, actionType: "generate_toolpath" })}
                disabled={!selectedProject}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)", opacity: selectedProject ? 1 : 0.5 }}>
                Toolpath Gate
              </button>
              <button onClick={() => selectedProject && machineWorkflowMut.mutate({ project: selectedProject, actionType: "send_gcode" })}
                disabled={!selectedProject}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)", opacity: selectedProject ? 1 : 0.5 }}>
                G-code Block
              </button>
              <button onClick={() => selectedProject && machineWorkflowMut.mutate({ project: selectedProject, actionType: "laser_fire" })}
                disabled={!selectedProject}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)", opacity: selectedProject ? 1 : 0.5 }}>
                Laser Gate
              </button>
            </div>
            {setupSheet && (
              <div className="rounded-lg p-3 text-xs space-y-1"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium" style={{ color: "var(--color-foreground)" }}>{setupSheet.artifact.name}</span>
                  <StatusPill status={String(setupSheet.metadata.simulationStatus ?? "metadata_only")} />
                </div>
                <div>{String(setupSheet.metadata.workspaceRelativePath ?? "")}</div>
                <div>{(setupSheet.metadata.verificationChecklist ?? []).slice(0, 2).join(" · ")}</div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader icon={Terminal} title="Maker Integrations" />
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
            {integrations.map((integration) => (
              <button key={integration.id} onClick={() => disabledIntegrationMut.mutate(integration.id)}
                className="text-left rounded-lg p-3"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>{integration.name}</span>
                  <StatusPill status={integration.status} />
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>{integration.category}</div>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Robotics Lab tab ─────────────────────────────────────────────────────────

function CapabilityTierBadge({ tier }: { tier: RoboticsCapabilityTier }) {
  const color =
    tier === "simulation_only" ? "var(--color-info)"    :
    tier === "read_state"      ? "var(--color-success)" :
    tier === "plan_motion"     ? "var(--color-warn)"    :
    tier === "execute_motion"  ? "var(--color-error)"   :
                                 "var(--color-error)";
  const label =
    tier === "simulation_only" ? "sim only"   :
    tier === "read_state"      ? "read state" :
    tier === "plan_motion"     ? "plan motion":
    tier === "execute_motion"  ? "⛔ exec blocked":
                                 "⛔ manual only";
  return (
    <span className="text-xs px-2 py-0.5 rounded-full"
      style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color, border: `1px solid color-mix(in srgb, ${color} 30%, transparent)` }}>
      {label}
    </span>
  );
}

function RoboticsLabTab() {
  const statusQ = useQuery({
    queryKey: ["robotics-status"],
    queryFn: () => api.studios.robotics.status(),
    staleTime: 30_000,
  });

  const providersQ = useQuery({
    queryKey: ["robotics-providers"],
    queryFn: () => api.studios.robotics.providers(),
    staleTime: 60_000,
  });

  const status: RoboticsStatus | undefined = statusQ.data?.status;
  const providers: RoboticsProvider[] = providersQ.data?.providers ?? [];

  return (
    <div className="space-y-6">

      {/* Status header */}
      <Card>
        <CardHeader icon={Bot} title="Robotics Lab — Phase 19 Future Layer" />
        <div className="p-4 space-y-3">
          {statusQ.isLoading ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-muted)" }}>
              <Loader size={13} className="animate-spin" /> Loading status…
            </div>
          ) : status ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: "Physical motion",    value: "blocked",        ok: false },
                  { label: "Hardware calls",      value: "disabled",       ok: false },
                  { label: "Serial / USB write",  value: "blocked",        ok: false },
                  { label: "Simulator workflow",  value: "local-first",    ok: true  },
                  { label: "Cloud required",      value: "no",             ok: true  },
                  { label: "Profiles",            value: String(status.profileCount), ok: true },
                  { label: "Sim plans",           value: String(status.simPlanCount), ok: true },
                  { label: "Phase",               value: "19 — future planning", ok: true },
                ].map(({ label, value, ok }) => (
                  <div key={label} className="rounded-lg p-3"
                    style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                    <div className="text-xs" style={{ color: "var(--color-muted)" }}>{label}</div>
                    <div className="text-sm font-medium mt-0.5"
                      style={{ color: ok ? "var(--color-foreground)" : "var(--color-error)" }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg p-3 text-xs"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
                <span className="font-medium" style={{ color: "var(--color-foreground)" }}>Safety: </span>
                No physical robot movement, actuator control, firmware flash, or serial write occurs in Phase 19.
                All action proposals return <code>executed: false</code>. Simulator and hardware providers are not_configured
                until explicitly installed and safety-reviewed in a future phase.
              </div>
            </>
          ) : (
            <div className="text-sm" style={{ color: "var(--color-error)" }}>Failed to load robotics status.</div>
          )}
        </div>
      </Card>

      {/* Provider grid */}
      <Card>
        <CardHeader icon={Bot} title="Integration Profiles (all not_configured)" />
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-2">
          {providersQ.isLoading ? (
            <div className="col-span-3 flex items-center gap-2 text-sm" style={{ color: "var(--color-muted)" }}>
              <Loader size={13} className="animate-spin" /> Loading providers…
            </div>
          ) : providers.length === 0 ? (
            <div className="col-span-3 text-sm" style={{ color: "var(--color-muted)" }}>No providers found.</div>
          ) : providers.map((p) => (
            <div key={p.id} className="rounded-lg p-3"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-medium truncate" style={{ color: "var(--color-foreground)" }}>{p.name}</span>
                <StatusPill status={p.status} />
              </div>
              <div className="text-xs mb-1.5" style={{ color: "var(--color-muted)" }}>{p.category}</div>
              <div className="flex flex-wrap gap-1">
                {p.supportedCapabilities.map((cap) => (
                  <CapabilityTierBadge key={cap} tier={cap} />
                ))}
              </div>
              <div className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>{p.nextAction}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Safety limits card */}
      <Card>
        <CardHeader icon={ShieldAlert} title="Hard Limits — Phase 19" />
        <div className="p-4 space-y-2">
          {[
            { tier: "execute_motion" as RoboticsCapabilityTier,  label: "execute_motion — permanently blocked, no approval unblocks" },
            { tier: "execute_motion" as RoboticsCapabilityTier,  label: "navigate — permanently blocked (autonomous navigation)" },
            { tier: "manual_only"   as RoboticsCapabilityTier,   label: "gripper_open/close, arm_move — manual_only (operator at robot)" },
            { tier: "manual_only"   as RoboticsCapabilityTier,   label: "firmware_flash, relay_toggle, serial_write — manual_only" },
            { tier: "simulation_only" as RoboticsCapabilityTier, label: "sim_run — simulation_only, simulator not_configured until installed" },
            { tier: "read_state"    as RoboticsCapabilityTier,   label: "read_state — not_configured until ROS 2 / sensor provider ready" },
            { tier: "plan_motion"   as RoboticsCapabilityTier,   label: "plan_motion — approval_required, provider not_configured" },
          ].map(({ tier, label }) => (
            <div key={label} className="flex items-center gap-3 text-xs py-1"
              style={{ borderBottom: "1px solid var(--color-border)" }}>
              <CapabilityTierBadge tier={tier} />
              <span style={{ color: "var(--color-muted)" }}>{label}</span>
            </div>
          ))}
        </div>
      </Card>

    </div>
  );
}

// ── Local Builder Studio — Phase 22 ──────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  fast_code:     "Fast Code",
  deep_code:     "Deep Code",
  reviewer:      "Reviewer",
  rag_embedding: "RAG Embedding",
};

const EVAL_LABELS: Record<string, string> = {
  repo_summary:           "Repo Summary",
  safe_patch_plan:        "Safe Patch Plan",
  unsafe_action_detection: "Unsafe Action Detection",
  ledger_update:          "Ledger Update",
};

function ModelRoleRow({ profile, onSave }: {
  profile: LocalBuilderModelProfile;
  onSave: (role: string, modelName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftModel, setDraftModel] = useState(profile.modelName ?? "");

  const statusColor =
    profile.status === "configured"    ? "var(--color-success)" :
    profile.status === "unavailable"   ? "var(--color-error)"   :
                                         "var(--color-muted)";

  return (
    <div className="flex items-center gap-3 px-4 py-3"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div className="w-28 shrink-0 text-xs font-medium" style={{ color: "var(--color-foreground)" }}>
        {ROLE_LABELS[profile.role] ?? profile.role}
      </div>
      {editing ? (
        <div className="flex gap-2 flex-1">
          <input
            className="flex-1 px-2 py-1 rounded text-xs"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
            value={draftModel}
            placeholder="e.g. qwen2.5-coder:7b"
            onChange={(e) => setDraftModel(e.target.value)}
          />
          <button
            className="px-2 py-1 rounded text-xs font-medium"
            style={{ background: "var(--color-accent)", color: "#fff" }}
            onClick={() => { onSave(profile.role, draftModel); setEditing(false); }}>
            Save
          </button>
          <button
            className="px-2 py-1 rounded text-xs"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}
            onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs" style={{ color: profile.modelName ? "var(--color-foreground)" : "var(--color-muted)" }}>
            {profile.modelName ?? "not configured"}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full ml-auto"
            style={{ background: `color-mix(in srgb, ${statusColor} 15%, transparent)`, color: statusColor }}>
            {profile.status}
          </span>
          <button
            className="px-2 py-1 rounded text-xs"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}
            onClick={() => { setDraftModel(profile.modelName ?? ""); setEditing(true); }}>
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

function LocalBuilderStudio() {
  const qc = useQueryClient();

  const statusQ = useQuery({
    queryKey: ["local-builder-status"],
    queryFn:  () => localBuilderApi.status(),
    staleTime: 15_000,
  });

  const packsQ = useQuery({
    queryKey: ["local-builder-packs"],
    queryFn:  () => localBuilderApi.contextPacks(),
    staleTime: 60_000,
  });

  const evalHistoryQ = useQuery({
    queryKey: ["local-builder-eval-history"],
    queryFn:  () => localBuilderApi.evalHistory(),
    staleTime: 30_000,
  });

  const [runningEval, setRunningEval] = useState<string | null>(null);
  const [evalError, setEvalError]     = useState<string | null>(null);
  const [proposing, setProposing]     = useState(false);
  const [phaseId, setPhaseId]         = useState("");
  const [taskSummary, setTaskSummary] = useState("");
  const [proposeResult, setProposeResult] = useState<{ hardBlocked?: boolean; approvalRequired?: boolean; id?: string; hardBlockReason?: string } | null>(null);
  const [proposeError, setProposeError]   = useState<string | null>(null);

  const status: LocalBuilderStatus | null = statusQ.data?.status ?? null;
  const packs:  ContextPackMeta[]         = packsQ.data?.packs   ?? [];
  const history: LocalBuilderEvalResult[] = evalHistoryQ.data?.history ?? [];

  async function handleSaveProfile(role: string, modelName: string) {
    try {
      const newStatus = modelName.trim() ? "configured" : "not_configured";
      await localBuilderApi.updateProfile(role as Parameters<typeof localBuilderApi.updateProfile>[0], {
        modelName: modelName.trim() || null,
        status:    newStatus,
      });
      void qc.invalidateQueries({ queryKey: ["local-builder-status"] });
    } catch {
      // non-fatal; status will reflect old value
    }
  }

  async function handleRunEval(evalName: string) {
    setRunningEval(evalName);
    setEvalError(null);
    try {
      await localBuilderApi.runEval(evalName as Parameters<typeof localBuilderApi.runEval>[0]);
      void qc.invalidateQueries({ queryKey: ["local-builder-eval-history"] });
      void qc.invalidateQueries({ queryKey: ["local-builder-status"] });
    } catch (err) {
      setEvalError((err as Error).message);
    } finally {
      setRunningEval(null);
    }
  }

  async function handlePropose() {
    setProposing(true);
    setProposeResult(null);
    setProposeError(null);
    try {
      const result = await localBuilderApi.proposeBuild({
        phaseId,
        taskSummary,
        contextPacks: ["core-architecture", "safety-and-permissions", "current-build-state"],
      });
      setProposeResult(result.proposal);
    } catch (err) {
      setProposeError((err as Error).message);
    } finally {
      setProposing(false);
    }
  }

  return (
    <div className="space-y-5">

      {/* Hard limits banner */}
      <div className="rounded-xl px-4 py-3 flex items-start gap-3"
        style={{ background: "color-mix(in srgb, var(--color-accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)" }}>
        <ShieldAlert size={16} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: 2 }} />
        <div className="text-xs space-y-0.5" style={{ color: "var(--color-foreground)" }}>
          <div className="font-semibold">Hard limits — permanent, cannot be overridden</div>
          <div style={{ color: "var(--color-muted)" }}>
            Cloud escalation disabled · Self-modification requires approval · No secrets in logs
          </div>
        </div>
      </div>

      {/* Model readiness checklist */}
      <Card>
        <CardHeader icon={CheckCircle} title="Model Readiness" />
        {statusQ.isLoading && <div className="px-4 py-3 text-sm" style={{ color: "var(--color-muted)" }}>Loading…</div>}
        {statusQ.isError   && <div className="px-4 py-3 text-sm" style={{ color: "var(--color-error)" }}>Failed to load builder status.</div>}
        {status && (
          <>
            <div className="px-4 py-3 flex items-center gap-3"
              style={{ borderBottom: "1px solid var(--color-border)" }}>
              <span className={`text-xs px-2 py-0.5 rounded-full`}
                style={{
                  background: status.readyForBuild
                    ? "color-mix(in srgb, var(--color-success) 15%, transparent)"
                    : "color-mix(in srgb, var(--color-warning, orange) 15%, transparent)",
                  color: status.readyForBuild ? "var(--color-success)" : "var(--color-warning, orange)",
                }}>
                {status.readyForBuild ? "Ready to build" : "Not ready"}
              </span>
              {!status.readyForBuild && (
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                  {status.notReadyReasons[0]}
                  {status.notReadyReasons.length > 1 && ` (+${status.notReadyReasons.length - 1} more)`}
                </span>
              )}
            </div>
            {(status.profiles as LocalBuilderModelProfile[]).map((p) => (
              <ModelRoleRow key={p.role} profile={p} onSave={handleSaveProfile} />
            ))}
          </>
        )}
      </Card>

      {/* Context pack viewer */}
      <Card>
        <CardHeader icon={BookOpen} title="Context Packs" />
        {packsQ.isLoading && <div className="px-4 py-3 text-sm" style={{ color: "var(--color-muted)" }}>Loading…</div>}
        {packsQ.isError   && <div className="px-4 py-3 text-sm" style={{ color: "var(--color-error)" }}>Failed to load context packs.</div>}
        {packs.length === 0 && !packsQ.isLoading && (
          <div className="px-4 py-3 text-sm" style={{ color: "var(--color-muted)" }}>
            No context packs found. Expected in docs/context-packs/.
          </div>
        )}
        {packs.map((pack) => (
          <div key={pack.name} className="px-4 py-3 flex items-start gap-3"
            style={{ borderBottom: "1px solid var(--color-border)" }}>
            <FileText size={14} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: 2 }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: "var(--color-foreground)" }}>{pack.title}</div>
              <div className="text-xs truncate mt-0.5" style={{ color: "var(--color-muted)" }}>{pack.description}</div>
            </div>
            <span className="text-xs shrink-0" style={{ color: "var(--color-muted)" }}>
              {Math.round(pack.sizeBytes / 1024 * 10) / 10} KB
            </span>
          </div>
        ))}
      </Card>

      {/* Build Jarvis proposal */}
      <Card>
        <CardHeader icon={Bot} title="Build Jarvis" />
        <div className="p-4 space-y-3">
          <div className="text-xs" style={{ color: "var(--color-muted)" }}>
            Propose a build task for the next phase. A local model will draft the changes; approval is required before any file is modified.
          </div>
          <div className="flex gap-2">
            <input
              className="w-24 px-2 py-1.5 rounded text-xs"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
              placeholder="Phase #"
              value={phaseId}
              onChange={(e) => setPhaseId(e.target.value)}
            />
            <input
              className="flex-1 px-2 py-1.5 rounded text-xs"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
              placeholder="Task summary (what this phase implements)"
              value={taskSummary}
              onChange={(e) => setTaskSummary(e.target.value)}
            />
          </div>
          <button
            className="px-3 py-1.5 rounded text-xs font-medium flex items-center gap-2"
            style={{ background: "var(--color-accent)", color: "#fff", opacity: (!phaseId || !taskSummary || proposing) ? 0.5 : 1 }}
            disabled={!phaseId || !taskSummary || proposing}
            onClick={() => void handlePropose()}>
            {proposing && <Loader size={12} className="animate-spin" />}
            Propose Build Task
          </button>
          {proposeError && (
            <div className="text-xs rounded px-3 py-2" style={{ background: "color-mix(in srgb, var(--color-error) 12%, transparent)", color: "var(--color-error)" }}>
              {proposeError}
            </div>
          )}
          {proposeResult && (
            <div className="text-xs rounded px-3 py-2 space-y-1"
              style={{
                background: proposeResult.hardBlocked
                  ? "color-mix(in srgb, var(--color-error) 12%, transparent)"
                  : "color-mix(in srgb, var(--color-success) 10%, transparent)",
                color: proposeResult.hardBlocked ? "var(--color-error)" : "var(--color-success)",
              }}>
              {proposeResult.hardBlocked ? (
                <><AlertTriangle size={12} className="inline mr-1" />Blocked: {proposeResult.hardBlockReason ?? "hard limit triggered"}</>
              ) : (
                <><CheckCircle size={12} className="inline mr-1" />Proposal created — approval required before execution (ID: {proposeResult.id?.slice(0, 8) ?? "?"}…)</>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Local evals */}
      <Card>
        <CardHeader icon={Play} title="Local Evals" />
        <div className="p-4 space-y-2">
          <div className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
            Evals run fully locally — no network access. Each eval validates a safety invariant.
          </div>
          {(["repo_summary", "safe_patch_plan", "unsafe_action_detection", "ledger_update"] as const).map((name) => {
            const last = history.find((h) => h.evalName === name);
            const running = runningEval === name;
            return (
              <div key={name} className="flex items-center gap-3 rounded-lg px-3 py-2"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                <span className="text-xs flex-1" style={{ color: "var(--color-foreground)" }}>
                  {EVAL_LABELS[name] ?? name}
                </span>
                {last && (
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: last.passed
                        ? "color-mix(in srgb, var(--color-success) 15%, transparent)"
                        : "color-mix(in srgb, var(--color-error) 15%, transparent)",
                      color: last.passed ? "var(--color-success)" : "var(--color-error)",
                    }}>
                    {last.passed ? "pass" : "fail"} {Math.round(last.score * 100)}%
                  </span>
                )}
                <button
                  className="px-2 py-1 rounded text-xs flex items-center gap-1"
                  style={{ background: "var(--color-surface)", color: "var(--color-accent)", border: "1px solid var(--color-border)" }}
                  disabled={running || runningEval !== null}
                  onClick={() => void handleRunEval(name)}>
                  {running ? <Loader size={11} className="animate-spin" /> : <Play size={11} />}
                  Run
                </button>
              </div>
            );
          })}
          {evalError && (
            <div className="text-xs rounded px-3 py-2 mt-2" style={{ background: "color-mix(in srgb, var(--color-error) 12%, transparent)", color: "var(--color-error)" }}>
              Eval error: {evalError}
            </div>
          )}
        </div>
      </Card>

    </div>
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
    { id: "maker",      label: "Maker",             icon: Printer },
    { id: "robotics",       label: "Robotics Lab",   icon: Bot },
    { id: "local-builder",  label: "Local Builder",  icon: Code2 },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6"
      style={{ background: "var(--color-background)" }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-foreground)" }}>Studios</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            Workspace presets · vibe coding · image generation · CAD scripting · Maker Studio
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
      {tab === "maker"          && <MakerStudioTab />}
      {tab === "robotics"       && <RoboticsLabTab />}
      {tab === "local-builder"  && <LocalBuilderStudio />}
    </div>
  );
}
