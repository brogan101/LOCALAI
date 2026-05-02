/**
 * VOICE & MEETING PAGE — Phase 11
 * =================================
 * Capture status indicator, voice settings, meeting sessions,
 * and follow-up approval workflow.
 *
 * Hard limits displayed (not editable):
 *   - Always-on capture: BLOCKED
 *   - Cloud STT: DISABLED (Phase 02 policy)
 *   - Cloud TTS: DISABLED (Phase 02 policy)
 *   - Follow-up sends: APPROVAL REQUIRED
 *   - Screenpipe: NOT CONFIGURED
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Mic, MicOff, Radio, Shield, AlertTriangle, CheckCircle,
  XCircle, Clock, FileText, Send, ChevronDown, ChevronUp,
  Camera, Eye, EyeOff, Trash2,
} from "lucide-react";
import api, {
  apiErrorMessage,
  type CaptureMode,
  type FollowUpType,
  type MeetingSession,
  type VoiceCapturePolicyProfile,
} from "../api.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl overflow-hidden ${className}`}
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-4 py-2.5"
      style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-elevated)" }}>
      <div className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-muted)" }}>{title}</div>
      {subtitle && <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{subtitle}</div>}
    </div>
  );
}

function HardBlockedBadge({ label }: { label: string }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded font-semibold"
      style={{ background: "color-mix(in srgb, var(--color-error) 15%, transparent)", color: "var(--color-error)" }}>
      {label}
    </span>
  );
}

function ApprovalBadge({ label }: { label: string }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded font-semibold flex items-center gap-1"
      style={{ background: "color-mix(in srgb, var(--color-warn) 15%, transparent)", color: "var(--color-warn)" }}>
      <Shield size={10} />{label}
    </span>
  );
}

function statusColor(status: MeetingSession["status"]): string {
  if (status === "recording") return "var(--color-error)";
  if (status === "completed") return "var(--color-success)";
  if (status === "processing") return "var(--color-warn)";
  return "var(--color-muted)";
}

// ── Capture status bar (visible when active) ──────────────────────────────────

function CaptureStatusBar({ captureMode }: { captureMode: CaptureMode }) {
  if (captureMode === "disabled") return null;

  const color = captureMode === "meeting" ? "var(--color-error)" : "var(--color-warn)";

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg mb-4"
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        color,
      }}>
      <Radio size={14} className="animate-pulse" />
      <span>Capture active — {captureMode.replace(/_/g, " ")}</span>
      <span className="ml-auto text-xs opacity-70">Indicator always visible per policy</span>
    </div>
  );
}

// ── Voice Settings Card ───────────────────────────────────────────────────────

function VoiceSettingsCard() {
  const qc = useQueryClient();

  const { data: policyData, isLoading } = useQuery({
    queryKey: ["voice-policy"],
    queryFn:  () => api.voiceApi.policy(),
  });

  const updateMutation = useMutation({
    mutationFn: (p: Partial<VoiceCapturePolicyProfile>) => api.voiceApi.updatePolicy(p),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["voice-policy"] }),
  });

  const policy = policyData?.policy;

  if (isLoading || !policy) {
    return (
      <Card>
        <SectionHeader title="Voice Settings" />
        <div className="px-4 py-6 text-sm" style={{ color: "var(--color-muted)" }}>Loading…</div>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader title="Voice Settings" subtitle="Phase 11 — capture policy and hard limits" />
      <div className="p-4 space-y-4">

        {/* Hard limits — read-only display */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest mb-2"
            style={{ color: "var(--color-muted)" }}>Hard Limits (permanent)</div>
          <div className="flex flex-wrap gap-2">
            <HardBlockedBadge label="Always-on Capture: BLOCKED" />
            <HardBlockedBadge label="Cloud STT: DISABLED" />
            <HardBlockedBadge label="Cloud TTS: DISABLED" />
            <HardBlockedBadge label="Screenpipe: NOT CONFIGURED" />
            <ApprovalBadge    label="Follow-up Sends: APPROVAL REQUIRED" />
          </div>
        </div>

        {/* Capture mode */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>
            Capture Mode
          </label>
          <select
            value={policy.captureMode}
            onChange={(e) => updateMutation.mutate({ captureMode: e.target.value as CaptureMode })}
            className="w-full text-sm rounded-lg px-3 py-2"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}>
            <option value="disabled">Disabled (default — nothing records)</option>
            <option value="push_to_talk">Push to Talk (safe default when capturing)</option>
            <option value="wake_word">Wake Word (requires engine)</option>
            <option value="meeting">Meeting Mode</option>
            <option value="silent_command">Silent Command</option>
          </select>
          {policy.captureMode !== "disabled" && (
            <p className="text-xs mt-1" style={{ color: "var(--color-warn)" }}>
              ⚠ Capture is active — indicator always visible
            </p>
          )}
          {policy.captureMode === "wake_word" && (
            <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
              Wake word engine status: {policy.wakeWordEnabled ? "configured" : "not_configured"}
            </p>
          )}
        </div>

        {/* Raw audio retention */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>
              Raw Audio Retention (seconds, 0 = auto-delete)
            </label>
            <input
              type="number" min={0} max={3600}
              value={policy.rawAudioRetentionSec}
              onChange={(e) => updateMutation.mutate({ rawAudioRetentionSec: Number(e.target.value) })}
              className="w-full text-sm rounded-lg px-3 py-2"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>
              Transcript Retention (days)
            </label>
            <input
              type="number" min={1} max={365}
              value={policy.transcriptRetentionDays}
              onChange={(e) => updateMutation.mutate({ transcriptRetentionDays: Number(e.target.value) })}
              className="w-full text-sm rounded-lg px-3 py-2"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }} />
          </div>
        </div>

        {/* Raw audio auto-delete toggle */}
        <div className="flex items-center justify-between py-2"
          style={{ borderTop: "1px solid var(--color-border)" }}>
          <div>
            <div className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
              Raw Audio Auto-Delete
            </div>
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>
              Delete raw audio immediately after transcription (recommended)
            </div>
          </div>
          <button
            onClick={() => updateMutation.mutate({ rawAudioAutoDelete: !policy.rawAudioAutoDelete })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: policy.rawAudioAutoDelete
                ? "color-mix(in srgb, var(--color-success) 18%, transparent)"
                : "color-mix(in srgb, var(--color-muted) 12%, transparent)",
              color: policy.rawAudioAutoDelete ? "var(--color-success)" : "var(--color-muted)",
              border: "1px solid var(--color-border)",
            }}>
            {policy.rawAudioAutoDelete ? <Eye size={12} /> : <EyeOff size={12} />}
            {policy.rawAudioAutoDelete ? "On (default)" : "Off"}
          </button>
        </div>

        {updateMutation.isError && (
          <p className="text-xs" style={{ color: "var(--color-error)" }}>
            {apiErrorMessage(updateMutation.error)}
          </p>
        )}
      </div>
    </Card>
  );
}

// ── Meeting Sessions Card ─────────────────────────────────────────────────────

function MeetingSessionRow({ session }: { session: MeetingSession }) {
  const [expanded, setExpanded] = useState(false);
  const [followUpType, setFollowUpType] = useState<FollowUpType>("task");
  const [followUpSubject, setFollowUpSubject] = useState("");
  const [followUpBody, setFollowUpBody] = useState("");
  const [message, setMessage] = useState("");
  const qc = useQueryClient();

  const draftMutation = useMutation({
    mutationFn: () => api.voiceApi.meeting.draftFollowUp(session.id, {
      type: followUpType, subject: followUpSubject, body: followUpBody,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meeting-sessions"] }); setMessage("Follow-up draft created."); },
    onError:   (e) => setMessage(apiErrorMessage(e)),
  });

  const proposeMutation = useMutation({
    mutationFn: (draftId: string) => api.voiceApi.meeting.proposeSend(session.id, draftId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meeting-sessions"] }); setMessage("Approval requested. Check Operations > Approvals."); },
    onError:   (e) => setMessage(apiErrorMessage(e)),
  });

  const denyMutation = useMutation({
    mutationFn: (draftId: string) => api.voiceApi.meeting.denyFollowUp(session.id, draftId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meeting-sessions"] }); setMessage("Follow-up denied."); },
    onError:   (e) => setMessage(apiErrorMessage(e)),
  });

  return (
    <div className="rounded-lg p-3"
      style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: statusColor(session.status) }} />
          <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
            {session.status.replace(/_/g, " ")}
          </span>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            {session.captureMode.replace(/_/g, " ")} · {session.transcriptWordCount} words
          </span>
        </div>
        <button onClick={() => setExpanded(!expanded)}
          style={{ color: "var(--color-muted)" }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {session.summaryText && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest mb-1"
                style={{ color: "var(--color-muted)" }}>Summary</div>
              <p className="text-xs" style={{ color: "var(--color-foreground)" }}>{session.summaryText}</p>
            </div>
          )}

          {session.decisions.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest mb-1"
                style={{ color: "var(--color-muted)" }}>Decisions</div>
              <ul className="space-y-0.5">
                {session.decisions.map((d, i) => (
                  <li key={i} className="flex items-start gap-1 text-xs" style={{ color: "var(--color-foreground)" }}>
                    <CheckCircle size={10} className="mt-0.5 shrink-0" style={{ color: "var(--color-success)" }} />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {session.actionItems.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest mb-1"
                style={{ color: "var(--color-muted)" }}>Action Items</div>
              <ul className="space-y-0.5">
                {session.actionItems.map((a, i) => (
                  <li key={i} className="text-xs" style={{ color: "var(--color-foreground)" }}>
                    {a.text}{a.assignee ? ` (${a.assignee})` : ""}{a.dueDate ? ` — due ${a.dueDate}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Follow-up drafts */}
          {session.followUps.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest mb-1"
                style={{ color: "var(--color-muted)" }}>Follow-ups</div>
              {session.followUps.map((f) => (
                <div key={f.id} className="flex items-center justify-between py-1 text-xs"
                  style={{ borderTop: "1px solid var(--color-border)" }}>
                  <div>
                    <span style={{ color: "var(--color-foreground)" }}>{f.subject}</span>
                    <span className="ml-2" style={{ color: "var(--color-muted)" }}>{f.type} · {f.status}</span>
                  </div>
                  <div className="flex gap-1">
                    {f.status === "draft" && (
                      <button onClick={() => proposeMutation.mutate(f.id)}
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{ background: "color-mix(in srgb, var(--color-warn) 15%, transparent)", color: "var(--color-warn)" }}>
                        <Send size={10} className="inline mr-1" />Request Approval
                      </button>
                    )}
                    {(f.status === "draft" || f.status === "pending_approval") && (
                      <button onClick={() => denyMutation.mutate(f.id)}
                        className="px-2 py-0.5 rounded text-xs"
                        style={{ color: "var(--color-error)" }}>
                        <Trash2 size={10} className="inline" />
                      </button>
                    )}
                    {f.status === "pending_approval" && (
                      <ApprovalBadge label="Awaiting approval" />
                    )}
                    {f.status === "denied" && (
                      <span className="text-xs" style={{ color: "var(--color-error)" }}>denied</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Draft follow-up form */}
          {session.status === "completed" && (
            <div className="pt-2" style={{ borderTop: "1px solid var(--color-border)" }}>
              <div className="text-xs font-semibold mb-2" style={{ color: "var(--color-muted)" }}>
                Draft Follow-up (approval required to send)
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <select value={followUpType} onChange={(e) => setFollowUpType(e.target.value as FollowUpType)}
                  className="text-xs rounded px-2 py-1.5"
                  style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}>
                  <option value="task">Task</option>
                  <option value="email">Email</option>
                  <option value="calendar_invite">Calendar Invite</option>
                  <option value="message">Message</option>
                </select>
                <input type="text" placeholder="Subject"
                  value={followUpSubject}
                  onChange={(e) => setFollowUpSubject(e.target.value)}
                  className="text-xs rounded px-2 py-1.5"
                  style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }} />
              </div>
              <textarea placeholder="Body (first 200 chars stored as preview only)"
                value={followUpBody}
                onChange={(e) => setFollowUpBody(e.target.value)}
                rows={2}
                className="w-full text-xs rounded px-2 py-1.5 mb-2"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", resize: "none" }} />
              <button onClick={() => { if (followUpSubject) draftMutation.mutate(); }}
                disabled={!followUpSubject || draftMutation.isPending}
                className="px-3 py-1.5 rounded text-xs font-medium"
                style={{ background: "color-mix(in srgb, var(--color-accent) 15%, transparent)", color: "var(--color-accent)", opacity: followUpSubject ? 1 : 0.5 }}>
                <FileText size={10} className="inline mr-1" />Create Draft
              </button>
              <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                Drafts require approval before sending. No email/calendar/task is sent automatically.
              </p>
            </div>
          )}

          {message && <p className="text-xs" style={{ color: "var(--color-info)" }}>{message}</p>}
        </div>
      )}
    </div>
  );
}

function MeetingSessionsCard() {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["meeting-sessions"],
    queryFn:  () => api.voiceApi.meeting.list(20),
  });

  const startMutation = useMutation({
    mutationFn: () => api.voiceApi.meeting.start("meeting"),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["meeting-sessions"] }); setMessage("Meeting session started. Capture indicator is now visible."); },
    onError:    (e) => setMessage(apiErrorMessage(e)),
  });

  const sessions = data?.sessions ?? [];

  return (
    <Card>
      <SectionHeader title="Meeting Sessions" subtitle="Transcription → Summary → Action items → Draft follow-ups (approval required to send)" />
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
            style={{ background: "color-mix(in srgb, var(--color-accent) 18%, transparent)", color: "var(--color-accent)", border: "1px solid var(--color-border)" }}>
            <Mic size={14} />
            {startMutation.isPending ? "Starting…" : "Start Meeting Session"}
          </button>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            Always-on capture is blocked. Session starts push-to-talk capture.
          </span>
        </div>

        {message && <p className="text-xs" style={{ color: "var(--color-info)" }}>{message}</p>}

        {isLoading && <p className="text-sm" style={{ color: "var(--color-muted)" }}>Loading sessions…</p>}

        {!isLoading && sessions.length === 0 && (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>No meeting sessions yet.</p>
        )}

        {sessions.map((session) => (
          <MeetingSessionRow key={session.id} session={session} />
        ))}
      </div>
    </Card>
  );
}

// ── Screen Context Card ───────────────────────────────────────────────────────

function ScreenContextCard() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["screen-context-status"],
    queryFn:  () => api.screenContextApi.status(),
  });

  const updateMutation = useMutation({
    mutationFn: (p: { manualScreenshotEnabled: boolean }) => api.screenContextApi.updateProfile(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["screen-context-status"] }),
  });

  const profile = data?.profile;

  return (
    <Card>
      <SectionHeader title="Screen Context" subtitle="Manual screenshot only — always-on capture and Screenpipe disabled by default" />
      <div className="p-4 space-y-3">
        {/* Hard limits */}
        <div className="flex flex-wrap gap-2">
          <HardBlockedBadge label="Always-on Capture: BLOCKED" />
          <HardBlockedBadge label="Screenpipe: NOT CONFIGURED" />
        </div>

        {isLoading && <p className="text-sm" style={{ color: "var(--color-muted)" }}>Loading…</p>}

        {profile && (
          <div className="flex items-center justify-between py-2"
            style={{ borderTop: "1px solid var(--color-border)" }}>
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
                Manual Screenshot for Chat Context
              </div>
              <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                Allow attaching screenshots to chat messages manually
              </div>
            </div>
            <button
              onClick={() => updateMutation.mutate({ manualScreenshotEnabled: !profile.manualScreenshotEnabled })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{
                background: profile.manualScreenshotEnabled
                  ? "color-mix(in srgb, var(--color-success) 18%, transparent)"
                  : "color-mix(in srgb, var(--color-muted) 12%, transparent)",
                color: profile.manualScreenshotEnabled ? "var(--color-success)" : "var(--color-muted)",
                border: "1px solid var(--color-border)",
              }}>
              {profile.manualScreenshotEnabled ? <Camera size={12} /> : <EyeOff size={12} />}
              {profile.manualScreenshotEnabled ? "Enabled" : "Disabled"}
            </button>
          </div>
        )}

        <div className="text-xs p-2 rounded"
          style={{ background: "color-mix(in srgb, var(--color-info) 10%, transparent)", color: "var(--color-muted)", border: "1px solid color-mix(in srgb, var(--color-info) 20%, transparent)" }}>
          Screenpipe-style always-on screen context is disabled by default. To enable, install and
          configure Screenpipe separately, then update the integration profile in Integrations.
          No screen capture happens automatically.
        </div>
      </div>
    </Card>
  );
}

// ── STT/TTS Status Card ───────────────────────────────────────────────────────

function VoiceStatusCard() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["voice-status"],
    queryFn:  () => api.voiceApi.status(),
    staleTime: 10_000,
  });

  const status = data?.status;

  return (
    <Card>
      <SectionHeader title="Voice Engine Status" subtitle="Local STT (faster-whisper) + Local TTS (Piper) — cloud engines disabled by default" />
      <div className="p-4 space-y-2">
        {isLoading && <p className="text-sm" style={{ color: "var(--color-muted)" }}>Checking sidecars…</p>}

        {status && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg p-3"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                <div className="flex items-center gap-2 mb-1">
                  {status.sttAvailable
                    ? <CheckCircle size={14} style={{ color: "var(--color-success)" }} />
                    : <XCircle size={14} style={{ color: "var(--color-muted)" }} />}
                  <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>STT (Whisper)</span>
                </div>
                <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                  {status.sttAvailable ? `Available — ${status.sttSidecarUrl}` : "Sidecar not running — install faster-whisper"}
                </p>
              </div>
              <div className="rounded-lg p-3"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                <div className="flex items-center gap-2 mb-1">
                  {status.ttsAvailable
                    ? <CheckCircle size={14} style={{ color: "var(--color-success)" }} />
                    : <XCircle size={14} style={{ color: "var(--color-muted)" }} />}
                  <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>TTS (Piper)</span>
                </div>
                <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                  {status.ttsAvailable ? "Available" : "Not installed — run: winget install piper-tts"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-xs px-2 py-0.5 rounded"
                style={{ background: "color-mix(in srgb, var(--color-muted) 12%, transparent)", color: "var(--color-muted)" }}>
                Cloud STT: {status.cloudSttEnabled ? "enabled" : "disabled (default)"}
              </span>
              <span className="text-xs px-2 py-0.5 rounded"
                style={{ background: "color-mix(in srgb, var(--color-muted) 12%, transparent)", color: "var(--color-muted)" }}>
                Cloud TTS: {status.cloudTtsEnabled ? "enabled" : "disabled (default)"}
              </span>
              <span className="text-xs px-2 py-0.5 rounded"
                style={{ background: "color-mix(in srgb, var(--color-muted) 12%, transparent)", color: "var(--color-muted)" }}>
                Wake word: {status.wakeWordStatus}
              </span>
              <span className="text-xs px-2 py-0.5 rounded"
                style={{ background: "color-mix(in srgb, var(--color-muted) 12%, transparent)", color: "var(--color-muted)" }}>
                Always-on: {status.alwaysOnEnabled ? "on" : "blocked (hard limit)"}
              </span>
            </div>
          </>
        )}

        <button onClick={() => refetch()}
          className="text-xs px-3 py-1.5 rounded-lg mt-1"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
          Refresh
        </button>
      </div>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VoicePage() {
  const { data: policyData } = useQuery({
    queryKey: ["voice-policy"],
    queryFn:  () => api.voiceApi.policy(),
  });

  const captureMode = policyData?.policy?.captureMode ?? "disabled";

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4"
      style={{ background: "var(--color-background)" }}>

      {/* Page header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-foreground)" }}>
            Voice & Meeting Intelligence
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            Phase 11 — Local-first STT/TTS, meeting capture, and approval-gated follow-ups
          </p>
        </div>
        <div className="flex items-center gap-2">
          {captureMode !== "disabled"
            ? <Mic size={18} className="animate-pulse" style={{ color: "var(--color-error)" }} />
            : <MicOff size={18} style={{ color: "var(--color-muted)" }} />}
          <span className="text-xs font-medium"
            style={{ color: captureMode !== "disabled" ? "var(--color-error)" : "var(--color-muted)" }}>
            {captureMode !== "disabled" ? "CAPTURE ACTIVE" : "Capture disabled"}
          </span>
        </div>
      </div>

      {/* Capture status bar — only visible when active */}
      <CaptureStatusBar captureMode={captureMode} />

      <div className="grid grid-cols-1 gap-4">
        <VoiceStatusCard />
        <VoiceSettingsCard />
        <MeetingSessionsCard />
        <ScreenContextCard />
      </div>
    </div>
  );
}
