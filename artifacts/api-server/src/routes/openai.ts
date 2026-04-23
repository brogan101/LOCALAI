import { Router } from "express";
import type { Response } from "express";
import { randomUUID } from "crypto";
import {
  distributedFetchJson,
  getUniversalGatewayTags,
  sendGatewayChat,
} from "../lib/model-orchestrator.js";
import {
  createChatCompletionChunk,
  createChatCompletionResponse,
  createEmbeddingResponse,
  estimateTokenCount,
  normalizeEmbeddingInput,
  normalizeOpenAIMessages,
} from "../lib/openai-compat.js";

const router = Router();

function writeOpenAISse(response: Response, payload: unknown): void {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function writeOpenAISseDone(response: Response): void {
  response.write("data: [DONE]\n\n");
}

router.get("/models", async (_req, res) => {
  const gateway = await getUniversalGatewayTags();
  return res.json({
    object: "list",
    data: gateway.models.map((model) => ({
      id: model.name,
      object: "model",
      created: Math.floor(new Date(model.modifiedAt).getTime() / 1000) || 0,
      owned_by: "localai",
    })),
  });
});

router.post("/chat/completions", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const messages = normalizeOpenAIMessages(body.messages);
  const stream = body.stream === true;

  if (messages.length === 0) {
    return res.status(400).json({
      error: {
        message: "messages is required and must contain at least one text message",
        type: "invalid_request_error",
      },
    });
  }

  try {
    const result = await sendGatewayChat(messages, model || undefined);
    const promptTokens = messages.reduce((sum, message) => sum + estimateTokenCount(message.content), 0);

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      writeOpenAISse(res, createChatCompletionChunk({ model: result.model, content: result.message }));
      writeOpenAISse(res, createChatCompletionChunk({ model: result.model, done: true }));
      writeOpenAISseDone(res);
      res.end();
      return;
    }

    return res.json(createChatCompletionResponse({
      model: result.model,
      message: result.message,
      promptTokens,
    }));
  } catch (error) {
    return res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : String(error),
        type: "server_error",
      },
    });
  }
});

router.post("/responses", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const input = typeof body.input === "string"
    ? body.input
    : Array.isArray(body.input)
    ? body.input.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("\n")
    : "";

  if (!input.trim()) {
    return res.status(400).json({
      error: {
        message: "input is required",
        type: "invalid_request_error",
      },
    });
  }

  try {
    const result = await sendGatewayChat([{ role: "user", content: input }], model || undefined);
    return res.json({
      id: `resp_${randomUUID()}`,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      model: result.model,
      status: "completed",
      output: [
        {
          id: `msg_${randomUUID()}`,
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: result.message,
            },
          ],
        },
      ],
      output_text: result.message,
    });
  } catch (error) {
    return res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : String(error),
        type: "server_error",
      },
    });
  }
});

router.post("/embeddings", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  const model = typeof body.model === "string" && body.model.trim()
    ? body.model.trim()
    : "nomic-embed-text";
  const inputs = normalizeEmbeddingInput(body.input);

  if (inputs.length === 0) {
    return res.status(400).json({
      error: {
        message: "input is required",
        type: "invalid_request_error",
      },
    });
  }

  try {
    const embeddings: number[][] = [];
    for (const input of inputs) {
      const result = await distributedFetchJson<{ embedding?: number[]; embeddings?: number[][] }>("/api/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: input }),
      }, 120000);
      if (Array.isArray(result.embedding)) {
        embeddings.push(result.embedding);
      } else if (Array.isArray(result.embeddings?.[0])) {
        embeddings.push(result.embeddings[0]);
      } else {
        throw new Error(`Embedding model ${model} returned no embedding vector`);
      }
    }
    return res.json(createEmbeddingResponse({ model, embeddings }));
  } catch (error) {
    return res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : String(error),
        type: "server_error",
      },
    });
  }
});

export default router;
