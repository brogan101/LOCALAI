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

export default router;
