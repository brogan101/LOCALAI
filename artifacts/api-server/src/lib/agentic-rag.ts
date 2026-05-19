/**
 * AGENTIC RAG — Multi-step Reasoning Loop
 * =========================================
 * Replaces the linear single-pass RAG pipeline with a self-correcting
 * agentic loop that:
 *
 *   1. Plans a retrieval strategy from the initial query
 *   2. Executes retrieval and scores chunk relevance
 *   3. Detects knowledge gaps via a dedicated gap-analysis prompt
 *   4. Self-corrects the query and re-retrieves if gaps exist
 *   5. Synthesizes a final answer with full provenance
 *
 * Architecture:
 *
 *   agenticRag(query, options)
 *     → planRetrieval()          → produces RetrievalPlan (sub-queries + strategy)
 *     → executeRetrieval()       → parallel retrieval across collections
 *     → scoreChunks()            → LLM-based relevance scoring
 *     → gapAnalysis()            → finds what's still unknown
 *     → [loop up to maxIterations]
 *     → synthesize()             → final answer with citations
 *
 * This module is the *reasoning layer* — it calls rag.query() and the local
 * Ollama chat endpoint.  It does not manage indexes directly.
 *
 * Usage:
 *   import { agenticRag } from "./agentic-rag.js";
 *   const result = await agenticRag("How do I tune valve timing on the LQ4?", {
 *     collections: ["automotive", "aces-ecu"],
 *     maxIterations: 3,
 *   });
 */

import { logger } from "./logger.js";
import { thoughtLog } from "./thought-log.js";
import { stackModel } from "../config/models.config.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AgenticRagOptions {
  /** Collections to search. Defaults to all available. */
  collections?: string[];
  /** Max query-correct-retrieval iterations. Default 3. */
  maxIterations?: number;
  /** Min relevance score (0–1) to keep a chunk. Default 0.5. */
  relevanceThreshold?: number;
  /** Max chunks to carry into synthesis. Default 12. */
  maxChunks?: number;
  /** Override the reasoning model (default: stackModel("deep-reasoning")). */
  reasoningModel?: string;
  /** Override the fast model for scoring (default: stackModel("fast-coding")). */
  scoringModel?: string;
  /** Ollama base URL. Default http://localhost:11434. */
  ollamaBaseUrl?: string;
  /** Emit thought-log events during loop. Default true. */
  verbose?: boolean;
  /** If true, return all intermediate loop states in result. */
  includeTrace?: boolean;
}

export interface RagChunk {
  id: string;
  text: string;
  source: string;
  collection: string;
  score: number;          // cosine similarity from vector store
  llmScore?: number;      // LLM-assigned relevance (0–1)
  iteration: number;      // which loop iteration produced this
}

export interface RetrievalPlan {
  primaryQuery: string;
  subQueries: string[];
  strategy: "broad" | "targeted" | "comparative";
  rationale: string;
  estimatedGaps: string[];
}

export interface GapAnalysis {
  hasGaps: boolean;
  gaps: string[];
  correctedQueries: string[];
  confidence: number;     // 0–1 confidence that current chunks answer the query
  reasoning: string;
}

export interface AgenticRagIteration {
  iteration: number;
  queries: string[];
  chunksRetrieved: number;
  chunksKept: number;
  gapAnalysis: GapAnalysis;
  durationMs: number;
}

export interface AgenticRagResult {
  answer: string;
  citations: RagChunk[];
  plan: RetrievalPlan;
  iterations: AgenticRagIteration[];
  totalChunks: number;
  converged: boolean;       // true if gap analysis said "no gaps"
  confidence: number;
  durationMs: number;
  model: string;
  trace?: AgenticRagIteration[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Ollama chat helper (reuses the existing local endpoint)
// ─────────────────────────────────────────────────────────────────────────────

interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function ollamaChat(
  messages: OllamaMessage[],
  model: string,
  baseUrl: string,
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const payload = {
    model,
    messages,
    stream: false,
    options: {
      temperature: opts.temperature ?? 0.1,
      num_predict: opts.maxTokens ?? 1024,
    },
  };

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama chat failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { message?: { content?: string } };
  return data.message?.content?.trim() ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// RAG retrieval (thin wrapper — calls existing rag.query)
// ─────────────────────────────────────────────────────────────────────────────

async function retrieveChunks(
  queries: string[],
  collections: string[],
  iteration: number,
): Promise<RagChunk[]> {
  // Lazy import to avoid circular dependency at module load
  const { rag } = await import("./rag.js");

  const allChunks: RagChunk[] = [];
  const seen = new Set<string>();

  for (const collectionId of collections) {
    for (const query of queries) {
      try {
        const results = await rag.search(query, [collectionId], 6);
        for (const r of results) {
          const key = `${collectionId}::${r.id ?? r.text.slice(0, 64)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          allChunks.push({
            id: r.id ?? key,
            text: r.text,
            source: r.source ?? collectionId,
            collection: collectionId,
            score: r.score ?? 0,
            iteration,
          });
        }
      } catch (err) {
        logger.warn({ err, collectionId, query }, "agentic-rag: retrieval error (continuing)");
      }
    }
  }

  return allChunks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Planning
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_SYSTEM = `You are a retrieval planner for a local AI knowledge base.
Given a user query, produce a JSON retrieval plan with these exact fields:
{
  "primaryQuery": "the cleaned canonical query",
  "subQueries": ["2-4 more specific sub-queries that decompose the intent"],
  "strategy": "broad" | "targeted" | "comparative",
  "rationale": "1 sentence explaining the plan",
  "estimatedGaps": ["what you expect might be missing from the knowledge base"]
}
Respond with ONLY the JSON object. No markdown. No explanation.`;

async function planRetrieval(
  query: string,
  model: string,
  baseUrl: string,
): Promise<RetrievalPlan> {
  try {
    const raw = await ollamaChat(
      [
        { role: "system", content: PLAN_SYSTEM },
        { role: "user", content: `Query: ${query}` },
      ],
      model,
      baseUrl,
      { maxTokens: 512, temperature: 0.1 },
    );

    const cleaned = raw.replace(/```json|```/g, "").trim();
    const plan = JSON.parse(cleaned) as RetrievalPlan;

    // Validate shape
    if (!plan.primaryQuery || !Array.isArray(plan.subQueries)) {
      throw new Error("Invalid plan shape");
    }
    return plan;
  } catch (err) {
    logger.warn({ err }, "agentic-rag: plan failed, using fallback");
    return {
      primaryQuery: query,
      subQueries: [query],
      strategy: "broad",
      rationale: "Fallback: using original query as-is",
      estimatedGaps: [],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Chunk Scoring
// ─────────────────────────────────────────────────────────────────────────────

const SCORE_SYSTEM = `You are a relevance judge for RAG retrieval.
Given a query and retrieved text chunks, score each chunk's relevance from 0.0 to 1.0.
Respond with ONLY a JSON array of numbers, one per chunk, in the same order.
Example: [0.9, 0.3, 0.8, 0.1]`;

async function scoreChunks(
  query: string,
  chunks: RagChunk[],
  model: string,
  baseUrl: string,
  threshold: number,
): Promise<RagChunk[]> {
  if (chunks.length === 0) return [];

  // Score in batches of 8 to stay within context
  const BATCH = 8;
  const scored: RagChunk[] = [];

  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const chunkText = batch
      .map((c, idx) => `[${idx}] ${c.text.slice(0, 400)}`)
      .join("\n\n");

    try {
      const raw = await ollamaChat(
        [
          { role: "system", content: SCORE_SYSTEM },
          { role: "user", content: `Query: ${query}\n\nChunks:\n${chunkText}` },
        ],
        model,
        baseUrl,
        { maxTokens: 64, temperature: 0.0 },
      );

      const cleaned = raw.replace(/```json?|```/g, "").trim();
      const scores = JSON.parse(cleaned) as number[];

      for (let j = 0; j < batch.length; j++) {
        const llmScore = scores[j] ?? batch[j].score;
        if (llmScore >= threshold) {
          scored.push({ ...batch[j], llmScore });
        }
      }
    } catch {
      // Scoring failed — fall back to vector score
      for (const chunk of batch) {
        if (chunk.score >= threshold) {
          scored.push({ ...chunk, llmScore: chunk.score });
        }
      }
    }
  }

  return scored.sort((a, b) => (b.llmScore ?? b.score) - (a.llmScore ?? a.score));
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Gap Analysis
// ─────────────────────────────────────────────────────────────────────────────

const GAP_SYSTEM = `You are a knowledge gap analyst.
Given a query and the retrieved context chunks, determine what information is still missing.
Respond with ONLY this JSON:
{
  "hasGaps": true | false,
  "gaps": ["specific missing info 1", "..."],
  "correctedQueries": ["refined query 1 targeting the gap", "..."],
  "confidence": 0.0-1.0,
  "reasoning": "1 sentence"
}
If confidence >= 0.85, set hasGaps to false even if minor gaps exist.`;

async function analyzeGaps(
  query: string,
  chunks: RagChunk[],
  model: string,
  baseUrl: string,
): Promise<GapAnalysis> {
  const contextSample = chunks
    .slice(0, 8)
    .map((c, i) => `[${i + 1}] ${c.text.slice(0, 300)}`)
    .join("\n\n");

  try {
    const raw = await ollamaChat(
      [
        { role: "system", content: GAP_SYSTEM },
        {
          role: "user",
          content: `Query: ${query}\n\nRetrieved context:\n${contextSample}`,
        },
      ],
      model,
      baseUrl,
      { maxTokens: 512, temperature: 0.1 },
    );

    const cleaned = raw.replace(/```json?|```/g, "").trim();
    return JSON.parse(cleaned) as GapAnalysis;
  } catch (err) {
    logger.warn({ err }, "agentic-rag: gap analysis failed, assuming no gaps");
    return {
      hasGaps: false,
      gaps: [],
      correctedQueries: [],
      confidence: 0.6,
      reasoning: "Gap analysis unavailable — using retrieved context as-is",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Synthesis
// ─────────────────────────────────────────────────────────────────────────────

const SYNTHESIS_SYSTEM = `You are a precise technical assistant.
Answer the user's query using ONLY the provided context chunks.
- Cite sources using [N] notation where N is the chunk index.
- If the context is insufficient, say so explicitly rather than guessing.
- Be direct and specific. No filler.`;

async function synthesize(
  query: string,
  chunks: RagChunk[],
  model: string,
  baseUrl: string,
): Promise<string> {
  const context = chunks
    .slice(0, 12)
    .map((c, i) => `[${i + 1}] (${c.source}) ${c.text}`)
    .join("\n\n");

  return ollamaChat(
    [
      { role: "system", content: SYNTHESIS_SYSTEM },
      { role: "user", content: `Query: ${query}\n\nContext:\n${context}` },
    ],
    model,
    baseUrl,
    { maxTokens: 2048, temperature: 0.2 },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export — agenticRag()
// ─────────────────────────────────────────────────────────────────────────────

export async function agenticRag(
  query: string,
  options: AgenticRagOptions = {},
): Promise<AgenticRagResult> {
  const startMs = Date.now();

  const {
    collections = [],
    maxIterations = 3,
    relevanceThreshold = 0.5,
    maxChunks = 12,
    reasoningModel = stackModel("deep-reasoning"),
    scoringModel = stackModel("fast-coding"),
    ollamaBaseUrl = "http://localhost:11434",
    verbose = true,
    includeTrace = false,
  } = options;

  if (verbose) {
    thoughtLog.publish({
      category: "rag",
      title: "Agentic RAG started",
      message: `query="${query.slice(0, 80)}" collections=${collections.join(",") || "all"} maxIter=${maxIterations}`,
    });
  }

  // ── Phase 1: Plan
  const plan = await planRetrieval(query, reasoningModel, ollamaBaseUrl);

  if (verbose) {
    thoughtLog.publish({
      category: "rag",
      title: "Retrieval plan",
      message: `strategy=${plan.strategy} subQueries=${plan.subQueries.length} estimatedGaps=${plan.estimatedGaps.length}`,
      metadata: plan as unknown as Record<string, unknown>,
    });
  }

  // Resolve collections — if empty, query all registered collections
  let targetCollections = collections;
  if (targetCollections.length === 0) {
    try {
      const { rag } = await import("./rag.js");
      targetCollections = (await rag.listCollections()).map((c: { id: string }) => c.id);
    } catch {
      targetCollections = ["default"];
    }
  }

  // ── Phase 2–N: Agentic loop
  const allChunks: RagChunk[] = [];
  const iterationTrace: AgenticRagIteration[] = [];
  let activeQueries = [plan.primaryQuery, ...plan.subQueries];
  let converged = false;
  let lastGap: GapAnalysis = { hasGaps: true, gaps: [], correctedQueries: [], confidence: 0, reasoning: "" };

  for (let iter = 1; iter <= maxIterations; iter++) {
    const iterStart = Date.now();

    if (verbose) {
      thoughtLog.publish({
        category: "rag",
        title: `RAG iteration ${iter}/${maxIterations}`,
        message: `queries=${activeQueries.length}`,
      });
    }

    // Retrieve
    const raw = await retrieveChunks(activeQueries, targetCollections, iter);

    // Score and filter
    const scored = await scoreChunks(query, raw, scoringModel, ollamaBaseUrl, relevanceThreshold);

    // Merge into allChunks (dedup by id)
    const existingIds = new Set(allChunks.map((c) => c.id));
    let newCount = 0;
    for (const chunk of scored) {
      if (!existingIds.has(chunk.id)) {
        allChunks.push(chunk);
        existingIds.add(chunk.id);
        newCount++;
      }
    }

    // Gap analysis on current best chunks
    const bestChunks = [...allChunks]
      .sort((a, b) => (b.llmScore ?? b.score) - (a.llmScore ?? a.score))
      .slice(0, maxChunks);

    lastGap = await analyzeGaps(query, bestChunks, reasoningModel, ollamaBaseUrl);

    const iterRecord: AgenticRagIteration = {
      iteration: iter,
      queries: activeQueries,
      chunksRetrieved: raw.length,
      chunksKept: newCount,
      gapAnalysis: lastGap,
      durationMs: Date.now() - iterStart,
    };
    iterationTrace.push(iterRecord);

    if (verbose) {
      thoughtLog.publish({
        category: "rag",
        title: `Iteration ${iter} complete`,
        message: `retrieved=${raw.length} kept=${newCount} hasGaps=${lastGap.hasGaps} confidence=${lastGap.confidence.toFixed(2)}`,
        metadata: { gaps: lastGap.gaps },
      });
    }

    if (!lastGap.hasGaps || lastGap.confidence >= 0.85) {
      converged = true;
      break;
    }

    if (lastGap.correctedQueries.length === 0) {
      // No new queries to try — exit early
      break;
    }

    activeQueries = lastGap.correctedQueries;
  }

  // ── Phase 3: Synthesize
  const finalChunks = [...allChunks]
    .sort((a, b) => (b.llmScore ?? b.score) - (a.llmScore ?? a.score))
    .slice(0, maxChunks);

  const answer = finalChunks.length > 0
    ? await synthesize(query, finalChunks, reasoningModel, ollamaBaseUrl)
    : "No relevant information found in the knowledge base for this query.";

  const totalMs = Date.now() - startMs;

  if (verbose) {
    thoughtLog.publish({
      category: "rag",
      title: "Agentic RAG complete",
      message: `converged=${converged} chunks=${finalChunks.length} confidence=${lastGap.confidence.toFixed(2)} ${totalMs}ms`,
    });
  }

  return {
    answer,
    citations: finalChunks,
    plan,
    iterations: iterationTrace,
    totalChunks: allChunks.length,
    converged,
    confidence: lastGap.confidence,
    durationMs: totalMs,
    model: reasoningModel,
    trace: includeTrace ? iterationTrace : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple non-agentic RAG query (for fast paths where 1-shot is enough)
// ─────────────────────────────────────────────────────────────────────────────

export async function simpleRag(
  query: string,
  collections: string[],
  options: Pick<AgenticRagOptions, "ollamaBaseUrl" | "reasoningModel" | "relevanceThreshold"> = {},
): Promise<{ answer: string; chunks: RagChunk[] }> {
  const {
    ollamaBaseUrl = "http://localhost:11434",
    reasoningModel = stackModel("fast-coding"),
    relevanceThreshold = 0.4,
  } = options;

  const raw = await retrieveChunks([query], collections, 1);
  const scored = await scoreChunks(query, raw, reasoningModel, ollamaBaseUrl, relevanceThreshold);
  const answer = scored.length > 0
    ? await synthesize(query, scored.slice(0, 8), reasoningModel, ollamaBaseUrl)
    : "No relevant chunks found.";

  return { answer, chunks: scored };
}
