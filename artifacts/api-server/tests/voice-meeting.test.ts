/**
 * VOICE & MEETING INTELLIGENCE — Phase 11 Tests
 * ===============================================
 * 43 assertions covering:
 *   - Capture policy defaults and hard limits
 *   - Wake word and always-on capture disabled by default
 *   - Retention config persistence
 *   - Raw audio auto-delete default
 *   - Excluded-app enforcement
 *   - STT/TTS sidecar fail-soft behavior
 *   - Meeting session lifecycle
 *   - Follow-up approval requirement (never auto-sends)
 *   - Denied follow-up stays denied (never executes)
 *   - Screen context profile hard limits
 *   - Audit events without sensitive content
 *   - Cloud STT/TTS disabled by default
 *   - HTTP routes (policy/status/meeting/screen-context)
 *   - Source-of-truth string contains required content
 */

import assert from "node:assert/strict";
import { randomUUID } from "crypto";

// Initialise DB before importing modules that read it
process.env["DATABASE_URL"] = `:memory:`;
process.env["LOCALAI_TEST_AGENT_PERMISSIONS"] = JSON.stringify({
  allowAgentExec:     true,
  allowAgentEdits:    true,
  allowAgentSelfHeal: true,
  allowAgentRefactor: true,
});

import { runMigrations } from "../src/db/migrate.js";
runMigrations();

// Clean slate — remove any state left by prior voice-meeting test runs so
// defaults are always observed on the first assertions
import { sqlite as _sqlite } from "../src/db/database.js";
_sqlite.prepare("DELETE FROM plugin_state WHERE id LIKE 'voice-meeting:%'").run();
_sqlite.prepare("DELETE FROM meeting_sessions").run();
_sqlite.prepare("DELETE FROM follow_up_drafts").run();

import {
  getCapturePolicy,
  saveCapturePolicy,
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
  isAppExcluded,
  VOICE_MEETING_SOURCE_OF_TRUTH,
} from "../src/lib/voice-meeting.js";
import { sqlite } from "../src/db/database.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
    .then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch((err) => { console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`); failed++; });
}

// ── 1. Capture policy defaults ────────────────────────────────────────────────

await test("getCapturePolicy returns captureMode=disabled by default", () => {
  const p = getCapturePolicy();
  assert.equal(p.captureMode, "disabled");
});

await test("getCapturePolicy returns preferredActiveMode=push_to_talk", () => {
  const p = getCapturePolicy();
  assert.equal(p.preferredActiveMode, "push_to_talk");
});

await test("getCapturePolicy hard limit: captureIndicatorVisible=true", () => {
  const p = getCapturePolicy();
  assert.equal(p.captureIndicatorVisible, true);
});

await test("getCapturePolicy hard limit: alwaysOnCaptureEnabled=false", () => {
  const p = getCapturePolicy();
  assert.equal(p.alwaysOnCaptureEnabled, false);
});

await test("getCapturePolicy hard limit: cloudSttEnabled=false", () => {
  const p = getCapturePolicy();
  assert.equal(p.cloudSttEnabled, false);
});

await test("getCapturePolicy hard limit: cloudTtsEnabled=false", () => {
  const p = getCapturePolicy();
  assert.equal(p.cloudTtsEnabled, false);
});

await test("getCapturePolicy hard limit: meetingFollowUpApprovalRequired=true", () => {
  const p = getCapturePolicy();
  assert.equal(p.meetingFollowUpApprovalRequired, true);
});

await test("getCapturePolicy hard limit: screenpipeEnabled=false", () => {
  const p = getCapturePolicy();
  assert.equal(p.screenpipeEnabled, false);
});

await test("getCapturePolicy default: wakeWordEnabled=false", () => {
  const p = getCapturePolicy();
  assert.equal(p.wakeWordEnabled, false);
});

await test("getCapturePolicy default: rawAudioAutoDelete=true", () => {
  const p = getCapturePolicy();
  assert.equal(p.rawAudioAutoDelete, true);
});

await test("getCapturePolicy default: localSttPreferred=true", () => {
  const p = getCapturePolicy();
  assert.equal(p.localSttPreferred, true);
});

await test("getCapturePolicy default excludedApps list is non-empty", () => {
  const p = getCapturePolicy();
  assert.ok(p.excludedApps.length > 0, "excludedApps must not be empty");
});

// ── 2. saveCapturePolicy — user-configurable fields and hard limits ───────────

await test("saveCapturePolicy persists captureMode=push_to_talk", () => {
  const p = saveCapturePolicy({ captureMode: "push_to_talk" });
  assert.equal(p.captureMode, "push_to_talk");
  // restore default for subsequent tests
  saveCapturePolicy({ captureMode: "disabled" });
});

await test("saveCapturePolicy cannot enable alwaysOnCapture (hard limit)", () => {
  // @ts-expect-error testing hard limit bypass attempt
  const p = saveCapturePolicy({ alwaysOnCaptureEnabled: true });
  assert.equal(p.alwaysOnCaptureEnabled, false);
});

await test("saveCapturePolicy cannot enable cloudStt (hard limit)", () => {
  // @ts-expect-error testing hard limit bypass attempt
  const p = saveCapturePolicy({ cloudSttEnabled: true });
  assert.equal(p.cloudSttEnabled, false);
});

await test("saveCapturePolicy cannot enable screenpipe (hard limit)", () => {
  // @ts-expect-error testing hard limit bypass attempt
  const p = saveCapturePolicy({ screenpipeEnabled: true });
  assert.equal(p.screenpipeEnabled, false);
});

await test("saveCapturePolicy persists rawAudioAutoDelete=false", () => {
  const p = saveCapturePolicy({ rawAudioAutoDelete: false });
  assert.equal(p.rawAudioAutoDelete, false);
  // restore default
  saveCapturePolicy({ rawAudioAutoDelete: true });
});

await test("saveCapturePolicy persists transcriptRetentionDays", () => {
  const p = saveCapturePolicy({ transcriptRetentionDays: 7 });
  assert.equal(p.transcriptRetentionDays, 7);
  const reloaded = getCapturePolicy();
  assert.equal(reloaded.transcriptRetentionDays, 7);
});

await test("saveCapturePolicy persists excludedApps list", () => {
  const apps = ["chrome.exe", "firefox.exe", "notepad.exe"];
  const p = saveCapturePolicy({ excludedApps: apps });
  assert.deepEqual(p.excludedApps, apps);
});

await test("saveCapturePolicy captureIndicatorVisible always remains true", () => {
  // @ts-expect-error testing hard limit bypass attempt
  const p = saveCapturePolicy({ captureIndicatorVisible: false });
  assert.equal(p.captureIndicatorVisible, true);
});

// ── 3. Excluded-app check ─────────────────────────────────────────────────────

await test("isAppExcluded returns true for KeePass (password manager)", () => {
  const policy = getCapturePolicy();
  // restore default app list
  saveCapturePolicy({ excludedApps: ["KeePassXC", "1Password", "chrome.exe"] });
  const updated = getCapturePolicy();
  assert.equal(isAppExcluded("KeePassXC", updated), true);
});

await test("isAppExcluded returns false for non-excluded app", () => {
  const policy = getCapturePolicy();
  assert.equal(isAppExcluded("notepad.exe", policy), false);
});

await test("isAppExcluded is case-insensitive", () => {
  const policy = getCapturePolicy();
  // policy already has chrome.exe
  assert.equal(isAppExcluded("CHROME.EXE", policy), true);
});

// ── 4. Meeting session lifecycle ──────────────────────────────────────────────

await test("createMeetingSession returns id and status=idle", () => {
  const session = createMeetingSession({ captureMode: "meeting" });
  assert.ok(session.id, "id must be set");
  assert.equal(session.status, "idle");
});

await test("createMeetingSession does not store raw transcript (word count only)", () => {
  const session = createMeetingSession({ captureMode: "push_to_talk" });
  assert.equal(session.transcriptWordCount, 0);
  // Confirm no transcript field exists on the object
  assert.ok(!("transcript" in session), "raw transcript must not be in session object");
  assert.ok(!("rawAudio" in session), "raw audio must not be in session object");
});

await test("getMeetingSession retrieves created session", () => {
  const created  = createMeetingSession();
  const fetched  = getMeetingSession(created.id);
  assert.ok(fetched, "session must be retrievable");
  assert.equal(fetched.id, created.id);
});

await test("startMeetingSession changes status to recording", () => {
  const session = createMeetingSession({ captureMode: "meeting" });
  const started = startMeetingSession(session.id);
  assert.equal(started.status, "recording");
  assert.ok(started.startedAt, "startedAt must be set");
});

await test("stopMeetingSession completes session with summary data", () => {
  const session = createMeetingSession();
  startMeetingSession(session.id);
  const completed = stopMeetingSession(session.id, {
    transcriptWordCount: 512,
    summaryText: "Discussed Q3 roadmap and assigned tickets.",
    decisions: ["Proceed with feature X", "Defer feature Y"],
    actionItems: [{ text: "Create Jira tickets", assignee: "Alice", dueDate: "2026-05-07" }],
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.transcriptWordCount, 512);
  assert.equal(completed.decisions.length, 2);
  assert.equal(completed.actionItems.length, 1);
  assert.ok(completed.stoppedAt, "stoppedAt must be set");
});

await test("listMeetingSessions returns array", () => {
  const sessions = listMeetingSessions();
  assert.ok(Array.isArray(sessions));
  assert.ok(sessions.length > 0);
});

// ── 5. Follow-up drafts — approval required ───────────────────────────────────

let testMeetingId: string;
let testDraftId: string;

await test("createFollowUpDraft creates draft with status=draft", () => {
  const session   = createMeetingSession();
  startMeetingSession(session.id);
  stopMeetingSession(session.id, { transcriptWordCount: 100, summaryText: "Test meeting" });
  testMeetingId = session.id;

  const draft = createFollowUpDraft(
    testMeetingId,
    "email",
    "Follow-up from team meeting",
    "Hi team, please review the attached action items.",
  );
  testDraftId = draft.id;
  assert.equal(draft.status, "draft");
  assert.equal(draft.type, "email");
  assert.ok(draft.subject.length > 0);
});

await test("createFollowUpDraft stores only body preview (not full body)", () => {
  const draft = createFollowUpDraft(
    testMeetingId,
    "task",
    "Action items",
    "A".repeat(1000),  // 1000 char body
  );
  assert.ok(draft.bodyPreview.length <= 200, "bodyPreview must be at most 200 chars");
  assert.ok(!("body" in draft), "full body must not be in draft object");
});

await test("proposeFollowUpSend returns approvalRequired=true (never auto-sends)", () => {
  const result = proposeFollowUpSend(testDraftId);
  assert.equal(result.approvalRequired, true);
  assert.ok(result.approvalId, "approvalId must be returned");
});

await test("proposeFollowUpSend changes draft status to pending_approval", () => {
  // testDraftId was already proposed above — check status
  const sessions = listMeetingSessions();
  const session = sessions.find((s) => s.id === testMeetingId);
  assert.ok(session, "meeting session must be found");
  const draft = session?.followUps.find((d) => d.id === testDraftId);
  assert.ok(draft, "draft must be in followUps");
  assert.equal(draft?.status, "pending_approval");
});

await test("denyFollowUpSend sets status=denied (no send executed)", () => {
  // Create a new draft to deny
  const draft = createFollowUpDraft(
    testMeetingId,
    "calendar_invite",
    "Team sync next week",
    "Let's meet at 10am Tuesday.",
  );
  const denied = denyFollowUpSend(draft.id);
  assert.equal(denied.status, "denied");
  // Verify no approval request shows 'approved'
  const row = sqlite
    .prepare("SELECT status FROM follow_up_drafts WHERE id = ?")
    .get(draft.id) as { status: string } | undefined;
  assert.equal(row?.status, "denied");
  // No 'sent' status — draft cannot auto-send
  assert.notEqual(denied.status, "sent");
});

await test("denied follow-up is not sent (status never transitions to sent)", () => {
  const draft = createFollowUpDraft(
    testMeetingId,
    "message",
    "Quick update",
    "Just a note.",
  );
  denyFollowUpSend(draft.id);
  const row = sqlite
    .prepare("SELECT status FROM follow_up_drafts WHERE id = ?")
    .get(draft.id) as { status: string } | undefined;
  assert.notEqual(row?.status, "sent", "denied draft must never become sent");
});

// ── 6. Screen context profile ─────────────────────────────────────────────────

await test("getScreenContextProfile returns screenpipeEnabled=false", () => {
  const profile = getScreenContextProfile();
  assert.equal(profile.screenpipeEnabled, false);
});

await test("getScreenContextProfile returns screenpipeStatus=not_configured", () => {
  const profile = getScreenContextProfile();
  assert.equal(profile.screenpipeStatus, "not_configured");
});

await test("getScreenContextProfile returns alwaysOnScreenCapture=false", () => {
  const profile = getScreenContextProfile();
  assert.equal(profile.alwaysOnScreenCapture, false);
});

await test("getScreenContextProfile returns manualScreenshotEnabled=true by default", () => {
  const profile = getScreenContextProfile();
  assert.equal(profile.manualScreenshotEnabled, true);
});

await test("saveScreenContextProfile persists manualScreenshotEnabled=false", () => {
  const p = saveScreenContextProfile({ manualScreenshotEnabled: false });
  assert.equal(p.manualScreenshotEnabled, false);
  assert.equal(p.screenpipeEnabled, false);      // hard limit preserved
  assert.equal(p.alwaysOnScreenCapture, false);  // hard limit preserved
  saveScreenContextProfile({ manualScreenshotEnabled: true }); // restore
});

await test("saveScreenContextProfile cannot enable screenpipe (hard limit)", () => {
  // @ts-expect-error testing hard limit bypass attempt
  const p = saveScreenContextProfile({ screenpipeEnabled: true });
  assert.equal(p.screenpipeEnabled, false);
});

// ── 7. Audit events — no sensitive content ────────────────────────────────────

await test("meeting start creates audit event without transcript content", () => {
  const before = (sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE event_type = 'meeting_session_start'").get() as { n: number }).n;
  const session = createMeetingSession();
  startMeetingSession(session.id);
  const after = (sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE event_type = 'meeting_session_start'").get() as { n: number }).n;
  assert.ok(after > before, "audit event must be created on start");
  // Verify the latest audit event has no transcript content in metadata
  const latest = sqlite.prepare(
    "SELECT metadata_json FROM audit_events WHERE event_type = 'meeting_session_start' ORDER BY created_at DESC LIMIT 1"
  ).get() as { metadata_json: string } | undefined;
  assert.ok(latest, "audit event must exist");
  const meta = JSON.parse(latest!.metadata_json) as Record<string, unknown>;
  assert.ok(!("transcript" in meta), "audit metadata must not contain transcript");
  assert.ok(!("rawAudio" in meta), "audit metadata must not contain rawAudio");
});

await test("follow-up proposal creates audit event without body content", () => {
  const session = createMeetingSession();
  startMeetingSession(session.id);
  stopMeetingSession(session.id, { transcriptWordCount: 50, summaryText: "Brief meeting" });
  const draft = createFollowUpDraft(session.id, "task", "Test task", "Do the thing.");
  proposeFollowUpSend(draft.id);

  const latest = sqlite.prepare(
    "SELECT metadata_json FROM audit_events WHERE event_type = 'follow_up_send_proposed' ORDER BY created_at DESC LIMIT 1"
  ).get() as { metadata_json: string } | undefined;
  assert.ok(latest, "follow-up proposal audit event must exist");
  const meta = JSON.parse(latest!.metadata_json) as Record<string, unknown>;
  assert.ok(!("body" in meta), "audit metadata must not contain full body");
  assert.ok(!("fullBody" in meta), "audit metadata must not contain fullBody");
});

// ── 8. HTTP routes ────────────────────────────────────────────────────────────

import express from "express";
import voice from "../src/routes/voice.js";

const app = express();
app.use(express.json());
app.use("/api", voice);

async function apiReq(method: string, path: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  const { createServer } = await import("http");
  const srv = createServer(app);
  await new Promise<void>((res) => srv.listen(0, res));
  const addr = srv.address() as { port: number };
  const url = `http://127.0.0.1:${addr.port}/api${path}`;
  try {
    const r = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body:    body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => null);
    return { status: r.status, data };
  } finally {
    await new Promise<void>((res) => srv.close(() => res()));
  }
}

await test("GET /api/voice/policy returns 200 with policy", async () => {
  const { status, data } = await apiReq("GET", "/voice/policy");
  assert.equal(status, 200);
  assert.equal((data as { success: boolean }).success, true);
  assert.ok((data as { policy: unknown }).policy, "policy must be present");
});

await test("PUT /api/voice/policy updates captureMode and enforces hard limits", async () => {
  const { status, data } = await apiReq("PUT", "/voice/policy", {
    captureMode:   "push_to_talk",
    cloudSttEnabled: true,  // should be ignored (hard limit)
  });
  assert.equal(status, 200);
  const policy = (data as { policy: { captureMode: string; cloudSttEnabled: boolean } }).policy;
  assert.equal(policy.captureMode, "push_to_talk");
  assert.equal(policy.cloudSttEnabled, false);
  // restore default so policy doesn't bleed into future test runs
  await apiReq("PUT", "/voice/policy", { captureMode: "disabled" });
});

await test("GET /api/voice/status returns 200 with stt/tts info", async () => {
  const { status, data } = await apiReq("GET", "/voice/status");
  assert.equal(status, 200);
  const s = (data as { status: Record<string, unknown> }).status;
  assert.ok("sttAvailable" in s, "sttAvailable must be present");
  assert.ok("ttsAvailable" in s, "ttsAvailable must be present");
  assert.equal(s["alwaysOnEnabled"],  false);
  assert.equal(s["cloudSttEnabled"],  false);
  assert.equal(s["captureIndicator"], true);
});

await test("GET /api/voice/meeting/sessions returns 200 with sessions array", async () => {
  const { status, data } = await apiReq("GET", "/voice/meeting/sessions");
  assert.equal(status, 200);
  assert.ok(Array.isArray((data as { sessions: unknown[] }).sessions));
});

await test("POST /api/voice/meeting/start creates and starts session", async () => {
  const { status, data } = await apiReq("POST", "/voice/meeting/start", { captureMode: "meeting" });
  assert.equal(status, 201);
  const session = (data as { session: { status: string; id: string } }).session;
  assert.equal(session.status, "recording");
  assert.ok(session.id, "id must be present");
});

await test("GET /api/screen-context/status returns screenpipe not_configured", async () => {
  const { status, data } = await apiReq("GET", "/screen-context/status");
  assert.equal(status, 200);
  const d = data as { screenpipeStatus: string; alwaysOnCapture: boolean };
  assert.equal(d.screenpipeStatus, "not_configured");
  assert.equal(d.alwaysOnCapture, false);
});

// ── 9. Source of truth ────────────────────────────────────────────────────────

await test("VOICE_MEETING_SOURCE_OF_TRUTH contains hard-limit keywords", () => {
  const sot = VOICE_MEETING_SOURCE_OF_TRUTH.toLowerCase();
  assert.ok(sot.includes("hard limit") || sot.includes("hard limits"), "must mention hard limits");
  assert.ok(sot.includes("approval"), "must mention approval requirement");
  assert.ok(sot.includes("not_configured"), "must mention screenpipe not_configured");
  assert.ok(sot.includes("raw audio"), "must mention raw audio privacy rule");
});

// ── Final report ──────────────────────────────────────────────────────────────

console.log(`\nVoice-Meeting Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
