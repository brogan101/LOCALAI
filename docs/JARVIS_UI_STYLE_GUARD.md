# JARVIS_UI_STYLE_GUARD.md

Purpose: protect the existing LOCALAI control-center look and workflow while adding Jarvis features.

## Prime rule

Do not redesign, reskin, replace, or recreate the existing LOCALAI UI shell.

Build on the current visual system and navigation instead of starting over.

## Required UI behavior

For every user-facing change:

- inspect the existing React/Vite UI first
- reuse existing layout, cards, buttons, badges, spacing, icons, loading states, empty states, and error states where possible
- add new navigation only when needed
- keep new pages visually consistent with existing pages
- avoid broad theme rewrites
- avoid decorative-only buttons
- avoid fake-ready states
- preserve existing user flows unless the phase explicitly says to change them
- document which existing UI pattern was extended

## Allowed

- add status cards
- add settings sections
- add action cards
- add approval cards
- add logs/audit panels
- add focused pages for new modules
- reorganize only when needed for clarity and with ledger justification

## Not allowed

- replacing the app shell
- switching design systems
- rewriting the theme from scratch
- removing working pages/routes
- creating dead UI controls
- hiding safety state
- making cloud/API actions look identical to local-only actions

## Proof required

Every UI phase must include in the final response:

- existing UI files inspected
- new/changed UI files
- existing UI pattern reused
- if UI was changed and the app can run, perform a screenshot/manual route check; otherwise record the exact blocker
- if UI was changed and the app can run, check accessibility/state behavior; otherwise record the exact blocker
- proof that no dead controls or fake success states were added

## UI movement rule

It is allowed to add pages, move related controls into clearer groups, add navigation entries, and create new cards for new modules. It is not allowed to redesign, reskin, replace, or recreate the existing LOCALAI control-center shell.

Every UI phase must record:

- existing LOCALAI pattern reused
- new surface added
- why it was necessary
- screenshot/manual route to verify if the app can run
- proof there are no dead buttons or fake-ready states

## Visual consistency checks

Before closing a UI phase, check for:

- consistent cards/panels
- existing spacing/token style reused
- existing button and badge style reused
- no unrelated theme rewrite
- no mass component replacement
- no broad CSS reset unless specifically approved

## Phase 02 UI note

2026-04-25: Phase 02 added a Local-First Provider Policy section inside the existing Settings page. It reused the existing `Card`, `SectionHeader`, `SettingRow`, `TextInput`, `Toggle`, and small action-button style. No app shell, theme, navigation model, or design system was replaced.

## Phase 03 UI note

2026-04-25: Phase 03 added an Approvals tab inside the existing Operations page and updated Chat action cards to queue approval-required command/edit actions. It reused the existing Operations `Card`, `CardHeader`, `Btn`, tab strip, status text, and compact audit/job list styling. No app shell, theme, navigation model, or design system was replaced.

## Phase 04 UI note

2026-04-26: Phase 04 added a Mission Replay tab inside the existing Operations page. It reused the existing Operations `Card`, `CardHeader`, `Btn`, tab strip, compact status chips, query loading states, and scrollable event-list styling. No app shell, theme, navigation model, or design system was replaced. The tab has live controls for replay refresh, trace filtering, and local eval execution; no dead controls or fake-ready states were added.

## Phase 05 UI note

2026-04-26: Phase 05 added a Lifecycle tab inside the existing Models page. It reused the existing Models page tab strip, elevated/surface cards, compact buttons, status text, query loading states, and model-row spacing. No app shell, theme, navigation model, or design system was replaced. The tab exposes real lifecycle snapshot/proposal APIs and marks approval/proposal results; unload/delete controls create proposals and do not pretend model actions already executed.

## Phase 06 UI note

2026-04-26: Phase 06 added a Maintainer tab inside the existing Operations page and updated update/repair wording in Operations, Dashboard, and Diagnostics so controls show proposal/approval state instead of fake execution success. It reused the existing Operations `Card`, `CardHeader`, `Btn`, tab strip, compact status rows, query loading states, approval status wording, and elevated proposal rows. No app shell, theme, navigation model, or design system was replaced. The tab uses live self-maintainer APIs for radar refresh and proposal creation; no dead controls or fake-ready update states were added.

## Phase 07A UI note

2026-04-26: Phase 07A added a Tool Registry tab inside the existing Integrations page. It reused the existing Integrations tab strip, surface/elevated cards, compact badges, icon buttons, query loading/error states, PermissionNotice warnings, and small action-button style. No app shell, theme, navigation model, or design system was replaced. The tab calls live `/api/tools` APIs for registry refresh, explicit enable/disable, dry-run, and approval/proposal requests; controls report blocked/not_configured/approval states and do not claim a tool executed.

## Phase 07B UI note

2026-04-29: Phase 07B added a Docker MCP Gateway card inside the existing Integrations Tool Registry tab. It reused the same surface/elevated card, compact badge, small button, icon, query loading, and message styles already used by the Tool Registry panel. No app shell, theme, navigation model, or design system was replaced. The card calls live `/api/tools/docker-mcp/*` APIs for status/profile/config proposal; controls report dry-run/not_configured/proposal state and do not claim Docker containers or MCP tools executed.

## Phase 07C UI note

2026-04-29: Phase 07C added an OpenClaw/NemoClaw Gateway card inside the existing Integrations Tool Registry tab. It reused the same surface/elevated card, compact badge, small button, icon, query loading, and message styles already used by the Tool Registry panel and Docker MCP card. No app shell, theme, navigation model, or design system was replaced. The card calls live `/api/tools/claw-gateway/*` APIs for dry-run status and config proposals; controls report not_configured/proposal state and do not claim OpenClaw/NemoClaw services, skills, external messages, or gateway actions executed.

## Phase 08A UI note

2026-04-29: Phase 08A added a RAG tab inside the existing Workspace page. It reused the existing Workspace tab strip, surface cards, compact icon buttons, form inputs, select controls, query loading states, muted status text, and chunk/file preview styling. No app shell, theme, navigation model, or design system was replaced. The tab calls live `/api/rag/*` APIs for provider status, collection/source listing, re-indexing, source stale deletion, and chunk inspection; optional providers show `not_configured`, and controls report skipped/reindexed/stale states without claiming unavailable parsers or vector stores executed.

## Phase 13B UI note

2026-04-30: Phase 13B added a CAD Engineer panel inside the existing Studios Maker tab. It reused the Maker tab's `Card`, `CardHeader`, compact inputs/selects, status pills, small buttons, query/mutation state handling, and elevated preview box styling. No app shell, theme, navigation model, or design system was replaced. The panel calls live `/api/studios/maker/cad/*` and design-proposal APIs; controls report proposal/not_configured/manual-only states and do not claim FreeCAD, CAD-as-code, KiCad, cloud text-to-CAD, render/export, or manufacturing execution.

## Phase 13C UI note

2026-04-30: Phase 13C added a 3D Print Workflow panel inside the existing Studios Maker tab. It reused the Maker tab's `Card`, `CardHeader`, compact inputs, status pills, small buttons, query/mutation state handling, and elevated preview box styling. No app shell, theme, navigation model, or design system was replaced. The panel calls live `/api/studios/maker/print/*`, slicing proposal, and print workflow APIs; controls report proposal/dry-run/not_configured/approval-required/blocked states and do not claim slicer execution, G-code generation, printer API calls, queue/start, heater/motor commands, Spoolman inventory success, or Obico monitoring.

## Phase 13D UI note

2026-04-30: Phase 13D added a CNC/Laser/Bench Safety panel inside the existing Studios Maker tab. It reused the Maker tab's `Card`, `CardHeader`, compact inputs/selects, status pills, small buttons, query/mutation state handling, and elevated setup-sheet preview styling. No app shell, theme, navigation model, or design system was replaced. The panel calls live `/api/studios/maker/machine/*`, setup-sheet, and machine workflow APIs; controls report proposal/not_configured/approval-required/manual-only states and do not claim CAM execution, live toolpath generation, G-code send, machine motion, spindle/laser fire, firmware flashing, relay/power control, serial/USB writes, machine API calls, or electronics bench execution.

## Phase 16 UI note

2026-04-30: Phase 16 added a Home SOC panel inside the existing HomeLab page. It reused the HomeLab page's `Card`, `CardHeader`, `KVRow`, `Pill`, compact inputs/selects, small buttons, query/mutation state handling, provider rows, and elevated summary boxes. No app shell, theme, navigation model, or design system was replaced. The panel calls live `/api/homelab/soc/*` APIs for status, provider status, alert creation, local reports, and remediation gates; controls report not_configured/read-only/proposal/approval-required/blocked states and do not claim Wazuh/Zeek/Suricata/DNS/monitoring provider sync, packet capture, firewall/DNS/DHCP/VLAN changes, device quarantine, or security remediation execution.

## Phase 17A UI note

2026-04-30: Phase 17A added a Digital Twin page at `/digital-twin`. It reused the existing Control Center shell, lazy route pattern, surface/elevated cards, compact forms, status pills, small buttons, query/mutation state handling, list rows, and muted helper text. No app shell, theme, navigation model, or design system was replaced. The page calls live `/api/context/digital-twin/*` APIs for graph status, entity CRUD/detail/archive, relationship creation/deletion-as-deleted, search, and action-safety evaluation; controls report unknown/proposed/not_configured/stale/deleted/blocked states and do not claim device discovery, sync, pairing, cloud provider calls, vehicle API access, physical control, or automation execution.

## Phase 18 UI note

2026-05-01: Phase 18 added an Automotive page at `/automotive`. It reused the existing Control Center shell, lazy route pattern, `Card`, `CardHeader`, `Pill`, compact form fields, small action buttons, query/mutation state handling, provider rows, elevated diagnostic-plan boxes, and muted status text. No app shell, theme, navigation model, or design system was replaced. The page calls live `/api/context/automotive/*` APIs for status, provider status, Foxbody preload, vehicle/case lists, diagnostic test-plan creation, repair logs, and action proposals; controls report not_configured, approval_required, denied, and manual_only states and do not claim OBD/CAN/ECU/scanner/hardware/cloud/external provider execution.

## Phase 21 UI note

2026-05-01: Phase 21 added a Recovery tab inside the existing Operations page. It reused the existing Operations `Card`, `CardHeader`, `Btn`, tab strip, compact status rows, query/mutation state handling, elevated list rows, and muted warning text. No app shell, theme, navigation model, or design system was replaced. The tab calls live `/api/system/recovery/*` APIs for provider status, gaming-PC-safe install planning, dry-run backup manifests, manifest creation, restore validation, restore dry-run, and restore proposal requests; controls report dry_run, approval_required, blocked, and not_configured states and do not claim startup/service/firewall/PATH changes, destructive restore execution, or external backup provider success.

## Phase 22 UI note

2026-05-01: Phase 22 added a Local Builder tab (Code2 icon) inside the existing Studios page. It reused the existing Studios tab strip, elevated surface/outlined cards, compact inputs, status pills, small buttons, query/mutation state handling, and compact information-row styling. No app shell, theme, navigation model, or design system was replaced. The tab calls live `/intelligence/local-builder/*` APIs for status, model role profiles (inline edit per role with save/cancel), context pack metadata viewer, build proposal form (phaseId + taskSummary inputs, hard-block / approval-pending result display), and local evals panel (run button per eval, pass/fail display, live eval history); controls report not_configured, hard_blocked, and approval_pending states and do not claim Ollama models are configured, build proposals are executed, or evals have run before the user triggers them. Hard limits banner always visible at top of the tab.
