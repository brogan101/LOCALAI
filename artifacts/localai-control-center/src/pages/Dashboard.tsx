import { useEffect, useRef, useState, type ElementType } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Cpu, MemoryStick, Target, RefreshCw, Zap, AlertTriangle,
  CheckCircle, XCircle, Power, Activity, TrendingUp, ChevronRight,
  HardDrive, Server, Wrench, Search, Sparkles, Play, ArrowRight,
  MonitorCheck, Wifi, WifiOff, BarChart2,
  Code2, Box, Image, FileText, BookOpen, Car, Terminal,
  FileSearch, Printer,
} from "lucide-react";
import api, { type ThoughtEntry, type RepairHealthEntry, type HardwareSnapshot, type WorkspacePreset } from "../api.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(bytes: number): string {
  if (bytes === 0) return "0 B";
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

function levelColor(level: ThoughtEntry["level"]): string {
  switch (level) {
    case "error":   return "var(--color-error)";
    case "warning": return "var(--color-warn)";
    case "info":    return "var(--color-info)";
    default:        return "var(--color-muted)";
  }
}

function levelBg(level: ThoughtEntry["level"]): string {
  switch (level) {
    case "error":   return "color-mix(in srgb, var(--color-error) 12%, transparent)";
    case "warning": return "color-mix(in srgb, var(--color-warn) 12%, transparent)";
    case "info":    return "color-mix(in srgb, var(--color-info) 12%, transparent)";
    default:        return "transparent";
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, accent, onClick,
}: {
  label: string; value: string; sub?: string;
  icon: ElementType; accent?: string; onClick?: () => void;
}) {
  const color = accent ?? "var(--color-accent)";
  return (
    <div
      className={`rounded-xl p-4 flex gap-3 items-start ${onClick ? "cursor-pointer hover:opacity-90" : ""}`}
      onClick={onClick}
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: `color-mix(in srgb, ${color} 15%, transparent)` }}>
        <Icon size={17} style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>{label}</div>
        <div className="font-semibold text-sm truncate" style={{ color: "var(--color-foreground)" }}>{value}</div>
        {sub && <div className="text-xs mt-0.5 truncate" style={{ color: "var(--color-muted)" }}>{sub}</div>}
      </div>
      {onClick && <ChevronRight size={14} style={{ color: "var(--color-muted)", flexShrink: 0, alignSelf: "center" }} />}
    </div>
  );
}

function VramBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const color =
    pct > 85 ? "var(--color-error)" :
    pct > 65 ? "var(--color-warn)"  :
               "var(--color-success)";
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--color-muted)" }}>
        <span>{fmt(used)} used</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--color-border)" }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="text-xs mt-1 text-right" style={{ color: "var(--color-muted)" }}>{fmt(total)} total</div>
    </div>
  );
}

function ExecutionPlan({ steps, activeStep }: { steps: string[]; activeStep: number }) {
  if (!steps.length) return null;
  return (
    <ol className="space-y-1.5 mt-3">
      {steps.map((step, i) => {
        const done = i < activeStep;
        const active = i === activeStep;
        return (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
              style={{
                background: done ? "var(--color-success)" : active ? "var(--color-accent)" : "var(--color-border)",
                color: done || active ? "#fff" : "var(--color-muted)",
              }}>
              {done ? "✓" : i + 1}
            </div>
            <span style={{ color: done ? "var(--color-muted)" : active ? "var(--color-foreground)" : "var(--color-muted)" }}>
              {step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ── Thought log (SSE) ─────────────────────────────────────────────────────────

function ThoughtLog() {
  const [entries, setEntries] = useState<ThoughtEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["thoughts"],
    queryFn: () => api.observability.thoughts(50),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data?.entries) setEntries(data.entries.slice(-50));
  }, [data]);

  useEffect(() => {
    const es = api.observability.streamThoughts();
    es.onmessage = (e) => {
      try {
        const entry = JSON.parse(e.data) as ThoughtEntry;
        setEntries(prev => {
          const next = [...prev, entry];
          return next.length > 200 ? next.slice(-200) : next;
        });
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [entries]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={15} style={{ color: "var(--color-accent)" }} />
        <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>Thought Log</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "var(--color-success)" }} />
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>live</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 text-xs font-mono" style={{ maxHeight: 260 }}>
        {entries.length === 0 && (
          <div className="py-6 text-center" style={{ color: "var(--color-muted)" }}>No log entries yet</div>
        )}
        {entries.map((entry, idx) => (
          <div key={entry.id ?? idx} className="flex gap-2 p-1.5 rounded slide-in"
            style={{ background: levelBg(entry.level) }}>
            <span style={{ color: levelColor(entry.level), flexShrink: 0 }}>
              [{entry.level.toUpperCase().slice(0, 4)}]
            </span>
            <span style={{ color: "var(--color-muted)", flexShrink: 0 }}>{entry.category}</span>
            <span className="flex-1 truncate" style={{ color: "var(--color-foreground)" }}>
              {entry.title}: {entry.message}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Running models strip ───────────────────────────────────────────────────────

function RunningModels() {
  const { data } = useQuery({
    queryKey: ["running"],
    queryFn: () => api.models.running(),
    refetchInterval: 10_000,
  });

  const models = data?.models ?? [];
  if (!models.length) return (
    <div className="text-xs" style={{ color: "var(--color-muted)" }}>No models loaded</div>
  );

  return (
    <div className="flex flex-wrap gap-2">
      {models.map(m => (
        <div key={m.name}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: "color-mix(in srgb, var(--color-success) 12%, transparent)", color: "var(--color-success)", border: "1px solid color-mix(in srgb, var(--color-success) 25%, transparent)" }}>
          <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "var(--color-success)" }} />
          {m.name}
          <span className="opacity-60">· {m.sizeVramFormatted}</span>
        </div>
      ))}
    </div>
  );
}

// ── Health / Repair quick-card ────────────────────────────────────────────────

function HealthCard({ onNavigate }: { onNavigate: (path: string) => void }) {
  const qc = useQueryClient();

  const healthQ = useQuery({
    queryKey: ["repair-health-dash"],
    queryFn: () => api.repair.health(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const repairMut = useMutation({
    mutationFn: (ids: string[]) => api.repair.run(ids),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["repair-health-dash"] }),
  });

  const h = healthQ.data;
  if (!h) return null;

  const issues: RepairHealthEntry[] = h.items.filter((i: RepairHealthEntry) => i.status !== "ok" && i.canRepair);
  const scoreColor =
    h.healthScore >= 80 ? "var(--color-success)" :
    h.healthScore >= 50 ? "var(--color-warn)" :
                          "var(--color-error)";

  return (
    <div className="rounded-xl p-4"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Wrench size={14} style={{ color: scoreColor }} />
        <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>System Health</span>
        <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded"
          style={{ background: `color-mix(in srgb, ${scoreColor} 15%, transparent)`, color: scoreColor }}>
          {h.healthScore}/100
        </span>
      </div>

      <div className="flex gap-3 text-xs mb-3">
        {h.ok > 0 && <span style={{ color: "var(--color-success)" }}><CheckCircle size={10} className="inline mr-0.5" />{h.ok} ok</span>}
        {h.warnings > 0 && <span style={{ color: "var(--color-warn)" }}><AlertTriangle size={10} className="inline mr-0.5" />{h.warnings} warn</span>}
        {h.errors > 0 && <span style={{ color: "var(--color-error)" }}><XCircle size={10} className="inline mr-0.5" />{h.errors} error</span>}
      </div>

      {h.recommendations.slice(0, 2).map((r, i) => (
        <div key={i} className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>· {r}</div>
      ))}

      <div className="flex gap-2 mt-3">
        {issues.length > 0 && (
          <button
            disabled={repairMut.isPending}
            onClick={() => repairMut.mutate(issues.map((i: RepairHealthEntry) => i.id))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "var(--color-accent)", color: "#fff", opacity: repairMut.isPending ? 0.6 : 1 }}>
            <Wrench size={11} />
            {repairMut.isPending ? "Repairing…" : `Repair ${issues.length} issue${issues.length !== 1 ? "s" : ""}`}
          </button>
        )}
        <button
          onClick={() => onNavigate("/diagnostics")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
          Details <ChevronRight size={10} />
        </button>
      </div>
      {repairMut.isSuccess && (
        <div className="text-xs mt-1" style={{ color: "var(--color-success)" }}>Repair complete</div>
      )}
    </div>
  );
}

// ── Storage card ──────────────────────────────────────────────────────────────

function StorageCard() {
  const storageQ = useQuery({
    queryKey: ["storage-dash"],
    queryFn: () => api.systemExtra.storage(),
    staleTime: 120_000,
  });

  const d = storageQ.data;
  if (!d) return null;

  return (
    <div className="rounded-xl p-4"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <HardDrive size={14} style={{ color: "var(--color-accent)" }} />
        <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>Storage</span>
        <span className="ml-auto text-xs" style={{ color: "var(--color-muted)" }}>{d.totalFormatted} total</span>
      </div>
      <div className="space-y-1.5">
        {d.items.slice(0, 4).map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="flex-1 truncate" style={{ color: "var(--color-muted)" }}>{item.label}</span>
            <span style={{ color: "var(--color-foreground)" }}>{item.sizeFormatted}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Stack summary card ────────────────────────────────────────────────────────

function StackSummaryCard({ onNavigate }: { onNavigate: (path: string) => void }) {
  const stackQ = useQuery({
    queryKey: ["stack-dash"],
    queryFn: () => api.stack.status(),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const components = stackQ.data?.components ?? [];
  const running = components.filter(c => c.running).length;
  const total = components.length;

  if (total === 0) return null;

  return (
    <div className="rounded-xl p-4 cursor-pointer hover:opacity-90"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      onClick={() => onNavigate("/operations")}>
      <div className="flex items-center gap-2 mb-2">
        <Server size={14} style={{ color: running === total ? "var(--color-success)" : "var(--color-warn)" }} />
        <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>Stack</span>
        <span className="ml-auto text-xs"
          style={{ color: running === total ? "var(--color-success)" : "var(--color-warn)" }}>
          {running}/{total} running
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {components.slice(0, 6).map((c) => (
          <span key={c.id} className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: c.running
                ? "color-mix(in srgb, var(--color-success) 12%, transparent)"
                : "var(--color-elevated)",
              color: c.running ? "var(--color-success)" : "var(--color-muted)",
            }}>
            {c.name}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1 text-xs mt-2" style={{ color: "var(--color-muted)" }}>
        Manage stack <ArrowRight size={10} />
      </div>
    </div>
  );
}

// ── Model Recommend quick widget ──────────────────────────────────────────────

function ModelRecommendCard() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<{ title?: string; reason?: string; modelName?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function recommend() {
    if (!prompt.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await api.modelsExtra.recommend(prompt);
      const rec = r.recommendation as { title?: string; reason?: string; modelName?: string } | null;
      setResult(rec);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl p-4"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <Search size={14} style={{ color: "var(--color-accent)" }} />
        <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>Recommend Model</span>
      </div>
      <div className="flex gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void recommend()}
          placeholder="Describe your task…"
          className="flex-1 px-3 py-1.5 rounded-lg text-xs"
          style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
        />
        <button
          disabled={!prompt.trim() || loading}
          onClick={() => void recommend()}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
          style={{ background: "var(--color-accent)", color: "#fff" }}>
          {loading ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
        </button>
      </div>
      {err && <div className="text-xs mt-2" style={{ color: "var(--color-error)" }}>{err}</div>}
      {result && (
        <div className="mt-3 p-2.5 rounded-lg text-xs"
          style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
          {result.title && <div className="font-semibold mb-0.5" style={{ color: "var(--color-foreground)" }}>{result.title}</div>}
          {result.modelName && <div className="font-mono" style={{ color: "var(--color-accent)" }}>{result.modelName}</div>}
          {result.reason && <div className="mt-1" style={{ color: "var(--color-muted)" }}>{result.reason}</div>}
        </div>
      )}
    </div>
  );
}

// ── Quick actions ─────────────────────────────────────────────────────────────

function QuickActions({ onNavigate }: { onNavigate: (path: string) => void }) {
  const actions = [
    { label: "New Chat",         icon: Sparkles, path: "/chat",        accent: "var(--color-accent)" },
    { label: "Open Workspace",   icon: Activity,  path: "/workspace",   accent: "var(--color-info)" },
    { label: "Run Studio",       icon: Play,      path: "/studios",     accent: "var(--color-warn)" },
    { label: "Stack Control",    icon: Server,    path: "/operations",  accent: "var(--color-success)" },
    { label: "Diagnostics",      icon: Wrench,    path: "/diagnostics", accent: "var(--color-error)" },
  ];

  return (
    <div className="rounded-xl p-4"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <Zap size={14} style={{ color: "var(--color-accent)" }} />
        <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>Quick Actions</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={() => onNavigate(a.path)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-left transition-opacity hover:opacity-90"
            style={{ background: `color-mix(in srgb, ${a.accent} 10%, var(--color-elevated))`, color: "var(--color-foreground)", border: `1px solid color-mix(in srgb, ${a.accent} 20%, var(--color-border))` }}>
            <a.icon size={13} style={{ color: a.accent, flexShrink: 0 }} />
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Activity feed ─────────────────────────────────────────────────────────────

function ActivityFeed() {
  const actQ = useQuery({
    queryKey: ["activity-dash"],
    queryFn: () => api.system.activity(),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const entries = (actQ.data?.entries ?? []).slice(0, 8);

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <Activity size={14} style={{ color: "var(--color-accent)" }} />
        <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>Recent Activity</span>
      </div>
      {entries.length === 0 && (
        <div className="p-6 text-sm text-center" style={{ color: "var(--color-muted)" }}>No recent activity</div>
      )}
      {entries.map((e, i) => {
        const color = e.status === "success" ? "var(--color-success)"
          : e.status === "error" ? "var(--color-error)"
          : "var(--color-muted)";
        return (
          <div key={e.id ?? i} className="flex items-center gap-3 px-4 py-2.5 text-xs"
            style={{ borderBottom: i < entries.length - 1 ? "1px solid var(--color-border)" : undefined }}>
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
            <div className="flex-1 min-w-0">
              <span className="font-medium" style={{ color: "var(--color-foreground)" }}>{e.action}</span>
              {e.component && <span className="mx-1 opacity-50" style={{ color: "var(--color-muted)" }}>·</span>}
              {e.component && <span style={{ color: "var(--color-muted)" }}>{e.component}</span>}
            </div>
            <span style={{ color: "var(--color-muted)", flexShrink: 0 }}>
              {new Date(e.timestamp).toLocaleTimeString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Capability badges ─────────────────────────────────────────────────────────

function CapabilityBadges({ capabilities }: { capabilities: Record<string, { enabled: boolean; active: boolean; phase: string }> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(capabilities).map(([id, cap]) => (
        <div key={id}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-xs"
          style={{
            background: cap.active
              ? "color-mix(in srgb, var(--color-accent) 15%, transparent)"
              : cap.enabled ? "var(--color-elevated)" : "var(--color-border)",
            color: cap.active ? "var(--color-accent)" : cap.enabled ? "var(--color-foreground)" : "var(--color-muted)",
            border: `1px solid ${cap.active ? "color-mix(in srgb, var(--color-accent) 30%, transparent)" : "var(--color-border)"}`,
          }}>
          {cap.active && <div className="w-1 h-1 rounded-full pulse-dot" style={{ background: "var(--color-accent)" }} />}
          {id}
        </div>
      ))}
    </div>
  );
}

function SystemCard() {
  const { data: hw, isLoading } = useQuery<HardwareSnapshot>({
    queryKey: ["hardware"],
    queryFn: () => api.hardware.probe(),
    refetchInterval: 10_000,
  });

  const probeBadgeColor =
    hw?.gpu.probedVia === "nvidia-smi" ? "var(--color-success)" :
    hw?.gpu.probedVia === "wmic"       ? "var(--color-warn)"    :
                                         "var(--color-muted)";

  const vramUsed = hw ? hw.gpu.totalVramBytes - hw.gpu.freeVramBytes : 0;
  const vramPct  = hw && hw.gpu.totalVramBytes > 0
    ? Math.min(100, (vramUsed / hw.gpu.totalVramBytes) * 100)
    : 0;
  const vramColor =
    vramPct > 85 ? "var(--color-error)" :
    vramPct > 65 ? "var(--color-warn)"  :
                   "var(--color-success)";

  const ramPct = hw && hw.ram.totalBytes > 0
    ? Math.min(100, ((hw.ram.totalBytes - hw.ram.freeBytes) / hw.ram.totalBytes) * 100)
    : 0;

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        gridColumn: "span 2",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <MonitorCheck size={14} style={{ color: "var(--color-accent)" }} />
        <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
          System Hardware
        </span>
        {hw && (
          <span
            className="ml-auto text-xs px-1.5 py-0.5 rounded font-mono"
            style={{
              background: `color-mix(in srgb, ${probeBadgeColor} 15%, transparent)`,
              color: probeBadgeColor,
            }}
          >
            {hw.gpu.probedVia}
          </span>
        )}
      </div>

      {isLoading && !hw && (
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>Probing hardware…</p>
      )}

      {hw && (
        <div className="grid gap-x-6 gap-y-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {/* GPU */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <HardDrive size={12} style={{ color: "var(--color-muted)" }} />
              <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>GPU</span>
            </div>
            <div className="text-xs font-semibold truncate mb-1" style={{ color: "var(--color-foreground)" }}>
              {hw.gpu.name}
            </div>
            <div className="flex justify-between text-xs mb-1" style={{ color: "var(--color-muted)" }}>
              <span>{fmt(hw.gpu.freeVramBytes)} free / {fmt(hw.gpu.totalVramBytes)} total</span>
              <span>{vramPct.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-border)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${vramPct}%`, background: vramColor }}
              />
            </div>
            {hw.gpu.driver && (
              <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                Driver {hw.gpu.driver}
              </div>
            )}
          </div>

          {/* CPU */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Cpu size={12} style={{ color: "var(--color-muted)" }} />
              <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>CPU</span>
            </div>
            <div className="text-xs font-semibold truncate mb-1" style={{ color: "var(--color-foreground)" }}>
              {hw.cpu.model}
            </div>
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>
              {hw.cpu.physicalCores}C / {hw.cpu.logicalCores}T
              {hw.cpu.speedMhz > 0 && ` · ${(hw.cpu.speedMhz / 1000).toFixed(1)} GHz`}
            </div>
          </div>

          {/* RAM */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <MemoryStick size={12} style={{ color: "var(--color-muted)" }} />
              <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>RAM</span>
            </div>
            <div className="flex justify-between text-xs mb-1" style={{ color: "var(--color-foreground)" }}>
              <span>{fmt(hw.ram.freeBytes)} free / {fmt(hw.ram.totalBytes)} total</span>
              <span style={{ color: "var(--color-muted)" }}>{ramPct.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-border)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${ramPct}%`,
                  background: ramPct > 85 ? "var(--color-error)" : ramPct > 65 ? "var(--color-warn)" : "var(--color-info)",
                }}
              />
            </div>
          </div>

          {/* Disk + OS + Ollama */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Server size={12} style={{ color: "var(--color-muted)" }} />
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                Disk: {fmt(hw.disk.installDriveFreeBytes)} free / {fmt(hw.disk.installDriveTotalBytes)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <MonitorCheck size={12} style={{ color: "var(--color-muted)" }} />
              <span className="text-xs truncate" style={{ color: "var(--color-muted)" }}>
                {hw.os.platform} {hw.os.release}{hw.os.build ? ` (${hw.os.build})` : ""} · {hw.os.arch}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {hw.ollama.reachable
                ? <Wifi size={12} style={{ color: "var(--color-success)" }} />
                : <WifiOff size={12} style={{ color: "var(--color-error)" }} />}
              <span
                className="text-xs"
                style={{ color: hw.ollama.reachable ? "var(--color-success)" : "var(--color-error)" }}
              >
                Ollama {hw.ollama.reachable ? "reachable" : "unreachable"} · {hw.ollama.url}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Token Usage Sparkline ─────────────────────────────────────────────────────

function TokenSparkline() {
  const todayQ = useQuery({
    queryKey: ["usage-today-dash"],
    queryFn: () => api.usage.today(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const histQ = useQuery({
    queryKey: ["usage-history-dash"],
    queryFn: () => api.usage.history(7),
    staleTime: 120_000,
  });

  const today = todayQ.data as {
    totalTokens?: number;
    byModel?: Record<string, { tokens: number }>;
    warnHit?: boolean;
    warningThreshold?: number;
  } | undefined;

  const history = histQ.data as {
    history?: Array<{ date: string; totalTokens: number }>;
  } | undefined;

  const totalToday = today?.totalTokens ?? 0;
  const warnHit = today?.warnHit ?? false;
  const days = Array.isArray(history?.history) ? history.history : [];

  // Build sparkline bars — last 7 days
  const maxTokens = Math.max(...days.map(d => d.totalTokens), 1);

  return (
    <div className="rounded-xl p-4"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 size={14} style={{ color: "var(--color-info)" }} />
        <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>Token Usage</span>
        {warnHit && (
          <span className="ml-auto text-xs px-1.5 py-0.5 rounded"
            style={{ background: "color-mix(in srgb, var(--color-warn) 15%, transparent)", color: "var(--color-warn)" }}>
            Warning threshold hit
          </span>
        )}
      </div>

      {/* Today total */}
      <div className="text-2xl font-bold tabular-nums mb-2"
        style={{ color: warnHit ? "var(--color-warn)" : "var(--color-foreground)" }}>
        {totalToday.toLocaleString()}
        <span className="text-xs font-normal ml-1.5" style={{ color: "var(--color-muted)" }}>today</span>
      </div>

      {/* Sparkline bars */}
      {days.length > 0 && (
        <div className="flex items-end gap-1 h-10">
          {days.map((d) => {
            const pct = maxTokens > 0 ? (d.totalTokens / maxTokens) * 100 : 0;
            const isToday = d.date === new Date().toISOString().slice(0, 10);
            return (
              <div key={d.date}
                title={`${d.date}: ${d.totalTokens.toLocaleString()} tokens`}
                className="flex-1 rounded-t transition-all"
                style={{
                  height: `${Math.max(4, pct)}%`,
                  background: isToday ? "var(--color-info)" : "color-mix(in srgb, var(--color-info) 35%, transparent)",
                  minHeight: 4,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Top models */}
      {today?.byModel && (
        <div className="mt-2 space-y-0.5">
          {Object.entries(today.byModel)
            .sort(([, a], [, b]) => b.tokens - a.tokens)
            .slice(0, 3)
            .map(([model, stats]) => (
              <div key={model} className="flex items-center justify-between text-xs">
                <span className="font-mono truncate max-w-[160px]" style={{ color: "var(--color-muted)" }}>{model}</span>
                <span style={{ color: "var(--color-foreground)" }}>{stats.tokens.toLocaleString()}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ── Quick Launch Presets (Dashboard bottom) ───────────────────────────────────

function presetIcon(name: string, size = 14): React.ReactElement {
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

function QuickLaunchPresets({ onNavigate }: { onNavigate: (p: string) => void }) {
  const presetsQ = useQuery({
    queryKey: ["studios-presets"],
    queryFn: () => api.studios.presets.list(),
    staleTime: 120_000,
  });

  const presets: WorkspacePreset[] = presetsQ.data?.presets ?? [];

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <div className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: "1px solid var(--color-border)" }}>
        <Zap size={14} style={{ color: "var(--color-accent)" }} />
        <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
          Quick Launch — Workspace Presets
        </span>
        <button
          onClick={() => onNavigate("/studios")}
          className="ml-auto flex items-center gap-1 text-xs"
          style={{ color: "var(--color-muted)" }}>
          All presets <ChevronRight size={11} />
        </button>
      </div>
      <div className="grid grid-cols-5 gap-0"
        style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        {presets.slice(0, 10).map((preset, i) => {
          const dotColor =
            preset.readiness === "ready"   ? "var(--color-success)" :
            preset.readiness === "partial" ? "var(--color-warn)"    :
                                             "var(--color-error)";
          return (
            <button
              key={preset.id}
              onClick={() => onNavigate(`/studios`)}
              className="flex flex-col items-center gap-1.5 py-4 px-2 text-center transition-colors hover:opacity-80"
              style={{
                borderRight: (i % 5 !== 4) ? "1px solid var(--color-border)" : undefined,
                borderBottom: i < 5 ? "1px solid var(--color-border)" : undefined,
              }}>
              <div className="relative">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: "color-mix(in srgb, var(--color-accent) 10%, transparent)", color: "var(--color-accent)" }}>
                  {presetIcon(preset.icon)}
                </div>
                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                  style={{ background: dotColor }} />
              </div>
              <span className="text-xs leading-tight" style={{ color: "var(--color-foreground)", fontSize: 11 }}>
                {preset.name}
              </span>
            </button>
          );
        })}
        {presetsQ.isLoading && (
          <div className="col-span-5 py-6 text-center text-xs" style={{ color: "var(--color-muted)" }}>
            Loading…
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const { data: kernel } = useQuery({
    queryKey: ["kernel"],
    queryFn: () => api.kernel.getState(),
    refetchInterval: 8_000,
  });

  const { data: tags } = useQuery({
    queryKey: ["tags"],
    queryFn: () => api.models.tags(),
    refetchInterval: 15_000,
  });

  const refreshMutation = useMutation({
    mutationFn: () => api.models.refresh(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["kernel"] });
      void qc.invalidateQueries({ queryKey: ["tags"] });
      void qc.invalidateQueries({ queryKey: ["running"] });
    },
  });

  const killMutation = useMutation({
    mutationFn: () => api.system.killSwitch(),
  });

  const state = kernel?.state;
  const sovereign = state?.sovereign;
  const vramGuard = tags?.vramGuard;

  const categoryColor =
    sovereign?.taskCategory === "coding"   ? "var(--color-info)"    :
    sovereign?.taskCategory === "sysadmin" ? "var(--color-warn)"    :
    sovereign?.taskCategory === "hardware" ? "var(--color-success)"  :
                                             "var(--color-accent)";

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div>
          <h1 className="font-bold text-lg" style={{ color: "var(--color-foreground)" }}>
            Sovereign Dashboard
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            Local AI control center — {sovereign?.catalogModelCount ?? 0} models indexed
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-opacity disabled:opacity-50"
            style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
            <RefreshCw size={13} className={refreshMutation.isPending ? "animate-spin" : ""} />
            Sync Catalog
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* ── Row 1: System card + VRAM Budget + Health + Kill Switch stat ── */}
        <div className="grid gap-3" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
          <SystemCard />

          {/* VRAM Budget */}
          <div className="rounded-xl p-4"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center gap-2 mb-1">
              <MemoryStick size={14} style={{ color: "var(--color-accent)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>VRAM Budget</span>
              <span className="ml-auto text-xs px-1.5 py-0.5 rounded"
                style={{
                  background: vramGuard?.status === "healthy"
                    ? "color-mix(in srgb, var(--color-success) 15%, transparent)"
                    : "color-mix(in srgb, var(--color-warn) 15%, transparent)",
                  color: vramGuard?.status === "healthy" ? "var(--color-success)" : "var(--color-warn)",
                }}>
                {vramGuard?.mode ?? "safe-mode"}
              </span>
            </div>
            {vramGuard?.gpuName && (
              <div className="text-xs mb-2 truncate" style={{ color: "var(--color-muted)" }}>{vramGuard.gpuName}</div>
            )}
            {vramGuard && (
              <VramBar
                used={(vramGuard.totalBytes ?? 0) - (vramGuard.freeBytes ?? 0)}
                total={vramGuard.totalBytes ?? 0}
              />
            )}
            <div className="mt-3 pt-3 flex gap-4 text-xs" style={{ borderTop: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
              <div>
                <div>Budget</div>
                <div style={{ color: "var(--color-foreground)" }}>{fmt(vramGuard?.safeBudgetBytes ?? 0)}</div>
              </div>
              <div>
                <div>Reserve</div>
                <div style={{ color: "var(--color-foreground)" }}>{fmt(vramGuard?.reserveBytes ?? 0)}</div>
              </div>
            </div>
          </div>

          {/* Health quick summary */}
          <HealthCard onNavigate={navigate} />

          {/* Catalog + Kill Switch */}
          <div className="space-y-3">
            <StatCard
              label="Catalog"
              value={`${sovereign?.catalogModelCount ?? 0} models`}
              sub={sovereign?.lastCatalogSync ? `Synced ${new Date(sovereign.lastCatalogSync).toLocaleTimeString()}` : "Not synced"}
              icon={Cpu}
              onClick={() => navigate("/models")}
            />
            <button
              onClick={() => {
                if (window.confirm("Invoke kill-switch? This will terminate all AI processes.")) {
                  killMutation.mutate();
                }
              }}
              disabled={killMutation.isPending}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{ background: "color-mix(in srgb, var(--color-error) 12%, transparent)", color: "var(--color-error)", border: "1px solid color-mix(in srgb, var(--color-error) 25%, transparent)" }}>
              <Power size={13} />
              Kill Switch
            </button>
          </div>
        </div>

        {/* ── Row 2: Running Models + Agent Goal + Token Sparkline ── */}
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1.5fr 1fr" }}>

          {/* Running models */}
          <div className="rounded-xl p-4"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} style={{ color: "var(--color-success)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>Running Models</span>
            </div>
            <RunningModels />

            {/* Capabilities badges below */}
            {state?.capabilities && Object.keys(state.capabilities).length > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--color-border)" }}>
                <div className="text-xs mb-1.5" style={{ color: "var(--color-muted)" }}>Capabilities</div>
                <CapabilityBadges capabilities={state.capabilities} />
              </div>
            )}
          </div>

          {/* Agent Goal */}
          <div className="rounded-xl p-4"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center gap-2 mb-1">
              <Target size={14} style={{ color: categoryColor }} />
              <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>Agent Goal</span>
              {sovereign?.taskCategory && (
                <span className="ml-auto text-xs px-1.5 py-0.5 rounded capitalize"
                  style={{ background: `color-mix(in srgb, ${categoryColor} 15%, transparent)`, color: categoryColor }}>
                  {sovereign.taskCategory}
                </span>
              )}
            </div>
            {sovereign?.activeGoal ? (
              <>
                <p className="text-sm mt-2" style={{ color: "var(--color-foreground)" }}>{sovereign.activeGoal}</p>
                <ExecutionPlan steps={sovereign.executionPlan} activeStep={sovereign.activeStep} />
              </>
            ) : (
              <p className="text-sm mt-2" style={{ color: "var(--color-muted)" }}>
                No active goal. Send a message in Chat to activate the Supervisor Agent.
              </p>
            )}
          </div>

          {/* Token Usage sparkline */}
          <TokenSparkline />
        </div>

        {/* ── Row 3: Thought Log + Activity Feed ── */}
        <div className="grid gap-5" style={{ gridTemplateColumns: "1.2fr 1fr" }}>
          <div className="rounded-xl p-4"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <ThoughtLog />
          </div>
          <div className="space-y-4">
            <QuickActions onNavigate={navigate} />
            <ActivityFeed />
          </div>
        </div>

        {/* ── Row 4: Quick Launch — 10 workspace preset tiles ── */}
        <QuickLaunchPresets onNavigate={navigate} />

        {/* ── Row 5: Stack + Storage + Model Recommend ── */}
        <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <StackSummaryCard onNavigate={navigate} />
          <StorageCard />
          <ModelRecommendCard />
        </div>

      </div>
    </div>
  );
}
