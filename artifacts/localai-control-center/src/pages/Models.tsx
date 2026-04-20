import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Play,
  Square,
  Trash2,
  RefreshCw,
  Search,
  Cpu,
  CheckCircle,
  AlertTriangle,
  Loader2,
  X,
  Globe,
  Sparkles,
  Zap,
  Filter,
  History,
  BarChart2,
  Award,
  Timer,
  Star,
} from "lucide-react";
import api, { type ModelListItem, type DiscoveredModelCard, type HardwareSnapshot, type ModelPullHistoryEntry, type BenchmarkRun } from "../api.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(m: ModelListItem): string {
  if (m.isRunning) return "var(--color-success)";
  if (m.vramWarning) return "var(--color-warn)";
  if (m.lastError) return "var(--color-error)";
  return "var(--color-muted)";
}

function lifecycleBadge(lifecycle: string) {
  const map: Record<string, { bg: string; color: string }> = {
    stable:      { bg: "color-mix(in srgb, var(--color-success) 12%, transparent)", color: "var(--color-success)" },
    running:     { bg: "color-mix(in srgb, var(--color-success) 20%, transparent)", color: "var(--color-success)" },
    downloading: { bg: "color-mix(in srgb, var(--color-info) 12%, transparent)", color: "var(--color-info)" },
    error:       { bg: "color-mix(in srgb, var(--color-error) 12%, transparent)", color: "var(--color-error)" },
    warning:     { bg: "color-mix(in srgb, var(--color-warn) 12%, transparent)", color: "var(--color-warn)" },
  };
  const style = map[lifecycle] ?? { bg: "var(--color-elevated)", color: "var(--color-muted)" };
  return (
    <span className="px-1.5 py-0.5 rounded text-xs font-medium capitalize"
      style={{ background: style.bg, color: style.color }}>
      {lifecycle}
    </span>
  );
}

// ── Pull progress overlay ─────────────────────────────────────────────────────

function PullProgress({ onClose }: { onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["pullStatus"],
    queryFn: () => api.models.pullStatus(),
    refetchInterval: 2_000,
  });

  const jobs = data?.jobs ?? [];
  const active = jobs.filter(j => j.status === "running" || j.status === "queued");

  if (!active.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 rounded-xl shadow-xl overflow-hidden"
      style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
      <div className="flex items-center justify-between px-3 py-2.5"
        style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
          <Download size={13} style={{ color: "var(--color-info)" }} />
          Pulling models
        </div>
        <button onClick={onClose} style={{ color: "var(--color-muted)" }}>
          <X size={13} />
        </button>
      </div>
      <div className="p-3 space-y-3">
        {active.map(job => (
          <div key={job.jobId}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="truncate font-medium" style={{ color: "var(--color-foreground)" }}>{job.modelName}</span>
              <span style={{ color: "var(--color-muted)" }}>{job.progress}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-border)" }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${job.progress}%`, background: "var(--color-info)" }} />
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{job.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Model row ─────────────────────────────────────────────────────────────────

function ModelRow({ model }: { model: ModelListItem }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["modelList"] });
    void qc.invalidateQueries({ queryKey: ["running"] });
    void qc.invalidateQueries({ queryKey: ["pullStatus"] });
  };

  const loadMut = useMutation({ mutationFn: () => api.models.load(model.name), onSuccess: refresh });
  const stopMut = useMutation({ mutationFn: () => api.models.stop(model.name), onSuccess: refresh });
  const delMut  = useMutation({
    mutationFn: () => api.models.delete(model.name),
    onSuccess: () => { refresh(); setConfirm(false); },
  });

  const busy = loadMut.isPending || stopMut.isPending || delMut.isPending;

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors"
      style={{
        background: model.isRunning
          ? "color-mix(in srgb, var(--color-success) 6%, var(--color-surface))"
          : "var(--color-surface)",
        border: `1px solid ${model.isRunning ? "color-mix(in srgb, var(--color-success) 20%, var(--color-border))" : "var(--color-border)"}`,
      }}>

      {/* Status dot */}
      <div className="w-2 h-2 rounded-full shrink-0"
        style={{
          background: statusColor(model),
          boxShadow: model.isRunning ? `0 0 6px ${statusColor(model)}` : "none",
        }} />

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate" style={{ color: "var(--color-foreground)" }}>
            {model.name}
          </span>
          {lifecycleBadge(model.isRunning ? "running" : model.lifecycle)}
          {model.vramWarning && (
            <span className="text-xs" style={{ color: "var(--color-warn)" }}>
              <AlertTriangle size={11} className="inline mr-0.5" />VRAM
            </span>
          )}
          {model.updateAvailable && (
            <span className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: "color-mix(in srgb, var(--color-info) 12%, transparent)", color: "var(--color-info)" }}>
              update
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: "var(--color-muted)" }}>
          <span>{model.sizeFormatted}</span>
          {model.parameterSize && <span>{model.parameterSize}</span>}
          {model.quantizationLevel && <span>{model.quantizationLevel}</span>}
          {model.routeAffinity && <span className="capitalize">{model.routeAffinity}</span>}
          {model.isRunning && (
            <span style={{ color: "var(--color-success)" }}>VRAM: {model.sizeVramFormatted}</span>
          )}
        </div>
        {model.lastError && (
          <div className="text-xs mt-0.5 truncate" style={{ color: "var(--color-error)" }}>{model.lastError}</div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {model.isRunning ? (
          <button
            onClick={() => stopMut.mutate()}
            disabled={busy}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-opacity disabled:opacity-40"
            style={{ background: "color-mix(in srgb, var(--color-warn) 12%, transparent)", color: "var(--color-warn)", border: "1px solid color-mix(in srgb, var(--color-warn) 25%, transparent)" }}>
            {stopMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Square size={11} />}
            Unload
          </button>
        ) : (
          <button
            onClick={() => loadMut.mutate()}
            disabled={busy}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-opacity disabled:opacity-40"
            style={{ background: "color-mix(in srgb, var(--color-success) 12%, transparent)", color: "var(--color-success)", border: "1px solid color-mix(in srgb, var(--color-success) 25%, transparent)" }}>
            {loadMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
            Load
          </button>
        )}

        {confirm ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => delMut.mutate()}
              disabled={busy}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs"
              style={{ background: "var(--color-error)", color: "#fff" }}>
              {delMut.isPending ? <Loader2 size={11} className="animate-spin" /> : "Confirm"}
            </button>
            <button onClick={() => setConfirm(false)} className="px-2 py-1 rounded text-xs"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirm(true)}
            disabled={busy}
            className="p-1.5 rounded transition-opacity disabled:opacity-40"
            style={{ color: "var(--color-muted)" }}
            title="Delete model">
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Pull modal ────────────────────────────────────────────────────────────────

function PullModal({ onClose, initialName = "" }: { onClose: () => void; initialName?: string }) {
  const [modelName, setModelName] = useState(initialName);
  const qc = useQueryClient();

  const pullMut = useMutation({
    mutationFn: () => api.models.pull(modelName.trim()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pullStatus"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-xl p-6"
        style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
        <h2 className="font-bold text-base mb-4" style={{ color: "var(--color-foreground)" }}>
          Pull a model from Ollama
        </h2>
        <p className="text-sm mb-4" style={{ color: "var(--color-muted)" }}>
          Enter an Ollama model name (e.g. <code className="px-1 rounded text-xs"
            style={{ background: "var(--color-border)" }}>llama3.2:3b</code>,
          <code className="px-1 rounded text-xs ml-1"
            style={{ background: "var(--color-border)" }}>deepseek-coder-v2:16b</code>)
        </p>
        <input
          value={modelName}
          onChange={e => setModelName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && modelName.trim()) pullMut.mutate(); }}
          placeholder="model:tag"
          className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-4"
          style={{
            background: "var(--color-surface)",
            color: "var(--color-foreground)",
            border: "1px solid var(--color-border)",
          }}
          autoFocus
        />

        {/* Popular suggestions */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {["llama3.2:3b", "deepseek-coder-v2:16b", "llava:13b", "mistral:7b", "gemma3:4b"].map(name => (
            <button key={name} onClick={() => setModelName(name)}
              className="text-xs px-2 py-1 rounded"
              style={{ background: "var(--color-border)", color: "var(--color-muted)" }}>
              {name}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm"
            style={{ background: "var(--color-border)", color: "var(--color-muted)" }}>
            Cancel
          </button>
          <button
            onClick={() => pullMut.mutate()}
            disabled={!modelName.trim() || pullMut.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
            style={{ background: "var(--color-accent)", color: "#fff" }}>
            {pullMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            Pull
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Catalog tab ───────────────────────────────────────────────────────────────

const NOVELTY_COLORS: Record<DiscoveredModelCard["novelty"], string> = {
  recommended: "var(--color-success)",
  fresh:       "var(--color-info)",
  trending:    "var(--color-accent)",
  abliterated: "var(--color-warn)",
};

const CATEGORY_COLORS: Record<string, string> = {
  coding:     "var(--color-info)",
  reasoning:  "var(--color-accent)",
  vision:     "#a855f7",
  embedding:  "var(--color-muted)",
  general:    "var(--color-foreground)",
  uncensored: "var(--color-warn)",
};

function vramColor(vramGb: number | undefined, freeGb: number, totalGb: number): string {
  if (!vramGb) return "var(--color-muted)";
  if (vramGb <= freeGb)  return "var(--color-success)";
  if (vramGb <= totalGb) return "var(--color-warn)";
  return "var(--color-error)";
}

function CatalogTab({ onPull }: { onPull: (name: string) => void }) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [noveltyFilter, setNoveltyFilter] = useState<string>("all");
  const [vramFilter, setVramFilter] = useState(false);
  const [search, setSearch] = useState("");
  const [pullingStack, setPullingStack] = useState(false);

  const rolesQ = useQuery({
    queryKey: ["model-roles"],
    queryFn: () => api.models.roles(),
    staleTime: 60_000,
  });

  const installedNames = new Set((rolesQ.data?.installedModels ?? []) as string[]);

  async function pullAllStack() {
    if (!rolesQ.data) return;
    const missing = rolesQ.data.roles
      .map(r => r.assignedModel)
      .filter(m => !installedNames.has(m) && m);
    if (missing.length === 0) return;
    setPullingStack(true);
    try {
      for (const model of missing) {
        await api.models.pull(model);
        await new Promise<void>(r => setTimeout(r, 500));
      }
    } finally {
      setPullingStack(false);
    }
  }

  const catalogQ = useQuery({
    queryKey: ["catalog"],
    queryFn: () => api.modelsExtra.discover(),
    staleTime: 120_000,
  });

  const hwQ = useQuery<HardwareSnapshot>({
    queryKey: ["hardware"],
    queryFn: () => api.hardware.probe(),
    staleTime: 60_000,
  });

  const freeVramGb  = hwQ.data ? hwQ.data.gpu.freeVramBytes  / 1024 ** 3 : 0;
  const totalVramGb = hwQ.data ? hwQ.data.gpu.totalVramBytes / 1024 ** 3 : 0;

  const cards: DiscoveredModelCard[] = catalogQ.data?.cards ?? [];

  const categories = Array.from(new Set(cards.map(c => c.category))).sort();
  const novelties  = ["recommended", "fresh", "trending", "abliterated"] as const;

  const filtered = cards.filter(c => {
    if (categoryFilter !== "all" && c.category !== categoryFilter) return false;
    if (noveltyFilter  !== "all" && c.novelty  !== noveltyFilter)  return false;
    if (vramFilter && c.vramEstimateGb && c.vramEstimateGb > freeVramGb) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.modelName.toLowerCase().includes(q) && !c.whyRecommended.toLowerCase().includes(q) && !c.category.includes(q)) return false;
    }
    return true;
  });

  if (catalogQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-16" style={{ color: "var(--color-muted)" }}>
        <Loader2 size={20} className="animate-spin mr-2" /> Fetching model catalog…
      </div>
    );
  }

  if (catalogQ.isError || cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <Globe size={24} style={{ color: "var(--color-muted)" }} />
        <span className="text-sm" style={{ color: "var(--color-muted)" }}>
          Catalog unavailable — Ollama must be reachable to discover models.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap px-6 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}>
        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--color-muted)" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search catalog…"
            className="pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", width: 160 }}
          />
        </div>
        {/* Category chips */}
        {["all", ...categories].map(cat => (
          <button key={cat}
            onClick={() => setCategoryFilter(cat)}
            className="px-2.5 py-1 rounded-lg text-xs capitalize"
            style={{
              background: categoryFilter === cat ? `color-mix(in srgb, ${CATEGORY_COLORS[cat] ?? "var(--color-accent)"} 15%, transparent)` : "var(--color-elevated)",
              color:      categoryFilter === cat ? (CATEGORY_COLORS[cat] ?? "var(--color-accent)") : "var(--color-muted)",
              border: `1px solid ${categoryFilter === cat ? `color-mix(in srgb, ${CATEGORY_COLORS[cat] ?? "var(--color-accent)"} 30%, transparent)` : "var(--color-border)"}`,
            }}>
            {cat}
          </button>
        ))}
        {/* Novelty chips */}
        {novelties.map(n => (
          <button key={n}
            onClick={() => setNoveltyFilter(noveltyFilter === n ? "all" : n)}
            className="px-2.5 py-1 rounded-lg text-xs capitalize"
            style={{
              background: noveltyFilter === n ? `color-mix(in srgb, ${NOVELTY_COLORS[n]} 15%, transparent)` : "var(--color-elevated)",
              color:      noveltyFilter === n ? NOVELTY_COLORS[n] : "var(--color-muted)",
              border: `1px solid ${noveltyFilter === n ? `color-mix(in srgb, ${NOVELTY_COLORS[n]} 25%, transparent)` : "var(--color-border)"}`,
            }}>
            {n}
          </button>
        ))}
        {/* Fits-in-VRAM filter */}
        <button
          onClick={() => setVramFilter(v => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
          style={{
            background: vramFilter ? "color-mix(in srgb, var(--color-success) 15%, transparent)" : "var(--color-elevated)",
            color:      vramFilter ? "var(--color-success)" : "var(--color-muted)",
            border:     `1px solid ${vramFilter ? "color-mix(in srgb, var(--color-success) 30%, transparent)" : "var(--color-border)"}`,
          }}>
          <Filter size={11} /> Fits in VRAM
        </button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            {filtered.length} / {cards.length} models
          </span>
          {rolesQ.data && (
            <button
              disabled={pullingStack}
              onClick={() => void pullAllStack()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--color-accent)", color: "#fff", opacity: pullingStack ? 0.6 : 1 }}>
              <Download size={11} /> {pullingStack ? "Pulling Stack…" : "Pull All My Stack"}
            </button>
          )}
        </div>
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {filtered.map(card => {
            const color   = CATEGORY_COLORS[card.category] ?? "var(--color-foreground)";
            const nvColor = NOVELTY_COLORS[card.novelty];
            const vc      = vramColor(card.vramEstimateGb, freeVramGb, totalVramGb);
            return (
              <div key={card.spec} className="rounded-xl p-4 flex flex-col gap-2"
                style={{
                  background: "var(--color-surface)",
                  border: `1px solid ${card.vramEstimateGb !== undefined ? `color-mix(in srgb, ${vc} 20%, var(--color-border))` : "var(--color-border)"}`,
                }}>
                {/* Name + badges */}
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="font-mono font-semibold text-sm" style={{ color: "var(--color-foreground)" }}>
                    {card.modelName}
                  </span>
                  {/* Size chip */}
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-mono font-bold"
                    style={{ background: `color-mix(in srgb, ${vc} 18%, transparent)`, color: vc }}>
                    {card.tag}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded capitalize"
                    style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
                    {card.category}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded capitalize"
                    style={{ background: `color-mix(in srgb, ${nvColor} 12%, transparent)`, color: nvColor }}>
                    {card.novelty}
                  </span>
                </div>
                {/* Why recommended */}
                {card.whyRecommended && (
                  <p className="text-xs leading-relaxed" style={{ color: "var(--color-muted)" }}>
                    {card.whyRecommended.slice(0, 120)}{card.whyRecommended.length > 120 ? "…" : ""}
                  </p>
                )}
                {/* VRAM + source */}
                <div className="flex items-center gap-3 text-xs">
                  {card.vramEstimateGb !== undefined && (
                    <span className="flex items-center gap-1" style={{ color: vc }}>
                      <Zap size={10} />
                      {card.vramEstimateGb.toFixed(1)} GB VRAM
                    </span>
                  )}
                  {card.sourceLabels.length > 0 && (
                    <span style={{ color: "var(--color-muted)" }}>{card.sourceLabels.join(", ")}</span>
                  )}
                </div>
                {/* Pull button */}
                <button
                  onClick={() => onPull(`${card.modelName}:${card.tag}`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium mt-auto"
                  style={{ background: "color-mix(in srgb, var(--color-accent) 15%, transparent)", color: "var(--color-accent)", border: "1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)" }}>
                  <Download size={11} /> Pull
                </button>
              </div>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="text-sm text-center py-8" style={{ color: "var(--color-muted)" }}>
            No models match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pull history tab ─────────────────────────────────────────────────────────

function PullHistoryTab({ onRePull }: { onRePull: (name: string) => void }) {
  const histQ = useQuery({
    queryKey: ["model-pull-history"],
    queryFn:  () => api.modelsExtra.pullHistory(undefined, 100),
    staleTime: 15_000,
  });

  const entries: ModelPullHistoryEntry[] = histQ.data?.history ?? [];

  function statusColor(status: string): string {
    if (status === "success") return "var(--color-success)";
    if (status === "failed")  return "var(--color-error)";
    return "var(--color-warn)";
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-6 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}>
        <History size={14} style={{ color: "var(--color-accent)" }} />
        <span className="text-xs font-semibold" style={{ color: "var(--color-foreground)" }}>
          Pull History
        </span>
        <button onClick={() => histQ.refetch()} className="ml-auto p-1 opacity-50 hover:opacity-100">
          <RefreshCw size={12} style={{ color: "var(--color-muted)" }} />
        </button>
      </div>

      {histQ.isLoading && (
        <div className="flex items-center justify-center py-16" style={{ color: "var(--color-muted)" }}>
          <Loader2 size={18} className="animate-spin mr-2" /> Loading history…
        </div>
      )}

      {!histQ.isLoading && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <History size={24} style={{ color: "var(--color-muted)" }} />
          <span className="text-sm" style={{ color: "var(--color-muted)" }}>
            No pull history yet — pull a model to get started.
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {entries.map((e) => (
          <div key={e.id}
            className="flex items-center gap-3 px-6 py-3"
            style={{ borderBottom: "1px solid var(--color-border)" }}>
            {/* Status dot */}
            <div className="w-2 h-2 rounded-full shrink-0"
              style={{ background: statusColor(e.status) }} />

            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: "var(--color-foreground)" }}>
                {e.modelName}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                {new Date(e.startedAt).toLocaleString()}
                {e.completedAt && ` · ${Math.round((new Date(e.completedAt).getTime() - new Date(e.startedAt).getTime()) / 1000)}s`}
                {e.bytes ? ` · ${(e.bytes / 1024 ** 3).toFixed(2)} GB` : ""}
              </div>
              {e.error && (
                <div className="text-xs mt-0.5 truncate" style={{ color: "var(--color-error)" }}>
                  {e.error}
                </div>
              )}
            </div>

            <span className="text-xs px-2 py-0.5 rounded shrink-0"
              style={{
                background: `color-mix(in srgb, ${statusColor(e.status)} 12%, transparent)`,
                color: statusColor(e.status),
              }}>
              {e.status}
            </span>

            <button
              onClick={() => onRePull(e.modelName)}
              className="shrink-0 p-1.5 rounded-lg"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
              title="Re-pull">
              <Download size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Benchmark tab (8.1) ───────────────────────────────────────────────────────

function BenchmarkTab() {
  const qc = useQueryClient();
  const [runId, setRunId] = useState<string | null>(null);

  const runsQ = useQuery({
    queryKey: ["benchmark-runs"],
    queryFn:  () => api.benchmarkApi.list(),
    staleTime: 10_000,
  });

  const runMut = useMutation({
    mutationFn: () => api.benchmarkApi.start([]),
    onSuccess:  (data) => {
      setRunId(data.run.id);
      void qc.invalidateQueries({ queryKey: ["benchmark-runs"] });
    },
  });

  const activeRunQ = useQuery({
    queryKey: ["benchmark-run", runId],
    queryFn:  () => api.benchmarkApi.get(runId!),
    enabled:  !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.run?.status;
      return status === "running" ? 2_000 : false;
    },
  });

  const runs: BenchmarkRun[] = runsQ.data?.runs ?? [];
  const activeRun = activeRunQ.data?.run ?? runs[0] ?? null;
  const results = activeRun?.results ?? [];
  const isRunning = activeRun?.status === "running" || runMut.isPending;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-sm" style={{ color: "var(--color-foreground)" }}>Model Benchmark</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            Runs a standard prompt across all installed models and ranks by quality + speed.
          </p>
        </div>
        <button
          onClick={() => runMut.mutate()}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--color-accent)", color: "#fff" }}>
          {isRunning
            ? <><Loader2 size={13} className="animate-spin" /> Running…</>
            : <><BarChart2 size={13} /> Run Benchmark</>}
        </button>
      </div>

      {/* Past runs selector */}
      {runs.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {runs.map(r => (
            <button
              key={r.id}
              onClick={() => setRunId(r.id)}
              className="text-xs px-2.5 py-1 rounded-lg"
              style={{
                background: (activeRun?.id === r.id) ? "color-mix(in srgb, var(--color-accent) 15%, transparent)" : "var(--color-elevated)",
                color: (activeRun?.id === r.id) ? "var(--color-foreground)" : "var(--color-muted)",
                border: "1px solid var(--color-border)",
              }}>
              {new Date(r.createdAt).toLocaleString()}
            </button>
          ))}
        </div>
      )}

      {/* Results table */}
      {isRunning && results.length === 0 && (
        <div className="flex items-center gap-2 py-8 justify-center text-sm" style={{ color: "var(--color-muted)" }}>
          <Loader2 size={16} className="animate-spin" /> Benchmarking models… this may take a few minutes.
        </div>
      )}
      {!isRunning && runs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <BarChart2 size={28} style={{ color: "var(--color-muted)" }} />
          <span className="text-sm" style={{ color: "var(--color-muted)" }}>No benchmarks run yet. Click "Run Benchmark" to start.</span>
        </div>
      )}
      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={r.model} className="flex items-start gap-3 p-3 rounded-xl"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
              {/* Rank badge */}
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                style={{
                  background: i === 0
                    ? "color-mix(in srgb, var(--color-success) 20%, transparent)"
                    : i === 1
                      ? "color-mix(in srgb, var(--color-info) 15%, transparent)"
                      : "var(--color-elevated)",
                  color: i === 0
                    ? "var(--color-success)"
                    : i === 1
                      ? "var(--color-info)"
                      : "var(--color-muted)",
                }}>
                {i === 0 ? <Award size={14} /> : i + 1}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm truncate" style={{ color: "var(--color-foreground)" }}>{r.model}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {Array.from({ length: 10 }, (_, j) => (
                      <div key={j} className="w-1.5 h-3 rounded-sm"
                        style={{ background: j < r.score ? "var(--color-accent)" : "var(--color-elevated)" }} />
                    ))}
                    <span className="text-xs ml-1 font-semibold" style={{ color: "var(--color-accent)" }}>{r.score}/10</span>
                  </div>
                </div>
                <p className="text-xs mb-2" style={{ color: "var(--color-muted)" }}>{r.scoreReason}</p>
                <div className="flex items-center gap-3 text-xs" style={{ color: "var(--color-muted)" }}>
                  <span className="flex items-center gap-1"><Timer size={10} /> {(r.durationMs / 1000).toFixed(1)}s</span>
                  <span className="flex items-center gap-1"><Star size={10} /> {r.tokensOut} tokens</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Models page ───────────────────────────────────────────────────────────────

export default function ModelsPage() {
  const [search, setSearch] = useState("");
  const [showPull, setShowPull] = useState(false);
  const [pullInitialName, setPullInitialName] = useState("");
  const [showProgress, setShowProgress] = useState(true);
  const [tab, setTab] = useState<"installed" | "catalog" | "history" | "benchmark">("installed");
  const qc = useQueryClient();

  function openPull(name = "") {
    setPullInitialName(name);
    setShowPull(true);
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["modelList"],
    queryFn: () => api.models.list(),
    refetchInterval: 20_000,
  });

  const refreshMut = useMutation({
    mutationFn: () => api.models.refresh(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["modelList"] }),
  });

  const models = (data?.models ?? []).filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase())
  );

  const running = models.filter(m => m.isRunning);
  const idle    = models.filter(m => !m.isRunning);

  return (
    <div className="flex flex-col h-screen">
      {/* Ollama offline banner */}
      {data && !data.ollamaReachable && (
        <div className="flex items-center justify-between px-4 py-2 text-sm font-medium shrink-0"
          style={{
            background: "color-mix(in srgb, #f59e0b 12%, transparent)",
            borderBottom: "1px solid color-mix(in srgb, #f59e0b 30%, transparent)",
            color: "#f59e0b",
          }}>
          <span>Ollama is not running — start it with: <code className="font-mono">ollama serve</code></span>
          <button
            onClick={() => navigator.clipboard.writeText("ollama serve")}
            className="ml-4 px-2 py-0.5 rounded text-xs font-mono"
            style={{ background: "color-mix(in srgb, #f59e0b 20%, transparent)", border: "1px solid color-mix(in srgb, #f59e0b 40%, transparent)" }}>
            Copy
          </button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div>
          <h1 className="font-bold text-lg" style={{ color: "var(--color-foreground)" }}>Models</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            {data ? `${data.models.length} models · ${data.totalSizeFormatted} on disk` : "Loading…"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refreshMut.mutate()}
            disabled={refreshMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm disabled:opacity-50"
            style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
            <RefreshCw size={13} className={refreshMut.isPending ? "animate-spin" : ""} />
            Sync
          </button>
          <button
            onClick={() => openPull()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: "var(--color-accent)", color: "#fff" }}>
            <Download size={13} />
            Pull Model
          </button>
        </div>
      </div>

      {/* VRAM guard status */}
      {data?.vramGuard && (
        <div className="px-6 py-2.5 flex items-center gap-2 text-xs shrink-0"
          style={{
            background: data.vramGuard.status === "healthy"
              ? "color-mix(in srgb, var(--color-success) 8%, var(--color-surface))"
              : "color-mix(in srgb, var(--color-warn) 8%, var(--color-surface))",
            borderBottom: "1px solid var(--color-border)",
          }}>
          {data.vramGuard.status === "healthy"
            ? <CheckCircle size={13} style={{ color: "var(--color-success)" }} />
            : <AlertTriangle size={13} style={{ color: "var(--color-warn)" }} />
          }
          <span style={{ color: "var(--color-muted)" }}>
            VRAM Guard: <strong style={{ color: "var(--color-foreground)" }}>{data.vramGuard.mode}</strong>
            {data.vramGuard.gpuName && <> · {data.vramGuard.gpuName}</>}
            {data.vramGuard.totalBytes && (
              <> · {(data.vramGuard.totalBytes / 1024 ** 3).toFixed(1)} GB total</>
            )}
          </span>
          <span className="ml-auto" style={{ color: "var(--color-muted)" }}>{data.vramGuard.reason}</span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 pt-3 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}>
        {(["installed", "catalog", "history", "benchmark"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 text-sm capitalize transition-colors"
            style={{
              color:        tab === t ? "var(--color-foreground)" : "var(--color-muted)",
              borderBottom: tab === t ? "2px solid var(--color-accent)" : "2px solid transparent",
              marginBottom: -1,
              fontWeight:   tab === t ? 600 : 400,
            }}>
            {t}
          </button>
        ))}
      </div>

      {tab === "installed" && (
        <>
          {/* Search */}
          <div className="px-6 py-3 shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--color-muted)" }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search models…"
                className="w-full pl-9 pr-4 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: "var(--color-elevated)",
                  color: "var(--color-foreground)",
                  border: "1px solid var(--color-border)",
                }}
              />
            </div>
          </div>

          {/* Model list */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {isLoading && (
              <div className="flex items-center justify-center py-16" style={{ color: "var(--color-muted)" }}>
                <Loader2 size={20} className="animate-spin mr-2" />
                Loading models…
              </div>
            )}
            {isError && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <AlertTriangle size={24} style={{ color: "var(--color-error)" }} />
                <span className="text-sm" style={{ color: "var(--color-muted)" }}>
                  Failed to load models
                </span>
                <button onClick={() => void refetch()}
                  className="text-sm px-4 py-2 rounded-lg"
                  style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
                  Retry
                </button>
              </div>
            )}

            {!isLoading && !isError && models.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Cpu size={24} style={{ color: "var(--color-muted)" }} />
                <span className="text-sm" style={{ color: "var(--color-muted)" }}>
                  {search ? "No models match your search" : "No models installed. Pull one to get started."}
                </span>
              </div>
            )}

            {running.length > 0 && (
              <section className="mb-5">
                <div className="flex items-center gap-2 mb-2.5 text-xs font-medium"
                  style={{ color: "var(--color-success)" }}>
                  <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "var(--color-success)" }} />
                  RUNNING ({running.length})
                </div>
                <div className="space-y-2">
                  {running.map(m => <ModelRow key={m.digest ?? m.name} model={m} />)}
                </div>
              </section>
            )}

            {idle.length > 0 && (
              <section>
                {running.length > 0 && (
                  <div className="text-xs font-medium mb-2.5" style={{ color: "var(--color-muted)" }}>
                    INSTALLED ({idle.length})
                  </div>
                )}
                <div className="space-y-2">
                  {idle.map(m => <ModelRow key={m.digest ?? m.name} model={m} />)}
                </div>
              </section>
            )}
          </div>
        </>
      )}

      {tab === "catalog" && <CatalogTab onPull={openPull} />}

      {tab === "history" && <PullHistoryTab onRePull={openPull} />}

      {tab === "benchmark" && <BenchmarkTab />}

      {/* Pull modal */}
      {showPull && <PullModal initialName={pullInitialName} onClose={() => { setShowPull(false); setPullInitialName(""); }} />}

      {/* Pull progress */}
      {showProgress && <PullProgress onClose={() => setShowProgress(false)} />}
    </div>
  );
}
