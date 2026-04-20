import { Router } from "express";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";
import {
  commandExists,
  fetchText,
  isWindows,
  execCommand,
} from "../lib/runtime.js";
import {
  clickAt,
  typeText,
  sendKeystrokes,
  captureScreenshot,
  findWindows,
  focusWindow,
} from "../lib/windows-system.js";

const router = Router();

const WORLDGUI_PORT = 7681;
const WORLDGUI_URL  = `http://localhost:${WORLDGUI_PORT}`;

async function wgInstalled(): Promise<boolean> {
  return commandExists("worldgui");
}

async function wgRunning(): Promise<boolean> {
  return fetchText(WORLDGUI_URL, undefined, 2500).then(() => true).catch(() => false);
}

// GET /worldgui/status
router.get("/worldgui/status", async (_req, res) => {
  const [installed, running] = await Promise.all([wgInstalled(), wgRunning()]);
  res.json({ installed, running, port: WORLDGUI_PORT, url: WORLDGUI_URL });
});

// POST /worldgui/install
router.post("/worldgui/install", async (_req, res) => {
  try {
    const { stdout, stderr } = await execCommand("pip install worldgui", 120_000);
    const installed = await wgInstalled();
    res.json({ success: installed, output: stdout || stderr });
  } catch (err) {
    res.status(500).json({ success: false, output: err instanceof Error ? err.message : String(err) });
  }
});

// POST /worldgui/launch
router.post("/worldgui/launch", async (_req, res) => {
  const installed = await wgInstalled();
  if (!installed) {
    return res.status(400).json({ success: false, message: "WorldGUI is not installed. POST /worldgui/install first." });
  }
  try {
    if (isWindows) {
      await execCommand(`start "WorldGUI" cmd /k "python -m worldgui"`, 5000);
    } else {
      await execCommand("python -m worldgui &", 5000);
    }
    // Give it 2s to start
    await new Promise<void>(r => setTimeout(r, 2000));
    const running = await wgRunning();
    res.json({ success: running, message: running ? "WorldGUI started" : "Started but not yet reachable — try again shortly" });
  } catch (err) {
    res.status(500).json({ success: false, message: err instanceof Error ? err.message : String(err) });
  }
});

// POST /worldgui/stop
router.post("/worldgui/stop", async (_req, res) => {
  try {
    if (isWindows) {
      await execCommand("taskkill /F /IM worldgui.exe /T 2>nul || taskkill /F /FI \"WINDOWTITLE eq WorldGUI*\" /T 2>nul || exit 0", 8000);
    } else {
      await execCommand("pkill -f 'python -m worldgui' || true", 5000);
    }
    res.json({ success: true, message: "WorldGUI stopped" });
  } catch (err) {
    res.status(500).json({ success: false, message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /worldgui/screenshot — returns PNG as base64
router.get("/worldgui/screenshot", async (_req, res) => {
  try {
    const filePath = await captureScreenshot();
    const buf = await readFile(filePath);
    const b64 = buf.toString("base64");
    res.json({ success: true, base64: b64, mimeType: "image/png", capturedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /worldgui/click — { x, y }
router.post("/worldgui/click", async (req, res) => {
  const { x, y } = req.body as { x?: number; y?: number };
  if (typeof x !== "number" || typeof y !== "number") {
    return res.status(400).json({ success: false, error: "x and y must be numbers" });
  }
  try {
    await clickAt(x, y);
    res.json({ success: true, x, y });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /worldgui/type — { text }
router.post("/worldgui/type", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text) return res.status(400).json({ success: false, error: "text is required" });
  try {
    await typeText(text);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /worldgui/keys — { keys } (raw SendKeys codes)
router.post("/worldgui/keys", async (req, res) => {
  const { keys } = req.body as { keys?: string };
  if (!keys) return res.status(400).json({ success: false, error: "keys is required" });
  try {
    await sendKeystrokes(keys);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /worldgui/focus — { window }
router.post("/worldgui/focus", async (req, res) => {
  const { window } = req.body as { window?: string };
  if (!window) return res.status(400).json({ success: false, error: "window title is required" });
  try {
    const ok = await focusWindow(window);
    res.json({ success: ok, window });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /worldgui/windows — list open windows
router.get("/worldgui/windows", async (req, res) => {
  const pattern = (req.query["pattern"] as string | undefined) ?? "";
  try {
    const windows = await findWindows(pattern);
    res.json({ success: true, windows });
  } catch (err) {
    res.status(500).json({ success: false, windows: [], error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
