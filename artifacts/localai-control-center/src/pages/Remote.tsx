import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Wifi, WifiOff, Shield, ShieldCheck, ShieldAlert, Copy, RefreshCw,
  CheckCircle, XCircle, Radio, Settings2, FileText, Loader,
  Server, ServerCrash, Activity, Plus, Trash2, Cpu, HardDrive,
  Home, Zap, Lock, Video, Thermometer, Wind,
} from "lucide-react";
import api, {
  apiErrorMessage,
  type RemoteOverview, type RemoteTool, type RemoteSettings,
  type EdgeNodeProfile, type EdgeNodeHealth,
  type HomeAutopilotStatus, type HomeDeviceProfile,
} from "../api.js";
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

// ── Edge node helpers ─────────────────────────────────────────────────────────

function healthColor(h: EdgeNodeHealth) {
  if (h === "online")         return "var(--color-success)";
  if (h === "degraded")       return "var(--color-warn)";
  if (h === "offline")        return "var(--color-error)";
  return "var(--color-muted)";
}

function healthIcon(h: EdgeNodeHealth) {
  if (h === "online")   return <Activity size={13} style={{ color: healthColor(h) }} />;
  if (h === "degraded") return <ServerCrash size={13} style={{ color: healthColor(h) }} />;
  if (h === "offline")  return <XCircle size={13} style={{ color: healthColor(h) }} />;
  return <Server size={13} style={{ color: healthColor(h) }} />;
}

function nodeTypeIcon(t: string) {
  if (t === "gaming_pc")     return <Cpu size={13} style={{ color: "var(--color-accent)" }} />;
  if (t === "nas")           return <HardDrive size={13} style={{ color: "var(--color-muted)" }} />;
  if (t === "raspberry_pi")  return <Server size={13} style={{ color: "var(--color-muted)" }} />;
  return <Server size={13} style={{ color: "var(--color-muted)" }} />;
}

function NodeRow({
  node,
  onHealthCheck,
  onDelete,
  checkingId,
}: {
  node: EdgeNodeProfile;
  onHealthCheck: (id: string) => void;
  onDelete: (id: string) => void;
  checkingId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:opacity-80"
        onClick={() => setExpanded((v) => !v)}
        style={{ userSelect: "none" }}
      >
        {nodeTypeIcon(node.nodeType)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>{node.name}</span>
            {node.isGamingPc && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, var(--color-accent) 15%, transparent)", color: "var(--color-accent)" }}>
                AI Brain
              </span>
            )}
            {node.alwaysOn && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, var(--color-success) 15%, transparent)", color: "var(--color-success)" }}>
                Always-on
              </span>
            )}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            {node.roles.join(", ") || "no roles"} · {node.nodeType}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {healthIcon(node.health)}
          <span className="text-xs capitalize" style={{ color: healthColor(node.health) }}>{node.health}</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onHealthCheck(node.id); }}
          disabled={checkingId === node.id}
          title="Check health"
          className="p-1.5 rounded"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", opacity: checkingId === node.id ? 0.5 : 1 }}
        >
          {checkingId === node.id ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); if (confirm(`Remove node '${node.name}'?`)) onDelete(node.id); }}
          title="Remove node"
          className="p-1.5 rounded"
          style={{ background: "var(--color-elevated)", color: "var(--color-error)" }}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-3 space-y-1 text-xs" style={{ color: "var(--color-muted)" }}>
          {node.description && <div>{node.description}</div>}
          <div>Auth: {node.authProfile.authType}</div>
          {node.lastSeenAt && <div>Last seen: {new Date(node.lastSeenAt).toLocaleString()}</div>}
          {node.allowedCapabilities.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              <div className="font-medium" style={{ color: "var(--color-foreground)" }}>Capabilities</div>
              {node.allowedCapabilities.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <span className={`px-1 rounded text-xs ${c.enabled ? "" : "opacity-50"}`}
                    style={{
                      background: c.riskTier === "blocked" || c.riskTier === "manual_only"
                        ? "color-mix(in srgb, var(--color-error) 15%, transparent)"
                        : c.riskTier === "approval_required"
                        ? "color-mix(in srgb, var(--color-warn) 15%, transparent)"
                        : "color-mix(in srgb, var(--color-success) 15%, transparent)",
                      color: c.riskTier === "blocked" || c.riskTier === "manual_only"
                        ? "var(--color-error)"
                        : c.riskTier === "approval_required"
                        ? "var(--color-warn)"
                        : "var(--color-success)",
                    }}>
                    {c.riskTier}
                  </span>
                  <span style={{ color: "var(--color-foreground)" }}>{c.label}</span>
                  {!c.enabled && <span className="opacity-50">(disabled)</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RegisterNodeForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName]         = useState("");
  const [nodeType, setNodeType] = useState("unknown");
  const [roles, setRoles]       = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [isGamingPc, setIsGamingPc] = useState(false);
  const [alwaysOn, setAlwaysOn] = useState(false);
  const [description, setDescription] = useState("");
  const [err, setErr]           = useState<string | null>(null);

  const registerMut = useMutation({
    mutationFn: () => api.edgeNodesApi.register({
      name,
      nodeType: nodeType as EdgeNodeProfile["nodeType"],
      roles: roles.split(",").map((s) => s.trim()).filter(Boolean) as EdgeNodeProfile["roles"],
      endpoint: endpoint.trim(),
      isGamingPc,
      alwaysOn,
      description,
    }),
    onSuccess: () => { setName(""); setEndpoint(""); setDescription(""); setErr(null); onSuccess(); },
    onError: (e) => setErr(apiErrorMessage(e)),
  });

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {[
          ["Name *", name, setName, "text", "e.g. Home Pi"],
          ["Endpoint", endpoint, setEndpoint, "text", "http://192.168.1.100:8123"],
          ["Description", description, setDescription, "text", "Optional note"],
        ].map(([label, val, setter, type, placeholder]) => (
          <div key={label as string}>
            <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>{label as string}</div>
            <input
              type={type as string}
              placeholder={placeholder as string}
              value={val as string}
              onChange={(e) => (setter as (v: string) => void)(e.target.value)}
              className="w-full px-2 py-1 rounded-lg text-xs"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
            />
          </div>
        ))}
        <div>
          <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Node type</div>
          <select value={nodeType} onChange={(e) => setNodeType(e.target.value)}
            className="w-full px-2 py-1 rounded-lg text-xs"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}>
            {["unknown","mini_pc","raspberry_pi","nas","gaming_pc","server"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Roles (comma-separated)</div>
          <input type="text" placeholder="e.g. home_assistant,worker_node" value={roles}
            onChange={(e) => setRoles(e.target.value)}
            className="w-full px-2 py-1 rounded-lg text-xs"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
          />
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs" style={{ color: "var(--color-muted)" }}>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={isGamingPc} onChange={(e) => setIsGamingPc(e.target.checked)} />
          Gaming PC (never always-on)
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={alwaysOn} onChange={(e) => setAlwaysOn(e.target.checked)} disabled={isGamingPc} />
          Always-on node
        </label>
      </div>
      {isGamingPc && (
        <div className="text-xs px-2 py-1.5 rounded" style={{ background: "color-mix(in srgb, var(--color-warn) 12%, transparent)", color: "var(--color-warn)" }}>
          Gaming PC cannot be always-on — critical services should run on a dedicated edge node.
        </div>
      )}
      <button
        disabled={!name.trim() || registerMut.isPending}
        onClick={() => registerMut.mutate()}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
        style={{ background: "var(--color-accent)", color: "#fff", opacity: !name.trim() || registerMut.isPending ? 0.5 : 1 }}>
        {registerMut.isPending ? <><Loader size={13} className="animate-spin" /> Registering…</> : <><Plus size={13} /> Register Node</>}
      </button>
      {err && <div className="text-xs" style={{ color: "var(--color-error)" }}>{err}</div>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RemotePage() {
  const qc = useQueryClient();
  const [tokenInput, setTokenInput] = useState("");
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [checkingNodeId, setCheckingNodeId] = useState<string | null>(null);

  // Edge Nodes
  const edgeNodesQ = useQuery({
    queryKey: ["edge-nodes"],
    queryFn: () => api.edgeNodesApi.list(),
    staleTime: 30_000,
  });

  const gamingPcRoleQ = useQuery({
    queryKey: ["gaming-pc-role"],
    queryFn: () => api.edgeNodesApi.gamingPcRole(),
    staleTime: 300_000,
  });

  const deleteNodeMut = useMutation({
    mutationFn: (id: string) => api.edgeNodesApi.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["edge-nodes"] }),
  });

  async function handleHealthCheck(id: string) {
    setCheckingNodeId(id);
    try {
      await api.edgeNodesApi.healthCheck(id);
      void qc.invalidateQueries({ queryKey: ["edge-nodes"] });
    } finally {
      setCheckingNodeId(null);
    }
  }
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

  // Home & Shop Autopilot
  const homeAutopilotStatusQ = useQuery({
    queryKey: ["home-autopilot-status"],
    queryFn: () => api.homeAutopilotApi.status(),
    staleTime: 60_000,
  });

  const homeDevicesQ = useQuery({
    queryKey: ["home-autopilot-devices"],
    queryFn: () => api.homeAutopilotApi.devices.list(),
    staleTime: 60_000,
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

      {/* ── Edge Nodes ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-base font-bold" style={{ color: "var(--color-foreground)" }}>Edge Nodes</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            Register dedicated mini PCs, Pis, and NAS nodes for always-on home/shop services.
            Gaming PC is the heavy AI brain — not an always-on server.
          </p>
        </div>
        <button onClick={() => void qc.invalidateQueries({ queryKey: ["edge-nodes"] })}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Gaming PC role info */}
      {gamingPcRoleQ.data && (
        <Card>
          <CardHeader icon={Cpu} title="Gaming PC Role" />
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded" style={{ background: "color-mix(in srgb, var(--color-error) 12%, transparent)", color: "var(--color-error)", fontWeight: 600 }}>
                NOT always-on
              </span>
              <span style={{ color: "var(--color-muted)" }}>{String((gamingPcRoleQ.data as Record<string, unknown>).purpose ?? "")}</span>
            </div>
            <div className="text-xs p-2 rounded" style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
              {String((gamingPcRoleQ.data as Record<string, unknown>).recommendation ?? "")}
            </div>
          </div>
        </Card>
      )}

      {/* Registered nodes list */}
      <Card>
        <CardHeader icon={Server} title={`Registered Edge Nodes (${edgeNodesQ.data?.count ?? 0})`} />
        {edgeNodesQ.isLoading && (
          <div className="text-xs text-center py-6" style={{ color: "var(--color-muted)" }}>Loading…</div>
        )}
        {edgeNodesQ.data?.nodes.length === 0 && (
          <div className="text-xs text-center py-6" style={{ color: "var(--color-muted)" }}>
            No edge nodes registered. Add dedicated nodes below for always-on services.
          </div>
        )}
        {(edgeNodesQ.data?.nodes ?? []).map((node) => (
          <NodeRow
            key={node.id}
            node={node}
            onHealthCheck={(id) => void handleHealthCheck(id)}
            onDelete={(id) => deleteNodeMut.mutate(id)}
            checkingId={checkingNodeId}
          />
        ))}
      </Card>

      {/* Register node form */}
      <Card>
        <CardHeader icon={Plus} title="Register Edge Node" />
        <RegisterNodeForm onSuccess={() => void qc.invalidateQueries({ queryKey: ["edge-nodes"] })} />
      </Card>

      {/* ── Home & Shop Autopilot ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-base font-bold" style={{ color: "var(--color-foreground)" }}>Home &amp; Shop Autopilot</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            Home Assistant, MQTT, robot vacuum, cameras, and shop devices.
            All actions evaluated locally — no cloud dependency.
          </p>
        </div>
        <button
          onClick={() => {
            void qc.invalidateQueries({ queryKey: ["home-autopilot-status"] });
            void qc.invalidateQueries({ queryKey: ["home-autopilot-devices"] });
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Home Autopilot status overview */}
      {homeAutopilotStatusQ.isLoading && (
        <div className="text-xs text-center py-6" style={{ color: "var(--color-muted)" }}>Loading home autopilot status…</div>
      )}
      {homeAutopilotStatusQ.data && (
        <HomeAutopilotStatusCard status={homeAutopilotStatusQ.data} />
      )}

      {/* Devices list */}
      <Card>
        <CardHeader icon={Zap} title={`Home &amp; Shop Devices (${homeDevicesQ.data?.devices?.length ?? 0})`} />
        {homeDevicesQ.isLoading && (
          <div className="text-xs text-center py-6" style={{ color: "var(--color-muted)" }}>Loading…</div>
        )}
        {!homeDevicesQ.isLoading && (homeDevicesQ.data?.devices?.length ?? 0) === 0 && (
          <div className="text-xs text-center py-6" style={{ color: "var(--color-muted)" }}>
            No home devices configured. Add device profiles via the API.
          </div>
        )}
        {(homeDevicesQ.data?.devices ?? []).map((d: HomeDeviceProfile) => (
          <HomeDeviceRow key={d.id} device={d} />
        ))}
      </Card>
    </div>
  );
}

// ── Home Autopilot helpers ────────────────────────────────────────────────────

function haConfigBadge(configured: boolean) {
  return configured
    ? <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: "color-mix(in srgb, var(--color-success) 15%, transparent)", color: "var(--color-success)" }}>configured</span>
    : <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: "color-mix(in srgb, var(--color-warn) 15%, transparent)", color: "var(--color-warn)" }}>not configured</span>;
}

function riskBadge(tier: string) {
  const color =
    tier === "read_only"        ? "var(--color-info)"
    : tier === "low_risk"       ? "var(--color-success)"
    : tier === "approval_required" ? "var(--color-warn)"
    : tier === "manual_only"    ? "var(--color-error)"
    : tier === "blocked"        ? "var(--color-error)"
    : "var(--color-muted)";
  return (
    <span className="px-1.5 py-0.5 rounded text-xs font-mono"
      style={{ background: "color-mix(in srgb, " + color + " 15%, transparent)", color }}>
      {tier}
    </span>
  );
}

function deviceTypeIcon(t: string) {
  if (t === "camera_nvr") return <Video size={13} />;
  if (t === "lock" || t === "garage_door") return <Lock size={13} />;
  if (t === "thermostat" || t === "heater") return <Thermometer size={13} />;
  if (t === "fan" || t === "air_filter") return <Wind size={13} />;
  return <Home size={13} />;
}

function HomeAutopilotStatusCard({ status }: { status: HomeAutopilotStatus }) {
  return (
    <Card>
      <CardHeader icon={Home} title="Home Autopilot Status" />
      <div className="px-4 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <span className="shrink-0 w-40 text-xs" style={{ color: "var(--color-muted)" }}>Home Assistant</span>
        <span className="ml-auto">{haConfigBadge(status.haConfigured)}</span>
      </div>
      <div className="px-4 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <span className="shrink-0 w-40 text-xs" style={{ color: "var(--color-muted)" }}>MQTT broker</span>
        <span className="ml-auto">{haConfigBadge(status.mqttConfigured)}</span>
      </div>
      <div className="px-4 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <span className="shrink-0 w-40 text-xs" style={{ color: "var(--color-muted)" }}>Robot vacuum</span>
        <span className="ml-auto">{haConfigBadge(status.robotVacuumConfigured)}</span>
      </div>
      <div className="px-4 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <span className="shrink-0 w-40 text-xs" style={{ color: "var(--color-muted)" }}>Camera (Frigate)</span>
        <span className="ml-auto">{haConfigBadge(status.cameraConfigured)}</span>
      </div>
      <KVRow label="Configured devices" value={status.devicesConfigured} />
      <KVRow label="Shop devices" value={status.shopDevicesConfigured} />
    </Card>
  );
}

function HomeDeviceRow({ device }: { device: HomeDeviceProfile }) {
  const topAction = Object.values(device.actionPolicy ?? {})[0];
  return (
    <div className="flex items-center gap-3 px-4 py-3 text-sm"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      <span style={{ color: "var(--color-accent)" }}>{deviceTypeIcon(device.deviceType)}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-xs truncate" style={{ color: "var(--color-foreground)" }}>
          {device.name || device.id}
        </div>
        <div className="text-xs truncate" style={{ color: "var(--color-muted)" }}>
          {device.deviceType} · {device.provider}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {haConfigBadge(device.configured)}
        {topAction && riskBadge(topAction)}
      </div>
    </div>
  );
}
