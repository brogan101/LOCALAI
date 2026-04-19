import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Server, Play, Square, RotateCcw, HardDrive, Github, RefreshCw,
  Download, RotateCcwIcon, AlertTriangle, CheckCircle, XCircle,
  Package, Shield, ChevronDown, ChevronRight, Loader2,
  History, Wrench, ArrowDownToLine, Monitor, Keyboard, MousePointer,
  Camera, Search, Clock, FileDiff, RotateCcw as Restore,
} from "lucide-react";
import api, {
  type StackComponent, type RepairLogEntry, type RepairHealthEntry,
  type BackupEntry, type OsWindow, type TimeTravelBackup, type TimeTravelDiff,
} from "../api.js";

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
  if (isError && error) return <span className="text-xs" style={{ color: "var(--color-error)" }}>{error.message}</span>;
  return null;
}

// ── Stack Panel ───────────────────────────────────────────────────────────────

function StackPanel() {
  const qc = useQueryClient();

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
            <Btn onClick={() => backupMut.mutate()} disabled={backupMut.isPending}>
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
              <Btn onClick={() => startMut.mutate(c.id)} disabled={busy(c.id)}>
                <Play size={10} /> Start
              </Btn>
            )}
            {c.running && (
              <>
                <Btn onClick={() => restartMut.mutate(c.id)} disabled={busy(c.id)}>
                  <RotateCcw size={10} /> Restart
                </Btn>
                <Btn onClick={() => stopMut.mutate(c.id)} disabled={busy(c.id)} variant="danger">
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
          <Btn onClick={() => ghAuthMut.mutate()} disabled={ghAuthMut.isPending} variant="accent">
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
            {(ghAuthMut.error as Error).message}
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
            <Btn onClick={() => backupMut.mutate()} disabled={backupMut.isPending}>
              <HardDrive size={11} /> {backupMut.isPending ? "Backing up…" : "Backup Settings"}
            </Btn>
            <Btn onClick={() => checkMut.mutate()} disabled={checkMut.isPending} variant="accent">
              <RefreshCw size={11} className={checkMut.isPending ? "animate-spin" : ""} />
              {checkMut.isPending ? "Checking…" : "Check Updates"}
            </Btn>
          </div>
        }
      />

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
                    <Btn onClick={() => updateMut.mutate(name)} disabled={isUpdating} variant="accent" size="xs">
                      {isUpdating ? <Loader2 size={10} className="animate-spin" /> : <ArrowDownToLine size={10} />}
                      {isUpdating ? "Updating…" : "Update"}
                    </Btn>
                  )}
                  <Btn onClick={() => rollbackMut.mutate(name)} disabled={isRolling} size="xs">
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
    </Card>
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
      setListError(e instanceof Error ? e.message : "Failed to list backups");
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
      setListError(e instanceof Error ? e.message : "Scan failed");
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
            <BackupTable backups={dirBackups} onRollback={fp => rollbackMut.mutate(fp)} rolling={rollbackMut.isPending} />
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
            <BackupTable backups={scanBackups} onRollback={fp => rollbackMut.mutate(fp)} rolling={rollbackMut.isPending} />
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
              <Btn onClick={() => rollbackMut.mutate(filePath)} disabled={!filePath.trim() || rollbackMut.isPending} variant="danger">
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
              disabled={repairMut.isPending}
              variant="accent">
              <Wrench size={11} />
              {repairMut.isPending ? "Repairing…" : `Repair ${repairable.length} issue${repairable.length !== 1 ? "s" : ""}`}
            </Btn>
          ) : undefined
        }
      />

      {repairMut.isSuccess && (
        <div className="px-4 py-2 text-xs" style={{ color: "var(--color-success)", borderBottom: "1px solid var(--color-border)" }}>
          Repair complete
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

  const checkMut = useMutation({
    mutationFn: () => api.systemExtra.updatesCheck(),
    onSuccess: (data) => setResults(data.items ?? []),
    onError: (e) => setError(e instanceof Error ? e.message : "Check failed"),
  });

  const runMut = useMutation({
    mutationFn: () => api.systemExtra.updatesRun(),
    onSuccess: () => setResults(null),
    onError: (e) => setError(e instanceof Error ? e.message : "Update failed"),
  });

  return (
    <Card>
      <CardHeader icon={Shield} title="System Updates"
        actions={
          <div className="flex items-center gap-2">
            {results && results.length > 0 && (
              <Btn onClick={() => runMut.mutate()} disabled={runMut.isPending} variant="accent">
                <ArrowDownToLine size={11} /> {runMut.isPending ? "Applying…" : "Apply Updates"}
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
                  {item.availableVersion && <span style={{ color: "var(--color-warn)" }}>→ {item.availableVersion}</span>}
                </div>
              );
            })}
          </div>
        )}
        {runMut.isSuccess && (
          <div className="mt-2 text-xs" style={{ color: "var(--color-success)" }}>Updates applied successfully</div>
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
    onError: (e) => setFeedback({ msg: e instanceof Error ? e.message : "Error", ok: false }),
  });
  const typeTextMut = useMutation({
    mutationFn: () => api.os.typeText(textInput),
    onSuccess: () => setFeedback({ msg: "Text typed", ok: true }),
    onError: (e) => setFeedback({ msg: e instanceof Error ? e.message : "Error", ok: false }),
  });
  const clickMut = useMutation({
    mutationFn: () => api.os.click(parseFloat(clickX), parseFloat(clickY)),
    onSuccess: () => setFeedback({ msg: "Click sent", ok: true }),
    onError: (e) => setFeedback({ msg: e instanceof Error ? e.message : "Error", ok: false }),
  });
  const screenshotMut = useMutation({
    mutationFn: () => api.os.screenshot(),
    onSuccess: r => { setScreenshot(r.base64); setFeedback({ msg: "Screenshot captured", ok: true }); },
    onError: (e) => setFeedback({ msg: e instanceof Error ? e.message : "Error", ok: false }),
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

// ── Page ──────────────────────────────────────────────────────────────────────

type OpsTab = "stack" | "updater" | "rollback" | "repair" | "sysupdate" | "osinterop" | "timetravel";

const TABS: Array<{ id: OpsTab; label: string }> = [
  { id: "stack",      label: "Stack" },
  { id: "updater",    label: "Model Updater" },
  { id: "rollback",   label: "Rollback" },
  { id: "repair",     label: "Repair Log" },
  { id: "sysupdate",  label: "System Updates" },
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
            Stack control · model updates · rollback · repair log · system updates
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
      {tab === "updater"    && <UpdaterPanel />}
      {tab === "rollback"   && <RollbackPanel />}
      {tab === "repair"     && <RepairLogPanel />}
      {tab === "sysupdate"  && <SystemUpdatesPanel />}
      {tab === "osinterop"  && <OsInteropPanel />}
      {tab === "timetravel" && <TimeTravelPanel />}
    </div>
  );
}
