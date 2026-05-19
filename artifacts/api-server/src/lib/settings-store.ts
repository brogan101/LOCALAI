/**
 * settings-store.ts
 * -----------------
 * Thin read/write layer over the app_settings SQLite table.
 * Used by optional service executors (HomeLab, etc.) to retrieve
 * user-configured URLs and tokens without coupling directly to Drizzle.
 */

import { sqlite } from "../db/database.js";

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Read a string setting by key. Returns null if not found.
 * The value is stored as JSON in value_json; strings are returned as-is.
 */
export async function getSettingValue(key: string): Promise<string | null> {
  const row = sqlite
    .prepare("SELECT value_json FROM app_settings WHERE key = ?")
    .get(key) as { value_json?: string } | undefined;
  if (!row?.value_json) return null;
  try {
    const parsed: unknown = JSON.parse(row.value_json);
    return typeof parsed === "string" ? parsed : String(parsed);
  } catch {
    // raw non-JSON value (legacy) — return as-is
    return row.value_json;
  }
}

/**
 * Write (upsert) a setting value by key.
 */
export async function setSettingValue(key: string, value: unknown): Promise<void> {
  sqlite
    .prepare(
      `INSERT INTO app_settings (key, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE
         SET value_json = excluded.value_json,
             updated_at = excluded.updated_at`
    )
    .run(key, JSON.stringify(value), nowIso());
}
