# Jarvis Safety Tiers

## Digital permission tiers

| Tier | Meaning | Examples |
|---|---|---|
| D0 / `tier0_read_only` | Read-only | Summarize, inspect, search local docs |
| D1 / `tier1_draft_only` | Draft-only | Draft email/post/config/script, no execution |
| D2 / `tier2_safe_local_execute` | Safe local execute | Health checks, non-destructive diagnostics |
| D3 / `tier3_file_modification` | File modification with diff | Repo edits, config edits, rollback required |
| D4 / `tier4_external_communication` | External communication with approval | Email, social posting, customer replies |
| D5 / `tier5_manual_only_prohibited` | Manual-only/prohibited | Purchases, destructive deletes, credential/cookie extraction |

## Physical action tiers

| Tier | Meaning | Examples |
|---|---|---|
| P0 / `p0_sensor_read` | Read sensor state | temp, status, camera event, printer state |
| P1 / `p1_suggest` | Suggest action | recommend print settings, shop workflow |
| P2 / `p2_prepare_queue` | Prepare/queue action | slice file, create G-code, queue automation disabled |
| P3 / `p3_low_risk_automation` | Low-risk automation | lights, notifications, safe robot vacuum routine |
| P4 / `p4_approval_required` | Approval-required physical action | start print, open garage, pause printer |
| P5 / `p5_manual_only_at_machine` | Manual-only at machine | CNC spindle, laser fire, dangerous relays, vehicle movement |

## Phase 03 approval enforcement

- Approval requests persist in `approval_requests` and link to `durable_jobs`.
- Tier 3 file modification approvals must include diff and rollback metadata.
- Tier 4 external communication cannot verify for execution without approval.
- Tier 5 and P5 requests are recorded, audited, and denied rather than executed.
- Approved execution must supply the same payload hash that was approved.

## Physical integration requirements

Every physical adapter must have:

- simulator mode
- read-only mode
- dry-run mode
- approval-required mode
- emergency stop
- audit event
- clear UI state showing whether real execution is enabled

## Gaming-PC safety modes

| Mode | Expected behavior |
|---|---|
| Lightweight | only small/local basic services |
| Coding | coding model/tools allowed, no media/GPU-heavy background jobs |
| Vision | vision services only while active |
| Media | ComfyUI/video/image allowed, but manually started |
| Business | lightweight workflows, no surprise GPU usage |
| Maker | CAD/print/shop tools on demand only |
| HomeLab | read-only by default, apply requires approval |
| Gaming | stop GPU-heavy services, no update jobs, no model pulls |
| Emergency Stop | stop all optional services/tools/jobs immediately |
