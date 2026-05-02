import { randomUUID } from "crypto";
import { sqlite } from "../db/database.js";
import { thoughtLog } from "./thought-log.js";

// ── Source of truth ───────────────────────────────────────────────────────────

export const HOME_AUTOPILOT_SOURCE_OF_TRUTH = `
Home Autopilot Source of Truth (Phase 14B)
==========================================
Purpose: Integrate home/shop automation safely without cloud dependency,
gaming-PC-always-on assumptions, or unsupervised physical actions.

Supported integrations (all optional/not_configured by default):
- Home Assistant: local instance REST API (endpoint/token stored by reference only)
- HA MCP: Home Assistant MCP server (disabled until HA configured + explicitly enabled)
- MQTT/Mosquitto: local broker for sensor events and device control
- Valetudo: robot vacuum local API (no cloud; status/map/rooms read-only by default)
- Frigate: NVR/camera detection events (read-only; no frame capture/recordings)
- WLED: addressable LED strip control
- ESPHome: local device firmware API
- Zigbee2MQTT: Zigbee device bridge
- Node-RED: local automation flow engine
- Shop devices: lights, fans, air filters, compressors, garage doors

Hard limits:
- Nothing executes on physical devices in Phase 14B (executed=false always).
- Entity allowlist required before any HA entity control can be proposed.
- Unknown entities (not in allowlist) are blocked regardless of action type.
- Unknown MQTT topics (not in allowlist) are blocked for publish.
- Garage door, lock/unlock, compressor, heater, and relay actions require approval.
- camera_frame_capture, snapshot, and recording changes are permanently blocked.
- Compressor and main shop power are manual_only (physical danger).
- Secrets, tokens, MQTT credentials, camera frames, home layout, and
  user presence data: never log these in audit/thought metadata.
- Missing/unconfigured providers return not_configured, never fake success.
- No cloud smart-home API is required or used.
`;

// ── Types ─────────────────────────────────────────────────────────────────────

export type HomeActionRisk =
  | "read_only"
  | "dry_run"
  | "proposal"
  | "approval_required"
  | "blocked"
  | "manual_only";

export type HomeDeviceType =
  | "robot_vacuum"
  | "camera_nvr"
  | "shop_light"
  | "shop_fan"
  | "air_filter"
  | "compressor"
  | "garage_door"
  | "lock"
  | "smart_plug"
  | "wled_strip"
  | "sensor"
  | "unknown";

export type HomeDeviceProvider =
  | "valetudo"
  | "frigate"
  | "home_assistant"
  | "esphome"
  | "zigbee2mqtt"
  | "node_red"
  | "wled"
  | "unknown";

export interface HaEntityEntry {
  entityId: string;
  friendlyName: string;
  /** Risk tier for controlling this entity (read state is always read_only) */
  controlRiskTier: HomeActionRisk;
  enabled: boolean;
}

export interface HaProfile {
  id: string;
  name: string;
  /** Base URL only — token is never stored in this record */
  endpoint: string;
  haMcpEnabled: boolean;
  haMcpProfile: Record<string, unknown>;
  entityAllowlist: HaEntityEntry[];
  configured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MqttTopicEntry {
  topic: string;
  description: string;
  /** Risk tier for publishing to this topic */
  publishRiskTier: HomeActionRisk;
  subscribeAllowed: boolean;
}

export interface MqttProfile {
  id: string;
  name: string;
  /** Host reference only — credentials are never stored in this record */
  brokerHost: string;
  brokerPort: number;
  topicAllowlist: MqttTopicEntry[];
  configured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HomeDeviceProfile {
  id: string;
  name: string;
  deviceType: HomeDeviceType;
  provider: HomeDeviceProvider;
  /** Endpoint reference only — no credentials */
  endpoint: string;
  configured: boolean;
  actionPolicy: Record<string, HomeActionRisk>;
  createdAt: string;
  updatedAt: string;
}

export interface HomeActionEvalResult {
  allowed: boolean;
  riskTier: HomeActionRisk;
  requiresApproval: boolean;
  message: string;
  /** Always false in Phase 14B — nothing executes on home/shop devices */
  executed: false;
}

export interface HomeAutopilotStatus {
  haConfigured: boolean;
  mqttConfigured: boolean;
  devicesConfigured: number;
  robotVacuumConfigured: boolean;
  cameraConfigured: boolean;
  shopDevicesConfigured: number;
  sourceOfTruth: string;
}

// ── Hard limits ───────────────────────────────────────────────────────────────

/**
 * Actions permanently blocked — no approval can unblock these.
 * Camera privacy: frame capture, snapshots, and recording changes are blocked.
 */
const BLOCKED_HOME_ACTIONS = new Set([
  "camera_frame_capture",
  "camera_recording_start",
  "camera_recording_stop",
  "camera_recording_change",
  "camera_snapshot",
  "stream_access",
  "stream_record",
]);

/**
 * Actions that are manual_only — too physically dangerous for even approval.
 * Must be done by a human at the physical device.
 */
const MANUAL_ONLY_HOME_ACTIONS = new Set([
  "compressor_start",
  "compressor_stop",
  "shop_main_power",
  "electrical_main_breaker",
]);

/**
 * High-risk actions that always require explicit approval regardless of profile config.
 */
const APPROVAL_REQUIRED_HOME_ACTIONS = new Set([
  "garage_door_open",
  "garage_door_close",
  "garage_door_toggle",
  "lock_unlock",
  "door_unlock",
  "lock_lock",
  "heater_on",
  "heater_off",
  "relay_toggle",
  "relay_on",
  "relay_off",
  "alarm_arm",
  "alarm_disarm",
  "alarm_trigger",
  "vacuum_clean_zone",
  "vacuum_start",
  "vacuum_dock",
  "vacuum_pause",
  "wled_scene_change",
  "smart_plug_on",
  "smart_plug_off",
]);

// ── Lazy DDL ──────────────────────────────────────────────────────────────────

export function ensureHomeAutopilotTables(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ha_profiles (
      id                    TEXT PRIMARY KEY,
      name                  TEXT NOT NULL,
      endpoint              TEXT NOT NULL DEFAULT '',
      ha_mcp_enabled        INTEGER NOT NULL DEFAULT 0,
      ha_mcp_profile_json   TEXT NOT NULL DEFAULT '{}',
      entity_allowlist_json TEXT NOT NULL DEFAULT '[]',
      configured            INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT NOT NULL,
      updated_at            TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mqtt_profiles (
      id                   TEXT PRIMARY KEY,
      name                 TEXT NOT NULL,
      broker_host          TEXT NOT NULL DEFAULT '',
      broker_port          INTEGER NOT NULL DEFAULT 1883,
      topic_allowlist_json TEXT NOT NULL DEFAULT '[]',
      configured           INTEGER NOT NULL DEFAULT 0,
      created_at           TEXT NOT NULL,
      updated_at           TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS home_device_profiles (
      id                 TEXT PRIMARY KEY,
      name               TEXT NOT NULL,
      device_type        TEXT NOT NULL DEFAULT 'unknown',
      provider           TEXT NOT NULL DEFAULT 'unknown',
      endpoint           TEXT NOT NULL DEFAULT '',
      configured         INTEGER NOT NULL DEFAULT 0,
      action_policy_json TEXT NOT NULL DEFAULT '{}',
      created_at         TEXT NOT NULL,
      updated_at         TEXT NOT NULL
    );
  `);
}

// ── HA Profile ────────────────────────────────────────────────────────────────

interface HaProfileRow {
  id: string; name: string; endpoint: string;
  ha_mcp_enabled: number; ha_mcp_profile_json: string;
  entity_allowlist_json: string; configured: number;
  created_at: string; updated_at: string;
}

function rowToHaProfile(r: HaProfileRow): HaProfile {
  return {
    id: r.id,
    name: r.name,
    endpoint: r.endpoint,
    haMcpEnabled: r.ha_mcp_enabled === 1,
    haMcpProfile: JSON.parse(r.ha_mcp_profile_json) as Record<string, unknown>,
    entityAllowlist: JSON.parse(r.entity_allowlist_json) as HaEntityEntry[],
    configured: r.configured === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function getHaProfile(id: string): HaProfile | null {
  ensureHomeAutopilotTables();
  const row = sqlite.prepare("SELECT * FROM ha_profiles WHERE id = ?").get(id) as HaProfileRow | undefined;
  return row ? rowToHaProfile(row) : null;
}

export function getDefaultHaProfile(): HaProfile | null {
  ensureHomeAutopilotTables();
  const row = sqlite.prepare(
    "SELECT * FROM ha_profiles ORDER BY created_at ASC LIMIT 1"
  ).get() as HaProfileRow | undefined;
  return row ? rowToHaProfile(row) : null;
}

export interface UpsertHaProfileInput {
  id?: string;
  name: string;
  endpoint?: string;
  haMcpEnabled?: boolean;
  haMcpProfile?: Record<string, unknown>;
  entityAllowlist?: HaEntityEntry[];
  configured?: boolean;
}

export function upsertHaProfile(input: UpsertHaProfileInput): HaProfile {
  ensureHomeAutopilotTables();
  const now = new Date().toISOString();
  const id = input.id ?? randomUUID();
  const existing = input.id ? getHaProfile(input.id) : null;

  sqlite.prepare(`
    INSERT INTO ha_profiles
      (id, name, endpoint, ha_mcp_enabled, ha_mcp_profile_json,
       entity_allowlist_json, configured, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name                  = excluded.name,
      endpoint              = excluded.endpoint,
      ha_mcp_enabled        = excluded.ha_mcp_enabled,
      ha_mcp_profile_json   = excluded.ha_mcp_profile_json,
      entity_allowlist_json = excluded.entity_allowlist_json,
      configured            = excluded.configured,
      updated_at            = excluded.updated_at
  `).run(
    id,
    input.name,
    input.endpoint ?? existing?.endpoint ?? "",
    (input.haMcpEnabled ?? existing?.haMcpEnabled ?? false) ? 1 : 0,
    JSON.stringify(input.haMcpProfile ?? existing?.haMcpProfile ?? {}),
    JSON.stringify(input.entityAllowlist ?? existing?.entityAllowlist ?? []),
    (input.configured ?? existing?.configured ?? false) ? 1 : 0,
    existing?.createdAt ?? now,
    now,
  );

  // Never log endpoint URL or HA token — could contain credentials/private IPs
  thoughtLog.publish({
    category: "system",
    title: "HA Profile Updated",
    message: `Home Assistant profile '${input.name}' saved`,
    metadata: {
      profileId: id,
      configured: input.configured ?? false,
      entityCount: (input.entityAllowlist ?? existing?.entityAllowlist ?? []).length,
      haMcpEnabled: input.haMcpEnabled ?? existing?.haMcpEnabled ?? false,
    },
  });

  return getHaProfile(id)!;
}

// ── MQTT Profile ──────────────────────────────────────────────────────────────

interface MqttProfileRow {
  id: string; name: string; broker_host: string; broker_port: number;
  topic_allowlist_json: string; configured: number;
  created_at: string; updated_at: string;
}

function rowToMqttProfile(r: MqttProfileRow): MqttProfile {
  return {
    id: r.id,
    name: r.name,
    brokerHost: r.broker_host,
    brokerPort: r.broker_port,
    topicAllowlist: JSON.parse(r.topic_allowlist_json) as MqttTopicEntry[],
    configured: r.configured === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function getMqttProfile(id: string): MqttProfile | null {
  ensureHomeAutopilotTables();
  const row = sqlite.prepare(
    "SELECT * FROM mqtt_profiles WHERE id = ?"
  ).get(id) as MqttProfileRow | undefined;
  return row ? rowToMqttProfile(row) : null;
}

export function getDefaultMqttProfile(): MqttProfile | null {
  ensureHomeAutopilotTables();
  const row = sqlite.prepare(
    "SELECT * FROM mqtt_profiles ORDER BY created_at ASC LIMIT 1"
  ).get() as MqttProfileRow | undefined;
  return row ? rowToMqttProfile(row) : null;
}

export interface UpsertMqttProfileInput {
  id?: string;
  name: string;
  brokerHost?: string;
  brokerPort?: number;
  topicAllowlist?: MqttTopicEntry[];
  configured?: boolean;
}

export function upsertMqttProfile(input: UpsertMqttProfileInput): MqttProfile {
  ensureHomeAutopilotTables();
  const now = new Date().toISOString();
  const id = input.id ?? randomUUID();
  const existingRow = input.id
    ? (sqlite.prepare("SELECT * FROM mqtt_profiles WHERE id = ?").get(input.id) as MqttProfileRow | undefined)
    : undefined;
  const existing = existingRow ? rowToMqttProfile(existingRow) : null;

  sqlite.prepare(`
    INSERT INTO mqtt_profiles
      (id, name, broker_host, broker_port, topic_allowlist_json, configured, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name                 = excluded.name,
      broker_host          = excluded.broker_host,
      broker_port          = excluded.broker_port,
      topic_allowlist_json = excluded.topic_allowlist_json,
      configured           = excluded.configured,
      updated_at           = excluded.updated_at
  `).run(
    id,
    input.name,
    input.brokerHost ?? existing?.brokerHost ?? "",
    input.brokerPort ?? existing?.brokerPort ?? 1883,
    JSON.stringify(input.topicAllowlist ?? existing?.topicAllowlist ?? []),
    (input.configured ?? existing?.configured ?? false) ? 1 : 0,
    existing?.createdAt ?? now,
    now,
  );

  // Never log broker host/credentials
  thoughtLog.publish({
    category: "system",
    title: "MQTT Profile Updated",
    message: `MQTT profile '${input.name}' saved`,
    metadata: {
      profileId: id,
      configured: input.configured ?? false,
      topicCount: (input.topicAllowlist ?? existing?.topicAllowlist ?? []).length,
    },
  });

  return getMqttProfile(id)!;
}

// ── Home Device Profiles ──────────────────────────────────────────────────────

interface HomeDeviceProfileRow {
  id: string; name: string; device_type: string; provider: string;
  endpoint: string; configured: number; action_policy_json: string;
  created_at: string; updated_at: string;
}

function rowToDeviceProfile(r: HomeDeviceProfileRow): HomeDeviceProfile {
  return {
    id: r.id,
    name: r.name,
    deviceType: r.device_type as HomeDeviceType,
    provider: r.provider as HomeDeviceProvider,
    endpoint: r.endpoint,
    configured: r.configured === 1,
    actionPolicy: JSON.parse(r.action_policy_json) as Record<string, HomeActionRisk>,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listHomeDevices(): HomeDeviceProfile[] {
  ensureHomeAutopilotTables();
  return (
    sqlite.prepare(
      "SELECT * FROM home_device_profiles ORDER BY created_at ASC"
    ).all() as HomeDeviceProfileRow[]
  ).map(rowToDeviceProfile);
}

export function getHomeDevice(id: string): HomeDeviceProfile | null {
  ensureHomeAutopilotTables();
  const row = sqlite.prepare(
    "SELECT * FROM home_device_profiles WHERE id = ?"
  ).get(id) as HomeDeviceProfileRow | undefined;
  return row ? rowToDeviceProfile(row) : null;
}

/**
 * Default action policies by device type.
 * Hard limits are then applied on top of these defaults.
 */
function defaultActionPolicy(deviceType: HomeDeviceType): Record<string, HomeActionRisk> {
  switch (deviceType) {
    case "garage_door":
      return {
        status_read: "read_only",
        open:        "approval_required",
        close:       "approval_required",
        toggle:      "approval_required",
      };
    case "lock":
      return {
        status_read: "read_only",
        lock:        "approval_required",
        unlock:      "approval_required",
      };
    case "compressor":
      return {
        status_read: "read_only",
        start:       "manual_only",
        stop:        "manual_only",
      };
    case "robot_vacuum":
      return {
        status_read:      "read_only",
        map_read:         "read_only",
        rooms_read:       "read_only",
        clean_zone:       "approval_required",
        vacuum_start:     "approval_required",
        vacuum_dock:      "approval_required",
        vacuum_pause:     "approval_required",
        frame_capture:    "blocked",
      };
    case "camera_nvr":
      return {
        events_read:       "read_only",
        detections_read:   "read_only",
        status_read:       "read_only",
        frame_capture:     "blocked",
        snapshot:          "blocked",
        recording_change:  "blocked",
        stream_access:     "blocked",
      };
    case "shop_light":
      return {
        status_read: "read_only",
        on:          "dry_run",
        off:         "dry_run",
        brightness:  "approval_required",
      };
    case "wled_strip":
      return {
        status_read:  "read_only",
        on:           "dry_run",
        off:          "dry_run",
        scene_change: "approval_required",
      };
    case "air_filter":
      return {
        status_read: "read_only",
        on:          "approval_required",
        off:         "approval_required",
        speed:       "approval_required",
      };
    case "shop_fan":
      return {
        status_read: "read_only",
        on:          "approval_required",
        off:         "approval_required",
      };
    case "smart_plug":
      return {
        status_read:     "read_only",
        smart_plug_on:   "approval_required",
        smart_plug_off:  "approval_required",
      };
    default:
      return { status_read: "read_only" };
  }
}

export interface UpsertHomeDeviceInput {
  id?: string;
  name: string;
  deviceType?: HomeDeviceType;
  provider?: HomeDeviceProvider;
  endpoint?: string;
  configured?: boolean;
  actionPolicy?: Record<string, HomeActionRisk>;
}

export function upsertHomeDevice(input: UpsertHomeDeviceInput): HomeDeviceProfile {
  ensureHomeAutopilotTables();
  const now = new Date().toISOString();
  const id = input.id ?? randomUUID();
  const existing = input.id ? getHomeDevice(input.id) : null;
  const deviceType: HomeDeviceType = input.deviceType ?? existing?.deviceType ?? "unknown";

  // Build policy from input, existing, or defaults
  const rawPolicy = input.actionPolicy ?? existing?.actionPolicy ?? defaultActionPolicy(deviceType);

  // Apply hard limits — blocked/manual_only actions can never be downgraded
  const policy: Record<string, HomeActionRisk> = {};
  for (const [action, tier] of Object.entries(rawPolicy)) {
    if (BLOCKED_HOME_ACTIONS.has(action)) {
      policy[action] = "blocked";
    } else if (MANUAL_ONLY_HOME_ACTIONS.has(action)) {
      policy[action] = "manual_only";
    } else if (APPROVAL_REQUIRED_HOME_ACTIONS.has(action) && tier !== "blocked" && tier !== "manual_only") {
      policy[action] = "approval_required";
    } else {
      policy[action] = tier;
    }
  }

  sqlite.prepare(`
    INSERT INTO home_device_profiles
      (id, name, device_type, provider, endpoint, configured, action_policy_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name               = excluded.name,
      device_type        = excluded.device_type,
      provider           = excluded.provider,
      endpoint           = excluded.endpoint,
      configured         = excluded.configured,
      action_policy_json = excluded.action_policy_json,
      updated_at         = excluded.updated_at
  `).run(
    id,
    input.name,
    deviceType,
    input.provider ?? existing?.provider ?? "unknown",
    input.endpoint ?? existing?.endpoint ?? "",
    (input.configured ?? existing?.configured ?? false) ? 1 : 0,
    JSON.stringify(policy),
    existing?.createdAt ?? now,
    now,
  );

  // Never log endpoint or device credentials
  thoughtLog.publish({
    category: "system",
    title: "Home Device Profile Updated",
    message: `Home device '${input.name}' (${deviceType}) saved`,
    metadata: {
      deviceId: id,
      deviceType,
      provider: input.provider ?? existing?.provider ?? "unknown",
      configured: input.configured ?? false,
    },
  });

  return getHomeDevice(id)!;
}

// ── Action evaluation ─────────────────────────────────────────────────────────

/**
 * Evaluate a Home Assistant entity action.
 * Entity must be in the profile's allowlist before any action is allowed.
 * Read-state is always read_only for any allowlisted entity.
 */
export function evaluateHaAction(
  haProfileId: string,
  entityId: string,
  action: string,
): HomeActionEvalResult {
  const profile = getHaProfile(haProfileId);
  if (!profile) {
    return {
      allowed: false, riskTier: "blocked", requiresApproval: false,
      message: "HA profile not found", executed: false,
    };
  }
  if (!profile.configured) {
    return {
      allowed: false, riskTier: "blocked", requiresApproval: false,
      message: "Home Assistant not configured", executed: false,
    };
  }

  // Hard limit: entity must be in allowlist — unknown entities always blocked
  const entity = profile.entityAllowlist.find((e) => e.entityId === entityId);
  if (!entity) {
    return {
      allowed: false, riskTier: "blocked", requiresApproval: false,
      message: `Entity '${entityId}' not in allowlist — blocked`, executed: false,
    };
  }

  // Hard limits on action type — override everything
  if (BLOCKED_HOME_ACTIONS.has(action)) {
    return {
      allowed: false, riskTier: "blocked", requiresApproval: false,
      message: `Action '${action}' is permanently blocked (privacy)`, executed: false,
    };
  }
  if (MANUAL_ONLY_HOME_ACTIONS.has(action)) {
    return {
      allowed: false, riskTier: "manual_only", requiresApproval: false,
      message: `Action '${action}' is manual_only — physical danger`, executed: false,
    };
  }
  if (APPROVAL_REQUIRED_HOME_ACTIONS.has(action)) {
    return {
      allowed: false, riskTier: "approval_required", requiresApproval: true,
      message: `Action '${action}' requires explicit human approval`, executed: false,
    };
  }

  // Read state is always read_only for any allowlisted entity
  if (action === "read_state" || action === "get_state" || action === "status_read") {
    return {
      allowed: true, riskTier: "read_only", requiresApproval: false,
      message: `Read state for entity '${entityId}' — read_only`, executed: false,
    };
  }

  // Use entity's control risk tier for other actions
  const tier = entity.controlRiskTier;
  if (tier === "blocked") {
    return { allowed: false, riskTier: "blocked", requiresApproval: false, message: `Entity '${entityId}' control is blocked`, executed: false };
  }
  if (tier === "manual_only") {
    return { allowed: false, riskTier: "manual_only", requiresApproval: false, message: `Entity '${entityId}' control is manual_only`, executed: false };
  }
  if (tier === "approval_required") {
    return { allowed: false, riskTier: "approval_required", requiresApproval: true, message: `Entity '${entityId}' control requires approval`, executed: false };
  }

  return {
    allowed: true, riskTier: tier, requiresApproval: false,
    message: `Action '${action}' on entity '${entityId}' — ${tier}`, executed: false,
  };
}

/**
 * Evaluate a MQTT publish action.
 * Topic must match the allowlist (exact or wildcard) before any publish is proposed.
 */
export function evaluateMqttPublish(
  mqttProfileId: string,
  topic: string,
): HomeActionEvalResult {
  let prof: MqttProfile | null = null;
  if (mqttProfileId) {
    const row = sqlite.prepare(
      "SELECT * FROM mqtt_profiles WHERE id = ?"
    ).get(mqttProfileId) as MqttProfileRow | undefined;
    if (row) prof = rowToMqttProfile(row);
  }
  if (!prof) prof = getDefaultMqttProfile();

  if (!prof) {
    return {
      allowed: false, riskTier: "blocked", requiresApproval: false,
      message: "MQTT not configured", executed: false,
    };
  }
  if (!prof.configured) {
    return {
      allowed: false, riskTier: "blocked", requiresApproval: false,
      message: "MQTT broker not configured", executed: false,
    };
  }

  // Topic must be in allowlist (exact match or simple wildcard)
  const topicEntry = prof.topicAllowlist.find((t) => {
    if (t.topic === topic) return true;
    // Support simple # wildcard: "home/#" matches "home/light/state"
    if (t.topic.endsWith("/#")) {
      const prefix = t.topic.slice(0, -2);
      return topic === prefix || topic.startsWith(prefix + "/");
    }
    // Support + wildcard for a single level: "home/+/state" matches "home/light/state"
    if (t.topic.includes("/+/")) {
      const re = new RegExp(
        "^" + t.topic.replace(/[.^$*?()|[\]{}\\]/g, "\\$&").replace("/\\+/", "/[^/]+/") + "$"
      );
      return re.test(topic);
    }
    return false;
  });

  if (!topicEntry) {
    return {
      allowed: false, riskTier: "blocked", requiresApproval: false,
      message: `Topic '${topic}' not in allowlist — blocked`, executed: false,
    };
  }

  const tier = topicEntry.publishRiskTier;
  if (tier === "blocked") {
    return { allowed: false, riskTier: "blocked", requiresApproval: false, message: `Topic '${topic}' publish is blocked`, executed: false };
  }
  if (tier === "manual_only") {
    return { allowed: false, riskTier: "manual_only", requiresApproval: false, message: `Topic '${topic}' publish is manual_only`, executed: false };
  }
  if (tier === "approval_required") {
    return { allowed: false, riskTier: "approval_required", requiresApproval: true, message: `Topic '${topic}' publish requires approval`, executed: false };
  }

  return {
    allowed: true, riskTier: tier, requiresApproval: false,
    message: `Publish to '${topic}' — ${tier}`, executed: false,
  };
}

/**
 * Evaluate a home device action.
 * Device must be configured; action must be in policy; hard limits override everything.
 */
export function evaluateDeviceAction(
  deviceId: string,
  action: string,
): HomeActionEvalResult {
  const device = getHomeDevice(deviceId);
  if (!device) {
    return {
      allowed: false, riskTier: "blocked", requiresApproval: false,
      message: "Device not found", executed: false,
    };
  }
  if (!device.configured) {
    return {
      allowed: false, riskTier: "blocked", requiresApproval: false,
      message: `Device '${device.name}' not configured`, executed: false,
    };
  }

  // Hard limits always override device policy
  if (BLOCKED_HOME_ACTIONS.has(action)) {
    return {
      allowed: false, riskTier: "blocked", requiresApproval: false,
      message: `Action '${action}' is permanently blocked (privacy/safety)`, executed: false,
    };
  }
  if (MANUAL_ONLY_HOME_ACTIONS.has(action)) {
    return {
      allowed: false, riskTier: "manual_only", requiresApproval: false,
      message: `Action '${action}' is manual_only — physical danger`, executed: false,
    };
  }
  if (APPROVAL_REQUIRED_HOME_ACTIONS.has(action)) {
    return {
      allowed: false, riskTier: "approval_required", requiresApproval: true,
      message: `Action '${action}' requires explicit human approval`, executed: false,
    };
  }

  // Look up action in device's policy
  const tier = device.actionPolicy[action];
  if (!tier) {
    return {
      allowed: false, riskTier: "blocked", requiresApproval: false,
      message: `Action '${action}' not in device policy`, executed: false,
    };
  }

  if (tier === "blocked") {
    return { allowed: false, riskTier: "blocked", requiresApproval: false, message: `Action '${action}' is blocked`, executed: false };
  }
  if (tier === "manual_only") {
    return { allowed: false, riskTier: "manual_only", requiresApproval: false, message: `Action '${action}' is manual_only`, executed: false };
  }
  if (tier === "approval_required") {
    return { allowed: false, riskTier: "approval_required", requiresApproval: true, message: `Action '${action}' requires approval`, executed: false };
  }

  return {
    allowed: true, riskTier: tier, requiresApproval: false,
    message: `Action '${action}' on device '${device.name}' — ${tier}`, executed: false,
  };
}

// ── Status ────────────────────────────────────────────────────────────────────

export function getHomeAutopilotStatus(): HomeAutopilotStatus {
  ensureHomeAutopilotTables();
  const haProfile = getDefaultHaProfile();
  const mqttProfile = getDefaultMqttProfile();
  const devices = listHomeDevices();

  const configuredDevices = devices.filter((d) => d.configured);
  const robotVacuum = configuredDevices.find((d) => d.deviceType === "robot_vacuum");
  const camera = configuredDevices.find((d) => d.deviceType === "camera_nvr");
  const shopDevices = configuredDevices.filter((d) =>
    (["shop_light", "shop_fan", "air_filter", "compressor", "garage_door", "smart_plug"] as HomeDeviceType[]).includes(d.deviceType)
  );

  return {
    haConfigured: haProfile?.configured ?? false,
    mqttConfigured: mqttProfile?.configured ?? false,
    devicesConfigured: configuredDevices.length,
    robotVacuumConfigured: !!robotVacuum,
    cameraConfigured: !!camera,
    shopDevicesConfigured: shopDevices.length,
    sourceOfTruth: HOME_AUTOPILOT_SOURCE_OF_TRUTH,
  };
}
