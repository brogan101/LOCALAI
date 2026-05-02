# PHASE 13A — Maker Studio Foundation: Project, CAD, Material, And Safety Model

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add the Maker Studio foundation for CAD, 3D printing, CNC/laser, electronics, shop projects, and physical safety. This phase defines models, safety, and UI shell only.

Target files:
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Studios*,*Maker*,*Settings*,*Operations*
- docs/JARVIS_CONTEXT_INDEX.md

Implement:
1. Maker project model:
   - project id/name/type
   - related files
   - CAD files
   - sliced files
   - printer/CNC/device target
   - material/filament/stock
   - safety tier
   - status
2. Physical machine safety model:
   - read-only
   - simulate
   - prepare/queue
   - approval-required run
   - manual-only at machine
3. Maker integrations registry:
   - FreeCAD
   - CadQuery/build123d
   - KiCad
   - OrcaSlicer/PrusaSlicer/SuperSlicer
   - OctoPrint
   - Moonraker/Mainsail/Fluidd
   - Obico
   - Spoolman
   - CNCjs/LinuxCNC/FluidNC
   - InvenTree
4. All integrations start disabled/unconfigured unless detected.
5. UI:
   - Maker Studio dashboard
   - safety policy badges
   - project list
   - integration status
6. Tests:
   - physical run action blocked by default
   - disabled machine integration cannot execute
   - project model persists

Hard limits:
- Do not start machines.
- Do not send G-code.
- Do not auto-start prints/CNC/laser.

Closeout:
Update ledger and local AI handoff.
```

---
