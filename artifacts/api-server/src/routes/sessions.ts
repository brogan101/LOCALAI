/**
 * sessions.ts — CRUD + branch for chat sessions.
 *
 * GET    /chat/sessions           list all sessions (newest first)
 * GET    /chat/sessions/:id       full session with messages
 * POST   /chat/sessions           create new session
 * PATCH  /chat/sessions/:id       rename session
 * DELETE /chat/sessions/:id       delete session
 * POST   /chat/sessions/:id/branch  clone history up to messageId
 */
import { Router } from "express";
import { randomUUID } from "crypto";
import { eq, desc, and, lte } from "drizzle-orm";
import { db } from "../db/database.js";
import { chatSessions, chatMessages } from "../db/schema.js";

const router = Router();

// ── GET /chat/sessions ────────────────────────────────────────────────────────

router.get("/chat/sessions", (_req, res) => {
  const sessions = db
    .select()
    .from(chatSessions)
    .orderBy(desc(chatSessions.updatedAt))
    .all();

  // Attach last-message preview
  const result = sessions.map((s) => {
    const last = db
      .select({ role: chatMessages.role, content: chatMessages.content })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, s.id))
      .orderBy(desc(chatMessages.createdAt))
      .limit(1)
      .get();
    return {
      ...s,
      preview: last
        ? { role: last.role, content: last.content.slice(0, 120) }
        : null,
    };
  });

  return res.json({ sessions: result });
});

// ── GET /chat/sessions/:id ────────────────────────────────────────────────────

router.get("/chat/sessions/:id", (req, res) => {
  const { id } = req.params;
  const session = db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, id))
    .get();

  if (!session) {
    return res.status(404).json({ success: false, message: "Session not found" });
  }

  const messages = db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, id))
    .orderBy(chatMessages.createdAt)
    .all();

  return res.json({ session, messages });
});

// ── POST /chat/sessions ───────────────────────────────────────────────────────

router.post("/chat/sessions", (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const name = typeof body.name === "string" && body.name.trim()
    ? body.name.trim()
    : "New Chat";
  const workspacePath = typeof body.workspacePath === "string" ? body.workspacePath : null;

  const now = new Date().toISOString();
  const id  = randomUUID();

  db.insert(chatSessions).values({ id, name, workspacePath, createdAt: now, updatedAt: now }).run();

  const session = db.select().from(chatSessions).where(eq(chatSessions.id, id)).get();
  return res.status(201).json({ session });
});

// ── PATCH /chat/sessions/:id ──────────────────────────────────────────────────

router.patch("/chat/sessions/:id", (req, res) => {
  const { id } = req.params;
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const name = typeof body.name === "string" ? body.name.trim() : null;

  const existing = db.select().from(chatSessions).where(eq(chatSessions.id, id)).get();
  if (!existing) {
    return res.status(404).json({ success: false, message: "Session not found" });
  }
  if (!name) {
    return res.status(400).json({ success: false, message: "name required" });
  }

  db.update(chatSessions)
    .set({ name, updatedAt: new Date().toISOString() })
    .where(eq(chatSessions.id, id))
    .run();

  const session = db.select().from(chatSessions).where(eq(chatSessions.id, id)).get();
  return res.json({ session });
});

// ── DELETE /chat/sessions/:id ─────────────────────────────────────────────────

router.delete("/chat/sessions/:id", (req, res) => {
  const { id } = req.params;
  const existing = db.select().from(chatSessions).where(eq(chatSessions.id, id)).get();
  if (!existing) {
    return res.status(404).json({ success: false, message: "Session not found" });
  }

  // Messages cascade-delete via FK
  db.delete(chatSessions).where(eq(chatSessions.id, id)).run();
  return res.json({ success: true });
});

// ── POST /chat/sessions/:id/branch ───────────────────────────────────────────

router.post("/chat/sessions/:id/branch", (req, res) => {
  const { id } = req.params;
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";

  const source = db.select().from(chatSessions).where(eq(chatSessions.id, id)).get();
  if (!source) {
    return res.status(404).json({ success: false, message: "Source session not found" });
  }

  // Find the pivot message to get its createdAt so we can copy everything ≤ that point
  const pivot = db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.sessionId, id), eq(chatMessages.id, messageId)))
    .get();

  if (!pivot) {
    return res.status(404).json({ success: false, message: "Message not found in session" });
  }

  // Collect messages up to and including the pivot
  const history = db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.sessionId, id),
        lte(chatMessages.createdAt, pivot.createdAt)
      )
    )
    .orderBy(chatMessages.createdAt)
    .all();

  const now       = new Date().toISOString();
  const newId     = randomUUID();
  const branchName = `${source.name} (branch)`;

  db.insert(chatSessions).values({
    id:            newId,
    name:          branchName,
    workspacePath: source.workspacePath,
    createdAt:     now,
    updatedAt:     now,
  }).run();

  for (const msg of history) {
    db.insert(chatMessages).values({
      id:             randomUUID(),
      sessionId:      newId,
      role:           msg.role,
      content:        msg.content,
      imagesJson:     msg.imagesJson,
      supervisorJson: msg.supervisorJson,
      contextJson:    msg.contextJson,
      createdAt:      msg.createdAt,
    }).run();
  }

  const newSession = db.select().from(chatSessions).where(eq(chatSessions.id, newId)).get();
  return res.status(201).json({ session: newSession });
});

// ── POST /chat/sessions/:id/messages ─────────────────────────────────────────
// Persist a single message (called by the streaming endpoint after completion)

router.post("/chat/sessions/:id/messages", (req, res) => {
  const { id } = req.params;
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const role    = typeof body.role === "string" ? body.role : "";
  const content = typeof body.content === "string" ? body.content : "";

  if (!["system", "user", "assistant"].includes(role) || !content) {
    return res.status(400).json({ success: false, message: "role and content required" });
  }

  const session = db.select().from(chatSessions).where(eq(chatSessions.id, id)).get();
  if (!session) {
    return res.status(404).json({ success: false, message: "Session not found" });
  }

  const now = new Date().toISOString();
  const msgId = randomUUID();

  db.insert(chatMessages).values({
    id:             msgId,
    sessionId:      id,
    role:           role as "system" | "user" | "assistant",
    content,
    imagesJson:     typeof body.imagesJson === "string" ? body.imagesJson : null,
    supervisorJson: typeof body.supervisorJson === "string" ? body.supervisorJson : null,
    contextJson:    typeof body.contextJson === "string" ? body.contextJson : null,
    createdAt:      now,
  }).run();

  // Update session updatedAt
  db.update(chatSessions)
    .set({ updatedAt: now })
    .where(eq(chatSessions.id, id))
    .run();

  return res.status(201).json({ success: true, id: msgId });
});


// ── DELETE /chat/sessions/bulk — delete multiple or all sessions ──────────────

router.delete("/chat/sessions/bulk", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  // ids: string[] = specific sessions; omit or empty = delete ALL
  const ids: string[] = Array.isArray(body["ids"]) ? body["ids"] as string[] : [];
  const deleteAll = ids.length === 0;

  try {
    if (deleteAll) {
      // Wipe everything
      db.delete(chatMessages).run();
      db.delete(chatSessions).run();
      return res.json({ success: true, deletedCount: -1, deletedAll: true });
    }

    let deletedCount = 0;
    for (const id of ids) {
      const session = db.select({ id: chatSessions.id })
        .from(chatSessions)
        .where(eq(chatSessions.id, id))
        .get();
      if (!session) continue;
      db.delete(chatMessages).where(eq(chatMessages.sessionId, id)).run();
      db.delete(chatSessions).where(eq(chatSessions.id, id)).run();
      deletedCount++;
    }
    return res.json({ success: true, deletedCount, deletedAll: false });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// ── GET /chat/sessions/:id/export — export session as JSON or Markdown ────────

router.get("/chat/sessions/:id/export", (req, res) => {
  const id = req.params["id"]!;
  const format = (req.query["format"] as string | undefined) ?? "json";

  const session = db.select().from(chatSessions).where(eq(chatSessions.id, id)).get();
  if (!session) return res.status(404).json({ success: false, message: "Session not found" });

  const messages = db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, id))
    .orderBy(chatMessages.createdAt)
    .all();

  if (format === "markdown") {
    const lines: string[] = [];
    lines.push(`# ${session.name}`);
    lines.push(`*Exported: ${new Date().toISOString()}*`);
    lines.push(`*Workspace: ${session.workspacePath ?? "(none)"}*`);
    lines.push("");
    for (const msg of messages) {
      const role = msg.role === "user" ? "**You**" : "**Assistant**";
      lines.push(`---`);
      lines.push(`${role} · ${msg.createdAt}`);
      lines.push("");
      lines.push(msg.content);
      lines.push("");
    }
    const safeName = session.name.replace(/[^a-z0-9]/gi, "_").slice(0, 40);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.md"`);
    return res.send(lines.join("\n"));
  }

  // Default: JSON
  const safeName = session.name.replace(/[^a-z0-9]/gi, "_").slice(0, 40);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.json"`);
  return res.json({
    session: { ...session },
    messages: messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
    exportedAt: new Date().toISOString(),
  });
});

// ── GET /chat/sessions/search — full-text search across all sessions ──────────

router.get("/chat/sessions/search", (req, res) => {
  const q = typeof req.query["q"] === "string" ? req.query["q"].trim() : "";
  const limit = Math.min(Number(req.query["limit"]) || 20, 100);

  if (!q) return res.json({ success: true, results: [] });

  try {
    // Search in message content
    const matches = db
      .select({
        sessionId: chatMessages.sessionId,
        messageId: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .all()
      .filter(m => m.content.toLowerCase().includes(q.toLowerCase()))
      .slice(0, limit);

    // Group by session, attach session name
    const sessionIds = [...new Set(matches.map(m => m.sessionId))];
    const sessionMap = new Map<string, string>();
    for (const sid of sessionIds) {
      const s = db.select({ name: chatSessions.name })
        .from(chatSessions)
        .where(eq(chatSessions.id, sid))
        .get();
      if (s) sessionMap.set(sid, s.name);
    }

    const results = matches.map(m => ({
      sessionId: m.sessionId,
      sessionName: sessionMap.get(m.sessionId) ?? "Unknown",
      messageId: m.messageId,
      role: m.role,
      preview: m.content.slice(0, 200),
      createdAt: m.createdAt,
    }));

    return res.json({ success: true, results, query: q });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
