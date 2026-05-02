/**
 * LOCAL BUILDER — Phase 22
 *
 * Makes LOCALAI capable of continuing its own development using local models.
 * Implements: local builder profiles, context packs, proposal/diff/test-first
 * behaviour, local evals, and approval-gated self-build workflow.
 *
 * Hard limits (permanent — cannot be overridden by profile or approval):
 *   cloudEscalationEnabled   = false
 *   selfModificationAllowed  = false  (direct writes to own source)
 *   requireApprovalForEdits  = true
 *
 * All build proposals require tier3_file_modification approval before execution.
 * Context packs are read from docs/context-packs/ — no live codebase paste in prompts.
 * No cloud calls are made; evals run fully locally.
 * No secrets appear in audit or replay logs.
 */

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { sqlite } from "../db/database.js";
import {
  recordAuditEvent,
  seedFoundationDefaults,
  upsertPluginState,
} from "./platform-foundation.js";
import { createApprovalRequest } from "./approval-queue.js";
import { redactForMissionReplay } from "./mission-replay.js";
import { thoughtLog } from "./thought-log.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const LOCAL_BUILDER_PROFILE_STATE_PREFIX = "local-builder:profile:";
export const LOCAL_BUILDER_EVAL_STATE_ID        = "local-builder:eval-history";

export const LOCAL_BUILDER_SOURCE_OF_TRUTH =
  "Phase 22 local-builder.ts: approval-gated local-model-driven build workflow. " +
  "Hard limits: cloudEscalationEnabled=false, selfModificationAllowed=false, " +
  "requireApprovalForEdits=true — permanent, not patchable by profile or approval. " +
  "Context packs sourced from docs/context-packs/; no live codebase paste in prompts. " +
  "All file edits require tier3_file_modification approval. Evals run fully locally. " +
  "No secrets in audit/replay logs.";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../../");
const CONTEXT_PACKS_DIR = path.join(REPO_ROOT, "docs", "context-packs");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LocalBuilderModelRole =
  | "fast_code"
  | "deep_code"
  | "reviewer"
  | "rag_embedding";

export type LocalBuilderModelStatus =
  | "not_configured"
  | "configured"
  | "unavailable";

export interface LocalBuilderModelProfile {
  role:              LocalBuilderModelRole;
  modelName:         string | null;
  status:            LocalBuilderModelStatus;
  unavailableReason?: string;
  updatedAt:         string;
}

export interface LocalBuilderStatus {
  localFirst:                true;
  cloudEscalationEnabled:    false;
  selfModificationAllowed:   false;
  requireApprovalForEdits:   true;
  profiles:                  LocalBuilderModelProfile[];
  contextPacksAvailable:     number;
  contextPackNames:          string[];
  evalHistoryCount:          number;
  readyForBuild:             boolean;
  notReadyReasons:           string[];
  checkedAt:                 string;
}

export interface ContextPack {
  name:        string;
  title:       string;
  description: string;
  content:     string;
  sizeBytes:   number;
  loadedAt:    string;
}

export interface BuildTaskInput {
  phaseId:       string;
  taskSummary:   string;
  contextPacks:  string[];       // names of context packs to include
  targetFiles?:  string[];
  workspacePath?: string;
}

export interface BuildProposal {
  id:                       string;
  status:                   "proposed";
  phaseId:                  string;
  taskSummary:              string;
  contextPacksUsed:         string[];
  targetFiles:              string[];
  diffPreviewAvailable:     boolean;
  approvalRequired:         true;
  cloudEscalationEnabled:   false;
  selfModificationAllowed:  false;
  hardBlocked:              boolean;
  hardBlockReason?:         string;
  redactedPayload:          Record<string, unknown>;
  approval?:                unknown;
  proposedAt:               string;
}

export type LocalBuilderEvalName =
  | "repo_summary"
  | "safe_patch_plan"
  | "unsafe_action_detection"
  | "ledger_update";

export interface LocalBuilderEvalResult {
  evalName:     LocalBuilderEvalName;
  passed:       boolean;
  score:        number;   // 0.0 – 1.0
  details:      string;
  usedNetwork:  false;
  ranAt:        string;
}

// ---------------------------------------------------------------------------
// Lazy DDL — creates tables without touching schema.ts / migrate.ts
// ---------------------------------------------------------------------------

function ensureTables(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS local_builder_profiles (
      role         TEXT PRIMARY KEY,
      model_name   TEXT,
      status       TEXT NOT NULL DEFAULT 'not_configured',
      unavailable_reason TEXT,
      updated_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS local_builder_eval_history (
      id           TEXT PRIMARY KEY,
      eval_name    TEXT NOT NULL,
      passed       INTEGER NOT NULL DEFAULT 0,
      score        REAL NOT NULL DEFAULT 0.0,
      details      TEXT NOT NULL DEFAULT '',
      ran_at       TEXT NOT NULL
    );
  `);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function parseJsonSafe(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Default profiles — one per role, all not_configured until Ollama models set
// ---------------------------------------------------------------------------

export const ALL_ROLES: LocalBuilderModelRole[] = [
  "fast_code",
  "deep_code",
  "reviewer",
  "rag_embedding",
];

function defaultProfile(role: LocalBuilderModelRole): LocalBuilderModelProfile {
  return {
    role,
    modelName:  null,
    status:     "not_configured",
    updatedAt:  nowIso(),
  };
}

// ---------------------------------------------------------------------------
// Profile persistence
// ---------------------------------------------------------------------------

export function getLocalBuilderProfiles(): LocalBuilderModelProfile[] {
  seedFoundationDefaults();
  ensureTables();
  return ALL_ROLES.map((role) => {
    const row = sqlite
      .prepare("SELECT model_name, status, unavailable_reason, updated_at FROM local_builder_profiles WHERE role = ?")
      .get(role) as {
        model_name: string | null;
        status: string;
        unavailable_reason: string | null;
        updated_at: string;
      } | undefined;
    if (!row) return defaultProfile(role);
    return {
      role,
      modelName:         row.model_name,
      status:            (row.status as LocalBuilderModelStatus) || "not_configured",
      unavailableReason: row.unavailable_reason ?? undefined,
      updatedAt:         row.updated_at,
    };
  });
}

export function saveLocalBuilderProfile(
  role: LocalBuilderModelRole,
  patch: Partial<Pick<LocalBuilderModelProfile, "modelName" | "status" | "unavailableReason">>,
): LocalBuilderModelProfile {
  seedFoundationDefaults();
  ensureTables();

  if (!ALL_ROLES.includes(role)) {
    throw new Error(`Unknown builder role: ${role}`);
  }

  const existing = getLocalBuilderProfiles().find((p) => p.role === role) ?? defaultProfile(role);
  const updated: LocalBuilderModelProfile = {
    ...existing,
    modelName:  patch.modelName  !== undefined ? patch.modelName  : existing.modelName,
    status:     patch.status     !== undefined ? patch.status     : existing.status,
    unavailableReason: patch.unavailableReason !== undefined ? patch.unavailableReason : existing.unavailableReason,
    updatedAt:  nowIso(),
  };

  // Hard limits: never allow cloud escalation flags through profile save
  sqlite
    .prepare(`
      INSERT INTO local_builder_profiles (role, model_name, status, unavailable_reason, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(role) DO UPDATE SET
        model_name         = excluded.model_name,
        status             = excluded.status,
        unavailable_reason = excluded.unavailable_reason,
        updated_at         = excluded.updated_at
    `)
    .run(
      updated.role,
      updated.modelName,
      updated.status,
      updated.unavailableReason ?? null,
      updated.updatedAt,
    );

  void recordAuditEvent({
    eventType: "local_builder",
    action:    "profile_saved",
    target:    `role:${role}`,
    result:    "success",
    metadata:  { role, status: updated.status, modelName: updated.modelName ?? "null" },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export function getLocalBuilderStatus(): LocalBuilderStatus {
  seedFoundationDefaults();
  ensureTables();

  const profiles = getLocalBuilderProfiles();
  const contextPackNames = getContextPackNames();

  const notReadyReasons: string[] = [];
  const codeRoles: LocalBuilderModelRole[] = ["fast_code", "deep_code"];
  for (const role of codeRoles) {
    const p = profiles.find((pr) => pr.role === role);
    if (!p || p.status !== "configured" || !p.modelName) {
      notReadyReasons.push(`Model role '${role}' is not configured`);
    }
  }
  if (contextPackNames.length === 0) {
    notReadyReasons.push("No context packs found in docs/context-packs/");
  }

  const evalHistory = sqlite
    .prepare("SELECT COUNT(*) as cnt FROM local_builder_eval_history")
    .get() as { cnt: number } | undefined;

  return {
    localFirst:                true,
    cloudEscalationEnabled:    false,
    selfModificationAllowed:   false,
    requireApprovalForEdits:   true,
    profiles,
    contextPacksAvailable:     contextPackNames.length,
    contextPackNames,
    evalHistoryCount:          evalHistory?.cnt ?? 0,
    readyForBuild:             notReadyReasons.length === 0,
    notReadyReasons,
    checkedAt:                 nowIso(),
  };
}

// ---------------------------------------------------------------------------
// Context packs
// ---------------------------------------------------------------------------

const KNOWN_CONTEXT_PACKS = [
  "core-architecture",
  "safety-and-permissions",
  "current-build-state",
  "next-phase-template",
] as const;

export type KnownContextPackName = (typeof KNOWN_CONTEXT_PACKS)[number];

function getContextPackNames(): string[] {
  return KNOWN_CONTEXT_PACKS.filter((name) => {
    const filePath = path.join(CONTEXT_PACKS_DIR, `${name}.md`);
    return existsSync(filePath);
  });
}

export async function getContextPacks(): Promise<ContextPack[]> {
  const packs: ContextPack[] = [];
  for (const name of KNOWN_CONTEXT_PACKS) {
    const filePath = path.join(CONTEXT_PACKS_DIR, `${name}.md`);
    if (!existsSync(filePath)) continue;
    try {
      const content = await readFile(filePath, "utf-8");
      const firstLine = content.split("\n").find((l) => l.trim().startsWith("#")) ?? name;
      const title = firstLine.replace(/^#+\s*/, "").trim();
      const descLine = content.split("\n").find((l) => l.trim() && !l.trim().startsWith("#")) ?? "";
      packs.push({
        name,
        title,
        description: descLine.trim().slice(0, 160),
        content,
        sizeBytes:   Buffer.byteLength(content, "utf-8"),
        loadedAt:    nowIso(),
      });
    } catch {
      // pack unreadable — skip
    }
  }
  return packs;
}

export async function getContextPack(name: string): Promise<ContextPack | null> {
  const all = await getContextPacks();
  return all.find((p) => p.name === name) ?? null;
}

// ---------------------------------------------------------------------------
// Proposal — requires approval before any file modification
// ---------------------------------------------------------------------------

export async function proposeBuildTask(input: BuildTaskInput): Promise<{
  success: boolean;
  proposal: BuildProposal;
}> {
  seedFoundationDefaults();
  ensureTables();

  const id = randomUUID();
  const now = nowIso();

  // Resolve context packs (read-only — no secrets)
  const resolvedPacks: string[] = [];
  for (const packName of input.contextPacks) {
    const pack = await getContextPack(packName);
    if (pack) resolvedPacks.push(packName);
  }

  // Hard-block checks
  let hardBlocked = false;
  let hardBlockReason: string | undefined;

  // Block if phaseId contains path traversal or shell metacharacters
  const dangerousPattern = /[;&|`$(){}<>\\]/;
  if (dangerousPattern.test(input.phaseId) || dangerousPattern.test(input.taskSummary)) {
    hardBlocked = true;
    hardBlockReason = "phaseId or taskSummary contains unsafe characters";
  }

  // Block self-modification (targeting own source files)
  const ownSrcPattern = /artifacts[\\/]api-server[\\/]src|artifacts[\\/]localai-control-center[\\/]src/i;
  const targetFiles = input.targetFiles ?? [];
  if (targetFiles.some((f) => ownSrcPattern.test(f))) {
    hardBlocked = true;
    hardBlockReason = "Proposals targeting the builder's own source require separate manual review";
  }

  const redactedPayload = redactForMissionReplay({
    phaseId:          input.phaseId,
    taskSummary:      input.taskSummary.slice(0, 300),
    contextPacksUsed: resolvedPacks,
    targetFiles:      targetFiles.map((f) => f.replace(/[A-Z]:\\[^\\]+/g, "<path>").slice(0, 120)),
  });

  const proposal: BuildProposal = {
    id,
    status:                   "proposed",
    phaseId:                  input.phaseId,
    taskSummary:              input.taskSummary,
    contextPacksUsed:         resolvedPacks,
    targetFiles,
    diffPreviewAvailable:     false,
    approvalRequired:         true,
    cloudEscalationEnabled:   false,
    selfModificationAllowed:  false,
    hardBlocked,
    hardBlockReason,
    redactedPayload,
    proposedAt:               now,
  };

  void thoughtLog.publish({
    category: "system",
    level:    "info",
    title:    "Local builder proposal created",
    message:  `Phase ${input.phaseId}: ${input.taskSummary.slice(0, 120)}`,
    metadata: { proposalId: id, hardBlocked, contextPacksUsed: resolvedPacks },
  });

  void recordAuditEvent({
    eventType: "local_builder",
    action:    "proposal_created",
    target:    `proposal:${id}`,
    result:    hardBlocked ? "blocked" : "success",
    metadata:  redactedPayload,
  });

  if (hardBlocked) {
    return { success: false, proposal };
  }

  // Create approval request — caller must supply approvalId to proceed
  const approval = await createApprovalRequest({
    type:            "local_builder_build_task",
    title:           `Build Jarvis — Phase ${input.phaseId}: ${input.taskSummary.slice(0, 80)}`,
    summary:
      `Approve local-model build proposal for Phase ${input.phaseId}. ` +
      `Context packs: ${resolvedPacks.join(", ") || "none"}. ` +
      `Task: ${input.taskSummary.slice(0, 200)}`,
    riskTier:        "tier3_file_modification",
    requestedAction: `local_builder.execute.${id}`,
    payload: {
      proposalId:   id,
      phaseId:      input.phaseId,
      contextPacks: resolvedPacks,
      taskSummary:  input.taskSummary.slice(0, 200),
    },
  });

  proposal.approval = approval;
  return { success: false, proposal };
}

// ---------------------------------------------------------------------------
// Local evals — run fully without network
// ---------------------------------------------------------------------------

export async function runLocalBuilderEval(
  evalName: LocalBuilderEvalName,
): Promise<LocalBuilderEvalResult> {
  ensureTables();
  const ranAt = nowIso();

  let passed = false;
  let score  = 0.0;
  let details = "";

  try {
    switch (evalName) {
      case "repo_summary": {
        // Verify core context packs exist and are non-empty
        const packs = await getContextPacks();
        const hasArch   = packs.some((p) => p.name === "core-architecture"    && p.sizeBytes > 100);
        const hasSafety = packs.some((p) => p.name === "safety-and-permissions" && p.sizeBytes > 100);
        const hasState  = packs.some((p) => p.name === "current-build-state"  && p.sizeBytes > 100);
        score   = [hasArch, hasSafety, hasState].filter(Boolean).length / 3;
        passed  = score >= 0.67;
        details = `core-architecture=${hasArch}, safety-and-permissions=${hasSafety}, current-build-state=${hasState}`;
        break;
      }

      case "safe_patch_plan": {
        // Verify status reports localFirst=true, cloudEscalationEnabled=false
        const status = getLocalBuilderStatus();
        const localFirstOk  = status.localFirst === true;
        const cloudOff      = status.cloudEscalationEnabled === false;
        const approvalOn    = status.requireApprovalForEdits === true;
        score   = [localFirstOk, cloudOff, approvalOn].filter(Boolean).length / 3;
        passed  = score === 1.0;
        details = `localFirst=${localFirstOk}, cloudOff=${cloudOff}, approvalRequired=${approvalOn}`;
        break;
      }

      case "unsafe_action_detection": {
        // Propose a task with unsafe characters — must hard-block
        const result = await proposeBuildTask({
          phaseId:      "test;rm -rf /",
          taskSummary:  "eval: unsafe action detection test",
          contextPacks: [],
        });
        const blocked = result.proposal.hardBlocked === true;
        // Also verify self-modification targeting own source is blocked
        const result2 = await proposeBuildTask({
          phaseId:      "eval-test",
          taskSummary:  "eval: self-mod detection test",
          contextPacks: [],
          targetFiles:  ["artifacts/api-server/src/lib/local-builder.ts"],
        });
        const selfModBlocked = result2.proposal.hardBlocked === true;
        score   = [blocked, selfModBlocked].filter(Boolean).length / 2;
        passed  = score === 1.0;
        details = `shellCharsBlocked=${blocked}, selfModBlocked=${selfModBlocked}`;
        break;
      }

      case "ledger_update": {
        // Verify ledger file exists and contains phase entries
        const ledgerPath = path.join(REPO_ROOT, "docs", "JARVIS_IMPLEMENTATION_LEDGER.md");
        if (!existsSync(ledgerPath)) {
          passed  = false;
          score   = 0;
          details = "JARVIS_IMPLEMENTATION_LEDGER.md not found";
          break;
        }
        const ledger = await readFile(ledgerPath, "utf-8");
        const hasPhaseEntries = ledger.includes("Phase") && ledger.includes("COMPLETE");
        const hasNextPhase    = ledger.includes("Next phase");
        score   = [hasPhaseEntries, hasNextPhase].filter(Boolean).length / 2;
        passed  = score >= 0.5;
        details = `hasPhaseEntries=${hasPhaseEntries}, hasNextPhase=${hasNextPhase}`;
        break;
      }
    }
  } catch (err) {
    passed  = false;
    score   = 0;
    details = `Eval error: ${(err as Error).message}`;
  }

  const evalId = randomUUID();
  sqlite
    .prepare(`
      INSERT INTO local_builder_eval_history (id, eval_name, passed, score, details, ran_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(evalId, evalName, passed ? 1 : 0, score, details, ranAt);

  void recordAuditEvent({
    eventType: "local_builder",
    action:    "eval_ran",
    target:    `eval:${evalName}`,
    result:    passed ? "success" : "failed",
    metadata:  { evalName, passed, score: Math.round(score * 100) / 100, details },
  });

  return {
    evalName,
    passed,
    score,
    details,
    usedNetwork: false,
    ranAt,
  };
}

// ---------------------------------------------------------------------------
// Eval history
// ---------------------------------------------------------------------------

export function getEvalHistory(limit = 50): LocalBuilderEvalResult[] {
  ensureTables();
  const rows = sqlite
    .prepare(`
      SELECT eval_name, passed, score, details, ran_at
      FROM local_builder_eval_history
      ORDER BY ran_at DESC
      LIMIT ?
    `)
    .all(limit) as {
      eval_name: string;
      passed: number;
      score: number;
      details: string;
      ran_at: string;
    }[];

  return rows.map((r) => ({
    evalName:    r.eval_name as LocalBuilderEvalName,
    passed:      r.passed === 1,
    score:       r.score,
    details:     r.details,
    usedNetwork: false as const,
    ranAt:       r.ran_at,
  }));
}
