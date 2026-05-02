import { Router } from "express";
import { taskQueue } from "../lib/task-queue.js";
import {
  cancelDurableJob,
  getDurableJob,
  listDurableJobs,
  listJobEvents,
  pauseDurableJob,
  resumeDurableJob,
} from "../lib/platform-foundation.js";

const router = Router();

router.get("/tasks", async (_req, res) => {
  return res.json({ jobs: taskQueue.listJobs() });
});

router.get("/tasks/:jobId", async (req, res) => {
  const job = taskQueue.getJob(req.params["jobId"]!);
  if (!job) {
    return res.status(404).json({ success: false, message: "Job not found" });
  }
  return res.json({ job });
});

router.get("/tasks/durable/jobs", async (req, res) => {
  const limit = Number(req.query["limit"]) || 100;
  return res.json({ success: true, jobs: listDurableJobs(limit) });
});

router.get("/tasks/durable/jobs/:jobId", async (req, res) => {
  const job = getDurableJob(req.params["jobId"]!);
  if (!job) return res.status(404).json({ success: false, message: "Durable job not found" });
  return res.json({ success: true, job, events: listJobEvents(job.id) });
});

router.post("/tasks/durable/jobs/:jobId/pause", async (req, res) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason : "Paused by local user";
  const job = pauseDurableJob(req.params["jobId"]!, reason);
  if (!job) return res.status(409).json({ success: false, message: "Durable job cannot be paused" });
  return res.json({ success: true, job });
});

router.post("/tasks/durable/jobs/:jobId/resume", async (req, res) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason : "Resumed by local user";
  const job = resumeDurableJob(req.params["jobId"]!, reason);
  if (!job) return res.status(409).json({ success: false, message: "Durable job cannot be resumed" });
  return res.json({ success: true, job });
});

router.post("/tasks/durable/jobs/:jobId/cancel", async (req, res) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason : "Cancelled by local user";
  const job = cancelDurableJob(req.params["jobId"]!, reason);
  if (!job) return res.status(409).json({ success: false, message: "Durable job cannot be cancelled" });
  return res.json({ success: true, job });
});

export default router;
