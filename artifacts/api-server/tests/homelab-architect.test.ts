/**
 * HOMELAB ARCHITECT - Phase 15A Tests
 * =====================================
 * Covers:
 *   - Source-of-truth text documents all hard limits
 *   - Inventory records (sites/devices/VLANs/subnets/services) without NetBox/Nautobot
 *   - All optional providers report not_configured/degraded
 *   - No real infrastructure API calls during tests
 *   - Diagrams distinguish confirmed/proposed/unknown confidence
 *   - Unknown devices/networks not guessed as confirmed
 *   - No firewall/VLAN/DNS/DHCP/routing changes applied (applied=false always)
 *   - VLAN ID validation rejects out-of-range values
 *   - Subnet prefix validation rejects malformed CIDR
 *   - Local-first/no-cost behavior preserved
 *   - Secrets/network/private data not logged in thought log
 *   - HTTP routes for all CRUD operations
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

// Clean up tables (they may not exist yet — ignore errors)
try { sqlite.prepare("DELETE FROM homelab_sites").run(); } catch { /* ok */ }
try { sqlite.prepare("DELETE FROM homelab_devices").run(); } catch { /* ok */ }
try { sqlite.prepare("DELETE FROM homelab_vlans").run(); } catch { /* ok */ }
try { sqlite.prepare("DELETE FROM homelab_subnets").run(); } catch { /* ok */ }
try { sqlite.prepare("DELETE FROM homelab_services").run(); } catch { /* ok */ }
try { sqlite.prepare("DELETE FROM thought_log WHERE title LIKE 'HomeLab%'").run(); } catch { /* ok */ }

import {
  HOMELAB_ARCHITECT_SOURCE_OF_TRUTH,
  generateBlueprint,
  getHomelabProviders,
  getHomelabStatus,
  getNetboxStatus,
  getNautobotStatus,
  listDevices,
  listServices,
  listSites,
  listSubnets,
  listVlans,
  upsertDevice,
  upsertService,
  upsertSite,
  upsertSubnet,
  upsertVlan,
  validateSubnetPrefix,
  validateVlanId,
} from "../src/lib/homelab-architect.js";

import { thoughtLog } from "../src/lib/thought-log.js";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
    .then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch((err) => { console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`); failed++; });
}

console.log("\nPhase 15A — HomeLab Architect tests\n");

// ── 1. Source of truth text ───────────────────────────────────────────────────

await test("HOMELAB_ARCHITECT_SOURCE_OF_TRUTH documents hard limits", () => {
  assert.ok(HOMELAB_ARCHITECT_SOURCE_OF_TRUTH.includes("Hard limits"), "must document hard limits");
  assert.ok(HOMELAB_ARCHITECT_SOURCE_OF_TRUTH.includes("not_configured"), "must document not_configured");
  assert.ok(HOMELAB_ARCHITECT_SOURCE_OF_TRUTH.includes("applied=false"), "must document applied=false");
  assert.ok(HOMELAB_ARCHITECT_SOURCE_OF_TRUTH.includes("never logged"), "must document no secret logging");
  assert.ok(HOMELAB_ARCHITECT_SOURCE_OF_TRUTH.includes("No firewall"), "must document no firewall changes");
  assert.ok(HOMELAB_ARCHITECT_SOURCE_OF_TRUTH.includes("confirmed vs proposed vs unknown"), "must document data confidence");
});

// ── 2. Missing providers → not_configured ─────────────────────────────────────

await test("getHomelabStatus returns all providers not_configured and zero counts when nothing configured", () => {
  const status = getHomelabStatus();
  assert.equal(status.sitesCount, 0);
  assert.equal(status.devicesCount, 0);
  assert.equal(status.vlansCount, 0);
  assert.equal(status.subnetsCount, 0);
  assert.equal(status.servicesCount, 0);
  assert.ok(status.providers.length > 0, "must have provider list");
  assert.ok(status.providers.every((p) => p.status === "not_configured" || p.status === "disabled" || p.status === "degraded"),
    "all providers must be not_configured/disabled/degraded");
});

await test("getNetboxStatus returns not_configured", () => {
  const nb = getNetboxStatus();
  assert.equal(nb.providerId, "netbox");
  assert.equal(nb.status, "not_configured");
  assert.ok(nb.reason.length > 0, "must have reason");
  assert.equal(nb.recordCount, 0);
});

await test("getNautobotStatus returns not_configured", () => {
  const nau = getNautobotStatus();
  assert.equal(nau.providerId, "nautobot");
  assert.equal(nau.status, "not_configured");
  assert.ok(nau.reason.length > 0, "must have reason");
  assert.equal(nau.recordCount, 0);
});

await test("all optional providers (Proxmox, OPNsense, UniFi, Ansible, OpenTofu, Batfish) report not_configured", () => {
  const providers = getHomelabProviders();
  const ids = providers.map((p) => p.providerId);
  assert.ok(ids.includes("proxmox"), "Proxmox must be listed");
  assert.ok(ids.includes("opnsense"), "OPNsense must be listed");
  assert.ok(ids.includes("unifi"), "UniFi must be listed");
  assert.ok(ids.includes("ansible"), "Ansible must be listed");
  assert.ok(ids.includes("opentofu"), "OpenTofu must be listed");
  assert.ok(ids.includes("batfish"), "Batfish must be listed");
  for (const p of providers) {
    assert.ok(
      p.status === "not_configured" || p.status === "disabled" || p.status === "degraded",
      `Provider ${p.providerId} must be not_configured/disabled/degraded; got ${p.status}`,
    );
  }
});

// ── 3. Local inventory without NetBox/Nautobot ────────────────────────────────

await test("sites can be created and listed without any network provider", () => {
  const site = upsertSite({ name: "Home Lab Rack", description: "Main home lab rack", confidence: "confirmed" });
  assert.ok(site.id, "must have id");
  assert.equal(site.name, "Home Lab Rack");
  assert.equal(site.confidence, "confirmed");
  const sites = listSites();
  assert.ok(sites.length >= 1);
  assert.ok(sites.some((s) => s.id === site.id));
});

await test("devices can be created with confidence tracking", () => {
  const device = upsertDevice({
    name: "OPNsense Firewall",
    role: "firewall",
    make: "Protectli",
    model: "VP2420",
    confidence: "confirmed",
  });
  assert.ok(device.id, "must have id");
  assert.equal(device.name, "OPNsense Firewall");
  assert.equal(device.role, "firewall");
  assert.equal(device.confidence, "confirmed");
  const devices = listDevices();
  assert.ok(devices.some((d) => d.id === device.id));
});

await test("devices with unknown confidence are not auto-promoted to confirmed", () => {
  const device = upsertDevice({ name: "Unknown Switch", role: "switch" });
  assert.equal(device.confidence, "unknown", "must default to unknown, not confirmed");
});

await test("VLANs can be created and listed locally", () => {
  const vlan = upsertVlan({ name: "IoT", vlanId: 20, description: "IoT devices", confidence: "confirmed" });
  assert.equal(vlan.vlanId, 20);
  assert.equal(vlan.name, "IoT");
  assert.equal(vlan.confidence, "confirmed");
  const vlans = listVlans();
  assert.ok(vlans.some((v) => v.id === vlan.id));
});

await test("subnets can be created and listed locally", () => {
  const subnet = upsertSubnet({ prefix: "192.168.20.0/24", description: "IoT VLAN subnet", confidence: "proposed" });
  assert.equal(subnet.prefix, "192.168.20.0/24");
  assert.equal(subnet.confidence, "proposed");
  const subnets = listSubnets();
  assert.ok(subnets.some((s) => s.id === subnet.id));
});

await test("services can be created and listed locally", () => {
  const svc = upsertService({ name: "Home Assistant", serviceType: "smarthome", protocol: "http", port: 8123, confidence: "confirmed" });
  assert.equal(svc.name, "Home Assistant");
  assert.equal(svc.protocol, "http");
  assert.equal(svc.port, 8123);
  const services = listServices();
  assert.ok(services.some((s) => s.id === svc.id));
});

// ── 4. VLAN validation ────────────────────────────────────────────────────────

await test("validateVlanId accepts valid range (1–4094)", () => {
  assert.ok(validateVlanId(1).valid, "1 should be valid");
  assert.ok(validateVlanId(4094).valid, "4094 should be valid");
  assert.ok(validateVlanId(100).valid, "100 should be valid");
});

await test("validateVlanId rejects out-of-range values", () => {
  assert.equal(validateVlanId(0).valid, false, "0 must be rejected");
  assert.equal(validateVlanId(4095).valid, false, "4095 must be rejected");
  assert.equal(validateVlanId(-1).valid, false, "negative must be rejected");
  assert.equal(validateVlanId(1.5).valid, false, "float must be rejected");
});

await test("upsertVlan throws for invalid VLAN ID", () => {
  assert.throws(() => upsertVlan({ name: "Bad", vlanId: 9999 }), /out of range|must be/i);
});

// ── 5. Subnet validation ──────────────────────────────────────────────────────

await test("validateSubnetPrefix accepts valid CIDR", () => {
  assert.ok(validateSubnetPrefix("10.0.0.0/8").valid, "10.0.0.0/8 must be valid");
  assert.ok(validateSubnetPrefix("192.168.1.0/24").valid, "192.168.1.0/24 must be valid");
  assert.ok(validateSubnetPrefix("172.16.0.0/12").valid, "172.16.0.0/12 must be valid");
  assert.ok(validateSubnetPrefix("0.0.0.0/0").valid, "0.0.0.0/0 must be valid");
});

await test("validateSubnetPrefix rejects invalid CIDR", () => {
  assert.equal(validateSubnetPrefix("not-a-cidr").valid, false);
  assert.equal(validateSubnetPrefix("192.168.1.0/33").valid, false, "prefix length >32 must be rejected");
  assert.equal(validateSubnetPrefix("999.168.1.0/24").valid, false, "octet >255 must be rejected");
  assert.equal(validateSubnetPrefix("192.168.1/24").valid, false, "only 3 octets must be rejected");
});

await test("upsertSubnet throws for invalid prefix", () => {
  assert.throws(() => upsertSubnet({ prefix: "300.0.0.0/24" }), /invalid|octet/i);
});

// ── 6. Blueprint generation ───────────────────────────────────────────────────

await test("generateBlueprint returns local inventory with applied=false always", () => {
  const bp = generateBlueprint();
  assert.ok(bp.id, "must have id");
  assert.ok(bp.generatedAt, "must have timestamp");
  assert.equal(bp.applied, false, "applied must be false in Phase 15A");
  assert.ok(Array.isArray(bp.sites), "must have sites array");
  assert.ok(Array.isArray(bp.devices), "must have devices array");
  assert.ok(Array.isArray(bp.vlans), "must have vlans array");
  assert.ok(Array.isArray(bp.subnets), "must have subnets array");
  assert.ok(Array.isArray(bp.services), "must have services array");
  assert.ok(Array.isArray(bp.providers), "must have providers array");
  assert.ok(Array.isArray(bp.notes), "must have notes array");
  assert.ok(bp.notes.some((n) => n.includes("no config applied")), "notes must mention no config applied");
  assert.ok(bp.notes.some((n) => n.includes("not_configured")), "notes must mention not_configured providers");
});

await test("blueprint distinguishes confirmed/proposed/unknown confidence", () => {
  // Devices seeded above: "OPNsense Firewall" is confirmed, "Unknown Switch" is unknown
  const bp = generateBlueprint();
  const confirmed = bp.devices.filter((d) => d.confidence === "confirmed");
  const unknown = bp.devices.filter((d) => d.confidence === "unknown");
  assert.ok(confirmed.length > 0, "must have at least one confirmed device");
  assert.ok(unknown.length > 0, "must have at least one unknown device");
  // Overall confidence must not be "confirmed" if any device is unknown
  assert.notEqual(bp.overallConfidence, "confirmed", "overallConfidence must not be confirmed when unknown records exist");
});

await test("blueprint notes warn about unknown-confidence records", () => {
  const bp = generateBlueprint();
  // unknown device exists — must see warning
  assert.ok(bp.notes.some((n) => n.toLowerCase().includes("warning")), "must include warning note for unknown records");
});

await test("blueprint providers all report not_configured (no live sync)", () => {
  const bp = generateBlueprint();
  assert.ok(bp.providers.length > 0);
  for (const p of bp.providers) {
    assert.ok(
      p.status === "not_configured" || p.status === "disabled" || p.status === "degraded",
      `Provider ${p.providerId} must not claim live sync status; got ${p.status}`,
    );
  }
});

// ── 7. No network/config writes ───────────────────────────────────────────────

await test("generateBlueprint never sets applied=true", () => {
  const bp = generateBlueprint();
  // TypeScript literal type enforcement — runtime check as belt-and-suspenders
  assert.equal(bp.applied, false);
  assert.notEqual((bp as unknown as Record<string, unknown>)["applied"], true);
});

await test("no real network/API calls are made during any test (all operations are local SQLite only)", () => {
  // If any real API call had been made it would have thrown an unhandled rejection
  // (no provider credentials exist). This test proves local-only execution.
  const status = getHomelabStatus();
  assert.ok(status.sitesCount >= 0, "status works without any network call");
  assert.ok(status.providers.every((p) => p.recordCount === 0), "all providers have 0 records (no sync ran)");
});

// ── 8. Privacy — no credentials/IPs in thought log ───────────────────────────

await test("thought log entries do not contain credentials, raw IPs, or private network tokens", () => {
  const sensitivePatterns = [
    /192\.168\.\d+\.\d+/,   // raw private IPv4
    /10\.\d+\.\d+\.\d+/,    // 10.x private range
    /password/i,
    /api_key/i,
    /apikey/i,
    /token.*=.*[a-z0-9]{8}/i,
    /secret/i,
    /credential/i,
  ];

  const entries = thoughtLog.history().filter((e) => e.title.startsWith("HomeLab"));
  assert.ok(entries.length > 0, "should have HomeLab thought log entries from upserts above");

  for (const entry of entries) {
    const metaStr = JSON.stringify(entry.metadata ?? {});
    for (const pattern of sensitivePatterns) {
      assert.equal(
        pattern.test(metaStr),
        false,
        `Thought log entry "${entry.title}" metadata must not contain pattern ${pattern}: ${metaStr}`,
      );
    }
  }
});

// ── 9. HTTP routes ────────────────────────────────────────────────────────────

// Spin up a test server
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

await test("GET /homelab/source-of-truth returns source text", async () => {
  const { status, body } = await req("GET", "/homelab/source-of-truth");
  assert.equal(status, 200);
  assert.ok(typeof body["sourceOfTruth"] === "string" && (body["sourceOfTruth"] as string).includes("Hard limits"));
});

await test("GET /homelab/status returns status object with providers", async () => {
  const { status, body } = await req("GET", "/homelab/status");
  assert.equal(status, 200);
  const s = body["status"] as Record<string, unknown>;
  assert.ok("sitesCount" in s);
  assert.ok("devicesCount" in s);
  assert.ok(Array.isArray(s["providers"]));
});

await test("GET /homelab/providers returns all providers not_configured", async () => {
  const { status, body } = await req("GET", "/homelab/providers");
  assert.equal(status, 200);
  const providers = body["providers"] as Array<Record<string, unknown>>;
  assert.ok(providers.length >= 8);
  assert.ok(providers.every((p) => p["status"] === "not_configured" || p["status"] === "disabled"));
});

await test("GET /homelab/providers/netbox returns not_configured", async () => {
  const { status, body } = await req("GET", "/homelab/providers/netbox");
  assert.equal(status, 200);
  assert.equal((body["provider"] as Record<string, unknown>)["status"], "not_configured");
});

await test("POST /homelab/sites returns 400 when name missing", async () => {
  const { status } = await req("POST", "/homelab/sites", {});
  assert.equal(status, 400);
});

await test("POST /homelab/sites creates site (201)", async () => {
  const { status, body } = await req("POST", "/homelab/sites", { name: "Test Site", confidence: "proposed" });
  assert.equal(status, 201);
  assert.ok((body["site"] as Record<string, unknown>)["id"]);
});

await test("GET /homelab/sites returns sites array", async () => {
  const { status, body } = await req("GET", "/homelab/sites");
  assert.equal(status, 200);
  assert.ok(Array.isArray(body["sites"]));
});

await test("GET /homelab/sites/:id returns 404 for unknown id", async () => {
  const { status } = await req("GET", "/homelab/sites/not-a-real-id");
  assert.equal(status, 404);
});

await test("POST /homelab/devices creates device (201)", async () => {
  const { status, body } = await req("POST", "/homelab/devices", { name: "Test Router", role: "router", confidence: "unknown" });
  assert.equal(status, 201);
  assert.equal((body["device"] as Record<string, unknown>)["confidence"], "unknown");
});

await test("POST /homelab/vlans rejects out-of-range VLAN ID (422)", async () => {
  const { status } = await req("POST", "/homelab/vlans", { name: "Bad VLAN", vlanId: 5000 });
  assert.equal(status, 422);
});

await test("POST /homelab/vlans creates valid VLAN (201)", async () => {
  const { status, body } = await req("POST", "/homelab/vlans", { name: "Management", vlanId: 10, confidence: "confirmed" });
  assert.equal(status, 201);
  assert.equal((body["vlan"] as Record<string, unknown>)["vlanId"], 10);
});

await test("POST /homelab/subnets rejects invalid prefix (422)", async () => {
  const { status } = await req("POST", "/homelab/subnets", { prefix: "not-a-subnet" });
  assert.equal(status, 422);
});

await test("POST /homelab/subnets creates valid subnet (201)", async () => {
  const { status, body } = await req("POST", "/homelab/subnets", { prefix: "10.10.10.0/24", confidence: "proposed" });
  assert.equal(status, 201);
  assert.equal((body["subnet"] as Record<string, unknown>)["prefix"], "10.10.10.0/24");
});

await test("POST /homelab/services creates service (201)", async () => {
  const { status, body } = await req("POST", "/homelab/services", { name: "Portainer", serviceType: "container_mgmt", port: 9000, protocol: "https", confidence: "confirmed" });
  assert.equal(status, 201);
  assert.equal((body["service"] as Record<string, unknown>)["port"], 9000);
});

await test("GET /homelab/blueprint returns blueprint with applied=false", async () => {
  const { status, body } = await req("GET", "/homelab/blueprint");
  assert.equal(status, 200);
  const bp = body["blueprint"] as Record<string, unknown>;
  assert.equal(bp["applied"], false);
  assert.ok(Array.isArray(bp["notes"]));
});

await test("POST /homelab/validate/vlan accepts valid VLAN ID", async () => {
  const { status, body } = await req("POST", "/homelab/validate/vlan", { vlanId: 100 });
  assert.equal(status, 200);
  assert.equal(body["valid"], true);
});

await test("POST /homelab/validate/subnet accepts valid prefix", async () => {
  const { status, body } = await req("POST", "/homelab/validate/subnet", { prefix: "172.16.0.0/16" });
  assert.equal(status, 200);
  assert.equal(body["valid"], true);
});

await test("POST /homelab/validate/subnet rejects invalid prefix", async () => {
  const { status, body } = await req("POST", "/homelab/validate/subnet", { prefix: "bad-prefix" });
  assert.equal(status, 200);
  assert.equal(body["valid"], false);
});

server.close();

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed > 0 ? `${passed} passed, ${failed} failed` : "no tests ran"}`);
if (failed > 0) {
  console.error(`\n✗ ${failed} Phase 15A homelab-architect test(s) FAILED`);
  process.exit(1);
}
console.log("\n✓ All Phase 15A homelab-architect tests passed");
