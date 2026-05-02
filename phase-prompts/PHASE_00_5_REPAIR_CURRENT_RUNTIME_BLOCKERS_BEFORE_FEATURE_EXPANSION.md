# PHASE 00.5 — Repair Current Runtime Blockers Before Feature Expansion

```text
Work inside the existing LOCALAI repo. Start by reading:
- AGENTS.md
- docs/JARVIS_CONTEXT_INDEX.md
- docs/JARVIS_IMPLEMENTATION_LEDGER.md
- docs/JARVIS_TEST_MATRIX.md
- docs/JARVIS_BLOCKERS.md
- AUDIT_REPORT.md

Goal:
Fix or harden the current runtime blockers before adding big new modules. Do not add new major features in this phase.

Target files to inspect first:
- artifacts/api-server/src/index.ts
- artifacts/api-server/src/app.ts
- artifacts/api-server/src/routes/health.ts
- artifacts/api-server/src/lib/hardware-probe.ts
- artifacts/api-server/src/lib/runtime.ts
- artifacts/api-server/src/lib/windows-system.ts
- artifacts/localai-control-center/vite.config.ts
- LAUNCH_OS.ps1
- scripts/windows/*
- package.json
- README.md

Known blockers to address from audit:
1. API/UI local socket binding failures.
2. Child `powershell.exe` failure for launched sidecars.
3. NVML / `nvidia-smi` failures despite RTX GPU presence.
4. Node version mismatch for browser/runtime tooling.
5. Inconsistent `localhost` vs `127.0.0.1` behavior.
6. Sidecar failures must be fail-soft and visible, not fatal.
7. Dependency audit timeout must be recorded and handled safely.
8. Root clean script must not be unsafe/non-Windows-native.

Implement:
- Add robust host binding config with safe default `127.0.0.1`.
- Add clear diagnostics when socket binding fails.
- Make tray/STT/sidecar startup fail-soft with thought-log and health visibility.
- Add `pwsh` fallback detection where appropriate, but do not require it.
- Make GPU telemetry fail-soft: GPU identity can be detected even if NVML fails; VRAM guard must degrade safely.
- Standardize docs/config toward `127.0.0.1` for local app URLs unless a route explicitly supports LAN/Tailscale.
- Replace unsafe root clean behavior with a cross-platform script or document why not changed.
- Add or update tests for health route, fail-soft sidecar behavior, and hardware probe fallback where practical.

Hard limits:
- Do not introduce Docker, OpenClaw, MCP, CAD, Home Assistant, or new services in this phase.
- Do not claim live browser/E2E works unless you actually launched it and verified it.

Tests:
- `pnpm -r typecheck`
- `pnpm test`
- `pnpm run verify:baseline`
- `pnpm run verify:jarvis`
- Attempt API start if environment allows: `pnpm --filter api-server start`
- Attempt UI dev start if environment allows: `pnpm --filter localai-control-center dev`

Closeout:
Update blockers with fixed vs remaining. Update ledger and local AI handoff.
```

---
