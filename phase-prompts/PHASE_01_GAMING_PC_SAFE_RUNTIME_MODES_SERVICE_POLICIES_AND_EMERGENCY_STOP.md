# PHASE 01 — Gaming-PC-Safe Runtime Modes, Service Policies, And Emergency Stop

```text
Work inside the existing LOCALAI repo. Read the persistent context docs first.

Goal:
Make Jarvis safe on my gaming PC. Add service/runtime modes, startup policies, resource controls, and emergency stop before adding heavy integrations.

Target files:
- artifacts/api-server/src/app.ts
- artifacts/api-server/src/routes/system.ts
- artifacts/api-server/src/routes/models.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/updates.ts
- artifacts/api-server/src/lib/model-orchestrator.ts
- artifacts/api-server/src/lib/hardware-probe.ts
- artifacts/api-server/src/lib/task-queue.ts
- artifacts/api-server/src/lib/thought-log.ts
- artifacts/api-server/src/lib/secure-config.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Settings*,*Operations*,*Diagnostics*,*Models*,*Sidebar*,*Layout*
- scripts/windows/*

Implement:
1. Runtime modes:
   - Lightweight
   - Coding
   - Vision
   - Media
   - Business
   - Maker
   - HomeLab
   - HomeShop
   - Gaming
   - EmergencyStop
2. Store current mode persistently in SQLite/settings.
3. Service policy model for every managed integration/service:
   - service id
   - display name
   - startup policy: disabled/manual/on_demand/mode_based
   - allowed runtime modes
   - resource class: light/medium/heavy/gpu/physical/network
   - health check command or URL
   - stop command
   - emergency stop behavior
   - requires approval boolean
4. API endpoints:
   - `GET /api/runtime-mode`
   - `POST /api/runtime-mode/set`
   - `GET /api/service-policies`
   - `POST /api/service-policies/:id/update`
   - `POST /api/emergency-stop`
5. Gaming mode behavior:
   - stop GPU-heavy services/models safely
   - stop/disable background model warmups
   - pause heavy tasks
   - leave lightweight UI/API available
   - log exactly what was stopped or skipped
6. Emergency stop behavior:
   - stop active queued jobs where safe
   - unload models where safe
   - stop managed services with defined stop commands
   - disable physical action execution
   - write audit/thought-log event
7. UI:
   - Add runtime mode status/control in existing settings/operations area.
   - Add emergency stop button with confirmation.
   - Show service startup policies and resource impact.
8. Tests:
   - mode persistence
   - service policy validation
   - emergency stop denies physical actions
   - Gaming mode does not require Docker/Ollama/cloud

Hard limits:
- Do not auto-start new services.
- Do not kill arbitrary user processes except explicitly managed Jarvis services/models.
- Do not run destructive shell commands.

Closeout:
Update ledger, test matrix, context index, blockers, and local AI handoff.
```

---
