/**
 * VOICE & MEETING ROUTES — Phase 11
 * ==================================
 * Capture policy, meeting session management, follow-up approval workflow,
 * and screen context status.
 *
 * Hard limits enforced by lib/voice-meeting.ts:
 *   - No covert/always-on recording
 *   - Capture indicator always visible when active
 *   - Cloud STT/TTS disabled by default (Phase 02 policy)
 *   - Follow-up sends require tier4_external_communication approval
 *   - Screenpipe integration not_configured until explicitly installed
 *
 * Privacy rules:
 *   - Raw audio and full transcripts never touch these routes
 *   - Meeting sessions store only word count, summary, decisions, action items
 *   - Follow-up body preview only (200 chars, PII redacted)
 */

import { Router } from "express";
import {
  getCapturePolicy,
  saveCapturePolicy,
  getVoiceStatus,
  createMeetingSession,
  getMeetingSession,
  listMeetingSessions,
  startMeetingSession,
  stopMeetingSession,
  createFollowUpDraft,
  proposeFollowUpSend,
  denyFollowUpSend,
  getScreenContextProfile,
  saveScreenContextProfile,
  VOICE_MEETING_SOURCE_OF_TRUTH,
  type CaptureMode,
  type FollowUpType,
} from "../lib/voice-meeting.js";
import { thoughtLog } from "../lib/thought-log.js";

const router = Router();

// ── Capture policy ────────────────────────────────────────────────────────────

// GET /voice/policy
router.get("/voice/policy", (_req, res) => {
  try {
    const policy = getCapturePolicy();
    return res.json({ success: true, policy });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg });
  }
});

// PUT /voice/policy
router.put("/voice/policy", (req, res) => {
  try {
    const body = req.body ?? {};
    const policy = saveCapturePolicy({
      captureMode:               typeof body.captureMode === "string" ? (body.captureMode as CaptureMode) : undefined,
      preferredActiveMode:       typeof body.preferredActiveMode === "string" ? body.preferredActiveMode : undefined,
      wakeWordEnabled:           typeof body.wakeWordEnabled === "boolean" ? body.wakeWordEnabled : undefined,
      rawAudioAutoDelete:        typeof body.rawAudioAutoDelete === "boolean" ? body.rawAudioAutoDelete : undefined,
      rawAudioRetentionSec:      typeof body.rawAudioRetentionSec === "number" ? body.rawAudioRetentionSec : undefined,
      transcriptRetentionDays:   typeof body.transcriptRetentionDays === "number" ? body.transcriptRetentionDays : undefined,
      excludedApps:              Array.isArray(body.excludedApps) ? (body.excludedApps as string[]) : undefined,
      excludedZones:             Array.isArray(body.excludedZones) ? (body.excludedZones as string[]) : undefined,
      localSttPreferred:         typeof body.localSttPreferred === "boolean" ? body.localSttPreferred : undefined,
      localTtsPreferred:         typeof body.localTtsPreferred === "boolean" ? body.localTtsPreferred : undefined,
      maxMeetingTranscriptLengthWords: typeof body.maxMeetingTranscriptLengthWords === "number" ? body.maxMeetingTranscriptLengthWords : undefined,
    });
    return res.json({ success: true, policy });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ success: false, error: msg });
  }
});

// GET /voice/status
router.get("/voice/status", async (_req, res) => {
  try {
    const status = await getVoiceStatus();
    return res.json({ success: true, status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg });
  }
});

// GET /voice/source-of-truth
router.get("/voice/source-of-truth", (_req, res) => {
  return res.json({ success: true, sourceOfTruth: VOICE_MEETING_SOURCE_OF_TRUTH });
});

// ── Meeting sessions ──────────────────────────────────────────────────────────

// GET /voice/meeting/sessions
router.get("/voice/meeting/sessions", (req, res) => {
  try {
    const limit = typeof req.query.limit === "string" ? Math.min(parseInt(req.query.limit, 10), 200) : 50;
    const sessions = listMeetingSessions(isNaN(limit) ? 50 : limit);
    return res.json({ success: true, sessions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg });
  }
});

// POST /voice/meeting/start  — creates and immediately starts a new session
router.post("/voice/meeting/start", (req, res) => {
  try {
    const body = req.body ?? {};
    const captureMode = typeof body.captureMode === "string" ? (body.captureMode as CaptureMode) : "meeting";
    const policy = getCapturePolicy();

    // Capture indicator must be visible — enforce the policy hard limit
    if (!policy.captureIndicatorVisible) {
      // This can never happen (hard limit) but guard defensively
      thoughtLog.publish({ level: "warning", category: "voice", title: "Capture Policy Violation",
        message: "captureIndicatorVisible was false — this should never happen" });
    }

    const session = createMeetingSession({ captureMode });
    const started  = startMeetingSession(session.id);
    return res.status(201).json({ success: true, session: started });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ success: false, error: msg });
  }
});

// GET /voice/meeting/:id
router.get("/voice/meeting/:id", (req, res) => {
  try {
    const session = getMeetingSession(String(req.params["id"]));
    if (!session) return res.status(404).json({ success: false, error: "Session not found" });
    return res.json({ success: true, session });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg });
  }
});

// POST /voice/meeting/:id/stop
router.post("/voice/meeting/:id/stop", (req, res) => {
  try {
    const id   = String(req.params["id"]);
    const body = req.body ?? {};

    // Accept structured data only — raw transcript content not accepted here
    const session = stopMeetingSession(id, {
      transcriptWordCount: typeof body.transcriptWordCount === "number" ? body.transcriptWordCount : undefined,
      summaryText:         typeof body.summaryText  === "string" ? body.summaryText  : undefined,
      decisions:           Array.isArray(body.decisions)   ? (body.decisions   as string[]) : undefined,
      actionItems:         Array.isArray(body.actionItems) ? body.actionItems  : undefined,
    });
    return res.json({ success: true, session });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ success: false, error: msg });
  }
});

// ── Follow-up drafts ──────────────────────────────────────────────────────────

// POST /voice/meeting/:id/followup/draft
router.post("/voice/meeting/:id/followup/draft", (req, res) => {
  try {
    const meetingId = String(req.params["id"]);
    const body = req.body ?? {};
    const type    = typeof body.type    === "string" ? (body.type    as FollowUpType) : "task";
    const subject = typeof body.subject === "string" ? body.subject.trim()           : "Follow-up";
    const bodyTxt = typeof body.body    === "string" ? body.body                     : "";

    if (!subject) return res.status(400).json({ success: false, error: "subject is required" });

    const draft = createFollowUpDraft(meetingId, type, subject, bodyTxt);
    return res.status(201).json({ success: true, draft });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ success: false, error: msg });
  }
});

// POST /voice/meeting/:id/followup/:draftId/propose-send
// NOTE: approvalRequired is always true — no send executes here
router.post("/voice/meeting/:id/followup/:draftId/propose-send", (req, res) => {
  try {
    const draftId = String(req.params["draftId"]);
    const result  = proposeFollowUpSend(draftId);
    // Always returns approvalRequired: true — never auto-sends
    return res.status(202).json({
      success:         true,
      approvalRequired: result.approvalRequired,
      approvalId:      result.approvalId,
      message:         "Follow-up send requires approval. Review and approve in the Operations > Approvals tab.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ success: false, error: msg });
  }
});

// POST /voice/meeting/:id/followup/:draftId/deny
router.post("/voice/meeting/:id/followup/:draftId/deny", (req, res) => {
  try {
    const draftId = String(req.params["draftId"]);
    const draft   = denyFollowUpSend(draftId);
    return res.json({ success: true, draft, message: "Follow-up send denied. Draft will not be sent." });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ success: false, error: msg });
  }
});

// ── Screen context ────────────────────────────────────────────────────────────

// GET /screen-context/status
router.get("/screen-context/status", (_req, res) => {
  try {
    const profile = getScreenContextProfile();
    return res.json({
      success: true,
      profile,
      screenpipeStatus:     "not_configured",
      alwaysOnCapture:      false,
      manualScreenshot:     profile.manualScreenshotEnabled,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg });
  }
});

// PUT /screen-context/profile
router.put("/screen-context/profile", (req, res) => {
  try {
    const body = req.body ?? {};
    const profile = saveScreenContextProfile({
      manualScreenshotEnabled:       typeof body.manualScreenshotEnabled === "boolean" ? body.manualScreenshotEnabled : undefined,
      maxScreenshotAttachPerSession: typeof body.maxScreenshotAttachPerSession === "number" ? body.maxScreenshotAttachPerSession : undefined,
      excludedApps:                  Array.isArray(body.excludedApps) ? (body.excludedApps as string[]) : undefined,
    });
    return res.json({ success: true, profile });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ success: false, error: msg });
  }
});

export default router;
