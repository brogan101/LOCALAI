/**
 * MissionReplay.tsx — Mission replay UI surface (Stage 5)
 * =========================================================
 * The mission-replay.ts lib is complete — it reads audit events, approval
 * requests, durable jobs, thought log, and job events into a unified trace.
 * There was no dedicated UI surface for it.
 *
 * This page adds a standalone /mission-replay route that shows:
 *   - Live replay of recent events (no trace filter)
 *   - Trace-specific replay by traceId
 *   - Summary stats (recorded/missing/blocked/redacted)
 *   - Local Jarvis evals panel (repo_summary, safe_patch_plan, etc.)
 *   - Source-of-truth text for the system
 *
 * Add to App.tsx:
 *   const MissionReplayPage = lazy(() => import("./pages/MissionReplay.js"));
 *   <Route path="/mission-replay" component={MissionReplayPage} />
 *
 * Add to CORE_GROUPS nav (in Operations items):
 *   { path: "/mission-replay", label: "Mission Replay", icon: History }
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  History, CheckCircle, XCircle, ShieldOff, Eye, EyeOff,
  RefreshCw, Play, ChevronDown, ChevronUp, Info,
} from "lucide-react";
import api from "../api.js";

// ─── Types (from mission-replay.ts) ─────────────────────────────────────────

interface MissionReplayEvent {
  id: string;
  traceId: string;
  timestamp: string;
  source: string;
  kind: string;
  actor?: string;
  target?: string;
  result?: string;
  dataStatus: "recorded" | "missing" | "blocked" | "redacted";
  message: string;
  metadata: Record<string, unknown>;
}

interface MissionReplay {
  traceId?: string;
  generatedAt: string;
  sourceOfTruth: string;
  events: MissionReplayEvent[];
  summary: { totalEvents: number; recorded: number; missing: number; blocked: number; redacted: number };
}

interface EvalResult {
  id: string;
  name: string;
  status: "pass" | "fail";
  message: string;
}

interface EvalReport {
  success: boolean;
  results: EvalResult[];
  passCount: number;
  failCount: number;
  ranAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DATA_STATUS_COLOR: Record<string, string> = {
  recorded: "var(--color-success)",
  missing: "var(--color-error)",
  blocked: "var(--color-warn)",
  redacted: "var(--color-muted)",
};

const SOURCE_COLOR: Record<string, string> = {
  audit_events: "var(--color-info)",
  approval_requests: "var(--color-warn)",
  durable_jobs: "var(--color-accent)",
  thought_log: "var(--color-success)",
  job_events: "var(--color-muted)",
};

function timestamp(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

// ─── Event row ───────────────────────────────────────────────────────────────

function EventRow({ event }: { event: MissionReplayEvent }) {
  const [open, setOpen] = useState(false);
  const statusColor = DATA_STATUS_COLOR[event.dataStatus] ?? "var(--color-muted)";
  const sourceColor = SOURCE_COLOR[event.source] ?? "var(--color-muted)";

  return (
    <div style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div
        className="flex items-start gap-3 px-4 py-2 text-xs cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => setOpen(!open)}
      >
        <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ background: statusColor }} />
        <span className="w-24 shrink-0 font-mono" style={{ color: "var(--color-muted)" }}>
          {timestamp(event.timestamp)}
        </span>
        <span className="w-20 shrink-0 truncate" style={{ color: sourceColor }}>
          {event.source.replace(/_/g, "·")}
        </span>
        <span className="w-24 shrink-0 font-mono truncate" style={{ color: "var(--color-muted)" }}>
          {event.kind}
        </span>
        <span className="flex-1 truncate" style={{ color: "var(--color-foreground)" }}>
          {event.message}
        </span>
        <span style={{ color: statusColor, flexShrink: 0 }}>{event.dataStatus}</span>
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </div>
      {open && (
        <div className="px-10 pb-3 text-xs space-y-1">
          {event.actor && <div><span style={{ color: "var(--color-muted)" }}>actor: </span><span style={{ color: "var(--color-foreground)" }}>{event.actor}</span></div>}
          {event.target && <div><span style={{ color: "var(--color-muted)" }}>target: </span><span style={{ color: "var(--color-foreground)" }}>{event.target}</span></div>}
          {event.result && <div><span style={{ color: "var(--color-muted)" }}>result: </span><span style={{ color: "var(--color-foreground)" }}>{event.result}</span></div>}
          {Object.keys(event.metadata).length > 0 && (
            <pre className="text-xs rounded p-2 overflow-auto max-h-24"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
              {JSON.stringify(event.metadata, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Summary strip ───────────────────────────────────────────────────────────

function SummaryStrip({ summary }: { summary: MissionReplay["summary"] }) {
  return (
    <div className="flex gap-4 px-4 py-3 text-xs" style={{ borderBottom: "1px solid var(--color-border)" }}>
      {[
        { label: "Total", value: summary.totalEvents, color: "var(--color-foreground)" },
        { label: "Recorded", value: summary.recorded, color: "var(--color-success)" },
        { label: "Missing", value: summary.missing, color: "var(--color-error)" },
        { label: "Blocked", value: summary.blocked, color: "var(--color-warn)" },
        { label: "Redacted", value: summary.redacted, color: "var(--color-muted)" },
      ].map(({ label, value, color }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span style={{ color: "var(--color-muted)" }}>{label}:</span>
          <span className="font-semibold" style={{ color }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function MissionReplayPage() {
  const [traceId, setTraceId] = useState("");
  const [showSourceOfTruth, setShowSourceOfTruth] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>("");

  const replayQ = useQuery({
    queryKey: ["mission-replay", traceId],
    queryFn: () => traceId
      ? api.observability.traceReplay(traceId, 500)
      : api.observability.missionReplay(undefined, 500),
    refetchInterval: 15_000,
  });

  const evalsQ = useQuery({
    queryKey: ["jarvis-evals"],
    queryFn: () => api.observability.evalSuites(),
  });

  const runEvalsMut = useMutation({
    mutationFn: () => api.observability.runEvals(),
  });

  const replay = (replayQ.data as any)?.replay as MissionReplay | undefined;
  const evalSuites = (evalsQ.data as any)?.suites as string[] | undefined;
  const latestEvalReport = (runEvalsMut.data as any)?.report as EvalReport | undefined;

  const activeReport = latestEvalReport;

  const filteredEvents = (replay?.events ?? []).filter(
    e => !sourceFilter || e.source === sourceFilter
  );

  const sources = [...new Set((replay?.events ?? []).map(e => e.source))];

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-4 pb-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-2 mb-3">
          <History size={18} style={{ color: "var(--color-accent)" }} />
          <h1 className="text-base font-semibold" style={{ color: "var(--color-foreground)" }}>Mission Replay</h1>
          <button onClick={() => void replayQ.refetch()}
            className="ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
            <RefreshCw size={11} /> Refresh
          </button>
        </div>

        {/* Trace filter */}
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={traceId}
            onChange={e => setTraceId(e.target.value)}
            placeholder="Filter by trace ID (leave blank for recent events)"
            className="flex-1 rounded-lg px-3 py-1.5 text-xs"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
          />
          {traceId && (
            <button onClick={() => setTraceId("")}
              className="text-xs px-2 py-1 rounded-lg"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
              Clear
            </button>
          )}
        </div>

        {/* Source filter chips */}
        {sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setSourceFilter("")}
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: !sourceFilter ? "var(--color-accent)" : "var(--color-elevated)",
                color: !sourceFilter ? "#fff" : "var(--color-muted)",
                border: "1px solid var(--color-border)",
              }}>
              All
            </button>
            {sources.map(s => (
              <button key={s} onClick={() => setSourceFilter(s === sourceFilter ? "" : s)}
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: sourceFilter === s ? SOURCE_COLOR[s] ?? "var(--color-accent)" : "var(--color-elevated)",
                  color: sourceFilter === s ? "#fff" : SOURCE_COLOR[s] ?? "var(--color-muted)",
                  border: "1px solid var(--color-border)",
                }}>
                {s.replace(/_/g, "·")}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Events panel */}
        <div className="flex-1 overflow-y-auto">
          {replay && <SummaryStrip summary={replay.summary} />}

          {replayQ.isLoading && (
            <div className="px-6 py-4 text-sm" style={{ color: "var(--color-muted)" }}>
              Loading events…
            </div>
          )}

          {!replayQ.isLoading && filteredEvents.length === 0 && (
            <div className="px-6 py-4 text-sm" style={{ color: "var(--color-muted)" }}>
              No events recorded yet. Events appear here as you use the app.
            </div>
          )}

          {filteredEvents.map(event => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>

        {/* Right panel: evals + source-of-truth */}
        <div className="w-72 shrink-0 overflow-y-auto" style={{ borderLeft: "1px solid var(--color-border)" }}>
          {/* Evals */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>Local evals</span>
              <button
                onClick={() => runEvalsMut.mutate()}
                disabled={runEvalsMut.isPending}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg disabled:opacity-40"
                style={{ background: "var(--color-accent)", color: "#fff" }}>
                {runEvalsMut.isPending ? "Running…" : <><Play size={10} /> Run all</>}
              </button>
            </div>
            {activeReport && (
              <div className="space-y-2">
                <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                  {activeReport.passCount}/{(activeReport.passCount + activeReport.failCount)} passing
                  {activeReport.ranAt && ` · ${new Date(activeReport.ranAt).toLocaleTimeString()}`}
                </div>
                {activeReport.results?.map((r: EvalResult) => (
                  <div key={r.id} className="flex items-start gap-2 text-xs">
                    {r.status === "pass"
                      ? <CheckCircle size={12} style={{ color: "var(--color-success)", flexShrink: 0, marginTop: 1 }} />
                      : <XCircle size={12} style={{ color: "var(--color-error)", flexShrink: 0, marginTop: 1 }} />}
                    <div>
                      <div style={{ color: "var(--color-foreground)" }}>{r.name}</div>
                      <div style={{ color: "var(--color-muted)" }}>{r.message?.slice(0, 80)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!activeReport && !runEvalsMut.isPending && (
              <p className="text-xs" style={{ color: "var(--color-muted)" }}>Click "Run all" to execute local evals.</p>
            )}
          </div>

          {/* Source of truth */}
          {replay?.sourceOfTruth && (
            <div className="px-4 pt-2 pb-4" style={{ borderTop: "1px solid var(--color-border)" }}>
              <button
                onClick={() => setShowSourceOfTruth(!showSourceOfTruth)}
                className="flex items-center gap-2 text-xs font-medium mb-2 w-full text-left"
                style={{ background: "none", border: "none", color: "var(--color-foreground)", cursor: "pointer" }}>
                <Info size={12} style={{ color: "var(--color-accent)" }} />
                Source of truth
                {showSourceOfTruth ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>
              {showSourceOfTruth && (
                <pre className="text-xs overflow-auto rounded-lg p-2"
                  style={{ background: "var(--color-elevated)", color: "var(--color-muted)", fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap", maxHeight: 300 }}>
                  {replay.sourceOfTruth}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
