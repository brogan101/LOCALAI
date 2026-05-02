# Jarvis Codex Workflow — App, CLI, IDE, Cloud, Review, Skills, Automations

This file tells Codex and future local models how to use current Codex surfaces safely while building this existing LOCALAI repo.

## Goal

Build on the existing `brogan101/LOCALAI` project one phase at a time. Do not turn Codex into an uncontrolled background worker. Codex is allowed to edit, test, and propose changes, but the repo ledger is the source of truth.

## Supported Codex surfaces

| Surface | Best use | Rules |
|---|---|---|
| Codex App | Managing phase threads and worktrees | One worktree/branch per phase. Do not run dependent phases in parallel. |
| Codex CLI | Local repo edits and tests | Start in Suggest or Auto Edit. Use Full Auto only after approval/rollback/safety phases pass. |
| Codex IDE extension | Targeted file edits and review | Use when working inside known files from the phase prompt. |
| Codex cloud/delegated task | Isolated review/test/PR preparation | Must read ledger and update proof when results are pulled back. No direct merge. |
| Codex GitHub code review | Phase PR review | Treat findings as review input, not as implementation proof. |
| Codex skills/plugins | Repeatable workflows later | Must be created only after policy/tool safety is implemented. |
| Codex automations | Routine checks later | Must not run write/update/delete tasks until approval and rollback exist. |

## Branch/worktree rules

- Create one branch per phase: `jarvis-phase-XX-short-name`.
- Do not mix phases in one branch unless a blocker requires a tiny prerequisite fix.
- Do not run two agents against the same branch.
- If using Codex App worktrees, keep each agent scoped to one phase prompt.
- Merge only after tests, ledger updates, and manual review.

## Approval mode guidance

- Phase 00 through Phase 04: Suggest or Auto Edit only.
- Full Auto is not allowed until permission gates, durable jobs, observability, rollback, and emergency stop exist and tests pass.
- Physical automation, cloud providers, network/firewall changes, self-updates, model deletion, and external messages always require approval even after Full Auto is allowed.

## Cloud/delegated Codex policy

Cloud Codex can help with review or isolated patches, but this project is local-first. Before delegating:

1. Ensure no secrets, credentials, private files, or customer data are included.
2. Give the phase prompt plus ledger/context files only.
3. Require changed files, tests, and blockers in the response.
4. Pull or copy changes back into local repo.
5. Run local tests again.
6. Update `docs/JARVIS_IMPLEMENTATION_LEDGER.md`.

## Code review policy

Use Codex code review after meaningful phase changes. Required review questions:

- Did this duplicate an existing system?
- Did it add a fake success path?
- Did it require cloud/API access?
- Did it add auto-starting heavy services?
- Did it weaken permission/approval gates?
- Did it skip tests or update the wrong ledger files?

## Future skills/automations

Later phases may create Codex/Jarvis skills or automations for phase closeout, blocker repair, dependency update review, model lifecycle evaluation, MCP/tool safety scan, and local AI handoff compaction. These must be disabled-by-default until Phase 06+ and must update the ledger.
