# Safety and Permissions — LOCALAI Context Pack

Compact reference for local models. Hard limits and approval gates in LOCALAI.

## Permanent hard limits

These are TypeScript literal types — they cannot be overridden by any profile, API call, or approval:

| Limit | Value | Location |
|---|---|---|
| `selfModificationAllowed` | `false` | coding-agent.ts, local-builder.ts |
| `directMainApplyAllowed` | `false` | coding-agent.ts |
| `destructiveCommandsAllowed` | `false` | coding-agent.ts |
| `cloudEscalationEnabled` | `false` | local-builder.ts |
| `requireApprovalForEdits` | `true` | coding-agent.ts, local-builder.ts |

## Risk tiers

| Tier | Actions requiring it |
|---|---|
| `tier1_read_only` | Read workspace files, list models, query status |
| `tier2_reversible` | Draft chat, session create, config read |
| `tier3_file_modification` | Edit files, run build tasks, execute refactors |
| `tier4_destructive` | Delete files, schema drops, rollback |
| `tier5_system` | Shell commands, desktop automation, hardware control |

## Approval flow

1. Caller omits `approvalId` → server calls `createApprovalRequest({...})` → returns HTTP 202 with `{ approvalRequired: true, approval }`.
2. Caller submits returned `approvalId` → server calls `verifyApprovedRequest(approvalId, payload, type)` → returns `{ allowed, message, approval }`.
3. If `allowed`, proceed; otherwise return HTTP 403.

## Route guards

```ts
agentEditsGuard(() => "description")     // blocks if editing is not permitted
agentRefactorGuard(() => "description")  // blocks if refactoring is not permitted
```

Guards are Express middleware in `lib/route-guards.ts`. Apply to any route that modifies state.

## Audit events

Every privileged action emits:
```ts
void recordAuditEvent({
  action:   "module.action_name",
  target:   "entity:id",
  outcome:  "success" | "failure" | "blocked",
  metadata: { ...sanitized, no secrets },
});
```

Never include API keys, passwords, session tokens, or file contents in audit metadata.

## Redaction before replay logs

```ts
import { redactForMissionReplay } from "./mission-replay.js";
const safe = redactForMissionReplay({ ...payload });
// Strips recognized secret patterns before the object is stored
```

## Thought log categories

```
"kernel" | "queue" | "approval" | "rollback" | "config" | "chat"
"workspace" | "system" | "security" | "rag" | "evidence_vault"
"stt" | "tts" | "web" | "voice" | "meeting" | "screen_context"
```

## Local builder specific

- `proposeBuildTask()` always returns `approvalRequired: true` on the proposal.
- A proposal with `hardBlocked: true` must never be executed — no approval can override a hard block.
- Hard-block conditions:
  - `phaseId` or `taskSummary` contains shell metacharacters `; & | \` $ ( ) { } < > \`
  - `targetFiles` includes paths matching `artifacts/api-server/src` or `artifacts/localai-control-center/src`
- All evals run with `usedNetwork: false` — network access during eval is a test failure.

## Permission scope reference

```ts
type PermissionScope =
  | "file.read" | "file.write" | "command.execute"
  | "network"   | "browser"    | "desktop.worldgui"
  | "secrets"   | "model.access";
```

## What NOT to do

- Never bypass approval by calling `verifyApprovedRequest` without checking `v.allowed`.
- Never log secrets, tokens, or passwords to audit events or thought log.
- Never suppress or swallow hard-block results.
- Never add a feature flag that disables approval gates.
