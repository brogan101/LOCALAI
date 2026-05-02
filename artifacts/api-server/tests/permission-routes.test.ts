import assert from "node:assert/strict";
import express from "express";

function setTestPermissions(value: {
  allowAgentExec: boolean;
  allowAgentEdits: boolean;
  allowAgentSelfHeal: boolean;
  allowAgentRefactor: boolean;
}) {
  process.env.LOCALAI_TEST_AGENT_PERMISSIONS = JSON.stringify(value);
}

setTestPermissions({
  allowAgentExec: false,
  allowAgentEdits: false,
  allowAgentSelfHeal: false,
  allowAgentRefactor: false,
});

const [
  contextRoute,
  continueRoute,
  intelligenceRoute,
  modelsRoute,
  remoteRoute,
  rollbackRoute,
  stackRoute,
  studiosRoute,
  systemRoute,
  timetravelRoute,
  updaterRoute,
  updatesRoute,
  workspaceRoute,
  worldguiRoute,
] = await Promise.all([
  import("../src/routes/context.js"),
  import("../src/routes/continue.js"),
  import("../src/routes/intelligence.js"),
  import("../src/routes/models.js"),
  import("../src/routes/remote.js"),
  import("../src/routes/rollback.js"),
  import("../src/routes/stack.js"),
  import("../src/routes/studios.js"),
  import("../src/routes/system.js"),
  import("../src/routes/timetravel.js"),
  import("../src/routes/updater.js"),
  import("../src/routes/updates.js"),
  import("../src/routes/workspace.js"),
  import("../src/routes/worldgui.js"),
]);

const app = express();
app.use(express.json());
app.use(contextRoute.default);
app.use(continueRoute.default);
app.use(intelligenceRoute.default);
app.use(modelsRoute.default);
app.use(remoteRoute.default);
app.use(rollbackRoute.default);
app.use(stackRoute.default);
app.use(studiosRoute.default);
app.use(systemRoute.default);
app.use(timetravelRoute.default);
app.use(updaterRoute.default);
app.use(updatesRoute.default);
app.use(workspaceRoute.default);
app.use(worldguiRoute.default);

function inject(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; payload: any }> {
  return new Promise((resolve, reject) => {
    const request = {
      method,
      url: path,
      originalUrl: path,
      baseUrl: "",
      path,
      headers: { "content-type": "application/json" },
      body,
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

const cases = [
  { method: "POST", path: "/context/read-write-verify", body: { filePath: "x", updatedContent: "" }, permission: "allowAgentEdits" },
  { method: "POST", path: "/continue/rules", body: { filename: "rule.md", content: "x" }, permission: "allowAgentEdits" },
  { method: "POST", path: "/intelligence/refactors/plan-1/execute", body: {}, permission: "allowAgentRefactor" },
  { method: "POST", path: "/models/pull", body: { modelName: "llama3.2:3b" }, permission: "allowAgentExec" },
  { method: "PUT", path: "/models/roles", body: { roles: [] }, permission: "allowAgentEdits" },
  { method: "DELETE", path: "/models/llama3.2%3A3b/delete", permission: "allowAgentExec" },
  { method: "PUT", path: "/remote/network", body: { mode: "local" }, permission: "allowAgentExec" },
  { method: "POST", path: "/remote/auth/rotate", body: {}, permission: "allowAgentExec" },
  { method: "POST", path: "/remote/generate-configs", body: {}, permission: "allowAgentEdits" },
  { method: "POST", path: "/rollback", body: { filePath: "x" }, permission: "allowAgentEdits" },
  { method: "POST", path: "/stack/components/ollama/start", body: {}, permission: "allowAgentExec" },
  { method: "POST", path: "/stack/backup", body: {}, permission: "allowAgentEdits" },
  { method: "POST", path: "/studios/build", body: { name: "x", templateId: "react-vite" }, permission: "allowAgentEdits" },
  { method: "POST", path: "/studios/cad/render", body: { scadScript: "cube(1);" }, permission: "allowAgentExec" },
  { method: "POST", path: "/system/process/kill-switch", body: {}, permission: "allowAgentExec" },
  { method: "POST", path: "/system/cleanup/execute", body: { artifactIds: [] }, permission: "allowAgentEdits" },
  { method: "POST", path: "/system/setup/repair", body: { itemIds: ["git"] }, permission: "allowAgentExec" },
  { method: "POST", path: "/system/sovereign/restart", body: { reason: "test" }, permission: "allowAgentSelfHeal" },
  { method: "POST", path: "/system/windows/focus", body: { pattern: "test" }, permission: "allowAgentExec" },
  { method: "POST", path: "/system/macros", body: { name: "test", steps: [] }, permission: "allowAgentEdits" },
  { method: "POST", path: "/system/macros/test/run", body: {}, permission: "allowAgentExec" },
  { method: "POST", path: "/system/exec/run", body: { command: "echo ok" }, permission: "allowAgentExec" },
  { method: "POST", path: "/system/exec/self-heal", body: { filePath: "x" }, permission: "allowAgentExec" },
  { method: "POST", path: "/timetravel/restore", body: { bakPath: "x.bak" }, permission: "allowAgentEdits" },
  { method: "POST", path: "/updater/update", body: { toolIds: ["git"] }, permission: "allowAgentExec" },
  { method: "POST", path: "/updater/rollback/llama3.2%3A3b", body: {}, permission: "allowAgentEdits" },
  { method: "PATCH", path: "/updater/model-states/llama3.2%3A3b", body: { lifecycle: "stable" }, permission: "allowAgentEdits" },
  { method: "POST", path: "/updater/backup-settings", body: {}, permission: "allowAgentEdits" },
  { method: "PUT", path: "/updater/schedule", body: { checkIntervalSeconds: 3600 }, permission: "allowAgentEdits" },
  { method: "POST", path: "/system/updates/run", body: { itemIds: ["git"] }, permission: "allowAgentExec" },
  { method: "POST", path: "/workspace/projects", body: { name: "x", path: "C:/tmp/localai-test-x" }, permission: "allowAgentEdits" },
  { method: "POST", path: "/worldgui/click", body: { x: 1, y: 1 }, permission: "allowAgentExec" },
  { method: "POST", path: "/worldgui/type", body: { text: "x" }, permission: "allowAgentExec" },
  { method: "POST", path: "/worldgui/keys", body: { keys: "{ENTER}" }, permission: "allowAgentExec" },
];

const allowedProgressCases = [
  { method: "POST", path: "/context/read-write-verify", body: {}, permissions: { allowAgentEdits: true }, expectedStatus: 400 },
  { method: "POST", path: "/continue/rules", body: {}, permissions: { allowAgentEdits: true }, expectedStatus: 400 },
  { method: "POST", path: "/intelligence/refactors/missing-plan/execute", body: {}, permissions: { allowAgentEdits: true, allowAgentRefactor: true }, expectedStatus: 400 },
  { method: "POST", path: "/models/pull", body: {}, permissions: { allowAgentExec: true }, expectedStatus: 400 },
  { method: "POST", path: "/rollback", body: {}, permissions: { allowAgentEdits: true }, expectedStatus: 400 },
  { method: "POST", path: "/stack/components/missing-component/start", body: {}, permissions: { allowAgentExec: true }, expectedStatus: 404 },
  { method: "POST", path: "/studios/build", body: {}, permissions: { allowAgentEdits: true, allowAgentExec: true }, expectedStatus: 400 },
  { method: "POST", path: "/studios/cad/render", body: {}, permissions: { allowAgentExec: true }, expectedStatus: 400 },
  { method: "POST", path: "/system/exec/run", body: {}, permissions: { allowAgentExec: true }, expectedStatus: 400 },
  { method: "POST", path: "/system/exec/self-heal", body: {}, permissions: { allowAgentExec: true, allowAgentSelfHeal: true }, expectedStatus: 400 },
  { method: "POST", path: "/timetravel/restore", body: {}, permissions: { allowAgentEdits: true }, expectedStatus: 400 },
  { method: "POST", path: "/system/updates/run", body: {}, permissions: { allowAgentExec: true }, expectedStatus: 200 },
  { method: "POST", path: "/worldgui/click", body: {}, permissions: { allowAgentExec: true }, expectedStatus: 400 },
  { method: "POST", path: "/worldgui/type", body: {}, permissions: { allowAgentExec: true }, expectedStatus: 400 },
  { method: "POST", path: "/worldgui/keys", body: {}, permissions: { allowAgentExec: true }, expectedStatus: 400 },
];

let assertions = 0;

try {
  setTestPermissions({
    allowAgentExec: false,
    allowAgentEdits: false,
    allowAgentSelfHeal: false,
    allowAgentRefactor: false,
  });
  for (const testCase of cases) {
    const response = await inject(testCase.method, testCase.path, testCase.body);
    assert.equal(response.status, 403, `${testCase.method} ${testCase.path} should be forbidden`);
    assertions += 1;

    const payload = response.payload as { blocked?: boolean; permission?: string; success?: boolean };
    assert.equal(payload.success, false, `${testCase.method} ${testCase.path} should return success=false`);
    assert.equal(payload.blocked, true, `${testCase.method} ${testCase.path} should return blocked=true`);
    assert.equal(payload.permission, testCase.permission, `${testCase.method} ${testCase.path} should identify permission`);
    assertions += 3;
  }

  for (const testCase of allowedProgressCases) {
    setTestPermissions({
      allowAgentExec: false,
      allowAgentEdits: false,
      allowAgentSelfHeal: false,
      allowAgentRefactor: false,
      ...testCase.permissions,
    });
    const response = await inject(testCase.method, testCase.path, testCase.body);
    assert.notEqual(response.status, 403, `${testCase.method} ${testCase.path} should pass permission guard`);
    assert.equal(response.status, testCase.expectedStatus, `${testCase.method} ${testCase.path} should reach route handler`);
    assertions += 2;
  }

  setTestPermissions({
    allowAgentExec: true,
    allowAgentEdits: false,
    allowAgentSelfHeal: false,
    allowAgentRefactor: false,
  });
  const desktopSecret = "SECRET_DESKTOP_INPUT_DO_NOT_LOG";
  const desktopApprovalCases = [
    { path: "/worldgui/type", body: { text: desktopSecret } },
    { path: "/worldgui/keys", body: { keys: desktopSecret } },
  ];
  for (const testCase of desktopApprovalCases) {
    const response = await inject("POST", testCase.path, testCase.body);
    assert.equal(response.status, 202, `${testCase.path} should require approval before execution`);
    assert.equal(response.payload.success, false, `${testCase.path} should not execute immediately`);
    assert.equal(response.payload.approvalRequired, true, `${testCase.path} should flag approvalRequired`);
    assert.doesNotMatch(JSON.stringify(response.payload), /SECRET_DESKTOP_INPUT_DO_NOT_LOG/, `${testCase.path} should not echo raw desktop input`);
    assertions += 4;
  }
} finally {
  delete process.env.LOCALAI_TEST_AGENT_PERMISSIONS;
}

console.log(`permission-routes.test.ts passed (${assertions} assertions)`);
