# PHASE 07C — OpenClaw And NemoClaw Full-Potential Gateway With Safety Wrappers

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Use OpenClaw and NemoClaw as first-class high-power gateways for chat/phone/messaging/skills while wrapping them with Jarvis permissions, tool firewall, approval queue, logging, and sandboxing.

Target files:
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/plugins.ts
- artifacts/api-server/src/routes/remote.ts
- artifacts/api-server/src/routes/chat.ts
- artifacts/api-server/src/lib/task-queue.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Integrations*,*Remote*,*Chat*,*Tools*,*Settings*
- plugins/*
- scripts/*

Implement:
1. OpenClaw/NemoClaw integration profiles:
   - install path/config path
   - enabled channels
   - allowed skills
   - skill quarantine path
   - approved skills path
   - disabled skills path
   - model endpoint mapping to LOCALAI/LiteLLM/local gateway
2. Channel safety:
   - phone/chat messages can request actions
   - risky actions create approval cards, not immediate execution
   - external send/post/message actions require Tier 4 approval
3. Skill safety:
   - skill manifest scanner
   - permission manifest required
   - quarantine first
   - no host execution by default
   - approved move requires user approval
4. OpenClaw command bridge:
   - route messages into LOCALAI chat/session context
   - local model default
   - tool firewall enforced
5. NemoClaw wrapper support:
   - configure as safety layer when available
   - if unavailable, show disabled `not_installed` status with setup steps
6. UI:
   - OpenClaw/NemoClaw dashboard
   - channel status
   - skill quarantine/approval list
   - recent remote commands
7. Tests:
   - remote command cannot execute risky action without approval
   - unapproved skill cannot run
   - skill scanner detects missing permission manifest
   - local model endpoint used by default

Hard limits:
- Do not connect real WhatsApp/Signal/Teams/etc. in tests.
- Do not bypass Jarvis permission system.
- Do not install skills directly into approved path.

Closeout:
Update ledger and local AI handoff.
```

---
