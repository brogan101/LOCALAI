import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

type RouteGuardExpectation = {
  file: string;
  snippets: string[];
};

const expectations: RouteGuardExpectation[] = [
  {
    file: "routes/worldgui.ts",
    snippets: [
      `router.post("/worldgui/install", agentExecGuard("install WorldGUI")`,
      `router.get("/worldgui/screenshot", agentExecGuard("capture desktop screenshot")`,
      `router.post("/worldgui/click", agentExecGuard("click desktop coordinates")`,
    ],
  },
  {
    file: "routes/integrations.ts",
    snippets: [
      `router.post("/integrations/:id/install", agentExecGuard`,
      `router.post("/integrations/:id/start", agentExecGuard`,
      `router.post("/integrations/:id/update", agentExecGuard`,
    ],
  },
  {
    file: "routes/plugins.ts",
    snippets: [
      `router.put("/tools/docker-mcp/profile", agentEditsGuard("update Docker MCP Gateway profile")`,
      `router.put("/tools/claw-gateway/profile", agentEditsGuard("update OpenClaw/NemoClaw gateway profile")`,
      `router.post("/tools/claw-gateway/skills/review", agentEditsGuard("review OpenClaw/NemoClaw gateway skill")`,
      `router.put("/tools/:id/enabled", agentEditsGuard`,
      `router.post("/tools/:id/execute", agentExecGuard`,
    ],
  },
  {
    file: "routes/stack.ts",
    snippets: [
      `router.post("/stack/components/:componentId/start", agentExecGuard`,
      `router.post("/stack/components/:componentId/stop", agentExecGuard`,
      `router.post("/stack/github-auth", agentExecGuard("launch GitHub auth")`,
    ],
  },
  {
    file: "routes/remote.ts",
    snippets: [
      `router.put("/remote/network", agentExecGuard("update remote network routing")`,
      `router.post("/remote/auth/rotate", agentExecGuard("rotate remote auth token")`,
      `router.post("/remote/generate-configs", agentEditsGuard("generate remote stack config files")`,
    ],
  },
  {
    file: "routes/workspace.ts",
    snippets: [
      `requireAgentEdits(res, "create workspace project")`,
      `body.bootstrapRepo && !await requireAgentExec(res, "initialize workspace git repo")`,
      `body.openInVscode && !await requireAgentExec(res, "open workspace in VS Code")`,
      `router.post("/workspace/projects/:projectId/open", agentExecGuard`,
      `router.delete("/workspace/projects/:projectId", agentEditsGuard`,
    ],
  },
  {
    file: "routes/studios.ts",
    snippets: [
      `router.post("/studios/build", agentEditsGuard("build studio workspace"), agentExecGuard("build studio workspace")`,
      `router.post("/studios/vibecheck", agentExecGuard("run studio vibecheck")`,
      `router.post("/studios/cad/render", agentExecGuard("render OpenSCAD model")`,
      `router.post("/studios/coding/write-continue-config", agentEditsGuard("write Continue workspace config"), agentExecGuard("open Continue workspace in VS Code")`,
    ],
  },
  {
    file: "routes/system.ts",
    snippets: [
      `router.post("/system/exec/run", async (req, res) => {`,
      `requireExecPermission(res, "run shell command")`,
      `router.post("/system/exec/self-heal", async (req, res) => {`,
      `requireAgentSelfHeal(res, "run self-healing file execution")`,
    ],
  },
  {
    file: "routes/models.ts",
    snippets: [
      `router.post("/pull", agentExecGuard("pull model")`,
      `router.put("/models/roles", agentEditsGuard("update model role assignments")`,
      `router.post("/models/pull", agentExecGuard("pull model")`,
      `router.post("/models/load", agentExecGuard("load model into VRAM")`,
      `router.post("/models/stop", agentExecGuard("unload model from VRAM")`,
      `router.delete("/models/:modelName/delete", agentExecGuard`,
    ],
  },
  {
    file: "routes/context.ts",
    snippets: [
      `router.post("/context/read-write-verify", agentEditsGuard("apply context read-write-verify edit")`,
    ],
  },
  {
    file: "routes/continue.ts",
    snippets: [
      `router.post("/continue/rules", agentEditsGuard("save Continue rule")`,
      `router.delete("/continue/rules/:filename", agentEditsGuard`,
    ],
  },
  {
    file: "routes/intelligence.ts",
    snippets: [
      `router.post("/intelligence/refactors/:planId/execute", agentRefactorGuard`,
      `agentEditsGuard((req) => \`execute refactor plan`,
    ],
  },
  {
    file: "routes/rollback.ts",
    snippets: [
      `router.post("/rollback", agentEditsGuard("rollback file from backup")`,
    ],
  },
  {
    file: "routes/timetravel.ts",
    snippets: [
      `router.post("/timetravel/restore", agentEditsGuard("restore time-travel backup")`,
    ],
  },
  {
    file: "routes/updater.ts",
    snippets: [
      `router.post("/updater/update", agentExecGuard("run updater")`,
    ],
  },
  {
    file: "routes/updates.ts",
    snippets: [
      `router.post("/system/updates/run", agentExecGuard("run system updates")`,
    ],
  },
];

let assertionCount = 0;

for (const expectation of expectations) {
  const sourceUrl = new URL(`../src/${expectation.file}`, import.meta.url);
  const source = await readFile(sourceUrl, "utf-8");
  for (const snippet of expectation.snippets) {
    assert.ok(
      source.includes(snippet),
      `Expected ${expectation.file} to include guard snippet: ${snippet}`,
    );
    assertionCount += 1;
  }
}

console.log(`route-guard-coverage.test.ts passed (${assertionCount} assertions)`);
