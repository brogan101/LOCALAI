/**
 * LOCALAI — Master Route Index
 * =============================
 * Phase 24 + Stage 6 + Stage 7 + Phase 25 — all routes in one place.
 *
 * Route inventory (full):
 *
 * PRE-EXISTING (no prefix, exact legacy behaviour):
 *   health, stack, models, workspace (+git from Stage7), system, updates,
 *   continue, studios (page), remote, chat, sessions (+bulk/export/search Stage7),
 *   filebrowser, context, intelligence, integrations, usage, updater, repair,
 *   kernel, observability, tasks, rollback, stt, tts, rag, evidence, web,
 *   benchmark, pinboard, token-budget, timetravel, plugins, worldgui, foundation,
 *   approvals, runtime-mode, provider-policy, voice, business, it-support, homelab
 *
 * PHASE 24:
 *   GET/POST /v1/*                    OpenAI-compat
 *   /project-foreman/*                Project Foreman CRUD
 *   /executor/*                       Approved executor + emergency stop
 *   /it-support/executor/*            IT executor (validate/dry-run/execute/verify)
 *   /executions/:jobId/proof/*        Proof bundle viewer
 *   /local-builder/*                  Local builder patch executor
 *   /rag/executor/*                   RAG ingest executor
 *   /browser/*                        Playwright executor
 *   /inventory/executor/*             Inventory executor
 *   /home-autopilot/executor/*        Home Autopilot executor
 *   /business/executor/*              Business draft executor (Stage6 patched)
 *
 * PHASE 25:
 *   GET  /hardware/intelligence        Live VRAM probe + ranked model list + quant advice
 *   GET  /hardware/gpu                 Raw GPU probe
 *   GET  /hardware/canfit/:vram        Headroom check
 *   POST /automotive/executor/execute  OBD/ECU/HPTuners log import + anomaly detect
 *   GET  /automotive/executor/supported-pids
 *   POST /studios/executor/image       ComfyUI image gen
 *   POST /studios/executor/tts         Piper TTS render
 *   POST /studios/executor/stt         Whisper STT job
 *   POST /homelab/executor/proxmox     Proxmox VM lifecycle
 *   POST /homelab/executor/opnsense    OPNsense firewall/aliases
 *   POST /homelab/executor/netbox      NetBox DCIM/IPAM
 *   POST /rag/agentic                  Agentic RAG multi-step loop
 *   POST /rag/agentic/simple           Single-pass RAG fast path
 */

import { Router } from "express";

// ── Pre-existing routes ───────────────────────────────────────────────────────
import health         from "./health.js";
import stack          from "./stack.js";
import models         from "./models.js";
import workspace      from "./workspace.js";
import system         from "./system.js";
import updates        from "./updates.js";
import continueRoute  from "./continue.js";
import studios        from "./studios.js";
import remote         from "./remote.js";
import chat           from "./chat.js";
import filebrowser    from "./filebrowser.js";
import context        from "./context.js";
import intelligence   from "./intelligence.js";
import integrations   from "./integrations.js";
import usage          from "./usage.js";
import updater        from "./updater.js";
import repair         from "./repair.js";
import kernel         from "./kernel.js";
import observability  from "./observability.js";
import tasks          from "./tasks.js";
import rollback       from "./rollback.js";
import sessions       from "./sessions.js";
import stt            from "./stt.js";
import tts            from "./tts.js";
import ragRoute       from "./rag.js";
import evidence       from "./evidence.js";
import web            from "./web.js";
import benchmark      from "./benchmark.js";
import pinboard       from "./pinboard.js";
import tokenBudget    from "./token-budget.js";
import timetravel     from "./timetravel.js";
import plugins        from "./plugins.js";
import worldgui       from "./worldgui.js";
import foundation     from "./foundation.js";
import runtimeMode    from "./runtime-mode.js";
import providerPolicy from "./provider-policy.js";
import approvals      from "./approvals.js";
import voice          from "./voice.js";
import business       from "./business.js";
import itSupport      from "./it-support.js";
import homeLab        from "./homelab.js";

// ── Phase 24 routes ───────────────────────────────────────────────────────────
import openai            from "./openai.js";
import projectForeman    from "./project-foreman.js";
import executorRoute     from "./executor.js";
import localBuilder      from "./local-builder.js";
import ragExecutor       from "./rag-executor.js";
import browserExecutor   from "./browser-executor.js";
import newExecutors      from "./new-executors.js";
import businessExecutor  from "./business-executor.js";

// ── Phase 25 routes ───────────────────────────────────────────────────────────
import hardwareRouter from "./hardware.js";
import {
  automotiveExecutorRouter,
  studiosExecutorRouter,
  homelabExecutorRouter,
  agenticRagRouter,
} from "./phase25-executors.js";

const router = Router();

// ── Pre-existing (no prefix) ──────────────────────────────────────────────────
router.use(health);
router.use(stack);
router.use(models);
router.use(workspace);
router.use(system);
router.use(updates);
router.use(continueRoute);
router.use(studios);
router.use(remote);
router.use(chat);
router.use(sessions);
router.use(filebrowser);
router.use(context);
router.use(intelligence);
router.use(integrations);
router.use(usage);
router.use(updater);
router.use(repair);
router.use(kernel);
router.use(observability);
router.use(tasks);
router.use(rollback);
router.use(stt);
router.use(tts);
router.use(ragRoute);
router.use(evidence);
router.use(web);
router.use(benchmark);
router.use(pinboard);
router.use(tokenBudget);
router.use(timetravel);
router.use(plugins);
router.use(worldgui);
router.use(foundation);
router.use(approvals);
router.use(runtimeMode);
router.use(providerPolicy);
router.use(voice);
router.use(business);
router.use(itSupport);
router.use(homeLab);

// ── Phase 24 (no prefix — self-contained paths) ───────────────────────────────
router.use(openai);           // /v1/*
router.use(projectForeman);   // /project-foreman/*
router.use(executorRoute);    // /executor/*, /it-support/executor/*, /executions/*
router.use(localBuilder);     // /local-builder/*
router.use(ragExecutor);      // /rag/executor/*
router.use(browserExecutor);  // /browser/*
router.use(newExecutors);     // /inventory/executor/*, /home-autopilot/executor/*
router.use(businessExecutor); // /business/executor/*

// ── Phase 25 (explicit prefixes) ─────────────────────────────────────────────
router.use("/hardware",              hardwareRouter);
router.use("/automotive/executor",   automotiveExecutorRouter);
router.use("/studios/executor",      studiosExecutorRouter);
router.use("/homelab/executor",      homelabExecutorRouter);
router.use("/rag/agentic",           agenticRagRouter);

export default router;
