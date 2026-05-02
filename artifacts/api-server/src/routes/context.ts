import { Router } from "express";
import { workspaceContextService } from "../lib/code-context.js";
import {
  AUTOMOTIVE_SOURCE_OF_TRUTH,
  addRepairLogEntry,
  createDiagnosticCase,
  createVehicleProfile,
  getAutomotiveStatus,
  getDiagnosticCase,
  getOrCreateFoxbodyProfile,
  getVehicleProfile,
  listAutomotiveProviders,
  listDiagnosticCases,
  listVehicleProfiles,
  proposeVehicleAction,
} from "../lib/automotive-diagnostics.js";
import {
  DIGITAL_TWIN_SOURCE_OF_TRUTH,
  archiveDigitalTwinEntity,
  createDigitalTwinEntity,
  createDigitalTwinRelationship,
  deleteDigitalTwinRelationship,
  evaluateDigitalTwinActionSafety,
  getDigitalTwinEntity,
  getDigitalTwinEntityDetail,
  getDigitalTwinRelationship,
  getDigitalTwinStatus,
  listDigitalTwinEntities,
  listDigitalTwinRelationships,
  searchDigitalTwinGraph,
  updateDigitalTwinEntity,
  type DigitalTwinEntityType,
  type DigitalTwinRelationshipStatus,
} from "../lib/digital-twin.js";
import {
  INVENTORY_SOURCE_OF_TRUTH,
  checkInventoryAvailability,
  createInventoryItem,
  createInventoryLabelPlan,
  createLowStockReorderSuggestions,
  createProjectRealityPipeline,
  getInventoryItem,
  getInventoryStatus,
  getProjectRealityPipeline,
  listInventoryItems,
  listInventoryProviders,
  listProjectRealityPipelines,
  proposeInventoryAction,
  requestInventoryItemDeletion,
} from "../lib/inventory-pipeline.js";
import { agentEditsGuard } from "../lib/route-guards.js";

const router = Router();

router.get("/context/status", async (_req, res) => {
  const status = await workspaceContextService.getStatus();
  return res.json(status);
});

// ── Phase 18 Automotive / Master Tech diagnostics ───────────────────────────

router.get("/context/automotive/source-of-truth", (_req, res) => {
  return res.json({ success: true, sourceOfTruth: AUTOMOTIVE_SOURCE_OF_TRUTH });
});

router.get("/context/automotive/status", (_req, res) => {
  return res.json({ success: true, status: getAutomotiveStatus() });
});

router.get("/context/automotive/providers", (_req, res) => {
  return res.json({ success: true, providers: listAutomotiveProviders() });
});

router.get("/context/automotive/vehicles", (req, res) => {
  const limit = Number.parseInt(String(req.query["limit"] ?? "100"), 10);
  const vehicles = listVehicleProfiles(Number.isFinite(limit) ? limit : 100);
  return res.json({ success: true, vehicles, count: vehicles.length });
});

router.post("/context/automotive/vehicles", (req, res) => {
  try {
    const vehicle = createVehicleProfile(req.body ?? {});
    return res.status(201).json({ success: true, vehicle });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/context/automotive/vehicles/foxbody/preload", (_req, res) => {
  const vehicle = getOrCreateFoxbodyProfile();
  return res.status(201).json({ success: true, vehicle });
});

router.get("/context/automotive/vehicles/:id", (req, res) => {
  const vehicle = getVehicleProfile(req.params["id"]!);
  if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle profile not found" });
  return res.json({ success: true, vehicle });
});

router.post("/context/automotive/vehicles/:id/repair-log", (req, res) => {
  try {
    const vehicle = addRepairLogEntry(req.params["id"]!, req.body ?? {});
    return res.status(201).json({ success: true, vehicle });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/context/automotive/cases", (req, res) => {
  const vehicleId = typeof req.query["vehicleId"] === "string" ? req.query["vehicleId"] : undefined;
  const limit = Number.parseInt(String(req.query["limit"] ?? "100"), 10);
  const cases = listDiagnosticCases(vehicleId, Number.isFinite(limit) ? limit : 100);
  return res.json({ success: true, cases, count: cases.length });
});

router.post("/context/automotive/cases", (req, res) => {
  try {
    const diagnosticCase = createDiagnosticCase(req.body ?? {});
    return res.status(201).json({ success: true, case: diagnosticCase });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/context/automotive/cases/:id", (req, res) => {
  const diagnosticCase = getDiagnosticCase(req.params["id"]!);
  if (!diagnosticCase) return res.status(404).json({ success: false, message: "Diagnostic case not found" });
  return res.json({ success: true, case: diagnosticCase });
});

router.post("/context/automotive/actions/propose", (req, res) => {
  const result = proposeVehicleAction(req.body ?? {});
  return res.status(result.status === "denied" || result.status === "blocked" || result.status === "manual_only" ? 409 : 200).json(result);
});

// ── Phase 17A Digital Twin graph ─────────────────────────────────────────────

router.get("/context/digital-twin/source-of-truth", (_req, res) => {
  return res.json({ success: true, sourceOfTruth: DIGITAL_TWIN_SOURCE_OF_TRUTH });
});

router.get("/context/digital-twin/status", (_req, res) => {
  try {
    return res.json({ success: true, status: getDigitalTwinStatus() });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/context/digital-twin/entities", (req, res) => {
  try {
    const limit = Number.parseInt(String(req.query["limit"] ?? "200"), 10);
    const type = typeof req.query["type"] === "string" ? req.query["type"] as DigitalTwinEntityType : undefined;
    const includeArchived = String(req.query["includeArchived"] ?? "false") === "true";
    const entities = listDigitalTwinEntities({ limit: Number.isFinite(limit) ? limit : 200, type, includeArchived });
    return res.json({ success: true, entities, count: entities.length });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/context/digital-twin/entities", (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const entity = createDigitalTwinEntity({
      id: typeof body["id"] === "string" ? body["id"] : undefined,
      type: body["type"] as DigitalTwinEntityType,
      name: typeof body["name"] === "string" ? body["name"] : "",
      description: typeof body["description"] === "string" ? body["description"] : "",
      metadata: body["metadata"] && typeof body["metadata"] === "object" ? body["metadata"] as Record<string, unknown> : undefined,
      sourceRefs: Array.isArray(body["sourceRefs"]) ? body["sourceRefs"] as any : undefined,
      privacyClassification: body["privacyClassification"] as any,
      sensitivity: body["sensitivity"] as any,
      stateConfidence: body["stateConfidence"] as any,
      providerStatus: body["providerStatus"] as any,
    });
    return res.status(201).json({ success: true, entity });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/context/digital-twin/entities/:id", async (req, res) => {
  try {
    const detail = await getDigitalTwinEntityDetail(req.params["id"]!);
    if (!detail) return res.status(404).json({ success: false, message: "Digital Twin entity not found" });
    return res.json({ success: true, detail });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put("/context/digital-twin/entities/:id", (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const entity = updateDigitalTwinEntity(req.params["id"]!, body as any);
    return res.json({ success: true, entity });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/context/digital-twin/entities/:id/archive", (req, res) => {
  const forceArchive = !!(req.body as Record<string, unknown> | undefined)?.["forceArchive"];
  const outcome = archiveDigitalTwinEntity(req.params["id"]!, { forceArchive });
  return res.status(outcome.blocked ? 409 : 200).json({ success: !outcome.blocked, ...outcome });
});

router.get("/context/digital-twin/relationships", (req, res) => {
  try {
    const entityId = typeof req.query["entityId"] === "string" ? req.query["entityId"] : undefined;
    const includeDeleted = String(req.query["includeDeleted"] ?? "false") === "true";
    const relationships = listDigitalTwinRelationships({ entityId, includeDeleted });
    return res.json({ success: true, relationships, count: relationships.length });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/context/digital-twin/relationships", (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const relationship = createDigitalTwinRelationship({
      id: typeof body["id"] === "string" ? body["id"] : undefined,
      sourceEntityId: typeof body["sourceEntityId"] === "string" ? body["sourceEntityId"] : "",
      relationType: typeof body["relationType"] === "string" ? body["relationType"] : "",
      targetEntityId: typeof body["targetEntityId"] === "string" ? body["targetEntityId"] : "",
      confidence: typeof body["confidence"] === "number" ? body["confidence"] : undefined,
      status: body["status"] as DigitalTwinRelationshipStatus | undefined,
      provenance: body["provenance"] && typeof body["provenance"] === "object" ? body["provenance"] as any : undefined,
    });
    return res.status(201).json({ success: true, relationship });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/context/digital-twin/relationships/:id", (req, res) => {
  const relationship = getDigitalTwinRelationship(req.params["id"]!);
  if (!relationship) return res.status(404).json({ success: false, message: "Digital Twin relationship not found" });
  return res.json({ success: true, relationship });
});

router.post("/context/digital-twin/relationships/:id/delete", (req, res) => {
  const outcome = deleteDigitalTwinRelationship(req.params["id"]!);
  return res.status(outcome.deleted ? 200 : 404).json({ success: outcome.deleted, ...outcome });
});

router.post("/context/digital-twin/search", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const query = typeof body["query"] === "string" ? body["query"] : "";
  const limit = typeof body["limit"] === "number" ? body["limit"] : 50;
  return res.json({ success: true, ...searchDigitalTwinGraph(query, limit) });
});

router.post("/context/digital-twin/entities/:id/action-safety", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const action = typeof body["action"] === "string" ? body["action"] : "status_read";
  const input = body["input"] && typeof body["input"] === "object" ? body["input"] as Record<string, string> : {};
  return res.json({ success: true, result: evaluateDigitalTwinActionSafety(req.params["id"]!, action, input) });
});

// ── Phase 17B Inventory / project-to-reality pipeline ───────────────────────

router.get("/context/inventory/source-of-truth", (_req, res) => {
  return res.json({ success: true, sourceOfTruth: INVENTORY_SOURCE_OF_TRUTH });
});

router.get("/context/inventory/status", (_req, res) => {
  return res.json({ success: true, status: getInventoryStatus() });
});

router.get("/context/inventory/providers", (_req, res) => {
  return res.json({ success: true, providers: listInventoryProviders() });
});

router.get("/context/inventory/items", (req, res) => {
  const includeDeleted = String(req.query["includeDeleted"] ?? "false") === "true";
  const limit = Number.parseInt(String(req.query["limit"] ?? "200"), 10);
  const items = listInventoryItems({ includeDeleted, limit: Number.isFinite(limit) ? limit : 200 });
  return res.json({ success: true, items, count: items.length });
});

router.post("/context/inventory/items", (req, res) => {
  try {
    const item = createInventoryItem(req.body ?? {});
    return res.status(201).json({ success: true, item });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/context/inventory/items/:id", (req, res) => {
  const item = getInventoryItem(req.params["id"]!);
  if (!item) return res.status(404).json({ success: false, message: "Inventory item not found" });
  return res.json({ success: true, item });
});

router.post("/context/inventory/items/:id/label-plan", (req, res) => {
  const labelType = ["qr", "nfc", "both"].includes(String(req.body?.labelType)) ? req.body.labelType as "qr" | "nfc" | "both" : "qr";
  const result = createInventoryLabelPlan(req.params["id"]!, labelType);
  return res.status(result.success ? 200 : 404).json(result);
});

router.post("/context/inventory/items/:id/delete", (req, res) => {
  const result = requestInventoryItemDeletion(req.params["id"]!, typeof req.body?.approvalId === "string" ? req.body.approvalId : undefined);
  return res.status(result.status === "denied" || result.status === "blocked" ? 409 : 200).json(result);
});

router.post("/context/inventory/availability", (req, res) => {
  const body = (req.body ?? {}) as { items?: Array<{ itemId?: string; name?: string; requiredQuantity?: number }> };
  return res.json({ success: true, checks: checkInventoryAvailability({ items: body.items ?? [] }) });
});

router.get("/context/inventory/pipelines", (req, res) => {
  const limit = Number.parseInt(String(req.query["limit"] ?? "100"), 10);
  const pipelines = listProjectRealityPipelines(Number.isFinite(limit) ? limit : 100);
  return res.json({ success: true, pipelines, count: pipelines.length });
});

router.post("/context/inventory/pipelines", (req, res) => {
  try {
    const pipeline = createProjectRealityPipeline(req.body ?? {});
    return res.status(201).json({ success: true, pipeline });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/context/inventory/pipelines/:id", (req, res) => {
  const pipeline = getProjectRealityPipeline(req.params["id"]!);
  if (!pipeline) return res.status(404).json({ success: false, message: "Project-to-reality pipeline not found" });
  return res.json({ success: true, pipeline });
});

router.post("/context/inventory/actions/propose", (req, res) => {
  const result = proposeInventoryAction(req.body ?? {});
  return res.status(result.status === "denied" || result.status === "blocked" ? 409 : 200).json(result);
});

router.post("/context/inventory/reorder-suggestions", (_req, res) => {
  const suggestions = createLowStockReorderSuggestions();
  return res.json({ success: true, suggestions, count: suggestions.length });
});

router.get("/context/workspaces", async (_req, res) => {
  const workspaces = await workspaceContextService.getWorkspaceSummaries();
  return res.json({ workspaces });
});

router.post("/context/index", async (req, res) => {
  const { workspacePath, force } = req.body;
  try {
    if (workspacePath) {
      const index = await workspaceContextService.indexWorkspace(workspacePath, !!force);
      return res.json({ success: true, workspace: index.rootPath, fileCount: index.fileCount, symbolCount: index.symbolCount });
    }
    const workspaces = await workspaceContextService.refreshKnownWorkspaces("manual");
    return res.json({ success: true, workspaces });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/context/search", async (req, res) => {
  const { query, workspacePath, maxFiles, maxChars } = req.body;
  if (!query?.trim()) {
    return res.status(400).json({ success: false, message: "query required" });
  }
  try {
    const result = await workspaceContextService.search(query, workspacePath, maxFiles, maxChars);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/context/file", async (req, res) => {
  const filePath = String(req.query.path || "");
  const workspacePath = req.query.workspacePath ? String(req.query.workspacePath) : undefined;
  if (!filePath) {
    return res.status(400).json({ success: false, message: "path query parameter required" });
  }
  try {
    const result = await workspaceContextService.readWorkspaceFile(filePath, workspacePath);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/context/read-write-verify", agentEditsGuard("apply context read-write-verify edit"), async (req, res) => {
  const { filePath, updatedContent, workspacePath } = req.body;
  if (!filePath || typeof updatedContent !== "string") {
    return res.status(400).json({ success: false, message: "filePath and updatedContent are required" });
  }
  try {
    const result = await workspaceContextService.applyReadWriteVerify(filePath, updatedContent, workspacePath);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
