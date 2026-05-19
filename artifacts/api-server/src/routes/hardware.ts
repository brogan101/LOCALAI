/**
 * HARDWARE INTELLIGENCE ROUTES
 * =============================
 * GET  /api/hardware/intelligence   — full ranked model report with live VRAM
 * GET  /api/hardware/gpu            — raw GPU probe (fast)
 * GET  /api/hardware/canfit/:vram   — can we fit N bytes right now?
 */

import { Router, type Request, type Response } from "express";
import { getHardwareIntelligence, probeGpu, canFitModel } from "../lib/hardware-intelligence.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.get("/intelligence", async (_req: Request, res: Response) => {
  try {
    const report = await getHardwareIntelligence();
    res.json({ success: true, ...report });
  } catch (err) {
    logger.error({ err }, "hardware/intelligence failed");
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.get("/gpu", async (_req: Request, res: Response) => {
  try {
    const gpu = await probeGpu();
    res.json({ success: true, gpu });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.get("/canfit/:vram", async (req: Request, res: Response) => {
  const vramBytes = parseInt(String(req.params["vram"] ?? "0"), 10);
  if (!vramBytes || isNaN(vramBytes)) {
    res.status(400).json({ success: false, message: "vram param must be a byte count integer" });
    return;
  }
  try {
    const result = await canFitModel(vramBytes);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
