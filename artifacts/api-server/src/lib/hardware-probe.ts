/**
 * HARDWARE PROBE — Runtime system information
 * ============================================
 * Probes GPU, CPU, RAM, disk, OS and Ollama reachability at runtime.
 * Results are cached for 30 seconds.
 *
 * GPU detection order:
 *   1. nvidia-smi (NVML)
 *   2. PowerShell Win32_VideoController (Windows fallback)
 *   3. pnputil display-device identity fallback
 *   4. Safe-mode: 20% of os.totalmem()
 */

import { exec as cpExec } from "child_process";
import { promisify } from "util";
import { statfs } from "fs";
import { promisify as promisifyFs } from "util";
import os from "os";
import { fileURLToPath } from "url";
import path from "path";
import { getOllamaUrl } from "./ollama-url.js";

const execAsync = promisify(cpExec);
const statfsAsync = promisifyFs(statfs);

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GpuSnapshot {
  name:        string;
  driver?:     string;
  totalVramBytes: number;
  freeVramBytes:  number;
  probedVia:   "nvidia-smi" | "wmic" | "pnputil" | "safe-mode";
  status?:     "ok" | "degraded" | "safe-mode";
  warnings?:   string[];
  telemetryUnavailable?: boolean;
}

export interface CpuSnapshot {
  model:        string;
  physicalCores: number;
  logicalCores:  number;
  speedMhz:     number;
}

export interface RamSnapshot {
  totalBytes: number;
  freeBytes:  number;
}

export interface DiskSnapshot {
  installDriveFreeBytes:  number;
  installDriveTotalBytes: number;
}

export interface OsSnapshot {
  platform: string;
  release:  string;
  build?:   string;
  arch:     string;
}

export interface OllamaSnapshot {
  reachable: boolean;
  url:       string;
}

export interface HardwareSnapshot {
  gpu:       GpuSnapshot;
  cpu:       CpuSnapshot;
  ram:       RamSnapshot;
  disk:      DiskSnapshot;
  os:        OsSnapshot;
  ollama:    OllamaSnapshot;
  probedAt:  string;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30_000;
let cache: { snapshot: HardwareSnapshot; at: number } | null = null;

// ── GPU probing ───────────────────────────────────────────────────────────────

async function probeGpuNvidiaSmi(): Promise<GpuSnapshot | null> {
  try {
    const { stdout } = await execAsync(
      "nvidia-smi --query-gpu=name,driver_version,memory.total,memory.free --format=csv,noheader,nounits",
      { timeout: 8000 },
    );
    const line = stdout.trim().split("\n")[0];
    if (!line) return null;
    const [name, driver, totalMib, freeMib] = line.split(",").map(s => s.trim());
    const total = Number(totalMib) * 1024 * 1024;
    const free  = Number(freeMib)  * 1024 * 1024;
    if (isNaN(total) || total <= 0) return null;
    return {
      name:           name ?? "NVIDIA GPU",
      driver:         driver,
      totalVramBytes: total,
      freeVramBytes:  free,
      probedVia:      "nvidia-smi",
    };
  } catch {
    return null;
  }
}

async function probeGpuWmic(): Promise<GpuSnapshot | null> {
  if (os.platform() !== "win32") return null;
  try {
    const ps = `Get-WmiObject Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json`;
    const { stdout } = await execAsync(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`,
      { timeout: 10000 },
    );
    const raw = JSON.parse(stdout.trim());
    const entries: Array<{ Name?: string; AdapterRAM?: number }> = Array.isArray(raw) ? raw : [raw];
    // prefer the one with the most RAM (likely discrete GPU)
    const best = entries
      .filter(e => e.AdapterRAM && e.AdapterRAM > 0)
      .sort((a, b) => (b.AdapterRAM ?? 0) - (a.AdapterRAM ?? 0))[0];
    if (!best) return null;
    const total = best.AdapterRAM ?? 0;
    return {
      name:           best.Name ?? "GPU",
      totalVramBytes: total,
      freeVramBytes:  Math.round(total * 0.5), // wmic can't report free VRAM
      probedVia:      "wmic",
    };
  } catch {
    return null;
  }
}

export function parsePnputilDisplayDevices(output: string): string[] {
  const names: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(?:Device Description|Device Name)\s*:\s*(.+?)\s*$/.exec(line);
    if (match?.[1]) names.push(match[1]);
  }
  return names;
}

async function probeGpuPnputil(): Promise<GpuSnapshot | null> {
  if (os.platform() !== "win32") return null;
  try {
    const { stdout } = await execAsync("pnputil /enum-devices /class Display", { timeout: 10000 });
    const devices = parsePnputilDisplayDevices(stdout);
    const nvidia = devices.find((device) => /nvidia/i.test(device));
    const best = nvidia ?? devices.find((device) => !/parsec|virtual|remote/i.test(device)) ?? devices[0];
    if (!best) return null;
    const total = Math.round(os.totalmem() * 0.20);
    return {
      name: best,
      totalVramBytes: total,
      freeVramBytes: total,
      probedVia: "pnputil",
      status: "degraded",
      telemetryUnavailable: true,
      warnings: [
        "NVML/VRAM telemetry is unavailable; GPU identity came from pnputil and VRAM is a conservative safe-mode estimate.",
      ],
    };
  } catch {
    return null;
  }
}

async function probeGpu(): Promise<GpuSnapshot> {
  const nvidiaSmi = await probeGpuNvidiaSmi();
  if (nvidiaSmi) return nvidiaSmi;

  const wmic = await probeGpuWmic();
  if (wmic) return wmic;

  const pnputil = await probeGpuPnputil();
  if (pnputil) return pnputil;

  // Safe-mode: 20% of system RAM as a rough VRAM floor
  const total = Math.round(os.totalmem() * 0.20);
  return {
    name:           "GPU (safe-mode fallback)",
    totalVramBytes: total,
    freeVramBytes:  total,
    probedVia:      "safe-mode",
    status:         "safe-mode",
    telemetryUnavailable: true,
    warnings:       ["GPU telemetry unavailable; using safe-mode VRAM estimate."],
  };
}

// ── CPU probing ───────────────────────────────────────────────────────────────

async function probeCpu(): Promise<CpuSnapshot> {
  const cpus    = os.cpus();
  const logical = cpus.length;
  const speedMhz = cpus[0]?.speed ?? 0;
  let model     = cpus[0]?.model?.trim() ?? "Unknown CPU";
  let physical  = Math.ceil(logical / 2); // safe default

  if (os.platform() === "win32") {
    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-WmiObject Win32_Processor | Select-Object Name, NumberOfCores | ConvertTo-Json"`,
        { timeout: 8000 },
      );
      const raw = JSON.parse(stdout.trim());
      const proc = Array.isArray(raw) ? raw[0] : raw;
      if (proc?.Name) model   = (proc.Name as string).trim();
      if (proc?.NumberOfCores) physical = Number(proc.NumberOfCores);
    } catch { /* use defaults */ }
  }

  return { model, physicalCores: physical, logicalCores: logical, speedMhz };
}

// ── Disk probing ──────────────────────────────────────────────────────────────

async function probeDisk(): Promise<DiskSnapshot> {
  try {
    // Use the directory this file lives in as the install drive reference
    const repoDir = path.resolve(__dirname, "../../../..");
    const fs = await statfsAsync(repoDir);
    return {
      installDriveFreeBytes:  Number(fs.bfree)  * Number(fs.bsize),
      installDriveTotalBytes: Number(fs.blocks) * Number(fs.bsize),
    };
  } catch {
    return { installDriveFreeBytes: 0, installDriveTotalBytes: 0 };
  }
}

// ── OS probing ────────────────────────────────────────────────────────────────

async function probeOs(): Promise<OsSnapshot> {
  const snap: OsSnapshot = {
    platform: os.platform(),
    release:  os.release(),
    arch:     os.arch(),
  };

  if (os.platform() === "win32") {
    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion').DisplayVersion"`,
        { timeout: 5000 },
      );
      snap.build = stdout.trim();
    } catch { /* no build string */ }
  }

  return snap;
}

// ── Ollama probing ────────────────────────────────────────────────────────────

async function probeOllama(): Promise<OllamaSnapshot> {
  const url = await getOllamaUrl();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    return { reachable: res.ok, url };
  } catch {
    return { reachable: false, url };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function probeHardware(): Promise<HardwareSnapshot> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.snapshot;

  const [gpu, cpu, disk, osInfo, ollama] = await Promise.all([
    probeGpu(),
    probeCpu(),
    probeDisk(),
    probeOs(),
    probeOllama(),
  ]);

  const ram: RamSnapshot = {
    totalBytes: os.totalmem(),
    freeBytes:  os.freemem(),
  };

  const snapshot: HardwareSnapshot = {
    gpu,
    cpu,
    ram,
    disk,
    os: osInfo,
    ollama,
    probedAt: new Date().toISOString(),
  };

  cache = { snapshot, at: now };
  return snapshot;
}
