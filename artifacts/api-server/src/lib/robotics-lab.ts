/**
 * Robotics Lab Future Layer — Phase 19
 * ======================================
 * Local-first source of truth for future ROS 2 / MoveIt 2 / Nav2 / Gazebo
 * robotics workflows. This phase is architecture and simulator-first — no
 * real robot hardware moves, no actuators fire, no serial/USB writes occur.
 *
 * Hard limits enforced here and never overridable by profile, config, or approval:
 * - No physical robot motion in Phase 19 (execute_motion is blocked/manual_only)
 * - No actuator control, servo command, motor power, relay toggle, or firmware flash
 * - No serial/USB write to motor controllers or robot hardware
 * - All action evaluations return executed: false (TypeScript literal type)
 * - Simulation outputs are clearly marked simulation_only
 * - Unknown robot pose/map/sensor/safety state is never guessed as confirmed
 */

import { randomUUID } from "node:crypto";
import { sqlite } from "../db/database.js";
import { recordAuditEvent } from "./platform-foundation.js";
import { thoughtLog } from "./thought-log.js";
import { createApprovalRequest, verifyApprovedRequest, type ApprovalRequest } from "./approval-queue.js";

export const ROBOTICS_SOURCE_OF_TRUTH =
  "lib/robotics-lab.ts + SQLite robotics_robot_profiles/robotics_sim_plans/robotics_action_proposals — Phase 19 simulator-first, no real hardware";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RoboticsProviderStatus = "not_configured" | "degraded" | "disabled";

export type RoboticsCapabilityTier =
  | "simulation_only"   // safe: simulation/planning only, never hardware
  | "read_state"        // safe: read robot state/sensor metadata (not_configured until provider ready)
  | "plan_motion"       // safe: motion planning dry-run/proposal only
  | "execute_motion"    // approval_required: hardware motion (blocked in Phase 19)
  | "manual_only";      // physical: unsafe actuator — requires physical human at the robot

export type RoboticsActionType =
  | "sim_run"           // run simulation plan
  | "read_state"        // read joint state / sensor data
  | "plan_motion"       // plan motion (dry-run)
  | "execute_motion"    // execute motion on hardware (approval_required, blocked in Phase 19)
  | "gripper_open"      // gripper actuate open (manual_only)
  | "gripper_close"     // gripper actuate close (manual_only)
  | "arm_move"          // robot arm move (manual_only)
  | "navigate"          // autonomous navigation (blocked in Phase 19)
  | "firmware_flash"    // firmware flash (manual_only)
  | "relay_toggle"      // relay/power toggle (manual_only)
  | "serial_write";     // serial/USB write to hardware (manual_only)

export interface RoboticsProvider {
  id:
    | "ros2"
    | "moveit2"
    | "nav2"
    | "gazebo"
    | "ignition_gazebo"
    | "depth_camera"
    | "ros_bridge"
    | "docker_ros"
    | "foxglove";
  name: string;
  category: "middleware" | "motion_planning" | "navigation" | "simulation" | "sensor" | "visualization" | "bridge";
  status: RoboticsProviderStatus;
  configured: false;
  executionEnabled: false;
  hardwareEnabled: false;
  simulationEnabled: false;
  externalApiCallsMade: false;
  dataLeavesMachine: false;
  reason: string;
  nextAction: string;
  supportedCapabilities: RoboticsCapabilityTier[];
}

export interface RobotProfile {
  id: string;
  name: string;
  robotType: "arm" | "rover" | "drone" | "humanoid" | "custom";
  simModel: string;
  urdfRef: string;           // URDF/XACRO file reference (local workspace path only, never raw)
  joints: Array<{ name: string; type: string; status: "not_configured" | "user_provided" }>;
  sensors: Array<{ name: string; type: string; status: "not_configured" | "user_provided" }>;
  safeWorkspace: string;
  safetyNotes: string[];
  physicalHardwarePresent: false;  // Always false in Phase 19 — no real hardware registered
  providerStatus: "local" | "not_configured";
  linkedDigitalTwinId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoboticsSimPlan {
  id: string;
  profileId: string;
  name: string;
  taskDescription: string;
  planStatus: "draft" | "proposal" | "simulated" | "blocked";
  simulationOnly: true;    // Always true — never represents real hardware execution
  simulatorStatus: "not_configured" | "proposed" | "simulation_only" | "unavailable";
  poseEstimateStatus: "unknown" | "not_configured";  // Never guessed as confirmed
  mapStatus: "unknown" | "not_configured";
  safetyState: "unknown" | "not_configured";
  motionSequence: Array<{
    step: number;
    action: string;
    capabilityTier: RoboticsCapabilityTier;
    note: string;
  }>;
  assumptions: string[];
  hardwareExecutionBlocked: true;  // Always true in Phase 19
  reviewRequired: true;
  localOnly: true;
  externalApiCallsMade: false;
  createdAt: string;
  updatedAt: string;
}

export interface RoboticsActionProposal {
  id: string;
  profileId: string;
  simPlanId?: string;
  actionType: RoboticsActionType;
  capabilityTier: RoboticsCapabilityTier;
  status:
    | "proposal"
    | "simulation_only"
    | "approval_required"
    | "denied"
    | "not_configured"
    | "blocked"
    | "manual_only";
  approvalRequired: boolean;
  approval?: Pick<ApprovalRequest, "id" | "status">;
  executed: false;  // TypeScript literal type — structurally impossible to execute
  hardwareEnabled: false;
  externalApiCallsMade: false;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface RoboticsStatus {
  sourceOfTruth: string;
  localFirst: true;
  cloudRequired: false;
  externalApiCallsMade: false;
  realHardwareCallsEnabled: false;
  physicalMotionBlocked: true;
  actuatorControlBlocked: true;
  serialWriteBlocked: true;
  firmwareFlashBlocked: true;
  simulatorFirstWorkflow: true;
  phase: "19_future_planning_only";
  profileCount: number;
  simPlanCount: number;
  providers: RoboticsProvider[];
}

// ── Providers (all not_configured by default) ─────────────────────────────────

const ROBOTICS_PROVIDERS: RoboticsProvider[] = [
  {
    id: "ros2",
    name: "ROS 2",
    category: "middleware",
    status: "not_configured",
    configured: false,
    executionEnabled: false,
    hardwareEnabled: false,
    simulationEnabled: false,
    externalApiCallsMade: false,
    dataLeavesMachine: false,
    reason: "ROS 2 is optional and not configured in Phase 19. No ROS node, topic, or service is started.",
    nextAction: "Install ROS 2 and configure workspace in a later safety-reviewed phase.",
    supportedCapabilities: ["read_state", "plan_motion"],
  },
  {
    id: "moveit2",
    name: "MoveIt 2",
    category: "motion_planning",
    status: "not_configured",
    configured: false,
    executionEnabled: false,
    hardwareEnabled: false,
    simulationEnabled: false,
    externalApiCallsMade: false,
    dataLeavesMachine: false,
    reason: "MoveIt 2 is optional and not configured. No motion planning execution or hardware control occurs.",
    nextAction: "Configure MoveIt 2 with a validated URDF and workspace bounding box before enabling.",
    supportedCapabilities: ["plan_motion"],
  },
  {
    id: "nav2",
    name: "Nav2",
    category: "navigation",
    status: "not_configured",
    configured: false,
    executionEnabled: false,
    hardwareEnabled: false,
    simulationEnabled: false,
    externalApiCallsMade: false,
    dataLeavesMachine: false,
    reason: "Nav2 navigation stack is optional and not configured. No map, costmap, or navigation goal is sent.",
    nextAction: "Configure Nav2 with a map and safety zones in a later approval-gated phase.",
    supportedCapabilities: ["plan_motion"],
  },
  {
    id: "gazebo",
    name: "Gazebo Classic / Fortress",
    category: "simulation",
    status: "not_configured",
    configured: false,
    executionEnabled: false,
    hardwareEnabled: false,
    simulationEnabled: false,
    externalApiCallsMade: false,
    dataLeavesMachine: false,
    reason: "Gazebo simulator is optional and not configured. No simulation process is started in Phase 19.",
    nextAction: "Install Gazebo and provide a world/model config before simulation runs.",
    supportedCapabilities: ["simulation_only"],
  },
  {
    id: "ignition_gazebo",
    name: "Ignition / Gazebo Harmonic",
    category: "simulation",
    status: "not_configured",
    configured: false,
    executionEnabled: false,
    hardwareEnabled: false,
    simulationEnabled: false,
    externalApiCallsMade: false,
    dataLeavesMachine: false,
    reason: "Ignition Gazebo is optional and not configured. No simulation process starts in Phase 19.",
    nextAction: "Install Ignition Gazebo and provide a world config before simulation runs.",
    supportedCapabilities: ["simulation_only"],
  },
  {
    id: "depth_camera",
    name: "Depth Camera (RealSense / OAK-D / ZED)",
    category: "sensor",
    status: "not_configured",
    configured: false,
    executionEnabled: false,
    hardwareEnabled: false,
    simulationEnabled: false,
    externalApiCallsMade: false,
    dataLeavesMachine: false,
    reason: "Depth camera hardware is optional and not configured. No camera stream, frame capture, or point cloud is accessed.",
    nextAction: "Configure depth camera driver and privacy profile in a later approval-gated phase.",
    supportedCapabilities: ["read_state"],
  },
  {
    id: "ros_bridge",
    name: "ROSBridge / rosbridge_suite",
    category: "bridge",
    status: "not_configured",
    configured: false,
    executionEnabled: false,
    hardwareEnabled: false,
    simulationEnabled: false,
    externalApiCallsMade: false,
    dataLeavesMachine: false,
    reason: "ROSBridge WebSocket is optional and not configured. No ROS topic bridge is started.",
    nextAction: "Configure ROSBridge with scoped topic allowlist and approval gates before use.",
    supportedCapabilities: ["read_state"],
  },
  {
    id: "foxglove",
    name: "Foxglove Studio",
    category: "visualization",
    status: "not_configured",
    configured: false,
    executionEnabled: false,
    hardwareEnabled: false,
    simulationEnabled: false,
    externalApiCallsMade: false,
    dataLeavesMachine: false,
    reason: "Foxglove Studio is optional visualization only. No robot data stream or control is wired.",
    nextAction: "Connect Foxglove to a local ROSBridge instance after configuring in a later phase.",
    supportedCapabilities: ["read_state"],
  },
  {
    id: "docker_ros",
    name: "Docker ROS / Isaac ROS",
    category: "middleware",
    status: "not_configured",
    configured: false,
    executionEnabled: false,
    hardwareEnabled: false,
    simulationEnabled: false,
    externalApiCallsMade: false,
    dataLeavesMachine: false,
    reason: "Docker ROS containers are optional and not configured. No container is started or GPU passthrough configured.",
    nextAction: "Configure Docker ROS workspace in a later approval-gated phase.",
    supportedCapabilities: ["simulation_only", "read_state"],
  },
];

// ── Hard-blocked and manual-only action types ─────────────────────────────────

// These action types are PERMANENTLY BLOCKED in Phase 19 — no approval makes them execute
const PHASE_19_BLOCKED_ACTIONS = new Set<RoboticsActionType>([
  "execute_motion",
  "navigate",
]);

// These require human physically present at the robot — manual_only tier
const MANUAL_ONLY_ACTIONS = new Set<RoboticsActionType>([
  "gripper_open",
  "gripper_close",
  "arm_move",
  "firmware_flash",
  "relay_toggle",
  "serial_write",
]);

// ── Lazy DDL ──────────────────────────────────────────────────────────────────

let ensured = false;

export function ensureRoboticsTables(): void {
  if (ensured) return;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS robotics_robot_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      robot_type TEXT NOT NULL DEFAULT 'custom',
      sim_model TEXT NOT NULL DEFAULT '',
      urdf_ref TEXT NOT NULL DEFAULT '',
      joints_json TEXT NOT NULL DEFAULT '[]',
      sensors_json TEXT NOT NULL DEFAULT '[]',
      safe_workspace TEXT NOT NULL DEFAULT '',
      safety_notes_json TEXT NOT NULL DEFAULT '[]',
      physical_hardware_present INTEGER NOT NULL DEFAULT 0,
      provider_status TEXT NOT NULL DEFAULT 'local',
      linked_digital_twin_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS robotics_profiles_name_idx ON robotics_robot_profiles(name);

    CREATE TABLE IF NOT EXISTS robotics_sim_plans (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      name TEXT NOT NULL,
      task_description TEXT NOT NULL DEFAULT '',
      plan_status TEXT NOT NULL DEFAULT 'proposal',
      simulator_status TEXT NOT NULL DEFAULT 'not_configured',
      pose_estimate_status TEXT NOT NULL DEFAULT 'unknown',
      map_status TEXT NOT NULL DEFAULT 'unknown',
      safety_state TEXT NOT NULL DEFAULT 'unknown',
      motion_sequence_json TEXT NOT NULL DEFAULT '[]',
      assumptions_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS robotics_sim_plans_profile_idx ON robotics_sim_plans(profile_id);

    CREATE TABLE IF NOT EXISTS robotics_action_proposals (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      sim_plan_id TEXT,
      action_type TEXT NOT NULL,
      capability_tier TEXT NOT NULL,
      status TEXT NOT NULL,
      approval_required INTEGER NOT NULL DEFAULT 0,
      approval_id TEXT,
      reason TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
  `);
  ensured = true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; }
  catch { return fallback; }
}

function stringify(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function cleanString(value: unknown, fallback = ""): string {
  const str = String(value ?? fallback).trim();
  // Redact potential private data: camera frames, map data, tokens, coords
  return str
    .replace(/\b(password|token|secret|credential|api[_-]?key|camera[_-]?frame)\b[:=]?\s*[\w.-]*/gi, "[redacted]")
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[redacted-ip]") || fallback;
}

function capabilityTierForAction(actionType: RoboticsActionType): RoboticsCapabilityTier {
  if (PHASE_19_BLOCKED_ACTIONS.has(actionType)) return "execute_motion";
  if (MANUAL_ONLY_ACTIONS.has(actionType)) return "manual_only";
  if (actionType === "sim_run") return "simulation_only";
  if (actionType === "read_state") return "read_state";
  if (actionType === "plan_motion") return "plan_motion";
  return "manual_only";
}

// ── Public API ────────────────────────────────────────────────────────────────

export function listRoboticsProviders(): RoboticsProvider[] {
  return ROBOTICS_PROVIDERS;
}

export function getRoboticsStatus(): RoboticsStatus {
  ensureRoboticsTables();
  const profileCount = (sqlite.prepare("SELECT COUNT(*) AS n FROM robotics_robot_profiles").get() as { n: number })?.n ?? 0;
  const simPlanCount = (sqlite.prepare("SELECT COUNT(*) AS n FROM robotics_sim_plans").get() as { n: number })?.n ?? 0;
  return {
    sourceOfTruth: ROBOTICS_SOURCE_OF_TRUTH,
    localFirst: true,
    cloudRequired: false,
    externalApiCallsMade: false,
    realHardwareCallsEnabled: false,
    physicalMotionBlocked: true,
    actuatorControlBlocked: true,
    serialWriteBlocked: true,
    firmwareFlashBlocked: true,
    simulatorFirstWorkflow: true,
    phase: "19_future_planning_only",
    profileCount,
    simPlanCount,
    providers: ROBOTICS_PROVIDERS,
  };
}

export function createRobotProfile(input: {
  name: string;
  robotType?: RobotProfile["robotType"];
  simModel?: string;
  urdfRef?: string;
  joints?: Array<{ name: string; type: string; status?: string }>;
  sensors?: Array<{ name: string; type: string; status?: string }>;
  safeWorkspace?: string;
  safetyNotes?: string[];
}): RobotProfile {
  ensureRoboticsTables();
  const id = randomUUID();
  const now = nowIso();
  const name = cleanString(input.name, "Unnamed robot");
  const robotType = (["arm","rover","drone","humanoid","custom"] as const).includes(input.robotType as RobotProfile["robotType"])
    ? input.robotType as RobotProfile["robotType"]
    : "custom";
  const joints = (input.joints ?? []).map((j) => ({
    name: cleanString(j.name, "joint"),
    type: cleanString(j.type, "revolute"),
    status: (["not_configured","user_provided"] as const).includes(j.status as "not_configured"|"user_provided")
      ? j.status as "not_configured"|"user_provided"
      : "not_configured",
  }));
  const sensors = (input.sensors ?? []).map((s) => ({
    name: cleanString(s.name, "sensor"),
    type: cleanString(s.type, "unknown"),
    status: (["not_configured","user_provided"] as const).includes(s.status as "not_configured"|"user_provided")
      ? s.status as "not_configured"|"user_provided"
      : "not_configured",
  }));
  const safetyNotes = (input.safetyNotes ?? []).map((n) => cleanString(n));

  sqlite.prepare(`
    INSERT INTO robotics_robot_profiles
      (id, name, robot_type, sim_model, urdf_ref, joints_json, sensors_json,
       safe_workspace, safety_notes_json, physical_hardware_present, provider_status,
       linked_digital_twin_id, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,0,'local',NULL,?,?)
  `).run(
    id, name, robotType,
    cleanString(input.simModel, ""),
    cleanString(input.urdfRef, ""),  // Only workspace-relative paths; never raw camera/map data
    stringify(joints), stringify(sensors),
    cleanString(input.safeWorkspace, ""),
    stringify(safetyNotes),
    now, now,
  );

  thoughtLog.publish({
    category: "system",
    title: "Robotics Robot Profile Created",
    message: `Robot profile created: ${name} (${robotType})`,
    metadata: {
      profileId: id,
      robotType,
      jointCount: joints.length,
      sensorCount: sensors.length,
      physicalHardwarePresent: false,
      // Never log urdfRef paths, sensor data, camera frames, or map data
    },
  });

  return getRobotProfile(id)!;
}

export function listRobotProfiles(filter?: { robotType?: string }): RobotProfile[] {
  ensureRoboticsTables();
  const rows = filter?.robotType
    ? sqlite.prepare("SELECT * FROM robotics_robot_profiles WHERE robot_type = ? ORDER BY created_at").all(filter.robotType)
    : sqlite.prepare("SELECT * FROM robotics_robot_profiles ORDER BY created_at").all();
  return rows.map(rowToProfile);
}

export function getRobotProfile(id: string): RobotProfile | null {
  ensureRoboticsTables();
  const row = sqlite.prepare("SELECT * FROM robotics_robot_profiles WHERE id = ?").get(id);
  if (!row) return null;
  return rowToProfile(row);
}

function rowToProfile(row: unknown): RobotProfile {
  const r = row as Record<string, unknown>;
  return {
    id: String(r["id"]),
    name: String(r["name"]),
    robotType: (r["robot_type"] as RobotProfile["robotType"]) ?? "custom",
    simModel: String(r["sim_model"] ?? ""),
    urdfRef: String(r["urdf_ref"] ?? ""),
    joints: parseJson<RobotProfile["joints"]>(r["joints_json"], []),
    sensors: parseJson<RobotProfile["sensors"]>(r["sensors_json"], []),
    safeWorkspace: String(r["safe_workspace"] ?? ""),
    safetyNotes: parseJson<string[]>(r["safety_notes_json"], []),
    physicalHardwarePresent: false,  // Always false — TypeScript literal
    providerStatus: (r["provider_status"] as RobotProfile["providerStatus"]) ?? "local",
    linkedDigitalTwinId: r["linked_digital_twin_id"] ? String(r["linked_digital_twin_id"]) : undefined,
    createdAt: String(r["created_at"]),
    updatedAt: String(r["updated_at"]),
  };
}

export function createSimPlan(input: {
  profileId: string;
  name: string;
  taskDescription: string;
  motionSequence?: Array<{ action: string; capabilityTier?: RoboticsCapabilityTier; note?: string }>;
  assumptions?: string[];
}): RoboticsSimPlan {
  ensureRoboticsTables();
  const id = randomUUID();
  const now = nowIso();

  const motionSequence = (input.motionSequence ?? []).map((item, i) => ({
    step: i + 1,
    action: cleanString(item.action, "unknown_action"),
    capabilityTier: item.capabilityTier ?? "simulation_only",
    note: cleanString(item.note ?? "simulation_only — not real hardware"),
  }));

  sqlite.prepare(`
    INSERT INTO robotics_sim_plans
      (id, profile_id, name, task_description, plan_status, simulator_status,
       pose_estimate_status, map_status, safety_state, motion_sequence_json,
       assumptions_json, created_at, updated_at)
    VALUES (?,?,?,?,'proposal','not_configured','unknown','unknown','unknown',?,?,?,?)
  `).run(
    id, input.profileId,
    cleanString(input.name, "Unnamed plan"),
    cleanString(input.taskDescription, ""),
    stringify(motionSequence),
    stringify((input.assumptions ?? [
      "Simulator not configured — this is a planning-only proposal",
      "Pose, map, and safety state are unknown — never guessed",
      "No hardware motion occurs in Phase 19",
    ]).map((a) => cleanString(a))),
    now, now,
  );

  recordAuditEvent({
    eventType: "robotics_sim_plan_created",
    action: "create_sim_plan",
    actor: "robotics-lab",
    target: id,
    result: "success",
    metadata: {
      simPlanId: id,
      profileId: input.profileId,
      stepCount: motionSequence.length,
      simulationOnly: true,
      hardwareExecutionBlocked: true,
      // Never log raw sensor data, map data, camera frames, or location data
    },
  });

  return getSimPlan(id)!;
}

export function listSimPlans(filter?: { profileId?: string }): RoboticsSimPlan[] {
  ensureRoboticsTables();
  const rows = filter?.profileId
    ? sqlite.prepare("SELECT * FROM robotics_sim_plans WHERE profile_id = ? ORDER BY created_at").all(filter.profileId)
    : sqlite.prepare("SELECT * FROM robotics_sim_plans ORDER BY created_at").all();
  return rows.map(rowToSimPlan);
}

export function getSimPlan(id: string): RoboticsSimPlan | null {
  ensureRoboticsTables();
  const row = sqlite.prepare("SELECT * FROM robotics_sim_plans WHERE id = ?").get(id);
  if (!row) return null;
  return rowToSimPlan(row);
}

function rowToSimPlan(row: unknown): RoboticsSimPlan {
  const r = row as Record<string, unknown>;
  return {
    id: String(r["id"]),
    profileId: String(r["profile_id"]),
    name: String(r["name"]),
    taskDescription: String(r["task_description"] ?? ""),
    planStatus: (r["plan_status"] as RoboticsSimPlan["planStatus"]) ?? "proposal",
    simulationOnly: true,  // Always true — TypeScript literal
    simulatorStatus: (r["simulator_status"] as RoboticsSimPlan["simulatorStatus"]) ?? "not_configured",
    poseEstimateStatus: (r["pose_estimate_status"] as RoboticsSimPlan["poseEstimateStatus"]) ?? "unknown",
    mapStatus: (r["map_status"] as RoboticsSimPlan["mapStatus"]) ?? "unknown",
    safetyState: (r["safety_state"] as RoboticsSimPlan["safetyState"]) ?? "unknown",
    motionSequence: parseJson<RoboticsSimPlan["motionSequence"]>(r["motion_sequence_json"], []),
    assumptions: parseJson<string[]>(r["assumptions_json"], []),
    hardwareExecutionBlocked: true,  // Always true — TypeScript literal
    reviewRequired: true,
    localOnly: true,
    externalApiCallsMade: false,
    createdAt: String(r["created_at"]),
    updatedAt: String(r["updated_at"]),
  };
}

export function proposeRoboticsAction(input: {
  profileId: string;
  simPlanId?: string;
  actionType: RoboticsActionType;
  approvalId?: string;
  metadata?: Record<string, unknown>;
}): RoboticsActionProposal {
  ensureRoboticsTables();
  const id = randomUUID();
  const now = nowIso();
  const tier = capabilityTierForAction(input.actionType);
  let status: RoboticsActionProposal["status"];
  let approvalRequired = false;
  let approvalRecord: Pick<ApprovalRequest, "id" | "status"> | undefined;
  let reason: string;

  // Permanently blocked in Phase 19 — no approval can unblock
  if (PHASE_19_BLOCKED_ACTIONS.has(input.actionType)) {
    status = "blocked";
    reason = `${input.actionType} is permanently blocked in Phase 19. Physical robot motion requires a future safety-reviewed implementation.`;
  }
  // Manual-only — human must be physically at the robot
  else if (MANUAL_ONLY_ACTIONS.has(input.actionType)) {
    status = "manual_only";
    reason = `${input.actionType} is manual_only. A trained operator must be physically present at the robot; this API never executes these actions.`;
  }
  // Simulation-only — fine, but simulator may be not_configured
  else if (input.actionType === "sim_run") {
    status = "simulation_only";
    reason = "Simulation plan recorded. Simulator status is not_configured until a simulator is installed and configured.";
  }
  // Read state — not_configured until a provider is ready
  else if (input.actionType === "read_state") {
    status = "not_configured";
    reason = "read_state requires a configured ROS 2 / sensor provider. No hardware reads occur in Phase 19.";
  }
  // Plan motion — approval_required (for audit trail; provider also not_configured)
  else if (input.actionType === "plan_motion") {
    // Check approval if provided
    if (input.approvalId) {
      const verification = verifyApprovedRequest(
        input.approvalId,
        { profileId: input.profileId, actionType: "plan_motion" },
        "robotics_plan_motion",
      );
      if (!verification.allowed) {
        status = verification.approval?.status === "denied" ? "denied" : "not_configured";
        reason = verification.message ?? "Approval not verified.";
        sqlite.prepare(`
          INSERT INTO robotics_action_proposals
            (id, profile_id, sim_plan_id, action_type, capability_tier, status,
             approval_required, approval_id, reason, metadata_json, created_at)
          VALUES (?,?,?,?,?,?,0,?,?,?,?)
        `).run(id, input.profileId, input.simPlanId ?? null, input.actionType, tier,
          status, input.approvalId, reason, stringify({}), now);
        return buildProposal(id, input, tier, status, approvalRequired, undefined, reason, now);
      }
    }
    // Create approval request
    approvalRequired = true;
    const approvalReq = createApprovalRequest({
      type: "robotics_plan_motion",
      title: "Robotics motion planning proposal",
      summary: `Motion planning proposal for robot profile ${input.profileId}. Provider not_configured.`,
      riskTier: "tier2_safe_local_execute",
      requestedAction: "plan_motion",
      payload: { profileId: input.profileId, simPlanId: input.simPlanId ?? null, actionType: input.actionType },
    });
    status = "not_configured"; // Provider is not configured even after approval
    approvalRecord = { id: approvalReq.id, status: approvalReq.status };
    reason = "Motion planning proposal created. Provider not_configured until ROS 2/MoveIt 2 is installed and approved.";
  }
  else {
    status = "not_configured";
    reason = "Unknown action type or provider not configured.";
  }

  sqlite.prepare(`
    INSERT INTO robotics_action_proposals
      (id, profile_id, sim_plan_id, action_type, capability_tier, status,
       approval_required, approval_id, reason, metadata_json, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, input.profileId, input.simPlanId ?? null,
    input.actionType, tier, status,
    approvalRequired ? 1 : 0,
    approvalRecord?.id ?? null,
    reason,
    stringify({
      // Metadata logged: IDs, tiers, status only. Never raw sensor/map/camera/location data.
      profileId: input.profileId,
      simPlanId: input.simPlanId,
      capabilityTier: tier,
      hardwareEnabled: false,
      externalApiCallsMade: false,
    }),
    now,
  );

  return buildProposal(id, input, tier, status, approvalRequired, approvalRecord, reason, now);
}

function buildProposal(
  id: string,
  input: { profileId: string; simPlanId?: string; actionType: RoboticsActionType; metadata?: Record<string, unknown> },
  tier: RoboticsCapabilityTier,
  status: RoboticsActionProposal["status"],
  approvalRequired: boolean,
  approval: Pick<ApprovalRequest, "id" | "status"> | undefined,
  reason: string,
  now: string,
): RoboticsActionProposal {
  return {
    id,
    profileId: input.profileId,
    simPlanId: input.simPlanId,
    actionType: input.actionType,
    capabilityTier: tier,
    status,
    approvalRequired,
    approval,
    executed: false,       // TypeScript literal — structurally impossible
    hardwareEnabled: false,
    externalApiCallsMade: false,
    reason,
    metadata: {
      profileId: input.profileId,
      hardwareEnabled: false,
      externalApiCallsMade: false,
      // Never include raw sensor data, camera frames, map data, or private location
    },
    createdAt: now,
  };
}

export function listRoboticsActionProposals(filter?: { profileId?: string }): RoboticsActionProposal[] {
  ensureRoboticsTables();
  const rows = filter?.profileId
    ? sqlite.prepare("SELECT * FROM robotics_action_proposals WHERE profile_id = ? ORDER BY created_at DESC").all(filter.profileId)
    : sqlite.prepare("SELECT * FROM robotics_action_proposals ORDER BY created_at DESC LIMIT 100").all();
  return rows.map(rowToProposal);
}

function rowToProposal(row: unknown): RoboticsActionProposal {
  const r = row as Record<string, unknown>;
  return {
    id: String(r["id"]),
    profileId: String(r["profile_id"]),
    simPlanId: r["sim_plan_id"] ? String(r["sim_plan_id"]) : undefined,
    actionType: String(r["action_type"]) as RoboticsActionType,
    capabilityTier: String(r["capability_tier"]) as RoboticsCapabilityTier,
    status: String(r["status"]) as RoboticsActionProposal["status"],
    approvalRequired: Number(r["approval_required"]) === 1,
    approval: r["approval_id"] ? { id: String(r["approval_id"]), status: "waiting_for_approval" } : undefined,
    executed: false,
    hardwareEnabled: false,
    externalApiCallsMade: false,
    reason: String(r["reason"] ?? ""),
    metadata: parseJson<Record<string, unknown>>(r["metadata_json"], {}),
    createdAt: String(r["created_at"]),
  };
}
