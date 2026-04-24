# End-to-End User & Code Audit

Audit date: 2026-04-23

Workspace audited: `C:\Users\broga\Downloads\LOCALAI-main\LOCALAI-main`

## Executive Summary

This checkout is a TypeScript/Node pnpm workspace with:

- Backend: `artifacts/api-server` using Express 5 and `tsx`.
- Frontend: `artifacts/localai-control-center` using React 19, Vite 7, Tailwind 4, and wouter.
- Vendored/runtime-adjacent code: `artifacts/api-server/sidecars`, `scripts/windows`, plugin directories, and generated frontend build output under `dist/public`.

The codebase typechecks and the existing test suites pass. The frontend production build passes after the lockfile is repaired. Full live user simulation could not be completed because this Windows host cannot bind local listen sockets: both the API and Vite fail with `listen UNKNOWN` even after binding explicitly to `127.0.0.1`.

## Validation Performed

### Passed

- `node --version` returned `v20.20.2`.
- `pnpm --version` returned `9.15.9`.
- `python --version` returned `Python 3.14.4`.
- `pnpm -r typecheck` passed for `api-server` and `localai-control-center`.
- `pnpm test` passed:
  - `security.test.ts` passed with 47 assertions.
  - `openai-compat.test.ts` passed.
  - `route-guard-coverage.test.ts` passed with 40 assertions.
  - `permission-routes.test.ts` passed with 154 assertions.
  - `api-error.test.ts` passed with 6 assertions.
  - `api-client.test.ts` passed with 18 assertions.
  - `permission-notice.test.ts` passed with 8 assertions.
  - `page-permission-ssr.test.tsx` passed with 11 assertions.
- `pnpm --filter localai-control-center build` passed.
- `pnpm install --frozen-lockfile --offline` passed after repairing `pnpm-lock.yaml`.
- `pnputil /enum-devices /class Display` found both `Parsec Virtual Display Adapter` and `NVIDIA GeForce RTX 5070` as started display devices.

### Blocked

- API live startup remains blocked by the host socket layer:
  - Command: `pnpm --filter api-server start`
  - Error: `Error listening on 127.0.0.1:3001: listen UNKNOWN: unknown error 127.0.0.1:3001`
- Frontend live startup remains blocked by the host socket layer:
  - Command: `pnpm --filter localai-control-center dev`
  - Error: `Error: listen UNKNOWN: unknown error 127.0.0.1:5173`
- Launching child `powershell.exe` failed on this machine:
  - Error: `Internal Windows PowerShell error. Loading managed Windows PowerShell failed with error 8009001d.`
- Browser automation through the in-app browser was blocked because the Node REPL browser runtime requires Node `>=22.22.0`, but the resolved system Node is `v20.20.2`.
- `pnpm audit --prod` did not complete within 60 seconds in this environment, so dependency vulnerability auditing is not verified.
- `nvidia-smi` fails with `Failed to initialize NVML: Unknown Error`; GPU device presence is confirmed, but live VRAM telemetry is not healthy.

## Fixed During Audit

### 1. STT sidecar path resolved to the wrong directory

Issue: `maybeSpawnSttSidecar()` looked for `../../../sidecars/stt-server.py` from `artifacts/api-server/src/app.ts`, which resolves outside `artifacts/api-server/sidecars`.

Fix: Updated the path to `../sidecars/stt-server.py`.

File: `artifacts/api-server/src/app.ts:42`

### 2. API server defaulted to a problematic wildcard bind

Issue: `app.listen(port)` bound through the platform default. On this host it failed as `0.0.0.0:3001` with `listen UNKNOWN`.

Fix: Added `HOST` support and defaulted to `127.0.0.1`.

File: `artifacts/api-server/src/index.ts:14`

Note: Remote/network use can still opt in with `HOST=0.0.0.0`.

### 3. Launch script expected `/api/health`, but backend only exposed `/api/healthz`

Issue: `LAUNCH_OS.ps1` checked `http://localhost:3001/api/health`, but the backend route only exposed `/healthz`.

Fix: Added a `/health` alias while keeping `/healthz`.

File: `artifacts/api-server/src/routes/health.ts:9`

### 4. Vite dev server and proxy defaulted to `localhost`

Issue: This host produced DNS/listen failures involving `localhost`.

Fix: Changed the default Vite API proxy target and dev server host to `127.0.0.1`.

File: `artifacts/localai-control-center/vite.config.ts:7`

File: `artifacts/localai-control-center/vite.config.ts:17`

### 5. Windows launch surfaces used `localhost`

Issue: The launcher and tray URLs used `localhost`, which is not reliable on this host.

Fix: Changed launcher/tray defaults and status checks to `127.0.0.1`.

File: `LAUNCH_OS.ps1:111`

File: `scripts/windows/LocalAI.Tray.ps1:18`

### 6. Launch script used child PowerShell sessions for dev servers

Issue: Child `powershell.exe` fails on this host with `8009001d`, preventing `LAUNCH_OS.ps1` from opening the API and UI sessions.

Fix: Switched child service launchers from nested PowerShell to `cmd.exe /k`.

File: `LAUNCH_OS.ps1:96`

File: `LAUNCH_OS.ps1:102`

### 7. Lockfile was out of sync with package metadata

Issue: `pnpm install --frozen-lockfile` failed because `artifacts/localai-control-center/package.json` declared `tsx` but `pnpm-lock.yaml` did not include it in that importer.

Fix: Repaired the lockfile offline with `pnpm install --lockfile-only --offline`, then verified with `pnpm install --frozen-lockfile --offline`.

File: `pnpm-lock.yaml`

## User Simulation Results

### What could be launched

The project commands were attempted through `cmd.exe` because nested PowerShell is broken on this host:

- API: `pnpm --filter api-server start`
- UI: `pnpm --filter localai-control-center dev`

### What blocked the user flow

The app could not be opened as a new user because neither service could bind a local listening socket:

- API failed on `127.0.0.1:3001`.
- Vite failed on `127.0.0.1:5173`.
- No browser route, onboarding screen, dashboard, chat, models page, settings page, or feature page could be exercised live after startup.

### Expected primary flow to retest after host repair

- Launch with `.\LAUNCH_OS.ps1 -NoBrowser`, then open `http://127.0.0.1:5173`.
- Verify dashboard data loads from `/api/health`, `/api/system/diagnostics`, `/api/tags`, and related endpoints.
- Navigate through Chat, Models, Workspace, Studios, Remote, Operations, Integrations, Diagnostics, Logs, Cleanup, and Settings.
- Attempt a non-destructive chat with an installed chat model.
- Verify model role assignment does not route chat to embedding-only models.
- Verify privileged actions show permission blocks when disabled.
- Verify kill switch, cleanup execute, shell execution, OS automation, updater, and model delete require explicit app-level permissions.

## Code Audit Findings Not Fully Fixed

### 1. Host socket layer prevents local E2E testing

File: `artifacts/api-server/src/index.ts:18`

Issue: Even after explicit `127.0.0.1` binding, Node fails with `listen UNKNOWN` for API and Vite.

Plan: Repair the Windows networking/runtime layer before declaring the app end-to-end ready. Check Winsock, local firewall/security software, Node runtime integrity, and whether Parsec/virtual networking hooks are interfering with local binds. After repair, rerun API/UI live startup and browser flow.

### 2. Tray sidecar still depends on broken Windows PowerShell

File: `artifacts/api-server/src/app.ts:71`

Issue: The backend spawns `powershell.exe` for `scripts/windows/LocalAI.Tray.ps1`. This host currently throws `Internal Windows PowerShell error ... 8009001d` for child PowerShell sessions.

Plan: Either repair Windows PowerShell on the host, prefer `pwsh` if available, or make tray startup detect PowerShell failure and publish a visible warning. Do not block API startup on tray failure.

### 3. GPU telemetry is degraded despite GPU presence

File: `artifacts/api-server/src/lib/hardware-probe.ts`

Issue: `nvidia-smi` fails with `Failed to initialize NVML: Unknown Error`, while `pnputil` confirms `NVIDIA GeForce RTX 5070` is started.

Plan: Keep VRAM telemetry fail-soft. Prefer fallback probes for GPU identity and avoid treating NVML failure as proof that no NVIDIA GPU exists.

### 4. Dependency vulnerability audit did not complete

File: `package.json`

Issue: `pnpm audit --prod` timed out after 60 seconds in this environment.

Plan: Run `pnpm audit --prod` after network/runtime health is stable. If it still hangs, run with registry diagnostics and capture the failing package request.

### 5. Root clean script is not Windows-native

File: `package.json:16`

Issue: `clean` uses `rm -rf`, which is unreliable from default Windows shells.

Plan: Replace with a small cross-platform Node cleanup script or use `rimraf` if the project accepts a dependency. Do not change this casually because cleanup is destructive.

### 6. Generated FastAPI template contains a placeholder test name

File: `artifacts/api-server/src/routes/workspace.ts:143`

Issue: The generated template contains `test_placeholder()`. This appears intentional as scaffold output, not active app logic, but it violates strict no-placeholder policy for generated projects.

Plan: Rename to a concrete generated test such as `test_app_title_matches_project()` and ensure generated project templates avoid placeholder wording.

### 7. Some integration actions execute package manager or app commands

File: `artifacts/api-server/src/routes/integrations.ts:359`

Issue: Integration install/start/update routes use `exec(...)`. They are guarded by agent execution permissions, but they still run host-level package manager commands when enabled.

Plan: Keep the permission guard, show exact command previews in the UI before execution, and log command, exit code, and target integration to the audit/activity trail.

### 8. Dangerous command override exists by design

File: `artifacts/api-server/src/routes/system.ts:620`

Issue: `/system/exec/run` accepts `forceDangerous`. The route blocks dangerous commands unless `forceDangerous` is true and `requireActionConfirmation` is false.

Plan: Keep default confirmation enabled. Consider requiring a second server-side permission flag specifically for dangerous command override rather than reusing general execution permission.

### 9. Several docs and integration hints still use `localhost`

File: `README.md:34`

Issue: Runtime paths were patched to prefer `127.0.0.1`, but docs and several third-party integration hints still reference `localhost`.

Plan: After host networking is repaired, decide whether `localhost` is acceptable in docs. If this project targets machines with broken localhost DNS, standardize all local URLs to `127.0.0.1`.

## Security Notes

- Positive: Cross-site browser mutations are blocked by `localBrowserRequestGuard`.
- Positive: High-risk execution, model deletion, remote token rotation, workspace deletion, rollback restore, updater execution, and file edit routes have permission guard coverage in tests.
- Positive: Distributed auth token comparison uses `timingSafeEqual`.
- Risk: The app has powerful local OS automation and command execution features by design. The app should not be exposed beyond trusted loopback/Tailscale contexts without stronger authentication and CSRF/session controls.
- Risk: A local secret file exists at `artifacts/api-server/.webui_secret_key`. It is ignored by Git, but do not print or commit it.

## Performance Notes

- Chat streaming has a token buffer in `model-orchestrator.ts`, which is better than flushing every raw chunk.
- Boot starts multiple background services from `app.ts`. If live startup becomes slow after socket repair, profile database migration, model catalog sync, foreground watcher startup, and STT/tray sidecar spawn separately.
- Frontend build output is reasonably chunked; largest reported app chunk was about 243 kB before gzip.

## Retest Checklist

Run these after the host socket/PowerShell issues are repaired:

```powershell
pnpm install --frozen-lockfile
pnpm -r typecheck
pnpm test
pnpm --filter localai-control-center build
pnpm --filter api-server start
pnpm --filter localai-control-center dev
```

Then verify:

- `http://127.0.0.1:3001/api/health` returns `{ "status": "ok" }`.
- `http://127.0.0.1:3001/api/healthz` returns `{ "status": "ok" }`.
- `http://127.0.0.1:5173` loads the control center.
- Browser console has no runtime errors on first load.
- Major navigation pages render without blank screens.
- Permission-disabled privileged actions show visible blocked messages.
- Chat routes to a chat-capable model, not an embedding model.
