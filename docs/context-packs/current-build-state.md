# Current Build State — LOCALAI Context Pack

Pointer file — always read the live ledger and phase map for authoritative state.

## Authoritative sources

| Document | Path | Purpose |
|---|---|---|
| Implementation Ledger | `docs/JARVIS_IMPLEMENTATION_LEDGER.md` | Phase-by-phase completion log, current phase, next phase |
| Phase Map | `docs/JARVIS_PHASE_MAP.md` | All phases, status (Not started / In progress / Complete) |
| Blockers | `docs/JARVIS_BLOCKERS.md` | Known blockers and resolutions |
| Test Matrix | `docs/JARVIS_TEST_MATRIX.md` | Per-phase test results and dates |
| Handoff | `docs/JARVIS_LOCAL_AI_HANDOFF.md` | Current state, minimal prompt for next session |

## How to read the ledger

1. Find the `## Current Phase` section — shows the active or last completed phase.
2. Find the `## Next Phase` section — shows what to implement next.
3. Each phase entry has: description, files changed, tests added, commands run, results.

## Phase summary (as of Phase 22)

| Range | Theme |
|---|---|
| Phases 1–5 | Foundation: DB, auth, sessions, models, VRAM guard |
| Phases 6–10 | Intelligence: RAG, web search, coding agent, refactors |
| Phases 11–15 | Automation: WorldGUI, STT/TTS, voice meetings, evidence vault |
| Phases 16–19 | Expansion: Maker/CAD, homelab, business modules, IT support |
| Phase 20 | UI: Role-based dashboards, status badges, honest degraded states |
| Phase 21 | Edge / IoT node support, home autopilot, digital twin |
| Phase 22 | Local AI Transition: LOCALAI can build itself using local models |

## Build kit verification

```powershell
node scripts/jarvis/verify-build-kit.mjs
pnpm -r typecheck
pnpm test
pnpm --filter localai-control-center build
```

All four must pass before marking a phase COMPLETE.

## Marking a phase complete

1. Run the four verification commands above.
2. Record exact output in the ledger.
3. Update the phase map row to "Complete".
4. Update JARVIS_BLOCKERS.md (clear resolved blockers).
5. Update JARVIS_TEST_MATRIX.md (add phase test log row).
6. Update JARVIS_LOCAL_AI_HANDOFF.md (advance current state, minimal prompt).

## What a local model needs to know before proposing a phase

1. Read this file to find which phase is next.
2. Read `core-architecture.md` to understand repo structure.
3. Read `safety-and-permissions.md` to understand what is hard-blocked.
4. Read `next-phase-template.md` for the proposal format.
5. Read the relevant section of the ledger for the specific phase requirements.
6. Propose via `POST /intelligence/local-builder/build/propose` — never apply directly.
