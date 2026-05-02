/**
 * ROBOTICS LAB — Phase 19 Tests
 * ==============================
 * Covers local robot profiles, simulation plans, optional provider status,
 * robotics action proposals, hard-blocked actions, manual-only tiers, and
 * private data log safety — without touching any real hardware, actuators,
 * ROS nodes, serial/USB ports, or external services.
 */

import assert from "node:assert/strict";

process.env["DATABASE_URL"] = ":memory:";
process.env["LOCALAI_TEST_AGENT_PERMISSIONS"] = JSON.stringify({
  allowAgentExec: true,
  allowAgentEdits: true,
});

import { runMigrations } from "../src/db/migrate.js";
runMigrations();

import { sqlite } from "../src/db/database.js";

for (const table of [
  "robotics_action_proposals",
  "robotics_sim_plans",
  "robotics_robot_profiles",
  "approval_requests",
  "audit_events",
  "job_events",
  "durable_jobs",
  "thought_log",
]) {
  try { sqlite.prepare(`DELETE FROM ${table}`).run(); } catch { /* optional table */ }
}

import {
  ROBOTICS_SOURCE_OF_TRUTH,
  createRobotProfile,
  createSimPlan,
  getRoboticsStatus,
  listRoboticsProviders,
  listRobotProfiles,
  listSimPlans,
  proposeRoboticsAction,
} from "../src/lib/robotics-lab.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
    .then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch((err) => {
      console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    });
}

console.log("\nPhase 19 — Robotics Lab tests\n");

let profileId = "";
let simPlanId = "";

// ── 1. Status / source of truth ──────────────────────────────────────────────

await test("robotics status is local-first with all hardware calls blocked", () => {
  const status = getRoboticsStatus();
  assert.equal(status.sourceOfTruth, ROBOTICS_SOURCE_OF_TRUTH);
  assert.equal(status.localFirst, true);
  assert.equal(status.cloudRequired, false);
  assert.equal(status.externalApiCallsMade, false);
  assert.equal(status.realHardwareCallsEnabled, false);
  assert.equal(status.physicalMotionBlocked, true);
  assert.equal(status.actuatorControlBlocked, true);
  assert.equal(status.serialWriteBlocked, true);
  assert.equal(status.firmwareFlashBlocked, true);
  assert.equal(status.simulatorFirstWorkflow, true);
  assert.equal(status.phase, "19_future_planning_only");
});

// ── 2. All 9 providers are not_configured ────────────────────────────────────

await test("all 9 optional providers are not_configured with no execution/hardware enabled", () => {
  const providers = listRoboticsProviders();
  const expectedIds = [
    "ros2", "moveit2", "nav2", "gazebo", "ignition_gazebo",
    "depth_camera", "ros_bridge", "foxglove", "docker_ros",
  ];
  assert.equal(providers.length, 9, `Expected 9 providers, got ${providers.length}`);
  for (const id of expectedIds) {
    const p = providers.find((prov) => prov.id === id);
    assert.ok(p, `missing provider: ${id}`);
    assert.equal(p!.status, "not_configured");
    assert.equal(p!.configured, false);
    assert.equal(p!.executionEnabled, false);
    assert.equal(p!.hardwareEnabled, false);
    assert.equal(p!.simulationEnabled, false);
    assert.equal(p!.externalApiCallsMade, false);
    assert.equal(p!.dataLeavesMachine, false);
  }
});

// ── 3. Robot profile creation ─────────────────────────────────────────────────

await test("createRobotProfile creates profile with physicalHardwarePresent always false", () => {
  const profile = createRobotProfile({
    name: "Test Arm Robot",
    robotType: "arm",
    simModel: "ur5_sim",
    joints: [
      { name: "shoulder", type: "revolute", status: "user_provided" },
      { name: "elbow",    type: "revolute", status: "user_provided" },
    ],
    sensors: [
      { name: "wrist_camera", type: "rgb",   status: "not_configured" },
    ],
    safetyNotes: ["Never operate arm without physical e-stop present"],
  });
  assert.ok(profile.id);
  assert.equal(profile.name, "Test Arm Robot");
  assert.equal(profile.robotType, "arm");
  assert.equal(profile.physicalHardwarePresent, false, "physicalHardwarePresent must always be false");
  assert.equal(profile.joints.length, 2);
  assert.equal(profile.sensors.length, 1);
  assert.equal(profile.safetyNotes.length, 1);
  profileId = profile.id;
});

await test("listRobotProfiles returns created profiles", () => {
  const profiles = listRobotProfiles();
  assert.ok(profiles.some((p) => p.id === profileId), "Profile not found in list");
  const p = profiles.find((p) => p.id === profileId)!;
  assert.equal(p.physicalHardwarePresent, false);
});

// ── 4. Sim plan creation ─────────────────────────────────────────────────────

await test("createSimPlan produces simulationOnly:true hardwareExecutionBlocked:true", () => {
  const plan = createSimPlan({
    profileId,
    name: "Pick-and-place simulation",
    taskDescription: "Move arm from home to pick position and back",
    motionSequence: [
      { action: "move_to_home",  capabilityTier: "simulation_only", note: "sim only" },
      { action: "move_to_pick",  capabilityTier: "plan_motion",      note: "plan only" },
    ],
  });
  assert.ok(plan.id);
  assert.equal(plan.profileId, profileId);
  assert.equal(plan.simulationOnly, true);
  assert.equal(plan.hardwareExecutionBlocked, true);
  assert.equal(plan.reviewRequired, true);
  assert.equal(plan.localOnly, true);
  assert.equal(plan.externalApiCallsMade, false);
  assert.equal(plan.simulatorStatus, "not_configured");
  assert.equal(plan.poseEstimateStatus, "unknown");
  assert.equal(plan.mapStatus, "unknown");
  assert.equal(plan.safetyState, "unknown");
  assert.equal(plan.motionSequence.length, 2);
  simPlanId = plan.id;
});

await test("listSimPlans returns the created plan", () => {
  const plans = listSimPlans({ profileId });
  assert.ok(plans.some((p) => p.id === simPlanId));
});

// ── 5. execute_motion is permanently blocked ──────────────────────────────────

await test("execute_motion is permanently blocked — no approval unblocks it", () => {
  const proposal = proposeRoboticsAction({
    profileId,
    simPlanId,
    actionType: "execute_motion",
  });
  assert.equal(proposal.executed, false, "executed must always be false");
  assert.equal(proposal.hardwareEnabled, false);
  assert.equal(proposal.externalApiCallsMade, false);
  assert.equal(proposal.status, "blocked");
  assert.ok(
    proposal.reason.toLowerCase().includes("blocked") ||
    proposal.reason.toLowerCase().includes("phase 19"),
    `reason should mention blocked or Phase 19: ${proposal.reason}`,
  );
});

// ── 6. navigate is permanently blocked ───────────────────────────────────────

await test("navigate is permanently blocked in Phase 19", () => {
  const proposal = proposeRoboticsAction({
    profileId,
    actionType: "navigate",
  });
  assert.equal(proposal.status, "blocked");
  assert.equal(proposal.executed, false);
  assert.equal(proposal.hardwareEnabled, false);
});

// ── 7. Manual-only actuator actions ──────────────────────────────────────────

await test("gripper_open is manual_only — API never executes it", () => {
  const proposal = proposeRoboticsAction({ profileId, actionType: "gripper_open" });
  assert.equal(proposal.status, "manual_only");
  assert.equal(proposal.executed, false);
  assert.equal(proposal.hardwareEnabled, false);
  assert.equal(proposal.capabilityTier, "manual_only");
});

await test("arm_move is manual_only — API never executes it", () => {
  const proposal = proposeRoboticsAction({ profileId, actionType: "arm_move" });
  assert.equal(proposal.status, "manual_only");
  assert.equal(proposal.executed, false);
  assert.equal(proposal.capabilityTier, "manual_only");
});

await test("serial_write is manual_only — no serial/USB output occurs", () => {
  const proposal = proposeRoboticsAction({ profileId, actionType: "serial_write" });
  assert.equal(proposal.status, "manual_only");
  assert.equal(proposal.executed, false);
  assert.equal(proposal.hardwareEnabled, false);
});

// ── 8. sim_run is simulation_only (simulator not_configured) ─────────────────

await test("sim_run proposal is simulation_only — simulator not_configured until installed", () => {
  const proposal = proposeRoboticsAction({ profileId, simPlanId, actionType: "sim_run" });
  assert.equal(proposal.status, "simulation_only");
  assert.equal(proposal.executed, false);
  assert.equal(proposal.capabilityTier, "simulation_only");
  assert.ok(
    proposal.reason.toLowerCase().includes("simulat") || proposal.reason.toLowerCase().includes("not_configured"),
    `reason should mention simulation or not_configured: ${proposal.reason}`,
  );
});

// ── 9. read_state is not_configured ──────────────────────────────────────────

await test("read_state is not_configured — no hardware reads occur in Phase 19", () => {
  const proposal = proposeRoboticsAction({ profileId, actionType: "read_state" });
  assert.equal(proposal.status, "not_configured");
  assert.equal(proposal.executed, false);
  assert.equal(proposal.capabilityTier, "read_state");
});

// ── 10. Private data redaction in profile names ───────────────────────────────

await test("private tokens in profile name are redacted — never logged raw", () => {
  const privateInput = "Robot password=hunter2 token=xyz123 api_key=secret camera_frame=raw_data";
  const profile = createRobotProfile({
    name: privateInput,
    robotType: "custom",
  });
  assert.ok(profile.id);
  // The name should have private tokens redacted
  assert.ok(!profile.name.includes("hunter2"), "password value should be redacted");
  assert.ok(!profile.name.includes("xyz123"), "token value should be redacted");
  assert.ok(!profile.name.includes("secret"), "secret value should be redacted");
});

// ── 11. firmware_flash is manual_only ────────────────────────────────────────

await test("firmware_flash is manual_only — no firmware write occurs via API", () => {
  const proposal = proposeRoboticsAction({ profileId, actionType: "firmware_flash" });
  assert.equal(proposal.status, "manual_only");
  assert.equal(proposal.executed, false);
  assert.equal(proposal.hardwareEnabled, false);
});

// ── 12. plan_motion creates approval request but stays not_configured ─────────

await test("plan_motion creates approval_required proposal but provider stays not_configured", () => {
  const proposal = proposeRoboticsAction({ profileId, actionType: "plan_motion" });
  assert.equal(proposal.approvalRequired, true);
  assert.equal(proposal.executed, false);
  assert.equal(proposal.hardwareEnabled, false);
  assert.equal(proposal.externalApiCallsMade, false);
  assert.equal(proposal.capabilityTier, "plan_motion");
  // Status is not_configured because provider is not_configured
  assert.ok(
    proposal.status === "not_configured" || proposal.status === "approval_required",
    `status should be not_configured or approval_required, got: ${proposal.status}`,
  );
  assert.ok(proposal.approval?.id, "approval record should be created");
});

// ── Report ────────────────────────────────────────────────────────────────────

console.log(`\nPhase 19 Robotics Lab: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
