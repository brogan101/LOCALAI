import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Car, ClipboardCheck, Gauge, RefreshCw, ShieldAlert, Wrench } from "lucide-react";
import type { ElementType, ReactNode } from "react";
import { useMemo, useState } from "react";
import api, { apiErrorMessage, type AutomotiveActionType, type DiagnosticCase, type VehicleProfile } from "../api.js";

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border p-4 ${className}`} style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      {children}
    </section>
  );
}

function CardHeader({ icon: Icon, title, subtitle }: { icon: ElementType; title: string; subtitle?: string }) {
  return (
    <div className="mb-3 flex items-start gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ background: "color-mix(in srgb, var(--color-accent) 14%, transparent)", color: "var(--color-accent)" }}>
        <Icon size={17} />
      </div>
      <div>
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>{title}</h2>
        {subtitle && <p className="mt-1 text-xs" style={{ color: "var(--color-muted)" }}>{subtitle}</p>}
      </div>
    </div>
  );
}

function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "danger" | "info" }) {
  const color =
    tone === "ok" ? "var(--color-success)" :
    tone === "warn" ? "var(--color-warn)" :
    tone === "danger" ? "var(--color-error)" :
    tone === "info" ? "var(--color-info)" :
    "var(--color-muted)";
  return (
    <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
      style={{ color, borderColor: "color-mix(in srgb, currentColor 28%, transparent)", background: "color-mix(in srgb, currentColor 9%, transparent)" }}>
      {children}
    </span>
  );
}

function Button({ children, onClick, disabled = false, title }: { children: ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled}
      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50"
      style={{ background: "var(--color-elevated)", borderColor: "var(--color-border)", color: "var(--color-foreground)" }}>
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-xs" style={{ color: "var(--color-muted)" }}>{label}{children}</label>;
}

const inputStyle = {
  background: "var(--color-elevated)",
  borderColor: "var(--color-border)",
  color: "var(--color-foreground)",
};

function factList(vehicle?: VehicleProfile) {
  if (!vehicle) return [];
  return [
    { label: "Year/Make/Model", value: `${vehicle.year} ${vehicle.make} ${vehicle.model}` },
    { label: "Body", value: vehicle.body },
    { label: "Engine", value: vehicle.engine },
    { label: "Transmission", value: vehicle.transmission },
    { label: "ECU", value: vehicle.ecu },
    ...vehicle.mods.map(fact => ({ label: fact.label, value: fact.value })),
  ];
}

export default function AutomotivePage() {
  const qc = useQueryClient();
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [symptoms, setSymptoms] = useState("Intermittent no-start after heat soak; verify fuel, spark, grounds, and ACES logs before parts.");
  const [dtcCode, setDtcCode] = useState("P0300");
  const [repairSummary, setRepairSummary] = useState("Verified test results and final fix notes.");
  const [lastMessage, setLastMessage] = useState("");

  const statusQ = useQuery({ queryKey: ["automotive-status"], queryFn: () => api.automotiveApi.status() });
  const vehiclesQ = useQuery({ queryKey: ["automotive-vehicles"], queryFn: () => api.automotiveApi.vehicles(100) });
  const selectedVehicle = useMemo(() => {
    const vehicles = vehiclesQ.data?.vehicles ?? [];
    return vehicles.find(vehicle => vehicle.id === selectedVehicleId) ?? vehicles[0];
  }, [vehiclesQ.data?.vehicles, selectedVehicleId]);
  const casesQ = useQuery({
    queryKey: ["automotive-cases", selectedVehicle?.id],
    queryFn: () => api.automotiveApi.cases(selectedVehicle?.id, 100),
    enabled: !!selectedVehicle?.id,
  });

  const preloadFoxbody = useMutation({
    mutationFn: () => api.automotiveApi.preloadFoxbody(),
    onSuccess: async (result) => {
      setSelectedVehicleId(result.vehicle.id);
      setLastMessage("Foxbody build profile loaded locally.");
      await Promise.all([qc.invalidateQueries({ queryKey: ["automotive-status"] }), qc.invalidateQueries({ queryKey: ["automotive-vehicles"] })]);
    },
    onError: (error) => setLastMessage(apiErrorMessage(error)),
  });

  const createCase = useMutation({
    mutationFn: () => api.automotiveApi.createCase({
      vehicleId: selectedVehicle!.id,
      title: "Master Tech diagnostic intake",
      symptoms,
      dtcs: dtcCode.trim() ? [{ code: dtcCode.trim(), description: "Sample/user-provided DTC" }] : [],
    }),
    onSuccess: async () => {
      setLastMessage("Diagnostic plan created locally; no hardware was contacted.");
      await Promise.all([qc.invalidateQueries({ queryKey: ["automotive-status"] }), qc.invalidateQueries({ queryKey: ["automotive-cases", selectedVehicle?.id] })]);
    },
    onError: (error) => setLastMessage(apiErrorMessage(error)),
  });

  const addRepair = useMutation({
    mutationFn: (diagnosticCase?: DiagnosticCase) => api.automotiveApi.addRepairLog(selectedVehicle!.id, {
      caseId: diagnosticCase?.id,
      summary: repairSummary,
      finalFix: "unknown until verified by test result",
    }),
    onSuccess: async () => {
      setLastMessage("Repair log entry linked to the vehicle.");
      await qc.invalidateQueries({ queryKey: ["automotive-vehicles"] });
    },
    onError: (error) => setLastMessage(apiErrorMessage(error)),
  });

  const proposeAction = useMutation({
    mutationFn: (actionType: AutomotiveActionType) => api.automotiveApi.proposeAction({
      vehicleId: selectedVehicle!.id,
      caseId: casesQ.data?.cases[0]?.id,
      actionType,
    }),
    onSuccess: (result) => setLastMessage(`${result.actionType}: ${result.status}. ${result.reason}`),
    onError: (error) => setLastMessage(apiErrorMessage(error)),
  });

  const vehicles = vehiclesQ.data?.vehicles ?? [];
  const cases = casesQ.data?.cases ?? [];
  const latestCase = cases[0];

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6" style={{ color: "var(--color-foreground)" }}>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Master Tech</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
            Vehicle profiles, diagnostic test plans, repair logs, and adapter status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void Promise.all([statusQ.refetch(), vehiclesQ.refetch(), casesQ.refetch()])}><RefreshCw size={14} />Refresh</Button>
          <Button onClick={() => preloadFoxbody.mutate()} disabled={preloadFoxbody.isPending}><Car size={14} />Load Foxbody</Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader icon={Car} title="Vehicle Profile" subtitle={statusQ.data?.status.sourceOfTruth ?? "Local automotive source of truth"} />
          <div className="mb-3 flex flex-wrap gap-2">
            <Pill tone="ok">local-first</Pill>
            <Pill tone="warn">hardware not_configured</Pill>
            <Pill tone="info">{statusQ.data?.status.counts.vehicles ?? 0} vehicles</Pill>
            <Pill tone="info">{statusQ.data?.status.counts.diagnosticCases ?? 0} cases</Pill>
          </div>
          <div className="mb-3 grid gap-2 md:grid-cols-2">
            {vehicles.map(vehicle => (
              <button key={vehicle.id} type="button" onClick={() => setSelectedVehicleId(vehicle.id)}
                className="rounded-lg border p-3 text-left"
                style={{ background: selectedVehicle?.id === vehicle.id ? "color-mix(in srgb, var(--color-accent) 9%, var(--color-elevated))" : "var(--color-elevated)", borderColor: "var(--color-border)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{vehicle.name}</p>
                    <p className="mt-1 text-xs" style={{ color: "var(--color-muted)" }}>{vehicle.engine} / {vehicle.transmission} / {vehicle.ecu}</p>
                  </div>
                  <Pill tone="info">{vehicle.factStatus}</Pill>
                </div>
              </button>
            ))}
            {vehicles.length === 0 && <p className="text-sm" style={{ color: "var(--color-muted)" }}>No local vehicle profiles yet.</p>}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {factList(selectedVehicle).slice(0, 12).map(item => (
              <div key={`${item.label}-${item.value}`} className="rounded-lg border p-3" style={{ background: "var(--color-elevated)", borderColor: "var(--color-border)" }}>
                <p className="text-xs" style={{ color: "var(--color-muted)" }}>{item.label}</p>
                <p className="mt-1 text-sm font-medium">{item.value}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader icon={Gauge} title="Symptom Intake" subtitle="Likely causes stay hypotheses until tests confirm them." />
          <div className="grid gap-3">
            <Field label="Symptoms"><textarea className="min-h-28 rounded-lg border px-3 py-2 text-sm" style={inputStyle} value={symptoms} onChange={event => setSymptoms(event.target.value)} /></Field>
            <Field label="Sample / user-provided DTC"><input className="rounded-lg border px-3 py-2 text-sm" style={inputStyle} value={dtcCode} onChange={event => setDtcCode(event.target.value)} /></Field>
            <Button onClick={() => createCase.mutate()} disabled={!selectedVehicle || createCase.isPending}><ClipboardCheck size={14} />Create Test Plan</Button>
          </div>
        </Card>

        <Card>
          <CardHeader icon={ClipboardCheck} title="Diagnostic Plan" subtitle={latestCase?.title ?? "No diagnostic case selected"} />
          {latestCase ? (
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-2">
                <Pill tone="info">{latestCase.intakeStatus}</Pill>
                <Pill tone="warn">freeze-frame {latestCase.freezeFrameStatus}</Pill>
                <Pill tone="warn">live data {latestCase.liveDataStatus}</Pill>
                <Pill tone="ok">external calls false</Pill>
              </div>
              <div className="rounded-lg border p-3" style={{ background: "var(--color-elevated)", borderColor: "var(--color-border)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--color-muted)" }}>Likely causes</p>
                <div className="mt-2 grid gap-2">
                  {latestCase.likelyCauses.map(cause => (
                    <div key={cause.system} className="text-sm">
                      <span className="font-medium">{cause.system}</span>
                      <span style={{ color: "var(--color-muted)" }}> - {cause.cause}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                {latestCase.testPlan.map(step => (
                  <div key={step.id} className="rounded-lg border p-3" style={{ background: "var(--color-elevated)", borderColor: "var(--color-border)" }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{step.title}</p>
                      <Pill tone={step.status === "not_configured" ? "warn" : "info"}>{step.status}</Pill>
                    </div>
                    <p className="mt-1 text-xs" style={{ color: "var(--color-muted)" }}>{step.method}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>Create a symptom intake to generate a local test-first plan.</p>
          )}
        </Card>

        <Card>
          <CardHeader icon={ShieldAlert} title="Adapter & Action Safety" subtitle="Writes, clears, actuators, tune changes, and firmware are gated or blocked." />
          <div className="grid gap-2">
            {(statusQ.data?.status.providers ?? []).slice(0, 6).map(provider => (
              <div key={provider.id} className="flex items-start justify-between gap-3 rounded-lg border p-3" style={{ background: "var(--color-elevated)", borderColor: "var(--color-border)" }}>
                <div>
                  <p className="text-sm font-medium">{provider.name}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--color-muted)" }}>{provider.reason}</p>
                </div>
                <Pill tone={provider.status === "disabled" ? "danger" : "warn"}>{provider.status}</Pill>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => proposeAction.mutate("obd_scan")} disabled={!selectedVehicle || proposeAction.isPending}><Gauge size={14} />OBD Scan</Button>
            <Button onClick={() => proposeAction.mutate("clear_dtcs")} disabled={!selectedVehicle || proposeAction.isPending}><AlertTriangle size={14} />Clear Codes</Button>
            <Button onClick={() => proposeAction.mutate("ecu_write")} disabled={!selectedVehicle || proposeAction.isPending}><ShieldAlert size={14} />ECU Write</Button>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader icon={Wrench} title="Repair Log" subtitle="Final fixes remain user-provided until verified by tests." />
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input className="rounded-lg border px-3 py-2 text-sm" style={inputStyle} value={repairSummary} onChange={event => setRepairSummary(event.target.value)} />
            <Button onClick={() => addRepair.mutate(latestCase)} disabled={!selectedVehicle || addRepair.isPending}><Wrench size={14} />Add Entry</Button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {(selectedVehicle?.repairLog ?? []).slice().reverse().map(entry => (
              <div key={String(entry.id)} className="rounded-lg border p-3 text-sm" style={{ background: "var(--color-elevated)", borderColor: "var(--color-border)" }}>
                <p className="font-medium">{String(entry.summary ?? "Repair log")}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--color-muted)" }}>final fix: {String(entry.finalFixStatus ?? "unknown")}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {lastMessage && <p className="mt-4 text-sm" style={{ color: "var(--color-muted)" }}>{lastMessage}</p>}
    </div>
  );
}
