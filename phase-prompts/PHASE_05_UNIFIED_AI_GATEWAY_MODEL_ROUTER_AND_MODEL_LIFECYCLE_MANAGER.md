# PHASE 05 — Unified AI Gateway, Model Router, And Model Lifecycle Manager

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Strengthen the local model router and lifecycle manager. Local models stay first. Optional backends are profiles. New models replace old models only after eval proof, VRAM fit, and approval.

Target files:
- artifacts/api-server/src/lib/model-orchestrator.ts
- artifacts/api-server/src/config/models.config.ts
- artifacts/api-server/src/routes/models.ts
- artifacts/api-server/src/routes/openai.ts
- artifacts/api-server/src/routes/benchmark.ts
- artifacts/api-server/src/lib/hardware-probe.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Models*,*Settings*,*Usage*,*Benchmark*
- tests for openai compat, model routes, benchmark

Implement:
1. Model capability registry:
   - chat
   - coding
   - embeddings
   - vision
   - tool calling
   - JSON/structured output
   - context window
   - VRAM/RAM estimate
   - local/cloud provider
   - installed/available/deprecated/replacement candidate
2. Backend profiles:
   - Ollama default
   - LiteLLM optional
   - llama.cpp optional
   - vLLM optional
   - SGLang optional
   - LM Studio optional
   - custom OpenAI-compatible optional
3. Lifecycle rules:
   - never delete old model before replacement passes evals
   - replacement must fit GPU/RAM policy
   - replacement must be same or better for role capability
   - replacement requires approval
   - old model can be retired/unloaded, not immediately deleted
4. Model eval packs:
   - chat quality smoke
   - coding edit smoke
   - RAG answer/citation smoke
   - tool calling smoke
   - latency/resource smoke
   - vision smoke only when vision model installed; otherwise explicit skipped/unavailable result
5. UI:
   - model roles and capability table
   - replacement recommendations
   - retire/delete approval card
   - local-first status
6. Tests:
   - embedding model cannot be assigned to chat role unless allowed
   - cloud model not used by default
   - replacement blocked without eval proof
   - delete blocked without approval

Hard limits:
- No model deletion by default.
- No cloud fallback unless explicitly enabled by Phase 02 policy.
- Do not require network/Ollama for unit tests; mock where needed.

Closeout:
Update docs and ledger.
```

---
