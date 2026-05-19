import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle, Cpu, RefreshCw, Server, Zap } from "lucide-react";
import type { ElementType, ReactNode } from "react";
import { useState } from "react";
import api, { apiErrorMessage } from "../api.js";

// ── Shared UI primitives (match existing LOCALAI style) ───────────────────────

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl border p-4 ${className}`}
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      {children}
    </section>
  );
}

function CardHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: ElementType;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-3 flex items-start gap-3">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{
          background: "color-mix(in srgb, var(--color-accent) 14%, transparent)",
          color: "var(--color-accent)",
        }}
      >
        <Icon size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--color-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "info";
}) {
  const color =
    tone === "ok"
      ? "var(--color-success)"
      : tone === "warn"
        ? "var(--color-warn)"
        : tone === "danger"
          ? "var(--color-error)"
          : tone === "info"
            ? "var(--color-info)"
            : "var(--color-muted)";
  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
      style={{
        color,
        borderColor: "color-mix(in srgb, currentColor 28%, transparent)",
        background: "color-mix(in srgb, currentColor 9%, transparent)",
      }}
    >
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs" style={{ color: "var(--color-muted)" }}>
        {label}
      </span>
      <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
        {value}
      </span>
    </div>
  );
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  return `${bytes} B`;
}

// ── Hardware page ─────────────────────────────────────────────────────────────

export default function HardwarePage() {
  const qc = useQueryClient();
  const [checkVramGb, setCheckVramGb] = useState<string>("");

  const gpuQ = useQuery({
    queryKey: ["hardware", "gpu"],
    queryFn: () => api.hardware.gpu(),
    staleTime: 30_000,
  });

  const intelQ = useQuery({
    queryKey: ["hardware", "intelligence"],
    queryFn: () => api.hardware.intelligence(),
    staleTime: 60_000,
  });

  const canFitBytes = checkVramGb ? Math.round(parseFloat(checkVramGb) * 1_073_741_824) : 0;
  const canFitQ = useQuery({
    queryKey: ["hardware", "canfit", canFitBytes],
    queryFn: () => api.hardware.canFit(canFitBytes),
    enabled: canFitBytes > 0,
    staleTime: 10_000,
  });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["hardware"] });
  }

  const gpu = gpuQ.data?.gpu ?? null;
  const intel = intelQ.data;

  return (
    <div className="flex flex-col gap-4 p-4" style={{ maxWidth: 900 }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: "var(--color-foreground)" }}>
            Hardware Intelligence
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            Live VRAM probe · ranked model list · quant advice
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium"
          style={{
            background: "var(--color-elevated)",
            borderColor: "var(--color-border)",
            color: "var(--color-foreground)",
          }}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* GPU card */}
      <Card>
        <CardHeader icon={Cpu} title="GPU" subtitle={gpu?.name ?? (gpuQ.isFetching ? "Probing…" : "No GPU detected")} />
        {gpuQ.isError && (
          <p className="text-xs" style={{ color: "var(--color-error)" }}>
            <AlertTriangle size={12} className="inline mr-1" />
            {apiErrorMessage(gpuQ.error)}
          </p>
        )}
        {gpu ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="VRAM Total" value={fmtBytes(gpu.totalVram)} />
            <Stat label="VRAM Used" value={fmtBytes(gpu.usedVram)} />
            <Stat
              label="VRAM Free"
              value={
                <Pill tone={gpu.freeVram > 4_294_967_296 ? "ok" : gpu.freeVram > 2_147_483_648 ? "warn" : "danger"}>
                  {fmtBytes(gpu.freeVram)}
                </Pill>
              }
            />
            {gpu.temperature !== undefined && (
              <Stat label="Temperature" value={
                <Pill tone={gpu.temperature > 85 ? "danger" : gpu.temperature > 75 ? "warn" : "ok"}>
                  {gpu.temperature}°C
                </Pill>
              } />
            )}
            {gpu.driverVersion && <Stat label="Driver" value={gpu.driverVersion} />}
            <Stat label="Source" value={gpu.source} />
          </div>
        ) : !gpuQ.isFetching && !gpuQ.isError ? (
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            No GPU detected or probe unavailable.
          </p>
        ) : null}
      </Card>

      {/* Warnings */}
      {intel?.warnings && intel.warnings.length > 0 && (
        <div className="rounded-lg border px-3 py-2 space-y-1"
          style={{ borderColor: "color-mix(in srgb, var(--color-warn) 40%, transparent)", background: "color-mix(in srgb, var(--color-warn) 8%, transparent)" }}>
          {intel.warnings.map((w, i) => (
            <p key={i} className="text-xs" style={{ color: "var(--color-warn)" }}>
              <AlertTriangle size={11} className="inline mr-1" />{w}
            </p>
          ))}
        </div>
      )}

      {/* Model fit checker */}
      <Card>
        <CardHeader icon={Activity} title="Model Fit Check" subtitle="Enter model VRAM requirement in GB" />
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="number"
            min={0.5}
            max={256}
            step={0.5}
            value={checkVramGb}
            onChange={(e) => setCheckVramGb(e.target.value)}
            placeholder="GB (e.g. 9)"
            className="rounded-lg border px-3 py-1.5 text-sm w-32"
            style={{
              background: "var(--color-elevated)",
              borderColor: "var(--color-border)",
              color: "var(--color-foreground)",
            }}
          />
          {canFitQ.isFetching && (
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>Checking…</span>
          )}
          {canFitQ.data && (
            <div className="flex items-center gap-2">
              {canFitQ.data.canFit ? (
                <>
                  <CheckCircle size={14} style={{ color: "var(--color-success)" }} />
                  <span className="text-xs font-medium" style={{ color: "var(--color-success)" }}>
                    Fits — {fmtBytes(canFitQ.data.headroomBytes)} headroom
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle size={14} style={{ color: "var(--color-error)" }} />
                  <span className="text-xs font-medium" style={{ color: "var(--color-error)" }}>
                    Too large — {fmtBytes(Math.abs(canFitQ.data.headroomBytes))} short
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Recommended stack */}
      {intel?.recommendedStack && intel.recommendedStack.length > 0 && (
        <Card>
          <CardHeader icon={Zap} title="Recommended Stack" subtitle="Models that fit cleanly in your current free VRAM" />
          <div className="flex flex-wrap gap-2">
            {intel.recommendedStack.map((name) => (
              <Pill key={name} tone="ok">{name}</Pill>
            ))}
          </div>
        </Card>
      )}

      {/* Ranked models */}
      <Card>
        <CardHeader
          icon={Server}
          title="All Models — Ranked"
          subtitle={intel?.timestamp
            ? `Probed at ${new Date(intel.timestamp).toLocaleTimeString()}`
            : intelQ.isFetching ? "Running probe…" : ""}
        />
        {intelQ.isError && (
          <p className="text-xs" style={{ color: "var(--color-error)" }}>
            <AlertTriangle size={12} className="inline mr-1" />
            {apiErrorMessage(intelQ.error)}
          </p>
        )}
        {intel?.rankedModels && intel.rankedModels.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  {["Model", "Role", "VRAM", "Score", "Fits", "Explanation"].map((h) => (
                    <th key={h} className="pb-2 pr-4 text-left font-medium" style={{ color: "var(--color-muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {intel.rankedModels.map((ranking, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid color-mix(in srgb, var(--color-border) 50%, transparent)" }}>
                    <td className="py-2 pr-4 font-mono font-medium" style={{ color: "var(--color-foreground)" }}>
                      {ranking.model.name}
                    </td>
                    <td className="py-2 pr-4" style={{ color: "var(--color-muted)" }}>
                      {ranking.model.role}
                    </td>
                    <td className="py-2 pr-4" style={{ color: "var(--color-foreground)" }}>
                      {fmtBytes(ranking.model.vramBytes)}
                    </td>
                    <td className="py-2 pr-4" style={{ color: "var(--color-foreground)" }}>
                      {ranking.score.toFixed(0)}
                    </td>
                    <td className="py-2 pr-4">
                      {ranking.fits ? (
                        <CheckCircle size={13} style={{ color: "var(--color-success)" }} />
                      ) : (
                        <AlertTriangle size={13} style={{ color: ranking.fitsWithOffload ? "var(--color-warn)" : "var(--color-error)" }} />
                      )}
                    </td>
                    <td className="py-2 text-xs" style={{ color: "var(--color-muted)", maxWidth: 260 }}>
                      {ranking.explanation}
                      {ranking.warning && <span style={{ color: "var(--color-warn)" }}> — {ranking.warning}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : intelQ.isFetching ? (
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>Running hardware probe…</p>
        ) : intel?.rankedModels && intel.rankedModels.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            No models in USER_STACK — add models to <code>src/config/models.config.ts</code> to see rankings.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
