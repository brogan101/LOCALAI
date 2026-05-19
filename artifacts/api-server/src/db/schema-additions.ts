/**
 * DRIZZLE SCHEMA ADDITIONS — Stage 5
 * =====================================
 * Three libs use lazy DDL (CREATE TABLE IF NOT EXISTS inside function calls)
 * instead of the main Drizzle schema. This causes:
 *   - No type safety on table structure
 *   - Inconsistent backup/restore (tables might be missed)
 *   - No migration path when columns need to change
 *
 * Affected libs:
 *   1. local-builder.ts → local_builder_profiles, local_builder_eval_history
 *   2. inventory-pipeline.ts → inventory_items, project_reality_pipelines, inventory_action_proposals
 *   3. project-foreman.ts (Stage 2) → project_foreman_projects, project_foreman_tasks, project_foreman_links
 *
 * INSTRUCTIONS:
 * =============
 * Find the main schema file: artifacts/api-server/src/db/schema.ts
 *
 * Add these table definitions at the END of the file, after all existing tables.
 * Then run: pnpm --filter @localai/api-server drizzle-kit generate
 *
 * These additions match EXACTLY the columns created by the lazy DDL, so
 * no data migration is needed — they're additive schema declarations for
 * existing tables.
 */

// ── Paste these into artifacts/api-server/src/db/schema.ts ─────────────────

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ── Local builder ────────────────────────────────────────────────────────────

export const localBuilderProfiles = sqliteTable("local_builder_profiles", {
  role:              text("role").primaryKey(),          // fast_code | deep_code | reviewer | rag_embedding
  modelName:         text("model_name"),
  status:            text("status").notNull().default("not_configured"),
  unavailableReason: text("unavailable_reason"),
  updatedAt:         text("updated_at").notNull(),
});

export const localBuilderEvalHistory = sqliteTable("local_builder_eval_history", {
  id:        text("id").primaryKey(),
  evalName:  text("eval_name").notNull(),
  passed:    integer("passed", { mode: "boolean" }).notNull().default(false),
  score:     real("score").notNull().default(0),
  details:   text("details").notNull().default(""),
  ranAt:     text("ran_at").notNull(),
});

// ── Inventory pipeline ───────────────────────────────────────────────────────

export const inventoryItems = sqliteTable("inventory_items", {
  id:              text("id").primaryKey(),
  name:            text("name").notNull(),
  type:            text("type").notNull().default("part"),
  quantity:        real("quantity").notNull().default(0),
  unit:            text("unit").notNull().default("unit"),
  locationLabel:   text("location_label"),
  notes:           text("notes"),
  vendorUrl:       text("vendor_url"),
  minimumQuantity: real("minimum_quantity"),
  truthStatus:     text("truth_status").notNull().default("proposed"),
  partNumber:      text("part_number"),
  barcode:         text("barcode"),
  nfcTagId:        text("nfc_tag_id"),
  metadata:        text("metadata").notNull().default("{}"),
  createdAt:       text("created_at").notNull(),
  updatedAt:       text("updated_at").notNull(),
  deletedAt:       text("deleted_at"),
});

export const projectRealityPipelines = sqliteTable("project_reality_pipelines", {
  id:             text("id").primaryKey(),
  projectName:    text("project_name").notNull(),
  stage:          text("stage").notNull().default("idea"),
  vehicleId:      text("vehicle_id"),
  workspacePath:  text("workspace_path"),
  partsListRef:   text("parts_list_ref"),
  evidenceRefs:   text("evidence_refs").notNull().default("[]"),
  notes:          text("notes"),
  metadata:       text("metadata").notNull().default("{}"),
  createdAt:      text("created_at").notNull(),
  updatedAt:      text("updated_at").notNull(),
});

export const inventoryActionProposals = sqliteTable("inventory_action_proposals", {
  id:             text("id").primaryKey(),
  itemId:         text("item_id").notNull(),
  actionType:     text("action_type").notNull(),
  proposedAction: text("proposed_action").notNull(),
  status:         text("status").notNull().default("proposed"),
  approvalId:     text("approval_id"),
  metadata:       text("metadata").notNull().default("{}"),
  createdAt:      text("created_at").notNull(),
  resolvedAt:     text("resolved_at"),
});

// ── Project Foreman (from Stage 2) ───────────────────────────────────────────

export const projectForemanProjects = sqliteTable("project_foreman_projects", {
  id:           text("id").primaryKey(),
  name:         text("name").notNull(),
  kind:         text("kind").notNull(),
  goal:         text("goal").notNull().default(""),
  status:       text("status").notNull().default("draft"),
  riskLevel:    text("risk_level").notNull().default("medium"),
  workspacePath: text("workspace_path"),
  brief:        text("brief").notNull().default(""),
  knownFacts:   text("known_facts").notNull().default("[]"),
  unknowns:     text("unknowns").notNull().default("[]"),
  assumptions:  text("assumptions").notNull().default("[]"),
  safetyChecks: text("safety_checks").notNull().default("[]"),
  rollbackPlan: text("rollback_plan").notNull().default(""),
  metadata:     text("metadata").notNull().default("{}"),
  createdAt:    text("created_at").notNull(),
  updatedAt:    text("updated_at").notNull(),
  dueAt:        text("due_at"),
  completedAt:  text("completed_at"),
});

export const projectForemanTasks = sqliteTable("project_foreman_tasks", {
  id:             text("id").primaryKey(),
  projectId:      text("project_id").notNull(),
  title:          text("title").notNull(),
  description:    text("description").notNull().default(""),
  state:          text("state").notNull().default("todo"),
  orderIndex:     integer("order_index").notNull().default(0),
  proposedAction: text("proposed_action"),
  approvalId:     text("approval_id"),
  durableJobId:   text("durable_job_id"),
  proofRef:       text("proof_ref"),
  metadata:       text("metadata").notNull().default("{}"),
  createdAt:      text("created_at").notNull(),
  updatedAt:      text("updated_at").notNull(),
  completedAt:    text("completed_at"),
});

export const projectForemanLinks = sqliteTable("project_foreman_links", {
  id:        text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  kind:      text("kind").notNull(),
  targetId:  text("target_id").notNull(),
  label:     text("label").notNull().default(""),
  metadata:  text("metadata").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
});

/*
 * After adding these to schema.ts, run:
 *
 *   cd artifacts/api-server
 *   pnpm drizzle-kit generate
 *   pnpm drizzle-kit migrate
 *
 * This generates proper SQL migrations instead of relying on lazy DDL.
 * The lazy DDL in the lib files can then be removed once you confirm
 * migrations are running on startup.
 *
 * Long-term: update each lib to import from the Drizzle schema and use
 * typed queries instead of raw sqlite.prepare() calls.
 */
