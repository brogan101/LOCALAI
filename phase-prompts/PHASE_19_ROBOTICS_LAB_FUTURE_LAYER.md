# PHASE 19 — Robotics Lab Future Layer

```text
Work inside existing LOCALAI. Read persistent context docs first.

Goal:
Prepare for future ROS 2 / MoveIt / Nav2 / Gazebo robotics without risking physical hardware. This phase is architecture and simulator-first.

Target files:
- artifacts/api-server/src/routes/studios.ts
- artifacts/api-server/src/routes/integrations.ts
- artifacts/api-server/src/db/schema.ts
- artifacts/localai-control-center/src/**/*Robotics*,*Studios*,*Integrations*

Implement:
1. Robotics integration profiles:
   - ROS 2
   - MoveIt 2
   - Nav2
   - Gazebo/Ignition simulator
   - depth camera profile
   - all disabled until configured
2. Robot capability model:
   - simulation only
   - read state
   - plan motion
   - execute motion approval-required
   - manual-only for unsafe actuators
3. Simulator-first workflow:
   - import robot/project profile
   - plan task
   - simulate
   - show result
   - physical execution blocked by default
4. UI:
   - Robotics Lab page/card
   - simulator status
   - motion safety tier badges
5. Tests:
   - physical motion blocked by default
   - simulator unavailable is explicit
   - manual-only tier cannot execute through API

Hard limits:
- No physical robot movement in this phase.
- No actuator control without explicit future implementation and safety review.

Closeout:
Update docs and ledger.
```

---
