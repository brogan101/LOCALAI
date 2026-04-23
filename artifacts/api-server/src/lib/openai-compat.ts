import { randomUUID } from "crypto";

export type OpenAIChatRole = "system" | "user" | "assistant" | "tool";

export interface OpenAIChatMessage {
  role: OpenAIChatRole;
  content?: unknown;
  name?: string;
}

export interface LocalChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function normalizeOpenAIContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content == null ? "" : String(content);

  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push(part);
      continue;
    }
    if (!part || typeof part !== "object") continue;
    const record = part as Record<string, unknown>;
    if (typeof record.text === "string") {
      parts.push(record.text);
      continue;
    }
    if (record.type === "image_url") {
      const imageUrl = record.image_url;
      const url = imageUrl && typeof imageUrl === "object"
        ? (imageUrl as Record<string, unknown>).url
        : imageUrl;
      if (typeof url === "string") parts.push(`[image: ${url}]`);
    }
  }
  return parts.join("\n").trim();
}

export function normalizeOpenAIMessages(messages: unknown): LocalChatMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message): message is OpenAIChatMessage => !!message && typeof message === "object")
    .map((message) => {
      const role: LocalChatMessage["role"] =
        message.role === "assistant" || message.role === "system" ? message.role : "user";
      const content = normalizeOpenAIContent(message.content);
      return { role, content };
    })
    .filter((message) => message.content.length > 0);
}

export function createChatCompletionResponse(args: {
  model: string;
  message: string;
  promptTokens?: number;
  completionTokens?: number;
}) {
  const promptTokens = args.promptTokens ?? 0;
  const completionTokens = args.completionTokens ?? estimateTokenCount(args.message);
  return {
    id: `chatcmpl-${randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: args.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: args.message,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

export function createChatCompletionChunk(args: {
  model: string;
  content?: string;
  done?: boolean;
}) {
  return {
    id: `chatcmpl-${randomUUID()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: args.model,
    choices: [
      {
        index: 0,
        delta: args.done ? {} : { content: args.content ?? "" },
        finish_reason: args.done ? "stop" : null,
      },
    ],
  };
}

export function createEmbeddingResponse(args: {
  model: string;
  embeddings: number[][];
}) {
  return {
    object: "list",
    data: args.embeddings.map((embedding, index) => ({
      object: "embedding",
      embedding,
      index,
    })),
    model: args.model,
    usage: {
      prompt_tokens: 0,
      total_tokens: 0,
    },
  };
}

export function normalizeEmbeddingInput(input: unknown): string[] {
  if (typeof input === "string") return [input];
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => typeof entry === "string" ? entry : String(entry ?? ""))
    .filter((entry) => entry.length > 0);
}

export function estimateTokenCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}
