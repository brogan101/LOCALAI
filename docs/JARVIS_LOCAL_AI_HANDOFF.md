# Jarvis Local AI Handoff

This file is the compact handoff for future local AI builders. Keep it short, current, and readable by smaller local models.

## How local AI should continue

1. Read `AGENTS.md`.
2. Read this file.
3. Read `docs/JARVIS_IMPLEMENTATION_LEDGER.md`.
4. Read `docs/JARVIS_CONTEXT_INDEX.md`.
5. Read `docs/JARVIS_PHASE_MAP.md`.
6. Read `docs/JARVIS_BLOCKERS.md`.
7. Read `docs/JARVIS_TEST_MATRIX.md`.
8. Read only the current phase prompt under `phase-prompts/`.
9. Run one phase only.
10. Update the ledger, blockers, phase map, test matrix, context index when relevant, and this handoff.

## Compact project context

```text
Project: LOCALAI evolving into Jarvis Control Center.
Goal: local-first AI operating layer for PC, coding, voice, vision, OpenClaw/NemoClaw, MCP, business workflows, CAD/3D printing, homelab, smart home/shop, vehicles, and future robotics.
Base repo: existing brogan101/LOCALAI, not a blank app.
Backend: Express 5 TypeScript API under artifacts/api-server.
Frontend: React 19/Vite/Tailwind/wouter control center under artifacts/localai-control-center.
Database: SQLite/Drizzle with chat, settings, roles, jobs, audit, plugin/integration, permission, durable job, and artifact tables.
Important constraint: runs on a gaming PC, so heavy services must be manual/on-demand/mode-based and stoppable.
Cost constraint: local AI first; API keys optional only.
Execution style: one phase at a time with tests, audit logs, blockers, and proof.
```

## Current state

- Current phase result: Phase 23 COMPLETE on 2026-05-02 from `C:\Users\broga\Desktop\LOCALAI New\LOCALAI-main\LOCALAI-main`.
- Changed this phase: Docs-only. `docs/JARVIS_UI_STYLE_GUARD.md` (Phase 22 UI note), `docs/JARVIS_REQUIREMENTS_TRACEABILITY.md` (final-audit row → implemented), `docs/JARVIS_EXPERT_MODES.md` (Phase 22 Maintainer note), `docs/JARVIS_CONTEXT_INDEX.md` (Phase 22 + Phase 19 Studios entries), `docs/JARVIS_IMPLEMENTATION_LEDGER.md` (Phase 23 entry), `docs/JARVIS_PHASE_MAP.md` (Phase 23 Complete), `docs/JARVIS_BLOCKERS.md` (Phase 23 note + B-012), `docs/JARVIS_TEST_MATRIX.md` (Phase 23 row), `docs/JARVIS_LOCAL_AI_HANDOFF.md` (this file), `docs/JARVIS_FINAL_PRESTART_REVIEW.md` (Phase 23 note). No code files changed.
- Runtime behavior changed: None. Phase 23 is docs/audit-only.
- Verification: `node scripts/jarvis/verify-build-kit.mjs` passed; `pnpm -r typecheck` passed; `pnpm test` passed (all prior suites unaffected — no new code); `pnpm --filter localai-control-center build` passed.
- Active blockers: B-009 (future service-specific approved durable executor follow-through) and B-012 (Project Foreman cross-system workflow surface) — both deferred, non-blocking.
- Next action: Future phases only. Options: B-012 Project Foreman phase, B-009 executor follow-through phases, additional expert mode enhancements, new external integrations from watchlist.
- Phase 00 verification audit: passed `node scripts/jarvis/verify-build-kit.mjs`, `pnpm run verify:baseline`, `pnpm run verify:jarvis`, `pnpm -r typecheck`, and `pnpm test` on 2026-04-25.

## Phase 23 coverage audit summary

All 30+ requirements in JARVIS_REQUIREMENTS_TRACEABILITY.md are verified against actual implementation:
- **Gaming-PC safe** ✅ Phase 01 (runtime modes, emergency stop)
- **Local-first/no-cost default** ✅ Phase 02 (provider policy, Ollama default)
- **Optional API keys** ✅ Phase 02 (encrypted config, redacted keys)
- **Approval/permission/audit/rollback** ✅ Phase 03+
- **Observability/evals/replay** ✅ Phase 04
- **Model lifecycle** ✅ Phase 05 (eval proof required for replacement)
- **Self-updating maintainer** ✅ Phase 06 (dry-run/approval-gated)
- **MCP/tool firewall** ✅ Phase 07A-C
- **RAG/Evidence Vault** ✅ Phase 08A-B
- **Browser/desktop automation** ✅ Phase 09A-B (hard limits on credentials)
- **Chat-driven code modification** ✅ Phase 10 (approval-gated)
- **Voice/meeting/screen** ✅ Phase 11 (push-to-talk default, no covert recording)
- **Business modules** ✅ Phase 12A-B
- **Maker Studio / CAD / 3D Print / CNC** ✅ Phase 13A-D
- **Edge nodes / HA / MQTT** ✅ Phase 14A-B
- **HomeLab / config pipeline** ✅ Phase 15A-B
- **Home SOC** ✅ Phase 16
- **Digital Twin** ✅ Phase 17A
- **Inventory / project-to-reality** ✅ Phase 17B
- **Automotive / Foxbody / Master Tech** ✅ Phase 18
- **Robotics Lab** ✅ Phase 19
- **UI/UX polish** ✅ Phase 20
- **Packaging/backup/restore/DR** ✅ Phase 21
- **Local AI transition** ✅ Phase 22 (local builder, context packs, hard limits)
- **Project Foreman cross-system workflow** ⚠️ B-012 — building blocks exist, dedicated phase needed
- **Approved durable executor follow-through** ⚠️ B-009 — all adapters proposal-only; executor phases deferred

## Phase 20 handoff summary

Phase 20 is a polish-only phase. No new API routes, database tables, safety systems, or permission gates were added or removed. All changes are frontend-only.

**Grouped sidebar navigation.** `App.tsx` replaces the flat `NAV_ITEMS` array with `NAV_GROUPS`, a 9-element array of `{ label?: string; items: NavItem[] }`. Section labels render as small uppercase muted text above each group. The flattened `NAV_ITEMS` const is kept for active-path matching. All 20 routes are preserved exactly.

**Dashboard status strip (Phase 20 cards).** Three new card components were added to `Dashboard.tsx`:
- `RuntimeModeCard` — query key `["runtime-mode"]`, calls `api.runtime.get()`. Renders the current runtime mode (Lightweight/Coding/Gaming/EmergencyStop) with a color-coded badge. Shows a "Physical actions disabled" warning when `physicalActionsDisabled` is true. `data-testid="runtime-mode-card"`.
- `PendingApprovalsCard` — query key `["approvals-dash"]`, calls `api.approvals.list(50)`, counts `status === "waiting_for_approval"`. Renders "{n} pending" (warn) or "None pending" (success). `data-testid="pending-approvals-card"`.
- `UpdaterStatusCard` — query key `["updater-dash"]`, calls `api.updater.selfMaintainer()`, uses `data?.proposals?.length`. Renders "{n} proposal(s)" (info) or "No proposals" (muted), plus "dry-run" label when `dryRunOnly` is true. `data-testid="updater-status-card"`.

A 3-column grid status strip is inserted above row 1 of the existing Dashboard layout.

**StatusBadges component library.** `src/components/StatusBadges.tsx` exports four components that reuse existing CSS design tokens (`var(--color-*)`) and the existing inline-badge style:
- `StatusPill({ status, small? })` — maps 18+ status strings to color-coded spans. Falls back to muted/elevated for unknown strings (no throw).
- `LocalCloudBadge({ dataLeavesMachine })` — "Local only" (info, Server icon) or "Cloud — data leaves machine" (warn, Cloud icon).
- `PhysicalTierBadge({ tier })` — maps physical tiers via `TIER_MAP`; unknown tiers fall back to muted.
- `UnavailableCard({ title, reason?, hint? })` — renders honest state with AlertTriangle icon, title, StatusPill for reason, and optional hint. Never shows "active", "ready", or "online" for unavailable states.

**Tests.** `tests/ui-integration.test.tsx` provides 24 SSR assertions using `renderToStaticMarkup` and `QueryClient.setQueryData`. No DOM/browser/API server required. The `test:ui-integration` script is registered in `package.json` and appended to the `test` chain.

## Phase 22 handoff summary

Phase 22 makes LOCALAI capable of continuing its own development using local Ollama models via an approval-gated proposal/diff/test-first workflow.

**Source of truth.** `artifacts/api-server/src/lib/local-builder.ts` with lazy SQLite DDL (`local_builder_profiles`, `local_builder_eval_history`). No schema.ts/migrate.ts changes.

**Model roles.** Four roles: `fast_code`, `deep_code`, `reviewer`, `rag_embedding`. All default `not_configured` until Ollama models are configured by the user. Profile persistence via `local_builder_profiles` table. `saveLocalBuilderProfile()` stores role, modelName, status.

**Context packs.** Four compact markdown docs in `docs/context-packs/`:
- `core-architecture.md` — repo layout, key patterns, technology versions, what not to do
- `safety-and-permissions.md` — hard limits, risk tiers, approval flow, route guards, audit
- `current-build-state.md` — pointer to ledger/phase map, phase summary, build commands, how to mark phases complete
- `next-phase-template.md` — proposal format, implementation checklist, docs update order, token budget guidance

**Hard limits (TypeScript literal types — cannot be overridden):**
- `cloudEscalationEnabled: false` — no cloud API calls
- `selfModificationAllowed: false` — own source targeting is hard-blocked
- `requireApprovalForEdits: true` — every build proposal needs tier3_file_modification approval

**Build proposal.** `POST /intelligence/local-builder/build/propose` → creates a `BuildProposal` with an `ApprovalRequest` (returns 202). Hard-blocked if: phaseId/taskSummary contain shell metacharacters `; & | \` $ ( ) { } < > \`, or targetFiles include `artifacts/api-server/src` or `artifacts/localai-control-center/src` paths. Hard-blocked proposals return `success:false` immediately; no approval is created.

**Local evals (usedNetwork=false):**
- `repo_summary` — verifies core/safety/state context packs exist and are non-empty
- `safe_patch_plan` — verifies status has localFirst=true, cloudOff=false, approvalRequired=true
- `unsafe_action_detection` — verifies shell metachar proposals and self-modification proposals are hard-blocked
- `ledger_update` — verifies the ledger file exists and has phase entries

**Routes.** Appended to `routes/intelligence.ts`:
- `GET /intelligence/local-builder/status`
- `GET /intelligence/local-builder/profiles`
- `PUT /intelligence/local-builder/profiles/:role`
- `GET /intelligence/local-builder/context-packs`
- `GET /intelligence/local-builder/context-packs/:name`
- `POST /intelligence/local-builder/build/propose`
- `POST /intelligence/local-builder/eval/run`
- `GET /intelligence/local-builder/eval/history`

**UI.** `Studios.tsx` has a new `"local-builder"` tab value and `LocalBuilderStudio` component with: hard limits banner, model readiness checklist (4 role rows, inline edit, status pills), context pack viewer (metadata list with file sizes), Build Jarvis proposal form (phaseId + taskSummary inputs, hard-block / approval-pending result display), and local evals panel (run button per eval, pass/fail %, live eval history).

Phase 23 is next (final coverage audit and gap closer). Future build-proposal workflow must preserve the 3 hard-limit TypeScript literal types, shell-metachar/self-mod hard blocks, tier3 approval gate, and usedNetwork=false eval contract.

Phase 21 is complete. Future recovery work must reuse `lib/packaging-recovery.ts`, `snapshot-manager.ts`, `routes/system.ts`, `routes/updater.ts`, `routes/rollback.ts`, approval queue, durable jobs, runtime modes, audit/replay, and the Operations Recovery tab. Do not add a parallel backup/restore stack. Preserve Phase 20 honest-state UI contracts: no fake-ready StatusPill states, no active/ready/online UnavailableCard, no raw approval payload data in rendered HTML.

## Phase 19 handoff summary

Phase 19 adds the Robotics Lab future layer as a local simulation/planning/safety surface, not a robot controller. Source of truth is `artifacts/api-server/src/lib/robotics-lab.ts`, backed by lazy SQLite `robotics_robot_profiles`, `robotics_sim_plans`, and `robotics_action_proposals`.

Robot profiles capture name, type, capabilities, safety envelope, joint limits, reach/payload/DOF, optional ROS namespace/frame, and an optional simulated urdf ref. Profiles always have `physicalHardwarePresent: false` as a TypeScript literal type — structurally impossible to claim hardware is present in Phase 19. Profiles never store auth tokens, private endpoints, or firmware credentials in thought log metadata.

Sim plans record a profileId, plan type, joint target/trajectory, environment description, collision context, notes, and `simulationOnly: true` and `hardwareExecutionBlocked: true` as TypeScript literal types. No toolpath generation, kinematics solver, G-code output, or physical arm command is issued.

Robotics action proposals always have `executed: false` as a TypeScript literal type. Action tier classification:
- `execute_motion` and `navigate` → permanently `blocked` via `PHASE_19_BLOCKED_ACTIONS` Set. No approval can unblock them.
- `gripper_open`, `gripper_close`, `arm_move`, `firmware_flash`, `relay_toggle`, `serial_write` → `manual_only` via `MANUAL_ONLY_ACTIONS` Set.
- `plan_motion` → `approval_required`; creates an `ApprovalRequest` in the approval queue.
- `sim_run` → `simulation_only`; proposal only with no execution.
- `read_state` → `not_configured`; no ROS/hardware provider connected.

9 optional providers all default `not_configured`: ros2, moveit2, nav2, gazebo, ignition_gazebo, depth_camera, ros_bridge, foxglove, docker_ros. No ROS 2 node, MoveIt 2 planner, Nav2 navigator, Gazebo instance, Ignition Gazebo instance, depth camera driver, rosbridge server, Foxglove studio, or Docker ROS container is installed, started, connected, or called.

Routes registered under `/api/studios/robotics/*` (8 total): status, providers, profiles list/create/get, sim-plans list/create, actions/propose. UI is the "Robotics Lab" tab on the existing Studios page, with Status/Hardware Block header card, Integration Profiles provider grid, and Hard Limits table using `CapabilityTierBadge` components.

Tests: `robotics-lab.test.ts` passes with 16 assertions. Default tests require no Docker, Python, ROS 2, MoveIt 2, Nav2, Gazebo, Ignition Gazebo, depth cameras, rosbridge, Foxglove, serial/USB devices, network, cloud APIs, or physical hardware.

Phase 20 is next. It may add UI/UX integration and Control Center polish, but must preserve all Phase 19 hard limits: `PHASE_19_BLOCKED_ACTIONS` Set, `MANUAL_ONLY_ACTIONS` Set, all literal types, all `not_configured` provider defaults, and the no-physical-hardware-execution contract.

## Phase 18 handoff summary

Phase 18 adds the Automotive Master Tech foundation as a local diagnostic source-of-truth layer, not a hardware control system. Source of truth is `artifacts/api-server/src/lib/automotive-diagnostics.ts`, backed by lazy SQLite `automotive_vehicle_profiles`, `automotive_diagnostic_cases`, and `automotive_action_proposals`, plus Digital Twin vehicle refs and Evidence Vault/RAG evidence refs.

Vehicle profiles support facts with `confirmed`, `user_provided`, `inferred`, `stale`, `unknown`, and `not_configured` status. Unknown data is never guessed. The preloaded Foxbody profile preserves the 1988 Mustang GT hatchback, LQ4, 4L80E, ACES Jackpot ECU, BTR Stage 3 NA cam, FAST 102mm throttle body, JEGS intake, Z28 radiator/fans, On3 central fuel hat / 3-pump system, and Foxbody wiring notes.

Diagnostic cases support symptom intake, user-provided/sample DTCs, evidence refs, likely cause ranking, explicit assumptions, no confirmed-fault claims, test-before-parts plans, repair-log/final-fix capture, and human verification requirements. Likely causes always keep `confirmedFault: false` until real evidence exists.

Optional providers are python-OBD, pyOBD reference, ELM327, ELM327-emulator, SavvyCAN, OVMS, ACES log import, CAN interface, and external vehicle data. They default to `not_configured` or `disabled`, with no data leaving the machine and no fake connectivity.

Routes are under `/api/context/automotive/*`: source-of-truth, status, providers, vehicles, Foxbody preload, vehicle detail, repair logs, diagnostic cases, and action proposals. UI is `/automotive`, reusing existing Control Center cards, pills, compact forms, query state, and small buttons.

Safety: OBD scan returns `not_configured`; clear-code, CAN capture, actuator test, and bidirectional test require approval; denied approvals do not execute; approved actions still return `not_configured` until a real provider executor exists. ECU write, tune change, and firmware flash are `manual_only`. Audit/replay logs store hashes/counts/status/action flags, not VIN/title/private logs/tokens/secrets.

Tests: `automotive-diagnostics.test.ts` passes with 12 assertions. Default tests require no Docker, Python, network, cloud APIs, OBD/CAN/ECU hardware, vehicle scanner, serial/Bluetooth adapter, SavvyCAN, OVMS, or external automotive provider.

Phase 19 is next. It may add a robotics lab future layer, but must preserve Phase 18's automotive safety gates, Digital Twin links, and no-hardware-execution defaults.

## Phase 17A handoff summary

Phase 17A adds the Digital Twin core as a local relationship/source-of-truth layer, not a new control system. Source of truth is `artifacts/api-server/src/lib/digital-twin.ts`, backed by lazy SQLite `digital_twin_entities` and `digital_twin_relationships` plus schema exports.

Entities can represent home, shop, network, vehicles, tools, printers, cameras, sensors, edge nodes, projects, documents, parts, materials, services, automations, and safety policies. Records store privacy/sensitivity classification, provider status, source refs, stale/deleted status, and sanitized metadata. Sensitive keys such as secrets, tokens, credentials, private/public IP maps, URLs, location, presence, camera frames, and VPN data are redacted before persistence/logging.

Relationships distinguish `confirmed`, `proposed`, `inferred`, `stale`, `deleted`, `blocked`, and `unknown`. Confirmed links require high confidence. AI-created or inferred links require provenance through a source ref, evidence ref, or note. Unknown entity/relationship data must never be guessed as confirmed.

Routes are under `/api/context/digital-twin/*`: source-of-truth, status, entity CRUD/detail/archive, relationship list/create/get/delete-as-deleted, search, and entity action-safety. UI is `/digital-twin`, reusing existing Control Center cards, pills, compact forms, and buttons.

Action safety delegates to existing systems: Maker Studio physical policy, Edge Node action evaluation, Home Autopilot HA/MQTT/device evaluators, and Home SOC remediation references. No Digital Twin path executes real actions; all returned safety evaluations preserve `executed: false` or `not_configured`.

Tests: `digital-twin.test.ts` passes with 11 assertions. Regressions for Home SOC, HomeLab, Maker Studio, Edge Node, Home Autopilot, and Evidence Vault passed; run shared-SQLite suites sequentially if parallel test isolation collides. Default tests require no Docker, Python, network, cloud APIs, device APIs, external services, discovery, scans, pairing, sync, or real control.

Phase 17B is next. It may add inventory/parts/tools/project-to-reality pipeline records, but must reuse the Digital Twin source refs and existing Maker/HomeLab/Evidence sources rather than creating a parallel graph or control path.

## Phase 16 handoff summary

Phase 16 extends the existing Phase 15A/15B HomeLab Architect source of truth rather than creating a separate SOC/SIEM subsystem. Source of truth remains `artifacts/api-server/src/lib/homelab-architect.ts`. It now includes local-only Home SOC provider profiles, `homelab_soc_alerts`, and `homelab_soc_remediation_proposals`.

Optional providers are Wazuh, Zeek, Suricata, OPNsense IDS/IPS, Pi-hole, AdGuard Home, LibreNMS, Zabbix, Netdata, Uptime Kuma, and osquery. All default to `not_configured`, startup policy `disabled`, zero records, and `dataLeavesMachine=false`.

Alert summaries must preserve four buckets: confirmed facts, inferred possibilities, unknowns, and proposed next actions. Missing provider/log/packet/DNS data is marked unknown, never guessed. Report workflows implemented: unknown device, suspicious DNS, WAN outage, noisy IoT, and what-changed.

Remediation safety: read-only review stays read-only; packet capture/sniffing is blocked; dangerous remediation actions such as block device, firewall rule change, VLAN isolation, DNS filter change, kill process, delete file, and disable account require approval. Denied approvals do not execute. Approved remediation still returns `not_configured` until a later provider-specific executor exists. Firewall/DNS/VLAN-style remediation gates can create linked Phase 15B config proposals, but no apply occurs.

Routes are under `/api/homelab/soc/*`: status, providers, alerts list/create/get, reports, remediation list/propose. UI is on `/homelab` in the existing HomeLab page, with a Home SOC panel using existing card/pill/button style.

Tests: `homelab-soc.test.ts` passes with 14 assertions; `homelab-config-pipeline.test.ts` still passes with 16 assertions; `homelab-architect.test.ts` still passes with 42 assertions. Default tests require no Docker, Python, network, cloud APIs, Wazuh, Zeek, Suricata, DNS filters, monitoring tools, packet capture tools, firewall/router/security APIs, or external services.

Phase 17A has now completed. Future phases must preserve its local Digital Twin source refs and must not add real device/network/security execution through the graph.

## Phase 15B handoff summary

Phase 15B extends the Phase 15A HomeLab Architect source of truth rather than creating a parallel config system. Source of truth remains `artifacts/api-server/src/lib/homelab-architect.ts`. It now includes lazy SQLite `homelab_config_proposals` records for generated config proposals.

Config proposals support VLAN/IP/DNS/DHCP/firewall plans, Proxmox VM/LXC/service layouts, Docker Compose stacks, backup/monitoring plans, Ansible/OpenTofu/Terraform drafts, and OPNsense/UniFi/NetBox/Nautobot provider drafts. Each record tracks source inventory/blueprint references, target provider/type, draft metadata, expected changes, redacted diff summary, validation status/kind/notes, approval status/ID, backup plan, rollback plan, apply status, provider status, not_configured reason, dry-run flag, executed flag, and API-call flag.

Apply safety: `requestHomelabConfigApply()` blocks before validation, blocks without backup/rollback metadata, creates approval requests for mutable config paths, refuses denied approvals, and still returns `not_configured` after approval while the provider is missing. No real NetBox/Nautobot/Proxmox/OPNsense/UniFi/Ansible/OpenTofu/Docker Compose/Batfish API call is made. No config is applied.

Validation distinguishes:
- `static` local metadata checks
- `simulated` local simulated checks
- `unavailable_provider` explicit not_configured provider checks
- `real_provider` explicit not_configured/degraded provider checks by default

Routes are under `/api/homelab/config/*`: providers, proposals list/create/get, validate, apply, rollback. UI is on `/homelab` in the existing HomeLab page, with a Config Proposal Pipeline panel using existing card/pill/button style.

Tests: `homelab-config-pipeline.test.ts` passes with 16 assertions; `homelab-architect.test.ts` still passes with 42 assertions. Default tests require no Docker, Python, network, cloud APIs, or optional infrastructure providers.

Phase 16 is next. It may add Home SOC/security monitoring, but must preserve HomeLab no-apply defaults and must not add real infrastructure config execution without configured providers, matching approval payload, validation proof, backup/rollback proof, and a later executor phase.

## Phase 15A handoff summary

Phase 15A added the HomeLab Architect source-of-truth layer as a self-contained module. Source of truth is `artifacts/api-server/src/lib/homelab-architect.ts`, backed by five lazily-created SQLite tables: `homelab_sites`, `homelab_devices`, `homelab_vlans`, `homelab_subnets`, and `homelab_services`. Same lazy DDL pattern as `edge-node.ts` and `home-autopilot.ts`.

The critical design constraint: `HomelabBlueprint.applied` is a TypeScript literal type `false`. There is no code path that returns `applied: true`. This is structurally impossible, not just a runtime check. Phase 15A is a source-of-truth and planning layer only.

All 8 optional providers (NetBox, Nautobot, Proxmox, OPNsense, UniFi, Ansible, OpenTofu, Batfish) are hardcoded `not_configured` with reasons. No cloud network tool is required. No real provider is called.

Validation:
- `validateVlanId(n)` — integer, 1–4094 inclusive; rejects floats, negatives, 0, 4095+
- `validateSubnetPrefix(s)` — IPv4 CIDR format `a.b.c.d/n`; each octet 0–255, prefix 0–32

Privacy: `upsertDevice` thought log never includes `managementIpRef`, `serialNumber`, or credentials. `upsertSubnet` thought log never includes the prefix or gateway address.

Routes registered at `/homelab/*` (18 total): source-of-truth, status, blueprint, providers, providers/netbox, providers/nautobot, sites CRUD, devices CRUD, vlans CRUD (422 on invalid), subnets CRUD (422 on invalid), services CRUD, validate/vlan, validate/subnet.

UI: `pages/HomeLab.tsx` at `/homelab` (Network icon, lazy-loaded). Shows: inventory summary counts, optional providers with status, blueprint notes/confidence, and confidence-badged lists of sites, devices, VLANs, subnets, services.

Phase 15B is next; it may add network diagram data, topology views, and a config-push approval safety pipeline, but must preserve `applied: false` literally, all provider `not_configured` defaults, and all existing Phase 14A/14B hard limits.

## Phase 14B handoff summary

Phase 14B added the Home Autopilot integration layer on top of the existing Phase 14A edge-node foundation, not as a separate smart-home controller. Source of truth is `artifacts/api-server/src/lib/home-autopilot.ts`, backed by three lazily-created SQLite tables: `ha_profiles`, `mqtt_profiles`, and `home_device_profiles`, plus existing `approval_requests` and `audit_events`. Same lazy DDL pattern as Phase 14A `edge-node.ts`.

Hard limits enforced in the source of truth lib and never overridable by profile, config, or approval:
- `camera_frame_capture`, `camera_recording_start/stop/change`, `camera_snapshot`, `stream_access`, `stream_record` permanently **blocked** via `BLOCKED_HOME_ACTIONS` Set.
- `compressor_start/stop`, `shop_main_power`, `electrical_main_breaker` permanently **manual_only** via `MANUAL_ONLY_HOME_ACTIONS` Set.
- Garage door open/close/toggle, lock/unlock, heater on/off, relay toggle/on/off, alarm arm/disarm/trigger, vacuum clean/start/dock/pause, WLED scene change, smart plug on/off are **approval_required** via `APPROVAL_REQUIRED_HOME_ACTIONS` Set.
- All three eval functions return `HomeActionEvalResult` with `executed: false` TypeScript literal type — structurally impossible to return `true`.
- Thought log metadata explicitly excludes `endpoint`, `authToken`, `token`, `credentials`, `brokerUrl`, `cameraFrame`, `privateIp` fields.

Entity allowlist enforcement: unknown HA entities (not in profile's `entities` array) are blocked regardless of requested action. MQTT topic allowlist: unknown topics are blocked for publish; `#` multi-level and `/+/` single-level wildcards are supported.

The required endpoints are under `/api/home-autopilot/*` for source of truth, status, HA profile get/save, HA entity action evaluation, MQTT profile get/save, MQTT topic evaluation, device listing/registration/get, and device action evaluation. No Home Assistant REST API, MQTT broker, robot vacuum, Frigate NVR, or shop device API is called. Missing/unconfigured providers return `not_configured` without faking success.

The Remote page now has a Home & Shop Autopilot section with status card (HA/MQTT/vacuum/camera/shop configured badges) and devices list with type/provider/configured badges. Phase 15A is next; it may add homelab network inventory foundations, but must preserve all Phase 14A/14B physical-action safety tiers, hard limits, and default no-execution behavior.

## Phase 14A handoff summary

Phase 14A added the Edge Node Architecture and Home/Shop Autopilot Foundation on top of the existing source of truth, not as a separate node controller. Source of truth is `artifacts/api-server/src/lib/edge-node.ts`, backed by a lazily-created SQLite `edge_nodes` table plus existing `approval_requests` and `audit_events`. Node capabilities are typed with a six-tier risk system: `read_only | dry_run | proposal | approval_required | blocked | manual_only`.

Hard limits enforced in the source of truth lib and never overridable by profile or approval:
- Gaming PC `alwaysOn` is always `false` — enforced in `rowToProfile()`, `upsertEdgeNode()`, and `checkEdgeNodeHealth()` (gaming PC health check skips probe and returns `unknown`).
- Camera frame capture is permanently `blocked` — enforced in `BLOCKED_CAPABILITIES` Set applied in both capability setup and `evaluateEdgeAction()`.
- Shop relay/power control is permanently `manual_only` — same enforcement pattern.
- All `evaluateEdgeAction()` calls return `executed: false` — TypeScript literal type enforces this.
- Thought log metadata explicitly excludes `endpoint` and `authToken` fields.

The required endpoints are under `/api/edge-nodes/*` for source of truth, gaming PC role description, node listing/registration/update/delete, health check probes, and capability action evaluation. No services are installed to remote nodes. No home/shop/device API calls occur. Missing/unconfigured nodes and nodes with empty endpoints report `not_configured`. The existing remote route file and Remote UI page were extended; no new route files or pages were created.

The Remote page now has an Edge Nodes section with Gaming PC Role card, Registered Nodes list with expandable capability badges and health-check buttons, and a Register Node form with gaming PC warning banner. Phase 14B added Home Assistant/MQTT/device integration on top of this foundation. Phase 15A is next; it may add homelab network inventory, but must preserve all Phase 14A/14B physical-action safety tiers, hard limits, and default no-execution behavior.

## Phase 13D handoff summary

Phase 13D added the CNC/Laser/CAM/Electronics Bench Safety Console on top of the existing Maker Studio source of truth, not as a separate machine controller. Source of truth remains `artifacts/api-server/src/lib/maker-studio.ts`, backed by SQLite `maker_projects`, `maker_materials`, and `maker_cad_artifacts`, plus existing `approval_requests` and `audit_events`.

The required endpoints are under `/api/studios/maker/machine/*` for provider status/action proposals, machine setup sheets, and project machine workflow proposals. FreeCAD Path/CAM, CNCjs, LinuxCNC, FluidNC, bCNC, LightBurn-style laser workflows, KiCad electronics bench, and serial/USB shop devices are optional and currently not_configured/disabled. Setup sheets are metadata-only proposal records. CAM/toolpath actions are approval-required proposals. G-code send, machine motion, spindle, laser, firmware, relay/power, serial/USB, and dangerous bench actions are manual-only or blocked. Phase 13D never generates live toolpaths, sends G-code, moves axes, starts spindles, fires lasers, flashes firmware, toggles relays, writes serial/USB, calls machine APIs, or controls hardware.

The Studios Maker tab now has a CNC/Laser/Bench Safety panel with provider status, setup-sheet preview, and explicit manual-only gates. Audit metadata stores IDs/status/provider/action flags instead of serial IDs, tokens, private project files, proprietary designs, or secrets. Phase 14A is next; it may add edge-node/home-shop control foundations, but must preserve these physical-action safety tiers and default no-execution behavior.

## Phase 13A handoff summary

Phase 13A added Maker Studio as a foundation/control layer, not a machine executor. Source of truth is `artifacts/api-server/src/lib/maker-studio.ts` backed by SQLite `maker_projects`, `maker_materials`, and `maker_cad_artifacts`, plus existing `approval_requests` and `audit_events`.

The required endpoints are under `/api/studios/maker/*` for status, safety policies, integrations, projects, materials, CAD artifact metadata, and action proposals. FreeCAD, CadQuery/build123d, KiCad, slicers, OctoPrint, Moonraker/Mainsail/Fluidd, Obico, Spoolman, CNCjs/LinuxCNC/FluidNC, and InvenTree are optional and currently not_configured/disabled. Phase 13A never slices, prints, sends G-code, starts CNC/laser, flashes firmware, controls electronics/hardware, installs tools, starts services, or contacts external providers.

The Studios page now has a Maker tab with safety policy badges, project creation/listing, integration status, and proposal buttons. Physical actions are proposal-only, approval-required, or manual-only at machine. Audit metadata stores IDs/status/tier/counts instead of private project contents or secrets. Phase 13B is next; it may add FreeCAD/CAD-as-code/KiCad adapters, but must preserve this safety model and default no-execution behavior.

## Phase 12A handoff summary

Phase 12A added business module foundation without creating a second workflow platform. Source of truth is SQLite `business_drafts` plus existing `plugin_state` adapter profiles, with approval/durable/audit/replay behavior reused from prior phases. The required endpoints are available under `/api/business/*` for status, modules, adapters, adapter profile saves, adapter sync proposals, draft creation/listing, and draft send proposals.

Business adapters are safe defaults: Chatwoot, Twenty CRM, Cal.com/Cal.diy, Postiz, email, and SMS report disabled/not_configured unless explicitly profiled, and Phase 12A still never performs real sends, syncs, bookings, posts, CRM writes, installs, or service starts. Lead-generation external outreach drafts create Tier 4 approvals. Stealth bots, spam blasting, anti-bot evasion, and unapproved external sends are hard-blocked. Audit/mission replay metadata uses IDs, hashes, lengths, and statuses rather than private customer/lead/message contents.

The Business page at `/business` reuses the existing Control Center shell/card/button style. The Integrations page now has a business category for the reference adapters. Phase 12B is the next phase; do not start Phase 13 or later.

## Phase 00 handoff summary

Phase 00 grounded the Jarvis build kit in the actual repo. The existing project already has a TypeScript/Express backend, React/Vite control center, route registry, SQLite/Drizzle schema, model orchestration and role assignments, OpenAI-compatible routes, RAG/web/pinboard, STT/TTS, Studio, integration/plugin, updater/repair, observability/task, rollback/audit, WorldGUI/Windows automation, and API/UI tests. Root scripts now include `verify:baseline` and `verify:jarvis`, both intended to run locally without Ollama, Docker, Python, network, or GPU. Do not claim the app is live-ready yet: prior audit found local socket bind failures for API and Vite, broken child PowerShell, browser automation Node mismatch, dependency audit timeout, and degraded NVIDIA NVML telemetry. Phase 00.5 must repair or explicitly mitigate those blockers before feature expansion.

Phase 00 verification audit added `phase-prompts/PHASE_00_REPO_BASELINE_AND_CONTEXT_SYSTEM.md` as a compatibility alias for the canonical Phase 00 prompt. Future local models may see either name; use `phase-prompts/PHASE_00_AGENT_MEMORY_REPO_TRUTH_AUDIT_AND_BUILD_BASELINE.md` as canonical and do not create duplicate memory files.

Phase 00.5 added `phase-prompts/PHASE_00_5_REPAIR_CURRENT_RUNTIME_BLOCKERS.md` as a compatibility alias for `phase-prompts/PHASE_00_5_REPAIR_CURRENT_RUNTIME_BLOCKERS_BEFORE_FEATURE_EXPANSION.md`. Continue the canonical Phase 00.5 prompt until live API and UI startup pass.

## Phase 00.5 handoff summary

Static Phase 00.5 hardening landed: health now exposes runtime diagnostics, browser-tooling Node mismatch is visible, STT/tray sidecars degrade without blocking core boot, tray prefers `pwsh.exe` before `powershell.exe`, NVIDIA identity falls back to `pnputil` when NVML fails, root `clean` is a bounded Node script, and `LAUNCH_OS.ps1` uses `127.0.0.1` for Ollama checks. Corrected-root retest from `C:\Users\broga\Desktop\LOCALAI-main\LOCALAI-main` passed required static checks: `node scripts/jarvis/verify-build-kit.mjs`, `pnpm -r typecheck`, and `pnpm test`.

Phase 00.5 is complete because live startup was manually verified from the actual Windows host/browser context:

- `http://127.0.0.1:3001/api/health` was reachable from the Windows/browser context.
- `http://127.0.0.1:5173` was reachable from the Windows/browser context.
- The API server stayed running.
- The UI dev server stayed running.
- The previous Windows socket/provider failure is no longer reproduced in the actual host context.

Keep this caveat visible for future agents: Codex shell URL probing remained limited even after manual host verification:

- `netstat -aon -p tcp` -> no listener found for `:3001` or `:5173` from this environment.
- Node `http.get("http://127.0.0.1:3001/api/health")` -> `connect UNKNOWN 127.0.0.1:3001`.
- Node `http.get("http://127.0.0.1:5173")` -> `connect UNKNOWN 127.0.0.1:5173`.
- `curl.exe` probes for both URLs -> `failed to open socket: The requested service provider could not be loaded or initialized.`
- Earlier duplicate-start attempt before the user clarified live servers were already running still exited 1 with API `listen UNKNOWN`; do not use duplicate starts as proof if the API/UI are externally managed.

Phase 00.5 remains complete. Do not reopen Phase 00.5 unless host/browser verification regresses.

## Deferred blocker repair handoff

The 2026-04-29 blocker repair pass cleared the old deferred blockers before moving on:

- PowerShell: `pwsh` returns `7.6.0`; Windows PowerShell returns `5.1.26100.8115`.
- Browser runtime: API still runs under Node `v20.20.2`, but runtime diagnostics now detect the bundled Codex Node fallback at `v24.14.0` and report browser tooling as compatible only when that executable exists and satisfies `>=22.22.0`.
- Audit: `pnpm audit --prod` passes after upgrading API `diff` to `8.0.3`.
- NVIDIA: `nvidia-smi` returns live RTX 5070 driver/VRAM telemetry again; keep pnputil/safe-mode fallback for future regressions.
- Desktop automation: `/worldgui/type` and `/worldgui/keys` now queue approval with Tier 4/P4 metadata, return 202, and expose only input length/hash metadata. They do not execute text/keys until a later approved durable executor exists.
- Local URL hints: LOCALAI-owned docs/integration/repair/studio/web/WorldGUI hints now prefer `127.0.0.1`; `localhost` remains only in explicit loopback allowlists/parser logic and historical docs.

B-009 remains intentionally open because real tool/integration/gateway execution needs a later service-specific durable executor phase. Do not fake that by making proposal-only adapters execute.

## Phase 01 handoff summary

Phase 01 added `artifacts/api-server/src/lib/runtime-mode.ts` and `artifacts/api-server/src/routes/runtime-mode.ts`, registered through the existing `/api` route registry. Current runtime mode persists in existing `app_settings`; service policy records persist in the new `service_policies` SQLite table. The required endpoints are available: `GET /api/runtime-mode`, `POST /api/runtime-mode/set`, `GET /api/service-policies`, `POST /api/service-policies/:id/update`, and `POST /api/emergency-stop`.

Gaming mode unloads safe running Ollama models through the existing model orchestrator when Ollama is reachable, skips cleanly when Ollama is unavailable, pauses heavy queued async jobs, and disables background model warmups. Emergency Stop sets mode `EmergencyStop`, disables physical action execution, unloads safe running models, cancels queued jobs, and writes audit/thought-log evidence. It does not kill arbitrary user processes. Service policy stop commands are metadata only until later phases add explicit safe service adapters.

The Operations page now has a Runtime tab using the existing card/button/tab style. It exposes the current runtime mode, mode selector, Emergency Stop confirmation, policy startup controls, resource class impact, approval markers, and recent runtime action evidence.

Phase 01 tests passed:

- `pnpm --filter api-server run test:runtime-mode`
- `pnpm -r typecheck`
- `node scripts/jarvis/verify-build-kit.mjs`
- `pnpm test`
- `pnpm --filter localai-control-center build`
- `pnpm --filter localai-control-center build`

The next agent is cleared for Phase 02. Do not start Phase 03 or later.

## Phase 02 handoff summary

Phase 02 added `artifacts/api-server/src/lib/provider-policy.ts` and `artifacts/api-server/src/routes/provider-policy.ts`, registered through the existing `/api` route registry. Provider settings persist through the existing encrypted config system in `secure-config.ts`; raw API keys are never returned by policy snapshots and are redacted from audit/thought-log metadata.

The required policy behavior is implemented:

- Ollama remains the default provider.
- The LOCALAI OpenAI-compatible local gateway remains a local provider.
- Optional local backends (`llama.cpp`, `vLLM`, `SGLang`, `LiteLLM`) show not_configured unless configured.
- Optional cloud/API providers are disabled or not_configured unless explicitly enabled and keyed.
- Data classifications include public, normal, private, sensitive, secret, credential, and private-file/RAG.
- Secret and credential data are blocked for cloud providers.
- Private-file/RAG data is blocked for cloud providers by default.
- Cloud use requires configured provider state, first-use approval, and per-use approval.
- Provider test endpoints are no-network policy checks in this phase.
- Usage now separates local and cloud tokens/cost estimates; local calls remain cost zero.

Settings gained a Local-First Provider Policy section using the existing card/row/toggle/input/button style. No chat, embeddings, RAG, STT, TTS, or OpenAI-compatible local route was changed to call cloud providers.

Phase 02 tests passed:

- `pnpm --filter api-server run test:provider-policy`
- `pnpm -r typecheck`
- `node scripts/jarvis/verify-build-kit.mjs`
- `pnpm test`

The next agent is cleared for Phase 03. Do not start Phase 04 or later.

## Phase 03 handoff summary

Phase 03 added `artifacts/api-server/src/lib/approval-queue.ts` and `artifacts/api-server/src/routes/approvals.ts`, registered through the existing `/api` route registry. Approval state persists in `approval_requests`; every approval request links to a durable job in `durable_jobs` and records decision/progress evidence in `audit_events`, `job_events`, and the thought log.

Digital tiers are represented as `tier0_read_only`, `tier1_draft_only`, `tier2_safe_local_execute`, `tier3_file_modification`, `tier4_external_communication`, and `tier5_manual_only_prohibited`. Physical tiers are represented as `p0_sensor_read`, `p1_suggest`, `p2_prepare_queue`, `p3_low_risk_automation`, `p4_approval_required`, and `p5_manual_only_at_machine`.

Durable jobs now include checkpoint JSON, retry count, result JSON, error, startedAt, and finishedAt. Running durable jobs are requeued during API restart hydration; waiting approvals remain waiting; expired waiting approvals are cancelled.

The required approval endpoints are available:

- `GET /api/approvals`
- `POST /api/approvals`
- `POST /api/approvals/:approvalId/approve`
- `POST /api/approvals/:approvalId/deny`
- `POST /api/approvals/:approvalId/cancel`

The required durable job controls are available:

- `GET /api/tasks/durable/jobs`
- `GET /api/tasks/durable/jobs/:jobId`
- `POST /api/tasks/durable/jobs/:jobId/pause`
- `POST /api/tasks/durable/jobs/:jobId/resume`
- `POST /api/tasks/durable/jobs/:jobId/cancel`

`/api/system/exec/run` now returns `202 approvalRequired` for unapproved commands and does not execute them. Dangerous commands become Tier 5 denied approvals. `/api/system/sovereign/edit` now creates a Tier 3 approval with diff and rollback metadata before applying an edit. Chat action cards queue approvals for proposed commands and edits. Operations now has an Approvals tab using the existing card/button/tab style.

Phase 03 tests passed:

- `pnpm --filter api-server run test:approval-queue`
- `pnpm --filter api-server run test:foundation`
- `pnpm --filter api-server run test:permission-routes`
- `pnpm -r typecheck`
- `node scripts/jarvis/verify-build-kit.mjs`
- `pnpm test`

The next agent is cleared for Phase 04. Do not start Phase 05 or later.

## Phase 04 handoff summary

Phase 04 added `artifacts/api-server/src/lib/mission-replay.ts` and extended the existing `artifacts/api-server/src/routes/observability.ts`. The trace/replay source of truth is a projection over recorded SQLite rows: `audit_events` as the primary timeline plus linked `approval_requests`, `durable_jobs`, `async_jobs`, `job_events`, `thought_log`, and legacy rollback `audit_log`. Do not add a duplicate telemetry store in later phases unless a later prompt explicitly supersedes this decision.

The required replay/eval endpoints are available:

- `GET /api/observability/mission-replay?traceId=&limit=`
- `GET /api/mission-replay/:traceId`
- `GET /api/observability/evals`
- `POST /api/observability/evals/run`

Replay events distinguish `recorded`, `missing`, `blocked`, and `redacted` data. Mission replay shows actual recorded rows only. Missing linked data is marked missing; it is not guessed. Raw API keys, tokens, cookies, raw prompt payloads, private-file content-style payloads, and sensitive fields are redacted with hashes. Chat/model calls record provider/model/routing metadata and prompt hashes, not raw prompt text.

The local eval harness is exposed as `pnpm run eval:jarvis` and currently covers local chat/model routing default, approval denial, job failure, tool blocking, mission replay event integrity, and secret redaction. It is local-only and uses no cloud API keys, paid APIs, or live third-party services.

Operations now has a Mission Replay tab using the existing Operations card/button/tab style. It can load replay events by trace/approval/job/session/target and run local evals from the UI.

Phase 04 tests passed:

- `pnpm --filter api-server run test:mission-replay`
- `pnpm run eval:jarvis`
- `pnpm -r typecheck`
- `node scripts/jarvis/verify-build-kit.mjs`
- `pnpm test`
- `pnpm run verify:jarvis`
- `pnpm --filter localai-control-center build`

The next agent is cleared for Phase 05. Do not start Phase 06 or later.

## Phase 05 handoff summary

Phase 05 added `artifacts/api-server/src/lib/model-lifecycle.ts` and extended the existing `artifacts/api-server/src/routes/models.ts`. The current model-routing source of truth remains SQLite `role_assignments` via `modelRolesService`; installed and running model facts remain Ollama gateway tags/process data from `model-orchestrator.ts`; OpenAI-compatible local routes still use `sendGatewayChat` from the same orchestrator.

The required lifecycle endpoints are available:

- `GET /api/models/lifecycle`
- `GET /api/models/lifecycle/routing-source`
- `POST /api/models/lifecycle/actions/propose`
- `POST /api/models/lifecycle/replacements/propose`

Model lifecycle rules now expose capabilities, backend, local/cloud status, installed/running state, runtime-mode compatibility, eval scores where benchmark rows exist, and replacement safety fields. Replacement proposals require eval proof, must preserve required role capability, keep the old model, and set `autoDeletesOldModel: false` and `autoPullsModel: false`.

Model pull/load/unload/delete endpoints now create approval-required lifecycle proposals when no approved matching approval id is supplied. A future executor may pass `approvalId`, but it must match the payload hash from `buildModelActionPayload` and verify through `verifyModelActionApproval` before mutation.

Provider policy now includes LM Studio as an optional local profile (`lm-studio`) with default base URL `http://127.0.0.1:1234/v1`; it is disabled/not_configured unless the user intentionally configures it. Cloud/API providers remain optional only and are not startup/test requirements.

The Models page now has a Lifecycle tab using the existing card/button/tab style. It shows local-first route status, runtime mode, telemetry, backend profiles, model roles/capabilities, and proposal buttons for unload/delete. Proposal buttons queue approval/proposal states; they do not execute model mutation directly.

Phase 05 targeted tests passed:

- `pnpm --filter api-server run test:model-lifecycle`
- `pnpm --filter api-server typecheck`
- `pnpm --filter localai-control-center typecheck`
- `node scripts/jarvis/verify-build-kit.mjs`
- `pnpm -r typecheck`
- `pnpm test`
- `pnpm --filter localai-control-center build`
- `pnpm run verify:jarvis`

The next agent is cleared for Phase 06. Do not start Phase 07 or later.

## Phase 06 handoff summary

Phase 06 added `artifacts/api-server/src/lib/self-maintainer.ts` and extended the existing updater, updates, repair, system repair, chat command, API client, and Operations UI surfaces. The self-maintainer source of truth is not a new updater service; it coordinates existing updater/repair routes, `docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md`, package manifests/`pnpm-lock.yaml`, Phase 05 `model-lifecycle.ts`, approval queue, durable jobs, audit/thought log, runtime mode, mission replay redaction, and rollback requirements.

The required maintainer endpoints are available:

- `GET /api/updater/self-maintainer`
- `POST /api/updater/self-maintainer/radar`
- `POST /api/updater/self-maintainer/proposals`
- `POST /api/updater/self-maintainer/actions/propose`

The legacy mutation routes now propose instead of applying:

- `/api/updater/update` creates an approval-gated update proposal and launches nothing.
- `/api/system/updates/run` creates an approval-gated system update proposal and runs no winget/pip command.
- `/api/repair/run` and `/api/system/setup/repair` create repair proposals and run no installer, config write, shell repair, or remote install script.
- Chat commands `check updates`, `prepare patch`, `run tests`, `rollback proposal`, and `explain update` create dry-run/proposal or approval-required results. Chat `/install` and `/stop` now reuse Phase 05 model lifecycle proposals instead of directly pulling or unloading models.

The maintainer proposal model records source, source trust/allowlist status, current and candidate state, risk, affected files/services, required tests, rollback plan, approval requirement, branch requirement, direct-main apply blocking, dry-run/local-only state, and result status. Unknown or unverified sources are blocked or not_configured. Optional GitHub/API/cloud checks are disabled/not_configured by default. Package/dependency proposals read metadata and lockfile hashes only; tests prove `pnpm-lock.yaml` is unchanged.

The Operations page now has a Maintainer tab using the existing Operations cards/buttons/tabs. It can refresh the maintainer snapshot, run dry-run radar, create self-improvement proposals, and display update proposal status, tests, rollback, approval, and source trust.

Phase 06 targeted tests passed:

- `pnpm --filter api-server run test:self-maintainer`
- `pnpm --filter api-server run test:route-guards`
- `pnpm --filter api-server run test:permission-routes`
- `pnpm --filter api-server run test:model-lifecycle`
- `pnpm --filter api-server run test:mission-replay`
- `pnpm --filter api-server typecheck`
- `pnpm --filter localai-control-center typecheck`
- `node scripts/jarvis/verify-build-kit.mjs`
- `pnpm -r typecheck`
- `pnpm test`
- `pnpm --filter localai-control-center build`
- `pnpm run verify:jarvis`

The next agent is cleared for Phase 07A. Do not start Phase 07B or later.

## Phase 07A handoff summary

Phase 07A added `artifacts/api-server/src/lib/tool-registry.ts` as the single tool registry/firewall source of truth for this foundation layer. It projects existing `plugins/*.json` manifests, the existing integrations catalog, `tool:*` plugin_state overrides, runtime modes, permission policies, approval_requests, audit_events, and mission replay redaction into one fail-closed policy model.

The required tool endpoints are available:

- `GET /api/tools?skipLiveChecks=true|false`
- `GET /api/tools/:id`
- `PUT /api/tools/:id/enabled`
- `POST /api/tools/:id/dry-run`
- `POST /api/tools/:id/execute`

The tool firewall behavior is foundation-only:

- unregistered tools return `not_configured`
- unknown/unconfigured registered tools return `not_configured`
- high-risk planned tools default disabled/not_configured
- missing permission scopes are blocked
- runtime modes can block tools
- approval-required calls queue approvals and do not execute
- denied approvals remain denied and do not execute
- secrets/tokens/private payload-like values are redacted before audit/replay
- no MCP server, Docker MCP Gateway, OpenClaw, NemoClaw, browser agent, desktop agent, physical action tool, or third-party integration was installed, started, or executed

Existing integration install/start/update routes now reuse the firewall and return proposal/not_configured/approval decisions with `executed: false`. Future Phase 07B/07C work must reuse `tool-registry.ts`, approval queue, durable jobs, runtime mode, permission policies, audit/thought log, mission replay redaction, and existing plugin/integration routes. Do not create another plugin system or tool registry.

Phase 07A targeted tests passed:

- `pnpm --filter api-server run test:tool-registry`
- `pnpm --filter api-server run test:route-guards`
- `pnpm -r typecheck`
- `node scripts/jarvis/verify-build-kit.mjs`
- `pnpm test`
- `pnpm --filter localai-control-center build`
- `pnpm run verify:jarvis`

## Phase 07B handoff summary

Phase 07B added `artifacts/api-server/src/lib/docker-mcp-gateway.ts` as the Docker MCP Gateway profile/status/proposal helper attached to the existing Phase 07A `tool-registry.ts` firewall. It did not create a parallel MCP registry or executor. Docker-backed MCP tools remain registry records that must pass profile allowlist checks, runtime mode checks, explicit permission scopes, sandbox/isolation checks, approval queue verification, audit/thought logging, and mission replay redaction.

The Docker MCP Gateway endpoints are available under the existing tools route group:

- `GET /api/tools/docker-mcp/status?live=false|true`
- `GET /api/tools/docker-mcp/profile`
- `PUT /api/tools/docker-mcp/profile`
- `POST /api/tools/docker-mcp/config/propose`
- `POST /api/tools/docker-mcp/run/propose`

Phase 07B safety defaults:

- Docker unavailable reports `not_configured` or degraded and does not break startup.
- Docker MCP tools are hidden unless included in an approved profile/tool allowlist.
- `blockSecrets` defaults to true.
- `blockNetwork` defaults to true unless a tool explicitly needs network and a proposal/profile permits it.
- Proposed config exposes no environment variables, requests no broad filesystem mounts, and includes resource limits.
- Docker-built catalog sources still require explicit permissions; community/custom sources default higher risk and disabled; unknown sources are blocked.
- No Docker image was pulled, no container was started, and no MCP server/tool was installed or executed.

Phase 07B targeted tests passed:

- `pnpm --filter api-server run test:docker-mcp`
- `pnpm --filter api-server run test:tool-registry`
- `pnpm --filter api-server run test:route-guards`
- `pnpm --filter api-server typecheck`
- `pnpm --filter localai-control-center typecheck`

## Phase 07C handoff summary

Phase 07C added `artifacts/api-server/src/lib/claw-gateway.ts` as the OpenClaw/NemoClaw gateway profile/status/proposal helper attached to the existing Phase 07A `tool-registry.ts` firewall and Phase 07B isolation concepts. It did not create a parallel gateway registry, skill registry, approval system, or executor. OpenClaw/NemoClaw tools remain registry records that must pass source trust checks, skill lifecycle checks, profile allowlists, runtime mode checks, explicit permission scopes, sandbox/isolation checks, approval queue verification, audit/thought logging, and mission replay redaction.

The OpenClaw/NemoClaw endpoints are available under the existing tools route group:

- `GET /api/tools/claw-gateway/status`
- `GET /api/tools/claw-gateway/profile`
- `PUT /api/tools/claw-gateway/profile`
- `POST /api/tools/claw-gateway/config/propose`
- `POST /api/tools/claw-gateway/skills/discover`
- `POST /api/tools/claw-gateway/skills/review`
- `POST /api/tools/claw-gateway/action/propose`

Phase 07C safety defaults:

- Missing OpenClaw/NemoClaw reports `not_configured` and does not break startup.
- Unknown gateway/skill sources are blocked until verified and allowlisted.
- Community/custom sources default higher risk and disabled/not_configured until explicitly approved.
- OpenClaw skills default quarantined/proposal-only until reviewed.
- Quarantined and rejected skills cannot execute.
- External messages require explicit `external_messages` permission and approval.
- Skill install/update behavior is dry-run/proposal only.
- Secrets, tokens, credentials, cookies, env vars, wallets, and private files are not logged or exposed by default.
- No OpenClaw/NemoClaw repo was cloned, no service was installed or started, no skill was installed, and no gateway action executed.

Phase 07C targeted tests passed:

- `pnpm --filter api-server run test:claw-gateway`
- `pnpm --filter api-server run test:tool-registry`
- `pnpm --filter api-server run test:docker-mcp`
- `pnpm --filter api-server run test:route-guards`
- `pnpm --filter api-server typecheck`
- `pnpm --filter localai-control-center typecheck`

The next agent is cleared for Phase 08A. Do not start Phase 08B or later.

## Phase 08A handoff summary

Phase 08A extended the existing `artifacts/api-server/src/lib/rag.ts` RAG source of truth rather than adding a duplicate RAG engine. The default path remains built-in parsing, Ollama/model-orchestrator embeddings, local hnswlib vectors, SQLite metadata, and hnswlib index files under `~/LocalAI-Tools/rag`.

The RAG endpoints now include:

- `GET /api/rag/status`
- `GET /api/rag/collections/:id/sources`
- `GET /api/rag/collections/:id/chunks`
- `POST /api/rag/reindex`
- `POST /api/rag/collections/:id/sources/:sourceId/delete`

Source metadata now records source id/name/path, source hash, parser used, chunk count, provider status, citation metadata, updatedAt, and deletedAt. Chunk metadata records source id, citation metadata, provider status, stale/deleted state, and stored local embeddings for rebuilds. Unchanged files are skipped by hash; changed sources are re-indexed; stale chunks/sources are marked deleted and excluded. Missing page/section metadata is stored as `unavailable`, not guessed.

Optional providers are status-only in this phase: MarkItDown, Docling, OCR, LanceDB, and Qdrant return `not_configured`. They must not receive local files or claim success until a later configured/approved workflow implements real adapters.

Workspace now has a RAG tab using existing Workspace cards/tabs/buttons. It shows provider status, collection status, re-index controls, source status, and a chunk inspector. It does not replace the app shell.

Phase 08A targeted tests passed:

- `pnpm --filter api-server run test:rag`
- `pnpm --filter api-server typecheck`
- `pnpm --filter localai-control-center typecheck`
- `node scripts/jarvis/verify-build-kit.mjs`
- `pnpm -r typecheck`
- `pnpm test`
- `pnpm --filter localai-control-center build`
- `pnpm run verify:jarvis`

The next agent is cleared for Phase 08B. Do not start Phase 09A or later.

## Phase 08B handoff summary

Phase 08B added `artifacts/api-server/src/lib/evidence-vault.ts` as the Evidence Vault source of truth and `artifacts/api-server/src/routes/evidence.ts` as the route layer, registered through the existing `/api` route registry. Evidence records persist in SQLite `evidence_records` (lazy DDL); Paperless-ngx configuration persists in SQLite `paperless_config` (lazy DDL, single row, default disabled).

The 13 supported evidence categories are: `manual`, `receipt`, `warranty`, `vehicle`, `home`, `shop`, `network`, `tool`, `3d_printer`, `software`, `tax`, `project`, `other`.

The 5 privacy classifications are: `public`, `normal`, `private`, `sensitive`, `secret`.

Evidence ingestion reuses `rag.ingest()` from Phase 08A, writing into collections named `evidence-<category>`. Secret-classified records throw before calling `rag.ingest()`. Evidence search delegates to `rag.search()` across the relevant collections; results include `ragPath: "local_hnswlib"`.

The required evidence endpoints are available:

- `GET /api/evidence/status`
- `GET /api/evidence/records`
- `POST /api/evidence/records` (returns 201)
- `GET /api/evidence/records/:id`
- `PATCH /api/evidence/records/:id`
- `POST /api/evidence/records/:id/ingest`
- `POST /api/evidence/records/:id/delete`
- `GET /api/evidence/paperless/status`
- `POST /api/evidence/paperless/sync`
- `POST /api/evidence/search`
- `GET /api/evidence/reminders`
- `GET /api/evidence/categories`

Phase 08B safety defaults:

- Paperless-ngx missing/unconfigured reports `not_configured`; `proposePaperlessSync()` returns `proposalStatus: "not_configured"` without calling any external API.
- Secret-classified records are rejected from RAG ingestion with a clear error before `rag.ingest()` is called.
- Audit/thought-log events contain only `{ id, category, privacy, hasHash }` — no titles, vendor names, VINs, or document contents.
- Reminder proposals carry `calendarIntegrationStatus: "not_configured"` and never schedule or send calendar/email events.
- No cloud APIs, paid services, Docker containers, or external network calls are used.

Phase 08B tests passed:

- `pnpm --filter api-server run test:evidence` — 87 assertions
- `node scripts/jarvis/verify-build-kit.mjs`
- `pnpm -r typecheck`
- `pnpm test` (full suite; all prior phase tests unaffected)
- `pnpm --filter localai-control-center build` (emitted `EvidenceVault-BBoedN05.js`)

The next agent is cleared for Phase 09A. Do not start Phase 09B or later.

## Phase 09A handoff summary

Phase 09A added a browser automation safety layer using the docker-mcp-gateway.ts pattern. Playwright MCP is optional and always returns `not_configured` by default — no browser is launched, no Playwright MCP is installed, and no page is navigated until a future phase configures and approves a browser session.

Key safety defaults that must never change:
- `credentialEntryAllowed`, `antiBoEvasionAllowed`, `cookieStorageAllowed` are permanently `false` in the TypeScript type and cannot be patched via profile or approval.
- `evaluateBrowserFirewall()` hard-blocks credential entry, anti-bot evasion, and cookie capture tiers regardless of action input.
- Financial domains (paypal, stripe, bank, etc.) are in the default blocked-domain list.
- Screenshot/URL data is passed through `redactForMissionReplay()` before audit or mission replay.
- All browser actions go through the Phase 07A `evaluateToolCall()` chain — runtime mode checks, Docker MCP check, Claw Gateway check, browser firewall check, permission check, sandbox check, approval check.

All 13 endpoints implemented:
- `GET /api/tools/browser-automation/status` — Playwright MCP install probe (always `not_configured` without Playwright)
- `GET /api/tools/browser-automation/profile` — browser session profile
- `PUT /api/tools/browser-automation/profile` — update profile (persists to `plugin_state`)
- `POST /api/tools/browser-automation/navigate/propose` — dry-run navigate proposal
- `POST /api/tools/browser-automation/action/propose` — dry-run action proposal through tool firewall
- Plus 5 Phase 09A `ToolRecord` entries in `buildToolRegistry()` (navigate, screenshot, form-fill, form-submit, download) visible in `GET /api/tools`

Tests passed (32 assertions):
- `pnpm --filter api-server run test:playwright-browser`
- `pnpm -r typecheck`
- `pnpm test` (full suite; all prior phase tests unaffected)
- `pnpm --filter localai-control-center build` (emitted `Integrations-CEmVIEKA.js`)

The next agent is cleared for Phase 09B. Do not start Phase 10 or later.

## Phase 09B handoff summary

Phase 09B added a desktop automation safety layer using the playwright-browser.ts pattern. WorldGUI is optional and always returns `not_configured` by default — no window is focused, no input is sent, and no real desktop action is taken until a future phase configures and approves a desktop automation profile.

Key safety defaults that must never change:
- `credentialEntryAllowed`, `keyloggerAllowed`, `screenshotSensitiveAllowed` are permanently `false` in the TypeScript type and cannot be patched via profile or approval.
- `evaluateDesktopFirewall()` hard-blocks credential entry, keylogging, and sensitive-window screenshot capture tiers regardless of action input.
- Banking, password manager, security, antivirus, and system-admin apps are in the default blocked-app list (keepass, bitwarden, 1password, bank, paypal, defender, regedit, task manager, etc.).
- Window title and target-app data are passed through `redactForMissionReplay()` before audit or mission replay.
- All desktop actions go through the Phase 07A `evaluateToolCall()` chain — runtime mode checks, Docker MCP check, Claw Gateway check, Browser check, Desktop firewall check, permission check, sandbox check, approval check.

All endpoints implemented:
- `GET /api/tools/desktop-automation/status` — WorldGUI install probe (always `not_configured` without WorldGUI)
- `GET /api/tools/desktop-automation/profile` — desktop automation profile
- `PUT /api/tools/desktop-automation/profile` — update profile (persists to `plugin_state`)
- `POST /api/tools/desktop-automation/action/propose` — dry-run action proposal through tool firewall
- Plus 7 Phase 09B `ToolRecord` entries in `buildToolRegistry()` (screenshot, list-windows, focus, click, type, keys, macro) visible in `GET /api/tools`

Tests passed (39 assertions):
- `pnpm --filter api-server run test:desktop-automation`
- `pnpm -r typecheck`
- `pnpm test` (full suite; all prior phase tests unaffected)
- `pnpm --filter localai-control-center build` (emitted `Integrations-xMpY-DL4.js`)

The next agent is cleared for Phase 10. Do not start Phase 11 or later.

## Phase 11 handoff summary

Phase 11 added `artifacts/api-server/src/lib/voice-meeting.ts` as the Voice/Screen/Meeting source of truth and `artifacts/api-server/src/routes/voice.ts` as the route layer, registered through the existing `/api` route registry. Capture policy and screen context profile persist in SQLite `plugin_state`; meeting sessions persist in SQLite `meeting_sessions`; follow-up drafts persist in `follow_up_drafts` (both created by lazy DDL in `migrate.ts`).

Key safety defaults that are permanently hard-coded and must never be weakened:
- `captureMode` defaults to `"disabled"` — nothing records until the user explicitly enables a capture mode.
- `alwaysOnCaptureEnabled: false` — always reset in `saveCapturePolicy()` regardless of input; cannot be set by any profile patch or approval.
- `cloudSttEnabled: false` and `cloudTtsEnabled: false` — always reset; local faster-whisper sidecar and Piper are the only STT/TTS paths.
- `screenpipeEnabled: false` and `screenpipeStatus: "not_configured"` — always reset; no always-on screen capture occurs.
- `meetingFollowUpApprovalRequired: true` — always reset; `proposeFollowUpSend()` always returns `{ approvalRequired: true, approvalId }` and no auto-send path exists.
- Capture indicator is always visible when any capture mode other than `"disabled"` is active.
- Raw audio and full transcripts are never stored server-side; meeting sessions store only word count, summary, decisions, and action items.
- Follow-up drafts store only subject and a 200-char PII-scrubbed body preview; the full body is never persisted.
- Wake word detection returns `wakeWordStatus: "not_configured"` because no wake word engine is installed.
- STT sidecar and Piper fail soft with `not_configured` / 503 when unavailable.

The required voice/meeting endpoints are available:
- `GET /api/voice/policy`, `PUT /api/voice/policy`
- `GET /api/voice/status`
- `GET /api/voice/source-of-truth`
- `GET /api/voice/meeting/sessions`, `POST /api/voice/meeting/start`
- `GET /api/voice/meeting/:id`, `POST /api/voice/meeting/:id/stop`
- `POST /api/voice/meeting/:id/followup/draft`
- `POST /api/voice/meeting/:id/followup/:draftId/propose-send` (always 202+approvalRequired)
- `POST /api/voice/meeting/:id/followup/:draftId/deny`
- `GET /api/screen-context/status`, `PUT /api/screen-context/profile`

Phase 11 tests passed (50 assertions):
- `pnpm --filter api-server run test:voice-meeting`
- `node scripts/jarvis/verify-build-kit.mjs`
- `pnpm -r typecheck`
- `pnpm test` (full suite; all prior phase tests unaffected)
- `pnpm --filter localai-control-center build` (emitted `Voice-Bm1r7m1W.js`)

The next agent is cleared for Phase 12A. Do not start Phase 12B or later.

## Phase 12B handoff summary

Phase 12B added `artifacts/api-server/src/lib/it-support.ts` as the IT support/script-generation source of truth and `artifacts/api-server/src/routes/it-support.ts` as the route layer, registered through the existing `/api` route registry. IT support artifacts persist in SQLite `it_support_artifacts`; approval proposals reuse `approval_requests`, durable jobs, audit events, thought log, mission replay redaction, and the shared command sanitizer.

Key safety defaults that must never be weakened:
- Generated scripts default to review/proposal/dry-run mode. They do not execute during creation, validation, or approval request creation.
- Every generated script safety contract includes purpose, admin requirement, reads, changes, risks, backup/restore plan, logging path, dry-run/WhatIf behavior, exit codes, and proof steps.
- Real script execution is disabled in Phase 12B. Even with a valid approved payload, `proposeItSupportScriptExecution()` returns `not_configured` and `executed: false`.
- Denied, missing, invalid, mismatched, dangerous, or manual-only IT actions do not execute.
- Windows Event Log, AD/GPO, Fortinet/FortiAnalyzer, Ivanti, Exchange/Microsoft 365, and Approved Script Executor integrations report `not_configured` or `disabled` without fake success.
- Shared `command-sanitizer.ts` now blocks destructive IT admin patterns including AD user removal/disable, GPO modification/removal, Exchange/M365 removals, firewall changes, MSI uninstall, and package/module/feature uninstalls.
- Request text is summarized and redacted; audit records store hashes/status/validation metadata, not raw tickets, local file contents, credentials, tokens, or secrets.

The required IT support endpoints are available:
- `GET /api/it-support/status`
- `GET /api/it-support/workflows`
- `GET /api/it-support/integrations`
- `GET /api/it-support/artifacts`
- `GET /api/it-support/artifacts/:id`
- `POST /api/it-support/artifacts`
- `POST /api/it-support/scripts/:id/validate`
- `POST /api/it-support/scripts/:id/execute` (approval-gated proposal; execution remains not_configured)

Phase 12B tests passed (11 assertions):
- `pnpm --filter api-server run test:it-support`
- `node scripts/jarvis/verify-build-kit.mjs`
- `pnpm -r typecheck`
- `pnpm test` (full suite; all prior phase tests unaffected)
- `pnpm --filter localai-control-center build` (emitted `ITSupport-DWQvoBfh.js`)

The next agent is cleared for Phase 13A. Do not start Phase 13B or later.

## Phase 13B handoff summary

Phase 13B extends the existing Maker Studio source of truth in `artifacts/api-server/src/lib/maker-studio.ts`; it does not add a duplicate CAD or electronics system. The CAD provider registry covers FreeCAD MCP, CadQuery, build123d, OpenSCAD-style scripts, gNucleus Text-to-CAD MCP, BuildCAD AI, and KiCad MCP/CLI. Provider status and proposal actions are exposed through existing Studios routes under `/api/studios/maker/cad/*`; design proposals are stored as metadata-only records in existing SQLite `maker_cad_artifacts`.

Key safety defaults that must never be weakened:
- FreeCAD MCP, CadQuery, build123d, OpenSCAD-style, and KiCad providers default to `not_configured`, `proposalOnly: true`, `executionEnabled: false`, and `dataLeavesMachine: false`.
- gNucleus Text-to-CAD MCP and BuildCAD AI are optional cloud/API providers and default to disabled/not_configured. They must not receive local design text/files/metadata without later explicit configuration, data classification, data-leaves-machine warning, and approval.
- Generated CAD/KiCad design proposals are review/dry-run metadata only. No Python macro, FreeCAD command, KiCad command, CAD-as-code runtime, OpenSCAD render/export, cloud call, slicer, printer, CNC, laser, firmware, G-code, manufacturing, or hardware action executes in Phase 13B.
- Proposal metadata must keep target file names, Maker workspace-relative paths, assumptions, units, dimensions, constraints, material assumptions, bounding box metadata, preview/export intent, risk notes, validation steps, and explicit `physicallySafeClaimed=false` / `manufacturableClaimed=false`.
- Private project contents, proprietary design notes, customer data, credentials, API keys, and secrets must not be logged into audit/mission replay. Current audit events store IDs, counts, provider status, action flags, and execution flags only.

The required Maker CAD endpoints are available:
- `GET /api/studios/maker/cad/providers`
- `POST /api/studios/maker/cad/providers/:providerId/action`
- `POST /api/studios/maker/projects/:projectId/design-proposals`
- Existing Phase 13A Maker routes remain active for status, safety policies, integrations, projects, materials, CAD artifacts, and physical action proposals.

Phase 13B tests passed:
- `pnpm --filter api-server run test:maker-cad` (7 assertions)
- `pnpm --filter api-server run test:maker-studio` (9 assertions)
- `node scripts/jarvis/verify-build-kit.mjs`
- `pnpm -r typecheck`
- `pnpm test`
- `pnpm --filter localai-control-center build`

The next agent is cleared for Phase 13C. Do not start Phase 13D or later.

## Phase 13C handoff summary

Phase 13C extends the existing Maker Studio source of truth in `artifacts/api-server/src/lib/maker-studio.ts`; it does not add a duplicate printer, slicer, material inventory, monitoring, or physical execution system. The print provider registry covers OrcaSlicer, PrusaSlicer/SuperSlicer, OctoPrint, Moonraker/Klipper, Mainsail/Fluidd, FDM Monster, Spoolman, and Obico. Provider status and proposal actions are exposed through existing Studios routes under `/api/studios/maker/print/*`; slicing proposals are stored as metadata-only records in existing SQLite `maker_cad_artifacts`.

Key safety defaults that must never be weakened:
- Slicer providers default to `not_configured`, dry-run/config-validation only, with no slicer process, no G-code generation, no file upload, and no data leaving the machine.
- Printer providers default to `not_configured` or `disabled`; queue/start/heater/motor actions require approval or block, and denied approvals do not execute.
- Starting a print must always require explicit approval. Approved proposals still return `not_configured` until a later service-specific executor exists.
- Spoolman is optional/not_configured; missing or unknown material can block queue proposals instead of pretending inventory is available.
- Obico monitoring is optional/not_configured/degraded and must never fake active monitoring.
- Printer API tokens, serials, private URLs, project files, customer designs, and secrets must not be logged into audit/mission replay. Current audit events store IDs, status, provider/action flags, and execution flags only.

The required Maker print endpoints are available:
- `GET /api/studios/maker/print/providers`
- `POST /api/studios/maker/print/providers/:providerId/action`
- `POST /api/studios/maker/projects/:projectId/slicing/proposals`
- `POST /api/studios/maker/projects/:projectId/print/propose`
- Existing Phase 13A/13B Maker routes remain active for status, safety policies, integrations, projects, materials, CAD artifacts, CAD providers, and design proposals.

Phase 13C tests passed:
- `pnpm --filter api-server run test:maker-print` (8 assertions)
- `pnpm --filter api-server run test:maker-studio` (9 assertions)
- `pnpm --filter api-server run test:maker-cad` (7 assertions)
- `node scripts/jarvis/verify-build-kit.mjs`
- `pnpm -r typecheck`
- `pnpm test`
- `pnpm --filter localai-control-center build`

The next agent is cleared for Phase 13D. Do not start Phase 14A or later.

## Phase 17B handoff summary

Phase 17B adds `artifacts/api-server/src/lib/inventory-pipeline.ts` as the inventory/asset/project-to-reality source of truth. It stores local SQLite `inventory_items`, `project_reality_pipelines`, and `inventory_action_proposals`, links items and pipelines to Phase 17A Digital Twin source refs, reuses Maker Studio project/material concepts where relevant, and keeps Evidence Vault/RAG as linkable evidence rather than creating a duplicate project or document system. Routes are exposed through the existing context router under `/api/context/inventory/*`; the Control Center adds `/inventory` using existing card/pill/button layout patterns.

Key safety defaults that must never be weakened:
- InvenTree, Snipe-IT, HomeBox, Spoolman, and PartKeepr are optional and report `not_configured`; no sync, install, external API call, or fake success occurs by default.
- Availability, quantity, and suitability distinguish `confirmed`, `proposed`, `inferred`, `stale`, `missing`, and `unknown`. Unknown inventory is not guessed as available or suitable.
- Purchase, reorder, vendor quote, label print, NFC write, and deletion actions are proposal-only/approval-required and always return `executed:false`.
- Denied approvals do not execute. Approved external provider proposals still return `not_configured` until a later service-specific executor is intentionally implemented.
- QR/NFC label plans generate local payload metadata only; no label printer, scanner, or NFC writer is called.
- Audit/replay records store IDs, counts, status, provider, action, and execution flags only. They must not contain vendor tokens, purchase secrets, private inventory contents, customer/project data, addresses, or private files.

The required inventory endpoints are available:
- `GET /api/context/inventory/source-of-truth`
- `GET /api/context/inventory/status`
- `GET /api/context/inventory/providers`
- `GET /api/context/inventory/items`
- `POST /api/context/inventory/items`
- `GET /api/context/inventory/items/:id`
- `POST /api/context/inventory/items/:id/label-plan`
- `POST /api/context/inventory/items/:id/delete`
- `POST /api/context/inventory/availability`
- `GET /api/context/inventory/pipelines`
- `POST /api/context/inventory/pipelines`
- `GET /api/context/inventory/pipelines/:id`
- `POST /api/context/inventory/actions/propose`
- `POST /api/context/inventory/reorder-suggestions`

Phase 17B tests passed:
- `pnpm --dir artifacts/api-server run test:inventory` (11 assertions)
- `pnpm --dir artifacts/api-server run typecheck`
- `pnpm --dir artifacts/localai-control-center run typecheck`
- `node scripts/jarvis/verify-build-kit.mjs`
- `pnpm -r typecheck`
- `pnpm test`
- `pnpm --filter localai-control-center build`

The next agent is cleared for Phase 18. Do not start Phase 19 or later.

## Current minimal prompt for local AI

Use `prompts/RUN_NEXT_PHASE_TEMPLATE.md` with:

```text
PHASE_ID_HERE: PHASE 23
PHASE_NAME_HERE: Final Coverage Audit And Gap Closer
PHASE_FILE_HERE: phase-prompts/PHASE_23_FINAL_COVERAGE_AUDIT_AND_GAP_CLOSER.md
```

Or use this direct prompt:

```text
Run only PHASE 23 — Final Coverage Audit And Gap Closer.
First verify Phase 22 is COMPLETE in docs/JARVIS_IMPLEMENTATION_LEDGER.md and docs/JARVIS_PHASE_MAP.md.
Then implement: audit all requirements, close any gaps, verify all routes/pages/buttons are wired or honestly disabled, confirm no fake statuses, add any missing tests.
Hard limits: no cloud required; no self-modification without approval; no token-heavy context in prompts.
Use context packs in docs/context-packs/ for compact context rather than pasting codebase.
```
