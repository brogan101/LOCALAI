import { Router } from "express";
import {
  HOMELAB_ARCHITECT_SOURCE_OF_TRUTH,
  createHomelabConfigProposal,
  createHomelabSocAlert,
  generateBlueprint,
  getHomelabConfigProposal,
  getDevice,
  getHomelabProviders,
  getHomelabSocAlert,
  getHomelabSocProviders,
  getHomelabSocStatus,
  getHomelabStatus,
  getNetboxStatus,
  getNautobotStatus,
  getSite,
  getSubnet,
  getService,
  getVlan,
  listHomelabConfigProposals,
  listHomelabSocAlerts,
  listHomelabSocRemediations,
  listDevices,
  listServices,
  listSites,
  listSubnets,
  listVlans,
  generateHomelabSocReport,
  proposeHomelabSocRemediation,
  requestHomelabConfigApply,
  requestHomelabConfigRollback,
  upsertDevice,
  upsertService,
  upsertSite,
  upsertSubnet,
  upsertVlan,
  validateHomelabConfigProposal,
  validateSubnetPrefix,
  validateVlanId,
  type HomelabConfigProposalType,
  type HomelabConfigProviderId,
  type HomelabConfigValidationKind,
  type HomelabDataConfidence,
  type HomelabDeviceRole,
  type HomelabDeviceStatus,
  type HomelabSocProviderId,
  type HomelabSocRemediationAction,
  type HomelabSocReportKind,
  type HomelabSocSeverity,
  type HomelabServiceProtocol,
} from "../lib/homelab-architect.js";

const router = Router();

// ── Source of truth ───────────────────────────────────────────────────────────

router.get("/homelab/source-of-truth", (_req, res) => {
  return res.json({ success: true, sourceOfTruth: HOMELAB_ARCHITECT_SOURCE_OF_TRUTH });
});

// ── Status & blueprint ────────────────────────────────────────────────────────

router.get("/homelab/status", (_req, res) => {
  try {
    return res.json({ success: true, status: getHomelabStatus() });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.get("/homelab/blueprint", (_req, res) => {
  try {
    return res.json({ success: true, blueprint: generateBlueprint() });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// ── Provider status ───────────────────────────────────────────────────────────

router.get("/homelab/providers", (_req, res) => {
  return res.json({ success: true, providers: getHomelabProviders() });
});

router.get("/homelab/providers/netbox", (_req, res) => {
  return res.json({ success: true, provider: getNetboxStatus() });
});

router.get("/homelab/providers/nautobot", (_req, res) => {
  return res.json({ success: true, provider: getNautobotStatus() });
});

// ── Phase 15B config proposal pipeline ───────────────────────────────────────

router.get("/homelab/config/providers", (_req, res) => {
  return res.json({ success: true, providers: getHomelabProviders() });
});

router.get("/homelab/config/proposals", (req, res) => {
  try {
    const limit = Number.parseInt(String(req.query["limit"] ?? "100"), 10);
    const proposals = listHomelabConfigProposals(Number.isFinite(limit) ? limit : 100);
    return res.json({ success: true, proposals, count: proposals.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.get("/homelab/config/proposals/:id", (req, res) => {
  const proposal = getHomelabConfigProposal(req.params["id"]!);
  if (!proposal) return res.status(404).json({ success: false, message: "HomeLab config proposal not found" });
  return res.json({ success: true, proposal });
});

router.post("/homelab/config/proposals", (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const proposal = createHomelabConfigProposal({
      proposalType: body["proposalType"] as HomelabConfigProposalType | undefined,
      targetProvider: body["targetProvider"] as HomelabConfigProviderId | undefined,
      sourceInventoryRef: typeof body["sourceInventoryRef"] === "string" ? body["sourceInventoryRef"] : undefined,
      backupPlan: body["backupPlan"] && typeof body["backupPlan"] === "object" ? body["backupPlan"] as Record<string, unknown> : undefined,
      rollbackPlan: body["rollbackPlan"] && typeof body["rollbackPlan"] === "object" ? body["rollbackPlan"] as Record<string, unknown> : undefined,
    });
    return res.status(201).json({ success: true, proposal });
  } catch (err) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }
});

router.post("/homelab/config/proposals/:id/validate", (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const outcome = validateHomelabConfigProposal(req.params["id"]!, {
      kind: body["kind"] as HomelabConfigValidationKind | undefined,
    });
    return res.json({ success: true, outcome });
  } catch (err) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }
});

router.post("/homelab/config/proposals/:id/apply", (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const outcome = requestHomelabConfigApply(req.params["id"]!, {
      approvalId: typeof body["approvalId"] === "string" ? body["approvalId"] : undefined,
    });
    return res.json({ success: true, outcome });
  } catch (err) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }
});

router.post("/homelab/config/proposals/:id/rollback", (req, res) => {
  try {
    const outcome = requestHomelabConfigRollback(req.params["id"]!);
    return res.json({ success: true, outcome });
  } catch (err) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// ── Phase 16 Home SOC / security monitoring ─────────────────────────────────

router.get("/homelab/soc/status", (_req, res) => {
  try {
    return res.json({ success: true, status: getHomelabSocStatus() });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.get("/homelab/soc/providers", (_req, res) => {
  return res.json({ success: true, providers: getHomelabSocProviders() });
});

router.get("/homelab/soc/alerts", (req, res) => {
  try {
    const limit = Number.parseInt(String(req.query["limit"] ?? "100"), 10);
    const alerts = listHomelabSocAlerts(Number.isFinite(limit) ? limit : 100);
    return res.json({ success: true, alerts, count: alerts.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.get("/homelab/soc/alerts/:id", (req, res) => {
  const alert = getHomelabSocAlert(req.params["id"]!);
  if (!alert) return res.status(404).json({ success: false, message: "Home SOC alert not found" });
  return res.json({ success: true, alert });
});

router.post("/homelab/soc/alerts", (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const title = typeof body["title"] === "string" ? body["title"] : "";
    const summary = body["summary"] && typeof body["summary"] === "object" ? body["summary"] as Record<string, unknown> : undefined;
    const alert = createHomelabSocAlert({
      title,
      severity: body["severity"] as HomelabSocSeverity | undefined,
      category: typeof body["category"] === "string" ? body["category"] : undefined,
      sourceProvider: body["sourceProvider"] as HomelabSocProviderId | undefined,
      deviceRef: typeof body["deviceRef"] === "string" ? body["deviceRef"] : undefined,
      summary,
      evidenceRefs: Array.isArray(body["evidenceRefs"]) ? body["evidenceRefs"].map((entry) => String(entry)) : undefined,
    });
    return res.status(201).json({ success: true, alert });
  } catch (err) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }
});

router.post("/homelab/soc/reports", (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const report = generateHomelabSocReport((body["kind"] as HomelabSocReportKind | undefined) ?? "unknown_device_report");
    return res.json({ success: true, report });
  } catch (err) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }
});

router.get("/homelab/soc/remediations", (req, res) => {
  try {
    const limit = Number.parseInt(String(req.query["limit"] ?? "100"), 10);
    const remediations = listHomelabSocRemediations(Number.isFinite(limit) ? limit : 100);
    return res.json({ success: true, remediations, count: remediations.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.post("/homelab/soc/alerts/:id/remediation", (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const outcome = proposeHomelabSocRemediation(req.params["id"]!, (body["action"] as HomelabSocRemediationAction | undefined) ?? "read_only_review", {
      approvalId: typeof body["approvalId"] === "string" ? body["approvalId"] : undefined,
    });
    return res.json({ success: true, outcome });
  } catch (err) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// ── Sites ─────────────────────────────────────────────────────────────────────

router.get("/homelab/sites", (_req, res) => {
  try {
    const sites = listSites();
    return res.json({ success: true, sites, count: sites.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.get("/homelab/sites/:id", (req, res) => {
  const site = getSite(req.params["id"]!);
  if (!site) return res.status(404).json({ success: false, message: "Site not found" });
  return res.json({ success: true, site });
});

router.post("/homelab/sites", (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body["name"] === "string" ? body["name"].trim() : "";
    if (!name) return res.status(400).json({ success: false, message: "name is required" });
    const site = upsertSite({
      id: typeof body["id"] === "string" ? body["id"] : undefined,
      name,
      description: typeof body["description"] === "string" ? body["description"] : "",
      location: typeof body["location"] === "string" ? body["location"] : "",
      confidence: (body["confidence"] as HomelabDataConfidence | undefined) ?? "unknown",
    });
    return res.status(201).json({ success: true, site });
  } catch (err) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// ── Devices ───────────────────────────────────────────────────────────────────

router.get("/homelab/devices", (_req, res) => {
  try {
    const devices = listDevices();
    return res.json({ success: true, devices, count: devices.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.get("/homelab/devices/:id", (req, res) => {
  const device = getDevice(req.params["id"]!);
  if (!device) return res.status(404).json({ success: false, message: "Device not found" });
  return res.json({ success: true, device });
});

router.post("/homelab/devices", (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body["name"] === "string" ? body["name"].trim() : "";
    if (!name) return res.status(400).json({ success: false, message: "name is required" });
    const device = upsertDevice({
      id: typeof body["id"] === "string" ? body["id"] : undefined,
      name,
      role: (body["role"] as HomelabDeviceRole | undefined) ?? "unknown",
      siteId: typeof body["siteId"] === "string" ? body["siteId"] : "",
      make: typeof body["make"] === "string" ? body["make"] : "",
      model: typeof body["model"] === "string" ? body["model"] : "",
      serialNumber: typeof body["serialNumber"] === "string" ? body["serialNumber"] : "",
      managementIpRef: typeof body["managementIpRef"] === "string" ? body["managementIpRef"] : "",
      status: (body["status"] as HomelabDeviceStatus | undefined) ?? "unknown",
      confidence: (body["confidence"] as HomelabDataConfidence | undefined) ?? "unknown",
      notes: typeof body["notes"] === "string" ? body["notes"] : "",
    });
    return res.status(201).json({ success: true, device });
  } catch (err) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// ── VLANs ─────────────────────────────────────────────────────────────────────

router.get("/homelab/vlans", (_req, res) => {
  try {
    const vlans = listVlans();
    return res.json({ success: true, vlans, count: vlans.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.get("/homelab/vlans/:id", (req, res) => {
  const vlan = getVlan(req.params["id"]!);
  if (!vlan) return res.status(404).json({ success: false, message: "VLAN not found" });
  return res.json({ success: true, vlan });
});

router.post("/homelab/vlans", (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body["name"] === "string" ? body["name"].trim() : "";
    const vlanId = typeof body["vlanId"] === "number" ? body["vlanId"] : Number.parseInt(String(body["vlanId"] ?? ""), 10);
    if (!name) return res.status(400).json({ success: false, message: "name is required" });
    if (!Number.isFinite(vlanId)) return res.status(400).json({ success: false, message: "vlanId must be a number" });

    const validation = validateVlanId(vlanId);
    if (!validation.valid) return res.status(422).json({ success: false, message: validation.reason });

    const vlan = upsertVlan({
      id: typeof body["id"] === "string" ? body["id"] : undefined,
      name,
      vlanId,
      description: typeof body["description"] === "string" ? body["description"] : "",
      siteId: typeof body["siteId"] === "string" ? body["siteId"] : "",
      confidence: (body["confidence"] as HomelabDataConfidence | undefined) ?? "unknown",
    });
    return res.status(201).json({ success: true, vlan });
  } catch (err) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// ── Subnets ───────────────────────────────────────────────────────────────────

router.get("/homelab/subnets", (_req, res) => {
  try {
    const subnets = listSubnets();
    return res.json({ success: true, subnets, count: subnets.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.get("/homelab/subnets/:id", (req, res) => {
  const subnet = getSubnet(req.params["id"]!);
  if (!subnet) return res.status(404).json({ success: false, message: "Subnet not found" });
  return res.json({ success: true, subnet });
});

router.post("/homelab/subnets", (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const prefix = typeof body["prefix"] === "string" ? body["prefix"].trim() : "";
    if (!prefix) return res.status(400).json({ success: false, message: "prefix is required" });

    const validation = validateSubnetPrefix(prefix);
    if (!validation.valid) return res.status(422).json({ success: false, message: validation.reason });

    const subnet = upsertSubnet({
      id: typeof body["id"] === "string" ? body["id"] : undefined,
      prefix,
      description: typeof body["description"] === "string" ? body["description"] : "",
      vlanId: typeof body["vlanId"] === "string" ? body["vlanId"] : "",
      siteId: typeof body["siteId"] === "string" ? body["siteId"] : "",
      gatewayRef: typeof body["gatewayRef"] === "string" ? body["gatewayRef"] : "",
      confidence: (body["confidence"] as HomelabDataConfidence | undefined) ?? "unknown",
    });
    return res.status(201).json({ success: true, subnet });
  } catch (err) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// ── Services ──────────────────────────────────────────────────────────────────

router.get("/homelab/services", (_req, res) => {
  try {
    const services = listServices();
    return res.json({ success: true, services, count: services.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.get("/homelab/services/:id", (req, res) => {
  const service = getService(req.params["id"]!);
  if (!service) return res.status(404).json({ success: false, message: "Service not found" });
  return res.json({ success: true, service });
});

router.post("/homelab/services", (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body["name"] === "string" ? body["name"].trim() : "";
    if (!name) return res.status(400).json({ success: false, message: "name is required" });
    const service = upsertService({
      id: typeof body["id"] === "string" ? body["id"] : undefined,
      name,
      serviceType: typeof body["serviceType"] === "string" ? body["serviceType"] : "",
      hostDeviceId: typeof body["hostDeviceId"] === "string" ? body["hostDeviceId"] : "",
      containerName: typeof body["containerName"] === "string" ? body["containerName"] : "",
      port: typeof body["port"] === "number" ? body["port"] : Number.parseInt(String(body["port"] ?? "0"), 10),
      protocol: (body["protocol"] as HomelabServiceProtocol | undefined) ?? "unknown",
      confidence: (body["confidence"] as HomelabDataConfidence | undefined) ?? "unknown",
      status: (body["status"] as HomelabDeviceStatus | undefined) ?? "unknown",
      notes: typeof body["notes"] === "string" ? body["notes"] : "",
    });
    return res.status(201).json({ success: true, service });
  } catch (err) {
    return res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// ── Validation helpers ────────────────────────────────────────────────────────

router.post("/homelab/validate/vlan", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const vlanId = typeof body["vlanId"] === "number" ? body["vlanId"] : Number.parseInt(String(body["vlanId"] ?? ""), 10);
  const result = validateVlanId(vlanId);
  return res.json({ success: true, ...result });
});

router.post("/homelab/validate/subnet", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const prefix = typeof body["prefix"] === "string" ? body["prefix"] : "";
  const result = validateSubnetPrefix(prefix);
  return res.json({ success: true, ...result });
});

export default router;
