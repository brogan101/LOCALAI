import { Router } from "express";
import { readdir, readFile, stat, copyFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";

const router = Router();

interface BackupEntry {
  filePath:    string;   // original file path
  bakPath:     string;   // path of the .bak file
  sizeBytes:   number;
  modifiedAt:  string;
  isReadable:  boolean;
}

async function scanBaksRecursive(
  dir: string,
  results: BackupEntry[],
  depth = 0,
): Promise<void> {
  if (depth > 6) return;
  let entries: import("fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true, encoding: "utf8" }) as unknown as import("fs").Dirent[];
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, String(entry.name));
    if (entry.isDirectory()) {
      await scanBaksRecursive(full, results, depth + 1);
    } else if (String(entry.name).endsWith(".bak")) {
      try {
        const s = await stat(full);
        results.push({
          filePath:   full.slice(0, -4),   // strip .bak → original path
          bakPath:    full,
          sizeBytes:  s.size,
          modifiedAt: s.mtime.toISOString(),
          isReadable: true,
        });
      } catch {
        results.push({
          filePath:   full.slice(0, -4),
          bakPath:    full,
          sizeBytes:  0,
          modifiedAt: new Date(0).toISOString(),
          isReadable: false,
        });
      }
    }
  }
}

// GET /timetravel/backups?root=<dir>  — scan a directory recursively for .bak files
router.get("/timetravel/backups", async (req, res) => {
  const rawRoot = typeof req.query["root"] === "string" ? req.query["root"] : "";
  const root    = rawRoot || os.homedir();

  const results: BackupEntry[] = [];
  await scanBaksRecursive(root, results);
  results.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

  return res.json({ success: true, backups: results, scannedRoot: root });
});

// GET /timetravel/diff?bak=<path>  — diff backup vs current file
router.get("/timetravel/diff", async (req, res) => {
  const bakPath = typeof req.query["bak"] === "string" ? req.query["bak"] : "";
  if (!bakPath || !existsSync(bakPath)) {
    return res.status(400).json({ success: false, message: "bak path not found" });
  }
  const origPath = bakPath.slice(0, -4);

  try {
    const bakContent  = await readFile(bakPath,  "utf-8").catch(() => "");
    const origContent = existsSync(origPath) ? await readFile(origPath, "utf-8") : "";

    // Simple line diff
    const bakLines  = bakContent.split("\n");
    const origLines = origContent.split("\n");
    const maxLen    = Math.max(bakLines.length, origLines.length);
    const diffLines: string[] = [];

    for (let i = 0; i < maxLen; i++) {
      const bLine = bakLines[i]  ?? "";
      const oLine = origLines[i] ?? "";
      if (bLine !== oLine) {
        if (bLine) diffLines.push(`- ${bLine}`);
        if (oLine) diffLines.push(`+ ${oLine}`);
      }
    }

    return res.json({
      success:      true,
      bakPath,
      origPath,
      origExists:   existsSync(origPath),
      bakContent,
      origContent,
      diff:         diffLines.join("\n"),
      hasChanges:   diffLines.length > 0,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// POST /timetravel/restore  — copy .bak → original
router.post("/timetravel/restore", async (req, res) => {
  const body    = (req.body as Record<string, unknown>) ?? {};
  const bakPath = typeof body["bakPath"] === "string" ? body["bakPath"] : "";
  if (!bakPath || !existsSync(bakPath)) {
    return res.status(400).json({ success: false, message: "bakPath not found" });
  }
  const origPath = bakPath.slice(0, -4);
  try {
    await copyFile(bakPath, origPath);
    return res.json({ success: true, restored: origPath });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
