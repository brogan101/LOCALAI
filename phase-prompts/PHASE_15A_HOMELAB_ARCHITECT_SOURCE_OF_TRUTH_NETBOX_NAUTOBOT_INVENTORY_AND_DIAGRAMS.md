# PHASE 15A — HomeLab Architect Source Of Truth: NetBox/Nautobot, Inventory, And Diagrams

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add HomeLab Architect foundation: source of truth for network/devices/VLANs/IPs/VMs/services before applying any config.

Target files:
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*HomeLab*,*Network*,*Integrations*,*Diagrams*,*Settings*

Implement:
1. HomeLab entities:
   - sites/rooms/racks
   - devices
   - interfaces
   - VLANs
   - subnets/IP ranges
   - DNS zones/records
   - services/containers/VMs
   - firewall zones
2. NetBox/Nautobot adapters:
   - disabled until configured
   - read-only sync first
   - write/update requires later approval flow
3. Blueprint generator:
   - network diagram data structure
   - VLAN/IP plan
   - service placement plan
4. UI:
   - HomeLab Architect page
   - device/VLAN/IP plan views
   - source-of-truth sync status
5. Tests:
   - read-only adapter cannot write
   - invalid VLAN/subnet data rejected
   - blueprint can be generated locally

Hard limits:
- No network/firewall changes in this phase.
- No remote device config writes.

Closeout:
Update ledger/local AI handoff.
```

---
