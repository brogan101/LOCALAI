#!/usr/bin/env node
import { existsSync } from "node:fs";

const checks = [
  { id: "root-package", status: existsSync("package.json") ? "ok" : "missing" },
  { id: "api-package", status: existsSync("artifacts/api-server/package.json") ? "ok" : "missing" },
  { id: "ui-package", status: existsSync("artifacts/localai-control-center/package.json") ? "ok" : "missing" },
  { id: "jarvis-ledger", status: existsSync("docs/JARVIS_IMPLEMENTATION_LEDGER.md") ? "ok" : "missing" },
];

console.log(JSON.stringify({
  success: checks.every(check => check.status === "ok"),
  localOnly: true,
  networkUsed: false,
  systemSettingsModified: false,
  checks,
}, null, 2));
