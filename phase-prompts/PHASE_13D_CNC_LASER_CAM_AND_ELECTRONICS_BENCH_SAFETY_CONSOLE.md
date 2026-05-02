# PHASE 13D — CNC, Laser, CAM, And Electronics Bench Safety Console

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add CNC/laser/CAM/electronics bench planning safely. Jarvis can prepare, simulate, inspect, and generate setup sheets. Dangerous machine start remains manual-only.

Target files:
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Maker*,*CNC*,*Laser*,*Electronics*,*Studios*

Implement:
1. CAM/CNC adapters:
   - FreeCAD Path profile
   - CNCjs profile
   - LinuxCNC profile
   - FluidNC profile
   - all disabled until configured
2. Safety tiers:
   - G-code generation = prepare/approval
   - simulation = allowed when local/offline
   - sending G-code = approval-required
   - spindle/laser/plasma/motion start = manual-only at machine by default
3. Setup sheet generator:
   - stock dimensions
   - tool list
   - workholding notes
   - PPE/safety checklist
   - human verification checklist
4. Electronics bench:
   - KiCad project flow
   - BOM export/import plan
   - InvenTree parts check when configured
   - serial/USB hardware control disabled unless later explicitly implemented
5. UI:
   - CAM safety console
   - setup sheet preview
   - manual-only gates clearly visible
6. Tests:
   - spindle/laser start cannot run through software
   - G-code send blocked without approval
   - disabled CNC adapter cannot execute

Hard limits:
- Never start spindle, laser, plasma, router, or machine motion automatically.
- Never bypass manual safety checklist.

Closeout:
Update docs and ledger.
```

---
