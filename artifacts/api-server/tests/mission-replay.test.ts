import assert from "node:assert/strict";
import { createHash, randomUUID } from "crypto";
import express from "express";
import { existsSync } from "fs";
import { rm } from "fs/promises";
import os from "os";
import path from "path";
import { initDatabase } from "../src/db/migrate.js";
import { sqlite } from "../src/db/database.js";
import { createApprovalRequest } from "../src/lib/approval-queue.js";
import {
  appendJobEvent,
  createDurableJob,
  getDurableJob,
  recordAuditEvent,
  seedFoundationDefaults,
  updateDurableJobState,
} from "../src/lib/platform-foundation.js";
import {
  listMissionReplayEvents,
  redactForMissionReplay,
  runLocalJarvisEvals,
} from "../src/lib/mission-replay.js";
import observabilityRoute from "../src/routes/observability.js";

await initDatabase();
seedFoundationDefaults();

let assertions = 0;

function payloadHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function inject(method: string, routePath: string, body?: unknown): Promise<{ status: number; payload: any }> {
  const app = express();
  app.use(express.json());
  app.use(observabilityRoute);

  return new Promise((resolve, reject) => {
    const query: Record<string, string> = {};
    const [pathname, queryString] = routePath.split("?");
    if (queryString) {
      for (const [key, value] of new URLSearchParams(queryString)) query[key] = value;
    }
    const request = {
      method,
      url: routePath,
      originalUrl: routePath,
      baseUrl: "",
      path: pathname,
      headers: { "content-type": "application/json" },
      body,
      query,
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
      if (error) reject(error);
      else resolve({ status: 404, payload: undefined });
    });
  });
}

const markerPath = path.join(os.tmpdir(), `localai-phase04-denied-${Date.now()}.txt`);
await rm(markerPath, { force: true }).catch(() => undefined);
const denied = createApprovalRequest({
  type: "eval_denied_command",
  title: "Replay denied command",
  summary: "Denied command should replay as denied and never create its marker.",
  riskTier: "tier5_manual_only_prohibited",
  requestedAction: "test.denied-command",
  payload: {
    command: `node -e "require('fs').writeFileSync(${JSON.stringify(markerPath)}, 'executed')"`,
    traceId: "phase04-denied-command",
  },
});
assert.equal(denied.status, "denied");
assert.equal(getDurableJob(denied.jobId!)?.state, "cancelled");
assert.equal(existsSync(markerPath), false, "Denied approval must not execute its command payload");
assertions += 3;

const deniedReplay = listMissionReplayEvents({ traceId: denied.id, limit: 100 });
assert.ok(
  deniedReplay.events.some(event => event.source === "approval_requests" && event.kind === "approval.denied" && event.dataStatus === "blocked"),
  "Denied approval should be replayed as blocked/denied",
);
assertions += 1;

const missingApprovalId = `missing-${randomUUID()}`;
const fakeJobId = `missing-job-${randomUUID()}`;
const missingAt = new Date().toISOString();
sqlite.pragma("foreign_keys = OFF");
sqlite.prepare(`
  INSERT INTO approval_requests
    (id, type, title, summary, risk_tier, physical_tier, requested_action,
     payload_hash, payload_json, status, job_id, audit_id, requested_at,
     approved_at, denied_at, cancelled_at, expires_at, result_json)
  VALUES (?, 'missing_job_eval', 'Missing replay data', 'Approval references a missing job.',
    'tier2_safe_local_execute', NULL, 'eval.missing', ?, '{}', 'waiting_for_approval',
    ?, NULL, ?, NULL, NULL, NULL, NULL, NULL)
`).run(missingApprovalId, payloadHash({}), fakeJobId, missingAt);
sqlite.pragma("foreign_keys = ON");
const missingReplay = listMissionReplayEvents({ traceId: missingApprovalId, limit: 100 });
assert.ok(
  missingReplay.events.some(event => event.kind === "missing.linked_job" && event.dataStatus === "missing" && event.target === fakeJobId),
  "Replay should mark missing linked job data instead of guessing it",
);
assertions += 1;

const secretAuditId = recordAuditEvent({
  eventType: "phase04_secret_eval",
  action: "record",
  target: "phase04-secret-trace",
  metadata: {
    traceId: "phase04-secret-trace",
    apiKey: "sk-phase04-test-secret",
    token: "bearer phase04-token",
    prompt: "private prompt text must not be logged raw",
    nested: { cookie: "session=secret-cookie", normal: "kept" },
  },
});
const secretReplay = listMissionReplayEvents({ traceId: "phase04-secret-trace", limit: 100 });
const secretText = JSON.stringify(secretReplay);
assert.ok(secretText.includes("[redacted:"), "Replay should mark redacted data");
assert.ok(!secretText.includes("sk-phase04-test-secret"), "Replay must not expose API keys");
assert.ok(!secretText.includes("private prompt text must not be logged raw"), "Replay must not expose raw prompt payloads");
assert.ok(secretText.includes("kept"), "Replay should preserve non-sensitive context");
assertions += 4;

const directRedaction = redactForMissionReplay({ authorization: "bearer abc12345", normal: "visible" });
assert.equal(directRedaction.redacted, true);
assert.equal((directRedaction.value as Record<string, unknown>).normal, "visible");
assertions += 2;

const failedJob = createDurableJob({ kind: "phase04.failed_job", payload: { traceId: "phase04-failed-job" } });
updateDurableJobState(failedJob.id, "failed", { message: "Intentional test failure", error: "phase04 test failure" });
appendJobEvent(failedJob.id, "diagnostic", "Diagnostic event after failure", { status: "failed" });
const failedReplay = listMissionReplayEvents({ traceId: failedJob.id, limit: 100 });
assert.ok(
  failedReplay.events.some(event => event.source === "durable_jobs" && event.kind === "job.failed" && event.dataStatus === "blocked"),
  "Failed durable jobs should be visible in mission replay",
);
assertions += 1;

const evalReport = runLocalJarvisEvals();
assert.equal(evalReport.localOnly, true);
assert.equal(evalReport.networkUsed, false);
assert.equal(evalReport.externalProvidersRequired, false);
assert.equal(evalReport.success, true);
assert.ok(evalReport.results.every(result => result.status === "pass"), "Local evals should pass without API keys");
assertions += 5;

const routeReplay = await inject("GET", `/observability/mission-replay?traceId=${encodeURIComponent(denied.id)}&limit=100`);
assert.equal(routeReplay.status, 200);
assert.equal(routeReplay.payload.success, true);
assert.ok(routeReplay.payload.replay.events.length > 0);
assertions += 3;

const evalRoute = await inject("POST", "/observability/evals/run");
assert.equal(evalRoute.status, 200);
assert.equal(evalRoute.payload.report.localOnly, true);
assert.equal(evalRoute.payload.report.networkUsed, false);
assert.equal(evalRoute.payload.report.externalProvidersRequired, false);
assertions += 4;

assert.ok(secretAuditId, "Secret audit event should have been written for replay coverage");
assertions += 1;

console.log(`mission-replay.test.ts passed (${assertions} assertions)`);
