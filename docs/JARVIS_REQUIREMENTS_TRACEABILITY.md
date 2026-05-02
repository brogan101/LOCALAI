# JARVIS_REQUIREMENTS_TRACEABILITY.md

Purpose: prove that the project keeps every major requirement from the full planning chat. Nothing from the chat may be silently removed. If a requirement is blocked, delayed, or superseded, record the exact reason in `docs/JARVIS_BLOCKERS.md` and `docs/JARVIS_DECISIONS.md`.

## Traceability rule

Every phase must preserve or advance one or more requirements below. Phase 23 must audit this file against the actual implementation and create blockers for every incomplete item.

## Core requirements from the full chat

| Requirement | Status | Owning phases | Notes |
|---|---|---|---|
| Build on existing `brogan101/LOCALAI`, not a blank repo | required | 00+ | extend existing API/UI/schema/routes/tests |
| Preserve existing LOCALAI UI style/format; enhance, do not redesign | required | all UI phases | UI guard mandatory |
| Existing UI may move/add sections when necessary, but style must not be wrecked/recreated | required | all UI phases | build on current control-center layout |
| Gaming-PC safe; no always-on heavy server assumptions | implemented foundation | 01+ | Phase 01 added persisted runtime modes, service policies, Gaming mode model/task relief, Emergency Stop, physical action blocking, and Operations Runtime UI. Later phases must integrate new services into these policies. |
| Local-first/no-cost default | implemented foundation | 02+ | Phase 02 keeps Ollama as default, local providers cost zero, and cloud providers disabled/not_configured unless explicitly configured and approved. |
| Optional API keys across the board, never required | implemented foundation | 02+ | Phase 02 stores optional provider config in encrypted config, redacts keys, blocks secret/credential and private-file/RAG cloud use by default, and keeps local operation working with no keys. |
| Persistent implementation ledger/context to reduce usage | required | 00+ | local AI can read docs later |
| Codex/local-AI handoff so local models can eventually continue | required | 00, 22 | handoff file updated each phase |
| One phase at a time, copy/paste prompts | required | all | no batching |
| Codex must check itself, run program/tests where possible, and prove changes | required | all | acceptance contract |
| Self-updating/self-improving maintainer | implemented foundation | 06 | Phase 06 adds a local-first self-maintainer radar, auditable proposals, approval-gated action proposals, rollback/test requirements, Gaming Mode mutation blocking, and direct-main apply blocking. No real update applies in this phase. |
| Integration update checks: GitHub releases, Docker images, MCP tools, skills, models | implemented foundation | 06, 07, 23 | Phase 06 records watchlist/source-trust status and returns not_configured or blocked for optional/unverified checks. Phase 07A adds the tool registry/firewall foundation for MCP/tool records. Phase 07B adds Docker MCP source/catalog trust metadata and proposal-only config paths. Later integration phases may add richer adapters but must keep proposal/approval gates. |
| Model lifecycle replacement only after eval proof | implemented foundation | 05, 06 | Phase 05 replacement proposals require eval proof, preserve role capability, retain the old model, and set `autoDeletesOldModel: false` / `autoPullsModel: false`. Later phases may add richer eval packs but must not bypass these gates. |
| OpenClaw and NemoClaw used to full potential with safety wrappers | implemented foundation | 07C | Phase 07C adds first-class OpenClaw/NemoClaw/OpenShell gateway records, skill lifecycle/quarantine/review states, status/profile/config/skill/action proposal APIs, Integrations UI visibility, source trust metadata, external-message approval gates, and dry-run/proposal-only install/update behavior. Gateways remain not_configured until intentionally configured and approved. |
| MCP, Docker MCP Gateway, tool firewall | implemented foundation | 07A/B | Phase 07A adds `tool-registry.ts`, `/api/tools`, high-risk disabled default records, explicit scopes, approval checks, audit/replay redaction, and integration command hardening. Phase 07B attaches Docker MCP Gateway as an optional isolation/profile target with status/profile/proposal routes, hidden-by-default profile allowlists, source trust risk scoring, `blockSecrets`/`blockNetwork` defaults, and no real container/tool execution. |
| Open WebUI/Ollama/LiteLLM gateway | implemented foundation | 02, 05 | Phase 02 provider policy keeps Ollama/local gateway default; Phase 05 lifecycle profiles expose Ollama default plus optional local backends including LiteLLM and LM Studio without making them required. |
| Approval queue, permission tiers, rollback, audit logs | implemented foundation | 03+ | Phase 03 added approval requests, permission/physical tier metadata, durable-job linkage, decision audit/thought-log events, shell/self-edit approval gates, Chat approval queuing, and Operations Approval Center. Later automation phases must route new powerful actions through this foundation. |
| Observability, evals, mission replay | required | 04+ | proof and regression checks |
| Voice, screen context, meeting intelligence | required | 11 | push-to-talk/default privacy |
| Browser and desktop automation | required | 09A/B | Playwright first, UIA/vision fallback |
| Chat-driven program modification inside the app | required | 10 | diff/test/proof before apply |
| Business modules: lead gen, support, content, CRM, scheduling | required | 12A | no spam/stealth bots |
| IT support copilot and safe script generator | required | 12B | PowerShell rollback/proof |
| Maker Studio | required | 13A+ | project-to-reality pipeline |
| Master Fabricator / CAD Engineer mode | required | 13A/B/C/D | not just basic CAD helper |
| FreeCAD MCP | required | 13B | Phase 13B status/proposal surface complete; local-first CAD control remains not_configured until explicitly configured and approval-gated |
| Text-to-CAD providers and GitHub repos, including gNucleus/text-to-cad-mcp | required | 13B | Phase 13B disabled/not_configured by default; optional/cloud only after explicit configuration, data classification, and approval |
| CAD-as-code: CadQuery, build123d, OpenSCAD-style scripts | required | 13B | Phase 13B metadata-only proposal path complete; local-first preferred, no Python/OpenSCAD execution until configured and approved |
| KiCad/electronics design adapters and MCP repos | implemented foundation | 13B/D | Phase 13B KiCad status/proposal surface complete; Phase 13D electronics bench setup sheets and KiCad/BOM/InvenTree planning are metadata-only; human review before ERC/DRC/BOM/manufacturing outputs; no KiCad, firmware, serial/USB, relay, or bench equipment execution yet |
| 3D printer/slicer/Spoolman/Obico workflows | implemented foundation | 13C | Phase 13C status/proposal surfaces complete; slicers/printers/Spoolman/Obico/FDM Monster report not_configured/disabled without fake success; slicing is dry-run/config-validation metadata only; queue/start/heater/motor are approval-gated or blocked; no real printer/slicer/monitoring execution |
| CNC/laser/CAM/electronics bench safety | implemented foundation | 13D | Phase 13D status/proposal surfaces complete; FreeCAD Path/CAM, CNCjs, LinuxCNC, FluidNC, bCNC, LightBurn-style laser, KiCad electronics bench, and serial/USB providers report not_configured/disabled without fake success; setup sheets are metadata-only; CAM/toolpath is approval-required; G-code send, machine motion, spindle, laser, firmware, relay/power, serial/USB, and dangerous bench actions are manual-only/blocked; no real machine/electronics execution |
| Home Assistant, robot vacuum, cameras, MQTT, edge nodes | required | 14A/B | edge nodes, not gaming PC server |
| HomeLab/network architect | required | 15A/B | source of truth + validate before apply |
| Home SOC/security monitoring | implemented foundation | 16 | Phase 16 adds read-first Home SOC provider status, local alert/report/remediation metadata, Wazuh/Zeek/Suricata/OPNsense IDS/Pi-hole/AdGuard/LibreNMS/Zabbix/Netdata/Uptime Kuma/osquery not_configured defaults, alert summaries split into confirmed/inferred/unknown/proposed data, blocked packet capture, approval-gated remediation, and no real security/network API execution by default |
| Evidence Vault/manuals/receipts/docs | required | 08B | Paperless/OCR/RAG |
| Professional RAG ingestion/vector foundation | implemented foundation | 08A | Phase 08A preserves existing personal memory/RAG and hnswlib default behavior while adding provider status interfaces, source/hash/citation metadata, incremental re-indexing, stale chunk/source handling, and Workspace RAG inspection UI. Optional parsers/vector stores report not_configured until implemented/configured. |
| Digital twin for home/shop/network/vehicles/tools/projects | implemented foundation | 17A | Phase 17A adds local Digital Twin entity/relationship records, source refs into Evidence Vault/RAG, HomeLab, Home SOC, Maker Studio, Edge/Home systems, vehicles, tools, and projects, provenance-required inferred links, privacy classification, unknown/proposed/not_configured status preservation, and physical-action safety delegation with no real control. |
| Inventory/parts/tools/project-to-reality pipeline | implemented foundation | 17B | Phase 17B adds local inventory items, project-to-reality pipeline records, provider status for InvenTree/Snipe-IT/HomeBox/Spoolman/PartKeepr, proposal-only purchase/reorder/vendor/label/NFC/delete actions, and Digital Twin links without external calls. |
| Master Tech automotive diagnostics, not merely automotive assistant | implemented foundation | 18 | Phase 18 adds local vehicle profiles, symptom/DTC intake, Evidence Vault/RAG refs for manuals/logs/build notes, likely-cause ranking without confirmed-fault claims, test-before-parts plans, repair logs, optional OBD/CAN/ECU provider status, and approval/manual-only vehicle action gates. |
| Foxbody/LQ4/4L80E/ACES/On3/Z28/fuel/project memory | implemented foundation | 18 | Phase 18 preloads/preserves the 1988 Mustang GT hatchback, LQ4, 4L80E, ACES Jackpot ECU, BTR Stage 3 NA cam, FAST 102mm throttle body, JEGS intake, Z28 radiator/fans, On3 central fuel hat / 3-pump system, and Foxbody wiring notes. |
| Future robotics lab | required | 19 | ROS2/MoveIt/Nav2/Gazebo style roadmap |
| Packaging, backup, restore, disaster recovery | implemented foundation | 21 | Phase 21 adds gaming-PC-safe install/package planning, metadata-only local backup manifests, restore validation/dry-run/proposal records, current-state backup prerequisite, approval-gated restore requests, not_configured destructive restore execution, recovery scripts, Operations Recovery UI, and tests proving no system settings, startup tasks, firewall, PATH, external providers, secrets, private contents, or model blobs are touched by default. |
| Expert modes: Master Tech, Master Fabricator, Master Electronics, Network Architect, Home SOC, Project Foreman, Safety Officer, Maintainer, UI Custodian | required | all relevant | see `JARVIS_EXPERT_MODES.md` |
| Full external GitHub/project watchlist retained | required | 00, all integrations, 23 | see `JARVIS_EXTERNAL_PROJECT_WATCHLIST.md` |
| Final coverage audit/gap closer | implemented | 23 | Phase 23 audited all 30+ requirements against this file, the watchlist, expert modes, UI style guard, phase map, and ledger. All requirements are either implemented (foundation or complete) or in active blockers (B-009 executor follow-through). No requirements were silently removed. Small doc gaps fixed: Phase 22 UI note in JARVIS_UI_STYLE_GUARD.md, Phase 22 context index entry, Phase 22 Maintainer expert mode note. New blocker B-012 added for Project Foreman cross-system workflow surface. |

## Final audit rule

Phase 23 must compare implementation against this file and `docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md`, `docs/JARVIS_EXPERT_MODES.md`, `docs/JARVIS_UI_STYLE_GUARD.md`, and the implementation ledger. Missing items become blockers; no silent removal.
