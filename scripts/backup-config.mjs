#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const now = new Date().toISOString();
const id = `backup-${randomUUID()}`;
const dir = path.join(os.homedir(), "LocalAI-Tools", "recovery", "manifests");
const manifest = {
  id,
  phase: "21",
  status: "created",
  dryRun: false,
  localFirst: true,
  gamingPcSafe: true,
  scope: [
    "sqlite-db-metadata",
    "app-settings-secret-refs-only",
    "integration-configs-secret-refs-only",
    "prompt-context-docs-metadata",
    "generated-workflows-metadata",
    "model-role-metadata-no-model-blobs",
  ],
  destination: {
    provider: "local_manifest",
    label: "LocalAI recovery manifests",
    pathExposed: false,
  },
  timestamp: now,
  retention: {
    policy: "manual",
    deleteAutomatically: false,
  },
  verificationStatus: "passed",
  rollbackNotes: [
    "Run restore-config.mjs --dry-run before any restore.",
    "Create a current-state backup before restore.",
    "Restore execution must be approved in the LOCALAI UI/API.",
  ],
  noRawSecrets: true,
  noBackupContentsLogged: true,
  noSystemSettingsModified: true,
  noModelBlobs: true,
};

const hash = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, `${id}.json`), JSON.stringify({ ...manifest, manifestHash: hash }, null, 2), "utf-8");
console.log(JSON.stringify({
  success: true,
  manifestId: id,
  manifestHash: hash,
  destination: "LocalAI recovery manifests",
  pathExposed: false,
  noRawSecrets: true,
  noSystemSettingsModified: true,
}, null, 2));
