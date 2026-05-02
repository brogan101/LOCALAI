# PHASE 21 — Packaging, Install, Backup, Restore, And Disaster Recovery

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Make the project installable, recoverable, and safe for a gaming PC. Add backup/restore/snapshot behavior for config, DB, docs, model metadata, integration configs, and generated assets.

Target files:
- package.json
- README.md
- SETUP/installer docs if present
- scripts/*
- artifacts/api-server/src/routes/system.ts
- artifacts/api-server/src/routes/updater.ts
- artifacts/api-server/src/routes/rollback.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Backup*,*Settings*,*Operations*

Implement:
1. Backup plan:
   - SQLite DB
   - app settings
   - integration configs excluding secrets or with redaction
   - prompt/context docs
   - generated workflows/templates
   - model role metadata, not model blobs by default
2. Restore plan:
   - validate backup manifest
   - dry-run restore
   - approval required
   - rollback point before restore
3. Installer/update docs:
   - Windows-first setup
   - gaming-PC safety
   - optional edge nodes
   - local-first model setup
4. Scripts:
   - backup-config
   - restore-config dry-run
   - health-check
   - emergency-stop
   - gaming-mode
5. UI:
   - Backup/Restore page/card
   - latest backup status
   - dry-run restore result
6. Tests:
   - backup manifest generated
   - restore dry-run does not modify live data
   - secrets redacted

Hard limits:
- No destructive restore without approval.
- No backing up raw secrets in clear text.
- No deleting user data.

Closeout:
Update ledger/local AI handoff.
```

---
