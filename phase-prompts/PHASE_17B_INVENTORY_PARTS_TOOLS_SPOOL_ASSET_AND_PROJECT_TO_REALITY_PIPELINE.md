# PHASE 17B — Inventory, Parts, Tools, Spool, Asset, And Project-To-Reality Pipeline

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add inventory/parts/tools/materials workflow and connect it to the Maker Studio, Evidence Vault, Digital Twin, vehicle projects, and shop projects.

Target files:
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/routes/context.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Inventory*,*Parts*,*Tools*,*Projects*,*Maker*

Implement:
1. Inventory adapters:
   - InvenTree
   - PartKeepr
   - Snipe-IT
   - HomeBox
   - Spoolman
   - all disabled until configured
2. Local inventory model if no external system configured:
   - item, category, location/bin, quantity, unit, project link, reorder threshold, supplier link, notes
3. Project-to-reality pipeline:
   - idea
   - research
   - requirements
   - design/CAD
   - parts/material check
   - purchase list
   - fabrication/print/CNC
   - assembly guide
   - test checklist
   - documentation
   - maintenance reminders
4. QR/NFC label plan:
   - generate label data
   - no external printing required initially
5. UI:
   - inventory dashboard
   - project pipeline board
   - material/parts availability check
6. Tests:
   - unavailable external inventory does not block local inventory
   - low stock creates reorder suggestion, not purchase
   - project pipeline state persists

Hard limits:
- No automatic purchasing.
- No inventory deletion without approval.

Closeout:
Update ledger/local AI handoff.
```

---
