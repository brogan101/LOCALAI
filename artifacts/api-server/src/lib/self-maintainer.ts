import { createHash, randomUUID } from "crypto";
import { execFile } from "child_process";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import {
  createApprovalRequest,
  verifyApprovedRequest,
  type ApprovalRequest,
} from "./approval-queue.js";
import {
  createDurableJob,
  recordAuditEvent,
  updateDurableJobState,
} from "./platform-foundation.js";
import { getCurrentRuntimeMode, type RuntimeMode } from "./runtime-mode.js";
import {
  getModelLifecycleSnapshot,
  proposeModelLifecycleAction,
  type LifecycleActionProposal,
  type ModelLifecycleSnapshot,
} from "./model-lifecycle.js";
import { redactForMissionReplay } from "./mission-replay.js";
import { thoughtLog } from "./thought-log.js";

export type MaintainerUpdateState =
  | "detected"
  | "proposed"
  | "staged"
  | "testing"
  | "passed"
  | "failed"
  | "approved"
  | "applied"
  | "rolled_back"
  | "blocked"
  | "not_configured";

export type MaintainerProposalKind =
  | "localai_app"
  | "package_dependency"
  | "github_release"
  | "docker_image"
  | "mcp_tool"
  | "skill"
  | "model"
  | "self_improvement"
  | "repair";

export type MaintainerAction =
  | "check"
  | "explain"
  | "stage"
  | "test"
  | "apply"
  | "rollback"
  | "repair";

export type SourceTrustStatus =
  | "allowlisted"
  | "explicit_approval_required"
  | "blocked"
  | "not_configured";

export interface UpdateSourceTrust {
  status: SourceTrustStatus;
  reason: string;
  watchlistProject?: string;
}

export interface RollbackPlan {
  required: true;
  summary: string;
  snapshotRequired: true;
  steps: string[];
}

export interface SelfMaintainerProposal {
  id: string;
  kind: MaintainerProposalKind;
  title: string;
  source: string;
  sourceUrl?: string;
  sourceTrust: UpdateSourceTrust;
  currentVersionOrState: string;
  candidateVersionOrState: string;
  changelogUrl?: string;
  changelogSummary?: string;
  riskLevel: "low" | "medium" | "high" | "blocked";
  affectedFiles: string[];
  affectedServices: string[];
  requiredTests: string[];
  rollbackPlan: RollbackPlan;
  approvalRequired: true;
  branchRequired: true;
  applyDirectlyToMainAllowed: false;
  dryRun: boolean;
  localOnly: boolean;
  networkUsed: boolean;
  status: MaintainerUpdateState;
  resultStatus: "not_applied" | "not_configured" | "blocked" | "failed" | "proposal_only";
  resultMessage: string;
  approval?: ApprovalRequest;
  modelProposal?: LifecycleActionProposal;
  metadata: Record<string, unknown>;
}

export interface SelfMaintainerSnapshot {
  success: boolean;
  generatedAt: string;
  sourceOfTruth: string;
  updaterRepairSourceOfTruth: string;
  localFirst: true;
  noPaidApisRequired: true;
  dryRunOnly: boolean;
  networkUsed: boolean;
  runtimeMode: RuntimeMode;
  git: {
    available: boolean;
    branch: string;
    directMainApplyBlocked: true;
    dirtyFileCount: number | "unknown";
  };
  lockfile: {
    present: boolean;
    path: string;
    hash?: string;
  };
  proposals: SelfMaintainerProposal[];
  rules: {
    noSilentUpdates: true;
    noDirectMainApply: true;
    approvalRequiredForMutation: true;
    rollbackPlanRequired: true;
    testsRequiredBeforeApply: true;
    gamingModeReadOnlyOnly: true;
    unknownSourcesBlocked: true;
    secretsRedacted: true;
  };
}

export interface SelfMaintainerActionResult {
  success: false;
  applied: false;
  approvalRequired: boolean;
  approval?: ApprovalRequest;
  dryRun: boolean;
  status: MaintainerUpdateState;
  resultStatus: "not_applied" | "not_configured" | "blocked" | "failed" | "proposal_only";
  message: string;
  proposal: SelfMaintainerProposal;
}

interface WatchlistProject {
  project: string;
  sourceUrl: string;
  category: string;
  coreOptionalFuture: string;
  localFirst: string;
  apiKeyRequired: string;
  licenseRiskNotes: string;
  updateMethod: string;
  runtimeMode: string;
  integrationStatus: string;
}

interface RadarOptions {
  dryRunOnly?: boolean;
  includeNetworkChecks?: boolean;
  runtimeMode?: RuntimeMode;
  currentBranch?: string;
  watchlistPath?: string;
  modelLifecycleSnapshot?: ModelLifecycleSnapshot;
}

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../../..");
const DEFAULT_WATCHLIST_PATH = path.join(REPO_ROOT, "docs", "JARVIS_EXTERNAL_PROJECT_WATCHLIST.md");
const ROOT_PACKAGE_JSON = path.join(REPO_ROOT, "package.json");
const API_PACKAGE_JSON = path.join(REPO_ROOT, "artifacts", "api-server", "package.json");
const UI_PACKAGE_JSON = path.join(REPO_ROOT, "artifacts", "localai-control-center", "package.json");
const PNPM_LOCKFILE = path.join(REPO_ROOT, "pnpm-lock.yaml");

const SOURCE_OF_TRUTH =
  "Existing updater manifest/model state, repair diagnostics, external project watchlist, package manifests/lockfile, Phase 05 model lifecycle proposals, approval queue, durable jobs, audit events, thought log, and rollback snapshots.";

const REQUIRED_CLOSEOUT_TESTS = [
  "node scripts/jarvis/verify-build-kit.mjs",
  "pnpm -r typecheck",
  "pnpm test",
];

function nowIso(): string {
  return new Date().toISOString();
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function fileHash(filePath: string): Promise<string | undefined> {
  try {
    return hashText(await readFile(filePath, "utf-8"));
  } catch {
    return undefined;
  }
}

function parseDependencyCount(pkg: Record<string, unknown> | null): number {
  if (!pkg) return 0;
  const dependencies = pkg["dependencies"] && typeof pkg["dependencies"] === "object"
    ? Object.keys(pkg["dependencies"] as Record<string, unknown>).length
    : 0;
  const devDependencies = pkg["devDependencies"] && typeof pkg["devDependencies"] === "object"
    ? Object.keys(pkg["devDependencies"] as Record<string, unknown>).length
    : 0;
  return dependencies + devDependencies;
}

function redactMaintainerValue<T>(value: T): T {
  return redactForMissionReplay(value).value as T;
}

function rollbackPlan(summary: string): RollbackPlan {
  return {
    required: true,
    summary,
    snapshotRequired: true,
    steps: [
      "Create or verify a repository branch before staging any patch.",
      "Capture changed files, current git ref, lockfile hash, and relevant LOCALAI settings before apply.",
      "Run required targeted and full tests before apply.",
      "Keep old files/models until explicit retirement approval.",
      "Rollback by restoring the pre-apply ref/snapshot and rerunning verification checks.",
    ],
  };
}

function sourceTrust(
  source: string,
  sourceUrl: string | undefined,
  watchlist: WatchlistProject[],
): UpdateSourceTrust {
  const normalizedSource = source.toLowerCase();
  const normalizedUrl = (sourceUrl ?? "").toLowerCase();
  const match = watchlist.find((item) =>
    item.project.toLowerCase() === normalizedSource ||
    (!!normalizedUrl && item.sourceUrl.toLowerCase() === normalizedUrl)
  );

  if (match) {
    if (/verify current|unknown|random/i.test(match.sourceUrl) || /verify current/i.test(match.licenseRiskNotes)) {
      return {
        status: "blocked",
        reason: "Watchlist entry requires current source verification before use.",
        watchlistProject: match.project,
      };
    }
    return {
      status: "allowlisted",
      reason: "Source is present in JARVIS_EXTERNAL_PROJECT_WATCHLIST.md.",
      watchlistProject: match.project,
    };
  }

  if (!sourceUrl || /not_configured|disabled|local manifest/i.test(sourceUrl)) {
    return { status: "not_configured", reason: "No configured update source was provided." };
  }

  return { status: "blocked", reason: "Unknown update sources are blocked until allowlisted or explicitly approved." };
}

export function classifyUpdateSource(
  source: string,
  sourceUrl: string | undefined,
  watchlist: WatchlistProject[] = [],
): UpdateSourceTrust {
  return sourceTrust(source, sourceUrl, watchlist);
}

async function loadWatchlist(filePath = DEFAULT_WATCHLIST_PATH): Promise<{ rows: WatchlistProject[]; error?: string }> {
  try {
    const text = await readFile(filePath, "utf-8");
    const rows: WatchlistProject[] = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith("|")) continue;
      if (line.includes("---") || line.includes("Project | Source URL")) continue;
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      if (cells.length < 10) continue;
      rows.push({
        project: cells[0]!,
        sourceUrl: cells[1]!,
        category: cells[2]!,
        coreOptionalFuture: cells[3]!,
        localFirst: cells[4]!,
        apiKeyRequired: cells[5]!,
        licenseRiskNotes: cells[6]!,
        updateMethod: cells[7]!,
        runtimeMode: cells[8]!,
        integrationStatus: cells[9]!,
      });
    }
    return { rows };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function gitState(branchOverride?: string): Promise<SelfMaintainerSnapshot["git"]> {
  if (branchOverride) {
    return { available: true, branch: branchOverride, directMainApplyBlocked: true, dirtyFileCount: "unknown" };
  }
  try {
    const branchResult = await execFileAsync("git", ["branch", "--show-current"], { cwd: REPO_ROOT, timeout: 3000 });
    const statusResult = await execFileAsync("git", ["status", "--short"], { cwd: REPO_ROOT, timeout: 5000 }).catch(() => ({ stdout: "" }));
    const dirtyFileCount = String(statusResult.stdout ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean).length;
    const branch = String(branchResult.stdout ?? "").trim() || "unknown";
    return { available: true, branch, directMainApplyBlocked: true, dirtyFileCount };
  } catch {
    return { available: false, branch: "unknown", directMainApplyBlocked: true, dirtyFileCount: "unknown" };
  }
}

async function lockfileState(): Promise<SelfMaintainerSnapshot["lockfile"]> {
  return {
    present: existsSync(PNPM_LOCKFILE),
    path: PNPM_LOCKFILE,
    hash: existsSync(PNPM_LOCKFILE) ? await fileHash(PNPM_LOCKFILE) : undefined,
  };
}

function makeProposal(input: {
  kind: MaintainerProposalKind;
  title: string;
  source: string;
  sourceUrl?: string;
  sourceTrust: UpdateSourceTrust;
  currentVersionOrState: string;
  candidateVersionOrState: string;
  riskLevel?: SelfMaintainerProposal["riskLevel"];
  affectedFiles?: string[];
  affectedServices?: string[];
  requiredTests?: string[];
  rollbackSummary: string;
  dryRun: boolean;
  localOnly?: boolean;
  networkUsed?: boolean;
  status?: MaintainerUpdateState;
  resultStatus?: SelfMaintainerProposal["resultStatus"];
  resultMessage?: string;
  changelogUrl?: string;
  changelogSummary?: string;
  modelProposal?: LifecycleActionProposal;
  metadata?: Record<string, unknown>;
}): SelfMaintainerProposal {
  const blockedByTrust = input.sourceTrust.status === "blocked";
  const status = input.status ?? (blockedByTrust ? "blocked" : "proposed");
  const resultStatus = input.resultStatus ?? (
    status === "blocked" ? "blocked" :
    status === "failed" ? "failed" :
    status === "not_configured" ? "not_configured" :
    "proposal_only"
  );
  return {
    id: `maint-${randomUUID()}`,
    kind: input.kind,
    title: input.title,
    source: input.source,
    sourceUrl: input.sourceUrl,
    sourceTrust: input.sourceTrust,
    currentVersionOrState: input.currentVersionOrState,
    candidateVersionOrState: input.candidateVersionOrState,
    changelogUrl: input.changelogUrl,
    changelogSummary: input.changelogSummary,
    riskLevel: input.riskLevel ?? (blockedByTrust ? "blocked" : "medium"),
    affectedFiles: input.affectedFiles ?? [],
    affectedServices: input.affectedServices ?? [],
    requiredTests: input.requiredTests?.length ? input.requiredTests : REQUIRED_CLOSEOUT_TESTS,
    rollbackPlan: rollbackPlan(input.rollbackSummary),
    approvalRequired: true,
    branchRequired: true,
    applyDirectlyToMainAllowed: false,
    dryRun: input.dryRun,
    localOnly: input.localOnly ?? true,
    networkUsed: input.networkUsed ?? false,
    status,
    resultStatus,
    resultMessage: input.resultMessage ?? "Proposal recorded only. No update, install, restart, merge, or delete action was executed.",
    modelProposal: input.modelProposal,
    metadata: redactMaintainerValue(input.metadata ?? {}),
  };
}

async function buildPackageProposal(watchlist: WatchlistProject[], dryRun: boolean): Promise<SelfMaintainerProposal> {
  const [rootPkg, apiPkg, uiPkg, lockHash] = await Promise.all([
    readJsonFile(ROOT_PACKAGE_JSON),
    readJsonFile(API_PACKAGE_JSON),
    readJsonFile(UI_PACKAGE_JSON),
    fileHash(PNPM_LOCKFILE),
  ]);
  const dependencyCount = parseDependencyCount(rootPkg) + parseDependencyCount(apiPkg) + parseDependencyCount(uiPkg);
  const renovateConfigured =
    existsSync(path.join(REPO_ROOT, "renovate.json")) ||
    existsSync(path.join(REPO_ROOT, ".github", "renovate.json"));
  return makeProposal({
    kind: "package_dependency",
    title: "Dependency update review proposal",
    source: "Renovate",
    sourceUrl: "https://docs.renovatebot.com/",
    sourceTrust: sourceTrust("Renovate", "https://docs.renovatebot.com/", watchlist),
    currentVersionOrState: `${dependencyCount} manifest dependencies, lockfile ${lockHash ? lockHash.slice(0, 12) : "missing"}`,
    candidateVersionOrState: renovateConfigured ? "Renovate config present; proposal-only dry run required" : "Renovate not_configured; create config proposal first",
    riskLevel: "medium",
    affectedFiles: ["package.json", "pnpm-lock.yaml", "artifacts/api-server/package.json", "artifacts/localai-control-center/package.json"],
    affectedServices: ["api-server", "localai-control-center"],
    requiredTests: [
      "pnpm install --frozen-lockfile",
      ...REQUIRED_CLOSEOUT_TESTS,
    ],
    rollbackSummary: "Restore package manifests and pnpm-lock.yaml from pre-update snapshot.",
    dryRun,
    status: renovateConfigured ? "proposed" : "not_configured",
    resultStatus: renovateConfigured ? "proposal_only" : "not_configured",
    metadata: {
      dependencyCount,
      renovateConfigured,
      lockfileHash: lockHash,
      lockfileMutated: false,
    },
  });
}

function buildWatchlistProposal(
  watchlist: WatchlistProject[],
  dryRun: boolean,
): SelfMaintainerProposal {
  const maintained = watchlist.filter((item) => /release|package|config|docker|version|watch/i.test(item.updateMethod));
  return makeProposal({
    kind: "github_release",
    title: "Optional integration release radar",
    source: "JARVIS_EXTERNAL_PROJECT_WATCHLIST.md",
    sourceUrl: "local manifest",
    sourceTrust: { status: "allowlisted", reason: "LOCALAI-controlled watchlist file." },
    currentVersionOrState: `${maintained.length} watchlist entries have update methods`,
    candidateVersionOrState: "Network release checks disabled/not_configured until explicitly enabled",
    riskLevel: "low",
    affectedFiles: ["docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md"],
    affectedServices: ["integrations"],
    requiredTests: ["node scripts/jarvis/verify-build-kit.mjs", "pnpm test"],
    rollbackSummary: "Revert any integration config proposal and leave integrations disabled.",
    dryRun,
    status: "not_configured",
    resultStatus: "not_configured",
    metadata: {
      optionalProvider: "github_release_checks",
      configured: false,
      networkUsed: false,
      sampleProjects: maintained.slice(0, 8).map((item) => item.project),
    },
  });
}

function buildDockerProposal(watchlist: WatchlistProject[], dryRun: boolean): SelfMaintainerProposal {
  const dockerProjects = watchlist.filter((item) => /docker/i.test(`${item.category} ${item.updateMethod} ${item.sourceUrl}`));
  return makeProposal({
    kind: "docker_image",
    title: "Docker image update radar",
    source: "JARVIS_EXTERNAL_PROJECT_WATCHLIST.md",
    sourceUrl: "local manifest",
    sourceTrust: { status: "allowlisted", reason: "LOCALAI-controlled watchlist file." },
    currentVersionOrState: `${dockerProjects.length} Docker-capable/watchlist entries detected`,
    candidateVersionOrState: "Docker image checks not_configured; no image pull performed",
    riskLevel: "medium",
    affectedFiles: ["docker-compose.yml", "integration manifests"],
    affectedServices: dockerProjects.map((item) => item.project).slice(0, 8),
    requiredTests: ["docker compose config", ...REQUIRED_CLOSEOUT_TESTS],
    rollbackSummary: "Restore previous image tags/config and stop staged containers only after approval.",
    dryRun,
    status: "not_configured",
    resultStatus: "not_configured",
    metadata: { dockerProjects: dockerProjects.map((item) => item.project), noImagePulled: true },
  });
}

function buildMcpSkillProposal(watchlist: WatchlistProject[], dryRun: boolean): SelfMaintainerProposal {
  const mcpProjects = watchlist.filter((item) => /mcp|skill|tool/i.test(`${item.project} ${item.category}`));
  const openClaw = watchlist.find((item) => /openclaw|nemoclaw/i.test(item.project));
  return makeProposal({
    kind: "mcp_tool",
    title: "MCP/tool/skill update radar",
    source: openClaw?.project ?? "MCP/tool watchlist",
    sourceUrl: openClaw?.sourceUrl ?? "local manifest",
    sourceTrust: openClaw
      ? sourceTrust(openClaw.project, openClaw.sourceUrl, watchlist)
      : { status: "not_configured", reason: "No MCP update provider configured." },
    currentVersionOrState: `${mcpProjects.length} MCP/tool/skill watchlist entries detected`,
    candidateVersionOrState: "Provider checks disabled/not_configured; unverified OpenClaw/NemoClaw sources blocked",
    riskLevel: openClaw ? "blocked" : "medium",
    affectedFiles: ["MCP/tool registry configuration"],
    affectedServices: mcpProjects.map((item) => item.project).slice(0, 8),
    requiredTests: ["pnpm test", "node scripts/jarvis/verify-build-kit.mjs"],
    rollbackSummary: "Disable staged tool/skill entry and restore previous registry/config snapshot.",
    dryRun,
    status: openClaw ? "blocked" : "not_configured",
    resultStatus: openClaw ? "blocked" : "not_configured",
    metadata: {
      mcpProjects: mcpProjects.map((item) => item.project),
      unknownSourcesBlocked: true,
      installScriptsExecuted: false,
    },
  });
}

async function buildModelProposal(
  dryRun: boolean,
  snapshot?: ModelLifecycleSnapshot,
): Promise<SelfMaintainerProposal> {
  try {
    const lifecycle = snapshot ?? await getModelLifecycleSnapshot();
    const current = lifecycle.models.find((model) => model.role.length > 0) ?? lifecycle.models[0];
    const modelProposal = current
      ? await proposeModelLifecycleAction({
          action: "replace",
          currentModelName: current.name,
          candidateModelName: current.name,
          role: current.role[0] ?? "chat",
          dryRunOnly: true,
          evalProof: current.evalScores,
          snapshot: lifecycle,
        })
      : undefined;
    return makeProposal({
      kind: "model",
      title: "Model lifecycle update/replacement radar",
      source: "Phase 05 model lifecycle",
      sourceUrl: "local manifest",
      sourceTrust: { status: "allowlisted", reason: "Phase 05 local model lifecycle source." },
      currentVersionOrState: lifecycle.models.length ? `${lifecycle.models.length} installed local model(s)` : "No installed local models reported",
      candidateVersionOrState: lifecycle.models.length ? "Replacement candidates require Phase 05 eval and approval rules" : "not_configured until local models exist",
      riskLevel: "medium",
      affectedFiles: ["LocalAI model role assignments", "Ollama model cache"],
      affectedServices: ["ollama-models"],
      requiredTests: ["pnpm --filter api-server run test:model-lifecycle", ...REQUIRED_CLOSEOUT_TESTS],
      rollbackSummary: "Retain old model and role assignment until replacement eval proof and explicit retirement approval exist.",
      dryRun,
      status: lifecycle.models.length ? "proposed" : "not_configured",
      resultStatus: lifecycle.models.length ? "proposal_only" : "not_configured",
      modelProposal,
      metadata: {
        routingSourceOfTruth: lifecycle.routingSourceOfTruth,
        phase05Rules: lifecycle.rules,
        oldModelRetained: true,
        autoDeletesOldModel: false,
        autoPullsModel: false,
      },
    });
  } catch (error) {
    return makeProposal({
      kind: "model",
      title: "Model lifecycle update/replacement radar",
      source: "Phase 05 model lifecycle",
      sourceUrl: "local manifest",
      sourceTrust: { status: "allowlisted", reason: "Phase 05 local model lifecycle source." },
      currentVersionOrState: "model lifecycle unavailable",
      candidateVersionOrState: "not_configured until lifecycle snapshot is available",
      riskLevel: "medium",
      affectedFiles: [],
      affectedServices: ["ollama-models"],
      requiredTests: ["pnpm --filter api-server run test:model-lifecycle", ...REQUIRED_CLOSEOUT_TESTS],
      rollbackSummary: "No model change is allowed while lifecycle state is unavailable.",
      dryRun,
      status: "not_configured",
      resultStatus: "not_configured",
      metadata: { error: error instanceof Error ? error.message : String(error) },
    });
  }
}

function buildLocalAppProposal(
  watchlist: WatchlistProject[],
  git: SelfMaintainerSnapshot["git"],
  dryRun: boolean,
): SelfMaintainerProposal {
  return makeProposal({
    kind: "localai_app",
    title: "LOCALAI app state/update proposal",
    source: "LOCALAI existing repo",
    sourceUrl: "https://github.com/brogan101/LOCALAI",
    sourceTrust: sourceTrust("LOCALAI existing repo", "https://github.com/brogan101/LOCALAI", watchlist),
    currentVersionOrState: `branch ${git.branch}, dirty files ${git.dirtyFileCount}`,
    candidateVersionOrState: "branch/staged proposal only; no main apply",
    riskLevel: git.branch === "main" ? "high" : "medium",
    affectedFiles: ["LOCALAI repository files"],
    affectedServices: ["api-server", "localai-control-center"],
    requiredTests: REQUIRED_CLOSEOUT_TESTS,
    rollbackSummary: "Create a branch/snapshot and revert to the pre-update git ref if validation fails.",
    dryRun,
    status: "detected",
    resultStatus: "proposal_only",
    metadata: { branch: git.branch, dirtyFileCount: git.dirtyFileCount, directMainApplyBlocked: true },
  });
}

function buildFailedWatchlistProposal(error: string, dryRun: boolean): SelfMaintainerProposal {
  return makeProposal({
    kind: "github_release",
    title: "External watchlist unavailable",
    source: "JARVIS_EXTERNAL_PROJECT_WATCHLIST.md",
    sourceUrl: DEFAULT_WATCHLIST_PATH,
    sourceTrust: { status: "not_configured", reason: "Watchlist could not be read." },
    currentVersionOrState: "watchlist read failed",
    candidateVersionOrState: "not_configured until watchlist is readable",
    riskLevel: "medium",
    affectedFiles: ["docs/JARVIS_EXTERNAL_PROJECT_WATCHLIST.md"],
    affectedServices: ["integrations"],
    requiredTests: ["node scripts/jarvis/verify-build-kit.mjs"],
    rollbackSummary: "No external update check may proceed until the watchlist source is restored.",
    dryRun,
    status: "failed",
    resultStatus: "failed",
    resultMessage: `Update radar failed loudly for watchlist input: ${error}`,
    metadata: { error },
  });
}

export async function runSelfMaintainerRadar(options: RadarOptions = {}): Promise<SelfMaintainerSnapshot> {
  const dryRun = options.dryRunOnly !== false;
  const runtimeMode = options.runtimeMode ?? getCurrentRuntimeMode();
  const [watchlistResult, git, lockfile] = await Promise.all([
    loadWatchlist(options.watchlistPath),
    gitState(options.currentBranch),
    lockfileState(),
  ]);
  const watchlist = watchlistResult.rows;
  const proposals: SelfMaintainerProposal[] = [];
  if (watchlistResult.error) proposals.push(buildFailedWatchlistProposal(watchlistResult.error, dryRun));
  proposals.push(buildLocalAppProposal(watchlist, git, dryRun));
  proposals.push(await buildPackageProposal(watchlist, dryRun));
  proposals.push(buildWatchlistProposal(watchlist, dryRun));
  proposals.push(buildDockerProposal(watchlist, dryRun));
  proposals.push(buildMcpSkillProposal(watchlist, dryRun));
  proposals.push(await buildModelProposal(dryRun, options.modelLifecycleSnapshot));

  const snapshot: SelfMaintainerSnapshot = {
    success: !proposals.some((proposal) => proposal.status === "failed"),
    generatedAt: nowIso(),
    sourceOfTruth: SOURCE_OF_TRUTH,
    updaterRepairSourceOfTruth: "routes/updater.ts, routes/updates.ts, routes/repair.ts, and lib/self-maintainer.ts share the existing updater/repair surface.",
    localFirst: true,
    noPaidApisRequired: true,
    dryRunOnly: dryRun,
    networkUsed: false,
    runtimeMode,
    git,
    lockfile,
    proposals,
    rules: {
      noSilentUpdates: true,
      noDirectMainApply: true,
      approvalRequiredForMutation: true,
      rollbackPlanRequired: true,
      testsRequiredBeforeApply: true,
      gamingModeReadOnlyOnly: true,
      unknownSourcesBlocked: true,
      secretsRedacted: true,
    },
  };

  const job = createDurableJob({
    kind: "self-maintainer.radar",
    state: "queued",
    payload: redactMaintainerValue({
      dryRun,
      includeNetworkChecks: options.includeNetworkChecks === true,
      proposalCount: proposals.length,
      failedCount: proposals.filter((proposal) => proposal.status === "failed").length,
    }),
  });
  updateDurableJobState(job.id, snapshot.success ? "completed" : "failed", {
    message: snapshot.success ? "Self-maintainer radar completed in dry-run/proposal mode" : "Self-maintainer radar recorded failed checks",
    result: {
      proposalCount: proposals.length,
      dryRun,
      networkUsed: false,
      failed: proposals.filter((proposal) => proposal.status === "failed").map((proposal) => proposal.title),
    },
    error: snapshot.success ? undefined : "One or more maintainer checks failed; no update was applied.",
  });

  recordAuditEvent({
    eventType: "self_maintainer",
    action: "radar",
    target: "updates",
    result: snapshot.success ? "success" : "failed",
    metadata: redactMaintainerValue({
      jobId: job.id,
      dryRun,
      networkUsed: false,
      proposalCount: proposals.length,
      failedCount: proposals.filter((proposal) => proposal.status === "failed").length,
    }),
  });
  thoughtLog.publish({
    level: snapshot.success ? "info" : "warning",
    category: "system",
    title: "Self-Maintainer Radar",
    message: `Generated ${proposals.length} update proposal(s) in dry-run mode. No update was applied.`,
    metadata: { jobId: job.id, proposalCount: proposals.length },
  });

  return snapshot;
}

export async function getSelfMaintainerSnapshot(): Promise<SelfMaintainerSnapshot> {
  return runSelfMaintainerRadar({ dryRunOnly: true, includeNetworkChecks: false });
}

function buildApprovalPayload(proposal: SelfMaintainerProposal, action: MaintainerAction): Record<string, unknown> {
  return redactMaintainerValue({
    action,
    proposalId: proposal.id,
    kind: proposal.kind,
    source: proposal.source,
    sourceUrl: proposal.sourceUrl ?? "",
    sourceTrustStatus: proposal.sourceTrust.status,
    affectedFiles: proposal.affectedFiles,
    affectedServices: proposal.affectedServices,
    requiredTests: proposal.requiredTests,
    branchRequired: proposal.branchRequired,
    applyDirectlyToMainAllowed: proposal.applyDirectlyToMainAllowed,
    rollback: proposal.rollbackPlan,
    diff: `Self-maintainer ${action} proposal only. No patch has been applied.`,
  });
}

export function verifySelfMaintainerApproval(
  approvalId: string | undefined,
  proposal: SelfMaintainerProposal,
  action: MaintainerAction,
) {
  return verifyApprovedRequest(approvalId, buildApprovalPayload(proposal, action), "self-maintainer.update");
}

export async function proposeSelfMaintainerAction(input: {
  action: MaintainerAction;
  targetIds?: string[];
  sourceKind?: MaintainerProposalKind;
  dryRunOnly?: boolean;
  approvalId?: string;
  runtimeMode?: RuntimeMode;
  currentBranch?: string;
  details?: Record<string, unknown>;
}): Promise<SelfMaintainerActionResult> {
  const runtimeMode = input.runtimeMode ?? getCurrentRuntimeMode();
  const git = await gitState(input.currentBranch);
  const targetIds = input.targetIds?.filter(Boolean) ?? [];
  const dryRun = input.dryRunOnly === true;
  const mutating = ["stage", "test", "apply", "rollback", "repair"].includes(input.action);
  const sourceKind = input.sourceKind ?? (input.action === "repair" ? "repair" : "localai_app");
  const proposal = makeProposal({
    kind: sourceKind,
    title: `Self-maintainer ${input.action} proposal`,
    source: sourceKind === "repair" ? "LOCALAI repair diagnostics" : "LOCALAI existing repo",
    sourceUrl: sourceKind === "repair" ? "local manifest" : "https://github.com/brogan101/LOCALAI",
    sourceTrust: { status: "allowlisted", reason: "LOCALAI-owned local updater/repair surface." },
    currentVersionOrState: targetIds.length ? targetIds.join(", ") : "selected maintainer target",
    candidateVersionOrState: "proposal/staged branch only; no direct apply",
    riskLevel: "high",
    affectedFiles: sourceKind === "package_dependency" ? ["package.json", "pnpm-lock.yaml"] : ["LOCALAI repository files"],
    affectedServices: ["api-server", "localai-control-center"],
    requiredTests: sourceKind === "package_dependency"
      ? ["pnpm install --frozen-lockfile", ...REQUIRED_CLOSEOUT_TESTS]
      : REQUIRED_CLOSEOUT_TESTS,
    rollbackSummary: "Restore pre-action repo snapshot/ref and settings backup before any apply is considered.",
    dryRun,
    status: "proposed",
    resultStatus: "proposal_only",
    metadata: {
      targetIds,
      runtimeMode,
      currentBranch: git.branch,
      details: redactMaintainerValue(input.details ?? {}),
      noCommandExecuted: true,
      noInstallExecuted: true,
      noServiceRestarted: true,
    },
  });

  if (runtimeMode === "Gaming" && mutating && !dryRun) {
    proposal.status = "blocked";
    proposal.resultStatus = "blocked";
    proposal.resultMessage = "Gaming Mode allows read-only/dry-run maintainer checks only. No update action executed.";
    recordAuditEvent({
      eventType: "self_maintainer",
      action: `${input.action}.blocked_gaming`,
      target: proposal.id,
      result: "blocked",
      metadata: { runtimeMode, targetIds },
    });
    return {
      success: false,
      applied: false,
      approvalRequired: true,
      dryRun,
      status: "blocked",
      resultStatus: "blocked",
      message: proposal.resultMessage,
      proposal,
    };
  }

  if (input.action === "apply" && git.branch === "main" && !dryRun) {
    proposal.status = "blocked";
    proposal.resultStatus = "blocked";
    proposal.resultMessage = "Direct apply on main is blocked. Create a branch/staged proposal and approval first.";
    recordAuditEvent({
      eventType: "self_maintainer",
      action: "apply.blocked_main",
      target: proposal.id,
      result: "blocked",
      metadata: { branch: git.branch, targetIds },
    });
    return {
      success: false,
      applied: false,
      approvalRequired: true,
      dryRun,
      status: "blocked",
      resultStatus: "blocked",
      message: proposal.resultMessage,
      proposal,
    };
  }

  const payload = buildApprovalPayload(proposal, input.action);
  if (input.approvalId) {
    const verification = verifyApprovedRequest(input.approvalId, payload, "self-maintainer.update");
    if (!verification.allowed) {
      proposal.status = "blocked";
      proposal.resultStatus = "blocked";
      proposal.resultMessage = verification.message;
      return {
        success: false,
        applied: false,
        approvalRequired: true,
        approval: verification.approval,
        dryRun,
        status: "blocked",
        resultStatus: "blocked",
        message: verification.message,
        proposal,
      };
    }
    proposal.status = "approved";
    proposal.resultStatus = "not_configured";
    proposal.resultMessage = "Approval verified, but real apply/stage/test execution adapters are proposal-only in Phase 06. No update was applied.";
    return {
      success: false,
      applied: false,
      approvalRequired: false,
      approval: verification.approval,
      dryRun,
      status: "approved",
      resultStatus: "not_configured",
      message: proposal.resultMessage,
      proposal,
    };
  }

  let approval: ApprovalRequest | undefined;
  if (mutating && !dryRun) {
    approval = createApprovalRequest({
      type: "self-maintainer.update",
      title: `Approve self-maintainer ${input.action}`,
      summary: `Approve a staged/proposal-only ${input.action} workflow. No direct main apply is allowed.`,
      riskTier: "tier3_file_modification",
      requestedAction: `self-maintainer.${input.action}`,
      payload,
    });
    proposal.approval = approval;
    proposal.status = "proposed";
    proposal.resultStatus = "not_applied";
    proposal.resultMessage = "Approval request created. No update, install, restart, merge, or delete action was executed.";
  }

  recordAuditEvent({
    eventType: "self_maintainer",
    action: `${input.action}.proposal`,
    target: proposal.id,
    result: "success",
    metadata: redactMaintainerValue({
      approvalId: approval?.id,
      dryRun,
      targetIds,
      runtimeMode,
      currentBranch: git.branch,
      applied: false,
    }),
  });
  thoughtLog.publish({
    level: approval ? "warning" : "info",
    category: "system",
    title: "Self-Maintainer Proposal",
    message: `${input.action} proposal recorded. No update was applied.`,
    metadata: { approvalId: approval?.id, proposalId: proposal.id },
  });

  return {
    success: false,
    applied: false,
    approvalRequired: Boolean(approval),
    approval,
    dryRun,
    status: proposal.status,
    resultStatus: proposal.resultStatus,
    message: proposal.resultMessage,
    proposal,
  };
}

export async function createSelfImprovementProposal(input: {
  request: string;
  files?: string[];
  dryRunOnly?: boolean;
}): Promise<SelfMaintainerActionResult> {
  const requestHash = hashText(input.request);
  const sanitizedSummary = redactMaintainerValue({
    requestHash,
    requestPreview: input.request.slice(0, 160),
  });
  return proposeSelfMaintainerAction({
    action: "stage",
    sourceKind: "self_improvement",
    targetIds: input.files?.length ? input.files : ["chat-driven-self-improvement"],
    dryRunOnly: input.dryRunOnly === true,
    details: {
      requestHash,
      sanitizedSummary,
      createsPlanOnly: true,
      createsDiffProposalOnly: true,
      noCodeApplied: true,
      noDependencyInstall: true,
    },
  });
}

export function selfMaintainerSourceOfTruth(): string {
  return SOURCE_OF_TRUTH;
}
