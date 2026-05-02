import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import {
  CheckCircle, XCircle, Play, Square, Download, Pin, RefreshCw, ExternalLink, Info,
  Monitor, MousePointer, Keyboard, Focus, Camera, Layers, AlertTriangle, Shield, Lock, FlaskConical, Code,
} from "lucide-react";
import api, { apiErrorMessage, type BrowserActionProposal, type BrowserSessionProfile, type ClawGatewayStatus, type CodingAgentStatus, type CodingTaskProposal, type DesktopActionProposal, type DesktopAutomationStatus, type DockerMcpGatewayStatus, type IntegrationEntry, type PlaywrightBrowserStatus, type ToolPermissionScope, type ToolRecord } from "../api.js";
import { PermissionNotice } from "../components/PermissionNotice.js";
import { useAgentPermissions } from "../hooks/useAgentPermissions.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MANAGED_METHODS = new Set(["pip", "winget", "npm", "vscode"]);

function isManaged(installMethod: string) {
  return MANAGED_METHODS.has(installMethod);
}

const CATEGORY_ORDER = ["core", "business", "coding", "devops", "hardware", "computer-use"];

function categoryLabel(c: string) {
  const m: Record<string, string> = {
    core: "Core", business: "Business", coding: "Coding", devops: "DevOps",
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

function riskColor(risk: ToolRecord["riskLevel"]) {
  if (risk === "critical") return "var(--color-error)";
  if (risk === "high") return "var(--color-warn)";
  if (risk === "medium") return "var(--color-info)";
  return "var(--color-success)";
}

function compactScopes(scopes: ToolPermissionScope[]) {
  if (!scopes.length) return "none";
  return scopes.slice(0, 4).join(", ") + (scopes.length > 4 ? ` +${scopes.length - 4}` : "");
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
          {intg.localAiConfig && (
            <pre className="p-2 rounded-lg text-xs overflow-x-auto"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
              {JSON.stringify(intg.localAiConfig, null, 2)}
            </pre>
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
  const permissions = useAgentPermissions();
  const execDisabled = permissions.settings ? !permissions.canExec : false;
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
    try {
      const r = await api.worldgui.click(x, y);
      flash(r.success ? `Clicked (${x}, ${y})` : "Click failed");
    } catch (e) {
      flash(apiErrorMessage(e));
    }
  }

  async function doType() {
    if (!typeText) return;
    try {
      const r = await api.worldgui.type(typeText);
      flash(r.success ? "Typed!" : "Type failed");
    } catch (e) {
      flash(apiErrorMessage(e));
    }
  }

  async function doFocus() {
    if (!focusWin) return;
    try {
      const r = await api.worldgui.focus(focusWin);
      flash(r.success ? `Focused: ${r.window}` : "Window not found");
    } catch (e) {
      flash(apiErrorMessage(e));
    }
  }

  async function doScreenshot() {
    setScreenshotLoading(true);
    try {
      const r = await api.worldgui.screenshot();
      if (r.success) setScreenshot(`data:${r.mimeType};base64,${r.base64}`);
      else flash("Screenshot failed");
    } catch (e) {
      flash(apiErrorMessage(e, "Screenshot failed"));
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
              disabled={installMut.isPending || execDisabled}
              onClick={() => installMut.mutate()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--color-accent)", color: "#fff", opacity: installMut.isPending ? 0.6 : 1 }}>
              <Download size={12} /> {installMut.isPending ? "Installing…" : "Install"}
            </button>
          )}
          {status?.installed && !status.running && (
            <button
              disabled={launchMut.isPending || execDisabled}
              onClick={() => launchMut.mutate()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "color-mix(in srgb, var(--color-success) 18%, transparent)", color: "var(--color-success)" }}>
              <Play size={12} /> {launchMut.isPending ? "Starting…" : "Launch"}
            </button>
          )}
          {status?.running && (
            <button
              disabled={stopMut.isPending || execDisabled}
              onClick={() => stopMut.mutate()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "color-mix(in srgb, var(--color-error) 15%, transparent)", color: "var(--color-error)" }}>
              <Square size={12} /> {stopMut.isPending ? "Stopping…" : "Stop"}
            </button>
          )}
        </div>
      </div>
      {execDisabled && <PermissionNotice permission="allowAgentExec" />}
      {(installMut.error || launchMut.error || stopMut.error) && (
        <div className="text-xs" style={{ color: "var(--color-error)" }}>
          {apiErrorMessage(installMut.error || launchMut.error || stopMut.error)}
        </div>
      )}

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
              <button onClick={doClick} disabled={execDisabled}
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
              <button onClick={doType} disabled={execDisabled}
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
              <button onClick={doFocus} disabled={execDisabled}
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
            <button onClick={doScreenshot} disabled={screenshotLoading || execDisabled}
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

// ── Tool Registry ─────────────────────────────────────────────────────────────

function ToolRegistryPanel() {
  const qc = useQueryClient();
  const permissions = useAgentPermissions();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [liveDockerStatus, setLiveDockerStatus] = useState<DockerMcpGatewayStatus | null>(null);
  const [clawStatusOverride, setClawStatusOverride] = useState<ClawGatewayStatus | null>(null);
  const [browserMessage, setBrowserMessage] = useState<string | null>(null);
  const [browserProposal, setBrowserProposal] = useState<BrowserActionProposal | null>(null);
  const [desktopMessage, setDesktopMessage] = useState<string | null>(null);
  const [desktopProposal, setDesktopProposal] = useState<DesktopActionProposal | null>(null);
  const [codingMessage, setCodingMessage] = useState<string | null>(null);
  const [codingProposal, setCodingProposal] = useState<CodingTaskProposal | null>(null);
  const execDisabled = permissions.settings ? !permissions.canExec : false;
  const editDisabled = permissions.settings ? !permissions.canEdit : false;

  const { data, isLoading, error } = useQuery({
    queryKey: ["tool-registry"],
    queryFn: () => api.tools.list(true),
    staleTime: 30_000,
  });
  const { data: dockerStatus } = useQuery({
    queryKey: ["docker-mcp-status"],
    queryFn: () => api.tools.dockerMcpStatus(false),
    staleTime: 30_000,
  });
  const { data: dockerProfile } = useQuery({
    queryKey: ["docker-mcp-profile"],
    queryFn: () => api.tools.dockerMcpProfile(),
    staleTime: 30_000,
  });
  const { data: clawStatus } = useQuery({
    queryKey: ["claw-gateway-status"],
    queryFn: () => api.tools.clawGatewayStatus(),
    staleTime: 30_000,
  });
  const { data: clawProfile } = useQuery({
    queryKey: ["claw-gateway-profile"],
    queryFn: () => api.tools.clawGatewayProfile(),
    staleTime: 30_000,
  });
  const { data: browserStatus } = useQuery({
    queryKey: ["browser-automation-status"],
    queryFn: () => api.browserAutomationApi.status(false),
    staleTime: 30_000,
  });
  const { data: browserProfile } = useQuery({
    queryKey: ["browser-automation-profile"],
    queryFn: () => api.browserAutomationApi.profile(),
    staleTime: 30_000,
  });
  const { data: desktopStatus } = useQuery<{ success: boolean; status: DesktopAutomationStatus }>({
    queryKey: ["desktop-automation-status"],
    queryFn: () => api.desktopAutomationApi.status(false),
    staleTime: 30_000,
  });
  const { data: desktopProfileData } = useQuery({
    queryKey: ["desktop-automation-profile"],
    queryFn: () => api.desktopAutomationApi.profile(),
    staleTime: 30_000,
  });
  const { data: codingStatus } = useQuery<{ success: boolean; status: CodingAgentStatus }>({
    queryKey: ["coding-agent-status"],
    queryFn:  () => api.codingAgentApi.status(),
    staleTime: 30_000,
  });

  function flash(id: string, message: string) {
    setMessages(prev => ({ ...prev, [id]: message }));
    setTimeout(() => setMessages(prev => { const next = { ...prev }; delete next[id]; return next; }), 6000);
  }

  async function toolAction(
    id: string,
    fn: () => Promise<{ message?: string; status?: string; approvalRequired?: boolean; approval?: Record<string, unknown>; success?: boolean; tool?: ToolRecord; executed?: false }>,
    refresh = false,
  ) {
    setBusyId(id);
    try {
      const result = await fn();
      const approvalId = typeof result.approval?.["id"] === "string" ? result.approval["id"] : undefined;
      const prefix = result.approvalRequired ? "Approval queued" : result.status ?? "Recorded";
      flash(id, approvalId ? `${prefix}: ${approvalId}` : result.message ?? prefix);
      if (refresh) void qc.invalidateQueries({ queryKey: ["tool-registry"] });
    } catch (e) {
      flash(id, apiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function refreshDockerStatus(live: boolean) {
    setBusyId(live ? "docker-mcp-live" : "docker-mcp");
    try {
      const result = await api.tools.dockerMcpStatus(live);
      if (live) setLiveDockerStatus(result.status);
      void qc.invalidateQueries({ queryKey: ["docker-mcp-status"] });
      flash("docker-mcp", result.status.unavailableReason ?? result.status.status);
    } catch (e) {
      flash("docker-mcp", apiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function proposeDockerConfig() {
    setBusyId("docker-mcp-propose");
    try {
      const result = await api.tools.proposeDockerMcpConfig();
      flash("docker-mcp", `Proposal ready: secrets ${result.proposal.security.blockSecrets ? "blocked" : "allowed"}, network ${result.proposal.security.blockNetwork ? "blocked" : "allowed"}.`);
    } catch (e) {
      flash("docker-mcp", apiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function refreshClawStatus() {
    setBusyId("claw-gateway");
    try {
      const result = await api.tools.clawGatewayStatus();
      setClawStatusOverride(result.status);
      void qc.invalidateQueries({ queryKey: ["claw-gateway-status"] });
      flash("claw-gateway", result.status.unavailableReason ?? result.status.status);
    } catch (e) {
      flash("claw-gateway", apiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function proposeClawConfig(gatewayType: string) {
    setBusyId(`claw-gateway-${gatewayType}`);
    try {
      const result = await api.tools.proposeClawGatewayConfig({ gatewayType });
      flash("claw-gateway", `Proposal ready for ${result.proposal.gatewayType}: ${result.proposal.actionState}. No gateway was installed or started.`);
    } catch (e) {
      flash("claw-gateway", apiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function proposeBrowserNav() {
    setBusyId("browser-automation");
    setBrowserMessage(null);
    setBrowserProposal(null);
    try {
      const result = await api.browserAutomationApi.proposeNavigate({});
      setBrowserProposal(result.proposal);
      setBrowserMessage(`Proposal ready: tier=${result.proposal.actionTier}, domain=${result.proposal.domainPolicyResult}, hardBlocked=${result.proposal.hardBlocked}. No browser was launched.`);
    } catch (e) {
      setBrowserMessage(apiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function proposeDesktopListWindows() {
    setBusyId("desktop-automation");
    setDesktopMessage(null);
    setDesktopProposal(null);
    try {
      const result = await api.desktopAutomationApi.proposeAction({ action: "list_windows" });
      setDesktopProposal(result.proposal);
      setDesktopMessage(`Proposal ready: tier=${result.proposal.actionTier}, app=${result.proposal.appPolicyResult}, hardBlocked=${result.proposal.hardBlocked}. No window was focused, no input was sent.`);
    } catch (e) {
      setDesktopMessage(apiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function proposeCodingTask() {
    setBusyId("coding-agent");
    setCodingMessage(null);
    setCodingProposal(null);
    try {
      const result = await api.codingAgentApi.proposeTask({
        request:       "Analyze workspace and propose refactor plan",
        workspacePath: "/workspace",
      });
      setCodingProposal(result.proposal);
      setCodingMessage(
        `Proposal ready: tier=${result.proposal.actionTier}, ` +
        `hardBlocked=${result.proposal.hardBlocked}, ` +
        `approvalRequired=${result.proposal.approvalRequired}. ` +
        `No files were modified.`
      );
    } catch (e) {
      setCodingMessage(apiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading) {
    return <div className="text-sm text-center py-8" style={{ color: "var(--color-muted)" }}>Loading tool registry…</div>;
  }

  if (error) {
    return <div className="text-xs" style={{ color: "var(--color-error)" }}>{apiErrorMessage(error)}</div>;
  }

  const tools = data?.tools ?? [];
  const highRiskDisabled = tools.filter(tool => (tool.riskLevel === "high" || tool.riskLevel === "critical") && !tool.enabled).length;
  const blockedDefaults = tools.filter(tool => !tool.enabled || tool.configuredStatus !== "configured").length;
  const gatewayStatus = liveDockerStatus ?? dockerStatus?.status;
  const profile = dockerProfile?.profile ?? gatewayStatus?.profile;
  const dockerMessage = messages["docker-mcp"];
  const clawGatewayStatus = clawStatusOverride ?? clawStatus?.status;
  const clawGatewayProfile = clawProfile?.profile ?? clawGatewayStatus?.profile;
  const clawMessage = messages["claw-gateway"];
  const clawSkills = clawGatewayStatus?.skills ?? [];
  const quarantinedSkills = clawSkills.filter(skill => skill.lifecycleState === "quarantined").length;
  const blockedSkills = clawSkills.filter(skill => skill.lifecycleState === "blocked" || skill.lifecycleState === "rejected").length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
              <Shield size={15} /> Tool Firewall
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
              {tools.length} registered · {blockedDefaults} blocked by default · {highRiskDisabled} high-risk disabled
            </div>
          </div>
          <button onClick={() => void qc.invalidateQueries({ queryKey: ["tool-registry"] })}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
        <div className="text-xs mt-3" style={{ color: "var(--color-muted)" }}>
          {data?.sourceOfTruth}
        </div>
      </div>

      <div className="rounded-xl p-4"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
              <Layers size={15} /> Docker MCP Gateway
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
                {gatewayStatus?.status ?? "not_configured"}
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, var(--color-muted) 12%, transparent)", color: "var(--color-muted)" }}>
                {gatewayStatus?.dryRun === false ? "live check" : "dry run"}
              </span>
            </div>
            <div className="text-xs mt-2 grid gap-1 md:grid-cols-2" style={{ color: "var(--color-muted)" }}>
              <div>docker: <span style={{ color: "var(--color-foreground)" }}>{gatewayStatus?.dockerInstalled ? "installed" : "not_configured"}</span></div>
              <div>daemon: <span style={{ color: "var(--color-foreground)" }}>{gatewayStatus?.dockerDaemonReachable ? "reachable" : "not_configured"}</span></div>
              <div>docker mcp: <span style={{ color: "var(--color-foreground)" }}>{gatewayStatus?.dockerMcpAvailable ? "available" : "not_configured"}</span></div>
              <div>gateway: <span style={{ color: "var(--color-foreground)" }}>{gatewayStatus?.gatewayRunning ? "running" : "not started by LOCALAI"}</span></div>
              <div>profile: <span style={{ color: "var(--color-foreground)" }}>{profile?.enabled ? "enabled" : "disabled"}</span></div>
              <div>tools: <span style={{ color: "var(--color-foreground)" }}>{profile?.allowedTools.length ?? 0} allowlisted</span></div>
              <div>secrets: <span style={{ color: "var(--color-foreground)" }}>{profile?.security.blockSecrets === false ? "allowed" : "blocked"}</span></div>
              <div>network: <span style={{ color: "var(--color-foreground)" }}>{profile?.security.blockNetwork === false ? "allowed" : "blocked"}</span></div>
            </div>
            {gatewayStatus?.unavailableReason && (
              <div className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>{gatewayStatus.unavailableReason}</div>
            )}
            {profile && (
              <div className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>
                limits: {profile.security.resourceLimits.cpus} CPU · {profile.security.resourceLimits.memoryMb} MB · mounts {profile.security.allowedMounts.length}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button disabled={busyId === "docker-mcp"} onClick={() => void refreshDockerStatus(false)}
              title="Refresh dry-run status"
              className="p-1.5 rounded-lg"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)", opacity: busyId === "docker-mcp" ? 0.6 : 1 }}>
              <RefreshCw size={13} />
            </button>
            <button disabled={busyId === "docker-mcp-live"} onClick={() => void refreshDockerStatus(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)", opacity: busyId === "docker-mcp-live" ? 0.6 : 1 }}>
              Live status
            </button>
            <button disabled={busyId === "docker-mcp-propose"} onClick={() => void proposeDockerConfig()}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--color-accent)", color: "#fff", opacity: busyId === "docker-mcp-propose" ? 0.6 : 1 }}>
              Propose config
            </button>
          </div>
        </div>
        {dockerMessage && (
          <div className="mt-3 text-xs px-2 py-1.5 rounded-lg"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
            {dockerMessage}
          </div>
        )}
      </div>

      <div className="rounded-xl p-4"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
              <Shield size={15} /> OpenClaw / NemoClaw Gateway
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
                {clawGatewayStatus?.status ?? "not_configured"}
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, var(--color-muted) 12%, transparent)", color: "var(--color-muted)" }}>
                dry run
              </span>
            </div>
            <div className="text-xs mt-2 grid gap-1 md:grid-cols-2" style={{ color: "var(--color-muted)" }}>
              <div>OpenClaw: <span style={{ color: "var(--color-foreground)" }}>{clawGatewayStatus?.openclawConfigured ? "configured" : "not_configured"}</span></div>
              <div>NemoClaw/OpenShell: <span style={{ color: "var(--color-foreground)" }}>{clawGatewayStatus?.nemoclawConfigured || clawGatewayStatus?.openshellConfigured ? "configured" : "not_configured"}</span></div>
              <div>profile: <span style={{ color: "var(--color-foreground)" }}>{clawGatewayProfile?.enabled ? "enabled" : "disabled"}</span></div>
              <div>skills: <span style={{ color: "var(--color-foreground)" }}>{clawSkills.length} tracked · {quarantinedSkills} quarantined · {blockedSkills} blocked/rejected</span></div>
              <div>external messages: <span style={{ color: "var(--color-foreground)" }}>{clawGatewayProfile?.requireApprovalForExternalMessages === false ? "not required" : "approval required"}</span></div>
              <div>secrets/env: <span style={{ color: "var(--color-foreground)" }}>{clawGatewayProfile?.blockSecrets === false ? "allowed" : "blocked"}</span></div>
              <div>Docker MCP isolation: <span style={{ color: "var(--color-foreground)" }}>{clawGatewayProfile?.allowDockerMcpIsolation === false ? "disabled" : "compatible"}</span></div>
              <div>gateway reachable: <span style={{ color: "var(--color-foreground)" }}>{clawGatewayStatus?.gatewayReachable ? "yes" : "not contacted"}</span></div>
            </div>
            {clawGatewayStatus?.unavailableReason && (
              <div className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>{clawGatewayStatus.unavailableReason}</div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button disabled={busyId === "claw-gateway"} onClick={() => void refreshClawStatus()}
              title="Refresh dry-run status"
              className="p-1.5 rounded-lg"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)", opacity: busyId === "claw-gateway" ? 0.6 : 1 }}>
              <RefreshCw size={13} />
            </button>
            <button disabled={busyId === "claw-gateway-openclaw"} onClick={() => void proposeClawConfig("openclaw")}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)", opacity: busyId === "claw-gateway-openclaw" ? 0.6 : 1 }}>
              Propose OpenClaw
            </button>
            <button disabled={busyId === "claw-gateway-nemoclaw"} onClick={() => void proposeClawConfig("nemoclaw")}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--color-accent)", color: "#fff", opacity: busyId === "claw-gateway-nemoclaw" ? 0.6 : 1 }}>
              Propose NemoClaw
            </button>
          </div>
        </div>
        {clawMessage && (
          <div className="mt-3 text-xs px-2 py-1.5 rounded-lg"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
            {clawMessage}
          </div>
        )}
      </div>

      {/* Phase 09A — Browser Agent Studio */}
      <div className="rounded-xl p-4 mt-1"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-2 mb-3">
          <Monitor size={15} style={{ color: "var(--color-accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>Browser Agent Studio</span>
          <span className="text-xs px-1.5 py-0.5 rounded ml-1"
            style={{ background: "color-mix(in srgb, var(--color-accent) 14%, transparent)", color: "var(--color-accent)" }}>
            {browserStatus?.status?.status ?? "not_configured"}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
            Phase 09A
          </span>
        </div>
        <div className="text-xs grid gap-1 md:grid-cols-2 mb-3" style={{ color: "var(--color-muted)" }}>
          <div>Playwright MCP: <span style={{ color: "var(--color-foreground)" }}>{browserStatus?.status?.playwrightInstalled ? "installed" : "not installed"}</span></div>
          <div>session active: <span style={{ color: "var(--color-foreground)" }}>{browserStatus?.status?.sessionActive ? "yes" : "none"}</span></div>
          <div>profile: <span style={{ color: "var(--color-foreground)" }}>{browserProfile?.profile?.id ?? "localai-browser-safe"}</span></div>
          <div>max sessions: <span style={{ color: "var(--color-foreground)" }}>{browserProfile?.profile?.maxConcurrentSessions ?? 1}</span></div>
        </div>
        <div className="text-xs mb-3 grid gap-1" style={{ color: "var(--color-muted)" }}>
          <div className="flex items-center gap-2">
            <Lock size={11} style={{ color: "var(--color-error)" }} />
            <span>credential entry: <span style={{ color: "var(--color-error)", fontWeight: 600 }}>HARD BLOCKED</span></span>
          </div>
          <div className="flex items-center gap-2">
            <Lock size={11} style={{ color: "var(--color-error)" }} />
            <span>anti-bot evasion: <span style={{ color: "var(--color-error)", fontWeight: 600 }}>HARD BLOCKED</span></span>
          </div>
          <div className="flex items-center gap-2">
            <Lock size={11} style={{ color: "var(--color-error)" }} />
            <span>cookie capture: <span style={{ color: "var(--color-error)", fontWeight: 600 }}>HARD BLOCKED</span></span>
          </div>
        </div>
        {browserStatus?.status?.unavailableReason && (
          <div className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
            {browserStatus.status.unavailableReason}
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <button disabled={busyId === "browser-automation"} onClick={() => void proposeBrowserNav()}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)", opacity: busyId === "browser-automation" ? 0.6 : 1 }}>
            Propose Navigate
          </button>
        </div>
        {browserMessage && (
          <div className="mt-3 text-xs px-2 py-1.5 rounded-lg"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
            {browserMessage}
          </div>
        )}
        {browserProposal && (
          <div className="mt-2 text-xs px-2 py-1.5 rounded-lg"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
            {browserProposal.notes.map((note, i) => <div key={i}>• {note}</div>)}
          </div>
        )}
      </div>

      {/* Phase 09B — Desktop Automation */}
      <div className="rounded-xl p-4 mt-1"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-2 mb-3">
          <MousePointer size={15} style={{ color: "var(--color-accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>Desktop Automation</span>
          <span className="text-xs px-1.5 py-0.5 rounded ml-1"
            style={{ background: "color-mix(in srgb, var(--color-accent) 14%, transparent)", color: "var(--color-accent)" }}>
            {desktopStatus?.status?.status ?? "not_configured"}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
            Phase 09B
          </span>
        </div>
        <div className="text-xs grid gap-1 md:grid-cols-2 mb-3" style={{ color: "var(--color-muted)" }}>
          <div>WorldGUI: <span style={{ color: "var(--color-foreground)" }}>{desktopStatus?.status?.worldguiInstalled ? "installed" : "not installed"}</span></div>
          <div>running: <span style={{ color: "var(--color-foreground)" }}>{desktopStatus?.status?.worldguiRunning ? "yes" : "no"}</span></div>
          <div>profile: <span style={{ color: "var(--color-foreground)" }}>{desktopProfileData?.profile?.id ?? "localai-desktop-safe"}</span></div>
          <div>windows host: <span style={{ color: "var(--color-foreground)" }}>{desktopStatus?.status?.windowsHost ? "yes" : "no"}</span></div>
        </div>
        <div className="text-xs mb-3 grid gap-1" style={{ color: "var(--color-muted)" }}>
          <div className="flex items-center gap-2">
            <Lock size={11} style={{ color: "var(--color-error)" }} />
            <span>credential entry: <span style={{ color: "var(--color-error)", fontWeight: 600 }}>HARD BLOCKED</span></span>
          </div>
          <div className="flex items-center gap-2">
            <Lock size={11} style={{ color: "var(--color-error)" }} />
            <span>keylogging: <span style={{ color: "var(--color-error)", fontWeight: 600 }}>HARD BLOCKED</span></span>
          </div>
          <div className="flex items-center gap-2">
            <Lock size={11} style={{ color: "var(--color-error)" }} />
            <span>sensitive screenshot: <span style={{ color: "var(--color-error)", fontWeight: 600 }}>HARD BLOCKED</span></span>
          </div>
        </div>
        {desktopStatus?.status?.unavailableReason && (
          <div className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
            {desktopStatus.status.unavailableReason}
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <button disabled={busyId === "desktop-automation"} onClick={() => void proposeDesktopListWindows()}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)", opacity: busyId === "desktop-automation" ? 0.6 : 1 }}>
            Propose List Windows
          </button>
        </div>
        {desktopMessage && (
          <div className="mt-3 text-xs px-2 py-1.5 rounded-lg"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
            {desktopMessage}
          </div>
        )}
        {desktopProposal && (
          <div className="mt-2 text-xs px-2 py-1.5 rounded-lg"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
            {desktopProposal.notes.map((note, i) => <div key={i}>• {note}</div>)}
          </div>
        )}
      </div>

      {/* ── Coding Agent card (Phase 10) ──────────────────────────────────── */}
      <div className="rounded-xl p-4 space-y-3"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
              <Code size={15} /> Coding Agent
              <span className="text-xs px-1.5 py-0.5 rounded font-normal"
                style={{ background: "color-mix(in srgb, var(--color-accent) 15%, transparent)", color: "var(--color-accent)" }}>
                Phase 10
              </span>
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
              Approval-gated code modification. Diff/proposal-first. Optional adapters:
              Aider / OpenHands / Roo / Cline / Continue (all <em>not_configured</em> by default).
            </div>
          </div>
          <div className="shrink-0">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: codingStatus?.status?.status === "available"
                  ? "color-mix(in srgb, var(--color-success) 15%, transparent)"
                  : "color-mix(in srgb, var(--color-muted) 12%, transparent)",
                color: codingStatus?.status?.status === "available"
                  ? "var(--color-success)"
                  : "var(--color-muted)",
              }}>
              {codingStatus?.status?.status ?? "loading…"}
            </span>
          </div>
        </div>

        {/* Hard limits */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--color-muted)" }}>
          <div className="flex items-center gap-2">
            <Lock size={11} style={{ color: "var(--color-error)" }} />
            <span>self-modification: <span style={{ color: "var(--color-error)", fontWeight: 600 }}>HARD BLOCKED</span></span>
          </div>
          <div className="flex items-center gap-2">
            <Lock size={11} style={{ color: "var(--color-error)" }} />
            <span>direct main apply: <span style={{ color: "var(--color-error)", fontWeight: 600 }}>HARD BLOCKED</span></span>
          </div>
          <div className="flex items-center gap-2">
            <Lock size={11} style={{ color: "var(--color-error)" }} />
            <span>destructive commands: <span style={{ color: "var(--color-error)", fontWeight: 600 }}>HARD BLOCKED</span></span>
          </div>
          <div className="flex items-center gap-2">
            <Shield size={11} style={{ color: "var(--color-accent)" }} />
            <span>all edits: <span style={{ color: "var(--color-accent)", fontWeight: 600 }}>approval required</span></span>
          </div>
        </div>

        {/* Adapter statuses */}
        {codingStatus?.status?.adapterStatuses && (
          <div className="text-xs" style={{ color: "var(--color-muted)" }}>
            Adapters: {codingStatus.status.adapterStatuses.map(a =>
              <span key={a.adapter} className="mr-2">{a.adapter}: <span style={{ color: "var(--color-muted)", fontStyle: "italic" }}>{a.status}</span></span>
            )}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <button disabled={busyId === "coding-agent"} onClick={() => void proposeCodingTask()}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)", opacity: busyId === "coding-agent" ? 0.6 : 1 }}>
            Propose Coding Task
          </button>
        </div>
        {codingMessage && (
          <div className="mt-3 text-xs px-2 py-1.5 rounded-lg"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
            {codingMessage}
          </div>
        )}
        {codingProposal && (
          <div className="mt-2 text-xs px-2 py-1.5 rounded-lg space-y-1"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
            <div>tier: <span style={{ color: "var(--color-foreground)" }}>{codingProposal.actionTier}</span></div>
            <div>approval: <span style={{ color: "var(--color-accent)", fontWeight: 600 }}>{codingProposal.approvalRequired ? "required" : "not required"}</span></div>
            <div>dry run: {codingProposal.dryRun ? "yes" : "no"}</div>
            {codingProposal.hardBlocked && (
              <div style={{ color: "var(--color-error)" }}>⛔ {codingProposal.hardBlockReason}</div>
            )}
          </div>
        )}
      </div>

      {editDisabled && <PermissionNotice permission="allowAgentEdits" />}
      {execDisabled && <PermissionNotice permission="allowAgentExec" />}

      <div className="grid gap-3">
        {tools.map(tool => {
          const risk = riskColor(tool.riskLevel);
          const message = messages[tool.id];
          const busy = busyId === tool.id;
          return (
            <div key={tool.id} className="rounded-xl p-4"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>{tool.displayName}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>{tool.type}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, var(--color-muted) 12%, transparent)", color: "var(--color-muted)" }}>{tool.configuredStatus}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `color-mix(in srgb, ${risk} 14%, transparent)`, color: risk }}>{tool.riskLevel}</span>
                    {!tool.enabled && (
                      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
                        style={{ background: "color-mix(in srgb, var(--color-error) 12%, transparent)", color: "var(--color-error)" }}>
                        <Lock size={10} /> disabled
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-1 font-mono" style={{ color: "var(--color-muted)" }}>{tool.id}</div>
                  <div className="text-xs mt-2 grid gap-1 md:grid-cols-2" style={{ color: "var(--color-muted)" }}>
                    <div>provider: <span style={{ color: "var(--color-foreground)" }}>{tool.provider}</span></div>
                    <div>mode: <span style={{ color: "var(--color-foreground)" }}>{tool.runtimeModeCompatibility.join(", ") || "none"}</span></div>
                    <div>permissions: <span style={{ color: "var(--color-foreground)" }}>{compactScopes(tool.permissionScopes)}</span></div>
                    <div>sandbox: <span style={{ color: "var(--color-foreground)" }}>{tool.sandboxMode}</span></div>
                  </div>
                  {(tool.notConfiguredReason || tool.degradedReason) && (
                    <div className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>
                      {tool.notConfiguredReason ?? tool.degradedReason}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button disabled={busy || editDisabled} onClick={() => toolAction(tool.id, () => api.tools.setEnabled(tool.id, !tool.enabled), true)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)", opacity: busy || editDisabled ? 0.6 : 1 }}>
                    {tool.enabled ? "Disable" : "Enable"}
                  </button>
                  <button disabled={busy} onClick={() => toolAction(tool.id, () => api.tools.dryRun(tool.id, { action: "inspect", requestedScopes: tool.permissionScopes.includes("filesystem.read") ? ["filesystem.read"] : [] }))}
                    title="Dry run"
                    className="p-1.5 rounded-lg"
                    style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)", opacity: busy ? 0.6 : 1 }}>
                    <FlaskConical size={13} />
                  </button>
                  <button disabled={busy || execDisabled || !tool.enabled}
                    onClick={() => toolAction(tool.id, () => api.tools.execute(tool.id, { action: tool.actions.includes("install") ? "install" : "execute", requestedScopes: tool.permissionScopes, sandboxSatisfied: false }))}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: "var(--color-accent)", color: "#fff", opacity: busy || execDisabled || !tool.enabled ? 0.55 : 1 }}>
                    Request
                  </button>
                </div>
              </div>
              {message && (
                <div className="mt-3 text-xs px-2 py-1.5 rounded-lg"
                  style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
                  {message}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "all" | "worldgui" | "tools";

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>("all");
  const permissions = useAgentPermissions();
  const execDisabled = permissions.settings ? !permissions.canExec : false;

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
      setMsg(id, apiErrorMessage(e));
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
    { id: "tools", label: "Tool Registry" },
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

      {/* Tool registry tab */}
      {tab === "tools" && <ToolRegistryPanel />}

      {/* All integrations tab */}
      {tab === "all" && (
        <>
          {isLoading && (
            <div className="text-sm text-center py-12" style={{ color: "var(--color-muted)" }}>Loading integrations…</div>
          )}
          {execDisabled && <PermissionNotice permission="allowAgentExec" />}

          {/* Pinned */}
          {pinned.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: "var(--color-muted)" }}>Pinned</div>
              <div className="grid gap-3">
                {pinned.map(intg => (
                  <div key={intg.id}>
                    <IntegrationCard
                      intg={intg} busy={busyIds.has(intg.id) || execDisabled}
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
                        intg={intg} busy={busyIds.has(intg.id) || execDisabled}
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
