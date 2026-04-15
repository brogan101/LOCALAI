import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Zap, Image, Box, RefreshCw, Play, Loader, CheckCircle, AlertTriangle } from "lucide-react";
import api, { type CadScriptResult, type ImageGenResult, type ImageGenStatus } from "../api.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudioTemplate {
  id: string;
  label: string;
  category: string;
  icon: string;
  description: string;
  stack: string[];
}

type StudioTab = "vibe" | "imagegen" | "cad";

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
      {/* Template picker */}
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

      {/* Brief + build */}
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

      {/* Build status */}
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StudiosPage() {
  const [tab, setTab] = useState<StudioTab>("vibe");
  const qc = useQueryClient();

  const catalogQ = useQuery({
    queryKey: ["studios-catalog"],
    queryFn: () => api.studios.catalog(),
    staleTime: 60_000,
  });

  const workspaces = (catalogQ.data?.workspaces ?? []) as Array<{ name?: string; path?: string; createdAt?: string }>;

  const tabs: Array<{ id: StudioTab; label: string; icon: React.ElementType }> = [
    { id: "vibe",     label: "Vibe Coding",       icon: Zap },
    { id: "imagegen", label: "Image Generation",  icon: Image },
    { id: "cad",      label: "CAD / Hardware",    icon: Box },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6"
      style={{ background: "var(--color-background)" }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-foreground)" }}>Studios</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            Autonomous build pipelines · image generation · CAD scripting
          </p>
        </div>
        <button onClick={() => void qc.invalidateQueries({ queryKey: ["studios-catalog"] })}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Existing studios */}
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
      {tab === "vibe"     && <VibeCodingTab />}
      {tab === "imagegen" && <ImageGenTab />}
      {tab === "cad"      && <CadTab />}
    </div>
  );
}
