import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import type { Response } from "express";
import { logger } from "./logger.js";

export type ThoughtLevel = "debug" | "info" | "warning" | "error";
export type ThoughtCategory =
  | "kernel"
  | "queue"
  | "rollback"
  | "config"
  | "chat"
  | "workspace"
  | "system";

export interface ThoughtEntry {
  id: string;
  timestamp: string;
  level: ThoughtLevel;
  category: ThoughtCategory;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ThoughtInput {
  level?: ThoughtLevel;
  category: ThoughtCategory;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// ── Lazy DB access (avoids circular-import at module load time) ───────────────

function getDb() {
  // Dynamic require at call time so thought-log can be imported before
  // the database module is fully initialised.
  return import("../db/database.js");
}

async function persistEntry(entry: ThoughtEntry): Promise<void> {
  try {
    const { sqlite } = await getDb();
    sqlite.prepare(`
      INSERT OR IGNORE INTO thought_log
        (id, timestamp, level, category, title, message, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.timestamp,
      entry.level,
      entry.category,
      entry.title,
      entry.message,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    );
  } catch {
    // DB may not be ready yet on very first publish — non-fatal
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

class ThoughtLogService {
  private emitter = new EventEmitter();
  private entries: ThoughtEntry[] = [];
  private readonly maxEntries = 500;
  private hydrated = false;

  /** Called once after DB migrations complete. Loads last 500 rows. */
  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const { sqlite } = await getDb();
      const rows = sqlite.prepare(`
        SELECT id, timestamp, level, category, title, message, metadata_json
        FROM thought_log
        ORDER BY timestamp DESC
        LIMIT 500
      `).all() as Array<{
        id: string; timestamp: string; level: string; category: string;
        title: string; message: string; metadata_json: string | null;
      }>;

      // Rows come newest-first; we want newest-first in the ring too
      this.entries = rows.map(r => ({
        id:       r.id,
        timestamp: r.timestamp,
        level:    r.level as ThoughtLevel,
        category: r.category as ThoughtCategory,
        title:    r.title,
        message:  r.message,
        metadata: r.metadata_json ? JSON.parse(r.metadata_json) as Record<string, unknown> : undefined,
      }));
    } catch {
      // DB not ready — ring starts empty, will fill on next publish
    }
  }

  publish(input: ThoughtInput): ThoughtEntry {
    const entry: ThoughtEntry = {
      id:        randomUUID(),
      timestamp: new Date().toISOString(),
      level:     input.level ?? "info",
      category:  input.category,
      title:     input.title,
      message:   input.message,
      metadata:  input.metadata,
    };

    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.length = this.maxEntries;
    }

    logger[entry.level === "warning" ? "warn" : entry.level](
      {
        thoughtId: entry.id,
        level:     entry.level,
        category:  entry.category,
        title:     entry.title,
        metadata:  entry.metadata,
      },
      entry.message,
    );

    this.emitter.emit("entry", entry);

    // Write-through to SQLite (fire-and-forget; non-fatal if DB not ready)
    void persistEntry(entry);

    return entry;
  }

  history(limit = 100): ThoughtEntry[] {
    return this.entries.slice(0, Math.max(1, Math.min(limit, this.maxEntries)));
  }

  subscribe(listener: (entry: ThoughtEntry) => void): () => void {
    this.emitter.on("entry", listener);
    return () => this.emitter.off("entry", listener);
  }

  stream(response: Response): void {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    (response as unknown as { flushHeaders?: () => void }).flushHeaders?.();

    response.write(
      `event: bootstrap\ndata: ${JSON.stringify({ entries: this.history(100) })}\n\n`,
    );

    const unsubscribe = this.subscribe((entry) => {
      response.write(`event: thought\ndata: ${JSON.stringify(entry)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      response.write(
        `event: heartbeat\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`,
      );
    }, 15000);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
      if (!response.writableEnded) {
        response.end();
      }
    };

    response.on("close", cleanup);
    response.on("error", cleanup);
  }
}

export const thoughtLog = new ThoughtLogService();
