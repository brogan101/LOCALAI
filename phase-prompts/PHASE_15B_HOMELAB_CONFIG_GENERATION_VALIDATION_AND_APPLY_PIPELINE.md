# PHASE 15B — HomeLab Config Generation, Validation, And Apply Pipeline

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Let Jarvis design and safely propose homelab/network/server stacks: Proxmox, Docker, OpenTofu/Terraform, Ansible, OPNsense/UniFi, DNS, monitoring. Apply is gated and rollback-aware.

Target files:
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/tasks.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*HomeLab*,*Network*,*Approval*,*Operations*
- scripts/*

Implement:
1. Config-generation adapters:
   - Ansible profile
   - OpenTofu/Terraform profile
   - Proxmox profile
   - OPNsense profile
   - UniFi profile
   - Docker Compose profile
   - Batfish validation profile
2. Strict pipeline:
   - inventory/read-only
   - generate proposed topology/config
   - validate config
   - backup current config if applicable
   - show diff
   - approval
   - apply
   - verify
   - rollback if failed
3. No direct apply until all stages exist.
4. UI:
   - generated config viewer
   - validation results
   - diff/approval card
   - rollback plan
5. Tests:
   - apply blocked before validation
   - apply blocked without backup plan for mutable targets
   - firewall/DHCP/VLAN write requires approval
   - Batfish unavailable does not fake validation

Hard limits:
- No firewall/network/Proxmox/UniFi changes without staged approval.
- No SSH credentials in logs.
- No remote destructive commands by default.

Closeout:
Update docs and ledger.
```

---
