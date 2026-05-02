import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Server, Play, Square, RotateCcw, HardDrive, Github, RefreshCw,
  Download, RotateCcwIcon, AlertTriangle, CheckCircle, XCircle,
  Package, Shield, ChevronDown, ChevronRight, Loader2,
  History, Wrench, ArrowDownToLine, Monitor, Keyboard, MousePointer,
  Camera, Search, Clock, FileDiff, RotateCcw as Restore,
  Database, Gamepad2, Power, Activity, ListChecks,
} from "lucide-react";
import api, {
  apiErrorMessage,
  type StackComponent, type RepairLogEntry, type RepairHealthEntry,
  type BackupEntry, type OsWindow, type TimeTravelBackup, type TimeTravelDiff,
  type DurableFoundationJob, type FoundationAuditEvent, type WorkspaceRoot,
  type RuntimeMode, type ServicePolicy, type ApprovalRequest,
  type MissionReplayEvent, type LocalEvalReport,
  type SelfMaintainerSnapshot, type SelfMaintainerProposal,
  type RecoveryBackupManifest,
} from "../api.js";
import { PermissionNotice } from "../components/PermissionNotice.js";
import { useAgentPermissions } from "../hooks/useAgentPermissions.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      {children}
    </div>
  );
}

function CardHeader({ icon: Icon, title, actions }: {
  icon: React.ElementType;
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-3"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      <Icon size={14} style={{ color: "var(--color-accent)" }} />
      <span className="text-sm font-semibold flex-1" style={{ color: "var(--color-foreground)" }}>{title}</span>
      {actions}
    </div>
  );
}

function StatusDot({ running, installed }: { running?: boolean; installed?: boolean }) {
  const color = running ? "var(--color-success)" : installed ? "var(--color-warn)" : "var(--color-muted)";
  const label = running ? "running" : installed ? "installed" : "not installed";
  return (
    <span className="flex items-center gap-1.5 text-xs" style={{ color }}>
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: color }} />
      {label}
    </span>
  );
}

function Btn({
  onClick, disabled, children, variant = "default", size = "sm",
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: "default" | "accent" | "danger";
  size?: "sm" | "xs";
}) {
  const bg =
    variant === "accent" ? "var(--color-accent)" :
    variant === "danger" ? "color-mix(in srgb, var(--color-error) 15%, transparent)" :
    "var(--color-elevated)";
  const color =
    variant === "accent" ? "#fff" :
    variant === "danger" ? "var(--color-error)" :
    "var(--color-muted)";
  const px = size === "xs" ? "px-2 py-0.5 text-xs" : "px-3 py-1.5 text-xs";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-lg font-medium transition-opacity disabled:opacity-40 ${px}`}
      style={{ background: bg, color, border: `1px solid ${variant === "default" ? "var(--color-border)" : "transparent"}` }}>
      {children}
    </button>
  );
}

function Feedback({ isPending, isSuccess, isError, pendingMsg, successMsg, error }: {
  isPending: boolean; isSuccess: boolean; isError: boolean;
  pendingMsg: string; successMsg: string; error?: Error | null;
}) {
  if (isPending) return <span className="text-xs" style={{ color: "var(--color-muted)" }}>{pendingMsg}</span>;
  if (isSuccess) return <span className="text-xs" style={{ color: "var(--color-success)" }}>{successMsg}</span>;
  if (isError && error) return <span className="text-xs" style={{ color: "var(--color-error)" }}>{apiErrorMessage(error)}</span>;
  return null;
}

// ── Stack Panel ───────────────────────────────────────────────────────────────

function StackPanel() {
  const qc = useQueryClient();
  const permissions = useAgentPermissions();
  const execDisabled = permissions.settings ? !permissions.canExec : false;
  const editsDisabled = permissions.settings ? !permissions.canEdit : false;

  const stackQ = useQuery({
    queryKey: ["stack-status"],
    queryFn: () => api.stack.status(),
    refetchInterval: 15_000,
  });

  const githubQ = useQuery({
    queryKey: ["github-status"],
    queryFn: () => api.stack.githubStatus(),
    staleTime: 60_000,
  });

  const startMut  = useMutation({ mutationFn: (id: string) => api.stack.startComponent(id),   onSuccess: () => void qc.invalidateQueries({ queryKey: ["stack-status"] }) });
  const stopMut   = useMutation({ mutationFn: (id: string) => api.stack.stopComponent(id),    onSuccess: () => void qc.invalidateQueries({ queryKey: ["stack-status"] }) });
  const restartMut= useMutation({ mutationFn: (id: string) => api.stack.restartComponent(id), onSuccess: () => void qc.invalidateQueries({ queryKey: ["stack-status"] }) });
  const backupMut = useMutation({ mutationFn: () => api.stack.backup() });
  const ghAuthMut = useMutation({ mutationFn: () => api.stack.githubAuth(), onSuccess: () => void qc.invalidateQueries({ queryKey: ["github-status"] }) });

  const components: StackComponent[] = stackQ.data?.components ?? [];
  const gh = githubQ.data;

  const busy = (id: string) =>
    (startMut.isPending   && startMut.variables   === id) ||
    (stopMut.isPending    && stopMut.variables    === id) ||
    (restartMut.isPending && restartMut.variables === id);

  return (
    <Card>
      <CardHeader icon={Server} title="Stack Components"
        actions={
          <div className="flex items-center gap-2">
            <Btn onClick={() => backupMut.mutate()} disabled={backupMut.isPending || editsDisabled}>
              <HardDrive size={11} /> {backupMut.isPending ? "Backing up…" : "Backup"}
            </Btn>
            {backupMut.isSuccess && backupMut.data?.message && (
              <span className="text-xs" style={{ color: "var(--color-success)" }}>
                {backupMut.data.message}
              </span>
            )}
          </div>
        }
      />

      {stackQ.isLoading && <div className="p-6 text-sm text-center" style={{ color: "var(--color-muted)" }}>Loading…</div>}
      {execDisabled && <div className="px-4 pt-3"><PermissionNotice permission="allowAgentExec" /></div>}
      {editsDisabled && <div className="px-4 pt-3"><PermissionNotice permission="allowAgentEdits" /></div>}

      {components.map((c) => (
        <div key={c.id}
          className="flex items-center gap-3 px-4 py-3 text-sm"
          style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm" style={{ color: "var(--color-foreground)" }}>{c.name}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusDot running={c.running} installed={c.installed} />
              {c.version && <span className="text-xs font-mono" style={{ color: "var(--color-muted)" }}>{c.version}</span>}
              <span className="text-xs capitalize" style={{ color: "var(--color-muted)" }}>{c.category}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {busy(c.id) && <Loader2 size={13} className="animate-spin" style={{ color: "var(--color-muted)" }} />}
            {c.installed && !c.running && (
              <Btn onClick={() => startMut.mutate(c.id)} disabled={busy(c.id) || execDisabled}>
                <Play size={10} /> Start
              </Btn>
            )}
            {c.running && (
              <>
                <Btn onClick={() => restartMut.mutate(c.id)} disabled={busy(c.id) || execDisabled}>
                  <RotateCcw size={10} /> Restart
                </Btn>
                <Btn onClick={() => stopMut.mutate(c.id)} disabled={busy(c.id) || execDisabled} variant="danger">
                  <Square size={10} /> Stop
                </Btn>
              </>
            )}
          </div>
        </div>
      ))}

      {/* GitHub auth */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Github size={14} style={{ color: gh?.authenticated ? "var(--color-success)" : "var(--color-muted)" }} />
        <div className="flex-1">
          <span className="text-sm" style={{ color: "var(--color-foreground)" }}>GitHub</span>
          {gh?.authenticated && gh.username && (
            <span className="text-xs ml-2" style={{ color: "var(--color-muted)" }}>@{gh.username}</span>
          )}
        </div>
        {!gh?.authenticated && (
          <Btn onClick={() => ghAuthMut.mutate()} disabled={ghAuthMut.isPending || execDisabled} variant="accent">
            <Github size={11} /> {ghAuthMut.isPending ? "Authenticating…" : "Authenticate"}
          </Btn>
        )}
        {gh?.authenticated && (
          <span className="text-xs" style={{ color: "var(--color-success)" }}>
            <CheckCircle size={11} className="inline mr-1" />authenticated
          </span>
        )}
        {ghAuthMut.isError && (
          <span className="text-xs" style={{ color: "var(--color-error)" }}>
            {apiErrorMessage(ghAuthMut.error)}
          </span>
        )}
      </div>
    </Card>
  );
}

// ── Updater Panel ─────────────────────────────────────────────────────────────

function UpdaterPanel() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const permissions = useAgentPermissions();
  const execDisabled = permissions.settings ? !permissions.canExec : false;
  const editsDisabled = permissions.settings ? !permissions.canEdit : false;

  const manifestQ = useQuery({
    queryKey: ["updater-manifest"],
    queryFn: () => api.updater.manifest(),
    staleTime: 60_000,
  });

  const statesQ = useQuery({
    queryKey: ["updater-model-states"],
    queryFn: () => api.updater.modelStates(),
    staleTime: 60_000,
  });

  const checkMut   = useMutation({ mutationFn: () => api.updater.check("all"), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["updater-manifest"] }); void qc.invalidateQueries({ queryKey: ["updater-model-states"] }); } });
  const updateMut  = useMutation({ mutationFn: (name: string) => api.updater.update([name]), onSuccess: () => void qc.invalidateQueries({ queryKey: ["updater-model-states"] }) });
  const rollbackMut= useMutation({ mutationFn: (name: string) => api.updater.rollbackModel(name), onSuccess: () => void qc.invalidateQueries({ queryKey: ["updater-model-states"] }) });
  const backupMut  = useMutation({ mutationFn: () => api.updater.backupSettings() });

  const states = statesQ.data?.states ?? {};
  const modelNames = Object.keys(states);
  const updatable = modelNames.filter(n => states[n]?.updateAvailable);

  return (
    <Card>
      <CardHeader icon={Download} title="Model Updater"
        actions={
          <div className="flex items-center gap-2">
            <Btn onClick={() => backupMut.mutate()} disabled={backupMut.isPending || editsDisabled}>
              <HardDrive size={11} /> {backupMut.isPending ? "Backing up…" : "Backup Settings"}
            </Btn>
            <Btn onClick={() => checkMut.mutate()} disabled={checkMut.isPending} variant="accent">
              <RefreshCw size={11} className={checkMut.isPending ? "animate-spin" : ""} />
              {checkMut.isPending ? "Checking…" : "Check Updates"}
            </Btn>
          </div>
        }
      />

      {(execDisabled || editsDisabled) && (
        <div className="px-4 pt-3 space-y-2">
          {execDisabled && <PermissionNotice permission="allowAgentExec" />}
          {editsDisabled && <PermissionNotice permission="allowAgentEdits" />}
        </div>
      )}

      {checkMut.isSuccess && (
        <div className="px-4 py-2 text-xs" style={{ color: "var(--color-success)", borderBottom: "1px solid var(--color-border)" }}>
          Check complete — {updatable.length} update{updatable.length !== 1 ? "s" : ""} available
        </div>
      )}

      {modelNames.length === 0 && !statesQ.isLoading && (
        <div className="p-6 text-sm text-center" style={{ color: "var(--color-muted)" }}>
          No model states tracked. Click Check Updates to scan.
        </div>
      )}

      {modelNames.length > 0 && (
        <>
          <button
            className="flex items-center gap-1.5 w-full px-4 py-2 text-xs text-left"
            style={{ color: "var(--color-muted)", borderBottom: expanded ? "1px solid var(--color-border)" : undefined }}
            onClick={() => setExpanded(e => !e)}>
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {modelNames.length} model{modelNames.length !== 1 ? "s" : ""} tracked
            {updatable.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full"
                style={{ background: "color-mix(in srgb, var(--color-warn) 15%, transparent)", color: "var(--color-warn)" }}>
                {updatable.length} update{updatable.length !== 1 ? "s" : ""}
              </span>
            )}
          </button>

          {expanded && modelNames.map((name) => {
            const state = states[name];
            const isUpdating = updateMut.isPending && updateMut.variables === name;
            const isRolling  = rollbackMut.isPending && rollbackMut.variables === name;
            return (
              <div key={name}
                className="flex items-center gap-3 px-4 py-2.5"
                style={{ borderBottom: "1px solid var(--color-border)" }}>
                <Package size={12} style={{ color: "var(--color-muted)", flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs truncate" style={{ color: "var(--color-foreground)" }}>{name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {state?.lifecycle && <span className="text-xs capitalize" style={{ color: "var(--color-muted)" }}>{state.lifecycle}</span>}
                    {state?.updateAvailable && <span className="text-xs" style={{ color: "var(--color-warn)" }}>update available</span>}
                    {state?.lastError && <span className="text-xs" style={{ color: "var(--color-error)" }} title={state.lastError}>error</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {state?.updateAvailable && (
                    <Btn onClick={() => updateMut.mutate(name)} disabled={isUpdating || execDisabled} variant="accent" size="xs">
                      {isUpdating ? <Loader2 size={10} className="animate-spin" /> : <ArrowDownToLine size={10} />}
                      {isUpdating ? "Proposing…" : "Propose"}
                    </Btn>
                  )}
                  <Btn onClick={() => rollbackMut.mutate(name)} disabled={isRolling || editsDisabled} size="xs">
                    {isRolling ? <Loader2 size={10} className="animate-spin" /> : <RotateCcwIcon size={10} />}
                    Rollback
                  </Btn>
                </div>
              </div>
            );
          })}
        </>
      )}

      {backupMut.isSuccess && backupMut.data?.backupDir && (
        <div className="px-4 py-2 text-xs" style={{ color: "var(--color-success)" }}>
          Settings backed up: {backupMut.data.backupDir}
        </div>
      )}
      {updateMut.isSuccess && updateMut.data?.message && (
        <div className="px-4 py-2 text-xs" style={{ color: "var(--color-warn)", borderTop: "1px solid var(--color-border)" }}>
          {updateMut.data.message}
          {updateMut.data.approval?.id && ` Approval ${updateMut.data.approval.id.slice(0, 8)} is waiting; no update was applied.`}
        </div>
      )}
      {(updateMut.isError || rollbackMut.isError || backupMut.isError) && (
        <div className="px-4 py-2 text-xs" style={{ color: "var(--color-error)" }}>
          {apiErrorMessage(updateMut.error || rollbackMut.error || backupMut.error, "Updater action failed")}
        </div>
      )}
    </Card>
  );
}

// ── Self-Maintainer Panel ────────────────────────────────────────────────────

function maintainerStatusColor(proposal: SelfMaintainerProposal): string {
  if (proposal.status === "blocked" || proposal.resultStatus === "blocked") return "var(--color-error)";
  if (proposal.status === "failed") return "var(--color-error)";
  if (proposal.status === "not_configured" || proposal.resultStatus === "not_configured") return "var(--color-warn)";
  return "var(--color-success)";
}

function MaintainerProposalRow({ proposal }: { proposal: SelfMaintainerProposal }) {
  return (
    <div className="rounded-lg p-3 text-xs space-y-2"
      style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
      <div className="flex items-start gap-3">
        <ListChecks size={13} style={{ color: maintainerStatusColor(proposal), flexShrink: 0, marginTop: 2 }} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold" style={{ color: "var(--color-foreground)" }}>{proposal.title}</span>
            <span style={{ color: maintainerStatusColor(proposal) }}>{proposal.status}</span>
            <span style={{ color: "var(--color-muted)" }}>{proposal.kind}</span>
            <span style={{ color: proposal.sourceTrust.status === "blocked" ? "var(--color-error)" : "var(--color-muted)" }}>
              {proposal.sourceTrust.status}
            </span>
          </div>
          <div className="mt-1" style={{ color: "var(--color-muted)" }}>
            {proposal.currentVersionOrState} {"->"} {proposal.candidateVersionOrState}
          </div>
          <div className="mt-1" style={{ color: "var(--color-muted)" }}>
            {proposal.resultMessage}
          </div>
          {proposal.approval?.id && (
            <div className="font-mono mt-1" style={{ color: "var(--color-warn)" }}>
              approval {proposal.approval.id.slice(0, 8)} waiting; no update applied
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="rounded-lg p-2" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <div className="font-medium mb-1" style={{ color: "var(--color-foreground)" }}>Tests required</div>
          <div style={{ color: "var(--color-muted)" }}>{proposal.requiredTests.slice(0, 4).join(" · ")}</div>
        </div>
        <div className="rounded-lg p-2" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <div className="font-medium mb-1" style={{ color: "var(--color-foreground)" }}>Rollback</div>
          <div style={{ color: "var(--color-muted)" }}>{proposal.rollbackPlan.summary}</div>
        </div>
      </div>
    </div>
  );
}

function MaintainerPanel() {
  const qc = useQueryClient();
  const [request, setRequest] = useState("");
  const maintainerQ = useQuery<SelfMaintainerSnapshot>({
    queryKey: ["self-maintainer"],
    queryFn: () => api.updater.selfMaintainer(),
    staleTime: 30_000,
  });

  const radarMut = useMutation({
    mutationFn: () => api.updater.runMaintainerRadar({ dryRunOnly: true, includeNetworkChecks: false }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["self-maintainer"] }),
  });

  const proposalMut = useMutation({
    mutationFn: (value: string) => api.updater.createMaintainerProposal({ request: value }),
    onSuccess: () => {
      setRequest("");
      void qc.invalidateQueries({ queryKey: ["self-maintainer"] });
      void qc.invalidateQueries({ queryKey: ["approvals"] });
    },
  });

  const data = radarMut.data ?? maintainerQ.data;
  const proposals = data?.proposals ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Shield} title="Self-Maintainer"
          actions={
            <div className="flex items-center gap-2">
              <Btn onClick={() => void maintainerQ.refetch()} disabled={maintainerQ.isFetching} size="xs">
                <RefreshCw size={10} className={maintainerQ.isFetching ? "animate-spin" : ""} /> Refresh
              </Btn>
              <Btn onClick={() => radarMut.mutate()} disabled={radarMut.isPending} variant="accent">
                {radarMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Activity size={11} />}
                Dry-run Radar
              </Btn>
            </div>
          }
        />
        <div className="p-4 space-y-4">
          {(maintainerQ.isLoading || radarMut.isPending) && (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-muted)" }}>
              <Loader2 size={14} className="animate-spin" /> Loading maintainer state...
            </div>
          )}
          {data && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
              {[
                ["Mode", data.runtimeMode],
                ["Branch", data.git.branch],
                ["Network", data.networkUsed ? "used" : "not used"],
                ["Rules", data.rules.noDirectMainApply ? "main blocked" : "unknown"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg p-2" style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                  <div style={{ color: "var(--color-muted)" }}>{label}</div>
                  <div className="font-medium truncate" style={{ color: "var(--color-foreground)" }}>{value}</div>
                </div>
              ))}
            </div>
          )}
          {data && (
            <div className="text-xs rounded-lg p-3" style={{ color: "var(--color-muted)", background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
              Source of truth: {data.updaterRepairSourceOfTruth}
            </div>
          )}
          <div className="flex flex-col md:flex-row gap-2">
            <input
              value={request}
              onChange={event => setRequest(event.target.value)}
              placeholder="Self-improvement request"
              className="flex-1 px-3 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
            />
            <Btn onClick={() => proposalMut.mutate(request)} disabled={!request.trim() || proposalMut.isPending} variant="accent">
              {proposalMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <FileDiff size={11} />}
              Create Proposal
            </Btn>
          </div>
          {proposalMut.isSuccess && (
            <div className="text-xs" style={{ color: "var(--color-warn)" }}>
              {proposalMut.data.message}
              {proposalMut.data.approval?.id && ` Approval ${proposalMut.data.approval.id.slice(0, 8)} is waiting.`}
            </div>
          )}
          {(maintainerQ.isError || radarMut.isError || proposalMut.isError) && (
            <div className="text-xs" style={{ color: "var(--color-error)" }}>
              {apiErrorMessage(maintainerQ.error || radarMut.error || proposalMut.error, "Maintainer request failed")}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader icon={ListChecks} title="Update Proposals" />
        <div className="p-4 space-y-3">
          {proposals.length === 0 && !maintainerQ.isLoading && (
            <div className="text-sm text-center py-4" style={{ color: "var(--color-muted)" }}>
              No maintainer proposals recorded.
            </div>
          )}
          {proposals.map(proposal => <MaintainerProposalRow key={proposal.id} proposal={proposal} />)}
        </div>
      </Card>
    </div>
  );
}

// ── Rollback Panel ────────────────────────────────────────────────────────────

function BackupTable({ backups, onRollback, rolling }: {
  backups: BackupEntry[];
  onRollback: (fp: string) => void;
  rolling: boolean;
}) {
  if (backups.length === 0) {
    return <div className="text-xs py-4 text-center" style={{ color: "var(--color-muted)" }}>No backups found.</div>;
  }
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
      {backups.map((bk, i) => (
        <div key={bk.filePath + i}
          className="flex items-center gap-3 px-3 py-2 text-xs"
          style={{ borderBottom: i < backups.length - 1 ? "1px solid var(--color-border)" : undefined }}>
          <div className="flex-1 min-w-0">
            <div className="font-mono truncate" style={{ color: "var(--color-foreground)" }}>{bk.filePath}</div>
            {bk.createdAt && (
              <div style={{ color: "var(--color-muted)" }}>{new Date(bk.createdAt).toLocaleString()}</div>
            )}
          </div>
          {bk.sizeBytes !== undefined && (
            <span className="shrink-0 text-xs" style={{ color: "var(--color-muted)" }}>
              {bk.sizeBytes < 1024 ? `${bk.sizeBytes}B`
                : bk.sizeBytes < 1048576 ? `${(bk.sizeBytes / 1024).toFixed(0)}KB`
                : `${(bk.sizeBytes / 1048576).toFixed(1)}MB`}
            </span>
          )}
          <Btn onClick={() => onRollback(bk.filePath)} disabled={rolling} size="xs" variant="danger">
            <RotateCcwIcon size={10} /> Rollback
          </Btn>
        </div>
      ))}
    </div>
  );
}

function RollbackPanel() {
  const [mode, setMode] = useState<"dir" | "scan" | "file">("dir");
  const [dirPath, setDirPath] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [filePath, setFilePath] = useState("");
  const [dirBackups, setDirBackups]     = useState<BackupEntry[]>([]);
  const [scanBackups, setScanBackups]   = useState<BackupEntry[]>([]);
  const [listError, setListError]       = useState<string | null>(null);
  const [scanning, setScanning]         = useState(false);
  const permissions = useAgentPermissions();
  const editsDisabled = permissions.settings ? !permissions.canEdit : false;

  const rollbackMut = useMutation({
    mutationFn: (fp: string) => api.rollback.rollback(fp),
  });

  async function listBackups() {
    if (!dirPath.trim()) return;
    setListError(null);
    try {
      const r = await api.rollback.listBackups(dirPath);
      setDirBackups(r.backups ?? []);
    } catch (e) {
      setListError(apiErrorMessage(e, "Failed to list backups"));
    }
  }

  async function scanWorkspace() {
    if (!workspacePath.trim()) return;
    setListError(null);
    setScanning(true);
    try {
      const r = await api.rollback.scanBackups(workspacePath);
      setScanBackups(r.backups ?? []);
    } catch (e) {
      setListError(apiErrorMessage(e, "Scan failed"));
    } finally {
      setScanning(false);
    }
  }

  const modeLabels = [
    { id: "dir" as const,  label: "By Directory" },
    { id: "scan" as const, label: "Scan Workspace" },
    { id: "file" as const, label: "Single File" },
  ];

  return (
    <Card>
      <CardHeader icon={History} title="Rollback" />

      {/* Mode switcher */}
      <div className="flex gap-1 px-4 py-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
        {modeLabels.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)}
            className="px-3 py-1 rounded-lg text-xs"
            style={{
              background: mode === m.id ? "var(--color-accent)" : "var(--color-elevated)",
              color: mode === m.id ? "#fff" : "var(--color-muted)",
            }}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4">
        {mode === "dir" && (
          <>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>List backups in a directory</div>
              <div className="flex gap-2">
                <input
                  value={dirPath}
                  onChange={e => setDirPath(e.target.value)}
                  placeholder="C:\Users\you\LocalAI-Tools\"
                  className="flex-1 px-3 py-1.5 rounded-lg text-sm font-mono"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
                />
                <Btn onClick={() => void listBackups()} disabled={!dirPath.trim()} variant="accent">
                  <History size={11} /> List
                </Btn>
              </div>
              {listError && <div className="text-xs mt-1" style={{ color: "var(--color-error)" }}>{listError}</div>}
            </div>
            {editsDisabled && <PermissionNotice permission="allowAgentEdits" />}
            <BackupTable backups={dirBackups} onRollback={fp => rollbackMut.mutate(fp)} rolling={rollbackMut.isPending || editsDisabled} />
          </>
        )}

        {mode === "scan" && (
          <>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>
                Recursively scan a workspace for all .localai-backups folders
              </div>
              <div className="flex gap-2">
                <input
                  value={workspacePath}
                  onChange={e => setWorkspacePath(e.target.value)}
                  placeholder="C:\Users\you\my-project"
                  className="flex-1 px-3 py-1.5 rounded-lg text-sm font-mono"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
                />
                <Btn onClick={() => void scanWorkspace()} disabled={!workspacePath.trim() || scanning} variant="accent">
                  {scanning ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
                  {scanning ? "Scanning…" : "Scan"}
                </Btn>
              </div>
              {listError && <div className="text-xs mt-1" style={{ color: "var(--color-error)" }}>{listError}</div>}
              {!scanning && scanBackups.length > 0 && (
                <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                  Found {scanBackups.length} backup{scanBackups.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>
            {editsDisabled && <PermissionNotice permission="allowAgentEdits" />}
            <BackupTable backups={scanBackups} onRollback={fp => rollbackMut.mutate(fp)} rolling={rollbackMut.isPending || editsDisabled} />
          </>
        )}

        {mode === "file" && (
          <div>
            <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Rollback a specific file to its last backup</div>
            <div className="flex gap-2">
              <input
                value={filePath}
                onChange={e => setFilePath(e.target.value)}
                placeholder="C:\path\to\file.json"
                className="flex-1 px-3 py-1.5 rounded-lg text-sm font-mono"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
              />
              <Btn onClick={() => rollbackMut.mutate(filePath)} disabled={!filePath.trim() || rollbackMut.isPending || editsDisabled} variant="danger">
                {rollbackMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <RotateCcwIcon size={11} />}
                Rollback
              </Btn>
            </div>
            <Feedback
              isPending={rollbackMut.isPending}
              isSuccess={rollbackMut.isSuccess}
              isError={rollbackMut.isError}
              pendingMsg="Rolling back…"
              successMsg="Rollback complete"
              error={rollbackMut.error as Error | null}
            />
            {editsDisabled && <div className="mt-2"><PermissionNotice permission="allowAgentEdits" /></div>}
          </div>
        )}

        {rollbackMut.isSuccess && mode !== "file" && (
          <div className="text-xs" style={{ color: "var(--color-success)" }}>Rollback complete</div>
        )}
      </div>
    </Card>
  );
}

// ── Repair Log Panel ──────────────────────────────────────────────────────────

function RepairLogPanel() {
  const qc = useQueryClient();
  const permissions = useAgentPermissions();
  const execDisabled = permissions.settings ? !permissions.canExec : false;

  const logQ = useQuery({
    queryKey: ["repair-log"],
    queryFn: () => api.repair.log(),
    staleTime: 30_000,
  });

  const healthQ = useQuery({
    queryKey: ["repair-health-ops"],
    queryFn: () => api.repair.health(),
    staleTime: 30_000,
  });

  const repairMut = useMutation({
    mutationFn: (ids: string[]) => api.repair.run(ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["repair-log"] });
      void qc.invalidateQueries({ queryKey: ["repair-health-ops"] });
    },
  });

  const entries: RepairLogEntry[] = logQ.data?.log ?? [];
  const repairable: RepairHealthEntry[] = (healthQ.data?.items ?? []).filter(
    (i: RepairHealthEntry) => i.canRepair && i.status !== "ok",
  );

  return (
    <Card>
      <CardHeader icon={Wrench} title="Repair Log"
        actions={
          repairable.length > 0 ? (
            <Btn
              onClick={() => repairMut.mutate(repairable.map(r => r.id))}
              disabled={repairMut.isPending || execDisabled}
              variant="accent">
              <Wrench size={11} />
              {repairMut.isPending ? "Repairing…" : `Repair ${repairable.length} issue${repairable.length !== 1 ? "s" : ""}`}
            </Btn>
          ) : undefined
        }
      />

      {execDisabled && <div className="px-4 pt-3"><PermissionNotice permission="allowAgentExec" /></div>}

      {repairMut.isSuccess && (
        <div className="px-4 py-2 text-xs" style={{ color: "var(--color-warn)", borderBottom: "1px solid var(--color-border)" }}>
          {repairMut.data?.message ?? "Repair proposal queued; no repair command was executed."}
          {repairMut.data?.approval?.id && ` Approval ${repairMut.data.approval.id.slice(0, 8)} is waiting.`}
        </div>
      )}

      {entries.length === 0 && !logQ.isLoading && (
        <div className="p-6 text-sm text-center" style={{ color: "var(--color-muted)" }}>No repair history</div>
      )}

      {entries.map((e) => {
        const color = e.success ? "var(--color-success)" : "var(--color-error)";
        return (
          <div key={`${e.id}-${e.timestamp}`} className="flex items-start gap-3 px-4 py-2.5 text-xs"
            style={{ borderBottom: "1px solid var(--color-border)" }}>
            {e.success
              ? <CheckCircle size={12} style={{ color, flexShrink: 0, marginTop: 1 }} />
              : <XCircle size={12} style={{ color, flexShrink: 0, marginTop: 1 }} />}
            <div className="flex-1 min-w-0">
              <div style={{ color: "var(--color-foreground)" }}>
                <span className="font-medium font-mono">{e.id}</span>
                <span className="mx-1 opacity-50">·</span>
                <span>{e.action}</span>
              </div>
              <div style={{ color: "var(--color-muted)" }}>{e.message}</div>
            </div>
            <div className="shrink-0" style={{ color: "var(--color-muted)" }}>
              {new Date(e.timestamp).toLocaleTimeString()}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

// ── System Updates Panel ──────────────────────────────────────────────────────

function SystemUpdatesPanel() {
  const [results, setResults] = useState<unknown[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const permissions = useAgentPermissions();
  const execDisabled = permissions.settings ? !permissions.canExec : false;

  const checkMut = useMutation({
    mutationFn: () => api.systemExtra.updatesCheck(),
    onSuccess: (data) => setResults(data.items ?? []),
    onError: (e) => setError(apiErrorMessage(e, "Check failed")),
  });

  const runMut = useMutation({
    mutationFn: () => api.systemExtra.updatesRun(),
    onSuccess: () => setResults(null),
    onError: (e) => setError(apiErrorMessage(e, "Update failed")),
  });

  return (
    <Card>
      <CardHeader icon={Shield} title="System Updates"
        actions={
          <div className="flex items-center gap-2">
            {results && results.length > 0 && (
              <Btn onClick={() => runMut.mutate()} disabled={runMut.isPending || execDisabled} variant="accent">
                <ArrowDownToLine size={11} /> {runMut.isPending ? "Proposing…" : "Propose Updates"}
              </Btn>
            )}
            <Btn onClick={() => checkMut.mutate()} disabled={checkMut.isPending}>
              <RefreshCw size={11} className={checkMut.isPending ? "animate-spin" : ""} />
              {checkMut.isPending ? "Checking…" : "Check"}
            </Btn>
          </div>
        }
      />

      <div className="p-4">
        {execDisabled && <PermissionNotice permission="allowAgentExec" className="mb-3" />}
        {!results && !error && (
          <div className="text-sm" style={{ color: "var(--color-muted)" }}>
            Click Check to scan for system component updates.
          </div>
        )}
        {error && <div className="text-sm" style={{ color: "var(--color-error)" }}>{error}</div>}
        {results !== null && results.length === 0 && (
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-success)" }}>
            <CheckCircle size={14} /> All system components are up to date
          </div>
        )}
        {results !== null && results.length > 0 && (
          <div className="space-y-2">
            {results.map((r, i) => {
              const item = r as { id?: string; name?: string; currentVersion?: string; availableVersion?: string; updateAvailable?: boolean };
              return (
                <div key={i} className="flex items-center gap-3 text-xs px-3 py-2 rounded-lg"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                  <AlertTriangle size={12} style={{ color: "var(--color-warn)", flexShrink: 0 }} />
                  <span className="font-medium flex-1" style={{ color: "var(--color-foreground)" }}>
                    {item.name ?? item.id ?? "Unknown"}
                  </span>
                  {item.currentVersion && <span style={{ color: "var(--color-muted)" }}>{item.currentVersion}</span>}
                  {item.availableVersion && <span style={{ color: "var(--color-warn)" }}>-&gt; {item.availableVersion}</span>}
                </div>
              );
            })}
          </div>
        )}
        {runMut.isSuccess && (
          <div className="mt-2 text-xs" style={{ color: "var(--color-warn)" }}>
            {runMut.data?.message ?? "Update proposal queued; no system update was applied."}
            {runMut.data?.approval?.id && ` Approval ${runMut.data.approval.id.slice(0, 8)} is waiting.`}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── OS Interop Panel ──────────────────────────────────────────────────────────

function OsInteropPanel() {
  const [windowFilter, setWindowFilter]   = useState("");
  const [focusPattern, setFocusPattern]   = useState("");
  const [keysInput, setKeysInput]         = useState("");
  const [textInput, setTextInput]         = useState("");
  const [clickX, setClickX]               = useState("");
  const [clickY, setClickY]               = useState("");
  const [screenshot, setScreenshot]       = useState<string | null>(null);
  const [feedback, setFeedback]           = useState<{ msg: string; ok: boolean } | null>(null);

  const settingsQ = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings.get(),
  });

  const windowsQ = useQuery<{ success: boolean; windows: OsWindow[] }>({
    queryKey: ["os-windows", windowFilter],
    queryFn: () => api.os.windows(windowFilter || undefined),
    enabled: settingsQ.data?.settings?.allowAgentExec === true,
    staleTime: 10_000,
  });

  const focusMut = useMutation({
    mutationFn: () => api.os.focus(focusPattern),
    onSuccess: r => setFeedback({ msg: r.focused ? "Window focused" : "No matching window", ok: r.focused }),
  });
  const sendKeysMut = useMutation({
    mutationFn: () => api.os.sendKeys(keysInput),
    onSuccess: () => setFeedback({ msg: "Keys sent", ok: true }),
    onError: (e) => setFeedback({ msg: apiErrorMessage(e), ok: false }),
  });
  const typeTextMut = useMutation({
    mutationFn: () => api.os.typeText(textInput),
    onSuccess: () => setFeedback({ msg: "Text typed", ok: true }),
    onError: (e) => setFeedback({ msg: apiErrorMessage(e), ok: false }),
  });
  const clickMut = useMutation({
    mutationFn: () => api.os.click(parseFloat(clickX), parseFloat(clickY)),
    onSuccess: () => setFeedback({ msg: "Click sent", ok: true }),
    onError: (e) => setFeedback({ msg: apiErrorMessage(e), ok: false }),
  });
  const screenshotMut = useMutation({
    mutationFn: () => api.os.screenshot(),
    onSuccess: r => { setScreenshot(r.base64); setFeedback({ msg: "Screenshot captured", ok: true }); },
    onError: (e) => setFeedback({ msg: apiErrorMessage(e), ok: false }),
  });

  const execDisabled = settingsQ.data?.settings?.allowAgentExec === false;

  if (execDisabled) {
    return (
      <Card>
        <CardHeader icon={Monitor} title="OS Interop" />
        <div className="p-8 flex flex-col items-center gap-3 text-center">
          <Monitor size={24} style={{ color: "var(--color-muted)" }} />
          <div className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>OS Interop is disabled</div>
          <div className="text-xs" style={{ color: "var(--color-muted)" }}>
            Enable <strong>Allow Agent Exec</strong> in Settings → Agent Permissions to use this panel.
          </div>
        </div>
      </Card>
    );
  }

  const windows: OsWindow[] = windowsQ.data?.windows ?? [];

  return (
    <Card>
      <CardHeader icon={Monitor} title="OS Interop"
        actions={
          feedback && (
            <span className="text-xs" style={{ color: feedback.ok ? "var(--color-success)" : "var(--color-error)" }}>
              {feedback.msg}
            </span>
          )
        }
      />

      <div className="p-4 space-y-5">
        {/* Window list */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold" style={{ color: "var(--color-muted)" }}>OPEN WINDOWS</span>
            <div className="flex-1 flex items-center gap-2">
              <input
                value={windowFilter}
                onChange={e => setWindowFilter(e.target.value)}
                placeholder="Filter by title…"
                className="flex-1 px-2 py-1 rounded text-xs"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
              />
            </div>
          </div>
          {windowsQ.isLoading && (
            <div className="text-xs flex items-center gap-1" style={{ color: "var(--color-muted)" }}>
              <Loader2 size={11} className="animate-spin" /> Loading…
            </div>
          )}
          {windows.length === 0 && !windowsQ.isLoading && (
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>No windows found</div>
          )}
          {windows.length > 0 && (
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
              {windows.slice(0, 12).map((w, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs"
                  style={{ borderBottom: i < Math.min(windows.length, 12) - 1 ? "1px solid var(--color-border)" : undefined }}>
                  <Monitor size={11} style={{ color: "var(--color-muted)", flexShrink: 0 }} />
                  <span className="flex-1 truncate" style={{ color: "var(--color-foreground)" }}>{w.title}</span>
                  {w.processName && <span style={{ color: "var(--color-muted)" }}>{w.processName}</span>}
                  <Btn size="xs" onClick={() => { setFocusPattern(w.title); focusMut.mutate(); }}>
                    Focus
                  </Btn>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Focus window */}
        <div>
          <div className="text-xs mb-1 font-semibold" style={{ color: "var(--color-muted)" }}>FOCUS WINDOW</div>
          <div className="flex gap-2">
            <input
              value={focusPattern}
              onChange={e => setFocusPattern(e.target.value)}
              placeholder="Window title pattern…"
              className="flex-1 px-3 py-1.5 rounded-lg text-xs"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            />
            <Btn onClick={() => focusMut.mutate()} disabled={!focusPattern.trim() || focusMut.isPending} variant="accent" size="xs">
              Focus
            </Btn>
          </div>
        </div>

        {/* Send keys */}
        <div>
          <div className="text-xs mb-1 font-semibold" style={{ color: "var(--color-muted)" }}>SEND KEYS</div>
          <div className="flex gap-2">
            <input
              value={keysInput}
              onChange={e => setKeysInput(e.target.value)}
              placeholder="{CTRL}{C} or {ENTER}…"
              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-mono"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            />
            <Btn onClick={() => sendKeysMut.mutate()} disabled={!keysInput.trim() || sendKeysMut.isPending} size="xs">
              <Keyboard size={10} /> Send
            </Btn>
          </div>
        </div>

        {/* Type text */}
        <div>
          <div className="text-xs mb-1 font-semibold" style={{ color: "var(--color-muted)" }}>TYPE TEXT</div>
          <div className="flex gap-2">
            <input
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder="Literal text to type…"
              className="flex-1 px-3 py-1.5 rounded-lg text-xs"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            />
            <Btn onClick={() => typeTextMut.mutate()} disabled={!textInput.trim() || typeTextMut.isPending} size="xs">
              <Keyboard size={10} /> Type
            </Btn>
          </div>
        </div>

        {/* Click */}
        <div>
          <div className="text-xs mb-1 font-semibold" style={{ color: "var(--color-muted)" }}>CLICK AT COORDINATES</div>
          <div className="flex gap-2">
            <input
              value={clickX}
              onChange={e => setClickX(e.target.value)}
              placeholder="X"
              className="w-20 px-3 py-1.5 rounded-lg text-xs font-mono"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            />
            <input
              value={clickY}
              onChange={e => setClickY(e.target.value)}
              placeholder="Y"
              className="w-20 px-3 py-1.5 rounded-lg text-xs font-mono"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            />
            <Btn
              onClick={() => clickMut.mutate()}
              disabled={!clickX.trim() || !clickY.trim() || !Number.isFinite(parseFloat(clickX)) || !Number.isFinite(parseFloat(clickY)) || clickMut.isPending}
              size="xs">
              <MousePointer size={10} /> Click
            </Btn>
          </div>
        </div>

        {/* Screenshot */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="text-xs font-semibold" style={{ color: "var(--color-muted)" }}>SCREENSHOT</div>
            <Btn onClick={() => screenshotMut.mutate()} disabled={screenshotMut.isPending} size="xs">
              {screenshotMut.isPending ? <Loader2 size={10} className="animate-spin" /> : <Camera size={10} />}
              {screenshotMut.isPending ? "Capturing…" : "Capture"}
            </Btn>
          </div>
          {screenshot && (
            <img
              src={`data:image/png;base64,${screenshot}`}
              alt="Screenshot"
              className="w-full rounded-lg"
              style={{ border: "1px solid var(--color-border)", maxHeight: 300, objectFit: "contain" }}
            />
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Time Travel panel (8.9) ───────────────────────────────────────────────────

function FoundationPanel() {
  const qc = useQueryClient();
  const [pathProbe, setPathProbe] = useState("");
  const [pathResult, setPathResult] = useState<string | null>(null);

  const summaryQ = useQuery({
    queryKey: ["foundation-summary"],
    queryFn: () => api.foundation.summary(),
    refetchInterval: 15_000,
  });
  const rootsQ = useQuery({
    queryKey: ["foundation-roots"],
    queryFn: () => api.foundation.workspaceRoots(),
  });
  const jobsQ = useQuery({
    queryKey: ["foundation-jobs"],
    queryFn: () => api.foundation.jobs(),
    refetchInterval: 10_000,
  });
  const auditQ = useQuery({
    queryKey: ["foundation-audit"],
    queryFn: () => api.foundation.auditEvents(50),
    refetchInterval: 10_000,
  });

  const createJobMut = useMutation({
    mutationFn: () => api.foundation.createJob("manual-verification", { source: "operations-panel" }, 10),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["foundation-summary"] });
      void qc.invalidateQueries({ queryKey: ["foundation-jobs"] });
      void qc.invalidateQueries({ queryKey: ["foundation-audit"] });
    },
  });

  const leaseJobMut = useMutation({
    mutationFn: () => api.foundation.leaseJob("operations-panel", 60_000),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["foundation-jobs"] });
      void qc.invalidateQueries({ queryKey: ["foundation-audit"] });
    },
  });

  const pathCheckMut = useMutation({
    mutationFn: () => api.foundation.checkPath(pathProbe, "file.read"),
    onSuccess: (result) => setPathResult(result.decision.allowed ? `Allowed: ${result.decision.action}` : result.decision.reason),
    onError: (error) => setPathResult(apiErrorMessage(error, "Path blocked")),
  });

  const summary = summaryQ.data?.summary;
  const roots: WorkspaceRoot[] = rootsQ.data?.roots ?? [];
  const jobs: DurableFoundationJob[] = jobsQ.data?.jobs ?? [];
  const events: FoundationAuditEvent[] = auditQ.data?.events ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Database} title="Durable Platform Foundation"
          actions={
            <Btn onClick={() => {
              void summaryQ.refetch();
              void rootsQ.refetch();
              void jobsQ.refetch();
              void auditQ.refetch();
            }} size="xs">
              <RefreshCw size={10} /> Refresh
            </Btn>
          }
        />
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            {[
              ["Roots", summary?.workspaceRoots],
              ["Policies", summary?.permissionPolicies],
              ["Approvals", summary?.approvalRequests],
              ["Jobs", summary?.durableJobs],
              ["Job Events", summary?.jobEvents],
              ["Audit", summary?.auditEvents],
              ["Artifacts", summary?.artifacts],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg p-3"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                <div className="text-xs" style={{ color: "var(--color-muted)" }}>{label}</div>
                <div className="text-lg font-semibold" style={{ color: "var(--color-foreground)" }}>{value ?? "..."}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Btn onClick={() => createJobMut.mutate()} disabled={createJobMut.isPending} variant="accent">
              {createJobMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Package size={11} />}
              Create Test Job
            </Btn>
            <Btn onClick={() => leaseJobMut.mutate()} disabled={leaseJobMut.isPending}>
              {leaseJobMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
              Lease Next Job
            </Btn>
            {leaseJobMut.data?.job && (
              <span className="text-xs self-center" style={{ color: "var(--color-success)" }}>
                Leased {leaseJobMut.data.job.id.slice(0, 8)}
              </span>
            )}
            {leaseJobMut.data && !leaseJobMut.data.job && (
              <span className="text-xs self-center" style={{ color: "var(--color-muted)" }}>No queued jobs</span>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader icon={Shield} title="Workspace Root Allowlist" />
          <div className="p-4 space-y-4">
            <div className="flex gap-2">
              <input
                value={pathProbe}
                onChange={e => setPathProbe(e.target.value)}
                placeholder="Path to verify against workspace roots"
                className="flex-1 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
              />
              <Btn onClick={() => pathCheckMut.mutate()} disabled={!pathProbe.trim() || pathCheckMut.isPending} size="xs">
                Check
              </Btn>
            </div>
            {pathResult && (
              <div className="text-xs rounded-lg p-2"
                style={{ background: "var(--color-elevated)", color: pathResult.startsWith("Allowed") ? "var(--color-success)" : "var(--color-error)" }}>
                {pathResult}
              </div>
            )}
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {roots.map(root => (
                <div key={root.id} className="rounded-lg px-3 py-2 text-xs"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium" style={{ color: "var(--color-foreground)" }}>{root.label}</span>
                    <span style={{ color: root.enabled ? "var(--color-success)" : "var(--color-muted)" }}>
                      {root.enabled ? "enabled" : "disabled"}
                    </span>
                  </div>
                  <div className="font-mono truncate" style={{ color: "var(--color-muted)" }}>{root.rootPath}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader icon={History} title="Durable Jobs" />
          <div className="p-4 space-y-1 max-h-96 overflow-y-auto">
            {jobs.length === 0 && <div className="text-xs" style={{ color: "var(--color-muted)" }}>No durable jobs recorded.</div>}
            {jobs.map(job => (
              <div key={job.id} className="rounded-lg px-3 py-2 text-xs"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                <div className="flex items-center gap-2">
                  <span className="font-medium" style={{ color: "var(--color-foreground)" }}>{job.kind}</span>
                  <span style={{ color: job.state === "queued" ? "var(--color-warn)" : job.state === "leased" ? "var(--color-info)" : "var(--color-success)" }}>
                    {job.state}
                  </span>
                  <span className="ml-auto font-mono" style={{ color: "var(--color-muted)" }}>{job.id.slice(0, 8)}</span>
                </div>
                <div style={{ color: "var(--color-muted)" }}>{new Date(job.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader icon={History} title="Unified Audit Events" />
        <div className="p-4 space-y-1 max-h-96 overflow-y-auto">
          {events.length === 0 && <div className="text-xs" style={{ color: "var(--color-muted)" }}>No audit events recorded.</div>}
          {events.map(event => (
            <div key={event.id} className="grid grid-cols-12 gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
              <div className="col-span-2 font-medium" style={{ color: "var(--color-foreground)" }}>{event.eventType}</div>
              <div className="col-span-3 truncate" style={{ color: "var(--color-muted)" }}>{event.action}</div>
              <div className="col-span-3 truncate" style={{ color: "var(--color-muted)" }}>{event.target ?? "local"}</div>
              <div className="col-span-1" style={{ color: event.result === "success" ? "var(--color-success)" : "var(--color-error)" }}>{event.result}</div>
              <div className="col-span-3 text-right" style={{ color: "var(--color-muted)" }}>{new Date(event.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function approvalStatusColor(status: ApprovalRequest["status"]): string {
  if (status === "approved" || status === "completed") return "var(--color-success)";
  if (status === "waiting_for_approval") return "var(--color-warn)";
  if (status === "failed" || status === "denied" || status === "expired") return "var(--color-error)";
  return "var(--color-muted)";
}

function replayStatusColor(status: MissionReplayEvent["dataStatus"]): string {
  if (status === "recorded") return "var(--color-success)";
  if (status === "redacted") return "var(--color-warn)";
  if (status === "missing" || status === "blocked") return "var(--color-error)";
  return "var(--color-muted)";
}

function evalStatusColor(status: LocalEvalReport["results"][number]["status"]): string {
  return status === "pass" ? "var(--color-success)" : "var(--color-error)";
}

function MissionReplayPanel() {
  const [traceId, setTraceId] = useState("");

  const suitesQ = useQuery({
    queryKey: ["phase04-eval-suites"],
    queryFn: () => api.observability.evalSuites(),
    staleTime: 60_000,
  });

  const replayQ = useQuery({
    queryKey: ["mission-replay", traceId],
    queryFn: () => api.observability.missionReplay(traceId.trim() || undefined, 200),
    refetchInterval: 10_000,
  });

  const evalMut = useMutation({
    mutationFn: () => api.observability.runEvals(),
    onSuccess: () => void replayQ.refetch(),
  });

  const replay = replayQ.data?.replay;
  const events: MissionReplayEvent[] = replay?.events ?? [];
  const evalReport = evalMut.data?.report;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Activity} title="Mission Replay"
          actions={
            <Btn onClick={() => void replayQ.refetch()} disabled={replayQ.isFetching} size="xs">
              <RefreshCw size={10} className={replayQ.isFetching ? "animate-spin" : ""} /> Refresh
            </Btn>
          }
        />
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={traceId}
              onChange={event => setTraceId(event.target.value)}
              placeholder="Trace, approval, job, session, target"
              className="px-3 py-1.5 rounded-lg text-sm outline-none min-w-[260px]"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
            />
            <Btn onClick={() => void replayQ.refetch()} disabled={replayQ.isFetching} variant="accent">
              <Search size={11} /> Load Replay
            </Btn>
            {replay && (
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                {replay.summary.totalEvents} events · {replay.summary.redacted} redacted · {replay.summary.missing} missing
              </span>
            )}
          </div>
          {replay?.sourceOfTruth && (
            <div className="text-xs rounded-lg px-3 py-2"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
              Source: {replay.sourceOfTruth}
            </div>
          )}
          {replayQ.isLoading && <div className="text-sm" style={{ color: "var(--color-muted)" }}>Loading replay...</div>}
          {!replayQ.isLoading && events.length === 0 && (
            <div className="text-sm text-center py-6" style={{ color: "var(--color-muted)" }}>
              No recorded replay events found for this filter.
            </div>
          )}
          <div className="space-y-2 max-h-[520px] overflow-y-auto">
            {events.map(event => (
              <div key={`${event.source}-${event.id}`} className="rounded-lg px-3 py-2 text-xs"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono" style={{ color: "var(--color-muted)" }}>
                    {event.timestamp.slice(0, 19).replace("T", " ")}
                  </span>
                  <span className="font-semibold" style={{ color: "var(--color-foreground)" }}>{event.kind}</span>
                  <span style={{ color: replayStatusColor(event.dataStatus) }}>{event.dataStatus}</span>
                  <span style={{ color: "var(--color-muted)" }}>{event.source}</span>
                  {event.result && <span style={{ color: "var(--color-muted)" }}>{event.result}</span>}
                </div>
                <div className="mt-1" style={{ color: "var(--color-muted)" }}>{event.message}</div>
                <div className="font-mono truncate mt-1" style={{ color: "var(--color-muted)" }}>
                  trace {event.traceId} · {event.target ?? event.id}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader icon={ListChecks} title="Local Eval Harness"
          actions={
            <Btn onClick={() => evalMut.mutate()} disabled={evalMut.isPending} variant="accent" size="xs">
              {evalMut.isPending ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
              Run Evals
            </Btn>
          }
        />
        <div className="p-4 space-y-3">
          <div className="text-xs rounded-lg px-3 py-2"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
            Local only: {String(suitesQ.data?.localOnly ?? true)} · Network used: {String(evalReport?.networkUsed ?? suitesQ.data?.networkUsed ?? false)}
          </div>
          {suitesQ.data?.suites && !evalReport && (
            <div className="flex flex-wrap gap-2">
              {suitesQ.data.suites.map(suite => (
                <span key={suite} className="text-xs rounded-lg px-2 py-1"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
                  {suite}
                </span>
              ))}
            </div>
          )}
          {evalMut.isError && (
            <div className="text-xs" style={{ color: "var(--color-error)" }}>
              {apiErrorMessage(evalMut.error, "Eval harness failed")}
            </div>
          )}
          {evalReport && (
            <div className="space-y-2">
              <div className="text-xs" style={{ color: evalReport.success ? "var(--color-success)" : "var(--color-error)" }}>
                {evalReport.success ? "All local evals passed." : "One or more local evals failed."}
              </div>
              {evalReport.results.map(result => (
                <div key={result.id} className="rounded-lg px-3 py-2 text-xs"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold" style={{ color: "var(--color-foreground)" }}>{result.name}</span>
                    <span style={{ color: evalStatusColor(result.status) }}>{result.status}</span>
                  </div>
                  <div className="mt-1" style={{ color: "var(--color-muted)" }}>{result.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function ApprovalPanel() {
  const qc = useQueryClient();
  const approvalsQ = useQuery({
    queryKey: ["approvals"],
    queryFn: () => api.approvals.list(100),
    refetchInterval: 10_000,
  });
  const jobsQ = useQuery({
    queryKey: ["approval-durable-jobs"],
    queryFn: () => api.foundation.jobs(),
    refetchInterval: 10_000,
  });

  const refreshApprovals = () => {
    void qc.invalidateQueries({ queryKey: ["approvals"] });
    void qc.invalidateQueries({ queryKey: ["approval-durable-jobs"] });
    void qc.invalidateQueries({ queryKey: ["foundation-summary"] });
    void qc.invalidateQueries({ queryKey: ["foundation-audit"] });
  };

  const approveMut = useMutation({
    mutationFn: (id: string) => api.approvals.approve(id, "Approved from Operations Approval Center"),
    onSuccess: refreshApprovals,
  });
  const denyMut = useMutation({
    mutationFn: (id: string) => api.approvals.deny(id, "Denied from Operations Approval Center"),
    onSuccess: refreshApprovals,
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => api.approvals.cancel(id, "Cancelled from Operations Approval Center"),
    onSuccess: refreshApprovals,
  });

  const approvals: ApprovalRequest[] = approvalsQ.data?.approvals ?? [];
  const jobsById = new Map((jobsQ.data?.jobs ?? []).map(job => [job.id, job]));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Shield} title="Approval Center"
          actions={
            <Btn onClick={() => {
              void approvalsQ.refetch();
              void jobsQ.refetch();
            }} size="xs">
              <RefreshCw size={10} /> Refresh
            </Btn>
          }
        />
        <div className="p-4 space-y-2">
          {approvalsQ.isLoading && <div className="text-sm" style={{ color: "var(--color-muted)" }}>Loading approvals...</div>}
          {approvals.length === 0 && !approvalsQ.isLoading && (
            <div className="text-sm" style={{ color: "var(--color-muted)" }}>No approval requests recorded.</div>
          )}
          {approvals.map(approval => {
            const job = approval.jobId ? jobsById.get(approval.jobId) : undefined;
            const pending = approveMut.variables === approval.id || denyMut.variables === approval.id || cancelMut.variables === approval.id;
            const canDecide = approval.status === "waiting_for_approval";
            return (
              <div key={approval.id} className="rounded-lg p-3 text-xs space-y-2"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold" style={{ color: "var(--color-foreground)" }}>{approval.title}</span>
                      <span style={{ color: approvalStatusColor(approval.status) }}>{approval.status}</span>
                      <span style={{ color: "var(--color-muted)" }}>{approval.riskTier}</span>
                      {approval.physicalTier && <span style={{ color: "var(--color-error)" }}>{approval.physicalTier}</span>}
                    </div>
                    <div className="mt-1" style={{ color: "var(--color-muted)" }}>{approval.summary}</div>
                    <div className="font-mono truncate mt-1" style={{ color: "var(--color-muted)" }}>
                      {approval.requestedAction} · {approval.id.slice(0, 8)}
                      {job && ` · job ${job.state} retry ${job.retryCount}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {pending && <Loader2 size={12} className="animate-spin" style={{ color: "var(--color-muted)" }} />}
                    {canDecide && (
                      <>
                        <Btn onClick={() => approveMut.mutate(approval.id)} disabled={pending} size="xs" variant="accent">
                          <CheckCircle size={10} /> Approve
                        </Btn>
                        <Btn onClick={() => denyMut.mutate(approval.id)} disabled={pending} size="xs" variant="danger">
                          <XCircle size={10} /> Deny
                        </Btn>
                      </>
                    )}
                    {!["completed", "failed", "cancelled", "denied"].includes(approval.status) && (
                      <Btn onClick={() => cancelMut.mutate(approval.id)} disabled={pending} size="xs">
                        <Square size={10} /> Cancel
                      </Btn>
                    )}
                  </div>
                </div>
                {approval.result && (
                  <pre className="text-xs overflow-auto rounded-lg p-2"
                    style={{ background: "var(--color-surface)", color: "var(--color-muted)", border: "1px solid var(--color-border)", maxHeight: 120 }}>
                    {JSON.stringify(approval.result, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
          {(approveMut.isError || denyMut.isError || cancelMut.isError) && (
            <div className="text-xs" style={{ color: "var(--color-error)" }}>
              {apiErrorMessage(approveMut.error || denyMut.error || cancelMut.error, "Approval action failed")}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

const RUNTIME_MODES: RuntimeMode[] = [
  "Lightweight",
  "Coding",
  "Vision",
  "Media",
  "Business",
  "Maker",
  "HomeLab",
  "HomeShop",
  "Gaming",
  "EmergencyStop",
];

function policyColor(policy: ServicePolicy): string {
  if (policy.resourceClass === "gpu" || policy.resourceClass === "physical") return "var(--color-error)";
  if (policy.resourceClass === "heavy") return "var(--color-warn)";
  return "var(--color-muted)";
}

function RuntimeModePanel() {
  const qc = useQueryClient();
  const [selectedMode, setSelectedMode] = useState<RuntimeMode>("Lightweight");
  const [policyError, setPolicyError] = useState<string | null>(null);
  const permissions = useAgentPermissions();
  const editsDisabled = permissions.settings ? !permissions.canEdit : false;

  const runtimeQ = useQuery({
    queryKey: ["runtime-mode"],
    queryFn: () => api.runtime.get(),
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (runtimeQ.data?.mode) setSelectedMode(runtimeQ.data.mode);
  }, [runtimeQ.data?.mode]);

  const setModeMut = useMutation({
    mutationFn: (mode: RuntimeMode) => api.runtime.setMode(mode, `Operations panel selected ${mode}`),
    onSuccess: (data) => {
      setSelectedMode(data.mode);
      void qc.invalidateQueries({ queryKey: ["runtime-mode"] });
    },
  });

  const emergencyMut = useMutation({
    mutationFn: () => api.runtime.emergencyStop("Emergency Stop from Operations panel"),
    onSuccess: (data) => {
      setSelectedMode(data.mode);
      void qc.invalidateQueries({ queryKey: ["runtime-mode"] });
    },
  });

  const policyMut = useMutation({
    mutationFn: ({ id, startupPolicy }: { id: string; startupPolicy: ServicePolicy["startupPolicy"] }) =>
      api.runtime.updatePolicy(id, { startupPolicy }),
    onSuccess: () => {
      setPolicyError(null);
      void qc.invalidateQueries({ queryKey: ["runtime-mode"] });
    },
    onError: (error) => setPolicyError(apiErrorMessage(error, "Policy update failed")),
  });

  const mode = runtimeQ.data?.mode ?? selectedMode;
  const policies = runtimeQ.data?.servicePolicies ?? [];
  const actions = runtimeQ.data?.actions ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Gamepad2} title="Runtime Mode"
          actions={
            <Btn onClick={() => void runtimeQ.refetch()} size="xs">
              <RefreshCw size={10} /> Refresh
            </Btn>
          }
        />
        <div className="p-4 space-y-4">
          {editsDisabled && <PermissionNotice permission="allowAgentEdits" />}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedMode}
              onChange={event => setSelectedMode(event.target.value as RuntimeMode)}
              className="px-3 py-1.5 rounded-lg text-sm"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}>
              {RUNTIME_MODES.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <Btn
              onClick={() => setModeMut.mutate(selectedMode)}
              disabled={setModeMut.isPending || editsDisabled || selectedMode === mode}
              variant={selectedMode === "Gaming" ? "accent" : selectedMode === "EmergencyStop" ? "danger" : "default"}>
              {setModeMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Gamepad2 size={11} />}
              Set Mode
            </Btn>
            <Btn
              onClick={() => {
                if (window.confirm("Activate Emergency Stop? This unloads safe models, cancels queued work, and blocks physical actions.")) {
                  emergencyMut.mutate();
                }
              }}
              disabled={emergencyMut.isPending}
              variant="danger">
              {emergencyMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Power size={11} />}
              Emergency Stop
            </Btn>
            <span className="text-xs" style={{ color: mode === "EmergencyStop" ? "var(--color-error)" : "var(--color-muted)" }}>
              Current: {mode}
            </span>
            {runtimeQ.data?.physicalActionsDisabled && (
              <span className="text-xs" style={{ color: "var(--color-error)" }}>Physical actions blocked</span>
            )}
          </div>
          <Feedback
            isPending={setModeMut.isPending || emergencyMut.isPending}
            isSuccess={setModeMut.isSuccess || emergencyMut.isSuccess}
            isError={setModeMut.isError || emergencyMut.isError}
            pendingMsg="Applying runtime controls..."
            successMsg="Runtime controls updated."
            error={(setModeMut.error || emergencyMut.error) as Error | null}
          />
          {actions.length > 0 && (
            <div className="space-y-1">
              {actions.slice(0, 6).map((action, index) => (
                <div key={`${action.target}-${index}`} className="text-xs rounded-lg px-3 py-2"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
                  <span style={{ color: action.status === "failed" ? "var(--color-error)" : action.status === "success" ? "var(--color-success)" : "var(--color-muted)" }}>
                    {action.status}
                  </span>
                  {" · "}{action.target} · {action.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader icon={Shield} title="Service Startup Policies" />
        <div className="p-4 space-y-2">
          {runtimeQ.isLoading && <div className="text-sm" style={{ color: "var(--color-muted)" }}>Loading...</div>}
          {policyError && <div className="text-xs" style={{ color: "var(--color-error)" }}>{policyError}</div>}
          {policies.map(policy => (
            <div key={policy.id} className="grid grid-cols-12 gap-3 items-center rounded-lg px-3 py-2 text-xs"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
              <div className="col-span-12 md:col-span-4 min-w-0">
                <div className="font-medium truncate" style={{ color: "var(--color-foreground)" }}>{policy.displayName}</div>
                <div className="truncate" style={{ color: "var(--color-muted)" }}>{policy.id}</div>
              </div>
              <div className="col-span-6 md:col-span-2" style={{ color: policyColor(policy) }}>{policy.resourceClass}</div>
              <div className="col-span-6 md:col-span-3 truncate" style={{ color: "var(--color-muted)" }}>
                {policy.allowedModes.join(", ")}
              </div>
              <div className="col-span-12 md:col-span-3 flex items-center justify-end gap-2">
                <select
                  value={policy.startupPolicy}
                  onChange={event => policyMut.mutate({ id: policy.id, startupPolicy: event.target.value as ServicePolicy["startupPolicy"] })}
                  disabled={policyMut.isPending || editsDisabled}
                  className="px-2 py-1 rounded-lg text-xs"
                  style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}>
                  <option value="disabled">disabled</option>
                  <option value="manual">manual</option>
                  <option value="on_demand">on demand</option>
                  <option value="mode_based">mode based</option>
                </select>
                {policy.requiresApproval && <span style={{ color: "var(--color-warn)" }}>approval</span>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function TimeTravelPanel() {
  const [scanRoot, setScanRoot] = useState("");
  const [selected, setSelected] = useState<TimeTravelBackup | null>(null);
  const [diff, setDiff]         = useState<TimeTravelDiff | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restored, setRestored]   = useState<string | null>(null);

  const backupsQ = useQuery({
    queryKey: ["timetravel-backups", scanRoot],
    queryFn:  () => api.timeTravel.scan(scanRoot || undefined),
    staleTime: 30_000,
  });

  const backups: TimeTravelBackup[] = backupsQ.data?.backups ?? [];

  async function loadDiff(bak: TimeTravelBackup) {
    setSelected(bak);
    setDiff(null);
    setRestored(null);
    try {
      const d = await api.timeTravel.diff(bak.bakPath);
      setDiff(d);
    } catch { /* ignore */ }
  }

  async function doRestore() {
    if (!selected) return;
    setRestoring(true);
    try {
      const r = await api.timeTravel.restore(selected.bakPath);
      setRestored(r.restored);
    } catch { /* ignore */ } finally {
      setRestoring(false);
    }
  }

  return (
    <Card>
      <CardHeader icon={Clock} title="Time Travel — .bak File Inspector" />
      <div className="p-4">
        {/* Scan root */}
        <div className="flex gap-2 mb-4">
          <input
            value={scanRoot}
            onChange={e => setScanRoot(e.target.value)}
            placeholder="Scan root directory (default: home)"
            className="flex-1 px-3 py-1.5 rounded-lg text-sm outline-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
          />
          <button
            onClick={() => void backupsQ.refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm"
            style={{ background: "var(--color-accent)", color: "#fff" }}>
            <Search size={13} /> Scan
          </button>
        </div>

        {backupsQ.isLoading && (
          <div className="flex items-center gap-2 py-4 text-sm" style={{ color: "var(--color-muted)" }}>
            <Loader2 size={14} className="animate-spin" /> Scanning…
          </div>
        )}

        {!backupsQ.isLoading && backups.length === 0 && (
          <p className="text-sm py-4 text-center" style={{ color: "var(--color-muted)" }}>No .bak files found.</p>
        )}

        {backups.length > 0 && (
          <div className="flex gap-4" style={{ minHeight: 280 }}>
            {/* Backup list */}
            <div className="w-64 shrink-0 overflow-y-auto space-y-1 border-r pr-3"
              style={{ borderColor: "var(--color-border)", maxHeight: 400 }}>
              {backups.map(b => (
                <button
                  key={b.bakPath}
                  onClick={() => void loadDiff(b)}
                  className="w-full text-left px-2 py-1.5 rounded text-xs transition-colors"
                  style={{
                    background: selected?.bakPath === b.bakPath ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent",
                    color: "var(--color-foreground)",
                  }}>
                  <div className="truncate font-medium">{b.filePath.split(/[\\/]/).pop()}</div>
                  <div className="truncate opacity-50">{b.modifiedAt.slice(0, 10)}</div>
                </button>
              ))}
            </div>

            {/* Diff view */}
            <div className="flex-1 min-w-0">
              {!selected && (
                <p className="text-xs py-4" style={{ color: "var(--color-muted)" }}>Select a backup to inspect.</p>
              )}
              {selected && !diff && (
                <div className="flex items-center gap-2 py-4 text-xs" style={{ color: "var(--color-muted)" }}>
                  <Loader2 size={12} className="animate-spin" /> Loading diff…
                </div>
              )}
              {diff && (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <FileDiff size={13} style={{ color: "var(--color-accent)" }} />
                    <span className="text-xs font-medium truncate" style={{ color: "var(--color-foreground)" }}>
                      {diff.origPath.split(/[\\/]/).pop()}
                    </span>
                    {!diff.origExists && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, var(--color-warn) 15%, transparent)", color: "var(--color-warn)" }}>
                        Original deleted
                      </span>
                    )}
                    <button
                      onClick={() => void doRestore()}
                      disabled={restoring}
                      className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium disabled:opacity-50"
                      style={{ background: "var(--color-accent)", color: "#fff" }}>
                      {restoring ? <Loader2 size={10} className="animate-spin" /> : <Restore size={10} />}
                      Restore
                    </button>
                  </div>
                  {restored && (
                    <div className="text-xs mb-2 px-2 py-1.5 rounded"
                      style={{ background: "color-mix(in srgb, var(--color-success) 12%, transparent)", color: "var(--color-success)" }}>
                      Restored to {restored}
                    </div>
                  )}
                  {diff.hasChanges ? (
                    <pre className="text-xs overflow-auto p-3 rounded"
                      style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", maxHeight: 300, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                      {diff.diff}
                    </pre>
                  ) : (
                    <p className="text-xs" style={{ color: "var(--color-muted)" }}>No changes — backup matches current file.</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function RecoveryPanel() {
  const qc = useQueryClient();
  const [selectedManifestId, setSelectedManifestId] = useState("");
  const [currentManifestId, setCurrentManifestId] = useState("");

  const statusQ = useQuery({
    queryKey: ["recovery-status"],
    queryFn: () => api.recoveryApi.status(),
    staleTime: 20_000,
  });
  const backupsQ = useQuery({
    queryKey: ["recovery-backups"],
    queryFn: () => api.recoveryApi.backups(20),
    staleTime: 20_000,
  });
  const installPlanQ = useQuery({
    queryKey: ["recovery-install-plan"],
    queryFn: () => api.recoveryApi.installPlan(),
    staleTime: 60_000,
  });

  const createBackupM = useMutation({
    mutationFn: (dryRun: boolean) => api.recoveryApi.createBackup(dryRun),
    onSuccess: (data) => {
      setSelectedManifestId(data.manifest.id);
      if (!data.manifest.dryRun) setCurrentManifestId(data.manifest.id);
      void qc.invalidateQueries({ queryKey: ["recovery-status"] });
      void qc.invalidateQueries({ queryKey: ["recovery-backups"] });
    },
  });
  const dryRunM = useMutation({
    mutationFn: (manifestId: string) => api.recoveryApi.restoreDryRun(manifestId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["recovery-status"] }),
  });
  const proposeRestoreM = useMutation({
    mutationFn: ({ manifestId, currentBackupManifestId }: { manifestId: string; currentBackupManifestId?: string }) =>
      api.recoveryApi.proposeRestore(manifestId, currentBackupManifestId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["recovery-status"] }),
  });

  const status = statusQ.data;
  const latest = status?.latestBackup;
  const backups = backupsQ.data?.backups ?? [];
  const selected: RecoveryBackupManifest | undefined = backups.find(item => item.id === selectedManifestId) ?? latest ?? undefined;
  const dryRunResult = dryRunM.data?.plan.dryRunResult ?? status?.latestRestorePlan?.dryRunResult;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Database} title="Backup / Restore / Disaster Recovery"
          actions={
            <div className="flex items-center gap-2">
              <Btn onClick={() => createBackupM.mutate(true)} disabled={createBackupM.isPending}>
                <FileDiff size={11} /> Dry Run
              </Btn>
              <Btn onClick={() => createBackupM.mutate(false)} disabled={createBackupM.isPending} variant="accent">
                <HardDrive size={11} /> Manifest
              </Btn>
            </div>
          }
        />
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-lg p-3 text-xs" style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
              <div style={{ color: "var(--color-muted)" }}>Source</div>
              <div className="mt-1" style={{ color: "var(--color-foreground)" }}>Existing recovery systems</div>
            </div>
            <div className="rounded-lg p-3 text-xs" style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
              <div style={{ color: "var(--color-muted)" }}>Default</div>
              <div className="mt-1" style={{ color: "var(--color-success)" }}>{status?.localFirst ? "local-first" : "loading"}</div>
            </div>
            <div className="rounded-lg p-3 text-xs" style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
              <div style={{ color: "var(--color-muted)" }}>Real restore</div>
              <div className="mt-1" style={{ color: "var(--color-warn)" }}>{status?.realRestoreEnabled ? "enabled" : "not_configured"}</div>
            </div>
            <div className="rounded-lg p-3 text-xs" style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
              <div style={{ color: "var(--color-muted)" }}>Runtime</div>
              <div className="mt-1" style={{ color: "var(--color-foreground)" }}>{status?.runtimeMode ?? "loading"}</div>
            </div>
          </div>

          {latest && (
            <div className="rounded-lg p-3 text-xs space-y-1" style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
              <div className="flex items-center gap-2">
                <CheckCircle size={13} style={{ color: latest.noRawSecrets ? "var(--color-success)" : "var(--color-error)" }} />
                <span className="font-semibold" style={{ color: "var(--color-foreground)" }}>Latest manifest</span>
                <span style={{ color: "var(--color-muted)" }}>{latest.status}</span>
                <span className="font-mono" style={{ color: "var(--color-muted)" }}>{latest.id.slice(0, 8)}</span>
              </div>
              <div style={{ color: "var(--color-muted)" }}>
                {latest.scope.length} scopes · secrets excluded · model blobs excluded · destination path hidden
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold" style={{ color: "var(--color-foreground)" }}>Manifests</div>
              {backups.length === 0 && <div className="text-xs" style={{ color: "var(--color-muted)" }}>No recovery manifests recorded yet.</div>}
              {backups.slice(0, 6).map(manifest => (
                <button key={manifest.id} onClick={() => setSelectedManifestId(manifest.id)}
                  className="w-full text-left rounded-lg p-3 text-xs"
                  style={{
                    background: selected?.id === manifest.id ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "var(--color-elevated)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-muted)",
                  }}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono" style={{ color: "var(--color-foreground)" }}>{manifest.id.slice(0, 8)}</span>
                    <span style={{ color: manifest.dryRun ? "var(--color-muted)" : "var(--color-success)" }}>{manifest.status}</span>
                    <span>{manifest.timestamp.slice(0, 19).replace("T", " ")}</span>
                  </div>
                  <div className="mt-1">verification {manifest.verification.status} · raw secrets {manifest.noRawSecrets ? "excluded" : "check"}</div>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold" style={{ color: "var(--color-foreground)" }}>Restore dry-run</div>
              <div className="flex gap-2">
                <input
                  value={selectedManifestId}
                  onChange={e => setSelectedManifestId(e.target.value)}
                  placeholder="backup manifest id"
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-mono"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
                />
                <Btn onClick={() => dryRunM.mutate(selectedManifestId)} disabled={!selectedManifestId.trim() || dryRunM.isPending} variant="accent">
                  {dryRunM.isPending ? <Loader2 size={11} className="animate-spin" /> : <FileDiff size={11} />}
                  Dry Run
                </Btn>
              </div>
              <div className="flex gap-2">
                <input
                  value={currentManifestId}
                  onChange={e => setCurrentManifestId(e.target.value)}
                  placeholder="current-state backup id required before restore"
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-mono"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
                />
                <Btn
                  onClick={() => proposeRestoreM.mutate({ manifestId: selectedManifestId, currentBackupManifestId: currentManifestId || undefined })}
                  disabled={!selectedManifestId.trim() || proposeRestoreM.isPending}
                  variant="danger">
                  <Shield size={11} /> Propose
                </Btn>
              </div>
              {dryRunResult && (
                <div className="rounded-lg p-3 text-xs space-y-2" style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                  <div style={{ color: dryRunResult.status === "validation_passed" ? "var(--color-success)" : "var(--color-error)" }}>
                    {dryRunResult.status} · live data modified: {String(dryRunResult.liveDataModified)}
                  </div>
                  <div style={{ color: "var(--color-muted)" }}>
                    Would modify: {dryRunResult.wouldModify.slice(0, 3).join(" · ")}
                  </div>
                  <div style={{ color: "var(--color-warn)" }}>
                    Blocked: {dryRunResult.blockedActions.slice(0, 3).join(" · ")}
                  </div>
                </div>
              )}
              {(createBackupM.isError || dryRunM.isError || proposeRestoreM.isError) && (
                <div className="text-xs" style={{ color: "var(--color-error)" }}>
                  {apiErrorMessage(createBackupM.error || dryRunM.error || proposeRestoreM.error, "Recovery action failed")}
                </div>
              )}
              {(createBackupM.isSuccess || dryRunM.isSuccess || proposeRestoreM.isSuccess) && (
                <div className="text-xs" style={{ color: "var(--color-success)" }}>
                  {(createBackupM.data?.message || dryRunM.data?.message || proposeRestoreM.data?.message) ?? "Recovery action recorded."}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader icon={Shield} title="Gaming PC Install Safety" />
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {(installPlanQ.data?.steps ?? []).map(step => (
            <div key={step} className="rounded-lg p-3" style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
              {step}
            </div>
          ))}
          {status?.providers.map(provider => (
            <div key={provider.id} className="rounded-lg p-3" style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
              <div className="font-semibold" style={{ color: "var(--color-foreground)" }}>{provider.name}</div>
              <div style={{ color: provider.status === "local" ? "var(--color-success)" : "var(--color-warn)" }}>{provider.status}</div>
              <div className="mt-1" style={{ color: "var(--color-muted)" }}>{provider.reason}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type OpsTab = "stack" | "runtime" | "updater" | "maintainer" | "recovery" | "rollback" | "repair" | "sysupdate" | "approvals" | "mission" | "foundation" | "osinterop" | "timetravel";

const TABS: Array<{ id: OpsTab; label: string }> = [
  { id: "stack",      label: "Stack" },
  { id: "runtime",    label: "Runtime" },
  { id: "updater",    label: "Model Updater" },
  { id: "maintainer", label: "Maintainer" },
  { id: "recovery",   label: "Recovery" },
  { id: "rollback",   label: "Rollback" },
  { id: "repair",     label: "Repair Log" },
  { id: "sysupdate",  label: "System Updates" },
  { id: "approvals",  label: "Approvals" },
  { id: "mission",    label: "Mission Replay" },
  { id: "foundation", label: "Foundation" },
  { id: "osinterop",  label: "OS Interop" },
  { id: "timetravel", label: "Time Travel" },
];

export default function OperationsPage() {
  const [tab, setTab] = useState<OpsTab>("stack");

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6"
      style={{ background: "var(--color-background)" }}>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-foreground)" }}>Operations</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            Stack control · model updates · maintainer proposals · rollback · repair log
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", width: "fit-content" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: tab === t.id ? "var(--color-accent)" : "transparent",
              color: tab === t.id ? "#fff" : "var(--color-muted)",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "stack"      && <StackPanel />}
      {tab === "runtime"    && <RuntimeModePanel />}
      {tab === "updater"    && <UpdaterPanel />}
      {tab === "maintainer" && <MaintainerPanel />}
      {tab === "recovery"   && <RecoveryPanel />}
      {tab === "rollback"   && <RollbackPanel />}
      {tab === "repair"     && <RepairLogPanel />}
      {tab === "sysupdate"  && <SystemUpdatesPanel />}
      {tab === "approvals"  && <ApprovalPanel />}
      {tab === "mission"    && <MissionReplayPanel />}
      {tab === "foundation" && <FoundationPanel />}
      {tab === "osinterop"  && <OsInteropPanel />}
      {tab === "timetravel" && <TimeTravelPanel />}
    </div>
  );
}
