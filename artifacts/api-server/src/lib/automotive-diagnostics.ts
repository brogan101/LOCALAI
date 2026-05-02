import { createHash, randomUUID } from "node:crypto";
import { sqlite } from "../db/database.js";
import { createApprovalRequest, verifyApprovedRequest, type ApprovalRequest } from "./approval-queue.js";
import { createDigitalTwinEntity, getDigitalTwinEntity } from "./digital-twin.js";
import { recordAuditEvent } from "./platform-foundation.js";

export const AUTOMOTIVE_SOURCE_OF_TRUTH =
  "lib/automotive-diagnostics.ts + SQLite automotive_vehicle_profiles/automotive_diagnostic_cases/automotive_action_proposals + Digital Twin vehicle refs + Evidence Vault/RAG links";

export type AutomotiveFactStatus = "confirmed" | "user_provided" | "inferred" | "stale" | "unknown" | "not_configured";
export type AutomotiveProviderStatus = "not_configured" | "degraded" | "disabled";
export type AutomotiveActionType =
  | "obd_scan"
  | "can_capture"
  | "clear_dtcs"
  | "actuator_test"
  | "bidirectional_test"
  | "ecu_write"
  | "tune_change"
  | "firmware_flash";

export interface AutomotiveProvider {
  id:
    | "python_obd"
    | "pyobd_reference"
    | "elm327"
    | "elm327_emulator"
    | "savvycan"
    | "ovms"
    | "aces_log_import"
    | "can_interface"
    | "external_vehicle_data";
  name: string;
  category: "obd" | "can" | "ecu_logs" | "telemetry" | "reference" | "external_data";
  status: AutomotiveProviderStatus;
  configured: false;
  executionEnabled: false;
  captureEnabled: false;
  writeEnabled: false;
  externalApiCallsMade: false;
  dataLeavesMachine: false;
  reason: string;
  nextAction: string;
  supportedActions: string[];
}

export interface AutomotiveFact {
  key: string;
  label: string;
  value: string;
  status: AutomotiveFactStatus;
  source: "manual" | "profile" | "evidence" | "import" | "system";
}

export interface VehicleProfile {
  id: string;
  name: string;
  year: string;
  make: string;
  model: string;
  body: string;
  drivetrain: string;
  engine: string;
  transmission: string;
  ecu: string;
  mods: AutomotiveFact[];
  wiringNotes: AutomotiveFact[];
  calibrationNotes: AutomotiveFact[];
  partsList: AutomotiveFact[];
  linkedEvidenceRefs: string[];
  maintenanceLog: Array<Record<string, unknown>>;
  repairLog: Array<Record<string, unknown>>;
  dtcHistory: Array<Record<string, unknown>>;
  liveDataSnapshots: Array<Record<string, unknown>>;
  factStatus: AutomotiveFactStatus;
  privacyClassification: "public" | "normal" | "private" | "sensitive" | "secret";
  digitalTwinEntityId?: string;
  providerStatus: "local" | "not_configured" | "degraded";
  createdAt: string;
  updatedAt: string;
}

export interface DiagnosticPlanStep {
  id: string;
  title: string;
  purpose: string;
  method: string;
  expectedEvidence: string;
  safetyNote: string;
  status: "proposal" | "blocked" | "not_configured";
}

export interface LikelyCause {
  system: string;
  cause: string;
  confidence: number;
  status: "likely" | "possible" | "unknown";
  evidence: string[];
  confirmationTests: string[];
  confirmedFault: false;
}

export interface DiagnosticCase {
  id: string;
  vehicleId: string;
  title: string;
  symptomSummary: string;
  intakeStatus: "proposal" | "draft" | "blocked";
  evidenceRefs: string[];
  dtcs: Array<{ code: string; status: "user_provided" | "imported" | "not_configured"; description?: string }>;
  freezeFrameStatus: "not_configured" | "user_provided" | "unavailable";
  liveDataStatus: "not_configured" | "user_provided" | "unavailable";
  workflow: string[];
  likelyCauses: LikelyCause[];
  confirmedFaults: [];
  testPlan: DiagnosticPlanStep[];
  assumptions: string[];
  partsCannonWarning: string;
  humanVerificationRequired: true;
  repairLogRefs: string[];
  localOnly: true;
  externalApiCallsMade: false;
  createdAt: string;
  updatedAt: string;
}

export interface AutomotiveActionProposal {
  id: string;
  vehicleId: string;
  caseId?: string;
  actionType: AutomotiveActionType;
  status: "proposal" | "approval_required" | "denied" | "not_configured" | "blocked" | "manual_only";
  approvalRequired: boolean;
  approval?: Pick<ApprovalRequest, "id" | "status">;
  executed: false;
  externalApiCallsMade: false;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const PROVIDERS: AutomotiveProvider[] = [
  ["python_obd", "python-OBD", "obd", "OBD-II adapter access is optional and not configured in Phase 18."],
  ["pyobd_reference", "pyOBD reference", "reference", "pyOBD is tracked as a reference path only; no GPL/reference app execution is wired."],
  ["elm327", "ELM327 adapter", "obd", "ELM327 hardware is optional and not configured."],
  ["elm327_emulator", "ELM327 emulator", "obd", "Emulator is represented for development samples only; no emulator process is started."],
  ["savvycan", "SavvyCAN", "can", "SavvyCAN/CAN capture is disabled until explicitly configured for review-only workflows."],
  ["ovms", "OVMS / Open Vehicle Monitoring", "telemetry", "OVMS hardware/telemetry is future/not_configured."],
  ["aces_log_import", "ACES ECU log import", "ecu_logs", "ACES log import is local file/workspace metadata only; no ECU API is configured."],
  ["can_interface", "CAN interface", "can", "CAN interfaces are disabled; no capture or injection occurs."],
  ["external_vehicle_data", "External vehicle data", "external_data", "External automotive data providers are disabled and require later approval."],
].map(([id, name, category, reason]) => ({
  id: id as AutomotiveProvider["id"],
  name,
  category: category as AutomotiveProvider["category"],
  status: id === "pyobd_reference" || id === "external_vehicle_data" ? "disabled" : "not_configured",
  configured: false,
  executionEnabled: false,
  captureEnabled: false,
  writeEnabled: false,
  externalApiCallsMade: false,
  dataLeavesMachine: false,
  reason,
  nextAction: `Configure ${name} in a later approved read-only workflow before use.`,
  supportedActions: ["status", "local_metadata_only"],
}));

let ensured = false;

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stringify(value: unknown): string {
  return JSON.stringify(value ?? null);
}

const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;
const SECRET_PATTERN = /\b(password|token|secret|credential|api[_-]?key|vin|title)\b[:=]?\s*[\w.-]*/gi;

function redactString(value: string): string {
  return value
    .replace(VIN_PATTERN, "[redacted-vin]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(SECRET_PATTERN, "[redacted-private-vehicle-data]");
}

function cleanString(value: unknown, fallback = ""): string {
  return redactString(String(value ?? fallback).trim() || fallback);
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === "string") return cleanString(value);
  if (Array.isArray(value)) return value.slice(0, 100).map(sanitizeUnknown);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[cleanString(key)] = sanitizeUnknown(entry);
    }
    return output;
  }
  return value;
}

function sanitizeRecordArray(input: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 100).map(entry => {
    const sanitized = sanitizeUnknown(entry);
    return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
      ? sanitized as Record<string, unknown>
      : { value: sanitized };
  });
}

function hashPrivate(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function cleanFactStatus(value: unknown, fallback: AutomotiveFactStatus = "unknown"): AutomotiveFactStatus {
  return (["confirmed", "user_provided", "inferred", "stale", "unknown", "not_configured"] as const).includes(value as AutomotiveFactStatus)
    ? value as AutomotiveFactStatus
    : fallback;
}

function fact(key: string, label: string, value: string, status: AutomotiveFactStatus = "user_provided"): AutomotiveFact {
  return { key, label, value, status, source: "profile" };
}

function sanitizeFacts(input: unknown, fallback: AutomotiveFact[] = []): AutomotiveFact[] {
  if (!Array.isArray(input)) return fallback;
  return input.slice(0, 100).map((entry, index) => {
    const item = typeof entry === "object" && entry !== null ? entry as Record<string, unknown> : {};
    return {
      key: cleanString(item["key"], `fact_${index}`),
      label: cleanString(item["label"], cleanString(item["key"], `Fact ${index + 1}`)),
      value: cleanString(item["value"], ""),
      status: cleanFactStatus(item["status"], "user_provided"),
      source: (["manual", "profile", "evidence", "import", "system"] as const).includes(item["source"] as AutomotiveFact["source"])
        ? item["source"] as AutomotiveFact["source"]
        : "manual",
    };
  });
}

export function ensureAutomotiveTables(): void {
  if (ensured) return;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS automotive_vehicle_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      year TEXT NOT NULL DEFAULT 'unknown',
      make TEXT NOT NULL DEFAULT 'unknown',
      model TEXT NOT NULL DEFAULT 'unknown',
      body TEXT NOT NULL DEFAULT 'unknown',
      drivetrain TEXT NOT NULL DEFAULT 'unknown',
      engine TEXT NOT NULL DEFAULT 'unknown',
      transmission TEXT NOT NULL DEFAULT 'unknown',
      ecu TEXT NOT NULL DEFAULT 'unknown',
      mods_json TEXT NOT NULL DEFAULT '[]',
      wiring_notes_json TEXT NOT NULL DEFAULT '[]',
      calibration_notes_json TEXT NOT NULL DEFAULT '[]',
      parts_list_json TEXT NOT NULL DEFAULT '[]',
      linked_evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      maintenance_log_json TEXT NOT NULL DEFAULT '[]',
      repair_log_json TEXT NOT NULL DEFAULT '[]',
      dtc_history_json TEXT NOT NULL DEFAULT '[]',
      live_data_snapshots_json TEXT NOT NULL DEFAULT '[]',
      fact_status TEXT NOT NULL DEFAULT 'unknown',
      privacy_classification TEXT NOT NULL DEFAULT 'private',
      digital_twin_entity_id TEXT,
      provider_status TEXT NOT NULL DEFAULT 'local',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS automotive_vehicle_profile_name_idx ON automotive_vehicle_profiles(name);

    CREATE TABLE IF NOT EXISTS automotive_diagnostic_cases (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL,
      title TEXT NOT NULL,
      symptom_summary TEXT NOT NULL DEFAULT '',
      intake_status TEXT NOT NULL DEFAULT 'proposal',
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      dtcs_json TEXT NOT NULL DEFAULT '[]',
      freeze_frame_status TEXT NOT NULL DEFAULT 'not_configured',
      live_data_status TEXT NOT NULL DEFAULT 'not_configured',
      workflow_json TEXT NOT NULL DEFAULT '[]',
      likely_causes_json TEXT NOT NULL DEFAULT '[]',
      confirmed_faults_json TEXT NOT NULL DEFAULT '[]',
      test_plan_json TEXT NOT NULL DEFAULT '[]',
      assumptions_json TEXT NOT NULL DEFAULT '[]',
      parts_cannon_warning TEXT NOT NULL DEFAULT '',
      repair_log_refs_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS automotive_cases_vehicle_idx ON automotive_diagnostic_cases(vehicle_id);

    CREATE TABLE IF NOT EXISTS automotive_action_proposals (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL,
      case_id TEXT,
      action_type TEXT NOT NULL,
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

function rowToVehicle(row: Record<string, unknown>): VehicleProfile {
  return {
    id: String(row["id"]),
    name: String(row["name"]),
    year: String(row["year"] ?? "unknown"),
    make: String(row["make"] ?? "unknown"),
    model: String(row["model"] ?? "unknown"),
    body: String(row["body"] ?? "unknown"),
    drivetrain: String(row["drivetrain"] ?? "unknown"),
    engine: String(row["engine"] ?? "unknown"),
    transmission: String(row["transmission"] ?? "unknown"),
    ecu: String(row["ecu"] ?? "unknown"),
    mods: parseJson<AutomotiveFact[]>(row["mods_json"], []),
    wiringNotes: parseJson<AutomotiveFact[]>(row["wiring_notes_json"], []),
    calibrationNotes: parseJson<AutomotiveFact[]>(row["calibration_notes_json"], []),
    partsList: parseJson<AutomotiveFact[]>(row["parts_list_json"], []),
    linkedEvidenceRefs: parseJson<string[]>(row["linked_evidence_refs_json"], []),
    maintenanceLog: parseJson<Array<Record<string, unknown>>>(row["maintenance_log_json"], []),
    repairLog: parseJson<Array<Record<string, unknown>>>(row["repair_log_json"], []),
    dtcHistory: parseJson<Array<Record<string, unknown>>>(row["dtc_history_json"], []),
    liveDataSnapshots: parseJson<Array<Record<string, unknown>>>(row["live_data_snapshots_json"], []),
    factStatus: cleanFactStatus(row["fact_status"]),
    privacyClassification: (["public", "normal", "private", "sensitive", "secret"] as const).includes(row["privacy_classification"] as VehicleProfile["privacyClassification"])
      ? row["privacy_classification"] as VehicleProfile["privacyClassification"]
      : "private",
    digitalTwinEntityId: row["digital_twin_entity_id"] ? String(row["digital_twin_entity_id"]) : undefined,
    providerStatus: (["local", "not_configured", "degraded"] as const).includes(row["provider_status"] as VehicleProfile["providerStatus"])
      ? row["provider_status"] as VehicleProfile["providerStatus"]
      : "local",
    createdAt: String(row["created_at"]),
    updatedAt: String(row["updated_at"]),
  };
}

function rowToCase(row: Record<string, unknown>): DiagnosticCase {
  return {
    id: String(row["id"]),
    vehicleId: String(row["vehicle_id"]),
    title: String(row["title"]),
    symptomSummary: String(row["symptom_summary"] ?? ""),
    intakeStatus: String(row["intake_status"] ?? "proposal") as DiagnosticCase["intakeStatus"],
    evidenceRefs: parseJson<string[]>(row["evidence_refs_json"], []),
    dtcs: parseJson<DiagnosticCase["dtcs"]>(row["dtcs_json"], []),
    freezeFrameStatus: String(row["freeze_frame_status"] ?? "not_configured") as DiagnosticCase["freezeFrameStatus"],
    liveDataStatus: String(row["live_data_status"] ?? "not_configured") as DiagnosticCase["liveDataStatus"],
    workflow: parseJson<string[]>(row["workflow_json"], []),
    likelyCauses: parseJson<LikelyCause[]>(row["likely_causes_json"], []),
    confirmedFaults: [],
    testPlan: parseJson<DiagnosticPlanStep[]>(row["test_plan_json"], []),
    assumptions: parseJson<string[]>(row["assumptions_json"], []),
    partsCannonWarning: String(row["parts_cannon_warning"] ?? ""),
    humanVerificationRequired: true,
    repairLogRefs: parseJson<string[]>(row["repair_log_refs_json"], []),
    localOnly: true,
    externalApiCallsMade: false,
    createdAt: String(row["created_at"]),
    updatedAt: String(row["updated_at"]),
  };
}

function audit(action: string, target: string, result: "success" | "blocked" | "failed", metadata: Record<string, unknown>): string {
  return recordAuditEvent({
    eventType: "automotive_diagnostics",
    action,
    target,
    result,
    metadata: {
      ...metadata,
      localOnly: true,
      externalApiCallsMade: false,
      privateContentsLogged: false,
    },
  });
}

export function listAutomotiveProviders(): AutomotiveProvider[] {
  return PROVIDERS.map(provider => ({ ...provider, supportedActions: [...provider.supportedActions] }));
}

export function getAutomotiveStatus() {
  ensureAutomotiveTables();
  const vehicles = sqlite.prepare("SELECT COUNT(*) AS count FROM automotive_vehicle_profiles").get() as { count: number };
  const cases = sqlite.prepare("SELECT COUNT(*) AS count FROM automotive_diagnostic_cases").get() as { count: number };
  return {
    sourceOfTruth: AUTOMOTIVE_SOURCE_OF_TRUTH,
    localFirst: true,
    cloudRequired: false,
    externalApiCallsMade: false,
    realHardwareCallsEnabled: false,
    writeActionsEnabled: false,
    providers: listAutomotiveProviders(),
    counts: { vehicles: vehicles.count, diagnosticCases: cases.count },
    hardLimits: {
      noRepairCertainty: true,
      testBeforePartsReplacement: true,
      ecuWritesBlocked: true,
      tuneFlashesBlocked: true,
      firmwareFlashesBlocked: true,
      canInjectionBlocked: true,
      humanVerificationRequired: true,
    },
  };
}

export function createVehicleProfile(input: Partial<VehicleProfile> & { name?: string }): VehicleProfile {
  ensureAutomotiveTables();
  const id = input.id ?? randomUUID();
  const timestamp = nowIso();
  const name = cleanString(input.name, "Unnamed vehicle");
  const privacy = (["public", "normal", "private", "sensitive", "secret"] as const).includes(input.privacyClassification as VehicleProfile["privacyClassification"])
    ? input.privacyClassification!
    : "private";
  const entity = input.digitalTwinEntityId && getDigitalTwinEntity(input.digitalTwinEntityId)
    ? getDigitalTwinEntity(input.digitalTwinEntityId)!
    : createDigitalTwinEntity({
      type: "vehicle",
      name,
      description: "Local automotive vehicle profile.",
      privacyClassification: privacy,
      sensitivity: privacy,
      stateConfidence: input.factStatus === "confirmed" ? "confirmed" : "proposed",
      providerStatus: "local",
      metadata: {
        year: cleanString(input.year, "unknown"),
        make: cleanString(input.make, "unknown"),
        model: cleanString(input.model, "unknown"),
        engine: cleanString(input.engine, "unknown"),
        transmission: cleanString(input.transmission, "unknown"),
        ecu: cleanString(input.ecu, "unknown"),
      },
      sourceRefs: [{ system: "vehicle", kind: "automotive_profile", id, status: input.factStatus === "confirmed" ? "confirmed" : "proposed" }],
    });

  sqlite.prepare(`
    INSERT INTO automotive_vehicle_profiles
      (id, name, year, make, model, body, drivetrain, engine, transmission, ecu,
       mods_json, wiring_notes_json, calibration_notes_json, parts_list_json, linked_evidence_refs_json,
       maintenance_log_json, repair_log_json, dtc_history_json, live_data_snapshots_json,
       fact_status, privacy_classification, digital_twin_entity_id, provider_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      year = excluded.year,
      make = excluded.make,
      model = excluded.model,
      body = excluded.body,
      drivetrain = excluded.drivetrain,
      engine = excluded.engine,
      transmission = excluded.transmission,
      ecu = excluded.ecu,
      mods_json = excluded.mods_json,
      wiring_notes_json = excluded.wiring_notes_json,
      calibration_notes_json = excluded.calibration_notes_json,
      parts_list_json = excluded.parts_list_json,
      linked_evidence_refs_json = excluded.linked_evidence_refs_json,
      maintenance_log_json = excluded.maintenance_log_json,
      repair_log_json = excluded.repair_log_json,
      dtc_history_json = excluded.dtc_history_json,
      live_data_snapshots_json = excluded.live_data_snapshots_json,
      fact_status = excluded.fact_status,
      privacy_classification = excluded.privacy_classification,
      digital_twin_entity_id = excluded.digital_twin_entity_id,
      provider_status = excluded.provider_status,
      updated_at = excluded.updated_at
  `).run(
    id,
    name,
    cleanString(input.year, "unknown"),
    cleanString(input.make, "unknown"),
    cleanString(input.model, "unknown"),
    cleanString(input.body, "unknown"),
    cleanString(input.drivetrain, "unknown"),
    cleanString(input.engine, "unknown"),
    cleanString(input.transmission, "unknown"),
    cleanString(input.ecu, "unknown"),
    stringify(sanitizeFacts(input.mods)),
    stringify(sanitizeFacts(input.wiringNotes)),
    stringify(sanitizeFacts(input.calibrationNotes)),
    stringify(sanitizeFacts(input.partsList)),
    stringify(Array.isArray(input.linkedEvidenceRefs) ? input.linkedEvidenceRefs.slice(0, 100).map(String) : []),
    stringify(sanitizeRecordArray(input.maintenanceLog)),
    stringify(sanitizeRecordArray(input.repairLog)),
    stringify(sanitizeRecordArray(input.dtcHistory)),
    stringify(sanitizeRecordArray(input.liveDataSnapshots)),
    cleanFactStatus(input.factStatus, "user_provided"),
    privacy,
    entity.id,
    "local",
    timestamp,
    timestamp,
  );
  audit("vehicle_profile_upsert", id, "success", {
    profileId: id,
    digitalTwinEntityId: entity.id,
    factStatus: cleanFactStatus(input.factStatus, "user_provided"),
    factCount: sanitizeFacts(input.mods).length + sanitizeFacts(input.partsList).length,
  });
  return getVehicleProfile(id)!;
}

export function getVehicleProfile(id: string): VehicleProfile | null {
  ensureAutomotiveTables();
  const row = sqlite.prepare("SELECT * FROM automotive_vehicle_profiles WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToVehicle(row) : null;
}

export function listVehicleProfiles(limit = 100): VehicleProfile[] {
  ensureAutomotiveTables();
  const rows = sqlite.prepare("SELECT * FROM automotive_vehicle_profiles ORDER BY updated_at DESC LIMIT ?")
    .all(Math.max(1, Math.min(limit, 500))) as Array<Record<string, unknown>>;
  return rows.map(rowToVehicle);
}

export function getOrCreateFoxbodyProfile(): VehicleProfile {
  const existing = getVehicleProfile("foxbody-lq4-4l80e-aces");
  if (existing) return existing;
  return createVehicleProfile({
    id: "foxbody-lq4-4l80e-aces",
    name: "1988 Mustang GT Foxbody LQ4 build",
    year: "1988",
    make: "Ford",
    model: "Mustang GT",
    body: "hatchback",
    drivetrain: "RWD LS-swap",
    engine: "LQ4",
    transmission: "4L80E",
    ecu: "ACES Jackpot ECU",
    factStatus: "user_provided",
    mods: [
      fact("camshaft", "Camshaft", "BTR Stage 3 NA cam"),
      fact("throttle_body", "Throttle Body", "FAST 102mm throttle body"),
      fact("intake", "Intake", "JEGS intake"),
      fact("cooling", "Cooling", "Z28 radiator/fans"),
      fact("fuel_system", "Fuel System", "On3 central fuel hat / 3-pump system"),
    ],
    wiringNotes: [fact("foxbody_wiring_notes", "Foxbody wiring notes", "Workspace field reserved for Foxbody harness, grounds, fan, charging, ECU, and swap notes.")],
    calibrationNotes: [fact("aces_notes", "ACES ECU/log/tuning notes", "File-import/workspace concept only; ECU writes and tune changes are blocked.")],
    partsList: [
      fact("engine", "Engine", "LQ4"),
      fact("transmission", "Transmission", "4L80E"),
      fact("ecu", "ECU", "ACES Jackpot ECU"),
      fact("cam", "Cam", "BTR Stage 3 NA cam"),
      fact("throttle_body", "Throttle Body", "FAST 102mm throttle body"),
      fact("intake", "Intake", "JEGS intake"),
      fact("radiator_fans", "Radiator/Fans", "Z28 radiator/fans"),
      fact("fuel_hat", "Fuel Hat", "On3 central fuel hat / 3-pump system"),
    ],
  });
}

function inferLikelyCauses(symptoms: string, dtcs: DiagnosticCase["dtcs"]): LikelyCause[] {
  const lower = symptoms.toLowerCase();
  const causes: LikelyCause[] = [];
  if (/no.?start|crank|stall|misfire|fuel|spark/i.test(lower) || dtcs.length > 0) {
    causes.push({
      system: "fuel_spark_compression_air",
      cause: "Fuel, spark, compression, or air path fault remains possible until measured.",
      confidence: dtcs.length ? 0.54 : 0.42,
      status: "possible",
      evidence: dtcs.map(dtc => `DTC ${dtc.code}`),
      confirmationTests: ["Verify fuel pressure under crank/run conditions.", "Check spark output and injector pulse.", "Run compression/leakdown if basics pass."],
      confirmedFault: false,
    });
  }
  if (/fan|cool|overheat|temp|charging|voltage|ground/i.test(lower)) {
    causes.push({
      system: "cooling_charging_grounds",
      cause: "Cooling, fan control, charging, or ground integrity issue requires electrical and thermal checks.",
      confidence: 0.48,
      status: "possible",
      evidence: [],
      confirmationTests: ["Command-free fan circuit inspection.", "Voltage drop test grounds and power feeds.", "Compare sensor reading to independent temperature measurement."],
      confirmedFault: false,
    });
  }
  if (/shift|4l80e|trans|converter|line pressure/i.test(lower)) {
    causes.push({
      system: "transmission_4l80e",
      cause: "4L80E wiring, range signal, line pressure, or calibration issue is possible.",
      confidence: 0.45,
      status: "possible",
      evidence: [],
      confirmationTests: ["Inspect transmission connector and grounds.", "Review ACES/trans calibration notes if imported.", "Verify line pressure using manual gauge procedure."],
      confirmedFault: false,
    });
  }
  if (causes.length === 0) {
    causes.push({
      system: "unknown",
      cause: "Insufficient evidence for a confirmed cause.",
      confidence: 0.2,
      status: "unknown",
      evidence: [],
      confirmationTests: ["Complete symptom interview.", "Add DTC/freeze-frame/live-data snapshots when available.", "Link service manual or wiring evidence before ranking parts."],
      confirmedFault: false,
    });
  }
  return causes;
}

function buildTestPlan(symptoms: string, dtcs: DiagnosticCase["dtcs"]): DiagnosticPlanStep[] {
  const steps: DiagnosticPlanStep[] = [
    {
      id: "safety_baseline",
      title: "Safety and baseline inspection",
      purpose: "Confirm the vehicle is safe to inspect and the concern is reproducible.",
      method: "Record symptom conditions, battery state, fluids, visible wiring, grounds, leaks, and recent changes.",
      expectedEvidence: "Human observations and linked photos/docs; no ECU commands.",
      safetyNote: "Use jack stands, ventilation, and human verification for any running or driving checks.",
      status: "proposal",
    },
    {
      id: "evidence_review",
      title: "Evidence review",
      purpose: "Avoid parts replacement before checking docs, wiring, logs, and receipts.",
      method: "Link manuals, build logs, receipts, wiring notes, ACES logs, and prior repair records through Evidence Vault/RAG.",
      expectedEvidence: "Document/evidence refs or explicit unavailable status.",
      safetyNote: "Do not upload local vehicle documents to cloud providers by default.",
      status: "proposal",
    },
    {
      id: "dtc_freeze_frame_review",
      title: "DTC and freeze-frame intake",
      purpose: "Use scan data when available without clearing codes.",
      method: dtcs.length ? "Review user-provided/sample DTCs and freeze-frame fields." : "Provider unavailable; mark DTC/freeze-frame data not_configured.",
      expectedEvidence: dtcs.length ? dtcs.map(dtc => dtc.code).join(", ") : "not_configured",
      safetyNote: "Clearing DTCs and bidirectional tests require separate approval and configured hardware.",
      status: dtcs.length ? "proposal" : "not_configured",
    },
    {
      id: "test_before_parts",
      title: "Test before parts replacement",
      purpose: "Prevent parts-cannon workflow.",
      method: "Run the least-invasive checks first: power/ground, connector, pressure, voltage drop, mechanical baseline, then targeted component tests.",
      expectedEvidence: "Measurements or pass/fail notes before any replacement recommendation.",
      safetyNote: "No repair certainty is claimed without measurement and human verification.",
      status: "proposal",
    },
  ];
  if (/fox|lq4|4l80e|aces|fuel|spark|cool|fan|ground|charging/i.test(symptoms)) {
    steps.push({
      id: "foxbody_ls_swap_checklist",
      title: "Foxbody/LS-swap checklist",
      purpose: "Preserve project-specific LS-swap checks.",
      method: "Review fuel/spark/compression/air, cooling/fan/charging/grounds, 4L80E notes, and ACES log import status.",
      expectedEvidence: "Checklist results and linked build notes.",
      safetyNote: "ACES/tune writes remain blocked; log import is metadata-only.",
      status: "proposal",
    });
  }
  return steps;
}

export function createDiagnosticCase(input: {
  vehicleId: string;
  title?: string;
  symptoms?: string;
  dtcs?: Array<{ code: string; description?: string }>;
  evidenceRefs?: string[];
}): DiagnosticCase {
  ensureAutomotiveTables();
  const vehicle = getVehicleProfile(input.vehicleId);
  if (!vehicle) throw new Error("vehicle profile not found");
  const id = randomUUID();
  const timestamp = nowIso();
  const symptoms = cleanString(input.symptoms, "Symptom intake pending");
  const dtcs = (input.dtcs ?? []).slice(0, 25).map(dtc => ({
    code: cleanString(dtc.code).toUpperCase(),
    description: dtc.description ? cleanString(dtc.description) : undefined,
    status: "user_provided" as const,
  })).filter(dtc => dtc.code);
  const likelyCauses = inferLikelyCauses(symptoms, dtcs);
  const testPlan = buildTestPlan(symptoms, dtcs);
  const workflow = [
    "symptom_intake",
    "safety_baseline",
    "evidence_review",
    "dtc_freeze_frame_intake",
    "live_data_snapshot_import",
    "rank_likely_causes_without_certainty",
    "test_first_plan",
    "repair_log_final_fix_capture",
    "before_after_compare_when_available",
  ];
  sqlite.prepare(`
    INSERT INTO automotive_diagnostic_cases
      (id, vehicle_id, title, symptom_summary, intake_status, evidence_refs_json, dtcs_json,
       freeze_frame_status, live_data_status, workflow_json, likely_causes_json, confirmed_faults_json,
       test_plan_json, assumptions_json, parts_cannon_warning, repair_log_refs_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    vehicle.id,
    cleanString(input.title, "Diagnostic case"),
    symptoms,
    "proposal",
    stringify((input.evidenceRefs ?? []).slice(0, 100).map(String)),
    stringify(dtcs),
    dtcs.length ? "user_provided" : "not_configured",
    "not_configured",
    stringify(workflow),
    stringify(likelyCauses),
    stringify([]),
    stringify(testPlan),
    stringify(["Likely causes are hypotheses until tests confirm them.", "Missing page/scan/live data is marked unavailable or not_configured, not guessed."]),
    "Do not replace parts until the proposed tests create evidence for that part or subsystem.",
    stringify([]),
    timestamp,
    timestamp,
  );
  audit("diagnostic_case_create", id, "success", {
    vehicleId: vehicle.id,
    symptomHash: hashPrivate(symptoms),
    dtcCount: dtcs.length,
    evidenceRefCount: input.evidenceRefs?.length ?? 0,
    likelyCauseCount: likelyCauses.length,
  });
  return getDiagnosticCase(id)!;
}

export function getDiagnosticCase(id: string): DiagnosticCase | null {
  ensureAutomotiveTables();
  const row = sqlite.prepare("SELECT * FROM automotive_diagnostic_cases WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToCase(row) : null;
}

export function listDiagnosticCases(vehicleId?: string, limit = 100): DiagnosticCase[] {
  ensureAutomotiveTables();
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const rows = vehicleId
    ? sqlite.prepare("SELECT * FROM automotive_diagnostic_cases WHERE vehicle_id = ? ORDER BY updated_at DESC LIMIT ?").all(vehicleId, safeLimit)
    : sqlite.prepare("SELECT * FROM automotive_diagnostic_cases ORDER BY updated_at DESC LIMIT ?").all(safeLimit);
  return (rows as Array<Record<string, unknown>>).map(rowToCase);
}

export function addRepairLogEntry(vehicleId: string, input: { caseId?: string; summary?: string; finalFix?: string; evidenceRefs?: string[] }): VehicleProfile {
  const vehicle = getVehicleProfile(vehicleId);
  if (!vehicle) throw new Error("vehicle profile not found");
  const entry = {
    id: randomUUID(),
    caseId: input.caseId,
    summary: cleanString(input.summary, "Repair log entry"),
    finalFixStatus: input.finalFix ? "user_provided" : "unknown",
    finalFix: input.finalFix ? cleanString(input.finalFix) : "unknown",
    evidenceRefs: (input.evidenceRefs ?? []).slice(0, 100).map(String),
    createdAt: nowIso(),
  };
  const repairLog = [...vehicle.repairLog, entry];
  sqlite.prepare("UPDATE automotive_vehicle_profiles SET repair_log_json = ?, updated_at = ? WHERE id = ?")
    .run(stringify(repairLog), nowIso(), vehicle.id);
  if (input.caseId) {
    const caseRecord = getDiagnosticCase(input.caseId);
    if (caseRecord) {
      sqlite.prepare("UPDATE automotive_diagnostic_cases SET repair_log_refs_json = ?, updated_at = ? WHERE id = ?")
        .run(stringify([...caseRecord.repairLogRefs, String(entry.id)]), nowIso(), caseRecord.id);
    }
  }
  audit("repair_log_add", String(entry.id), "success", {
    vehicleId: vehicle.id,
    caseId: input.caseId ?? null,
    evidenceRefCount: entry.evidenceRefs.length,
    finalFixStatus: entry.finalFixStatus,
  });
  return getVehicleProfile(vehicle.id)!;
}

function actionPayload(actionType: AutomotiveActionType, vehicleId: string, caseId?: string): Record<string, unknown> {
  return { actionType, vehicleId, caseId: caseId ?? null, phase: "18" };
}

export function proposeVehicleAction(input: {
  vehicleId: string;
  caseId?: string;
  actionType?: AutomotiveActionType;
  approvalId?: string;
  metadata?: Record<string, unknown>;
}): AutomotiveActionProposal {
  ensureAutomotiveTables();
  const vehicle = getVehicleProfile(input.vehicleId);
  if (!vehicle) {
    return {
      id: randomUUID(),
      vehicleId: input.vehicleId,
      caseId: input.caseId,
      actionType: "obd_scan",
      status: "blocked",
      approvalRequired: false,
      executed: false,
      externalApiCallsMade: false,
      reason: "Vehicle profile not found.",
      metadata: {},
      createdAt: nowIso(),
    };
  }
  const actionType = (["obd_scan", "can_capture", "clear_dtcs", "actuator_test", "bidirectional_test", "ecu_write", "tune_change", "firmware_flash"] as const)
    .includes(input.actionType as AutomotiveActionType)
    ? input.actionType as AutomotiveActionType
    : "obd_scan";
  const id = randomUUID();
  const timestamp = nowIso();
  const payload = actionPayload(actionType, vehicle.id, input.caseId);
  const hardBlocked: AutomotiveActionType[] = ["ecu_write", "tune_change", "firmware_flash"];
  const approvalGated: AutomotiveActionType[] = ["clear_dtcs", "actuator_test", "bidirectional_test", "can_capture"];
  let status: AutomotiveActionProposal["status"] = "not_configured";
  let approvalRequired = false;
  let approval: ApprovalRequest | undefined;
  let reason = "Provider is not configured; no vehicle, OBD, CAN, ECU, or hardware call was made.";

  if (hardBlocked.includes(actionType)) {
    status = "manual_only";
    reason = "ECU write, tune change, and firmware flash actions are manual-only/blocked in Phase 18.";
  } else if (approvalGated.includes(actionType)) {
    approvalRequired = true;
    status = "approval_required";
    reason = "Vehicle action requires explicit approval and configured read-safe hardware; it did not execute.";
    if (input.approvalId) {
      const verification = verifyApprovedRequest(input.approvalId, payload, "automotive_action");
      approval = verification.approval;
      if (!verification.allowed) {
        status = verification.approval?.status === "denied" ? "denied" : "approval_required";
        reason = verification.message;
      } else {
        status = "not_configured";
        reason = "Approved proposal cannot execute because the automotive provider is not configured.";
      }
    } else {
      approval = createApprovalRequest({
        type: "automotive_action",
        title: `Automotive ${actionType} proposal`,
        summary: "Vehicle diagnostic action proposal. No vehicle hardware, OBD, CAN, ECU, tune, or firmware operation executes in Phase 18.",
        riskTier: "tier4_external_communication",
        physicalTier: "p4_approval_required",
        requestedAction: actionType,
        payload,
      });
    }
  } else {
    status = "not_configured";
    reason = "OBD/live-data provider is not configured; use local symptom/DTC/sample intake only.";
  }

  const proposal: AutomotiveActionProposal = {
    id,
    vehicleId: vehicle.id,
    caseId: input.caseId,
    actionType,
    status,
    approvalRequired,
    approval: approval ? { id: approval.id, status: approval.status } : undefined,
    executed: false,
    externalApiCallsMade: false,
    reason,
    metadata: {
      providerStatus: "not_configured",
      writeOperation: ["clear_dtcs", "actuator_test", "bidirectional_test", "ecu_write", "tune_change", "firmware_flash"].includes(actionType),
      ...(sanitizeUnknown(input.metadata ?? {}) as Record<string, unknown>),
    },
    createdAt: timestamp,
  };
  sqlite.prepare(`
    INSERT INTO automotive_action_proposals
      (id, vehicle_id, case_id, action_type, status, approval_required, approval_id, reason, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, vehicle.id, input.caseId ?? null, actionType, status, approvalRequired ? 1 : 0, approval?.id ?? null, reason, stringify(proposal.metadata), timestamp);
  audit("vehicle_action_propose", id, status === "denied" || status === "manual_only" ? "blocked" : "success", {
    vehicleId: vehicle.id,
    caseId: input.caseId ?? null,
    actionType,
    status,
    approvalStatus: approval?.status ?? null,
    executed: false,
  });
  return proposal;
}
