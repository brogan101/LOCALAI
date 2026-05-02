# JARVIS_BUILD_KIT_AUDIT.md

Version: v2.6

## What changed from v2.3/v2.4

- Preserved all previous phase files and safety contracts.
- Added `docs/JARVIS_EXPERT_MODES.md`.
- Expanded `docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md` into a comprehensive repo/tool retention list.
- Expanded `docs/JARVIS_REQUIREMENTS_TRACEABILITY.md` to include Text-to-CAD, Master Tech, expert modes, UI preservation, and repo retention.
- Strengthened Phase 13B into Master Fabricator: FreeCAD + Text-to-CAD + CAD-as-code + KiCad.
- Strengthened Phase 18 into Master Tech automotive diagnostics.
- Strengthened verifier checks for required docs and critical keywords.

## Scope-preservation assertions

- Existing LOCALAI base preserved.
- Gaming-PC safe requirement preserved.
- Local-first optional API policy preserved.
- OpenClaw/NemoClaw/MCP preserved.
- Maker/CAD/3D print/CNC/electronics preserved and expanded.
- Text-to-CAD explicitly retained.
- Automotive upgraded from assistant to Master Tech.
- UI style guard preserved and strengthened.
- Final coverage audit preserved.

## Usage

Run:

```powershell
node scripts/jarvis/verify-build-kit.mjs
```

Then paste only:

```text
prompts/RUN_PHASE_00_NOW.md
```
