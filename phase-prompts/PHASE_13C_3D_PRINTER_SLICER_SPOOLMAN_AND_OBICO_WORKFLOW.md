# PHASE 13C — 3D Printer, Slicer, Spoolman, And Obico Workflow

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Build 3D printing workflow: slice, check filament, queue, monitor, detect failure, and log results. Real print start must require approval and default disabled.

Target files:
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Maker*,*Printer*,*Studios*,*Integrations*,*Approval*

Implement:
1. Slicer adapter profiles:
   - OrcaSlicer
   - PrusaSlicer/SuperSlicer CLI
   - status/detect/config
   - slice dry-run/config validation where available
2. Printer adapters:
   - OctoPrint
   - Moonraker/Klipper
   - Mainsail/Fluidd profile references
   - FDM Monster optional
3. Filament inventory:
   - Spoolman adapter status/config
   - check material availability before queueing
4. Failure monitoring:
   - Obico adapter status/config
   - print monitoring state only when configured
5. Workflow:
   - design/model selected
   - slice proposal
   - filament check
   - queue print proposal
   - start print approval
   - monitoring/logging
6. UI:
   - printer dashboard
   - spool/material status
   - slice job card
   - print approval card
7. Tests:
   - start print blocked without approval
   - unavailable printer returns not_configured
   - filament check can block queue
   - monitoring unavailable state is visible

Hard limits:
- No unattended print start by default.
- No temperature/heater commands without approval.
- No printer API token logging.

Closeout:
Update ledger/local AI handoff.
```

---
