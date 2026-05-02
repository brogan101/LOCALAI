# PHASE 14B — Home Assistant, Robot Vacuum, Cameras, MQTT, And Shop Devices

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Integrate home/shop automation safely: Home Assistant, HA MCP, ESPHome, Zigbee2MQTT, MQTT, Valetudo robot vacuum, Frigate cameras, WLED/lights, shop devices.

Target files:
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/plugins.ts
- artifacts/api-server/src/routes/remote.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Home*,*Shop*,*Devices*,*Integrations*,*Approval*

Implement:
1. Home Assistant adapter:
   - endpoint/token stored securely
   - exposed entity allowlist
   - read state by default
   - service calls require tier check
2. HA MCP profile:
   - disabled until configured
   - route through tool firewall
3. MQTT profile:
   - broker config
   - topics allowlist
   - publish actions require approval unless low-risk preset
4. Robot vacuum:
   - Valetudo profile
   - read status/map/rooms
   - clean zone requires approval or explicit low-risk rule
5. Cameras:
   - Frigate profile
   - read events/detections
   - no hidden recording changes
6. Shop devices:
   - lights/fans/air filter/compressor/garage door profiles
   - compressor/garage door/unlock = approval required
7. UI:
   - Home/Shop Autopilot dashboard
   - entity allowlist
   - physical action tier badges
   - recent events
8. Tests:
   - unallowlisted entity cannot be controlled
   - garage/lock/compressor action requires approval
   - read-only mode cannot execute service calls
   - missing HA/Valetudo/Frigate shows unavailable

Hard limits:
- No physical action without configured entity allowlist.
- No door/lock/garage/compressor/heater action without explicit approval.
- No cloud smart-home dependency.

Closeout:
Update docs and ledger.
```

---
