# PHASE 11 — Voice, Screen Context, Meeting Intelligence, And Local Interaction Modes

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add strong local voice/screen/meeting workflows while preserving privacy. Push-to-talk/default local only. Always-visible capture state. No hidden recording.

Target files:
- artifacts/api-server/src/routes/stt.ts
- artifacts/api-server/src/routes/tts.ts
- artifacts/api-server/src/routes/context.ts
- artifacts/api-server/src/routes/chat.ts
- artifacts/api-server/src/lib/task-queue.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Voice*,*Chat*,*Settings*,*Meeting*,*Context*
- sidecars/*

Implement:
1. Voice modes:
   - push-to-talk
   - wake word disabled until configured
   - meeting mode
   - silent command mode
2. Capture policy:
   - visible indicator
   - local-only transcripts by default
   - excluded apps/zones
   - retention policy
   - raw audio auto-delete option
3. Meeting workflow:
   - transcribe
   - summarize
   - extract decisions/action items/dates
   - draft follow-up/email/calendar/task only, no send without approval
4. Screen context:
   - manual screenshot/context attach
   - Screenpipe-style integration profile disabled until configured
   - no always-on capture by default
5. TTS:
   - local TTS default
   - cloud TTS optional only under Phase 02 policy
6. UI:
   - voice settings
   - capture status
   - meeting summary card
   - follow-up approval cards
7. Tests:
   - recording disabled by default
   - follow-up send blocked without approval
   - retention config persists
   - unavailable sidecars fail-soft

Hard limits:
- No covert recording.
- No automatic external sending.
- No cloud transcription by default.

Closeout:
Update ledger and local AI handoff.
```

---
