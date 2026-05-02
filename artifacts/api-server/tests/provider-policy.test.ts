import assert from "node:assert/strict";
import express from "express";
import { initDatabase } from "../src/db/migrate.js";
import providerPolicyRoute from "../src/routes/provider-policy.js";
import {
  evaluateProviderPolicy,
  getProviderPolicySnapshot,
  redactSecretsDeep,
  testProviderConnection,
  updateProviderConfig,
} from "../src/lib/provider-policy.js";

await initDatabase();

let assertions = 0;

const app = express();
app.use(express.json());
app.use(providerPolicyRoute);

function inject(method: string, routePath: string, body?: unknown): Promise<{ status: number; payload: any }> {
  return new Promise((resolve, reject) => {
    const request = {
      method,
      url: routePath,
      originalUrl: routePath,
      baseUrl: "",
      path: routePath,
      headers: { "content-type": "application/json" },
      body,
      params: {},
      query: {},
      get(name: string) {
        return (this.headers as Record<string, string>)[name.toLowerCase()];
      },
      header(name: string) {
        return this.get(name);
      },
    };
    let statusCode = 200;
    const response = {
      status(code: number) {
        statusCode = code;
        return response;
      },
      json(payload: any) {
        resolve({ status: statusCode, payload });
        return response;
      },
      send(payload: any) {
        resolve({ status: statusCode, payload });
        return response;
      },
      end(payload?: any) {
        resolve({ status: statusCode, payload });
        return response;
      },
      setHeader() {},
      getHeader() {
        return undefined;
      },
      removeHeader() {},
    };
    app.handle(request as any, response as any, (error: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ status: 404, payload: undefined });
    });
  });
}

await updateProviderConfig("openai-compatible", {
  enabled: false,
  apiKey: "",
  firstUseApproved: false,
  allowPrivateFileData: false,
});

const snapshot = await getProviderPolicySnapshot();
assert.equal(snapshot.defaultProviderId, "ollama", "Ollama must remain the default provider");
assert.equal(snapshot.localOnlyByDefault, true);
assert.equal(snapshot.providers.find((provider) => provider.id === "openai-compatible")?.status, "disabled");
assertions += 3;

const localDecision = await evaluateProviderPolicy({
  providerId: "ollama",
  dataClassification: "private-file/RAG",
});
assert.equal(localDecision.allowed, true, "Local provider should allow local RAG context");
assert.equal(localDecision.costEstimateUsd, 0, "Local provider cost should be zero");
assert.equal(localDecision.dataLeavesMachine, false, "Ollama should not mark data as leaving the machine");
assertions += 3;

const secretDecision = await evaluateProviderPolicy({
  providerId: "openai-compatible",
  dataClassification: "credential",
  approvedForThisUse: true,
});
assert.equal(secretDecision.allowed, false, "Credential data must be blocked for cloud providers");
assert.match(secretDecision.reason, /Secret and credential/);
assertions += 2;

await updateProviderConfig("openai-compatible", {
  enabled: true,
  apiKey: "sk-test-VERY-SECRET-KEY-1234567890",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-test",
  firstUseApproved: true,
  allowPrivateFileData: false,
  costHintUsdPer1MTokens: 2,
});

const ragDecision = await evaluateProviderPolicy({
  providerId: "openai-compatible",
  dataClassification: "private-file/RAG",
  approvedForThisUse: true,
});
assert.equal(ragDecision.allowed, false, "Private file/RAG data must be blocked for cloud by default");
assertions += 1;

const normalWithoutUseApproval = await evaluateProviderPolicy({
  providerId: "openai-compatible",
  dataClassification: "normal",
  estimatedTokens: 1000,
});
assert.equal(normalWithoutUseApproval.allowed, false, "Cloud use should require per-use approval");
assert.equal(normalWithoutUseApproval.requiresApproval, true);
assert.equal(normalWithoutUseApproval.costEstimateUsd, 0.002);
assertions += 3;

const normalApproved = await evaluateProviderPolicy({
  providerId: "openai-compatible",
  dataClassification: "normal",
  approvedForThisUse: true,
  estimatedTokens: 1000,
});
assert.equal(normalApproved.allowed, true, "Configured cloud provider should only pass after explicit per-use approval");
assert.equal(normalApproved.dataLeavesMachine, true);
assertions += 2;

const redacted = redactSecretsDeep({
  apiKey: "sk-test-VERY-SECRET-KEY-1234567890",
  nested: { token: "token-secret-1234567890" },
});
assert.deepEqual(redacted, { apiKey: "[redacted]", nested: { token: "[redacted]" } });
assertions += 1;

const testResult = await testProviderConnection("openai-compatible");
assert.equal(testResult.networkUsed, false, "Provider test must not require network");
assert.equal(testResult.status, "mock_configured");
assertions += 2;

const routeSnapshot = await inject("GET", "/provider-policy");
assert.equal(routeSnapshot.status, 200);
assert.equal(routeSnapshot.payload.providers.some((provider: any) => provider.apiKey === "sk-test-VERY-SECRET-KEY-1234567890"), false);
assertions += 2;

const routeEval = await inject("POST", "/provider-policy/evaluate", {
  providerId: "openai-compatible",
  dataClassification: "secret",
  approvedForThisUse: true,
});
assert.equal(routeEval.status, 200);
assert.equal(routeEval.payload.decision.allowed, false);
assertions += 2;

await updateProviderConfig("openai-compatible", {
  enabled: false,
  apiKey: "",
  firstUseApproved: false,
  allowPrivateFileData: false,
});

console.log(`provider-policy.test.ts passed (${assertions} assertions)`);
