import assert from "node:assert/strict";
import express from "express";
import systemRoute from "../src/routes/system.js";
import { denyRequest } from "../src/lib/approval-queue.js";
import {
  createBackupManifest,
  createRestoreDryRun,
  getInstallPlan,
  getRecoveryStatus,
  requestRestoreApproval,
  validateBackupManifest,
} from "../src/lib/packaging-recovery.js";
import { listAuditEvents } from "../src/lib/platform-foundation.js";

process.env.LOCALAI_TEST_AGENT_PERMISSIONS = JSON.stringify({
  allowAgentExec: true,
  allowAgentEdits: true,
  allowAgentSelfHeal: false,
  allowAgentRefactor: false,
});

const app = express();
app.use(express.json());
app.use(systemRoute);

function inject(method: string, routePath: string, body?: unknown): Promise<{ status: number; payload: any }> {
  return new Promise((resolve, reject) => {
    const request = {
      method,
      url: routePath,
      originalUrl: routePath,
      baseUrl: "",
      path: routePath,
      headers: { "content-type": "application/json" },
      body,
      query: {},
      params: {},
      get(name: string) {
        return (this.headers as Record<string, string>)[name.toLowerCase()];
      },
      header(name: string) {
        return this.get(name);
      },
    };
    let statusCode = 200;
    const response = {
      status(code: number) {
        statusCode = code;
        return response;
      },
      json(payload: any) {
        resolve({ status: statusCode, payload });
        return response;
      },
      send(payload: any) {
        resolve({ status: statusCode, payload });
        return response;
      },
      end(payload?: any) {
        resolve({ status: statusCode, payload });
        return response;
      },
      setHeader() {},
      getHeader() {
        return undefined;
      },
      removeHeader() {},
    };

    app.handle(request as any, response as any, (error: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ status: 404, payload: undefined });
    });
  });
}

let assertions = 0;

try {
  const installPlan = getInstallPlan();
  assert.equal(installPlan.status, "proposal");
  assert.equal(installPlan.modifiesSystemSettings, false);
  assert.equal(installPlan.autoStartsServices, false);
  assert.equal(installPlan.opensFirewallPorts, false);
  assert.equal(installPlan.modifiesPathGlobally, false);
  assertions += 5;

  const status = getRecoveryStatus();
  assert.equal(status.localFirst, true);
  assert.equal(status.noPaidApisRequired, true);
  assert.equal(status.realRestoreEnabled, false);
  assert.ok(status.providers.some(provider => provider.status === "not_configured"));
  assertions += 4;

  const dryRunManifest = await createBackupManifest({ dryRun: true });
  assert.equal(dryRunManifest.status, "dry_run");
  assert.equal(dryRunManifest.noRawSecrets, true);
  assert.equal(dryRunManifest.noModelBlobs, true);
  assert.equal(dryRunManifest.noSystemSettingsModified, true);
  assert.equal(dryRunManifest.destination.pathExposed, false);
  assert.ok(dryRunManifest.scope.some(scope => scope.id === "sqlite-db"));
  assert.ok(dryRunManifest.scope.some(scope => scope.id === "integration-configs" && scope.redaction === "secret_refs_only"));
  assertions += 7;

  const manifest = await createBackupManifest({ dryRun: false });
  assert.equal(manifest.status, "created");
  assert.equal(manifest.verification.status, "passed");
  assert.equal(manifest.retention.deleteAutomatically, false);
  assert.ok(manifest.rollbackNotes.length >= 2);
  assert.equal(manifest.destination.pathExposed, false);
  assertions += 5;

  const validation = validateBackupManifest(manifest.id);
  assert.equal(validation.status, "validation_passed");
  assert.equal(validation.liveDataModified, false);
  assert.equal(validation.requiresApproval, true);
  assert.equal(validation.rollbackPointRequired, true);
  assert.ok(validation.blockedActions.some(action => action.includes("delete user data")));
  assertions += 5;

  const dryRun = createRestoreDryRun(manifest.id);
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.executed, false);
  assert.equal(dryRun.dryRunResult.liveDataModified, false);
  assert.equal(dryRun.status, "validation_passed");
  assertions += 4;

  const blockedNoRollback = requestRestoreApproval({ manifestId: manifest.id });
  assert.equal(blockedNoRollback.status, "restore_blocked");
  assert.equal(blockedNoRollback.plan.executed, false);
  assert.match(blockedNoRollback.message, /current-state backup/i);
  assertions += 3;

  const approvalResult = requestRestoreApproval({ manifestId: manifest.id, currentBackupManifestId: dryRunManifest.id });
  assert.equal(approvalResult.status, "approval_required");
  assert.equal(approvalResult.approvalRequired, true);
  assert.equal(approvalResult.approval?.status, "waiting_for_approval");
  assert.equal(approvalResult.plan.executed, false);
  assertions += 4;

  denyRequest(approvalResult.approval!.id, "Phase 21 test denial");
  const denied = requestRestoreApproval({
    manifestId: manifest.id,
    currentBackupManifestId: dryRunManifest.id,
    approvalId: approvalResult.approval!.id,
  });
  assert.equal(denied.status, "restore_blocked");
  assert.equal(denied.plan.executed, false);
  assert.match(denied.message, /denied/i);
  assertions += 3;

  const routeStatus = await inject("GET", "/system/recovery/status");
  assert.equal(routeStatus.status, 200);
  assert.equal(routeStatus.payload.realRestoreEnabled, false);
  const routeDryRun = await inject("POST", "/system/recovery/backups", { dryRun: true });
  assert.equal(routeDryRun.status, 200);
  assert.equal(routeDryRun.payload.manifest.dryRun, true);
  const routeRestore = await inject("POST", "/system/recovery/restore/dry-run", { manifestId: routeDryRun.payload.manifest.id });
  assert.equal(routeRestore.status, 200);
  assert.equal(routeRestore.payload.plan.executed, false);
  assertions += 6;

  const auditText = JSON.stringify(listAuditEvents(50));
  assert.equal(auditText.includes("sk-phase21-secret"), false);
  assert.equal(auditText.includes("TOP_SECRET_BACKUP_CONTENT"), false);
  assert.equal(auditText.includes("C:\\\\Users\\\\"), false);
  assertions += 3;
} finally {
  delete process.env.LOCALAI_TEST_AGENT_PERMISSIONS;
}

console.log(`packaging-recovery.test.ts passed (${assertions} assertions)`);
