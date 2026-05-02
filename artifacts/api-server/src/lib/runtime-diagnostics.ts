import { execFileSync } from "child_process";
import { existsSync } from "fs";
import os from "os";
import path from "path";

export type RuntimeDiagnosticStatus = "ok" | "degraded" | "blocked";
export type RuntimeDiagnosticSeverity = "info" | "warning" | "error";

export interface RuntimeDiagnostic {
  id: string;
  component: string;
  status: RuntimeDiagnosticStatus;
  severity: RuntimeDiagnosticSeverity;
  message: string;
  details?: Record<string, unknown>;
  updatedAt: string;
}

const diagnostics = new Map<string, RuntimeDiagnostic>();

export function recordRuntimeDiagnostic(
  diagnostic: Omit<RuntimeDiagnostic, "updatedAt"> & { updatedAt?: string },
): RuntimeDiagnostic {
  const item: RuntimeDiagnostic = {
    ...diagnostic,
    updatedAt: diagnostic.updatedAt ?? new Date().toISOString(),
  };
  diagnostics.set(item.id, item);
  return item;
}

export function clearRuntimeDiagnostic(id: string): void {
  diagnostics.delete(id);
}

export function listRuntimeDiagnostics(): RuntimeDiagnostic[] {
  return [...diagnostics.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function runtimeHealthSummary(): { degraded: boolean; blocked: boolean; warningCount: number; errorCount: number } {
  const items = listRuntimeDiagnostics();
  return {
    degraded: items.some((item) => item.status === "degraded" || item.status === "blocked"),
    blocked: items.some((item) => item.status === "blocked"),
    warningCount: items.filter((item) => item.severity === "warning").length,
    errorCount: items.filter((item) => item.severity === "error").length,
  };
}

const BROWSER_TOOLING_MIN_NODE = [22, 22, 0] as const;
export const BROWSER_TOOLING_MIN_NODE_VERSION = "22.22.0";

function parseNodeVersion(version: string): [number, number, number] | null {
  const match = /v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }
  return 0;
}

function browserNodeCandidates(): string[] {
  return [
    process.env.LOCALAI_BROWSER_NODE_PATH?.trim(),
    path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "bin", "node.exe"),
  ].filter((candidate): candidate is string => Boolean(candidate));
}

function getConfiguredBrowserNode(): { path: string; version?: string; error?: string } | null {
  let lastMissing: string | null = null;
  for (const configuredPath of browserNodeCandidates()) {
    if (!existsSync(configuredPath)) {
      lastMissing = configuredPath;
      continue;
    }
    try {
      const version = execFileSync(configuredPath, ["--version"], {
        encoding: "utf8",
        timeout: 2500,
        windowsHide: true,
      }).trim();
      return { path: configuredPath, version };
    } catch (error) {
      return { path: configuredPath, error: error instanceof Error ? error.message : String(error) };
    }
  }
  if (lastMissing) {
    return { path: lastMissing, error: "No configured or bundled browser Node runtime exists." };
  }
  return null;
}

export function getBrowserToolingDiagnostic(nodeVersion = process.version): RuntimeDiagnostic {
  const parsed = parseNodeVersion(nodeVersion);
  if (!parsed) {
    return {
      id: "tooling.browser-node",
      component: "browser-tooling",
      status: "blocked",
      severity: "error",
      message: `Browser automation cannot confirm Node version "${nodeVersion}".`,
      details: { nodeVersion, requiredNodeVersion: `>=${BROWSER_TOOLING_MIN_NODE_VERSION}` },
      updatedAt: new Date().toISOString(),
    };
  }

  if (compareSemver(parsed, BROWSER_TOOLING_MIN_NODE) < 0) {
    if (arguments.length === 0) {
      const configuredBrowserNode = getConfiguredBrowserNode();
      const configuredVersion = configuredBrowserNode?.version;
      const configuredParsed = configuredVersion
        ? parseNodeVersion(configuredVersion)
        : null;
      if (configuredBrowserNode && configuredParsed && compareSemver(configuredParsed, BROWSER_TOOLING_MIN_NODE) >= 0) {
        return {
          id: "tooling.browser-node",
          component: "browser-tooling",
          status: "ok",
          severity: "info",
          message: `Browser automation Node fallback is compatible (${configuredVersion}).`,
          details: {
            nodeVersion,
            browserNodeVersion: configuredVersion,
            browserNodePath: configuredBrowserNode.path,
            requiredNodeVersion: `>=${BROWSER_TOOLING_MIN_NODE_VERSION}`,
          },
          updatedAt: new Date().toISOString(),
        };
      }
      if (configuredBrowserNode?.error) {
        return {
          id: "tooling.browser-node",
          component: "browser-tooling",
          status: "blocked",
          severity: "warning",
          message: `Browser automation is degraded: Node ${nodeVersion} is below required >=${BROWSER_TOOLING_MIN_NODE_VERSION}, and the configured browser Node fallback is unavailable.`,
          details: {
            nodeVersion,
            browserNodePath: configuredBrowserNode.path,
            browserNodeError: configuredBrowserNode.error,
            requiredNodeVersion: `>=${BROWSER_TOOLING_MIN_NODE_VERSION}`,
          },
          updatedAt: new Date().toISOString(),
        };
      }
    }
    return {
      id: "tooling.browser-node",
      component: "browser-tooling",
      status: "blocked",
      severity: "warning",
      message: `Browser automation is degraded: Node ${nodeVersion} is below required >=${BROWSER_TOOLING_MIN_NODE_VERSION}.`,
      details: { nodeVersion, requiredNodeVersion: `>=${BROWSER_TOOLING_MIN_NODE_VERSION}` },
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    id: "tooling.browser-node",
    component: "browser-tooling",
    status: "ok",
    severity: "info",
    message: `Browser automation Node runtime is compatible (${nodeVersion}).`,
    details: { nodeVersion, requiredNodeVersion: `>=${BROWSER_TOOLING_MIN_NODE_VERSION}` },
    updatedAt: new Date().toISOString(),
  };
}
