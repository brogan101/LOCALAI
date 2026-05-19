import React from "react";
import { AlertCircle } from "lucide-react";
import type { Message } from "./useChatState.js";
import { MessageBubble } from "./MessageBubble.js";

export interface MessageListProps {
  messages: Message[];
  error: string | null;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onBranch?: (id: string) => void;
  onApplyToFile?: (filePath: string) => void;
  onPipeToNewChat?: (content: string) => void;
}

const MessageList = React.memo(function MessageList({
  messages,
  error,
  bottomRef,
  onBranch,
  onApplyToFile,
  onPipeToNewChat,
}: MessageListProps) {
  return (
    <>
      {messages.map((msg, i) => (
        <MessageBubble
          key={i}
          msg={msg}
          onBranch={onBranch}
          onApplyToFile={onApplyToFile}
          onPipeToNewChat={onPipeToNewChat}
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
    </>
  );
});

export default MessageList;
