import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, GitBranch, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import type { ElementType, ReactNode } from "react";
import api, {
  apiErrorMessage,
  type DigitalTwinEntity,
  type DigitalTwinEntityType,
  type DigitalTwinPrivacyClassification,
  type DigitalTwinRelationshipStatus,
} from "../api.js";

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl border p-4 ${className}`}
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
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
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50"
      style={{ background: "var(--color-elevated)", borderColor: "var(--color-border)", color: "var(--color-foreground)" }}>
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
      {label}
      {children}
    </label>
  );
}

const inputStyle = {
  background: "var(--color-elevated)",
  borderColor: "var(--color-border)",
  color: "var(--color-foreground)",
};

function entityTone(entity: DigitalTwinEntity): "neutral" | "ok" | "warn" | "danger" | "info" {
  if (entity.archivedAt) return "danger";
  if (entity.stateConfidence === "confirmed") return "ok";
  if (entity.stateConfidence === "proposed") return "info";
  return "warn";
}

const ENTITY_TYPES: DigitalTwinEntityType[] = [
  "room", "zone", "tool", "printer", "camera", "sensor", "vehicle", "network_device",
  "vm", "container", "document", "part", "filament", "project", "automation", "service",
];

const PRIVACY: DigitalTwinPrivacyClassification[] = ["public", "normal", "private", "sensitive", "secret"];
const RELATIONSHIP_STATUSES: DigitalTwinRelationshipStatus[] = ["confirmed", "proposed", "inferred", "stale", "blocked", "unknown"];

export default function DigitalTwinPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("Shop tool");
  const [type, setType] = useState<DigitalTwinEntityType>("tool");
  const [privacy, setPrivacy] = useState<DigitalTwinPrivacyClassification>("private");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [sourceEntityId, setSourceEntityId] = useState("");
  const [targetEntityId, setTargetEntityId] = useState("");
  const [relationType, setRelationType] = useState("related_to");
  const [relationshipStatus, setRelationshipStatus] = useState<DigitalTwinRelationshipStatus>("proposed");

  const statusQ = useQuery({ queryKey: ["digital-twin-status"], queryFn: () => api.digitalTwinApi.status() });
  const entitiesQ = useQuery({ queryKey: ["digital-twin-entities"], queryFn: () => api.digitalTwinApi.entities({ limit: 200 }) });
  const relationshipsQ = useQuery({ queryKey: ["digital-twin-relationships"], queryFn: () => api.digitalTwinApi.relationships() });
  const detailQ = useQuery({
    queryKey: ["digital-twin-detail", selectedId],
    queryFn: () => api.digitalTwinApi.detail(selectedId),
    enabled: !!selectedId,
  });
  const searchQ = useQuery({
    queryKey: ["digital-twin-search", search],
    queryFn: () => api.digitalTwinApi.search(search),
    enabled: search.trim().length > 1,
  });

  const createEntity = useMutation({
    mutationFn: () => api.digitalTwinApi.createEntity({
      type,
      name,
      privacyClassification: privacy,
      sensitivity: privacy,
      stateConfidence: "unknown",
      sourceRefs: [{ system: "manual", kind: type, id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "manual", status: "unknown" }],
    }),
    onSuccess: (res) => {
      setSelectedId(res.entity.id);
      qc.invalidateQueries({ queryKey: ["digital-twin-status"] });
      qc.invalidateQueries({ queryKey: ["digital-twin-entities"] });
    },
  });

  const createRelationship = useMutation({
    mutationFn: () => api.digitalTwinApi.createRelationship({
      sourceEntityId,
      targetEntityId,
      relationType,
      confidence: relationshipStatus === "confirmed" ? 0.99 : 0.55,
      status: relationshipStatus,
      provenance: {
        source: relationshipStatus === "inferred" ? "ai" : "manual",
        sourceRef: "local-digital-twin-ui",
        evidenceRefs: [],
        note: "Created from the local Digital Twin explorer.",
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["digital-twin-status"] });
      qc.invalidateQueries({ queryKey: ["digital-twin-relationships"] });
      if (selectedId) qc.invalidateQueries({ queryKey: ["digital-twin-detail", selectedId] });
    },
  });

  const archiveEntity = useMutation({
    mutationFn: (id: string) => api.digitalTwinApi.archiveEntity(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["digital-twin-status"] });
      qc.invalidateQueries({ queryKey: ["digital-twin-entities"] });
    },
  });

  const entityList = entitiesQ.data?.entities ?? [];
  const selectedEntity = useMemo(
    () => detailQ.data?.detail.entity ?? entityList.find((entity) => entity.id === selectedId),
    [detailQ.data, entityList, selectedId],
  );
  const searchResults = searchQ.data?.entities ?? [];

  return (
    <div className="min-h-screen p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-foreground)" }}>Digital Twin</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
            Local relationship graph for existing HomeLab, Maker, Evidence, edge, vehicle, tool, and project records.
          </p>
        </div>
        <Button onClick={() => {
          qc.invalidateQueries({ queryKey: ["digital-twin-status"] });
          qc.invalidateQueries({ queryKey: ["digital-twin-entities"] });
          qc.invalidateQueries({ queryKey: ["digital-twin-relationships"] });
        }}>
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      {(statusQ.error || entitiesQ.error || relationshipsQ.error) && (
        <Card className="mb-4">
          <p className="text-sm" style={{ color: "var(--color-error)" }}>
            {apiErrorMessage(statusQ.error || entitiesQ.error || relationshipsQ.error, "Failed to load Digital Twin")}
          </p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-4">
          <Card>
            <CardHeader icon={Boxes} title="Graph Status" subtitle="Local source-of-truth layer; no device discovery or external API calls." />
            <div className="grid gap-2 sm:grid-cols-4">
              <div><div className="text-xs" style={{ color: "var(--color-muted)" }}>Entities</div><div className="text-lg font-semibold">{statusQ.data?.status.entityCount ?? 0}</div></div>
              <div><div className="text-xs" style={{ color: "var(--color-muted)" }}>Relationships</div><div className="text-lg font-semibold">{statusQ.data?.status.relationshipCount ?? 0}</div></div>
              <div><div className="text-xs" style={{ color: "var(--color-muted)" }}>Archived</div><div className="text-lg font-semibold">{statusQ.data?.status.archivedEntityCount ?? 0}</div></div>
              <div><div className="text-xs" style={{ color: "var(--color-muted)" }}>External APIs</div><Pill tone="ok">{String(statusQ.data?.status.externalApiCallsMade ?? false)}</Pill></div>
            </div>
          </Card>

          <Card>
            <CardHeader icon={Plus} title="Create Entity" subtitle="Unknowns stay unknown until confirmed by source data or provenance." />
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Name">
                <input className="rounded-lg border px-3 py-2 text-sm" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Type">
                <select className="rounded-lg border px-3 py-2 text-sm" style={inputStyle} value={type} onChange={(e) => setType(e.target.value as DigitalTwinEntityType)}>
                  {ENTITY_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="Privacy">
                <select className="rounded-lg border px-3 py-2 text-sm" style={inputStyle} value={privacy} onChange={(e) => setPrivacy(e.target.value as DigitalTwinPrivacyClassification)}>
                  {PRIVACY.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>
              <div className="flex items-end">
                <Button onClick={() => createEntity.mutate()} disabled={!name.trim() || createEntity.isPending}>
                  <Plus size={14} /> Create
                </Button>
              </div>
            </div>
            {createEntity.error && <p className="mt-3 text-xs" style={{ color: "var(--color-error)" }}>{apiErrorMessage(createEntity.error)}</p>}
          </Card>

          <Card>
            <CardHeader icon={Search} title="Explorer" subtitle="Search uses local graph metadata only." />
            <input
              className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
              placeholder="Search entities or relationship statuses"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="grid gap-2">
              {(search.trim().length > 1 ? searchResults : entityList).map((entity) => (
                <button
                  type="button"
                  key={entity.id}
                  onClick={() => setSelectedId(entity.id)}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 text-left"
                  style={{
                    background: selectedId === entity.id ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "var(--color-elevated)",
                    borderColor: "var(--color-border)",
                  }}>
                  <div>
                    <div className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>{entity.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Pill tone="info">{entity.type}</Pill>
                      <Pill tone={entityTone(entity)}>{entity.stateConfidence}</Pill>
                      <Pill>{entity.privacyClassification}</Pill>
                      {entity.sourceRefs.length > 0 && <Pill>{entity.sourceRefs.length} refs</Pill>}
                    </div>
                  </div>
                </button>
              ))}
              {entityList.length === 0 && <p className="text-sm" style={{ color: "var(--color-muted)" }}>No Digital Twin entities yet.</p>}
            </div>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader icon={ShieldCheck} title="Entity Detail" subtitle="Linked documents, jobs, and events are references only." />
            {selectedEntity ? (
              <div className="grid gap-3">
                <div>
                  <h3 className="text-base font-semibold" style={{ color: "var(--color-foreground)" }}>{selectedEntity.name}</h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Pill tone="info">{selectedEntity.type}</Pill>
                    <Pill tone={entityTone(selectedEntity)}>{selectedEntity.stateConfidence}</Pill>
                    <Pill>{selectedEntity.sensitivity}</Pill>
                    <Pill>{selectedEntity.providerStatus}</Pill>
                  </div>
                </div>
                <div className="rounded-lg border p-3" style={{ borderColor: "var(--color-border)", background: "var(--color-elevated)" }}>
                  <div className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Source refs</div>
                  <div className="mt-2 grid gap-1">
                    {selectedEntity.sourceRefs.map((ref) => (
                      <div key={`${ref.system}:${ref.kind}:${ref.id}`} className="text-xs" style={{ color: "var(--color-foreground)" }}>
                        {ref.system} / {ref.kind} / {ref.status ?? "unknown"}
                      </div>
                    ))}
                    {selectedEntity.sourceRefs.length === 0 && <div className="text-xs" style={{ color: "var(--color-muted)" }}>No source refs yet.</div>}
                  </div>
                </div>
                <div className="grid gap-2">
                  <div className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Linked records</div>
                  <Pill>{detailQ.data?.detail.relationships.length ?? 0} relationships</Pill>
                  <Pill>{detailQ.data?.detail.linkedDocuments.length ?? 0} documents</Pill>
                  <Pill>{detailQ.data?.detail.linkedJobs.length ?? 0} jobs</Pill>
                  <Pill>{detailQ.data?.detail.linkedEvents.length ?? 0} events</Pill>
                </div>
                <Button onClick={() => archiveEntity.mutate(selectedEntity.id)} disabled={archiveEntity.isPending} title="Archives only if no active relationships exist">
                  Archive
                </Button>
                {archiveEntity.error && <p className="text-xs" style={{ color: "var(--color-error)" }}>{apiErrorMessage(archiveEntity.error)}</p>}
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>Select an entity to inspect links.</p>
            )}
          </Card>

          <Card>
            <CardHeader icon={GitBranch} title="Relationship Proposal" subtitle="AI/inferred relationships require provenance and never become confirmed by guesswork." />
            <div className="grid gap-3">
              <Field label="Source entity id">
                <input className="rounded-lg border px-3 py-2 text-sm" style={inputStyle} value={sourceEntityId} onChange={(e) => setSourceEntityId(e.target.value)} />
              </Field>
              <Field label="Relation">
                <input className="rounded-lg border px-3 py-2 text-sm" style={inputStyle} value={relationType} onChange={(e) => setRelationType(e.target.value)} />
              </Field>
              <Field label="Target entity id">
                <input className="rounded-lg border px-3 py-2 text-sm" style={inputStyle} value={targetEntityId} onChange={(e) => setTargetEntityId(e.target.value)} />
              </Field>
              <Field label="Status">
                <select className="rounded-lg border px-3 py-2 text-sm" style={inputStyle} value={relationshipStatus} onChange={(e) => setRelationshipStatus(e.target.value as DigitalTwinRelationshipStatus)}>
                  {RELATIONSHIP_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>
              <Button onClick={() => createRelationship.mutate()} disabled={!sourceEntityId || !targetEntityId || createRelationship.isPending}>
                <GitBranch size={14} /> Create Relationship
              </Button>
              {createRelationship.error && <p className="text-xs" style={{ color: "var(--color-error)" }}>{apiErrorMessage(createRelationship.error)}</p>}
            </div>
          </Card>

          <Card>
            <CardHeader icon={GitBranch} title="Relationship Status" />
            <div className="grid gap-2">
              {(relationshipsQ.data?.relationships ?? []).slice(0, 8).map((rel) => (
                <div key={rel.id} className="rounded-lg border p-2 text-xs" style={{ borderColor: "var(--color-border)", background: "var(--color-elevated)" }}>
                  <div style={{ color: "var(--color-foreground)" }}>{rel.relationType}</div>
                  <div className="mt-1 flex gap-1.5"><Pill>{rel.status}</Pill><Pill>{Math.round(rel.confidence * 100)}%</Pill></div>
                </div>
              ))}
              {(relationshipsQ.data?.relationships ?? []).length === 0 && <p className="text-sm" style={{ color: "var(--color-muted)" }}>No relationships yet.</p>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
