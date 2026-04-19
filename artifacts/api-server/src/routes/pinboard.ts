import { Router } from "express";
import { randomUUID } from "crypto";

const router = Router();

interface PinboardItem {
  id:            string;
  kind:          "text" | "file" | "snippet";
  title:         string;
  content:       string;
  filePath?:     string;
  workspacePath?: string;
  createdAt:     string;
}

async function getDb() {
  const { sqlite } = await import("../db/database.js");
  return sqlite;
}

router.get("/pinboard", async (_req, res) => {
  try {
    const db    = await getDb();
    const items = db.prepare(
      "SELECT * FROM pinboard_items ORDER BY created_at DESC",
    ).all() as Array<{
      id: string; kind: string; title: string; content: string;
      file_path: string | null; workspace_path: string | null; created_at: string;
    }>;
    const result: PinboardItem[] = items.map(r => ({
      id:            r.id,
      kind:          r.kind as PinboardItem["kind"],
      title:         r.title,
      content:       r.content,
      filePath:      r.file_path ?? undefined,
      workspacePath: r.workspace_path ?? undefined,
      createdAt:     r.created_at,
    }));
    return res.json({ success: true, items: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.post("/pinboard", async (req, res) => {
  const body = (req.body as Record<string, unknown>) ?? {};
  const kind    = (["text", "file", "snippet"] as const).includes(body["kind"] as "text") ? (body["kind"] as PinboardItem["kind"]) : "text";
  const title   = typeof body["title"]   === "string" ? body["title"].trim()   : "";
  const content = typeof body["content"] === "string" ? body["content"].trim() : "";
  if (!title || !content) {
    return res.status(400).json({ success: false, message: "title and content are required" });
  }
  const item: PinboardItem = {
    id:            randomUUID(),
    kind,
    title,
    content,
    filePath:      typeof body["filePath"]      === "string" ? body["filePath"]      : undefined,
    workspacePath: typeof body["workspacePath"] === "string" ? body["workspacePath"] : undefined,
    createdAt:     new Date().toISOString(),
  };
  try {
    const db = await getDb();
    db.prepare(
      "INSERT INTO pinboard_items (id, kind, title, content, file_path, workspace_path, created_at) VALUES (?,?,?,?,?,?,?)",
    ).run(item.id, item.kind, item.title, item.content, item.filePath ?? null, item.workspacePath ?? null, item.createdAt);
    return res.json({ success: true, item });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.delete("/pinboard/:id", async (req, res) => {
  try {
    const db = await getDb();
    db.prepare("DELETE FROM pinboard_items WHERE id = ?").run(req.params["id"]!);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
