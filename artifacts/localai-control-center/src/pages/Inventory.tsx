import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Boxes, ClipboardCheck, PackagePlus, QrCode, RefreshCw, ShoppingCart } from "lucide-react";
import type { ElementType, ReactNode } from "react";
import { useMemo, useState } from "react";
import api, { apiErrorMessage, type InventoryItem, type InventoryItemType, type InventoryTruthStatus } from "../api.js";

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

const ITEM_TYPES: InventoryItemType[] = ["part", "tool", "material", "filament", "asset", "consumable", "spare", "other"];
const TRUTH: InventoryTruthStatus[] = ["confirmed", "proposed", "inferred", "stale", "missing", "unknown"];

function truthTone(status: InventoryTruthStatus): "neutral" | "ok" | "warn" | "danger" | "info" {
  if (status === "confirmed") return "ok";
  if (status === "missing") return "danger";
  if (status === "proposed" || status === "inferred") return "info";
  return "warn";
}

export default function InventoryPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("M3 screw");
  const [itemType, setItemType] = useState<InventoryItemType>("part");
  const [category, setCategory] = useState("fastener");
  const [quantity, setQuantity] = useState("24");
  const [threshold, setThreshold] = useState("6");
  const [availabilityStatus, setAvailabilityStatus] = useState<InventoryTruthStatus>("unknown");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [pipelineTitle, setPipelineTitle] = useState("Shop project pipeline");
  const [lastMessage, setLastMessage] = useState("");

  const statusQ = useQuery({ queryKey: ["inventory-status"], queryFn: () => api.inventoryApi.status() });
  const itemsQ = useQuery({ queryKey: ["inventory-items"], queryFn: () => api.inventoryApi.items({ limit: 200 }) });
  const pipelinesQ = useQuery({ queryKey: ["inventory-pipelines"], queryFn: () => api.inventoryApi.pipelines(100) });

  const items = itemsQ.data?.items ?? [];
  const selectedItem = useMemo(() => items.find(item => item.id === selectedItemId) ?? items[0], [items, selectedItemId]);

  const createItem = useMutation({
    mutationFn: () => api.inventoryApi.createItem({
      name,
      itemType,
      category,
      quantity: quantity.trim() ? Number(quantity) : null,
      reorderThreshold: threshold.trim() ? Number(threshold) : null,
      availabilityStatus,
      quantityStatus: quantity.trim() ? "confirmed" : "unknown",
      suitabilityStatus: availabilityStatus === "confirmed" ? "confirmed" : "unknown",
    }),
    onSuccess: async (result) => {
      setSelectedItemId(result.item.id);
      setLastMessage("Inventory item saved locally.");
      await Promise.all([qc.invalidateQueries({ queryKey: ["inventory-status"] }), qc.invalidateQueries({ queryKey: ["inventory-items"] })]);
    },
    onError: (error) => setLastMessage(apiErrorMessage(error)),
  });

  const createPipeline = useMutation({
    mutationFn: () => api.inventoryApi.createPipeline({
      title: pipelineTitle,
      itemRequests: selectedItem ? [{ itemId: selectedItem.id, requiredQuantity: 1 }] : [],
    }),
    onSuccess: async () => {
      setLastMessage("Pipeline proposal created.");
      await Promise.all([qc.invalidateQueries({ queryKey: ["inventory-status"] }), qc.invalidateQueries({ queryKey: ["inventory-pipelines"] })]);
    },
    onError: (error) => setLastMessage(apiErrorMessage(error)),
  });

  const reorder = useMutation({
    mutationFn: () => api.inventoryApi.reorderSuggestions(),
    onSuccess: (result) => setLastMessage(`${result.count} reorder proposal${result.count === 1 ? "" : "s"} created; no purchases executed.`),
    onError: (error) => setLastMessage(apiErrorMessage(error)),
  });

  const labelPlan = useMutation({
    mutationFn: (item: InventoryItem) => api.inventoryApi.labelPlan(item.id, "both"),
    onSuccess: () => setLastMessage("QR/NFC label data prepared locally; printing and NFC writing are disabled."),
    onError: (error) => setLastMessage(apiErrorMessage(error)),
  });

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6" style={{ color: "var(--color-foreground)" }}>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Inventory</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
            Local parts, tools, spools, assets, and project-to-reality proposals.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void Promise.all([itemsQ.refetch(), pipelinesQ.refetch(), statusQ.refetch()])}><RefreshCw size={14} />Refresh</Button>
          <Button onClick={() => reorder.mutate()} disabled={reorder.isPending}><ShoppingCart size={14} />Suggest Reorder</Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader icon={Boxes} title="Inventory Dashboard" subtitle={statusQ.data?.status.sourceOfTruth ?? "Local source of truth"} />
          <div className="mb-3 flex flex-wrap gap-2">
            <Pill tone="ok">local-first</Pill>
            <Pill tone="warn">providers not_configured</Pill>
            <Pill tone="info">{statusQ.data?.status.counts.items ?? 0} items</Pill>
            <Pill tone="info">{statusQ.data?.status.counts.pipelines ?? 0} pipelines</Pill>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {items.map(item => (
              <button key={item.id} type="button" onClick={() => setSelectedItemId(item.id)}
                className="rounded-lg border p-3 text-left"
                style={{ background: selectedItem?.id === item.id ? "color-mix(in srgb, var(--color-accent) 9%, var(--color-elevated))" : "var(--color-elevated)", borderColor: "var(--color-border)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="mt-1 text-xs" style={{ color: "var(--color-muted)" }}>{item.itemType} / {item.category}</p>
                  </div>
                  <Pill tone={truthTone(item.availabilityStatus)}>{item.availabilityStatus}</Pill>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Pill tone={truthTone(item.quantityStatus)}>qty {item.quantity ?? "unknown"} {item.unit}</Pill>
                  <Pill tone={truthTone(item.suitabilityStatus)}>fit {item.suitabilityStatus}</Pill>
                </div>
              </button>
            ))}
            {items.length === 0 && <p className="text-sm" style={{ color: "var(--color-muted)" }}>No local inventory records yet.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader icon={PackagePlus} title="Add Local Item" subtitle="Unknown data stays unknown until you confirm it." />
          <div className="grid gap-3">
            <Field label="Name"><input className="rounded-lg border px-3 py-2 text-sm" style={inputStyle} value={name} onChange={event => setName(event.target.value)} /></Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Type">
                <select className="rounded-lg border px-3 py-2 text-sm" style={inputStyle} value={itemType} onChange={event => setItemType(event.target.value as InventoryItemType)}>
                  {ITEM_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </Field>
              <Field label="Category"><input className="rounded-lg border px-3 py-2 text-sm" style={inputStyle} value={category} onChange={event => setCategory(event.target.value)} /></Field>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Quantity"><input className="rounded-lg border px-3 py-2 text-sm" style={inputStyle} value={quantity} onChange={event => setQuantity(event.target.value)} /></Field>
              <Field label="Reorder At"><input className="rounded-lg border px-3 py-2 text-sm" style={inputStyle} value={threshold} onChange={event => setThreshold(event.target.value)} /></Field>
              <Field label="Availability">
                <select className="rounded-lg border px-3 py-2 text-sm" style={inputStyle} value={availabilityStatus} onChange={event => setAvailabilityStatus(event.target.value as InventoryTruthStatus)}>
                  {TRUTH.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
              </Field>
            </div>
            <Button onClick={() => createItem.mutate()} disabled={createItem.isPending}><PackagePlus size={14} />Save Item</Button>
          </div>
        </Card>

        <Card>
          <CardHeader icon={ClipboardCheck} title="Project Pipeline Board" subtitle="Draft/proposal workflow only; no purchases or fabrication actions run here." />
          <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto]">
            <input className="rounded-lg border px-3 py-2 text-sm" style={inputStyle} value={pipelineTitle} onChange={event => setPipelineTitle(event.target.value)} />
            <Button onClick={() => createPipeline.mutate()} disabled={createPipeline.isPending}><ClipboardCheck size={14} />Create Proposal</Button>
          </div>
          <div className="grid gap-2">
            {(pipelinesQ.data?.pipelines ?? []).map(pipeline => (
              <div key={pipeline.id} className="rounded-lg border p-3" style={{ background: "var(--color-elevated)", borderColor: "var(--color-border)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{pipeline.title}</p>
                  <Pill tone={pipeline.status === "blocked" ? "danger" : "info"}>{pipeline.status}</Pill>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {pipeline.stages.slice(0, 6).map(stage => <Pill key={stage.id} tone={stage.status === "blocked" ? "danger" : "neutral"}>{stage.id}</Pill>)}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader icon={AlertTriangle} title="Provider & Action Safety" subtitle="Optional tools stay disabled until configured in an approved workflow." />
          <div className="grid gap-2">
            {(statusQ.data?.status.providers ?? []).map(provider => (
              <div key={provider.id} className="flex items-start justify-between gap-3 rounded-lg border p-3" style={{ background: "var(--color-elevated)", borderColor: "var(--color-border)" }}>
                <div>
                  <p className="text-sm font-medium">{provider.name}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--color-muted)" }}>{provider.reason}</p>
                </div>
                <Pill tone="warn">{provider.status}</Pill>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedItem && <Button onClick={() => labelPlan.mutate(selectedItem)} disabled={labelPlan.isPending}><QrCode size={14} />Label Data</Button>}
          </div>
        </Card>
      </div>

      {lastMessage && <p className="mt-4 text-sm" style={{ color: "var(--color-muted)" }}>{lastMessage}</p>}
    </div>
  );
}
