# LOCALAI Claude Code Instructions

These instructions apply to Claude Code agents working in this repository.

## Project Rules

- This is the LOCALAI repo running in a local workspace.
- GitHub is backup/canonical reference only; the local workspace is where implementation happens.
- Inspect the repo before editing. Do not guess paths, package scripts, routes, components, database files, tests, or docs.
- Read existing local instruction and planning docs before major work, including `AGENTS.md`, `CLAUDE.md`, `docs/LOCALAI_UPGRADE_IMPLEMENTATION_PLAN.md`, and `docs/LOCALAI_UPGRADE_COMPLETION_MATRIX.md` when present.
- Preserve the existing React/Vite control center plus Express API architecture unless the repo proves otherwise.
- Do not redesign the UI. Keep the existing LOCALAI visual style, layout language, routes, theme, and component patterns.
- You may add needed pages, panels, cards, tabs, buttons, settings, drawers, and detail views, but they must match the existing LOCALAI UI style.
- Preserve existing OpenAI-compatible endpoints: `/v1/models`, `/v1/chat/completions`, `/v1/responses`, `/v1/embeddings`, and `/api/v1` mirrors if present.
- Preserve existing chat, sessions, Ollama/local-first model orchestration, VRAM guard, RAG, web search, STT/TTS, image generation, Windows/WorldGUI automation, rollback/time-travel, integrations, and current tests.
- Keep Ollama/local-first behavior as the default unless the user explicitly changes it.
- Prefer adapters, migrations, feature flags, compatibility wrappers, and backward-compatible shims over destructive rewrites.
- Do not replace working systems with stubs.
- Do not create fake UI, dead buttons, placeholder routes, fake health checks, fake logs, fake data, fake status badges, or "coming soon" pages.
- Every visible page/button/action must be wired, honestly disabled with a reason, or hidden behind a feature flag.
- Optional external tools must be health-checked and gracefully unavailable when not installed.
- Dangerous actions must go through existing permission guards, audit logs, and approval gates.
- Do not silently bypass tests.
- All major changes must include tests.
- After each major change, actually run the repo's typecheck/test/build commands.
- If tests fail, report exact errors and do not claim success.
- If no meaningful code changes were made, fail loudly and explain why.

## Repo Commands

Discovered from package scripts. Do not invent commands that are not present.

- Install: `pnpm install` or `pnpm run install:all`
- Dev: `pnpm run dev`
- API dev: `pnpm run dev:api`
- UI dev: `pnpm run dev:ui`
- API start: `pnpm run start:api`
- Typecheck: `pnpm -r typecheck` or `pnpm run typecheck`
- Test: `pnpm test`
- Build: `pnpm --filter localai-control-center build`
- Lint: no lint script is currently defined.
- Migration: no migration script is currently defined; API migrations run from the application database boot path.

## Baseline Checks

Use these checks for repository-wide validation unless a task justifies a narrower command set:

```powershell
pnpm -r typecheck
pnpm test
pnpm --filter localai-control-center build
```

Use targeted package scripts when changing a specific area:

```powershell
pnpm --filter api-server test:security
pnpm --filter api-server test:openai-compat
pnpm --filter api-server test:route-guards
pnpm --filter api-server test:permission-routes
pnpm --filter localai-control-center test:api
```

Run build and lint if available. Run migration, worker, browser, or CAD-specific tests if those systems are touched.

## Implementation Discipline

- Keep frontend changes native to the existing app; do not introduce a new design system.
- Keep backend changes route-compatible and backward-compatible.
- Guard privileged local actions with the existing permission guard patterns.
- Add migrations rather than destructive schema rewrites when durable state changes are needed.
- Preserve existing tests and add coverage for new behavior.
- Preserve `/v1` and `/api/v1` compatibility when changing model, chat, responses, or embeddings code.
- Keep optional service checks honest: unavailable tools should show real disabled/error states, not green fake statuses.
- Before final response, run `git status --short --branch` and `git diff --stat`.

## Required Final Response

Every final response must include:

- Files changed.
- What was implemented.
- What was intentionally not changed.
- Exact commands run.
- Exact test/build results.
- Any failing checks with exact errors.
- Manual verification steps.
- Git status.
- Git diff summary.
- Known risks.

