#!/usr/bin/env node
const args = new Set(process.argv.slice(2));

if (!args.has("--dry-run")) {
  console.error("Restore is blocked by default. Re-run with --dry-run to validate a manifest proposal.");
  process.exitCode = 2;
} else {
  console.log(JSON.stringify({
    success: true,
    status: "dry_run",
    liveDataModified: false,
    approvalRequired: true,
    rollbackPointRequired: true,
    destructiveRestoreBlocked: true,
    verificationSteps: [
      "Validate backup manifest schema and hash.",
      "Create current-state backup manifest.",
      "Review expected changes.",
      "Approve restore in LOCALAI.",
      "Run health check after restore.",
    ],
  }, null, 2));
}
