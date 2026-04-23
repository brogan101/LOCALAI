import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect, useCallback } from "react";
import { RefreshCw, Filter, Radio, WifiOff, RotateCcw, ShieldAlert } from "lucide-react";
import api, { apiErrorMessage, type LogLine, type ThoughtEntry, type ActivityEntry, type BackupEntry } from "../api.js";
import { PermissionNotice } from "../components/PermissionNotice.js";
import { useAgentPermissions } from "../hooks/useAgentPermissions.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function levelColor(level?: string) {
  if (!level) return "var(--color-muted)";
  const l = level.toUpperCase();
  if (l === "ERROR" || l === "FATAL")  return "var(--color-error)";
  if (l === "WARN"  || l === "WARNING") return "var(--color-warn)";
  if (l === "INFO")                    return "var(--color-info)";
  return "var(--color-muted)";
}

function thoughtLevelColor(level: ThoughtEntry["level"]) {
  if (level === "error")   return "var(--color-error)";
  if (level === "warning") return "var(--color-warn)";
  if (level === "info")    return "var(--color-info)";
  return "var(--color-muted)";
}

type Tab = "system" | "thoughts" | "activity" | "audit";

// ── System log line ───────────────────────────────────────────────────────────

function LogRow({ line }: { line: LogLine }) {
  return (
    <div className="flex items-start gap-2 px-4 py-1 text-xs font-mono hover:bg-[color-mix(in_srgb,var(--color-elevated)_60%,transparent)]">
      {line.timestamp && (
        <span className="shrink-0 opacity-50">{line.timestamp.slice(0, 19).replace("T", " ")}</span>
      )}
      {line.level && (
        <span className="shrink-0 w-14 font-semibold" style={{ color: levelColor(line.level) }}>
          {line.level.toUpperCase().slice(0, 5)}
        </span>
      )}
      <span className="shrink-0 w-16 opacity-50">{line.source}</span>
      <span className="flex-1 whitespace-pre-wrap break-all" style={{ color: "var(--color-foreground)" }}>
        {line.message}
      </span>
    </div>
  );
}

// ── Thought row ───────────────────────────────────────────────────────────────

function ThoughtRow({ entry }: { entry: ThoughtEntry }) {
  const [open, setOpen] = useState(false);
  const hasMetadata = entry.metadata && Object.keys(entry.metadata).length > 0;
  return (
    <div className="px-4 py-2 text-xs" style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div className="flex items-start gap-2">
        <span className="shrink-0 opacity-50 font-mono">{entry.timestamp.slice(11, 19)}</span>
        <span className="shrink-0 w-14 font-semibold" style={{ color: thoughtLevelColor(entry.level) }}>
          {entry.level.toUpperCase().slice(0, 4)}
        </span>
        <span className="shrink-0 w-20 opacity-60">{entry.category}</span>
        <div className="flex-1 min-w-0">
          <span className="font-medium" style={{ color: "var(--color-foreground)" }}>{entry.title}</span>
          <span className="ml-2 opacity-70">{entry.message}</span>
          {hasMetadata && (
            <button className="ml-2 opacity-50 hover:opacity-100" onClick={() => setOpen((v) => !v)}>
              [{open ? "hide" : "meta"}]
            </button>
          )}
        </div>
      </div>
      {open && hasMetadata && (
        <pre className="mt-1 ml-6 text-xs overflow-x-auto p-2 rounded"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", fontFamily: "monospace" }}>
          {JSON.stringify(entry.metadata, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Activity row ──────────────────────────────────────────────────────────────

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const statusColor =
    entry.status === "success" ? "var(--color-success)" :
    entry.status === "warning" ? "var(--color-warn)" :
    entry.status === "error"   ? "var(--color-error)" :
                                 "var(--color-muted)";
  return (
    <div className="flex items-start gap-3 px-4 py-2 text-xs"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      <span className="shrink-0 font-mono opacity-50">{entry.timestamp.slice(11, 19)}</span>
      <span className="shrink-0 w-16 font-semibold" style={{ color: statusColor }}>{entry.status}</span>
      {entry.component && <span className="shrink-0 w-20 opacity-60">{entry.component}</span>}
      <span className="flex-1" style={{ color: "var(--color-foreground)" }}>{entry.message}</span>
    </div>
  );
}

// ── Audit tab ─────────────────────────────────────────────────────────────────

const AUDIT_TITLES = [
  "Sovereign Self-Edit", "Execution", "Agent Action",
  "Window Auto-Minimized", "File Applied", "Verification Failed",
];

function AuditTab({ filter }: { filter: string }) {
  const qc = useQueryClient();
  const permissions = useAgentPermissions();
  const editsDisabled = permissions.settings ? !permissions.canEdit : false;

  const thoughtsQ = useQuery({
    queryKey: ["audit-thoughts"],
    queryFn: () => api.observability.thoughts(500),
    staleTime: 10_000,
  });

  const rollbackMut = useMutation({
    mutationFn: (filePath: string) => api.rollback.rollback(filePath),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["audit-thoughts"] }),
  });

  const entries = (thoughtsQ.data?.entries ?? []).filter((e: ThoughtEntry) =>
    AUDIT_TITLES.some(t => e.title.startsWith(t))
  );

  const filtered = entries.filter((e: ThoughtEntry) =>
    !filter ||
    e.title.toLowerCase().includes(filter.toLowerCase()) ||
    e.message.toLowerCase().includes(filter.toLowerCase()) ||
    (typeof (e.metadata as Record<string, unknown>)?.["filePath"] === "string" &&
      ((e.metadata as Record<string, unknown>)["filePath"] as string).toLowerCase().includes(filter.toLowerCase()))
  );

  if (thoughtsQ.isLoading) {
    return <div className="p-6 text-sm text-center" style={{ color: "var(--color-muted)" }}>Loading audit log…</div>;
  }

  if (filtered.length === 0) {
    return (
      <div className="p-6 text-sm text-center" style={{ color: "var(--color-muted)" }}>
        No audit events yet. Apply an agent edit or run a command to see entries here.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {editsDisabled && <div className="p-3"><PermissionNotice permission="allowAgentEdits" /></div>}
      {rollbackMut.isError && (
        <div className="px-3 pb-3 text-xs" style={{ color: "var(--color-error)" }}>
          {apiErrorMessage(rollbackMut.error, "Rollback failed")}
        </div>
      )}
      <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-elevated)" }}>
            {["Timestamp", "Category", "Action", "Path / Command", "Result", ""].map(h => (
              <th key={h} className="px-3 py-2 text-left font-semibold"
                style={{ color: "var(--color-muted)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((e: ThoughtEntry) => {
            const meta = (e.metadata ?? {}) as Record<string, unknown>;
            const filePath = typeof meta["filePath"] === "string" ? meta["filePath"] : undefined;
            const command  = typeof meta["command"]  === "string" ? meta["command"]  : undefined;
            const backupPath = typeof meta["backupPath"] === "string" ? meta["backupPath"] : undefined;
            const isRollbackPending = rollbackMut.isPending && rollbackMut.variables === filePath;

            return (
              <tr key={e.id} style={{ borderBottom: "1px solid var(--color-border)" }}
                className="hover:bg-[color-mix(in_srgb,var(--color-elevated)_50%,transparent)]">
                <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: "var(--color-muted)" }}>
                  {e.timestamp.slice(0, 19).replace("T", " ")}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--color-muted)" }}>{e.category}</td>
                <td className="px-3 py-2 font-medium" style={{ color: thoughtLevelColor(e.level) }}>{e.title}</td>
                <td className="px-3 py-2 font-mono max-w-[200px] truncate" style={{ color: "var(--color-foreground)" }}>
                  {filePath ?? command ?? "—"}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--color-muted)" }}>
                  {e.message.slice(0, 60)}{e.message.length > 60 ? "…" : ""}
                </td>
                <td className="px-3 py-2">
                  {backupPath && filePath && (
                    <button
                      disabled={isRollbackPending || editsDisabled}
                      onClick={() => {
                        if (window.confirm(`Rollback ${filePath}?`)) rollbackMut.mutate(filePath);
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-xs disabled:opacity-40"
                      style={{ background: "color-mix(in srgb, var(--color-warn) 12%, transparent)", color: "var(--color-warn)", border: "1px solid color-mix(in srgb, var(--color-warn) 25%, transparent)" }}>
                      <RotateCcw size={9} />
                      Rollback
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Live Thought Log (SSE) ────────────────────────────────────────────────────

const MAX_LIVE_THOUGHTS = 500;

function useLiveThoughts(enabled: boolean) {
  const [entries, setEntries] = useState<ThoughtEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(1000);

  // Seed from REST on mount, then switch to SSE
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    void api.observability.thoughts(200).then((data) => {
      setEntries(data.entries.slice().reverse()); // newest first
    }).catch(() => {});
  }, [enabled]);

  const connect = useCallback(() => {
    if (!enabled) return;
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    const es = api.observability.streamThoughts();
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setError(false);
      retryDelayRef.current = 1000;
    };

    es.onmessage = (ev) => {
      try {
        const entry = JSON.parse(ev.data as string) as ThoughtEntry;
        setEntries((prev) => {
          const next = [entry, ...prev];
          return next.length > MAX_LIVE_THOUGHTS ? next.slice(0, MAX_LIVE_THOUGHTS) : next;
        });
      } catch { /* ignore malformed */ }
    };

    es.onerror = () => {
      setConnected(false);
      setError(true);
      es.close();
      esRef.current = null;
      // Exponential backoff: 1s → 2s → 4s → 8s → cap at 30s
      const delay = Math.min(retryDelayRef.current, 30_000);
      retryDelayRef.current = Math.min(delay * 2, 30_000);
      retryRef.current = setTimeout(connect, delay);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      if (retryRef.current) clearTimeout(retryRef.current);
      setConnected(false);
    };
  }, [enabled, connect]);

  return { entries, connected, error };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("thoughts");
  const [source, setSource] = useState<"all" | "ollama" | "webui">("all");
  const [filter, setFilter] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Live thought log via SSE
  const { entries: liveThoughts, connected: sseConnected, error: sseError } = useLiveThoughts(tab === "thoughts");

  const sysQ = useQuery({
    queryKey: ["system-logs", source],
    queryFn: () => api.systemExtra.logs(source, 300),
    staleTime: 15_000,
    enabled: tab === "system",
  });

  const activityQ = useQuery({
    queryKey: ["activity"],
    queryFn: () => api.system.activity(),
    staleTime: 15_000,
    enabled: tab === "activity",
  });

  // Auto-scroll to bottom when data changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveThoughts, sysQ.data, activityQ.data]);

  const sysLines = (sysQ.data?.lines ?? []).filter((l) =>
    !filter || l.message.toLowerCase().includes(filter.toLowerCase())
  );
  const thoughts = liveThoughts.filter((e) =>
    !filter || e.title.toLowerCase().includes(filter.toLowerCase()) || e.message.toLowerCase().includes(filter.toLowerCase())
  );
  const activities = ((activityQ.data?.entries ?? []) as ActivityEntry[]).filter((e) =>
    !filter || e.message.toLowerCase().includes(filter.toLowerCase()) || e.action.toLowerCase().includes(filter.toLowerCase())
  );

  function refresh() {
    if (tab === "system")   void qc.invalidateQueries({ queryKey: ["system-logs", source] });
    if (tab === "activity") void qc.invalidateQueries({ queryKey: ["activity"] });
  }

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "thoughts", label: "Thought Log",  count: thoughts.length },
    { id: "system",   label: "System Logs",  count: sysLines.length },
    { id: "activity", label: "Activity",     count: activities.length },
    { id: "audit",    label: "Audit" },
  ];

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--color-background)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-foreground)" }}>Logs</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            Thought log · system logs · activity history
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "thoughts" && (
            <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg"
              style={{
                background: "var(--color-elevated)",
                color: sseConnected ? "var(--color-success)" : sseError ? "var(--color-warn)" : "var(--color-muted)",
                border: "1px solid var(--color-border)",
              }}>
              {sseConnected
                ? <><Radio size={11} /> Live</>
                : sseError
                  ? <><WifiOff size={11} /> Reconnecting…</>
                  : <><WifiOff size={11} /> Connecting…</>
              }
            </div>
          )}
          <button onClick={refresh}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Tab bar + filter */}
      <div className="flex items-center gap-0 px-4 pt-3 pb-0 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
        <div className="flex gap-1 flex-1">
          {tabs.map((t) => (
            <button key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-2 text-sm font-medium rounded-t-lg"
              style={{
                background: tab === t.id ? "var(--color-background)" : "transparent",
                color: tab === t.id ? "var(--color-foreground)" : "var(--color-muted)",
                borderBottom: tab === t.id ? "2px solid var(--color-accent)" : "2px solid transparent",
              }}>
              {t.label}
              {t.count !== undefined && (
                <span className="ml-1.5 text-xs opacity-60">({t.count})</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 pb-2">
          {tab === "system" && (
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as typeof source)}
              className="text-xs px-2 py-1 rounded"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
              <option value="all">All sources</option>
              <option value="ollama">Ollama</option>
              <option value="webui">WebUI</option>
            </select>
          )}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
            <Filter size={11} style={{ color: "var(--color-muted)" }} />
            <input
              type="text"
              placeholder="Filter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="text-xs w-28 outline-none bg-transparent"
              style={{ color: "var(--color-foreground)" }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-background)" }}>

        {/* Thought log — live SSE */}
        {tab === "thoughts" && (
          <div>
            {thoughts.length === 0 && (
              <div className="p-6 text-sm text-center" style={{ color: "var(--color-muted)" }}>
                {sseConnected ? "No thoughts recorded yet." : "Connecting to thought stream…"}
              </div>
            )}
            {thoughts.map((e) => (
              <ThoughtRow key={e.id} entry={e} />
            ))}
          </div>
        )}

        {/* System logs */}
        {tab === "system" && (
          <div className="font-mono">
            {sysQ.isLoading && (
              <div className="p-6 text-sm text-center" style={{ color: "var(--color-muted)" }}>Loading…</div>
            )}
            {sysQ.data?.truncated && (
              <div className="px-4 py-1 text-xs text-center"
                style={{ background: "color-mix(in srgb, var(--color-warn) 10%, transparent)", color: "var(--color-warn)" }}>
                Log truncated — showing last {sysLines.length} lines
              </div>
            )}
            {sysLines.map((l, i) => <LogRow key={i} line={l} />)}
            {sysLines.length === 0 && !sysQ.isLoading && (
              <div className="p-6 text-sm text-center" style={{ color: "var(--color-muted)" }}>
                No log lines found.
                {" "}On Windows, Ollama logs are at{" "}
                <code className="font-mono text-xs">%USERPROFILE%\AppData\Local\Ollama\logs\server.log</code>
              </div>
            )}
          </div>
        )}

        {/* Activity */}
        {tab === "activity" && (
          <div>
            {activityQ.isLoading && (
              <div className="p-6 text-sm text-center" style={{ color: "var(--color-muted)" }}>Loading…</div>
            )}
            {activities.length === 0 && !activityQ.isLoading && (
              <div className="p-6 text-sm text-center" style={{ color: "var(--color-muted)" }}>No activity recorded yet.</div>
            )}
            {activities.map((e) => <ActivityRow key={e.id} entry={e} />)}
          </div>
        )}

        {/* Audit */}
        {tab === "audit" && (
          <AuditTab filter={filter} />
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
