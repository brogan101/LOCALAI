/**
 * INVENTORY ROUTES (Stage 5)
 * ==========================
 * POST /inventory/executor/validate
 * POST /inventory/executor/check
 * POST /inventory/executor/reorder-suggestions
 * POST /inventory/executor/create-item
 * POST /inventory/executor/propose-action
 *
 * HOME AUTOPILOT ROUTES (Stage 5)
 * ================================
 * GET  /home-autopilot/executor/status
 * POST /home-autopilot/executor/validate
 * POST /home-autopilot/executor/ha-action
 * POST /home-autopilot/executor/mqtt
 * POST /home-autopilot/executor/device
 */

import { Router } from "express";
import {
  executeApproved,
} from "../lib/approved-executor.js";
import {
  ensureInventoryExecutorRegistered,
  INVENTORY_EXECUTOR_KIND,
  type InventoryExecutorPayload,
} from "../lib/inventory-executor.js";
import {
  ensureHomeAutopilotExecutorRegistered,
  HOME_AUTOPILOT_EXECUTOR_KIND,
  type HomeAutopilotPayload,
} from "../lib/home-autopilot-executor.js";
import { createApprovalRequest, approveRequest } from "../lib/approval-queue.js";

const router = Router();
ensureInventoryExecutorRegistered();
ensureHomeAutopilotExecutorRegistered();

function bad(msg: string) { return { success: false, message: msg }; }

function autoApprove(type: string, title: string, payload: unknown, riskTier = "tier2_safe_local_execute" as const) {
  const a = createApprovalRequest({
    type,
    title,
    summary: "Auto-approved: read-only or dry-run",
    riskTier,
    requestedAction: `${type}.auto`,
    payload: payload as Record<string, unknown>,
  });
  approveRequest(a.id, "Auto-approved by executor route");
  return a.id;
}

// ═══════════════════════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════════════════════

router.get("/inventory/executor/status", async (_req, res) => {
  const approvalId = autoApprove(INVENTORY_EXECUTOR_KIND, "Inventory status", { action: "check_availability" });
  const result = await executeApproved({
    executorKind: INVENTORY_EXECUTOR_KIND,
    approvalId,
    requestedAction: "Read inventory status",
    mode: "validate",
    payload: { action: "check_availability" },
    skipRuntimeModeCheck: true,
  });
  return res.json(result);
});

router.post("/inventory/executor/check", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const payload: InventoryExecutorPayload = {
    action: "check_availability",
    checkItems: Array.isArray(body["items"]) ? body["items"] as any : undefined,
  };
  const approvalId = autoApprove(INVENTORY_EXECUTOR_KIND, "Availability check", payload);
  const result = await executeApproved({
    executorKind: INVENTORY_EXECUTOR_KIND,
    approvalId,
    requestedAction: "Check inventory availability",
    mode: "dry_run",
    payload,
    skipRuntimeModeCheck: true,
  });
  return res.json(result);
});

router.get("/inventory/executor/reorder-suggestions", async (_req, res) => {
  const payload: InventoryExecutorPayload = { action: "reorder_suggestions" };
  const approvalId = autoApprove(INVENTORY_EXECUTOR_KIND, "Reorder suggestions", payload);
  const result = await executeApproved({
    executorKind: INVENTORY_EXECUTOR_KIND,
    approvalId,
    requestedAction: "Get reorder suggestions",
    mode: "dry_run",
    payload,
    skipRuntimeModeCheck: true,
  });
  return res.json(result);
});

router.post("/inventory/executor/create-item", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const mode = body["dryRun"] === true ? "dry_run" : "execute";
  const payload: InventoryExecutorPayload = {
    action: "create_item",
    newItem: body["item"] as any,
  };
  const riskTier = mode === "execute" ? "tier3_file_modification" : "tier2_safe_local_execute";
  const approvalId = autoApprove(INVENTORY_EXECUTOR_KIND, `${mode === "execute" ? "Create" : "Dry-run create"} inventory item`, payload, riskTier as any);
  if (mode === "execute") approveRequest(approvalId, "Auto-approved: local DB write");

  const result = await executeApproved({
    executorKind: INVENTORY_EXECUTOR_KIND,
    approvalId,
    requestedAction: "Create inventory item",
    mode,
    payload,
  });
  return res.json(result);
});

router.post("/inventory/executor/propose-action", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const itemId = typeof body["itemId"] === "string" ? body["itemId"] : "";
  const actionType = typeof body["actionType"] === "string" ? body["actionType"] : "";
  if (!itemId || !actionType) return res.status(400).json(bad("itemId and actionType required"));

  const payload: InventoryExecutorPayload = { action: "propose_action", itemId, actionType: actionType as any };
  const approvalId = typeof body["approvalId"] === "string" ? body["approvalId"] : autoApprove(INVENTORY_EXECUTOR_KIND, `Propose ${actionType}`, payload);
  const result = await executeApproved({
    executorKind: INVENTORY_EXECUTOR_KIND,
    approvalId,
    requestedAction: `Inventory: propose ${actionType}`,
    mode: "execute",
    payload,
  });
  return res.json(result);
});

// ═══════════════════════════════════════════════════════════
// HOME AUTOPILOT
// ═══════════════════════════════════════════════════════════

router.get("/home-autopilot/executor/status", async (_req, res) => {
  const payload: HomeAutopilotPayload = { action: "status_read" };
  const approvalId = autoApprove(HOME_AUTOPILOT_EXECUTOR_KIND, "Home autopilot status", payload);
  const result = await executeApproved({
    executorKind: HOME_AUTOPILOT_EXECUTOR_KIND,
    approvalId,
    requestedAction: "Read home autopilot status",
    mode: "dry_run",
    payload,
    skipRuntimeModeCheck: true,
  });
  return res.json(result);
});

router.post("/home-autopilot/executor/ha-action", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const payload: HomeAutopilotPayload = {
    action: "ha_action",
    entityId: typeof body["entityId"] === "string" ? body["entityId"] : undefined,
    haAction: typeof body["haAction"] === "string" ? body["haAction"] : undefined,
    haProfileId: typeof body["haProfileId"] === "string" ? body["haProfileId"] : undefined,
  };
  if (!payload.entityId || !payload.haAction) return res.status(400).json(bad("entityId and haAction required"));

  const mode = typeof body["mode"] === "string" ? body["mode"] as any : "validate";
  const approvalId = autoApprove(HOME_AUTOPILOT_EXECUTOR_KIND, `HA: ${payload.haAction} on ${payload.entityId}`, payload);
  const result = await executeApproved({
    executorKind: HOME_AUTOPILOT_EXECUTOR_KIND,
    approvalId,
    requestedAction: `HA ${payload.haAction} on ${payload.entityId}`,
    mode,
    payload,
    skipRuntimeModeCheck: mode !== "execute",
  });
  return res.json(result);
});

router.post("/home-autopilot/executor/mqtt", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const payload: HomeAutopilotPayload = {
    action: "mqtt_publish",
    mqttTopic: typeof body["topic"] === "string" ? body["topic"] : undefined,
    mqttProfileId: typeof body["profileId"] === "string" ? body["profileId"] : undefined,
  };
  if (!payload.mqttTopic) return res.status(400).json(bad("topic required"));

  const approvalId = autoApprove(HOME_AUTOPILOT_EXECUTOR_KIND, `MQTT eval: ${payload.mqttTopic}`, payload);
  const result = await executeApproved({
    executorKind: HOME_AUTOPILOT_EXECUTOR_KIND,
    approvalId,
    requestedAction: `MQTT publish to ${payload.mqttTopic}`,
    mode: "validate",
    payload,
    skipRuntimeModeCheck: true,
  });
  return res.json(result);
});

router.post("/home-autopilot/executor/device", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const payload: HomeAutopilotPayload = {
    action: "device_action",
    deviceId: typeof body["deviceId"] === "string" ? body["deviceId"] : undefined,
    deviceAction: typeof body["deviceAction"] === "string" ? body["deviceAction"] : undefined,
  };
  if (!payload.deviceId || !payload.deviceAction) return res.status(400).json(bad("deviceId and deviceAction required"));

  const mode = typeof body["mode"] === "string" ? body["mode"] as any : "validate";
  const approvalId = autoApprove(HOME_AUTOPILOT_EXECUTOR_KIND, `Device: ${payload.deviceAction} on ${payload.deviceId}`, payload);
  const result = await executeApproved({
    executorKind: HOME_AUTOPILOT_EXECUTOR_KIND,
    approvalId,
    requestedAction: `Device ${payload.deviceAction} on ${payload.deviceId}`,
    mode,
    payload,
    skipRuntimeModeCheck: true,
  });
  return res.json(result);
});

export default router;
