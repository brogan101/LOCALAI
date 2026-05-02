# PHASE 16 — Home SOC And Security Monitoring Copilot

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Add a local security/SOC copilot for home network and shop: Wazuh, Zeek, Suricata, LibreNMS/Zabbix/Netdata/Uptime Kuma, AdGuard/Pi-hole, logs, DNS, unknown devices, change timelines.

Target files:
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/routes/observability.ts
- artifacts/api-server/src/routes/system.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Security*,*SOC*,*Network*,*Diagnostics*,*Integrations*

Implement:
1. SOC adapter profiles:
   - Wazuh
   - Zeek
   - Suricata/OPNsense IDS
   - LibreNMS
   - Zabbix
   - Netdata
   - Uptime Kuma
   - AdGuard Home/Pi-hole
2. Read-only first:
   - alerts/events/status/DNS summary
   - no rule changes in this phase
3. Analysis workflows:
   - unknown device report
   - suspicious DNS summary
   - WAN outage timeline
   - noisy IoT device summary
   - “what changed?” report
4. UI:
   - Home SOC dashboard
   - alert summaries
   - DNS/security timeline
5. Tests:
   - disabled adapters return unavailable
   - rule changes blocked without later approval pipeline
   - summaries use local model by default

Hard limits:
- No production/security changes without manual approval.
- No credential logging.
- No invasive scanning outside configured network scope.

Closeout:
Update ledger/local AI handoff.
```

---
