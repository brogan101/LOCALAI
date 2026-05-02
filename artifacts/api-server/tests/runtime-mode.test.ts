import assert from "node:assert/strict";
import express from "express";
import { initDatabase } from "../src/db/migrate.js";
import runtimeRoute from "../src/routes/runtime-mode.js";
import {
  assertPhysicalActionsAllowed,
  getCurrentRuntimeMode,
  getRuntimeModeState,
  getServicePolicies,
  performEmergencyStop,
  setRuntimeMode,
  updateServicePolicy,
} from "../src/lib/runtime-mode.js";

await initDatabase();

let assertions = 0;

const app = express();
app.use(express.json());
app.use(runtimeRoute);

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
      get(name: string) {
        return (this.headers as Record<string, string>)[name.toLowerCase()];
      },
      header(name: string) {
        return this.get(name);
      },
      query: {},
      params: {},
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

const initial = getRuntimeModeState();
assert.ok(initial.servicePolicies.length >= 5, "Default service policies should be seeded");
assert.equal(initial.servicePolicies.some(policy => policy.id === "ollama-models"), true);
assertions += 2;

await setRuntimeMode("Coding", "runtime mode persistence test");
assert.equal(getCurrentRuntimeMode(), "Coding", "Runtime mode should persist in app_settings");
assertions += 1;

const routeState = await inject("GET", "/runtime-mode");
assert.equal(routeState.status, 200);
assert.equal(routeState.payload.mode, "Coding");
assertions += 2;

assert.throws(
  () => updateServicePolicy("ollama-models", { startupPolicy: "always" as any }),
  /Invalid startupPolicy/,
  "Service policy validation should reject unknown startup policies",
);
assert.throws(
  () => updateServicePolicy("ollama-models", { allowedModes: ["Gaming", "InvalidMode" as any] }),
  /Invalid runtime mode/,
  "Service policy validation should reject unknown runtime modes",
);
assertions += 2;

const updated = updateServicePolicy("ollama-models", { startupPolicy: "manual" });
assert.equal(updated.startupPolicy, "manual");
const policies = getServicePolicies();
assert.equal(policies.find(policy => policy.id === "ollama-models")?.startupPolicy, "manual");
assertions += 2;

const gaming = await setRuntimeMode("Gaming", "runtime mode gaming test");
assert.equal(gaming.state.mode, "Gaming");
assert.ok(Array.isArray(gaming.actions), "Gaming mode should return action/skipped evidence without requiring Docker, Ollama, or cloud access");
assertions += 2;

const emergencyActions = await performEmergencyStop("runtime mode emergency stop test");
assert.equal(getCurrentRuntimeMode(), "EmergencyStop");
assert.ok(emergencyActions.some(action => action.type === "physical_disable"), "Emergency Stop should disable physical actions");
const physical = assertPhysicalActionsAllowed("test.click");
assert.equal(physical.allowed, false, "Emergency Stop should deny physical action execution");
assertions += 3;

await setRuntimeMode("Lightweight", "runtime mode test cleanup");
assert.equal(assertPhysicalActionsAllowed("test.cleanup").allowed, true, "Leaving Emergency Stop should restore physical action availability");
assertions += 1;

console.log(`runtime-mode.test.ts passed (${assertions} assertions)`);
