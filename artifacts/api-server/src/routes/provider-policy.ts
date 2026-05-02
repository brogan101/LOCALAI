import { Router } from "express";
import {
  evaluateProviderPolicy,
  getProviderPolicySnapshot,
  testProviderConnection,
  updateProviderConfig,
} from "../lib/provider-policy.js";
import { agentEditsGuard } from "../lib/route-guards.js";

const router = Router();

router.get("/provider-policy", async (_req, res) => {
  return res.json(await getProviderPolicySnapshot());
});

router.post("/provider-policy/evaluate", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  return res.json({
    success: true,
    decision: await evaluateProviderPolicy({
      providerId: typeof body.providerId === "string" ? body.providerId : undefined,
      dataClassification: body.dataClassification,
      approvedForThisUse: body.approvedForThisUse === true,
      estimatedTokens: typeof body.estimatedTokens === "number" ? body.estimatedTokens : undefined,
    }),
  });
});

router.put(
  "/provider-policy/providers/:id",
  agentEditsGuard((req) => `update provider policy ${String(req.params.id)}`),
  async (req, res) => {
    const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
    const patch = {
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
      model: typeof body.model === "string" ? body.model : undefined,
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
      firstUseApproved: typeof body.firstUseApproved === "boolean" ? body.firstUseApproved : undefined,
      allowPrivateFileData: typeof body.allowPrivateFileData === "boolean" ? body.allowPrivateFileData : undefined,
      costHintUsdPer1MTokens: typeof body.costHintUsdPer1MTokens === "number" ? body.costHintUsdPer1MTokens : undefined,
      makeDefault: body.makeDefault === true,
    };
    const provider = await updateProviderConfig(String(req.params.id), patch);
    return res.json({ success: true, provider });
  },
);

router.post("/provider-policy/providers/:id/test", async (req, res) => {
  const result = await testProviderConnection(String(req.params.id));
  return res.json(result);
});

export default router;
