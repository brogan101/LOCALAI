/**
 * MODEL ROLES SERVICE — Singleton cached accessor for role_assignments table
 * ============================================================================
 * Phase 5: reads and writes the SQLite role_assignments table instead of
 * model-roles.json.  The JSON file is migrated to SQLite on first boot
 * (handled by db/migrate.ts), so this service never touches the JSON file.
 *
 * Fallback chain for getRole(role):
 *   1. role_assignments table
 *   2. settings.defaultChatModel (for "chat") / settings.defaultCodingModel (for coding roles)
 *   3. First installed Ollama model whose name matches the role's affinity
 *   4. null
 */

import { createRequire } from "module";
import { fetchJson } from "./runtime.js";
import { thoughtLog } from "./thought-log.js";
import { inferAffinityFromName, type ModelRole } from "../config/models.config.js";

const require = createRequire(import.meta.url);
const DEFAULT_ROLE_ASSIGNMENTS = require("../config/default-model-roles.json") as Partial<Record<ModelRole, string>>;

// ── Lazy DB import ────────────────────────────────────────────────────────────

function getDb() {
  return import("../db/database.js");
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  roles: Record<string, string>;
  loadedAt: number;
}

const CACHE_TTL_MS = 10_000;
let cache: CacheEntry | null = null;

async function loadRolesFromDb(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) return cache.roles;

  try {
    const { sqlite } = await getDb();
    const rows = sqlite.prepare(
      "SELECT role, model_name FROM role_assignments"
    ).all() as Array<{ role: string; model_name: string }>;

    const roles: Record<string, string> = {};
    for (const r of rows) {
      roles[r.role] = r.model_name;
    }
    if (rows.length === 0) {
      const seededAt = new Date().toISOString();
      const defaults = Object.entries(DEFAULT_ROLE_ASSIGNMENTS)
        .filter((entry): entry is [ModelRole, string] => typeof entry[1] === "string" && entry[1].trim().length > 0);
      const insertDefault = sqlite.prepare(`
        INSERT OR IGNORE INTO role_assignments (role, model_name, updated_at)
        VALUES (?, ?, ?)
      `);
      const seedDefaults = sqlite.transaction((entries: Array<[ModelRole, string]>) => {
        for (const [role, modelName] of entries) {
          insertDefault.run(role, modelName, seededAt);
          roles[role] = modelName;
        }
      });
      seedDefaults(defaults);
      thoughtLog.publish({
        level:    "info",
        category: "config",
        title:    "Model Roles Seeded",
        message:  `Seeded ${defaults.length} default model role assignments`,
      });
    }
    cache = { roles, loadedAt: now };
    return roles;
  } catch {
    return cache?.roles ?? {};
  }
}

// ── Public service ────────────────────────────────────────────────────────────

export const modelRolesService = {
  /** Return all current role assignments. */
  async getRoles(): Promise<Record<string, string>> {
    return loadRolesFromDb();
  },

  /**
   * Return the model name assigned to a role.
   * Fallback chain:
   *   DB → settings defaults → first installed match → null
   */
  async getRole(role: ModelRole): Promise<string | null> {
    const roles = await loadRolesFromDb();
    if (roles[role] && typeof roles[role] === "string" && roles[role].trim()) {
      return roles[role].trim();
    }

    // Fallback: settings defaults
    try {
      const { loadSettings } = await import("./secure-config.js");
      const settings = (await loadSettings()) as unknown as Record<string, unknown>;
      if (role === "chat" && typeof settings["defaultChatModel"] === "string" && settings["defaultChatModel"]) {
        return settings["defaultChatModel"] as string;
      }
      if (
        (role === "primary-coding" || role === "fast-coding" || role === "autocomplete") &&
        typeof settings["defaultCodingModel"] === "string" &&
        settings["defaultCodingModel"]
      ) {
        return settings["defaultCodingModel"] as string;
      }
    } catch { /* ignore */ }

    // Fallback: first installed model matching affinity
    try {
      const { getOllamaUrl } = await import("./ollama-url.js");
      const base = await getOllamaUrl();
      const affinityTarget: "code" | "vision" | "general" =
        role === "primary-coding" || role === "fast-coding" || role === "autocomplete"
          ? "code"
          : role === "vision"
          ? "vision"
          : "general";

      const data = await fetchJson<{ models?: Array<{ name: string }> }>(
        `${base}/api/tags`, undefined, 4000,
      );
      const installed = (data.models ?? []).map(m => m.name);
      const match = installed.find(name => inferAffinityFromName(name) === affinityTarget);
      if (match) return match;
      if (installed.length > 0) return installed[0];
    } catch { /* ignore */ }

    return null;
  },

  /**
   * Persist a new role assignment to the SQLite DB and invalidate cache.
   */
  async setRole(role: ModelRole, modelName: string): Promise<void> {
    const now = new Date().toISOString();
    try {
      const { sqlite } = await getDb();
      sqlite.prepare(`
        INSERT INTO role_assignments (role, model_name, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(role) DO UPDATE SET model_name = excluded.model_name, updated_at = excluded.updated_at
      `).run(role, modelName, now);
      cache = null;
      thoughtLog.publish({
        level:    "info",
        category: "config",
        title:    "Role Assignment Updated",
        message:  `${role} → ${modelName}`,
        metadata: { role, modelName },
      });
    } catch (err) {
      thoughtLog.publish({
        level:    "warning",
        category: "config",
        title:    "Role Assignment Failed",
        message:  `Could not persist ${role} → ${modelName}: ${err instanceof Error ? err.message : String(err)}`,
      });
      throw err;
    }
  },

  /** Invalidate the cache so the next read hits DB. */
  invalidate(): void {
    cache = null;
  },

  /**
   * Legacy compatibility: exposes a stable path string for modules that
   * previously passed the JSON file path to repair/updater workflows.
   * Now returns the SQLite DB path since that is where role data lives.
   */
  get filePath(): string {
    const os   = require("os") as typeof import("os");
    const path = require("path") as typeof import("path");
    return path.join(os.homedir(), "LocalAI-Tools", "localai.db");
  },
};
