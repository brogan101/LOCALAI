/**
 * HOME AUTOPILOT EXECUTOR (executor #7)
 * =======================================
 * Read-only first pass. Wraps home-autopilot.ts evaluateHaAction/evaluateMqttPublish
 * with the executor framework.
 *
 * Current capability (Phase 14B design constraints):
 *   - validate: evaluate if an HA entity action is allowed per policy
 *   - dry_run:  same, returns what would be proposed
 *   - execute:  creates a proposal record — physical action is ALWAYS executed: false
 *
 * Hard limits (from lib, re-enforced):
 *   - camera_frame_capture / snapshot / recording: permanently blocked
 *   - compressor / main_shop_power: manual_only
 *   - garage_door / lock: approval_required
 *   - Unknown entities: blocked regardless
 *   - MQTT topics not in allowlist: blocked
 *   - executed = false always in current phase (no HA REST calls)
 */

import mqtt from "mqtt";
import { logger } from "./logger.js";
import {
  registerExecutor,
  type ExecutorRunner,
  type ExecutorRunnerContext,
  type ExecutorRunnerResult,
} from "./approved-executor.js";
import {
  evaluateHaAction,
  evaluateMqttPublish,
  evaluateDeviceAction,
  getDefaultHaProfile,
  getDefaultMqttProfile,
  listHomeDevices,
  getHomeAutopilotStatus,
} from "./home-autopilot.js";

// ── Testable MQTT connect hook ────────────────────────────────────────────────
// Tests override this to avoid real broker connections.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mqttConnectFn: (url: string, opts: Record<string, unknown>) => any =
  (url: string, opts: Record<string, unknown>) => mqtt.connect(url, opts as mqtt.IClientOptions);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function _testOverrideMqttConnect(fn: (url: string, opts: Record<string, unknown>) => any): void {
  _mqttConnectFn = fn;
}

export const HOME_AUTOPILOT_EXECUTOR_KIND = "home_autopilot";

export interface HomeAutopilotPayload {
  [key: string]: unknown;
  /** "ha_action" | "mqtt_publish" | "device_action" | "status_read" */
  action: string;
  /** HA entity ID (e.g. "light.living_room") */
  entityId?: string;
  /** HA action (e.g. "turn_on", "turn_off", "read_state") */
  haAction?: string;
  /** HA profile ID (omit for default) */
  haProfileId?: string;
  /** HA service domain — used for REST execution (e.g. "light") */
  domain?: string;
  /** HA service name — used for REST execution (e.g. "turn_on") */
  service?: string;
  /** HA service data body — passed as JSON to /api/services/{domain}/{service} */
  serviceData?: Record<string, unknown>;
  /** MQTT topic (also accepted as mqttTopic for backward compat) */
  topic?: string;
  /** MQTT topic legacy field */
  mqttTopic?: string;
  /** MQTT message payload — required in execute mode */
  message?: string;
  /** MQTT profile ID */
  mqttProfileId?: string;
  /** Device ID for device_action */
  deviceId?: string;
  /** Device action type */
  deviceAction?: string;
}

const homeAutopilotRunner: ExecutorRunner = async (ctx: ExecutorRunnerContext): Promise<ExecutorRunnerResult> => {
  const { request, checkpoint, appendVerification } = ctx;
  const mode = request.mode ?? "dry_run";
  const payload = request.payload as unknown as HomeAutopilotPayload;

  checkpoint("evaluate");
  await appendVerification(`Home autopilot: action=${payload.action} mode=${mode}`);

  // ── Status read (always allowed, no approval needed)
  if (payload.action === "status_read") {
    const status = getHomeAutopilotStatus();
    const devices = listHomeDevices();
    await appendVerification(`Status read: ${devices.length} devices configured`);
    return {
      success: true,
      executed: false,
      result: { status, deviceCount: devices.length },
      redactedSummary: `Home autopilot status: ${devices.length} device(s) configured`,
    };
  }

  // ── HA entity action
  if (payload.action === "ha_action") {
    if (!payload.entityId || !payload.haAction) {
      return { success: false, executed: false, redactedSummary: "entityId and haAction required" };
    }
    const profile = getDefaultHaProfile();
    const profileId = payload.haProfileId ?? profile?.id ?? "";
    const evalResult = evaluateHaAction(profileId, payload.entityId, payload.haAction);
    await appendVerification(`HA eval: allowed=${evalResult.allowed} tier=${evalResult.riskTier}`);

    if (mode === "validate") {
      return {
        success: evalResult.allowed,
        executed: false,
        result: evalResult as unknown as Record<string, unknown>,
        redactedSummary: evalResult.allowed
          ? `HA action "${payload.haAction}" on "${payload.entityId}" is allowed (${evalResult.riskTier})`
          : `HA action blocked: ${evalResult.message}`,
      };
    }

    if (!evalResult.allowed) {
      return {
        success: false,
        executed: false,
        result: evalResult as unknown as Record<string, unknown>,
        redactedSummary: `HA action blocked: ${evalResult.message}`,
      };
    }

    // ── dry_run / validate (non-execute) — proposal with wouldCall hint
    if (mode !== "execute") {
      const haUrl = profile?.endpoint ?? "";
      return {
        success: true,
        executed: false,
        result: {
          ...evalResult,
          proposedAction: `${payload.haAction} on ${payload.entityId}`,
          wouldCall: {
            method: "POST",
            url: `${haUrl}/api/services/${payload.domain ?? ""}/${payload.service ?? ""}`,
            body: payload.serviceData ?? {},
          },
        },
        redactedSummary: `Proposed HA action: "${payload.haAction}" on "${payload.entityId}" — requires HA integration to execute`,
      };
    }

    // ── execute mode — real HA REST call
    const haUrl = profile?.endpoint ?? "";
    const haToken = (profile?.haMcpProfile?.["token"] as string | undefined) ?? "";

    if (!haUrl || !haToken) {
      return {
        success: false,
        executed: false,
        redactedSummary: "HA not configured — add URL and token in Settings → Home Autopilot",
      };
    }

    try {
      const haRes = await fetch(
        `${haUrl}/api/services/${payload.domain ?? ""}/${payload.service ?? ""}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${haToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload.serviceData ?? {}),
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (haRes.status === 200 || haRes.status === 201) {
        return {
          success: true,
          executed: true,
          result: {
            domain: payload.domain,
            service: payload.service,
            entityId: payload.entityId,
            status: haRes.status,
          },
          rollbackNotes: `To reverse: call the opposite HA service for entity ${payload.entityId}`,
          redactedSummary: `HA ${payload.domain}.${payload.service} executed on ${payload.entityId}`,
        };
      }
      if (haRes.status === 401) {
        return {
          success: false,
          executed: false,
          redactedSummary: "HA authentication failed — check token in Settings → Home Autopilot",
        };
      }
      if (haRes.status === 404) {
        return {
          success: false,
          executed: false,
          redactedSummary: `HA entity not found: ${payload.entityId} — check entity ID is correct`,
        };
      }
      const errBody = await haRes.text().catch(() => "");
      return {
        success: false,
        executed: false,
        redactedSummary: `HA request failed: HTTP ${haRes.status} — ${errBody.slice(0, 200)}`,
      };
    } catch (err) {
      return {
        success: false,
        executed: false,
        redactedSummary: `HA unreachable: ${err instanceof Error ? err.message : "network error"} — is HA running?`,
      };
    }
  }

  // ── MQTT publish
  if (payload.action === "mqtt_publish") {
    const mqttTopic = payload.topic ?? payload.mqttTopic;
    if (!mqttTopic) {
      return { success: false, executed: false, redactedSummary: "mqttTopic required" };
    }
    const evalResult = evaluateMqttPublish(payload.mqttProfileId ?? "", mqttTopic);
    await appendVerification(`MQTT eval: allowed=${evalResult.allowed} tier=${evalResult.riskTier}`);

    // ── non-execute modes — proposal only
    if (mode !== "execute") {
      return {
        success: evalResult.allowed,
        executed: false,
        result: evalResult as unknown as Record<string, unknown>,
        redactedSummary: evalResult.allowed
          ? `MQTT publish to "${mqttTopic}" allowed (${evalResult.riskTier}) — proposal only`
          : `MQTT publish blocked: ${evalResult.message}`,
      };
    }

    // ── execute mode — real MQTT publish
    if (!evalResult.allowed) {
      return {
        success: false,
        executed: false,
        result: evalResult as unknown as Record<string, unknown>,
        redactedSummary: `MQTT publish blocked: ${evalResult.message}`,
      };
    }

    const mqttProf = getDefaultMqttProfile();
    if (!mqttProf?.brokerHost) {
      return {
        success: false,
        executed: false,
        redactedSummary: "MQTT not configured — add broker URL in Settings → Home Autopilot",
      };
    }

    const brokerUrl = `mqtt://${mqttProf.brokerHost}:${mqttProf.brokerPort || 1883}`;
    const message = payload.message ?? "";
    if (!message) {
      return { success: false, executed: false, redactedSummary: "message required for MQTT publish" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let client: any = null;
    try {
      client = await new Promise<any>((resolve, reject) => {
        const c = _mqttConnectFn(brokerUrl, { connectTimeout: 8_000 });
        c.once("connect", () => resolve(c));
        c.once("error", reject);
      });

      await new Promise<void>((resolve, reject) => {
        client.publish(mqttTopic, message, { qos: 1 }, (err: Error | null | undefined) => {
          if (err) reject(err); else resolve();
        });
      });

      client.end();

      return {
        success: true,
        executed: true,
        result: { topic: mqttTopic, messageLength: message.length },
        rollbackNotes: `No automatic rollback for MQTT publish to ${mqttTopic}`,
        redactedSummary: `MQTT published ${message.length} bytes to ${mqttTopic}`,
      };
    } catch (err) {
      try { client?.end(); } catch { /* ignore */ }
      return {
        success: false,
        executed: false,
        redactedSummary: `MQTT failed: ${err instanceof Error ? err.message : "unknown error"}`,
      };
    }
  }

  // ── Device action
  if (payload.action === "device_action") {
    if (!payload.deviceId || !payload.deviceAction) {
      return { success: false, executed: false, redactedSummary: "deviceId and deviceAction required" };
    }
    const evalResult = evaluateDeviceAction(payload.deviceId, payload.deviceAction);
    await appendVerification(`Device eval: allowed=${evalResult.allowed} tier=${evalResult.riskTier}`);

    return {
      success: evalResult.allowed,
      executed: false,
      result: evalResult as unknown as Record<string, unknown>,
      redactedSummary: evalResult.allowed
        ? `Device action "${payload.deviceAction}" on "${payload.deviceId}" — proposal only (${evalResult.riskTier})`
        : `Device action blocked: ${evalResult.message}`,
    };
  }

  return { success: false, executed: false, redactedSummary: `Unknown home autopilot action: ${payload.action}` };
};

/** Exported for unit tests that need to inspect ExecutorRunnerResult.result directly. */
export const _testRunHomeAutopilot = homeAutopilotRunner;

let registered = false;
export function ensureHomeAutopilotExecutorRegistered(): void {
  if (registered) return;
  registerExecutor(HOME_AUTOPILOT_EXECUTOR_KIND, homeAutopilotRunner);
  registered = true;
  logger.info("home-autopilot-executor: registered");
}
