import { Router } from "express";

const router = Router();

router.get("/healthz", (_req, res) => {
  return res.json({ status: "ok" });
});

router.get("/health", (_req, res) => {
  return res.json({ status: "ok" });
});

export default router;
