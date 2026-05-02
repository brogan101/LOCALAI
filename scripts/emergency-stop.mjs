#!/usr/bin/env node
const dryRun = process.argv.includes("--dry-run");

console.log(JSON.stringify({
  success: true,
  status: dryRun ? "dry_run" : "proposal",
  executed: false,
  systemProcessesKilled: false,
  physicalActionsBlockedByPolicy: true,
  approvalRequiredForRealStop: true,
  message: "Emergency Stop script is a LOCALAI proposal helper. Use the Operations Runtime UI/API for the approved runtime-mode transition.",
}, null, 2));
