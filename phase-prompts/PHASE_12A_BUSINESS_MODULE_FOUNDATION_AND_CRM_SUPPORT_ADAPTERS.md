# PHASE 12A — Business Module Foundation And CRM/Support Adapters

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add the business automation foundation without sending messages or spamming. Everything starts draft/approval-first.

Target files:
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/chat.ts
- artifacts/api-server/src/routes/tasks.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Business*,*Integrations*,*Approval*,*Chat*,*Operations*

Implement:
1. Business module registry:
   - Immediate Response Agency
   - Customer Support Copilot
   - Lead Generation
   - Content Factory
   - IT Support Copilot
2. Adapter profiles:
   - Chatwoot disabled until configured
   - Twenty CRM disabled until configured
   - Cal.diy/Cal.com disabled until configured
   - Postiz disabled until configured
   - email/SMS disabled until configured
3. Draft-first workflow:
   - inbound item summary
   - suggested response
   - CRM note proposal
   - calendar slot suggestion
   - human approval before sending/updating external systems
4. Tests:
   - no external send without approval
   - disabled adapter cannot sync
   - lead draft creates approval item
5. UI:
   - Business modules dashboard
   - adapter status cards
   - draft approval queue

Hard limits:
- No stealth bots.
- No spam blasting.
- No platform anti-bot evasion.
- No external posting/messaging without approval.

Closeout:
Update docs and ledger.
```

---
