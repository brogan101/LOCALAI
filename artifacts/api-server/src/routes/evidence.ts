/**
 * Evidence Vault Routes — Phase 08B
 * ==================================
 * GET    /evidence/status
 * GET    /evidence/records
 * POST   /evidence/records
 * GET    /evidence/records/:id
 * PATCH  /evidence/records/:id
 * POST   /evidence/records/:id/ingest
 * POST   /evidence/records/:id/delete
 * GET    /evidence/paperless/status
 * POST   /evidence/paperless/sync
 * POST   /evidence/search
 * GET    /evidence/reminders
 */

import { Router } from "express";
import {
  evidenceVault,
  EVIDENCE_CATEGORIES,
  type EvidenceCategory,
  type PrivacyClassification,
  type PaperlessSyncMode,
} from "../lib/evidence-vault.js";

const router = Router();

// GET /evidence/status
router.get("/evidence/status", async (_req, res) => {
  try {
    const status = await evidenceVault.status();
    return res.json({ success: true, ...status });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /evidence/records?category=&status=&includeDeleted=
router.get("/evidence/records", async (req, res) => {
  const categoryRaw = typeof req.query.category === "string" ? req.query.category : undefined;
  const statusRaw   = typeof req.query.status   === "string" ? req.query.status   : undefined;
  const inclDel     = req.query.includeDeleted === "true";

  const category = categoryRaw && EVIDENCE_CATEGORIES.includes(categoryRaw as EvidenceCategory)
    ? (categoryRaw as EvidenceCategory) : undefined;

  try {
    const records = await evidenceVault.listRecords({
      category,
      ingestionStatus: statusRaw as any,
      includeDeleted: inclDel,
    });
    return res.json({ success: true, records });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /evidence/records
router.post("/evidence/records", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const title    = typeof body.title    === "string" ? body.title.trim()    : "";
  const category = typeof body.category === "string" ? body.category.trim() : "other";

  if (!title) return res.status(400).json({ success: false, error: "title required" });

  try {
    const record = await evidenceVault.createRecord({
      title,
      category: (EVIDENCE_CATEGORIES.includes(category as EvidenceCategory) ? category : "other") as EvidenceCategory,
      sourcePath:            typeof body.sourcePath          === "string" ? body.sourcePath          : undefined,
      originalFilename:      typeof body.originalFilename    === "string" ? body.originalFilename    : undefined,
      fileHash:              typeof body.fileHash            === "string" ? body.fileHash            : undefined,
      tags:                  Array.isArray(body.tags)        ? body.tags as string[]                  : undefined,
      projectAssociation:    typeof body.projectAssociation  === "string" ? body.projectAssociation  : undefined,
      entityAssociation:     typeof body.entityAssociation   === "object" && body.entityAssociation !== null ? body.entityAssociation as Record<string, string> : undefined,
      vendor:                typeof body.vendor              === "string" ? body.vendor              : undefined,
      manufacturer:          typeof body.manufacturer        === "string" ? body.manufacturer        : undefined,
      purchaseDate:          typeof body.purchaseDate        === "string" ? body.purchaseDate        : undefined,
      receiptDate:           typeof body.receiptDate         === "string" ? body.receiptDate         : undefined,
      warrantyExpires:       typeof body.warrantyExpires     === "string" ? body.warrantyExpires     : undefined,
      registrationDate:      typeof body.registrationDate    === "string" ? body.registrationDate    : undefined,
      expirationDate:        typeof body.expirationDate      === "string" ? body.expirationDate      : undefined,
      reminderDate:          typeof body.reminderDate        === "string" ? body.reminderDate        : undefined,
      privacyClassification: typeof body.privacyClassification === "string" ? body.privacyClassification as PrivacyClassification : "normal",
      collectionId:          typeof body.collectionId        === "string" ? body.collectionId        : undefined,
    });
    return res.status(201).json({ success: true, record });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /evidence/records/:id
router.get("/evidence/records/:id", async (req, res) => {
  try {
    const record = await evidenceVault.getRecord(req.params.id);
    if (!record) return res.status(404).json({ success: false, error: "Not found" });
    return res.json({ success: true, record });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// PATCH /evidence/records/:id
router.patch("/evidence/records/:id", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  try {
    const record = await evidenceVault.updateRecord(req.params.id, {
      title:                 typeof body.title                === "string" ? body.title                : undefined,
      category:              typeof body.category             === "string" ? body.category as EvidenceCategory : undefined,
      tags:                  Array.isArray(body.tags)         ? body.tags as string[]                   : undefined,
      vendor:                typeof body.vendor               === "string" ? body.vendor               : undefined,
      manufacturer:          typeof body.manufacturer         === "string" ? body.manufacturer         : undefined,
      purchaseDate:          typeof body.purchaseDate         === "string" ? body.purchaseDate         : undefined,
      receiptDate:           typeof body.receiptDate          === "string" ? body.receiptDate          : undefined,
      warrantyExpires:       typeof body.warrantyExpires      === "string" ? body.warrantyExpires      : undefined,
      registrationDate:      typeof body.registrationDate     === "string" ? body.registrationDate     : undefined,
      expirationDate:        typeof body.expirationDate       === "string" ? body.expirationDate       : undefined,
      reminderDate:          typeof body.reminderDate         === "string" ? body.reminderDate         : undefined,
      privacyClassification: typeof body.privacyClassification === "string" ? body.privacyClassification as PrivacyClassification : undefined,
      projectAssociation:    typeof body.projectAssociation   === "string" ? body.projectAssociation   : undefined,
      entityAssociation:     typeof body.entityAssociation    === "object" && body.entityAssociation !== null ? body.entityAssociation as Record<string, string> : undefined,
    });
    if (!record) return res.status(404).json({ success: false, error: "Not found" });
    return res.json({ success: true, record });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /evidence/records/:id/ingest
router.post("/evidence/records/:id/ingest", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  try {
    const result = await evidenceVault.ingestRecord(req.params.id, {
      filePath:     typeof body.filePath     === "string" ? body.filePath     : undefined,
      content:      typeof body.content      === "string" ? body.content      : undefined,
      source:       typeof body.source       === "string" ? body.source       : undefined,
      collectionId: typeof body.collectionId === "string" ? body.collectionId : undefined,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /evidence/records/:id/delete
router.post("/evidence/records/:id/delete", async (req, res) => {
  try {
    const record = await evidenceVault.markDeleted(req.params.id);
    return res.json({ success: true, record });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /evidence/paperless/status
router.get("/evidence/paperless/status", async (_req, res) => {
  try {
    const status = await evidenceVault.getPaperlessStatus();
    return res.json({ success: true, paperless: status });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /evidence/paperless/sync
router.post("/evidence/paperless/sync", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const mode = typeof body.mode === "string" ? body.mode as PaperlessSyncMode : "dry_run";
  try {
    const proposal = await evidenceVault.proposePaperlessSync({ mode });
    return res.json({ success: true, ...proposal });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /evidence/search
router.post("/evidence/search", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const query    = typeof body.query    === "string" ? body.query.trim() : "";
  const category = typeof body.category === "string" && EVIDENCE_CATEGORIES.includes(body.category as EvidenceCategory)
    ? (body.category as EvidenceCategory) : undefined;
  const topK = typeof body.topK === "number" ? body.topK : 5;

  if (!query) return res.status(400).json({ success: false, error: "query required" });

  try {
    const result = await evidenceVault.searchVault(query, category, topK);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /evidence/reminders?lookaheadDays=
router.get("/evidence/reminders", async (req, res) => {
  const lookahead = typeof req.query.lookaheadDays === "string" ? Number(req.query.lookaheadDays) : 90;
  const days = Number.isFinite(lookahead) && lookahead > 0 ? Math.min(lookahead, 365) : 90;
  try {
    const reminders = await evidenceVault.getReminders(days);
    return res.json({ success: true, reminders, lookaheadDays: days, proposalOnly: true, calendarIntegrationStatus: "not_configured" });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /evidence/categories
router.get("/evidence/categories", (_req, res) => {
  return res.json({ success: true, categories: EVIDENCE_CATEGORIES });
});

export default router;
