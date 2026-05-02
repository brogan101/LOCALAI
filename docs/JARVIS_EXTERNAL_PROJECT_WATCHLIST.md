# JARVIS_EXTERNAL_PROJECT_WATCHLIST.md

Purpose: preserve the full list of external projects/repos/tools discussed or discovered so none are lost while LOCALAI evolves. This is a control file, not a shopping list. Every integration must be local-first when possible, optional when cloud/API-based, and guarded by permission, observability, update, and rollback rules.

## Required columns

| Project | Source URL | Category | Core/Optional/Future | Local-first? | API key required? | License/risk notes | Update method | Runtime mode | Integration status |
|---|---|---|---|---|---|---|---|---|---|

## Core LOCALAI / model / agent platform

| Project | Source URL | Category | Core/Optional/Future | Local-first? | API key required? | License/risk notes | Update method | Runtime mode | Integration status |
|---|---|---|---|---|---|---|---|---|---|
| LOCALAI existing repo | https://github.com/brogan101/LOCALAI | base app | core | yes | no | extend, do not replace | git branch/PR | all | existing |
| Ollama | https://ollama.com | local model runtime | core | yes | no | local model manager | API model list/version watch | Lightweight/Coding/Vision | existing/extend |
| Open WebUI | https://github.com/open-webui/open-webui | AI UI satellite | core satellite | yes | optional | do not replace LOCALAI UI | release watch | on_demand | planned |
| LiteLLM | https://github.com/BerriAI/litellm | model gateway | core | yes | optional | optional cloud bridge; enforce data policy | release/config watch | on_demand | planned |
| LM Studio | https://lmstudio.ai | local OpenAI-compatible model backend | optional | yes | no | local desktop backend; do not auto-start or replace Ollama default | app/version/config watch | on_demand | Phase 05 optional disabled/not_configured profile |
| LangGraph | https://github.com/langchain-ai/langgraph | durable workflows | core | yes | optional | checkpointing/human-in-loop | package update | Business/Coding | planned |
| n8n | https://github.com/n8n-io/n8n | deterministic automation | optional/core business | self-hosted yes | optional | license/version review | release watch | Business | planned |
| Activepieces | https://github.com/activepieces/activepieces | deterministic automation | optional | self-hosted yes | optional | license/version review | release watch | Business | planned |
| Dify | https://github.com/langgenius/dify | workflow/RAG builder | optional satellite | self-hosted yes | optional | do not duplicate core runtime | release watch | on_demand | planned |
| Flowise | https://github.com/FlowiseAI/Flowise | flow builder | optional satellite | self-hosted yes | optional | do not duplicate core runtime | release watch | on_demand | planned |
| AnythingLLM | https://github.com/Mintplex-Labs/anything-llm | RAG workspace satellite | optional satellite | yes | optional | do not replace LOCALAI RAG | release watch | on_demand | planned |

## MCP / tool runtime / browser / computer use

| Project | Source URL | Category | Core/Optional/Future | Local-first? | API key required? | License/risk notes | Update method | Runtime mode | Integration status |
|---|---|---|---|---|---|---|---|---|---|
| Docker MCP Gateway | https://docs.docker.com/ai/mcp-gateway/ | MCP isolation | core security | yes | optional | Docker dependency; sandbox boundary; tools hidden unless profile allowlisted; blockSecrets/blockNetwork default true | Docker/Desktop/CLI watch | on_demand | Phase 07B optional status/profile/proposal integration through tool firewall; no image pull/container start/tool execution |
| MCP official servers | https://github.com/modelcontextprotocol/servers | MCP tools | core registry | yes | varies | each server must be permissioned | release watch | on_demand | Phase 07A registry-only disabled/not_configured; per-server approval required later |
| MCPO | https://github.com/open-webui/mcpo | MCP to OpenAPI bridge | core/optional | yes | no | bridge only; enforce registry | release watch | on_demand | existing integration catalog; Phase 07A firewall/proposal only |
| MCP-UI | https://github.com/MCP-UI-Org/mcp-ui | rich MCP UI | optional/core UI | yes | no | UI guard required | release watch | UI | existing integration catalog; Phase 07A firewall/proposal only |
| OpenClaw | verify current repo before install | chat/mobile gateway | optional/core gateway | self-hosted if available | optional | high-trust execution risk; sandbox required; Phase 07C source remains unverified/blocked until allowlisted | release watch | on_demand | Phase 07C optional gateway status/profile/proposal integration through tool firewall; default disabled/not_configured; no clone/install/start/skill/action execution |
| NemoClaw | verify current repo before install | OpenClaw safety wrapper | optional/core gateway | self-hosted if available | optional | alpha/experimental risk; verify status; Phase 07C source remains unverified/blocked until allowlisted | release watch | on_demand | Phase 07C optional gateway status/profile/proposal integration through tool firewall; default disabled/not_configured; no clone/install/start/skill/action execution |
| Playwright MCP | https://github.com/microsoft/playwright-mcp | browser automation | core | yes | no | approval for risky web actions | package/release watch | Browser | Phase 07A registry-only dry-run/proposal; browser Node blocker still deferred |
| Browser Use | https://github.com/browser-use/browser-use | browser automation | optional | yes | optional | browser actions gated | release watch | Browser | planned |
| Chrome DevTools MCP | verify current official/source before install | browser/devtools | optional | yes | no | browser action risk | release watch | Browser/Coding | planned |
| Open Interpreter / OS mode | verify current status before install | desktop computer use | future | yes | optional | high-risk desktop control | release watch | Sandbox only | future |
| OmniParser | verify current repo before install | screenshot UI parsing | future/core vision | yes | no | visual actions are error-prone | release watch | Vision | planned |
| FlaUI / pywinauto / AutoHotkey | project docs/repo per adapter | Windows UI automation | optional | yes | no | use before blind clicks where safe | version watch | Desktop | planned |

## Coding / self-build / maintenance

| Project | Source URL | Category | Core/Optional/Future | Local-first? | API key required? | License/risk notes | Update method | Runtime mode | Integration status |
|---|---|---|---|---|---|---|---|---|---|
| Codex CLI/App/IDE | official OpenAI docs/app | coding agent | build workflow | optional cloud | may require account/API | used to build until local AI transition | manual/tool updates | Coding | active external |
| Cline | https://github.com/cline/cline | VS Code coding agent | optional | yes with local endpoint | optional | approval/checkpoint behavior required | release watch | Coding | planned |
| Roo Code | https://github.com/RooCodeInc/Roo-Code | VS Code coding agent | optional | yes with local endpoint | optional | mode/config guard | release watch | Coding | planned |
| OpenHands | https://github.com/OpenHands/OpenHands | coding agent runtime | optional/core later | self-hosted yes | optional | sandbox strongly preferred | release watch | Coding | planned |
| Aider | https://github.com/Aider-AI/aider | terminal pair programmer | core/optional | yes with local endpoint | optional | branch/diff capture required | package update | Coding | existing/extend |
| Continue | https://github.com/continuedev/continue | IDE coding assistant | optional | yes with local endpoint | optional | config generation only | release watch | Coding | existing/extend |
| Goose | https://github.com/block/goose | general agent | optional | yes with local endpoint | optional | MCP permissions | release watch | Coding/General | planned |
| Dev Containers | https://github.com/devcontainers/spec | reproducible workspaces | core safety | yes | no | container dependency | spec/version watch | Coding | planned |
| Dagger | https://github.com/dagger/dagger | reproducible CI/workflows | optional/core | yes | no | container dependency | release watch | Coding | planned |
| E2B | https://github.com/e2b-dev/E2B | code sandbox | optional | cloud/self-host varies | optional | cloud risk unless self-hosted | release watch | Sandbox | future |
| Daytona | https://github.com/daytonaio/daytona | dev sandbox | optional | self-host possible | optional | license/deployment review | release watch | Sandbox | future |
| Renovate | https://docs.renovatebot.com/ | dependency updates | core maintainer | yes | optional token | PR-only/no auto-merge early | config/package updates | Maintainer | planned |
| Updatecli | https://www.updatecli.io/ | declarative updates | optional maintainer | yes | optional | review/approval required | config/version watch | Maintainer | planned |
| Semgrep | https://github.com/semgrep/semgrep | static analysis | core security | yes | optional | ruleset review | package update | Maintainer | planned |
| Trivy | https://github.com/aquasecurity/trivy | vuln/container scan | core security | yes | no | DB update/network optional | release/DB watch | Maintainer | planned |
| Syft/Grype | https://github.com/anchore/syft | SBOM/vuln scan | optional/core security | yes | no | DB update/network optional | release watch | Maintainer | planned |
| Gitleaks / TruffleHog | project repos | secret scanning | core security | yes | no | do not print secrets | release watch | Maintainer | planned |

## RAG / document / memory / evidence

| Project | Source URL | Category | Core/Optional/Future | Local-first? | API key required? | License/risk notes | Update method | Runtime mode | Integration status |
|---|---|---|---|---|---|---|---|---|---|
| Chroma | https://github.com/chroma-core/chroma | vector memory | existing/optional | yes | no | existing alternative | package update | Lightweight | existing/extend |
| Qdrant | https://github.com/qdrant/qdrant | vector DB | optional/core later | yes | no | service mode | release watch | on_demand | planned |
| LanceDB | https://github.com/lancedb/lancedb | embedded vector DB | optional/core later | yes | no | embedded/local-first | package update | Lightweight | planned |
| Docling | https://github.com/docling-project/docling | document parsing | core RAG | yes | no | Python/service dependency | release watch | on_demand | planned |
| MarkItDown | https://github.com/microsoft/markitdown | file-to-markdown | optional/core RAG | yes | optional | check file support | package update | on_demand | planned |
| Unstructured | https://github.com/Unstructured-IO/unstructured | document ingestion | optional | yes/cloud optional | optional | heavier dependency | release watch | on_demand | planned |
| Marker / MinerU / OCRmyPDF / PaddleOCR / Tesseract | project repos/docs | OCR/PDF parsing | optional | yes | no | evaluate per file type | release watch | on_demand | planned |
| Paperless-ngx | https://github.com/paperless-ngx/paperless-ngx | document vault | optional/core evidence | yes | no | stores clear text; trusted LAN only | release watch | EdgeNode/NAS | planned |
| Letta / Mem0 / Graphiti / Zep-style memory | project repos | long-term/temporal memory | optional | yes/cloud optional | optional | privacy review | release watch | on_demand | planned |

## Maker / CAD / text-to-CAD / electronics / fabrication

| Project | Source URL | Category | Core/Optional/Future | Local-first? | API key required? | License/risk notes | Update method | Runtime mode | Integration status |
|---|---|---|---|---|---|---|---|---|---|
| FreeCAD MCP | https://mcp.directory/mcp/details/612/freecad | CAD MCP | core maker | yes | no | sandbox macros; digital only; Phase 13B status/proposal only | release/source watch | Maker | Phase 13B provider status not_configured/proposal-only; no macro/tool execution |
| CadQuery | https://github.com/CadQuery/cadquery | CAD-as-code | core maker | yes | no | Python/OCCT dependency; Phase 13B metadata proposals only | package/release watch | Maker | Phase 13B provider status not_configured/proposal-only; no Python/CAD execution |
| build123d | https://github.com/gumyr/build123d | CAD-as-code | core maker | yes | no | Python/OCCT dependency; Phase 13B metadata proposals only | package/release watch | Maker | Phase 13B provider status not_configured/proposal-only; no Python/CAD execution |
| OpenSCAD | https://openscad.org | CAD-as-code | optional | yes | no | CLI dependency; Phase 13B render/export disabled | version watch | Maker | Phase 13B provider status not_configured/proposal-only; no OpenSCAD execution |
| gNucleus Text-to-CAD MCP | https://github.com/gNucleus/text-to-cad-mcp | text-to-CAD | optional cloud | no | yes | API key/cloud; never core/default; data-leaves-machine approval required later | release watch | Maker optional | Phase 13B disabled/not_configured cloud provider; no API calls |
| BuildCAD AI MCP | https://buildcad.ai | text/image-to-CAD | optional cloud | no | likely/account | cloud service; data-leaving warning; verify terms before any use | provider docs watch | Maker optional | Phase 13B disabled/not_configured cloud provider; no API calls |
| KiCad MCP Server - mixelpixx | https://github.com/mixelpixx/KiCAD-MCP-Server | PCB automation | optional/core electronics | local with KiCad | no | manufacturing requires human review; Phase 13B metadata proposals only | release watch | Maker/Electronics | Phase 13B provider status not_configured/proposal-only; no KiCad execution |
| KiCad MCP Server - Seeed Studio | https://github.com/Seeed-Studio/kicad-mcp-server | PCB analysis/codegen | optional/core electronics | yes/headless | no | verify project status/licensing before executor work | release watch | Maker/Electronics | Phase 13B represented under KiCad provider status; no KiCad execution |
| circuit-synth KiCad schematic MCP | https://github.com/circuit-synth/mcp-kicad-sch-api | schematic automation | optional | yes | no | schematic-only scope; verify source before executor work | package watch | Maker/Electronics | Phase 13B represented under KiCad provider status; no schematic execution |
| OrcaSlicer | https://github.com/SoftFever/OrcaSlicer | slicer | core maker | yes | no | CLI/profile support check | release watch | Maker | Phase 13C provider status not_configured/proposal-only; no slicer execution or G-code generation |
| PrusaSlicer / SuperSlicer CLI | project repos/docs | slicer CLI | optional/core | yes | no | profile compatibility | release watch | Maker | Phase 13C provider status not_configured/proposal-only; no slicer execution or G-code generation |
| OctoPrint | https://github.com/OctoPrint/OctoPrint | printer control | optional/core printer | yes | optional token | physical action tiers | release watch | EdgeNode/Maker | Phase 13C provider status not_configured/approval-gated; no printer API call, upload, queue, or start |
| Klipper / Moonraker / Mainsail / Fluidd | project repos/docs | printer firmware/API/UI | optional/core printer | yes | no | physical action tiers | release watch | EdgeNode/Maker | Phase 13C provider status not_configured/approval-gated; no Moonraker/Klipper/Mainsail/Fluidd API call or hardware action |
| Obico self-hosted | https://github.com/TheSpaghettiDetective/obico-server | print failure detection | optional/core printer | yes self-host | optional | camera/privacy and false positives | release watch | EdgeNode/Maker | Phase 13C provider status not_configured/degraded; no monitoring API call or fake monitoring |
| Spoolman | https://github.com/Donkie/Spoolman | filament inventory | core maker | yes | no | inventory source of truth | release watch | EdgeNode/Maker | Phase 13C provider status not_configured; material checks can block unknown/missing material without fake inventory success |
| FDM Monster | https://github.com/fdm-monster/fdm-monster | printer farm mgmt | optional | yes | no | physical action tiers | release watch | Maker | Phase 13C provider status disabled; no farm API call or printer action |
| FreeCAD Path / CAM | https://wiki.freecad.org/Path_Workbench | CAM/toolpath planning | optional maker | yes | no | toolpaths require human simulation/review; Phase 13D setup sheets only | release/docs watch | Maker/Shop | Phase 13D provider status not_configured/proposal-only; no live toolpath or G-code generation |
| CNCjs | https://github.com/cncjs/cncjs | CNC controller | optional/future | yes | no | dangerous machine; manual start | release watch | Shop | Phase 13D provider status not_configured/manual-only; no G-code send, motion, spindle, API, or hardware action |
| LinuxCNC | https://github.com/LinuxCNC/linuxcnc | CNC control | future | yes | no | dangerous machine; dedicated hardware | release watch | Shop | Phase 13D provider status not_configured/manual-only; no controller execution, machine motion, spindle, or hardware action |
| FluidNC / bCNC | project repos | CNC controller/sender | future | yes | no | dangerous machine; manual start | release watch | Shop | Phase 13D providers not_configured/proposal-only/manual-only; no serial/network sender, G-code stream, motion, or hardware action |
| LightBurn-style laser workflow | https://lightburnsoftware.com | laser workflow reference | optional/future | local app, not embedded | possible license | laser fire/power/motion dangerous; manual-only | release/docs watch | Shop | Phase 13D provider status not_configured/manual-only; no laser file send, power, motion, fire, API, or hardware action |
| Serial / USB shop device providers | local hardware profiles | serial/USB/bench control | future | yes | no | device writes, firmware, relays, bench power are dangerous | profile review only | Shop/Electronics | Phase 13D provider status disabled/manual-only; no serial/USB write, firmware flashing, relay/power, or bench equipment action |

## Home / shop / physical automation / robotics

| Project | Source URL | Category | Core/Optional/Future | Local-first? | API key required? | License/risk notes | Update method | Runtime mode | Integration status |
|---|---|---|---|---|---|---|---|---|---|
| Home Assistant | https://github.com/home-assistant/core | automation hub | core edge | yes | no | entity exposure safety | release watch | EdgeNode | planned |
| Home Assistant MCP | https://www.home-assistant.io/integrations/mcp_server/ | HA MCP | core edge | yes | no | expose only safe entities | HA version watch | EdgeNode | planned |
| ESPHome | https://github.com/esphome/esphome | custom devices | optional/core edge | yes | no | firmware safety | release watch | EdgeNode | planned |
| Zigbee2MQTT / Mosquitto MQTT | project repos | local device bus | optional/core edge | yes | no | network segmentation | release watch | EdgeNode | planned |
| Node-RED | https://github.com/node-red/node-red | visual automation | optional | yes | no | duplicate automation risk | release watch | EdgeNode | planned |
| Frigate | https://github.com/blakeblackshear/frigate | local AI NVR | optional/core edge | yes | no | camera/privacy/GPU load | release watch | EdgeNode | planned |
| Valetudo | https://github.com/Hypfer/Valetudo | local robot vacuum | optional edge | yes | no | supported vacuums only | release watch | EdgeNode | planned |
| WLED | https://github.com/Aircoookie/WLED | LED control | optional | yes | no | low-risk lighting | release watch | EdgeNode | future |
| ROS 2 / MoveIt 2 / Nav2 / Gazebo / ros2_control / Foxglove | project repos/docs | robotics lab | future | yes | no | physical robotics safety | release watch | Robotics | future |

## HomeLab / network / SOC / infrastructure

| Project | Source URL | Category | Core/Optional/Future | Local-first? | API key required? | License/risk notes | Update method | Runtime mode | Integration status |
|---|---|---|---|---|---|---|---|---|---|
| NetBox | https://github.com/netbox-community/netbox | network source of truth | optional/core homelab | yes | no | source-of-truth only at first | release watch | EdgeNode/HomeLab | planned |
| Nautobot | https://github.com/nautobot/nautobot | network source/automation | optional | yes | no | choose vs NetBox intentionally | release watch | EdgeNode/HomeLab | planned |
| Ansible | https://github.com/ansible/ansible | automation | core homelab | yes | no | config-first only | package/release watch | HomeLab | planned |
| Nornir / Netmiko / NAPALM | project repos | network automation | optional | yes | no | network changes gated | release watch | HomeLab | planned |
| OpenTofu / Terraform | project repos | IaC | optional/core homelab | yes | optional | state/secret safety | release watch | HomeLab | planned |
| Proxmox MCP/API | verify source before install | virtualization control | optional | LAN/local | token | VM changes require approval | release watch | HomeLab | planned |
| OPNsense API/Ansible | project docs/repos | firewall automation | optional | LAN/local | token | no silent firewall changes | release watch | HomeLab | planned |
| UniFi API/MCP | official/community docs/repos | network/protect/access | optional | LAN/cloud depends | token | read-first; writes gated | release watch | HomeLab | planned |
| Batfish | https://github.com/batfish/batfish | network config validation | optional/core homelab | yes | no | validate-before-apply | release watch | HomeLab | planned |
| AdGuard Home / Pi-hole | project repos | DNS filtering | optional/core | yes | no | DNS changes gated | release watch | EdgeNode/SOC | Phase 16 provider status not_configured; no DNS query fetch, filter change, API call, or blocklist mutation |
| Wazuh | https://github.com/wazuh/wazuh | SIEM/XDR | optional/core SOC | yes | no | resource impact | release watch | EdgeNode/SOC | Phase 16 provider status not_configured; no manager API call, agent install, scan, or remediation |
| Zeek / Suricata | project repos | network security monitor | optional | yes | no | privacy/storage/load review | release watch | EdgeNode/SOC | Phase 16 provider status not_configured; no packet capture, sniffing, log ingest, IDS/IPS enablement, or rule change |
| LibreNMS / Zabbix / Netdata / Uptime Kuma | project repos | monitoring | optional/core | yes | no | choose by need | release watch | EdgeNode/SOC | Phase 16 provider status not_configured; no monitoring API call, probe, scan, or alert sync |
| osquery | https://github.com/osquery/osquery | endpoint security/inventory | optional SOC | yes | no | endpoint queries require explicit scope and approval | release watch | EdgeNode/SOC | Phase 16 provider status not_configured; no daemon install, query execution, or endpoint action |

## Automotive / vehicle diagnostics / shop knowledge

| Project | Source URL | Category | Core/Optional/Future | Local-first? | API key required? | License/risk notes | Update method | Runtime mode | Integration status |
|---|---|---|---|---|---|---|---|---|---|
| python-OBD | https://github.com/brendan-w/python-OBD | OBD-II library | core mechanic | yes | no | adapter reliability varies; Phase 18 status only | package/release watch | Mechanic | Phase 18 provider status not_configured; no OBD connection, scan, or hardware call |
| pyOBD | https://github.com/barracuda-fsh/pyobd | OBD-II app | optional reference | yes | no | GPL/license review; reference only | release watch | Mechanic | Phase 18 disabled reference/status only; no app execution |
| ELM327-emulator | verify current repo before install | OBD test emulator | core test | yes | no | dev/test only; do not start automatically | release watch | Mechanic | Phase 18 provider status not_configured; no emulator process started |
| SavvyCAN | https://www.savvycan.com/ | CAN capture/reverse engineering | optional/core later | yes | no | read/capture before send; no injection default | release watch | Mechanic | Phase 18 provider status not_configured; CAN capture/action proposals approval-gated, no CAN interface call |
| OVMS | https://github.com/openvehicles/Open-Vehicle-Monitoring-System-3 | vehicle telemetry | optional/future | yes | no | hardware needed; vehicle commands gated | release watch | Mechanic/Edge | Phase 18 provider status not_configured; no telemetry or vehicle command call |
| ACES Jackpot ECU logs/import | vendor/product docs | ECU log import/tuning reference | optional mechanic | local file import first | possible | tuning/write operations are safety-critical; logs only until later approval | docs/version watch | Mechanic | Phase 18 provider status not_configured; local metadata/log-import concept only, no ECU API/write/tune call |
| Open VTS | https://openvts.io/ | vehicle tracking | optional/future | self-host | no | GPS privacy review | release watch | Edge | future |

## Inventory / business / content

| Project | Source URL | Category | Core/Optional/Future | Local-first? | API key required? | License/risk notes | Update method | Runtime mode | Integration status |
|---|---|---|---|---|---|---|---|---|---|
| InvenTree | https://github.com/inventree/InvenTree | parts inventory | optional/core shop | yes | no | source of truth | release watch | EdgeNode/Shop | planned |
| PartKeepr | https://github.com/partkeepr/PartKeepr | parts inventory | optional reference | yes | no | maintenance review | release watch | Shop | reference |
| Snipe-IT | https://github.com/snipe/snipe-it | asset management | optional | yes | no | useful for tools/assets | release watch | EdgeNode | planned |
| HomeBox | https://github.com/hay-kot/homebox | home inventory | optional | yes | no | choose vs InvenTree/Snipe-IT | release watch | EdgeNode | planned |
| Chatwoot | https://github.com/chatwoot/chatwoot | support inbox | optional/business | self-host yes | optional | external comms approval | release watch | Business | planned |
| Twenty CRM | https://github.com/twentyhq/twenty | CRM | optional/business | self-host yes | optional | PII policy | release watch | Business | planned |
| Cal.com/Cal.diy | project repos | scheduling | optional/business | self-host possible | optional | external comms approval | release watch | Business | planned |
| Postiz | https://github.com/gitroomhq/postiz-app | social scheduler | optional/business | self-host yes | platform OAuth | no stealth/spam bots | release watch | Business | planned |
| Firecrawl | https://github.com/mendableai/firecrawl | research/crawling | optional/core research | self-host possible | optional | web content untrusted | release watch | Research | planned |

## Rules

- Add a row before integrating a project.
- Verify source, license, current maintenance, and install method before implementation.
- Mark whether it is local-first or API-key/cloud-based.
- Cloud/API text-to-CAD and model providers must stay optional and disabled until configured.
- Do not silently make license-risk, cloud-first, abandoned, or unsafe projects core.
- Do not auto-install anything from this list without an explicit phase prompt and approval gate.
- Keep this list append-only unless a project is explicitly superseded with a documented reason in `docs/JARVIS_DECISIONS.md`.

## Phase 00 verification note

2026-04-25: Phase 00 did not add, install, or promote any external project. The existing watchlist scope was retained as planning memory, and future phases must verify current source/license/install/runtime details before adding code for any listed project.

## Phase 02 verification note

2026-04-25: Phase 02 did not add, install, or promote any external project. It added a LOCALAI provider policy registry for already-planned local and optional cloud provider categories only. Cloud/API providers remain optional, disabled or not_configured by default, and no real network provider test is performed without intentional user configuration in a later phase.

## Phase 03 verification note

2026-04-25: Phase 03 did not add, install, or promote any external project. It implemented a LOCALAI-native approval queue and durable job foundation, and explicitly did not introduce LangGraph, Temporal, or any new workflow runtime.

## Phase 05 verification note

2026-04-26: Phase 05 did not install or promote a new runtime. It added an optional LM Studio backend profile in the existing provider policy/lifecycle profile surfaces only. Ollama remains the default local backend; LM Studio is disabled/not_configured unless explicitly configured, never auto-started, and never required for startup or tests.

## Phase 06 verification note

2026-04-26: Phase 06 did not install, update, promote, or start any external project. The self-maintainer reads this watchlist as an allowlist/control file for source trust decisions only. Optional GitHub/API/cloud release checks remain disabled/not_configured by default, unknown or `verify current` sources are blocked until verified, and no package manager, Docker image, MCP/tool, OpenClaw/NemoClaw, or model update is executed automatically.

## Phase 07C verification note

2026-04-29: Phase 07C did not install, update, clone, promote, configure, or start OpenClaw, NemoClaw, OpenShell, messaging bridges, skill adapters, Docker MCP tools, or any external project. OpenClaw/NemoClaw are represented as optional future gateway records behind the existing LOCALAI tool firewall. Unknown or `verify current` sources remain blocked until verified and allowlisted; community/custom skill sources default higher risk and disabled/not_configured; gateway install/update checks are dry-run/proposal only; no external messages or gateway actions execute.

## Phase 08A verification note

2026-04-29: Phase 08A did not install, update, promote, configure, start, or require MarkItDown, Docling, OCR tools, LanceDB, Qdrant, Docker, Python, cloud APIs, or external services. Those projects remain optional status/config records only and report `not_configured` when absent. Existing local hnswlib remains the default vector path, and the built-in parser remains the default ingestion path.

## Phase 13B verification note

2026-04-30: Phase 13B did not install, update, promote, configure, start, or require FreeCAD, CadQuery, build123d, OpenSCAD, gNucleus Text-to-CAD MCP, BuildCAD AI, KiCad, KiCad MCP servers, Docker, Python, network, cloud APIs, PCB tools, CAD tools, or hardware. These projects are represented as Maker CAD provider status/proposal records only. Local providers report `not_configured` until explicitly configured; cloud text-to-CAD providers report disabled/not_configured and are never called by default. No CAD/PCB macro, render, export, manufacturing, or physical action executed.

## Phase 13C verification note

2026-04-30: Phase 13C did not install, update, promote, configure, start, or require OrcaSlicer, PrusaSlicer, SuperSlicer, OctoPrint, Klipper/Moonraker, Mainsail, Fluidd, FDM Monster, Spoolman, Obico, Docker, Python, network, cloud APIs, printer APIs, slicer tools, monitoring services, or hardware. These projects are represented as Maker print provider status/proposal records only. Slicers/printers/material/monitoring providers report not_configured/disabled/degraded until explicitly configured and approved in a later executor workflow. No slice, G-code generation, file upload, print queue/start, heater/motor command, monitoring API call, or physical action executed.

## Phase 13D verification note

2026-04-30: Phase 13D did not install, update, promote, configure, start, or require FreeCAD Path/CAM, CNCjs, LinuxCNC, FluidNC, bCNC, LightBurn, KiCad electronics tools, InvenTree, serial/USB devices, Docker, Python, network, cloud APIs, machine APIs, CAM tools, laser tools, firmware tools, bench equipment, or hardware. These projects are represented as Maker machine provider status/proposal records only. CAM/CNC/laser/electronics providers report not_configured/disabled until explicitly configured and approved in a later executor workflow. No live toolpath, G-code send, machine motion, spindle start, laser fire, firmware flash, relay/power command, serial/USB write, machine API call, or physical/electronics action executed.

## Phase 16 verification note

2026-04-30: Phase 16 did not install, update, promote, configure, start, or require Wazuh, Zeek, Suricata, OPNsense IDS/IPS, Pi-hole, AdGuard Home, LibreNMS, Zabbix, Netdata, Uptime Kuma, osquery, packet capture tools, firewall/router APIs, SIEM exports, Docker, Python, network, cloud APIs, or external services. These projects are represented as Home SOC provider status/report/remediation metadata only inside the existing HomeLab source of truth. Providers report not_configured by default. Packet capture/sniffing is blocked. Dangerous remediations are approval-gated and still not_configured after approval until a later provider-specific executor exists. No scan, packet capture, IDS/IPS change, firewall/DNS/DHCP/VLAN mutation, device quarantine, monitoring API call, or security provider action executed.

## Phase 17A verification note

2026-04-30: Phase 17A did not add, install, update, promote, configure, start, discover, sync, or require any external project. Digital Twin records are local metadata and source references into existing LOCALAI systems only. No Home Assistant, MQTT, HomeLab, Home SOC, Maker, vehicle, tool, cloud, network, device, discovery, scanning, pairing, or provider API was contacted. Optional downstream systems remain represented by their existing not_configured/degraded/provider-status surfaces, and no physical/device action executed.

## Phase 21 verification note

2026-05-01: Phase 21 did not install, update, promote, configure, start, or require any installer, backup service, restore provider, cloud storage provider, Docker image, network service, or external project. Packaging/install/backup/restore/disaster-recovery behavior is represented through LOCALAI-native metadata, dry-run manifests, and approval-gated restore proposals. Optional external backup/install providers report `not_configured` by default. No service install, startup task, firewall, PATH, system setting, destructive restore, delete/reset/reinstall, or external provider action executed.
