import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import os from "os";
import { mkdirSync } from "fs";
import * as schema from "./schema.js";

const DB_DIR  = path.join(os.homedir(), "LocalAI-Tools");
const DB_PATH = path.join(DB_DIR, "localai.db");

mkdirSync(DB_DIR, { recursive: true });

const sqlite = new Database(DB_PATH);
// Enable WAL mode for concurrent reads
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export { sqlite };
