# PHASE 17A — Digital Twin Core For Home, Shop, Network, Vehicles, Tools, And Projects

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Create the Digital Twin: one shared relationship graph for rooms, shop zones, tools, printers, cameras, sensors, vehicles, network devices, VMs, containers, documents, parts, filament, projects, and automations.

Target files:
- artifacts/api-server/src/db/schema.ts
- artifacts/api-server/src/routes/context.ts
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/routes/rag.ts
- artifacts/localai-control-center/src/**/*DigitalTwin*,*Inventory*,*Projects*,*Context*

Implement:
1. Entity model:
   - id, type, name, description, metadata, createdAt, updatedAt
2. Relationship model:
   - source entity, relation type, target entity, confidence, provenance
3. Entity types:
   - room, zone, tool, printer, camera, sensor, vehicle, network_device, vm, container, document, part, filament, project, automation, service
4. API:
   - create/read/update entity
   - create/read/delete relationship
   - search graph
   - entity detail with linked docs/jobs/events
5. UI:
   - Digital Twin explorer
   - entity detail
   - linked documents/projects/devices
6. Tests:
   - entity/relationship CRUD
   - provenance required for AI-created relation
   - deletion does not orphan silently; mark as archived or block with linked refs

Hard limits:
- Do not replace existing RAG/memory; link to it.
- Do not infer high-confidence facts without source/provenance.

Closeout:
Update docs and ledger.
```

---
