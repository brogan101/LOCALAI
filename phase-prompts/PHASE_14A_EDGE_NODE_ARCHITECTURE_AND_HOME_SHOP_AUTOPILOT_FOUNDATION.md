# PHASE 14A — Edge Node Architecture And Home/Shop Autopilot Foundation

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Prevent the gaming PC from becoming a fragile always-on server. Add edge-node architecture so always-on Home Assistant, printer, camera, NAS, and shop tasks can live on mini PCs/Pis/NAS while the gaming PC remains the heavy AI brain.

Target files:
- artifacts/api-server/src/routes/remote.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/system.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Remote*,*Nodes*,*Home*,*Shop*,*Settings*,*Operations*

Implement:
1. Edge node registry:
   - node id/name/type
   - role: home-assistant/printer/camera/nas/shop/homelab/worker
   - endpoint
   - auth profile
   - health
   - last seen
   - allowed capabilities
2. Gaming PC role:
   - heavy local AI
   - CAD/coding/media
   - optional coordinator
   - not required for critical home safety automations
3. Node health checks:
   - ping/status route
   - service summary
   - unavailable state
4. UI:
   - Edge Nodes dashboard
   - node health/status
   - role assignment
5. Tests:
   - unavailable node does not break app
   - edge action requires node capability and approval if risky

Hard limits:
- Do not assume always-on gaming PC.
- Do not install services to remote nodes in this phase.

Closeout:
Update ledger/local AI handoff.
```

---
