/**
 * HOMELAB CONFIG PIPELINE - Phase 15B Tests
 * ==========================================
 * Covers draft config proposals, static/simulated/unavailable validation,
 * approval-gated apply decisions, rollback metadata, no real provider calls,
 * and privacy-safe audit/replay records.
 */

import assert from "node:assert/strict";
import http from "node:http";

process.env["DATABASE_URL"] = ":memory:";
process.env["LOCALAI_TEST_AGENT_PERMISSIONS"] = JSON.stringify({
  allowAgentExec: true,
  allowAgentEdits: true,
});

import { runMigrations } from "../src/db/migrate.js";
runMigrations();

import { sqlite } from "../src/db/database.js";

for (const table of [
  "homelab_config_proposals",
  "homelab_sites",
  "homelab_devices",
  "homelab_vlans",
  "homelab_subnets",
  "homelab_services",
  "approval_requests",
  "audit_events",
  "job_events",
  "durable_jobs",
  "thought_log",
]) {
  try { sqlite.prepare(`DELETE FROM ${table}`).run(); } catch { /* table may not exist yet */ }
}

import { approveRequest, denyRequest } from "../src/lib/approval-queue.js";
import {
  createHomelabConfigProposal,
  getHomelabProviders,
  listHomelabConfigProposals,
  requestHomelabConfigApply,
  requestHomelabConfigRollback,
  upsertDevice,
  upsertService,
  upsertSite,
  upsertSubnet,
  upsertVlan,
  validateHomelabConfigProposal,
} from "../src/lib/homelab-architect.js";
import { listAuditEvents } from "../src/lib/platform-foundation.js";
import { thoughtLog } from "../src/lib/thought-log.js";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
    .then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch((err) => { console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`); failed++; });
}

console.log("\nPhase 15B — HomeLab Config Pipeline tests\n");

upsertSite({ name: "Local Rack", confidence: "confirmed" });
upsertDevice({
  name: "Firewall Node",
  role: "firewall",
  managementIpRef: "mgmt-ref-do-not-log",
  serialNumber: "SECRET-SERIAL-DO-NOT-LOG",
  confidence: "confirmed",
});
upsertVlan({ name: "Servers", vlanId: 30, confidence: "proposed" });
upsertSubnet({ prefix: "192.168.30.0/24", gatewayRef: "gateway-ref-do-not-log", confidence: "proposed" });
upsertService({ name: "Local DNS", serviceType: "dns", port: 53, protocol: "udp", confidence: "proposed" });

await test("optional HomeLab providers including Docker Compose report not_configured/degraded", () => {
  const providers = getHomelabProviders();
  for (const id of ["netbox", "nautobot", "proxmox", "opnsense", "unifi", "ansible", "opentofu", "docker-compose", "batfish"]) {
    const provider = providers.find((p) => p.providerId === id);
    assert.ok(provider, `${id} must be registered`);
    assert.ok(["not_configured", "degraded", "disabled"].includes(provider.status), `${id} must not fake success`);
    assert.equal(provider.recordCount, 0);
  }
});

let proposalId = "";
await test("config proposal is created from local source-of-truth metadata without real providers", () => {
  const proposal = createHomelabConfigProposal({ proposalType: "vlan_ip_dns_dhcp_firewall" });
  proposalId = proposal.id;
  assert.equal(proposal.applyStatus, "drafted");
  assert.equal(proposal.dryRun, true);
  assert.equal(proposal.executed, false);
  assert.equal(proposal.apiCallsMade, false);
  assert.equal(proposal.providerStatus, "not_configured");
  assert.ok(proposal.sourceInventoryRef);
  assert.ok(proposal.sourceBlueprintId);
  assert.ok(proposal.expectedChanges.length >= 1);
  assert.equal(proposal.diffSummary["sensitiveValuesRedacted"], true);
  assert.equal((proposal.draftMetadata.configDraft as Record<string, unknown>)["externalProviderCalls"], false);
});

await test("generated configs are draft/proposal/dry_run by default with backup and rollback metadata", () => {
  const proposal = listHomelabConfigProposals().find((p) => p.id === proposalId)!;
  assert.equal(proposal.draftMetadata["mode"], "draft/proposal/dry_run");
  assert.equal(proposal.backupPlan.required, true);
  assert.equal(proposal.backupPlan.available, true);
  assert.equal(proposal.rollbackPlan.required, true);
  assert.equal(proposal.rollbackPlan.available, true);
  assert.ok(proposal.backupPlan.steps.length > 0);
  assert.ok(proposal.rollbackPlan.steps.length > 0);
});

await test("apply is blocked before validation passes", () => {
  const outcome = requestHomelabConfigApply(proposalId);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.executed, false);
  assert.equal(outcome.apiCallsMade, false);
  assert.equal(outcome.status, "apply_blocked");
  assert.match(outcome.reason, /Validation must pass/i);
});

await test("static validation passes locally and makes no real provider call", () => {
  const outcome = validateHomelabConfigProposal(proposalId, { kind: "static" });
  assert.equal(outcome.status, "passed");
  assert.equal(outcome.kind, "static");
  assert.equal(outcome.realProviderCheck, false);
  assert.equal(outcome.proposal.applyStatus, "validation_passed");
  assert.equal(outcome.proposal.apiCallsMade, false);
});

await test("simulated validation is distinct from static validation and remains local", () => {
  const simulated = createHomelabConfigProposal({ proposalType: "docker_compose_stack" });
  const outcome = validateHomelabConfigProposal(simulated.id, { kind: "simulated" });
  assert.equal(outcome.status, "passed");
  assert.equal(outcome.kind, "simulated");
  assert.equal(outcome.realProviderCheck, false);
  assert.equal(outcome.proposal.apiCallsMade, false);
});

await test("Batfish unavailable validation reports not_configured instead of fake success", () => {
  const batfish = createHomelabConfigProposal({ proposalType: "vlan_ip_dns_dhcp_firewall", targetProvider: "batfish" });
  const outcome = validateHomelabConfigProposal(batfish.id, { kind: "unavailable_provider" });
  assert.equal(outcome.status, "not_configured");
  assert.equal(outcome.kind, "unavailable_provider");
  assert.equal(outcome.proposal.applyStatus, "not_configured");
  assert.equal(outcome.proposal.apiCallsMade, false);
});

await test("real provider validation is marked unavailable/not_configured by default", () => {
  const proxmox = createHomelabConfigProposal({ proposalType: "proxmox_layout" });
  const outcome = validateHomelabConfigProposal(proxmox.id, { kind: "real_provider" });
  assert.equal(outcome.status, "not_configured");
  assert.equal(outcome.realProviderCheck, true);
  assert.equal(outcome.proposal.apiCallsMade, false);
});

await test("apply is blocked without a backup plan for mutable targets", () => {
  const noBackup = createHomelabConfigProposal({
    proposalType: "opnsense_draft",
    backupPlan: { available: false, summary: "No backup captured" },
  });
  validateHomelabConfigProposal(noBackup.id, { kind: "static" });
  const outcome = requestHomelabConfigApply(noBackup.id);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.status, "apply_blocked");
  assert.match(outcome.reason, /backup plan/i);
  assert.equal(outcome.executed, false);
});

let approvalId = "";
await test("firewall/DHCP/VLAN write path requires explicit approval", () => {
  const outcome = requestHomelabConfigApply(proposalId);
  approvalId = outcome.approvalId ?? "";
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.status, "approval_required");
  assert.ok(approvalId, "approval request must be created");
  assert.equal(outcome.executed, false);
  assert.equal(outcome.apiCallsMade, false);
});

await test("denied apply actions do not execute", () => {
  denyRequest(approvalId, "test denied");
  const outcome = requestHomelabConfigApply(proposalId, { approvalId });
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.status, "apply_blocked");
  assert.equal(outcome.executed, false);
  assert.equal(outcome.apiCallsMade, false);
});

await test("approved apply remains not_configured when provider is missing", () => {
  const proposal = createHomelabConfigProposal({ proposalType: "docker_compose_stack" });
  validateHomelabConfigProposal(proposal.id, { kind: "static" });
  const requested = requestHomelabConfigApply(proposal.id);
  assert.ok(requested.approvalId);
  approveRequest(requested.approvalId!, "test approved");
  const outcome = requestHomelabConfigApply(proposal.id, { approvalId: requested.approvalId });
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.status, "not_configured");
  assert.equal(outcome.executed, false);
  assert.equal(outcome.apiCallsMade, false);
});

await test("rollback request is metadata-only when nothing was applied", () => {
  const outcome = requestHomelabConfigRollback(proposalId);
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.status, "apply_blocked");
  assert.equal(outcome.executed, false);
  assert.equal(outcome.apiCallsMade, false);
});

await test("audit/replay records are created without secrets, credentials, or private maps", () => {
  const audit = JSON.stringify(listAuditEvents(200));
  const replay = JSON.stringify(thoughtLog.history().filter((entry) => entry.title.includes("HomeLab")));
  for (const text of [audit, replay]) {
    assert.equal(/SECRET-SERIAL-DO-NOT-LOG/.test(text), false);
    assert.equal(/192\.168\.30\.0/.test(text), false);
    assert.equal(/password/i.test(text), false);
    assert.equal(/api[_-]?key/i.test(text), false);
    assert.equal(/token/i.test(text), false);
  }
  assert.match(audit, /homelab_config/);
  assert.match(replay, /HomeLab/);
});

await test("no real infrastructure API calls are made during default tests", () => {
  const proposals = listHomelabConfigProposals();
  assert.ok(proposals.length >= 1);
  assert.ok(proposals.every((p) => p.apiCallsMade === false));
  assert.ok(proposals.every((p) => p.executed === false));
});

import express from "express";
import homelabRouter from "../src/routes/homelab.js";

const app = express();
app.use(express.json());
app.use("/api", homelabRouter);

const server = http.createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}/api`;

async function req(method: string, path: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

await test("HTTP config proposal/validation/apply routes are exposed", async () => {
  const create = await req("POST", "/homelab/config/proposals", { proposalType: "backup_monitoring_plan" });
  assert.equal(create.status, 201);
  const created = create.body["proposal"] as Record<string, unknown>;
  assert.equal(created["dryRun"], true);

  const validate = await req("POST", `/homelab/config/proposals/${created["id"]}/validate`, { kind: "static" });
  assert.equal(validate.status, 200);
  assert.equal(((validate.body["outcome"] as Record<string, unknown>)["proposal"] as Record<string, unknown>)["applyStatus"], "validation_passed");

  const apply = await req("POST", `/homelab/config/proposals/${created["id"]}/apply`);
  assert.equal(apply.status, 200);
  assert.equal((apply.body["outcome"] as Record<string, unknown>)["status"], "approval_required");

  const list = await req("GET", "/homelab/config/proposals");
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body["proposals"]));
});

server.close();

console.log(`\n${passed + failed > 0 ? `${passed} passed, ${failed} failed` : "no tests ran"}`);
if (failed > 0) {
  console.error(`\n✗ ${failed} Phase 15B homelab-config test(s) FAILED`);
  process.exit(1);
}
console.log("\n✓ All Phase 15B homelab-config tests passed");
