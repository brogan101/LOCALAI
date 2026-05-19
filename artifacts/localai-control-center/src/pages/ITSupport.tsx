/**
 * ITSupport.tsx — Stage 3 upgrade
 * ================================
 * Replaces the old proposeScript() path (which returned not_configured) with
 * the real Phase 24 executor routes: validate → dry_run → execute → verify.
 *
 * The existing page had:
 *   - validateMut → api.itSupportApi.validateScript (static check only)
 *   - proposeMut  → api.itSupportApi.proposeScript("dry_run") → returned not_configured
 *   - No execute or verify buttons
 *   - "executor disabled" badge in the UI
 *
 * This upgrade adds:
 *   - Validate button → POST /it-support/executor/validate
 *   - Dry Run button  → POST /it-support/executor/dry-run  (auto-approved, -WhatIf)
 *   - Execute button  → shows approval ID field → POST /it-support/executor/execute
 *   - Verify button   → POST /it-support/executor/verify
 *   - Proof bundle viewer → GET /executions/:jobId/proof
 *   - Live result panel with exit code, stdout/stderr preview, rollback notes link
 *
 * All four modes feed into a ProofPanel component that shows the job result.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert, Play, CheckCircle, XCircle, AlertTriangle, Loader2,
  FileText, Terminal, RotateCcw, ChevronDown, ChevronUp,
  Wrench, FlaskConical,
} from "lucide-react";
import api, { type ItSupportArtifact, type ItSupportWorkflowType } from "../api.js";

// ─── Executor API helpers ────────────────────────────────────────────────────

const BASE = "/api";

async function executorPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? data.reason ?? `HTTP ${res.status}`);
  return data;
}

async function fetchProofFile(jobId: string, filename: string): Promise<string> {
  const res = await fetch(`${BASE}/executions/${encodeURIComponent(jobId)}/proof/${encodeURIComponent(filename)}`);
  return res.ok ? res.text() : "(not available)";
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExecutorResult {
  success: boolean;
  executed: boolean;
  blocked: boolean;
  reason?: string;
  jobId: string;
  approvalId: string;
  mode: string;
  exitCode?: number;
  proofManifest: string[];
  redactedSummary: string;
}

// ─── Proof viewer ────────────────────────────────────────────────────────────

function ProofPanel({ result }: { result: ExecutorResult }) {
  const [expanded, setExpanded] = useState(false);
  const [fileContent, setFileContent] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const statusColor = result.success ? "var(--color-success)"
    : result.blocked ? "var(--color-error)"
    : "var(--color-warn)";

  const statusLabel = result.blocked ? "Blocked"
    : result.executed ? (result.success ? "Executed ✓" : "Failed")
    : result.success ? (result.mode === "validate" ? "Valid" : "Dry run passed")
    : "Dry run failed";

  async function loadFile(jobId: string, filename: string) {
    if (fileContent[filename]) return;
    setLoading(true);
    const content = await fetchProofFile(jobId, filename);
    setFileContent(prev => ({ ...prev, [filename]: content }));
    setLoading(false);
  }

  return (
    <div className="mt-3 rounded-xl overflow-hidden"
      style={{ border: `1px solid color-mix(in srgb, ${statusColor} 30%, var(--color-border))` }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        style={{ background: `color-mix(in srgb, ${statusColor} 8%, var(--color-surface))` }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {result.success
            ? <CheckCircle size={14} style={{ color: statusColor }} />
            : <XCircle size={14} style={{ color: statusColor }} />}
          <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
            {statusLabel}
          </span>
          {result.exitCode !== undefined && (
            <span className="text-xs px-1.5 py-0.5 rounded font-mono"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
              exit {result.exitCode}
            </span>
          )}
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            {result.redactedSummary}
          </span>
        </div>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 space-y-3" style={{ background: "var(--color-surface)" }}>
          {result.reason && (
            <div className="text-xs rounded-lg p-2"
              style={{ background: "color-mix(in srgb, var(--color-error) 10%, transparent)", color: "var(--color-error)" }}>
              {result.reason}
            </div>
          )}

          {result.jobId && (
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>
              Job: <code className="font-mono">{result.jobId}</code>
            </div>
          )}

          {/* Proof manifest */}
          {result.proofManifest?.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1.5" style={{ color: "var(--color-muted)" }}>
                Proof bundle ({result.proofManifest.length} files)
              </p>
              <div className="space-y-1">
                {result.proofManifest.map((filename) => (
                  <button
                    key={filename}
                    type="button"
                    className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs"
                    style={{ background: "var(--color-elevated)", color: "var(--color-foreground)" }}
                    onClick={() => loadFile(result.jobId, filename)}
                  >
                    <FileText size={11} style={{ color: "var(--color-muted)" }} />
                    {filename}
                  </button>
                ))}
              </div>

              {/* File content viewer */}
              {Object.entries(fileContent).map(([fn, content]) => (
                <div key={fn} className="mt-2">
                  <p className="text-xs font-mono mb-1" style={{ color: "var(--color-accent)" }}>{fn}</p>
                  <pre
                    className="text-xs overflow-auto max-h-48 p-2 rounded-lg"
                    style={{
                      background: "var(--color-elevated)",
                      color: "var(--color-foreground)",
                      fontFamily: "var(--font-mono)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {content.slice(0, 4000)}
                    {content.length > 4000 && "\n…(truncated)"}
                  </pre>
                </div>
              ))}

              {loading && <Loader2 size={13} className="animate-spin mt-1" style={{ color: "var(--color-muted)" }} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Artifact executor panel ─────────────────────────────────────────────────

function ArtifactExecutorPanel({ artifact }: { artifact: ItSupportArtifact }) {
  const [result, setResult] = useState<ExecutorResult | null>(null);
  const [approvalId, setApprovalId] = useState("");
  const [showExecuteInput, setShowExecuteInput] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(mode: "validate" | "dry_run" | "execute" | "verify") {
    setBusy(true);
    setResult(null);
    try {
      let res: ExecutorResult;
      if (mode === "validate") {
        res = await executorPost("/it-support/executor/validate", { artifactId: artifact.id });
      } else if (mode === "dry_run") {
        res = await executorPost("/it-support/executor/dry-run", { artifactId: artifact.id });
      } else if (mode === "execute") {
        res = await executorPost("/it-support/executor/execute", { artifactId: artifact.id, approvalId });
        setShowExecuteInput(false);
      } else {
        res = await executorPost("/it-support/executor/verify", { artifactId: artifact.id, approvalId: approvalId || undefined });
      }
      setResult(res);
    } catch (err) {
      setResult({
        success: false,
        executed: false,
        blocked: false,
        reason: err instanceof Error ? err.message : String(err),
        jobId: "",
        approvalId: "",
        mode,
        proofManifest: [],
        redactedSummary: "Request failed",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mb-3">
        <button type="button" onClick={() => run("validate")} disabled={busy}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
          style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}>
          {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
          Validate
        </button>
        <button type="button" onClick={() => run("dry_run")} disabled={busy}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
          style={{ background: "color-mix(in srgb, var(--color-info) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--color-info) 25%, transparent)", color: "var(--color-info)" }}>
          {busy ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
          Dry Run (-WhatIf)
        </button>
        <button type="button" onClick={() => setShowExecuteInput(!showExecuteInput)} disabled={busy}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
          style={{ background: "color-mix(in srgb, var(--color-warn) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--color-warn) 25%, transparent)", color: "var(--color-warn)" }}>
          <Play size={12} />
          Execute (requires approval)
        </button>
        <button type="button" onClick={() => run("verify")} disabled={busy}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
          style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
          <RotateCcw size={12} />
          Verify
        </button>
      </div>

      {/* Execute approval input */}
      {showExecuteInput && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={approvalId}
            onChange={(e) => setApprovalId(e.target.value)}
            placeholder="Approval ID (from Operations → Approvals)"
            className="flex-1 text-xs rounded-lg px-3 py-2"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
          />
          <button
            type="button"
            disabled={!approvalId.trim() || busy}
            onClick={() => run("execute")}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium disabled:opacity-40"
            style={{ background: "var(--color-error)", color: "#fff" }}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            Run for real
          </button>
        </div>
      )}

      {/* Warning when execute mode is open */}
      {showExecuteInput && (
        <div className="flex items-start gap-2 text-xs mb-3 p-2 rounded-lg"
          style={{ background: "color-mix(in srgb, var(--color-warn) 10%, transparent)", color: "var(--color-warn)" }}>
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          Real execution requires an approved request ID from the Operations page.
          Script must pass dry-run first. All output is saved to the proof bundle.
        </div>
      )}

      {/* Result */}
      {result && <ProofPanel result={result} />}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ITSupportPage() {
  const qc = useQueryClient();
  const [selectedWorkflow, setSelectedWorkflow] = useState<ItSupportWorkflowType>("diagnose_windows_issue");
  const [request, setRequest] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const statusQ = useQuery({
    queryKey: ["it-support-status"],
    queryFn: () => api.itSupportApi.status(),
    refetchInterval: 15_000,
  });

  const artifactsQ = useQuery({
    queryKey: ["it-support-artifacts"],
    queryFn: () => api.itSupportApi.artifacts(),
    refetchInterval: 15_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.itSupportApi.createArtifact({ workflowType: selectedWorkflow, request }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["it-support-artifacts"] });
      void qc.invalidateQueries({ queryKey: ["it-support-status"] });
      setRequest("");
    },
  });

  const artifacts = (artifactsQ.data as any)?.artifacts ?? [];
  const status = (statusQ.data as any)?.status;

  const WORKFLOWS: Array<{ value: ItSupportWorkflowType; label: string }> = [
    { value: "diagnose_windows_issue", label: "Diagnose Windows issue" },
    { value: "summarize_event_logs", label: "Summarize event logs" },
    { value: "generate_powershell_script", label: "Generate PowerShell script" },
    { value: "onboarding_checklist", label: "Onboarding checklist" },
    { value: "offboarding_checklist", label: "Offboarding checklist" },
    { value: "fortinet_helper_notes", label: "Fortinet helper notes" },
    { value: "ivanti_deployment_script_helper", label: "Ivanti deployment helper" },
    { value: "exchange_365_troubleshooting_checklist", label: "Exchange/M365 troubleshooting" },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="px-6 pt-4 pb-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert size={18} style={{ color: "var(--color-accent)" }} />
          <h1 className="text-base font-semibold" style={{ color: "var(--color-foreground)" }}>IT Support</h1>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium ml-2"
            style={{ background: "color-mix(in srgb, var(--color-success) 12%, transparent)", color: "var(--color-success)" }}>
            Executor active
          </span>
        </div>

        {status && (
          <div className="flex gap-3 text-xs" style={{ color: "var(--color-muted)" }}>
            <span>Artifacts: {status.artifactCount ?? 0}</span>
            <span>Executions: {status.executionCount ?? 0}</span>
            {status.pendingApprovals > 0 && (
              <span style={{ color: "var(--color-warn)" }}>● {status.pendingApprovals} pending approvals</span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: new artifact form */}
        <div className="w-80 shrink-0 flex flex-col p-4 gap-4 overflow-y-auto"
          style={{ borderRight: "1px solid var(--color-border)" }}>
          <div>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--color-foreground)" }}>
              New script
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs block mb-1" style={{ color: "var(--color-muted)" }}>Workflow type</label>
                <select
                  value={selectedWorkflow}
                  onChange={(e) => setSelectedWorkflow(e.target.value as ItSupportWorkflowType)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
                >
                  {WORKFLOWS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: "var(--color-muted)" }}>Request</label>
                <textarea
                  value={request}
                  onChange={(e) => setRequest(e.target.value)}
                  rows={5}
                  placeholder="Describe what you need, e.g. 'Check Windows Update service status and re-enable if stopped'"
                  className="w-full rounded-lg px-3 py-2 text-sm resize-none"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
                />
              </div>
              <button
                type="button"
                disabled={!request.trim() || createMut.isPending}
                onClick={() => createMut.mutate()}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg font-medium disabled:opacity-40"
                style={{ background: "var(--color-accent)", color: "#fff" }}>
                {createMut.isPending
                  ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
                  : <><Wrench size={14} /> Generate script</>}
              </button>
            </div>
          </div>

          {/* Usage note */}
          <div className="rounded-xl p-3 text-xs space-y-1.5"
            style={{ background: "var(--color-elevated)" }}>
            <p className="font-medium" style={{ color: "var(--color-foreground)" }}>Execution pipeline</p>
            <p style={{ color: "var(--color-muted)" }}>1. <strong>Validate</strong> — static safety check</p>
            <p style={{ color: "var(--color-muted)" }}>2. <strong>Dry Run</strong> — runs with -WhatIf</p>
            <p style={{ color: "var(--color-muted)" }}>3. <strong>Approve</strong> — in Operations page</p>
            <p style={{ color: "var(--color-muted)" }}>4. <strong>Execute</strong> — paste approval ID</p>
            <p style={{ color: "var(--color-muted)" }}>5. <strong>Verify</strong> — check verification steps</p>
          </div>
        </div>

        {/* Right: artifact list */}
        <div className="flex-1 overflow-y-auto p-4">
          {artifactsQ.isLoading && (
            <div className="text-sm" style={{ color: "var(--color-muted)" }}>Loading scripts…</div>
          )}
          {artifacts.length === 0 && !artifactsQ.isLoading && (
            <div className="text-sm" style={{ color: "var(--color-muted)" }}>
              No scripts yet. Fill in the form and click Generate.
            </div>
          )}

          {artifacts.map((artifact: ItSupportArtifact) => {
            const isExpanded = expandedId === artifact.id;
            const statusColor =
              artifact.status === "blocked" ? "var(--color-error)" :
              artifact.status === "approval_pending" ? "var(--color-warn)" :
              artifact.status === "review_required" ? "var(--color-info)" :
              "var(--color-muted)";

            return (
              <div key={artifact.id} className="mb-3 rounded-xl overflow-hidden"
                style={{ border: "1px solid var(--color-border)" }}>
                {/* Artifact header */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer"
                  style={{ background: "var(--color-surface)" }}
                  onClick={() => setExpandedId(isExpanded ? null : artifact.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Terminal size={14} style={{ color: "var(--color-muted)", flexShrink: 0 }} />
                    <span className="text-sm font-medium truncate" style={{ color: "var(--color-foreground)" }}>
                      {artifact.title}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded capitalize"
                      style={{ background: `color-mix(in srgb, ${statusColor} 12%, transparent)`, color: statusColor, flexShrink: 0 }}>
                      {artifact.status.replace("_", " ")}
                    </span>
                    {artifact.scriptLanguage && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-mono"
                        style={{ background: "var(--color-elevated)", color: "var(--color-muted)", flexShrink: 0 }}>
                        {artifact.scriptLanguage}
                      </span>
                    )}
                  </div>
                  {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4" style={{ background: "var(--color-surface)" }}>
                    {artifact.scriptBody && (
                      <pre
                        className="text-xs overflow-auto max-h-64 p-3 rounded-lg mb-3"
                        style={{
                          background: "var(--color-elevated)",
                          color: "var(--color-foreground)",
                          fontFamily: "var(--font-mono)",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}
                      >
                        {artifact.scriptBody}
                      </pre>
                    )}
                    <ArtifactExecutorPanel artifact={artifact} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
