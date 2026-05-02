# PHASE 18 — Master Tech Automotive Diagnostics And Vehicle Intelligence

```text
Work inside existing LOCALAI. Read persistent context docs first, especially:
- docs/JARVIS_EXPERT_MODES.md
- docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md
- docs/JARVIS_REQUIREMENTS_TRACEABILITY.md
- docs/JARVIS_UI_STYLE_GUARD.md

Goal:
Build the Master Tech mode for your Foxbody/LQ4 project and future vehicles. This must be more than an automotive assistant or DTC explainer. It should behave like a disciplined diagnostic workflow: gather evidence, rank likely causes, generate tests before parts replacement, log repairs, and preserve vehicle-specific memory.

Target files:
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/rag.ts
- artifacts/api-server/src/routes/plugins.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Automotive*,*Mechanic*,*Vehicle*,*MasterTech*,*Studios*
- docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md
- docs/JARVIS_REQUIREMENTS_TRACEABILITY.md
- docs/JARVIS_EXPERT_MODES.md

Implement:
1. Vehicle profile model:
   - year/make/model/body
   - drivetrain/engine/trans/ECU
   - mods and known calibration/tuning notes
   - known wiring notes
   - parts list
   - linked docs/receipts/manuals/photos/audio notes
   - maintenance and repair log
   - DTC/freeze-frame/live-data history
2. Preload/create your Foxbody profile:
   - 1988 Mustang GT hatchback
   - LQ4
   - 4L80E
   - ACES Jackpot ECU
   - BTR Stage 3 NA cam
   - FAST 102mm throttle body
   - JEGS intake
   - Z28 radiator/fans
   - On3 central fuel hat / 3-pump system
   - Foxbody wiring notes field
3. Diagnostic adapters:
   - python-OBD profile disabled until configured
   - pyOBD reference path only if useful, with license/risk note
   - ELM327 emulator profile for development/testing
   - SavvyCAN profile disabled until configured for CAN capture/review
   - OVMS/Open Vehicle Monitoring future profile disabled until hardware/configured
   - ACES ECU/log import adapter as file-import/workspace concept only unless a safe local API/tool exists
4. Master Tech workflows:
   - symptom intake
   - DTC/freeze-frame intake when configured
   - live sensor graph metadata and snapshot import
   - service manual/wiring/receipt/build-log RAG linking
   - ranked likely causes with evidence and confidence
   - test-first diagnostic plan
   - parts cannon warning if user tries to replace parts without tests
   - repair log and final fix capture
   - compare before/after data if available
5. Foxbody/LS-swap workflows:
   - wiring note workspace
   - fuel/spark/compression/air diagnostic checklist templates
   - cooling/fan/charging/grounds checklist templates
   - transmission/4L80E note workspace
   - ACES/log/tuning note import as disabled adapter with no fake success
6. UI:
   - Master Tech Studio card/page using existing LOCALAI style
   - vehicle profile view
   - symptom intake
   - DTC/test plan/repair log views
   - linked documents/receipts/manuals section
   - no redesign or new theme
7. Tests:
   - real OBD unavailable returns not_configured
   - emulator/sample DTC produces diagnostic plan
   - repair log links to vehicle
   - disabled CAN/OVMS/ACES adapters cannot report success
   - Master Tech response includes tests/assumptions and does not claim certainty

Hard limits:
- Do not claim repair certainty.
- Do not command ECU writes, tune flashes, immobilizer/security changes, or safety-critical vehicle changes.
- No CAN injection by default. Capture/review only unless a later explicit hardware-safe workflow exists.
- No driving-safety advice without recommending human verification where appropriate.

Closeout:
Update ledger/local AI handoff/watchlist/traceability and append the phase acceptance block.
```

---
