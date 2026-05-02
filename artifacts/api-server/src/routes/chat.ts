import { Router } from "express";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { isDangerousCommand } from "../lib/command-sanitizer.js";
import { db } from "../db/database.js";
import { chatSessions, chatMessages } from "../db/schema.js";

import {
  getUniversalGatewayTags,
  streamGatewayChatToSse,
  sendGatewayChat,
  getRunningGatewayModels,
} from "../lib/model-orchestrator.js";
import { proposeModelLifecycleAction } from "../lib/model-lifecycle.js";
import {
  createSelfImprovementProposal,
  proposeSelfMaintainerAction,
  runSelfMaintainerRadar,
} from "../lib/self-maintainer.js";
import { workspaceContextService } from "../lib/code-context.js";
import { thoughtLog } from "../lib/thought-log.js";
import {
  runSupervisorPipeline,
  analyzeMessages,
  activateSupervisorPlan,
  agentDisplayName,
} from "../lib/supervisor-agent.js";
import type { RoutingHint } from "../lib/model-orchestrator.js";
import { recordAuditEvent } from "../lib/platform-foundation.js";

// ── Agent Action types ────────────────────────────────────────────────────────

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

// isDangerousCommand is imported from command-sanitizer.ts

// ── parseAgentActions ─────────────────────────────────────────────────────────

export function parseAgentActions(text: string, workspacePath?: string): AgentAction[] {
  const actions: AgentAction[] = [];

  // ── Pattern a: fenced block with file path in info string ─────────────────
  // ```ts:path/to/file.ts  or  ```typescript:path/to/file
  const fencedWithPath = /```[a-zA-Z0-9_+-]*:([^\s`]+)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fencedWithPath.exec(text)) !== null) {
    const filePath = m[1].trim();
    const newContent = m[2];
    const before = text.slice(0, m.index);
    const rationale = extractRationale(before, 300);
    actions.push({ id: randomUUID(), type: "propose_edit", filePath, newContent, rationale });
  }

  // ── Pattern b: HTML comment file marker above a fence ────────────────────
  // <!-- file: path/to/file.ts -->
  // ```ts ... ```
  const htmlMarker = /<!--\s*file:\s*([^\s>]+)\s*-->\s*```[a-zA-Z0-9_+-]*\n([\s\S]*?)```/g;
  while ((m = htmlMarker.exec(text)) !== null) {
    const filePath = m[1].trim();
    const newContent = m[2];
    const before = text.slice(0, m.index);
    const rationale = extractRationale(before, 300);
    // Avoid double-counting files already matched by pattern a
    if (!actions.some(a => a.type === "propose_edit" && a.filePath === filePath && a.newContent === newContent)) {
      actions.push({ id: randomUUID(), type: "propose_edit", filePath, newContent, rationale });
    }
  }

  // ── Pattern c: WRITE FILE / END FILE marker ───────────────────────────────
  const writeFile = /WRITE FILE:\s*([^\n]+)\n([\s\S]*?)END FILE/g;
  while ((m = writeFile.exec(text)) !== null) {
    const filePath = m[1].trim();
    const newContent = m[2];
    const before = text.slice(0, m.index);
    const rationale = extractRationale(before, 300);
    if (!actions.some(a => a.type === "propose_edit" && a.filePath === filePath)) {
      actions.push({ id: randomUUID(), type: "propose_edit", filePath, newContent, rationale });
    }
  }

  // ── Pattern d: shell fence with exec trigger phrase before it ────────────
  const execTrigger = /(?:run\s+this|execute|do:)[^`]{0,200}```(?:bash|sh|powershell|ps1|cmd)\n([\s\S]*?)```/gi;
  while ((m = execTrigger.exec(text)) !== null) {
    const command = m[1].trim();
    const before = text.slice(0, m.index);
    const rationale = extractRationale(before, 200);
    actions.push({
      id: randomUUID(), type: "propose_command", command,
      cwd: workspacePath, rationale,
    });
  }

  // ── Pattern e: Self-heal <path> ───────────────────────────────────────────
  const selfHeal = /Self-heal\s+([\S]+)/gi;
  while ((m = selfHeal.exec(text)) !== null) {
    const filePath = m[1].trim();
    const before = text.slice(0, m.index);
    const rationale = extractRationale(before, 200);
    actions.push({ id: randomUUID(), type: "propose_self_heal", filePath, maxAttempts: 3, rationale });
  }

  // ── Pattern f: Refactor <workspace>: <request> ───────────────────────────
  const refactor = /Refactor\s+([\S]+):\s*([^\n]+)/gi;
  while ((m = refactor.exec(text)) !== null) {
    const wp = m[1].trim();
    const request = m[2].trim();
    const before = text.slice(0, m.index);
    const rationale = extractRationale(before, 200);
    actions.push({ id: randomUUID(), type: "propose_refactor", workspacePath: wp, request, rationale });
  }

  return actions;
}

function extractRationale(text: string, maxChars: number): string {
  const trimmed = text.trimEnd();
  const snippet = trimmed.length > maxChars ? trimmed.slice(trimmed.length - maxChars) : trimmed;
  // Take the last non-empty sentence or line
  const lines = snippet.split("\n").map(l => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "Agent proposed this action";
}

const router = Router();

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function maybeBuildCodeContext(
  messages: ChatMessage[],
  workspacePath: string | undefined,
  useCodeContext: boolean | undefined
) {
  if (!useCodeContext) return null;
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user")
    ?.content?.trim();
  if (!latestUserMessage) return null;
  try {
    return await workspaceContextService.search(latestUserMessage, workspacePath, 6, 12000);
  } catch {
    return null;
  }
}

async function buildRagContext(query: string, workspacePath?: string): Promise<string> {
  try {
    const { rag } = await import("../lib/rag.js");
    const collections = await rag.listCollections();
    if (collections.length === 0) return "";
    // Include personal-memory + any collections matching this workspace
    const relevantIds = collections
      .filter(c => c.name === "personal-memory" || (workspacePath && c.name.includes(path.basename(workspacePath))))
      .map(c => c.id);
    if (relevantIds.length === 0) return "";
    return await rag.buildRagContext(query, relevantIds, 5);
  } catch {
    return "";
  }
}

function contextSystemPrompt(context: NonNullable<Awaited<ReturnType<typeof maybeBuildCodeContext>>>): string {
  return [
    `You are helping with the workspace "${context.workspace.workspaceName}" at ${context.workspace.rootPath}.`,
    "Use the provided indexed code context before making assumptions.",
    "If the answer depends on code not shown in the context window, say what additional file should be read next.",
    "",
    context.promptContext,
  ].join("\n");
}

function contextMetadata(context: NonNullable<Awaited<ReturnType<typeof maybeBuildCodeContext>>>) {
  return {
    workspaceName: context.workspace.workspaceName,
    workspacePath: context.workspace.rootPath,
    fileCount: context.files.length,
    sectionCount: context.sections.length,
    files: context.files.map((file) => ({
      path: file.path,
      relativePath: file.relativePath,
      score: file.score,
      matchedSymbols: file.matchedSymbols.map((symbol) => `${symbol.kind} ${symbol.name}`),
    })),
  };
}

function chatPromptHash(messages: ChatMessage[]): string {
  return createHash("sha256").update(JSON.stringify(messages.map(message => ({
    role: message.role,
    contentLength: message.content.length,
    contentHash: createHash("sha256").update(message.content).digest("hex"),
  })))).digest("hex");
}

function chatTraceMetadata(input: {
  sessionId?: string;
  workspacePath?: string;
  requestedModel?: string;
  resolvedModel?: string;
  routingIntent?: string;
  messageCount: number;
  promptHash: string;
  contextAttached?: boolean;
  streaming?: boolean;
}) {
  return {
    sessionId: input.sessionId,
    workspacePath: input.workspacePath,
    requestedModel: input.requestedModel,
    resolvedModel: input.resolvedModel,
    provider: "ollama/local",
    routingIntent: input.routingIntent,
    messageCount: input.messageCount,
    promptHash: input.promptHash,
    contextAttached: input.contextAttached === true,
    streaming: input.streaming === true,
  };
}

// GET /chat/models
router.get("/chat/models", async (_req, res) => {
  const gateway = await getUniversalGatewayTags();
  return res.json({
    models: gateway.models.map((model) => ({
      name: model.name,
      paramSize: model.parameterSize,
    })),
    ollamaReachable: gateway.ollamaReachable,
    vramGuard: gateway.vramGuard,
  });
});

// POST /chat/send
router.post("/chat/send", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const workspacePath = typeof body.workspacePath === "string" ? body.workspacePath : undefined;
  const useCodeContext = typeof body.useCodeContext === "boolean" ? body.useCodeContext : undefined;
  const messages: ChatMessage[] = Array.isArray(body.messages)
    ? (body.messages as unknown[]).filter(
        (message): message is ChatMessage =>
          !!message &&
          typeof message === "object" &&
          message !== null &&
          "role" in message &&
          ["system", "user", "assistant"].includes((message as Record<string, unknown>).role as string) &&
          "content" in message &&
          typeof (message as Record<string, unknown>).content === "string"
      )
    : [];

  if (!messages.length) {
    return res.status(400).json({ success: false, message: "messages required" });
  }

  try {
    // Full narrated supervisor pipeline — classifies, plans, updates GlobalState,
    // and streams real-time reasoning to the Thought Log before any LLM call.
    const supervisorPlan = await runSupervisorPipeline(messages, model || undefined);
    const resolvedModel  = model || supervisorPlan.suggestedModel;

    // Build the routing hint so model-orchestrator skips duplicate inference.
    const routingHint: RoutingHint = {
      supervisorIntent:        supervisorPlan.category === "coding"   ? "code"
                             : supervisorPlan.category === "hardware" ? "vision"
                             : "general",
      supervisorSuggestedModel: supervisorPlan.suggestedModel,
    };

    const codeContext = await maybeBuildCodeContext(messages, workspacePath, useCodeContext);
    const upstreamMessages: ChatMessage[] = codeContext
      ? [{ role: "system" as const, content: contextSystemPrompt(codeContext) }, ...messages]
      : messages;

    thoughtLog.publish({
      category: "chat",
      title: "Chat Request",
      message: `${agentDisplayName(supervisorPlan.category)} handling request${resolvedModel ? ` via ${resolvedModel}` : ""}`,
      metadata: {
        workspacePath,
        useCodeContext: !!useCodeContext,
        contextAttached: !!codeContext,
        supervisorCategory: supervisorPlan.category,
        supervisorConfidence: supervisorPlan.confidence,
        manualOverride: supervisorPlan.manualOverride,
        routingIntent: routingHint.supervisorIntent,
      },
    });

    const result = await sendGatewayChat(upstreamMessages, resolvedModel || undefined, routingHint);
    recordAuditEvent({
      eventType: "model_call",
      action: "chat.send",
      target: result.model,
      metadata: chatTraceMetadata({
        sessionId: sessionId || undefined,
        workspacePath,
        requestedModel: model || undefined,
        resolvedModel: result.model,
        routingIntent: routingHint.supervisorIntent,
        messageCount: messages.length,
        promptHash: chatPromptHash(upstreamMessages),
        contextAttached: !!codeContext,
      }),
    });
    const assistantMsg: ChatMessage = { role: "assistant", content: result.message };
    const persistedModel = result.model;

    if (sessionId) {
      const now = new Date().toISOString();
      // Ensure the session row exists (create on-the-fly if needed)
      const exists = db.select({ id: chatSessions.id }).from(chatSessions).where(eq(chatSessions.id, sessionId)).get();
      if (!exists) {
        db.insert(chatSessions).values({ id: sessionId, name: "New Chat", workspacePath: null, createdAt: now, updatedAt: now }).run();
      }
      // Persist both user message(s) and assistant reply
      const lastUser = [...messages].reverse().find(m => m.role === "user");
      if (lastUser) {
        db.insert(chatMessages).values({ id: randomUUID(), sessionId, role: "user", content: lastUser.content, imagesJson: null, supervisorJson: null, contextJson: null, createdAt: now }).run();
      }
      db.insert(chatMessages).values({ id: randomUUID(), sessionId, role: "assistant", content: assistantMsg.content, imagesJson: null, supervisorJson: null, contextJson: null, createdAt: now }).run();
      db.update(chatSessions).set({ updatedAt: now }).where(eq(chatSessions.id, sessionId)).run();
    }

    return res.json({
      success: true,
      model: result.model,
      route: result.route,
      message: assistantMsg,
      sessionId: sessionId || undefined,
      context: codeContext ? contextMetadata(codeContext) : null,
      supervisor: {
        category:    supervisorPlan.category,
        agentName:   agentDisplayName(supervisorPlan.category),
        goal:        supervisorPlan.goal,
        steps:       supervisorPlan.steps,
        confidence:  supervisorPlan.confidence,
        manualOverride: supervisorPlan.manualOverride,
        toolset:     supervisorPlan.toolset,
      },
    });
  } catch (error) {
    recordAuditEvent({
      eventType: "model_call",
      action: "chat.send",
      target: model || "auto",
      result: "failed",
      metadata: {
        sessionId: sessionId || undefined,
        workspacePath,
        promptHash: chatPromptHash(messages),
        messageCount: messages.length,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return res
      .status(500)
      .json({ success: false, message: error instanceof Error ? error.message : String(error) });
  }
});

// POST /chat/stream
router.post("/chat/stream", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const workspacePath = typeof body.workspacePath === "string" ? body.workspacePath : undefined;
  const useCodeContext = typeof body.useCodeContext === "boolean" ? body.useCodeContext : undefined;
  const images: string[] = Array.isArray(body.images)
    ? (body.images as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const messages: ChatMessage[] = Array.isArray(body.messages)
    ? (body.messages as unknown[]).filter(
        (message): message is ChatMessage =>
          !!message &&
          typeof message === "object" &&
          message !== null &&
          "role" in message &&
          ["system", "user", "assistant"].includes((message as Record<string, unknown>).role as string) &&
          "content" in message &&
          typeof (message as Record<string, unknown>).content === "string"
      )
    : [];

  if (!messages.length) {
    return res.status(400).json({ success: false, message: "messages required" });
  }

  try {
    // Full narrated supervisor pipeline — real-time reasoning pushed to Thought Log.
    const supervisorPlan = await runSupervisorPipeline(messages, model || undefined);
    const resolvedModel  = model || supervisorPlan.suggestedModel;

    const routingHint: RoutingHint = {
      supervisorIntent:         images.length > 0
                              ? "vision"
                              : supervisorPlan.category === "coding"   ? "code"
                              : supervisorPlan.category === "hardware" ? "vision"
                              : "general",
      supervisorSuggestedModel: supervisorPlan.suggestedModel,
    };

    const latestUserQuery = [...messages].reverse().find(m => m.role === "user")?.content ?? "";
    const [codeContext, ragContext] = await Promise.all([
      maybeBuildCodeContext(messages, workspacePath, useCodeContext),
      buildRagContext(latestUserQuery, workspacePath),
    ]);

    const systemParts: string[] = [];
    if (codeContext) systemParts.push(contextSystemPrompt(codeContext));
    if (ragContext)  systemParts.push(ragContext);
    const upstreamMessages: ChatMessage[] = systemParts.length > 0
      ? [{ role: "system" as const, content: systemParts.join("\n\n") }, ...messages]
      : messages;

    thoughtLog.publish({
      category: "chat",
      title: "Streaming Chat Request",
      message: `${agentDisplayName(supervisorPlan.category)} streaming via ${resolvedModel || "auto-routed model"}`,
      metadata: {
        workspacePath,
        useCodeContext: !!useCodeContext,
        contextAttached: !!codeContext,
        supervisorCategory: supervisorPlan.category,
        supervisorConfidence: supervisorPlan.confidence,
        routingIntent: routingHint.supervisorIntent,
        hasImages: images.length > 0,
      },
    });

    const supervisorPayload = {
      supervisor: {
        category:   supervisorPlan.category,
        agentName:  agentDisplayName(supervisorPlan.category),
        goal:       supervisorPlan.goal,
        steps:      supervisorPlan.steps,
        confidence: supervisorPlan.confidence,
        toolset:    supervisorPlan.toolset,
      },
    };

    recordAuditEvent({
      eventType: "model_call",
      action: "chat.stream",
      target: resolvedModel || "auto-routed model",
      metadata: chatTraceMetadata({
        workspacePath,
        requestedModel: model || undefined,
        resolvedModel: resolvedModel || undefined,
        routingIntent: routingHint.supervisorIntent,
        messageCount: messages.length,
        promptHash: chatPromptHash(upstreamMessages),
        contextAttached: !!codeContext || !!ragContext,
        streaming: true,
      }),
    });

    await streamGatewayChatToSse(res, {
      messages:       upstreamMessages,
      requestedModel: resolvedModel || undefined,
      routingHint,
      images:         images.length > 0 ? images : undefined,
      initialPayloads: [
        supervisorPayload,
        ...(codeContext ? [{ context: contextMetadata(codeContext) }] : []),
      ],
      onStreamComplete: async (fullText, writeSse) => {
        const actions = parseAgentActions(fullText, workspacePath);
        for (const action of actions) {
          writeSse({ agentAction: action });
          thoughtLog.publish({
            level:    "warning",
            category: "system",
            title:    "Agent Action Proposed",
            message:  `${action.type} — ${action.filePath ?? action.command ?? action.workspacePath ?? ""}`,
            metadata: { ...action },
          });
        }
      },
    });
  } catch (error) {
    recordAuditEvent({
      eventType: "model_call",
      action: "chat.stream",
      target: model || "auto",
      result: "failed",
      metadata: {
        workspacePath,
        promptHash: chatPromptHash(messages),
        messageCount: messages.length,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    if (res.writableEnded || res.destroyed) {
      return;
    }
    if (!res.headersSent) {
      return res
        .status(500)
        .json({ success: false, message: error instanceof Error ? error.message : String(error) });
    }
    res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
  return;
});

// POST /chat/assistant
router.post("/chat/assistant", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const context = typeof body.context === "string" ? body.context : "";
  const workspacePath = typeof body.workspacePath === "string" ? body.workspacePath : undefined;
  const useCodeContext = typeof body.useCodeContext === "boolean" ? body.useCodeContext : undefined;

  if (!prompt) {
    return res.status(400).json({ success: false, message: "prompt required" });
  }

  try {
    const codeContext = await maybeBuildCodeContext(
      [{ role: "user", content: prompt }],
      workspacePath,
      useCodeContext
    );

    const systemPrompt = `You are a concise local AI assistant embedded in LocalAI Control Center.
Help manage configuration, write rules files, and answer questions about the local AI stack.
Be direct and actionable. Return JSON when asked to produce structured data.
${context ? `Current context:\n${context}` : ""}
${codeContext ? `Indexed workspace context:\n${codeContext.promptContext}` : ""}`;

    const result = await sendGatewayChat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      undefined
    );

    return res.json({
      success: true,
      result: result.message,
      model: result.model,
      route: result.route,
      context: codeContext ? contextMetadata(codeContext) : null,
    });
  } catch (error) {
    return res.json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
      result: null,
    });
  }
});

// POST /chat/command
router.post("/chat/command", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const command = typeof body.command === "string" ? body.command.trim() : "";

  if (!command) {
    return res.status(400).json({ success: false, message: "command required" });
  }

  const cmd = command.toLowerCase();

  if (cmd === "check updates" || cmd === "/check-updates" || cmd === "/updates" || cmd === "/maintainer check") {
    const radar = await runSelfMaintainerRadar({ dryRunOnly: true, includeNetworkChecks: false });
    return res.json({
      success: true,
      action: "check_updates",
      message: `Self-maintainer dry-run found ${radar.proposals.length} proposal(s). No update was applied.`,
      radar,
    });
  }

  if (cmd.startsWith("prepare patch") || cmd.startsWith("/prepare-patch")) {
    const request = command.replace(/^\/?prepare[- ]patch/i, "").trim();
    if (!request) return res.status(400).json({ success: false, message: "patch request required" });
    const result = await createSelfImprovementProposal({ request, dryRunOnly: false });
    return res.status(202).json({
      success: false,
      action: "prepare_patch",
      approvalRequired: result.approvalRequired,
      approval: result.approval,
      proposal: result.proposal,
      message: "Self-improvement proposal queued for approval. No code was changed.",
    });
  }

  if (cmd.startsWith("explain update") || cmd.startsWith("/explain-update")) {
    const radar = await runSelfMaintainerRadar({ dryRunOnly: true, includeNetworkChecks: false });
    const query = command.replace(/^\/?explain[- ]update/i, "").trim().toLowerCase();
    const proposal = query
      ? radar.proposals.find((item) => item.id.toLowerCase().includes(query) || item.title.toLowerCase().includes(query) || item.kind.toLowerCase().includes(query))
      : radar.proposals[0];
    return res.json({
      success: true,
      action: "explain_update",
      message: proposal
        ? `${proposal.title}: ${proposal.resultMessage}`
        : "No update proposal matched. Run check updates first.",
      proposal,
    });
  }

  if (cmd === "run tests" || cmd === "/run-tests" || cmd === "/maintainer test") {
    const result = await proposeSelfMaintainerAction({
      action: "test",
      targetIds: ["phase06-required-checks"],
      dryRunOnly: false,
      details: { chatCommand: "run tests", noTestCommandExecuted: true },
    });
    return res.status(result.approvalRequired ? 202 : 200).json({
      success: false,
      action: "run_tests",
      approvalRequired: result.approvalRequired,
      approval: result.approval,
      proposal: result.proposal,
      message: "Test run proposal queued. No command was executed from chat.",
    });
  }

  if (cmd.startsWith("rollback proposal") || cmd.startsWith("/rollback-proposal")) {
    const target = command.replace(/^\/?rollback[- ]proposal/i, "").trim() || "selected-maintainer-proposal";
    const result = await proposeSelfMaintainerAction({
      action: "rollback",
      targetIds: [target],
      dryRunOnly: false,
      details: { chatCommand: "rollback proposal", noRollbackExecuted: true },
    });
    return res.status(result.approvalRequired ? 202 : 200).json({
      success: false,
      action: "rollback_proposal",
      approvalRequired: result.approvalRequired,
      approval: result.approval,
      proposal: result.proposal,
      message: "Rollback proposal queued. No files or models were changed.",
    });
  }

  const installMatch = cmd.match(/^\/(install|pull)\s+(.+)/);
  if (installMatch) {
    const modelName = installMatch[2].trim();
    const proposal = await proposeModelLifecycleAction({ action: "pull", modelName });
    return res.status(202).json({
      success: false,
      action: "install",
      modelName,
      approvalRequired: true,
      approval: proposal.approval,
      proposal,
      message: `Model pull proposal queued for ${modelName}. No model was pulled before approval.`,
    });
  }

  const stopMatch = cmd.match(/^\/stop\s+(.+)/);
  if (stopMatch) {
    const modelName = stopMatch[1].trim();
    const proposal = await proposeModelLifecycleAction({ action: "unload", modelName });
    return res.status(202).json({
      success: false,
      action: "stop",
      modelName,
      approvalRequired: true,
      approval: proposal.approval,
      proposal,
      message: `Model unload proposal queued for ${modelName}. No model was unloaded before approval.`,
    });
  }

  if (cmd === "/models") {
    const gateway = await getUniversalGatewayTags();
    const names = gateway.models.map((model) => model.name);
    return res.json({
      success: true,
      action: "list",
      message: names.length
        ? `Installed models:\n${names.map((name) => `\u2022 ${name}`).join("\n")}`
        : "No models installed.",
    });
  }

  if (cmd === "/status") {
    const [gateway, running] = await Promise.all([getUniversalGatewayTags(), getRunningGatewayModels()]);
    return res.json({
      success: true,
      action: "status",
      message: `**System Status**\nOllama: ${gateway.ollamaReachable ? "running" : "offline"}\nVRAM Guard: ${gateway.vramGuard.mode} (${gateway.vramGuard.status})${
        running.models.length
          ? `\nActive models: ${running.models.map((model) => model.name).join(", ")}`
          : "\nNo models loaded in VRAM"
      }`,
    });
  }

  if (cmd === "/index") {
    const workspaces = await workspaceContextService.refreshKnownWorkspaces("manual");
    return res.json({
      success: true,
      action: "index",
      message: `Code context index refreshed for ${workspaces.length} workspace(s).`,
    });
  }

  if (cmd === "/help") {
    return res.json({
      success: true,
      action: "help",
      message: [
        "**Chat Commands:**",
        "• `/install <model>` — create an approval-gated model pull proposal",
        "• `/stop <model>` — create an approval-gated model unload proposal",
        "• `check updates` — run the self-maintainer update radar in dry-run mode",
        "• `prepare patch <request>` — create an approval-gated self-improvement proposal",
        "• `run tests` — create an approval-gated test-run proposal",
        "• `rollback proposal <id>` — create an approval-gated rollback proposal",
        "• `/models` — list installed models",
        "• `/status` — show system status",
        "• `/index` — refresh the code context index",
        "• `/hardware` — show GPU / CPU / RAM / OS info",
        "• `/models-catalog` — top 10 recommended models",
        "• `/edit <path>` — propose an AI-guided file edit",
        "• `/run <command>` — propose a shell command",
        "• `/refactor <request>` — propose a workspace refactor",
        "• `/rollback <path>` — revert a file to its last backup",
        "• `/pin <text>` — save fact to personal memory (RAG)",
        "• `/web <query>` — web search (SearxNG or DuckDuckGo)",
        "• `/help` — show this message",
      ].join("\n"),
    });
  }

  // ── /hardware ────────────────────────────────────────────────────────────

  if (cmd === "/hardware") {
    const { probeHardware } = await import("../lib/hardware-probe.js");
    const hw = await probeHardware();
    const fmtBytes = (b: number) => {
      const gb = b / 1024 ** 3;
      return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(b / 1024 ** 2).toFixed(0)} MB`;
    };
    const lines = [
      `**GPU:** ${hw.gpu.name} (${fmtBytes(hw.gpu.freeVramBytes)} free / ${fmtBytes(hw.gpu.totalVramBytes)}) [${hw.gpu.probedVia}]`,
      hw.gpu.driver ? `  Driver: ${hw.gpu.driver}` : null,
      `**CPU:** ${hw.cpu.model} — ${hw.cpu.physicalCores}C / ${hw.cpu.logicalCores}T @ ${(hw.cpu.speedMhz / 1000).toFixed(1)} GHz`,
      `**RAM:** ${fmtBytes(hw.ram.freeBytes)} free / ${fmtBytes(hw.ram.totalBytes)}`,
      `**Disk:** ${fmtBytes(hw.disk.installDriveFreeBytes)} free / ${fmtBytes(hw.disk.installDriveTotalBytes)}`,
      `**OS:** ${hw.os.platform} ${hw.os.release}${hw.os.build ? ` (${hw.os.build})` : ""} ${hw.os.arch}`,
      `**Ollama:** ${hw.ollama.reachable ? "✓ reachable" : "✗ unreachable"} @ ${hw.ollama.url}`,
    ].filter(Boolean).join("\n");
    return res.json({ success: true, action: "hardware", message: lines });
  }

  // ── /models-catalog ──────────────────────────────────────────────────────

  if (cmd === "/models-catalog") {
    try {
      const { discoverVerifiedModels } = await import("../lib/model-discovery.js");
      const cards = await discoverVerifiedModels();
      const top10 = cards.slice(0, 10);
      if (top10.length === 0) {
        return res.json({ success: true, action: "models-catalog", message: "No model catalog available." });
      }
      const lines = top10.map((c, i) => {
        return `${i + 1}. **${c.modelName}:${c.tag}** [${c.category}]${c.whyRecommended ? ` — ${c.whyRecommended.slice(0, 80)}` : ""}`;
      }).join("\n");
      return res.json({ success: true, action: "models-catalog", message: `**Top 10 Recommended Models:**\n${lines}` });
    } catch {
      return res.json({ success: false, message: "Model catalog unavailable — Ollama may be offline." });
    }
  }

  // ── /edit <path> ─────────────────────────────────────────────────────────

  const editMatch = command.match(/^\/edit\s+(\S+)/i);
  if (editMatch) {
    const filePath = editMatch[1].trim();
    const action: AgentAction = {
      id:        randomUUID(),
      type:      "propose_edit",
      filePath,
      newContent: "",
      rationale:  `User requested an edit of ${filePath} via /edit command`,
    };
    return res.json({
      success: true,
      action: "edit",
      message: `Edit proposed for \`${filePath}\`. Paste the new file content in the Agent Action panel, then click Approve.`,
      agentAction: action,
    });
  }

  // ── /run <command> ───────────────────────────────────────────────────────

  const runMatch = command.match(/^\/run\s+(.+)/i);
  if (runMatch) {
    const shellCmd = runMatch[1].trim();
    const sanity = isDangerousCommand(shellCmd);
    if (sanity.dangerous) {
      thoughtLog.publish({ level: "error", category: "security", title: "Dangerous /run Blocked", message: `${sanity.reason}: ${shellCmd}` });
      return res.status(403).json({ success: false, reason: sanity.reason, blocked: true });
    }
    const action: AgentAction = {
      id:       randomUUID(),
      type:     "propose_command",
      command:  shellCmd,
      cwd:      typeof body.workspacePath === "string" ? body.workspacePath : undefined,
      rationale: `User requested command via /run`,
    };
    return res.json({
      success: true,
      action: "run",
      message: `Command proposed: \`${shellCmd}\`. Review in the Agent Action panel and click Approve to execute.`,
      agentAction: action,
    });
  }

  // ── /refactor <request> ──────────────────────────────────────────────────

  const refactorMatch = command.match(/^\/refactor\s+(.+)/i);
  if (refactorMatch) {
    const request = refactorMatch[1].trim();
    const wsPath = typeof body.workspacePath === "string" ? body.workspacePath : undefined;
    if (!wsPath) {
      return res.json({ success: false, message: "No workspace selected. Pick a workspace context first." });
    }
    const action: AgentAction = {
      id:            randomUUID(),
      type:          "propose_refactor",
      workspacePath: wsPath,
      request,
      rationale:     `User requested refactor via /refactor`,
    };
    return res.json({
      success: true,
      action: "refactor",
      message: `Refactor proposed for workspace. Review in the Agent Action panel and click Approve to plan.`,
      agentAction: action,
    });
  }

  // ── /rollback <path> ─────────────────────────────────────────────────────

  const rollbackMatch = command.match(/^\/rollback\s+(\S+)/i);
  if (rollbackMatch) {
    const filePath = rollbackMatch[1].trim();
    try {
      const { rollbackFile } = await import("../lib/snapshot-manager.js");
      const result = await rollbackFile(filePath);
      return res.json({
        success: true,
        action: "rollback",
        message: `Rolled back \`${filePath}\` to snapshot from ${result.createdAt ? new Date(result.createdAt).toLocaleString() : "backup"}.`,
      });
    } catch (err) {
      return res.json({
        success: false,
        message: `Rollback failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // ── /pin <text> — ingest into personal-memory collection ────────────────

  if (cmd.startsWith("/pin ")) {
    const text = command.slice(5).trim();
    if (!text) return res.json({ success: false, message: "/pin requires text" });
    try {
      const { rag } = await import("../lib/rag.js");
      const collections = await rag.listCollections();
      let memCol = collections.find(c => c.name === "personal-memory");
      if (!memCol) memCol = await rag.createCollection("personal-memory");
      await rag.ingest(memCol.id, { content: text, source: "pin" });
      return res.json({ success: true, action: "pin", message: `Pinned to personal memory: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"` });
    } catch (err) {
      return res.json({ success: false, message: `Pin failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // ── /web <query> — web search ────────────────────────────────────────────

  if (cmd.startsWith("/web ")) {
    const query = command.slice(5).trim();
    if (!query) return res.json({ success: false, message: "/web requires a query" });
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      const apiRes = await fetch(`http://127.0.0.1:3001/api/web/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));
      const data = await apiRes.json() as { success: boolean; results?: Array<{ title: string; url: string; snippet: string }>; backend?: string };
      if (!data.success || !data.results?.length) {
        return res.json({ success: true, action: "web", message: "No results found." });
      }
      const lines = data.results.slice(0, 5).map((r, i) =>
        `${i + 1}. **[${r.title}](${r.url})**\n   ${r.snippet}`
      ).join("\n\n");
      return res.json({
        success: true,
        action: "web",
        message: `**Web Search: "${query}"** (via ${data.backend ?? "search"})\n\n${lines}`,
      });
    } catch (err) {
      return res.json({ success: false, message: `Web search failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  return res.json({
    success: false,
    message: `Unknown command: ${command}. Type /help to see available commands.`,
  });
});

export default router;
