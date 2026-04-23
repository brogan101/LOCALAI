import { Router } from "express";
import { readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import {
  getBackupMetadata,
  listBackupMetadata,
  rollbackFile,
} from "../lib/snapshot-manager.js";
import { db } from "../db/database.js";
import { auditLog } from "../db/schema.js";
import { desc, like, or, eq } from "drizzle-orm";
import { agentEditsGuard } from "../lib/route-guards.js";

const router = Router();

router.get("/rollback/backup", async (req, res) => {
  const filePath = String(req.query["filePath"] || "").trim();
  if (!filePath) {
    return res
      .status(400)
      .json({ success: false, message: "filePath query parameter required" });
  }
  return res.json({ backup: await getBackupMetadata(filePath) });
});

router.get("/rollback/backups", async (req, res) => {
  const directoryPath = String(req.query["directoryPath"] || "").trim();
  if (!directoryPath) {
    return res
      .status(400)
      .json({ success: false, message: "directoryPath query parameter required" });
  }
  return res.json({ backups: await listBackupMetadata(directoryPath) });
});

// Recursive scan: find all .localai-backups folders under workspacePath
router.get("/rollback/scan", async (req, res) => {
  const workspacePath = String(req.query["workspacePath"] || "").trim();
  if (!workspacePath) {
    return res.status(400).json({ success: false, message: "workspacePath query parameter required" });
  }
  if (!existsSync(workspacePath)) {
    return res.status(404).json({ success: false, message: "workspacePath does not exist" });
  }

  const allBackups: Array<{ filePath: string; backupPath: string; createdAt: string; sizeBytes?: number }> = [];

  async function scanDir(dir: string, depth: number): Promise<void> {
    if (depth > 8) return; // guard against deep trees
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const fullPath = path.join(dir, name);
      let st: Awaited<ReturnType<typeof stat>>;
      try { st = await stat(fullPath); } catch { continue; }
      if (!st.isDirectory()) continue;

      if (name === ".localai-backups") {
        // Enumerate .bak files
        let bakNames: string[];
        try { bakNames = await readdir(fullPath); } catch { continue; }
        for (const bakName of bakNames) {
          if (!bakName.endsWith(".bak")) continue;
          const backupPath   = path.join(fullPath, bakName);
          let bakSt: Awaited<ReturnType<typeof stat>>;
          try { bakSt = await stat(backupPath); } catch { continue; }
          if (!bakSt.isFile()) continue;
          const originalPath = path.join(dir, bakName.slice(0, -4));
          try {
            const meta = await getBackupMetadata(originalPath);
            allBackups.push({
              filePath:   originalPath,
              backupPath: meta.backupPath ?? backupPath,
              createdAt:  meta.createdAt ?? "",
              sizeBytes:  meta.sizeBytes,
            });
          } catch {
            allBackups.push({ filePath: originalPath, backupPath, createdAt: "" });
          }
        }
      } else if (name !== "node_modules" && !name.startsWith(".")) {
        await scanDir(fullPath, depth + 1);
      }
    }
  }

  await scanDir(workspacePath, 0);
  allBackups.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return res.json({ backups: allBackups });
});

router.post("/rollback", agentEditsGuard("rollback file from backup"), async (req, res) => {
  const body =
    typeof req.body === "object" && req.body !== null
      ? (req.body as Record<string, unknown>)
      : {};
  const filePath =
    typeof body["filePath"] === "string" ? body["filePath"].trim() : "";
  if (!filePath) {
    return res.status(400).json({ success: false, message: "filePath required" });
  }
  const backup = await rollbackFile(filePath);
  return res.json({ success: true, backup });
});

// ── GET /audit/history — durable audit log from SQLite ────────────────────────

router.get("/audit/history", async (req, res) => {
  const limit = Math.min(Number(req.query["limit"]) || 100, 500);
  const typesParam = typeof req.query["types"] === "string" ? req.query["types"] : "";
  const typeFilters = typesParam ? typesParam.split(",").map(t => t.trim()).filter(Boolean) : [];

  try {
    let query = db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.timestamp))
      .limit(limit);

    // If specific action types requested, filter by prefix match
    const rows = await query;
    const filtered = typeFilters.length > 0
      ? rows.filter(r => typeFilters.some(t => r.action.toLowerCase().includes(t.toLowerCase())))
      : rows;

    return res.json({ success: true, entries: filtered, total: filtered.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: String(err), entries: [] });
  }
});

// ── GET /audit/rollback-candidates — files with backups in audit log ──────────

router.get("/audit/rollback-candidates", async (_req, res) => {
  try {
    // Find audit entries where backup_path is set
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.result, "success"))
      .orderBy(desc(auditLog.timestamp))
      .limit(200);

    const candidates = rows
      .filter(r => r.backupPath && r.filePath)
      .map(r => ({
        id:         r.id,
        timestamp:  r.timestamp,
        action:     r.action,
        filePath:   r.filePath,
        backupPath: r.backupPath,
      }));

    return res.json({ success: true, candidates });
  } catch (err) {
    return res.status(500).json({ success: false, message: String(err), candidates: [] });
  }
});

export default router;
