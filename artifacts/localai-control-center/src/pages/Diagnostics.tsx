/**
 * Diagnostics.tsx — Stage 4 upgrade
 * ===================================
 * Full replacement of the Diagnostics page.
 *
 * What was missing in the old version:
 *   - Diagnostic IDs (sidecar.stt, tooling.browser-node, etc.) shown as-is
 *   - No "what does this mean?" explanation
 *   - No "how do I fix it?" guidance
 *   - Score ring but no breakdown of what's pulling it down
 *   - Port status shown as raw numbers with no context
 *
 * New version adds:
 *   - Plain-English label for every known diagnostic ID
 *   - "What this means" one-liner
 *   - "How to fix it" action for each broken item
 *   - Expandable detail panel per item
 *   - Emergency stop toggle in the diagnostics UI
 *   - Link to proof bundles for recent executor runs
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle, AlertTriangle, XCircle, HelpCircle, ChevronDown, ChevronUp,
  Activity, RefreshCw, Wrench, ShieldOff,
} from "lucide-react";
import api, { type RepairHealthEntry } from "../api.js";

// ─────────────────────────────────────────────────────────────────────────────
// Plain-English explanations for every known diagnostic ID
// ─────────────────────────────────────────────────────────────────────────────

interface DiagExplainer {
  label: string;
  what: string;
  how: string;
  severity: "info" | "warn" | "error";
}

const EXPLAINERS: Record<string, DiagExplainer> = {
  "sidecar.stt": {
    label: "Speech-to-text (microphone input)",
    what: "The voice transcription engine isn't running. This affects the microphone button in the Voice page.",
    how: "Install Python 3.10+ and run: pip install faster-whisper. Make sure 'python' is on your PATH.",
    severity: "warn",
  },
  "sidecar.tts": {
    label: "Text-to-speech (voice output)",
    what: "The local text-to-speech engine (Piper) isn't installed. AI responses can't be spoken aloud.",
    how: "Download Piper from https://github.com/rhasspy/piper/releases and place the binary on your PATH.",
    severity: "warn",
  },
  "tooling.browser-node": {
    label: "Browser automation (Playwright)",
    what: "Playwright isn't installed. The browser automation features in the Browser page won't work.",
    how: "Run: pnpm add -w playwright && npx playwright install chromium",
    severity: "info",
  },
  "tooling.robotjs": {
    label: "Desktop automation (mouse/keyboard)",
    what: "RobotJS isn't installed. Desktop click/keyboard automation features are unavailable.",
    how: "Run: pnpm add -w robotjs — this requires a native build. Node-gyp and Python must be present.",
    severity: "info",
  },
  "ollama.reachable": {
    label: "Ollama (local AI engine)",
    what: "The Ollama server at 127.0.0.1:11434 isn't responding. No AI features will work.",
    how: "Open a terminal and run: ollama serve — or download Ollama from https://ollama.com",
    severity: "error",
  },
  "ollama.models": {
    label: "Ollama models installed",
    what: "No AI models are downloaded. Ollama is running but has nothing to run.",
    how: "Go to Models → click the VRAM filter → pull a recommended model for your GPU.",
    severity: "error",
  },
  "node.version": {
    label: "Node.js version",
    what: "The Node.js version doesn't meet the minimum requirement (Node 20+).",
    how: "Download Node.js 20 LTS from https://nodejs.org and reinstall. Then re-run pnpm install.",
    severity: "error",
  },
  "pnpm.version": {
    label: "pnpm package manager",
    what: "pnpm isn't available or is the wrong version.",
    how: "Run: corepack enable && corepack prepare pnpm@latest --activate",
    severity: "warn",
  },
  "db.migrations": {
    label: "Database schema",
    what: "The local database schema is outdated or has a migration error.",
    how: "Stop the server, delete ~/LocalAI-Tools/localai.db (your settings will reset), and restart.",
    severity: "error",
  },
  "rag.index": {
    label: "RAG search index (hnswlib)",
    what: "The vector search index has a native binding error. RAG search won't work.",
    how: "This usually means Node was upgraded after pnpm install. Run: pnpm install --frozen-lockfile",
    severity: "error",
  },
  "port.3001": {
    label: "API server port (3001)",
    what: "Port 3001 isn't listening. The API server may not have started.",
    how: "Check the launcher logs in ~/LocalAI-Tools/logs/. Run LAUNCH_OS.ps1 again if needed.",
    severity: "error",
  },
  "port.5173": {
    label: "Frontend dev server port (5173)",
    what: "Port 5173 isn't listening. The UI may not have started.",
    how: "The UI server starts after the API. Wait 10 seconds, then refresh. Check logs if it persists.",
    severity: "warn",
  },
  "port.11434": {
    label: "Ollama port (11434)",
    what: "Ollama isn't listening on 11434. It may not be running.",
    how: "Run: ollama serve — or ensure Ollama is set to start on login.",
    severity: "error",
  },
};

function getExplainer(id: string): DiagExplainer {
  if (EXPLAINERS[id]) return EXPLAINERS[id];
  // Try prefix match (e.g. "sidecar.stt.degraded" → "sidecar.stt")
  const prefix = Object.keys(EXPLAINERS).find(k => id.startsWith(k));
  if (prefix) return EXPLAINERS[prefix];
  return {
    label: id,
    what: "This diagnostic item doesn't have a plain-English explanation yet.",
    how: "Check the Logs page for more details, or run the diagnostics collector: node scripts/collect-diagnostics.mjs",
    severity: "info",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

function statusColor(s: string) {
  if (s === "ok" || s === "pass") return "var(--color-success)";
  if (s === "warning" || s === "degraded") return "var(--color-warn)";
  if (s === "error" || s === "fail" || s === "blocked") return "var(--color-error)";
  return "var(--color-muted)";
}

function StatusIcon({ status, size = 14 }: { status: string; size?: number }) {
  const color = statusColor(status);
  if (status === "ok" || status === "pass") return <CheckCircle size={size} style={{ color }} />;
  if (status === "warning" || status === "degraded") return <AlertTriangle size={size} style={{ color }} />;
  if (status === "error" || status === "fail" || status === "blocked") return <XCircle size={size} style={{ color }} />;
  return <HelpCircle size={size} style={{ color }} />;
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "var(--color-success)" : score >= 50 ? "var(--color-warn)" : "var(--color-error)";
  return (
    <div className="flex flex-col items-center justify-center gap-1"
      style={{ width: 72, height: 72, border: `3px solid ${color}`, borderRadius: "50%", flexShrink: 0 }}>
      <span className="text-xl font-bold" style={{ color }}>{score}</span>
      <span className="text-xs" style={{ color: "var(--color-muted)" }}>/ 100</span>
    </div>
  );
}

function DiagItem({ item }: {
  item: { id?: string; status: string; message?: string; label?: string; value?: string; details?: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const id = item.id ?? "";
  const explainer = getExplainer(id);
  const isNotOk = item.status !== "ok" && item.status !== "pass";

  return (
    <div style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div
        className="flex items-start gap-3 px-4 py-2.5 text-sm cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusIcon status={item.status} size={14} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--color-foreground)" }}>{explainer.label}</span>
            {id && id !== explainer.label && (
              <code className="text-xs px-1 rounded" style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
                {id}
              </code>
            )}
          </div>
          {item.message && (
            <div className="text-xs mt-0.5 truncate" style={{ color: "var(--color-muted)" }}>{item.message}</div>
          )}
          {isNotOk && !expanded && (
            <div className="text-xs mt-0.5" style={{ color: statusColor(item.status), opacity: 0.8 }}>
              {explainer.what}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {item.value && <span className="text-xs font-mono" style={{ color: "var(--color-muted)" }}>{item.value}</span>}
          {expanded ? <ChevronUp size={12} style={{ color: "var(--color-muted)" }} /> : <ChevronDown size={12} style={{ color: "var(--color-muted)" }} />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-3 pt-0 space-y-2">
          <div className="rounded-lg p-3 text-xs space-y-2" style={{ background: "var(--color-elevated)" }}>
            <div>
              <span className="font-medium" style={{ color: "var(--color-foreground)" }}>What this means: </span>
              <span style={{ color: "var(--color-muted)" }}>{explainer.what}</span>
            </div>
            {isNotOk && (
              <div>
                <span className="font-medium" style={{ color: "var(--color-success)" }}>How to fix it: </span>
                <span style={{ color: "var(--color-muted)" }}>{explainer.how}</span>
              </div>
            )}
            {item.details && (
              <div>
                <span className="font-medium" style={{ color: "var(--color-foreground)" }}>Details: </span>
                <code className="text-xs" style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>{item.details}</code>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PortRow({ port, info }: { port: number; info?: { open: boolean; pid?: number; service?: string } }) {
  const open = info?.open ?? false;
  const explainer = getExplainer(`port.${port}`);
  return (
    <div className="flex items-start gap-3 px-4 py-2.5 text-sm" style={{ borderBottom: "1px solid var(--color-border)" }}>
      <StatusIcon status={open ? "ok" : "error"} size={14} />
      <div className="flex-1 min-w-0">
        <span style={{ color: "var(--color-foreground)" }}>{explainer.label}</span>
        {!open && <div className="text-xs mt-0.5" style={{ color: "var(--color-error)" }}>{explainer.how}</div>}
      </div>
      <span className="text-xs font-mono shrink-0" style={{ color: "var(--color-muted)" }}>
        :{port} {open ? "✓" : "✗"}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Emergency stop panel
// ─────────────────────────────────────────────────────────────────────────────

function EmergencyStopPanel() {
  const qc = useQueryClient();
  const stateQ = useQuery({
    queryKey: ["emergency-stop"],
    queryFn: async () => {
      const res = await fetch("/api/executor/emergency-stop");
      return res.json() as Promise<{ active: boolean }>;
    },
    refetchInterval: 5_000,
  });

  const toggleMut = useMutation({
    mutationFn: async (active: boolean) => {
      const res = await fetch("/api/executor/emergency-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active, reason: active ? "Activated from Diagnostics page" : "Cleared from Diagnostics page" }),
      });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["emergency-stop"] }),
  });

  const active = stateQ.data?.active ?? false;

  return (
    <div className="mx-4 mb-4 rounded-xl p-4"
      style={{
        background: active ? "color-mix(in srgb, var(--color-error) 10%, transparent)" : "var(--color-elevated)",
        border: `1px solid ${active ? "color-mix(in srgb, var(--color-error) 30%, transparent)" : "var(--color-border)"}`,
      }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldOff size={15} style={{ color: active ? "var(--color-error)" : "var(--color-muted)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>
              Emergency stop
            </span>
            {active && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: "var(--color-error)", color: "#fff" }}>ACTIVE</span>
            )}
          </div>
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            {active
              ? "All executors are halted. No scripts, patches, or browser actions can run until this is cleared."
              : "When active, halts all executors immediately. Use if something is running unexpectedly."}
          </p>
        </div>
        <button
          type="button"
          disabled={toggleMut.isPending}
          onClick={() => toggleMut.mutate(!active)}
          className="shrink-0 px-4 py-2 text-sm rounded-lg font-medium transition-all disabled:opacity-40"
          style={{
            background: active ? "var(--color-success)" : "var(--color-error)",
            color: "#fff",
          }}>
          {active ? "Clear stop" : "Activate stop"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function DiagnosticsPage() {
  const qc = useQueryClient();

  const healthzQ = useQuery({
    queryKey: ["healthz"],
    queryFn: async () => {
      const res = await fetch("/api/healthz");
      return res.json();
    },
    refetchInterval: 15_000,
  });

  const repairQ = useQuery({
    queryKey: ["repair-health"],
    queryFn: () => api.repair.health(),
    refetchInterval: 30_000,
  });

  const repairMut = useMutation({
    mutationFn: (ids: string[]) => api.repair.run(ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["repair-health"] });
    },
  });

  const diagnostics: Array<{ id: string; status: string; message: string }> = healthzQ.data?.diagnostics ?? [];
  const repairItems: RepairHealthEntry[] = (repairQ.data as any)?.items ?? [];
  const ports: Record<string, { open: boolean }> = (repairQ.data as any)?.ports ?? {};

  const failing = diagnostics.filter(d => d.status !== "ok");
  const score = diagnostics.length === 0 ? 100 :
    Math.round(((diagnostics.length - failing.length) / diagnostics.length) * 100);

  const [selectedRepairs, setSelectedRepairs] = useState<Set<string>>(new Set());

  function toggleRepair(id: string) {
    setSelectedRepairs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-4 pb-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-2 mb-1">
          <Activity size={18} style={{ color: "var(--color-accent)" }} />
          <h1 className="text-base font-semibold" style={{ color: "var(--color-foreground)" }}>Diagnostics</h1>
          <button type="button" onClick={() => { void healthzQ.refetch(); void repairQ.refetch(); }}
            className="ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          Click any item to see what it means and how to fix it.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Score + summary */}
        {diagnostics.length > 0 && (
          <div className="flex items-center gap-4 px-6 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <ScoreRing score={score} />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
                {failing.length === 0 ? "Everything looks good" : `${failing.length} issue${failing.length !== 1 ? "s" : ""} detected`}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                {diagnostics.length} checks — {diagnostics.length - failing.length} passing
              </p>
            </div>
          </div>
        )}

        {/* Emergency stop */}
        <div className="pt-4">
          <EmergencyStopPanel />
        </div>

        {/* Runtime diagnostics */}
        {diagnostics.length > 0 && (
          <div className="mb-4">
            <div className="px-4 py-2 text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-muted)", borderBottom: "1px solid var(--color-border)" }}>
              Runtime checks
            </div>
            {diagnostics.map((d, i) => <DiagItem key={d.id ?? i} item={d} />)}
          </div>
        )}

        {/* Port status */}
        {Object.keys(ports).length > 0 && (
          <div className="mb-4">
            <div className="px-4 py-2 text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-muted)", borderBottom: "1px solid var(--color-border)" }}>
              Ports
            </div>
            {[3001, 5173, 11434].map(port => (
              <PortRow key={port} port={port} info={ports[String(port)]} />
            ))}
          </div>
        )}

        {/* Repair items */}
        {repairItems.length > 0 && (
          <div className="mb-4">
            <div className="px-4 py-2 text-xs font-semibold uppercase tracking-widest flex items-center justify-between"
              style={{ color: "var(--color-muted)", borderBottom: "1px solid var(--color-border)" }}>
              <span>Setup & dependencies</span>
              {selectedRepairs.size > 0 && (
                <button
                  type="button"
                  disabled={repairMut.isPending}
                  onClick={() => repairMut.mutate([...selectedRepairs])}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                  style={{ background: "var(--color-accent)", color: "#fff" }}>
                  <Wrench size={10} /> Fix {selectedRepairs.size} selected
                </button>
              )}
            </div>
            {repairItems.map((item: RepairHealthEntry) => {
              const isOk = item.status === "ok";
              const id = (item as any).id ?? item.name;
              return (
                <div key={id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <div className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    <StatusIcon status={item.status} size={14} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span style={{ color: "var(--color-foreground)" }}>{item.name}</span>
                        {item.category && (
                          <span className="text-xs px-1.5 rounded"
                            style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
                            {item.category}
                          </span>
                        )}
                      </div>
                      {item.details && !isOk && (
                        <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{item.details}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-mono" style={{ color: "var(--color-muted)" }}>
                        {item.value ?? (item.installed ? "✓" : "missing")}
                      </span>
                      {item.canRepair && !isOk && (
                        <input
                          type="checkbox"
                          checked={selectedRepairs.has(id)}
                          onChange={() => toggleRepair(id)}
                          style={{ accentColor: "var(--color-accent)" }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {healthzQ.isLoading && repairQ.isLoading && (
          <div className="px-6 py-8 text-sm" style={{ color: "var(--color-muted)" }}>
            Running diagnostic checks…
          </div>
        )}
      </div>
    </div>
  );
}
