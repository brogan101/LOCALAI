/**
 * WorkspaceView.tsx — Per-preset workspace rendering (Phase 4.5)
 *
 * Full implementations: coding, cad, imagegen, writing
 * Skeletons: research, automotive, sysadmin, log-analysis,
 *            3d-print-slicer, laser-engrave
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Code2, Box, Image, FileText, BookOpen, Car, Terminal,
  FileSearch, Printer, Zap, X, Send, Loader, Copy, Check,
  FolderOpen, ExternalLink, RefreshCw, Upload, ChevronRight,
  AlertTriangle, Play, Download,
} from "lucide-react";
import api, { type WorkspacePreset, type PresetEnterResult } from "../api.js";

// ── Shared sub-components ─────────────────────────────────────────────────────

function Btn({
  onClick, disabled = false, variant = "primary", children, className = "",
}: {
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  children: React.ReactNode;
  className?: string;
}) {
  const base = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity disabled:opacity-40";
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "var(--color-accent)", color: "#fff" },
    ghost:   { background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" },
    danger:  { background: "color-mix(in srgb, var(--color-error) 15%, transparent)", color: "var(--color-error)", border: "1px solid color-mix(in srgb, var(--color-error) 30%, transparent)" },
  };
  return (
    <button className={`${base} ${className}`} style={styles[variant]} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/** Minimal inline chat panel — wires into the backend SSE stream */
function ChatPanel({
  systemPrompt,
  placeholder = "Ask anything…",
  roleModels,
}: {
  systemPrompt: string;
  placeholder?: string;
  roleModels: Array<{ role: string; modelName: string | null }>;
}) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const primaryModel = roleModels.find(r =>
    r.role === "primary-coding" || r.role === "reasoning" || r.role === "chat" || r.role === "deep-reasoning"
  )?.modelName ?? null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setStreaming(true);

    const fullHistory = [
      { role: "system" as const, content: systemPrompt },
      ...messages,
      { role: "user" as const, content: text },
    ];

    let assistantText = "";
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: fullHistory, model: primaryModel }),
      });

      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const dec    = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as { token?: string; content?: string };
            const tok = parsed.token ?? parsed.content ?? "";
            assistantText += tok;
            setMessages(prev => {
              const next = [...prev];
              next[next.length - 1] = { role: "assistant", content: assistantText };
              return next;
            });
          } catch { /* skip non-JSON lines */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: `[Error: ${msg}]` };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, messages, systemPrompt, primaryModel]);

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ minHeight: 0 }}>
        {messages.length === 0 && (
          <div className="text-xs text-center py-8" style={{ color: "var(--color-muted)" }}>
            {primaryModel
              ? `Model: ${primaryModel}`
              : "No model assigned for this role — go to Models → Roles to assign one."}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] px-3 py-2 rounded-xl text-xs whitespace-pre-wrap break-words"
              style={{
                background: m.role === "user"
                  ? "var(--color-accent)"
                  : "var(--color-elevated)",
                color: m.role === "user" ? "#fff" : "var(--color-foreground)",
                border: m.role === "assistant" ? "1px solid var(--color-border)" : undefined,
              }}>
              {m.content || (streaming && m.role === "assistant" ? "▌" : "")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 shrink-0" style={{ borderTop: "1px solid var(--color-border)" }}>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={placeholder}
            rows={2}
            disabled={streaming}
            className="flex-1 px-3 py-2 rounded-lg text-xs resize-none outline-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            className="px-3 py-2 rounded-lg disabled:opacity-40"
            style={{ background: "var(--color-accent)", color: "#fff" }}>
            {streaming ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Chip row helper ────────────────────────────────────────────────────────────

function QuickChips({
  chips,
  onSelect,
}: {
  chips: string[];
  onSelect: (chip: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 p-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
      {chips.map(chip => (
        <button
          key={chip}
          onClick={() => onSelect(chip)}
          className="text-xs px-2.5 py-1 rounded-full"
          style={{
            background: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
            color: "var(--color-accent)",
            border: "1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)",
          }}>
          {chip}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CODING WORKSPACE (full)
// ─────────────────────────────────────────────────────────────────────────────

function CodingWorkspace({
  workspacePath,
  preset,
  roleModels,
}: {
  workspacePath: string;
  preset: WorkspacePreset;
  roleModels: Array<{ role: string; modelName: string | null }>;
}) {
  const [editorContent, setEditorContent] = useState(
    "// Start coding here…\n// Tip: describe what you want in the chat →\n"
  );
  const [ghostText, setGhostText]   = useState("");
  const [ghostPos, setGhostPos]     = useState(0);
  const [isAutocompleting, setIsAutocompleting] = useState(false);
  const [copied, setCopied]         = useState(false);
  const debounceRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef                 = useRef<HTMLTextAreaElement>(null);

  const autocompleteModel = roleModels.find(r => r.role === "autocomplete")?.modelName ?? null;
  const primaryModel      = roleModels.find(r => r.role === "primary-coding")?.modelName ?? null;

  const writeContinueMut = useMutation({
    mutationFn: () =>
      api.studios.coding.writeContinueConfig(workspacePath, primaryModel ?? ""),
  });

  // Ghost text autocomplete
  const triggerAutocomplete = useCallback((content: string, cursorPos: number) => {
    if (!autocompleteModel) return;
    const prefix = content.slice(0, cursorPos);
    if (prefix.trim().length < 10) return; // Too short to autocomplete

    setIsAutocompleting(true);
    fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model:  autocompleteModel,
        prompt: prefix,
        stream: false,
        options: { stop: ["\n\n", "```"], num_predict: 60 },
      }),
    })
      .then(r => r.json() as Promise<{ response?: string }>)
      .then(d => {
        const suggestion = (d.response ?? "").replace(/^\s*/, "");
        if (suggestion) {
          setGhostText(suggestion);
          setGhostPos(cursorPos);
        }
      })
      .catch(() => {})
      .finally(() => setIsAutocompleting(false));
  }, [autocompleteModel]);

  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setEditorContent(val);
    setGhostText(""); // Clear ghost on any edit

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      triggerAutocomplete(val, e.target.selectionStart);
    }, 200);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && ghostText) {
      e.preventDefault();
      // Accept ghost text
      const before = editorContent.slice(0, ghostPos);
      const after  = editorContent.slice(ghostPos);
      setEditorContent(before + ghostText + after);
      setGhostText("");
      // Move cursor after accepted text
      setTimeout(() => {
        if (textareaRef.current) {
          const newPos = ghostPos + ghostText.length;
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      }, 0);
    } else if (e.key === "Escape") {
      setGhostText("");
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(editorContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
        <Code2 size={14} style={{ color: "var(--color-accent)" }} />
        <span className="text-xs font-semibold flex-1" style={{ color: "var(--color-foreground)" }}>
          Coding Workspace
        </span>
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {workspacePath}
        </span>
        <Btn variant="ghost" onClick={handleCopyCode}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </Btn>
        <Btn
          variant="ghost"
          disabled={!primaryModel || writeContinueMut.isPending}
          onClick={() => writeContinueMut.mutate()}>
          {writeContinueMut.isPending
            ? <Loader size={12} className="animate-spin" />
            : <ExternalLink size={12} />}
          Open in VS Code
        </Btn>
        {writeContinueMut.isError && (
          <span className="text-xs" style={{ color: "var(--color-error)" }}>Failed</span>
        )}
        {writeContinueMut.isSuccess && (
          <span className="text-xs" style={{ color: "var(--color-success)" }}>Launched!</span>
        )}
        {isAutocompleting && (
          <Loader size={12} className="animate-spin" style={{ color: "var(--color-muted)" }} />
        )}
      </div>

      {/* Split pane */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Editor pane */}
        <div className="flex flex-col flex-1 overflow-hidden" style={{ borderRight: "1px solid var(--color-border)" }}>
          <div className="relative flex-1 overflow-hidden">
            {/* Ghost text overlay (behind textarea) */}
            {ghostText && (
              <div
                aria-hidden
                className="absolute inset-0 px-3 py-3 text-xs font-mono pointer-events-none whitespace-pre-wrap break-words"
                style={{
                  color: "transparent",
                  zIndex: 1,
                }}>
                {editorContent.slice(0, ghostPos)}
                <span style={{ color: "color-mix(in srgb, var(--color-muted) 60%, transparent)" }}>
                  {ghostText}
                </span>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={editorContent}
              onChange={handleEditorChange}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              className="absolute inset-0 w-full h-full px-3 py-3 text-xs font-mono resize-none outline-none"
              style={{
                background: "var(--color-bg)",
                color: "var(--color-foreground)",
                zIndex: 2,
                caretColor: "var(--color-accent)",
              }}
            />
          </div>
          {ghostText && (
            <div className="px-3 py-1 text-xs shrink-0"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)", borderTop: "1px solid var(--color-border)" }}>
              Tab to accept · Esc to dismiss
            </div>
          )}
        </div>

        {/* Chat pane */}
        <div className="flex flex-col w-80 shrink-0" style={{ minHeight: 0 }}>
          <ChatPanel
            systemPrompt={preset.systemPrompt}
            placeholder="Describe what to code…"
            roleModels={roleModels}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CAD WORKSPACE (full)
// ─────────────────────────────────────────────────────────────────────────────

function CadWorkspace({
  preset,
  roleModels,
}: {
  workspacePath: string;
  preset: WorkspacePreset;
  roleModels: Array<{ role: string; modelName: string | null }>;
}) {
  const [scadScript, setScadScript] = useState(
    "// OpenSCAD script\n// Example:\n// cube([10, 10, 10]);\n"
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [gcodeInput, setGcodeInput] = useState("");
  const [gcodeOutput, setGcodeOutput] = useState("");

  const renderMut = useMutation({
    mutationFn: () => api.studios.cad.render(scadScript),
    onSuccess: (data) => {
      if (data.success && data.base64Png) {
        setPreviewUrl(`data:${data.mimeType};base64,${data.base64Png}`);
      }
    },
  });

  const gcodeMut = useMutation({
    mutationFn: () => api.studios.cad.gcode(gcodeInput, "fdm"),
    onSuccess: (data) => {
      if (data.success) {
        const result = data.result as { optimizedGcode?: string };
        setGcodeOutput(result.optimizedGcode ?? "");
      }
    },
  });

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}>
        <Box size={14} style={{ color: "var(--color-accent)" }} />
        <span className="text-xs font-semibold flex-1" style={{ color: "var(--color-foreground)" }}>
          CAD / 3-D Workspace
        </span>
        <Btn onClick={() => renderMut.mutate()} disabled={renderMut.isPending}>
          {renderMut.isPending ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
          Render
        </Btn>
      </div>

      {/* Three-pane layout */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* OpenSCAD editor */}
        <div className="flex flex-col flex-1 overflow-hidden" style={{ borderRight: "1px solid var(--color-border)" }}>
          <div className="px-3 py-1.5 text-xs font-medium shrink-0"
            style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
            OpenSCAD Script
          </div>
          <textarea
            value={scadScript}
            onChange={e => setScadScript(e.target.value)}
            spellCheck={false}
            className="flex-1 px-3 py-3 text-xs font-mono resize-none outline-none"
            style={{ background: "var(--color-bg)", color: "var(--color-foreground)" }}
          />

          {/* G-code panel */}
          <div style={{ borderTop: "1px solid var(--color-border)" }}>
            <div className="flex items-center gap-2 px-3 py-1.5"
              style={{ borderBottom: "1px solid var(--color-border)" }}>
              <span className="text-xs font-medium flex-1" style={{ color: "var(--color-muted)" }}>
                G-code Optimizer
              </span>
              <Btn variant="ghost" onClick={() => gcodeMut.mutate()} disabled={gcodeMut.isPending || !gcodeInput.trim()}>
                {gcodeMut.isPending ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                Optimize
              </Btn>
            </div>
            <div className="grid grid-cols-2 gap-0" style={{ height: 120 }}>
              <textarea
                value={gcodeInput}
                onChange={e => setGcodeInput(e.target.value)}
                placeholder="Paste G-code here…"
                spellCheck={false}
                className="px-3 py-2 text-xs font-mono resize-none outline-none"
                style={{
                  background: "var(--color-elevated)",
                  color: "var(--color-foreground)",
                  borderRight: "1px solid var(--color-border)",
                }}
              />
              <textarea
                readOnly
                value={gcodeOutput}
                placeholder="Optimized G-code appears here…"
                className="px-3 py-2 text-xs font-mono resize-none outline-none"
                style={{ background: "var(--color-bg)", color: "var(--color-foreground)" }}
              />
            </div>
          </div>
        </div>

        {/* Render preview */}
        <div className="flex flex-col w-72 shrink-0" style={{ borderRight: "1px solid var(--color-border)" }}>
          <div className="px-3 py-1.5 text-xs font-medium shrink-0"
            style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
            Render Preview
          </div>
          <div className="flex-1 flex items-center justify-center p-4"
            style={{ background: "var(--color-bg)" }}>
            {renderMut.isPending && (
              <div className="text-xs text-center" style={{ color: "var(--color-muted)" }}>
                <Loader size={20} className="animate-spin mb-2 mx-auto" />
                Rendering…
              </div>
            )}
            {renderMut.isError && (
              <div className="text-xs text-center space-y-2" style={{ color: "var(--color-warn)" }}>
                <AlertTriangle size={20} className="mx-auto" />
                <div>{renderMut.error instanceof Error ? renderMut.error.message : "Render failed"}</div>
                <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                  Install: <code className="font-mono">winget install OpenSCAD.OpenSCAD</code>
                </div>
              </div>
            )}
            {renderMut.data && !renderMut.data.success && (
              <div className="text-xs text-center space-y-1" style={{ color: "var(--color-warn)" }}>
                <AlertTriangle size={18} className="mx-auto" />
                <div>{renderMut.data.message}</div>
                {renderMut.data.installHint && (
                  <code className="text-xs font-mono block" style={{ color: "var(--color-muted)" }}>
                    {renderMut.data.installHint}
                  </code>
                )}
              </div>
            )}
            {previewUrl && !renderMut.isPending && (
              <img
                src={previewUrl}
                alt="OpenSCAD render"
                className="max-w-full max-h-full rounded-lg object-contain"
                style={{ border: "1px solid var(--color-border)" }}
              />
            )}
            {!previewUrl && !renderMut.isPending && !renderMut.isError && !renderMut.data && (
              <div className="text-xs text-center" style={{ color: "var(--color-muted)" }}>
                Click Render to preview
              </div>
            )}
          </div>
        </div>

        {/* Chat pane */}
        <div className="flex flex-col w-80 shrink-0" style={{ minHeight: 0 }}>
          <ChatPanel
            systemPrompt={preset.systemPrompt}
            placeholder="Describe the part to design…"
            roleModels={roleModels}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGEGEN WORKSPACE (full)
// ─────────────────────────────────────────────────────────────────────────────

function ImageGenWorkspace({
  preset,
  roleModels,
}: {
  workspacePath: string;
  preset: WorkspacePreset;
  roleModels: Array<{ role: string; modelName: string | null }>;
}) {
  const [prompt, setPrompt]   = useState("");
  const [negPrompt, setNeg]   = useState("blurry, low quality, distorted");
  const [style, setStyle]     = useState<"photorealistic" | "artistic" | "anime" | "concept-art">("photorealistic");
  const [steps, setSteps]     = useState(20);
  const [cfg, setCfg]         = useState(7);

  const statusQ = useQuery({
    queryKey: ["imagegen-status"],
    queryFn:  () => api.studios.imagegen.status(),
    refetchInterval: 30_000,
  });

  const galleryQ = useQuery({
    queryKey: ["imagegen-gallery"],
    queryFn:  () => api.studios.imagegen.gallery(),
    staleTime: 10_000,
  });

  const generateMut = useMutation({
    mutationFn: () =>
      api.studios.imagegen.generate(prompt, {
        steps,
        cfgScale: cfg,
        saveImages: true,
      }),
    onSuccess: () => galleryQ.refetch(),
  });

  const status = statusQ.data;
  const isRunning = status?.comfyuiReachable || status?.sdWebuiReachable;

  return (
    <div className="flex h-full" style={{ minHeight: 0 }}>
      {/* Left: controls */}
      <div className="flex flex-col w-80 shrink-0 overflow-y-auto"
        style={{ borderRight: "1px solid var(--color-border)" }}>

        {/* Status bar */}
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Image size={14} style={{ color: "var(--color-accent)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--color-foreground)" }}>
              Image Generation
            </span>
          </div>
          {statusQ.isLoading && (
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>
              <Loader size={11} className="animate-spin inline mr-1" />Probing services…
            </div>
          )}
          {status && (
            <div className="space-y-1">
              {[
                { label: "ComfyUI",    ok: status.comfyuiReachable,  port: 8188 },
                { label: "SD WebUI",   ok: status.sdWebuiReachable,  port: 7860 },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-1.5 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: s.ok ? "var(--color-success)" : "var(--color-muted)" }} />
                  <span style={{ color: "var(--color-muted)" }}>{s.label}</span>
                  {!s.ok && (
                    <span className="ml-auto text-xs" style={{ color: "var(--color-muted)" }}>
                      port {s.port} not responding
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {status && !isRunning && (
            <div className="mt-2 p-2 rounded-lg text-xs"
              style={{ background: "color-mix(in srgb, var(--color-warn) 10%, transparent)", color: "var(--color-warn)", border: "1px solid color-mix(in srgb, var(--color-warn) 25%, transparent)" }}>
              <AlertTriangle size={11} className="inline mr-1" />
              No image backend running.
              <div className="mt-1 font-mono" style={{ color: "var(--color-muted)" }}>
                winget install comfyanonymous.ComfyUI
              </div>
            </div>
          )}
        </div>

        {/* Prompt */}
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-muted)" }}>
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={4}
              placeholder="Describe the image…"
              className="w-full px-3 py-2 text-xs rounded-lg resize-none outline-none"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
            />
          </div>

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-muted)" }}>
              Negative prompt
            </label>
            <textarea
              value={negPrompt}
              onChange={e => setNeg(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-xs rounded-lg resize-none outline-none"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
            />
          </div>

          {/* Style */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-muted)" }}>Style</label>
            <div className="flex flex-wrap gap-1">
              {(["photorealistic", "artistic", "anime", "concept-art"] as const).map(s => (
                <button key={s} onClick={() => setStyle(s)}
                  className="text-xs px-2 py-0.5 rounded"
                  style={{
                    background: style === s ? "var(--color-accent)" : "var(--color-elevated)",
                    color:      style === s ? "#fff" : "var(--color-muted)",
                    border:     "1px solid var(--color-border)",
                  }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Steps / CFG */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-muted)" }}>
                Steps: {steps}
              </label>
              <input type="range" min={10} max={50} value={steps}
                onChange={e => setSteps(Number(e.target.value))}
                className="w-full accent-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-muted)" }}>
                CFG: {cfg}
              </label>
              <input type="range" min={1} max={20} value={cfg}
                onChange={e => setCfg(Number(e.target.value))}
                className="w-full accent-blue-500" />
            </div>
          </div>

          <Btn
            onClick={() => generateMut.mutate()}
            disabled={generateMut.isPending || !prompt.trim() || !isRunning}
            className="w-full justify-center py-2">
            {generateMut.isPending
              ? <><Loader size={13} className="animate-spin" /> Generating…</>
              : <><Play size={13} /> Generate</>}
          </Btn>

          {generateMut.isError && (
            <div className="text-xs" style={{ color: "var(--color-error)" }}>
              {generateMut.error instanceof Error ? generateMut.error.message : "Generation failed"}
            </div>
          )}
        </div>
      </div>

      {/* Right: gallery + chat */}
      <div className="flex flex-col flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Gallery */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-xs font-semibold mb-3" style={{ color: "var(--color-muted)" }}>
            Gallery
            <button onClick={() => galleryQ.refetch()} className="ml-2 opacity-50 hover:opacity-100">
              <RefreshCw size={11} />
            </button>
          </div>
          {galleryQ.isLoading && (
            <Loader size={16} className="animate-spin" style={{ color: "var(--color-muted)" }} />
          )}
          {galleryQ.data?.files?.length === 0 && (
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>
              No images yet — generate one above.
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {(galleryQ.data?.files ?? []).map(f => (
              <div key={f.name} className="rounded-lg overflow-hidden aspect-square"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                <img
                  src={`/api/studios/imagegen/file/${encodeURIComponent(f.name)}`}
                  alt={f.name}
                  className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Chat */}
        <div className="h-64 shrink-0" style={{ borderTop: "1px solid var(--color-border)" }}>
          <ChatPanel
            systemPrompt={preset.systemPrompt}
            placeholder="Ask for prompt ideas…"
            roleModels={roleModels}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITING WORKSPACE (full)
// ─────────────────────────────────────────────────────────────────────────────

function WritingWorkspace({
  preset,
  roleModels,
}: {
  workspacePath: string;
  preset: WorkspacePreset;
  roleModels: Array<{ role: string; modelName: string | null }>;
}) {
  const [markdown, setMarkdown] = useState(
    "# Untitled\n\nStart writing here…\n"
  );
  const [rendered, setRendered] = useState("");
  const [ragFiles, setRagFiles] = useState<File[]>([]);

  // Render markdown via `marked` (lazy import keeps it out of the core bundle)
  useEffect(() => {
    let cancelled = false;
    import("marked").then(m => {
      if (!cancelled) {
        const html = m.marked.parse(markdown) as string;
        setRendered(html);
      }
    }).catch(() => setRendered(`<pre>${markdown}</pre>`));
    return () => { cancelled = true; };
  }, [markdown]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    setRagFiles(prev => [...prev, ...dropped]);
  };

  return (
    <div className="flex h-full" style={{ minHeight: 0 }}>
      {/* Editor */}
      <div className="flex flex-col flex-1 overflow-hidden" style={{ borderRight: "1px solid var(--color-border)" }}>
        <div className="px-3 py-1.5 text-xs font-medium shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
          Markdown Editor
        </div>
        <textarea
          value={markdown}
          onChange={e => setMarkdown(e.target.value)}
          spellCheck
          className="flex-1 px-4 py-3 text-xs font-mono resize-none outline-none"
          style={{ background: "var(--color-bg)", color: "var(--color-foreground)" }}
        />

        {/* RAG drop zone */}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          className="px-4 py-3 shrink-0 text-center text-xs"
          style={{
            borderTop: "2px dashed var(--color-border)",
            color: "var(--color-muted)",
          }}>
          <Upload size={14} className="mx-auto mb-1 opacity-50" />
          Drop documents here to add to RAG context (Phase 6)
          {ragFiles.length > 0 && (
            <div className="mt-1 text-left space-y-0.5">
              {ragFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-1">
                  <ChevronRight size={10} />
                  <span>{f.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="flex flex-col flex-1 overflow-hidden" style={{ borderRight: "1px solid var(--color-border)" }}>
        <div className="px-3 py-1.5 text-xs font-medium shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
          Preview
        </div>
        <div
          className="flex-1 overflow-y-auto px-4 py-3 prose prose-invert prose-sm max-w-none"
          style={{ color: "var(--color-foreground)" }}
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      </div>

      {/* Chat */}
      <div className="flex flex-col w-80 shrink-0" style={{ minHeight: 0 }}>
        <ChatPanel
          systemPrompt={preset.systemPrompt}
          placeholder="Ask for writing help…"
          roleModels={roleModels}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON WORKSPACE — used for the remaining 6 presets
// ─────────────────────────────────────────────────────────────────────────────

const SKELETON_CHIPS: Record<string, string[]> = {
  research: [
    "Summarise uploaded documents",
    "Find contradictions",
    "Build a literature review outline",
    "Extract key findings",
    "Compare sources",
  ],
  automotive: [
    "Diagnose this fault code",
    "Estimate repair cost",
    "List required torque specs",
    "Find OEM part numbers",
    "Check TSBs for this model",
  ],
  sysadmin: [
    "Analyse last 100 log lines",
    "Show disk usage",
    "List listening ports",
    "Check failed systemd services",
    "Harden SSH config",
  ],
  "log-analysis": [
    "Find ERROR lines",
    "Show top IP addresses",
    "Parse timestamp distribution",
    "Correlate warnings",
    "Summarise exception stack traces",
  ],
  "3d-print-slicer": [
    "Recommend slicer settings for PLA",
    "Optimise retraction for PETG",
    "Reduce print time",
    "Fix stringing artifacts",
    "Calculate filament usage",
  ],
  "laser-engrave": [
    "Calculate power for 3mm plywood",
    "Optimise cut path",
    "Convert DXF to G-code",
    "Material safety warnings",
    "Speed vs quality tradeoff",
  ],
};

function SkeletonWorkspace({
  preset,
  roleModels,
}: {
  workspacePath: string;
  preset: WorkspacePreset;
  roleModels: Array<{ role: string; modelName: string | null }>;
}) {
  const chips = SKELETON_CHIPS[preset.id] ?? [];
  const [injected, setInjected] = useState("");

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}>
        <span className="text-xs font-semibold" style={{ color: "var(--color-foreground)" }}>
          {preset.name}
        </span>
        <span className="text-xs ml-2 px-2 py-0.5 rounded"
          style={{ background: "color-mix(in srgb, var(--color-accent) 10%, transparent)", color: "var(--color-accent)" }}>
          {preset.description}
        </span>
      </div>

      {/* Quick chips */}
      {chips.length > 0 && (
        <QuickChips chips={chips} onSelect={chip => setInjected(chip)} />
      )}

      {/* Chat fills remainder */}
      <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        <InjectedChat
          systemPrompt={preset.systemPrompt}
          roleModels={roleModels}
          injected={injected}
          onInjectedConsumed={() => setInjected("")}
        />
      </div>
    </div>
  );
}

/** Chat panel that can receive an injected message from outside */
function InjectedChat({
  systemPrompt,
  roleModels,
  injected,
  onInjectedConsumed,
}: {
  systemPrompt: string;
  roleModels: Array<{ role: string; modelName: string | null }>;
  injected: string;
  onInjectedConsumed: () => void;
}) {
  const [input, setInput] = useState("");

  // When a chip injects text, put it in the input box
  useEffect(() => {
    if (injected) {
      setInput(injected);
      onInjectedConsumed();
    }
  }, [injected, onInjectedConsumed]);

  // Wrap ChatPanel with manual input override not possible — instead render full chat with pre-filled input
  // We'll just pass role-models and systemPrompt; chip click pre-fills the textarea via state
  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      <ChatPanelControlled
        systemPrompt={systemPrompt}
        roleModels={roleModels}
        externalInput={input}
        onInputChange={setInput}
      />
    </div>
  );
}

/** ChatPanel with external input control */
function ChatPanelControlled({
  systemPrompt,
  roleModels,
  externalInput,
  onInputChange,
}: {
  systemPrompt: string;
  roleModels: Array<{ role: string; modelName: string | null }>;
  externalInput: string;
  onInputChange: (v: string) => void;
}) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const primaryModel = roleModels.find(r =>
    r.role === "reasoning" || r.role === "deep-reasoning" || r.role === "chat" || r.role === "primary-coding"
  )?.modelName ?? null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async () => {
    const text = externalInput.trim();
    if (!text || streaming) return;
    onInputChange("");
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setStreaming(true);

    const fullHistory = [
      { role: "system" as const, content: systemPrompt },
      ...messages,
      { role: "user" as const, content: text },
    ];

    let assistantText = "";
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: fullHistory, model: primaryModel }),
      });

      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const dec    = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as { token?: string; content?: string };
            assistantText += parsed.token ?? parsed.content ?? "";
            setMessages(prev => {
              const next = [...prev];
              next[next.length - 1] = { role: "assistant", content: assistantText };
              return next;
            });
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: `[Error: ${msg}]` };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }, [externalInput, streaming, messages, systemPrompt, primaryModel, onInputChange]);

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ minHeight: 0 }}>
        {messages.length === 0 && (
          <div className="text-xs text-center py-8" style={{ color: "var(--color-muted)" }}>
            {primaryModel ? `Model: ${primaryModel}` : "No model assigned — set roles in Models → Roles."}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%] px-3 py-2 rounded-xl text-xs whitespace-pre-wrap break-words"
              style={{
                background: m.role === "user" ? "var(--color-accent)" : "var(--color-elevated)",
                color: m.role === "user" ? "#fff" : "var(--color-foreground)",
                border: m.role === "assistant" ? "1px solid var(--color-border)" : undefined,
              }}>
              {m.content || (streaming && m.role === "assistant" ? "▌" : "")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 shrink-0" style={{ borderTop: "1px solid var(--color-border)" }}>
        <div className="flex gap-2">
          <textarea
            value={externalInput}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask anything…"
            rows={2}
            disabled={streaming}
            className="flex-1 px-3 py-2 rounded-lg text-xs resize-none outline-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
          />
          <button onClick={send} disabled={streaming || !externalInput.trim()}
            className="px-3 py-2 rounded-lg disabled:opacity-40"
            style={{ background: "var(--color-accent)", color: "#fff" }}>
            {streaming ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOP-LEVEL WorkspaceView — picks the right component per preset ID
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkspaceViewProps {
  preset:        WorkspacePreset;
  workspacePath: string;
  enterResult:   PresetEnterResult;
  onClose:       () => void;
}

export function WorkspaceView({ preset, workspacePath, enterResult, onClose }: WorkspaceViewProps) {
  const { roleModels } = enterResult;

  const iconMap: Record<string, React.ElementType> = {
    coding:           Code2,
    cad:              Box,
    imagegen:         Image,
    writing:          FileText,
    research:         BookOpen,
    automotive:       Car,
    sysadmin:         Terminal,
    "log-analysis":   FileSearch,
    "3d-print-slicer": Printer,
    "laser-engrave":  Zap,
  };
  const Icon = iconMap[preset.id] ?? Code2;

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ background: "var(--color-bg)" }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
        <div className="flex items-center gap-2">
          <Icon size={15} style={{ color: "var(--color-accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>
            {preset.name}
          </span>
        </div>
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {workspacePath}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {roleModels.map(rm => rm.modelName && (
            <span key={rm.role} className="text-xs px-2 py-0.5 rounded"
              style={{
                background: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
                color: "var(--color-accent)",
              }}>
              {rm.role}: {rm.modelName}
            </span>
          ))}
          <button
            onClick={onClose}
            className="ml-2 p-1.5 rounded-lg"
            style={{ color: "var(--color-muted)", background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}
            title="Exit workspace">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Workspace content */}
      <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {preset.id === "coding" && (
          <CodingWorkspace workspacePath={workspacePath} preset={preset} roleModels={roleModels} />
        )}
        {preset.id === "cad" && (
          <CadWorkspace workspacePath={workspacePath} preset={preset} roleModels={roleModels} />
        )}
        {preset.id === "imagegen" && (
          <ImageGenWorkspace workspacePath={workspacePath} preset={preset} roleModels={roleModels} />
        )}
        {preset.id === "writing" && (
          <WritingWorkspace workspacePath={workspacePath} preset={preset} roleModels={roleModels} />
        )}
        {(["research", "automotive", "sysadmin", "log-analysis", "3d-print-slicer", "laser-engrave"] as const).includes(
          preset.id as "research" | "automotive" | "sysadmin" | "log-analysis" | "3d-print-slicer" | "laser-engrave"
        ) && (
          <SkeletonWorkspace workspacePath={workspacePath} preset={preset} roleModels={roleModels} />
        )}
      </div>
    </div>
  );
}
