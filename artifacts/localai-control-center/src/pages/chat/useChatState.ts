/**
 * useChatState — all chat state, refs, effects, and handlers.
 * Extracted from Chat.tsx (Extraction 1).  Zero behaviour changes.
 */

import {
  useState, useRef, useEffect, useCallback,
  type Dispatch, type SetStateAction, type RefObject,
  type ChangeEvent, type DragEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, {
  apiErrorMessage,
  type ChatMessage, type SupervisorInfo, type AppSettings,
} from "../../api.js";
import { useLocation, useSearch } from "wouter";

// ── Shared types (re-exported so Chat.tsx sub-components can import them) ──────

export type AgentActionType = "propose_edit" | "propose_command" | "propose_self_heal" | "propose_refactor";

export interface AgentAction {
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

export interface AttachedImage {
  dataUrl: string;   // full data URL for thumbnail display
  base64: string;    // stripped base64 for API
  name: string;
}

export interface AttachedFile {
  name: string;
  content: string;   // text content
  isBinary: boolean;
}

export interface ContextFile {
  path: string;
  relativePath: string;
  score: number;
  matchedSymbols: string[];
}

export interface ContextMeta {
  workspaceName?: string;
  workspacePath?: string;
  fileCount?: number;
  sectionCount?: number;
  files?: ContextFile[];
}

export interface StreamChunk {
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

export interface Message {
  id?: string;         // DB message id (set after persist, used for branching)
  role: "user" | "assistant";
  content: string;
  supervisor?: SupervisorInfo;
  model?: string;
  streaming?: boolean;
  context?: ContextMeta;
  images?: string[];   // base64 thumbnails for display
}

// ── Return-type interface ──────────────────────────────────────────────────────

export interface ChatState {
  // Messages
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  // Input text
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  // Model
  model: string;
  setModel: Dispatch<SetStateAction<string>>;
  // Workspace
  workspacePath: string;
  setWorkspacePath: Dispatch<SetStateAction<string>>;
  // Code context toggle
  useCodeContext: boolean;
  setUseCodeContext: Dispatch<SetStateAction<boolean>>;
  // Session
  sessionId: string | null;
  sessionLoading: boolean;
  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  // Streaming
  streaming: boolean;
  // Error
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  // Model load
  modelLoadStatus: string | null;
  setModelLoadStatus: Dispatch<SetStateAction<string | null>>;
  modelLoading: boolean;
  // Pending agent actions
  pendingActions: AgentAction[];
  setPendingActions: Dispatch<SetStateAction<AgentAction[]>>;
  // Toast
  toast: { message: string; onAction?: () => void; actionLabel?: string } | null;
  setToast: Dispatch<SetStateAction<{ message: string; onAction?: () => void; actionLabel?: string } | null>>;
  // Conversation tree modal
  showTree: boolean;
  setShowTree: Dispatch<SetStateAction<boolean>>;
  // Attached images
  attachedImages: AttachedImage[];
  setAttachedImages: Dispatch<SetStateAction<AttachedImage[]>>;
  // Attached files
  attachedFiles: AttachedFile[];
  setAttachedFiles: Dispatch<SetStateAction<AttachedFile[]>>;
  // STT recording
  recording: boolean;
  sttError: string | null;
  setSttError: Dispatch<SetStateAction<string | null>>;
  startRecording: () => void;
  stopRecording: () => void;
  // Screenshot
  handleScreenshot: () => void;
  // Drag-drop
  dragOver: boolean;
  handleDragOver: (e: DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  handleDrop: (e: DragEvent<HTMLDivElement>) => void;
  // File attach handlers
  handleImageFiles: (files: FileList | null) => void;
  handleTextFiles: (files: FileList | null) => void;
  handleFolderSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  // Refs exposed to JSX
  bottomRef: RefObject<HTMLDivElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  // Navigation
  navigate: (path: string) => void;
  // Computed / query-derived
  ollamaOffline: boolean;
  settings: AppSettings | null;
  // Session handlers
  handleNewChat: () => void;
  handleSelectSession: (id: string) => void;
  handleBranchSession: (sourceId: string) => void;
  handleBranchFromMessage: (msgId: string) => void;
  handleApplyToFile: (filePath: string) => void;
  handlePipeToNewChat: (content: string) => void;
  handleRenameSession: (id: string, name: string) => void;
  handleDeleteSession: (id: string) => void;
  // Main send
  send: () => void;
  // Agent action handlers
  handleApproveAction: (action: AgentAction, editedValue?: string) => void;
  handleRejectAction: (id: string) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChatState(): ChatState {
  const _tokenBuf = useRef("");
  const _flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [modelLoadStatus, setModelLoadStatus] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(false);

  // Agent action panel state
  const [pendingActions, setPendingActions] = useState<AgentAction[]>([]);

  // Toast state
  const [toast, setToast] = useState<{ message: string; onAction?: () => void; actionLabel?: string } | null>(null);

  // Conversation tree modal
  const [showTree, setShowTree] = useState(false);

  // Image attachments
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // File attachments
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // STT mic recording
  const [recording, setRecording] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // TTS audio
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Drag-drop state
  const [dragOver, setDragOver] = useState(false);

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
  const speakReplies = (settings as (typeof settings & { speakReplies?: boolean }) | null)?.speakReplies ?? false;

  // Ollama reachability (for offline banner)
  const { data: chatModelsData } = useQuery({
    queryKey: ["chatModels"],
    queryFn: () => api.chat.chatModels(),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
  const ollamaOffline = chatModelsData !== undefined && !chatModelsData.ollamaReachable;

  // ── Session bootstrap: on mount, load from URL or create new ─────────────────

  useEffect(() => {
    const params = new URLSearchParams(search);
    const urlSession = params.get("session");

    async function bootstrap() {
      setSessionLoading(true);
      const pipedContent = params.get("pipe");
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
          // Pre-fill input with piped content (8.11)
          if (pipedContent && loaded.length === 0) setInput(decodeURIComponent(pipedContent));
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

  // ── Ctrl+Shift+Z global undo hotkey (8.6) ─────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "Z") {
        e.preventDefault();
        void (async () => {
          try {
            const candidates = await api.audit.rollbackCandidates();
            const first = candidates.candidates?.[0];
            if (!first?.filePath) { setToast({ message: "No recent edits to undo" }); return; }
            await api.rollback.rollback(first.filePath);
            setToast({ message: `Rolled back: ${first.filePath.split(/[\\/]/).pop()}` });
          } catch (err) {
            setToast({ message: `Rollback failed: ${err instanceof Error ? err.message : String(err)}` });
          }
        })();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── Token batching helpers ────────────────────────────────────────────────────

  const flushTokenBuffer = useCallback((force = false) => {
    if (_flushTimer.current) {
      clearTimeout(_flushTimer.current);
      _flushTimer.current = null;
    }
    const buffered = _tokenBuf.current;
    _tokenBuf.current = "";
    if (!buffered) return;
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === "assistant") {
        updated[updated.length - 1] = { ...last, content: last.content + buffered };
      }
      return updated;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appendStreamToken = useCallback((token: string) => {
    _tokenBuf.current += token;
    if (_flushTimer.current) return;
    _flushTimer.current = setTimeout(() => flushTokenBuffer(), 50);
  }, [flushTokenBuffer]);

  // ── New chat handler ──────────────────────────────────────────────────────────

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

  // ── Select existing session ───────────────────────────────────────────────────

  function handleSelectSession(id: string) {
    setMessages([]);
    setError(null);
    setPendingActions([]);
    navigate(`/chat?session=${id}`);
  }

  // ── Branch from a session in the sidebar ─────────────────────────────────────

  async function handleBranchSession(sourceId: string) {
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

  // ── Branch from a message bubble ──────────────────────────────────────────────

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

  // ── Apply-to-file shortcut ─────────────────────────────────────────────────────

  function handleApplyToFile(filePath: string) {
    setInput(`/edit ${filePath}`);
    textareaRef.current?.focus();
  }

  // ── Chat-to-chat piping (8.11) ─────────────────────────────────────────────

  async function handlePipeToNewChat(content: string) {
    try {
      const created = await api.sessions.create();
      const newId = created.session.id;
      void qc.invalidateQueries({ queryKey: ["chat-sessions"] });
      navigate(`/chat?session=${newId}&pipe=${encodeURIComponent(content.slice(0, 500))}`);
    } catch { /* ignore */ }
  }

  // ── Sidebar rename/delete callbacks ──────────────────────────────────────────

  async function handleRenameSession(id: string, name: string) {
    await api.sessions.rename(id, name);
    void qc.invalidateQueries({ queryKey: ["chat-sessions"] });
  }

  async function handleDeleteSession(id: string) {
    await api.sessions.delete(id);
    void qc.invalidateQueries({ queryKey: ["chat-sessions"] });
    if (id === sessionId) {
      void handleNewChat();
    }
  }

  // ── STT mic recording ─────────────────────────────────────────────────────────

  async function startRecording() {
    setSttError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("file", blob, "recording.webm");
        try {
          const res = await fetch("/api/stt/transcribe", { method: "POST", body: formData });
          const data = await res.json() as { success: boolean; text?: string; error?: string; unavailable?: boolean };
          if (data.unavailable) {
            setSttError("STT unavailable — install Python 3.10+ and faster-whisper");
          } else if (data.text) {
            setInput(prev => prev ? `${prev} ${data.text}` : (data.text ?? ""));
            textareaRef.current?.focus();
          } else {
            setSttError(data.error ?? "Transcription failed");
          }
        } catch (err) {
          setSttError(err instanceof Error ? err.message : "Transcription error");
        }
        setRecording(false);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (err) {
      setSttError(err instanceof Error ? err.message : "Microphone access denied");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  // ── Screenshot to chat ────────────────────────────────────────────────────────

  async function handleScreenshot() {
    try {
      const res = await fetch("/api/system/os/screenshot", { method: "POST" });
      const data = await res.json() as { success: boolean; base64?: string; message?: string };
      if (data.success && data.base64) {
        const dataUrl = `data:image/png;base64,${data.base64}`;
        setAttachedImages(prev => [...prev, { dataUrl, base64: data.base64!, name: "screenshot.png" }]);
      } else {
        setError(data.message ?? "Screenshot failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screenshot error");
    }
  }

  // ── TTS playback (internal only — called from send) ───────────────────────────

  async function speakText(text: string) {
    if (!speakReplies || !text.trim()) return;
    try {
      const res = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 2000) }),
      });
      if (!res.ok) {
        if (res.status === 503) {
          const body = await res.json().catch(() => ({})) as { unavailable?: boolean; error?: string };
          if (body.unavailable) {
            setToast({ message: "TTS not configured — install Piper: winget install piper-tts" });
          }
        }
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      void audio.play().catch(() => {});
      audio.onended = () => URL.revokeObjectURL(url);
    } catch { /* network error — ignore */ }
  }

  // ── Drag-drop ─────────────────────────────────────────────────────────────────

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const images = Array.from(files).filter(f => f.type.startsWith("image/"));
    const others = Array.from(files).filter(f => !f.type.startsWith("image/"));
    if (images.length > 0) handleImageFiles({ ...images, length: images.length, item: (i: number) => images[i] } as unknown as FileList);
    if (others.length > 0) handleTextFiles({ ...others, length: others.length, item: (i: number) => others[i] } as unknown as FileList);
  }

  // ── Image attach ──────────────────────────────────────────────────────────────

  function handleImageFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1] ?? "";
        setAttachedImages(prev => [...prev, { dataUrl, base64, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
  }

  // ── File/folder attach ────────────────────────────────────────────────────────

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
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const firstFile = files[0];
    const relativePath = (firstFile as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
    const folderName = relativePath.split("/")[0] ?? firstFile.name;
    setWorkspacePath(folderName);
    setUseCodeContext(true);
  }

  // ── Build message text with file attachments ──────────────────────────────────

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

  // ── Slash command handler (2.6) ───────────────────────────────────────────────

  async function handleSlashCommand(command: string) {
    const userMsg: Message = { role: "user", content: command };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setStreaming(true);

    const wgMatch = command.match(/^\/wg-(\S+)(?:\s+(.*))?$/);
    if (wgMatch) {
      const [, sub, args = ""] = wgMatch;
      try {
        let reply = "";
        if (sub === "screenshot") {
          const r = await api.worldgui.screenshot();
          if (r.success) {
            reply = `![Screenshot](data:${r.mimeType};base64,${r.base64.substring(0, 40)}…)\n*Screenshot captured at ${r.capturedAt}*`;
            setAttachedImages(prev => [...prev, {
              dataUrl: `data:${r.mimeType};base64,${r.base64}`,
              base64: r.base64,
              name: `screenshot-${Date.now()}.png`,
            }]);
          } else reply = "Screenshot failed.";
        } else if (sub === "click") {
          const [xStr, yStr] = args.trim().split(/\s+/);
          const x = parseInt(xStr ?? ""), y = parseInt(yStr ?? "");
          if (isNaN(x) || isNaN(y)) {
            reply = "Usage: /wg-click X Y";
          } else {
            const r = await api.worldgui.click(x, y);
            reply = r.success ? `Clicked at (${x}, ${y}).` : "Click failed.";
          }
        } else if (sub === "type") {
          const r = await api.worldgui.type(args);
          reply = r.success ? `Typed: "${args}"` : "Type failed.";
        } else if (sub === "focus") {
          const r = await api.worldgui.focus(args.trim());
          reply = r.success ? `Focused window: "${args.trim()}"` : `Window not found: "${args.trim()}"`;
        } else if (sub === "windows") {
          const r = await api.worldgui.windows(args.trim() || undefined);
          if (r.windows.length === 0) reply = "No windows found.";
          else reply = "**Open windows:**\n" + r.windows.map(w => `- **${w.title || "(no title)"}** (${w.processName})`).join("\n");
        } else {
          reply = `Unknown WorldGUI command: /wg-${sub}\nAvailable: /wg-screenshot, /wg-click X Y, /wg-type TEXT, /wg-focus TITLE, /wg-windows`;
        }
        setMessages(prev => [...prev, { role: "assistant", content: reply }]);
      } catch (err) {
        setMessages(prev => [...prev, { role: "assistant", content: `WorldGUI error: ${err instanceof Error ? err.message : String(err)}` }]);
      } finally {
        setStreaming(false);
      }
      return;
    }

    try {
      const res = await fetch("/api/chat/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, workspacePath: workspacePath || undefined }),
      });
      const data = await res.json() as { success: boolean; message?: string; agentAction?: AgentAction };
      const reply = data.message ?? (data.success ? "Done." : "Command failed.");
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
      if (data.agentAction) {
        setPendingActions(prev => [...prev, data.agentAction!]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setStreaming(false);
    }
  }

  // ── Main send ─────────────────────────────────────────────────────────────────

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || modelLoading) return;

    if (text.startsWith("/")) {
      void handleSlashCommand(text);
      return;
    }

    setError(null);
    setInput("");

    const targetModel = model || undefined;
    if (targetModel) {
      try {
        const runningRes = await api.models.running();
        const isRunning = runningRes.models.some(m => m.name === targetModel);
        if (!isRunning) {
          setModelLoading(true);
          const loadMsg = `Loading ${targetModel} into VRAM… (~15s)`;
          setModelLoadStatus(loadMsg);
          try {
            await api.models.load(targetModel);
            setModelLoadStatus("Model ready ✓");
            setTimeout(() => setModelLoadStatus(null), 2000);
          } catch (loadErr) {
            setModelLoadStatus(`Load warning: ${loadErr instanceof Error ? loadErr.message : String(loadErr)}`);
            setTimeout(() => setModelLoadStatus(null), 5000);
          } finally {
            setModelLoading(false);
          }
        }
      } catch { /* non-fatal — proceed anyway */ }
    }

    const messageText = buildMessageWithAttachments(text);
    const imagesToSend = [...attachedImages];
    setAttachedImages([]);
    setAttachedFiles([]);

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
            if (chunk.agentAction) {
              setPendingActions(prev => [...prev, chunk.agentAction!]);
            }
            if (chunk.token) {
              collectedText += chunk.token;
              appendStreamToken(chunk.token);
            }
          } catch { /* ignore malformed SSE */ }
        }
      }

      let assistantMsgId: string | undefined;
      if (sessionId && collectedText) {
        try {
          const saved = await api.sessions.addMessage(sessionId, "assistant", collectedText);
          assistantMsgId = saved.id;
          void qc.invalidateQueries({ queryKey: ["chat-sessions"] });
        } catch { /* non-fatal */ }
      }

      // Drain any buffered tokens before applying the final completion state
      flushTokenBuffer(true);
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = { ...last, id: assistantMsgId, content: collectedText, streaming: false, supervisor, model: responseModel, context: contextMeta };
        }
        return next;
      });

      if (collectedText) void speakText(collectedText);
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      flushTokenBuffer(true);  // drain any buffered tokens before showing error state
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setMessages(prev => prev.filter(m => !m.streaming));
    } finally {
      setStreaming(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, messages, model, sessionId, workspacePath, useCodeContext, streaming, modelLoading, attachedImages, attachedFiles, appendStreamToken, flushTokenBuffer]);

  // ── Agent Action handlers ─────────────────────────────────────────────────────

  async function handleApproveAction(action: AgentAction, editedValue?: string) {
    if (action.type === "propose_edit") {
      const content = editedValue ?? action.newContent ?? "";
      const filePath = action.filePath!;
      try {
        const result = await api.system.sovereignEdit(filePath, content);
        if ("approvalRequired" in result && result.approvalRequired) {
          setToast({
            message: `Approval queued for ${filePath.split("/").pop()} (${result.approval.id.slice(0, 8)})`,
          });
          return;
        }
        setPendingActions(prev => prev.filter(a => a.id !== action.id));
        const canRestart = settings?.allowAgentSelfHeal !== false;
        setToast({
          message: `Edit applied to ${filePath.split("/").pop()}`,
          actionLabel: canRestart ? "Restart server" : undefined,
          onAction: canRestart
            ? () => {
                void api.system.restart("sovereign-edit via agent action panel")
                  .catch((err) => setError(apiErrorMessage(err, "Restart failed")));
                setToast(null);
              }
            : undefined,
        });
      } catch (err) {
        setError(`Edit failed: ${apiErrorMessage(err)}`);
      }
    } else {
      setPendingActions(prev => prev.filter(a => a.id !== action.id));
    }
  }

  function handleRejectAction(id: string) {
    setPendingActions(prev => prev.filter(a => a.id !== id));
  }

  return {
    messages, setMessages,
    input, setInput,
    model, setModel,
    workspacePath, setWorkspacePath,
    useCodeContext, setUseCodeContext,
    sessionId, sessionLoading,
    sidebarOpen, setSidebarOpen,
    streaming,
    error, setError,
    modelLoadStatus, setModelLoadStatus,
    modelLoading,
    pendingActions, setPendingActions,
    toast, setToast,
    showTree, setShowTree,
    attachedImages, setAttachedImages,
    attachedFiles, setAttachedFiles,
    recording,
    sttError, setSttError,
    startRecording,
    stopRecording,
    handleScreenshot,
    dragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleImageFiles,
    handleTextFiles,
    handleFolderSelect,
    bottomRef,
    textareaRef,
    navigate,
    ollamaOffline,
    settings,
    handleNewChat,
    handleSelectSession,
    handleBranchSession,
    handleBranchFromMessage,
    handleApplyToFile,
    handlePipeToNewChat,
    handleRenameSession,
    handleDeleteSession,
    send,
    handleApproveAction,
    handleRejectAction,
  };
}
