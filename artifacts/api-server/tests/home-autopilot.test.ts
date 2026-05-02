/**
 * HOME AUTOPILOT — Phase 14B Tests
 * ==================================
 * Covers:
 *   - HOME_AUTOPILOT_SOURCE_OF_TRUTH documents hard limits
 *   - missing HA reports not_configured
 *   - missing MQTT reports not_configured
 *   - missing robot vacuum / Valetudo reports not_configured
 *   - missing Frigate / camera reports not_configured
 *   - unknown HA entities are blocked (not in allowlist)
 *   - unknown MQTT topics are blocked
 *   - garage door action requires approval (hard limit)
 *   - lock/unlock action requires approval (hard limit)
 *   - compressor start is manual_only (hard limit)
 *   - camera frame_capture is permanently blocked (hard limit)
 *   - robot vacuum clean_zone requires approval (hard limit)
 *   - HA read_state on allowlisted entity returns allowed/read_only
 *   - MQTT allowlisted topic returns allowed
 *   - device status_read returns allowed/read_only
 *   - executed=false on all evaluated actions
 *   - no tokens/credentials/camera frames in thought logs
 *   - no real home/shop/device API calls during tests
 *   - HTTP routes work without real devices
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
// Clean up from any prior run
try { sqlite.prepare("DELETE FROM ha_profiles").run(); }       catch { /* table may not exist yet */ }
try { sqlite.prepare("DELETE FROM mqtt_profiles").run(); }      catch { /* table may not exist yet */ }
try { sqlite.prepare("DELETE FROM home_device_profiles").run(); } catch { /* table may not exist yet */ }

async function test(label: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (err) {
    console.error(`  ✗ ${label}`);
    throw err;
  }
}

console.log("\nPhase 14B — Home Autopilot tests\n");

import {
  HOME_AUTOPILOT_SOURCE_OF_TRUTH,
  getHomeAutopilotStatus,
  getDefaultHaProfile,
  upsertHaProfile,
  getDefaultMqttProfile,
  upsertMqttProfile,
  listHomeDevices,
  upsertHomeDevice,
  evaluateHaAction,
  evaluateMqttPublish,
  evaluateDeviceAction,
} from "../src/lib/home-autopilot.js";

// ── 1. Source of truth ────────────────────────────────────────────────────────

await test("HOME_AUTOPILOT_SOURCE_OF_TRUTH documents hard limits", () => {
  assert.ok(HOME_AUTOPILOT_SOURCE_OF_TRUTH.includes("Hard limits"), "must document hard limits");
  assert.ok(HOME_AUTOPILOT_SOURCE_OF_TRUTH.includes("executed=false"), "must document no execution");
  assert.ok(HOME_AUTOPILOT_SOURCE_OF_TRUTH.includes("not_configured"), "must document not_configured");
  assert.ok(HOME_AUTOPILOT_SOURCE_OF_TRUTH.includes("allowlist"), "must document entity allowlist requirement");
  assert.ok(HOME_AUTOPILOT_SOURCE_OF_TRUTH.includes("never log"), "must document no secret logging");
  assert.ok(HOME_AUTOPILOT_SOURCE_OF_TRUTH.includes("camera_frame"), "must document camera blocking");
});

// ── 2. Missing providers → not_configured ─────────────────────────────────────

await test("status returns not_configured when nothing is configured", () => {
  const status = getHomeAutopilotStatus();
  assert.equal(status.haConfigured, false, "HA must be not configured");
  assert.equal(status.mqttConfigured, false, "MQTT must be not configured");
  assert.equal(status.robotVacuumConfigured, false, "robot vacuum must be not configured");
  assert.equal(status.cameraConfigured, false, "camera must be not configured");
  assert.equal(status.devicesConfigured, 0);
  assert.equal(status.shopDevicesConfigured, 0);
});

await test("missing HA profile returns null (not_configured)", () => {
  const profile = getDefaultHaProfile();
  assert.equal(profile, null, "no HA profile should exist yet");
});

await test("missing MQTT profile returns null (not_configured)", () => {
  const profile = getDefaultMqttProfile();
  assert.equal(profile, null, "no MQTT profile should exist yet");
});

await test("missing robot vacuum device returns empty list", () => {
  const devices = listHomeDevices();
  const vac = devices.find((d) => d.deviceType === "robot_vacuum");
  assert.equal(vac, undefined, "no robot vacuum should be registered");
});

await test("missing camera device returns no camera in list", () => {
  const devices = listHomeDevices();
  const cam = devices.find((d) => d.deviceType === "camera_nvr");
  assert.equal(cam, undefined, "no camera should be registered");
});

// ── 3. evaluateHaAction — no profile / unknown entity ─────────────────────────

await test("evaluateHaAction: no profile returns blocked, executed=false", () => {
  const result = evaluateHaAction("non-existent-profile", "light.living_room", "turn_on");
  assert.equal(result.allowed, false);
  assert.equal(result.riskTier, "blocked");
  assert.equal(result.requiresApproval, false);
  assert.equal(result.executed, false);
});

// Register a configured HA profile with one allowlisted entity
const haProfile = upsertHaProfile({
  name: "Home HA",
  endpoint: "",  // no real endpoint in test
  configured: true,
  entityAllowlist: [
    { entityId: "light.kitchen", friendlyName: "Kitchen Light", controlRiskTier: "approval_required", enabled: true },
    { entityId: "sensor.temp", friendlyName: "Temp Sensor", controlRiskTier: "read_only", enabled: true },
  ],
});

await test("upsertHaProfile creates configured HA profile", () => {
  assert.equal(haProfile.configured, true);
  assert.equal(haProfile.entityAllowlist.length, 2);
});

await test("evaluateHaAction: unknown entity (not in allowlist) returns blocked", () => {
  const result = evaluateHaAction(haProfile.id, "switch.not_in_list", "turn_on");
  assert.equal(result.allowed, false);
  assert.equal(result.riskTier, "blocked");
  assert.ok(result.message.includes("allowlist"), "must explain allowlist block");
  assert.equal(result.executed, false);
});

await test("evaluateHaAction: read_state on allowlisted entity returns read_only", () => {
  const result = evaluateHaAction(haProfile.id, "light.kitchen", "read_state");
  assert.equal(result.allowed, true);
  assert.equal(result.riskTier, "read_only");
  assert.equal(result.requiresApproval, false);
  assert.equal(result.executed, false);
});

await test("evaluateHaAction: entity control returns allowlist-defined risk tier", () => {
  const result = evaluateHaAction(haProfile.id, "light.kitchen", "turn_on");
  // light.kitchen has controlRiskTier: "approval_required"
  assert.equal(result.allowed, false);
  assert.equal(result.riskTier, "approval_required");
  assert.equal(result.requiresApproval, true);
  assert.equal(result.executed, false);
});

// ── 4. Hard limits on HA actions ──────────────────────────────────────────────

await test("evaluateHaAction: garage_door_open requires approval (hard limit)", () => {
  const result = evaluateHaAction(haProfile.id, "light.kitchen", "garage_door_open");
  assert.equal(result.allowed, false);
  assert.equal(result.riskTier, "approval_required");
  assert.equal(result.requiresApproval, true);
  assert.equal(result.executed, false);
});

await test("evaluateHaAction: lock_unlock requires approval (hard limit)", () => {
  const result = evaluateHaAction(haProfile.id, "light.kitchen", "lock_unlock");
  assert.equal(result.allowed, false);
  assert.equal(result.riskTier, "approval_required");
  assert.equal(result.requiresApproval, true);
  assert.equal(result.executed, false);
});

await test("evaluateHaAction: camera_frame_capture is permanently blocked", () => {
  const result = evaluateHaAction(haProfile.id, "light.kitchen", "camera_frame_capture");
  assert.equal(result.allowed, false);
  assert.equal(result.riskTier, "blocked");
  assert.equal(result.requiresApproval, false);
  assert.equal(result.executed, false);
});

// ── 5. MQTT profile and evaluation ───────────────────────────────────────────

await test("evaluateMqttPublish: no MQTT profile returns blocked", () => {
  const result = evaluateMqttPublish("", "home/light/set");
  assert.equal(result.allowed, false);
  assert.equal(result.riskTier, "blocked");
  assert.equal(result.executed, false);
});

// Register a configured MQTT profile
const mqttProfile = upsertMqttProfile({
  name: "Home MQTT",
  brokerHost: "",  // no real host in test
  configured: true,
  topicAllowlist: [
    { topic: "home/sensors/#", description: "Sensor readings", publishRiskTier: "read_only", subscribeAllowed: true },
    { topic: "home/light/set", description: "Light control", publishRiskTier: "approval_required", subscribeAllowed: true },
    { topic: "home/status", description: "Status reads", publishRiskTier: "dry_run", subscribeAllowed: true },
  ],
});

await test("upsertMqttProfile creates configured MQTT profile", () => {
  assert.equal(mqttProfile.configured, true);
  assert.equal(mqttProfile.topicAllowlist.length, 3);
});

await test("evaluateMqttPublish: unknown topic (not in allowlist) returns blocked", () => {
  const result = evaluateMqttPublish(mqttProfile.id, "unknown/topic/not/listed");
  assert.equal(result.allowed, false);
  assert.equal(result.riskTier, "blocked");
  assert.ok(result.message.includes("allowlist"), "must explain allowlist block");
  assert.equal(result.executed, false);
});

await test("evaluateMqttPublish: allowlisted topic with read_only tier returns allowed", () => {
  const result = evaluateMqttPublish(mqttProfile.id, "home/sensors/temp");
  // matches "home/sensors/#" wildcard
  assert.equal(result.allowed, true);
  assert.equal(result.riskTier, "read_only");
  assert.equal(result.requiresApproval, false);
  assert.equal(result.executed, false);
});

await test("evaluateMqttPublish: approval_required topic returns requiresApproval=true", () => {
  const result = evaluateMqttPublish(mqttProfile.id, "home/light/set");
  assert.equal(result.allowed, false);
  assert.equal(result.riskTier, "approval_required");
  assert.equal(result.requiresApproval, true);
  assert.equal(result.executed, false);
});

// ── 6. Device profiles and evaluation ────────────────────────────────────────

await test("evaluateDeviceAction: unknown device returns blocked", () => {
  const result = evaluateDeviceAction("non-existent-device", "start");
  assert.equal(result.allowed, false);
  assert.equal(result.riskTier, "blocked");
  assert.equal(result.executed, false);
});

// Register devices using default policies
const garageDoor = upsertHomeDevice({ name: "Garage Door", deviceType: "garage_door", provider: "home_assistant", configured: true });
const compressor  = upsertHomeDevice({ name: "Shop Compressor", deviceType: "compressor", provider: "home_assistant", configured: true });
const camera      = upsertHomeDevice({ name: "Shop Camera", deviceType: "camera_nvr", provider: "frigate", configured: true });
const robotVac    = upsertHomeDevice({ name: "Valetudo Vac", deviceType: "robot_vacuum", provider: "valetudo", configured: true });
const shopLight   = upsertHomeDevice({ name: "Shop Light", deviceType: "shop_light", provider: "home_assistant", configured: true });

await test("garage_door device: open action requires approval (hard limit)", () => {
  const result = evaluateDeviceAction(garageDoor.id, "open");
  assert.equal(result.allowed, false);
  assert.equal(result.riskTier, "approval_required");
  assert.equal(result.requiresApproval, true);
  assert.equal(result.executed, false);
});

await test("garage_door device: status_read is allowed/read_only", () => {
  const result = evaluateDeviceAction(garageDoor.id, "status_read");
  assert.equal(result.allowed, true);
  assert.equal(result.riskTier, "read_only");
  assert.equal(result.requiresApproval, false);
  assert.equal(result.executed, false);
});

await test("compressor device: start is manual_only (hard limit)", () => {
  const result = evaluateDeviceAction(compressor.id, "start");
  assert.equal(result.allowed, false);
  assert.equal(result.riskTier, "manual_only");
  assert.equal(result.requiresApproval, false);
  assert.equal(result.executed, false);
});

await test("camera_nvr device: frame_capture is permanently blocked (hard limit)", () => {
  const result = evaluateDeviceAction(camera.id, "frame_capture");
  assert.equal(result.allowed, false);
  assert.equal(result.riskTier, "blocked");
  assert.equal(result.requiresApproval, false);
  assert.equal(result.executed, false);
});

await test("camera_nvr device: events_read is allowed/read_only", () => {
  const result = evaluateDeviceAction(camera.id, "events_read");
  assert.equal(result.allowed, true);
  assert.equal(result.riskTier, "read_only");
  assert.equal(result.executed, false);
});

await test("robot vacuum device: clean_zone requires approval (hard limit)", () => {
  const result = evaluateDeviceAction(robotVac.id, "vacuum_clean_zone");
  assert.equal(result.allowed, false);
  assert.equal(result.riskTier, "approval_required");
  assert.equal(result.requiresApproval, true);
  assert.equal(result.executed, false);
});

await test("robot vacuum device: status_read is allowed/read_only", () => {
  const result = evaluateDeviceAction(robotVac.id, "status_read");
  assert.equal(result.allowed, true);
  assert.equal(result.riskTier, "read_only");
  assert.equal(result.executed, false);
});

await test("shop_light device: status_read is allowed/read_only", () => {
  const result = evaluateDeviceAction(shopLight.id, "status_read");
  assert.equal(result.allowed, true);
  assert.equal(result.riskTier, "read_only");
  assert.equal(result.executed, false);
});

// ── 7. Status after devices registered ────────────────────────────────────────

await test("status reflects configured devices", () => {
  const status = getHomeAutopilotStatus();
  assert.equal(status.haConfigured, true, "HA must be configured");
  assert.equal(status.mqttConfigured, true, "MQTT must be configured");
  assert.equal(status.robotVacuumConfigured, true, "robot vacuum must be configured");
  assert.equal(status.cameraConfigured, true, "camera must be configured");
  assert.ok(status.devicesConfigured >= 5, `expected >= 5 configured devices, got ${status.devicesConfigured}`);
});

// ── 8. Privacy: no tokens/credentials in thought logs ────────────────────────

import { thoughtLog } from "../src/lib/thought-log.js";

await test("thought log entries do not contain tokens, credentials, or camera frames", () => {
  const allEntries = thoughtLog.history(200);
  const haLogs = allEntries.filter((l) => l.category === "system" &&
    (l.title.includes("HA") || l.title.includes("MQTT") || l.title.includes("Home Device")));

  assert.ok(haLogs.length > 0, "should have home autopilot log entries");

  const logText = haLogs.map((l) => [
    l.title, l.message,
    l.metadata ? JSON.stringify(l.metadata) : "",
  ].join(" ")).join("\n");

  // Must NOT contain sensitive fields
  assert.ok(!logText.includes("Bearer "),   "must not log auth tokens");
  assert.ok(!logText.includes("password"),  "must not log passwords");
  assert.ok(!logText.includes("http://192"), "must not log raw private IP endpoints");

  // metadata must not expose endpoint or authToken
  for (const l of haLogs) {
    if (l.metadata) {
      assert.ok(!("endpoint" in l.metadata),   "metadata must not include endpoint URL");
      assert.ok(!("authToken" in l.metadata),  "metadata must not include authToken");
      assert.ok(!("token" in l.metadata),      "metadata must not include token");
      assert.ok(!("credentials" in l.metadata),"metadata must not include credentials");
    }
  }
});

// ── 9. HTTP routes ─────────────────────────────────────────────────────────────

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

await test("GET /api/home-autopilot/source-of-truth returns source text", async () => {
  const { status, data } = await apiReq("GET", "/home-autopilot/source-of-truth");
  assert.equal(status, 200);
  const sot = (data as { sourceOfTruth: string }).sourceOfTruth;
  assert.ok(sot.includes("Hard limits"), "source of truth must document hard limits");
});

await test("GET /api/home-autopilot/status returns status object", async () => {
  const { status, data } = await apiReq("GET", "/home-autopilot/status");
  assert.equal(status, 200);
  assert.equal(typeof (data as { haConfigured: boolean }).haConfigured, "boolean");
  assert.equal(typeof (data as { mqttConfigured: boolean }).mqttConfigured, "boolean");
});

await test("GET /api/home-autopilot/ha/profile returns profile", async () => {
  const { status, data } = await apiReq("GET", "/home-autopilot/ha/profile");
  assert.equal(status, 200);
  // profile was already created above
  assert.ok((data as { profile: unknown }).profile !== null);
});

await test("GET /api/home-autopilot/mqtt/profile returns profile", async () => {
  const { status, data } = await apiReq("GET", "/home-autopilot/mqtt/profile");
  assert.equal(status, 200);
  assert.ok((data as { profile: unknown }).profile !== null);
});

await test("GET /api/home-autopilot/devices returns devices array", async () => {
  const { status, data } = await apiReq("GET", "/home-autopilot/devices");
  assert.equal(status, 200);
  assert.ok(Array.isArray((data as { devices: unknown[] }).devices));
  assert.ok((data as { count: number }).count >= 5);
});

await test("POST /api/home-autopilot/devices returns 400 when name missing", async () => {
  const { status } = await apiReq("POST", "/home-autopilot/devices", { deviceType: "sensor" });
  assert.equal(status, 400);
});

await test("POST /api/home-autopilot/devices registers device (201)", async () => {
  const { status, data } = await apiReq("POST", "/home-autopilot/devices", {
    name: "HTTP Test Sensor",
    deviceType: "sensor",
    provider: "home_assistant",
  });
  assert.equal(status, 201);
  const device = (data as { device: { name: string } }).device;
  assert.equal(device.name, "HTTP Test Sensor");
});

await test("GET /api/home-autopilot/devices/:id returns 404 for unknown device", async () => {
  const { status } = await apiReq("GET", "/home-autopilot/devices/non-existent-device-xyz");
  assert.equal(status, 404);
});

await test("POST /api/home-autopilot/devices/:id/action/evaluate: camera_frame_capture blocked (202 not returned for blocked)", async () => {
  const { status: s2, data: d2 } = await apiReq("GET", "/home-autopilot/devices");
  const devices = (d2 as { devices: Array<{ id: string; deviceType: string }> }).devices;
  const cam = devices.find((d) => d.deviceType === "camera_nvr");
  assert.ok(cam, "camera device must exist");
  const { status, data } = await apiReq("POST", `/home-autopilot/devices/${cam!.id}/action/evaluate`, {
    action: "frame_capture",
  });
  // blocked returns 200 (not 202 approval_required)
  assert.equal(status, 200);
  const result = (data as { result: { allowed: boolean; riskTier: string; executed: boolean } }).result;
  assert.equal(result.allowed, false);
  assert.equal(result.riskTier, "blocked");
  assert.equal(result.executed, false);
  void s2; // suppress unused warning
});

await test("POST /api/home-autopilot/mqtt/topics/evaluate: unknown topic blocked", async () => {
  const { status } = await apiReq("POST", "/home-autopilot/mqtt/topics/evaluate", { topic: "evil/unknown/topic" });
  assert.equal(status, 200);  // blocked = 200, not 202
});

await test("POST /api/home-autopilot/mqtt/topics/evaluate: returns 400 when topic missing", async () => {
  const { status } = await apiReq("POST", "/home-autopilot/mqtt/topics/evaluate", {});
  assert.equal(status, 400);
});

console.log("\n✓ All Phase 14B home-autopilot tests passed\n");
