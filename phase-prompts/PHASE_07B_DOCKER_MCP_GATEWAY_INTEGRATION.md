# PHASE 07B — Docker MCP Gateway Integration

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Integrate Docker MCP Gateway as the preferred isolation path for MCP tools. It should be managed, visible, and optional. The app must work without Docker.

Target files:
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/plugins.ts
- artifacts/api-server/src/lib/task-queue.ts
- artifacts/api-server/src/lib/thought-log.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Integrations*,*Tools*,*Settings*,*Operations*
- scripts/*
- docs/JARVIS_CONTEXT_INDEX.md

Implement:
1. Docker availability detection:
   - Docker Desktop/Engine present?
   - `docker mcp` available?
   - gateway running?
   - version/status output redacted/safe
2. MCP Gateway profile model:
   - profile name
   - allowed servers
   - allowed tools
   - secret requirements
   - network policy summary
   - mode compatibility
3. Gateway actions:
   - status
   - list enabled servers/tools
   - connect client config output
   - run/start/stop only through approval where needed
4. Tool filtering:
   - allow only selected tools to reduce token/tool noise
5. UI:
   - Docker MCP Gateway card in integrations/tools
   - status, setup steps, enabled servers, tool count
6. Tests:
   - no Docker = disabled with clear status, not failure
   - gateway command execution requires permission
   - tool filtering config persists

Hard limits:
- Do not require Docker for app startup.
- Do not install MCP servers automatically.
- Do not pass secrets into Docker without explicit configured secret mapping.

Closeout:
Update ledger and local AI handoff.
```

---
