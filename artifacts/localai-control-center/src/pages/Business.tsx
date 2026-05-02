import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BriefcaseBusiness, CheckCircle, FileText, Lock, MessageSquareText, RefreshCw, ShieldAlert, Users } from "lucide-react";
import api, { apiErrorMessage, type BusinessAdapterId, type BusinessDraft, type BusinessModuleId } from "../api.js";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      {children}
    </div>
  );
}

function Header({ icon: Icon, title, actions }: { icon: React.ElementType; title: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      <Icon size={14} style={{ color: "var(--color-accent)" }} />
      <span className="text-sm font-semibold flex-1" style={{ color: "var(--color-foreground)" }}>{title}</span>
      {actions}
    </div>
  );
}

function Pill({ label, tone = "muted" }: { label: string; tone?: "muted" | "good" | "warn" | "error" | "info" }) {
  const color =
    tone === "good" ? "var(--color-success)" :
    tone === "warn" ? "var(--color-warn)" :
    tone === "error" ? "var(--color-error)" :
    tone === "info" ? "var(--color-info)" :
    "var(--color-muted)";
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
      {label}
    </span>
  );
}

function Btn({ onClick, disabled, children, variant = "default" }: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: "default" | "accent";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-40"
      style={{
        background: variant === "accent" ? "var(--color-accent)" : "var(--color-elevated)",
        color: variant === "accent" ? "#fff" : "var(--color-muted)",
        border: `1px solid ${variant === "accent" ? "transparent" : "var(--color-border)"}`,
      }}>
      {children}
    </button>
  );
}

function moduleIcon(id: BusinessModuleId) {
  if (id === "lead-generation") return Users;
  if (id === "content-factory") return FileText;
  if (id === "customer-support-copilot") return MessageSquareText;
  if (id === "it-support-copilot") return ShieldAlert;
  return BriefcaseBusiness;
}

function adapterTone(status: string): "muted" | "good" | "warn" | "error" | "info" {
  if (status === "configured") return "good";
  if (status === "degraded") return "warn";
  if (status === "not_configured") return "info";
  return "muted";
}

function DraftRow({ draft, onPropose, busy }: { draft: BusinessDraft; onPropose: (id: string) => void; busy: boolean }) {
  return (
    <div className="px-4 py-3"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>{draft.moduleId}</span>
            <Pill label={draft.status} tone={draft.status === "approval_pending" ? "warn" : "muted"} />
            {draft.adapterId && <Pill label={draft.adapterId} tone="info" />}
            {draft.privacy.redacted && <Pill label="redacted" tone="good" />}
          </div>
          <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--color-muted)" }}>{draft.inboundSummary}</p>
          {draft.approvalId && (
            <div className="text-xs font-mono mt-1" style={{ color: "var(--color-muted)" }}>
              approval {draft.approvalId.slice(0, 8)}
            </div>
          )}
        </div>
        <Btn onClick={() => onPropose(draft.id)} disabled={busy}>
          <Lock size={11} /> Propose
        </Btn>
      </div>
    </div>
  );
}

export default function BusinessPage() {
  const qc = useQueryClient();
  const [moduleId, setModuleId] = useState<BusinessModuleId>("lead-generation");
  const [adapterId, setAdapterId] = useState<BusinessAdapterId>("email");
  const [inboundText, setInboundText] = useState("");
  const [feedback, setFeedback] = useState("");

  const statusQ = useQuery({
    queryKey: ["business-status"],
    queryFn: () => api.businessApi.status(),
    refetchInterval: 15_000,
  });
  const draftsQ = useQuery({
    queryKey: ["business-drafts"],
    queryFn: () => api.businessApi.drafts(),
    refetchInterval: 15_000,
  });

  const createMut = useMutation({
    mutationFn: () => api.businessApi.createDraft({
      moduleId,
      adapterId,
      inboundText,
      source: "control-center",
    }),
    onSuccess: (result) => {
      setFeedback(result.message);
      setInboundText("");
      void qc.invalidateQueries({ queryKey: ["business-status"] });
      void qc.invalidateQueries({ queryKey: ["business-drafts"] });
    },
    onError: (error) => setFeedback(apiErrorMessage(error)),
  });

  const proposeMut = useMutation({
    mutationFn: (id: string) => api.businessApi.proposeDraftSend(id),
    onSuccess: (result) => {
      setFeedback(result.message);
      void qc.invalidateQueries({ queryKey: ["business-drafts"] });
    },
    onError: (error) => setFeedback(apiErrorMessage(error)),
  });

  const modules = statusQ.data?.modules ?? [];
  const adapters = statusQ.data?.adapters ?? [];
  const drafts = draftsQ.data?.drafts ?? [];

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-foreground)" }}>Business</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Pill label="local-first" tone="good" />
            <Pill label="approval-gated" tone="warn" />
            <Pill label="no external execution" tone="info" />
          </div>
        </div>
        <Btn onClick={() => { void qc.invalidateQueries({ queryKey: ["business-status"] }); void qc.invalidateQueries({ queryKey: ["business-drafts"] }); }}>
          <RefreshCw size={12} /> Refresh
        </Btn>
      </div>

      <div className="grid gap-4 xl:grid-cols-5 md:grid-cols-2">
        {modules.map((module) => {
          const Icon = moduleIcon(module.id);
          return (
            <Card key={module.id}>
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: "var(--color-elevated)", color: "var(--color-accent)" }}>
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>{module.name}</div>
                    <p className="text-xs mt-1 line-clamp-3" style={{ color: "var(--color-muted)" }}>{module.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Pill label="draft-only" tone="info" />
                  <Pill label={module.status} tone="good" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <Header icon={ShieldAlert} title="Adapter Status" />
          <div className="grid gap-0 md:grid-cols-2">
            {adapters.map((adapter) => (
              <div key={adapter.id} className="p-4"
                style={{ borderBottom: "1px solid var(--color-border)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium flex-1" style={{ color: "var(--color-foreground)" }}>{adapter.name}</span>
                  <Pill label={adapter.status} tone={adapterTone(adapter.status)} />
                </div>
                <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--color-muted)" }}>{adapter.reason}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Pill label={adapter.requiresApproval ? "approval" : "open"} tone="warn" />
                  <Pill label={adapter.secretsConfigured ? "secret ref" : "no secret"} tone={adapter.secretsConfigured ? "good" : "muted"} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <Header icon={FileText} title="Draft Composer" />
          <div className="p-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs space-y-1" style={{ color: "var(--color-muted)" }}>
                Module
                <select value={moduleId} onChange={(event) => setModuleId(event.target.value as BusinessModuleId)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}>
                  {modules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
                </select>
              </label>
              <label className="text-xs space-y-1" style={{ color: "var(--color-muted)" }}>
                Adapter
                <select value={adapterId} onChange={(event) => setAdapterId(event.target.value as BusinessAdapterId)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}>
                  {adapters.map((adapter) => <option key={adapter.id} value={adapter.id}>{adapter.name}</option>)}
                </select>
              </label>
            </div>
            <textarea
              value={inboundText}
              onChange={(event) => setInboundText(event.target.value)}
              rows={5}
              className="w-full rounded-lg px-3 py-2 text-sm resize-none"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
              placeholder="Inbound item"
            />
            <div className="flex items-center gap-3">
              <Btn onClick={() => createMut.mutate()} disabled={createMut.isPending || !inboundText.trim()} variant="accent">
                <CheckCircle size={12} /> Draft
              </Btn>
              {feedback && <span className="text-xs" style={{ color: "var(--color-muted)" }}>{feedback}</span>}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <Header icon={Lock} title="Draft Approval Queue" />
        {drafts.length === 0 && (
          <div className="p-6 text-sm text-center" style={{ color: "var(--color-muted)" }}>No drafts</div>
        )}
        {drafts.map((draft) => (
          <DraftRow
            key={draft.id}
            draft={draft}
            onPropose={(id) => proposeMut.mutate(id)}
            busy={proposeMut.isPending && proposeMut.variables === draft.id}
          />
        ))}
      </Card>
    </div>
  );
}
