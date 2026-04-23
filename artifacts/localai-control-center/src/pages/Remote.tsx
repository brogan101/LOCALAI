import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Wifi, WifiOff, Shield, ShieldCheck, ShieldAlert, Copy, RefreshCw,
  CheckCircle, XCircle, Radio, Settings2, FileText, Loader,
} from "lucide-react";
import api, { apiErrorMessage, type RemoteOverview, type RemoteTool, type RemoteSettings } from "../api.js";
import { PermissionNotice } from "../components/PermissionNotice.js";
import { useAgentPermissions } from "../hooks/useAgentPermissions.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(s: string) {
  if (s === "local")    return "var(--color-success)";
  if (s === "online")   return "var(--color-info)";
  if (s === "degraded") return "var(--color-warn)";
  return "var(--color-error)";
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl overflow-hidden ${className}`}
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      {children}
    </div>
  );
}

function CardHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      <Icon size={15} style={{ color: "var(--color-accent)" }} />
      <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>{title}</span>
    </div>
  );
}

function KVRow({ label, value, mono = false }: { label: string; value: string | number | boolean | null | undefined; mono?: boolean }) {
  const display = value === null || value === undefined ? "—" : String(value);
  return (
    <div className="flex items-baseline gap-4 px-4 py-2 text-sm"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      <span className="shrink-0 w-40 text-xs" style={{ color: "var(--color-muted)" }}>{label}</span>
      <span className={`flex-1 ${mono ? "font-mono text-xs" : ""}`} style={{ color: "var(--color-foreground)" }}>
        {display}
      </span>
    </div>
  );
}

// ── Tool row ──────────────────────────────────────────────────────────────────

function ToolRow({ tool }: { tool: RemoteTool }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-sm"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      {tool.installed
        ? <CheckCircle size={14} style={{ color: "var(--color-success)" }} />
        : <XCircle size={14} style={{ color: "var(--color-muted)" }} />}
      <div className="flex-1 min-w-0">
        <span style={{ color: "var(--color-foreground)" }}>{tool.label}</span>
        <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{tool.purpose}</div>
      </div>
      {tool.version && (
        <span className="text-xs font-mono" style={{ color: "var(--color-muted)" }}>{tool.version}</span>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RemotePage() {
  const qc = useQueryClient();
  const [tokenInput, setTokenInput] = useState("");
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const permissions = useAgentPermissions();
  const execDisabled = permissions.settings ? !permissions.canExec : false;
  const editsDisabled = permissions.settings ? !permissions.canEdit : false;

  const overviewQ = useQuery({
    queryKey: ["remote-overview"],
    queryFn: () => api.remote.overview(),
    staleTime: 30_000,
  });

  const authStatusQ = useQuery({
    queryKey: ["remote-auth-status"],
    queryFn: () => api.remote.authStatus(),
    staleTime: 60_000,
  });

  const authorizeMut = useMutation({
    mutationFn: (token: string) => api.remote.authAuthorize(token),
    onSuccess: (r) => {
      setAuthMsg(r.success ? "Authorized." : "Authorization failed.");
      void qc.invalidateQueries({ queryKey: ["remote-auth-status"] });
    },
    onError: (e) => setAuthMsg(apiErrorMessage(e)),
  });

  const rotateMut = useMutation({
    mutationFn: () => api.remote.authRotate(),
    onSuccess: (r) => {
      if (r.success) setNewToken(r.token);
      else setAuthMsg("Rotate failed.");
    },
    onError: (e) => setAuthMsg(apiErrorMessage(e)),
  });

  const PORT_FIELDS = new Set<keyof RemoteSettings>(["browserIdePort", "openvscodePort", "litellmPort", "webuiPort"]);
  const [configSettings, setConfigSettings] = useState<Partial<RemoteSettings>>({});
  const [configResult, setConfigResult] = useState<{ directory: string; files: string[] } | null>(null);

  const genConfigMut = useMutation({
    mutationFn: () => api.remote.generateConfigs(configSettings),
    onSuccess: (r) => {
      if (r.success) setConfigResult({ directory: r.directory, files: r.files });
    },
  });

  const ov: RemoteOverview | undefined = overviewQ.data;

  const heartbeatState = ov?.heartbeat.state ?? "offline";
  const hbColor = statusColor(heartbeatState);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6"
      style={{ background: "var(--color-background)" }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-foreground)" }}>Remote Access</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            Distributed node config, gateway status, and auth management
          </p>
        </div>
        <button onClick={() => void qc.invalidateQueries({ queryKey: ["remote-overview"] })}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {overviewQ.isLoading && (
        <div className="text-sm text-center py-12" style={{ color: "var(--color-muted)" }}>Loading…</div>
      )}

      {ov && (
        <>
          {/* Heartbeat status */}
          <Card>
            <CardHeader icon={Radio} title="Gateway Heartbeat" />
            <div className="flex items-center gap-4 p-4">
              <div className="flex items-center gap-2.5">
                {heartbeatState === "offline"
                  ? <WifiOff size={20} style={{ color: hbColor }} />
                  : <Wifi size={20} style={{ color: hbColor }} />}
                <span className="text-lg font-semibold capitalize" style={{ color: hbColor }}>{heartbeatState}</span>
              </div>
              {ov.heartbeat.latencyMs !== undefined && (
                <span className="text-sm" style={{ color: "var(--color-muted)" }}>{ov.heartbeat.latencyMs} ms</span>
              )}
              <span className="text-xs ml-auto" style={{ color: "var(--color-muted)" }}>{ov.heartbeat.message}</span>
            </div>
            <KVRow label="Mode"        value={ov.heartbeat.mode} />
            <KVRow label="Provider"    value={ov.heartbeat.provider} />
            <KVRow label="Target URL"  value={ov.heartbeat.targetBaseUrl} mono />
            <KVRow label="Auth enabled" value={String(ov.heartbeat.authEnabled)} />
            <KVRow label="Connected remotely" value={String(ov.heartbeat.connectedRemotely)} />
            {ov.heartbeat.lastCheckedAt && (
              <KVRow label="Last checked" value={new Date(ov.heartbeat.lastCheckedAt).toLocaleString()} />
            )}
          </Card>

          {/* Distributed node config */}
          <Card>
            <CardHeader icon={Settings2} title="Distributed Node Config" />
            <KVRow label="Mode"           value={ov.distributedNode.mode} />
            <KVRow label="Provider"       value={ov.distributedNode.provider} />
            <KVRow label="Local base URL" value={ov.distributedNode.localBaseUrl} mono />
            {ov.distributedNode.remoteHost && (
              <KVRow label="Remote host" value={`${ov.distributedNode.remoteProtocol}://${ov.distributedNode.remoteHost}:${ov.distributedNode.remotePort}`} mono />
            )}
            <KVRow label="Auth enabled"     value={String(ov.distributedNode.authEnabled)} />
            <KVRow label="Heartbeat path"   value={ov.distributedNode.heartbeatPath} mono />
            <KVRow label="Heartbeat interval" value={`${ov.distributedNode.heartbeatIntervalSeconds}s`} />
          </Card>

          {/* Remote settings */}
          <Card>
            <CardHeader icon={Settings2} title="Remote Settings" />
            <KVRow label="Browser IDE port"   value={ov.settings.browserIdePort} />
            <KVRow label="Open VS Code port"  value={ov.settings.openvscodePort} />
            <KVRow label="LiteLLM port"       value={ov.settings.litellmPort} />
            <KVRow label="WebUI port"         value={ov.settings.webuiPort} />
            <KVRow label="Preferred IDE"      value={ov.settings.preferredBrowserIde} />
            <KVRow label="Tunnel provider"    value={ov.settings.tunnelProvider} />
            <KVRow label="WebUI hostname"     value={ov.settings.hostnameWebUi || "—"} mono />
            <KVRow label="IDE hostname"       value={ov.settings.hostnameIde || "—"} mono />
          </Card>

          {/* Generate config files */}
          <Card>
            <CardHeader icon={FileText} title="Generate Config Files" />
            <div className="p-4 space-y-4">
              {editsDisabled && <PermissionNotice permission="allowAgentEdits" />}
              <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                Writes <code className="font-mono">cloudflared-config.yaml</code>,{" "}
                <code className="font-mono">code-server.yaml</code>,{" "}
                <code className="font-mono">litellm-config.yaml</code>, and{" "}
                <code className="font-mono">start-remote-stack.bat</code> to disk using
                the current remote settings. Override individual values below, or leave
                blank to use the saved settings.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["browserIdePort", "Browser IDE port"],
                    ["openvscodePort", "OpenVSCode port"],
                    ["litellmPort", "LiteLLM port"],
                    ["webuiPort", "WebUI port"],
                    ["hostnameWebUi", "WebUI hostname"],
                    ["hostnameIde", "IDE hostname"],
                  ] as [keyof RemoteSettings, string][]
                ).map(([field, label]) => (
                  <div key={field}>
                    <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>{label}</div>
                    <input
                      type="text"
                      placeholder={ov?.settings[field] != null ? String(ov.settings[field]) : "—"}
                      value={(configSettings[field] as string | number | undefined) ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const val = raw === "" ? undefined
                          : PORT_FIELDS.has(field) ? (Number(raw) || undefined)
                          : raw;
                        setConfigSettings((s) => ({ ...s, [field]: val }));
                      }}
                      className="w-full px-2 py-1 rounded-lg text-xs font-mono"
                      style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
                    />
                  </div>
                ))}

                <div>
                  <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Browser IDE</div>
                  <select
                    value={configSettings.preferredBrowserIde ?? ov?.settings.preferredBrowserIde ?? "openvscode-server"}
                    onChange={(e) => setConfigSettings((s) => ({ ...s, preferredBrowserIde: e.target.value }))}
                    className="w-full px-2 py-1 rounded-lg text-xs"
                    style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}>
                    <option value="openvscode-server">OpenVSCode Server</option>
                    <option value="code-server">code-server</option>
                  </select>
                </div>

                <div>
                  <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Tunnel provider</div>
                  <select
                    value={configSettings.tunnelProvider ?? ov?.settings.tunnelProvider ?? "cloudflare"}
                    onChange={(e) => setConfigSettings((s) => ({ ...s, tunnelProvider: e.target.value }))}
                    className="w-full px-2 py-1 rounded-lg text-xs"
                    style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}>
                    <option value="cloudflare">Cloudflare Tunnel</option>
                    <option value="tailscale">Tailscale</option>
                    <option value="zerotier">ZeroTier</option>
                  </select>
                </div>
              </div>

              <button
                disabled={genConfigMut.isPending || editsDisabled}
                onClick={() => { setConfigResult(null); genConfigMut.mutate(); }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--color-accent)", color: "#fff", opacity: genConfigMut.isPending ? 0.6 : 1 }}>
                {genConfigMut.isPending
                  ? <><Loader size={13} className="animate-spin" /> Writing…</>
                  : <><FileText size={13} /> Generate Config Files</>}
              </button>

              {genConfigMut.isError && (
                <div className="text-xs" style={{ color: "var(--color-error)" }}>
                  {apiErrorMessage(genConfigMut.error, "Failed to generate configs")}
                </div>
              )}

              {configResult && (
                <div className="p-3 rounded-lg space-y-2"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                  <div className="text-xs font-semibold" style={{ color: "var(--color-success)" }}>
                    Files written to: {configResult.directory}
                  </div>
                  {configResult.files.map((f) => (
                    <div key={f} className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "var(--color-muted)" }}>
                      <CheckCircle size={11} style={{ color: "var(--color-success)", flexShrink: 0 }} />
                      {f}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Auth management */}
          <Card>
            <CardHeader icon={Shield} title="Auth Management" />
            <div className="p-4 space-y-4">
              {authStatusQ.data !== undefined && (
                <div className="flex items-center gap-2 text-sm">
                  {authStatusQ.data.authorized
                    ? <ShieldCheck size={15} style={{ color: "var(--color-success)" }} />
                    : <ShieldAlert size={15} style={{ color: "var(--color-warn)" }} />}
                  <span style={{ color: authStatusQ.data.authorized ? "var(--color-success)" : "var(--color-warn)" }}>
                    {authStatusQ.data.authorized ? "Node authorized" : "Not authorized"}
                  </span>
                </div>
              )}

              {newToken && (
                <div className="p-3 rounded-lg"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                  <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>New token (copy now — shown once):</div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono flex-1 break-all" style={{ color: "var(--color-foreground)" }}>{newToken}</code>
                    <button onClick={() => void navigator.clipboard.writeText(newToken)}
                      className="p-1.5 rounded" style={{ background: "var(--color-surface)", color: "var(--color-muted)" }}>
                      <Copy size={12} />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="Paste token to authorize…"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-sm"
                  style={{
                    background: "var(--color-elevated)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-foreground)",
                    outline: "none",
                  }}
                />
                <button
                  disabled={!tokenInput || authorizeMut.isPending}
                  onClick={() => { authorizeMut.mutate(tokenInput); setTokenInput(""); }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium"
                  style={{ background: "var(--color-accent)", color: "#fff", opacity: !tokenInput || authorizeMut.isPending ? 0.5 : 1 }}>
                  Authorize
                </button>
              </div>

              <button
                disabled={rotateMut.isPending || execDisabled}
                onClick={() => rotateMut.mutate()}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
                style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)", opacity: rotateMut.isPending ? 0.6 : 1 }}>
                <RefreshCw size={13} /> Rotate token
              </button>
              {execDisabled && <PermissionNotice permission="allowAgentExec" />}

              {authMsg && (
                <div className="text-xs" style={{ color: "var(--color-muted)" }}>{authMsg}</div>
              )}
            </div>
          </Card>

          {/* Tunnel tools */}
          {ov.tools.length > 0 && (
            <Card>
              <CardHeader icon={Radio} title="Tunnel & Remote Tools" />
              {ov.tools.map((t) => <ToolRow key={t.id} tool={t} />)}
            </Card>
          )}

          {/* Setup guides */}
          {ov.guides.length > 0 && (
            <Card>
              <CardHeader icon={CheckCircle} title="Setup Guides" />
              <div className="p-4 flex flex-wrap gap-2">
                {ov.guides.map((g) => (
                  <a key={g.id} href={g.target} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                    style={{
                      background: "var(--color-elevated)",
                      color: "var(--color-accent)",
                      border: "1px solid var(--color-border)",
                      textDecoration: "none",
                    }}>
                    {g.label}
                  </a>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
