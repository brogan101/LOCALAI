import assert from "node:assert/strict";
import {
  getBrowserToolingDiagnostic,
  listRuntimeDiagnostics,
  recordRuntimeDiagnostic,
  runtimeHealthSummary,
} from "../src/lib/runtime-diagnostics.js";
import { parsePnputilDisplayDevices } from "../src/lib/hardware-probe.js";

let assertions = 0;

const blocked = getBrowserToolingDiagnostic("v20.20.2");
assert.equal(blocked.status, "blocked");
assert.match(blocked.message, /below required/);
assert.equal(blocked.details?.requiredNodeVersion, ">=22.22.0");
assertions += 3;

const compatible = getBrowserToolingDiagnostic("v22.22.0");
assert.equal(compatible.status, "ok");
assert.match(compatible.message, /compatible/);
assertions += 2;

recordRuntimeDiagnostic({
  id: "test.degraded",
  component: "runtime-test",
  status: "degraded",
  severity: "warning",
  message: "runtime test degraded",
});
assert.ok(listRuntimeDiagnostics().some((item) => item.id === "test.degraded"));
assert.equal(runtimeHealthSummary().degraded, true);
assertions += 2;

const displayDevices = parsePnputilDisplayDevices(`
Device Description: Parsec Virtual Display Adapter
Device Description: NVIDIA GeForce RTX 5070
`);
assert.deepEqual(displayDevices, ["Parsec Virtual Display Adapter", "NVIDIA GeForce RTX 5070"]);
assertions += 1;

console.log(`runtime-diagnostics.test.ts passed (${assertions} assertions)`);
