import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import {
  CheckCircle, XCircle, Play, Square, Download, Pin, RefreshCw, ExternalLink, Info,
  Monitor, MousePointer, Keyboard, Focus, Camera, Layers, AlertTriangle,
} from "lucide-react";
import api, { type IntegrationEntry } from "../api.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MANAGED_METHODS = new Set(["pip", "winget", "npm", "vscode"]);

function isManaged(installMethod: string) {
  return MANAGED_METHODS.has(installMethod);
}

const CATEGORY_ORDER = ["core", "coding", "devops", "hardware", "computer-use"];

function categoryLabel(c: string) {
  const m: Record<string, string> = {
    core: "Core", coding: "Coding", devops: "DevOps",
    hardware: "Hardware", "computer-use": "Computer Use",
  };
  return m[c] ?? c;
}

function StatusPill({ installed, running }: { installed: boolean; running: boolean }) {
  if (running) return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: "color-mix(in srgb, var(--color-success) 15%, transparent)", color: "var(--color-success)" }}>
      running
    </span>
  );
  if (installed) return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: "color-mix(in srgb, var(--color-warn) 15%, transparent)", color: "var(--color-warn)" }}>
      installed
    </span>
  );
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: "color-mix(in srgb, var(--color-muted) 12%, transparent)", color: "var(--color-muted)" }}>
      not installed
    </span>
  );
}

// ── Integration card ──────────────────────────────────────────────────────────

function IntegrationCard({
  intg, onInstall, onStart, onPin, onUpdate, busy,
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
          <button onClick={() => setExpanded(v => !v)} title="Details"
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

// ── WorldGUI Control Panel ────────────────────────────────────────────────────

function WorldGuiPanel() {
  const qc = useQueryClient();
  const [clickX, setClickX] = useState("");
  const [clickY, setClickY] = useState("");
  const [typeText, setTypeText] = useState("");
  const [focusWin, setFocusWin] = useState("");
  const [winPattern, setWinPattern] = useState("");
  const [msg, setMsg] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ["worldgui-status"],
    queryFn: () => api.worldgui.status(),
    refetchInterval: 5000,
  });

  const { data: windows } = useQuery({
    queryKey: ["worldgui-windows", winPattern],
    queryFn: () => api.worldgui.windows(winPattern || undefined),
    enabled: !!status?.installed,
    staleTime: 3000,
  });

  const installMut = useMutation({
    mutationFn: () => api.worldgui.install(),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["worldgui-status"] }); },
  });
  const launchMut = useMutation({
    mutationFn: () => api.worldgui.launch(),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["worldgui-status"] }); },
  });
  const stopMut = useMutation({
    mutationFn: () => api.worldgui.stop(),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["worldgui-status"] }); },
  });

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(""), 4000);
  }

  async function doClick() {
    const x = parseInt(clickX), y = parseInt(clickY);
    if (isNaN(x) || isNaN(y)) return flash("Enter valid x and y numbers");
    const r = await api.worldgui.click(x, y);
    flash(r.success ? `Clicked (${x}, ${y})` : "Click failed");
  }

  async function doType() {
    if (!typeText) return;
    const r = await api.worldgui.type(typeText);
    flash(r.success ? "Typed!" : "Type failed");
  }

  async function doFocus() {
    if (!focusWin) return;
    const r = await api.worldgui.focus(focusWin);
    flash(r.success ? `Focused: ${r.window}` : "Window not found");
  }

  async function doScreenshot() {
    setScreenshotLoading(true);
    try {
      const r = await api.worldgui.screenshot();
      if (r.success) setScreenshot(`data:${r.mimeType};base64,${r.base64}`);
      else flash("Screenshot failed");
    } finally {
      setScreenshotLoading(false);
    }
  }

  if (isLoading) return (
    <div className="text-sm text-center py-8" style={{ color: "var(--color-muted)" }}>Checking WorldGUI…</div>
  );

  return (
    <div className="space-y-4">
      {/* Status + actions */}
      <div className="rounded-xl p-4 flex items-center justify-between"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-3">
          <Monitor size={20} style={{ color: status?.running ? "var(--color-success)" : "var(--color-muted)" }} />
          <div>
            <div className="font-medium text-sm" style={{ color: "var(--color-foreground)" }}>WorldGUI — Computer Use Agent</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
              {status?.running ? `Running on port ${status.port}` : status?.installed ? "Installed · not running" : "Not installed"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!status?.installed && (
            <button
              disabled={installMut.isPending}
              onClick={() => installMut.mutate()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--color-accent)", color: "#fff", opacity: installMut.isPending ? 0.6 : 1 }}>
              <Download size={12} /> {installMut.isPending ? "Installing…" : "Install"}
            </button>
          )}
          {status?.installed && !status.running && (
            <button
              disabled={launchMut.isPending}
              onClick={() => launchMut.mutate()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "color-mix(in srgb, var(--color-success) 18%, transparent)", color: "var(--color-success)" }}>
              <Play size={12} /> {launchMut.isPending ? "Starting…" : "Launch"}
            </button>
          )}
          {status?.running && (
            <button
              disabled={stopMut.isPending}
              onClick={() => stopMut.mutate()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "color-mix(in srgb, var(--color-error) 15%, transparent)", color: "var(--color-error)" }}>
              <Square size={12} /> {stopMut.isPending ? "Stopping…" : "Stop"}
            </button>
          )}
        </div>
      </div>

      {installMut.data && (
        <pre className="text-xs p-3 rounded-lg overflow-x-auto"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
          {installMut.data.output}
        </pre>
      )}

      {msg && (
        <div className="text-xs px-3 py-2 rounded-lg"
          style={{ background: "color-mix(in srgb, var(--color-info) 10%, transparent)", color: "var(--color-info)", border: "1px solid color-mix(in srgb, var(--color-info) 20%, transparent)" }}>
          {msg}
        </div>
      )}

      {status?.installed && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Click control */}
          <div className="rounded-xl p-4 space-y-3"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
              <MousePointer size={14} /> Click at Coordinates
            </div>
            <div className="flex gap-2">
              <input
                type="number" placeholder="X" value={clickX} onChange={e => setClickX(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded-lg text-xs font-mono"
                style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }} />
              <input
                type="number" placeholder="Y" value={clickY} onChange={e => setClickY(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded-lg text-xs font-mono"
                style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }} />
              <button onClick={doClick}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: "var(--color-accent)", color: "#fff" }}>
                Click
              </button>
            </div>
          </div>

          {/* Type text */}
          <div className="rounded-xl p-4 space-y-3"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
              <Keyboard size={14} /> Type Text
            </div>
            <div className="flex gap-2">
              <input
                placeholder="Text to type…" value={typeText} onChange={e => setTypeText(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded-lg text-xs"
                style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }} />
              <button onClick={doType}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: "var(--color-accent)", color: "#fff" }}>
                Type
              </button>
            </div>
          </div>

          {/* Focus window */}
          <div className="rounded-xl p-4 space-y-3"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
              <Focus size={14} /> Focus Window
            </div>
            <div className="flex gap-2">
              <input
                placeholder="Window title…" value={focusWin} onChange={e => setFocusWin(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded-lg text-xs"
                style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }} />
              <button onClick={doFocus}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: "var(--color-accent)", color: "#fff" }}>
                Focus
              </button>
            </div>
          </div>

          {/* Screenshot */}
          <div className="rounded-xl p-4 space-y-3"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
              <Camera size={14} /> Screenshot
            </div>
            <button onClick={doScreenshot} disabled={screenshotLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)", opacity: screenshotLoading ? 0.6 : 1 }}>
              <Camera size={12} /> {screenshotLoading ? "Capturing…" : "Capture Screen"}
            </button>
          </div>
        </div>
      )}

      {/* Screenshot preview */}
      {screenshot && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
          <div className="flex items-center justify-between px-3 py-2"
            style={{ background: "var(--color-elevated)", borderBottom: "1px solid var(--color-border)" }}>
            <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Live Screenshot</span>
            <button onClick={() => setScreenshot(null)} className="text-xs" style={{ color: "var(--color-muted)" }}>✕</button>
          </div>
          <img src={screenshot} alt="Screenshot" className="w-full" style={{ display: "block", maxHeight: 400, objectFit: "contain", background: "#000" }} />
        </div>
      )}

      {/* Windows list */}
      {status?.installed && (
        <div className="rounded-xl p-4 space-y-3"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
              <Layers size={14} /> Open Windows
            </div>
            <input
              placeholder="Filter…" value={winPattern} onChange={e => setWinPattern(e.target.value)}
              className="px-2 py-1 rounded-lg text-xs w-36"
              style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }} />
          </div>
          {windows?.windows && windows.windows.length > 0 ? (
            <div className="space-y-1">
              {windows.windows.map((w, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg text-xs"
                  style={{ background: "var(--color-elevated)" }}>
                  <span style={{ color: "var(--color-foreground)" }}>{w.title || "(no title)"}</span>
                  <div className="flex items-center gap-2">
                    <span style={{ color: "var(--color-muted)" }}>{w.processName}</span>
                    <button
                      onClick={() => { setFocusWin(w.title); void api.worldgui.focus(w.title).then(r => flash(r.success ? `Focused: ${w.title}` : "Not found")); }}
                      className="px-2 py-0.5 rounded text-xs"
                      style={{ background: "var(--color-accent)", color: "#fff" }}>
                      Focus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>No windows found{winPattern ? ` matching "${winPattern}"` : ""}.</div>
          )}
        </div>
      )}

      {/* Slash command reference */}
      <div className="rounded-xl p-4"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <div className="text-xs font-semibold mb-2" style={{ color: "var(--color-muted)" }}>Chat Slash Commands</div>
        <div className="grid grid-cols-1 gap-1 text-xs font-mono">
          {[
            ["/wg-screenshot", "Capture screen → attach to chat"],
            ["/wg-click 500 300", "Click at (500, 300)"],
            ["/wg-type hello world", "Type text into focused window"],
            ["/wg-focus Notepad", "Focus window by title"],
            ["/wg-windows", "List all open windows"],
          ].map(([cmd, desc]) => (
            <div key={cmd} className="flex gap-3">
              <span style={{ color: "var(--color-accent)", minWidth: 200 }}>{cmd}</span>
              <span style={{ color: "var(--color-muted)" }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "all" | "worldgui";

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => api.integrations.list(),
    staleTime: 30_000,
  });

  function setBusy(id: string, busy: boolean) {
    setBusyIds(prev => { const s = new Set(prev); if (busy) s.add(id); else s.delete(id); return s; });
  }

  function setMsg(id: string, m: string) {
    setMessages(prev => ({ ...prev, [id]: m }));
    setTimeout(() => setMessages(prev => { const n = { ...prev }; delete n[id]; return n; }), 5000);
  }

  async function doAction(id: string, fn: () => Promise<{ success: boolean; message?: string; output?: string }>) {
    setBusy(id, true);
    try {
      const r = await fn();
      setMsg(id, r.message ?? r.output ?? (r.success ? "Done" : "Failed"));
      if (r.success) void qc.invalidateQueries({ queryKey: ["integrations"] });
    } catch (e) {
      setMsg(id, e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(id, false);
    }
  }

  const integrationsList = data?.integrations ?? [];
  const pinned = integrationsList.filter(i => i.pinned);
  const byCategory = integrationsList.reduce<Record<string, IntegrationEntry[]>>((acc, i) => {
    (acc[i.category] ??= []).push(i);
    return acc;
  }, {});
  const categories = [
    ...CATEGORY_ORDER.filter(c => byCategory[c]),
    ...Object.keys(byCategory).filter(c => !CATEGORY_ORDER.includes(c)),
  ];

  const TABS: { id: Tab; label: string }[] = [
    { id: "all", label: "All Integrations" },
    { id: "worldgui", label: "WorldGUI Control Panel" },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6"
      style={{ background: "var(--color-background)" }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-foreground)" }}>Integrations</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            {integrationsList.length} integrations · {integrationsList.filter(i => i.running).length} running · {integrationsList.filter(i => i.installed).length} installed
          </p>
        </div>
        <button onClick={() => void qc.invalidateQueries({ queryKey: ["integrations"] })}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit"
        style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: tab === t.id ? "var(--color-accent)" : "transparent",
              color: tab === t.id ? "#fff" : "var(--color-muted)",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* WorldGUI tab */}
      {tab === "worldgui" && <WorldGuiPanel />}

      {/* All integrations tab */}
      {tab === "all" && (
        <>
          {isLoading && (
            <div className="text-sm text-center py-12" style={{ color: "var(--color-muted)" }}>Loading integrations…</div>
          )}

          {/* Pinned */}
          {pinned.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: "var(--color-muted)" }}>Pinned</div>
              <div className="grid gap-3">
                {pinned.map(intg => (
                  <div key={intg.id}>
                    <IntegrationCard
                      intg={intg} busy={busyIds.has(intg.id)}
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
          {categories.map(cat => {
            const items = byCategory[cat] ?? [];
            if (!items.length) return null;
            return (
              <div key={cat}>
                <div className="text-xs font-semibold uppercase tracking-widest mb-3"
                  style={{ color: "var(--color-muted)" }}>{categoryLabel(cat)}</div>
                <div className="grid gap-3">
                  {items.map(intg => (
                    <div key={intg.id}>
                      <IntegrationCard
                        intg={intg} busy={busyIds.has(intg.id)}
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
        </>
      )}
    </div>
  );
}
