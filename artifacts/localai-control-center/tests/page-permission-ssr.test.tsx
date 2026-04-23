import assert from "node:assert/strict";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import CleanupPage from "../src/pages/Cleanup.js";
import Dashboard from "../src/pages/Dashboard.js";
import ModelsPage from "../src/pages/Models.js";
import RemotePage from "../src/pages/Remote.js";

function renderWithQueryClient(element: React.ReactElement, queryData: Array<[unknown[], unknown]>) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  for (const [key, data] of queryData) client.setQueryData(key, data);
  return renderToStaticMarkup(
    React.createElement(QueryClientProvider, { client }, element),
  );
}

const permissionSettings = {
  allowAgentExec: false,
  allowAgentEdits: false,
  allowAgentSelfHeal: false,
  allowAgentRefactor: false,
};

const modelsHtml = renderWithQueryClient(React.createElement(ModelsPage), [
  [["settings"], { settings: permissionSettings }],
  [["pullStatus"], { jobs: [] }],
  [["modelList"], {
    ollamaReachable: true,
    totalSizeFormatted: "4 GB",
    vramGuard: {
      mode: "safe-mode",
      status: "healthy",
      provider: "test",
      reason: "test",
      safeBudgetBytes: 1,
      reserveBytes: 1,
      detectedAt: new Date(0).toISOString(),
    },
    models: [{
      name: "llama3.2:3b",
      size: 1,
      sizeFormatted: "2 GB",
      estimatedRuntimeBytes: 1,
      estimatedRuntimeFormatted: "2 GB",
      modifiedAt: new Date(0).toISOString(),
      digest: "digest-1",
      isRunning: false,
      lifecycle: "stable",
      routeAffinity: "general",
      runtimeClass: "small",
      sizeVram: 1,
      sizeVramFormatted: "2 GB",
    }],
  }],
]);

assert.match(modelsHtml, /llama3\.2:3b/);
assert.match(modelsHtml, /<button[^>]*disabled=""[^>]*>.*?Load<\/button>/);

const remoteHtml = renderWithQueryClient(React.createElement(RemotePage), [
  [["settings"], { settings: permissionSettings }],
  [["remote-auth-status"], { authorized: false }],
  [["remote-overview"], {
    heartbeat: {
      state: "local",
      mode: "local",
      provider: "none",
      targetBaseUrl: "http://localhost:3001",
      authEnabled: false,
      connectedRemotely: false,
      message: "local",
      lastCheckedAt: new Date(0).toISOString(),
    },
    distributedNode: {
      mode: "local",
      provider: "none",
      localBaseUrl: "http://localhost:3001",
      authEnabled: false,
      heartbeatPath: "/api/remote/heartbeat",
      heartbeatIntervalSeconds: 30,
    },
    settings: {
      browserIdePort: 8080,
      openvscodePort: 3000,
      litellmPort: 4000,
      webuiPort: 7860,
      preferredBrowserIde: "openvscode-server",
      tunnelProvider: "cloudflare",
      hostnameWebUi: "",
      hostnameIde: "",
    },
    tools: [],
    guides: [],
  }],
]);

assert.match(remoteHtml, /Agent edits is disabled\./);
assert.match(remoteHtml, /Agent execution is disabled\./);
assert.match(remoteHtml, /<button[^>]*disabled=""[^>]*>.*?Generate Config Files<\/button>/);
assert.match(remoteHtml, /<button[^>]*disabled=""[^>]*>.*?Rotate token<\/button>/);

Object.defineProperty(globalThis, "location", {
  value: { pathname: "/", search: "", hash: "" },
  configurable: true,
});
Object.defineProperty(globalThis, "history", {
  value: { pushState() {}, replaceState() {} },
  configurable: true,
});

const dashboardHtml = renderWithQueryClient(React.createElement(Dashboard), [
  [["settings"], { settings: permissionSettings }],
  [["model-roles"], {
    installedModels: [],
    roles: [{ role: "general", label: "General", assignedModel: "llama3.2:3b", isValid: false }],
  }],
]);

assert.match(dashboardHtml, /Pull 1 missing stack model/);
assert.match(dashboardHtml, /<button[^>]*disabled=""[^>]*>.*?Pull 1 missing stack model.*?<\/button>/);
assert.match(dashboardHtml, /<button[^>]*disabled=""[^>]*>.*?Kill Switch<\/button>/);

const cleanupHtml = renderWithQueryClient(React.createElement(CleanupPage), [
  [["settings"], { settings: permissionSettings }],
  [["cleanup-scan"], {
    artifacts: [{
      id: "artifact-1",
      path: "C:/Users/test/LocalAI-Tools/old.cmd",
      type: "old-cmd",
      description: "Old command wrapper",
      risk: "safe",
      selected: true,
      sizeBytes: 10,
    }],
    totalFound: 1,
    staleWrappers: 0,
    obsoleteScripts: 1,
    safeCount: 1,
    spaceSavable: "10 B",
    spaceSavableBytes: 10,
  }],
]);

assert.match(cleanupHtml, /Agent edits is disabled\./);
assert.match(cleanupHtml, /Old command wrapper/);

console.log("page-permission-ssr.test.tsx passed (11 assertions)");
