/**
 * Evidence Vault — Phase 08B UI
 * =============================
 * Reuses existing LOCALAI card/table/badge/status-pill patterns from Workspace.tsx,
 * Operations.tsx, and Integrations.tsx. No new design system. No fake states.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Archive, Search, RefreshCw, Plus, Trash2, AlertTriangle,
  CheckCircle, XCircle, Clock, Shield, FileText, Car, Home,
  Wrench, Wifi, Receipt, BookOpen, Loader2, ChevronDown, ChevronRight,
  Package,
} from "lucide-react";
import api, {
  apiErrorMessage,
  evidenceVaultApi,
  type EvidenceRecord,
  type EvidenceCategory,
  type PrivacyClassification,
} from "../api.js";

// ── Helpers ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<EvidenceCategory, string> = {
  manual:     "Manual",
  receipt:    "Receipt",
  warranty:   "Warranty",
  vehicle:    "Vehicle",
  home:       "Home",
  shop:       "Shop",
  network:    "Network",
  tool:       "Tool",
  "3d_printer": "3D Printer",
  software:   "Software",
  tax:        "Tax",
  project:    "Project",
  other:      "Other",
};

const CATEGORY_ICONS: Record<EvidenceCategory, React.ElementType> = {
  manual:     BookOpen,
  receipt:    Receipt,
  warranty:   Shield,
  vehicle:    Car,
  home:       Home,
  shop:       Wrench,
  network:    Wifi,
  tool:       Package,
  "3d_printer": Package,
  software:   FileText,
  tax:        FileText,
  project:    Archive,
  other:      Archive,
};

const PRIVACY_COLORS: Record<PrivacyClassification, string> = {
  public:    "var(--color-success)",
  normal:    "var(--color-muted)",
  private:   "var(--color-warn)",
  sensitive: "var(--color-warn)",
  secret:    "var(--color-error)",
};

function statusColor(status?: string): string {
  if (status === "indexed")             return "var(--color-success)";
  if (status === "not_configured")      return "var(--color-warn)";
  if (status === "pending")             return "var(--color-muted)";
  if (status === "failed" || status === "deleted") return "var(--color-error)";
  if (status === "stale")               return "var(--color-warn)";
  return "var(--color-muted)";
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl overflow-hidden ${className}`}
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium"
      style={{
        background: `color-mix(in srgb, ${statusColor(status)} 15%, transparent)`,
        color: statusColor(status),
      }}>
      {status}
    </span>
  );
}

function PrivacyBadge({ level }: { level: PrivacyClassification }) {
  return (
    <span className="flex items-center gap-1 text-xs"
      style={{ color: PRIVACY_COLORS[level] }}>
      <Shield size={10} />
      {level}
    </span>
  );
}

// ── Overview card ──────────────────────────────────────────────────────────

function VaultOverview() {
  const statusQ = useQuery({
    queryKey: ["evidence-status"],
    queryFn: () => evidenceVaultApi.status(),
    staleTime: 15_000,
  });

  const s = statusQ.data;

  return (
    <Card>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <Archive size={14} style={{ color: "var(--color-accent)" }} />
        <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>Evidence Vault Overview</span>
        <button onClick={() => void statusQ.refetch()} className="ml-auto p-1 rounded"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
          <RefreshCw size={11} />
        </button>
      </div>
      {statusQ.isLoading && (
        <div className="flex items-center gap-2 p-6 text-sm" style={{ color: "var(--color-muted)" }}>
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      )}
      {s && (
        <div className="p-4 grid md:grid-cols-4 gap-4">
          <div className="rounded-lg p-3 text-center"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
            <div className="text-2xl font-bold" style={{ color: "var(--color-foreground)" }}>{s.totalRecords}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>Total Records</div>
          </div>
          <div className="rounded-lg p-3 text-center"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
            <div className="text-2xl font-bold" style={{ color: "var(--color-warn)" }}>{s.staleCount}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>Stale / Deleted</div>
          </div>
          <div className="rounded-lg p-3 text-center"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
            <div className="text-2xl font-bold" style={{ color: "var(--color-info)" }}>{s.duplicateCount}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>Potential Duplicates</div>
          </div>
          <div className="rounded-lg p-3 text-center"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
            <div className="text-2xl font-bold"
              style={{ color: s.paperlessProvider.enabled ? "var(--color-success)" : "var(--color-muted)" }}>
              {s.paperlessProvider.enabled ? "On" : "Off"}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>Paperless</div>
          </div>
        </div>
      )}
      {s && (
        <div className="px-4 pb-4">
          <div className="text-xs font-semibold uppercase tracking-widest mb-2"
            style={{ color: "var(--color-muted)" }}>
            Records by Category
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(s.recordsByCategory).map(([cat, count]) => {
              const Icon = CATEGORY_ICONS[cat as EvidenceCategory] ?? Archive;
              return (
                <span key={cat}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                  style={{ background: "var(--color-elevated)", color: "var(--color-foreground)" }}>
                  <Icon size={11} style={{ color: "var(--color-accent)" }} />
                  {CATEGORY_LABELS[cat as EvidenceCategory] ?? cat}
                  <span className="ml-0.5 font-bold">{count}</span>
                </span>
              );
            })}
            {Object.keys(s.recordsByCategory).length === 0 && (
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>No records yet</span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Paperless provider status card ────────────────────────────────────────

function PaperlessStatusCard() {
  const statusQ = useQuery({
    queryKey: ["evidence-paperless-status"],
    queryFn: () => evidenceVaultApi.getPaperlessStatus(),
    staleTime: 30_000,
  });

  const p = statusQ.data?.paperless;

  return (
    <Card>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <Archive size={14} style={{ color: "var(--color-muted)" }} />
        <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>Paperless-ngx Provider</span>
        <span className="ml-auto text-xs px-2 py-0.5 rounded"
          style={{
            background: p?.enabled ? "color-mix(in srgb, var(--color-success) 15%, transparent)" : "var(--color-elevated)",
            color: p?.enabled ? "var(--color-success)" : "var(--color-muted)",
          }}>
          {p?.enabled ? "Enabled" : "not_configured"}
        </span>
      </div>
      <div className="p-4 space-y-2 text-xs" style={{ color: "var(--color-muted)" }}>
        {statusQ.isLoading && <span>Loading…</span>}
        {p && (
          <>
            <div className="flex items-center gap-2">
              <span className="font-medium" style={{ color: "var(--color-foreground)" }}>Auth:</span>
              <StatusPill status={p.authStatus} />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium" style={{ color: "var(--color-foreground)" }}>Sync Mode:</span>
              <span>{p.syncMode}</span>
            </div>
            {p.lastSyncAt && (
              <div><span className="font-medium" style={{ color: "var(--color-foreground)" }}>Last sync:</span>{" "}{new Date(p.lastSyncAt).toLocaleString()}</div>
            )}
            <div className="rounded-lg p-2 text-xs mt-2"
              style={{ background: "color-mix(in srgb, var(--color-warn) 8%, transparent)", color: "var(--color-muted)" }}>
              {p.notConfiguredReason}
            </div>
            <div className="text-xs" style={{ color: "var(--color-success)" }}>
              Local-first: {String(p.localFirst)} · Data leaves machine: {String(p.dataLeavesMachine)}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

// ── Reminders card ─────────────────────────────────────────────────────────

function RemindersCard() {
  const remindersQ = useQuery({
    queryKey: ["evidence-reminders"],
    queryFn: () => evidenceVaultApi.getReminders(90),
    staleTime: 60_000,
  });

  const reminders = remindersQ.data?.reminders ?? [];

  return (
    <Card>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <Clock size={14} style={{ color: "var(--color-warn)" }} />
        <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>Upcoming Reminders</span>
        <span className="ml-1 text-xs" style={{ color: "var(--color-muted)" }}>(proposals only — no auto-schedule)</span>
        <span className="ml-auto text-xs px-2 py-0.5 rounded"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
          calendar: not_configured
        </span>
      </div>
      {remindersQ.isLoading && (
        <div className="p-4 text-xs flex items-center gap-2" style={{ color: "var(--color-muted)" }}>
          <Loader2 size={12} className="animate-spin" /> Loading…
        </div>
      )}
      {!remindersQ.isLoading && reminders.length === 0 && (
        <div className="p-4 text-xs text-center" style={{ color: "var(--color-muted)" }}>
          No upcoming reminders in next 90 days.
        </div>
      )}
      {reminders.map((r) => (
        <div key={`${r.evidenceId}-${r.reminderType}`}
          className="flex items-center gap-3 px-4 py-3 text-xs"
          style={{ borderBottom: "1px solid var(--color-border)" }}>
          <Clock size={12} style={{ color: r.daysUntilDue < 30 ? "var(--color-error)" : "var(--color-warn)", flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate" style={{ color: "var(--color-foreground)" }}>{r.title}</div>
            <div style={{ color: "var(--color-muted)" }}>{r.reminderType} · due {new Date(r.dueDate).toLocaleDateString()}</div>
          </div>
          <div className="shrink-0 text-right">
            <div style={{ color: r.daysUntilDue < 30 ? "var(--color-error)" : "var(--color-warn)" }}>
              {r.daysUntilDue}d
            </div>
            <div style={{ color: "var(--color-muted)" }}>proposal</div>
          </div>
        </div>
      ))}
    </Card>
  );
}

// ── Record row ─────────────────────────────────────────────────────────────

function RecordRow({
  record,
  onDelete,
}: {
  record: EvidenceRecord;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = CATEGORY_ICONS[record.category] ?? Archive;

  return (
    <div style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div
        className="flex items-center gap-3 px-4 py-3 text-xs cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}>
        <Icon size={13} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm" style={{ color: "var(--color-foreground)" }}>{record.title}</span>
            <span className="px-1.5 py-0.5 rounded text-xs"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
              {CATEGORY_LABELS[record.category] ?? record.category}
            </span>
            <StatusPill status={record.ingestionStatus} />
            <PrivacyBadge level={record.privacyClassification} />
          </div>
          <div className="mt-0.5 flex items-center gap-3 flex-wrap" style={{ color: "var(--color-muted)" }}>
            {record.vendor && <span>Vendor: {record.vendor}</span>}
            {record.originalFilename && <span className="font-mono">{record.originalFilename}</span>}
            {record.warrantyExpires && <span>Warranty: {record.warrantyExpires}</span>}
            <span>Updated {new Date(record.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {record.tags.length > 0 && (
            <span className="hidden md:flex items-center gap-1">
              {record.tags.slice(0, 2).map(tag => (
                <span key={tag} className="px-1.5 py-0.5 rounded text-xs"
                  style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
                  {tag}
                </span>
              ))}
            </span>
          )}
          {!record.deletedAt && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(record.id); }}
              className="p-1.5 rounded"
              title="Mark deleted"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
              <Trash2 size={11} />
            </button>
          )}
          <span style={{ color: "var(--color-muted)" }}>
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-3 text-xs space-y-1" style={{ color: "var(--color-muted)", borderTop: "1px solid var(--color-border)", paddingTop: 8 }}>
          <div><span className="font-medium" style={{ color: "var(--color-foreground)" }}>ID:</span> <span className="font-mono">{record.id}</span></div>
          {record.sourceId && <div><span className="font-medium" style={{ color: "var(--color-foreground)" }}>RAG Source:</span> <span className="font-mono">{record.sourceId}</span></div>}
          {record.collectionId && <div><span className="font-medium" style={{ color: "var(--color-foreground)" }}>Collection:</span> <span className="font-mono">{record.collectionId}</span></div>}
          {record.fileHash && <div><span className="font-medium" style={{ color: "var(--color-foreground)" }}>Hash:</span> <span className="font-mono">{record.fileHash.slice(0, 16)}…</span></div>}
          {record.parserUsed && <div><span className="font-medium" style={{ color: "var(--color-foreground)" }}>Parser:</span> {record.parserUsed}</div>}
          {record.purchaseDate && <div><span className="font-medium" style={{ color: "var(--color-foreground)" }}>Purchase:</span> {record.purchaseDate}</div>}
          {record.receiptDate && <div><span className="font-medium" style={{ color: "var(--color-foreground)" }}>Receipt:</span> {record.receiptDate}</div>}
          {record.registrationDate && <div><span className="font-medium" style={{ color: "var(--color-foreground)" }}>Registration:</span> {record.registrationDate}</div>}
          {record.projectAssociation && <div><span className="font-medium" style={{ color: "var(--color-foreground)" }}>Project:</span> {record.projectAssociation}</div>}
          {record.manufacturer && <div><span className="font-medium" style={{ color: "var(--color-foreground)" }}>Manufacturer:</span> {record.manufacturer}</div>}
          {record.degradedReason && (
            <div className="flex items-center gap-1" style={{ color: "var(--color-warn)" }}>
              <AlertTriangle size={10} /> {record.degradedReason}
            </div>
          )}
          {record.stale && (
            <div className="flex items-center gap-1" style={{ color: "var(--color-error)" }}>
              <XCircle size={10} /> Stale / Deleted
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add record form ────────────────────────────────────────────────────────

function AddRecordForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<EvidenceCategory>("manual");
  const [vendor, setVendor] = useState("");
  const [originalFilename, setOriginalFilename] = useState("");
  const [privacyClassification, setPrivacy] = useState<PrivacyClassification>("normal");
  const [warrantyExpires, setWarrantyExpires] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => evidenceVaultApi.createRecord({
      title: title.trim(),
      category,
      vendor: vendor.trim() || undefined,
      originalFilename: originalFilename.trim() || undefined,
      privacyClassification,
      warrantyExpires: warrantyExpires || undefined,
    }),
    onSuccess: () => {
      setTitle(""); setVendor(""); setOriginalFilename(""); setWarrantyExpires("");
      setOpen(false);
      setMessage(null);
      onCreated();
    },
    onError: (e) => setMessage(apiErrorMessage(e, "Failed to create record")),
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
        style={{ background: "var(--color-accent)", color: "#fff" }}>
        <Plus size={13} /> Add Record
      </button>
    );
  }

  return (
    <div className="rounded-xl p-4 space-y-3"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>New Evidence Record</span>
        <button onClick={() => setOpen(false)} className="ml-auto text-xs px-2 py-0.5 rounded"
          style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
          Cancel
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Title *</div>
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Bosch Dishwasher Manual"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }} />
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Category</div>
          <select value={category} onChange={e => setCategory(e.target.value as EvidenceCategory)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}>
            {(Object.keys(CATEGORY_LABELS) as EvidenceCategory[]).map(cat => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Vendor / Brand</div>
          <input value={vendor} onChange={e => setVendor(e.target.value)}
            placeholder="e.g. Bosch"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }} />
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Filename (optional)</div>
          <input value={originalFilename} onChange={e => setOriginalFilename(e.target.value)}
            placeholder="e.g. bosch-manual.pdf"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }} />
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Warranty Expires</div>
          <input type="date" value={warrantyExpires} onChange={e => setWarrantyExpires(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }} />
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Privacy</div>
          <select value={privacyClassification} onChange={e => setPrivacy(e.target.value as PrivacyClassification)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}>
            {(["public", "normal", "private", "sensitive", "secret"] as PrivacyClassification[]).map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>
      {message && <div className="text-xs" style={{ color: "var(--color-error)" }}>{message}</div>}
      <button
        disabled={!title.trim() || mut.isPending}
        onClick={() => mut.mutate()}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
        style={{ background: "var(--color-accent)", color: "#fff" }}>
        {mut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
        {mut.isPending ? "Creating…" : "Create Record"}
      </button>
    </div>
  );
}

// ── Search panel ───────────────────────────────────────────────────────────

function SearchPanel() {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<EvidenceCategory | "">("");
  const [results, setResults] = useState<{ chunks: any[]; ragPath: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const r = await evidenceVaultApi.search(query.trim(), categoryFilter || undefined, 5);
      setResults(r);
    } catch (e) {
      setError(apiErrorMessage(e, "Search failed"));
    } finally {
      setSearching(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <Search size={14} style={{ color: "var(--color-accent)" }} />
        <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>Ask Evidence Vault</span>
        <span className="ml-1 text-xs" style={{ color: "var(--color-muted)" }}>(local RAG · no cloud)</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && void runSearch()}
            placeholder="e.g. dishwasher warranty, GPU receipt 2024, CNC spindle speed…"
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
          />
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as EvidenceCategory | "")}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", maxWidth: 130 }}>
            <option value="">All categories</option>
            {(Object.keys(CATEGORY_LABELS) as EvidenceCategory[]).map(cat => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
            ))}
          </select>
          <button
            disabled={!query.trim() || searching}
            onClick={() => void runSearch()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
            style={{ background: "var(--color-accent)", color: "#fff" }}>
            {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          </button>
        </div>

        {error && <div className="text-xs" style={{ color: "var(--color-error)" }}>{error}</div>}

        {results !== null && results.chunks.length === 0 && (
          <div className="text-sm text-center py-4" style={{ color: "var(--color-muted)" }}>No matches found</div>
        )}

        {results !== null && results.chunks.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>
              {results.chunks.length} result(s) · via {results.ragPath}
            </div>
            {results.chunks.map((chunk: any, i: number) => (
              <div key={chunk.id ?? i} className="rounded-lg p-3 text-xs"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono truncate flex-1" style={{ color: "var(--color-foreground)" }}>{chunk.source}</span>
                  <span style={{ color: "var(--color-info)" }}>score: {typeof chunk.score === "number" ? chunk.score.toFixed(3) : "—"}</span>
                </div>
                <div style={{ color: "var(--color-muted)" }}>
                  page {String(chunk.citation?.page ?? "unavailable")} · section {String(chunk.citation?.section ?? "unavailable")}
                </div>
                <pre className="mt-1.5 whitespace-pre-wrap text-xs p-2 rounded max-h-24 overflow-auto"
                  style={{ background: "var(--color-surface)", color: "var(--color-foreground)", fontFamily: "monospace" }}>
                  {chunk.text}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Records list ──────────────────────────────────────────────────────────

function RecordsList() {
  const qc = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState<EvidenceCategory | "">("");
  const [showDeleted, setShowDeleted] = useState(false);

  const recordsQ = useQuery({
    queryKey: ["evidence-records", categoryFilter, showDeleted],
    queryFn: () => evidenceVaultApi.listRecords({
      category: categoryFilter || undefined,
      includeDeleted: showDeleted,
    }),
    staleTime: 5_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => evidenceVaultApi.deleteRecord(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["evidence-records"] }),
  });

  const records = recordsQ.data?.records ?? [];

  return (
    <Card>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <Archive size={14} style={{ color: "var(--color-accent)" }} />
        <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>Evidence Records</span>
        <div className="ml-auto flex items-center gap-2">
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as EvidenceCategory | "")}
            className="px-2 py-1 rounded text-xs outline-none"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}>
            <option value="">All categories</option>
            {(Object.keys(CATEGORY_LABELS) as EvidenceCategory[]).map(cat => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--color-muted)" }}>
            <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)}
              style={{ accentColor: "var(--color-accent)" }} />
            Show deleted
          </label>
          <button onClick={() => void qc.invalidateQueries({ queryKey: ["evidence-records"] })}
            className="p-1 rounded" style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      {recordsQ.isLoading && (
        <div className="flex items-center gap-2 p-6 text-sm" style={{ color: "var(--color-muted)" }}>
          <Loader2 size={14} className="animate-spin" /> Loading records…
        </div>
      )}

      {!recordsQ.isLoading && records.length === 0 && (
        <div className="p-8 text-sm text-center" style={{ color: "var(--color-muted)" }}>
          No evidence records yet. Add a manual, receipt, warranty, or vehicle document above.
        </div>
      )}

      {records.map(record => (
        <RecordRow
          key={record.id}
          record={record}
          onDelete={(id) => {
            if (confirm("Mark this record as deleted?")) deleteMut.mutate(id);
          }}
        />
      ))}
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function EvidenceVaultPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"records" | "search" | "reminders" | "providers">("records");

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6"
      style={{ background: "var(--color-background)" }}>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-foreground)" }}>Evidence Vault</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            Local-first document registry — manuals, receipts, warranties, vehicle records, and more.
          </p>
        </div>
      </div>

      {/* Overview */}
      <VaultOverview />

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg p-1"
        style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", width: "fit-content" }}>
        {([
          { id: "records",   label: "Records",   icon: Archive },
          { id: "search",    label: "Search",    icon: Search },
          { id: "reminders", label: "Reminders", icon: Clock },
          { id: "providers", label: "Providers", icon: Shield },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors"
            style={{
              background: tab === id ? "var(--color-surface)" : "transparent",
              color: tab === id ? "var(--color-foreground)" : "var(--color-muted)",
              fontWeight: tab === id ? 500 : 400,
            }}>
            <Icon size={13} style={{ color: tab === id ? "var(--color-accent)" : "inherit" }} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Records */}
      {tab === "records" && (
        <div className="space-y-4">
          <AddRecordForm onCreated={() => void qc.invalidateQueries({ queryKey: ["evidence-records"] })} />
          <RecordsList />
        </div>
      )}

      {/* Tab: Search */}
      {tab === "search" && <SearchPanel />}

      {/* Tab: Reminders */}
      {tab === "reminders" && <RemindersCard />}

      {/* Tab: Providers */}
      {tab === "providers" && (
        <div className="space-y-4">
          <PaperlessStatusCard />
          <Card>
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <CheckCircle size={14} style={{ color: "var(--color-success)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>Local RAG Provider</span>
              <span className="ml-auto text-xs px-2 py-0.5 rounded"
                style={{ background: "color-mix(in srgb, var(--color-success) 15%, transparent)", color: "var(--color-success)" }}>
                available
              </span>
            </div>
            <div className="p-4 text-xs" style={{ color: "var(--color-muted)" }}>
              <div>Evidence search uses the existing Phase 08A RAG engine (hnswlib + SQLite).</div>
              <div className="mt-1">Local-first · No cloud · No API key required · Default parser: builtin</div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
