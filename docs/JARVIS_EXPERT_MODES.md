# JARVIS_EXPERT_MODES.md

Purpose: turn broad “assistant” modules into expert-grade modes that behave like disciplined specialists. These modes are capability contracts, not separate apps. They must extend LOCALAI/Jarvis systems, preserve the existing UI style, and obey local-first, approval, safety, logging, and rollback rules.

## Expert-mode rule

When a phase creates a user-facing module, it must identify the expert mode it supports and add that mode to the implementation ledger. Expert modes must provide:

- structured intake
- evidence gathered
- confidence level and assumptions
- test/check plan before action
- safety limits
- generated artifacts/files
- audit/ledger entry
- next action

No expert mode may claim certainty where real-world inspection, measurement, or human review is required.

## Required expert modes

### 1. Master Tech — Automotive / Vehicle Diagnostics

Must go beyond “OBD code explainer.” It should work like a master technician:

- vehicle profiles and modification history
- DTC/freeze-frame/live-data intake when configured
- symptom interview
- service manual / wiring / receipt / build-log RAG
- cause ranking with tests before parts replacement
- sensor graph metadata
- wiring/pinout note workspace
- CAN/DBC capture notes through SavvyCAN/OVMS-style adapters when configured
- repair log and final fix capture
- no ECU writes/tuning/safety-critical commands without manual review

Primary project memory must include the Foxbody/LQ4/4L80E/ACES profile already specified in the plan.

Phase 18 status: Master Tech foundation is implemented in `lib/automotive-diagnostics.ts` with local vehicle profiles, modification/fact status, Foxbody profile preload, symptom intake, user-provided/sample DTC intake, Evidence Vault/RAG evidence refs, likely-cause ranking as hypotheses, test-before-parts plans, repair log/final-fix capture, optional python-OBD/ELM327/SavvyCAN/OVMS/ACES/CAN/external-data provider status, and approval/manual-only vehicle action gates. No OBD/CAN/ECU/scanner/hardware/cloud provider execution occurs by default; ECU writes, tune changes, and firmware flashes are manual_only.

### 2. Master Fabricator / CAD Engineer

Must support text-to-CAD, CAD-as-code, FreeCAD MCP, STEP/STL export, geometry review, and fabrication readiness:

- local-first CAD generation through FreeCAD MCP, CadQuery, build123d, and OpenSCAD-style scripts
- optional cloud/API text-to-CAD providers only when explicitly configured and approved
- units, dimensions, bounding box, tolerances, material, strength assumptions
- render/screenshot preview
- revision history
- export artifacts
- handoff to slicer/CAM only after approval

Phase 13B status: FreeCAD MCP, CadQuery, build123d, OpenSCAD-style, and KiCad are represented as local-first provider status/proposal surfaces in Maker Studio. They remain `not_configured` and execution-disabled until explicitly configured and approval-gated. gNucleus/BuildCAD cloud text-to-CAD providers remain disabled/not_configured by default and require later data-leaves-machine review and approval before any use.

Phase 13C status: OrcaSlicer, PrusaSlicer/SuperSlicer, OctoPrint, Moonraker/Klipper, Mainsail/Fluidd, FDM Monster, Spoolman, and Obico are represented as Maker Studio provider status/proposal surfaces. Slicing proposals are dry-run/config-validation metadata only; queue/start/heater/motor actions are approval-gated or blocked; missing/unknown material can block queue proposals; Obico monitoring reports not_configured/degraded. No slicer, printer API, G-code, monitoring, cloud, or hardware action executes.

### 3. Master Electronics / PCB Engineer

Must support KiCad-assisted electronics workflows:

- project linking and analysis
- schematic/PCB validation
- ERC/DRC report intake when KiCad CLI/MCP is configured
- symbol/footprint notes
- BOM and supplier notes
- firmware pinout/codegen notes when supported
- human review before manufacturing files

Phase 13B status: KiCad project/design proposals can be represented as metadata-only review records; ERC/DRC/BOM generation and manufacturing outputs remain future not_configured workflows with no KiCad tool execution.

### 4. Master Network Architect / HomeLab Engineer

Must support config-first infrastructure work:

- source of truth in NetBox/Nautobot-like data
- diagram/topology generation
- VLAN/IP/DNS/firewall plan
- Proxmox/OPNsense/UniFi/OpenTofu/Ansible/Nornir pipeline when configured
- validate before apply
- backup/diff/approval/verify/rollback workflow

### 5. Home SOC Analyst

Must support read-first security monitoring:

- Wazuh/Zeek/Suricata/LibreNMS/Netdata/Uptime Kuma/AdGuard/Pi-hole style adapters
- alert explanation
- “what changed?” timeline
- network device discovery
- safe firewall suggestions only, no silent changes

### 6. Project Foreman

Must connect idea → plan → files → inventory → fabrication → installation → maintenance:

- project brief
- parts/material list
- inventory check
- risk/safety checklist
- step-by-step build plan
- status board
- final documentation package

### 7. Safety Officer

Must be automatically consulted by any physical system or external-send workflow:

- physical action tier
- simulator/dry-run/read-only path
- emergency-stop behavior
- approval requirements
- prohibited/manual-only actions

### 8. Maintainer / Release Engineer

Must handle self-updates and self-improvement:

- version/release watch
- dependency/model/integration proposals
- changelog and risk summary
- test plan
- branch/PR/diff
- rollback path
- no auto-merge or blind update

Phase 6 status: self-maintainer radar, source allowlist/block rules, dry-run/proposal update states, approval-gated update/repair/self-improvement actions, direct-main apply blocking, Gaming Mode mutation blocking, and Operations Maintainer UI are implemented in `lib/self-maintainer.ts`.

Phase 22 status: Local AI Transition (`lib/local-builder.ts`) extends the Maintainer mode with a local-model self-build workflow. Four model roles (fast_code, deep_code, reviewer, rag_embedding) with not_configured defaults until Ollama models are configured. Four context packs in `docs/context-packs/` provide compact architecture/safety/state/template references for local models. `proposeBuildTask()` is approval-gated (tier3_file_modification), hard-blocks shell metacharacter phaseIds/taskSummaries, and hard-blocks own-source targetFiles. Four local evals (repo_summary, safe_patch_plan, unsafe_action_detection, ledger_update) run with `usedNetwork=false`. Hard limits `cloudEscalationEnabled=false`, `selfModificationAllowed=false`, `requireApprovalForEdits=true` are TypeScript literal types — structurally impossible to override. Local Builder tab in Studios UI exposes model readiness, context packs, build proposal form, and local eval results.

### 9. UI Custodian

Must protect the current LOCALAI UI style:

- no redesign or reskin
- reuse existing cards/navigation/tokens/buttons/badges
- add only necessary new surfaces
- no dead controls
- every UI change documents the existing pattern it extended

## Final audit requirement

Phase 23 must check that each expert mode is either implemented, intentionally scheduled, or listed as blocked with exact next action.
