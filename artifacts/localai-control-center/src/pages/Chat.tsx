import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Send, Bot, Cpu,
  ChevronDown, ChevronRight, AlertCircle, FileCode,
  Database, ToggleLeft, ToggleRight, Search, Brain,
  FolderOpen, Image, Paperclip, X, Wrench,
  CheckCircle, XCircle, Loader2, FileDiff,
  Layers, GitBranch, GitFork, Plus, PanelLeft, MoreVertical, MoreHorizontal,
  Edit2, Trash2, Mic, MicOff, Camera,
  Pin, PanelRight, Gauge, Zap, Download,
} from "lucide-react";
import api, {
  apiErrorMessage,
  type ContextWorkspaceSummary,
  type AppSettings, type SelfHealResult, type RefactorPlan, type RefactorJob,
  type RefactorStep, type PinboardItem, type TokenBudget,
} from "../api.js";
import {
  useChatState,
  type AgentActionType, type AgentAction, type Message,
  type ContextMeta, type ContextFile,
} from "./chat/useChatState.js";
import { agentColor, agentIcon, MessageBubble } from "./chat/MessageBubble.js";
import MessageList from "./chat/MessageList.js";
import ChatInput from "./chat/ChatInput.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function actionTypeBadge(type: AgentActionType) {
  const map: Record<AgentActionType, { label: string; color: string }> = {
    propose_edit:      { label: "EDIT",      color: "var(--color-info)" },
    propose_command:   { label: "RUN",       color: "var(--color-warn)" },
    propose_self_heal: { label: "SELF-HEAL", color: "#a855f7" },
    propose_refactor:  { label: "REFACTOR",  color: "var(--color-accent)" },
  };
  const { label, color } = map[type];
  return (
    <span className="px-1.5 py-0.5 rounded text-xs font-bold"
      style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
      {label}
    </span>
  );
}


// ── Diff display ──────────────────────────────────────────────────────────────

function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <pre className="text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto rounded-lg p-2"
      style={{ background: "var(--color-background)", border: "1px solid var(--color-border)" }}>
      {lines.map((line, i) => (
        <div key={i} style={{
          color: line.startsWith("+") ? "var(--color-success)"
               : line.startsWith("-") ? "var(--color-error)"
               : "var(--color-muted)",
          background: line.startsWith("+") ? "color-mix(in srgb, var(--color-success) 8%, transparent)"
                    : line.startsWith("-") ? "color-mix(in srgb, var(--color-error) 8%, transparent)"
                    : "transparent",
        }}>{line}</div>
      ))}
    </pre>
  );
}

// ── Agent Action Card ─────────────────────────────────────────────────────────

function AgentActionCard({
  action,
  settings,
  onApprove,
  onReject,
}: {
  action: AgentAction;
  settings: AppSettings | null;
  onApprove: (action: AgentAction, editedValue?: string) => void;
  onReject: (id: string) => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [editedValue, setEditedValue] = useState(action.newContent ?? action.command ?? "");
  const [maxAttempts, setMaxAttempts] = useState(action.maxAttempts ?? 3);
  const [approving, setApproving] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [selfHealResult, setSelfHealResult] = useState<SelfHealResult | null>(null);
  const [selfHealLoading, setSelfHealLoading] = useState(false);
  const [refactorPlan, setRefactorPlan] = useState<RefactorPlan | null>(null);
  const [refactorJob, setRefactorJob] = useState<RefactorJob | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [confirmExecute, setConfirmExecute] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch diff preview for EDIT actions
  const previewQ = useQuery({
    queryKey: ["sovereign-preview", action.id],
    queryFn: async () => {
      if (action.type !== "propose_edit" || !action.filePath || !action.newContent) return null;
      const r = await api.system.sovereignPreview(action.filePath, editedValue || action.newContent);
      return r.proposal?.diff ?? null;
    },
    enabled: action.type === "propose_edit" && !!action.filePath && !!action.newContent,
    staleTime: Infinity,
    retry: 0,
  });

  const isGated = (perm: keyof AppSettings) => settings && settings[perm] === false;

  const gateLabel = (need: keyof AppSettings) =>
    isGated(need) ? "Enable in Settings → Agent Permissions" : undefined;

  async function handleApprove() {
    if (settings?.requireActionConfirmation && !confirmExecute) {
      setConfirmExecute(true);
      return;
    }
    setConfirmExecute(false);
    setActionError(null);
    setApproving(true);
    try {
      if (action.type === "propose_edit") {
        const content = editMode ? editedValue : (action.newContent ?? "");
        onApprove({ ...action, newContent: content });
      } else if (action.type === "propose_command") {
        const cmd = editMode ? editedValue : (action.command ?? "");
        const result = await api.system.execRun(cmd, action.cwd, 60000);
        if (!("stdout" in result)) {
          setTerminalOutput(`Approval required: ${result.approval.title}\nApproval ID: ${result.approval.id}\nOpen Operations → Approvals to approve or deny. The command has not executed.`);
          setExitCode(null);
          return;
        }
        setTerminalOutput((result.stdout || "") + (result.stderr ? `\nSTDERR:\n${result.stderr}` : ""));
        setExitCode(result.exitCode);
        onApprove({ ...action, command: cmd });
      } else if (action.type === "propose_self_heal") {
        setSelfHealLoading(true);
        const result = await api.system.execSelfHeal(action.filePath!, action.cwd, maxAttempts);
        setSelfHealResult(result);
        setSelfHealLoading(false);
        onApprove(action);
      } else if (action.type === "propose_refactor") {
        setPlanLoading(true);
        const planRes = await api.intelligence.planRefactor(action.workspacePath!, action.request!);
        setRefactorPlan(planRes.plan);
        setPlanLoading(false);
      }
    } catch (err) {
      const message = apiErrorMessage(err);
      setActionError(message);
      setTerminalOutput(`Error: ${message}`);
      setExitCode(-1);
    } finally {
      setApproving(false);
      setSelfHealLoading(false);
      setPlanLoading(false);
    }
  }

  async function handleExecuteRefactor() {
    if (!refactorPlan || isGated("allowAgentRefactor")) return;
    setActionError(null);
    setApproving(true);
    try {
      const jobRes = await api.intelligence.executeRefactor(refactorPlan.id);
      setRefactorJob(jobRes.job);
      onApprove(action);
    } catch (err) {
      setActionError(apiErrorMessage(err, "Refactor execution failed"));
    } finally {
      setApproving(false);
    }
  }

  // Poll refactor job
  const qc = useQueryClient();
  useQuery({
    queryKey: ["refactor-job", refactorJob?.id],
    queryFn: async () => {
      if (!refactorJob?.id) return null;
      const r = await api.intelligence.job(refactorJob.id);
      setRefactorJob(r.job);
      return r.job;
    },
    enabled: !!refactorJob?.id && refactorJob.status !== "completed" && refactorJob.status !== "failed",
    refetchInterval: 2000,
    retry: 0,
  });

  const dangerous = action.type === "propose_command" && isDangerous(action.command ?? "");

  return (
    <div className="rounded-xl overflow-hidden mb-3"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5"
        style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-elevated)" }}>
        {actionTypeBadge(action.type)}
        <span className="text-xs font-mono truncate flex-1" style={{ color: "var(--color-foreground)" }}>
          {action.filePath ?? action.command ?? action.workspacePath ?? ""}
        </span>
        <button onClick={() => onReject(action.id)} style={{ color: "var(--color-muted)" }}>
          <X size={13} />
        </button>
      </div>

      {/* Rationale */}
      <div className="px-3 pt-2 pb-1 text-xs" style={{ color: "var(--color-muted)" }}>
        {action.rationale}
      </div>

      {/* EDIT: diff preview */}
      {action.type === "propose_edit" && (
        <div className="px-3 pb-2">
          {previewQ.isLoading && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-muted)" }}>
              <Loader2 size={11} className="animate-spin" /> Loading diff…
            </div>
          )}
          {previewQ.data && <DiffView diff={previewQ.data} />}
          {editMode && (
            <textarea
              value={editedValue}
              onChange={e => setEditedValue(e.target.value)}
              rows={8}
              className="w-full mt-2 px-2 py-1.5 rounded text-xs font-mono resize-y"
              style={{ background: "var(--color-background)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            />
          )}
        </div>
      )}

      {/* RUN: command preview + danger flag */}
      {action.type === "propose_command" && (
        <div className="px-3 pb-2">
          {dangerous && (
            <div className="flex items-center gap-1.5 text-xs mb-1.5 px-2 py-1 rounded"
              style={{ background: "color-mix(in srgb, var(--color-error) 10%, transparent)", color: "var(--color-error)" }}>
              <AlertCircle size={11} /> Potentially destructive command
            </div>
          )}
          {editMode ? (
            <input
              value={editedValue}
              onChange={e => setEditedValue(e.target.value)}
              className="w-full px-2 py-1 rounded text-xs font-mono"
              style={{ background: "var(--color-background)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            />
          ) : (
            <pre className="text-xs font-mono px-2 py-1 rounded"
              style={{ background: "var(--color-background)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
              {action.command}
            </pre>
          )}
          {terminalOutput !== null && (
            <div className="mt-2">
              <pre className="text-xs font-mono max-h-32 overflow-y-auto px-2 py-1 rounded whitespace-pre-wrap"
                style={{ background: "var(--color-background)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
                {terminalOutput}
              </pre>
              {exitCode !== null && (
                <span className="text-xs px-1.5 py-0.5 rounded mt-1 inline-block"
                  style={{
                    background: exitCode === 0 ? "color-mix(in srgb, var(--color-success) 12%, transparent)" : "color-mix(in srgb, var(--color-error) 12%, transparent)",
                    color: exitCode === 0 ? "var(--color-success)" : "var(--color-error)",
                  }}>
                  exit {exitCode}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* SELF-HEAL */}
      {action.type === "propose_self_heal" && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 text-xs mb-1.5">
            <span style={{ color: "var(--color-muted)" }}>Max attempts:</span>
            <input
              type="number" min={1} max={10} value={maxAttempts}
              onChange={e => setMaxAttempts(Number(e.target.value))}
              className="w-16 px-2 py-0.5 rounded font-mono text-xs"
              style={{ background: "var(--color-background)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            />
          </div>
          {selfHealLoading && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-muted)" }}>
              <Loader2 size={11} className="animate-spin" /> Self-healing…
            </div>
          )}
          {selfHealResult && (
            <div className="space-y-1.5">
              <div className="text-xs" style={{ color: selfHealResult.success ? "var(--color-success)" : "var(--color-error)" }}>
                {selfHealResult.success ? "Healed successfully" : "Could not heal"} · {selfHealResult.attempts} attempt{selfHealResult.attempts !== 1 ? "s" : ""}
              </div>
              {selfHealResult.repairs.map((r, i) => (
                <details key={i} className="text-xs rounded overflow-hidden"
                  style={{ border: "1px solid var(--color-border)" }}>
                  <summary className="px-2 py-1 cursor-pointer" style={{ color: "var(--color-muted)", background: "var(--color-elevated)" }}>
                    Attempt {r.attempt} — {r.appliedFix ? "fix applied" : "no fix"}
                  </summary>
                  <pre className="px-2 py-1 whitespace-pre-wrap" style={{ color: "var(--color-foreground)" }}>
                    {r.errorSummary}{r.proposedFix ? `\n\nFix: ${r.proposedFix}` : ""}
                  </pre>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      {/* REFACTOR */}
      {action.type === "propose_refactor" && (
        <div className="px-3 pb-2 space-y-1.5">
          <div className="text-xs font-mono truncate" style={{ color: "var(--color-muted)" }}>{action.workspacePath}</div>
          <div className="text-xs" style={{ color: "var(--color-foreground)" }}>{action.request}</div>
          {planLoading && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-muted)" }}>
              <Loader2 size={11} className="animate-spin" /> Planning refactor…
            </div>
          )}
          {refactorPlan && !refactorJob && (
            <div className="space-y-1">
              <div className="text-xs font-medium" style={{ color: "var(--color-foreground)" }}>{refactorPlan.summary}</div>
              <div className="text-xs" style={{ color: "var(--color-muted)" }}>{refactorPlan.impactedFiles.length} files affected</div>
              <button
                onClick={() => void handleExecuteRefactor()}
                disabled={approving || isGated("allowAgentRefactor") === true}
                title={gateLabel("allowAgentRefactor")}
                className="text-xs px-3 py-1 rounded"
                style={{ background: "var(--color-accent)", color: "#fff", opacity: approving ? 0.6 : 1 }}>
                {approving ? <Loader2 size={10} className="animate-spin inline mr-1" /> : null}
                Execute Refactor
              </button>
            </div>
          )}
          {refactorJob && (
            <div className="space-y-1">
              <div className="text-xs" style={{ color: refactorJob.status === "completed" ? "var(--color-success)" : refactorJob.status === "failed" ? "var(--color-error)" : "var(--color-muted)" }}>
                {refactorJob.status}
              </div>
              {refactorJob.steps.map((step: RefactorStep) => (
                <div key={step.id} className="flex items-center gap-1.5 text-xs">
                  {step.status === "completed" ? <CheckCircle size={10} style={{ color: "var(--color-success)" }} />
                   : step.status === "failed"    ? <XCircle size={10} style={{ color: "var(--color-error)" }} />
                   : step.status === "running"   ? <Loader2 size={10} className="animate-spin" style={{ color: "var(--color-info)" }} />
                   : <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--color-border)" }} />}
                  <span className="truncate font-mono" style={{ color: "var(--color-muted)" }}>{step.relativePath}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      {actionError && (
        <div className="px-3 pb-2 text-xs" style={{ color: "var(--color-error)" }}>
          {actionError}
        </div>
      )}
      <div className="flex items-center gap-2 px-3 py-2"
        style={{ borderTop: "1px solid var(--color-border)" }}>
        {/* Approve */}
        {action.type !== "propose_refactor" || !refactorPlan ? (
          <button
            onClick={() => void handleApprove()}
            disabled={
              approving ||
              (action.type === "propose_edit"      && isGated("allowAgentEdits") === true) ||
              (action.type === "propose_command"   && isGated("allowAgentExec") === true) ||
              (action.type === "propose_self_heal" && isGated("allowAgentSelfHeal") === true) ||
              (action.type === "propose_refactor"  && isGated("allowAgentRefactor") === true)
            }
            title={
              action.type === "propose_edit"      ? gateLabel("allowAgentEdits") :
              action.type === "propose_command"   ? gateLabel("allowAgentExec") :
              action.type === "propose_self_heal" ? gateLabel("allowAgentSelfHeal") :
                                                    gateLabel("allowAgentRefactor")
            }
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium disabled:opacity-40"
            style={{ background: confirmExecute ? "var(--color-warn)" : "var(--color-accent)", color: "#fff" }}>
            {approving ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />}
            {confirmExecute ? "Confirm?" : "Approve"}
          </button>
        ) : null}

        {/* Reject */}
        <button
          onClick={() => onReject(action.id)}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
          <XCircle size={10} /> Reject
        </button>

        {/* Edit */}
        {(action.type === "propose_edit" || action.type === "propose_command") && (
          <button
            onClick={() => { setEditMode(m => !m); setConfirmExecute(false); }}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
            <FileDiff size={10} /> {editMode ? "Preview" : "Edit"}
          </button>
        )}
      </div>
    </div>
  );
}

function isDangerous(command: string): boolean {
  return /\brm\s+-rf\b|\bdel\s+\/[sf]\b|\bformat\b|\bmkfs\b|\bdd\s+if=|\b:!+\b|\bshutdown\b|\breboot\b|\bcurl\b.*\|\s*bash|\bwget\b.*\|\s*sh|\bchmod\s+777\b|\bdropdb\b|\bdrop\s+database\b/i.test(command);
}

// ── Toast notification ────────────────────────────────────────────────────────

function Toast({ message, onDismiss, onAction, actionLabel }: {
  message: string;
  onDismiss: () => void;
  onAction?: () => void;
  actionLabel?: string;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm"
      style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}>
      <CheckCircle size={15} style={{ color: "var(--color-success)", flexShrink: 0 }} />
      <span>{message}</span>
      {onAction && actionLabel && (
        <button
          onClick={onAction}
          className="text-xs px-2.5 py-1 rounded font-medium"
          style={{ background: "var(--color-accent)", color: "#fff" }}>
          {actionLabel}
        </button>
      )}
      <button onClick={onDismiss} style={{ color: "var(--color-muted)" }}>
        <X size={13} />
      </button>
    </div>
  );
}

// ── Agent Action Panel (2.2) ──────────────────────────────────────────────────

function AgentActionPanel({
  actions,
  settings,
  onApprove,
  onReject,
}: {
  actions: AgentAction[];
  settings: AppSettings | null;
  onApprove: (action: AgentAction, editedValue?: string) => void;
  onReject: (id: string) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <div
      className="shrink-0 overflow-y-auto"
      style={{
        width: 360,
        borderLeft: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        padding: "12px",
      }}>
      <div className="flex items-center gap-2 mb-3">
        <Layers size={14} style={{ color: "var(--color-accent)" }} />
        <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>
          Agent Actions
        </span>
        <span className="ml-auto text-xs px-1.5 py-0.5 rounded"
          style={{ background: "color-mix(in srgb, var(--color-warn) 15%, transparent)", color: "var(--color-warn)" }}>
          {actions.length}
        </span>
      </div>
      {actions.map(action => (
        <AgentActionCard
          key={action.id}
          action={action}
          settings={settings}
          onApprove={onApprove}
          onReject={onReject}
        />
      ))}
    </div>
  );
}

// ── Model selector ────────────────────────────────────────────────────────────

function ModelSelector({ value, onChange, onLoadStatus }: {
  value: string;
  onChange: (v: string) => void;
  onLoadStatus?: (msg: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 220 });

  const { data } = useQuery({
    queryKey: ["chatModels"],
    queryFn: () => api.chat.chatModels(),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
  const { data: runningData } = useQuery({
    queryKey: ["runningModels"],
    queryFn: () => api.models.running(),
    staleTime: 10_000,
    refetchInterval: 10_000,
  });

  const allModels = data?.models ?? [];
  const runningNames = new Set((runningData?.models ?? []).map(m => m.name));

  // Sort: running first, then alpha
  const sorted = [...allModels].sort((a, b) => {
    const ar = runningNames.has(a.name) ? 0 : 1;
    const br = runningNames.has(b.name) ? 0 : 1;
    if (ar !== br) return ar - br;
    return a.name.localeCompare(b.name);
  });

  // Default to first model if none selected and models loaded
  useEffect(() => {
    if (!value && sorted.length > 0) onChange(sorted[0].name);
  }, [sorted.length]);

  function openDropdown() {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setDropPos({
      top: rect.top - 4,   // position above button
      left: rect.left,
      width: Math.max(rect.width, 240),
    });
    setOpen(true);
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  async function selectModel(name: string) {
    onChange(name);
    setOpen(false);
    if (!name) return;
    // Auto-load the selected model
    setLoading(true);
    const msg = `Loading ${name} into VRAM…`;
    setLoadMsg(msg);
    onLoadStatus?.(msg);
    try {
      const r = await api.models.load(name);
      const done = r.success ? "Model ready ✓" : `Load failed: ${r.message}`;
      setLoadMsg(done);
      onLoadStatus?.(done);
      setTimeout(() => { setLoadMsg(null); onLoadStatus?.(null); }, 3000);
    } catch (e) {
      const err = `Load error: ${e instanceof Error ? e.message : String(e)}`;
      setLoadMsg(err);
      onLoadStatus?.(err);
      setTimeout(() => { setLoadMsg(null); onLoadStatus?.(null); }, 5000);
    } finally {
      setLoading(false);
    }
  }

  const label = value || "Auto-route";

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => open ? setOpen(false) : openDropdown()}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
        style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
        {loading
          ? <div className="w-3 h-3 border-2 border-current/40 border-t-current rounded-full animate-spin" />
          : <Cpu size={11} />}
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown size={10} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {loadMsg && !open && (
        <div className="absolute bottom-full mb-1 left-0 text-xs px-2 py-1 rounded whitespace-nowrap"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)", zIndex: 100 }}>
          {loadMsg}
        </div>
      )}

      {open && (
        <div
          ref={dropRef}
          style={{
            position: "fixed",
            top: dropPos.top,
            left: dropPos.left,
            width: dropPos.width,
            zIndex: 9999,
            transform: "translateY(-100%)",
            background: "var(--color-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            maxHeight: 320,
            overflowY: "auto",
          }}>
          <button
            onClick={() => selectModel("")}
            className="w-full text-left px-3 py-2 text-xs hover:opacity-80"
            style={{ background: !value ? "color-mix(in srgb, var(--color-accent) 15%, transparent)" : "transparent", color: "var(--color-foreground)" }}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--color-muted)" }} />
              <span>Auto-route (Supervisor)</span>
            </div>
          </button>
          {sorted.map(m => {
            const running = runningNames.has(m.name);
            return (
              <button
                key={`${m.name}:${m.name}`}
                onClick={() => void selectModel(m.name)}
                className="w-full text-left px-3 py-2 text-xs hover:opacity-80"
                style={{ background: value === m.name ? "color-mix(in srgb, var(--color-accent) 15%, transparent)" : "transparent", color: "var(--color-foreground)" }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: running ? "var(--color-success)" : "var(--color-border)" }} />
                  <span className="font-medium truncate">{m.name}</span>
                  {m.paramSize && <span className="ml-auto opacity-50 shrink-0">{m.paramSize}</span>}
                </div>
              </button>
            );
          })}
          {sorted.length === 0 && (
            <div className="px-3 py-2 text-xs" style={{ color: "var(--color-muted)" }}>
              No models installed — pull one in Models
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Workspace selector ────────────────────────────────────────────────────────

function WorkspaceSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["context-workspaces-chat"],
    queryFn: () => api.context.workspaces(),
    staleTime: 60_000,
  });
  const workspaces: ContextWorkspaceSummary[] = data?.workspaces ?? [];
  const selected = workspaces.find(w => w.rootPath === value);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs"
        style={{ background: "var(--color-elevated)", color: selected ? "var(--color-foreground)" : "var(--color-muted)", border: "1px solid var(--color-border)" }}>
        <FolderOpen size={11} style={{ color: selected ? "var(--color-accent)" : "var(--color-muted)" }} />
        <span className="max-w-[120px] truncate">{selected?.workspaceName ?? "No workspace"}</span>
        <ChevronDown size={10} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 left-0 z-50 rounded-lg overflow-hidden shadow-xl"
          style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", minWidth: 220 }}>
          <button
            onClick={() => { onChange(""); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-xs hover:opacity-80"
            style={{ background: !value ? "color-mix(in srgb, var(--color-accent) 15%, transparent)" : "transparent", color: "var(--color-foreground)" }}>
            No workspace scope
          </button>
          {workspaces.map(ws => (
            <button
              key={ws.rootPath}
              onClick={() => { onChange(ws.rootPath); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs hover:opacity-80"
              style={{ background: value === ws.rootPath ? "color-mix(in srgb, var(--color-accent) 15%, transparent)" : "transparent", color: "var(--color-foreground)" }}>
              <div className="font-medium">{ws.workspaceName}</div>
              <div className="opacity-50 font-mono truncate text-xs">{ws.rootPath}</div>
            </button>
          ))}
          {workspaces.length === 0 && (
            <div className="px-3 py-2 text-xs" style={{ color: "var(--color-muted)" }}>
              No indexed workspaces — index one in Workspace → Intelligence
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Session Sidebar (3.4) ─────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function SessionSidebar({
  currentSessionId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onBranchSession,
}: {
  currentSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onBranchSession: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sessionsQ = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: () => api.sessions.list(),
    staleTime: 5_000,
    refetchInterval: 15_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.sessions.delete(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["chat-sessions"] }),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) => api.sessions.bulkDelete(ids.length > 0 ? ids : undefined),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["chat-sessions"] }); setSelected(new Set()); },
  });

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.sessions.rename(id, name),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["chat-sessions"] }); setRenaming(null); },
  });

  const sessions = (sessionsQ.data?.sessions ?? []).filter(s => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return s.name.toLowerCase().includes(q) || (s.preview?.content ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col h-full"
      style={{ background: "var(--color-surface)", borderRight: "1px solid var(--color-border)" }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}>
        <span className="text-xs font-semibold flex-1" style={{ color: "var(--color-muted)" }}>CHATS</span>
        <button
          onClick={onNew}
          title="New chat"
          className="p-1.5 rounded-lg"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
          <Plus size={13} />
        </button>
        <button
          onClick={() => setBulkMenuOpen(o => !o)}
          title="More options"
          className="p-1.5 rounded-lg"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
          <MoreHorizontal size={13} />
        </button>
      </div>
      {bulkMenuOpen && (
        <div className="px-2 pb-2 flex flex-col gap-1" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <button
            onClick={() => { if (confirm("Delete ALL chats? This cannot be undone.")) { bulkDeleteMut.mutate([]); setBulkMenuOpen(false); } }}
            disabled={bulkDeleteMut.isPending}
            className="w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-2 disabled:opacity-40"
            style={{ background: "color-mix(in srgb, var(--color-error) 10%, transparent)", color: "var(--color-error)", border: "none" }}>
            <Trash2 size={11} /> Delete all chats
          </button>
          {selected.size > 0 && (
            <button
              onClick={() => { if (confirm(`Delete ${selected.size} selected chats?`)) { bulkDeleteMut.mutate([...selected]); setSelected(new Set()); setBulkMenuOpen(false); } }}
              disabled={bulkDeleteMut.isPending}
              className="w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-2 disabled:opacity-40"
              style={{ background: "color-mix(in srgb, var(--color-warn) 10%, transparent)", color: "var(--color-warn)", border: "none" }}>
              <Trash2 size={11} /> Delete {selected.size} selected
            </button>
          )}
          {selected.size > 0 && (
            <button
              onClick={() => { const id = [...selected][0]; if (id) window.open(api.sessions.exportUrl(id, "markdown"), "_blank"); }}
              className="w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-2"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "none" }}>
              <Download size={11} /> Export selected as Markdown
            </button>
          )}
          <button onClick={() => setSelected(new Set())} className="w-full text-left text-xs px-2 py-1.5 rounded"
            style={{ background: "none", color: "var(--color-muted)", border: "none" }}>
            Clear selection
          </button>
        </div>
      )}

      {/* Search */}
      <div className="px-3 py-2 shrink-0">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "var(--color-muted)" }} />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search…"
            className="w-full pl-6 pr-2 py-1 rounded text-xs outline-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
          />
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {sessionsQ.isLoading && (
          <div className="px-3 py-4 text-xs text-center" style={{ color: "var(--color-muted)" }}>
            <Loader2 size={13} className="animate-spin inline mr-1" /> Loading…
          </div>
        )}
        {sessions.length === 0 && !sessionsQ.isLoading && (
          <div className="px-3 py-4 text-xs text-center" style={{ color: "var(--color-muted)" }}>
            {filter ? "No matches" : "No sessions yet"}
          </div>
        )}
        {sessions.map(s => (
          <div
            key={s.id}
            className="relative group"
            onMouseLeave={() => setMenuFor(null)}>
            {renaming?.id === s.id ? (
              <form
                onSubmit={e => { e.preventDefault(); renameMut.mutate({ id: s.id, name: renaming.name }); }}
                className="px-2 py-1.5">
                <input
                  autoFocus
                  value={renaming.name}
                  onChange={e => setRenaming({ id: s.id, name: e.target.value })}
                  onBlur={() => renameMut.mutate({ id: s.id, name: renaming.name })}
                  onKeyDown={e => { if (e.key === "Escape") setRenaming(null); }}
                  className="w-full px-2 py-1 rounded text-xs outline-none"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-accent)", color: "var(--color-foreground)" }}
                />
              </form>
            ) : (
              <button
                onClick={() => onSelect(s.id)}
                className="w-full text-left px-3 py-2.5 text-xs transition-colors"
                style={{
                  background: currentSessionId === s.id
                    ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
                    : "transparent",
                  borderLeft: currentSessionId === s.id
                    ? "2px solid var(--color-accent)"
                    : "2px solid transparent",
                }}>
                <div className="flex items-center gap-1">
                  <span className="flex-1 truncate font-medium" style={{ color: "var(--color-foreground)" }}>
                    {s.name}
                  </span>
                  <span className="shrink-0 text-xs" style={{ color: "var(--color-muted)", fontSize: 10 }}>
                    {relativeTime(s.updatedAt)}
                  </span>
                </div>
                {s.preview && (
                  <div className="mt-0.5 truncate" style={{ color: "var(--color-muted)", fontSize: 11 }}>
                    {s.preview.role === "assistant" ? "AI: " : ""}{s.preview.content}
                  </div>
                )}
              </button>
            )}

            {/* Context menu trigger */}
            <button
              onClick={e => { e.stopPropagation(); setMenuFor(menuFor === s.id ? null : s.id); }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: "var(--color-muted)", background: "var(--color-elevated)" }}>
              <MoreVertical size={11} />
            </button>

            {/* Context menu */}
            {menuFor === s.id && (
              <div className="absolute right-2 top-0 z-50 rounded-lg shadow-xl overflow-hidden min-w-[130px]"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", top: "100%" }}>
                <button
                  onClick={() => { setRenaming({ id: s.id, name: s.name }); setMenuFor(null); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                  style={{ color: "var(--color-foreground)" }}>
                  <Edit2 size={10} /> Rename
                </button>
                <button
                  onClick={() => { onBranchSession(s.id); setMenuFor(null); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                  style={{ color: "var(--color-foreground)" }}>
                  <GitFork size={10} /> Branch
                </button>
                <button
                  onClick={() => { if (confirm("Delete this chat?")) { deleteMut.mutate(s.id); } setMenuFor(null); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                  style={{ color: "var(--color-error)" }}>
                  <Trash2 size={10} /> Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({
  workspacePath, useCodeContext, setInput, setWorkspacePath, textareaRef, navigate,
}: {
  workspacePath: string; useCodeContext: boolean;
  setInput: (v: string) => void; setWorkspacePath: (v: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>; navigate: (path: string) => void;
}) {
  const contextQ = useQuery({ queryKey: ["context-workspaces-chat"], queryFn: () => api.context.workspaces(), staleTime: 60_000 });
  const chatModelsQ = useQuery({ queryKey: ["chatModels"], queryFn: () => api.chat.chatModels(), staleTime: 30_000 });
  const workspaces: ContextWorkspaceSummary[] = contextQ.data?.workspaces ?? [];
  const installedModels = chatModelsQ.data?.models ?? [];
  const hasWorkspace = workspacePath && workspaces.some(w => w.rootPath === workspacePath);

  const hints = hasWorkspace
    ? [
        `Explain the architecture of ${workspaces.find(w => w.rootPath === workspacePath)?.workspaceName ?? "this project"}`,
        "Find all exported functions and describe what they do",
        "List all API routes in this project",
        "Write a TypeScript utility function based on the existing patterns here",
      ]
    : [
        "Write a TypeScript API endpoint",
        "List running Docker containers",
        "Explain VRAM guard modes",
        "Diagnose why a Node.js script fails",
        "/hardware — show system hardware",
      ];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
      <div className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{ background: "color-mix(in srgb, var(--color-accent) 15%, transparent)" }}>
        <Bot size={24} style={{ color: "var(--color-accent)" }} />
      </div>
      <div>
        <div className="font-semibold text-base" style={{ color: "var(--color-foreground)" }}>Sovereign AI ready</div>
        <div className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          {hasWorkspace
            ? <>Code context active · <span className="font-medium">{workspaces.find(w => w.rootPath === workspacePath)?.workspaceName}</span></>
            : <>Select a workspace above or ask any question. Try <code className="text-xs px-1 rounded" style={{ background: "var(--color-elevated)" }}>/help</code> for slash commands.</>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 justify-center mt-1">
        {hints.map(hint => (
          <button key={hint}
            onClick={() => { setInput(hint); textareaRef.current?.focus(); }}
            className="text-xs px-3 py-1.5 rounded-lg text-left"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
            {hint}
          </button>
        ))}
      </div>
      {!hasWorkspace && workspaces.length > 0 && (
        <div className="mt-2">
          <div className="text-xs mb-2" style={{ color: "var(--color-muted)" }}>Activate a workspace:</div>
          <div className="flex flex-wrap gap-2 justify-center">
            {workspaces.slice(0, 4).map(ws => (
              <button key={ws.rootPath} onClick={() => setWorkspacePath(ws.rootPath)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                style={{ background: "color-mix(in srgb, var(--color-accent) 10%, var(--color-elevated))", color: "var(--color-foreground)", border: "1px solid color-mix(in srgb, var(--color-accent) 20%, var(--color-border))" }}>
                <Database size={11} style={{ color: "var(--color-accent)" }} />
                {ws.workspaceName}
                <span className="opacity-50">{ws.fileCount}f</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {workspaces.length === 0 && (
        <button onClick={() => navigate("/workspace")}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg mt-1"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
          <Brain size={11} /> Index a workspace first → Workspace → Intelligence
        </button>
      )}
      {/* Installed model chips */}
      {installedModels.length > 0 && (
        <div className="mt-3 flex flex-col items-center gap-1.5">
          <div className="text-xs" style={{ color: "var(--color-muted)" }}>Installed models</div>
          <div className="flex flex-wrap gap-1.5 justify-center max-w-lg">
            {installedModels.map(m => (
              <span key={m.name} className="text-xs px-2.5 py-1 rounded-full font-mono"
                style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
                {m.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pinboard rail (8.4) ───────────────────────────────────────────────────────

function PinboardRail({ sessionId }: { sessionId: string | null }) {
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding]       = useState(false);
  const [newNote, setNewNote]     = useState("");
  const qc = useQueryClient();

  const itemsQ = useQuery({
    queryKey: ["pinboard"],
    queryFn:  () => api.pinboard.list(),
    staleTime: 15_000,
  });

  const addMut = useMutation({
    mutationFn: (content: string) =>
      api.pinboard.add({ kind: "text", title: content.slice(0, 40), content }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["pinboard"] }); setNewNote(""); setAdding(false); },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.pinboard.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pinboard"] }),
  });

  const items: PinboardItem[] = itemsQ.data?.items ?? [];

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-3 shrink-0"
        style={{ width: 32, borderRight: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
        <button onClick={() => setCollapsed(false)} title="Open Pinboard"
          style={{ color: "var(--color-muted)" }}>
          <Pin size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col shrink-0"
      style={{ width: 220, borderRight: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
      <div className="flex items-center gap-1.5 px-3 py-2.5 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}>
        <Pin size={12} style={{ color: "var(--color-accent)" }} />
        <span className="text-xs font-semibold flex-1" style={{ color: "var(--color-muted)" }}>PINBOARD</span>
        <button onClick={() => setAdding(a => !a)} title="Add pin"
          className="p-1 rounded" style={{ color: "var(--color-muted)" }}>
          <Plus size={12} />
        </button>
        <button onClick={() => setCollapsed(true)} title="Collapse"
          className="p-1 rounded" style={{ color: "var(--color-muted)" }}>
          <PanelRight size={12} />
        </button>
      </div>

      {adding && (
        <div className="px-3 py-2 shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <textarea
            autoFocus
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            placeholder="Note or snippet…"
            rows={3}
            className="w-full text-xs p-2 rounded outline-none resize-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
          />
          <div className="flex gap-1.5 mt-1">
            <button
              onClick={() => addMut.mutate(newNote)}
              disabled={!newNote.trim() || addMut.isPending}
              className="flex-1 text-xs py-1 rounded font-medium disabled:opacity-50"
              style={{ background: "var(--color-accent)", color: "#fff" }}>
              Pin
            </button>
            <button onClick={() => { setAdding(false); setNewNote(""); }}
              className="text-xs px-2 py-1 rounded"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {items.length === 0 && (
          <p className="text-xs px-3 py-3" style={{ color: "var(--color-muted)" }}>No pins yet.</p>
        )}
        {items.map(item => (
          <div key={item.id} className="group relative px-3 py-2 text-xs"
            style={{ borderBottom: "1px solid color-mix(in srgb, var(--color-border) 50%, transparent)" }}>
            <div className="font-medium truncate mb-0.5" style={{ color: "var(--color-foreground)" }}>{item.title}</div>
            <div className="line-clamp-2 text-xs" style={{ color: "var(--color-muted)" }}>{item.content}</div>
            <button
              onClick={() => delMut.mutate(item.id)}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
              style={{ color: "var(--color-muted)" }}>
              <X size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Token budget bar (8.12) ───────────────────────────────────────────────────

function TokenBudgetBar({ sessionId, messages }: { sessionId: string; messages: Array<{ role: string; content: string }> }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");

  const budgetQ = useQuery({
    queryKey: ["token-budget", sessionId],
    queryFn:  () => api.tokenBudget.get(sessionId),
    staleTime: 10_000,
  });

  const setMut = useMutation({
    mutationFn: (tokens: number) => api.tokenBudget.set(sessionId, tokens),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ["token-budget", sessionId] }); setEditing(false); },
  });

  const summarizeMut = useMutation({
    mutationFn: () => api.tokenBudget.summarize(sessionId, messages),
    onSuccess:  () => void qc.invalidateQueries({ queryKey: ["token-budget", sessionId] }),
  });

  const budget: TokenBudget | null = budgetQ.data?.budget ?? null;
  const pct = budget ? Math.min(100, Math.round((budget.usedTokens / budget.budgetTokens) * 100)) : 0;
  const over = budget && budget.usedTokens > budget.budgetTokens;

  if (!budget && !budgetQ.isLoading) return null;
  if (!budget) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-xs shrink-0"
      style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
      <Gauge size={11} style={{ color: over ? "var(--color-error)" : "var(--color-muted)" }} />
      <span style={{ color: "var(--color-muted)" }}>Token budget:</span>
      <div className="flex items-center gap-1">
        <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-elevated)" }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: over ? "var(--color-error)" : "var(--color-accent)" }} />
        </div>
        <span style={{ color: over ? "var(--color-error)" : "var(--color-muted)" }}>
          {budget.usedTokens}/{budget.budgetTokens}
        </span>
      </div>
      {over && (
        <button
          onClick={() => summarizeMut.mutate()}
          disabled={summarizeMut.isPending}
          className="flex items-center gap-1 px-2 py-0.5 rounded font-medium disabled:opacity-50"
          style={{ background: "color-mix(in srgb, var(--color-warn) 15%, transparent)", color: "var(--color-warn)", border: "1px solid color-mix(in srgb, var(--color-warn) 30%, transparent)" }}>
          {summarizeMut.isPending ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
          Summarize
        </button>
      )}
      {editing ? (
        <form onSubmit={e => { e.preventDefault(); setMut.mutate(Number(budgetInput)); }}
          className="flex items-center gap-1 ml-auto">
          <input
            autoFocus value={budgetInput}
            onChange={e => setBudgetInput(e.target.value)}
            type="number" min="500" max="200000"
            className="w-20 px-1.5 py-0.5 rounded text-xs outline-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
          />
          <button type="submit" className="text-xs px-2 py-0.5 rounded"
            style={{ background: "var(--color-accent)", color: "#fff" }}>Set</button>
          <button type="button" onClick={() => setEditing(false)}
            style={{ color: "var(--color-muted)" }}><X size={11} /></button>
        </form>
      ) : (
        <button onClick={() => { setBudgetInput(String(budget.budgetTokens)); setEditing(true); }}
          className="ml-auto text-xs px-2 py-0.5 rounded"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
          Edit
        </button>
      )}
    </div>
  );
}

// ── Conversation tree modal (8.2) ─────────────────────────────────────────────

function ConversationTreeModal({ currentSessionId, onSelect, onClose }: {
  currentSessionId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const sessionsQ = useQuery({
    queryKey: ["chat-sessions"],
    queryFn:  () => api.sessions.list(),
    staleTime: 10_000,
  });

  const sessions = sessionsQ.data?.sessions ?? [];

  // Lay out sessions as a horizontal timeline — no parent info stored so flat grid
  const W = 700, H = Math.max(200, Math.ceil(sessions.length / 4) * 90 + 40);
  const cols = 4;
  const nodes = sessions.map((s, i) => ({
    ...s,
    x: 60 + (i % cols) * 165,
    y: 40 + Math.floor(i / cols) * 85,
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}>
      <div className="rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", maxWidth: 780, width: "90vw" }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <GitBranch size={14} style={{ color: "var(--color-accent)" }} />
          <span className="font-semibold text-sm" style={{ color: "var(--color-foreground)" }}>Conversation Tree</span>
          <button onClick={onClose} className="ml-auto" style={{ color: "var(--color-muted)" }}><X size={14} /></button>
        </div>
        <div className="p-4 overflow-auto" style={{ maxHeight: "70vh" }}>
          {sessionsQ.isLoading && (
            <div className="flex items-center gap-2 py-8 justify-center text-sm" style={{ color: "var(--color-muted)" }}>
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          )}
          {!sessionsQ.isLoading && (
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", minHeight: 200 }}>
              {nodes.map((node, i) => {
                const isActive = node.id === currentSessionId;
                // Draw connector to previous node if same row (simple visual)
                const prev = nodes[i - 1];
                const sameLine = prev && Math.floor(i / cols) === Math.floor((i - 1) / cols);
                return (
                  <g key={node.id}>
                    {sameLine && (
                      <line x1={prev.x + 70} y1={prev.y + 20} x2={node.x} y2={node.y + 20}
                        stroke="var(--color-border)" strokeWidth={1.5} strokeDasharray="4,3" />
                    )}
                    <rect x={node.x} y={node.y} width={150} height={55} rx={10}
                      fill={isActive ? "color-mix(in srgb, var(--color-accent) 18%, var(--color-elevated))" : "var(--color-elevated)"}
                      stroke={isActive ? "var(--color-accent)" : "var(--color-border)"}
                      strokeWidth={isActive ? 2 : 1}
                      style={{ cursor: "pointer" }}
                      onClick={() => { onSelect(node.id); onClose(); }}
                    />
                    <text x={node.x + 10} y={node.y + 20} fontSize={11} fontWeight="600"
                      fill={isActive ? "var(--color-accent)" : "var(--color-foreground)"}
                      style={{ pointerEvents: "none" }}>
                      {node.name.length > 18 ? node.name.slice(0, 16) + "…" : node.name}
                    </text>
                    <text x={node.x + 10} y={node.y + 36} fontSize={9}
                      fill="var(--color-muted)" style={{ pointerEvents: "none" }}>
                      {new Date(node.updatedAt).toLocaleDateString()}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
          {!sessionsQ.isLoading && sessions.length === 0 && (
            <p className="text-sm py-8 text-center" style={{ color: "var(--color-muted)" }}>No sessions yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Chat page ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const {
    messages, setMessages, input, setInput, model, setModel,
    workspacePath, setWorkspacePath, useCodeContext, setUseCodeContext,
    sessionId, sessionLoading, sidebarOpen, setSidebarOpen,
    streaming, error, setError, modelLoadStatus, setModelLoadStatus,
    modelLoading, pendingActions, setPendingActions, toast, setToast,
    showTree, setShowTree, attachedImages, setAttachedImages,
    attachedFiles, setAttachedFiles,
    recording, sttError, setSttError, startRecording, stopRecording,
    handleScreenshot, dragOver, handleDragOver, handleDragLeave, handleDrop,
    handleImageFiles, handleTextFiles, handleFolderSelect,
    bottomRef, textareaRef, navigate, ollamaOffline, settings,
    handleNewChat, handleSelectSession, handleBranchSession, handleBranchFromMessage,
    handleApplyToFile, handlePipeToNewChat, handleRenameSession, handleDeleteSession,
    send, handleApproveAction, handleRejectAction,
  } = useChatState();

  // ── Quick action chips ──────────────────────────────────────────────────────

  const quickActions: Array<{ label: string; icon: React.ElementType; prompt: string }> = [
    { label: "Refactor plan",   icon: Brain,     prompt: "Plan a refactor for the current workspace" },
    { label: "Search context",  icon: Search,    prompt: "Search the codebase for the main entry points" },
    { label: "Explain arch",    icon: FolderOpen,prompt: "Explain the high-level architecture of this project" },
    { label: "Run diagnostics", icon: Wrench,    prompt: "/status" },
    { label: "Hardware",        icon: Cpu,       prompt: "/hardware" },
  ];

  return (
    <div className="flex flex-col h-screen">
      {/* Ollama offline banner */}
      {ollamaOffline && (
        <div className="flex items-center justify-between px-4 py-2 text-sm font-medium shrink-0"
          style={{
            background: "color-mix(in srgb, #f59e0b 12%, transparent)",
            borderBottom: "1px solid color-mix(in srgb, #f59e0b 30%, transparent)",
            color: "#f59e0b",
          }}>
          <span>Ollama is not running — chat is unavailable. Start it with: <code className="font-mono">ollama serve</code></span>
          <button
            onClick={() => navigator.clipboard.writeText("ollama serve")}
            className="ml-4 px-2 py-0.5 rounded text-xs font-mono"
            style={{ background: "color-mix(in srgb, #f59e0b 20%, transparent)", border: "1px solid color-mix(in srgb, #f59e0b 40%, transparent)" }}>
            Copy
          </button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            className="p-1.5 rounded-lg"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
            <PanelLeft size={14} />
          </button>
          <div>
            <h1 className="font-bold text-lg" style={{ color: "var(--color-foreground)" }}>Omni-Chat</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
              Supervisor Agent · auto-routes to the best model
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pendingActions.length > 0 && (
            <div className="text-xs px-2 py-1 rounded-lg flex items-center gap-1"
              style={{ background: "color-mix(in srgb, var(--color-warn) 12%, transparent)", color: "var(--color-warn)", border: "1px solid color-mix(in srgb, var(--color-warn) 25%, transparent)" }}>
              <Layers size={11} /> {pendingActions.length} pending
            </div>
          )}
          <button
            onClick={() => setShowTree(t => !t)}
            title="Conversation tree"
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
            <GitBranch size={12} /> Tree
          </button>
          <button
            onClick={() => void handleNewChat()}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
            New Chat
          </button>
          <button
            onClick={() => { setMessages([]); setError(null); setPendingActions([]); }}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
            Clear
          </button>
        </div>
      </div>

      {/* Main area: sidebar + messages + right panel */}
      <div className="flex flex-1 overflow-hidden">

        {/* Session sidebar (3.4) */}
        {sidebarOpen && (
          <div style={{ width: 260, flexShrink: 0 }}>
            <SessionSidebar
              currentSessionId={sessionId}
              onSelect={handleSelectSession}
              onNew={() => void handleNewChat()}
              onRename={(id, name) => void handleRenameSession(id, name)}
              onDelete={(id) => void handleDeleteSession(id)}
              onBranchSession={(id) => void handleBranchSession(id)}
            />
          </div>
        )}

        {/* Pinboard rail (8.4) */}
        <PinboardRail sessionId={sessionId} />

        {/* Messages pane */}
        <div
          className="flex-1 flex flex-col overflow-hidden"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{ position: "relative" }}>
          {/* Token budget bar (8.12) — only when a session is active */}
          {sessionId && <TokenBudgetBar sessionId={sessionId} messages={messages.map(m => ({ role: m.role, content: m.content }))} />}

          {dragOver && (
            <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
              style={{ background: "color-mix(in srgb, var(--color-accent) 10%, transparent)", border: "2px dashed var(--color-accent)" }}>
              <div className="text-sm font-medium" style={{ color: "var(--color-accent)" }}>Drop image or file to attach</div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {sessionLoading && (
              <div className="flex items-center justify-center h-full">
                <Loader2 size={24} className="animate-spin" style={{ color: "var(--color-muted)" }} />
              </div>
            )}
            {!sessionLoading && messages.length === 0 && (
              <EmptyState
                workspacePath={workspacePath}
                useCodeContext={useCodeContext}
                setInput={setInput}
                setWorkspacePath={setWorkspacePath}
                textareaRef={textareaRef}
                navigate={navigate}
              />
            )}
            <MessageList
              messages={messages}
              error={error}
              bottomRef={bottomRef}
              onBranch={handleBranchFromMessage}
              onApplyToFile={handleApplyToFile}
              onPipeToNewChat={handlePipeToNewChat}
            />
          </div>

          {/* Quick actions */}
          {messages.length === 0 && (
            <div className="shrink-0 px-6 pb-2">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {quickActions.map((a) => (
                  <button key={a.label}
                    onClick={() => { setInput(a.prompt); textareaRef.current?.focus(); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0"
                    style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
                    <a.icon size={11} />
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Attached image thumbnails preview */}
          {attachedImages.length > 0 && (
            <div className="shrink-0 px-6 pb-1 flex gap-2 flex-wrap">
              {attachedImages.map((img, i) => (
                <div key={i} className="relative">
                  <img src={img.dataUrl} alt={img.name} className="h-14 w-14 rounded-lg object-cover"
                    style={{ border: "1px solid var(--color-border)" }} />
                  <button
                    onClick={() => setAttachedImages(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-xs"
                    style={{ background: "var(--color-error)", color: "#fff" }}>
                    <X size={9} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Attached file chips */}
          {attachedFiles.length > 0 && (
            <div className="shrink-0 px-6 pb-1 flex gap-2 flex-wrap">
              {attachedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
                  <FileCode size={10} />
                  <span>{f.name}</span>
                  {f.isBinary && <span style={{ color: "var(--color-warn)" }}>(binary)</span>}
                  <button onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))} style={{ color: "var(--color-muted)" }}>
                    <X size={9} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input area */}
          <ChatInput
            input={input}
            onChange={setInput}
            onSend={() => void send()}
            streaming={streaming}
            modelLoading={modelLoading}
            modelLoadStatus={modelLoadStatus}
            hasAttachments={attachedImages.length > 0}
            textareaRef={textareaRef}
            modelSelector={<ModelSelector value={model} onChange={setModel} onLoadStatus={setModelLoadStatus} />}
            workspaceSelector={<WorkspaceSelector value={workspacePath} onChange={setWorkspacePath} />}
            workspacePath={workspacePath}
            useCodeContext={useCodeContext}
            onToggleCodeContext={() => setUseCodeContext(c => !c)}
            onImageFiles={handleImageFiles}
            onTextFiles={handleTextFiles}
            onFolderSelect={handleFolderSelect}
            recording={recording}
            onStartRecording={() => void startRecording()}
            onStopRecording={stopRecording}
            onScreenshot={() => void handleScreenshot()}
            sttError={sttError}
            onClearSttError={() => setSttError(null)}
          />
        </div>

        {/* Agent Action Panel (2.2) — slides in when actions are pending */}
        <AgentActionPanel
          actions={pendingActions}
          settings={settings}
          onApprove={(action, editedValue) => void handleApproveAction(action, editedValue)}
          onReject={handleRejectAction}
        />
      </div>

      {/* Conversation tree modal (8.2) */}
      {showTree && (
        <ConversationTreeModal
          currentSessionId={sessionId}
          onSelect={handleSelectSession}
          onClose={() => setShowTree(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          onDismiss={() => setToast(null)}
          onAction={toast.onAction}
          actionLabel={toast.actionLabel}
        />
      )}
    </div>
  );
}
