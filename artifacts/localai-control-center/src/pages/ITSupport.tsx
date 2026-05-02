import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CheckCircle, ClipboardCheck, FileCode2, Lock, RefreshCw, ShieldAlert, TerminalSquare, Wrench } from "lucide-react";
import api, { apiErrorMessage, type ItSupportArtifact, type ItSupportWorkflowType } from "../api.js";

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

function statusTone(status: string): "muted" | "good" | "warn" | "error" | "info" {
  if (status === "review_required") return "info";
  if (status === "approval_pending") return "warn";
  if (status === "blocked") return "error";
  if (status === "not_configured") return "muted";
  return "muted";
}

function ArtifactRow({ artifact, onValidate, onPropose, busy }: {
  artifact: ItSupportArtifact;
  onValidate: (id: string) => void;
  onPropose: (id: string) => void;
  busy: boolean;
}) {
  return (
    <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>{artifact.title}</span>
            <Pill label={artifact.status} tone={statusTone(artifact.status)} />
            <Pill label={artifact.executionMode} tone="info" />
          </div>
          <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--color-muted)" }}>{artifact.requestSummary}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Pill label={artifact.safetyContract.adminRequired ? "admin review" : "standard review"} tone={artifact.safetyContract.adminRequired ? "warn" : "good"} />
            <Pill label={artifact.scriptLanguage ?? "checklist"} tone="muted" />
            {artifact.approvalId && <Pill label={`approval ${artifact.approvalId.slice(0, 8)}`} tone="warn" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Btn onClick={() => onValidate(artifact.id)} disabled={busy}>
            <ClipboardCheck size={11} /> Validate
          </Btn>
          <Btn onClick={() => onPropose(artifact.id)} disabled={busy}>
            <Lock size={11} /> Dry Run
          </Btn>
        </div>
      </div>
    </div>
  );
}

export default function ITSupportPage() {
  const qc = useQueryClient();
  const [workflowType, setWorkflowType] = useState<ItSupportWorkflowType>("generate_powershell_script");
  const [title, setTitle] = useState("Service diagnostic helper");
  const [request, setRequest] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [feedback, setFeedback] = useState("");

  const statusQ = useQuery({
    queryKey: ["it-support-status"],
    queryFn: () => api.itSupportApi.status(),
    refetchInterval: 15_000,
  });
  const artifactsQ = useQuery({
    queryKey: ["it-support-artifacts"],
    queryFn: () => api.itSupportApi.artifacts(),
    refetchInterval: 15_000,
  });

  const createMut = useMutation({
    mutationFn: () => api.itSupportApi.createArtifact({
      workflowType,
      title,
      request,
      metadata: { source: "control-center" },
    }),
    onSuccess: (result) => {
      setFeedback(result.message);
      setRequest("");
      void qc.invalidateQueries({ queryKey: ["it-support-status"] });
      void qc.invalidateQueries({ queryKey: ["it-support-artifacts"] });
    },
    onError: (error) => setFeedback(apiErrorMessage(error)),
  });

  const validateMut = useMutation({
    mutationFn: (id: string) => api.itSupportApi.validateScript(id),
    onSuccess: (result) => {
      setFeedback(result.message);
      void qc.invalidateQueries({ queryKey: ["it-support-artifacts"] });
    },
    onError: (error) => setFeedback(apiErrorMessage(error)),
  });

  const proposeMut = useMutation({
    mutationFn: (id: string) => api.itSupportApi.proposeScript(id, "dry_run"),
    onSuccess: (result) => {
      setFeedback(result.message);
      void qc.invalidateQueries({ queryKey: ["it-support-artifacts"] });
      void qc.invalidateQueries({ queryKey: ["it-support-status"] });
    },
    onError: (error) => setFeedback(apiErrorMessage(error)),
  });

  const workflows = statusQ.data?.workflows ?? [];
  const integrations = statusQ.data?.integrations ?? [];
  const artifacts = artifactsQ.data?.artifacts ?? [];
  const selected = useMemo(
    () => artifacts.find(artifact => artifact.id === selectedId) ?? artifacts[0],
    [artifacts, selectedId],
  );

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-foreground)" }}>IT Support</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Pill label="local-first" tone="good" />
            <Pill label="review/dry-run" tone="info" />
            <Pill label="approval-gated" tone="warn" />
            <Pill label="executor disabled" tone="muted" />
          </div>
        </div>
        <Btn onClick={() => { void qc.invalidateQueries({ queryKey: ["it-support-status"] }); void qc.invalidateQueries({ queryKey: ["it-support-artifacts"] }); }}>
          <RefreshCw size={12} /> Refresh
        </Btn>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <Header icon={ShieldAlert} title="Provider Status" />
          <div className="grid gap-0 md:grid-cols-2">
            {integrations.map((integration) => (
              <div key={integration.id} className="p-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium flex-1" style={{ color: "var(--color-foreground)" }}>{integration.name}</span>
                  <Pill label={integration.status} tone={integration.status === "not_configured" ? "info" : "muted"} />
                </div>
                <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--color-muted)" }}>{integration.reason}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <Header icon={FileCode2} title="Script Draft Builder" />
          <div className="p-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs space-y-1" style={{ color: "var(--color-muted)" }}>
                Workflow
                <select value={workflowType} onChange={(event) => setWorkflowType(event.target.value as ItSupportWorkflowType)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}>
                  {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
                </select>
              </label>
              <label className="text-xs space-y-1" style={{ color: "var(--color-muted)" }}>
                Title
                <input value={title} onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }} />
              </label>
            </div>
            <textarea
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              rows={5}
              className="w-full rounded-lg px-3 py-2 text-sm resize-none"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
              placeholder="Ticket, issue, or script request"
            />
            <div className="flex items-center gap-3">
              <Btn onClick={() => createMut.mutate()} disabled={createMut.isPending || !request.trim()} variant="accent">
                <CheckCircle size={12} /> Draft
              </Btn>
              {feedback && <span className="text-xs" style={{ color: "var(--color-muted)" }}>{feedback}</span>}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <Header icon={Wrench} title="Artifacts" />
          {artifacts.length === 0 && (
            <div className="p-6 text-sm text-center" style={{ color: "var(--color-muted)" }}>No IT support drafts</div>
          )}
          {artifacts.map((artifact) => (
            <div key={artifact.id} onClick={() => setSelectedId(artifact.id)}
              className="block w-full text-left cursor-pointer"
              style={{ background: selected?.id === artifact.id ? "color-mix(in srgb, var(--color-accent) 7%, transparent)" : "transparent" }}>
              <ArtifactRow
                artifact={artifact}
                onValidate={(id) => validateMut.mutate(id)}
                onPropose={(id) => proposeMut.mutate(id)}
                busy={validateMut.isPending || proposeMut.isPending}
              />
            </div>
          ))}
        </Card>

        <Card>
          <Header icon={TerminalSquare} title="Source And Safety Inspector" />
          {!selected && (
            <div className="p-6 text-sm text-center" style={{ color: "var(--color-muted)" }}>No artifact selected</div>
          )}
          {selected && (
            <div className="p-4 space-y-4">
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>{selected.title}</div>
                <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>{selected.safetyContract.purpose}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>Reads</div>
                  {selected.safetyContract.reads.map((item) => <div key={item} className="text-xs mb-1" style={{ color: "var(--color-foreground)" }}>{item}</div>)}
                </div>
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>Changes</div>
                  {selected.safetyContract.changes.map((item) => <div key={item} className="text-xs mb-1" style={{ color: "var(--color-foreground)" }}>{item}</div>)}
                </div>
              </div>
              <div className="rounded-lg p-3 text-xs font-mono overflow-auto max-h-80"
                style={{ background: "var(--color-elevated)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" }}>
                <pre className="whitespace-pre-wrap">{selected.scriptBody}</pre>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
