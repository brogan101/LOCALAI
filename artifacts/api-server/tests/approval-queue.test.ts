import assert from "node:assert/strict";
import express from "express";
import { existsSync } from "fs";
import { rm } from "fs/promises";
import os from "os";
import path from "path";
import { initDatabase } from "../src/db/migrate.js";
import { sqlite } from "../src/db/database.js";
import systemRoute from "../src/routes/system.js";
import {
  approveRequest,
  createApprovalRequest,
  denyRequest,
  verifyApprovedRequest,
} from "../src/lib/approval-queue.js";
import { getDurableJob, listAuditEvents, seedFoundationDefaults } from "../src/lib/platform-foundation.js";

process.env.LOCALAI_TEST_AGENT_PERMISSIONS = JSON.stringify({
  allowAgentExec: true,
  allowAgentEdits: true,
  allowAgentSelfHeal: true,
  allowAgentRefactor: true,
});

await initDatabase();
seedFoundationDefaults();

let assertions = 0;

const table = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'approval_requests'").get() as { name?: string } | undefined;
assert.equal(table?.name, "approval_requests", "approval_requests table should exist");
assertions += 1;

assert.throws(() => createApprovalRequest({
  type: "file_modification",
  title: "Bad edit",
  summary: "Missing diff and rollback",
  riskTier: "tier3_file_modification",
  requestedAction: "test.edit",
  payload: { filePath: "x" },
}), /diff metadata/, "Tier 3 approvals require diff metadata");
assertions += 1;

const tier3 = createApprovalRequest({
  type: "file_modification",
  title: "Edit file",
  summary: "Apply a diff with rollback metadata",
  riskTier: "tier3_file_modification",
  requestedAction: "test.edit",
  payload: { filePath: "x", newContent: "next", diff: "--- old\n+++ new", rollback: { backupBeforeApply: true } },
});
assert.equal(tier3.status, "waiting_for_approval");
assert.equal(getDurableJob(tier3.jobId!)?.state, "waiting_for_approval");
assertions += 2;

const tier4 = createApprovalRequest({
  type: "external_communication",
  title: "Send external message",
  summary: "External communication must wait",
  riskTier: "tier4_external_communication",
  requestedAction: "test.external.send",
  payload: { recipient: "example", body: "hello" },
});
const unapproved = verifyApprovedRequest(undefined, tier4.payload, "external_communication");
assert.equal(unapproved.allowed, false, "Tier 4 cannot execute without approval");
assertions += 1;
approveRequest(tier4.id, "test approval");
const approved = verifyApprovedRequest(tier4.id, tier4.payload, "external_communication");
assert.equal(approved.allowed, true, "Approved Tier 4 request should verify");
assertions += 1;

const prohibited = createApprovalRequest({
  type: "dangerous_command",
  title: "Manual only command",
  summary: "Prohibited Tier 5",
  riskTier: "tier5_manual_only_prohibited",
  requestedAction: "test.dangerous",
  payload: { command: "Remove-Item -Recurse C:\\" },
});
assert.equal(prohibited.status, "denied", "Tier 5 requests should be denied");
assert.equal(getDurableJob(prohibited.jobId!)?.state, "cancelled");
assertions += 2;

const physical = createApprovalRequest({
  type: "physical_action",
  title: "Manual machine start",
  summary: "P5 physical action",
  riskTier: "tier5_manual_only_prohibited",
  physicalTier: "p5_manual_only_at_machine",
  requestedAction: "test.machine.start",
  payload: { machine: "cnc" },
});
assert.equal(physical.status, "denied", "Physical P5 cannot execute through software");
assertions += 1;

const denied = denyRequest(tier3.id, "test denial");
assert.equal(denied?.status, "denied");
assert.equal(getDurableJob(tier3.jobId!)?.state, "cancelled");
assertions += 2;

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
      get(name: string) {
        return (this.headers as Record<string, string>)[name.toLowerCase()];
      },
      header(name: string) {
        return this.get(name);
      },
      query: {},
      params: {},
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
      if (error) reject(error);
      else resolve({ status: 404, payload: undefined });
    });
  });
}

const markerPath = path.join(os.tmpdir(), `localai-approval-denied-${Date.now()}.txt`);
await rm(markerPath, { force: true }).catch(() => undefined);
const command = `node -e "require('fs').writeFileSync(${JSON.stringify(markerPath)}, 'executed')"`;
const execRes = await inject("POST", "/system/exec/run", { command, timeoutMs: 10_000 });
assert.equal(execRes.status, 202, "Unapproved command should be queued for approval");
assert.equal(execRes.payload.approvalRequired, true);
assert.equal(existsSync(markerPath), false, "Unapproved command must not execute");
assertions += 3;

const auditEvents = listAuditEvents(100);
assert.ok(auditEvents.some((event) => event.eventType === "approval" && event.action === "denied"), "Approval denial should be audited");
assertions += 1;

console.log(`approval-queue.test.ts passed (${assertions} assertions)`);
