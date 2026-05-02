# PHASE 08B — Evidence Vault And Paperless/Manuals/Receipts Workflow

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add an Evidence Vault workflow for receipts, manuals, warranties, car documents, shop documents, home network docs, and project records.

Target files:
- artifacts/api-server/src/routes/rag.ts
- artifacts/api-server/src/routes/filebrowser.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*RAG*,*Evidence*,*Files*,*Workspace*,*Settings*
- docs/JARVIS_CONTEXT_INDEX.md

Implement:
1. Evidence Vault entity model:
   - document id
   - category: vehicle/home/shop/network/receipt/manual/warranty/tax/project/other
   - source path/hash
   - OCR/parser status
   - tags
   - linked entity ids from Digital Twin when available later
2. Paperless-ngx integration profile:
   - disabled until configured
   - endpoint/token stored securely
   - status/check connection only
   - import/sync action requires approval
3. Manual/receipt workflows:
   - add document
   - tag/categorize
   - ask question over category
   - generate warranty/maintenance reminder proposal
4. UI:
   - Evidence Vault page/card
   - category filters
   - ingestion status
   - ask-over-vault entry point
5. Tests:
   - category stored
   - disabled Paperless integration cannot sync
   - ask-over-vault uses local RAG path by default

Hard limits:
- Do not upload documents to cloud.
- Do not store secrets in logs.
- Do not delete original files.

Closeout:
Update ledger and local AI handoff.
```

---
