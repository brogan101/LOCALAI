/**
 * SETUP WIZARD
 * ============
 * First-run guided setup: hardware scan → VRAM-filtered model picker → pull → go.
 * Shown automatically when no models are installed, or via /setup directly.
 *
 * Steps:
 *   1. Hardware scan — detect GPU, VRAM, Ollama status
 *   2. Pick a model  — cards filtered to what actually fits your GPU
 *   3. Pulling       — live SSE progress bar from task-queue
 *   4. Ready         — "open chat" CTA
 */

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Cpu, CheckCircle, XCircle, AlertTriangle, ChevronRight,
  Download, Loader2, Zap, MessageSquare, ArrowRight,
  HardDrive, MemoryStick, MonitorCheck,
} from "lucide-react";
import api, { apiErrorMessage, type HardwareSnapshot } from "../api.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DiscoveredCard {
  spec: string;
  modelName: string;
  tag: string;
  category: string;
  novelty: "recommended" | "fresh" | "trending" | "abliterated";
  whyRecommended: string;
  hardwareRequirement: string;
  vramEstimateGb?: number;
  verificationSource: string;
  sourceLabels: string[];
  discoveredAt: string;
}

interface PullProgressEvent {
  type: "snapshot" | "update";
  jobId?: string;
  jobs?: Array<{ jobId: string; modelName: string; status: string; progress: number; message: string }>;
  modelName?: string;
  status?: string;
  progress?: number;
  message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  const gb = b / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(b / 1024 ** 2).toFixed(0)} MB`;
}

function fmtVram(gb: number | undefined): string {
  if (!gb) return "~unknown";
  return `~${gb.toFixed(1)} GB VRAM`;
}

function noveltyLabel(n: DiscoveredCard["novelty"]): string {
  return { recommended: "Recommended", fresh: "New", trending: "Trending", abliterated: "Uncensored" }[n];
}

function noveltyColor(n: DiscoveredCard["novelty"]): string {
  return {
    recommended: "var(--color-success)",
    fresh: "var(--color-info)",
    trending: "var(--color-accent)",
    abliterated: "var(--color-warn)",
  }[n];
}

function fitLabel(vram: number | undefined, freeGb: number): { text: string; color: string } {
  if (!vram) return { text: "Unknown fit", color: "var(--color-muted)" };
  if (vram <= freeGb) return { text: "Fits your GPU", color: "var(--color-success)" };
  if (vram <= freeGb * 1.3) return { text: "Tight fit", color: "var(--color-warn)" };
  return { text: "Too large", color: "var(--color-error)" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300"
            style={{
              background: i < current
                ? "var(--color-success)"
                : i === current
                ? "var(--color-accent)"
                : "var(--color-elevated)",
              color: i <= current ? "#fff" : "var(--color-muted)",
              border: i === current ? "2px solid var(--color-accent)" : "2px solid transparent",
            }}
          >
            {i < current ? <CheckCircle size={13} /> : i + 1}
          </div>
          {i < total - 1 && (
            <div
              className="w-8 h-0.5 rounded transition-all duration-300"
              style={{ background: i < current ? "var(--color-success)" : "var(--color-border)" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function HardwareRow({ icon: Icon, label, value, sub, ok }: {
  icon: React.ElementType; label: string; value: string; sub?: string; ok?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--color-elevated)" }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: "color-mix(in srgb, var(--color-accent) 12%, transparent)" }}>
        <Icon size={16} style={{ color: "var(--color-accent)" }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs mb-0.5" style={{ color: "var(--color-muted)" }}>{label}</div>
        <div className="text-sm font-medium truncate" style={{ color: "var(--color-foreground)" }}>{value}</div>
        {sub && <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{sub}</div>}
      </div>
      {ok !== undefined && (
        ok
          ? <CheckCircle size={16} style={{ color: "var(--color-success)" }} />
          : <XCircle size={16} style={{ color: "var(--color-error)" }} />
      )}
    </div>
  );
}

function ModelCard({
  card, freeVramGb, selected, onSelect,
}: {
  card: DiscoveredCard; freeVramGb: number; selected: boolean; onSelect: () => void;
}) {
  const fit = fitLabel(card.vramEstimateGb, freeVramGb);
  const nc = noveltyColor(card.novelty);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left rounded-xl p-4 transition-all duration-200"
      style={{
        background: selected
          ? "color-mix(in srgb, var(--color-accent) 10%, var(--color-surface))"
          : "var(--color-surface)",
        border: selected
          ? "1.5px solid var(--color-accent)"
          : "1px solid var(--color-border)",
        outline: "none",
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>
            {card.modelName}
          </span>
          <span className="text-xs ml-1.5" style={{ color: "var(--color-muted)" }}>:{card.tag}</span>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: `color-mix(in srgb, ${nc} 12%, transparent)`, color: nc }}>
            {noveltyLabel(card.novelty)}
          </span>
        </div>
      </div>
      <p className="text-xs mb-2 leading-relaxed" style={{ color: "var(--color-muted)" }}>
        {card.whyRecommended}
      </p>
      <div className="flex items-center gap-3 text-xs">
        <span style={{ color: fit.color }}>● {fit.text}</span>
        <span style={{ color: "var(--color-muted)" }}>{fmtVram(card.vramEstimateGb)}</span>
        <span className="px-1.5 py-0.5 rounded" style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
          {card.category}
        </span>
      </div>
    </button>
  );
}

function PullProgressBar({ modelName, progress, message, status }: {
  modelName: string; progress: number; message: string; status: string;
}) {
  const done = status === "completed";
  const failed = status === "failed";
  const color = failed ? "var(--color-error)" : done ? "var(--color-success)" : "var(--color-accent)";
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>{modelName}</span>
        <span className="text-xs" style={{ color }}>{done ? "Complete" : failed ? "Failed" : `${progress}%`}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: "var(--color-elevated)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, background: color }}
        />
      </div>
      <p className="text-xs" style={{ color: "var(--color-muted)" }}>{message}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main wizard
// ─────────────────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [step, setStep] = useState(0); // 0=hardware 1=pick 2=pulling 3=done
  const [selectedCard, setSelectedCard] = useState<DiscoveredCard | null>(null);
  const [pullJob, setPullJob] = useState<{
    jobId: string; modelName: string; status: string; progress: number; message: string;
  } | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);

  // ── Hardware query
  const hwQ = useQuery<HardwareSnapshot>({
    queryKey: ["hardware"],
    queryFn: () => api.hardware.probe(),
    refetchInterval: 10_000,
  });

  const hw = hwQ.data;
  const freeVramGb = hw ? hw.gpu.freeVramBytes / 1024 ** 3 : 0;
  const totalVramGb = hw ? hw.gpu.totalVramBytes / 1024 ** 3 : 0;
  const ollamaOk = hw?.ollama.reachable ?? false;

  // ── Discovery query — auto-runs after hardware loads
  const discoverQ = useQuery<{ cards: DiscoveredCard[]; discoveredAt: string }>({
    queryKey: ["discover"],
    queryFn: () => api.modelsExtra.discover(),
    enabled: step >= 1,
    staleTime: 60_000,
  });

  // Filter cards to what fits the user's GPU (with 10% headroom)
  const fittingCards = (discoverQ.data?.cards ?? [])
    .filter((c) => !c.vramEstimateGb || c.vramEstimateGb <= freeVramGb * 1.1)
    .slice(0, 6);

  // Fall back to all cards if none fit (e.g. VRAM detection failed)
  const displayCards = fittingCards.length > 0 ? fittingCards : (discoverQ.data?.cards ?? []).slice(0, 6);

  // ── Pull mutation
  const pullMut = useMutation({
    mutationFn: (spec: string) => api.models.pull(spec),
    onSuccess: (data: any) => {
      const jobId = data?.jobId;
      if (jobId) startSseWatch(jobId);
      setStep(2);
    },
    onError: (err) => {
      setPullError(apiErrorMessage(err));
    },
  });

  // ── SSE pull-progress listener
  function startSseWatch(targetJobId: string) {
    if (esRef.current) esRef.current.close();
    const es = api.models.streamPullProgress();
    esRef.current = es;

    es.onmessage = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as PullProgressEvent;

        if (data.type === "snapshot" && data.jobs) {
          const job = data.jobs.find((j) => j.jobId === targetJobId);
          if (job) setPullJob(job);
        } else if (data.type === "update" && data.jobId === targetJobId) {
          const job = {
            jobId: data.jobId!,
            modelName: data.modelName ?? "",
            status: data.status ?? "running",
            progress: data.progress ?? 0,
            message: data.message ?? "",
          };
          setPullJob(job);
          if (job.status === "completed") {
            es.close();
            void qc.invalidateQueries({ queryKey: ["models"] });
            void qc.invalidateQueries({ queryKey: ["hardware"] });
            setTimeout(() => setStep(3), 800);
          }
          if (job.status === "failed") {
            es.close();
            setPullError(job.message || "Pull failed");
          }
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      // SSE disconnected — fall back to polling
      es.close();
    };
  }

  useEffect(() => {
    return () => { esRef.current?.close(); };
  }, []);

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "var(--color-background)" }}>
      <div className="w-full max-w-xl">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={20} style={{ color: "var(--color-accent)" }} />
            <span className="text-xs font-semibold tracking-widest uppercase"
              style={{ color: "var(--color-accent)" }}>LocalAI Setup</span>
          </div>
          <h1 className="text-2xl font-semibold mb-1" style={{ color: "var(--color-foreground)" }}>
            {step === 0 && "Let's check your hardware"}
            {step === 1 && "Pick a model for your GPU"}
            {step === 2 && "Downloading your model"}
            {step === 3 && "You're ready"}
          </h1>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            {step === 0 && "We'll scan your GPU and Ollama so we can recommend models that actually fit."}
            {step === 1 && `Your GPU has ${freeVramGb.toFixed(1)} GB free. These models will run well on it.`}
            {step === 2 && "This usually takes 3–10 minutes depending on your internet speed."}
            {step === 3 && "Your first model is installed. Time to start chatting."}
          </p>
        </div>

        <StepIndicator current={step} total={4} />

        {/* ── Step 0: Hardware scan ─────────────────────────── */}
        {step === 0 && (
          <div>
            {hwQ.isLoading && (
              <div className="flex items-center gap-2 text-sm mb-6" style={{ color: "var(--color-muted)" }}>
                <Loader2 size={15} className="animate-spin" />
                Scanning hardware...
              </div>
            )}

            {hw && (
              <div className="flex flex-col gap-3 mb-6">
                <HardwareRow
                  icon={MonitorCheck}
                  label="GPU"
                  value={hw.gpu.name}
                  sub={`${fmtBytes(hw.gpu.freeVramBytes)} free of ${fmtBytes(hw.gpu.totalVramBytes)}`}
                />
                <HardwareRow
                  icon={Cpu}
                  label="CPU"
                  value={hw.cpu.model}
                  sub={`${hw.cpu.physicalCores} physical cores`}
                />
                <HardwareRow
                  icon={MemoryStick}
                  label="RAM"
                  value={fmtBytes(hw.ram.totalBytes)}
                  sub={`${fmtBytes(hw.ram.freeBytes)} free`}
                />
                <HardwareRow
                  icon={HardDrive}
                  label="Disk"
                  value={fmtBytes(hw.disk.installDriveFreeBytes) + " free"}
                  sub={`of ${fmtBytes(hw.disk.installDriveTotalBytes)}`}
                />
                <HardwareRow
                  icon={Zap}
                  label="Ollama"
                  value={ollamaOk ? "Running" : "Not running"}
                  sub={ollamaOk ? hw.ollama.url : "Start Ollama before pulling models"}
                  ok={ollamaOk}
                />
              </div>
            )}

            {!ollamaOk && hw && (
              <div className="rounded-xl p-3 mb-4 flex gap-2 items-start text-sm"
                style={{ background: "color-mix(in srgb, var(--color-warn) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--color-warn) 25%, transparent)" }}>
                <AlertTriangle size={15} style={{ color: "var(--color-warn)", flexShrink: 0, marginTop: 1 }} />
                <span style={{ color: "var(--color-foreground)" }}>
                  Ollama isn't running. Download it from{" "}
                  <a href="https://ollama.com/download" target="_blank" rel="noreferrer"
                    style={{ color: "var(--color-accent)" }}>ollama.com/download</a>, install it,
                  then come back here.
                </span>
              </div>
            )}

            <button
              type="button"
              disabled={!hw || !ollamaOk}
              onClick={() => setStep(1)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
              style={{ background: "var(--color-accent)", color: "#fff" }}
            >
              {hwQ.isLoading ? <Loader2 size={15} className="animate-spin" /> : null}
              {hw ? (ollamaOk ? "Continue — Pick a model" : "Ollama required") : "Scanning..."}
              {hw && ollamaOk && <ChevronRight size={15} />}
            </button>
          </div>
        )}

        {/* ── Step 1: Pick a model ──────────────────────────── */}
        {step === 1 && (
          <div>
            {discoverQ.isLoading && (
              <div className="flex items-center gap-2 text-sm mb-4" style={{ color: "var(--color-muted)" }}>
                <Loader2 size={15} className="animate-spin" />
                Fetching model recommendations from Ollama library...
              </div>
            )}

            {discoverQ.isError && (
              <div className="rounded-xl p-3 mb-4 text-sm"
                style={{ background: "color-mix(in srgb, var(--color-warn) 10%, transparent)", color: "var(--color-warn)" }}>
                Couldn't reach Ollama library — check your internet connection. You can type a model name manually below.
              </div>
            )}

            {displayCards.length > 0 && (
              <div className="flex flex-col gap-3 mb-5">
                {displayCards.map((card) => (
                  <ModelCard
                    key={card.spec}
                    card={card}
                    freeVramGb={freeVramGb}
                    selected={selectedCard?.spec === card.spec}
                    onSelect={() => setSelectedCard(card)}
                  />
                ))}
              </div>
            )}

            {/* Manual entry */}
            <div className="mb-4">
              <p className="text-xs mb-2" style={{ color: "var(--color-muted)" }}>
                Or type any Ollama model name (e.g. <code className="text-xs">llama3.2:3b</code>)
              </p>
              <input
                type="text"
                placeholder="model:tag"
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "var(--color-elevated)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-foreground)",
                  outline: "none",
                }}
                onFocus={(e) => { setSelectedCard(null); (e.target as HTMLInputElement).select(); }}
                onChange={(e) => {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (v) setSelectedCard({ spec: v, modelName: v.split(":")[0] ?? v, tag: v.split(":")[1] ?? "latest", category: "general", novelty: "fresh", whyRecommended: "", hardwareRequirement: "", verificationSource: "", sourceLabels: [], discoveredAt: "" });
                }}
              />
            </div>

            {pullError && (
              <div className="rounded-xl p-3 mb-4 text-sm" style={{ color: "var(--color-error)" }}>
                {pullError}
              </div>
            )}

            <button
              type="button"
              disabled={!selectedCard || pullMut.isPending}
              onClick={() => {
                if (!selectedCard) return;
                setPullError(null);
                pullMut.mutate(selectedCard.spec);
              }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
              style={{ background: "var(--color-accent)", color: "#fff" }}
            >
              {pullMut.isPending
                ? <><Loader2 size={15} className="animate-spin" /> Starting download...</>
                : <><Download size={15} /> Download {selectedCard?.spec ?? "model"}</>}
            </button>

            <button type="button" onClick={() => setStep(0)} className="w-full mt-2 py-2 text-sm"
              style={{ color: "var(--color-muted)", background: "none", border: "none", cursor: "pointer" }}>
              ← Back
            </button>
          </div>
        )}

        {/* ── Step 2: Pulling ───────────────────────────────── */}
        {step === 2 && (
          <div>
            <div className="mb-6">
              {pullJob ? (
                <PullProgressBar
                  modelName={pullJob.modelName}
                  progress={pullJob.progress}
                  message={pullJob.message}
                  status={pullJob.status}
                />
              ) : (
                <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-muted)" }}>
                  <Loader2 size={15} className="animate-spin" />
                  Queuing download...
                </div>
              )}
            </div>

            <div className="rounded-xl p-3 text-sm" style={{ background: "var(--color-elevated)" }}>
              <p style={{ color: "var(--color-muted)" }}>
                You can close this and use the rest of the app while downloading. Check the{" "}
                <span style={{ color: "var(--color-accent)", cursor: "pointer" }} onClick={() => navigate("/models")}>
                  Models page
                </span>{" "}
                to track progress.
              </p>
            </div>

            {pullError && (
              <div className="mt-4 text-sm" style={{ color: "var(--color-error)" }}>
                {pullError}
                <button type="button" className="ml-3 underline" onClick={() => setStep(1)}
                  style={{ color: "var(--color-accent)", background: "none", border: "none", cursor: "pointer" }}>
                  Try again
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Done ─────────────────────────────────── */}
        {step === 3 && (
          <div>
            <div className="flex flex-col items-center py-6 mb-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{ background: "color-mix(in srgb, var(--color-success) 15%, transparent)" }}>
                <CheckCircle size={32} style={{ color: "var(--color-success)" }} />
              </div>
              <p className="text-sm text-center" style={{ color: "var(--color-muted)" }}>
                <strong style={{ color: "var(--color-foreground)" }}>{pullJob?.modelName ?? selectedCard?.modelName}</strong>{" "}
                is installed and ready to use.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate("/chat")}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold mb-3 transition-all"
              style={{ background: "var(--color-accent)", color: "#fff" }}
            >
              <MessageSquare size={15} />
              Open Chat
              <ArrowRight size={15} />
            </button>

            <button
              type="button"
              onClick={() => navigate("/models")}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm transition-all"
              style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}
            >
              Browse more models
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
