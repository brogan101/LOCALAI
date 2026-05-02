import { Router } from "express";
import {
  getBrowserToolingDiagnostic,
  listRuntimeDiagnostics,
  runtimeHealthSummary,
} from "../lib/runtime-diagnostics.js";

const router = Router();

router.get("/healthz", (_req, res) => {
  const diagnostics = [...listRuntimeDiagnostics(), getBrowserToolingDiagnostic()];
  const summary = runtimeHealthSummary();
  const browserBlocked = diagnostics.some((item) => item.id === "tooling.browser-node" && item.status === "blocked");
  return res.json({
    status: "ok",
    degraded: summary.degraded || browserBlocked,
    diagnostics,
  });
});

router.get("/health", (_req, res) => {
  const diagnostics = [...listRuntimeDiagnostics(), getBrowserToolingDiagnostic()];
  const summary = runtimeHealthSummary();
  const browserBlocked = diagnostics.some((item) => item.id === "tooling.browser-node" && item.status === "blocked");
  return res.json({
    status: "ok",
    degraded: summary.degraded || browserBlocked,
    diagnostics,
  });
});

export default router;
