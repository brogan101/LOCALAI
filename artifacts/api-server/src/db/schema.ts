import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ── chat_sessions ─────────────────────────────────────────────────────────────

export const chatSessions = sqliteTable("chat_sessions", {
  id:            text("id").primaryKey(),
  name:          text("name").notNull().default("New Chat"),
  workspacePath: text("workspace_path"),
  createdAt:     text("created_at").notNull(),
  updatedAt:     text("updated_at").notNull(),
});

// ── chat_messages ─────────────────────────────────────────────────────────────

export const chatMessages = sqliteTable("chat_messages", {
  id:             text("id").primaryKey(),
  sessionId:      text("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  role:           text("role", { enum: ["system", "user", "assistant"] }).notNull(),
  content:        text("content").notNull(),
  imagesJson:     text("images_json"),
  supervisorJson: text("supervisor_json"),
  contextJson:    text("context_json"),
  createdAt:      text("created_at").notNull(),
});

// ── app_settings ──────────────────────────────────────────────────────────────

export const appSettings = sqliteTable("app_settings", {
  key:        text("key").primaryKey(),
  valueJson:  text("value_json").notNull(),
  updatedAt:  text("updated_at").notNull(),
});

// ── capability_state ─────────────────────────────────────────────────────────

export const capabilityState = sqliteTable("capability_state", {
  id:            text("id").primaryKey(),
  enabled:       integer("enabled", { mode: "boolean" }).notNull().default(true),
  active:        integer("active", { mode: "boolean" }).notNull().default(false),
  phase:         text("phase").notNull().default("idle"),
  assignedJobId: text("assigned_job_id"),
  updatedAt:     text("updated_at").notNull(),
});

// ── role_assignments ──────────────────────────────────────────────────────────

export const roleAssignments = sqliteTable("role_assignments", {
  role:      text("role").primaryKey(),
  modelName: text("model_name").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ── usage_metrics ────────────────────────────────────────────────────────────

export const usageMetrics = sqliteTable("usage_metrics", {
  date:             text("date").primaryKey(),   // YYYY-MM-DD
  tokensIn:         integer("tokens_in").notNull().default(0),
  tokensOut:        integer("tokens_out").notNull().default(0),
  costEstimateUsd:  real("cost_estimate_usd").notNull().default(0),
});

// ── thought_log ───────────────────────────────────────────────────────────────

export const thoughtLogTable = sqliteTable("thought_log", {
  id:           text("id").primaryKey(),
  timestamp:    text("timestamp").notNull(),
  level:        text("level").notNull().default("info"),
  category:     text("category").notNull(),
  title:        text("title").notNull(),
  message:      text("message").notNull(),
  metadataJson: text("metadata_json"),
});

// ── workspace_registry ────────────────────────────────────────────────────────

export const workspaceRegistry = sqliteTable("workspace_registry", {
  id:           text("id").primaryKey(),
  name:         text("name").notNull(),
  rootPath:     text("root_path").notNull(),
  template:     text("template"),
  pinnedAt:     text("pinned_at"),
  lastOpenedAt: text("last_opened_at"),
  metadataJson: text("metadata_json"),
});

// ── model_pull_history ────────────────────────────────────────────────────────

export const modelPullHistory = sqliteTable("model_pull_history", {
  id:          text("id").primaryKey(),
  modelName:   text("model_name").notNull(),
  startedAt:   text("started_at").notNull(),
  completedAt: text("completed_at"),
  bytes:       integer("bytes"),
  status:      text("status").notNull().default("pending"),  // pending | success | failed
  error:       text("error"),
});

// ── audit_log ─────────────────────────────────────────────────────────────────

export const auditLog = sqliteTable("audit_log", {
  id:            text("id").primaryKey(),
  timestamp:     text("timestamp").notNull(),
  action:        text("action").notNull(),
  filePath:      text("file_path"),
  oldHash:       text("old_hash"),
  newHash:       text("new_hash"),
  userConfirmed: integer("user_confirmed", { mode: "boolean" }),
  result:        text("result"),
  backupPath:    text("backup_path"),
});

// ── refactor_plans ────────────────────────────────────────────────────────────

export const refactorPlans = sqliteTable("refactor_plans", {
  id:                 text("id").primaryKey(),
  workspacePath:      text("workspace_path").notNull(),
  request:            text("request").notNull(),
  createdAt:          text("created_at").notNull(),
  impactedFilesJson:  text("impacted_files_json").notNull().default("[]"),
  stepsJson:          text("steps_json").notNull().default("[]"),
  summary:            text("summary").notNull().default(""),
});

// ── refactor_jobs ─────────────────────────────────────────────────────────────

export const refactorJobs = sqliteTable("refactor_jobs", {
  id:           text("id").primaryKey(),
  planId:       text("plan_id").notNull().references(() => refactorPlans.id, { onDelete: "cascade" }),
  model:        text("model").notNull(),
  status:       text("status").notNull().default("queued"),
  createdAt:    text("created_at").notNull(),
  startedAt:    text("started_at"),
  finishedAt:   text("finished_at"),
  stepsJson:    text("steps_json").notNull().default("[]"),
  error:        text("error"),
});

// ── async_jobs ────────────────────────────────────────────────────────────────

export const asyncJobs = sqliteTable("async_jobs", {
  id:           text("id").primaryKey(),
  name:         text("name").notNull(),
  type:         text("type").notNull(),
  status:       text("status").notNull().default("queued"),
  progress:     integer("progress").notNull().default(0),
  message:      text("message").notNull().default(""),
  error:        text("error"),
  resultJson:   text("result_json"),
  metadataJson: text("metadata_json"),
  capability:   text("capability"),
  createdAt:    text("created_at").notNull(),
  startedAt:    text("started_at"),
  finishedAt:   text("finished_at"),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type ChatSession      = typeof chatSessions.$inferSelect;
export type NewChatSession   = typeof chatSessions.$inferInsert;
export type ChatMessage      = typeof chatMessages.$inferSelect;
export type NewChatMessage   = typeof chatMessages.$inferInsert;

export type AppSettingRow    = typeof appSettings.$inferSelect;
export type RoleAssignment   = typeof roleAssignments.$inferSelect;
export type UsageMetricRow   = typeof usageMetrics.$inferSelect;
export type ThoughtLogRow    = typeof thoughtLogTable.$inferSelect;
export type WorkspaceRow     = typeof workspaceRegistry.$inferSelect;
export type ModelPullRow     = typeof modelPullHistory.$inferSelect;
export type AuditLogRow      = typeof auditLog.$inferSelect;
export type RefactorPlanRow  = typeof refactorPlans.$inferSelect;
export type RefactorJobRow   = typeof refactorJobs.$inferSelect;
export type AsyncJobRow      = typeof asyncJobs.$inferSelect;
