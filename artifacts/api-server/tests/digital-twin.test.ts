/**
 * DIGITAL TWIN - Phase 17A Tests
 * ===============================
 * Covers local entity/relationship CRUD, provenance requirements, archived
 * deletion behavior, source-system links, physical-action safety delegation,
 * privacy classification, no external provider calls, and sanitized audit data.
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
  "digital_twin_relationships",
  "digital_twin_entities",
  "evidence_records",
  "maker_projects",
  "maker_materials",
  "maker_cad_artifacts",
  "edge_nodes",
  "home_device_profiles",
  "homelab_soc_alerts",
  "homelab_devices",
  "homelab_sites",
  "approval_requests",
  "audit_events",
  "job_events",
  "durable_jobs",
  "thought_log",
]) {
  try { sqlite.prepare(`DELETE FROM ${table}`).run(); } catch { /* table may not exist yet */ }
}

import express from "express";
import {
  archiveDigitalTwinEntity,
  createDigitalTwinEntity,
  createDigitalTwinRelationship,
  deleteDigitalTwinRelationship,
  evaluateDigitalTwinActionSafety,
  getDigitalTwinEntity,
  getDigitalTwinEntityDetail,
  getDigitalTwinStatus,
  listDigitalTwinRelationships,
  searchDigitalTwinGraph,
} from "../src/lib/digital-twin.js";
import { evidenceVault } from "../src/lib/evidence-vault.js";
import { upsertEdgeNode } from "../src/lib/edge-node.js";
import { upsertHomeDevice } from "../src/lib/home-autopilot.js";
import { createHomelabSocAlert, upsertDevice } from "../src/lib/homelab-architect.js";
import { createMakerProject } from "../src/lib/maker-studio.js";
import { listAuditEvents } from "../src/lib/platform-foundation.js";
import { thoughtLog } from "../src/lib/thought-log.js";
import contextRouter from "../src/routes/context.js";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
    .then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch((err) => { console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`); failed++; });
}

console.log("\nPhase 17A - Digital Twin tests\n");

let garageEntityId = "";
let projectEntityId = "";
let documentEntityId = "";
let relationshipId = "";

await test("digital-twin entities can be represented locally without external providers", () => {
  const garage = createDigitalTwinEntity({
    type: "zone",
    name: "Garage Work Zone",
    description: "Local-only shop area metadata.",
    privacyClassification: "private",
    stateConfidence: "unknown",
    metadata: {
      owner: "unknown",
      location: "PRIVATE_HOME_LAYOUT_SHOULD_NOT_LOG",
      privateIpMap: "10.1.2.0/24 SHOULD REDACT",
    },
    sourceRefs: [{ system: "manual", kind: "zone", id: "garage", status: "unknown" }],
  });
  garageEntityId = garage.id;
  assert.equal(garage.type, "zone");
  assert.equal(garage.privacyClassification, "private");
  assert.equal(garage.stateConfidence, "unknown");
  assert.equal(garage.externalApiCallsMade, undefined);
  assert.equal(garage.metadata["location"], "[redacted]");
  assert.equal(garage.metadata["privateIpMap"], "[redacted]");

  const status = getDigitalTwinStatus();
  assert.equal(status.localFirst, true);
  assert.equal(status.cloudRequired, false);
  assert.equal(status.externalApiCallsMade, false);
  assert.equal(status.entityCount, 1);
});

await test("entities can link to Evidence Vault, HomeLab, Home SOC, Maker Studio, edge nodes, vehicles, tools, and projects", async () => {
  const evidence = await evidenceVault.createRecord({
    title: "Garage Printer Manual",
    category: "manual",
    privacyClassification: "private",
    entityAssociation: { digitalTwinEntityId: garageEntityId },
  });
  documentEntityId = createDigitalTwinEntity({
    type: "document",
    name: "Garage Printer Manual",
    sourceRefs: [
      { system: "evidence_vault", kind: "record", id: evidence.id, status: "confirmed" },
      { system: "rag", kind: "collection", id: "evidence-manual", status: "proposed" },
    ],
    privacyClassification: "private",
    stateConfidence: "confirmed",
  }).id;

  const homelabDevice = upsertDevice({ name: "Shop Access Point", role: "access_point", confidence: "confirmed" });
  const socAlert = createHomelabSocAlert({ title: "Local SOC metadata", sourceProvider: "wazuh" });
  const edgeNode = upsertEdgeNode({ name: "Shop Edge Node", roles: ["shop_controller"], nodeType: "mini_pc" });
  const makerProject = createMakerProject({ name: "Bench Bracket", type: "3d_print", status: "planning" });
  projectEntityId = createDigitalTwinEntity({
    type: "project",
    name: "Bench Bracket",
    sourceRefs: [
      { system: "maker_studio", kind: "project", id: makerProject.id, status: "confirmed" },
      { system: "homelab", kind: "device", id: homelabDevice.id, status: "confirmed" },
      { system: "home_soc", kind: "alert", id: socAlert.id, status: "not_configured" },
      { system: "edge_node", kind: "node", id: edgeNode.id, status: "confirmed" },
      { system: "vehicle", kind: "record", id: "foxbody-project", status: "unknown" },
      { system: "tool", kind: "asset", id: "calipers", status: "proposed" },
      { system: "project", kind: "external", id: "bench-bracket", status: "confirmed" },
    ],
    privacyClassification: "sensitive",
    stateConfidence: "proposed",
  }).id;

  const detail = await getDigitalTwinEntityDetail(documentEntityId);
  assert.ok(detail);
  assert.ok(detail!.linkedDocuments.some((record) => record.id === evidence.id));
  assert.equal(detail!.externalApiCallsMade, false);
});

await test("relationships distinguish confirmed/proposed/inferred/stale/deleted/unknown data", () => {
  const confirmed = createDigitalTwinRelationship({
    sourceEntityId: projectEntityId,
    relationType: "uses_document",
    targetEntityId: documentEntityId,
    confidence: 0.99,
    status: "confirmed",
    provenance: { source: "manual", sourceRef: "test-manual-entry", evidenceRefs: [documentEntityId] },
  });
  relationshipId = confirmed.id;
  assert.equal(confirmed.status, "confirmed");

  for (const status of ["proposed", "inferred", "stale", "blocked", "unknown"] as const) {
    const rel = createDigitalTwinRelationship({
      sourceEntityId: garageEntityId,
      relationType: `status_${status}`,
      targetEntityId: documentEntityId,
      confidence: status === "unknown" ? 0 : 0.55,
      status,
      provenance: { source: status === "inferred" ? "ai" : "manual", sourceRef: `phase17a-${status}`, note: "metadata only" },
    });
    assert.equal(rel.status, status);
  }

  const deleted = deleteDigitalTwinRelationship(relationshipId);
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.relationship!.status, "deleted");
});

await test("AI-created relationships require provenance and unknown data is not guessed as confirmed", () => {
  assert.throws(() => createDigitalTwinRelationship({
    sourceEntityId: projectEntityId,
    relationType: "ai_says_related",
    targetEntityId: garageEntityId,
    confidence: 0.4,
    status: "inferred",
    provenance: { source: "ai" },
  }), /provenance/i);

  assert.throws(() => createDigitalTwinRelationship({
    sourceEntityId: projectEntityId,
    relationType: "low_confidence_confirmed",
    targetEntityId: garageEntityId,
    confidence: 0.5,
    status: "confirmed",
    provenance: { source: "manual", sourceRef: "bad-confirmed" },
  }), /confidence/i);

  const unknown = createDigitalTwinEntity({ type: "sensor", name: "Unknown sensor", stateConfidence: "unknown" });
  assert.equal(unknown.stateConfidence, "unknown");
});

await test("entity archive blocks linked refs unless forced, and forced archive marks relationships stale", () => {
  const rel = createDigitalTwinRelationship({
    sourceEntityId: projectEntityId,
    relationType: "located_in",
    targetEntityId: garageEntityId,
    confidence: 0.7,
    status: "proposed",
    provenance: { source: "manual", sourceRef: "phase17a-archive-test" },
  });
  const blocked = archiveDigitalTwinEntity(garageEntityId);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.archived, false);

  const forced = archiveDigitalTwinEntity(garageEntityId, { forceArchive: true });
  assert.equal(forced.archived, true);
  assert.ok(getDigitalTwinEntity(garageEntityId)!.archivedAt);
  assert.ok(listDigitalTwinRelationships({ entityId: garageEntityId, includeDeleted: true }).some((item) => item.id === rel.id && item.status === "stale"));
});

await test("search graph is local-only and returns entity/relationship matches", () => {
  const result = searchDigitalTwinGraph("Bench");
  assert.equal(result.localOnly, true);
  assert.equal(result.externalApiCallsMade, false);
  assert.ok(result.entities.some((entity) => entity.id === projectEntityId));
});

await test("physical actions remain blocked/manual_only/approval_required through existing policies", () => {
  const edge = upsertEdgeNode({ name: "Camera Edge", roles: ["camera_nvr"], nodeType: "mini_pc" });
  const edgeEntity = createDigitalTwinEntity({
    type: "camera",
    name: "Camera via edge node",
    sourceRefs: [{ system: "edge_node", kind: "node", id: edge.id, status: "confirmed" }],
  });
  const edgeSafety = evaluateDigitalTwinActionSafety(edgeEntity.id, "camera_frame_capture");
  assert.equal(edgeSafety.status, "blocked");
  assert.equal(edgeSafety.executed, false);

  const homeDevice = upsertHomeDevice({ name: "Garage Door", deviceType: "garage_door", provider: "home_assistant", configured: true });
  const homeEntity = createDigitalTwinEntity({
    type: "automation",
    name: "Garage door automation",
    sourceRefs: [{ system: "home_autopilot", kind: "device", id: homeDevice.id, status: "confirmed" }],
  });
  const homeSafety = evaluateDigitalTwinActionSafety(homeEntity.id, "garage_door_open");
  assert.equal(homeSafety.status, "approval_required");
  assert.equal(homeSafety.requiresApproval, true);
  assert.equal(homeSafety.executed, false);

  const makerSafety = evaluateDigitalTwinActionSafety(projectEntityId, "start_print");
  assert.equal(makerSafety.status, "approval_required");
  assert.equal(makerSafety.executed, false);
});

await test("no real device/network/home/shop/vehicle API calls occur during default tests", () => {
  const status = getDigitalTwinStatus();
  assert.equal(status.externalApiCallsMade, false);
  const safety = evaluateDigitalTwinActionSafety(projectEntityId, "unknown_vehicle_control");
  assert.equal(safety.executed, false);
  assert.ok(["approval_required", "not_configured", "blocked", "manual_only", "proposal"].includes(safety.status));
});

await test("privacy/sensitivity classification is preserved", () => {
  const entity = getDigitalTwinEntity(projectEntityId)!;
  assert.equal(entity.privacyClassification, "sensitive");
  assert.equal(entity.sensitivity, "sensitive");
});

await test("audit/replay records are created without secrets/private/entity contents", () => {
  const audit = JSON.stringify(listAuditEvents(300));
  const replay = JSON.stringify(thoughtLog.history());
  for (const text of [audit, replay]) {
    assert.equal(/PRIVATE_HOME_LAYOUT_SHOULD_NOT_LOG/.test(text), false);
    assert.equal(/10\.1\.2\.0/.test(text), false);
    assert.equal(/api[_-]?key/i.test(text), false);
    assert.equal(/token.*[=:]/i.test(text), false);
    assert.equal(/vehicle.*vin/i.test(text), false);
  }
  assert.match(audit, /digital_twin/);
  assert.match(replay, /Digital Twin/);
});

const app = express();
app.use(express.json());
app.use("/api", contextRouter);

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

await test("HTTP Digital Twin routes expose status, CRUD, search, detail, and safety", async () => {
  const status = await req("GET", "/context/digital-twin/status");
  assert.equal(status.status, 200);
  assert.equal(((status.body["status"] as Record<string, unknown>)["externalApiCallsMade"]), false);

  const entity = await req("POST", "/context/digital-twin/entities", {
    type: "tool",
    name: "HTTP Calipers",
    privacyClassification: "private",
    stateConfidence: "proposed",
  });
  assert.equal(entity.status, 201);
  const created = entity.body["entity"] as Record<string, unknown>;

  const search = await req("POST", "/context/digital-twin/search", { query: "Calipers" });
  assert.equal(search.status, 200);
  assert.equal(search.body["externalApiCallsMade"], false);

  const detail = await req("GET", `/context/digital-twin/entities/${created["id"]}`);
  assert.equal(detail.status, 200);

  const safety = await req("POST", `/context/digital-twin/entities/${created["id"]}/action-safety`, { action: "turn_on" });
  assert.equal(safety.status, 200);
  assert.equal(((safety.body["result"] as Record<string, unknown>)["executed"]), false);
});

server.close();

console.log(`\n${passed + failed > 0 ? `${passed} passed, ${failed} failed` : "no tests ran"}`);
if (failed > 0) {
  console.error(`\n✗ ${failed} Phase 17A digital-twin test(s) FAILED`);
  process.exit(1);
}
console.log("\n✓ All Phase 17A digital-twin tests passed");
