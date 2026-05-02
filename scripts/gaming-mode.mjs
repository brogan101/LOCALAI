#!/usr/bin/env node
const dryRun = process.argv.includes("--dry-run");

console.log(JSON.stringify({
  success: true,
  status: dryRun ? "dry_run" : "proposal",
  executed: false,
  autoStartedServices: false,
  servicesInstalled: false,
  firewallModified: false,
  pathModified: false,
  message: "Gaming Mode script is proposal-only. Use the Operations Runtime UI/API to apply mode changes with audit logging.",
}, null, 2));
