import assert from "node:assert/strict";
import express from "express";
import { initDatabase } from "../src/db/migrate.js";
import { sqlite } from "../src/db/database.js";
import { rag, ragTestHooks } from "../src/lib/rag.js";
import ragRoute from "../src/routes/rag.js";

await initDatabase();

let assertions = 0;

function fakeEmbedding(text: string): number[] {
  const vec = new Array(768).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % vec.length] += text.charCodeAt(i) / 255;
  }
  vec[0] += 1;
  return vec;
}

ragTestHooks.setEmbedderForTests(async (text) => fakeEmbedding(text));

function inject(method: string, routePath: string, body?: unknown): Promise<{ status: number; payload: any }> {
  const app = express();
  app.use(express.json());
  app.use(ragRoute);

  return new Promise((resolve, reject) => {
    const query: Record<string, string> = {};
    const [pathname, queryString] = routePath.split("?");
    if (queryString) {
      for (const [key, value] of new URLSearchParams(queryString)) query[key] = value;
    }
    const request = {
      method,
      url: routePath,
      originalUrl: routePath,
      baseUrl: "",
      path: pathname,
      headers: { "content-type": "application/json" },
      body,
      query,
      params: {},
      get(name: string) {
        return (this.headers as Record<string, string>)[name.toLowerCase()];
      },
      header(name: string) {
        return this.get(name);
      },
    };
    let statusCode = 200;
    const response = {
      status(code: number) {
        statusCode = code;
        return response;
      },
      json(payload: any) {
        resolve({ status: statusCode, payload });
        return response;
      },
      send(payload: any) {
        resolve({ status: statusCode, payload });
        return response;
      },
      end(payload?: any) {
        resolve({ status: statusCode, payload });
        return response;
      },
      setHeader() {},
      getHeader() {
        return undefined;
      },
      removeHeader() {},
    };

    app.handle(request as any, response as any, (error: unknown) => {
      if (error) reject(error);
      else resolve({ status: 404, payload: undefined });
    });
  });
}

const collection = await rag.createCollection(`phase08a-rag-${Date.now()}`);
assert.equal(collection.vectorProvider, "hnswlib");
assert.equal(collection.providerStatus.status, "available");
assertions += 2;

const status = rag.providerStatus();
assert.equal(status.defaults.vectorStore, "hnswlib");
assert.equal(status.ingestion.find(provider => provider.id === "builtin")?.status, "available");
assert.equal(status.ingestion.find(provider => provider.id === "markitdown")?.status, "not_configured");
assert.equal(status.ingestion.find(provider => provider.id === "docling")?.status, "not_configured");
assert.equal(status.ingestion.find(provider => provider.id === "ocr")?.status, "not_configured");
assert.equal(status.vectorStores.find(provider => provider.id === "lancedb")?.status, "not_configured");
assert.equal(status.vectorStores.find(provider => provider.id === "qdrant")?.status, "not_configured");
assertions += 7;

const privateContent = [
  "Phase 08A local document about garage wiring references.",
  "SECRET_PHASE08A_VALUE_SHOULD_NOT_BE_LOGGED",
  "The useful searchable phrase is blue relay bracket.",
].join("\n");

const first = await rag.ingest(collection.id, {
  content: privateContent,
  source: "phase08a-private-note.md",
});
assert.equal(first.skipped, false);
assert.ok(first.chunksAdded > 0);
assert.equal(first.chunksRemoved, 0);
assert.equal(first.source.parserUsed, "builtin");
assert.equal(first.source.citation.page, "unavailable");
assert.equal(first.source.citation.section, "unavailable");
assert.equal(first.providerStatus.status, "available");
assertions += 7;

const second = await rag.ingest(collection.id, {
  content: privateContent,
  source: "phase08a-private-note.md",
});
assert.equal(second.skipped, true);
assert.equal(second.chunksAdded, 0);
assert.equal(second.source.status, "skipped_unchanged");
assertions += 3;

const changed = await rag.ingest(collection.id, {
  content: privateContent.replace("blue relay bracket", "green relay bracket and fuse label"),
  source: "phase08a-private-note.md",
});
assert.equal(changed.skipped, false);
assert.ok(changed.chunksAdded > 0);
assert.ok(changed.chunksRemoved > 0);
assert.equal(changed.source.status, "reindexed");
assertions += 4;

const sources = await rag.listSources(collection.id);
assert.ok(sources.some(source => source.status === "deleted" && source.deletedAt), "Changed source should leave stale old source metadata marked deleted");
assert.ok(sources.some(source => source.status === "reindexed" && !source.deletedAt), "Changed source should create an active reindexed source");
assertions += 2;

const chunks = await rag.listChunks(collection.id, changed.source.id);
assert.ok(chunks.length > 0);
assert.equal(chunks[0].citation.page, "unavailable");
assert.equal(chunks[0].citation.section, "unavailable");
assertions += 3;

const searchResults = await rag.search("green relay bracket", [collection.id], 3);
assert.ok(searchResults.length > 0);
assert.ok(searchResults.some(chunk => chunk.source === "phase08a-private-note.md"));
assert.equal(searchResults[0].citation.page, "unavailable");
assertions += 3;

const deleted = await rag.markSourceDeleted(collection.id, changed.source.id);
assert.ok(deleted.chunksRemoved > 0);
const activeAfterDelete = await rag.listChunks(collection.id, changed.source.id);
assert.equal(activeAfterDelete.length, 0);
assert.equal(deleted.source?.status, "deleted");
assertions += 3;

const routeStatus = await inject("GET", "/rag/status");
assert.equal(routeStatus.status, 200);
assert.equal(routeStatus.payload.vectorStores.find((provider: any) => provider.id === "qdrant")?.status, "not_configured");
assertions += 2;

const routeReindex = await inject("POST", "/rag/reindex", {
  collectionId: collection.id,
  content: "Route reindex content with citation metadata available only by source.",
  source: "route-source.md",
});
assert.equal(routeReindex.status, 200);
assert.equal(routeReindex.payload.success, true);
assert.equal(routeReindex.payload.source.citation.page, "unavailable");
assertions += 3;

const routeSources = await inject("GET", `/rag/collections/${collection.id}/sources`);
assert.equal(routeSources.status, 200);
assert.ok(routeSources.payload.sources.length >= 1);
assertions += 2;

const routeChunks = await inject("GET", `/rag/collections/${collection.id}/chunks?sourceId=${encodeURIComponent(routeReindex.payload.source.id)}`);
assert.equal(routeChunks.status, 200);
assert.ok(routeChunks.payload.chunks.length >= 1);
assertions += 2;

const auditRows = sqlite.prepare(`
  SELECT metadata_json FROM audit_events
  WHERE event_type = 'rag_ingestion'
  ORDER BY created_at DESC
  LIMIT 25
`).all() as Array<{ metadata_json: string }>;
const thoughtRows = sqlite.prepare(`
  SELECT message, metadata_json FROM thought_log
  WHERE category = 'rag'
  ORDER BY timestamp DESC
  LIMIT 25
`).all() as Array<{ message: string; metadata_json: string | null }>;
const logText = JSON.stringify({ auditRows, thoughtRows });
assert.ok(!logText.includes("SECRET_PHASE08A_VALUE_SHOULD_NOT_BE_LOGGED"), "RAG audit/thought logs must not dump private document contents");
assert.ok(!logText.includes("green relay bracket and fuse label"), "RAG audit/thought logs must not dump private chunk text");
assertions += 2;

ragTestHooks.setEmbedderForTests(null);

console.log(`rag.test.ts passed (${assertions} assertions)`);
