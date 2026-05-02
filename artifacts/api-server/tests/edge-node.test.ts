/**
 * EDGE NODE REGISTRY - Phase 14A Tests
 * =====================================
 * Covers:
 *   - edge node records can be represented without real nodes
 *   - missing/unconfigured nodes report not_configured/unknown
 *   - gaming PC node is never always-on (hard limit)
 *   - physical actions default to blocked/manual_only/approval_required
 *   - camera frame capture is permanently blocked
 *   - shop relay control is permanently manual_only
 *   - no real home/shop/device API calls during tests
 *   - gaming-PC-safe design: no always-on assumption
 *   - secrets/device tokens/camera data not logged
 *   - audit/thought records created
 *   - HTTP routes work without real nodes
 */

import assert from "node:assert/strict";

process.env["DATABASE_URL"] = ":memory:";
process.env["LOCALAI_TEST_AGENT_PERMISSIONS"] = JSON.stringify({
  allowAgentExec: true,
  allowAgentEdits: true,
  allowAgentSelfHeal: true,
  allowAgentRefactor: true,
});

import { runMigrations } from "../src/db/migrate.js";
runMigrations();

import { sqlite } from "../src/db/database.js";
// Cleanup from any prior test run
try { sqlite.prepare("DELETE FROM edge_nodes").run(); } catch { /* table may not exist yet */ }

async function test(label: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (err) {
    console.error(`  ✗ ${label}`);
    throw err;
  }
}

console.log("\nPhase 14A — Edge Node Registry tests\n");

// ── 1. Source of truth ────────────────────────────────────────────────────────

import {
  EDGE_NODE_SOURCE_OF_TRUTH,
  listEdgeNodes,
  getEdgeNode,
  upsertEdgeNode,
  deleteEdgeNode,
  checkEdgeNodeHealth,
  evaluateEdgeAction,
  getGamingPcRoleDescription,
} from "../src/lib/edge-node.js";

await test("EDGE_NODE_SOURCE_OF_TRUTH contains gaming PC and hard limit text", () => {
  assert.ok(EDGE_NODE_SOURCE_OF_TRUTH.includes("gaming PC"), "must mention gaming PC");
  assert.ok(EDGE_NODE_SOURCE_OF_TRUTH.includes("Hard limits"), "must document hard limits");
  assert.ok(EDGE_NODE_SOURCE_OF_TRUTH.includes("not_configured"), "must document not_configured behavior");
  assert.ok(EDGE_NODE_SOURCE_OF_TRUTH.includes("never log"), "must document no-logging rule");
});

// ── 2. Empty registry ─────────────────────────────────────────────────────────

await test("listEdgeNodes returns empty array when no nodes registered", () => {
  const nodes = listEdgeNodes();
  assert.ok(Array.isArray(nodes), "must be array");
  assert.equal(nodes.length, 0, "must be empty initially");
});

// ── 3. Register a node ────────────────────────────────────────────────────────

await test("upsertEdgeNode creates a dedicated always-on Pi node", () => {
  const node = upsertEdgeNode({
    name: "Home Pi",
    nodeType: "raspberry_pi",
    roles: ["home_assistant", "worker_node"],
    endpoint: "",  // no real endpoint in test
    alwaysOn: true,
    description: "Always-on Home Assistant host",
  });
  assert.equal(node.name, "Home Pi");
  assert.equal(node.nodeType, "raspberry_pi");
  assert.equal(node.alwaysOn, true, "dedicated node can be always-on");
  assert.equal(node.isGamingPc, false);
  assert.ok(node.allowedCapabilities.length > 0, "should have default capabilities");
  assert.ok(
    node.allowedCapabilities.some((c) => c.id === "ha_status_read"),
    "HA role should include ha_status_read"
  );
});

// ── 4. Gaming PC hard limit ───────────────────────────────────────────────────

await test("Gaming PC node is never always-on (hard limit enforced)", () => {
  const gamingPc = upsertEdgeNode({
    name: "Gaming PC",
    nodeType: "gaming_pc",
    roles: ["ai_brain", "coordinator"],
    isGamingPc: true,
    alwaysOn: true,  // attempt to set always-on — must be ignored
    description: "Heavy AI workstation",
  });
  assert.equal(gamingPc.isGamingPc, true);
  assert.equal(gamingPc.alwaysOn, false, "Gaming PC alwaysOn must always be false (hard limit)");
});

// ── 5. getEdgeNode retrieves correctly ───────────────────────────────────────

await test("getEdgeNode retrieves a registered node by id", () => {
  const nodes = listEdgeNodes();
  assert.ok(nodes.length >= 2, "should have at least two registered nodes");
  const n = nodes[0];
  const fetched = getEdgeNode(n.id);
  assert.ok(fetched, "must be retrievable");
  assert.equal(fetched!.id, n.id);
  assert.equal(fetched!.name, n.name);
});

await test("getEdgeNode returns null for unknown id", () => {
  const result = getEdgeNode("non-existent-id-xyz");
  assert.equal(result, null);
});

// ── 6. Capability defaults by role ────────────────────────────────────────────

await test("camera_nvr role includes camera_frame_capture as blocked (hard limit)", () => {
  const node = upsertEdgeNode({
    name: "Camera NVR",
    nodeType: "nas",
    roles: ["camera_nvr"],
    endpoint: "",
  });
  const cap = node.allowedCapabilities.find((c) => c.id === "camera_frame_capture");
  assert.ok(cap, "camera_frame_capture must be present");
  assert.equal(cap!.riskTier, "blocked", "camera frame capture must be permanently blocked");
  assert.equal(cap!.enabled, false, "camera frame capture must be disabled");
});

await test("shop_controller role includes shop_relay_control as manual_only (hard limit)", () => {
  const node = upsertEdgeNode({
    name: "Shop Controller",
    nodeType: "raspberry_pi",
    roles: ["shop_controller"],
    endpoint: "",
  });
  const cap = node.allowedCapabilities.find((c) => c.id === "shop_relay_control");
  assert.ok(cap, "shop_relay_control must be present");
  assert.equal(cap!.riskTier, "manual_only", "shop relay must be permanently manual_only");
  assert.equal(cap!.enabled, false);
});

// ── 7. evaluateEdgeAction ─────────────────────────────────────────────────────

await test("evaluateEdgeAction: read_only capability returns allowed=true, executed=false", () => {
  const nodes = listEdgeNodes();
  const piNode = nodes.find((n) => n.name === "Home Pi");
  assert.ok(piNode, "Home Pi must exist");
  const result = evaluateEdgeAction(piNode!.id, "ha_status_read");
  assert.equal(result.allowed, true);
  assert.equal(result.riskTier, "read_only");
  assert.equal(result.requiresApproval, false);
  assert.equal(result.executed, false, "Nothing executes in Phase 14A");
});

await test("evaluateEdgeAction: approval_required capability returns requiresApproval=true, executed=false", () => {
  const nodes = listEdgeNodes();
  const piNode = nodes.find((n) => n.name === "Home Pi");
  assert.ok(piNode, "Home Pi must exist");
  const result = evaluateEdgeAction(piNode!.id, "ha_entity_control");
  assert.equal(result.allowed, false);
  assert.equal(result.requiresApproval, true);
  assert.equal(result.executed, false);
});

await test("evaluateEdgeAction: blocked capability returns allowed=false (camera hard limit)", () => {
  const nodes = listEdgeNodes();
  const cameraNode = nodes.find((n) => n.name === "Camera NVR");
  assert.ok(cameraNode, "Camera NVR must exist");
  const result = evaluateEdgeAction(cameraNode!.id, "camera_frame_capture");
  assert.equal(result.allowed, false);
  assert.equal(result.riskTier, "blocked");
  assert.equal(result.requiresApproval, false);
  assert.equal(result.executed, false);
});

await test("evaluateEdgeAction: manual_only capability returns allowed=false (relay hard limit)", () => {
  const nodes = listEdgeNodes();
  const shopNode = nodes.find((n) => n.name === "Shop Controller");
  assert.ok(shopNode, "Shop Controller must exist");
  const result = evaluateEdgeAction(shopNode!.id, "shop_relay_control");
  assert.equal(result.allowed, false);
  assert.equal(result.riskTier, "manual_only");
  assert.equal(result.executed, false);
});

await test("evaluateEdgeAction: unknown node returns blocked, executed=false", () => {
  const result = evaluateEdgeAction("non-existent", "any_cap");
  assert.equal(result.allowed, false);
  assert.equal(result.riskTier, "blocked");
  assert.equal(result.executed, false);
});

// ── 8. Health check — no real endpoint ───────────────────────────────────────

await test("checkEdgeNodeHealth returns not_configured when no endpoint set", async () => {
  const nodes = listEdgeNodes();
  const noEndpoint = nodes.find((n) => n.endpoint === "");
  assert.ok(noEndpoint, "must have a node with empty endpoint");
  const result = await checkEdgeNodeHealth(noEndpoint!.id);
  assert.equal(result.health, "not_configured");
  assert.ok(result.message.includes("endpoint"), "must explain missing endpoint");
  assert.equal(result.executed, undefined);  // health result, not action eval
});

await test("checkEdgeNodeHealth for gaming PC skips probe (not always-on)", async () => {
  const nodes = listEdgeNodes();
  const gcNode = nodes.find((n) => n.isGamingPc);
  assert.ok(gcNode, "Gaming PC node must exist");
  const result = await checkEdgeNodeHealth(gcNode!.id);
  assert.equal(result.health, "unknown");
  assert.ok(result.message.toLowerCase().includes("gaming"), "must mention gaming PC");
});

await test("checkEdgeNodeHealth for unknown node returns unknown", async () => {
  const result = await checkEdgeNodeHealth("non-existent-node");
  assert.equal(result.health, "unknown");
});

// ── 9. Gaming PC role description ─────────────────────────────────────────────

await test("getGamingPcRoleDescription has alwaysOn=false and suitable/not-suitable lists", () => {
  const desc = getGamingPcRoleDescription();
  assert.equal((desc as { alwaysOn: boolean }).alwaysOn, false, "gaming PC alwaysOn must be false");
  assert.ok(Array.isArray((desc as { notSuitableFor: unknown[] }).notSuitableFor));
  assert.ok(Array.isArray((desc as { suitableFor: unknown[] }).suitableFor));
  const notFor = (desc as { notSuitableFor: string[] }).notSuitableFor.join(" ");
  assert.ok(notFor.includes("Home Assistant"), "must list HA as not suitable");
});

// ── 10. No secrets/private data in thought logs ───────────────────────────────

import { thoughtLog } from "../src/lib/thought-log.js";

await test("thought log in-memory entries do not contain device tokens, private IPs, or camera data", () => {
  const allEntries = thoughtLog.history(200);
  const edgeLogs = allEntries.filter((l) => l.category === "system" && l.title.includes("Edge Node"));
  assert.ok(edgeLogs.length > 0, "should have edge node log entries in memory ring");

  const logText = edgeLogs.map((l) => [
    l.title, l.message,
    l.metadata ? JSON.stringify(l.metadata) : "",
  ].join(" ")).join("\n");

  // Must NOT contain endpoint URLs or auth tokens
  assert.ok(!logText.includes("http://192"), "must not log raw IP endpoints");
  assert.ok(!logText.includes("Bearer "), "must not log auth tokens");
  assert.ok(!logText.includes("password"), "must not log passwords");

  // metadata must not expose endpoint or authToken fields
  for (const l of edgeLogs) {
    if (l.metadata) {
      assert.ok(!("endpoint" in l.metadata), "metadata must not include endpoint URL");
      assert.ok(!("authToken" in l.metadata), "metadata must not include authToken");
    }
  }
});

// ── 11. deleteEdgeNode ────────────────────────────────────────────────────────

await test("deleteEdgeNode removes a node from the registry", () => {
  const node = upsertEdgeNode({ name: "Temp Node", nodeType: "mini_pc" });
  const before = listEdgeNodes();
  assert.ok(before.some((n) => n.id === node.id));
  const removed = deleteEdgeNode(node.id);
  assert.equal(removed, true);
  const after = listEdgeNodes();
  assert.ok(!after.some((n) => n.id === node.id), "node must be gone");
});

await test("deleteEdgeNode returns false for unknown node", () => {
  const result = deleteEdgeNode("non-existent");
  assert.equal(result, false);
});

// ── 12. HTTP routes ───────────────────────────────────────────────────────────

import express from "express";
import remote from "../src/routes/remote.js";

const app = express();
app.use(express.json());
app.use("/api", remote);

async function apiReq(method: string, path: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  const { createServer } = await import("http");
  const srv = createServer(app);
  await new Promise<void>((res) => srv.listen(0, res));
  const addr = srv.address() as { port: number };
  const url = `http://127.0.0.1:${addr.port}/api${path}`;
  try {
    const r = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => null);
    return { status: r.status, data };
  } finally {
    await new Promise<void>((res) => srv.close(() => res()));
  }
}

await test("GET /api/edge-nodes returns 200 with nodes array", async () => {
  const { status, data } = await apiReq("GET", "/edge-nodes");
  assert.equal(status, 200);
  assert.ok(Array.isArray((data as { nodes: unknown[] }).nodes), "nodes must be array");
  assert.ok(typeof (data as { count: number }).count === "number");
});

await test("POST /api/edge-nodes registers a node (201)", async () => {
  const { status, data } = await apiReq("POST", "/edge-nodes", {
    name: "HTTP Test Node",
    nodeType: "mini_pc",
    roles: ["worker_node"],
  });
  assert.equal(status, 201);
  const profile = (data as { profile: { name: string; alwaysOn: boolean } }).profile;
  assert.equal(profile.name, "HTTP Test Node");
});

await test("POST /api/edge-nodes returns 400 when name missing", async () => {
  const { status } = await apiReq("POST", "/edge-nodes", { nodeType: "mini_pc" });
  assert.equal(status, 400);
});

await test("GET /api/edge-nodes/gaming-pc/role returns alwaysOn=false", async () => {
  const { status, data } = await apiReq("GET", "/edge-nodes/gaming-pc/role");
  assert.equal(status, 200);
  assert.equal((data as { alwaysOn: boolean }).alwaysOn, false);
});

await test("GET /api/edge-nodes/source-of-truth returns source text", async () => {
  const { status, data } = await apiReq("GET", "/edge-nodes/source-of-truth");
  assert.equal(status, 200);
  const sot = (data as { sourceOfTruth: string }).sourceOfTruth;
  assert.ok(sot.includes("gaming PC"), "source of truth must mention gaming PC");
});

await test("GET /api/edge-nodes/:id returns 404 for unknown id", async () => {
  const { status } = await apiReq("GET", "/edge-nodes/not-a-real-id");
  assert.equal(status, 404);
});

console.log("\n✓ All Phase 14A edge-node tests passed\n");
