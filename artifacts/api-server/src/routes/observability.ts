import { Router } from "express";
import { thoughtLog, type ThoughtLevel, type ThoughtCategory } from "../lib/thought-log.js";
import {
  getMissionReplaySourceOfTruth,
  listMissionReplayEvents,
  runLocalJarvisEvals,
} from "../lib/mission-replay.js";

const router = Router();

const THOUGHT_LEVELS: ThoughtLevel[] = ["debug", "info", "warning", "error"];
const THOUGHT_CATEGORIES: ThoughtCategory[] = [
  "kernel",
  "queue",
  "approval",
  "rollback",
  "config",
  "chat",
  "workspace",
  "system",
  "security",
  "rag",
  "stt",
  "tts",
  "web",
];

router.get("/observability/thoughts", async (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query["limit"]) || 100, 500));
  return res.json({ entries: thoughtLog.history(limit) });
});

router.get("/observability/thoughts/stream", async (_req, res) => {
  thoughtLog.stream(res);
});

router.get("/observability/mission-replay", async (req, res) => {
  const traceId = typeof req.query["traceId"] === "string" && req.query["traceId"].trim()
    ? req.query["traceId"].trim()
    : undefined;
  const limit = Math.max(1, Math.min(Number(req.query["limit"]) || 200, 1000));
  return res.json({ success: true, replay: listMissionReplayEvents({ traceId, limit }) });
});

router.get("/mission-replay/:traceId", async (req, res) => {
  const traceId = req.params["traceId"]!;
  const limit = Math.max(1, Math.min(Number(req.query["limit"]) || 200, 1000));
  const replay = listMissionReplayEvents({ traceId, limit });
  return res.json({ success: true, replay });
});

router.get("/observability/evals", async (_req, res) => {
  return res.json({
    success: true,
    localOnly: true,
    networkUsed: false,
    externalProvidersRequired: false,
    suites: [
      "local_chat_model_routing",
      "approval_denial",
      "job_failure",
      "tool_blocking",
      "mission_replay_event_integrity",
      "secret_redaction",
    ],
    sourceOfTruth: getMissionReplaySourceOfTruth(),
  });
});

router.post("/observability/evals/run", async (_req, res) => {
  const report = runLocalJarvisEvals();
  return res.status(report.success ? 200 : 500).json({ success: report.success, report });
});

router.post("/observability/thoughts", async (req, res) => {
  const body =
    typeof req.body === "object" && req.body !== null
      ? (req.body as Record<string, unknown>)
      : {};
  const level =
    typeof body["level"] === "string" &&
    THOUGHT_LEVELS.includes(body["level"] as ThoughtLevel)
      ? (body["level"] as ThoughtLevel)
      : undefined;
  const category =
    typeof body["category"] === "string" &&
    THOUGHT_CATEGORIES.includes(body["category"] as ThoughtCategory)
      ? (body["category"] as ThoughtCategory)
      : undefined;
  const title = typeof body["title"] === "string" ? body["title"] : "";
  const message = typeof body["message"] === "string" ? body["message"] : "";
  const metadata =
    typeof body["metadata"] === "object" &&
    body["metadata"] !== null &&
    !Array.isArray(body["metadata"])
      ? (body["metadata"] as Record<string, unknown>)
      : undefined;

  if (!category || !title || !message) {
    return res
      .status(400)
      .json({ success: false, message: "category, title, and message are required" });
  }
  if (body["level"] !== undefined && level === undefined) {
    return res.status(400).json({
      success: false,
      message: `Invalid thought level: ${String(body["level"])}`,
    });
  }

  const entry = thoughtLog.publish({ level, category, title, message, metadata });
  return res.json({ success: true, entry });
});

export default router;
