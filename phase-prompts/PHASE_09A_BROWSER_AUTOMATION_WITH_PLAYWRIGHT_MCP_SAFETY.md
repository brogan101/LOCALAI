# PHASE 09A — Browser Automation With Playwright MCP Safety

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add browser automation through Playwright MCP-style structured browser state first, not blind clicking. Browser actions must be sandboxed/profiled and approval-gated for risky actions.

Target files:
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/worldgui.ts
- artifacts/api-server/src/routes/plugins.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Browser*,*Automation*,*Integrations*,*Tools*,*Chat*
- tests for permissions/tools

Implement:
1. Browser session profiles:
   - isolated profile
   - persistent profile only if user configures
   - download sandbox path
   - allowed domains
   - blocked domains
   - credential entry manual-only
2. Playwright MCP integration profile:
   - installed/configured/running status
   - tool schema discovery when available
   - unavailable when missing
3. Browser action safety:
   - read/navigate/screenshot allowed by tier
   - form fill requires approval depending on domain/data
   - login credentials manual-only
   - purchases/posts/messages/external submits require approval
4. Trace capture:
   - URL, action, DOM/snapshot summary, screenshot path if available, result
5. UI:
   - Browser Agent Studio card
   - session status
   - action replay list
6. Tests:
   - submit/post action blocked without approval
   - missing Playwright MCP returns unavailable
   - domain allow/deny rules enforced

Hard limits:
- Do not store cookies/passwords.
- Do not let AI enter credentials.
- Do not automate anti-bot evasion.

Closeout:
Update docs and ledger.
```

---
