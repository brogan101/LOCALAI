# PHASE 09B — Desktop/App Automation Drivers With WorldGUI Fallback

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Create a desktop/app automation driver architecture. Browser goes through Playwright first. Desktop apps use Windows UI Automation/driver approach where possible, with WorldGUI/screenshot control as fallback only.

Target files:
- artifacts/api-server/src/routes/worldgui.ts
- artifacts/api-server/src/lib/windows-system.ts
- artifacts/api-server/src/lib/foreground-watcher.ts
- artifacts/api-server/src/routes/system.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Automation*,*WorldGUI*,*Settings*,*Operations*

Implement:
1. App driver registry:
   - browser driver routes to Phase 09A
   - file explorer driver: disabled adapter unless real safe implementation is added
   - VS Code driver: disabled adapter unless real safe implementation is added
   - FreeCAD driver reserved for Maker phase
   - generic WorldGUI fallback driver
2. Driver capability model:
   - read state
   - focus app
   - screenshot
   - click/type
   - hotkey
   - file write
   - command execution
3. Safety:
   - excluded apps list
   - redaction zones/apps
   - emergency stop hotkey/config
   - approval gates for write/submit/delete
4. UI:
   - app driver registry/status
   - allowed/excluded apps
   - recent desktop actions
5. Tests:
   - excluded app cannot be controlled
   - disabled drivers cannot execute
   - WorldGUI fallback requires explicit approval for click/type

Hard limits:
- Do not give unrestricted desktop control.
- Do not inspect password managers, banking, HR/private apps, browser cookies, crypto wallets, or secrets.

Closeout:
Update ledger and local AI handoff.
```

---
