import React, { useState, useRef, useEffect } from "react";
import {
  Code2, Cpu, Wrench, Eye, Sparkles,
  ChevronDown, ChevronRight,
  Brain, FileCode,
  Check, Copy, Terminal,
  User, Bot, MoreVertical, GitFork, GitBranch,
  Info, X,
} from "lucide-react";
import type { SupervisorInfo } from "../../api.js";
import type { Message, ContextMeta } from "./useChatState.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function agentIcon(category?: string) {
  switch (category) {
    case "coding":   return <Code2 size={13} />;
    case "hardware": return <Cpu size={13} />;
    case "sysadmin": return <Wrench size={13} />;
    case "vision":   return <Eye size={13} />;
    default:         return <Sparkles size={13} />;
  }
}

export function agentColor(category?: string): string {
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
              {supervisor.steps.map((step: string, i: number) => (
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

// ── Model chip with "Why this model?" tooltip (8.13) ─────────────────────────

function ModelChipWithTooltip({ model, supervisor, color }: {
  model: string;
  supervisor: SupervisorInfo;
  color: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block ml-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-1.5 py-0 rounded text-xs"
        title="Why this model?"
        style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
        <Cpu size={9} />
        {model}
        <Info size={9} className="opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-5 z-50 rounded-xl shadow-xl p-3 min-w-[220px] max-w-[320px]"
          style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Cpu size={12} style={{ color }} />
            <span className="font-semibold text-xs" style={{ color: "var(--color-foreground)" }}>Why {model}?</span>
            <button onClick={() => setOpen(false)} className="ml-auto" style={{ color: "var(--color-muted)" }}><X size={11} /></button>
          </div>
          <div className="space-y-1.5 text-xs" style={{ color: "var(--color-muted)" }}>
            <div><span className="font-medium" style={{ color: "var(--color-foreground)" }}>Goal:</span> {supervisor.goal}</div>
            <div><span className="font-medium" style={{ color: "var(--color-foreground)" }}>Category:</span> {supervisor.category}</div>
            {supervisor.confidence !== undefined && (
              <div className="flex items-center gap-1.5">
                <span className="font-medium" style={{ color: "var(--color-foreground)" }}>Confidence:</span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-surface)" }}>
                  <div className="h-full rounded-full" style={{ width: `${supervisor.confidence}%`, background: color }} />
                </div>
                <span>{supervisor.confidence}%</span>
              </div>
            )}
            {supervisor.steps && supervisor.steps.length > 0 && (
              <div>
                <span className="font-medium" style={{ color: "var(--color-foreground)" }}>Reasoning steps:</span>
                <ol className="mt-1 space-y-0.5 list-decimal list-inside">
                  {supervisor.steps.map((s: string, i: number) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

export function MessageBubble({
  msg,
  onBranch,
  onApplyToFile,
  onPipeToNewChat,
}: {
  msg: Message;
  onBranch?: (id: string) => void;
  onApplyToFile?: (filePath: string) => void;
  onPipeToNewChat?: (content: string) => void;
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
              <ModelChipWithTooltip model={msg.model} supervisor={msg.supervisor} color={color} />
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
                {onPipeToNewChat && (
                  <button
                    onClick={() => { onPipeToNewChat(msg.content); setMenuOpen(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-[color-mix(in_srgb,var(--color-border)_50%,transparent)]"
                    style={{ color: "var(--color-foreground)" }}>
                    <GitBranch size={11} /> Send to new chat
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
