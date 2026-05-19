/**
 * WORKSPACE LOCAL BUILDER TAB
 * ============================
 * Stage 5. Adds a "Builder" tab to the existing Workspace page.
 *
 * This component surfaces the full local-builder workflow:
 *   - Model role profiles (fast_code, deep_code, reviewer, rag_embedding)
 *   - Context packs (which docs are loaded into builder sessions)
 *   - Eval history (repo_summary, safe_patch_plan)
 *   - Build proposal form → approval → patch dry-run → execute
 *
 * PATCH INSTRUCTIONS:
 * ==================
 * In artifacts/localai-control-center/src/pages/Workspace.tsx:
 *
 * 1. Add this import at the top:
 *    import { LocalBuilderTab } from "./workspace/LocalBuilderTab.js";
 *    (or paste the component inline)
 *
 * 2. Add "builder" to the tab list:
 *    { id: "builder", label: "Builder", icon: Bot },   // <-- add this
 *
 * 3. Add this condition in the tab content area:
 *    {tab === "builder" && <LocalBuilderTab />}
 *
 * 4. Change the tab state type:
 *    const [tab, setTab] = useState<"projects" | "intelligence" | "files" | "rag" | "builder">("projects");
 *
 * The component below can either be placed in a new file
 * `src/pages/workspace/LocalBuilderTab.tsx` and imported, or pasted directly
 * into Workspace.tsx before the main export.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, CheckCircle, XCircle, Loader2, RefreshCw, Play,
  FileCode, Package, ChevronDown, ChevronUp, Zap, AlertTriangle,
} from "lucide-react";

// ─── API helpers ────────────────────────────────────────────────────────────

const BASE = "/api";

async function lbGet<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function lbPost<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ─── Types ───────────────────────────────────────────────────────────────────

type ModelRole = "fast_code" | "deep_code" | "reviewer" | "rag_embedding";
type ModelStatus = "not_configured" | "configured" | "unavailable";

interface ModelProfile {
  role: ModelRole;
  modelName: string | null;
  status: ModelStatus;
  updatedAt: string;
}

interface ContextPack {
  name: string;
  sizeBytes: number;
  lastModified: string;
}

interface EvalResult {
  evalName: string;
  passed: boolean;
  score: number;
  details: string;
  ranAt: string;
}

interface BuildProposal {
  id: string;
  status: string;
  phaseId: string;
  taskSummary: string;
  hardBlocked: boolean;
  hardBlockReason?: string;
  proposedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<ModelRole, string> = {
  fast_code: "Fast coding",
  deep_code: "Deep coding",
  reviewer: "Code reviewer",
  rag_embedding: "RAG embeddings",
};

const STATUS_COLOR: Record<ModelStatus, string> = {
  configured: "var(--color-success)",
  not_configured: "var(--color-warn)",
  unavailable: "var(--color-error)",
};

// ─── Profile editor ───────────────────────────────────────────────────────────

function ProfileRow({ profile, onSave }: {
  profile: ModelProfile;
  onSave: (role: ModelRole, modelName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.modelName ?? "");

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
      style={{ background: "var(--color-elevated)" }}>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium" style={{ color: "var(--color-foreground)" }}>
          {ROLE_LABELS[profile.role]}
        </div>
        {!editing ? (
          <div className="text-xs mt-0.5" style={{ color: profile.modelName ? STATUS_COLOR[profile.status] : "var(--color-muted)" }}>
            {profile.modelName ?? "not configured"}
          </div>
        ) : (
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { onSave(profile.role, draft); setEditing(false); } }}
            autoFocus
            placeholder="e.g. qwen2.5-coder:7b"
            className="text-xs w-full mt-1 px-2 py-1 rounded"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-accent)", color: "var(--color-foreground)", outline: "none" }}
          />
        )}
      </div>
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: STATUS_COLOR[profile.status] }}
      />
      {!editing ? (
        <button type="button" onClick={() => setEditing(true)}
          className="text-xs px-2 py-1 rounded"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
          Set
        </button>
      ) : (
        <div className="flex gap-1">
          <button type="button" onClick={() => { onSave(profile.role, draft); setEditing(false); }}
            className="text-xs px-2 py-1 rounded"
            style={{ background: "var(--color-accent)", color: "#fff" }}>Save</button>
          <button type="button" onClick={() => setEditing(false)}
            className="text-xs px-2 py-1 rounded"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ─── Proposal form ────────────────────────────────────────────────────────────

function ProposalForm({ onCreated }: { onCreated: () => void }) {
  const [phaseId, setPhaseId] = useState("");
  const [taskSummary, setTaskSummary] = useState("");
  const [contextPacks, setContextPacks] = useState<string[]>([]);
  const [targetFiles, setTargetFiles] = useState("");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const PACKS = ["core-architecture", "safety-and-permissions", "current-build-state"];

  async function submit() {
    setBusy(true);
    try {
      const r = await lbPost<any>("/local-builder/proposals", {
        phaseId,
        taskSummary,
        contextPacks,
        targetFiles: targetFiles.split("\n").map(s => s.trim()).filter(Boolean),
      });
      setResult(r);
      onCreated();
    } catch (err) {
      setResult({ error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs block mb-1" style={{ color: "var(--color-muted)" }}>Phase ID</label>
        <input type="text" value={phaseId} onChange={e => setPhaseId(e.target.value)}
          placeholder="e.g. phase-25"
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }} />
      </div>
      <div>
        <label className="text-xs block mb-1" style={{ color: "var(--color-muted)" }}>Task summary</label>
        <textarea value={taskSummary} onChange={e => setTaskSummary(e.target.value)}
          rows={3} placeholder="What does this build task implement?"
          className="w-full rounded-lg px-3 py-2 text-sm resize-none"
          style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }} />
      </div>
      <div>
        <label className="text-xs block mb-2" style={{ color: "var(--color-muted)" }}>Context packs</label>
        <div className="flex flex-wrap gap-2">
          {PACKS.map(pack => (
            <button key={pack} type="button"
              onClick={() => setContextPacks(prev => prev.includes(pack) ? prev.filter(p => p !== pack) : [...prev, pack])}
              className="text-xs px-2 py-1 rounded-md"
              style={{
                background: contextPacks.includes(pack) ? "color-mix(in srgb, var(--color-accent) 15%, transparent)" : "var(--color-elevated)",
                border: `1px solid ${contextPacks.includes(pack) ? "var(--color-accent)" : "var(--color-border)"}`,
                color: contextPacks.includes(pack) ? "var(--color-accent)" : "var(--color-muted)",
              }}>
              {pack}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs block mb-1" style={{ color: "var(--color-muted)" }}>Target files (one per line)</label>
        <textarea value={targetFiles} onChange={e => setTargetFiles(e.target.value)}
          rows={2} placeholder="src/lib/something.ts"
          className="w-full rounded-lg px-3 py-2 text-xs font-mono resize-none"
          style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }} />
      </div>
      <button type="button" disabled={!phaseId.trim() || !taskSummary.trim() || busy}
        onClick={submit}
        className="w-full flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg font-medium disabled:opacity-40"
        style={{ background: "var(--color-accent)", color: "#fff" }}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        Create proposal
      </button>
      {result && (
        <div className="rounded-lg p-3 text-xs"
          style={{ background: "var(--color-elevated)", color: result.error ? "var(--color-error)" : "var(--color-muted)" }}>
          {result.error
            ? `Error: ${result.error}`
            : result.proposal?.hardBlocked
            ? `⛔ Hard-blocked: ${result.proposal.hardBlockReason}`
            : `✓ Proposal created — approval ID: ${result.approval?.id?.slice(0, 12) ?? "pending"}`}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LocalBuilderTab() {
  const qc = useQueryClient();
  const [proposalFormOpen, setProposalFormOpen] = useState(false);

  const statusQ = useQuery({
    queryKey: ["lb-status"],
    queryFn: () => lbGet<{ success: boolean; status: any }>("/local-builder/status"),
    refetchInterval: 30_000,
  });

  const profilesMut = useMutation({
    mutationFn: ({ role, modelName }: { role: ModelRole; modelName: string }) =>
      lbPost("/local-builder/profiles", {
        role,
        modelName: modelName.trim() || null,
        status: modelName.trim() ? "configured" : "not_configured",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lb-status"] }),
  });

  const evalMut = useMutation({
    mutationFn: (evalName: string) => lbPost<any>(`/local-builder/evals/${evalName}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lb-status"] }),
  });

  const proposalsQ = useQuery({
    queryKey: ["lb-proposals"],
    queryFn: () => lbGet<{ success: boolean; proposals: BuildProposal[] }>("/local-builder/proposals"),
    refetchInterval: 15_000,
  });

  const status = statusQ.data?.status;
  const profiles: ModelProfile[] = status?.profiles ?? [];
  const packs: ContextPack[] = status?.contextPacks ?? [];
  const isReady = status?.ready ?? false;

  return (
    <div className="space-y-4 p-4">
      {/* Hard limits reminder */}
      <div className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
        style={{ background: "color-mix(in srgb, var(--color-info) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--color-info) 20%, transparent)" }}>
        <AlertTriangle size={13} style={{ color: "var(--color-info)", flexShrink: 0, marginTop: 1 }} />
        <span style={{ color: "var(--color-muted)" }}>
          Local-only. <strong style={{ color: "var(--color-foreground)" }}>No cloud escalation.</strong>{" "}
          <strong style={{ color: "var(--color-foreground)" }}>No self-modification.</strong>{" "}
          All file edits require tier3 approval before applying.
        </span>
      </div>

      {/* Model profiles */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
        <div className="flex items-center justify-between px-4 py-2.5"
          style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
            <Bot size={14} style={{ color: "var(--color-accent)" }} />
            Model roles
          </div>
          <div className={`text-xs px-2 py-0.5 rounded-full ${isReady ? "" : ""}`}
            style={{
              background: isReady ? "color-mix(in srgb, var(--color-success) 12%, transparent)" : "color-mix(in srgb, var(--color-warn) 12%, transparent)",
              color: isReady ? "var(--color-success)" : "var(--color-warn)",
            }}>
            {isReady ? "Ready" : "Not ready"}
          </div>
        </div>
        <div className="p-3 space-y-2">
          {profiles.map(profile => (
            <ProfileRow key={profile.role} profile={profile}
              onSave={(role, modelName) => profilesMut.mutate({ role, modelName })} />
          ))}
          {profiles.length === 0 && (
            <div className="text-xs py-2" style={{ color: "var(--color-muted)" }}>Loading profiles…</div>
          )}
        </div>
        {status?.notReadyReasons?.length > 0 && (
          <div className="px-4 pb-3 space-y-1">
            {status.notReadyReasons.map((r: string, i: number) => (
              <div key={i} className="text-xs" style={{ color: "var(--color-warn)" }}>⚠ {r}</div>
            ))}
          </div>
        )}
      </div>

      {/* Context packs */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
        <div className="px-4 py-2.5 flex items-center gap-2 text-sm font-medium"
          style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-foreground)" }}>
          <Package size={14} style={{ color: "var(--color-accent)" }} />
          Context packs ({status?.contextPacksAvailable ?? 0})
        </div>
        <div className="p-3">
          {status?.contextPackNames?.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {status.contextPackNames.map((name: string) => (
                <span key={name} className="text-xs px-2 py-1 rounded-md font-mono"
                  style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              No context packs found in docs/context-packs/. Add markdown files there to give the builder project context.
            </p>
          )}
        </div>
      </div>

      {/* Evals */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
        <div className="px-4 py-2.5 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
          <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>Local evals</span>
          <div className="flex gap-2">
            {["repo_summary", "safe_patch_plan"].map(evalName => (
              <button key={evalName} type="button"
                onClick={() => evalMut.mutate(evalName)}
                disabled={evalMut.isPending}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg disabled:opacity-40"
                style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}>
                {evalMut.isPending && evalMut.variables === evalName
                  ? <Loader2 size={10} className="animate-spin" />
                  : <Zap size={10} />}
                {evalName.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
        {evalMut.data && (
          <div className="px-4 py-3 text-xs"
            style={{ color: evalMut.data.result?.passed ? "var(--color-success)" : "var(--color-warn)" }}>
            {evalMut.data.result?.passed ? "✓" : "✗"} {evalMut.data.result?.details}
            {" — score: "}{Math.round((evalMut.data.result?.score ?? 0) * 100)}%
          </div>
        )}
        {!evalMut.data && (
          <div className="px-4 py-3 text-xs" style={{ color: "var(--color-muted)" }}>
            Run an eval to verify the builder is configured correctly.
          </div>
        )}
      </div>

      {/* Build proposals */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
        <div className="px-4 py-2.5 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
            <FileCode size={14} style={{ color: "var(--color-accent)" }} />
            Build proposals ({proposalsQ.data?.proposals?.length ?? 0})
          </div>
          <button type="button" onClick={() => setProposalFormOpen(!proposalFormOpen)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
            style={{ background: "var(--color-accent)", color: "#fff" }}>
            {proposalFormOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            New proposal
          </button>
        </div>

        {proposalFormOpen && (
          <div className="p-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <ProposalForm onCreated={() => {
              setProposalFormOpen(false);
              qc.invalidateQueries({ queryKey: ["lb-proposals"] });
            }} />
          </div>
        )}

        <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
          {(proposalsQ.data?.proposals ?? []).slice(0, 10).map((p: BuildProposal) => (
            <div key={p.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate" style={{ color: "var(--color-foreground)" }}>
                    {p.phaseId}: {p.taskSummary.slice(0, 80)}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-mono" style={{ color: "var(--color-muted)" }}>
                      {p.id.slice(0, 8)}
                    </span>
                    <span className="text-xs" style={{ color: p.hardBlocked ? "var(--color-error)" : "var(--color-muted)" }}>
                      {p.hardBlocked ? "⛔ blocked" : p.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {(proposalsQ.data?.proposals ?? []).length === 0 && (
            <div className="px-4 py-3 text-xs" style={{ color: "var(--color-muted)" }}>
              No proposals yet. Create one above to start a build task.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
