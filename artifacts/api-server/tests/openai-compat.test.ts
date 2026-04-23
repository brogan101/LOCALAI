import assert from "node:assert/strict";
import {
  createChatCompletionResponse,
  createEmbeddingResponse,
  normalizeEmbeddingInput,
  normalizeOpenAIContent,
  normalizeOpenAIMessages,
} from "../src/lib/openai-compat.js";

assert.equal(normalizeOpenAIContent("hello"), "hello");
assert.equal(
  normalizeOpenAIContent([
    { type: "text", text: "inspect this" },
    { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
  ]),
  "inspect this\n[image: data:image/png;base64,abc]",
);

assert.deepEqual(
  normalizeOpenAIMessages([
    { role: "system", content: "system" },
    { role: "user", content: [{ type: "text", text: "question" }] },
    { role: "tool", content: "tool output" },
  ]),
  [
    { role: "system", content: "system" },
    { role: "user", content: "question" },
    { role: "user", content: "tool output" },
  ],
);

assert.deepEqual(normalizeEmbeddingInput("one"), ["one"]);
assert.deepEqual(normalizeEmbeddingInput(["one", "two", null]), ["one", "two"]);

const completion = createChatCompletionResponse({ model: "qwen:test", message: "done", promptTokens: 2 });
assert.equal(completion.object, "chat.completion");
assert.equal(completion.model, "qwen:test");
assert.equal(completion.choices[0]?.message.content, "done");
assert.equal(completion.usage.prompt_tokens, 2);

const embedding = createEmbeddingResponse({ model: "embed:test", embeddings: [[0.1, 0.2]] });
assert.equal(embedding.object, "list");
assert.deepEqual(embedding.data[0]?.embedding, [0.1, 0.2]);

console.log("openai-compat.test.ts passed");
