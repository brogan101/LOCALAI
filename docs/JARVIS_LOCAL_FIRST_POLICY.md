# Jarvis Local-First And Optional API Key Policy

## Policy

Jarvis must work without paid API keys.

Local-first providers are default:

- Ollama
- local OpenAI-compatible endpoint
- local embeddings
- local RAG
- local STT/TTS where possible
- local browser/desktop automation
- local model evaluation

Cloud/API providers are optional accelerators only.

## Phase 02 implementation

Phase 02 implements this policy in code:

- provider registry and policy evaluator: `artifacts/api-server/src/lib/provider-policy.ts`
- provider API routes: `artifacts/api-server/src/routes/provider-policy.ts`
- encrypted provider config: `artifacts/api-server/src/lib/secure-config.ts`
- usage split for local vs cloud: `artifacts/api-server/src/routes/usage.ts`
- settings UI: `artifacts/localai-control-center/src/pages/SettingsPage.tsx`

Ollama is the default provider. The LOCALAI OpenAI-compatible gateway is a local provider. Optional cloud/API providers remain disabled or not_configured unless the user explicitly enables them, stores a key, approves first use, and approves a specific data classification for that task.

## Requirements before using any cloud/API key

The app must show:

- provider
- model
- estimated cost if known
- what data would leave the machine
- data sensitivity classification
- whether the user approved this provider/session

## Blocked by default

Never send these to cloud providers unless the user explicitly overrides in a future policy:

- passwords
- API keys
- tokens
- browser cookies
- private documents
- confidential RAG collections
- raw screen/audio memory
- financial/legal/medical/private personal data
- client/customer data
- source code marked private without approval

## Required states

Every provider must support:

- not_configured
- configured_disabled
- configured_enabled
- unavailable
- error

No cloud provider may become a required dependency for normal operation.

## Current enforcement summary

- local providers: allowed by default, cost `$0`, data does not leave the machine
- cloud providers: disabled/not_configured by default
- secret and credential classifications: always blocked for cloud providers
- private-file/RAG classification: blocked for cloud providers by default
- provider tests: no-network policy checks in Phase 02
- missing API keys: never block LOCALAI local operation

## Phase 05 model lifecycle enforcement

Phase 05 keeps Ollama as the default model route and adds lifecycle/backend profiles without making optional providers required.

- model-routing source of truth remains SQLite `role_assignments` plus Ollama gateway tags
- LM Studio is an optional local profile only; it is disabled/not_configured until configured
- cloud/API providers remain optional and are not used for startup, tests, local chat, embeddings, RAG, STT/TTS, or OpenAI-compatible local endpoints
- pull/load/unload/delete/replace actions require approval or remain dry-run/proposal only
- replacement proposals require eval proof and never auto-delete or auto-pull models

## Phase 06 self-maintainer enforcement

Phase 06 keeps update checks local-first and proposal-only by default.

- self-maintainer radar uses local manifests, lockfile hashes, the external project watchlist, model lifecycle proposals, and disabled/not_configured optional providers
- unknown or unverified update sources are blocked or not_configured
- dependency/package proposals do not mutate `package.json` or lockfiles during checks
- repair/update/self-improvement actions require approval and record rollback/test requirements
- no update applies directly to `main`
- secrets, tokens, and credentials are redacted from self-improvement proposals and update logs
