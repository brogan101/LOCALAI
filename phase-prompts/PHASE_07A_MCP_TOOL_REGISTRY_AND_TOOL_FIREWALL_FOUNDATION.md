# PHASE 07A — MCP Tool Registry And Tool Firewall Foundation

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Create the MCP/tool registry and firewall foundation before adding OpenClaw/NemoClaw or many tools. Tools must be visible, permissioned, sandbox-aware, and auditable.

Target files:
- artifacts/api-server/src/routes/plugins.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/index.ts
- artifacts/api-server/src/lib/route-guards.ts
- artifacts/api-server/src/lib/task-queue.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Plugins*,*Integrations*,*Tools*,*Settings*,*Operations*
- plugins/*
- tests for route guards/security/permissions

Implement:
1. Tool registry model:
   - id, name, type: mcp/openapi/local-script/browser/desktop/physical
   - provider/source
   - install state
   - permissions: filesystem/network/secrets/commands/browser/desktop/physical/model
   - allowed modes
   - risk tier
   - startup policy
   - health status
   - audit counts
2. Tool firewall:
   - before any tool execution, validate registry entry, permission tier, runtime mode, approval state, and egress/file scopes
3. Disabled adapter behavior:
   - if a tool is not installed/configured, return explicit `not_installed` or `not_configured`
   - no fake success path
4. Routes:
   - list tools
   - inspect tool schema/permissions
   - enable/disable tool
   - dry-run tool call
   - execute tool call only with permission/approval
5. UI:
   - Tool Registry page/card
   - risk badges
   - enable/disable controls
   - dry-run and approval state
6. Tests:
   - unregistered tool cannot run
   - disabled tool cannot run
   - high-risk tool requires approval
   - dry-run logs but does not execute

Hard limits:
- Do not install random MCP servers yet.
- Do not expose host filesystem/network by default.

Closeout:
Update docs and ledger.
```

---
