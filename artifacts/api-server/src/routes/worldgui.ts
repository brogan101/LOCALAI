import { createHash } from "crypto";
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
  captureScreenshot,
  findWindows,
  focusWindow,
} from "../lib/windows-system.js";
import { agentExecGuard } from "../lib/route-guards.js";
import { evaluatePermission, recordAuditEvent } from "../lib/platform-foundation.js";
import { assertPhysicalActionsAllowed } from "../lib/runtime-mode.js";
import { createApprovalRequest } from "../lib/approval-queue.js";

const router = Router();

const WORLDGUI_PORT = 7681;
const WORLDGUI_URL  = `http://127.0.0.1:${WORLDGUI_PORT}`;

function redactDesktopInputPayload(action: "type" | "keys", value: string): Record<string, unknown> {
  return {
    action,
    target: "focused-window",
    inputLength: value.length,
    inputHash: createHash("sha256").update(value).digest("hex"),
  };
}

function queueDesktopInputApproval(action: "type" | "keys", value: string) {
  return createApprovalRequest({
    type: "desktop.worldgui",
    title: action === "type" ? "Desktop Text Entry" : "Desktop Keystrokes",
    summary: action === "type"
      ? `Type ${value.length} character(s) into the focused desktop window.`
      : `Send ${value.length} keystroke character(s) to the focused desktop window.`,
    riskTier: "tier4_external_communication",
    physicalTier: "p4_approval_required",
    requestedAction: `worldgui.${action}`,
    payload: redactDesktopInputPayload(action, value),
  });
}

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
router.post("/worldgui/install", agentExecGuard("install WorldGUI"), async (_req, res) => {
  const decision = evaluatePermission("desktop.worldgui", "install");
  if (!decision.allowed) return res.status(403).json({ success: false, blocked: true, message: decision.reason, decision });
  try {
    const { stdout, stderr } = await execCommand("pip install worldgui", 120_000);
    const installed = await wgInstalled();
    recordAuditEvent({ eventType: "desktop.worldgui", action: "install", target: "worldgui", result: installed ? "success" : "failed" });
    res.json({ success: installed, output: stdout || stderr });
  } catch (err) {
    recordAuditEvent({ eventType: "desktop.worldgui", action: "install", target: "worldgui", result: "failed", metadata: { error: err instanceof Error ? err.message : String(err) } });
    res.status(500).json({ success: false, output: err instanceof Error ? err.message : String(err) });
  }
});

// POST /worldgui/launch
router.post("/worldgui/launch", agentExecGuard("launch WorldGUI"), async (_req, res) => {
  const physical = assertPhysicalActionsAllowed("worldgui.launch");
  if (!physical.allowed) return res.status(physical.status).json(physical.payload);
  const decision = evaluatePermission("desktop.worldgui", "launch");
  if (!decision.allowed) return res.status(403).json({ success: false, blocked: true, message: decision.reason, decision });
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
    recordAuditEvent({ eventType: "desktop.worldgui", action: "launch", target: "worldgui", result: running ? "success" : "failed" });
    res.json({ success: running, message: running ? "WorldGUI started" : "Started but not yet reachable — try again shortly" });
  } catch (err) {
    recordAuditEvent({ eventType: "desktop.worldgui", action: "launch", target: "worldgui", result: "failed", metadata: { error: err instanceof Error ? err.message : String(err) } });
    res.status(500).json({ success: false, message: err instanceof Error ? err.message : String(err) });
  }
});

// POST /worldgui/stop
router.post("/worldgui/stop", agentExecGuard("stop WorldGUI"), async (_req, res) => {
  const decision = evaluatePermission("desktop.worldgui", "stop");
  if (!decision.allowed) return res.status(403).json({ success: false, blocked: true, message: decision.reason, decision });
  try {
    if (isWindows) {
      await execCommand("taskkill /F /IM worldgui.exe /T 2>nul || taskkill /F /FI \"WINDOWTITLE eq WorldGUI*\" /T 2>nul || exit 0", 8000);
    } else {
      await execCommand("pkill -f 'python -m worldgui' || true", 5000);
    }
    recordAuditEvent({ eventType: "desktop.worldgui", action: "stop", target: "worldgui" });
    res.json({ success: true, message: "WorldGUI stopped" });
  } catch (err) {
    recordAuditEvent({ eventType: "desktop.worldgui", action: "stop", target: "worldgui", result: "failed", metadata: { error: err instanceof Error ? err.message : String(err) } });
    res.status(500).json({ success: false, message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /worldgui/screenshot — returns PNG as base64
router.get("/worldgui/screenshot", agentExecGuard("capture desktop screenshot"), async (_req, res) => {
  const decision = evaluatePermission("desktop.worldgui", "screenshot");
  if (!decision.allowed) return res.status(403).json({ success: false, blocked: true, message: decision.reason, decision });
  try {
    const filePath = await captureScreenshot();
    const buf = await readFile(filePath);
    const b64 = buf.toString("base64");
    recordAuditEvent({ eventType: "desktop.worldgui", action: "screenshot", target: filePath });
    res.json({ success: true, base64: b64, mimeType: "image/png", capturedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /worldgui/click — { x, y }
router.post("/worldgui/click", agentExecGuard("click desktop coordinates"), async (req, res) => {
  const physical = assertPhysicalActionsAllowed("worldgui.click");
  if (!physical.allowed) return res.status(physical.status).json(physical.payload);
  const decision = evaluatePermission("desktop.worldgui", "click");
  if (!decision.allowed) return res.status(403).json({ success: false, blocked: true, message: decision.reason, decision });
  const { x, y } = req.body as { x?: number; y?: number };
  if (typeof x !== "number" || typeof y !== "number") {
    return res.status(400).json({ success: false, error: "x and y must be numbers" });
  }
  try {
    await clickAt(x, y);
    recordAuditEvent({ eventType: "desktop.worldgui", action: "click", target: `${x},${y}` });
    res.json({ success: true, x, y });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /worldgui/type — { text }
router.post("/worldgui/type", agentExecGuard("type into desktop"), async (req, res) => {
  const physical = assertPhysicalActionsAllowed("worldgui.type");
  if (!physical.allowed) return res.status(physical.status).json(physical.payload);
  const decision = evaluatePermission("desktop.worldgui", "type");
  if (!decision.allowed) return res.status(403).json({ success: false, blocked: true, message: decision.reason, decision });
  const { text } = req.body as { text?: string };
  if (!text) return res.status(400).json({ success: false, error: "text is required" });
  const approval = queueDesktopInputApproval("type", text);
  recordAuditEvent({
    eventType: "desktop.worldgui",
    action: "type_approval_required",
    target: "focused-window",
    result: "blocked",
    metadata: { approvalId: approval.id, inputLength: text.length, inputHash: approval.payloadHash },
  });
  res.status(202).json({
    success: false,
    approvalRequired: true,
    message: "Desktop text entry requires explicit approval. No text was typed.",
    approval,
  });
});

// POST /worldgui/keys — { keys } (raw SendKeys codes)
router.post("/worldgui/keys", agentExecGuard("send desktop keystrokes"), async (req, res) => {
  const physical = assertPhysicalActionsAllowed("worldgui.keys");
  if (!physical.allowed) return res.status(physical.status).json(physical.payload);
  const decision = evaluatePermission("desktop.worldgui", "keys");
  if (!decision.allowed) return res.status(403).json({ success: false, blocked: true, message: decision.reason, decision });
  const { keys } = req.body as { keys?: string };
  if (!keys) return res.status(400).json({ success: false, error: "keys is required" });
  const approval = queueDesktopInputApproval("keys", keys);
  recordAuditEvent({
    eventType: "desktop.worldgui",
    action: "keys_approval_required",
    target: "focused-window",
    result: "blocked",
    metadata: { approvalId: approval.id, inputLength: keys.length, inputHash: approval.payloadHash },
  });
  res.status(202).json({
    success: false,
    approvalRequired: true,
    message: "Desktop keystrokes require explicit approval. No keys were sent.",
    approval,
  });
});

// POST /worldgui/focus — { window }
router.post("/worldgui/focus", agentExecGuard("focus desktop window"), async (req, res) => {
  const physical = assertPhysicalActionsAllowed("worldgui.focus");
  if (!physical.allowed) return res.status(physical.status).json(physical.payload);
  const decision = evaluatePermission("desktop.worldgui", "focus");
  if (!decision.allowed) return res.status(403).json({ success: false, blocked: true, message: decision.reason, decision });
  const { window } = req.body as { window?: string };
  if (!window) return res.status(400).json({ success: false, error: "window title is required" });
  try {
    const ok = await focusWindow(window);
    recordAuditEvent({ eventType: "desktop.worldgui", action: "focus", target: window, result: ok ? "success" : "failed" });
    res.json({ success: ok, window });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /worldgui/windows — list open windows
router.get("/worldgui/windows", agentExecGuard("list desktop windows"), async (req, res) => {
  const decision = evaluatePermission("desktop.worldgui", "windows");
  if (!decision.allowed) return res.status(403).json({ success: false, blocked: true, message: decision.reason, decision });
  const pattern = (req.query["pattern"] as string | undefined) ?? "";
  try {
    const windows = await findWindows(pattern);
    res.json({ success: true, windows });
  } catch (err) {
    res.status(500).json({ success: false, windows: [], error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
