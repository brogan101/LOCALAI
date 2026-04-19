/**
 * migrate.ts — run once at startup.
 *
 * 1. CREATE TABLE IF NOT EXISTS for all 11 tables.
 * 2. Import legacy JSON chat-history files into SQLite (idempotent).
 * 3. Migrate ~/LocalAI-Tools/settings.json → app_settings table.
 * 4. Migrate ~/LocalAI-Tools/model-roles.json → role_assignments table.
 * 5. Migrate ~/LocalAI-Tools/projects.json → workspace_registry table.
 * 6. Migrate ~/LocalAI-Tools/activity.json → audit_log table.
 * All migrated JSON files are renamed to *.bak (idempotent).
 */

import { readdir, readFile, rename, copyFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { db, sqlite } from "./database.js";
import {
  chatSessions, chatMessages,
  appSettings, roleAssignments, workspaceRegistry, auditLog,
} from "./schema.js";
import { eq } from "drizzle-orm";

const TOOLS_DIR   = path.join(os.homedir(), "LocalAI-Tools");
const HISTORY_DIR = path.join(TOOLS_DIR, "chat-history");

// ── DDL — create all tables if they don't exist ───────────────────────────────

export function runMigrations(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL DEFAULT 'New Chat',
      workspace_path TEXT,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id              TEXT PRIMARY KEY,
      session_id      TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role            TEXT NOT NULL CHECK(role IN ('system','user','assistant')),
      content         TEXT NOT NULL,
      images_json     TEXT,
      supervisor_json TEXT,
      context_json    TEXT,
      created_at      TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id
      ON chat_messages(session_id);

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at
      ON chat_sessions(updated_at DESC);

    CREATE TABLE IF NOT EXISTS app_settings (
      key         TEXT PRIMARY KEY,
      value_json  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS capability_state (
      id              TEXT PRIMARY KEY,
      enabled         INTEGER NOT NULL DEFAULT 1,
      active          INTEGER NOT NULL DEFAULT 0,
      phase           TEXT NOT NULL DEFAULT 'idle',
      assigned_job_id TEXT,
      updated_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_assignments (
      role       TEXT PRIMARY KEY,
      model_name TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_metrics (
      date              TEXT PRIMARY KEY,
      tokens_in         INTEGER NOT NULL DEFAULT 0,
      tokens_out        INTEGER NOT NULL DEFAULT 0,
      cost_estimate_usd REAL    NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS thought_log (
      id            TEXT PRIMARY KEY,
      timestamp     TEXT NOT NULL,
      level         TEXT NOT NULL DEFAULT 'info',
      category      TEXT NOT NULL,
      title         TEXT NOT NULL,
      message       TEXT NOT NULL,
      metadata_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_thought_log_timestamp
      ON thought_log(timestamp DESC);

    CREATE TABLE IF NOT EXISTS workspace_registry (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      root_path     TEXT NOT NULL,
      template      TEXT,
      pinned_at     TEXT,
      last_opened_at TEXT,
      metadata_json TEXT
    );

    CREATE TABLE IF NOT EXISTS model_pull_history (
      id           TEXT PRIMARY KEY,
      model_name   TEXT NOT NULL,
      started_at   TEXT NOT NULL,
      completed_at TEXT,
      bytes        INTEGER,
      status       TEXT NOT NULL DEFAULT 'pending',
      error        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_model_pull_history_model
      ON model_pull_history(model_name, started_at DESC);

    CREATE TABLE IF NOT EXISTS audit_log (
      id             TEXT PRIMARY KEY,
      timestamp      TEXT NOT NULL,
      action         TEXT NOT NULL,
      file_path      TEXT,
      old_hash       TEXT,
      new_hash       TEXT,
      user_confirmed INTEGER,
      result         TEXT,
      backup_path    TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp
      ON audit_log(timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_audit_log_file_path
      ON audit_log(file_path);

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
      ON chat_messages(session_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_thought_log_category
      ON thought_log(category, timestamp DESC);

    CREATE TABLE IF NOT EXISTS refactor_plans (
      id                  TEXT PRIMARY KEY,
      workspace_path      TEXT NOT NULL,
      request             TEXT NOT NULL,
      created_at          TEXT NOT NULL,
      impacted_files_json TEXT NOT NULL DEFAULT '[]',
      steps_json          TEXT NOT NULL DEFAULT '[]',
      summary             TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS refactor_jobs (
      id          TEXT PRIMARY KEY,
      plan_id     TEXT NOT NULL REFERENCES refactor_plans(id) ON DELETE CASCADE,
      model       TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'queued',
      created_at  TEXT NOT NULL,
      started_at  TEXT,
      finished_at TEXT,
      steps_json  TEXT NOT NULL DEFAULT '[]',
      error       TEXT
    );

    CREATE TABLE IF NOT EXISTS async_jobs (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      type         TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'queued',
      progress     INTEGER NOT NULL DEFAULT 0,
      message      TEXT NOT NULL DEFAULT '',
      error        TEXT,
      result_json  TEXT,
      metadata_json TEXT,
      capability   TEXT,
      created_at   TEXT NOT NULL,
      started_at   TEXT,
      finished_at  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_async_jobs_status
      ON async_jobs(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS benchmark_runs (
      id           TEXT PRIMARY KEY,
      prompt       TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      judge_model  TEXT NOT NULL,
      results_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS idx_benchmark_runs_created
      ON benchmark_runs(created_at DESC);

    CREATE TABLE IF NOT EXISTS pinboard_items (
      id             TEXT PRIMARY KEY,
      kind           TEXT NOT NULL DEFAULT 'text',
      title          TEXT NOT NULL,
      content        TEXT NOT NULL,
      file_path      TEXT,
      workspace_path TEXT,
      created_at     TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pinboard_items_created
      ON pinboard_items(created_at DESC);

    CREATE TABLE IF NOT EXISTS session_token_budgets (
      session_id    TEXT PRIMARY KEY,
      budget_tokens INTEGER NOT NULL,
      used_tokens   INTEGER NOT NULL DEFAULT 0,
      updated_at    TEXT NOT NULL
    );
  `);
}

// ── Helper ────────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

async function safeBak(filePath: string): Promise<void> {
  const bakPath = filePath + ".bak";
  if (existsSync(filePath) && !existsSync(bakPath)) {
    await copyFile(filePath, bakPath);
    await rename(filePath, bakPath);
  }
}

// ── 1. Import legacy chat-history JSON files ─────────────────────────────────

interface LegacyMessage {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
}

interface LegacySession {
  id?: string;
  model?: string;
  messages?: LegacyMessage[];
  createdAt?: string;
  updatedAt?: string;
  name?: string;
}

export async function importLegacyJsonFiles(): Promise<void> {
  if (!existsSync(HISTORY_DIR)) return;

  let files: string[];
  try {
    files = await readdir(HISTORY_DIR);
  } catch {
    return;
  }

  const jsonFiles = files.filter(f => f.endsWith(".json") && !f.endsWith(".bak.json"));

  for (const fileName of jsonFiles) {
    const filePath = path.join(HISTORY_DIR, fileName);
    try {
      const raw  = await readFile(filePath, "utf-8");
      const data: LegacySession = JSON.parse(raw);

      const sessionId = data.id ?? path.basename(fileName, ".json");
      const now       = nowIso();

      const existing = db.select().from(chatSessions).where(eq(chatSessions.id, sessionId)).get();
      if (existing) {
        await rename(filePath, filePath + ".bak");
        continue;
      }

      db.insert(chatSessions).values({
        id:            sessionId,
        name:          data.name ?? fileName.replace(".json", ""),
        workspacePath: null,
        createdAt:     data.createdAt ?? now,
        updatedAt:     data.updatedAt ?? now,
      }).run();

      const messages: LegacyMessage[] = Array.isArray(data.messages) ? data.messages : [];
      for (const msg of messages) {
        if (!["system", "user", "assistant"].includes(msg.role)) continue;
        db.insert(chatMessages).values({
          id:             randomUUID(),
          sessionId:      sessionId,
          role:           msg.role,
          content:        msg.content ?? "",
          imagesJson:     msg.images && msg.images.length > 0 ? JSON.stringify(msg.images) : null,
          supervisorJson: null,
          contextJson:    null,
          createdAt:      data.createdAt ?? now,
        }).run();
      }

      await rename(filePath, filePath + ".bak");
    } catch {
      // Skip malformed files silently
    }
  }
}

// ── 2. Migrate settings.json → app_settings ──────────────────────────────────

export async function migrateSettings(): Promise<void> {
  const settingsFile = path.join(TOOLS_DIR, "settings.json");
  if (!existsSync(settingsFile)) return;

  try {
    const raw      = await readFile(settingsFile, "utf-8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    const now      = nowIso();

    for (const [key, value] of Object.entries(settings)) {
      // Upsert: only write if row doesn't exist yet (first-boot migration)
      const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
      if (!existing) {
        db.insert(appSettings).values({
          key,
          valueJson: JSON.stringify(value),
          updatedAt: now,
        }).run();
      }
    }

    await safeBak(settingsFile);
  } catch {
    // Non-fatal — settings will use defaults
  }
}

// ── 3. Migrate model-roles.json → role_assignments ───────────────────────────

export async function migrateModelRoles(): Promise<void> {
  const rolesFile = path.join(TOOLS_DIR, "model-roles.json");
  if (!existsSync(rolesFile)) return;

  try {
    const raw   = await readFile(rolesFile, "utf-8");
    const roles = JSON.parse(raw) as Record<string, string>;
    const now   = nowIso();

    for (const [role, modelName] of Object.entries(roles)) {
      if (!modelName || typeof modelName !== "string") continue;
      const existing = db.select().from(roleAssignments).where(eq(roleAssignments.role, role)).get();
      if (!existing) {
        db.insert(roleAssignments).values({ role, modelName, updatedAt: now }).run();
      }
    }

    await safeBak(rolesFile);
  } catch {
    // Non-fatal
  }
}

// ── 4. Migrate projects.json → workspace_registry ────────────────────────────

interface LegacyProject {
  id?: string;
  name?: string;
  path?: string;
  rootPath?: string;
  template?: string;
  pinnedAt?: string;
  lastOpenedAt?: string;
}

export async function migrateProjects(): Promise<void> {
  const projectsFile = path.join(TOOLS_DIR, "projects.json");
  if (!existsSync(projectsFile)) return;

  try {
    const raw      = await readFile(projectsFile, "utf-8");
    const projects = JSON.parse(raw) as LegacyProject[];
    if (!Array.isArray(projects)) return;

    for (const p of projects) {
      const id       = p.id ?? randomUUID();
      const rootPath = p.rootPath ?? p.path ?? "";
      if (!rootPath) continue;

      const existing = db.select().from(workspaceRegistry).where(eq(workspaceRegistry.id, id)).get();
      if (!existing) {
        db.insert(workspaceRegistry).values({
          id,
          name:         p.name ?? path.basename(rootPath),
          rootPath,
          template:     p.template ?? null,
          pinnedAt:     p.pinnedAt ?? null,
          lastOpenedAt: p.lastOpenedAt ?? null,
          metadataJson: null,
        }).run();
      }
    }

    await safeBak(projectsFile);
  } catch {
    // Non-fatal
  }
}

// ── 5. Migrate activity.json → audit_log ─────────────────────────────────────

interface LegacyAuditEntry {
  id?: string;
  timestamp?: string;
  action?: string;
  filePath?: string;
  oldHash?: string;
  newHash?: string;
  userConfirmed?: boolean;
  result?: string;
  backupPath?: string;
}

export async function migrateActivity(): Promise<void> {
  const activityFile = path.join(TOOLS_DIR, "activity.json");
  if (!existsSync(activityFile)) return;

  try {
    const raw      = await readFile(activityFile, "utf-8");
    const entries  = JSON.parse(raw) as LegacyAuditEntry[];
    if (!Array.isArray(entries)) return;

    for (const e of entries) {
      const id = e.id ?? randomUUID();
      const existing = db.select().from(auditLog).where(eq(auditLog.id, id)).get();
      if (!existing) {
        db.insert(auditLog).values({
          id,
          timestamp:     e.timestamp ?? nowIso(),
          action:        e.action ?? "unknown",
          filePath:      e.filePath ?? null,
          oldHash:       e.oldHash ?? null,
          newHash:       e.newHash ?? null,
          userConfirmed: e.userConfirmed ?? null,
          result:        e.result ?? null,
          backupPath:    e.backupPath ?? null,
        }).run();
      }
    }

    await safeBak(activityFile);
  } catch {
    // Non-fatal
  }
}

// ── Entry point called from app startup ──────────────────────────────────────

export async function initDatabase(): Promise<void> {
  runMigrations();
  await importLegacyJsonFiles();
  await migrateSettings();
  await migrateModelRoles();
  await migrateProjects();
  await migrateActivity();
}
