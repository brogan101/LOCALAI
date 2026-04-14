/**
 * FILE EXECUTION AGENT — Sovereign Self-Healing Runner
 * ======================================================
 * Executes shell commands or script files and, when they fail, feeds the
 * stderr back to the local LLM to obtain a corrected version of the file.
 * The repair cycle runs up to MAX_REPAIR_ATTEMPTS times before giving up.
 *
 * Capabilities:
 *   • runFile(filePath, opts)     — execute a script, capture stdout/stderr
 *   • runCommand(cmd, opts)       — execute an arbitrary shell command
 *   • selfHealingRun(filePath)    — run → on failure: LLM proposes fix → retry
 *   • diagnoseError(stderr, src)  — ask LLM to explain an error
 *   • suggestFix(filePath, err)   — ask LLM for corrected file content
 */

import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { exec as cpExec, spawn } from "child_process";
import { promisify } from "util";
import { logger } from "./logger.js";
import { thoughtLog } from "./thought-log.js";
import { isWindows, toolsRoot, postJson } from "./runtime.js";
import { writeManagedFile } from "./snapshot-manager.js";

const execAsync = promisify(cpExec);
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Constants ─────────────────────────────────────────────────────────────────

const OLLAMA_BASE         = "http://127.0.0.1:11434";
const MAX_REPAIR_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS  = 60_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RunOptions {
  /** Working directory for the command. Defaults to file's directory. */
  cwd?: string;
  /** Environment variables to inject. */
  env?: Record<string, string>;
  /** Timeout in milliseconds. Default: 60 000. */
  timeoutMs?: number;
  /** If true, stream stdout lines to the ThoughtLog in real-time. */
  streamToThoughts?: boolean;
}

export interface RunResult {
  success:    boolean;
  exitCode:   number | null;
  stdout:     string;
  stderr:     string;
  durationMs: number;
  command:    string;
  timedOut:   boolean;
}

export interface SelfHealingResult {
  success:         boolean;
  attempts:        number;
  finalRun:        RunResult;
  repairs:         RepairAttempt[];
  filePath:        string;
  finalContent?:   string;
}

export interface RepairAttempt {
  attempt:        number;
  errorSummary:   string;
  proposedFix?:   string;
  appliedFix:     boolean;
  runAfterFix:    RunResult;
}

export interface DiagnoseResult {
  explanation:   string;
  rootCause:     string;
  suggestions:   string[];
  model:         string;
}

// ── LLM helpers ───────────────────────────────────────────────────────────────

async function getPreferredModel(): Promise<string> {
  try {
    const rolesFile = path.join(toolsRoot(), "model-roles.json");
    if (existsSync(rolesFile)) {
      const roles = JSON.parse(await readFile(rolesFile, "utf-8")) as Record<string, string>;
      return roles["primary-coding"] || roles.chat || "llama3.1";
    }
  } catch { /* fall through */ }
  return "llama3.1";
}

async function ollamaGenerate(prompt: string, model: string, timeoutMs = 60_000): Promise<string> {
  const result = await postJson<{ response?: string }>(
    `${OLLAMA_BASE}/api/generate`,
    { model, prompt, stream: false },
    timeoutMs,
  );
  return (result.response ?? "").trim();
}

// ── Core execution ────────────────────────────────────────────────────────────

/** Determine the interpreter for a script file based on its extension. */
function resolveInterpreter(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".py":  return isWindows ? "python" : "python3";
    case ".js":  return "node";
    case ".ts":  return "tsx";
    case ".sh":  return "bash";
    case ".ps1": return "powershell -NoProfile -ExecutionPolicy Bypass -File";
    case ".bat":
    case ".cmd": return "cmd /c";
    default:     return filePath; // assume executable
  }
}

/**
 * Run a shell command and return a structured result.
 */
export async function runCommand(
  command: string,
  opts: RunOptions = {},
): Promise<RunResult> {
  const { cwd, env, timeoutMs = DEFAULT_TIMEOUT_MS, streamToThoughts = false } = opts;
  const start = Date.now();
  let timedOut = false;

  return new Promise<RunResult>(resolve => {
    const child = cpExec(
      command,
      {
        cwd,
        env:        { ...process.env, ...env },
        timeout:    timeoutMs,
        maxBuffer:  1024 * 1024 * 16,
        windowsHide: !streamToThoughts,
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - start;
        timedOut = !!(error && "killed" in error && error.killed);
        const exitCode = (error as NodeJS.ErrnoException & { code?: number })?.code ?? 0;
        resolve({
          success:    !error || exitCode === 0,
          exitCode:   typeof exitCode === "number" ? exitCode : null,
          stdout:     stdout ?? "",
          stderr:     stderr ?? "",
          durationMs,
          command,
          timedOut,
        });
      },
    );

    if (streamToThoughts && child.stdout) {
      child.stdout.on("data", (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (line) {
          thoughtLog.publish({
            category: "system",
            title:    "Execution Output",
            message:  line.slice(0, 300),
          });
        }
      });
    }
  });
}

/**
 * Run a script file using the appropriate interpreter.
 */
export async function runFile(
  filePath: string,
  opts: RunOptions = {},
): Promise<RunResult> {
  if (!existsSync(filePath)) {
    const durationMs = 0;
    return {
      success: false, exitCode: null,
      stdout: "", stderr: `File not found: ${filePath}`,
      durationMs, command: filePath, timedOut: false,
    };
  }
  const interpreter = resolveInterpreter(filePath);
  const command     = `${interpreter} ${isWindows ? `"${filePath}"` : `'${filePath}'`}`;
  const cwd         = opts.cwd ?? path.dirname(filePath);
  return runCommand(command, { ...opts, cwd });
}

// ── Self-healing loop ─────────────────────────────────────────────────────────

/**
 * Attempt to diagnose the stderr of a failed run.
 */
export async function diagnoseError(
  stderr:     string,
  sourceCode: string,
  filePath:   string,
): Promise<DiagnoseResult> {
  const model = await getPreferredModel();
  const prompt = [
    "You are an expert debugger.",
    "The following script failed with this error. Explain the root cause in one sentence.",
    "Then list 2-3 concrete fixes as a JSON object with keys:",
    '  { "rootCause": "...", "explanation": "...", "suggestions": ["fix1", "fix2"] }',
    "Return ONLY valid JSON — no prose, no markdown.",
    "",
    `File: ${filePath}`,
    "",
    "=== SOURCE CODE ===",
    sourceCode.slice(0, 2000),
    "",
    "=== STDERR ===",
    stderr.slice(0, 1000),
  ].join("\n");

  try {
    const response  = await ollamaGenerate(prompt, model, 45_000);
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<DiagnoseResult>;
      return {
        rootCause:   parsed.rootCause   ?? "Unknown error",
        explanation: parsed.explanation ?? stderr.slice(0, 200),
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        model,
      };
    }
  } catch { /* fall through */ }

  return {
    rootCause:   "Parse failed",
    explanation: stderr.slice(0, 300),
    suggestions: [],
    model,
  };
}

/**
 * Ask the LLM to produce a corrected version of a file given its error output.
 * Returns the new file content, or null if the LLM cannot help.
 */
export async function suggestFix(
  filePath:   string,
  stderr:     string,
): Promise<string | null> {
  if (!existsSync(filePath)) return null;
  const source = await readFile(filePath, "utf-8");
  const model  = await getPreferredModel();
  const ext    = path.extname(filePath).toLowerCase();

  const prompt = [
    `You are an expert programmer fixing a broken ${ext} file.`,
    "Output ONLY the complete corrected file — no explanations, no markdown fences, no commentary.",
    "Preserve the original logic; only fix the error.",
    "",
    `=== FILE: ${path.basename(filePath)} ===`,
    source.slice(0, 4000),
    "",
    "=== ERROR OUTPUT ===",
    stderr.slice(0, 1000),
    "",
    "=== CORRECTED FILE ===",
  ].join("\n");

  thoughtLog.publish({
    category: "system",
    title:    "Self-Heal — LLM Fix Request",
    message:  `Asking ${model} to fix ${path.basename(filePath)}`,
    metadata: { filePath, model },
  });

  try {
    const fixed = await ollamaGenerate(prompt, model, 90_000);
    // Strip any accidental markdown fence
    return fixed.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();
  } catch (err) {
    logger.warn({ err, filePath }, "LLM fix request failed");
    return null;
  }
}

/**
 * Run a file with a self-healing loop:
 *   1. Execute the file.
 *   2. If it fails, ask the LLM for a fix.
 *   3. Apply the fix (with a snapshot backup) and re-run.
 *   4. Repeat up to MAX_REPAIR_ATTEMPTS times.
 */
export async function selfHealingRun(
  filePath:   string,
  opts:       RunOptions = {},
  maxAttempts = MAX_REPAIR_ATTEMPTS,
): Promise<SelfHealingResult> {
  const repairs: RepairAttempt[] = [];

  thoughtLog.publish({
    category: "system",
    title:    "Self-Heal — Starting",
    message:  `Running ${path.basename(filePath)} with self-healing (max ${maxAttempts} repairs)`,
    metadata: { filePath },
  });

  // Initial run
  let lastRun = await runFile(filePath, opts);

  if (lastRun.success) {
    thoughtLog.publish({
      category: "system",
      title:    "Self-Heal — Passed on First Run",
      message:  `${path.basename(filePath)} exited 0 in ${lastRun.durationMs}ms`,
    });
    return { success: true, attempts: 1, finalRun: lastRun, repairs, filePath };
  }

  // Repair loop
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const errorSummary = lastRun.stderr.slice(0, 500) || lastRun.stdout.slice(0, 500);

    thoughtLog.publish({
      level:    "warning",
      category: "system",
      title:    `Self-Heal — Repair Attempt ${attempt}/${maxAttempts}`,
      message:  errorSummary.slice(0, 200),
      metadata: { attempt, filePath, exitCode: lastRun.exitCode },
    });

    const proposedFix = await suggestFix(filePath, lastRun.stderr || lastRun.stdout);

    if (!proposedFix) {
      repairs.push({ attempt, errorSummary, proposedFix: undefined, appliedFix: false, runAfterFix: lastRun });
      logger.warn({ attempt, filePath }, "Self-heal: LLM returned no fix");
      break;
    }

    // Backup + apply fix
    await writeManagedFile(filePath, proposedFix);

    thoughtLog.publish({
      category: "system",
      title:    `Self-Heal — Fix Applied (attempt ${attempt})`,
      message:  `Wrote ${proposedFix.split("\n").length} lines to ${path.basename(filePath)}`,
      metadata: { filePath, attempt },
    });

    // Re-run after fix
    const runAfterFix = await runFile(filePath, opts);
    repairs.push({ attempt, errorSummary, proposedFix, appliedFix: true, runAfterFix });

    if (runAfterFix.success) {
      thoughtLog.publish({
        category: "system",
        title:    "Self-Heal — Fixed!",
        message:  `${path.basename(filePath)} succeeded after ${attempt} repair(s)`,
        metadata: { filePath, attempt, durationMs: runAfterFix.durationMs },
      });
      const finalContent = await readFile(filePath, "utf-8").catch(() => undefined);
      return {
        success:      true,
        attempts:     attempt + 1,
        finalRun:     runAfterFix,
        repairs,
        filePath,
        finalContent,
      };
    }

    lastRun = runAfterFix;
  }

  thoughtLog.publish({
    level:    "error",
    category: "system",
    title:    "Self-Heal — Failed",
    message:  `${path.basename(filePath)} could not be fixed after ${repairs.length} attempt(s)`,
    metadata: { filePath, lastStderr: lastRun.stderr.slice(0, 200) },
  });

  return {
    success:  false,
    attempts: repairs.length + 1,
    finalRun: lastRun,
    repairs,
    filePath,
  };
}

// ── Batch runner ──────────────────────────────────────────────────────────────

export interface BatchRunOptions extends RunOptions {
  /** If true, stop on first failure. Default: false. */
  stopOnFailure?: boolean;
  /** If true, apply self-healing to each failed file. Default: false. */
  selfHeal?: boolean;
}

export interface BatchRunResult {
  results:      (RunResult | SelfHealingResult)[];
  successCount: number;
  failureCount: number;
  totalMs:      number;
}

/**
 * Run multiple files in sequence and collect their results.
 */
export async function runBatch(
  filePaths:  string[],
  opts:       BatchRunOptions = {},
): Promise<BatchRunResult> {
  const { stopOnFailure = false, selfHeal = false, ...runOpts } = opts;
  const results: (RunResult | SelfHealingResult)[] = [];
  const start = Date.now();
  let failures = 0;

  for (const fp of filePaths) {
    const result = selfHeal
      ? await selfHealingRun(fp, runOpts)
      : await runFile(fp, runOpts);

    results.push(result);

    if (!result.success) {
      failures++;
      if (stopOnFailure) break;
    }
  }

  return {
    results,
    successCount: results.length - failures,
    failureCount: failures,
    totalMs:      Date.now() - start,
  };
}
