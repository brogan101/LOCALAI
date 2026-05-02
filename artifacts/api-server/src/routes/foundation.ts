import { Router } from "express";
import {
  appendJobEvent,
  assertPathAllowed,
  createArtifactRecord,
  createDurableJob,
  evaluatePermission,
  getDurableJob,
  getFoundationSummary,
  leaseNextJob,
  listAuditEvents,
  listDurableJobs,
  listJobEvents,
  listWorkspaceRoots,
  recordAuditEvent,
} from "../lib/platform-foundation.js";

const router = Router();

router.get("/foundation/summary", (_req, res) => {
  return res.json({ success: true, summary: getFoundationSummary() });
});

router.get("/foundation/workspace-roots", (_req, res) => {
  return res.json({ success: true, roots: listWorkspaceRoots() });
});

router.post("/foundation/path/check", (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  const targetPath = typeof body["path"] === "string" ? body["path"].trim() : "";
  const scope = body["scope"] === "file.write" ? "file.write" : "file.read";
  if (!targetPath) return res.status(400).json({ success: false, message: "path is required" });
  const decision = assertPathAllowed(targetPath, scope);
  return res.status(decision.allowed ? 200 : 403).json({ success: decision.allowed, decision });
});

router.post("/foundation/permissions/check", (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  const scope = typeof body["scope"] === "string" ? body["scope"] as any : "";
  const action = typeof body["action"] === "string" ? body["action"] : "*";
  if (!scope) return res.status(400).json({ success: false, message: "scope is required" });
  const decision = evaluatePermission(scope, action);
  return res.status(decision.allowed ? 200 : 403).json({ success: decision.allowed, decision });
});

router.get("/foundation/jobs", (req, res) => {
  const limit = Number(req.query["limit"]) || 100;
  return res.json({ success: true, jobs: listDurableJobs(limit) });
});

router.post("/foundation/jobs", (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  const kind = typeof body["kind"] === "string" ? body["kind"].trim() : "";
  if (!kind) return res.status(400).json({ success: false, message: "kind is required" });
  const job = createDurableJob({
    kind,
    priority: typeof body["priority"] === "number" ? body["priority"] : undefined,
    payload: typeof body["payload"] === "object" && body["payload"] !== null ? body["payload"] as Record<string, unknown> : {},
    sessionId: typeof body["sessionId"] === "string" ? body["sessionId"] : undefined,
    workspaceId: typeof body["workspaceId"] === "string" ? body["workspaceId"] : undefined,
  });
  return res.status(201).json({ success: true, job });
});

router.post("/foundation/jobs/lease", (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  const owner = typeof body["owner"] === "string" && body["owner"].trim() ? body["owner"].trim() : "local-worker";
  const leaseMs = typeof body["leaseMs"] === "number" ? body["leaseMs"] : undefined;
  const job = leaseNextJob(owner, leaseMs);
  return res.json({ success: true, job });
});

router.get("/foundation/jobs/:jobId", (req, res) => {
  const job = getDurableJob(req.params["jobId"]!);
  if (!job) return res.status(404).json({ success: false, message: "Job not found" });
  return res.json({ success: true, job, events: listJobEvents(job.id) });
});

router.post("/foundation/jobs/:jobId/events", (req, res) => {
  const job = getDurableJob(req.params["jobId"]!);
  if (!job) return res.status(404).json({ success: false, message: "Job not found" });
  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  const eventType = typeof body["eventType"] === "string" ? body["eventType"].trim() : "note";
  const message = typeof body["message"] === "string" ? body["message"].trim() : "";
  if (!message) return res.status(400).json({ success: false, message: "message is required" });
  const eventId = appendJobEvent(job.id, eventType, message, typeof body["metadata"] === "object" && body["metadata"] !== null ? body["metadata"] as Record<string, unknown> : {});
  return res.status(201).json({ success: true, eventId });
});

router.get("/foundation/audit-events", (req, res) => {
  const limit = Number(req.query["limit"]) || 100;
  return res.json({ success: true, events: listAuditEvents(limit) });
});

router.post("/foundation/audit-events", (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  const eventType = typeof body["eventType"] === "string" ? body["eventType"].trim() : "";
  const action = typeof body["action"] === "string" ? body["action"].trim() : "";
  if (!eventType || !action) return res.status(400).json({ success: false, message: "eventType and action are required" });
  const id = recordAuditEvent({
    eventType,
    action,
    target: typeof body["target"] === "string" ? body["target"] : undefined,
    result: body["result"] === "blocked" || body["result"] === "failed" ? body["result"] : "success",
    metadata: typeof body["metadata"] === "object" && body["metadata"] !== null ? body["metadata"] as Record<string, unknown> : {},
  });
  return res.status(201).json({ success: true, id });
});

router.post("/foundation/artifacts", (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  const kind = typeof body["kind"] === "string" ? body["kind"].trim() : "";
  const name = typeof body["name"] === "string" ? body["name"].trim() : "";
  if (!kind || !name) return res.status(400).json({ success: false, message: "kind and name are required" });
  const id = createArtifactRecord({
    kind,
    name,
    path: typeof body["path"] === "string" ? body["path"] : undefined,
    workspaceId: typeof body["workspaceId"] === "string" ? body["workspaceId"] : undefined,
    metadata: typeof body["metadata"] === "object" && body["metadata"] !== null ? body["metadata"] as Record<string, unknown> : {},
  });
  return res.status(201).json({ success: true, id });
});

export default router;
