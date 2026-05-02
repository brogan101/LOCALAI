# PHASE 22 — Local AI Transition: Make LOCALAI Capable Of Building Itself

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Prepare for the transition from paid/cloud Codex usage to local models controlling development. Create compact context, model presets, evals, and workflows so local AI can keep building the project with less token/usage cost.

Target files:
- docs/JARVIS_LOCAL_AI_HANDOFF.md
- docs/JARVIS_CONTEXT_INDEX.md
- docs/JARVIS_PROMPT_RULES.md
- docs/JARVIS_TEST_MATRIX.md
- artifacts/api-server/src/routes/models.ts
- artifacts/api-server/src/routes/openai.ts
- artifacts/api-server/src/routes/chat.ts
- artifacts/api-server/src/routes/intelligence.ts
- artifacts/localai-control-center/src/**/*Models*,*Chat*,*Workspace*,*Settings*
- README.md

Implement:
1. Local builder profiles:
   - fast local code model
   - deep local code model
   - local reviewer model
   - local RAG model/embedding model
   - optional cloud escape hatch disabled by default
2. Context packs:
   - `docs/context-packs/core-architecture.md`
   - `docs/context-packs/safety-and-permissions.md`
   - `docs/context-packs/current-build-state.md`
   - `docs/context-packs/next-phase-template.md`
3. In-app “Build Jarvis” workflow:
   - select phase/task
   - read compact context docs
   - propose target files
   - approval
   - edit
   - test
   - update ledger
4. Local evals:
   - ensure local model can summarize repo state
   - propose safe patch plan
   - detect unsafe action request
   - update ledger format
5. UI:
   - Local Builder setup card
   - context pack viewer
   - model readiness checklist
6. Tests:
   - context packs exist
   - local builder refuses to proceed if ledger missing
   - optional cloud remains disabled by default

Hard limits:
- Do not require cloud.
- Do not hide token-heavy context in prompts; use context docs.
- Do not allow local model to self-modify without approval.

Closeout:
Update all persistent docs.
```

---
