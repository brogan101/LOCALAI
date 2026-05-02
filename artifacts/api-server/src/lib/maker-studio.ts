/**
 * Maker Studio foundation for Phase 13A.
 *
 * This module is a local control/model layer only. It records projects,
 * materials, CAD artifact metadata, integration status, and physical-action
 * proposals without starting tools, slicing, sending G-code, or controlling
 * hardware.
 */

import { createHash, randomUUID } from "crypto";
import { sqlite } from "../db/database.js";
import { createApprovalRequest, getApprovalRequest, type ApprovalRequest, type PhysicalTier } from "./approval-queue.js";
import { recordAuditEvent } from "./platform-foundation.js";

export const MAKER_STUDIO_SOURCE_OF_TRUTH =
  "lib/maker-studio.ts + SQLite maker_projects/maker_materials/maker_cad_artifacts + approval_requests/audit_events";

export type MakerProjectType =
  | "cad"
  | "3d_print"
  | "cnc"
  | "laser"
  | "electronics"
  | "shop"
  | "other";

export type MakerProjectStatus = "draft" | "planning" | "ready_for_review" | "blocked" | "archived";

export type MakerSafetyTier =
  | "read_only"
  | "simulate"
  | "prepare_queue"
  | "approval_required_run"
  | "manual_only_at_machine";

export type MakerIntegrationStatus = "disabled" | "not_configured" | "degraded";
export type MakerCadProviderStatus = "disabled" | "not_installed" | "not_configured" | "ready" | "error" | "degraded";
export type MakerCadProviderKind =
  | "freecad_mcp"
  | "cad_as_code"
  | "openscad_style"
  | "text_to_cad_cloud"
  | "kicad_mcp";
export type MakerCadDesignKind = "cadquery" | "build123d" | "openscad" | "freecad_macro" | "kicad_project";
export type MakerPrintProviderStatus = "disabled" | "not_installed" | "not_configured" | "ready" | "error" | "degraded";
export type MakerPrintProviderKind =
  | "slicer"
  | "printer_api"
  | "printer_ui"
  | "printer_farm"
  | "material_inventory"
  | "failure_monitoring";
export type MakerMachineProviderStatus = "disabled" | "not_installed" | "not_configured" | "ready" | "error" | "degraded";
export type MakerMachineProviderKind =
  | "cam"
  | "cnc_controller"
  | "cnc_sender"
  | "laser_workflow"
  | "electronics_bench"
  | "serial_usb";
export type MakerMachineOperationType =
  | "cam_setup"
  | "cnc_milling"
  | "laser_cutting"
  | "laser_engraving"
  | "electronics_bench"
  | "firmware_review"
  | "simulation";

export interface MakerSafetyPolicy {
  id: MakerSafetyTier;
  label: string;
  physicalTier: PhysicalTier;
  approvalRequired: boolean;
  executionAllowed: boolean;
  description: string;
}

export interface MakerIntegration {
  id: string;
  name: string;
  category: "cad" | "electronics" | "slicer" | "printer" | "telemetry" | "inventory" | "cnc_laser";
  status: MakerIntegrationStatus;
  configured: boolean;
  detected: boolean;
  executionEnabled: false;
  startupPolicy: "disabled";
  reason: string;
  nextAction: string;
}

export interface MakerCadProvider {
  id: string;
  name: string;
  kind: MakerCadProviderKind;
  localFirst: boolean;
  cloudProvider: boolean;
  apiKeyRequired: boolean;
  status: MakerCadProviderStatus;
  configured: boolean;
  detected: boolean;
  proposalOnly: true;
  executionEnabled: false;
  dataLeavesMachine: false;
  approvalRequiredForExecution: boolean;
  safeWorkspaceRequired: boolean;
  supportedActions: string[];
  reason: string;
  nextAction: string;
}

export interface MakerPrintProvider {
  id: string;
  name: string;
  kind: MakerPrintProviderKind;
  localFirst: boolean;
  apiKeyRequired: boolean;
  status: MakerPrintProviderStatus;
  configured: boolean;
  detected: boolean;
  proposalOnly: true;
  executionEnabled: false;
  dataLeavesMachine: false;
  approvalRequiredForExecution: boolean;
  supportedActions: string[];
  reason: string;
  nextAction: string;
}

export interface MakerMachineProvider {
  id: string;
  name: string;
  kind: MakerMachineProviderKind;
  localFirst: boolean;
  apiKeyRequired: boolean;
  status: MakerMachineProviderStatus;
  configured: boolean;
  detected: boolean;
  proposalOnly: true;
  executionEnabled: false;
  dataLeavesMachine: false;
  hardwareWriteEnabled: false;
  approvalRequiredForExecution: boolean;
  physicalConfirmationRequired: boolean;
  manualOnlyDangerousActions: true;
  supportedActions: string[];
  reason: string;
  nextAction: string;
}

export interface MakerDesignProposalInput {
  projectId?: string;
  providerId?: string;
  designKind?: MakerCadDesignKind;
  targetFileName?: string;
  units?: string;
  dimensions?: Record<string, number | string>;
  constraints?: string[];
  assumptions?: string[];
  material?: MakerMaterialRef;
  previewIntent?: string;
  exportTargets?: string[];
  validationSteps?: string[];
  riskNotes?: string[];
}

export interface MakerDesignProposal {
  success: true;
  status: "proposal";
  executed: false;
  proposalMode: "review" | "dry_run";
  provider: MakerCadProvider;
  artifact: MakerCadArtifact;
  metadata: {
    targetFileNames: string[];
    workspaceRelativePath: string;
    scriptLanguage: string;
    designKind: MakerCadDesignKind;
    units: string;
    dimensions: Record<string, number | string>;
    constraints: string[];
    assumptions: string[];
    materialAssumptions: MakerMaterialRef;
    boundingBox: { status: "unavailable" | "estimated_from_parameters"; units: string; dimensions: Record<string, number | string> };
    previewIntent: string;
    exportTargets: string[];
    validationSteps: string[];
    riskNotes: string[];
    reviewRequired: true;
    physicallySafeClaimed: false;
    manufacturableClaimed: false;
    executionEnabled: false;
    toolExecutionAttempted: false;
    dataLeavesMachine: false;
    cloudRequired: false;
    scriptStored: false;
    scriptPreview: string[];
  };
  reason: string;
}

export interface MakerSlicingProposalInput {
  projectId?: string;
  providerId?: string;
  designArtifactId?: string;
  sourceModel?: MakerFileRef;
  targetFileName?: string;
  printerProfile?: string;
  material?: MakerMaterialRef;
  layerHeightMm?: number;
  nozzleMm?: number;
  infillPercent?: number;
}

export interface MakerFilamentCheck {
  status: "manual_review" | "blocked" | "not_configured";
  providerId: "spoolman";
  providerStatus: MakerPrintProviderStatus;
  materialName: string;
  available: "unverified" | false;
  blocksQueue: boolean;
  reason: string;
}

export interface MakerSlicingProposal {
  success: true;
  status: "proposal";
  executed: false;
  proposalMode: "dry_run" | "config_validation";
  provider: MakerPrintProvider;
  artifact: MakerCadArtifact;
  materialCheck: MakerFilamentCheck;
  metadata: {
    sourceDesignArtifactId?: string;
    sourceModelHash?: string;
    targetFileNames: string[];
    workspaceRelativePath: string;
    printerProfile: string;
    material: MakerMaterialRef;
    layerHeightMm: number;
    nozzleMm: number;
    infillPercent: number;
    configValidationStatus: "not_configured" | "proposal_only";
    reviewRequired: true;
    toolExecutionAttempted: false;
    realFileSliced: false;
    fileUploaded: false;
    gcodeGenerated: false;
    dataLeavesMachine: false;
    cloudRequired: false;
    physicallySafeClaimed: false;
    manufacturableClaimed: false;
    validationSteps: string[];
    riskNotes: string[];
  };
  reason: string;
}

export interface MakerPrintWorkflowResult extends MakerActionResult {
  provider?: MakerPrintProvider;
  materialCheck?: MakerFilamentCheck;
  workflow?: {
    actionType: string;
    proposalMode: "proposal" | "dry_run" | "approval_required";
    apiCallsMade: false;
    fileUploaded: false;
    heaterOrMotorCommandSent: false;
    printQueued: false;
    printStarted: false;
    monitoringActive: false;
  };
}

export interface MakerMachineSetupSheetInput {
  projectId?: string;
  providerId?: string;
  operationType?: MakerMachineOperationType;
  targetFileName?: string;
  machineProfile?: string;
  stock?: MakerMaterialRef & { dimensions?: Record<string, number | string> };
  tool?: {
    name?: string;
    type?: string;
    diameterMm?: number;
    nozzleMm?: number;
    laserPowerWatts?: number;
  };
  workholding?: string;
  coordinateOrigin?: string;
  units?: string;
  speedFeedPowerEstimates?: {
    spindleRpm?: number | string;
    feedRateMmMin?: number | string;
    plungeRateMmMin?: number | string;
    laserPowerPercent?: number | string;
    passCount?: number | string;
  };
  assumptions?: string[];
  ppeNotes?: string[];
  verificationChecklist?: string[];
  simulationStatus?: "not_run" | "unavailable" | "metadata_only" | "review_required";
}

export interface MakerMachineSetupSheet {
  success: true;
  status: "proposal";
  executed: false;
  proposalMode: "dry_run" | "review" | "simulation_metadata";
  provider: MakerMachineProvider;
  artifact: MakerCadArtifact;
  metadata: {
    operationType: MakerMachineOperationType;
    targetFileNames: string[];
    workspaceRelativePath: string;
    machineProfile: string;
    stock: MakerMaterialRef & { dimensions?: Record<string, number | string> };
    tool: Record<string, unknown>;
    workholding: string;
    coordinateOrigin: string;
    units: string;
    speedFeedPowerEstimates: Record<string, unknown>;
    safetyRisks: string[];
    ppeNotes: string[];
    assumptions: string[];
    simulationStatus: "not_run" | "unavailable" | "metadata_only" | "review_required";
    verificationChecklist: string[];
    manualConfirmationRequired: true;
    humanReviewRequired: true;
    machineSideConfirmationRequired: true;
    reviewRequired: true;
    productionReadyClaimed: false;
    machineReadyClaimed: false;
    physicallySafeClaimed: false;
    manufacturableClaimed: false;
    toolpathGenerated: false;
    gcodeGenerated: false;
    gcodeSent: false;
    machineMotionCommandSent: false;
    spindleStarted: false;
    laserFired: false;
    relayOrPowerCommandSent: false;
    firmwareFlashed: false;
    serialOrUsbWriteAttempted: false;
    hardwareControlAttempted: false;
    apiCallsMade: false;
    dataLeavesMachine: false;
    cloudRequired: false;
  };
  reason: string;
}

export interface MakerMachineWorkflowResult extends MakerActionResult {
  provider?: MakerMachineProvider;
  workflow?: {
    actionType: string;
    operationType?: MakerMachineOperationType;
    proposalMode: "proposal" | "dry_run" | "review" | "manual_only";
    apiCallsMade: false;
    toolpathGenerated: false;
    gcodeSent: false;
    machineMotionCommandSent: false;
    spindleStarted: false;
    laserFired: false;
    relayOrPowerCommandSent: false;
    firmwareFlashed: false;
    serialOrUsbWriteAttempted: false;
    hardwareControlAttempted: false;
  };
}

export interface MakerFileRef {
  id: string;
  label: string;
  path?: string;
  hash?: string;
  kind?: string;
}

export interface MakerTarget {
  kind?: "printer" | "cnc" | "laser" | "electronics_bench" | "tool" | "none";
  name?: string;
  deviceId?: string;
  profile?: string;
  status?: "not_configured" | "disabled" | "manual_only" | "proposal_only";
}

export interface MakerMaterialRef {
  id?: string;
  name?: string;
  category?: string;
  properties?: Record<string, unknown>;
}

export interface MakerProject {
  id: string;
  name: string;
  type: MakerProjectType;
  status: MakerProjectStatus;
  safetyTier: MakerSafetyTier;
  physicalTier: PhysicalTier;
  relatedFiles: MakerFileRef[];
  cadFiles: MakerFileRef[];
  slicedFiles: MakerFileRef[];
  target: MakerTarget;
  material: MakerMaterialRef;
  traceability: Record<string, unknown>;
  approvalId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MakerMaterial {
  id: string;
  name: string;
  category: string;
  properties: Record<string, unknown>;
  safetyNotes: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface MakerCadArtifact {
  id: string;
  projectId: string;
  artifactType: string;
  name: string;
  path?: string;
  metadata: Record<string, unknown>;
  safetyTier: MakerSafetyTier;
  status: "proposal" | "draft" | "review_required" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface MakerActionResult {
  success: boolean;
  status: "proposal" | "blocked" | "approval_required" | "not_configured" | "manual_only" | "disabled" | "degraded";
  executed: false;
  approvalRequired: boolean;
  approval?: ApprovalRequest;
  project?: MakerProject;
  integration?: MakerIntegration;
  safetyTier?: MakerSafetyTier;
  physicalTier?: PhysicalTier;
  reason: string;
}

const SAFETY_POLICIES: MakerSafetyPolicy[] = [
  {
    id: "read_only",
    label: "Read-only",
    physicalTier: "p0_sensor_read",
    approvalRequired: false,
    executionAllowed: false,
    description: "Read metadata, files, or device status only.",
  },
  {
    id: "simulate",
    label: "Simulate",
    physicalTier: "p1_suggest",
    approvalRequired: false,
    executionAllowed: false,
    description: "Create dry-run plans and simulation proposals only.",
  },
  {
    id: "prepare_queue",
    label: "Prepare / Queue",
    physicalTier: "p2_prepare_queue",
    approvalRequired: false,
    executionAllowed: false,
    description: "Prepare local proposal metadata; no machine queue is submitted.",
  },
  {
    id: "approval_required_run",
    label: "Approval-required run",
    physicalTier: "p4_approval_required",
    approvalRequired: true,
    executionAllowed: false,
    description: "Any future machine-affecting action must go through approval and still remains disabled in Phase 13A.",
  },
  {
    id: "manual_only_at_machine",
    label: "Manual-only at machine",
    physicalTier: "p5_manual_only_at_machine",
    approvalRequired: true,
    executionAllowed: false,
    description: "Hazardous physical work cannot execute through LOCALAI software.",
  },
];

const MAKER_INTEGRATIONS: MakerIntegration[] = [
  makerIntegration("freecad", "FreeCAD", "cad", "Install and explicitly configure FreeCAD in a later adapter phase."),
  makerIntegration("cadquery-build123d", "CadQuery / build123d", "cad", "Configure a local CAD-as-code runtime in Phase 13B or later."),
  makerIntegration("kicad", "KiCad", "electronics", "Configure KiCad CLI/project paths in a later electronics workflow."),
  makerIntegration("orca-prusa-superslicer", "OrcaSlicer / PrusaSlicer / SuperSlicer", "slicer", "Configure a slicer profile in Phase 13C or later."),
  makerIntegration("octoprint", "OctoPrint", "printer", "Configure an OctoPrint endpoint and approval workflow in Phase 13C or later."),
  makerIntegration("moonraker-mainsail-fluidd", "Moonraker / Mainsail / Fluidd", "printer", "Configure a Moonraker endpoint and approval workflow in Phase 13C or later."),
  makerIntegration("obico", "Obico", "telemetry", "Configure Obico credentials in a later printer telemetry phase."),
  makerIntegration("spoolman", "Spoolman", "inventory", "Configure Spoolman endpoint for filament inventory in a later phase."),
  makerIntegration("cncjs-linuxcnc-fluidnc", "CNCjs / LinuxCNC / FluidNC", "cnc_laser", "Configure CNC controller access only after manual-only safety workflow exists."),
  makerIntegration("freecad-path-cam", "FreeCAD Path / CAM", "cnc_laser", "Configure CAM tooling only after simulation and approval gates exist."),
  makerIntegration("lightburn-style-laser", "LightBurn-style laser workflow", "cnc_laser", "Configure laser workflow references only after manual-only laser safety gates exist."),
  makerIntegration("serial-usb-shop-devices", "Serial / USB shop devices", "cnc_laser", "Configure serial/USB device profiles only in a later hardware-safe workflow."),
  makerIntegration("inventree", "InvenTree", "inventory", "Configure inventory endpoint and credentials in a later approved workflow."),
];

const MAKER_CAD_PROVIDERS: MakerCadProvider[] = [
  cadProvider({
    id: "freecad-mcp",
    name: "FreeCAD MCP",
    kind: "freecad_mcp",
    localFirst: true,
    cloudProvider: false,
    apiKeyRequired: false,
    status: "not_configured",
    reason: "FreeCAD MCP endpoint/command profile is not configured. Phase 13B can draft proposals but cannot control FreeCAD.",
    nextAction: "Configure a local FreeCAD MCP endpoint or command profile, then add approval-gated workspace execution in a later phase.",
    supportedActions: ["inspect", "create_draft", "render_screenshot", "object_list", "safe_export_proposal"],
  }),
  cadProvider({
    id: "cadquery",
    name: "CadQuery",
    kind: "cad_as_code",
    localFirst: true,
    cloudProvider: false,
    apiKeyRequired: false,
    status: "not_configured",
    reason: "CadQuery runtime is optional and not configured. Script proposals are metadata-only and not executed.",
    nextAction: "Configure an approved local Python/CadQuery runtime and safe Maker workspace executor in a later phase.",
    supportedActions: ["generate_script_proposal", "review_parameters", "export_step_proposal", "export_stl_proposal"],
  }),
  cadProvider({
    id: "build123d",
    name: "build123d",
    kind: "cad_as_code",
    localFirst: true,
    cloudProvider: false,
    apiKeyRequired: false,
    status: "not_configured",
    reason: "build123d runtime is optional and not configured. Script proposals are metadata-only and not executed.",
    nextAction: "Configure an approved local Python/build123d runtime and safe Maker workspace executor in a later phase.",
    supportedActions: ["generate_script_proposal", "review_parameters", "export_step_proposal", "export_stl_proposal"],
  }),
  cadProvider({
    id: "openscad-style",
    name: "OpenSCAD-style Script",
    kind: "openscad_style",
    localFirst: true,
    cloudProvider: false,
    apiKeyRequired: false,
    status: "not_configured",
    reason: "OpenSCAD execution is not configured for Maker Studio. LOCALAI can represent a script proposal without invoking OpenSCAD.",
    nextAction: "Configure OpenSCAD CLI under an approved safe Maker workspace before render/export execution is enabled.",
    supportedActions: ["generate_script_proposal", "preview_intent", "export_stl_proposal"],
  }),
  cadProvider({
    id: "gnucleus-text-to-cad",
    name: "gNucleus Text-to-CAD MCP",
    kind: "text_to_cad_cloud",
    localFirst: false,
    cloudProvider: true,
    apiKeyRequired: true,
    status: "disabled",
    reason: "Cloud/API text-to-CAD is disabled by default. Missing explicit configuration, data classification, approval, and API key.",
    nextAction: "Add explicit provider configuration, data-leaves-machine review, and approval in a later workflow.",
    supportedActions: ["disabled_cloud_proposal_only"],
  }),
  cadProvider({
    id: "buildcad-ai",
    name: "BuildCAD AI",
    kind: "text_to_cad_cloud",
    localFirst: false,
    cloudProvider: true,
    apiKeyRequired: true,
    status: "disabled",
    reason: "BuildCAD AI is an optional cloud/account provider and is disabled by default.",
    nextAction: "Verify source/license/account terms, then add explicit provider configuration and approval in a later workflow.",
    supportedActions: ["disabled_cloud_proposal_only"],
  }),
  cadProvider({
    id: "kicad-mcp",
    name: "KiCad MCP / CLI",
    kind: "kicad_mcp",
    localFirst: true,
    cloudProvider: false,
    apiKeyRequired: false,
    status: "not_configured",
    reason: "KiCad MCP/CLI project path is not configured. Phase 13B can link future project metadata but cannot run ERC/DRC/BOM exports.",
    nextAction: "Configure a KiCad project path and approved local MCP/CLI profile in a later electronics workflow.",
    supportedActions: ["link_project_proposal", "erc_drc_report_intake_future", "bom_report_future"],
  }),
];

const MAKER_PRINT_PROVIDERS: MakerPrintProvider[] = [
  printProvider({
    id: "orcaslicer",
    name: "OrcaSlicer",
    kind: "slicer",
    localFirst: true,
    apiKeyRequired: false,
    status: "not_configured",
    reason: "OrcaSlicer CLI/profile is not configured. Phase 13C can only create dry-run/config-validation proposals.",
    nextAction: "Configure a local OrcaSlicer command/profile under an approved Maker workspace in a later executor phase.",
    supportedActions: ["slice_dry_run", "validate_config", "estimate_material_proposal"],
  }),
  printProvider({
    id: "prusa-superslicer",
    name: "PrusaSlicer / SuperSlicer CLI",
    kind: "slicer",
    localFirst: true,
    apiKeyRequired: false,
    status: "not_configured",
    reason: "PrusaSlicer/SuperSlicer CLI is optional and not configured. No slicer process is executed.",
    nextAction: "Configure a local slicer CLI/profile and approval-gated workspace executor in a later phase.",
    supportedActions: ["slice_dry_run", "validate_config", "profile_check"],
  }),
  printProvider({
    id: "octoprint",
    name: "OctoPrint",
    kind: "printer_api",
    localFirst: true,
    apiKeyRequired: true,
    status: "not_configured",
    reason: "OctoPrint endpoint/token is not configured. LOCALAI will not upload files, queue jobs, or start prints.",
    nextAction: "Configure a local OctoPrint profile with secret references, then add approved durable execution later.",
    supportedActions: ["status_read", "queue_proposal", "start_print_approval_required", "pause_resume_cancel_approval_required"],
  }),
  printProvider({
    id: "moonraker-klipper",
    name: "Moonraker / Klipper",
    kind: "printer_api",
    localFirst: true,
    apiKeyRequired: false,
    status: "not_configured",
    reason: "Moonraker/Klipper endpoint is not configured. No printer API calls are made.",
    nextAction: "Configure a local Moonraker endpoint and approval-gated printer profile in a later phase.",
    supportedActions: ["status_read", "queue_proposal", "start_print_approval_required", "heater_motor_approval_required"],
  }),
  printProvider({
    id: "mainsail-fluidd",
    name: "Mainsail / Fluidd profile",
    kind: "printer_ui",
    localFirst: true,
    apiKeyRequired: false,
    status: "not_configured",
    reason: "Mainsail/Fluidd UI profile is not configured and is represented as a reference only.",
    nextAction: "Link a local printer UI profile after Moonraker safety policy is configured.",
    supportedActions: ["profile_reference", "status_reference"],
  }),
  printProvider({
    id: "fdm-monster",
    name: "FDM Monster",
    kind: "printer_farm",
    localFirst: true,
    apiKeyRequired: false,
    status: "disabled",
    reason: "FDM Monster farm control is disabled by default. Fleet actions require a later explicit safety/executor phase.",
    nextAction: "Verify deployment, scope printers, and add approval-gated durable jobs in a later phase.",
    supportedActions: ["disabled_queue_reference"],
  }),
  printProvider({
    id: "spoolman",
    name: "Spoolman",
    kind: "material_inventory",
    localFirst: true,
    apiKeyRequired: false,
    status: "not_configured",
    reason: "Spoolman endpoint is not configured. Filament checks use local project material metadata only and mark inventory unverified.",
    nextAction: "Configure a local Spoolman endpoint/profile before treating inventory as verified.",
    supportedActions: ["filament_check_proposal", "inventory_status"],
  }),
  printProvider({
    id: "obico",
    name: "Obico",
    kind: "failure_monitoring",
    localFirst: true,
    apiKeyRequired: true,
    status: "not_configured",
    reason: "Obico monitoring is not configured. Phase 13C does not fake monitoring state.",
    nextAction: "Configure a self-hosted/local Obico profile with camera/privacy policy before monitoring can be active.",
    supportedActions: ["monitoring_status", "failure_detection_reference"],
  }),
];

const MAKER_MACHINE_PROVIDERS: MakerMachineProvider[] = [
  machineProvider({
    id: "freecad-path-cam",
    name: "FreeCAD Path / CAM",
    kind: "cam",
    localFirst: true,
    apiKeyRequired: false,
    status: "not_configured",
    reason: "FreeCAD Path/CAM is not configured. Phase 13D can create setup-sheet metadata only and never generates live toolpaths.",
    nextAction: "Configure a local FreeCAD Path profile and offline simulation workflow before any approval-gated CAM executor is considered.",
    supportedActions: ["setup_sheet_proposal", "offline_simulation_metadata", "toolpath_review_proposal"],
  }),
  machineProvider({
    id: "cncjs",
    name: "CNCjs",
    kind: "cnc_controller",
    localFirst: true,
    apiKeyRequired: false,
    status: "not_configured",
    reason: "CNCjs endpoint/device profile is not configured. G-code sending, machine motion, and spindle control are manual-only or blocked.",
    nextAction: "Configure a read-only CNCjs profile in a later phase, then add explicit physical confirmation and durable approval checks before any execution.",
    supportedActions: ["status_reference", "setup_sheet_proposal", "send_gcode_manual_only", "machine_motion_manual_only"],
  }),
  machineProvider({
    id: "linuxcnc",
    name: "LinuxCNC",
    kind: "cnc_controller",
    localFirst: true,
    apiKeyRequired: false,
    status: "not_configured",
    reason: "LinuxCNC integration is not configured and normally belongs on dedicated machine hardware, not the gaming PC.",
    nextAction: "Add a separate edge/shop node profile and manual confirmation model in a later hardware phase.",
    supportedActions: ["status_reference", "setup_sheet_proposal", "machine_motion_manual_only", "spindle_manual_only"],
  }),
  machineProvider({
    id: "fluidnc",
    name: "FluidNC",
    kind: "cnc_controller",
    localFirst: true,
    apiKeyRequired: false,
    status: "not_configured",
    reason: "FluidNC serial/network sender profile is not configured. Serial writes and G-code send are disabled.",
    nextAction: "Configure a read-only device profile and physical confirmation workflow in a later phase.",
    supportedActions: ["status_reference", "setup_sheet_proposal", "serial_write_manual_only", "send_gcode_manual_only"],
  }),
  machineProvider({
    id: "bcnc",
    name: "bCNC",
    kind: "cnc_sender",
    localFirst: true,
    apiKeyRequired: false,
    status: "not_configured",
    reason: "bCNC sender integration is not configured. LOCALAI will not start sender tools or stream G-code.",
    nextAction: "Configure local sender status only after machine profiles and physical confirmation policy are available.",
    supportedActions: ["sender_reference", "setup_sheet_proposal", "send_gcode_manual_only"],
  }),
  machineProvider({
    id: "lightburn-style-laser",
    name: "LightBurn-style laser workflow",
    kind: "laser_workflow",
    localFirst: true,
    apiKeyRequired: false,
    status: "not_configured",
    reason: "Laser workflow tooling is not configured. Laser fire, motion, relay, and power commands remain manual-only at the machine.",
    nextAction: "Add a laser profile with PPE/interlock evidence and manual confirmation in a later explicit workflow.",
    supportedActions: ["setup_sheet_proposal", "power_speed_review", "laser_fire_manual_only", "motion_manual_only"],
  }),
  machineProvider({
    id: "kicad-electronics-bench",
    name: "KiCad electronics bench",
    kind: "electronics_bench",
    localFirst: true,
    apiKeyRequired: false,
    status: "not_configured",
    reason: "Electronics bench tooling is not configured. BOM plans and bench checklists are proposal-only; flashing and bench power are disabled.",
    nextAction: "Configure KiCad/BOM/InvenTree read-only sources before any approved bench executor is considered.",
    supportedActions: ["kicad_flow_plan", "bom_export_plan", "inventree_parts_check_not_configured", "firmware_flash_manual_only"],
  }),
  machineProvider({
    id: "serial-usb-devices",
    name: "Serial / USB device providers",
    kind: "serial_usb",
    localFirst: true,
    apiKeyRequired: false,
    status: "disabled",
    reason: "Serial/USB hardware writes are disabled in Phase 13D. LOCALAI cannot write to devices, toggle relays, flash firmware, or control bench equipment.",
    nextAction: "Add device-scoped allowlists, hardware sandboxing, and physical confirmation in a later approved hardware phase.",
    supportedActions: ["read_profile_future", "serial_write_manual_only", "usb_write_manual_only", "firmware_flash_manual_only"],
  }),
];

function cadProvider(input: Omit<MakerCadProvider, "configured" | "detected" | "proposalOnly" | "executionEnabled" | "dataLeavesMachine" | "approvalRequiredForExecution" | "safeWorkspaceRequired">): MakerCadProvider {
  return {
    ...input,
    configured: input.status === "ready",
    detected: false,
    proposalOnly: true,
    executionEnabled: false,
    dataLeavesMachine: false,
    approvalRequiredForExecution: true,
    safeWorkspaceRequired: true,
  };
}

function printProvider(input: Omit<MakerPrintProvider, "configured" | "detected" | "proposalOnly" | "executionEnabled" | "dataLeavesMachine" | "approvalRequiredForExecution">): MakerPrintProvider {
  return {
    ...input,
    configured: input.status === "ready",
    detected: false,
    proposalOnly: true,
    executionEnabled: false,
    dataLeavesMachine: false,
    approvalRequiredForExecution: true,
  };
}

function machineProvider(input: Omit<MakerMachineProvider, "configured" | "detected" | "proposalOnly" | "executionEnabled" | "dataLeavesMachine" | "hardwareWriteEnabled" | "approvalRequiredForExecution" | "physicalConfirmationRequired" | "manualOnlyDangerousActions">): MakerMachineProvider {
  return {
    ...input,
    configured: input.status === "ready",
    detected: false,
    proposalOnly: true,
    executionEnabled: false,
    dataLeavesMachine: false,
    hardwareWriteEnabled: false,
    approvalRequiredForExecution: true,
    physicalConfirmationRequired: true,
    manualOnlyDangerousActions: true,
  };
}

function makerIntegration(id: string, name: string, category: MakerIntegration["category"], nextAction: string): MakerIntegration {
  return {
    id,
    name,
    category,
    status: "not_configured",
    configured: false,
    detected: false,
    executionEnabled: false,
    startupPolicy: "disabled",
    reason: "Phase 13A is a foundation/control layer. This integration is not configured and cannot execute.",
    nextAction,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const SECRET_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:password|passwd|pwd|secret|token|api[_-]?key|credential|cookie)\s*[:=]\s*[^\s,;]+/gi,
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
];

function redactString(value: string): string {
  let output = value;
  for (const pattern of SECRET_PATTERNS) output = output.replace(pattern, "[redacted]");
  return output.slice(0, 240);
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.slice(0, 25).map(sanitizeValue);
  if (value && typeof value === "object") {
    const safe: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/secret|token|api.?key|credential|cookie|password/i.test(key)) {
        safe[key] = "[redacted]";
      } else {
        safe[key] = sanitizeValue(item);
      }
    }
    return safe;
  }
  return value;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeFileRefs(value: unknown): MakerFileRef[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((entry, index) => {
    const obj = entry && typeof entry === "object" ? entry as Record<string, unknown> : { label: String(entry ?? "") };
    const label = typeof obj["label"] === "string" && obj["label"].trim()
      ? redactString(obj["label"].trim())
      : `file-${index + 1}`;
    const path = typeof obj["path"] === "string" && obj["path"].trim() ? redactString(obj["path"].trim()) : undefined;
    const rawHash = typeof obj["hash"] === "string" ? obj["hash"].trim() : "";
    return {
      id: typeof obj["id"] === "string" && obj["id"].trim() ? obj["id"].trim() : hashText(`${label}:${path ?? index}`).slice(0, 16),
      label,
      path,
      hash: rawHash || (path ? hashText(path) : undefined),
      kind: typeof obj["kind"] === "string" ? redactString(obj["kind"]) : undefined,
    };
  });
}

function normalizeProjectType(value: unknown): MakerProjectType {
  const type = typeof value === "string" ? value.trim() : "";
  return ["cad", "3d_print", "cnc", "laser", "electronics", "shop", "other"].includes(type)
    ? type as MakerProjectType
    : "other";
}

function normalizeProjectStatus(value: unknown): MakerProjectStatus {
  const status = typeof value === "string" ? value.trim() : "";
  return ["draft", "planning", "ready_for_review", "blocked", "archived"].includes(status)
    ? status as MakerProjectStatus
    : "draft";
}

function normalizeSafetyTier(value: unknown, projectType: MakerProjectType = "other"): MakerSafetyTier {
  const tier = typeof value === "string" ? value.trim() : "";
  if (["read_only", "simulate", "prepare_queue", "approval_required_run", "manual_only_at_machine"].includes(tier)) {
    return tier as MakerSafetyTier;
  }
  if (projectType === "cnc" || projectType === "laser") return "manual_only_at_machine";
  if (projectType === "3d_print" || projectType === "electronics") return "simulate";
  return "read_only";
}

function physicalTierForSafety(safetyTier: MakerSafetyTier): PhysicalTier {
  return SAFETY_POLICIES.find(policy => policy.id === safetyTier)?.physicalTier ?? "p1_suggest";
}

function rowToProject(row: Record<string, unknown>): MakerProject {
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    type: row["type"] as MakerProjectType,
    status: row["status"] as MakerProjectStatus,
    safetyTier: row["safety_tier"] as MakerSafetyTier,
    physicalTier: row["physical_tier"] as PhysicalTier,
    relatedFiles: parseJson(row["related_files_json"], [] as MakerFileRef[]),
    cadFiles: parseJson(row["cad_files_json"], [] as MakerFileRef[]),
    slicedFiles: parseJson(row["sliced_files_json"], [] as MakerFileRef[]),
    target: parseJson(row["target_json"], {} as MakerTarget),
    material: parseJson(row["material_json"], {} as MakerMaterialRef),
    traceability: parseJson(row["traceability_json"], {} as Record<string, unknown>),
    approvalId: (row["approval_id"] as string | null) ?? undefined,
    metadata: parseJson(row["metadata_json"], {} as Record<string, unknown>),
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

function rowToMaterial(row: Record<string, unknown>): MakerMaterial {
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    category: row["category"] as string,
    properties: parseJson(row["properties_json"], {} as Record<string, unknown>),
    safetyNotes: parseJson(row["safety_notes_json"], [] as string[]),
    source: row["source"] as string,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

function rowToCadArtifact(row: Record<string, unknown>): MakerCadArtifact {
  return {
    id: row["id"] as string,
    projectId: row["project_id"] as string,
    artifactType: row["artifact_type"] as string,
    name: row["name"] as string,
    path: (row["path"] as string | null) ?? undefined,
    metadata: parseJson(row["metadata_json"], {} as Record<string, unknown>),
    safetyTier: row["safety_tier"] as MakerSafetyTier,
    status: row["status"] as MakerCadArtifact["status"],
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

export function listMakerSafetyPolicies(): MakerSafetyPolicy[] {
  return SAFETY_POLICIES.map(policy => ({ ...policy }));
}

export function listMakerIntegrations(): MakerIntegration[] {
  return MAKER_INTEGRATIONS.map(integration => ({ ...integration }));
}

export function listMakerCadProviders(): MakerCadProvider[] {
  return MAKER_CAD_PROVIDERS.map(provider => ({
    ...provider,
    supportedActions: [...provider.supportedActions],
  }));
}

export function listMakerPrintProviders(): MakerPrintProvider[] {
  return MAKER_PRINT_PROVIDERS.map(provider => ({
    ...provider,
    supportedActions: [...provider.supportedActions],
  }));
}

export function listMakerMachineProviders(): MakerMachineProvider[] {
  return MAKER_MACHINE_PROVIDERS.map(provider => ({
    ...provider,
    supportedActions: [...provider.supportedActions],
  }));
}

export function getMakerStudioStatus() {
  const projectCount = sqlite.prepare("SELECT COUNT(*) AS count FROM maker_projects").get() as { count: number };
  const materialCount = sqlite.prepare("SELECT COUNT(*) AS count FROM maker_materials").get() as { count: number };
  const cadArtifactCount = sqlite.prepare("SELECT COUNT(*) AS count FROM maker_cad_artifacts").get() as { count: number };
  return {
    sourceOfTruth: MAKER_STUDIO_SOURCE_OF_TRUTH,
    localFirst: true,
    cloudRequired: false,
    executionEnabled: false,
    machineControlEnabled: false,
    hardLimits: {
      startsMachines: false,
      sendsGCode: false,
      slicesFiles: false,
      controlsHardware: false,
      flashesFirmware: false,
    },
    counts: {
      projects: projectCount.count,
      materials: materialCount.count,
      cadArtifacts: cadArtifactCount.count,
    },
    integrations: listMakerIntegrations(),
    cadProviders: listMakerCadProviders(),
    printProviders: listMakerPrintProviders(),
    machineProviders: listMakerMachineProviders(),
    safetyPolicies: listMakerSafetyPolicies(),
  };
}

export function createMakerProject(input: {
  name?: string;
  type?: MakerProjectType;
  status?: MakerProjectStatus;
  safetyTier?: MakerSafetyTier;
  relatedFiles?: unknown;
  cadFiles?: unknown;
  slicedFiles?: unknown;
  target?: unknown;
  material?: unknown;
  traceability?: unknown;
  metadata?: unknown;
}): MakerProject {
  const name = redactString((input.name ?? "Untitled maker project").trim() || "Untitled maker project");
  const type = normalizeProjectType(input.type);
  const safetyTier = normalizeSafetyTier(input.safetyTier, type);
  const physicalTier = physicalTierForSafety(safetyTier);
  const timestamp = nowIso();
  const target = sanitizeValue(input.target ?? { status: "not_configured" }) as MakerTarget;
  const material = sanitizeValue(input.material ?? {}) as MakerMaterialRef;
  const traceability = sanitizeValue(input.traceability ?? {}) as Record<string, unknown>;
  const metadata = {
    ...(sanitizeValue(input.metadata ?? {}) as Record<string, unknown>),
    rawDesignStored: false,
    phase: "13A",
  };
  const project: MakerProject = {
    id: randomUUID(),
    name,
    type,
    status: normalizeProjectStatus(input.status),
    safetyTier,
    physicalTier,
    relatedFiles: normalizeFileRefs(input.relatedFiles),
    cadFiles: normalizeFileRefs(input.cadFiles),
    slicedFiles: normalizeFileRefs(input.slicedFiles),
    target,
    material,
    traceability,
    metadata,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  sqlite.prepare(`
    INSERT INTO maker_projects
      (id, name, type, status, safety_tier, physical_tier, related_files_json, cad_files_json,
       sliced_files_json, target_json, material_json, traceability_json, approval_id, metadata_json,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    project.id,
    project.name,
    project.type,
    project.status,
    project.safetyTier,
    project.physicalTier,
    JSON.stringify(project.relatedFiles),
    JSON.stringify(project.cadFiles),
    JSON.stringify(project.slicedFiles),
    JSON.stringify(project.target),
    JSON.stringify(project.material),
    JSON.stringify(project.traceability),
    null,
    JSON.stringify(project.metadata),
    project.createdAt,
    project.updatedAt,
  );

  recordAuditEvent({
    eventType: "maker_project",
    action: "create",
    target: project.id,
    result: "success",
    metadata: {
      type: project.type,
      status: project.status,
      safetyTier: project.safetyTier,
      physicalTier: project.physicalTier,
      relatedFileCount: project.relatedFiles.length,
      cadFileCount: project.cadFiles.length,
      slicedFileCount: project.slicedFiles.length,
      rawDesignStored: false,
    },
  });

  return project;
}

export function listMakerProjects(limit = 100): MakerProject[] {
  const rows = sqlite.prepare(`
    SELECT * FROM maker_projects
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(500, Math.floor(limit)))) as Array<Record<string, unknown>>;
  return rows.map(rowToProject);
}

export function getMakerProject(id: string): MakerProject | null {
  const row = sqlite.prepare("SELECT * FROM maker_projects WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToProject(row) : null;
}

export function createMakerMaterial(input: {
  name?: string;
  category?: string;
  properties?: unknown;
  safetyNotes?: unknown;
  source?: string;
}): MakerMaterial {
  const timestamp = nowIso();
  const material: MakerMaterial = {
    id: randomUUID(),
    name: redactString((input.name ?? "Unnamed material").trim() || "Unnamed material"),
    category: redactString((input.category ?? "unknown").trim() || "unknown"),
    properties: sanitizeValue(input.properties ?? {}) as Record<string, unknown>,
    safetyNotes: Array.isArray(input.safetyNotes)
      ? input.safetyNotes.slice(0, 20).map(note => redactString(String(note)))
      : [],
    source: redactString((input.source ?? "manual").trim() || "manual"),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  sqlite.prepare(`
    INSERT INTO maker_materials
      (id, name, category, properties_json, safety_notes_json, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    material.id,
    material.name,
    material.category,
    JSON.stringify(material.properties),
    JSON.stringify(material.safetyNotes),
    material.source,
    material.createdAt,
    material.updatedAt,
  );
  recordAuditEvent({
    eventType: "maker_material",
    action: "create",
    target: material.id,
    result: "success",
    metadata: { category: material.category, source: material.source },
  });
  return material;
}

export function listMakerMaterials(limit = 100): MakerMaterial[] {
  const rows = sqlite.prepare(`
    SELECT * FROM maker_materials
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(500, Math.floor(limit)))) as Array<Record<string, unknown>>;
  return rows.map(rowToMaterial);
}

export function createMakerCadArtifact(input: {
  projectId?: string;
  artifactType?: string;
  name?: string;
  path?: string;
  metadata?: unknown;
  safetyTier?: MakerSafetyTier;
  status?: MakerCadArtifact["status"];
}): MakerCadArtifact {
  if (!input.projectId || !getMakerProject(input.projectId)) {
    throw new Error("Valid maker projectId is required");
  }
  const timestamp = nowIso();
  const safetyTier = normalizeSafetyTier(input.safetyTier, "cad");
  const artifact: MakerCadArtifact = {
    id: randomUUID(),
    projectId: input.projectId,
    artifactType: redactString((input.artifactType ?? "cad_metadata").trim() || "cad_metadata"),
    name: redactString((input.name ?? "CAD artifact").trim() || "CAD artifact"),
    path: input.path ? redactString(input.path.trim()) : undefined,
    metadata: {
      ...(sanitizeValue(input.metadata ?? {}) as Record<string, unknown>),
      rawCadContentStored: false,
    },
    safetyTier,
    status: input.status && ["proposal", "draft", "review_required", "archived"].includes(input.status) ? input.status : "proposal",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  sqlite.prepare(`
    INSERT INTO maker_cad_artifacts
      (id, project_id, artifact_type, name, path, metadata_json, safety_tier, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    artifact.id,
    artifact.projectId,
    artifact.artifactType,
    artifact.name,
    artifact.path ?? null,
    JSON.stringify(artifact.metadata),
    artifact.safetyTier,
    artifact.status,
    artifact.createdAt,
    artifact.updatedAt,
  );
  recordAuditEvent({
    eventType: "maker_cad_artifact",
    action: "create",
    target: artifact.id,
    result: "success",
    metadata: {
      projectId: artifact.projectId,
      artifactType: artifact.artifactType,
      safetyTier: artifact.safetyTier,
      rawCadContentStored: false,
    },
  });
  return artifact;
}

export function listMakerCadArtifacts(projectId: string): MakerCadArtifact[] {
  const rows = sqlite.prepare(`
    SELECT * FROM maker_cad_artifacts
    WHERE project_id = ?
    ORDER BY updated_at DESC
  `).all(projectId) as Array<Record<string, unknown>>;
  return rows.map(rowToCadArtifact);
}

function normalizeDesignKind(value: unknown): MakerCadDesignKind {
  const kind = typeof value === "string" ? value.trim() : "";
  return ["cadquery", "build123d", "openscad", "freecad_macro", "kicad_project"].includes(kind)
    ? kind as MakerCadDesignKind
    : "cadquery";
}

function providerForDesign(kind: MakerCadDesignKind, requestedProviderId?: string): MakerCadProvider {
  const providers = listMakerCadProviders();
  if (requestedProviderId) {
    const requested = providers.find(provider => provider.id === requestedProviderId);
    if (requested) return requested;
  }
  if (kind === "build123d") return providers.find(provider => provider.id === "build123d")!;
  if (kind === "openscad") return providers.find(provider => provider.id === "openscad-style")!;
  if (kind === "freecad_macro") return providers.find(provider => provider.id === "freecad-mcp")!;
  if (kind === "kicad_project") return providers.find(provider => provider.id === "kicad-mcp")!;
  return providers.find(provider => provider.id === "cadquery")!;
}

function safeTargetFileName(value: unknown, kind: MakerCadDesignKind): string {
  const fallbackExt: Record<MakerCadDesignKind, string> = {
    cadquery: "py",
    build123d: "py",
    openscad: "scad",
    freecad_macro: "FCMacro",
    kicad_project: "kicad_pro",
  };
  const raw = typeof value === "string" && value.trim() ? value.trim() : `design.${fallbackExt[kind]}`;
  const cleaned = raw.replace(/[\\/:*?"<>|]+/g, "-").replace(/\.\.+/g, ".").slice(0, 96);
  return cleaned.includes(".") ? cleaned : `${cleaned}.${fallbackExt[kind]}`;
}

function normalizeStringList(value: unknown, fallback: string[], limit = 12): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value.map(item => redactString(String(item ?? "").trim())).filter(Boolean).slice(0, limit);
  return items.length ? items : fallback;
}

function normalizeDimensions(value: unknown): Record<string, number | string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { widthMm: 40, depthMm: 20, heightMm: 10 };
  }
  const safe: Record<string, number | string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "dimension";
    safe[safeKey] = typeof item === "number" && Number.isFinite(item) ? item : redactString(String(item ?? ""));
  }
  return Object.keys(safe).length ? safe : { widthMm: 40, depthMm: 20, heightMm: 10 };
}

function scriptLanguageForDesign(kind: MakerCadDesignKind): string {
  if (kind === "openscad") return "openscad";
  if (kind === "freecad_macro") return "freecad-python-macro";
  if (kind === "kicad_project") return "kicad-project-metadata";
  return "python";
}

function previewForDesign(kind: MakerCadDesignKind, dimensions: Record<string, number | string>, units: string): string[] {
  const width = dimensions["widthMm"] ?? dimensions["width"] ?? 40;
  const depth = dimensions["depthMm"] ?? dimensions["depth"] ?? 20;
  const height = dimensions["heightMm"] ?? dimensions["height"] ?? 10;
  if (kind === "openscad") return [`// proposal-only ${units}`, `cube([${width}, ${depth}, ${height}], center=false);`];
  if (kind === "build123d") return ["# proposal-only build123d script", `# box dimensions: ${width} x ${depth} x ${height} ${units}`];
  if (kind === "freecad_macro") return ["# proposal-only FreeCAD macro", "# execution requires approval and configured safe workspace"];
  if (kind === "kicad_project") return ["# proposal-only KiCad project link", "# ERC/DRC/BOM execution requires configured KiCad adapter"];
  return ["# proposal-only CadQuery script", `# box dimensions: ${width} x ${depth} x ${height} ${units}`];
}

export function createMakerDesignProposal(input: MakerDesignProposalInput): MakerDesignProposal {
  if (!input.projectId || !getMakerProject(input.projectId)) {
    throw new Error("Valid maker projectId is required");
  }
  const designKind = normalizeDesignKind(input.designKind);
  const provider = providerForDesign(designKind, input.providerId);
  if (provider.cloudProvider) {
    throw new Error(`${provider.name} is disabled/not_configured for Phase 13B cloud text-to-CAD policy`);
  }
  const targetFileName = safeTargetFileName(input.targetFileName, designKind);
  const units = redactString((input.units ?? "mm").trim() || "mm");
  const dimensions = normalizeDimensions(input.dimensions);
  const constraints = normalizeStringList(input.constraints, ["No external tool execution", "Review dimensions before export"]);
  const assumptions = normalizeStringList(input.assumptions, ["Draft geometry only", "Material behavior requires human review"]);
  const materialAssumptions = sanitizeValue(input.material ?? { name: "unspecified", category: "unverified" }) as MakerMaterialRef;
  const exportTargets = normalizeStringList(input.exportTargets, ["STEP proposal", "STL proposal"]);
  const validationSteps = normalizeStringList(input.validationSteps, ["Review units", "Check bounding box", "Approve before any render/export"]);
  const riskNotes = normalizeStringList(input.riskNotes, [
    "Not represented as physically safe, printable, manufacturable, or electrically valid.",
    "No CAD, PCB, slicer, CAM, firmware, or hardware tool was executed.",
  ]);
  const metadata = {
    targetFileNames: [targetFileName],
    workspaceRelativePath: `maker/${input.projectId}/proposals/${targetFileName}`,
    scriptLanguage: scriptLanguageForDesign(designKind),
    designKind,
    units,
    dimensions,
    constraints,
    assumptions,
    materialAssumptions,
    boundingBox: { status: "estimated_from_parameters" as const, units, dimensions },
    previewIntent: redactString(input.previewIntent ?? "Review-only script preview; render requires configured provider and approval."),
    exportTargets,
    validationSteps,
    riskNotes,
    reviewRequired: true as const,
    physicallySafeClaimed: false as const,
    manufacturableClaimed: false as const,
    executionEnabled: false as const,
    toolExecutionAttempted: false as const,
    dataLeavesMachine: false as const,
    cloudRequired: false as const,
    scriptStored: false as const,
    scriptPreview: previewForDesign(designKind, dimensions, units),
  };
  const artifact = createMakerCadArtifact({
    projectId: input.projectId,
    artifactType: `phase13b_${designKind}_proposal`,
    name: `${provider.name} design proposal`,
    path: metadata.workspaceRelativePath,
    status: "review_required",
    safetyTier: "simulate",
    metadata: {
      ...metadata,
      providerId: provider.id,
      providerStatus: provider.status,
      proposalMode: "dry_run",
      rawCadContentStored: false,
    },
  });
  recordAuditEvent({
    eventType: "maker_cad_proposal",
    action: "create",
    target: artifact.id,
    result: "success",
    metadata: {
      projectId: input.projectId,
      providerId: provider.id,
      designKind,
      providerStatus: provider.status,
      targetFileCount: metadata.targetFileNames.length,
      executionEnabled: false,
      toolExecutionAttempted: false,
      dataLeavesMachine: false,
      scriptStored: false,
    },
  });
  return {
    success: true,
    status: "proposal",
    executed: false,
    proposalMode: "dry_run",
    provider,
    artifact,
    metadata,
    reason: "Phase 13B created a review/dry-run CAD proposal only. No CAD/PCB tool, macro, cloud provider, export, or hardware action executed.",
  };
}

function providerForPrintWorkflow(providerId: unknown, kind?: MakerPrintProviderKind): MakerPrintProvider {
  const providers = listMakerPrintProviders();
  if (typeof providerId === "string" && providerId.trim()) {
    const requested = providers.find(provider => provider.id === providerId.trim());
    if (requested) return requested;
  }
  if (kind) {
    const byKind = providers.find(provider => provider.kind === kind);
    if (byKind) return byKind;
  }
  return providers.find(provider => provider.id === "orcaslicer")!;
}

function normalizePositiveNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeMaterialRef(value: unknown, project?: MakerProject): MakerMaterialRef {
  const base = value && typeof value === "object" ? value as Record<string, unknown> : project?.material ?? {};
  return sanitizeValue(base) as MakerMaterialRef;
}

function materialNameForCheck(material: MakerMaterialRef): string {
  const raw = typeof material.name === "string" ? material.name.trim() : "";
  if (!raw || /unknown|unspecified|none|missing/i.test(raw)) return "unknown";
  return redactString(raw);
}

export function checkMakerFilamentAvailability(input: { material?: MakerMaterialRef; project?: MakerProject } = {}): MakerFilamentCheck {
  const provider = providerForPrintWorkflow("spoolman");
  const material = normalizeMaterialRef(input.material, input.project);
  const materialName = materialNameForCheck(material);
  const missing = materialName === "unknown";
  return {
    status: missing ? "blocked" : "manual_review",
    providerId: "spoolman",
    providerStatus: provider.status,
    materialName,
    available: missing ? false : "unverified",
    blocksQueue: missing,
    reason: missing
      ? "Queue proposal blocked because material is missing or unknown."
      : "Spoolman is not configured; local material metadata exists but inventory remains unverified.",
  };
}

function safePrintTargetFileName(value: unknown): string {
  const raw = typeof value === "string" && value.trim() ? value.trim() : "slice-proposal.gcode";
  const cleaned = raw.replace(/[\\/:*?"<>|]+/g, "-").replace(/\.\.+/g, ".").slice(0, 96);
  return cleaned.toLowerCase().endsWith(".gcode") ? cleaned : `${cleaned}.gcode`;
}

export function createMakerSlicingProposal(input: MakerSlicingProposalInput): MakerSlicingProposal {
  if (!input.projectId) throw new Error("Valid maker projectId is required");
  const project = getMakerProject(input.projectId);
  if (!project) throw new Error("Valid maker projectId is required");
  const provider = providerForPrintWorkflow(input.providerId, "slicer");
  if (provider.kind !== "slicer") throw new Error(`${provider.name} is not a slicer provider`);

  const targetFileName = safePrintTargetFileName(input.targetFileName);
  const material = normalizeMaterialRef(input.material, project);
  const materialCheck = checkMakerFilamentAvailability({ material, project });
  const sourceModel = input.sourceModel ? normalizeFileRefs([input.sourceModel])[0] : project.cadFiles[0] ?? project.relatedFiles[0];
  const metadata = {
    sourceDesignArtifactId: typeof input.designArtifactId === "string" ? redactString(input.designArtifactId) : undefined,
    sourceModelHash: sourceModel?.hash ?? (sourceModel?.path ? hashText(sourceModel.path) : undefined),
    targetFileNames: [targetFileName],
    workspaceRelativePath: `maker/${project.id}/slicing/${targetFileName}`,
    printerProfile: redactString((input.printerProfile ?? "unconfigured-printer-profile").trim() || "unconfigured-printer-profile"),
    material,
    layerHeightMm: normalizePositiveNumber(input.layerHeightMm, 0.2, 0.04, 1),
    nozzleMm: normalizePositiveNumber(input.nozzleMm, 0.4, 0.1, 2),
    infillPercent: normalizePositiveNumber(input.infillPercent, 20, 0, 100),
    configValidationStatus: provider.status === "ready" ? "proposal_only" as const : "not_configured" as const,
    reviewRequired: true as const,
    toolExecutionAttempted: false as const,
    realFileSliced: false as const,
    fileUploaded: false as const,
    gcodeGenerated: false as const,
    dataLeavesMachine: false as const,
    cloudRequired: false as const,
    physicallySafeClaimed: false as const,
    manufacturableClaimed: false as const,
    validationSteps: [
      "Confirm model units and orientation.",
      "Confirm slicer/printer profile before any real slicing.",
      "Verify filament manually when Spoolman is not configured.",
      "Require approval before queueing or starting a real print.",
    ],
    riskNotes: [
      "Dry-run/config-validation metadata only; no slicer process was executed.",
      "No G-code was generated, uploaded, queued, or sent to a printer.",
    ],
  };
  const artifact = createMakerCadArtifact({
    projectId: project.id,
    artifactType: "phase13c_slicing_proposal",
    name: `${provider.name} slicing proposal`,
    path: metadata.workspaceRelativePath,
    status: "review_required",
    safetyTier: "simulate",
    metadata: {
      ...metadata,
      providerId: provider.id,
      providerStatus: provider.status,
      materialCheckStatus: materialCheck.status,
      rawGcodeStored: false,
    },
  });
  recordAuditEvent({
    eventType: "maker_slicing_proposal",
    action: "create",
    target: artifact.id,
    result: "success",
    metadata: {
      projectId: project.id,
      providerId: provider.id,
      providerStatus: provider.status,
      materialCheckStatus: materialCheck.status,
      targetFileCount: metadata.targetFileNames.length,
      toolExecutionAttempted: false,
      realFileSliced: false,
      fileUploaded: false,
      apiCallsMade: false,
      dataLeavesMachine: false,
    },
  });
  return {
    success: true,
    status: "proposal",
    executed: false,
    proposalMode: provider.status === "ready" ? "config_validation" : "dry_run",
    provider,
    artifact,
    materialCheck,
    metadata,
    reason: "Phase 13C created a slicing dry-run/config-validation proposal only. No slicer, file upload, G-code generation, printer API, or hardware action executed.",
  };
}

function classifyPrintWorkflow(actionType: string): { status: MakerActionResult["status"]; physicalTier: PhysicalTier; approvalRequired: boolean; blocked: boolean; manualOnly: boolean } {
  if (/status|monitor|obico|failure/i.test(actionType)) return { status: "not_configured", physicalTier: "p0_sensor_read", approvalRequired: false, blocked: false, manualOnly: false };
  if (/heat|heater|temperature|temp|motor|move|extrude|home/i.test(actionType)) return { status: "approval_required", physicalTier: "p4_approval_required", approvalRequired: true, blocked: false, manualOnly: false };
  if (/start.*print|print_start/i.test(actionType)) return { status: "approval_required", physicalTier: "p4_approval_required", approvalRequired: true, blocked: false, manualOnly: false };
  if (/queue|upload|submit/i.test(actionType)) return { status: "approval_required", physicalTier: "p2_prepare_queue", approvalRequired: true, blocked: false, manualOnly: false };
  if (/cancel|pause|resume/i.test(actionType)) return { status: "approval_required", physicalTier: "p4_approval_required", approvalRequired: true, blocked: false, manualOnly: false };
  if (/cnc|laser|mill|engrave|firmware/i.test(actionType)) return { status: "manual_only", physicalTier: "p5_manual_only_at_machine", approvalRequired: true, blocked: true, manualOnly: true };
  return { status: "approval_required", physicalTier: "p4_approval_required", approvalRequired: true, blocked: false, manualOnly: false };
}

export function proposeMakerPrintWorkflowAction(projectId: string, input: { actionType?: string; providerId?: string; material?: MakerMaterialRef; approvalId?: string } = {}): MakerPrintWorkflowResult {
  const project = getMakerProject(projectId);
  if (!project) {
    return {
      success: false,
      status: "blocked",
      executed: false,
      approvalRequired: false,
      reason: "Maker project not found.",
    };
  }
  const actionType = typeof input.actionType === "string" && input.actionType.trim() ? input.actionType.trim() : "queue_print";
  const provider = providerForPrintWorkflow(input.providerId, /slice/i.test(actionType) ? "slicer" : "printer_api");
  const materialCheck = checkMakerFilamentAvailability({ material: input.material, project });
  const workflow = {
    actionType,
    proposalMode: "approval_required" as const,
    apiCallsMade: false as const,
    fileUploaded: false as const,
    heaterOrMotorCommandSent: false as const,
    printQueued: false as const,
    printStarted: false as const,
    monitoringActive: false as const,
  };
  const classification = classifyPrintWorkflow(actionType);

  if (/queue|upload|submit/i.test(actionType) && materialCheck.blocksQueue) {
    recordAuditEvent({
      eventType: "maker_print_workflow",
      action: actionType,
      target: project.id,
      result: "blocked",
      metadata: {
        providerId: provider.id,
        providerStatus: provider.status,
        materialCheckStatus: materialCheck.status,
        executed: false,
        apiCallsMade: false,
        fileUploaded: false,
      },
    });
    return {
      success: false,
      status: "blocked",
      executed: false,
      approvalRequired: false,
      project,
      provider,
      materialCheck,
      physicalTier: classification.physicalTier,
      workflow,
      reason: materialCheck.reason,
    };
  }

  if (classification.manualOnly) {
    const approval = createApprovalRequest({
      type: "maker_print_action",
      title: `Maker print action blocked: ${actionType}`,
      summary: "Dangerous fabrication action is manual-only at the machine and cannot execute through LOCALAI.",
      riskTier: "tier5_manual_only_prohibited",
      physicalTier: classification.physicalTier,
      requestedAction: actionType,
      payload: { projectId: project.id, providerId: provider.id, executed: false, machineControlEnabled: false },
    });
    return {
      success: false,
      status: "manual_only",
      executed: false,
      approvalRequired: false,
      approval,
      project,
      provider,
      materialCheck,
      physicalTier: classification.physicalTier,
      workflow,
      reason: "Manual-only machine action is blocked from software execution.",
    };
  }

  if (/monitor|obico|failure/i.test(actionType)) {
    recordAuditEvent({
      eventType: "maker_print_workflow",
      action: actionType,
      target: project.id,
      result: "success",
      metadata: { providerId: provider.id, providerStatus: provider.status, monitoringActive: false, apiCallsMade: false },
    });
    return {
      success: false,
      status: provider.status === "degraded" ? "degraded" : "not_configured",
      executed: false,
      approvalRequired: false,
      project,
      provider,
      materialCheck,
      physicalTier: classification.physicalTier,
      workflow,
      reason: provider.reason,
    };
  }

  if (input.approvalId) {
    const approval = getApprovalRequest(input.approvalId);
    const approved = approval?.status === "approved";
    return {
      success: false,
      status: approved ? "not_configured" : "approval_required",
      executed: false,
      approvalRequired: !approved,
      approval: approval ?? undefined,
      project,
      provider,
      materialCheck,
      physicalTier: classification.physicalTier,
      workflow,
      reason: approved
        ? "Approval exists, but Phase 13C has no configured printer/slicer executor and made no API calls."
        : "Approval is missing, denied, cancelled, expired, or not approved; no printer action executed.",
    };
  }

  const approval = createApprovalRequest({
    type: "maker_print_action",
    title: `Maker print workflow: ${actionType}`,
    summary: "3D printer/slicer workflow proposal only. Phase 13C never uploads files, queues real jobs, starts prints, heats, moves motors, or calls printer APIs.",
    riskTier: "tier4_external_communication",
    physicalTier: classification.physicalTier,
    requestedAction: actionType,
    payload: {
      projectId: project.id,
      projectType: project.type,
      providerId: provider.id,
      providerStatus: provider.status,
      materialCheckStatus: materialCheck.status,
      physicalTier: classification.physicalTier,
      executed: false,
      apiCallsMade: false,
      fileUploaded: false,
      heaterOrMotorCommandSent: false,
      printQueued: false,
      printStarted: false,
      monitoringActive: false,
    },
  });

  recordAuditEvent({
    eventType: "maker_print_workflow",
    action: actionType,
    target: project.id,
    result: "success",
    metadata: {
      approvalId: approval.id,
      approvalStatus: approval.status,
      providerId: provider.id,
      providerStatus: provider.status,
      materialCheckStatus: materialCheck.status,
      physicalTier: classification.physicalTier,
      executed: false,
      apiCallsMade: false,
      fileUploaded: false,
      heaterOrMotorCommandSent: false,
      printQueued: false,
      printStarted: false,
      monitoringActive: false,
    },
  });

  return {
    success: false,
    status: "approval_required",
    executed: false,
    approvalRequired: true,
    approval,
    project,
    provider,
    materialCheck,
    physicalTier: classification.physicalTier,
    workflow,
    reason: "Approval is required, and Phase 13C still has no configured printer/slicer executor.",
  };
}

export function proposeMakerPrintProviderAction(providerId: string, action = "status"): MakerActionResult {
  const provider = listMakerPrintProviders().find(item => item.id === providerId);
  if (!provider) {
    return {
      success: false,
      status: "blocked",
      executed: false,
      approvalRequired: false,
      reason: "Unknown Maker printer/slicer provider.",
    };
  }
  const actionType = action.trim() || "status";
  const classified = classifyPrintWorkflow(actionType);
  recordAuditEvent({
    eventType: "maker_print_provider",
    action: actionType,
    target: provider.id,
    result: classified.blocked ? "blocked" : "success",
    metadata: {
      providerStatus: provider.status,
      providerKind: provider.kind,
      executionEnabled: false,
      apiCallsMade: false,
      fileUploaded: false,
      heaterOrMotorCommandSent: false,
      dataLeavesMachine: false,
    },
  });
  return {
    success: false,
    status: classified.status === "approval_required"
      ? "approval_required"
      : provider.status === "disabled"
        ? "disabled"
        : provider.status === "degraded"
          ? "degraded"
          : "not_configured",
    executed: false,
    approvalRequired: classified.approvalRequired,
    physicalTier: classified.physicalTier,
    reason: classified.status === "approval_required"
      ? "Provider action is approval-gated and still cannot execute until a later configured durable executor exists."
      : provider.reason,
  };
}

function providerForMachineWorkflow(providerId: unknown, kind?: MakerMachineProviderKind): MakerMachineProvider {
  const providers = listMakerMachineProviders();
  if (typeof providerId === "string" && providerId.trim()) {
    const requested = providers.find(provider => provider.id === providerId.trim());
    if (requested) return requested;
  }
  if (kind) {
    const byKind = providers.find(provider => provider.kind === kind);
    if (byKind) return byKind;
  }
  return providers.find(provider => provider.id === "freecad-path-cam")!;
}

function normalizeMachineOperation(value: unknown): MakerMachineOperationType {
  const raw = typeof value === "string" ? value.trim() : "";
  if (["cam_setup", "cnc_milling", "laser_cutting", "laser_engraving", "electronics_bench", "firmware_review", "simulation"].includes(raw)) {
    return raw as MakerMachineOperationType;
  }
  if (/laser.*engrave/i.test(raw)) return "laser_engraving";
  if (/laser/i.test(raw)) return "laser_cutting";
  if (/electronics|bench|bom|kicad/i.test(raw)) return "electronics_bench";
  if (/firmware|flash/i.test(raw)) return "firmware_review";
  if (/simulate|preview/i.test(raw)) return "simulation";
  if (/cnc|mill|route/i.test(raw)) return "cnc_milling";
  return "cam_setup";
}

function safeSetupSheetFileName(value: unknown): string {
  const raw = typeof value === "string" && value.trim() ? value.trim() : "setup-sheet.md";
  const cleaned = raw.replace(/[\\/:*?"<>|]+/g, "-").replace(/\.\.+/g, ".").slice(0, 96);
  return cleaned.toLowerCase().endsWith(".md") ? cleaned : `${cleaned}.md`;
}

function defaultMachineProviderKind(operationType: MakerMachineOperationType): MakerMachineProviderKind {
  if (operationType === "laser_cutting" || operationType === "laser_engraving") return "laser_workflow";
  if (operationType === "electronics_bench" || operationType === "firmware_review") return "electronics_bench";
  if (operationType === "cnc_milling") return "cnc_controller";
  return "cam";
}

function defaultSafetyRisks(operationType: MakerMachineOperationType): string[] {
  const common = [
    "Proposal-only setup sheet; no toolpath, G-code, serial/USB write, or hardware control was performed.",
    "Human review and machine-side confirmation are required before any physical work.",
  ];
  if (operationType === "laser_cutting" || operationType === "laser_engraving") {
    return [...common, "Laser eye/fire/fume hazards require verified enclosure, ventilation, interlocks, and PPE."];
  }
  if (operationType === "electronics_bench" || operationType === "firmware_review") {
    return [...common, "Bench power, firmware flashing, relays, and serial/USB writes are disabled until a later explicit hardware-safe workflow."];
  }
  return [...common, "CNC work requires verified workholding, coordinate origin, tool stickout, speeds/feeds, and emergency stop access."];
}

export function createMakerMachineSetupSheet(input: MakerMachineSetupSheetInput): MakerMachineSetupSheet {
  if (!input.projectId) throw new Error("Valid maker projectId is required");
  const project = getMakerProject(input.projectId);
  if (!project) throw new Error("Valid maker projectId is required");

  const operationType = normalizeMachineOperation(input.operationType);
  const provider = providerForMachineWorkflow(input.providerId, defaultMachineProviderKind(operationType));
  const targetFileName = safeSetupSheetFileName(input.targetFileName);
  const stock = sanitizeValue(input.stock ?? project.material ?? { name: "unverified stock", category: "stock" }) as MakerMachineSetupSheet["metadata"]["stock"];
  const tool = sanitizeValue(input.tool ?? { name: "unverified tool", type: operationType.includes("laser") ? "laser" : "endmill" }) as Record<string, unknown>;
  const machineProfile = redactString((input.machineProfile ?? "unconfigured machine profile").trim() || "unconfigured machine profile");
  const units = redactString((input.units ?? "mm").trim() || "mm");
  const workholding = redactString((input.workholding ?? "manual review required before clamping or fixturing").trim());
  const coordinateOrigin = redactString((input.coordinateOrigin ?? "unverified; set at machine by human operator").trim());
  const speedFeedPowerEstimates = sanitizeValue(input.speedFeedPowerEstimates ?? {
    spindleRpm: "estimate_unavailable",
    feedRateMmMin: "estimate_unavailable",
    laserPowerPercent: "estimate_unavailable",
  }) as Record<string, unknown>;
  const assumptions = (input.assumptions?.length ? input.assumptions : [
    "Machine profile is unconfigured.",
    "Stock, tool, workholding, and coordinate origin must be verified by a human.",
    "Generated output is not machine-ready or production-ready.",
  ]).map(item => redactString(String(item)));
  const ppeNotes = (input.ppeNotes?.length ? input.ppeNotes : [
    "Wear task-appropriate eye/face protection.",
    "Use hearing, dust/fume, and hand protection as required by the actual machine and material.",
    "Keep emergency stop and fire safety controls reachable.",
  ]).map(item => redactString(String(item)));
  const verificationChecklist = (input.verificationChecklist?.length ? input.verificationChecklist : [
    "Verify machine profile, material, stock dimensions, and units.",
    "Verify tool/bit/nozzle/laser settings and workholding.",
    "Verify coordinate origin, clearance, and travel envelope at the machine.",
    "Run trusted offline simulation/preview before any real machine action.",
    "Confirm no output is treated as safe, machine-ready, or production-ready without human review.",
  ]).map(item => redactString(String(item)));

  const metadata: MakerMachineSetupSheet["metadata"] = {
    operationType,
    targetFileNames: [targetFileName],
    workspaceRelativePath: `maker/${project.id}/machine/${targetFileName}`,
    machineProfile,
    stock,
    tool,
    workholding,
    coordinateOrigin,
    units,
    speedFeedPowerEstimates,
    safetyRisks: defaultSafetyRisks(operationType),
    ppeNotes,
    assumptions,
    simulationStatus: input.simulationStatus ?? "metadata_only",
    verificationChecklist,
    manualConfirmationRequired: true,
    humanReviewRequired: true,
    machineSideConfirmationRequired: true,
    reviewRequired: true,
    productionReadyClaimed: false,
    machineReadyClaimed: false,
    physicallySafeClaimed: false,
    manufacturableClaimed: false,
    toolpathGenerated: false,
    gcodeGenerated: false,
    gcodeSent: false,
    machineMotionCommandSent: false,
    spindleStarted: false,
    laserFired: false,
    relayOrPowerCommandSent: false,
    firmwareFlashed: false,
    serialOrUsbWriteAttempted: false,
    hardwareControlAttempted: false,
    apiCallsMade: false,
    dataLeavesMachine: false,
    cloudRequired: false,
  };

  const artifact = createMakerCadArtifact({
    projectId: project.id,
    artifactType: "phase13d_machine_setup_sheet",
    name: `${provider.name} setup sheet`,
    path: metadata.workspaceRelativePath,
    status: "review_required",
    safetyTier: operationType === "simulation" ? "simulate" : "manual_only_at_machine",
    metadata: {
      ...metadata,
      providerId: provider.id,
      providerStatus: provider.status,
      rawToolpathStored: false,
      rawGcodeStored: false,
      serialDeviceIdentifierStored: false,
    },
  });

  recordAuditEvent({
    eventType: "maker_machine_setup_sheet",
    action: "create",
    target: artifact.id,
    result: "success",
    metadata: {
      projectId: project.id,
      providerId: provider.id,
      providerStatus: provider.status,
      operationType,
      targetFileCount: metadata.targetFileNames.length,
      toolpathGenerated: false,
      gcodeSent: false,
      machineMotionCommandSent: false,
      spindleStarted: false,
      laserFired: false,
      relayOrPowerCommandSent: false,
      firmwareFlashed: false,
      serialOrUsbWriteAttempted: false,
      hardwareControlAttempted: false,
      apiCallsMade: false,
      dataLeavesMachine: false,
    },
  });

  return {
    success: true,
    status: "proposal",
    executed: false,
    proposalMode: operationType === "simulation" ? "simulation_metadata" : "dry_run",
    provider,
    artifact,
    metadata,
    reason: "Phase 13D created a proposal-only setup sheet. No CAM toolpath, G-code, serial/USB write, CNC/laser/electronics API, firmware, relay, power, or hardware action executed.",
  };
}

function classifyMachineWorkflow(actionType: string): { status: MakerActionResult["status"]; physicalTier: PhysicalTier; approvalRequired: boolean; blocked: boolean; manualOnly: boolean } {
  if (/status|inspect|preview|simulate|simulation|setup|sheet|bom|parts/i.test(actionType)) {
    return { status: "proposal", physicalTier: "p1_suggest", approvalRequired: false, blocked: false, manualOnly: false };
  }
  if (/generate.*gcode|toolpath|cam|post.?process/i.test(actionType)) {
    return { status: "approval_required", physicalTier: "p2_prepare_queue", approvalRequired: true, blocked: false, manualOnly: false };
  }
  if (/send.*gcode|stream.*gcode|jog|axis|motion|move|home|spindle|laser|plasma|fire|relay|power|firmware|flash|serial|usb|heat|bench.*power/i.test(actionType)) {
    return { status: "manual_only", physicalTier: "p5_manual_only_at_machine", approvalRequired: true, blocked: true, manualOnly: true };
  }
  return { status: "approval_required", physicalTier: "p4_approval_required", approvalRequired: true, blocked: false, manualOnly: false };
}

export function proposeMakerMachineWorkflowAction(projectId: string, input: { actionType?: string; providerId?: string; operationType?: MakerMachineOperationType; approvalId?: string } = {}): MakerMachineWorkflowResult {
  const project = getMakerProject(projectId);
  if (!project) {
    return {
      success: false,
      status: "blocked",
      executed: false,
      approvalRequired: false,
      reason: "Maker project not found.",
    };
  }
  const actionType = typeof input.actionType === "string" && input.actionType.trim() ? input.actionType.trim() : "simulate_setup";
  const operationType = normalizeMachineOperation(input.operationType ?? actionType);
  const provider = providerForMachineWorkflow(input.providerId, defaultMachineProviderKind(operationType));
  const classification = classifyMachineWorkflow(actionType);
  const workflow = {
    actionType,
    operationType,
    proposalMode: classification.manualOnly ? "manual_only" as const : classification.approvalRequired ? "proposal" as const : "dry_run" as const,
    apiCallsMade: false as const,
    toolpathGenerated: false as const,
    gcodeSent: false as const,
    machineMotionCommandSent: false as const,
    spindleStarted: false as const,
    laserFired: false as const,
    relayOrPowerCommandSent: false as const,
    firmwareFlashed: false as const,
    serialOrUsbWriteAttempted: false as const,
    hardwareControlAttempted: false as const,
  };

  if (classification.manualOnly) {
    const approval = createApprovalRequest({
      type: "maker_machine_action",
      title: `Maker machine action blocked: ${actionType}`,
      summary: "CNC/laser/electronics bench action is manual-only at the machine and cannot execute through LOCALAI.",
      riskTier: "tier5_manual_only_prohibited",
      physicalTier: classification.physicalTier,
      requestedAction: actionType,
      payload: { projectId: project.id, providerId: provider.id, operationType, executed: false, machineControlEnabled: false, physicalConfirmationRequired: true },
    });
    recordAuditEvent({
      eventType: "maker_machine_workflow",
      action: actionType,
      target: project.id,
      result: "blocked",
      metadata: {
        approvalId: approval.id,
        providerId: provider.id,
        providerStatus: provider.status,
        operationType,
        physicalTier: classification.physicalTier,
        executed: false,
        gcodeSent: false,
        machineMotionCommandSent: false,
        spindleStarted: false,
        laserFired: false,
        relayOrPowerCommandSent: false,
        firmwareFlashed: false,
        serialOrUsbWriteAttempted: false,
        hardwareControlAttempted: false,
      },
    });
    return {
      success: false,
      status: "manual_only",
      executed: false,
      approvalRequired: false,
      approval,
      project,
      provider,
      physicalTier: classification.physicalTier,
      workflow,
      reason: "Manual-only CNC/laser/electronics bench action is blocked from software execution.",
    };
  }

  if (!classification.approvalRequired) {
    recordAuditEvent({
      eventType: "maker_machine_workflow",
      action: actionType,
      target: project.id,
      result: "success",
      metadata: { providerId: provider.id, providerStatus: provider.status, operationType, executed: false, apiCallsMade: false, hardwareControlAttempted: false },
    });
    return {
      success: true,
      status: "proposal",
      executed: false,
      approvalRequired: false,
      project,
      provider,
      physicalTier: classification.physicalTier,
      workflow,
      reason: "Phase 13D recorded a dry-run/review proposal only. No tool or hardware action executed.",
    };
  }

  if (input.approvalId) {
    const approval = getApprovalRequest(input.approvalId);
    const approved = approval?.status === "approved";
    return {
      success: false,
      status: approved ? "not_configured" : "approval_required",
      executed: false,
      approvalRequired: !approved,
      approval: approval ?? undefined,
      project,
      provider,
      physicalTier: classification.physicalTier,
      workflow,
      reason: approved
        ? "Approval exists, but Phase 13D has no configured CAM/CNC/laser/electronics executor and made no tool or hardware calls."
        : "Approval is missing, denied, cancelled, expired, or not approved; no machine/electronics action executed.",
    };
  }

  const approval = createApprovalRequest({
    type: "maker_machine_action",
    title: `Maker machine workflow: ${actionType}`,
    summary: "CNC/laser/CAM/electronics workflow proposal only. Phase 13D never generates live toolpaths, sends G-code, moves axes, starts spindles, fires lasers, flashes firmware, toggles relays, writes serial/USB, or controls hardware.",
    riskTier: "tier4_external_communication",
    physicalTier: classification.physicalTier,
    requestedAction: actionType,
    payload: {
      projectId: project.id,
      projectType: project.type,
      providerId: provider.id,
      providerStatus: provider.status,
      operationType,
      physicalTier: classification.physicalTier,
      executed: false,
      apiCallsMade: false,
      toolpathGenerated: false,
      gcodeSent: false,
      machineMotionCommandSent: false,
      spindleStarted: false,
      laserFired: false,
      relayOrPowerCommandSent: false,
      firmwareFlashed: false,
      serialOrUsbWriteAttempted: false,
      hardwareControlAttempted: false,
    },
  });
  recordAuditEvent({
    eventType: "maker_machine_workflow",
    action: actionType,
    target: project.id,
    result: "success",
    metadata: {
      approvalId: approval.id,
      approvalStatus: approval.status,
      providerId: provider.id,
      providerStatus: provider.status,
      operationType,
      physicalTier: classification.physicalTier,
      executed: false,
      apiCallsMade: false,
      toolpathGenerated: false,
      gcodeSent: false,
      hardwareControlAttempted: false,
    },
  });
  return {
    success: false,
    status: "approval_required",
    executed: false,
    approvalRequired: true,
    approval,
    project,
    provider,
    physicalTier: classification.physicalTier,
    workflow,
    reason: "Approval is required for CAM/G-code preparation, and Phase 13D still has no configured machine/electronics executor.",
  };
}

export function proposeMakerMachineProviderAction(providerId: string, action = "status"): MakerActionResult {
  const provider = listMakerMachineProviders().find(item => item.id === providerId);
  if (!provider) {
    return {
      success: false,
      status: "blocked",
      executed: false,
      approvalRequired: false,
      reason: "Unknown Maker CNC/laser/CAM/electronics provider.",
    };
  }
  const actionType = action.trim() || "status";
  const classified = classifyMachineWorkflow(actionType);
  recordAuditEvent({
    eventType: "maker_machine_provider",
    action: actionType,
    target: provider.id,
    result: classified.blocked ? "blocked" : "success",
    metadata: {
      providerStatus: provider.status,
      providerKind: provider.kind,
      executionEnabled: false,
      hardwareWriteEnabled: false,
      apiCallsMade: false,
      toolpathGenerated: false,
      gcodeSent: false,
      machineMotionCommandSent: false,
      spindleStarted: false,
      laserFired: false,
      relayOrPowerCommandSent: false,
      firmwareFlashed: false,
      serialOrUsbWriteAttempted: false,
      hardwareControlAttempted: false,
      dataLeavesMachine: false,
    },
  });
  return {
    success: false,
    status: classified.manualOnly
      ? "manual_only"
      : classified.approvalRequired
        ? "approval_required"
        : provider.status === "disabled"
          ? "disabled"
          : provider.status === "degraded"
            ? "degraded"
            : "not_configured",
    executed: false,
    approvalRequired: classified.approvalRequired && !classified.manualOnly,
    physicalTier: classified.physicalTier,
    reason: classified.manualOnly
      ? "Dangerous machine/electronics provider action is manual-only at the machine and cannot execute through LOCALAI."
      : classified.approvalRequired
        ? "Provider action is approval-gated and still cannot execute until a later configured durable executor exists."
        : provider.reason,
  };
}

export function proposeMakerCadProviderAction(providerId: string, action = "execute"): MakerActionResult {
  const provider = listMakerCadProviders().find(item => item.id === providerId);
  if (!provider) {
    return {
      success: false,
      status: "blocked",
      executed: false,
      approvalRequired: false,
      reason: "Unknown Maker CAD provider.",
    };
  }
  const actionType = action.trim() || "execute";
  const manufacturePattern = /manufact|fabricat|print|slice|cnc|laser|toolpath|firmware|hardware/i;
  const requiresApprovalPattern = /macro|render|export|execute|run|freecad|kicad|erc|drc|bom/i;
  const isManualOnly = manufacturePattern.test(actionType);
  const status: MakerActionResult["status"] = isManualOnly
    ? "manual_only"
    : provider.status === "ready" && requiresApprovalPattern.test(actionType)
      ? "approval_required"
      : provider.status === "disabled"
        ? "disabled"
        : provider.status === "degraded"
          ? "degraded"
          : "not_configured";
  recordAuditEvent({
    eventType: "maker_cad_provider",
    action: actionType,
    target: provider.id,
    result: isManualOnly ? "blocked" : "success",
    metadata: {
      providerStatus: provider.status,
      providerKind: provider.kind,
      executionEnabled: false,
      toolExecutionAttempted: false,
      dataLeavesMachine: false,
      cloudProvider: provider.cloudProvider,
      manualOnly: isManualOnly,
    },
  });
  return {
    success: false,
    status,
    executed: false,
    approvalRequired: status === "approval_required",
    reason: isManualOnly
      ? "Physical fabrication/manufacturing actions remain manual-only or blocked in Phase 13B."
      : provider.reason,
  };
}

function classifyAction(actionType: string): MakerSafetyTier {
  if (actionType === "read_status") return "read_only";
  if (actionType === "simulate") return "simulate";
  if (actionType === "prepare_job") return "prepare_queue";
  if (actionType === "start_print" || actionType === "export_for_review") return "approval_required_run";
  return "manual_only_at_machine";
}

export function proposeMakerPhysicalAction(projectId: string, input: { actionType?: string; approvalId?: string } = {}): MakerActionResult {
  const project = getMakerProject(projectId);
  if (!project) {
    return {
      success: false,
      status: "blocked",
      executed: false,
      approvalRequired: false,
      reason: "Maker project not found.",
    };
  }
  const actionType = typeof input.actionType === "string" ? input.actionType.trim() : "simulate";
  const safetyTier = classifyAction(actionType);
  const physicalTier = physicalTierForSafety(safetyTier);

  if (safetyTier === "read_only" || safetyTier === "simulate" || safetyTier === "prepare_queue") {
    recordAuditEvent({
      eventType: "maker_action",
      action: actionType,
      target: project.id,
      result: "success",
      metadata: { safetyTier, physicalTier, executed: false, mode: "proposal_only" },
    });
    return {
      success: true,
      status: "proposal",
      executed: false,
      approvalRequired: false,
      project,
      safetyTier,
      physicalTier,
      reason: "Phase 13A recorded a proposal only. No machine action executed.",
    };
  }

  if (input.approvalId) {
    const approval = getApprovalRequest(input.approvalId);
    return {
      success: false,
      status: approval?.status === "approved" && safetyTier === "approval_required_run" ? "not_configured" : "approval_required",
      executed: false,
      approvalRequired: approval?.status !== "approved",
      approval: approval ?? undefined,
      project,
      safetyTier,
      physicalTier,
      reason: approval?.status === "approved"
        ? "Approval exists, but Phase 13A has no configured machine executor."
        : "Approval is missing or not approved; no physical action executed.",
    };
  }

  const approval = createApprovalRequest({
    type: "maker_physical_action",
    title: `Maker action: ${actionType}`,
    summary: "Physical/fabrication action proposal only. Phase 13A never starts machines or sends G-code.",
    riskTier: safetyTier === "manual_only_at_machine" ? "tier5_manual_only_prohibited" : "tier4_external_communication",
    physicalTier,
    requestedAction: actionType,
    payload: {
      projectId: project.id,
      projectType: project.type,
      safetyTier,
      physicalTier,
      executed: false,
      machineControlEnabled: false,
    },
  });

  sqlite.prepare("UPDATE maker_projects SET approval_id = ?, updated_at = ? WHERE id = ?")
    .run(approval.id, nowIso(), project.id);

  recordAuditEvent({
    eventType: "maker_action",
    action: actionType,
    target: project.id,
    result: approval.status === "denied" ? "blocked" : "success",
    metadata: {
      approvalId: approval.id,
      approvalStatus: approval.status,
      safetyTier,
      physicalTier,
      executed: false,
    },
  });

  return {
    success: false,
    status: safetyTier === "manual_only_at_machine" ? "manual_only" : "approval_required",
    executed: false,
    approvalRequired: approval.status !== "denied",
    approval,
    project: getMakerProject(project.id) ?? project,
    safetyTier,
    physicalTier,
    reason: safetyTier === "manual_only_at_machine"
      ? "Manual-only machine action is blocked from software execution."
      : "Approval is required, and Phase 13A still has no machine executor.",
  };
}

export function proposeMakerIntegrationAction(integrationId: string, action = "execute"): MakerActionResult {
  const integration = listMakerIntegrations().find(item => item.id === integrationId);
  if (!integration) {
    return {
      success: false,
      status: "blocked",
      executed: false,
      approvalRequired: false,
      reason: "Unknown Maker integration.",
    };
  }
  recordAuditEvent({
    eventType: "maker_integration",
    action,
    target: integration.id,
    result: "blocked",
    metadata: {
      status: integration.status,
      executionEnabled: false,
      reason: integration.reason,
    },
  });
  return {
    success: false,
    status: integration.status,
    executed: false,
    approvalRequired: false,
    integration,
    reason: integration.reason,
  };
}
