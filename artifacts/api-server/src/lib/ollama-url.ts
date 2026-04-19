/**
 * OLLAMA URL — Single source for the Ollama base URL
 * ====================================================
 * Priority order:
 *   1. OLLAMA_BASE_URL environment variable
 *   2. Distributed-node config (remote mode)
 *   3. Default: http://127.0.0.1:11434
 *
 * All backend modules must import getOllamaUrl() from here instead of
 * hardcoding "http://127.0.0.1:11434".
 */

import { getDistributedNodeConfig } from "./network-proxy.js";

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";

export async function getOllamaUrl(): Promise<string> {
  // 1. Explicit env override — highest priority
  const envUrl = process.env["OLLAMA_BASE_URL"]?.trim();
  if (envUrl) return envUrl;

  // 2. Distributed-node remote config
  try {
    const config = await getDistributedNodeConfig();
    if (config.mode === "remote" && config.remoteHost) {
      const protocol = config.remoteProtocol ?? "http";
      const port     = config.remotePort ?? 11434;
      return `${protocol}://${config.remoteHost}:${port}`;
    }
    // local mode: use localBaseUrl if it looks like an Ollama endpoint
    if (config.localBaseUrl && config.localBaseUrl !== DEFAULT_OLLAMA_URL) {
      return config.localBaseUrl;
    }
  } catch { /* no distributed config — fall through */ }

  return DEFAULT_OLLAMA_URL;
}
