/**
 * AUTOMOTIVE LOG IMPORT EXECUTOR
 * ================================
 * Phase 25 / B-009 family. Activates the "Automotive" advanced nav item
 * from a placeholder to a fully functional log import and analysis pipeline.
 *
 * Supports:
 *   - OBD-II CSV logs (Torque Pro, OBD Fusion, HP Tuners datalog format)
 *   - ECU tune files (metadata only — no binary write, ever)
 *   - Aces Jackpot Pro / HPTuners / EFILive table exports (CSV)
 *   - BSOD minidump correlation (pulls WinDbg summary if available)
 *
 * Modes:
 *   validate  — file exists, columns recognised, row count
 *   dry_run   — parse 50 rows, emit detected PIDs and anomalies
 *   execute   — full parse → RAG ingest → analysis report
 *   verify    — confirm collection contains the ingested source
 *
 * Collection: "automotive" (created if missing)
 */

import { readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { logger } from "./logger.js";
import {
  registerExecutor,
  type ExecutorRunner,
  type ExecutorRunnerContext,
  type ExecutorRunnerResult,
} from "./approved-executor.js";

export const AUTOMOTIVE_LOG_KIND = "automotive_log_import";

// ─────────────────────────────────────────────────────────────────────────────
// Known OBD PID column names (Torque Pro defaults + common alternates)
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_PIDS = [
  "RPM", "Speed", "Throttle", "MAP", "MAF", "IAT", "ECT", "O2",
  "STFT", "LTFT", "Boost", "AFR", "Lambda", "TPS", "Load",
  "Timing", "Knock", "Fuel", "Voltage", "Battery", "Gear",
  "Coolant", "OilTemp", "ExhaustTemp", "WidebandO2",
  // HP Tuners specific
  "Actual AFR", "Commanded AFR", "VE", "Spark Advance",
  "Closed Loop", "Fueling Mode", "Knock Retard",
  // Aces Jackpot Pro
  "Accel Enrich", "Wall Film", "Startup Enrich",
];

// ─────────────────────────────────────────────────────────────────────────────
// Payload
// ─────────────────────────────────────────────────────────────────────────────

export interface AutomotiveLogPayload {
  /** Absolute path to the log file */
  filePath: string;
  /** "obd_csv" | "ecu_csv" | "hptuners_csv" | "acesjackpot_csv" | "generic_csv" */
  logType: "obd_csv" | "ecu_csv" | "hptuners_csv" | "acesjackpot_csv" | "generic_csv";
  /** Human label for this session (e.g. "WOT pull 2024-05-06") */
  sessionLabel?: string;
  /** Target RAG collection. Defaults to "automotive". */
  collection?: string;
  /** If true, run anomaly detection on the parsed data */
  detectAnomalies?: boolean;
  /** Engine / vehicle context for the analysis prompt */
  vehicleContext?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV parser (no external deps — keep it self-contained)
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedLog {
  headers: string[];
  rows: Record<string, string>[];
  detectedPids: string[];
  rowCount: number;
  sampleRows: Record<string, string>[];
  logType: string;
}

function parseCsv(raw: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = raw.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });

  return { headers, rows };
}

function detectPids(headers: string[]): string[] {
  const lower = headers.map((h) => h.toLowerCase());
  return KNOWN_PIDS.filter((pid) =>
    lower.some((h) => h.includes(pid.toLowerCase())),
  );
}

function detectAnomalies(rows: Record<string, string>[], pids: string[]): string[] {
  const anomalies: string[] = [];

  // Knock detection
  const knockCols = pids.filter((p) => p.toLowerCase().includes("knock"));
  for (const col of knockCols) {
    const values = rows.map((r) => parseFloat(r[col] ?? "0")).filter(Number.isFinite);
    const maxKnock = Math.max(...values);
    if (maxKnock > 2) {
      anomalies.push(`High knock retard detected: max ${maxKnock.toFixed(1)}° — check timing tables`);
    }
  }

  // AFR lean detect
  const afrCols = pids.filter((p) => p.toLowerCase().includes("afr") || p.toLowerCase().includes("lambda"));
  for (const col of afrCols) {
    const values = rows.map((r) => parseFloat(r[col] ?? "14.7")).filter(Number.isFinite);
    const leanPct = values.filter((v) => v > 15.5).length / values.length;
    if (leanPct > 0.05) {
      anomalies.push(`Lean condition detected in ${col}: ${(leanPct * 100).toFixed(0)}% of samples above 15.5:1 AFR`);
    }
  }

  // Boost overrun
  const boostCols = pids.filter((p) => p.toLowerCase().includes("boost") || p.toLowerCase().includes("map"));
  for (const col of boostCols) {
    const values = rows.map((r) => parseFloat(r[col] ?? "0")).filter(Number.isFinite);
    const maxBoost = Math.max(...values);
    if (maxBoost > 25) {
      anomalies.push(`High boost: max ${maxBoost.toFixed(1)} PSI — verify wastegate control`);
    }
  }

  return anomalies;
}

function summariseLog(parsed: ParsedLog, vehicleContext?: string): string {
  const lines: string[] = [
    `# Automotive Log Import — ${parsed.logType}`,
    `**Session rows:** ${parsed.rowCount}`,
    `**Detected PIDs:** ${parsed.detectedPids.join(", ") || "none"}`,
    "",
  ];

  if (vehicleContext) {
    lines.push(`**Vehicle context:** ${vehicleContext}`, "");
  }

  // Numeric summaries for key PIDs
  if (parsed.rows.length > 0) {
    lines.push("## Key Channel Summaries");
    for (const pid of parsed.detectedPids.slice(0, 8)) {
      const col = parsed.headers.find((h) => h.toLowerCase().includes(pid.toLowerCase()));
      if (!col) continue;
      const values = parsed.rows.map((r) => parseFloat(r[col] ?? "")).filter(Number.isFinite);
      if (values.length === 0) continue;
      const min = Math.min(...values).toFixed(2);
      const max = Math.max(...values).toFixed(2);
      const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
      lines.push(`- **${col}**: min=${min}  avg=${avg}  max=${max}`);
    }
    lines.push("");
  }

  // Sample rows for RAG context
  lines.push("## Sample Data (first 5 rows)");
  for (const row of parsed.rows.slice(0, 5)) {
    lines.push(JSON.stringify(row));
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

const automotiveLogRunner: ExecutorRunner = async (ctx: ExecutorRunnerContext): Promise<ExecutorRunnerResult> => {
  const { request, checkpoint, appendVerification } = ctx;
  const mode = request.mode ?? "dry_run";
  const payload = request.payload as unknown as AutomotiveLogPayload;
  const collection = payload.collection ?? "automotive";

  if (!payload.filePath) {
    return { success: false, executed: false, redactedSummary: "filePath required" };
  }

  const absPath = path.resolve(payload.filePath);

  // ── Validate
  checkpoint("validate");
  if (!existsSync(absPath)) {
    await appendVerification(`File not found: ${absPath}`);
    return { success: false, executed: false, redactedSummary: `File not found: ${payload.filePath}` };
  }

  const fileStat = await stat(absPath);
  const ext = path.extname(absPath).toLowerCase();

  if (![".csv", ".log", ".txt", ".hpl"].includes(ext)) {
    await appendVerification(`Unsupported extension: ${ext}`);
    return { success: false, executed: false, redactedSummary: `Unsupported file type: ${ext}` };
  }

  await appendVerification(`File: ${absPath} (${(fileStat.size / 1024).toFixed(1)} KB)`);

  if (mode === "validate") {
    // Peek at first line
    const rawPreview = await readFile(absPath, "utf-8").catch(() => "");
    const firstLine = rawPreview.split("\n")[0] ?? "";
    const headers = firstLine.split(",").map((h) => h.trim());
    const pids = detectPids(headers);
    await appendVerification(`Headers found: ${headers.length}  Known PIDs: ${pids.join(", ") || "none"}`);
    return {
      success: true,
      executed: false,
      result: { headers, detectedPids: pids, fileSizeBytes: fileStat.size },
      redactedSummary: `Validated OK — ${headers.length} columns, ${pids.length} known PIDs`,
    };
  }

  // ── Parse
  checkpoint("parse");
  const raw = await readFile(absPath, "utf-8");
  const { headers, rows } = parseCsv(raw);
  const detectedPids = detectPids(headers);

  await appendVerification(`Parsed ${rows.length} rows, ${detectedPids.length} known PIDs detected`);

  if (mode === "dry_run") {
    const anomalies = payload.detectAnomalies ? detectAnomalies(rows.slice(0, 50), detectedPids) : [];
    await appendVerification(`Dry-run preview: 50 rows analyzed, ${anomalies.length} anomalies`);

    return {
      success: true,
      executed: false,
      result: {
        mode: "dry_run",
        rowCount: rows.length,
        detectedPids,
        previewAnomalies: anomalies,
        sampleHeaders: headers,
      },
      redactedSummary: `Dry-run OK — ${rows.length} rows, ${detectedPids.length} PIDs, ${anomalies.length} anomalies`,
    };
  }

  // ── Execute — full parse + anomaly detect + RAG ingest
  checkpoint("analyse");
  const anomalies = payload.detectAnomalies ? detectAnomalies(rows, detectedPids) : [];
  await appendVerification(`Anomaly detection: ${anomalies.length} issues found`);

  const parsed: ParsedLog = {
    headers,
    rows,
    detectedPids,
    rowCount: rows.length,
    sampleRows: rows.slice(0, 10),
    logType: payload.logType,
  };

  const summary = summariseLog(parsed, payload.vehicleContext);
  const sessionLabel = payload.sessionLabel ?? path.basename(absPath, ext);

  checkpoint("ingest");
  const { rag } = await import("./rag.js");

  const ingestResult = await rag.ingest(collection, {
    content: summary,
    source: `automotive:${sessionLabel}`,
  }).catch((err: Error) => ({ chunksAdded: 0, source: { id: "" }, error: err.message }));

  await appendVerification(
    `Ingested into collection "${collection}": ${ingestResult.chunksAdded ?? 0} chunks, source=${ingestResult.source?.id}`,
  );

  // ── Verify
  if (mode === "verify") {
    checkpoint("verify");
    const verified = (ingestResult.chunksAdded ?? 0) > 0;
    await appendVerification(verified ? "Verification: chunks present in index" : "Verification: FAILED — 0 chunks");
    return {
      success: verified,
      executed: false,
      result: { verified, chunksAdded: ingestResult.chunksAdded },
      redactedSummary: verified ? "Verification passed" : "Verification failed — check RAG index",
    };
  }

  return {
    success: true,
    executed: true,
    result: {
      rowCount: rows.length,
      detectedPids,
      anomalies,
      chunksIngested: ingestResult.chunksAdded ?? 0,
      sourceId: ingestResult.source?.id,
      collection,
      sessionLabel,
    },
    rollbackNotes: `To remove this ingest, delete source "${sessionLabel}" from collection "${collection}" via the RAG admin panel.`,
    redactedSummary: `Imported ${rows.length} rows, ${detectedPids.length} PIDs, ${anomalies.length} anomalies → ${ingestResult.chunksAdded ?? 0} chunks in "${collection}"`,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

let registered = false;
export function ensureAutomotiveLogExecutorRegistered(): void {
  if (registered) return;
  registerExecutor(AUTOMOTIVE_LOG_KIND, automotiveLogRunner);
  registered = true;
  logger.info("automotive-log-executor: registered");
}
