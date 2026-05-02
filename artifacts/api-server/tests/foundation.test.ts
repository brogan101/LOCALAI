import assert from "node:assert/strict";
import express from "express";
import os from "os";
import path from "path";
import { initDatabase } from "../src/db/migrate.js";
import { sqlite } from "../src/db/database.js";
import foundationRoute from "../src/routes/foundation.js";
import {
  appendJobEvent,
  assertPathAllowed,
  createDurableJob,
  evaluatePermission,
  getDurableJob,
  leaseNextJob,
  listAuditEvents,
  listJobEvents,
  recordAuditEvent,
  seedFoundationDefaults,
} from "../src/lib/platform-foundation.js";

await initDatabase();
seedFoundationDefaults();

let assertions = 0;

const requiredTables = [
  "workspace_roots",
  "local_profiles",
  "integration_state",
  "plugin_state",
  "permission_policies",
  "approval_requests",
  "durable_jobs",
  "job_events",
  "audit_events",
  "artifact_records",
];

for (const table of requiredTables) {
  const row = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { name?: string } | undefined;
  assert.equal(row?.name, table, `Expected migration to create ${table}`);
  assertions += 1;
}

const allowRead = evaluatePermission("file.read", "foundation-test");
assert.equal(allowRead.allowed, true, "Default file read permission should preserve local compatibility");
assertions += 1;

const allowedPath = assertPathAllowed(os.homedir(), "file.read");
assert.equal(allowedPath.allowed, true, "Home directory should be seeded as an allowed workspace root");
assertions += 1;

const blockedCandidate = process.platform === "win32"
  ? path.join(path.parse(os.homedir()).root, "Windows", "System32", "LOCALAI_BLOCK_TEST")
  : "/etc/LOCALAI_BLOCK_TEST";
const blockedPath = assertPathAllowed(blockedCandidate, "file.read");
assert.equal(blockedPath.allowed, false, "Path outside seeded workspace roots should be blocked");
assertions += 1;

const job = createDurableJob({
  kind: "foundation-test",
  priority: 999_999,
  payload: { purpose: "persistence" },
  sessionId: "test-session",
  workspaceId: "test-workspace",
});
assert.equal(job.kind, "foundation-test");
assert.equal(job.state, "queued");
assert.equal(job.payload.purpose, "persistence");
assertions += 3;

const reloaded = getDurableJob(job.id);
assert.equal(reloaded?.id, job.id, "Durable job should reload from SQLite");
assert.equal(reloaded?.payload.purpose, "persistence", "Durable job payload should persist");
assertions += 2;

appendJobEvent(job.id, "test-event", "Foundation test event", { ok: true });
const events = listJobEvents(job.id);
assert.ok(events.some((event) => event.eventType === "test-event"), "Job events should be append-only and queryable");
assertions += 1;

const leased = leaseNextJob("foundation-test-worker", 30_000);
assert.equal(leased?.id, job.id, "Queued job should be leaseable after restart simulation");
assert.equal(leased?.state, "running");
assert.equal(leased?.leaseOwner, "foundation-test-worker");
assertions += 3;

const auditId = recordAuditEvent({
  eventType: "tool_call",
  action: "foundation-test",
  target: job.id,
  metadata: { ok: true },
});
const auditEvents = listAuditEvents(25);
assert.ok(auditEvents.some((event) => event.id === auditId), "Audit event should be written and queryable");
assertions += 1;

const app = express();
app.use(express.json());
app.use(foundationRoute);

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
      if (error) {
        reject(error);
        return;
      }
      resolve({ status: 404, payload: undefined });
    });
  });
}

const summaryRes = await inject("GET", "/foundation/summary");
assert.equal(summaryRes.status, 200);
assert.ok(summaryRes.payload.summary.durableJobs >= 1);
assertions += 2;

const routeJobRes = await inject("POST", "/foundation/jobs", { kind: "route-test", payload: { route: true } });
assert.equal(routeJobRes.status, 201);
assert.equal(routeJobRes.payload.job.kind, "route-test");
assertions += 2;

const routeAllowedPath = await inject("POST", "/foundation/path/check", { path: os.homedir(), scope: "file.read" });
assert.equal(routeAllowedPath.status, 200);
assert.equal(routeAllowedPath.payload.success, true);
assertions += 2;

const routeBlockedPath = await inject("POST", "/foundation/path/check", { path: blockedCandidate, scope: "file.read" });
assert.equal(routeBlockedPath.status, 403);
assert.equal(routeBlockedPath.payload.success, false);
assertions += 2;

const routeAuditRes = await inject("POST", "/foundation/audit-events", {
  eventType: "plugin_action",
  action: "route-test",
  target: "foundation",
});
assert.equal(routeAuditRes.status, 201);
assert.ok(routeAuditRes.payload.id);
assertions += 2;

console.log(`foundation.test.ts passed (${assertions} assertions)`);
