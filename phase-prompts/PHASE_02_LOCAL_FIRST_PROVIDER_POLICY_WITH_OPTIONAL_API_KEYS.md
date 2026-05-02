# PHASE 02 — Local-First Provider Policy With Optional API Keys

```text
Work inside the existing LOCALAI repo. Read persistent context docs first.

Goal:
Prioritize local AI with zero required cost. Add optional cloud/API-key support as a provider choice only, with data classification and explicit approval. The app must remain fully usable with no API keys.

Target files:
- artifacts/api-server/src/lib/model-orchestrator.ts
- artifacts/api-server/src/routes/models.ts
- artifacts/api-server/src/routes/openai.ts
- artifacts/api-server/src/lib/secure-config.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/api-server/src/routes/usage.ts
- artifacts/localai-control-center/src/**/*Settings*,*Models*,*Integrations*,*Usage*
- README.md

Implement:
1. Provider policy registry:
   - local providers: Ollama, LocalAI gateway, llama.cpp/vLLM/SGLang/LiteLLM as optional backends when configured
   - optional cloud providers: OpenAI-compatible, Anthropic-compatible, Google-compatible, OpenRouter-compatible, custom base URL
   - no provider may be required for boot
2. Data classification before any non-local provider call:
   - public
   - normal
   - private
   - sensitive
   - secret
   - credential
   - private-file/RAG
3. Default policy:
   - local-only for all classifications unless user opts in
   - block secret/credential automatically
   - block private-file/RAG cloud use by default
   - first cloud use requires approval and visible provider/model/cost/data summary
4. API key storage:
   - use existing secure config pattern if present
   - never log raw keys
   - redact in thought log/audit/logs/UI
5. Cost/usage visibility:
   - local calls cost $0
   - cloud calls estimate cost when configured, otherwise show unknown
   - usage metrics separate local vs cloud
6. UI:
   - Provider settings page/section
   - “Local-first” badge/status
   - Optional API key forms with redaction and test connection
   - Per-task provider choice but default local
7. Tests:
   - app works with no keys
   - cloud call blocked for secret/credential data
   - private-file cloud use blocked by default
   - keys redacted in logs/output
   - local provider remains default

Hard limits:
- Do not put real API keys in files.
- Do not require network for tests.
- Do not route chat to cloud unless explicit configured/approved path exists.

Closeout:
Update context docs and test matrix.
```

---
