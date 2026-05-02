# Jarvis Prompt Rules

These are the permanent prompt rules for Codex/local AI work.

## Best-practice structure every phase must follow

1. **Role** — act as a senior engineer maintaining the existing LOCALAI repo.
2. **Scope** — run only the named phase.
3. **Preflight** — inspect existing files and summarize what already exists.
4. **Reuse** — extend existing systems before creating new ones.
5. **Implementation** — make concrete file changes.
6. **Tests** — run relevant tests/checks.
7. **Proof** — show changed files, diff summary, test results, blockers, next phase.
8. **Memory** — update ledger, blockers, phase map, test matrix, and local handoff.

## Anti-confirmation-bias rules

- Do not assume a feature is missing. Search existing code first.
- Do not assume a dependency is current. Check official docs/repo/release notes before adding or updating.
- Do not assume a phase passed because code compiles. Verify the user-facing route, API route, permission guard, and tests where applicable.
- Do not assume a disabled adapter is complete. Disabled means explicitly not executable.
- Do not execute powerful actions directly when an approval queue path exists. Create an approval request, persist the durable job, and execute only after an approved matching payload hash is supplied.

## Token-saving rules

- Read context files first.
- Do not paste or repeat the full prompt pack in outputs.
- Summarize old context into the ledger.
- Put long details into docs, not final chat.
- Use focused file edits.
- Avoid broad rewrites unless required.

## Output format required from agents

Every agent completion must include:

```text
Changed files:
Tests/checks run:
Result:
Blockers:
Ledger updated: yes/no
Local AI handoff updated: yes/no
Next phase:
```

## Codex-specific rules

- Use one phase per branch/worktree/thread.
- Do not run dependent phases in parallel.
- Use Suggest or Auto Edit until safety gates exist.
- Cloud/delegated Codex tasks may review or patch, but must not replace local proof.
- Codex skills/automations are future repeatable workflows and must obey Jarvis permission rules.
