# Remaining Phases and GitHub Project Research

Date: 2026-04-21

## Current Baseline

Local verification is green:

- `pnpm -r typecheck`
- `pnpm test`

Implementation update, 2026-04-23:

- Added OpenAI-compatible local endpoints at `http://localhost:3001/v1` and `/api/v1`.
- Implemented `/v1/models`, `/v1/chat/completions`, `/v1/responses`, and `/v1/embeddings` through the existing LocalAI model orchestrator.
- Added OpenAI compatibility tests and surfaced LocalAI endpoint config inside the Integrations page for Open WebUI, LiteLLM, Aider, and Continue.

The app already has a strong local stack foundation:

- React/Vite control center plus Express API.
- Ollama-based model gateway with VRAM guard, role routing, model install/stop, and benchmark UI.
- Chat sessions, branching, pinboard, token budgets, RAG, web search, STT/TTS, image generation through ComfyUI or SD WebUI, Windows automation, WorldGUI controls, rollback/time-travel, and integration catalog.
- Existing integrations include Open WebUI, Open WebUI Pipelines, LiteLLM, MCPO, Aider, Continue, LibreChat, Jan, AnythingLLM, Langflow, WorldGUI, Fabric, Taskfile, OpenClaw references, MCP-UI, Renovate, and Release Please.

The next work should not be "more buttons". The app needs a real agent platform core: durable state, secure execution, first-class tool/plugin runtime, high-quality retrieval, browser automation, and evaluations.

## High-Value Repos To Add Or Strengthen

### Must Integrate Deeply

1. OpenHands
   - Source: https://github.com/OpenHands/OpenHands
   - Why it matters: This is the strongest open coding-agent architecture candidate. It has SDK, CLI, local GUI, REST agent server, sandboxed execution, task decomposition, context compression, security analysis, and works with local/open models.
   - Best fit: Add as an optional "Coding Agent Runtime" behind your Workspace and Chat action cards. Use it for long-running repo tasks, not for simple edits.

2. LiteLLM
   - Source: https://github.com/BerriAI/litellm
   - Status here: Already listed in integrations.
   - Why it matters: It provides one OpenAI-compatible gateway for many providers, virtual keys, spend tracking, guardrails, load balancing, logging, MCP bridge support, and admin UI.
   - Strengthen: Generate `litellm_config.yaml` from LocalAI model roles, expose one local endpoint, create virtual keys, add model fallback policies, and point Aider, Continue, OpenHands, Open WebUI, and browser agents to this gateway.

3. MCP official servers, MCPO, and MCP-UI
   - Sources:
     - https://github.com/modelcontextprotocol/servers
     - https://github.com/open-webui/mcpo
     - https://github.com/MCP-UI-Org/mcp-ui
   - Status here: MCPO and MCP-UI are listed, but the app does not yet have a first-class MCP runtime.
   - Why it matters: MCP is the tool ecosystem. To beat Codex/Claude locally, LocalAI needs tool installation, schema inspection, permissions, execution, audit logs, and rich tool UI rendering.
   - Strengthen: Build an MCP Registry page, run local MCP servers under explicit permissions, proxy stdio servers through MCPO when needed, and render MCP Apps/MCP-UI resources inside Chat.

4. Playwright MCP
   - Source: https://github.com/microsoft/playwright-mcp
   - Why it matters: Browser automation should use DOM/accessibility/browser state, not only screenshot/click/type. Playwright MCP supports persistent profiles, isolated sessions, existing-browser connection, and configurable contexts.
   - Best fit: Add a Browser Agent studio with session profiles, screenshots, DOM snapshots, network logs, and approval gates.

5. Docling and MarkItDown
   - Sources:
     - https://github.com/docling-project/docling
     - https://github.com/microsoft/markitdown
   - Why it matters: Current RAG ingestion reads PDF/DOCX/TXT/code, but professional RAG quality depends on document structure, tables, scanned PDFs, OCR, layout, citations, and clean Markdown/JSON.
   - Best fit: Use MarkItDown for fast general conversion and Docling for PDFs, tables, OCR, page layout, formulas, charts, and lossless JSON.

6. LanceDB or Qdrant
   - Sources:
     - https://github.com/lancedb/lancedb
     - https://github.com/qdrant/qdrant
   - Why it matters: hnswlib-node is good for a first local vector index, but a serious all-in-one stack needs durable metadata, filtering, hybrid search, multimodal storage, deletions/updates, and operational tools.
   - Best fit:
     - LanceDB if you want embedded/local-first with TypeScript support and multimodal storage.
     - Qdrant if you want production service mode, payload filters, REST/gRPC, and scale.

7. Dev Containers and Dagger
   - Sources:
     - https://github.com/devcontainers/spec
     - https://github.com/dagger/dagger
   - Why it matters: Agent code execution needs reproducible environments. Direct shell execution on the host is not enough for trust, repeatability, or issue-to-PR workflows.
   - Best fit: Generate `.devcontainer/devcontainer.json` per workspace, then run lint/test/build through Dagger or devcontainer CLI so every agent task is repeatable locally and in CI.

### Strong Optional Adds

1. Goose
   - Source: https://github.com/aaif-goose/goose
   - Why it matters: Local desktop app, CLI, and API for general AI automation. Model-provider agnostic, MCP-first, Apache-2.0, and now under the Agentic AI Foundation.
   - Best fit: Add as a "General Agent Runtime" option next to OpenHands for non-code workflows.

2. Aider
   - Source: https://github.com/Aider-AI/aider
   - Status here: Already listed.
   - Strengthen: Launch through LiteLLM, auto-create task branches, capture generated commits/diffs, import the repo map into LocalAI context, and show Aider session logs in Operations.

3. Continue CLI and IDE Extension
   - Source: https://github.com/continuedev/continue
   - Status here: Continue config/rules are implemented.
   - Strengthen: Support both IDE extension config and new source-controlled `.continue/checks/` for PR checks. Add a UI to create security, performance, test, and architecture review checks.

4. Roo Code
   - Source: https://github.com/RooCodeInc/Roo-Code
   - Why it matters: Strong VS Code agent with modes, MCP servers, checkpoints, and custom modes.
   - Best fit: Optional IDE companion. Do not make it core unless users want VS Code as the primary interaction surface.

5. Browser-use and Skyvern
   - Sources:
     - https://github.com/browser-use/browser-use
     - https://github.com/Skyvern-AI/skyvern
   - Why they matter: Both are proven AI browser automation projects. Browser-use is easy to embed from Python and supports local models. Skyvern is heavier but has no-code workflow concepts and AI-augmented Playwright actions.
   - Best fit: Use Playwright MCP first. Add browser-use for simple local prompt-to-browser tasks. Add Skyvern only if you need durable browser workflow automation and accept AGPL/licensing implications.

6. Olla, vLLM, SGLang, llama.cpp, LM Studio
   - Sources:
     - https://github.com/thushan/olla
     - https://github.com/vllm-project/vllm
     - https://github.com/sgl-project/sglang
     - https://github.com/ggml-org/llama.cpp
     - https://lmstudio.ai
   - Why they matter: Ollama is excellent for local desktop model management, but an all-in-one stack should route across multiple inference backends.
   - Best fit: Keep Ollama as default. Add backend profiles for vLLM/SGLang for throughput, llama.cpp for GGUF/CPU fallback, LM Studio for GUI-managed models, and Olla if you want a dedicated local load balancer across backends.

7. Daytona
   - Source: https://github.com/daytonaio/daytona
   - Why it matters: Secure/elastic infrastructure for AI-generated code and sandbox execution.
   - Best fit: Optional sandbox backend for teams or heavy agent execution. Be careful with AGPL and deployment complexity.

## Strengthen Existing Implementations

### Model Gateway

Current: `artifacts/api-server/src/lib/model-orchestrator.ts` routes through Ollama and has a local VRAM guard.

Needed:

- Add OpenAI-compatible `/v1/chat/completions`, `/v1/embeddings`, `/v1/models`, and `/v1/responses` endpoints for the whole app.
- Generate LiteLLM configs from LocalAI roles and installed models.
- Support backend types: Ollama, LiteLLM, Olla, vLLM, SGLang, llama.cpp, LM Studio.
- Store model capabilities: tools, vision, JSON mode, context window, embedding dimension, reasoning support, function calling quality.
- Expand benchmark from one judge prompt to suites: coding edit, tool calling, RAG answer, vision, long-context, and latency/VRAM.

### RAG

Current: `artifacts/api-server/src/lib/rag.ts` uses hnswlib-node and SQLite chunk metadata.

Needed:

- Add a pluggable vector-store interface with hnswlib, LanceDB, and Qdrant providers.
- Add hybrid search: vector + BM25/full-text + metadata filters.
- Add reranking and answer citations.
- Add incremental re-indexing, deletions, file watchers, duplicate detection, and collection repair.
- Add Docling/MarkItDown ingestion workers and a document inspector UI.

### Coding Agent

Current: `artifacts/api-server/src/lib/global-workspace-intelligence.ts` plans refactors in memory and applies file content through LLM full-file replacement.

Needed:

- Persist refactor plans/jobs to SQLite instead of in-memory Maps.
- Move from full-file replacement to patch-first editing with structured diffs.
- Create a branch per task, run test/lint/build, summarize diff, and optionally open PR.
- Add sandbox execution through devcontainers/Dagger/OpenHands/Daytona.
- Add issue-to-branch-to-PR workflow.
- Capture agent traces: plan, reads, writes, commands, test failures, retries, final diff.

### Tool And Plugin Runtime

Current: `plugins/example-plugin.json` is a manifest skeleton and `/plugins` only lists manifests.

Needed:

- Add plugin install/update/remove lifecycle.
- Define permissions: file read/write, command exec, network, desktop, browser, secrets, model access.
- Load plugin routes/pages/tools safely.
- Allow plugins to register MCP tools or OpenAPI endpoints.
- Add signed manifests or checksum pinning for third-party repos.

### Browser And Computer Use

Current: WorldGUI and Windows routes can screenshot/click/type/focus windows.

Needed:

- Add Playwright MCP as the default browser automation layer.
- Add browser sessions with isolated or persistent profiles.
- Show live screenshot, DOM snapshot, console logs, network logs, and action history.
- Require human approval for credential entry, purchases, destructive web actions, or external posting.
- Keep WorldGUI as the fallback for non-browser desktop apps.

### Integrations

Current: `artifacts/api-server/src/routes/integrations.ts` is a strong catalog but mostly install/start/status wrappers.

Needed:

- Convert integrations into active app modules with generated config, health checks, logs, and cross-links.
- For Open WebUI: generate Ollama/LiteLLM provider setup, MCP/MCPO tool URLs, code interpreter settings, and feature toggles.
- For LiteLLM: manage config, virtual keys, fallback chains, rate limits, and per-model costs.
- For Aider: manage model provider config, `.aider.conf.yml`, task branches, and commit capture.
- For Continue: manage IDE extension config plus `.continue/checks/`.
- For ComfyUI/SD WebUI: discover checkpoints, workflows, LoRAs, samplers, dimensions, output gallery, and failed job logs.

### Security

Current: route guards, local browser origin guard, command sanitizer, strict local mode, audit logs, rollback.

Needed:

- Add workspace allowlists and deny-by-default path access.
- Add per-tool and per-plugin permission scopes.
- Add secret vault with redaction in logs and prompts.
- Add egress policy per agent/session/tool.
- Run dangerous work in container/sandbox, not the host shell.
- Add signed downloads, pinned versions, checksums, and supply-chain scans for integration installs.
- Add prompt-injection defenses for web/RAG/browser content.

### Observability

Current: Thought Log and some audit logs.

Needed:

- Add OpenTelemetry spans per chat/tool/command/model call.
- Add replayable agent traces.
- Track tokens, latency, first-token latency, failure rates, GPU memory, and model load/unload events.
- Add "why did it do that?" timeline for every action.
- Add eval dashboards for RAG, coding, browser, model routing, and tool calling.

## Proposed Remaining Phases

### Phase 9 - State And Permission Foundation

- Migrate workspace/projects/profiles/snapshots/integrations/refactor jobs into SQLite.
- Add a durable job queue and restart-safe workers.
- Add workspace root allowlist, scoped file permissions, and a unified audit event table.
- Normalize all settings/config files under one migration path.

Exit gate:

- Restarting the API does not lose refactor plans, jobs, queues, pins, plugin states, or integration states.

### Phase 10 - Unified Model Gateway

- Add OpenAI-compatible API endpoints for LocalAI itself.
- Generate and manage LiteLLM config.
- Add model capability registry.
- Add backend profiles for Ollama, LiteLLM, Olla, vLLM, SGLang, llama.cpp, and LM Studio.
- Expand benchmarking to model capability tests.

Exit gate:

- Aider, Continue, Open WebUI, OpenHands, browser agents, and LocalAI chat can all point at one local gateway.

### Phase 11 - Native Tool Runtime And MCP

- Implement structured tool calling instead of parsing action text tags.
- Add MCP server registry, install, start, stop, health, schema inspection, and permissions.
- Add MCPO bridge control for stdio tools.
- Add MCP-UI rendering in Chat.
- Add per-chat tool toggles and approval policies.

Exit gate:

- The app can install a GitHub/filesystem/browser MCP server, show its tools, call them with approval, audit the result, and render rich UI output.

### Phase 12 - Sandboxed Coding Agent

- Add devcontainer generation per workspace.
- Add Dagger/devcontainer execution for lint/test/build.
- Integrate OpenHands as the long-running coding runtime.
- Strengthen Aider launch/capture.
- Add task branch, diff review, tests, self-heal, and PR-ready output.

Exit gate:

- A task can run from prompt to branch, edit files, run tests in sandbox, fix failures, and present a reviewed diff without touching unrelated files.

### Phase 13 - Professional RAG And Document Intelligence

- Add Docling and MarkItDown ingestion.
- Add LanceDB or Qdrant provider.
- Add hybrid search, reranking, citations, file updates/deletions, and source inspector.
- Add evaluation sets for each collection.

Exit gate:

- Uploading a PDF/DOCX/PPTX/XLSX/scanned document yields structured chunks, citations, and answer traces with measurable retrieval quality.

### Phase 14 - Browser Agent And Desktop Automation

- Add Playwright MCP as first-class browser automation.
- Add browser-use or Skyvern optional runner.
- Keep WorldGUI for OS app automation but route browser tasks to Playwright first.
- Add browser replay timeline and safety prompts.

Exit gate:

- The app can complete a browser task, show every step, capture screenshots/DOM/network logs, and stop before risky external actions.

### Phase 15 - Integration Control Plane

- Convert integration catalog into real managed services.
- Add logs, config editors, version pinning, updates, rollback, and health checks.
- Generate configs for Open WebUI, LiteLLM, Aider, Continue, ComfyUI, and MCPO.

Exit gate:

- Installing an integration produces a working config connected to LocalAI's gateway, tools, and permissions.

### Phase 16 - Evals, Observability, And Hardening

- Add OpenTelemetry traces.
- Add agent replay, model traces, and per-tool stats.
- Add security scans and prompt-injection tests.
- Add benchmark packs for coding, RAG, browser automation, model routing, and tool use.

Exit gate:

- Every release proves it did not regress core agent tasks.

### Phase 17 - Plugin Marketplace

- Turn plugin manifests into installable signed modules.
- Add plugin UI pages, backend routes, MCP tools, and permission review.
- Add a curated plugin registry.

Exit gate:

- A third-party plugin can be installed, permissioned, run, updated, disabled, and audited without editing core code.

### Phase 18 - "Better Than Claude/Codex" Differentiators

- Local-first memory and RAG owned by the user.
- Multi-runtime model routing, not locked to one provider.
- Full PC/browser/document/code/image/voice stack.
- Reproducible local sandboxes and branch-per-task coding.
- Persistent agent traces, replay, rollback, and audit.
- Plugin and MCP ecosystem with rich UI.

The standard is not "more features than Claude/Codex". The standard is: LocalAI can do serious work locally, prove what it did, undo mistakes, use many best-in-class open projects, and keep user data under user control.

## Repo Adoption Priority

P0:

- OpenHands
- LiteLLM
- MCP servers + MCPO + MCP-UI
- Playwright MCP
- Docling + MarkItDown
- LanceDB or Qdrant
- Devcontainers + Dagger

P1:

- Goose
- Aider deep integration
- Continue CLI checks
- Browser-use
- Olla plus vLLM/SGLang/llama.cpp/LM Studio backend profiles
- Daytona if sandboxing needs grow beyond local containers

P2:

- Skyvern
- Roo Code
- Unstructured
- RAGFlow
- LibreChat/Open WebUI/AnythingLLM as satellite UIs, not core replacements

## Avoid Making These Core

- Full alternate chat apps should be satellites, not the center. Open WebUI, LibreChat, and AnythingLLM overlap with the control center.
- Heavy AGPL projects should be optional unless the licensing model is accepted.
- Low-star or fast-changing wrappers should not enter core unless they solve a precise missing capability.
- Prompt-pack projects are useful, but they do not solve the core platform gaps: sandboxing, MCP, RAG quality, observability, and evals.
