import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'AGENTS.md',
  'JARVIS_CODEX_PROMPT_PACK_v2.md',
  'JARVIS_BUILD_KIT_MANIFEST.json',
  'docs/JARVIS_EXECUTION_GUIDE.md',
  'docs/JARVIS_CODEX_WORKFLOW.md',
  'docs/JARVIS_PROMPT_RULES.md',
  'docs/JARVIS_IMPLEMENTATION_LEDGER.md',
  'docs/JARVIS_PHASE_MAP.md',
  'docs/JARVIS_BLOCKERS.md',
  'docs/JARVIS_TEST_MATRIX.md',
  'docs/JARVIS_LOCAL_AI_HANDOFF.md',
  'docs/JARVIS_CONTEXT_INDEX.md',
  'docs/JARVIS_DECISIONS.md',
  'docs/JARVIS_LOCAL_FIRST_POLICY.md',
  'docs/JARVIS_SAFETY_TIERS.md',
  'docs/JARVIS_SOURCE_VERIFICATION.md',
  'docs/JARVIS_UI_STYLE_GUARD.md',
  'docs/JARVIS_REQUIREMENTS_TRACEABILITY.md',
  'docs/JARVIS_PRESTART_ENHANCEMENTS.md',
  'docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md',
  'docs/JARVIS_PHASE_ACCEPTANCE_CONTRACT.md',
  'docs/JARVIS_EXPERT_MODES.md',
  'docs/JARVIS_FINAL_PRESTART_REVIEW.md',
  'phase-prompts/PHASE_00_REPO_BASELINE_AND_CONTEXT_SYSTEM.md',
  'phase-prompts/PHASE_00_AGENT_MEMORY_REPO_TRUTH_AUDIT_AND_BUILD_BASELINE.md',
  'phase-prompts/PHASE_00_5_REPAIR_CURRENT_RUNTIME_BLOCKERS.md',
  'phase-prompts/PHASE_01_GAMING_PC_SAFE_RUNTIME_MODES.md',
  'phase-prompts/PHASE_01_GAMING_PC_SAFE_RUNTIME_MODES_SERVICE_POLICIES_AND_EMERGENCY_STOP.md',
  'phase-prompts/PHASE_02_LOCAL_FIRST_OPTIONAL_API_POLICY.md',
  'phase-prompts/PHASE_02_LOCAL_FIRST_PROVIDER_POLICY_WITH_OPTIONAL_API_KEYS.md',
  'phase-prompts/PHASE_03_APPROVAL_QUEUE_AND_DURABLE_JOBS.md',
  'phase-prompts/PHASE_03_APPROVAL_QUEUE_PERMISSION_TIERS_AND_DURABLE_JOBS.md',
  'phase-prompts/PHASE_04_OBSERVABILITY_EVALS_AND_MISSION_REPLAY.md',
  'phase-prompts/PHASE_04_OBSERVABILITY_EVALS_MISSION_REPLAY_AND_PROOF_HARNESS.md',
  'phase-prompts/PHASE_05_MODEL_ROUTER_AND_MODEL_LIFECYCLE.md',
  'phase-prompts/PHASE_05_UNIFIED_AI_GATEWAY_MODEL_ROUTER_AND_MODEL_LIFECYCLE_MANAGER.md',
  'phase-prompts/PHASE_06_SELF_UPDATING_SELF_IMPROVING_MAINTAINER.md',
  'phase-prompts/PHASE_06_SELF_UPDATING_AND_SELF_IMPROVING_JARVIS_MAINTAINER.md',
  'phase-prompts/PHASE_13B_FREECAD_CAD_AS_CODE_AND_KICAD_ADAPTERS.md',
  'phase-prompts/PHASE_18_AUTOMOTIVE_MECHANIC_AND_VEHICLE_DIAGNOSTICS_ASSISTANT.md',
  'phase-prompts/PHASE_23_FINAL_COVERAGE_AUDIT_AND_GAP_CLOSER.md',
  'prompts/RUN_PHASE_00_NOW.md',
  'prompts/RUN_NEXT_PHASE_TEMPLATE.md',
  'scripts/jarvis/verify-localai-baseline.ps1',
];

const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error('Build kit verification failed. Missing files:');
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

const allMd = required.filter(f => f.endsWith('.md')).map(read).join('\n');
const promptPack = read('JARVIS_CODEX_PROMPT_PACK_v2.md');
const agents = read('AGENTS.md');
const trace = read('docs/JARVIS_REQUIREMENTS_TRACEABILITY.md');
const watchlist = read('docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md');
const expert = read('docs/JARVIS_EXPERT_MODES.md');
const phase13b = read('phase-prompts/PHASE_13B_FREECAD_CAD_AS_CODE_AND_KICAD_ADAPTERS.md');
const phase18 = read('phase-prompts/PHASE_18_AUTOMOTIVE_MECHANIC_AND_VEHICLE_DIAGNOSTICS_ASSISTANT.md');
const phase00Alias = read('phase-prompts/PHASE_00_REPO_BASELINE_AND_CONTEXT_SYSTEM.md');
const phase005Alias = read('phase-prompts/PHASE_00_5_REPAIR_CURRENT_RUNTIME_BLOCKERS.md');
const phase01Alias = read('phase-prompts/PHASE_01_GAMING_PC_SAFE_RUNTIME_MODES.md');
const phase02Alias = read('phase-prompts/PHASE_02_LOCAL_FIRST_OPTIONAL_API_POLICY.md');
const phase03Alias = read('phase-prompts/PHASE_03_APPROVAL_QUEUE_AND_DURABLE_JOBS.md');
const phase04Alias = read('phase-prompts/PHASE_04_OBSERVABILITY_EVALS_AND_MISSION_REPLAY.md');
const phase05Alias = read('phase-prompts/PHASE_05_MODEL_ROUTER_AND_MODEL_LIFECYCLE.md');
const phase06Alias = read('phase-prompts/PHASE_06_SELF_UPDATING_SELF_IMPROVING_MAINTAINER.md');
const testMatrix = read('docs/JARVIS_TEST_MATRIX.md');
const blockers = read('docs/JARVIS_BLOCKERS.md');

const checks = [
  ['no fake placeholder wording', !/\bplaceholder\b/i.test(allMd)],
  ['no legacy phase ledger reference', !/JARVIS_PHASE_LEDGER/.test(allMd)],
  ['Phase 00 alias points to canonical prompt', phase00Alias.includes('PHASE_00_AGENT_MEMORY_REPO_TRUTH_AUDIT_AND_BUILD_BASELINE.md')],
  ['Phase 00.5 alias points to canonical prompt', phase005Alias.includes('PHASE_00_5_REPAIR_CURRENT_RUNTIME_BLOCKERS_BEFORE_FEATURE_EXPANSION.md')],
  ['Phase 01 alias points to canonical prompt', phase01Alias.includes('PHASE_01_GAMING_PC_SAFE_RUNTIME_MODES_SERVICE_POLICIES_AND_EMERGENCY_STOP.md')],
  ['Phase 02 alias points to canonical prompt', phase02Alias.includes('PHASE_02_LOCAL_FIRST_PROVIDER_POLICY_WITH_OPTIONAL_API_KEYS.md')],
  ['Phase 03 alias points to canonical prompt', phase03Alias.includes('PHASE_03_APPROVAL_QUEUE_PERMISSION_TIERS_AND_DURABLE_JOBS.md')],
  ['Phase 04 alias points to canonical prompt', phase04Alias.includes('PHASE_04_OBSERVABILITY_EVALS_MISSION_REPLAY_AND_PROOF_HARNESS.md')],
  ['Phase 05 alias points to canonical prompt', phase05Alias.includes('PHASE_05_UNIFIED_AI_GATEWAY_MODEL_ROUTER_AND_MODEL_LIFECYCLE_MANAGER.md')],
  ['Phase 06 alias points to canonical prompt', phase06Alias.includes('PHASE_06_SELF_UPDATING_AND_SELF_IMPROVING_JARVIS_MAINTAINER.md')],
  ['AGENTS references expert modes', agents.includes('JARVIS_EXPERT_MODES.md')],
  ['AGENTS references UI style guard', agents.includes('JARVIS_UI_STYLE_GUARD.md')],
  ['test matrix includes pnpm install baseline', /pnpm install/.test(testMatrix)],
  ['test matrix includes files changed column', /Files changed/.test(testMatrix)],
  ['test matrix includes blockers column', /Blockers/.test(testMatrix)],
  ['test matrix includes next action column', /Next action/.test(testMatrix)],
  ['blockers include impact column', /\|\s*Impact\s*\|/.test(blockers)],
  ['traceability includes Text-to-CAD', /Text-to-CAD/i.test(trace)],
  ['traceability includes Master Tech', /Master Tech/i.test(trace)],
  ['traceability includes UI preservation', /Preserve existing LOCALAI UI style/i.test(trace)],
  ['watchlist includes gNucleus text-to-cad MCP', /gNucleus Text-to-CAD MCP/i.test(watchlist)],
  ['watchlist includes FreeCAD MCP', /FreeCAD MCP/i.test(watchlist)],
  ['watchlist includes CadQuery', /CadQuery/i.test(watchlist)],
  ['watchlist includes build123d', /build123d/i.test(watchlist)],
  ['watchlist includes KiCad MCP', /KiCad MCP/i.test(watchlist)],
  ['watchlist includes Home Assistant MCP', /Home Assistant MCP/i.test(watchlist)],
  ['watchlist includes OpenClaw', /OpenClaw/i.test(watchlist)],
  ['watchlist includes NemoClaw', /NemoClaw/i.test(watchlist)],
  ['expert modes includes Master Fabricator', /Master Fabricator/i.test(expert)],
  ['expert modes includes Master Tech', /Master Tech/i.test(expert)],
  ['Phase 13B includes Text-to-CAD', /Text-to-CAD/i.test(phase13b)],
  ['Phase 13B includes local-first CAD-as-code', /local-first CAD-as-code/i.test(phase13b)],
  ['Phase 18 upgraded to Master Tech', /Master Tech/i.test(phase18)],
  ['Phase 18 includes Foxbody profile', /1988 Mustang GT hatchback/i.test(phase18)],
  ['prompt pack points to authoritative phase overrides', /AUTHORITATIVE PHASE OVERRIDES FOR v2.6/.test(promptPack)],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error('Build kit verification failed. Failed checks:');
  for (const [name] of failed) console.error(`- ${name}`);
  process.exit(1);
}

console.log('LOCALAI Jarvis Build Kit v2.6 verification passed.');
console.log('Next: read docs/JARVIS_PHASE_MAP.md, then use prompts/RUN_NEXT_PHASE_TEMPLATE.md for the next incomplete phase only.');
