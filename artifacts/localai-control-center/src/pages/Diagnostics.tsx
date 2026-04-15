import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  CheckCircle, AlertTriangle, XCircle, HelpCircle,
  Activity, Wifi, WifiOff, Wrench, RefreshCw,
} from "lucide-react";
import api, { type RepairHealthEntry, type RepairPortStatus } from "../api.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(s: string) {
  if (s === "ok")      return "var(--color-success)";
  if (s === "warning") return "var(--color-warn)";
  if (s === "error")   return "var(--color-error)";
  return "var(--color-muted)";
}

function StatusIcon({ status, size = 14 }: { status: string; size?: number }) {
  const color = statusColor(status);
  if (status === "ok")      return <CheckCircle size={size} style={{ color }} />;
  if (status === "warning") return <AlertTriangle size={size} style={{ color }} />;
  if (status === "error")   return <XCircle size={size} style={{ color }} />;
  return <HelpCircle size={size} style={{ color }} />;
}

function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 80 ? "var(--color-success)" :
    score >= 50 ? "var(--color-warn)" :
                  "var(--color-error)";
  return (
    <div className="flex flex-col items-center justify-center gap-1"
      style={{ width: 80, height: 80, border: `4px solid ${color}`, borderRadius: "50%", flexShrink: 0 }}>
      <span className="text-xl font-bold" style={{ color }}>{score}</span>
      <span className="text-xs" style={{ color: "var(--color-muted)" }}>/ 100</span>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-4 py-2 text-xs font-semibold uppercase tracking-widest"
      style={{ color: "var(--color-muted)", borderBottom: "1px solid var(--color-border)" }}>
      {title}
    </div>
  );
}

// ── Diagnostic row ────────────────────────────────────────────────────────────

function DiagRow({ item }: { item: { category: string; label: string; status: string; value: string; details?: string } }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5 text-sm"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      <StatusIcon status={item.status} size={14} />
      <div className="flex-1 min-w-0">
        <span style={{ color: "var(--color-foreground)" }}>{item.label}</span>
        {item.details && (
          <div className="text-xs mt-0.5 truncate" style={{ color: "var(--color-muted)" }}>{item.details}</div>
        )}
      </div>
      <span className="text-xs font-mono shrink-0" style={{ color: "var(--color-muted)" }}>{item.value}</span>
    </div>
  );
}

// ── Repair row ────────────────────────────────────────────────────────────────

function RepairRow({
  item,
  selected,
  onToggle,
}: {
  item: RepairHealthEntry;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5 text-sm"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      <StatusIcon status={item.status} size={14} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--color-foreground)" }}>{item.name}</span>
          <span className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
            {item.category}
          </span>
        </div>
        {item.details && (
          <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{item.details}</div>
        )}
      </div>
      <span className="text-xs font-mono shrink-0 mr-2" style={{ color: "var(--color-muted)" }}>
        {item.value ?? (item.installed ? "installed" : "not found")}
      </span>
      {item.canRepair && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          style={{ accentColor: "var(--color-accent)", cursor: "pointer" }}
        />
      )}
    </div>
  );
}

// ── Port row ──────────────────────────────────────────────────────────────────

function PortRow({ p }: { p: RepairPortStatus }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 text-sm"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      {p.reachable
        ? <Wifi size={13} style={{ color: "var(--color-success)" }} />
        : <WifiOff size={13} style={{ color: "var(--color-muted)" }} />}
      <span style={{ color: "var(--color-foreground)" }}>{p.name}</span>
      <span className="font-mono text-xs ml-auto" style={{ color: "var(--color-muted)" }}>:{p.port}</span>
      <span className="text-xs px-1.5 py-0.5 rounded"
        style={{
          background: p.reachable
            ? "color-mix(in srgb, var(--color-success) 15%, transparent)"
            : "color-mix(in srgb, var(--color-muted) 12%, transparent)",
          color: p.reachable ? "var(--color-success)" : "var(--color-muted)",
        }}>
        {p.reachable ? "reachable" : "offline"}
      </span>
    </div>
  );
}

// ── Card shell ────────────────────────────────────────────────────────────────

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl overflow-hidden ${className}`}
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DiagnosticsPage() {
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [repairLog, setRepairLog] = useState<string | null>(null);

  const diagQ   = useQuery({ queryKey: ["diagnostics"],   queryFn: () => api.system.diagnostics(),  staleTime: 30_000 });
  const repairQ = useQuery({ queryKey: ["repair-health"], queryFn: () => api.repair.health(),        staleTime: 30_000 });
  const stackQ  = useQuery({ queryKey: ["stack-status"],  queryFn: () => api.stack.status(),         staleTime: 30_000 });

  const runRepair = useMutation({
    mutationFn: (ids: string[]) => api.repair.run(ids),
    onSuccess: (data) => {
      const results = (data as { results?: Array<{ name: string; action: string; success: boolean; message: string }> }).results ?? [];
      setRepairLog(results.map((r) => `${r.name}: [${r.action}] ${r.message}`).join("\n"));
      setSelectedIds(new Set());
      setTimeout(() => void qc.invalidateQueries({ queryKey: ["repair-health"] }), 2000);
    },
  });

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const health = repairQ.data;
  const diag   = diagQ.data;
  const stack  = stackQ.data;

  // Group diagnostic items by category
  type DiagItem = NonNullable<typeof diag>["items"][number];
  const diagByCategory = (diag?.items ?? []).reduce<Record<string, DiagItem[]>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});

  // Group repair items by category
  const repairByCategory = (health?.items ?? []).reduce<Record<string, RepairHealthEntry[]>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6"
      style={{ background: "var(--color-background)" }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-foreground)" }}>Diagnostics</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            System health, component checks, and auto-repair
          </p>
        </div>
        <button
          onClick={() => {
            void qc.invalidateQueries({ queryKey: ["diagnostics"] });
            void qc.invalidateQueries({ queryKey: ["repair-health"] });
            void qc.invalidateQueries({ queryKey: ["stack-status"] });
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {/* Health score + summary */}
      {health && (
        <Card>
          <div className="flex items-center gap-6 p-5">
            <ScoreRing score={health.healthScore} />
            <div className="flex-1 space-y-1">
              <div className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
                Component Health Score
              </div>
              <div className="flex gap-4 text-sm">
                <span style={{ color: "var(--color-success)" }}>{health.ok} ok</span>
                <span style={{ color: "var(--color-warn)" }}>{health.warnings} warning{health.warnings !== 1 ? "s" : ""}</span>
                <span style={{ color: "var(--color-error)" }}>{health.errors} error{health.errors !== 1 ? "s" : ""}</span>
              </div>
              {health.recommendations.map((r, i) => (
                <div key={i} className="text-xs" style={{ color: "var(--color-muted)" }}>{r}</div>
              ))}
              <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                Checked {new Date(health.checkedAt).toLocaleTimeString()}
                {health.isFreshPC && " · Fresh PC detected"}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Repair section */}
      <Card>
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="flex items-center gap-2">
            <Wrench size={15} style={{ color: "var(--color-accent)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>Component Repair</span>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                disabled={runRepair.isPending}
                onClick={() => runRepair.mutate([...selectedIds])}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: "var(--color-accent)", color: "#fff", opacity: runRepair.isPending ? 0.6 : 1 }}>
                {runRepair.isPending ? "Repairing…" : `Repair ${selectedIds.size} selected`}
              </button>
            )}
          </div>
        </div>

        {repairQ.isLoading && (
          <div className="p-6 text-sm text-center" style={{ color: "var(--color-muted)" }}>Loading…</div>
        )}

        {Object.entries(repairByCategory).map(([cat, items]) => (
          <div key={cat}>
            <SectionHeader title={cat} />
            {items.map((item) => (
              <RepairRow
                key={item.id}
                item={item}
                selected={selectedIds.has(item.id)}
                onToggle={() => toggleId(item.id)}
              />
            ))}
          </div>
        ))}

        {repairLog && (
          <div className="p-4">
            <pre className="text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)", fontFamily: "monospace" }}>
              {repairLog}
            </pre>
            <button className="mt-2 text-xs" style={{ color: "var(--color-muted)" }}
              onClick={() => setRepairLog(null)}>Dismiss</button>
          </div>
        )}
      </Card>

      {/* Port status */}
      {health?.portStatus && health.portStatus.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 px-4 py-3"
            style={{ borderBottom: "1px solid var(--color-border)" }}>
            <Activity size={15} style={{ color: "var(--color-accent)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>Port Status</span>
          </div>
          {health.portStatus.map((p) => <PortRow key={p.port} p={p} />)}
        </Card>
      )}

      {/* Stack components */}
      {stack?.components && stack.components.length > 0 && (
        <Card>
          <SectionHeader title="Stack Components" />
          {stack.components.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm"
              style={{ borderBottom: "1px solid var(--color-border)" }}>
              <StatusIcon status={c.running ? "ok" : c.installed ? "warning" : "error"} size={14} />
              <span style={{ color: "var(--color-foreground)" }}>{c.name}</span>
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>{c.category}</span>
              <span className="ml-auto text-xs font-mono" style={{ color: "var(--color-muted)" }}>
                {c.version ?? (c.installed ? "installed" : "not found")}
              </span>
            </div>
          ))}
        </Card>
      )}

      {/* System diagnostics */}
      {diag && (
        <Card>
          {Object.entries(diagByCategory).map(([cat, items]) => (
            <div key={cat}>
              <SectionHeader title={cat} />
              {items.map((item, i) => <DiagRow key={i} item={item} />)}
            </div>
          ))}
          <div className="px-4 py-2 text-xs" style={{ color: "var(--color-muted)" }}>
            Generated {new Date(diag.generatedAt).toLocaleTimeString()}
            {diag.recommendations.length > 0 && (
              <> · {diag.recommendations.join(" · ")}</>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
