import React, { useRef, type ChangeEvent } from "react";
import {
  Send, Image, Paperclip, FolderOpen, Camera,
  Mic, MicOff, ToggleLeft, ToggleRight, AlertCircle, X,
} from "lucide-react";

export interface ChatInputProps {
  // Textarea
  input: string;
  onChange: (value: string) => void;
  onSend: () => void;
  streaming: boolean;
  modelLoading: boolean;
  modelLoadStatus: string | null;
  hasAttachments: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;

  // Model + workspace — passed as pre-rendered slots to avoid circular import
  modelSelector: React.ReactNode;
  workspaceSelector: React.ReactNode;

  // Code context toggle
  workspacePath: string;
  useCodeContext: boolean;
  onToggleCodeContext: () => void;

  // Attachment handlers (file input refs are internal to this component)
  onImageFiles: (files: FileList | null) => void;
  onTextFiles: (files: FileList | null) => void;
  onFolderSelect: (e: ChangeEvent<HTMLInputElement>) => void;

  // Recording
  recording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;

  // Screenshot
  onScreenshot: () => void;

  // STT error
  sttError: string | null;
  onClearSttError: () => void;
}

const ChatInput = React.memo(function ChatInput({
  input,
  onChange,
  onSend,
  streaming,
  modelLoading,
  modelLoadStatus,
  hasAttachments,
  textareaRef,
  modelSelector,
  workspaceSelector,
  workspacePath,
  useCodeContext,
  onToggleCodeContext,
  onImageFiles,
  onTextFiles,
  onFolderSelect,
  recording,
  onStartRecording,
  onStopRecording,
  onScreenshot,
  sttError,
  onClearSttError,
}: ChatInputProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  return (
    <div className="shrink-0 px-6 pb-6 pt-2" style={{ borderTop: "1px solid var(--color-border)" }}>
      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => onImageFiles(e.target.files)} />
      <input ref={fileInputRef} type="file" multiple className="hidden"
        onChange={e => { onTextFiles(e.target.files); }} />
      <input ref={folderInputRef} type="file"
        {...({ webkitdirectory: "" } as Record<string, string>)}
        className="hidden"
        onChange={onFolderSelect} />

      <div className="rounded-xl overflow-hidden"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming}
          placeholder="Ask anything… (Shift+Enter for newline, /help for commands)"
          rows={1}
          className="w-full px-4 pt-3 pb-2 text-sm resize-none outline-none bg-transparent"
          style={{ color: "var(--color-foreground)", minHeight: 44, maxHeight: 160, lineHeight: 1.5 }}
        />
        <div className="flex items-center justify-between px-3 pb-2.5 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {modelSelector}
            {workspaceSelector}

            {/* Code context toggle */}
            <button
              disabled={!workspacePath}
              onClick={onToggleCodeContext}
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

            {/* Screenshot button */}
            <button
              onClick={onScreenshot}
              title="Screenshot to chat"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
              <Camera size={13} />
            </button>

            {/* Mic button (STT) */}
            <button
              onClick={() => recording ? onStopRecording() : onStartRecording()}
              title={recording ? "Stop recording" : "Voice input (STT)"}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs"
              style={{
                background: recording ? "color-mix(in srgb, var(--color-error) 15%, transparent)" : "var(--color-elevated)",
                color: recording ? "var(--color-error)" : "var(--color-muted)",
                border: `1px solid ${recording ? "color-mix(in srgb, var(--color-error) 30%, transparent)" : "var(--color-border)"}`,
              }}>
              {recording ? <MicOff size={13} /> : <Mic size={13} />}
              {recording && <span className="animate-pulse">●</span>}
            </button>
          </div>

          <button
            onClick={onSend}
            disabled={(!input.trim() && !hasAttachments) || streaming || modelLoading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40"
            style={{ background: "var(--color-accent)", color: "#fff" }}>
            {modelLoading ? (
              <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Loading model</>
            ) : streaming ? (
              <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Thinking</>
            ) : (
              <><Send size={13} /> Send</>
            )}
          </button>
        </div>
      </div>

      {/* Model load status bar */}
      {modelLoadStatus && (
        <div className="text-xs mt-1.5 px-1 flex items-center gap-1.5"
          style={{ color: modelLoadStatus.includes("ready") ? "var(--color-success)" : modelLoadStatus.includes("error") || modelLoadStatus.includes("failed") ? "var(--color-error)" : "var(--color-info)" }}>
          {modelLoading && <div className="w-2.5 h-2.5 border border-current/40 border-t-current rounded-full animate-spin" />}
          {modelLoadStatus}
        </div>
      )}

      <div className="text-xs mt-2 text-center" style={{ color: "var(--color-muted)" }}>
        Enter to send · Shift+Enter for newline · /help for commands
        {useCodeContext && workspacePath && <span style={{ color: "var(--color-info)" }}> · code context active</span>}
      </div>
      {sttError && (
        <div className="text-xs mt-1 text-center flex items-center justify-center gap-1"
          style={{ color: "var(--color-warn)" }}>
          <AlertCircle size={11} />
          <span>{sttError}</span>
          <button onClick={onClearSttError} style={{ color: "var(--color-muted)" }}><X size={10} /></button>
        </div>
      )}
    </div>
  );
});

export default ChatInput;
