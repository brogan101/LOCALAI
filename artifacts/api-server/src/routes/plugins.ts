import { Router } from "express";
import { readdir, readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// plugins/ directory lives at repo root (four levels up from src/routes/)
const PLUGINS_DIR = path.resolve(__dirname, "../../../../../plugins");

export interface PluginManifest {
  name:        string;
  version:     string;
  description: string;
  author:      string;
  routes:      Array<{ method: string; path: string; handler: string }>;
  pages:       Array<{ label: string; path: string; component: string }>;
  permissions: {
    fileAccess: "none" | "read-only" | "read-write";
  };
  enabled:     boolean;
  manifestPath: string;
}

async function loadPlugins(): Promise<PluginManifest[]> {
  if (!existsSync(PLUGINS_DIR)) return [];
  let files: string[];
  try {
    const entries = await readdir(PLUGINS_DIR, { withFileTypes: true });
    files = entries
      .filter(e => e.isFile() && e.name.endsWith(".json"))
      .map(e => path.join(PLUGINS_DIR, e.name));
  } catch {
    return [];
  }
  const plugins: PluginManifest[] = [];
  for (const file of files) {
    try {
      const raw  = await readFile(file, "utf-8");
      const data = JSON.parse(raw) as Partial<PluginManifest>;
      plugins.push({
        name:         data.name        ?? path.basename(file, ".json"),
        version:      data.version     ?? "0.0.0",
        description:  data.description ?? "",
        author:       data.author      ?? "unknown",
        routes:       data.routes      ?? [],
        pages:        data.pages       ?? [],
        permissions:  data.permissions ?? { fileAccess: "read-only" },
        enabled:      data.enabled     !== false,
        manifestPath: file,
      });
    } catch { /* skip malformed manifests */ }
  }
  return plugins;
}

router.get("/plugins", async (_req, res) => {
  const plugins = await loadPlugins();
  return res.json({ success: true, plugins, pluginsDir: PLUGINS_DIR });
});

router.get("/plugins/:name", async (req, res) => {
  const plugins = await loadPlugins();
  const plugin  = plugins.find(p => p.name === req.params["name"]!);
  if (!plugin) return res.status(404).json({ success: false, message: "Plugin not found" });
  return res.json({ success: true, plugin });
});

router.get("/plugins/:name/manifest", async (req, res) => {
  const plugins = await loadPlugins();
  const plugin  = plugins.find(p => p.name === req.params["name"]!);
  if (!plugin) return res.status(404).json({ success: false, message: "Plugin not found" });
  try {
    const raw = await readFile(plugin.manifestPath, "utf-8");
    return res.type("json").send(raw);
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
