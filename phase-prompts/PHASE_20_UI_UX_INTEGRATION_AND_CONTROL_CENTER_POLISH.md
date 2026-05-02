# PHASE 20 — UI/UX Integration And Control Center Polish

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Unify all new modules into the existing control center UI without making it cluttered. Every user-facing phase should already have minimal UI; this pass organizes, polishes, and reduces friction.

Target files:
- artifacts/localai-control-center/src/**/*
- artifacts/api-server/src/routes/index.ts
- artifacts/api-server/src/routes/* relevant to module status
- docs/JARVIS_CONTEXT_INDEX.md

Implement:
1. Navigation groups:
   - Home / Dashboard
   - Chat / Build
   - Models / Providers
   - Tools / MCP / OpenClaw
   - Automation
   - Maker Studio
   - HomeLab / Network
   - Home/Shop
   - Evidence / Memory
   - Security / SOC
   - Operations / Logs / Replay
   - Settings
2. Dashboard status cards:
   - runtime mode
   - local-first status
   - active models
   - pending approvals
   - jobs
   - updater proposals
   - service health
   - blockers
3. Shared components:
   - risk badge
   - unavailable state card
   - approval button group
   - resource impact badge
   - local/cloud badge
   - physical action tier badge
4. UX rules:
   - do not bury Emergency Stop
   - do not show fake online/ready states
   - settings must make startup policy obvious
   - cloud/API optional status must be clear
5. Tests:
   - major pages render
   - unavailable states render
   - permission notice components still pass
   - build passes

Hard limits:
- Do not redesign the whole app from scratch.
- Do not remove existing pages unless replaced with working equivalents.

Closeout:
Update ledger/local AI handoff.
```

---
