# JARVIS_FINAL_PRESTART_REVIEW.md

Purpose: final hard-audit notes before Phase 00. This file exists so Codex and future local models understand why the kit is structured this way and what must not be lost.

## Final decision

This build kit is ready to start Phase 00 only after `node scripts/jarvis/verify-build-kit.mjs` passes from the root of the existing `brogan101/LOCALAI` repo.

## Non-negotiables

- Build on existing LOCALAI. Do not scaffold a replacement app.
- Preserve the existing LOCALAI UI style and layout language. Add/move/enhance only when required; do not redesign or reskin.
- Run one phase at a time.
- Update persistent context docs every phase so Codex/local AI can continue with less pasted context.
- Local AI/no-cost execution is the default. API keys are optional only.
- OpenClaw/NemoClaw, MCP, external repos, and physical systems must be wrapped by safety, permission, sandboxing, logging, and approval gates.
- Do not convert expert modules into basic helpers. Automotive must become Master Tech; Maker must become Master Fabricator/CAD Engineer; HomeLab must become Master Network Architect.
- No fake success paths. Unavailable integrations must return explicit unavailable states and create blockers.

## Final additions retained

The kit intentionally retains the expanded scope from the full chat:

- self-updating/self-improving maintainer
- chat-driven program modification
- local AI transition
- UI Custodian guard
- full external project watchlist
- Text-to-CAD / FreeCAD MCP / CAD-as-code / KiCad
- 3D printer, slicer, Spoolman, Obico, CNC/laser/CAM safety
- Master Tech automotive diagnostics and Foxbody/LQ4 profile
- Home Assistant, robot vacuum, cameras, MQTT, edge nodes
- HomeLab/network architect, Home SOC, digital twin, inventory, evidence vault, robotics

## Final risk controls

- Self-updater must come after approval, durable jobs, observability, model lifecycle, rollback, and audit scaffolding.
- Model deletion is prohibited until replacement passes evals and user approves retirement.
- Physical execution requires simulator/read-only/dry-run/approval tiers.
- Cloud/API use requires data classification and explicit user approval.
- Network/firewall/homelab changes must be proposed, validated, backed up, diffed, approved, applied, verified, and rollback-capable.

## First action

Run `prompts/RUN_PHASE_00_NOW.md` only.

## Phase 23 completion review (2026-05-02)

Phase 23 (Final Coverage Audit And Gap Closer) is complete. All non-negotiables from this review have been verified against the actual implementation:

- ✅ Built on existing LOCALAI — no scaffold replacement; all 35 phases extended the existing Express/React stack
- ✅ Existing LOCALAI UI style preserved — every UI phase added to the existing shell; no redesign or reskin
- ✅ One phase at a time — process maintained throughout
- ✅ Persistent context docs updated every phase — ledger, phase map, blockers, test matrix, handoff all current
- ✅ Local AI/no-cost default — Ollama remains default; API keys optional only
- ✅ OpenClaw/NemoClaw safety-wrapped — Phase 07C gateway records, not_configured until approved
- ✅ Physical systems safety-wrapped — Phases 01, 03, 14A/B, 15A/B, 16, 18, 19 approval/manual/blocked tiers
- ✅ No fake success paths — every unavailable integration returns explicit not_configured/degraded/blocked
- ✅ Expert modules not basic helpers — Master Tech (Phase 18), Master Fabricator/CAD (Phases 13A-D), Master Electronics (Phase 13B/D), Network Architect (Phase 15A/B), Home SOC (Phase 16)
- ✅ Automotive: Master Tech with Foxbody/LQ4/4L80E/ACES profile (Phase 18)
- ✅ Maker: Master Fabricator/CAD Engineer with FreeCAD MCP/CAD-as-code/KiCad/3D print/CNC/laser (Phases 13A-D)
- ✅ HomeLab: Master Network Architect with config-first/validate-before-apply (Phases 15A-B)

Active deferred items (non-blocking):
- B-009: approved durable executor follow-through for all not_configured adapters
- B-012: Project Foreman cross-system workflow surface (idea → plan → inventory → fabrication → install → maintenance)

Next: future phases only. Use `prompts/RUN_NEXT_PHASE_TEMPLATE.md` and `phase-prompts/` for the next incomplete phase.
