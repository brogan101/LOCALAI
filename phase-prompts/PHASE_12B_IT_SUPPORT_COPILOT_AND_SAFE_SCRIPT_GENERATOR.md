# PHASE 12B — IT Support Copilot And Safe Script Generator

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Build the IT support/sysadmin module using your strengths: Windows repair, Event Logs, AD/GPO checklists, Fortinet/Ivanti/Exchange/365 helpers, onboarding/offboarding, scripts with rollback and proof.

Target files:
- artifacts/api-server/src/routes/system.ts
- artifacts/api-server/src/routes/intelligence.ts
- artifacts/api-server/src/routes/workspace.ts
- artifacts/api-server/src/lib/task-queue.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*IT*,*Diagnostics*,*Scripts*,*Chat*,*Operations*
- scripts/windows/*

Implement:
1. IT support workflow types:
   - diagnose Windows issue
   - summarize event logs
   - generate PowerShell script
   - create onboarding/offboarding checklist
   - Fortinet/FortiAnalyzer helper notes
   - Ivanti deployment script helper
   - Exchange/365 troubleshooting checklist
2. Script safety contract:
   - what it reads
   - what it changes
   - admin required?
   - backup/restore behavior
   - `-WhatIf` where possible
   - logging path
   - exit codes
   - proof section
3. Script execution:
   - draft by default
   - run requires approval and safe command sanitizer
   - destructive scripts manual-only unless explicitly allowed
4. UI:
   - IT Support Studio
   - script preview
   - run/dry-run controls
   - output/log viewer
5. Tests:
   - script missing safety contract is rejected
   - dangerous command blocked
   - dry-run does not execute real command

Hard limits:
- No production/business system changes without manual approval.
- No credential capture.
- No destructive default scripts.

Closeout:
Update ledger and local AI handoff.
```

---
