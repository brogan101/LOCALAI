import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type ChangeEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Send, Bot, User, Cpu, Code2, Wrench, Eye, Sparkles,
  ChevronDown, ChevronRight, AlertCircle, FileCode,
  Database, ToggleLeft, ToggleRight, Search, Brain,
  FolderOpen, Play, Image, Paperclip, X, Terminal,
  CheckCircle, XCircle, RotateCcw, Loader2, FileDiff,
  Layers, GitBranch, Plus, PanelLeft, MoreVertical,
  Copy, Edit2, Trash2, GitFork, Check,
} from "lucide-react";
import api, {
  type ChatMessage, type SupervisorInfo, type ContextWorkspaceSummary,
  type AppSettings, type SelfHealResult, type RefactorPlan, type RefactorJob,
  type RefactorStep, type ChatSession,
} from "../api.js";
import { useLocation, useSearch } from "wouter";

// ── Agent Action types (mirror backend) ───────────────────────────────────────

type AgentActionType = "propose_edit" | "propose_command" | "propose_self_heal" | "propose_refactor";

interface AgentAction {
  id: string;
  type: AgentActionType;
  filePath?: string;
  newContent?: string;
  command?: string;
  cwd?: string;
  workspacePath?: string;
  request?: string;
  maxAttempts?: number;
  rationale: string;
}

// ── Attached image type ───────────────────────────────────────────────────────

interface AttachedImage {
  dataUrl: string;   // full data URL for thumbnail display
  base64: string;    // stripped base64 for API
  name: string;
}

// ── Attached file type ────────────────────────────────────────────────────────

interface AttachedFile {
  name: string;
  content: string;   // text content
  isBinary: boolean;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContextFile {
  path: string;
  relativePath: string;
  score: number;
  matchedSymbols: string[];
}

interface ContextMeta {
  workspaceName?: string;
  workspacePath?: string;
  fileCount?: number;
  sectionCount?: number;
  files?: ContextFile[];
}

interface StreamChunk {
  token?: string;
  done?: boolean;
  model?: string;
  supervisor?: SupervisorInfo;
  route?: unknown;
  switched?: boolean;
  context?: ContextMeta;
  error?: string;
  agentAction?: AgentAction;
}

interface Message {
  id?: string;         // DB message id (set after persist, used for branching)
  role: "user" | "assistant";
  content: string;
  supervisor?: SupervisorInfo;
  model?: string;
  streaming?: boolean;
  context?: ContextMeta;
  images?: string[];   // base64 thumbnails for display
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function agentIcon(category?: string) {
  switch (category) {
    case "coding":   return <Code2 size={13} />;
    case "hardware": return <Cpu size={13} />;
    case "sysadmin": return <Wrench size={13} />;
    case "vision":   return <Eye size={13} />;
    default:         return <Sparkles size={13} />;
  }
}

function agentColor(category?: string): string {
  switch (category) {
    case "coding":   return "var(--color-info)";
    case "hardware": return "var(--color-success)";
    case "sysadmin": return "var(--color-warn)";
    case "vision":   return "#a855f7";
    default:         return "var(--color-accent)";
  }
}

function agentName(category?: string): string {
  switch (category) {
    case "coding":   return "Sovereign Coder";
    case "hardware": return "Sovereign Hardware";
    case "sysadmin": return "Sovereign SysAdmin";
    case "vision":   return "Sovereign Vision";
    default:         return "Sovereign";
  }
}

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

// ── Context panel ─────────────────────────────────────────────────────────────

function ContextPanel({ ctx }: { ctx: ContextMeta }) {
  const [open, setOpen] = useState(false);
  if (!ctx.files || ctx.files.length === 0) return null;
  return (
    <div className="mt-1.5 rounded-lg overflow-hidden text-xs"
      style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-left"
        style={{ color: "var(--color-muted)" }}>
        <FileCode size={11} style={{ color: "var(--color-info)" }} />
        <span style={{ color: "var(--color-info)" }}>
          {ctx.files.length} file{ctx.files.length !== 1 ? "s" : ""} in context
        </span>
        {ctx.workspaceName && (
          <span className="opacity-60 ml-1">· {ctx.workspaceName}</span>
        )}
        <span className="ml-auto">
          {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </span>
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--color-border)" }}>
          {ctx.files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5"
              style={{ borderBottom: i < ctx.files!.length - 1 ? "1px solid var(--color-border)" : undefined }}>
              <FileCode size={10} style={{ color: "var(--color-muted)", flexShrink: 0 }} />
              <span className="font-mono truncate flex-1" style={{ color: "var(--color-foreground)" }}>
                {f.relativePath}
              </span>
              {f.matchedSymbols.length > 0 && (
                <span className="opacity-60 shrink-0 truncate max-w-[120px]">
                  {f.matchedSymbols.slice(0, 3).join(", ")}
                </span>
              )}
              <span className="shrink-0 px-1 rounded"
                style={{ background: "color-mix(in srgb, var(--color-info) 12%, transparent)", color: "var(--color-info)" }}>
                {f.score.toFixed(0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Thinking indicator ────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map(i => (
        <div key={i} className="w-1.5 h-1.5 rounded-full thinking-dot"
          style={{ background: "var(--color-muted)", animationDelay: `${i * 0.2}s` }} />
      ))}
    </div>
  );
}

// ── Agent Reasoning drawer (2.4) ──────────────────────────────────────────────

function AgentReasoningDrawer({ supervisor, model }: { supervisor: SupervisorInfo; model?: string }) {
  const [open, setOpen] = useState(false);
  const color = agentColor(supervisor.category);
  return (
    <div className="mt-1.5 rounded-lg text-xs overflow-hidden"
      style={{ border: "1px solid var(--color-border)", background: "var(--color-elevated)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-left"
        style={{ color: "var(--color-muted)" }}>
        <Brain size={10} style={{ color }} />
        <span style={{ color }}>Agent reasoning</span>
        {supervisor.confidence !== undefined && (
          <span className="ml-1 px-1 rounded"
            style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
            {Math.round(supervisor.confidence * 100)}%
          </span>
        )}
        <span className="ml-auto">{open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}</span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 space-y-1.5" style={{ borderTop: "1px solid var(--color-border)" }}>
          <div className="flex items-center gap-2 pt-1.5">
            {agentIcon(supervisor.category)}
            <span style={{ color }} className="font-medium capitalize">{supervisor.category ?? "general"}</span>
            {model && <span className="opacity-50 font-mono">{model}</span>}
          </div>
          {supervisor.goal && (
            <div style={{ color: "var(--color-foreground)" }}>
              <span className="opacity-50">Goal: </span>{supervisor.goal}
            </div>
          )}
          {supervisor.steps && supervisor.steps.length > 0 && (
            <div className="space-y-0.5">
              {supervisor.steps.map((step, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="opacity-40">{i + 1}.</span>
                  <span style={{ color: "var(--color-muted)" }}>{step}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Code-block renderer with copy + Apply-to-file (3.7) ──────────────────────

interface CodeBlock {
  lang: string;
  filePath: string | null;  // extracted from fence info string if it contains a path
  code: string;
}

function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const pattern = /```([^\n]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    const infoStr = (m[1] ?? "").trim();
    // Detect file path: info string contains a slash or backslash or ends with extension
    const filePath = /[/\\]|^\S+\.\w+$/.test(infoStr) ? infoStr : null;
    blocks.push({ lang: filePath ? "" : infoStr, filePath, code: m[2] ?? "" });
  }
  return blocks;
}

function CopyButton({ text, small = false }: { text: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button
      onClick={copy}
      title="Copy code"
      className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors"
      style={{
        background: copied ? "color-mix(in srgb, var(--color-success) 15%, transparent)" : "var(--color-elevated)",
        color: copied ? "var(--color-success)" : "var(--color-muted)",
        border: `1px solid ${copied ? "color-mix(in srgb, var(--color-success) 30%, transparent)" : "var(--color-border)"}`,
      }}>
      {copied ? <Check size={small ? 9 : 11} /> : <Copy size={small ? 9 : 11} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function RenderedContent({
  content,
  streaming,
  onApplyToFile,
}: {
  content: string;
  streaming?: boolean;
  onApplyToFile?: (filePath: string) => void;
}) {
  // Split content on code fences, render fences with toolbar
  const parts = content.split(/(```[^\n]*\n[\s\S]*?```)/g);

  return (
    <div className="text-sm leading-relaxed break-words">
      {parts.map((part, i) => {
        const fenceMatch = /^```([^\n]*)\n([\s\S]*?)```$/.exec(part);
        if (fenceMatch) {
          const infoStr = (fenceMatch[1] ?? "").trim();
          const code = fenceMatch[2] ?? "";
          const isFilePath = /[/\\]|^\S+\.\w{1,6}$/.test(infoStr);
          const filePath = isFilePath ? infoStr : null;
          const lang = filePath ? filePath.split(".").pop() ?? "" : infoStr;
          return (
            <div key={i} className="my-2 rounded-lg overflow-hidden"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
              {/* toolbar */}
              <div className="flex items-center gap-2 px-3 py-1.5"
                style={{ borderBottom: "1px solid var(--color-border)" }}>
                <span className="text-xs font-mono flex-1" style={{ color: "var(--color-muted)" }}>
                  {filePath ?? lang}
                </span>
                <CopyButton text={code} small />
                {filePath && onApplyToFile && (
                  <button
                    onClick={() => onApplyToFile(filePath)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                    style={{ background: "color-mix(in srgb, var(--color-accent) 12%, transparent)", color: "var(--color-accent)", border: "1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)" }}>
                    <Terminal size={9} /> Ask AI to apply to {filePath.split("/").pop()?.split("\\").pop()}
                  </button>
                )}
              </div>
              <pre className="px-3 py-2.5 overflow-x-auto text-xs whitespace-pre"
                style={{ color: "var(--color-foreground)", fontFamily: "monospace", lineHeight: 1.6, margin: 0 }}>
                {code}
              </pre>
            </div>
          );
        }
        // Plain text — render with whitespace preserved
        return (
          <span key={i} className="whitespace-pre-wrap">{part}</span>
        );
      })}
      {streaming && content && (
        <span className="inline-block w-0.5 h-4 ml-0.5 animate-pulse align-middle"
          style={{ background: "var(--color-accent)" }} />
      )}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  onBranch,
  onApplyToFile,
}: {
  msg: Message;
  onBranch?: (id: string) => void;
  onApplyToFile?: (filePath: string) => void;
}) {
  const isUser = msg.role === "user";
  const color = agentColor(msg.supervisor?.category);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} mb-4 group`}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{
          background: isUser
            ? "color-mix(in srgb, var(--color-accent) 20%, transparent)"
            : `color-mix(in srgb, ${color} 20%, transparent)`,
        }}>
        {isUser
          ? <User size={15} style={{ color: "var(--color-accent)" }} />
          : <Bot size={15} style={{ color }} />
        }
      </div>

      <div className={`flex flex-col max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        {!isUser && msg.supervisor && (
          <div className="flex items-center gap-1.5 mb-1 text-xs" style={{ color }}>
            {agentIcon(msg.supervisor.category)}
            <span className="font-medium">{agentName(msg.supervisor.category)}</span>
            {msg.supervisor.toolset && <span className="opacity-60">· {msg.supervisor.toolset}</span>}
            {msg.model && (
              <span className="ml-1 px-1.5 py-0 rounded text-xs"
                style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
                {msg.model}
              </span>
            )}
          </div>
        )}

        {/* Image thumbnails in user bubble */}
        {isUser && msg.images && msg.images.length > 0 && (
          <div className="flex gap-1.5 mb-1.5 flex-wrap justify-end">
            {msg.images.map((src, i) => (
              <img key={i} src={src} alt="" className="h-16 w-16 rounded-lg object-cover"
                style={{ border: "1px solid var(--color-border)" }} />
            ))}
          </div>
        )}

        <div className="rounded-xl px-4 py-2.5"
          style={{
            background: isUser
              ? "color-mix(in srgb, var(--color-accent) 20%, transparent)"
              : "var(--color-surface)",
            color: "var(--color-foreground)",
            border: `1px solid ${isUser
              ? "color-mix(in srgb, var(--color-accent) 30%, transparent)"
              : "var(--color-border)"}`,
            borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
          }}>
          {msg.streaming && !msg.content
            ? <ThinkingDots />
            : <RenderedContent
                content={msg.content}
                streaming={msg.streaming}
                onApplyToFile={!isUser ? onApplyToFile : undefined}
              />
          }
        </div>

        {/* Agent reasoning drawer — below assistant bubble when finished */}
        {!isUser && msg.supervisor && !msg.streaming && (
          <AgentReasoningDrawer supervisor={msg.supervisor} model={msg.model} />
        )}

        {!isUser && msg.context && !msg.streaming && (
          <ContextPanel ctx={msg.context} />
        )}

        {/* Kebab menu — assistant messages only, after streaming */}
        {!isUser && !msg.streaming && (
          <div className="relative mt-1 opacity-0 group-hover:opacity-100 transition-opacity" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="p-1 rounded"
              style={{ color: "var(--color-muted)" }}>
              <MoreVertical size={13} />
            </button>
            {menuOpen && (
              <div className="absolute left-0 top-6 z-30 rounded-lg shadow-lg overflow-hidden min-w-[140px]"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                <button
                  onClick={() => { void navigator.clipboard.writeText(msg.content); setMenuOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-[color-mix(in_srgb,var(--color-border)_50%,transparent)]"
                  style={{ color: "var(--color-foreground)" }}>
                  <Copy size={11} /> Copy reply
                </button>
                {msg.id && onBranch && (
                  <button
                    onClick={() => { onBranch(msg.id!); setMenuOpen(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-[color-mix(in_srgb,var(--color-border)_50%,transparent)]"
                    style={{ color: "var(--color-foreground)" }}>
                    <GitFork size={11} /> Branch from here
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
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
    setApproving(true);
    try {
      if (action.type === "propose_edit") {
        const content = editMode ? editedValue : (action.newContent ?? "");
        onApprove({ ...action, newContent: content });
      } else if (action.type === "propose_command") {
        const cmd = editMode ? editedValue : (action.command ?? "");
        const result = await api.system.execRun(cmd, action.cwd, 60000);
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
      setTerminalOutput(`Error: ${err instanceof Error ? err.message : String(err)}`);
      setExitCode(-1);
    } finally {
      setApproving(false);
    }
  }

  async function handleExecuteRefactor() {
    if (!refactorPlan) return;
    setApproving(true);
    try {
      const jobRes = await api.intelligence.executeRefactor(refactorPlan.id);
      setRefactorJob(jobRes.job);
      onApprove(action);
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
                disabled={approving}
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

function ModelSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["chatModels"],
    queryFn: () => api.chat.chatModels(),
    staleTime: 30_000,
  });

  const models = data?.models ?? [];
  const label = value || "Auto-route";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
        style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
        <Cpu size={11} />
        <span>{label}</span>
        <ChevronDown size={10} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 left-0 z-50 rounded-lg overflow-hidden shadow-xl"
          style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", minWidth: 180 }}>
          <button
            onClick={() => { onChange(""); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-xs transition-colors hover:opacity-80"
            style={{ background: !value ? "color-mix(in srgb, var(--color-accent) 15%, transparent)" : "transparent", color: "var(--color-foreground)" }}>
            Auto-route (Supervisor)
          </button>
          {models.map(m => (
            <button
              key={m.name}
              onClick={() => { onChange(m.name); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs transition-colors hover:opacity-80"
              style={{ background: value === m.name ? "color-mix(in srgb, var(--color-accent) 15%, transparent)" : "transparent", color: "var(--color-foreground)" }}>
              <span>{m.name}</span>
              {m.paramSize && <span className="ml-1 opacity-50">{m.paramSize}</span>}
            </button>
          ))}
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
      </div>

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
  const workspaces: ContextWorkspaceSummary[] = contextQ.data?.workspaces ?? [];
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
    </div>
  );
}

// ── Chat page ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [useCodeContext, setUseCodeContext] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  // Agent action panel state
  const [pendingActions, setPendingActions] = useState<AgentAction[]>([]);

  // Toast state
  const [toast, setToast] = useState<{ message: string; onAction?: () => void; actionLabel?: string } | null>(null);

  // Image attachments
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // File attachments
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [, navigate] = useLocation();
  const search = useSearch();
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load settings for permission checks
  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings.get(),
    staleTime: 60_000,
  });
  const settings = settingsData?.settings ?? null;

  // ── Session bootstrap: on mount, load from URL or create new ────────────────

  useEffect(() => {
    const params = new URLSearchParams(search);
    const urlSession = params.get("session");

    async function bootstrap() {
      setSessionLoading(true);
      try {
        if (urlSession) {
          // Load existing session
          const data = await api.sessions.get(urlSession);
          const loaded: Message[] = data.messages.map(m => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
          }));
          setMessages(loaded);
          setSessionId(urlSession);
        } else {
          // Create new session, redirect to ?session=<id>
          const data = await api.sessions.create("New Chat");
          const newId = data.session.id;
          setSessionId(newId);
          navigate(`/chat?session=${newId}`);
        }
      } catch {
        // If session load fails, create a fresh one
        try {
          const data = await api.sessions.create("New Chat");
          const newId = data.session.id;
          setSessionId(newId);
          navigate(`/chat?session=${newId}`);
        } catch { /* ignore */ }
      } finally {
        setSessionLoading(false);
      }
    }

    void bootstrap();
  // Only run when the URL session param changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    if (workspacePath) setUseCodeContext(true);
    else setUseCodeContext(false);
  }, [workspacePath]);

  // ── New chat handler ─────────────────────────────────────────────────────────

  async function handleNewChat() {
    try {
      const data = await api.sessions.create("New Chat");
      const newId = data.session.id;
      setMessages([]);
      setError(null);
      setPendingActions([]);
      setInput("");
      navigate(`/chat?session=${newId}`);
      void qc.invalidateQueries({ queryKey: ["chat-sessions"] });
    } catch { /* ignore */ }
  }

  // ── Select existing session ──────────────────────────────────────────────────

  function handleSelectSession(id: string) {
    setMessages([]);
    setError(null);
    setPendingActions([]);
    navigate(`/chat?session=${id}`);
  }

  // ── Branch from a session in the sidebar ────────────────────────────────────

  async function handleBranchSession(sourceId: string) {
    // Branch from the last message in that session
    try {
      const sessionData = await api.sessions.get(sourceId);
      const msgs = sessionData.messages;
      if (msgs.length === 0) return;
      const lastMsg = msgs[msgs.length - 1];
      const data = await api.sessions.branch(sourceId, lastMsg.id);
      const newId = data.session.id;
      setMessages([]);
      setError(null);
      setPendingActions([]);
      navigate(`/chat?session=${newId}`);
      void qc.invalidateQueries({ queryKey: ["chat-sessions"] });
    } catch { /* ignore */ }
  }

  // ── Branch from a message bubble ─────────────────────────────────────────────

  async function handleBranchFromMessage(msgId: string) {
    if (!sessionId) return;
    try {
      const data = await api.sessions.branch(sessionId, msgId);
      const newId = data.session.id;
      setToast({ message: `Branched: ${data.session.name}` });
      void qc.invalidateQueries({ queryKey: ["chat-sessions"] });
      navigate(`/chat?session=${newId}`);
    } catch { /* ignore */ }
  }

  // ── Apply-to-file shortcut ────────────────────────────────────────────────────

  function handleApplyToFile(filePath: string) {
    setInput(`/edit ${filePath}`);
    textareaRef.current?.focus();
  }

  // ── Sidebar rename/delete callbacks (pass-through to invalidate) ─────────────

  async function handleRenameSession(id: string, name: string) {
    await api.sessions.rename(id, name);
    void qc.invalidateQueries({ queryKey: ["chat-sessions"] });
  }

  async function handleDeleteSession(id: string) {
    await api.sessions.delete(id);
    void qc.invalidateQueries({ queryKey: ["chat-sessions"] });
    // If we deleted the current session, start a new chat
    if (id === sessionId) {
      void handleNewChat();
    }
  }

  // ── Image attach ───────────────────────────────────────────────────────────

  function handleImageFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Strip data:image/...;base64, prefix
        const base64 = dataUrl.split(",")[1] ?? "";
        setAttachedImages(prev => [...prev, { dataUrl, base64, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
  }

  // ── File/folder attach ─────────────────────────────────────────────────────

  function handleTextFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach(file => {
      if (file.size > 512 * 1024) {
        setAttachedFiles(prev => [...prev, { name: file.name, content: "", isBinary: true }]);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedFiles(prev => [...prev, { name: file.name, content: reader.result as string, isBinary: false }]);
      };
      reader.readAsText(file);
    });
  }

  function handleFolderSelect(e: ChangeEvent<HTMLInputElement>) {
    // When a folder is selected, set it as the workspace path
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const firstFile = files[0];
    // Extract folder path from first file's webkitRelativePath
    const relativePath = (firstFile as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
    const folderName = relativePath.split("/")[0] ?? firstFile.name;
    // We can't get the absolute path from browser, so set workspacePath to folder name as hint
    setWorkspacePath(folderName);
    setUseCodeContext(true);
  }

  // Build file content appended to message text
  function buildMessageWithAttachments(text: string): string {
    let result = text;
    for (const f of attachedFiles) {
      if (f.isBinary) {
        result += `\n\n[Binary file attached: ${f.name} — not embedded]`;
      } else {
        const ext = f.name.split(".").pop() ?? "";
        result += `\n\n\`\`\`${ext}\n// File: ${f.name}\n${f.content}\n\`\`\``;
      }
    }
    return result;
  }

  // ── Slash command handler (2.6) ────────────────────────────────────────────

  async function handleSlashCommand(command: string) {
    const userMsg: Message = { role: "user", content: command };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setStreaming(true);
    try {
      const res = await fetch("/api/chat/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, workspacePath: workspacePath || undefined }),
      });
      const data = await res.json() as { success: boolean; message?: string; agentAction?: AgentAction };
      const reply = data.message ?? (data.success ? "Done." : "Command failed.");
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
      // If command returns a pendingAction (e.g. /run, /edit), add it
      if (data.agentAction) {
        setPendingActions(prev => [...prev, data.agentAction!]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setStreaming(false);
    }
  }

  // ── Main send (2.8 images, 2.9 files) ─────────────────────────────────────

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    // Slash command interception (2.6)
    if (text.startsWith("/")) {
      void handleSlashCommand(text);
      return;
    }

    setError(null);
    setInput("");

    const messageText = buildMessageWithAttachments(text);
    const imagesToSend = [...attachedImages];
    setAttachedImages([]);
    setAttachedFiles([]);

    // Persist user message to DB and capture its id
    let userMsgId: string | undefined;
    if (sessionId) {
      try {
        const saved = await api.sessions.addMessage(sessionId, "user", messageText);
        userMsgId = saved.id;
      } catch { /* non-fatal */ }
    }

    const userMsg: Message = {
      id: userMsgId,
      role: "user",
      content: messageText,
      images: imagesToSend.map(i => i.dataUrl),
    };
    const assistantMsg: Message = { role: "assistant", content: "", streaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    const chatHistory: ChatMessage[] = [
      ...messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: messageText },
    ];

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatHistory,
          model: model || undefined,
          sessionId,
          workspacePath: workspacePath || undefined,
          useCodeContext: useCodeContext && !!workspacePath,
          images: imagesToSend.length > 0 ? imagesToSend.map(i => i.base64) : undefined,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let collectedText = "";
      let supervisor: SupervisorInfo | undefined;
      let responseModel = "";
      let contextMeta: ContextMeta | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") continue;
          try {
            const chunk = JSON.parse(raw) as StreamChunk;
            if (chunk.error) throw new Error(chunk.error);
            if (chunk.supervisor) supervisor = chunk.supervisor;
            if (chunk.model) responseModel = chunk.model;
            if (chunk.context) contextMeta = chunk.context;
            // Collect agent actions emitted before [DONE]
            if (chunk.agentAction) {
              setPendingActions(prev => [...prev, chunk.agentAction!]);
            }
            if (chunk.token) {
              collectedText += chunk.token;
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = { ...last, content: collectedText, supervisor, model: responseModel };
                }
                return next;
              });
            }
          } catch { /* ignore malformed SSE */ }
        }
      }

      // Persist assistant reply and capture its DB id
      let assistantMsgId: string | undefined;
      if (sessionId && collectedText) {
        try {
          const saved = await api.sessions.addMessage(sessionId, "assistant", collectedText);
          assistantMsgId = saved.id;
          void qc.invalidateQueries({ queryKey: ["chat-sessions"] });
        } catch { /* non-fatal */ }
      }

      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = { ...last, id: assistantMsgId, content: collectedText, streaming: false, supervisor, model: responseModel, context: contextMeta };
        }
        return next;
      });
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setMessages(prev => prev.filter(m => !m.streaming));
    } finally {
      setStreaming(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, messages, model, sessionId, workspacePath, useCodeContext, streaming, attachedImages, attachedFiles]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
  };

  // ── Agent Action handlers ──────────────────────────────────────────────────

  async function handleApproveAction(action: AgentAction, editedValue?: string) {
    if (action.type === "propose_edit") {
      const content = editedValue ?? action.newContent ?? "";
      const filePath = action.filePath!;
      try {
        await api.system.sovereignEdit(filePath, content);
        setPendingActions(prev => prev.filter(a => a.id !== action.id));
        setToast({
          message: `Edit applied to ${filePath.split("/").pop()}`,
          actionLabel: "Restart server",
          onAction: () => {
            void api.system.restart("sovereign-edit via agent action panel");
            setToast(null);
          },
        });
      } catch (err) {
        setError(`Edit failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      // For RUN/SELF-HEAL/REFACTOR, the card handles execution internally
      // Just remove from pending after card calls onApprove
      setPendingActions(prev => prev.filter(a => a.id !== action.id));
    }
  }

  function handleRejectAction(id: string) {
    setPendingActions(prev => prev.filter(a => a.id !== id));
  }

  // ── Quick action chips ─────────────────────────────────────────────────────

  const quickActions: Array<{ label: string; icon: React.ElementType; prompt: string }> = [
    { label: "Refactor plan",   icon: Brain,     prompt: "Plan a refactor for the current workspace" },
    { label: "Search context",  icon: Search,    prompt: "Search the codebase for the main entry points" },
    { label: "Explain arch",    icon: FolderOpen,prompt: "Explain the high-level architecture of this project" },
    { label: "Run diagnostics", icon: Wrench,    prompt: "/status" },
    { label: "Hardware",        icon: Cpu,       prompt: "/hardware" },
  ];

  return (
    <div className="flex flex-col h-screen">
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

        {/* Messages pane */}
        <div className="flex-1 flex flex-col overflow-hidden">
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
            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                msg={msg}
                onBranch={handleBranchFromMessage}
                onApplyToFile={handleApplyToFile}
              />
            ))}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg mb-4 text-sm"
                style={{ background: "color-mix(in srgb, var(--color-error) 10%, transparent)", color: "var(--color-error)", border: "1px solid color-mix(in srgb, var(--color-error) 25%, transparent)" }}>
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <div ref={bottomRef} />
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
          <div className="shrink-0 px-6 pb-6 pt-2" style={{ borderTop: "1px solid var(--color-border)" }}>
            {/* Hidden file inputs */}
            <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => handleImageFiles(e.target.files)} />
            <input ref={fileInputRef} type="file" multiple className="hidden"
              onChange={e => { handleTextFiles(e.target.files); }} />
            <input ref={folderInputRef} type="file"
              {...({ webkitdirectory: "" } as Record<string, string>)}
              className="hidden"
              onChange={handleFolderSelect} />

            <div className="rounded-xl overflow-hidden"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={streaming}
                placeholder="Ask anything… (Shift+Enter for newline, /help for commands)"
                rows={1}
                className="w-full px-4 pt-3 pb-2 text-sm resize-none outline-none bg-transparent"
                style={{ color: "var(--color-foreground)", minHeight: 44, maxHeight: 160, lineHeight: 1.5 }}
              />
              <div className="flex items-center justify-between px-3 pb-2.5 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <ModelSelector value={model} onChange={setModel} />
                  <WorkspaceSelector value={workspacePath} onChange={setWorkspacePath} />

                  {/* Code context toggle */}
                  <button
                    disabled={!workspacePath}
                    onClick={() => setUseCodeContext(c => !c)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-40"
                    title={!workspacePath ? "Select a workspace first" : useCodeContext ? "Disable code context" : "Enable code context"}
                    style={{
                      background: useCodeContext && workspacePath ? "color-mix(in srgb, var(--color-info) 15%, transparent)" : "var(--color-elevated)",
                      color: useCodeContext && workspacePath ? "var(--color-info)" : "var(--color-muted)",
                      border: `1px solid ${useCodeContext && workspacePath ? "color-mix(in srgb, var(--color-info) 30%, transparent)" : "var(--color-border)"}`,
                    }}>
                    {useCodeContext && workspacePath ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                    Code ctx
                  </button>

                  {/* Image attach button (2.8) */}
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    title="Attach image (vision)"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs"
                    style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
                    <Image size={13} />
                  </button>

                  {/* File attach button (2.9) */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach file (text)"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs"
                    style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
                    <Paperclip size={13} />
                  </button>

                  {/* Folder attach / workspace select (2.9) */}
                  <button
                    onClick={() => folderInputRef.current?.click()}
                    title="Attach folder as workspace"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs"
                    style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
                    <FolderOpen size={13} />
                  </button>
                </div>

                <button
                  onClick={() => void send()}
                  disabled={(!input.trim() && attachedImages.length === 0) || streaming}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40"
                  style={{ background: "var(--color-accent)", color: "#fff" }}>
                  {streaming ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Thinking</>
                  ) : (
                    <><Send size={13} /> Send</>
                  )}
                </button>
              </div>
            </div>

            <div className="text-xs mt-2 text-center" style={{ color: "var(--color-muted)" }}>
              Enter to send · Shift+Enter for newline · /help for commands
              {useCodeContext && workspacePath && <span style={{ color: "var(--color-info)" }}> · code context active</span>}
            </div>
          </div>
        </div>

        {/* Agent Action Panel (2.2) — slides in when actions are pending */}
        <AgentActionPanel
          actions={pendingActions}
          settings={settings}
          onApprove={(action, editedValue) => void handleApproveAction(action, editedValue)}
          onReject={handleRejectAction}
        />
      </div>

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
