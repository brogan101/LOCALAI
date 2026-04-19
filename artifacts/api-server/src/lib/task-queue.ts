import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { logger } from "./logger.js";
import { thoughtLog } from "./thought-log.js";
import { stateOrchestrator } from "./state-orchestrator.js";

export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface AsyncJob {
  id: string;
  name: string;
  type: string;
  status: JobStatus;
  progress: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  capability?: string;
  message: string;
  error?: string;
  result?: unknown;
  metadata?: Record<string, unknown>;
}

export interface JobContext {
  job: AsyncJob;
  updateProgress: (
    progress: number,
    message: string,
    metadata?: Record<string, unknown>,
  ) => void;
  publishThought: (
    title: string,
    message: string,
    metadata?: Record<string, unknown>,
  ) => void;
}

export type JobHandler = (ctx: JobContext) => Promise<unknown>;

export interface EnqueueOptions {
  capability?: string;
  metadata?: Record<string, unknown>;
}

// ── Lazy DB helpers (avoid circular import at module load time) ────────────────

function getDb() {
  return import("../db/database.js");
}

function jobToRow(job: AsyncJob) {
  return {
    id:           job.id,
    name:         job.name,
    type:         job.type,
    status:       job.status,
    progress:     job.progress,
    message:      job.message,
    error:        job.error ?? null,
    resultJson:   job.result !== undefined ? JSON.stringify(job.result) : null,
    metadataJson: job.metadata ? JSON.stringify(job.metadata) : null,
    capability:   job.capability ?? null,
    createdAt:    job.createdAt,
    startedAt:    job.startedAt ?? null,
    finishedAt:   job.finishedAt ?? null,
  };
}

async function dbInsertJob(job: AsyncJob): Promise<void> {
  try {
    const { sqlite } = await getDb();
    const r = jobToRow(job);
    sqlite.prepare(`
      INSERT OR IGNORE INTO async_jobs
        (id, name, type, status, progress, message, error,
         result_json, metadata_json, capability,
         created_at, started_at, finished_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      r.id, r.name, r.type, r.status, r.progress, r.message, r.error,
      r.resultJson, r.metadataJson, r.capability,
      r.createdAt, r.startedAt, r.finishedAt,
    );
  } catch { /* non-fatal */ }
}

async function dbUpdateJob(job: AsyncJob): Promise<void> {
  try {
    const { sqlite } = await getDb();
    const r = jobToRow(job);
    sqlite.prepare(`
      UPDATE async_jobs SET
        status = ?, progress = ?, message = ?, error = ?,
        result_json = ?, metadata_json = ?,
        started_at = ?, finished_at = ?
      WHERE id = ?
    `).run(
      r.status, r.progress, r.message, r.error,
      r.resultJson, r.metadataJson,
      r.startedAt, r.finishedAt,
      r.id,
    );
  } catch { /* non-fatal */ }
}

// ── Task queue ────────────────────────────────────────────────────────────────

class AsyncTaskQueue {
  private jobs = new Map<string, AsyncJob>();
  private queue: Array<{ job: AsyncJob; handler: JobHandler }> = [];
  private emitter = new EventEmitter();
  private running = false;

  subscribe(listener: (job: AsyncJob) => void): () => void {
    this.emitter.on("job", listener);
    return () => this.emitter.off("job", listener);
  }

  listJobs(): AsyncJob[] {
    return [...this.jobs.values()].sort((l, r) =>
      r.createdAt.localeCompare(l.createdAt),
    );
  }

  getJob(jobId: string): AsyncJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  /**
   * Called once after DB migrations complete.
   * Loads incomplete jobs back into the in-memory map and marks any that were
   * mid-flight (running / queued) as failed with a restart notice.
   */
  async hydrate(): Promise<void> {
    try {
      const { sqlite } = await getDb();
      const rows = sqlite.prepare(`
        SELECT id, name, type, status, progress, message, error,
               result_json, metadata_json, capability,
               created_at, started_at, finished_at
        FROM async_jobs
        ORDER BY created_at DESC
        LIMIT 500
      `).all() as Array<Record<string, unknown>>;

      for (const r of rows) {
        const job: AsyncJob = {
          id:         r["id"] as string,
          name:       r["name"] as string,
          type:       r["type"] as string,
          status:     r["status"] as JobStatus,
          progress:   r["progress"] as number,
          message:    r["message"] as string,
          error:      (r["error"] as string | null) ?? undefined,
          result:     r["result_json"] ? JSON.parse(r["result_json"] as string) : undefined,
          metadata:   r["metadata_json"] ? JSON.parse(r["metadata_json"] as string) as Record<string, unknown> : undefined,
          capability: (r["capability"] as string | null) ?? undefined,
          createdAt:  r["created_at"] as string,
          startedAt:  (r["started_at"] as string | null) ?? undefined,
          finishedAt: (r["finished_at"] as string | null) ?? undefined,
        };

        // Mark mid-flight jobs as failed
        if (job.status === "running" || job.status === "queued") {
          job.status     = "failed";
          job.finishedAt = new Date().toISOString();
          job.error      = "Process was restarted";
          job.message    = "Process was restarted";
          await dbUpdateJob(job);
        }

        this.jobs.set(job.id, job);
      }
    } catch { /* DB not ready — start fresh */ }
  }

  enqueue(
    name: string,
    type: string,
    handler: JobHandler,
    options: EnqueueOptions = {},
  ): AsyncJob {
    const job: AsyncJob = {
      id:         randomUUID(),
      name,
      type,
      status:     "queued",
      progress:   0,
      createdAt:  new Date().toISOString(),
      capability: options.capability,
      message:    "Queued",
      metadata:   options.metadata,
    };
    this.jobs.set(job.id, job);
    this.emitter.emit("job", job);
    thoughtLog.publish({
      category: "queue",
      title:    "Task Queued",
      message:  `${job.name} entered the async queue`,
      metadata: { jobId: job.id, type: job.type, capability: job.capability },
    });
    void dbInsertJob(job);
    this.queue.push({ job, handler });
    void this.drain();
    return job;
  }

  private updateJob(job: AsyncJob): void {
    this.jobs.set(job.id, job);
    this.emitter.emit("job", job);
    void dbUpdateJob(job);
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    const next = this.queue.shift();
    if (!next) return;
    this.running = true;
    const { job, handler } = next;
    try {
      job.status    = "running";
      job.startedAt = new Date().toISOString();
      job.message   = "Running";
      this.updateJob(job);

      if (job.capability) {
        await stateOrchestrator.activateCapability(job.capability, job.name, job.id);
      }

      const context: JobContext = {
        job,
        updateProgress: (progress, message, metadata) => {
          job.progress = Math.max(0, Math.min(100, progress));
          job.message  = message;
          job.metadata = metadata
            ? { ...(job.metadata || {}), ...metadata }
            : job.metadata;
          this.updateJob(job);
        },
        publishThought: (title, message, metadata) => {
          thoughtLog.publish({
            category: "queue",
            title,
            message,
            metadata: { jobId: job.id, ...(metadata || {}) },
          });
        },
      };

      const result      = await handler(context);
      job.status        = "completed";
      job.progress      = 100;
      job.result        = result;
      job.finishedAt    = new Date().toISOString();
      job.message       = "Completed";
      this.updateJob(job);
      thoughtLog.publish({
        category: "queue",
        title:    "Task Completed",
        message:  `${job.name} finished successfully`,
        metadata: { jobId: job.id, type: job.type },
      });
    } catch (error) {
      const message   = error instanceof Error ? error.message : String(error);
      job.status      = "failed";
      job.finishedAt  = new Date().toISOString();
      job.error       = message;
      job.message     = message;
      this.updateJob(job);
      logger.error({ err: error, jobId: job.id, type: job.type }, "Async task failed");
      thoughtLog.publish({
        level:    "error",
        category: "queue",
        title:    "Task Failed",
        message:  `${job.name} failed: ${message}`,
        metadata: { jobId: job.id, type: job.type },
      });
    } finally {
      if (job.capability) {
        if (job.status === "failed") {
          await stateOrchestrator.setCapability(job.capability, {
            active:        false,
            phase:         "error",
            detail:        job.error,
            assignedJobId: undefined,
          });
        } else {
          await stateOrchestrator.releaseCapability(job.capability, job.name);
        }
      }
      this.running = false;
      void this.drain();
    }
  }
}

export const taskQueue = new AsyncTaskQueue();
