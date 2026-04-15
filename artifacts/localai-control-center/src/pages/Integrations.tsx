import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  CheckCircle, XCircle, Play, Download, Pin, RefreshCw, ExternalLink, Info,
} from "lucide-react";
import api, { type IntegrationEntry } from "../api.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MANAGED_METHODS = new Set(["pip", "winget", "npm", "vscode"]);

function isManaged(installMethod: string) {
  return MANAGED_METHODS.has(installMethod);
}

const CATEGORY_ORDER = ["core", "coding", "devops", "hardware"];

function categoryLabel(c: string) {
  const m: Record<string, string> = { core: "Core", coding: "Coding", devops: "DevOps", hardware: "Hardware" };
  return m[c] ?? c;
}

function StatusPill({ installed, running }: { installed: boolean; running: boolean }) {
  if (running)    return <span className="text-xs px-2 py-0.5 rounded-full font-medium"
    style={{ background: "color-mix(in srgb, var(--color-success) 15%, transparent)", color: "var(--color-success)" }}>
    running
  </span>;
  if (installed)  return <span className="text-xs px-2 py-0.5 rounded-full font-medium"
    style={{ background: "color-mix(in srgb, var(--color-warn) 15%, transparent)", color: "var(--color-warn)" }}>
    installed
  </span>;
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium"
    style={{ background: "color-mix(in srgb, var(--color-muted) 12%, transparent)", color: "var(--color-muted)" }}>
    not installed
  </span>;
}

// ── Integration card ──────────────────────────────────────────────────────────

function IntegrationCard({
  intg,
  onInstall,
  onStart,
  onPin,
  onUpdate,
  busy,
}: {
  intg: IntegrationEntry;
  onInstall: () => void;
  onStart: () => void;
  onPin: () => void;
  onUpdate: () => void;
  busy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: "var(--color-surface)", border: `1px solid ${intg.pinned ? "var(--color-accent)" : "var(--color-border)"}` }}>

      <div className="flex items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm" style={{ color: "var(--color-foreground)" }}>{intg.name}</span>
            <StatusPill installed={intg.installed} running={intg.running} />
            {!isManaged(intg.installMethod) && (
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "color-mix(in srgb, var(--color-muted) 12%, transparent)", color: "var(--color-muted)" }}>
                reference only
              </span>
            )}
            {intg.pinned && (
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "color-mix(in srgb, var(--color-accent) 15%, transparent)", color: "var(--color-accent)" }}>
                pinned
              </span>
            )}
            {intg.updateAvailable && (
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "color-mix(in srgb, var(--color-info) 15%, transparent)", color: "var(--color-info)" }}>
                update available
              </span>
            )}
          </div>
          <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--color-muted)" }}>{intg.description}</p>
          {intg.version && (
            <div className="text-xs mt-1 font-mono" style={{ color: "var(--color-muted)" }}>v{intg.version}</div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {intg.installed && intg.updateAvailable && (
            <button disabled={busy} onClick={onUpdate} title="Update"
              className="p-1.5 rounded-lg"
              style={{ background: "var(--color-elevated)", color: "var(--color-info)" }}>
              <RefreshCw size={13} />
            </button>
          )}
          {!intg.installed && isManaged(intg.installMethod) && (
            <button disabled={busy} onClick={onInstall} title="Install"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--color-accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}>
              <Download size={12} /> Install
            </button>
          )}
          {!intg.installed && !isManaged(intg.installMethod) && (
            <span className="text-xs px-2.5 py-1.5 rounded-lg"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
              Clone manually
            </span>
          )}
          {intg.installed && !intg.running && intg.startCmd && (
            <button disabled={busy} onClick={onStart} title="Start"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "color-mix(in srgb, var(--color-success) 18%, transparent)", color: "var(--color-success)", opacity: busy ? 0.6 : 1 }}>
              <Play size={12} /> Start
            </button>
          )}
          {intg.installed && intg.running && (
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{ color: "var(--color-success)" }}>
              <CheckCircle size={12} /> Running
            </div>
          )}
          <button onClick={onPin} title={intg.pinned ? "Unpin" : "Pin"}
            className="p-1.5 rounded-lg"
            style={{
              background: "var(--color-elevated)",
              color: intg.pinned ? "var(--color-accent)" : "var(--color-muted)",
            }}>
            <Pin size={13} />
          </button>
          <button onClick={() => setExpanded((v) => !v)} title="Details"
            className="p-1.5 rounded-lg"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
            <Info size={13} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 text-xs space-y-2"
          style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div><span style={{ color: "var(--color-muted)" }}>Method:</span> <span style={{ color: "var(--color-foreground)" }}>{intg.installMethod}</span></div>
            {intg.localPort && <div><span style={{ color: "var(--color-muted)" }}>Port:</span> <span style={{ color: "var(--color-foreground)" }}>:{intg.localPort}</span></div>}
            <div className="col-span-2"><span style={{ color: "var(--color-muted)" }}>Used for:</span> <span style={{ color: "var(--color-foreground)" }}>{intg.usedFor}</span></div>
          </div>
          {intg.aiderTip && (
            <div className="p-2 rounded-lg text-xs"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
              Tip: {intg.aiderTip}
            </div>
          )}
          <div className="flex gap-3">
            <a href={intg.repo} target="_blank" rel="noreferrer"
              className="flex items-center gap-1"
              style={{ color: "var(--color-accent)", textDecoration: "none" }}>
              <ExternalLink size={11} /> Repo
            </a>
            <a href={intg.docs} target="_blank" rel="noreferrer"
              className="flex items-center gap-1"
              style={{ color: "var(--color-accent)", textDecoration: "none" }}>
              <ExternalLink size={11} /> Docs
            </a>
          </div>
          <div className="space-y-1">
            <div className="font-mono p-1.5 rounded text-xs overflow-x-auto"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
              install: {intg.installCmd}
            </div>
            {intg.startCmd && (
              <div className="font-mono p-1.5 rounded text-xs overflow-x-auto"
                style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
                start: {intg.startCmd}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => api.integrations.list(),
    staleTime: 30_000,
  });

  function setBusy(id: string, busy: boolean) {
    setBusyIds((prev) => { const s = new Set(prev); if (busy) s.add(id); else s.delete(id); return s; });
  }

  function setMsg(id: string, msg: string) {
    setMessages((prev) => ({ ...prev, [id]: msg }));
    setTimeout(() => setMessages((prev) => { const n = { ...prev }; delete n[id]; return n; }), 5000);
  }

  async function doAction(id: string, fn: () => Promise<{ success: boolean; message?: string }>) {
    setBusy(id, true);
    try {
      const r = await fn();
      setMsg(id, r.message ?? (r.success ? "Done" : "Failed"));
      if (r.success) void qc.invalidateQueries({ queryKey: ["integrations"] });
    } catch (e) {
      setMsg(id, e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(id, false);
    }
  }

  const integrations = data?.integrations ?? [];
  const pinned = integrations.filter((i) => i.pinned);
  const byCategory = integrations.reduce<Record<string, IntegrationEntry[]>>((acc, i) => {
    (acc[i.category] ??= []).push(i);
    return acc;
  }, {});

  const categories = [...CATEGORY_ORDER.filter((c) => byCategory[c]), ...Object.keys(byCategory).filter((c) => !CATEGORY_ORDER.includes(c))];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6"
      style={{ background: "var(--color-background)" }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-foreground)" }}>Integrations</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            {integrations.length} integrations · {integrations.filter((i) => i.running).length} running · {integrations.filter((i) => i.installed).length} installed
          </p>
        </div>
        <button onClick={() => void qc.invalidateQueries({ queryKey: ["integrations"] })}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {isLoading && (
        <div className="text-sm text-center py-12" style={{ color: "var(--color-muted)" }}>Loading integrations…</div>
      )}

      {/* Pinned */}
      {pinned.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--color-muted)" }}>Pinned</div>
          <div className="grid gap-3">
            {pinned.map((intg) => (
              <div key={intg.id}>
                <IntegrationCard
                  intg={intg}
                  busy={busyIds.has(intg.id)}
                  onInstall={() => doAction(intg.id, () => api.integrations.install(intg.id))}
                  onStart={()   => doAction(intg.id, () => api.integrations.start(intg.id))}
                  onPin={()     => doAction(intg.id, () => api.integrations.pin(intg.id))}
                  onUpdate={()  => doAction(intg.id, () => api.integrations.update(intg.id))}
                />
                {messages[intg.id] && (
                  <div className="mt-1 text-xs px-2" style={{ color: "var(--color-muted)" }}>{messages[intg.id]}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By category */}
      {categories.map((cat) => {
        const items = byCategory[cat] ?? [];
        if (!items.length) return null;
        return (
          <div key={cat}>
            <div className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: "var(--color-muted)" }}>{categoryLabel(cat)}</div>
            <div className="grid gap-3">
              {items.map((intg) => (
                <div key={intg.id}>
                  <IntegrationCard
                    intg={intg}
                    busy={busyIds.has(intg.id)}
                    onInstall={() => doAction(intg.id, () => api.integrations.install(intg.id))}
                    onStart={()   => doAction(intg.id, () => api.integrations.start(intg.id))}
                    onPin={()     => doAction(intg.id, () => api.integrations.pin(intg.id))}
                    onUpdate={()  => doAction(intg.id, () => api.integrations.update(intg.id))}
                  />
                  {messages[intg.id] && (
                    <div className="mt-1 text-xs px-2" style={{ color: "var(--color-muted)" }}>{messages[intg.id]}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
