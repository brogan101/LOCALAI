/**
 * project-foreman.test.ts — Phase 24 tests
 *
 * Covers:
 *   - Project create / get / update / archive
 *   - Plan generation creates tasks
 *   - Task lifecycle (todo → in_progress → done)
 *   - Cross-system links add/list/remove
 *   - Final documentation generates valid markdown
 *   - Status snapshot reflects state
 *
 * Tests use the live SQLite (test DB path via env or in-memory).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createProject,
  getProject,
  listProjects,
  updateProject,
  archiveProject,
  generatePlan,
  createTask,
  updateTask,
  listTasks,
  deleteTask,
  addLink,
  listLinks,
  removeLink,
  getStatus,
  getProjectDetail,
  buildFinalDocumentation,
} from "../lib/project-foreman.js";
import { sqlite } from "../db/database.js";

function clearTables() {
  try {
    sqlite.exec(`
      DELETE FROM project_foreman_tasks;
      DELETE FROM project_foreman_links;
      DELETE FROM project_foreman_projects;
    `);
  } catch {
    /* tables may not exist on first run — createProject creates them */
  }
}

describe("project-foreman: projects", () => {
  beforeEach(() => clearTables());

  it("creates and retrieves a project", () => {
    const created = createProject({
      name: "Test project",
      kind: "general",
      goal: "Make sure things work",
    });
    expect(created.id).toMatch(/^pf_/);
    expect(created.status).toBe("draft");
    expect(created.riskLevel).toBe("medium");
    expect(created.knownFacts).toEqual([]);

    const fetched = getProject(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe("Test project");
  });

  it("lists projects with status filter", () => {
    createProject({ name: "Active", kind: "general", goal: "x" });
    const blockedRaw = createProject({ name: "Blocked", kind: "general", goal: "y" });
    updateProject(blockedRaw.id, { status: "blocked" });

    const all = listProjects();
    expect(all.length).toBe(2);
    const onlyBlocked = listProjects({ status: "blocked" });
    expect(onlyBlocked.length).toBe(1);
    expect(onlyBlocked[0].name).toBe("Blocked");
  });

  it("updates fields and tracks updatedAt", async () => {
    const p = createProject({ name: "Original", kind: "general", goal: "g" });
    const before = p.updatedAt;
    await new Promise((r) => setTimeout(r, 10));
    const updated = updateProject(p.id, { name: "Renamed", riskLevel: "high" });
    expect(updated?.name).toBe("Renamed");
    expect(updated?.riskLevel).toBe("high");
    expect(updated?.updatedAt).not.toBe(before);
  });

  it("archives a project", () => {
    const p = createProject({ name: "Done", kind: "general", goal: "g" });
    const archived = archiveProject(p.id, "no longer needed");
    expect(archived?.status).toBe("archived");
    expect(archived?.metadata.archiveReason).toBe("no longer needed");
  });
});

describe("project-foreman: plan generation", () => {
  beforeEach(() => clearTables());

  it("generates a plan and creates tasks", () => {
    const p = createProject({ name: "Plan test", kind: "code_change", goal: "Refactor module X" });
    const result = generatePlan(p.id, {
      brief: "Upgrade module X to use TypeScript strict mode",
      knownFacts: ["Module X has 4 callers"],
      unknowns: ["Whether tests cover all branches"],
      assumptions: ["No public API change required"],
      safetyChecklist: ["Run full test suite before merging"],
      rollbackPlan: "git revert and re-deploy",
      proposedTasks: [
        { title: "Audit callers", description: "Find all consumers of module X" },
        { title: "Add strict types", proposedAction: "Edit source files" },
        { title: "Verify with tests" },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.project.status).toBe("planning");
    expect(result!.project.knownFacts).toContain("Module X has 4 callers");
    expect(result!.tasksCreated.length).toBe(3);
    expect(result!.tasksCreated[0].title).toBe("Audit callers");
    expect(result!.tasksCreated[0].orderIndex).toBe(0);
    expect(result!.tasksCreated[2].orderIndex).toBe(2);
  });
});

describe("project-foreman: tasks", () => {
  beforeEach(() => clearTables());

  it("creates, lists, updates, deletes tasks", () => {
    const p = createProject({ name: "Task test", kind: "general", goal: "g" });
    const t1 = createTask(p.id, { title: "Task 1" });
    const t2 = createTask(p.id, { title: "Task 2" });
    expect(t1.orderIndex).toBe(0);
    expect(t2.orderIndex).toBe(1);

    const list = listTasks(p.id);
    expect(list.length).toBe(2);

    const updated = updateTask(t1.id, { state: "done" });
    expect(updated?.state).toBe("done");
    expect(updated?.completedAt).toBeTruthy();

    expect(deleteTask(t2.id)).toBe(true);
    expect(listTasks(p.id).length).toBe(1);
  });

  it("returns false when deleting non-existent task", () => {
    expect(deleteTask("pft_does_not_exist")).toBe(false);
  });
});

describe("project-foreman: links", () => {
  beforeEach(() => clearTables());

  it("adds, lists by kind filter, and removes links", () => {
    const p = createProject({ name: "Link test", kind: "general", goal: "g" });
    const l1 = addLink(p.id, "evidence", "evi_123", "Service manual page 42");
    const l2 = addLink(p.id, "inventory_item", "inv_456", "M8 hex bolts ×4");

    const all = listLinks(p.id);
    expect(all.length).toBe(2);

    const onlyEvidence = listLinks(p.id, "evidence");
    expect(onlyEvidence.length).toBe(1);
    expect(onlyEvidence[0].targetId).toBe("evi_123");

    expect(removeLink(l2.id)).toBe(true);
    expect(listLinks(p.id).length).toBe(1);
  });
});

describe("project-foreman: detail and stats", () => {
  beforeEach(() => clearTables());

  it("returns full detail including stats", () => {
    const p = createProject({ name: "Detail test", kind: "general", goal: "g" });
    createTask(p.id, { title: "T1" });
    const t2 = createTask(p.id, { title: "T2" });
    const t3 = createTask(p.id, { title: "T3" });
    updateTask(t2.id, { state: "done" });
    updateTask(t3.id, { state: "blocked" });

    addLink(p.id, "evidence", "ev_1", "doc");

    const detail = getProjectDetail(p.id);
    expect(detail).not.toBeNull();
    expect(detail!.tasks.length).toBe(3);
    expect(detail!.links.length).toBe(1);
    expect(detail!.stats.taskTotal).toBe(3);
    expect(detail!.stats.taskDone).toBe(1);
    expect(detail!.stats.taskBlocked).toBe(1);
    expect(detail!.stats.progressPct).toBe(33);
  });
});

describe("project-foreman: status", () => {
  beforeEach(() => clearTables());

  it("counts active vs completed projects", () => {
    const a = createProject({ name: "A", kind: "general", goal: "g" });
    const b = createProject({ name: "B", kind: "general", goal: "g" });
    updateProject(b.id, { status: "completed" });

    const status = getStatus();
    expect(status.totalProjects).toBe(2);
    expect(status.activeProjects).toBeGreaterThanOrEqual(1);
    expect(status.completedProjects).toBe(1);
  });
});

describe("project-foreman: documentation", () => {
  beforeEach(() => clearTables());

  it("builds a valid markdown report", () => {
    const p = createProject({
      name: "Doc test",
      kind: "automotive",
      goal: "Replace strut tower brace",
      riskLevel: "high",
    });
    generatePlan(p.id, {
      brief: "Replace OEM brace with aftermarket",
      knownFacts: ["Bolts: M10×1.25"],
      safetyChecklist: ["Use jack stands"],
      rollbackPlan: "Reinstall OEM brace",
      proposedTasks: [{ title: "Remove old brace" }, { title: "Install new brace" }],
    });
    addLink(p.id, "evidence", "ev_brace_specs", "Brace specs PDF");

    const md = buildFinalDocumentation(p.id);
    expect(md).not.toBeNull();
    expect(md).toContain("# Doc test");
    expect(md).toContain("**Risk level:** high");
    expect(md).toContain("Replace OEM brace");
    expect(md).toContain("Bolts: M10×1.25");
    expect(md).toContain("Use jack stands");
    expect(md).toContain("Remove old brace");
    expect(md).toContain("Brace specs PDF");
    expect(md).toContain("Reinstall OEM brace");
  });

  it("returns null for non-existent project", () => {
    expect(buildFinalDocumentation("pf_does_not_exist")).toBeNull();
  });
});
