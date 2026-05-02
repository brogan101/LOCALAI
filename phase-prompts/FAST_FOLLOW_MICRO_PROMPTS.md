# Fast-Follow Micro Prompts

Use these only when a phase fails or gets too large.

## Micro Prompt — Repair Failed Phase Without Expanding Scope

```text
Work inside existing LOCALAI. Read AGENTS.md and docs/JARVIS_IMPLEMENTATION_LEDGER.md first.

The previous phase failed. Do not add new features. Repair only the failure.

Required:
1. Identify the exact failing command/test/error.
2. Identify files changed by the previous phase.
3. Fix only the cause of failure.
4. Run the failed command again plus relevant targeted tests.
5. Update docs/JARVIS_IMPLEMENTATION_LEDGER.md and docs/JARVIS_BLOCKERS.md.
6. Final answer must include before/after failure evidence.
```

## Micro Prompt — Reduce Token Usage Before Continuing

```text
Work inside existing LOCALAI. Compact context for future local/cloud agents.

Read:
- docs/JARVIS_IMPLEMENTATION_LEDGER.md
- docs/JARVIS_CONTEXT_INDEX.md
- docs/JARVIS_TEST_MATRIX.md
- docs/JARVIS_BLOCKERS.md

Update:
- docs/JARVIS_LOCAL_AI_HANDOFF.md
- docs/context-packs/current-build-state.md if it exists

Goal:
Produce a compact, accurate state summary under 2500 words covering current architecture, completed phases, incomplete phases, tests, blockers, and next prompt to run. Do not change runtime code.
```

## Micro Prompt — Verify No Fake Ready States

```text
Work inside existing LOCALAI. Audit unavailable/not_configured/not_installed states.

Goal:
Find any integration/tool/provider/device that can report ready/success without real configuration or proof. Fix by making it return explicit unavailable status and adding a test.

Areas:
- integrations
- plugins/tools/MCP
- OpenClaw/NemoClaw
- RAG parsers
- browser automation
- Maker/CAD/3D printers/CNC
- Home Assistant/robot vacuum/cameras
- HomeLab/network/SOC
- local/cloud providers

Run typecheck/tests and update ledger.
```

## Micro Prompt — Create The Next Best Local-AI Prompt

```text
Work inside existing LOCALAI. Read the persistent context docs and create one compact prompt for the next local model run.

Output only:
1. Goal
2. Files to inspect
3. Files to update
4. Implementation requirements
5. Tests
6. Closeout ledger updates

Keep it under 1200 words. Do not edit runtime code.
```


## Micro Prompt — Codex Code Review After A Phase

Use this after a phase branch has changes.

```text
Review the current phase changes against AGENTS.md, docs/JARVIS_PROMPT_RULES.md, docs/JARVIS_CODEX_WORKFLOW.md, and the active phase prompt.

Focus only on defects that could break the project or violate rules:
- duplicate systems instead of extending existing LOCALAI systems
- fake ready/success paths
- missing permission guards
- cloud/API dependency becoming required
- heavy service auto-starting by default
- missing ledger/blocker/test updates
- missing tests or weak proof
- risky physical/network/self-update behavior

Do not implement broad new features in this review. Produce actionable findings and suggested patches only.
```
