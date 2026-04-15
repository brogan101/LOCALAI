import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2, RefreshCw, AlertTriangle, CheckCircle, ShieldAlert, ScanSearch } from "lucide-react";
import api, { type CleanupArtifact } from "../api.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function riskColor(risk: string) {
  if (risk === "safe")     return "var(--color-success)";
  if (risk === "moderate") return "var(--color-warn)";
  return "var(--color-error)";
}

function riskIcon(risk: string) {
  if (risk === "safe")     return <CheckCircle size={13} style={{ color: riskColor(risk), flexShrink: 0 }} />;
  if (risk === "moderate") return <AlertTriangle size={13} style={{ color: riskColor(risk), flexShrink: 0 }} />;
  return <ShieldAlert size={13} style={{ color: riskColor(risk), flexShrink: 0 }} />;
}

function fmtBytes(bytes: number) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + " KB";
  return bytes + " B";
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl overflow-hidden ${className}`}
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      {children}
    </div>
  );
}

// ── Artifact row ──────────────────────────────────────────────────────────────

function ArtifactRow({
  artifact,
  checked,
  onToggle,
}: {
  artifact: CleanupArtifact;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-start gap-3 px-4 py-3 cursor-pointer"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        style={{ accentColor: "var(--color-accent)", marginTop: 2, flexShrink: 0, cursor: "pointer" }}
      />
      {riskIcon(artifact.risk)}
      <div className="flex-1 min-w-0">
        <div className="text-sm" style={{ color: "var(--color-foreground)" }}>{artifact.description}</div>
        <div className="text-xs mt-0.5 truncate font-mono" style={{ color: "var(--color-muted)" }}>{artifact.path}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs font-mono" style={{ color: "var(--color-muted)" }}>{fmtBytes(artifact.sizeBytes)}</div>
        <div className="text-xs mt-0.5"
          style={{ color: riskColor(artifact.risk) }}>
          {artifact.risk}
        </div>
      </div>
    </label>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CleanupPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{
    removedPaths: string[];
    scheduledForReboot: string[];
    skipped: Array<{ path: string; reason: string }>;
    message: string;
  } | null>(null);

  const scanQ = useQuery({
    queryKey: ["cleanup-scan"],
    queryFn: () => api.system.cleanupScan(),
    staleTime: 30_000,
  });

  const runMut = useMutation({
    mutationFn: (ids: string[]) => api.system.cleanupRun(ids),
    onSuccess: (data) => {
      setResult({ removedPaths: data.removedPaths, scheduledForReboot: data.scheduledForReboot, skipped: data.skipped, message: data.message });
      setSelected(new Set());
      void qc.invalidateQueries({ queryKey: ["cleanup-scan"] });
    },
  });

  const scan = scanQ.data;
  const artifacts = scan?.artifacts ?? [];

  function toggleId(id: string) {
    setSelected((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  }

  function selectAll(safe: boolean) {
    const ids = artifacts.filter((a) => !safe || a.risk === "safe").map((a) => a.id);
    setSelected(new Set(ids));
  }

  const selectedBytes = artifacts
    .filter((a) => selected.has(a.id))
    .reduce((sum, a) => sum + a.sizeBytes, 0);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6"
      style={{ background: "var(--color-background)" }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-foreground)" }}>Cleanup</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            Artifact scanner and disk space recovery
          </p>
        </div>
        <button
          onClick={() => void qc.invalidateQueries({ queryKey: ["cleanup-scan"] })}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
          <RefreshCw size={13} /> Re-scan
        </button>
      </div>

      {scanQ.isLoading && (
        <div className="flex items-center gap-3 p-6 justify-center text-sm"
          style={{ color: "var(--color-muted)" }}>
          <ScanSearch size={16} className="animate-spin" /> Scanning…
        </div>
      )}

      {scan && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total found", value: scan.totalFound },
              { label: "Safe to remove", value: scan.safeCount },
              { label: "Stale wrappers", value: scan.staleWrappers },
              { label: "Space savable", value: scan.spaceSavable },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl p-4 text-center"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
                <div className="text-xl font-bold" style={{ color: "var(--color-foreground)" }}>{value}</div>
                <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Artifact list */}
          {artifacts.length === 0 ? (
            <div className="text-sm text-center py-12" style={{ color: "var(--color-muted)" }}>
              No artifacts found — system is clean.
            </div>
          ) : (
            <Card>
              {/* Toolbar */}
              <div className="flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: "1px solid var(--color-border)" }}>
                <span className="text-sm" style={{ color: "var(--color-muted)" }}>
                  {selected.size} selected ({fmtBytes(selectedBytes)})
                </span>
                <button className="text-xs ml-2"
                  style={{ color: "var(--color-accent)" }}
                  onClick={() => selectAll(true)}>
                  Select safe
                </button>
                <button className="text-xs"
                  style={{ color: "var(--color-muted)" }}
                  onClick={() => selectAll(false)}>
                  Select all
                </button>
                <button className="text-xs"
                  style={{ color: "var(--color-muted)" }}
                  onClick={() => setSelected(new Set())}>
                  Clear
                </button>
                {selected.size > 0 && (
                  <button
                    disabled={runMut.isPending}
                    onClick={() => runMut.mutate([...selected])}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: "var(--color-error)", color: "#fff", opacity: runMut.isPending ? 0.6 : 1 }}>
                    <Trash2 size={12} />
                    {runMut.isPending ? "Removing…" : `Remove ${selected.size}`}
                  </button>
                )}
              </div>

              {artifacts.map((a) => (
                <ArtifactRow
                  key={a.id}
                  artifact={a}
                  checked={selected.has(a.id)}
                  onToggle={() => toggleId(a.id)}
                />
              ))}
            </Card>
          )}

          {/* Result */}
          {result && (
            <Card>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>Cleanup Result</span>
              </div>
              <div className="p-4 text-sm space-y-2">
                <div style={{ color: "var(--color-muted)" }}>{result.message}</div>
                {result.removedPaths.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-success)" }}>Removed ({result.removedPaths.length})</div>
                    {result.removedPaths.map((p) => (
                      <div key={p} className="text-xs font-mono truncate" style={{ color: "var(--color-muted)" }}>{p}</div>
                    ))}
                  </div>
                )}
                {result.scheduledForReboot.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-warn)" }}>Scheduled for reboot ({result.scheduledForReboot.length})</div>
                    {result.scheduledForReboot.map((p) => (
                      <div key={p} className="text-xs font-mono truncate" style={{ color: "var(--color-muted)" }}>{p}</div>
                    ))}
                  </div>
                )}
                {result.skipped.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-error)" }}>Skipped ({result.skipped.length})</div>
                    {result.skipped.map((s, i) => (
                      <div key={i} className="text-xs" style={{ color: "var(--color-muted)" }}>
                        <span className="font-mono">{s.path}</span> — {s.reason}
                      </div>
                    ))}
                  </div>
                )}
                <button className="text-xs mt-2" style={{ color: "var(--color-muted)" }}
                  onClick={() => setResult(null)}>Dismiss</button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
