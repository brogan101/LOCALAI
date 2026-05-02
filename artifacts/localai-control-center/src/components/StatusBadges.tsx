/**
 * StatusBadges — shared status/safety badge components for LOCALAI Control Center.
 *
 * Reuses the existing CSS variable design tokens (var(--color-*)) and the same
 * rounded/px-2/text-xs inline-badge style used throughout existing pages.
 *
 * Phase 20: extracted here so every new module page can import rather than
 * duplicating inline badge logic.
 */

import React from "react";
import { AlertTriangle, Cloud, Server } from "lucide-react";

// ── StatusPill ─────────────────────────────────────────────────────────────────
// General-purpose status pill for module/integration states.
// Maps well-known status strings to the existing color token set.

export type StatusKind =
  | "not_configured"
  | "degraded"
  | "disabled"
  | "blocked"
  | "manual_only"
  | "approval_required"
  | "dry_run"
  | "simulation_only"
  | "active"
  | "ready"
  | "local"
  | "not_started"
  | "complete"
  | "pending"
  | "error"
  | "configured"
  | "proposal"
  | "read_only"
  | string;

export function StatusPill({
  status,
  small,
}: {
  status: StatusKind;
  small?: boolean;
}) {
  const s = (status ?? "").toLowerCase();

  let bg: string;
  let color: string;
  let label: string = status;

  if (s === "not_configured" || s === "not_started") {
    bg = "var(--color-elevated)";
    color = "var(--color-muted)";
  } else if (s === "degraded" || s === "dry_run" || s === "simulation_only" || s === "proposal") {
    bg = "color-mix(in srgb, var(--color-warn) 12%, transparent)";
    color = "var(--color-warn)";
  } else if (s === "blocked" || s === "error") {
    bg = "color-mix(in srgb, var(--color-error) 12%, transparent)";
    color = "var(--color-error)";
  } else if (s === "disabled") {
    bg = "var(--color-elevated)";
    color = "var(--color-muted)";
  } else if (s === "manual_only") {
    bg = "color-mix(in srgb, var(--color-error) 12%, transparent)";
    color = "var(--color-error)";
    label = "manual only";
  } else if (s === "approval_required") {
    bg = "color-mix(in srgb, var(--color-warn) 12%, transparent)";
    color = "var(--color-warn)";
    label = "approval required";
  } else if (s === "active" || s === "ready" || s === "complete" || s === "configured") {
    bg = "color-mix(in srgb, var(--color-success) 12%, transparent)";
    color = "var(--color-success)";
  } else if (s === "local" || s === "read_only") {
    bg = "color-mix(in srgb, var(--color-info) 12%, transparent)";
    color = "var(--color-info)";
  } else if (s === "pending") {
    bg = "color-mix(in srgb, var(--color-warn) 12%, transparent)";
    color = "var(--color-warn)";
  } else {
    bg = "var(--color-elevated)";
    color = "var(--color-muted)";
  }

  const px = small ? "px-1.5 py-0.5" : "px-2 py-0.5";

  return (
    <span
      className={`inline-block ${px} rounded text-xs font-medium`}
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}

// ── LocalCloudBadge ────────────────────────────────────────────────────────────
// Shows whether data leaves the machine. Used by provider status cards.

export function LocalCloudBadge({
  dataLeavesMachine,
}: {
  dataLeavesMachine: boolean;
}) {
  if (dataLeavesMachine) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
        style={{
          background: "color-mix(in srgb, var(--color-warn) 12%, transparent)",
          color: "var(--color-warn)",
        }}
      >
        <Cloud size={10} />
        Cloud — data leaves machine
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
      style={{
        background: "color-mix(in srgb, var(--color-info) 12%, transparent)",
        color: "var(--color-info)",
      }}
    >
      <Server size={10} />
      Local only
    </span>
  );
}

// ── PhysicalTierBadge ──────────────────────────────────────────────────────────
// Shows physical action safety tier (manual_only, blocked, approval_required etc.)

const TIER_MAP: Record<string, { label: string; color: string }> = {
  p0_sensor_read:       { label: "P0 read",       color: "var(--color-info)" },
  p1_suggest:           { label: "P1 suggest",    color: "var(--color-info)" },
  p2_prepare_queue:     { label: "P2 prepare",    color: "var(--color-warn)" },
  p3_low_risk_automation: { label: "P3 low-risk", color: "var(--color-warn)" },
  p4_approval_required: { label: "P4 approval",   color: "var(--color-error)" },
  p5_manual_only_at_machine: { label: "P5 manual", color: "var(--color-error)" },
  manual_only:          { label: "manual only",   color: "var(--color-error)" },
  blocked:              { label: "blocked",        color: "var(--color-error)" },
  approval_required:    { label: "approval req",  color: "var(--color-warn)" },
  simulation_only:      { label: "sim only",      color: "var(--color-warn)" },
  read_only:            { label: "read only",     color: "var(--color-muted)" },
  read_state:           { label: "read state",    color: "var(--color-muted)" },
  not_configured:       { label: "not configured", color: "var(--color-muted)" },
  dry_run:              { label: "dry run",        color: "var(--color-warn)" },
};

export function PhysicalTierBadge({ tier }: { tier: string }) {
  const info = TIER_MAP[tier] ?? { label: tier, color: "var(--color-muted)" };
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-xs font-medium"
      style={{
        background: `color-mix(in srgb, ${info.color} 12%, transparent)`,
        color: info.color,
      }}
    >
      {info.label}
    </span>
  );
}

// ── UnavailableCard ────────────────────────────────────────────────────────────
// Used when a module is not_configured / degraded / blocked but still wired.
// Shows honest state rather than fake-ready content.

export function UnavailableCard({
  title,
  reason,
  hint,
}: {
  title: string;
  reason?: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "var(--color-elevated)" }}
        >
          <AlertTriangle size={14} style={{ color: "var(--color-muted)" }} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-medium mb-1"
            style={{ color: "var(--color-foreground)" }}
          >
            {title}
          </div>
          <StatusPill status={reason ?? "not_configured"} small />
          {hint && (
            <div
              className="text-xs mt-1.5"
              style={{ color: "var(--color-muted)" }}
            >
              {hint}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
