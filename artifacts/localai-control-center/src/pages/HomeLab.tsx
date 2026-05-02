import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, Network, Server, Wifi, Database, Globe, Layers,
  CheckCircle, AlertTriangle, HelpCircle, Router, FileText, ShieldCheck, ShieldAlert, Activity,
} from "lucide-react";
import api, {
  apiErrorMessage,
  type HomelabBlueprint,
  type HomelabConfigProposal,
  type HomelabConfigProposalType,
  type HomelabConfigProviderId,
  type HomelabConfigValidationKind,
  type HomelabDevice,
  type HomelabDeviceRole,
  type HomelabDataConfidence,
  type HomelabProviderProfile,
  type HomelabService,
  type HomelabSite,
  type HomelabSocAlert,
  type HomelabSocProviderProfile,
  type HomelabSocRemediationAction,
  type HomelabSocReport,
  type HomelabSocReportKind,
  type HomelabSocSeverity,
  type HomelabSubnet,
  type HomelabVlan,
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

function CardHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      <Icon size={15} style={{ color: "var(--color-accent)" }} />
      <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>{title}</span>
    </div>
  );
}

function KVRow({ label, value, mono = false }: { label: string; value: string | number | null | undefined; mono?: boolean }) {
  const display = value === null || value === undefined ? "—" : String(value);
  return (
    <div className="flex items-baseline gap-4 px-4 py-2 text-sm"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      <span className="shrink-0 w-40 text-xs" style={{ color: "var(--color-muted)" }}>{label}</span>
      <span className={`flex-1 ${mono ? "font-mono text-xs" : ""}`} style={{ color: "var(--color-foreground)" }}>{display}</span>
    </div>
  );
}

function Pill({ label, tone = "muted" }: { label: string; tone?: "muted" | "good" | "warn" | "error" | "info" }) {
  const color =
    tone === "good"  ? "var(--color-success)" :
    tone === "warn"  ? "var(--color-warn)"    :
    tone === "error" ? "var(--color-error)"   :
    tone === "info"  ? "var(--color-info)"    :
    "var(--color-muted)";
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
      {label}
    </span>
  );
}

function confidencePill(c: HomelabDataConfidence) {
  if (c === "confirmed") return <Pill label="confirmed" tone="good" />;
  if (c === "proposed")  return <Pill label="proposed"  tone="info" />;
  return <Pill label="unknown" tone="warn" />;
}

function confidenceIcon(c: HomelabDataConfidence) {
  if (c === "confirmed") return <CheckCircle size={13} style={{ color: "var(--color-success)", flexShrink: 0 }} />;
  if (c === "proposed")  return <AlertTriangle size={13} style={{ color: "var(--color-info)", flexShrink: 0 }} />;
  return <HelpCircle size={13} style={{ color: "var(--color-warn)", flexShrink: 0 }} />;
}

function providerStatusPill(status: string) {
  if (status === "read_only") return <Pill label="read-only" tone="good" />;
  if (status === "degraded")  return <Pill label="degraded"  tone="warn" />;
  if (status === "disabled")  return <Pill label="disabled"  tone="error" />;
  return <Pill label="not configured" tone="muted" />;
}

function pipelineStatusPill(status: string) {
  if (status === "validation_passed" || status === "approved" || status === "applied") return <Pill label={status.replaceAll("_", " ")} tone="good" />;
  if (status === "approval_required" || status === "validation_required" || status === "dry_run" || status === "drafted") return <Pill label={status.replaceAll("_", " ")} tone="info" />;
  if (status === "validation_failed" || status === "apply_blocked" || status === "not_configured") return <Pill label={status.replaceAll("_", " ")} tone="warn" />;
  return <Pill label={status.replaceAll("_", " ")} tone="muted" />;
}

function severityPill(severity: string) {
  if (severity === "critical" || severity === "high") return <Pill label={severity} tone="error" />;
  if (severity === "medium") return <Pill label={severity} tone="warn" />;
  if (severity === "low") return <Pill label={severity} tone="info" />;
  return <Pill label={severity} tone="muted" />;
}

function deviceRoleIcon(role: HomelabDeviceRole) {
  if (role === "router" || role === "firewall") return <Router size={13} />;
  if (role === "switch" || role === "access_point") return <Wifi size={13} />;
  if (role === "nas" || role === "hypervisor" || role === "server") return <Database size={13} />;
  return <Server size={13} />;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProviderRow({ provider }: { provider: HomelabProviderProfile }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 text-sm"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      <Globe size={13} style={{ color: "var(--color-accent)", marginTop: 2, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium" style={{ color: "var(--color-foreground)" }}>{provider.name}</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{provider.reason}</div>
      </div>
      <div className="flex-shrink-0">{providerStatusPill(provider.status)}</div>
    </div>
  );
}

function SiteRow({ site }: { site: HomelabSite }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      {confidenceIcon(site.confidence)}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium" style={{ color: "var(--color-foreground)" }}>{site.name}</span>
        {site.description && (
          <span className="text-xs ml-2" style={{ color: "var(--color-muted)" }}>{site.description}</span>
        )}
      </div>
      {confidencePill(site.confidence)}
    </div>
  );
}

function DeviceRow({ device }: { device: HomelabDevice }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      <span style={{ color: "var(--color-accent)" }}>{deviceRoleIcon(device.role)}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate" style={{ color: "var(--color-foreground)" }}>{device.name}</div>
        <div className="text-xs" style={{ color: "var(--color-muted)" }}>
          {device.role}{device.make ? ` · ${device.make}` : ""}{device.model ? ` ${device.model}` : ""}
        </div>
      </div>
      {confidencePill(device.confidence)}
    </div>
  );
}

function VlanRow({ vlan }: { vlan: HomelabVlan }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      {confidenceIcon(vlan.confidence)}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium font-mono" style={{ color: "var(--color-foreground)" }}>
          VLAN {vlan.vlanId}
        </span>
        <span className="text-xs ml-2" style={{ color: "var(--color-muted)" }}>{vlan.name}</span>
        {vlan.description && (
          <span className="text-xs ml-1" style={{ color: "var(--color-muted)" }}>— {vlan.description}</span>
        )}
      </div>
      {confidencePill(vlan.confidence)}
    </div>
  );
}

function SubnetRow({ subnet }: { subnet: HomelabSubnet }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      {confidenceIcon(subnet.confidence)}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium font-mono" style={{ color: "var(--color-foreground)" }}>
          {subnet.prefix}
        </span>
        {subnet.description && (
          <span className="text-xs ml-2" style={{ color: "var(--color-muted)" }}>{subnet.description}</span>
        )}
      </div>
      {confidencePill(subnet.confidence)}
    </div>
  );
}

function ServiceRow({ service }: { service: HomelabService }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      {confidenceIcon(service.confidence)}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium" style={{ color: "var(--color-foreground)" }}>{service.name}</span>
        <span className="text-xs ml-2" style={{ color: "var(--color-muted)" }}>
          {service.serviceType}{service.port ? ` :${service.port}` : ""}{service.protocol !== "unknown" ? ` (${service.protocol})` : ""}
        </span>
      </div>
      {confidencePill(service.confidence)}
    </div>
  );
}

function BlueprintNotesSection({ blueprint }: { blueprint: HomelabBlueprint }) {
  if (!blueprint.notes.length) return null;
  return (
    <div className="px-4 py-3 space-y-1.5">
      {blueprint.notes.map((note, i) => (
        <div key={i} className="flex items-start gap-2 text-xs"
          style={{ color: note.toLowerCase().includes("warning") ? "var(--color-warn)" : "var(--color-muted)" }}>
          {note.toLowerCase().includes("warning")
            ? <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
            : <CheckCircle size={11} style={{ flexShrink: 0, marginTop: 1, color: "var(--color-success)" }} />}
          {note}
        </div>
      ))}
    </div>
  );
}

function ProposalRow({
  proposal,
  onValidate,
  onApply,
  onRollback,
}: {
  proposal: HomelabConfigProposal;
  onValidate: (id: string, kind: HomelabConfigValidationKind) => void;
  onApply: (id: string) => void;
  onRollback: (id: string) => void;
}) {
  return (
    <div className="px-4 py-3 space-y-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold" style={{ color: "var(--color-foreground)" }}>
          {proposal.proposalType.replaceAll("_", " ")}
        </span>
        {pipelineStatusPill(proposal.applyStatus)}
        {providerStatusPill(proposal.providerStatus)}
        <Pill label={proposal.dryRun ? "dry run" : "live"} tone={proposal.dryRun ? "info" : "error"} />
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <KVRow label="Target" value={`${proposal.targetProvider} / ${proposal.targetType}`} mono />
        <KVRow label="Validation" value={`${proposal.validationStatus} (${proposal.validationKind})`} mono />
        <KVRow label="Approval" value={proposal.approvalId ? `${proposal.approvalStatus} / ${proposal.approvalId.slice(0, 8)}` : proposal.approvalStatus} mono />
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <div className="rounded-lg p-3" style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
          <div className="text-xs font-medium mb-1" style={{ color: "var(--color-foreground)" }}>Generated Draft</div>
          <pre className="text-[11px] whitespace-pre-wrap overflow-x-auto" style={{ color: "var(--color-muted)" }}>
            {JSON.stringify(proposal.draftMetadata, null, 2)}
          </pre>
        </div>
        <div className="rounded-lg p-3" style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
          <div className="text-xs font-medium mb-1" style={{ color: "var(--color-foreground)" }}>Diff / Expected Changes</div>
          <pre className="text-[11px] whitespace-pre-wrap overflow-x-auto" style={{ color: "var(--color-muted)" }}>
            {JSON.stringify({ diff: proposal.diffSummary, changes: proposal.expectedChanges }, null, 2)}
          </pre>
        </div>
        <div className="rounded-lg p-3" style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
          <div className="text-xs font-medium mb-1" style={{ color: "var(--color-foreground)" }}>Backup / Rollback</div>
          <pre className="text-[11px] whitespace-pre-wrap overflow-x-auto" style={{ color: "var(--color-muted)" }}>
            {JSON.stringify({ backup: proposal.backupPlan, rollback: proposal.rollbackPlan }, null, 2)}
          </pre>
        </div>
      </div>
      {proposal.notConfiguredReason && (
        <div className="text-xs" style={{ color: "var(--color-warn)" }}>{proposal.notConfiguredReason}</div>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => onValidate(proposal.id, "static")} className="px-3 py-1.5 rounded-lg text-xs"
          style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
          Static Validate
        </button>
        <button onClick={() => onValidate(proposal.id, "simulated")} className="px-3 py-1.5 rounded-lg text-xs"
          style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
          Simulate
        </button>
        <button onClick={() => onApply(proposal.id)} className="px-3 py-1.5 rounded-lg text-xs"
          style={{ background: "var(--color-elevated)", color: "var(--color-warn)", border: "1px solid var(--color-border)" }}>
          Request Apply Gate
        </button>
        <button onClick={() => onRollback(proposal.id)} className="px-3 py-1.5 rounded-lg text-xs"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
          Rollback Metadata
        </button>
      </div>
    </div>
  );
}

function SocProviderRow({ provider }: { provider: HomelabSocProviderProfile }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5 text-sm"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      <ShieldAlert size={13} style={{ color: "var(--color-accent)", marginTop: 2, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium" style={{ color: "var(--color-foreground)" }}>{provider.name}</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{provider.reason}</div>
      </div>
      <div className="flex gap-2 items-center">
        <Pill label={provider.category} tone="info" />
        {providerStatusPill(provider.status)}
      </div>
    </div>
  );
}

function SummaryList({ title, items, tone = "muted" }: { title: string; items: string[]; tone?: "muted" | "good" | "warn" | "info" }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
      <div className="text-xs font-medium mb-1" style={{ color: "var(--color-foreground)" }}>{title}</div>
      {items.length === 0
        ? <div className="text-[11px]" style={{ color: "var(--color-muted)" }}>None recorded.</div>
        : items.map((item, idx) => (
          <div key={idx} className="text-[11px] leading-relaxed" style={{ color: tone === "warn" ? "var(--color-warn)" : tone === "good" ? "var(--color-success)" : tone === "info" ? "var(--color-info)" : "var(--color-muted)" }}>
            {item}
          </div>
        ))
      }
    </div>
  );
}

function SocAlertRow({
  alert,
  onRemediate,
}: {
  alert: HomelabSocAlert;
  onRemediate: (alertId: string, action: HomelabSocRemediationAction) => void;
}) {
  return (
    <div className="px-4 py-3 space-y-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold" style={{ color: "var(--color-foreground)" }}>{alert.title}</span>
        {severityPill(alert.severity)}
        <Pill label={alert.status.replaceAll("_", " ")} tone={alert.status === "open" ? "warn" : "muted"} />
        {providerStatusPill(alert.providerStatus)}
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        <SummaryList title="Confirmed" items={alert.summary.confirmedFacts} tone="good" />
        <SummaryList title="Inferred" items={alert.summary.inferredPossibilities} tone="info" />
        <SummaryList title="Unknown" items={alert.summary.unknowns} tone="warn" />
        <SummaryList title="Proposed" items={alert.summary.proposedNextActions} />
      </div>
      {alert.notConfiguredReason && (
        <div className="text-xs" style={{ color: "var(--color-warn)" }}>{alert.notConfiguredReason}</div>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => onRemediate(alert.id, "read_only_review")} className="px-3 py-1.5 rounded-lg text-xs"
          style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
          Read-only Review
        </button>
        <button onClick={() => onRemediate(alert.id, "block_device")} className="px-3 py-1.5 rounded-lg text-xs"
          style={{ background: "var(--color-elevated)", color: "var(--color-warn)", border: "1px solid var(--color-border)" }}>
          Request Block Gate
        </button>
        <button onClick={() => onRemediate(alert.id, "dns_filter_change")} className="px-3 py-1.5 rounded-lg text-xs"
          style={{ background: "var(--color-elevated)", color: "var(--color-warn)", border: "1px solid var(--color-border)" }}>
          DNS Change Gate
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomeLabPage() {
  const qc = useQueryClient();
  const [proposalType, setProposalType] = useState<HomelabConfigProposalType>("vlan_ip_dns_dhcp_firewall");
  const [targetProvider, setTargetProvider] = useState<HomelabConfigProviderId>("opnsense");
  const [socReportKind, setSocReportKind] = useState<HomelabSocReportKind>("unknown_device_report");
  const [socAlertTitle, setSocAlertTitle] = useState("Local suspicious security event");
  const [socAlertSeverity, setSocAlertSeverity] = useState<HomelabSocSeverity>("medium");
  const [socReport, setSocReport] = useState<HomelabSocReport | null>(null);

  const statusQ = useQuery({
    queryKey: ["homelab-status"],
    queryFn: () => api.homelabApi.status(),
    staleTime: 30_000,
  });

  const blueprintQ = useQuery({
    queryKey: ["homelab-blueprint"],
    queryFn: () => api.homelabApi.blueprint(),
    staleTime: 30_000,
  });

  const proposalsQ = useQuery({
    queryKey: ["homelab-config-proposals"],
    queryFn: () => api.homelabApi.config.proposals(),
    staleTime: 15_000,
  });

  const socStatusQ = useQuery({
    queryKey: ["homelab-soc-status"],
    queryFn: () => api.homelabApi.soc.status(),
    staleTime: 30_000,
  });

  const socAlertsQ = useQuery({
    queryKey: ["homelab-soc-alerts"],
    queryFn: () => api.homelabApi.soc.alerts(),
    staleTime: 15_000,
  });

  const socRemediationsQ = useQuery({
    queryKey: ["homelab-soc-remediations"],
    queryFn: () => api.homelabApi.soc.remediations(),
    staleTime: 15_000,
  });

  const createProposalM = useMutation({
    mutationFn: () => api.homelabApi.config.createProposal({ proposalType, targetProvider }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["homelab-config-proposals"] }),
  });

  const validateM = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: HomelabConfigValidationKind }) => api.homelabApi.config.validate(id, kind),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["homelab-config-proposals"] }),
  });

  const applyM = useMutation({
    mutationFn: (id: string) => api.homelabApi.config.apply(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["homelab-config-proposals"] }),
  });

  const rollbackM = useMutation({
    mutationFn: (id: string) => api.homelabApi.config.rollback(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["homelab-config-proposals"] }),
  });

  const createSocAlertM = useMutation({
    mutationFn: () => api.homelabApi.soc.createAlert({
      title: socAlertTitle,
      severity: socAlertSeverity,
      category: "security",
      sourceProvider: "wazuh",
      summary: {
        confirmedFacts: ["Local alert metadata was entered manually."],
        inferredPossibilities: ["A provider may confirm this after it is intentionally configured."],
        unknowns: ["Raw security logs and packet contents are not stored by this form."],
        proposedNextActions: ["Review locally and request approval before any remediation."],
      },
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["homelab-soc-alerts"] });
      void qc.invalidateQueries({ queryKey: ["homelab-soc-status"] });
    },
  });

  const socReportM = useMutation({
    mutationFn: () => api.homelabApi.soc.report(socReportKind),
    onSuccess: (data) => setSocReport(data.report),
  });

  const socRemediateM = useMutation({
    mutationFn: ({ alertId, action }: { alertId: string; action: HomelabSocRemediationAction }) =>
      api.homelabApi.soc.proposeRemediation(alertId, action),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["homelab-soc-remediations"] });
      void qc.invalidateQueries({ queryKey: ["homelab-config-proposals"] });
    },
  });

  const status = statusQ.data?.status;
  const blueprint = blueprintQ.data?.blueprint;
  const proposals = proposalsQ.data?.proposals ?? [];
  const socStatus = socStatusQ.data?.status;
  const socAlerts = socAlertsQ.data?.alerts ?? [];
  const socRemediations = socRemediationsQ.data?.remediations ?? [];

  function refreshAll() {
    void qc.invalidateQueries({ queryKey: ["homelab-status"] });
    void qc.invalidateQueries({ queryKey: ["homelab-blueprint"] });
    void qc.invalidateQueries({ queryKey: ["homelab-config-proposals"] });
    void qc.invalidateQueries({ queryKey: ["homelab-soc-status"] });
    void qc.invalidateQueries({ queryKey: ["homelab-soc-alerts"] });
    void qc.invalidateQueries({ queryKey: ["homelab-soc-remediations"] });
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6"
      style={{ background: "var(--color-background)" }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-foreground)" }}>HomeLab Architect</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            Local-first network inventory, config proposals, validation, approvals, and rollback metadata.
          </p>
        </div>
        <button onClick={refreshAll}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {(statusQ.isLoading || blueprintQ.isLoading) && (
        <div className="text-sm text-center py-12" style={{ color: "var(--color-muted)" }}>Loading…</div>
      )}

      {statusQ.isError && (
        <div className="text-sm px-4 py-3 rounded-lg" style={{ color: "var(--color-error)", background: "color-mix(in srgb, var(--color-error) 10%, transparent)" }}>
          {apiErrorMessage(statusQ.error, "Failed to load HomeLab status")}
        </div>
      )}

      {/* Inventory summary */}
      {status && (
        <Card>
          <CardHeader icon={Network} title="Inventory Summary" />
          <KVRow label="Sites"    value={status.sitesCount} />
          <KVRow label="Devices"  value={status.devicesCount} />
          <KVRow label="VLANs"    value={status.vlansCount} />
          <KVRow label="Subnets"  value={status.subnetsCount} />
          <KVRow label="Services" value={status.servicesCount} />
          <div className="px-4 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <span className="text-xs w-40" style={{ color: "var(--color-muted)" }}>Phase</span>
            <Pill label="15B — draft configs, validation, approval-gated apply" tone="info" />
          </div>
        </Card>
      )}

      {/* Home SOC */}
      <Card>
        <CardHeader icon={ShieldAlert} title="Home SOC" />
        <div className="px-4 py-3 grid gap-3 md:grid-cols-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <KVRow label="Alerts" value={socStatus?.alertsCount ?? 0} />
          <KVRow label="Open" value={socStatus?.openAlertsCount ?? 0} />
          <KVRow label="Security APIs" value={socStatus?.realSecurityApiCallsEnabled ? "enabled" : "disabled"} />
          <KVRow label="Cloud required" value={socStatus?.cloudRequired ? "yes" : "no"} />
        </div>
        <div className="px-4 py-3 grid gap-3 lg:grid-cols-[1fr_1fr_auto] items-end" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <label className="text-xs" style={{ color: "var(--color-muted)" }}>
            Local alert title
            <input value={socAlertTitle} onChange={(e) => setSocAlertTitle(e.target.value)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-xs"
              style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }} />
          </label>
          <label className="text-xs" style={{ color: "var(--color-muted)" }}>
            Severity
            <select value={socAlertSeverity} onChange={(e) => setSocAlertSeverity(e.target.value as HomelabSocSeverity)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-xs"
              style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
              <option value="info">Info</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <button onClick={() => createSocAlertM.mutate()} disabled={createSocAlertM.isPending}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
            <ShieldAlert size={13} /> Record Alert
          </button>
        </div>
        <div className="px-4 py-3 grid gap-3 lg:grid-cols-[1fr_auto] items-end" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <label className="text-xs" style={{ color: "var(--color-muted)" }}>
            Analysis workflow
            <select value={socReportKind} onChange={(e) => setSocReportKind(e.target.value as HomelabSocReportKind)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-xs"
              style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
              <option value="unknown_device_report">Unknown device report</option>
              <option value="suspicious_dns_summary">Suspicious DNS summary</option>
              <option value="wan_outage_timeline">WAN outage timeline</option>
              <option value="noisy_iot_device_summary">Noisy IoT device summary</option>
              <option value="what_changed_report">What changed?</option>
            </select>
          </label>
          <button onClick={() => socReportM.mutate()} disabled={socReportM.isPending}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
            <Activity size={13} /> Generate Summary
          </button>
        </div>
        {(createSocAlertM.isError || socReportM.isError || socRemediateM.isError || socStatusQ.isError || socAlertsQ.isError) && (
          <div className="px-4 py-2 text-xs" style={{ color: "var(--color-error)", borderBottom: "1px solid var(--color-border)" }}>
            {apiErrorMessage(createSocAlertM.error || socReportM.error || socRemediateM.error || socStatusQ.error || socAlertsQ.error, "Home SOC action failed")}
          </div>
        )}
        {socReport && (
          <div className="px-4 py-3 space-y-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold" style={{ color: "var(--color-foreground)" }}>{socReport.kind.replaceAll("_", " ")}</span>
              <Pill label="local model/default" tone="good" />
              {providerStatusPill(socReport.providerStatus)}
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <SummaryList title="Confirmed" items={socReport.summary.confirmedFacts} tone="good" />
              <SummaryList title="Inferred" items={socReport.summary.inferredPossibilities} tone="info" />
              <SummaryList title="Unknown" items={socReport.summary.unknowns} tone="warn" />
              <SummaryList title="Proposed" items={socReport.summary.proposedNextActions} />
            </div>
          </div>
        )}
        {socAlerts.length === 0
          ? <div className="text-xs px-4 py-6 text-center" style={{ color: "var(--color-muted)", borderBottom: "1px solid var(--color-border)" }}>No Home SOC alerts recorded yet.</div>
          : socAlerts.map((alert) => (
            <SocAlertRow
              key={alert.id}
              alert={alert}
              onRemediate={(alertId, action) => socRemediateM.mutate({ alertId, action })}
            />
          ))
        }
        {socRemediations.length > 0 && (
          <div className="px-4 py-3 space-y-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <div className="text-xs font-medium" style={{ color: "var(--color-foreground)" }}>Remediation Gates</div>
            {socRemediations.slice(0, 5).map((proposal) => (
              <div key={proposal.id} className="flex flex-wrap items-center gap-2 text-xs">
                <Pill label={proposal.action.replaceAll("_", " ")} tone={proposal.status === "blocked" || proposal.status === "denied" ? "warn" : "info"} />
                <span style={{ color: "var(--color-muted)" }}>{proposal.status.replaceAll("_", " ")}</span>
                {proposal.approvalId && <span className="font-mono" style={{ color: "var(--color-muted)" }}>{proposal.approvalId.slice(0, 8)}</span>}
                {proposal.linkedConfigProposalId && <span className="font-mono" style={{ color: "var(--color-muted)" }}>config {proposal.linkedConfigProposalId.slice(0, 8)}</span>}
              </div>
            ))}
          </div>
        )}
        {socStatus && (
          <div>
            {socStatus.providers.map((p) => <SocProviderRow key={p.providerId} provider={p} />)}
          </div>
        )}
      </Card>

      {/* Config proposal pipeline */}
      <Card>
        <CardHeader icon={FileText} title="Config Proposal Pipeline" />
        <div className="px-4 py-3 grid gap-3 md:grid-cols-[1fr_1fr_auto] items-end" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <label className="text-xs" style={{ color: "var(--color-muted)" }}>
            Proposal type
            <select value={proposalType} onChange={(e) => setProposalType(e.target.value as HomelabConfigProposalType)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-xs"
              style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
              <option value="vlan_ip_dns_dhcp_firewall">VLAN / IP / DNS / DHCP / firewall</option>
              <option value="proxmox_layout">Proxmox VM/LXC layout</option>
              <option value="docker_compose_stack">Docker Compose stack</option>
              <option value="backup_monitoring_plan">Backup / monitoring plan</option>
              <option value="ansible_playbook">Ansible draft</option>
              <option value="opentofu_terraform">OpenTofu / Terraform draft</option>
              <option value="opnsense_draft">OPNsense draft</option>
              <option value="unifi_draft">UniFi draft</option>
              <option value="netbox_nautobot_draft">NetBox / Nautobot draft</option>
            </select>
          </label>
          <label className="text-xs" style={{ color: "var(--color-muted)" }}>
            Target provider
            <select value={targetProvider} onChange={(e) => setTargetProvider(e.target.value as HomelabConfigProviderId)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-xs"
              style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
              {status?.providers.map((p) => <option key={p.providerId} value={p.providerId}>{p.name}</option>)}
            </select>
          </label>
          <button onClick={() => createProposalM.mutate()} disabled={createProposalM.isPending}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
            <ShieldCheck size={13} /> Create Draft
          </button>
        </div>
        {(createProposalM.isError || validateM.isError || applyM.isError || rollbackM.isError) && (
          <div className="px-4 py-2 text-xs" style={{ color: "var(--color-error)", borderBottom: "1px solid var(--color-border)" }}>
            {apiErrorMessage(createProposalM.error || validateM.error || applyM.error || rollbackM.error, "Config pipeline action failed")}
          </div>
        )}
        {proposals.length === 0
          ? <div className="text-xs px-4 py-6 text-center" style={{ color: "var(--color-muted)" }}>No config proposals yet.</div>
          : proposals.map((proposal) => (
            <ProposalRow
              key={proposal.id}
              proposal={proposal}
              onValidate={(id, kind) => validateM.mutate({ id, kind })}
              onApply={(id) => applyM.mutate(id)}
              onRollback={(id) => rollbackM.mutate(id)}
            />
          ))
        }
      </Card>

      {/* Optional providers */}
      {status && (
        <Card>
          <CardHeader icon={Globe} title={`Optional Providers (${status.providers.length})`} />
          {status.providers.map((p) => <ProviderRow key={p.providerId} provider={p} />)}
        </Card>
      )}

      {/* Blueprint notes */}
      {blueprint && (
        <Card>
          <CardHeader icon={Layers} title="Network Blueprint" />
          <div className="px-4 py-2 flex items-center gap-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>Overall confidence</span>
            <span className="ml-auto">{confidencePill(blueprint.overallConfidence)}</span>
          </div>
          <div className="px-4 py-2 flex items-center gap-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>Applied</span>
            <span className="ml-auto">
              <Pill label="never — Phase 15A read-only" tone="muted" />
            </span>
          </div>
          <BlueprintNotesSection blueprint={blueprint} />
        </Card>
      )}

      {/* Sites */}
      {blueprint && (
        <Card>
          <CardHeader icon={Server} title={`Sites (${blueprint.sites.length})`} />
          {blueprint.sites.length === 0
            ? <div className="text-xs px-4 py-6 text-center" style={{ color: "var(--color-muted)" }}>No sites registered. Add sites via the API.</div>
            : blueprint.sites.map((s) => <SiteRow key={s.id} site={s} />)
          }
        </Card>
      )}

      {/* Devices */}
      {blueprint && (
        <Card>
          <CardHeader icon={Server} title={`Devices (${blueprint.devices.length})`} />
          {blueprint.devices.length === 0
            ? <div className="text-xs px-4 py-6 text-center" style={{ color: "var(--color-muted)" }}>No devices registered. Add devices via the API.</div>
            : blueprint.devices.map((d) => <DeviceRow key={d.id} device={d} />)
          }
        </Card>
      )}

      {/* VLANs */}
      {blueprint && (
        <Card>
          <CardHeader icon={Wifi} title={`VLANs (${blueprint.vlans.length})`} />
          {blueprint.vlans.length === 0
            ? <div className="text-xs px-4 py-6 text-center" style={{ color: "var(--color-muted)" }}>No VLANs registered. Add VLANs via the API.</div>
            : blueprint.vlans.map((v) => <VlanRow key={v.id} vlan={v} />)
          }
        </Card>
      )}

      {/* Subnets */}
      {blueprint && (
        <Card>
          <CardHeader icon={Network} title={`Subnets (${blueprint.subnets.length})`} />
          {blueprint.subnets.length === 0
            ? <div className="text-xs px-4 py-6 text-center" style={{ color: "var(--color-muted)" }}>No subnets registered. Add subnets via the API.</div>
            : blueprint.subnets.map((s) => <SubnetRow key={s.id} subnet={s} />)
          }
        </Card>
      )}

      {/* Services */}
      {blueprint && (
        <Card>
          <CardHeader icon={Database} title={`Services / Containers (${blueprint.services.length})`} />
          {blueprint.services.length === 0
            ? <div className="text-xs px-4 py-6 text-center" style={{ color: "var(--color-muted)" }}>No services registered. Add services via the API.</div>
            : blueprint.services.map((s) => <ServiceRow key={s.id} service={s} />)
          }
        </Card>
      )}
    </div>
  );
}
