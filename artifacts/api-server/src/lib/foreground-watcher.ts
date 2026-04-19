/**
 * FOREGROUND-APP ADAPTIVE PROFILES
 * ==================================
 * Polls the Windows foreground window every 3 seconds via PowerShell.
 * When the foreground process maps to a known preset, publishes a
 * "ForegroundChanged" thought and notifies registered listeners.
 *
 * Configurable: process→preset mapping lives in AppSettings (not hardcoded).
 * Default seed map is applied when no custom mapping is set.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { thoughtLog } from "./thought-log.js";
import { isWindows } from "./runtime.js";

const execAsync = promisify(exec);

export type ForegroundListener = (presetId: string, processName: string) => void;

const DEFAULT_PROCESS_MAP: Record<string, string> = {
  "Code.exe":        "coding",
  "code.exe":        "coding",
  "Fusion360.exe":   "cad",
  "cura.exe":        "3d-print-slicer",
  "UltiMaker-Cura.exe": "3d-print-slicer",
  "lightburn.exe":   "laser-engrave",
  "LightBurn.exe":   "laser-engrave",
};

let _running = false;
let _timer: ReturnType<typeof setTimeout> | null = null;
let _lastPresetId: string | null = null;
let _lastProcess: string | null = null;
let _customMap: Record<string, string> | null = null;
const _listeners: ForegroundListener[] = [];

async function queryForegroundProcess(): Promise<string | null> {
  if (!isWindows) return null;
  try {
    const ps = `(Get-Process -Id (Get-CimInstance Win32_Process | Where-Object { (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).MainWindowHandle -eq (Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();' -Name Win32 -Namespace Win32Functions -PassThru)::GetForegroundWindow() } | Select-Object -First 1 -ExpandProperty ProcessId) -ErrorAction SilentlyContinue).Name`;
    // Simpler PowerShell that reliably works:
    const simplePsScript = `
$hwnd = Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out uint processId);' -Name 'User32' -Namespace 'Win32' -PassThru 2>$null
if ($hwnd) {
  $pid = 0
  [Win32.User32]::GetWindowThreadProcessId([Win32.User32]::GetForegroundWindow(), [ref]$pid) | Out-Null
  (Get-Process -Id $pid -ErrorAction SilentlyContinue).Name
}
`.trim();
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -Command "${simplePsScript.replace(/"/g, '\\"').replace(/\n/g, " ")}"`,
      { timeout: 3000 },
    );
    const name = stdout.trim();
    return name || null;
  } catch {
    return null;
  }
}

function effectiveMap(): Record<string, string> {
  return _customMap ?? DEFAULT_PROCESS_MAP;
}

function poll(): void {
  void queryForegroundProcess().then((procName) => {
    if (!procName) return;

    const map = effectiveMap();
    // Normalize: try exact match first, then try with .exe appended
    const presetId =
      map[procName] ??
      map[procName + ".exe"] ??
      map[procName.replace(/\.exe$/i, "") + ".exe"] ??
      null;

    if (!presetId) return;

    // Only fire if something changed
    if (presetId === _lastPresetId && procName === _lastProcess) return;

    _lastPresetId = presetId;
    _lastProcess  = procName;

    thoughtLog.publish({
      level:    "info",
      category: "system",
      title:    "Foreground Profile Changed",
      message:  `${procName} → preset "${presetId}"`,
      metadata: { processName: procName, presetId },
    });

    for (const fn of _listeners) {
      try { fn(presetId, procName); } catch { /* ignore */ }
    }
  }).finally(() => {
    if (_running) {
      _timer = setTimeout(poll, 3000);
    }
  });
}

export const foregroundWatcher = {
  start(): void {
    if (_running) return;
    _running = true;
    poll();
  },

  stop(): void {
    _running = false;
    if (_timer) { clearTimeout(_timer); _timer = null; }
  },

  setProcessMap(map: Record<string, string>): void {
    _customMap = map;
  },

  resetProcessMap(): void {
    _customMap = null;
  },

  onForegroundChange(fn: ForegroundListener): () => void {
    _listeners.push(fn);
    return () => {
      const idx = _listeners.indexOf(fn);
      if (idx !== -1) _listeners.splice(idx, 1);
    };
  },

  currentPresetId(): string | null {
    return _lastPresetId;
  },

  defaultMap(): Record<string, string> {
    return { ...DEFAULT_PROCESS_MAP };
  },
};
