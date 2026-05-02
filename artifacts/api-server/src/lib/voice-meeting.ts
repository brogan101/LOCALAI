/**
 * VOICE & MEETING INTELLIGENCE SAFETY LAYER — Phase 11
 * =====================================================
 *
 * Capture policy, meeting session tracking, screen context policy, and
 * follow-up draft/approval workflow.
 *
 * Hard limits (cannot be changed by profile or approval):
 *   captureIndicatorVisible         = true  (always show when recording)
 *   alwaysOnCaptureEnabled          = false (no hidden/covert recording)
 *   cloudSttEnabled                 = false (Phase 02 — must be explicitly configured)
 *   cloudTtsEnabled                 = false (Phase 02 — must be explicitly configured)
 *   meetingFollowUpApprovalRequired = true  (no external sends without approval)
 *   screenpipeEnabled               = false (not_configured until explicitly installed)
 *
 * Safe defaults (user can change):
 *   captureMode            = "disabled"    (nothing records by default)
 *   preferredActiveMode    = "push_to_talk" (safe mode when user enables capture)
 *   wakeWordEnabled        = false         (disabled until configured)
 *   rawAudioAutoDelete     = true          (auto-delete raw audio by default)
 *   rawAudioRetentionSec   = 0             (immediately discarded)
 *   transcriptRetentionDays = 30
 *
 * Privacy rules:
 *   - Raw audio and full transcripts never stored server-side
 *   - Meeting sessions store only: word count, summary, decisions, action items
 *   - Audit events contain NO raw audio, full transcripts, or sensitive content
 *   - Follow-up drafts store subject + first 200 chars body preview only
 *   - Excluded apps/zones enforced before capture
 *   - Screenpipe integration profile disabled until explicitly configured
 */

import { randomUUID } from "crypto";
import { sqlite } from "../db/database.js";
import {
  recordAuditEvent,
  seedFoundationDefaults,
  upsertPluginState,
} from "./platform-foundation.js";
import { createApprovalRequest } from "./approval-queue.js";
import { thoughtLog } from "./thought-log.js";

// ── Constants ─────────────────────────────────────────────────────────────────

export const VOICE_MEETING_PROFILE_STATE_ID = "voice-meeting:capture-policy";
export const SCREEN_CONTEXT_PROFILE_STATE_ID = "voice-meeting:screen-context";

export const VOICE_MEETING_SOURCE_OF_TRUTH =
  "Phase 11 voice-meeting.ts: Voice/screen/meeting safety layer. " +
  "Hard limits: alwaysOnCaptureEnabled=false (no covert recording), " +
  "captureIndicatorVisible=true (always visible when active), " +
  "cloudSttEnabled=false (Phase 02 local-first), cloudTtsEnabled=false, " +
  "meetingFollowUpApprovalRequired=true (no external sends without approval), " +
  "screenpipeEnabled=false (not_configured until installed). " +
  "Safe defaults: captureMode=disabled, preferredActiveMode=push_to_talk, " +
  "wakeWordEnabled=false, rawAudioAutoDelete=true. " +
  "Raw audio/full transcripts never stored server-side. " +
  "Excluded apps respected. Follow-up sends require tier4 approval.";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CaptureMode =
  | "disabled"
  | "push_to_talk"
  | "wake_word"
  | "meeting"
  | "silent_command";

export type WakeWordEngineStatus =
  | "not_configured"
  | "configured"
  | "unavailable";

export type MeetingSessionStatus =
  | "idle"
  | "recording"
  | "processing"
  | "completed"
  | "failed";

export type FollowUpType =
  | "email"
  | "calendar_invite"
  | "message"
  | "task";

export type FollowUpStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "denied"
  | "sent";

export type ScreenpipeStatus =
  | "not_configured"
  | "configured"
  | "unavailable";

export interface VoiceCapturePolicyProfile {
  // Capture mode: "disabled" by default — nothing records until user enables
  captureMode: CaptureMode;
  // Safe default when user enables: push_to_talk
  preferredActiveMode: "push_to_talk" | "wake_word" | "meeting" | "silent_command";

  // HARD LIMITS — always reset to these values on save
  captureIndicatorVisible:         true;
  alwaysOnCaptureEnabled:          false;
  cloudSttEnabled:                 false;
  cloudTtsEnabled:                 false;
  meetingFollowUpApprovalRequired: true;
  screenpipeEnabled:               false;

  // User-configurable
  wakeWordEnabled:              boolean;  // false until engine configured
  rawAudioAutoDelete:           boolean;  // true by default
  rawAudioRetentionSec:         number;   // 0 = immediate delete
  transcriptRetentionDays:      number;   // 30 default
  excludedApps:                 string[]; // apps to skip capture for
  excludedZones:                string[]; // screen regions to skip
  localSttPreferred:            boolean;  // true by default
  localTtsPreferred:            boolean;  // true by default
  maxMeetingTranscriptLengthWords: number; // safety cap
}

export interface VoiceStatus {
  captureMode:       CaptureMode;
  captureActive:     boolean;
  captureIndicator:  true;
  sttAvailable:      boolean;
  sttSidecarUrl:     string;
  ttsAvailable:      boolean;
  wakeWordStatus:    WakeWordEngineStatus;
  alwaysOnEnabled:   false;
  cloudSttEnabled:   false;
  cloudTtsEnabled:   false;
}

export interface MeetingSession {
  id:               string;
  status:           MeetingSessionStatus;
  captureMode:      CaptureMode;
  startedAt:        string | null;
  stoppedAt:        string | null;
  // NOTE: raw transcript never stored — only structured output
  transcriptWordCount: number;
  summaryText:      string;
  decisions:        string[];
  actionItems:      Array<{ text: string; assignee?: string; dueDate?: string }>;
  followUps:        FollowUpDraft[];
  createdAt:        string;
  updatedAt:        string;
}

export interface MeetingSessionInput {
  captureMode?: CaptureMode;
}

export interface MeetingStopInput {
  transcriptWordCount?: number;
  summaryText?:         string;
  decisions?:           string[];
  actionItems?:         Array<{ text: string; assignee?: string; dueDate?: string }>;
}

export interface FollowUpDraft {
  id:          string;
  meetingId:   string;
  type:        FollowUpType;
  subject:     string;
  bodyPreview: string;  // first 200 chars only, no sensitive content stored
  status:      FollowUpStatus;
  approvalId?: string;
  createdAt:   string;
  updatedAt:   string;
}

export interface ScreenContextProfile {
  manualScreenshotEnabled:    boolean;
  maxScreenshotAttachPerSession: number;
  // HARD LIMITS
  screenpipeEnabled:          false;
  screenpipeStatus:           "not_configured";
  alwaysOnScreenCapture:      false;
  excludedApps:               string[];
}

// ── Default values ────────────────────────────────────────────────────────────

const DEFAULT_EXCLUDED_APPS = [
  "KeePass", "KeePassXC", "1Password", "Bitwarden", "LastPass",
  "Dashlane", "NordPass", "RoboForm", "Enpass",
  "chrome.exe", "msedge.exe", "firefox.exe",
  "Outlook", "Mail",
  "TurboTax", "H&R Block",
  "quickbooks.exe", "sage.exe",
  "TeamViewer", "AnyDesk",
  "MsMpEng.exe", "MpCmdRun.exe",
  "lsass.exe", "winlogon.exe",
];

function defaultCapturePolicy(): VoiceCapturePolicyProfile {
  return {
    captureMode:                     "disabled",
    preferredActiveMode:             "push_to_talk",
    captureIndicatorVisible:         true,
    alwaysOnCaptureEnabled:          false,
    cloudSttEnabled:                 false,
    cloudTtsEnabled:                 false,
    meetingFollowUpApprovalRequired: true,
    screenpipeEnabled:               false,
    wakeWordEnabled:                 false,
    rawAudioAutoDelete:              true,
    rawAudioRetentionSec:            0,
    transcriptRetentionDays:         30,
    excludedApps:                    [...DEFAULT_EXCLUDED_APPS],
    excludedZones:                   [],
    localSttPreferred:               true,
    localTtsPreferred:               true,
    maxMeetingTranscriptLengthWords: 50_000,
  };
}

function defaultScreenContextProfile(): ScreenContextProfile {
  return {
    manualScreenshotEnabled:    true,
    maxScreenshotAttachPerSession: 10,
    screenpipeEnabled:          false,
    screenpipeStatus:           "not_configured",
    alwaysOnScreenCapture:      false,
    excludedApps:               [...DEFAULT_EXCLUDED_APPS],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function parseJsonArray(v: unknown): string[] {
  if (typeof v !== "string") return [];
  try {
    const parsed = JSON.parse(v) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch { return []; }
}

function parseJsonObj(v: unknown): Record<string, unknown> {
  if (typeof v !== "string") return {};
  try {
    const parsed = JSON.parse(v) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>) : {};
  } catch { return {}; }
}

function safeBodyPreview(body: string): string {
  return body.slice(0, 200).replace(/\b[\w._%+-]+@[\w.-]+\.[A-Z]{2,}\b/gi, "[email]")
             .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[phone]");
}

// ── Capture policy ────────────────────────────────────────────────────────────

export function getCapturePolicy(): VoiceCapturePolicyProfile {
  seedFoundationDefaults();
  const row = sqlite
    .prepare("SELECT state_json FROM plugin_state WHERE id = ?")
    .get(VOICE_MEETING_PROFILE_STATE_ID) as { state_json: string } | undefined;

  if (!row) return defaultCapturePolicy();

  const saved = parseJsonObj(row.state_json) as Partial<VoiceCapturePolicyProfile>;
  const defaults = defaultCapturePolicy();

  const policy: VoiceCapturePolicyProfile = {
    captureMode:      (saved.captureMode as CaptureMode | undefined) ?? defaults.captureMode,
    preferredActiveMode: (saved.preferredActiveMode as VoiceCapturePolicyProfile["preferredActiveMode"] | undefined) ?? defaults.preferredActiveMode,
    wakeWordEnabled:  typeof saved.wakeWordEnabled === "boolean" ? saved.wakeWordEnabled : defaults.wakeWordEnabled,
    rawAudioAutoDelete: typeof saved.rawAudioAutoDelete === "boolean" ? saved.rawAudioAutoDelete : defaults.rawAudioAutoDelete,
    rawAudioRetentionSec: typeof saved.rawAudioRetentionSec === "number" ? saved.rawAudioRetentionSec : defaults.rawAudioRetentionSec,
    transcriptRetentionDays: typeof saved.transcriptRetentionDays === "number" ? saved.transcriptRetentionDays : defaults.transcriptRetentionDays,
    excludedApps:     Array.isArray(saved.excludedApps) ? (saved.excludedApps as string[]) : defaults.excludedApps,
    excludedZones:    Array.isArray(saved.excludedZones) ? (saved.excludedZones as string[]) : defaults.excludedZones,
    localSttPreferred:  typeof saved.localSttPreferred === "boolean" ? saved.localSttPreferred : defaults.localSttPreferred,
    localTtsPreferred:  typeof saved.localTtsPreferred === "boolean" ? saved.localTtsPreferred : defaults.localTtsPreferred,
    maxMeetingTranscriptLengthWords: typeof saved.maxMeetingTranscriptLengthWords === "number"
      ? saved.maxMeetingTranscriptLengthWords : defaults.maxMeetingTranscriptLengthWords,
    // Hard limits — always enforced
    captureIndicatorVisible:         true,
    alwaysOnCaptureEnabled:          false,
    cloudSttEnabled:                 false,
    cloudTtsEnabled:                 false,
    meetingFollowUpApprovalRequired: true,
    screenpipeEnabled:               false,
  };

  return policy;
}

export function saveCapturePolicy(
  input: Partial<Omit<VoiceCapturePolicyProfile,
    "captureIndicatorVisible" | "alwaysOnCaptureEnabled" | "cloudSttEnabled" |
    "cloudTtsEnabled" | "meetingFollowUpApprovalRequired" | "screenpipeEnabled">>,
): VoiceCapturePolicyProfile {
  seedFoundationDefaults();
  const current = getCapturePolicy();

  const updated: VoiceCapturePolicyProfile = {
    ...current,
    ...(input.captureMode !== undefined         && { captureMode: input.captureMode }),
    ...(input.preferredActiveMode !== undefined && { preferredActiveMode: input.preferredActiveMode }),
    ...(input.wakeWordEnabled !== undefined      && { wakeWordEnabled: input.wakeWordEnabled }),
    ...(input.rawAudioAutoDelete !== undefined   && { rawAudioAutoDelete: input.rawAudioAutoDelete }),
    ...(input.rawAudioRetentionSec !== undefined && { rawAudioRetentionSec: input.rawAudioRetentionSec }),
    ...(input.transcriptRetentionDays !== undefined && { transcriptRetentionDays: input.transcriptRetentionDays }),
    ...(input.excludedApps !== undefined         && { excludedApps: input.excludedApps }),
    ...(input.excludedZones !== undefined        && { excludedZones: input.excludedZones }),
    ...(input.localSttPreferred !== undefined    && { localSttPreferred: input.localSttPreferred }),
    ...(input.localTtsPreferred !== undefined    && { localTtsPreferred: input.localTtsPreferred }),
    ...(input.maxMeetingTranscriptLengthWords !== undefined && { maxMeetingTranscriptLengthWords: input.maxMeetingTranscriptLengthWords }),
    // Hard limits — always reset, cannot be overridden
    captureIndicatorVisible:         true,
    alwaysOnCaptureEnabled:          false,
    cloudSttEnabled:                 false,
    cloudTtsEnabled:                 false,
    meetingFollowUpApprovalRequired: true,
    screenpipeEnabled:               false,
  };

  upsertPluginState(VOICE_MEETING_PROFILE_STATE_ID, updated as unknown as Record<string, unknown>);

  recordAuditEvent({
    eventType: "voice_capture_policy_update",
    action:    "save_capture_policy",
    actor:     "local-user",
    result:    "success",
    metadata:  {
      captureMode:         updated.captureMode,
      wakeWordEnabled:     updated.wakeWordEnabled,
      rawAudioAutoDelete:  updated.rawAudioAutoDelete,
      hardLimitsEnforced:  true,
    },
  });

  return updated;
}

// ── Voice status ──────────────────────────────────────────────────────────────

const STT_SIDECAR_URL = "http://127.0.0.1:3021";

async function sttSidecarAlive(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(`${STT_SIDECAR_URL}/health`, { signal: ctrl.signal });
    return res.ok;
  } catch { return false; }
  finally { clearTimeout(timer); }
}

async function ttsPiperAvailable(): Promise<boolean> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);
  try {
    await execFileAsync("piper", ["--version"], { timeout: 2500 });
    return true;
  } catch {
    try {
      await execFileAsync("python", ["-m", "piper", "--version"], { timeout: 2500 });
      return true;
    } catch { return false; }
  }
}

export async function getVoiceStatus(): Promise<VoiceStatus> {
  const policy = getCapturePolicy();
  const [sttAlive, ttsAlive] = await Promise.all([
    sttSidecarAlive(),
    ttsPiperAvailable(),
  ]);

  return {
    captureMode:     policy.captureMode,
    captureActive:   policy.captureMode !== "disabled",
    captureIndicator: true,
    sttAvailable:    sttAlive,
    sttSidecarUrl:   STT_SIDECAR_URL,
    ttsAvailable:    ttsAlive,
    wakeWordStatus:  policy.wakeWordEnabled ? "configured" : "not_configured",
    alwaysOnEnabled: false,
    cloudSttEnabled: false,
    cloudTtsEnabled: false,
  };
}

// ── Excluded-app check ────────────────────────────────────────────────────────

export function isAppExcluded(
  appName: string,
  policy: VoiceCapturePolicyProfile | ScreenContextProfile,
): boolean {
  const lower = appName.toLowerCase();
  return policy.excludedApps.some((excluded) =>
    lower === excluded.toLowerCase() ||
    lower.includes(excluded.toLowerCase()) ||
    excluded.toLowerCase().includes(lower),
  );
}

// ── Meeting sessions ──────────────────────────────────────────────────────────

function rowToMeetingSession(row: Record<string, unknown>, followUps: FollowUpDraft[]): MeetingSession {
  return {
    id:                  row["id"] as string,
    status:              (row["status"] as MeetingSessionStatus) ?? "idle",
    captureMode:         (row["capture_mode"] as CaptureMode) ?? "push_to_talk",
    startedAt:           (row["started_at"] as string | null) ?? null,
    stoppedAt:           (row["stopped_at"] as string | null) ?? null,
    transcriptWordCount: (row["word_count"] as number) ?? 0,
    summaryText:         (row["summary_text"] as string) ?? "",
    decisions:           parseJsonArray(row["decisions_json"]),
    actionItems:         (() => {
      const arr = parseJsonArray(row["action_items_json"]);
      return arr.map((a) => (typeof a === "string" ? { text: a } : a as { text: string; assignee?: string; dueDate?: string }));
    })(),
    followUps,
    createdAt:           row["created_at"] as string,
    updatedAt:           row["updated_at"] as string,
  };
}

function getFollowUpsForSession(meetingId: string): FollowUpDraft[] {
  const rows = sqlite
    .prepare("SELECT * FROM follow_up_drafts WHERE meeting_id = ? ORDER BY created_at ASC")
    .all(meetingId) as Array<Record<string, unknown>>;
  return rows.map(rowToFollowUpDraft);
}

function rowToFollowUpDraft(row: Record<string, unknown>): FollowUpDraft {
  return {
    id:          row["id"] as string,
    meetingId:   row["meeting_id"] as string,
    type:        (row["type"] as FollowUpType) ?? "email",
    subject:     row["subject"] as string,
    bodyPreview: row["body_preview"] as string,
    status:      (row["status"] as FollowUpStatus) ?? "draft",
    approvalId:  (row["approval_id"] as string | null) ?? undefined,
    createdAt:   row["created_at"] as string,
    updatedAt:   row["updated_at"] as string,
  };
}

export function createMeetingSession(input?: MeetingSessionInput): MeetingSession {
  const id        = randomUUID();
  const now       = nowIso();
  const mode      = input?.captureMode ?? "meeting";

  sqlite.prepare(`
    INSERT INTO meeting_sessions
      (id, status, capture_mode, word_count, summary_text, decisions_json,
       action_items_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, "idle", mode, 0, "", "[]", "[]", now, now);

  recordAuditEvent({
    eventType: "meeting_session_create",
    action:    "create_meeting_session",
    actor:     "local-user",
    result:    "success",
    metadata:  { sessionId: id, captureMode: mode },
    // NOTE: no transcript content in audit
  });

  return getMeetingSession(id)!;
}

export function getMeetingSession(id: string): MeetingSession | null {
  const row = sqlite
    .prepare("SELECT * FROM meeting_sessions WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const followUps = getFollowUpsForSession(id);
  return rowToMeetingSession(row, followUps);
}

export function listMeetingSessions(limit = 50): MeetingSession[] {
  const rows = sqlite
    .prepare("SELECT * FROM meeting_sessions ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map((row) => rowToMeetingSession(row, getFollowUpsForSession(row["id"] as string)));
}

export function startMeetingSession(id: string): MeetingSession {
  const session = getMeetingSession(id);
  if (!session) throw new Error(`Meeting session not found: ${id}`);
  if (session.status !== "idle") throw new Error(`Session is not idle: ${session.status}`);

  const now = nowIso();
  sqlite.prepare(`
    UPDATE meeting_sessions SET status = ?, started_at = ?, updated_at = ? WHERE id = ?
  `).run("recording", now, now, id);

  recordAuditEvent({
    eventType: "meeting_session_start",
    action:    "start_meeting_session",
    actor:     "local-user",
    result:    "success",
    metadata:  { sessionId: id },
    // NOTE: no audio/transcript content
  });

  return getMeetingSession(id)!;
}

export function stopMeetingSession(id: string, data?: MeetingStopInput): MeetingSession {
  const session = getMeetingSession(id);
  if (!session) throw new Error(`Meeting session not found: ${id}`);
  if (session.status === "completed") return session;

  const now         = nowIso();
  const wordCount   = data?.transcriptWordCount ?? session.transcriptWordCount;
  const summaryText = data?.summaryText ?? session.summaryText;
  const decisions   = data?.decisions   ?? session.decisions;
  const actionItems = data?.actionItems ?? session.actionItems;

  sqlite.prepare(`
    UPDATE meeting_sessions
    SET status = ?, stopped_at = ?, word_count = ?, summary_text = ?,
        decisions_json = ?, action_items_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    "completed", now, wordCount, summaryText,
    JSON.stringify(decisions), JSON.stringify(actionItems),
    now, id,
  );

  recordAuditEvent({
    eventType: "meeting_session_stop",
    action:    "stop_meeting_session",
    actor:     "local-user",
    result:    "success",
    metadata:  {
      sessionId:    id,
      wordCount,
      decisionCount: decisions.length,
      actionItemCount: actionItems.length,
      // NOTE: no raw transcript or decision text stored in audit
    },
  });

  thoughtLog.publish({
    category: "meeting",
    title:    "Meeting Session Completed",
    message:  `Session ${id}: ${wordCount} words, ${decisions.length} decisions, ${actionItems.length} action items`,
    metadata: { sessionId: id, wordCount },
  });

  return getMeetingSession(id)!;
}

// ── Follow-up drafts ──────────────────────────────────────────────────────────

export function createFollowUpDraft(
  meetingId:   string,
  type:        FollowUpType,
  subject:     string,
  body:        string,
): FollowUpDraft {
  const session = getMeetingSession(meetingId);
  if (!session) throw new Error(`Meeting session not found: ${meetingId}`);

  const id          = randomUUID();
  const now         = nowIso();
  const bodyPreview = safeBodyPreview(body);

  sqlite.prepare(`
    INSERT INTO follow_up_drafts
      (id, meeting_id, type, subject, body_preview, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, meetingId, type, subject, bodyPreview, "draft", now, now);

  recordAuditEvent({
    eventType: "follow_up_draft_create",
    action:    "create_follow_up_draft",
    actor:     "local-user",
    result:    "success",
    metadata:  {
      draftId:   id,
      meetingId,
      type,
      subject,
      // NOTE: body content not logged — only preview stored in DB
    },
  });

  return getFollowUpDraft(id)!;
}

export function getFollowUpDraft(id: string): FollowUpDraft | null {
  const row = sqlite
    .prepare("SELECT * FROM follow_up_drafts WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToFollowUpDraft(row);
}

export function proposeFollowUpSend(
  draftId: string,
  _actor = "local-user",
): { approvalRequired: true; approvalId: string } {
  const draft = getFollowUpDraft(draftId);
  if (!draft) throw new Error(`Follow-up draft not found: ${draftId}`);
  if (draft.status !== "draft") throw new Error(`Draft is not in draft status: ${draft.status}`);

  const approval = createApprovalRequest({
    type:            "voice_meeting_followup_send",
    title:           `Send ${draft.type}: ${draft.subject}`,
    summary:         `Approval required to send follow-up ${draft.type} from meeting session ${draft.meetingId}. Preview: ${draft.bodyPreview.slice(0, 100)}`,
    riskTier:        "tier4_external_communication",
    requestedAction: `send_${draft.type}`,
    payload:         {
      draftId:   draft.id,
      meetingId: draft.meetingId,
      type:      draft.type,
      subject:   draft.subject,
      // NOTE: full body NOT stored in approval payload — only preview
      bodyPreview: draft.bodyPreview,
    },
  });

  const now = nowIso();
  sqlite.prepare(`
    UPDATE follow_up_drafts
    SET status = ?, approval_id = ?, updated_at = ?
    WHERE id = ?
  `).run("pending_approval", approval.id, now, draftId);

  recordAuditEvent({
    eventType: "follow_up_send_proposed",
    action:    "propose_follow_up_send",
    actor:     "local-user",
    result:    "success",
    metadata:  {
      draftId,
      approvalId: approval.id,
      type:       draft.type,
      // NOTE: no body content
    },
  });

  return { approvalRequired: true, approvalId: approval.id };
}

export function denyFollowUpSend(draftId: string): FollowUpDraft {
  const draft = getFollowUpDraft(draftId);
  if (!draft) throw new Error(`Follow-up draft not found: ${draftId}`);

  const now = nowIso();
  sqlite.prepare(`
    UPDATE follow_up_drafts SET status = ?, updated_at = ? WHERE id = ?
  `).run("denied", now, draftId);

  recordAuditEvent({
    eventType: "follow_up_send_denied",
    action:    "deny_follow_up_send",
    actor:     "local-user",
    result:    "success",
    metadata:  { draftId, meetingId: draft.meetingId },
  });

  return getFollowUpDraft(draftId)!;
}

// ── Screen context profile ────────────────────────────────────────────────────

export function getScreenContextProfile(): ScreenContextProfile {
  seedFoundationDefaults();
  const row = sqlite
    .prepare("SELECT state_json FROM plugin_state WHERE id = ?")
    .get(SCREEN_CONTEXT_PROFILE_STATE_ID) as { state_json: string } | undefined;

  if (!row) return defaultScreenContextProfile();

  const saved    = parseJsonObj(row.state_json) as Partial<ScreenContextProfile>;
  const defaults = defaultScreenContextProfile();

  return {
    manualScreenshotEnabled: typeof saved.manualScreenshotEnabled === "boolean"
      ? saved.manualScreenshotEnabled : defaults.manualScreenshotEnabled,
    maxScreenshotAttachPerSession: typeof saved.maxScreenshotAttachPerSession === "number"
      ? saved.maxScreenshotAttachPerSession : defaults.maxScreenshotAttachPerSession,
    excludedApps: Array.isArray(saved.excludedApps) ? (saved.excludedApps as string[]) : defaults.excludedApps,
    // Hard limits — always enforced
    screenpipeEnabled:     false,
    screenpipeStatus:      "not_configured",
    alwaysOnScreenCapture: false,
  };
}

export function saveScreenContextProfile(
  input: Partial<Pick<ScreenContextProfile, "manualScreenshotEnabled" | "maxScreenshotAttachPerSession" | "excludedApps">>,
): ScreenContextProfile {
  seedFoundationDefaults();
  const current = getScreenContextProfile();

  const updated: ScreenContextProfile = {
    ...current,
    ...(input.manualScreenshotEnabled !== undefined    && { manualScreenshotEnabled: input.manualScreenshotEnabled }),
    ...(input.maxScreenshotAttachPerSession !== undefined && { maxScreenshotAttachPerSession: input.maxScreenshotAttachPerSession }),
    ...(input.excludedApps !== undefined               && { excludedApps: input.excludedApps }),
    // Hard limits
    screenpipeEnabled:     false,
    screenpipeStatus:      "not_configured",
    alwaysOnScreenCapture: false,
  };

  upsertPluginState(SCREEN_CONTEXT_PROFILE_STATE_ID, updated as unknown as Record<string, unknown>);

  return updated;
}
