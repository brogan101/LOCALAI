import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Server, Play, Square, RotateCcw, HardDrive, Github, RefreshCw,
  Download, RotateCcwIcon, AlertTriangle, CheckCircle, XCircle,
  Clock, Package, Shield, ChevronDown, ChevronRight, Loader2,
  History, Wrench, ArrowDownToLine,
} from "lucide-react";
import api, { type StackComponent, type RepairLogEntry, type RepairHealthEntry } from "../api.js";

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

function RollbackPanel() {
  const [dirPath, setDirPath] = useState("");
  const [filePath, setFilePath] = useState("");
  const [backups, setBackups] = useState<unknown[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  const rollbackMut = useMutation({
    mutationFn: (fp: string) => api.rollback.rollback(fp),
  });

  async function listBackups() {
    if (!dirPath.trim()) return;
    setListError(null);
    try {
      const r = await api.rollback.listBackups(dirPath);
      setBackups(r.backups ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to list backups");
    }
  }

  return (
    <Card>
      <CardHeader icon={History} title="Rollback" />
      <div className="p-4 space-y-4">
        <div>
          <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Directory path — list all backups</div>
          <div className="flex gap-2">
            <input
              value={dirPath}
              onChange={(e) => setDirPath(e.target.value)}
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

        {backups.length > 0 && (
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
            {backups.map((b, i) => {
              const bk = b as { filePath?: string; backupPath?: string; createdAt?: string };
              return (
                <div key={i}
                  className="flex items-center gap-3 px-3 py-2 text-xs"
                  style={{ borderBottom: i < backups.length - 1 ? "1px solid var(--color-border)" : undefined }}>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono truncate" style={{ color: "var(--color-foreground)" }}>{bk.filePath ?? bk.backupPath ?? "unknown"}</div>
                    {bk.createdAt && <div style={{ color: "var(--color-muted)" }}>{new Date(bk.createdAt).toLocaleString()}</div>}
                  </div>
                  {bk.filePath && (
                    <Btn onClick={() => rollbackMut.mutate(bk.filePath!)} disabled={rollbackMut.isPending} size="xs" variant="danger">
                      <RotateCcwIcon size={10} /> Rollback
                    </Btn>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div>
          <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Rollback specific file</div>
          <div className="flex gap-2">
            <input
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
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

// ── Page ──────────────────────────────────────────────────────────────────────

type OpsTab = "stack" | "updater" | "rollback" | "repair" | "sysupdate";

const TABS: Array<{ id: OpsTab; label: string }> = [
  { id: "stack",     label: "Stack" },
  { id: "updater",   label: "Model Updater" },
  { id: "rollback",  label: "Rollback" },
  { id: "repair",    label: "Repair Log" },
  { id: "sysupdate", label: "System Updates" },
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

      {tab === "stack"     && <StackPanel />}
      {tab === "updater"   && <UpdaterPanel />}
      {tab === "rollback"  && <RollbackPanel />}
      {tab === "repair"    && <RepairLogPanel />}
      {tab === "sysupdate" && <SystemUpdatesPanel />}
    </div>
  );
}
