# PHASE 13B — Master Fabricator: FreeCAD, Text-to-CAD, CAD-as-Code, And KiCad Adapters

```text
Work inside existing LOCALAI. Read persistent context docs first, especially:
- docs/JARVIS_EXPERT_MODES.md
- docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md
- docs/JARVIS_REQUIREMENTS_TRACEABILITY.md
- docs/JARVIS_UI_STYLE_GUARD.md

Goal:
Build the Master Fabricator / CAD Engineer foundation. Jarvis should support local-first CAD generation and review through FreeCAD MCP and CAD-as-code, plus optional disabled text-to-CAD cloud/API providers. It can draft, inspect, render, revise, and export digital models. It cannot physically fabricate in this phase.

Target files:
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/plugins.ts
- artifacts/api-server/src/lib/task-queue.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Maker*,*Studios*,*CAD*,*Integrations*
- docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md
- docs/JARVIS_REQUIREMENTS_TRACEABILITY.md
- docs/JARVIS_EXPERT_MODES.md

Implement:
1. CAD provider registry:
   - FreeCAD MCP provider: local-first, preferred for GUI/FreeCAD control
   - CadQuery provider: local-first CAD-as-code
   - build123d provider: local-first CAD-as-code
   - OpenSCAD-style script provider if existing project patterns support it
   - gNucleus Text-to-CAD MCP provider: optional/cloud/API-key, disabled until configured
   - BuildCAD AI MCP/provider: optional/cloud/API-key/account, disabled until configured
   - KiCad MCP providers: optional electronics workflow, disabled until configured
2. FreeCAD adapter:
   - detect install/config
   - support configured MCP endpoint or command profile
   - status: not_installed/not_configured/ready/error
   - actions: inspect, create draft, render screenshot, get object list, safe export
   - Python macro execution only in approved Maker workspace/temp project and only after approval
3. Local CAD-as-code adapter:
   - generate parametric CadQuery/build123d script file
   - store units, dimensions, parameters, material assumptions, bounding box, export targets
   - run only in safe workspace with approval
   - produce STEP/STL path metadata when execution is configured
4. Text-to-CAD adapter policy:
   - cloud/API providers remain optional and disabled by default
   - missing API key returns not_configured, never success
   - before any cloud text-to-CAD call, classify data and show data-leaves-machine warning
   - local-first path must work without these providers
5. KiCad/electronics adapter:
   - detect/config only initially unless safe CLI/MCP integration exists
   - support linking KiCad projects and future ERC/DRC/BOM reports
   - no manufacturing outputs without human review
6. Geometry review:
   - units check
   - bounding-box metadata
   - export target list
   - revision notes
   - screenshot/render preview if configured
7. UI:
   - Master Fabricator / CAD Engineer card within existing style
   - provider status chips
   - generated script/model preview
   - approve revision button
   - no redesign or new theme
8. Tests:
   - unavailable FreeCAD cannot report success
   - text-to-CAD provider with no API key returns not_configured
   - CAD script generation writes to approved workspace only
   - macro execution requires approval
   - cloud provider path is blocked by local-first policy until explicitly configured

Hard limits:
- No arbitrary Python macro execution without approval.
- No writing outside Maker project workspace.
- No physical fabrication commands.
- No cloud text-to-CAD call without explicit configuration, data classification, and approval.
- Do not remove any prior Maker, 3D printer, CNC, KiCad, or Text-to-CAD scope from the watchlist.

Closeout:
Update ledger/local AI handoff/watchlist/traceability and append the phase acceptance block.
```

---
