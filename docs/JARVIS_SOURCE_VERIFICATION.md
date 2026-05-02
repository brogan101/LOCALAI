# Jarvis Source Verification Policy

This policy exists to prevent old, dead, unsafe, or hallucinated integrations.

## Three-source verification rule

Before adding a new external project/integration, verify it against up to three independent sources when practical:

1. Official documentation or project website.
2. Official GitHub/GitLab repository README/releases/issues.
3. Package registry, Docker image, changelog, security advisory, or reputable implementation guide.

If fewer than three reliable sources exist, document that limitation in `docs/JARVIS_BLOCKERS.md` or the phase notes.

## What must be checked

- project is real
- license is acceptable for this repo/use case
- installation method is current
- API/CLI used by the code is current
- security model is understood
- local/offline behavior is known
- update path is known
- Windows/gaming-PC impact is known or documented

## Do not do this

- Do not add abandoned projects to core.
- Do not add AGPL-heavy services to core without documenting licensing impact.
- Do not install random MCP servers or OpenClaw skills without registry, sandbox, permission review, and audit.
- Do not depend on a project just because a blog post says it exists.

## Evidence format

When a phase adds or changes an integration, update the ledger with:

```text
Integration:
Sources checked:
Version/date checked:
Install method:
Runtime mode:
Safety notes:
Blockers:
```

## Codex feature verification summary

The build kit intentionally accounts for current Codex surfaces: app, CLI, IDE extension, cloud/delegated tasks, GitHub code review, skills/plugins, automations, AGENTS.md, worktrees, approvals, and sandboxing. Verify these against official OpenAI docs before changing the workflow.
