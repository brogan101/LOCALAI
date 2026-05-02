# Jarvis Execution Guide — No Guessing Workflow

This guide defines the exact way to build Jarvis from the existing `LOCALAI` repo.

## Non-negotiable execution method

Run **one phase at a time**.

Do not paste the whole prompt pack into Codex and ask it to do everything. That wastes usage and increases the chance of fake completion.

## First-time setup

1. Copy this kit into the root of the `LOCALAI` repo.
2. Confirm these files exist:

```text
AGENTS.md
JARVIS_CODEX_PROMPT_PACK_v2.md
docs/JARVIS_IMPLEMENTATION_LEDGER.md
docs/JARVIS_PHASE_MAP.md
docs/JARVIS_BLOCKERS.md
docs/JARVIS_TEST_MATRIX.md
docs/JARVIS_LOCAL_AI_HANDOFF.md
docs/JARVIS_CODEX_WORKFLOW.md
phase-prompts/
prompts/
```

3. Create a branch before Phase 00:

```powershell
git checkout -b jarvis-phase-00-baseline
```

4. Optional baseline command:

```powershell
node scripts/jarvis/verify-build-kit.mjs
node scripts/verify-localai-baseline.mjs
.\scripts\jarvis\verify-localai-baseline.ps1
```

If PowerShell fails, use:

```bash
node scripts/jarvis/verify-build-kit.mjs
node scripts/verify-localai-baseline.mjs
bash scripts/jarvis/verify-localai-baseline.sh
```

## Recommended Codex execution method

Use either Codex App, Codex CLI, or Codex IDE extension. Start with Suggest or Auto Edit. Keep one branch/worktree/thread per phase. Do not use parallel agents for dependent implementation phases until Phase 04 is complete.

For Codex App: create/open the LOCALAI project, create one thread for Phase 00, and keep later phases as separate threads/worktrees only after the previous phase is merged or committed.

For Codex CLI: run from the LOCALAI repo root. Use `codex` or `codex --auto-edit` for early phases. Avoid full-auto until safety gates exist.

For Codex cloud/delegated tasks: use only for isolated review or PR prep. Pull changes locally, run checks locally, and update the ledger before continuing.

## How to run Phase 00

Paste the contents of:

```text
prompts/RUN_PHASE_00_NOW.md
```

## How to run every later phase

Paste the contents of:

```text
prompts/RUN_NEXT_PHASE_TEMPLATE.md
```

Then replace:

```text
PHASE_ID_HERE
PHASE_NAME_HERE
PHASE_FILE_HERE
```

with the next phase from the phase map.

## Stop conditions

Stop immediately if any of these happen:

- Codex did not update the implementation ledger.
- Codex did not update the local AI handoff.
- Codex made broad unrelated rewrites.
- Codex created duplicate systems instead of extending existing ones.
- Codex added fake integrations or fake success paths.
- Tests fail and the failure is not logged in blockers.
- A heavy service starts automatically on boot without policy.
- A cloud/API dependency becomes required.
- A physical action can run without simulator/dry-run/approval.

## Phase list

| # | Phase | Prompt file | Status |
|---:|---|---|---|
| 1 | PHASE 00 — Agent Memory, Repo Truth Audit, And Build Baseline | `phase-prompts/PHASE_00_AGENT_MEMORY_REPO_TRUTH_AUDIT_AND_BUILD_BASELINE.md` and compatibility alias `phase-prompts/PHASE_00_REPO_BASELINE_AND_CONTEXT_SYSTEM.md` | Complete |
| 2 | PHASE 00.5 — Repair Current Runtime Blockers Before Feature Expansion | `phase-prompts/PHASE_00_5_REPAIR_CURRENT_RUNTIME_BLOCKERS_BEFORE_FEATURE_EXPANSION.md` | Next |
| 3 | PHASE 01 — Gaming-PC-Safe Runtime Modes, Service Policies, And Emergency Stop | `phase-prompts/PHASE_01_GAMING_PC_SAFE_RUNTIME_MODES_SERVICE_POLICIES_AND_EMERGENCY_STOP.md` | Not started |
| 4 | PHASE 02 — Local-First Provider Policy With Optional API Keys | `phase-prompts/PHASE_02_LOCAL_FIRST_PROVIDER_POLICY_WITH_OPTIONAL_API_KEYS.md` | Not started |
| 5 | PHASE 03 — Approval Queue, Permission Tiers, And Durable Jobs | `phase-prompts/PHASE_03_APPROVAL_QUEUE_PERMISSION_TIERS_AND_DURABLE_JOBS.md` | Not started |
| 6 | PHASE 04 — Observability, Evals, Mission Replay, And Proof Harness | `phase-prompts/PHASE_04_OBSERVABILITY_EVALS_MISSION_REPLAY_AND_PROOF_HARNESS.md` | Not started |
| 7 | PHASE 05 — Unified AI Gateway, Model Router, And Model Lifecycle Manager | `phase-prompts/PHASE_05_UNIFIED_AI_GATEWAY_MODEL_ROUTER_AND_MODEL_LIFECYCLE_MANAGER.md` | Not started |
| 8 | PHASE 06 — Self-Updating And Self-Improving Jarvis Maintainer | `phase-prompts/PHASE_06_SELF_UPDATING_AND_SELF_IMPROVING_JARVIS_MAINTAINER.md` | Not started |
| 9 | PHASE 07A — MCP Tool Registry And Tool Firewall Foundation | `phase-prompts/PHASE_07A_MCP_TOOL_REGISTRY_AND_TOOL_FIREWALL_FOUNDATION.md` | Not started |
| 10 | PHASE 07B — Docker MCP Gateway Integration | `phase-prompts/PHASE_07B_DOCKER_MCP_GATEWAY_INTEGRATION.md` | Not started |
| 11 | PHASE 07C — OpenClaw And NemoClaw Full-Potential Gateway With Safety Wrappers | `phase-prompts/PHASE_07C_OPENCLAW_AND_NEMOCLAW_FULL_POTENTIAL_GATEWAY_WITH_SAFETY_WRAPPERS.md` | Not started |
| 12 | PHASE 08A — Professional RAG Engine And Document Ingestion Interfaces | `phase-prompts/PHASE_08A_PROFESSIONAL_RAG_ENGINE_AND_DOCUMENT_INGESTION_INTERFACES.md` | Not started |
| 13 | PHASE 08B — Evidence Vault And Paperless/Manuals/Receipts Workflow | `phase-prompts/PHASE_08B_EVIDENCE_VAULT_AND_PAPERLESS_MANUALS_RECEIPTS_WORKFLOW.md` | Not started |
| 14 | PHASE 09A — Browser Automation With Playwright MCP Safety | `phase-prompts/PHASE_09A_BROWSER_AUTOMATION_WITH_PLAYWRIGHT_MCP_SAFETY.md` | Not started |
| 15 | PHASE 09B — Desktop/App Automation Drivers With WorldGUI Fallback | `phase-prompts/PHASE_09B_DESKTOP_APP_AUTOMATION_DRIVERS_WITH_WORLDGUI_FALLBACK.md` | Not started |
| 16 | PHASE 10 — Chat-Driven Program Modification And Coding Agent Runtime | `phase-prompts/PHASE_10_CHAT_DRIVEN_PROGRAM_MODIFICATION_AND_CODING_AGENT_RUNTIME.md` | Not started |
| 17 | PHASE 11 — Voice, Screen Context, Meeting Intelligence, And Local Interaction Modes | `phase-prompts/PHASE_11_VOICE_SCREEN_CONTEXT_MEETING_INTELLIGENCE_AND_LOCAL_INTERACTION_MODES.md` | Not started |
| 18 | PHASE 12A — Business Module Foundation And CRM/Support Adapters | `phase-prompts/PHASE_12A_BUSINESS_MODULE_FOUNDATION_AND_CRM_SUPPORT_ADAPTERS.md` | Not started |
| 19 | PHASE 12B — IT Support Copilot And Safe Script Generator | `phase-prompts/PHASE_12B_IT_SUPPORT_COPILOT_AND_SAFE_SCRIPT_GENERATOR.md` | Not started |
| 20 | PHASE 13A — Maker Studio Foundation: Project, CAD, Material, And Safety Model | `phase-prompts/PHASE_13A_MAKER_STUDIO_FOUNDATION_PROJECT_CAD_MATERIAL_AND_SAFETY_MODEL.md` | Not started |
| 21 | PHASE 13B — FreeCAD, CAD-as-Code, And KiCad Adapters | `phase-prompts/PHASE_13B_FREECAD_CAD_AS_CODE_AND_KICAD_ADAPTERS.md` | Not started |
| 22 | PHASE 13C — 3D Printer, Slicer, Spoolman, And Obico Workflow | `phase-prompts/PHASE_13C_3D_PRINTER_SLICER_SPOOLMAN_AND_OBICO_WORKFLOW.md` | Not started |
| 23 | PHASE 13D — CNC, Laser, CAM, And Electronics Bench Safety Console | `phase-prompts/PHASE_13D_CNC_LASER_CAM_AND_ELECTRONICS_BENCH_SAFETY_CONSOLE.md` | Not started |
| 24 | PHASE 14A — Edge Node Architecture And Home/Shop Autopilot Foundation | `phase-prompts/PHASE_14A_EDGE_NODE_ARCHITECTURE_AND_HOME_SHOP_AUTOPILOT_FOUNDATION.md` | Not started |
| 25 | PHASE 14B — Home Assistant, Robot Vacuum, Cameras, MQTT, And Shop Devices | `phase-prompts/PHASE_14B_HOME_ASSISTANT_ROBOT_VACUUM_CAMERAS_MQTT_AND_SHOP_DEVICES.md` | Not started |
| 26 | PHASE 15A — HomeLab Architect Source Of Truth: NetBox/Nautobot, Inventory, And Diagrams | `phase-prompts/PHASE_15A_HOMELAB_ARCHITECT_SOURCE_OF_TRUTH_NETBOX_NAUTOBOT_INVENTORY_AND_DIAGRAMS.md` | Not started |
| 27 | PHASE 15B — HomeLab Config Generation, Validation, And Apply Pipeline | `phase-prompts/PHASE_15B_HOMELAB_CONFIG_GENERATION_VALIDATION_AND_APPLY_PIPELINE.md` | Not started |
| 28 | PHASE 16 — Home SOC And Security Monitoring Copilot | `phase-prompts/PHASE_16_HOME_SOC_AND_SECURITY_MONITORING_COPILOT.md` | Not started |
| 29 | PHASE 17A — Digital Twin Core For Home, Shop, Network, Vehicles, Tools, And Projects | `phase-prompts/PHASE_17A_DIGITAL_TWIN_CORE_FOR_HOME_SHOP_NETWORK_VEHICLES_TOOLS_AND_PROJECTS.md` | Not started |
| 30 | PHASE 17B — Inventory, Parts, Tools, Spool, Asset, And Project-To-Reality Pipeline | `phase-prompts/PHASE_17B_INVENTORY_PARTS_TOOLS_SPOOL_ASSET_AND_PROJECT_TO_REALITY_PIPELINE.md` | Not started |
| 31 | PHASE 18 — Automotive Mechanic And Vehicle Diagnostics Assistant | `phase-prompts/PHASE_18_AUTOMOTIVE_MECHANIC_AND_VEHICLE_DIAGNOSTICS_ASSISTANT.md` | Not started |
| 32 | PHASE 19 — Robotics Lab Future Layer | `phase-prompts/PHASE_19_ROBOTICS_LAB_FUTURE_LAYER.md` | Not started |
| 33 | PHASE 20 — UI/UX Integration And Control Center Polish | `phase-prompts/PHASE_20_UI_UX_INTEGRATION_AND_CONTROL_CENTER_POLISH.md` | Not started |
| 34 | PHASE 21 — Packaging, Install, Backup, Restore, And Disaster Recovery | `phase-prompts/PHASE_21_PACKAGING_INSTALL_BACKUP_RESTORE_AND_DISASTER_RECOVERY.md` | Not started |
| 35 | PHASE 22 — Local AI Transition: Make LOCALAI Capable Of Building Itself | `phase-prompts/PHASE_22_LOCAL_AI_TRANSITION_MAKE_LOCALAI_CAPABLE_OF_BUILDING_ITSELF.md` | Not started |
| 36 | PHASE 23 — Final Coverage Audit And Gap Closer | `phase-prompts/PHASE_23_FINAL_COVERAGE_AUDIT_AND_GAP_CLOSER.md` | Not started |

## How to transition to local AI

When the repo reaches Phase 22, use `prompts/LOCAL_AI_CONTINUE_TEMPLATE.md` inside your LOCALAI/Jarvis chat window. Your local AI should read the same ledger/context files and continue the one-phase workflow.
