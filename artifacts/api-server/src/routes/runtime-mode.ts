import { Router } from "express";
import {
  getRuntimeModeState,
  getServicePolicies,
  performEmergencyStop,
  setRuntimeMode,
  updateServicePolicy,
} from "../lib/runtime-mode.js";
import { requireAgentEdits } from "../lib/route-guards.js";

const router = Router();

router.get("/runtime-mode", (_req, res) => {
  res.json({ success: true, ...getRuntimeModeState() });
});

router.post("/runtime-mode/set", async (req, res) => {
  if (!await requireAgentEdits(res, "change runtime mode")) return;
  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  try {
    const result = await setRuntimeMode(body["mode"], typeof body["reason"] === "string" ? body["reason"] : undefined);
    res.json({ success: true, ...result.state, actions: result.actions });
  } catch (error) {
    res.status(400).json({ success: false, message: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/service-policies", (_req, res) => {
  res.json({ success: true, policies: getServicePolicies() });
});

router.post("/service-policies/:id/update", async (req, res) => {
  if (!await requireAgentEdits(res, "update service startup policy")) return;
  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  try {
    const policy = updateServicePolicy(req.params.id, body);
    res.json({ success: true, policy });
  } catch (error) {
    res.status(400).json({ success: false, message: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/emergency-stop", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  try {
    const actions = await performEmergencyStop(typeof body["reason"] === "string" ? body["reason"] : undefined);
    res.json({ success: true, ...getRuntimeModeState(), actions });
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
