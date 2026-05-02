/**
 * HOMELAB SOC - Phase 16 Tests
 * =============================
 * Covers local Home SOC alert/report records, optional provider status,
 * remediation approval gates, denied/no-execute behavior, local-first defaults,
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
  "homelab_soc_remediation_proposals",
  "homelab_soc_alerts",
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
  createHomelabSocAlert,
  generateHomelabSocReport,
  getHomelabSocProviders,
  getHomelabSocStatus,
  listHomelabConfigProposals,
  listHomelabSocAlerts,
  listHomelabSocRemediations,
  proposeHomelabSocRemediation,
  upsertDevice,
  upsertService,
  upsertSite,
  upsertVlan,
  type HomelabSocReportKind,
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

console.log("\nPhase 16 — Home SOC tests\n");

upsertSite({ name: "Home SOC Lab", confidence: "confirmed" });
upsertDevice({
  name: "Unknown IoT Device",
  role: "unknown",
  managementIpRef: "PRIVATE-IP-REF-DO-NOT-LOG",
  serialNumber: "SECRET-SERIAL-DO-NOT-LOG",
  confidence: "unknown",
});
upsertDevice({ name: "OPNsense Firewall", role: "firewall", confidence: "confirmed" });
upsertVlan({ name: "IoT", vlanId: 40, confidence: "proposed" });
upsertService({ name: "Local DNS", serviceType: "dns", port: 53, protocol: "udp", confidence: "proposed" });

await test("all optional Home SOC providers report not_configured/degraded and never fake success", () => {
  const providers = getHomelabSocProviders();
  for (const id of ["wazuh", "zeek", "suricata", "opnsense-ids", "pihole", "adguard-home", "librenms", "zabbix", "netdata", "uptime-kuma", "osquery"]) {
    const provider = providers.find((p) => p.providerId === id);
    assert.ok(provider, `${id} must be registered`);
    assert.ok(["not_configured", "degraded", "disabled"].includes(provider.status), `${id} must not fake success`);
    assert.equal(provider.dataLeavesMachine, false);
    assert.equal(provider.startupPolicy, "disabled");
    assert.equal(provider.recordCount, 0);
  }
});

let alertId = "";
await test("Home SOC alert records can be represented without Wazuh/Zeek/Suricata/etc.", () => {
  const alert = createHomelabSocAlert({
    title: "Suspicious DNS metadata only",
    severity: "high",
    category: "dns",
    sourceProvider: "pihole",
    deviceRef: "inventory-device-ref",
    summary: {
      confirmedFacts: ["Local alert metadata was entered manually."],
      inferredPossibilities: ["This may be DNS noise, but provider telemetry is not configured."],
      unknowns: ["DNS query contents are unavailable and were not fetched."],
      proposedNextActions: ["Review local inventory before proposing DNS filter changes."],
    },
    evidenceRefs: ["evidence://local-only"],
  });
  alertId = alert.id;
  assert.equal(alert.status, "not_configured");
  assert.equal(alert.providerStatus, "not_configured");
  assert.equal(alert.localOnly, true);
  assert.equal(alert.apiCallsMade, false);
  assert.equal(alert.summary.confirmedFacts.length, 1);
  assert.equal(alert.summary.inferredPossibilities.length, 1);
  assert.equal(alert.summary.unknowns.length, 1);
  assert.equal(alert.summary.proposedNextActions.length, 1);
});

await test("Home SOC status remains local-first and security APIs disabled by default", () => {
  const status = getHomelabSocStatus();
  assert.equal(status.alertsCount, 1);
  assert.equal(status.localFirst, true);
  assert.equal(status.cloudRequired, false);
  assert.equal(status.realSecurityApiCallsEnabled, false);
  assert.ok(status.sourceOfTruth.includes("Phase 16 Home SOC"));
});

await test("alert summaries distinguish confirmed, inferred, unknown, and proposed data", () => {
  const alert = listHomelabSocAlerts()[0]!;
  assert.ok(alert.summary.confirmedFacts.length > 0);
  assert.ok(alert.summary.inferredPossibilities.length > 0);
  assert.ok(alert.summary.unknowns.length > 0);
  assert.ok(alert.summary.proposedNextActions.length > 0);
});

await test("analysis workflows use local metadata and no real security/network APIs", () => {
  const kinds: HomelabSocReportKind[] = [
    "unknown_device_report",
    "suspicious_dns_summary",
    "wan_outage_timeline",
    "noisy_iot_device_summary",
    "what_changed_report",
  ];
  for (const kind of kinds) {
    const report = generateHomelabSocReport(kind);
    assert.equal(report.kind, kind);
    assert.equal(report.modelProvider, "local");
    assert.equal(report.localFirst, true);
    assert.equal(report.cloudRequired, false);
    assert.equal(report.apiCallsMade, false);
    assert.ok(report.summary.confirmedFacts.length > 0);
    assert.ok(report.summary.unknowns.length > 0);
  }
});

await test("read-only remediation stays read_only and does not execute", () => {
  const outcome = proposeHomelabSocRemediation(alertId, "read_only_review");
  assert.equal(outcome.proposal.status, "read_only");
  assert.equal(outcome.proposal.mode, "read_only");
  assert.equal(outcome.executed, false);
  assert.equal(outcome.apiCallsMade, false);
});

await test("packet capture/sniffing is blocked by default", () => {
  const outcome = proposeHomelabSocRemediation(alertId, "packet_capture");
  assert.equal(outcome.proposal.status, "blocked");
  assert.equal(outcome.proposal.mode, "blocked");
  assert.equal(outcome.executed, false);
  assert.equal(outcome.apiCallsMade, false);
});

let remediationApprovalId = "";
await test("dangerous remediation actions require approval by default", () => {
  const outcome = proposeHomelabSocRemediation(alertId, "block_device");
  remediationApprovalId = outcome.approval?.id ?? "";
  assert.equal(outcome.approvalRequired, true);
  assert.ok(remediationApprovalId);
  assert.equal(outcome.proposal.status, "approval_required");
  assert.equal(outcome.proposal.executed, false);
  assert.equal(outcome.proposal.apiCallsMade, false);
});

await test("denied remediation actions do not execute", () => {
  denyRequest(remediationApprovalId, "phase 16 denied remediation");
  const outcome = proposeHomelabSocRemediation(alertId, "block_device", { approvalId: remediationApprovalId });
  assert.equal(outcome.proposal.status, "denied");
  assert.equal(outcome.proposal.executed, false);
  assert.equal(outcome.proposal.apiCallsMade, false);
});

await test("approved firewall/DNS/VLAN remediation remains not_configured and links to config proposal metadata only", () => {
  const requested = proposeHomelabSocRemediation(alertId, "dns_filter_change");
  assert.ok(requested.approval?.id);
  approveRequest(requested.approval!.id, "phase 16 approved gate");
  const outcome = proposeHomelabSocRemediation(alertId, "dns_filter_change", { approvalId: requested.approval!.id });
  assert.equal(outcome.proposal.status, "not_configured");
  assert.equal(outcome.proposal.executed, false);
  assert.equal(outcome.proposal.apiCallsMade, false);
  assert.ok(outcome.proposal.linkedConfigProposalId);
  assert.ok(listHomelabConfigProposals().some((proposal) => proposal.id === outcome.proposal.linkedConfigProposalId));
});

await test("no firewall/DNS/DHCP/VLAN/security-tool changes are applied", () => {
  const remediations = listHomelabSocRemediations();
  assert.ok(remediations.length >= 1);
  assert.ok(remediations.every((proposal) => proposal.executed === false));
  assert.ok(remediations.every((proposal) => proposal.apiCallsMade === false));
});

await test("audit/replay records are created without secrets, IP maps, packet contents, or raw logs", () => {
  const audit = JSON.stringify(listAuditEvents(300));
  const replay = JSON.stringify(thoughtLog.history().filter((entry) => entry.title.includes("Home SOC") || entry.category === "approval"));
  for (const text of [audit, replay]) {
    assert.equal(/SECRET-SERIAL-DO-NOT-LOG/.test(text), false);
    assert.equal(/PRIVATE-IP-REF-DO-NOT-LOG/.test(text), false);
    assert.equal(/packet-content-secret/i.test(text), false);
    assert.equal(/raw-security-log/i.test(text), false);
    assert.equal(/api[_-]?key/i.test(text), false);
    assert.equal(/token.*[=:]/i.test(text), false);
  }
  assert.match(audit, /homelab_soc/);
  assert.match(replay, /Home SOC|approval/);
});

await test("local-first/no-cost defaults require no cloud/API/provider", () => {
  const providers = getHomelabSocProviders();
  assert.ok(providers.every((provider) => provider.dataLeavesMachine === false));
  assert.ok(providers.every((provider) => provider.status !== "read_only"));
  assert.ok(listHomelabSocAlerts().every((alert) => alert.apiCallsMade === false));
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

await test("HTTP SOC routes expose providers, alerts, reports, and remediation gates", async () => {
  const providers = await req("GET", "/homelab/soc/providers");
  assert.equal(providers.status, 200);
  assert.ok(Array.isArray(providers.body["providers"]));

  const create = await req("POST", "/homelab/soc/alerts", {
    title: "HTTP local alert",
    severity: "medium",
    category: "security",
    sourceProvider: "wazuh",
  });
  assert.equal(create.status, 201);
  const created = create.body["alert"] as Record<string, unknown>;
  assert.equal(created["apiCallsMade"], false);

  const report = await req("POST", "/homelab/soc/reports", { kind: "what_changed_report" });
  assert.equal(report.status, 200);
  assert.equal((report.body["report"] as Record<string, unknown>)["apiCallsMade"], false);

  const remediate = await req("POST", `/homelab/soc/alerts/${created["id"]}/remediation`, { action: "firewall_rule_change" });
  assert.equal(remediate.status, 200);
  assert.equal(((remediate.body["outcome"] as Record<string, unknown>)["proposal"] as Record<string, unknown>)["status"], "approval_required");

  const list = await req("GET", "/homelab/soc/alerts");
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body["alerts"]));
});

server.close();

console.log(`\n${passed + failed > 0 ? `${passed} passed, ${failed} failed` : "no tests ran"}`);
if (failed > 0) {
  console.error(`\n✗ ${failed} Phase 16 homelab-soc test(s) FAILED`);
  process.exit(1);
}
console.log("\n✓ All Phase 16 homelab-soc tests passed");
