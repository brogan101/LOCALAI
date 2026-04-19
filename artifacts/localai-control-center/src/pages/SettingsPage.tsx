import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Save, RefreshCw, CheckCircle, Trash2, Plus, BarChart2, Code2, AlertCircle, DollarSign } from "lucide-react";
import api, { type AppSettings, type ContinueRule, type LifetimeUsage } from "../api.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl overflow-hidden ${className}`}
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      {children}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-widest"
      style={{ color: "var(--color-muted)", borderBottom: "1px solid var(--color-border)", background: "var(--color-elevated)" }}>
      {title}
    </div>
  );
}

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center gap-4 px-4 py-3"
      style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div className="flex-1 min-w-0">
        <div className="text-sm" style={{ color: "var(--color-foreground)" }}>{label}</div>
        {description && (
          <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{description}</div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function TextInput({ value, onChange, placeholder = "", mono = false }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`px-3 py-1.5 rounded-lg text-sm w-52 ${mono ? "font-mono" : ""}`}
      style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
    />
  );
}

function NumberInput({ value, onChange, min, max }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      className="px-3 py-1.5 rounded-lg text-sm w-32 font-mono"
      style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
    />
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors"
      style={{ background: value ? "var(--color-accent)" : "var(--color-elevated)", border: `1px solid ${value ? "var(--color-accent)" : "var(--color-border)"}` }}>
      <span className="absolute h-4 w-4 rounded-full transition-transform"
        style={{
          background: value ? "#fff" : "var(--color-muted)",
          transform: value ? "translateX(22px)" : "translateX(2px)",
        }} />
    </button>
  );
}

function SelectInput({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-1.5 rounded-lg text-sm w-40"
      style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);

  const settingsQ = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings.get(),
    staleTime: 60_000,
  });

  // Populate draft from fetched data
  useEffect(() => {
    if (settingsQ.data?.settings && !draft) {
      setDraft({ ...settingsQ.data.settings });
    }
  }, [settingsQ.data, draft]);

  const saveMut = useMutation({
    mutationFn: (data: Partial<AppSettings>) => api.settings.set(data),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["settings"] });
      setDraft({ ...result.settings });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft((prev) => prev ? { ...prev, [key]: value } : null);
  }

  const s = draft;

  if (settingsQ.isLoading || !s) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm"
        style={{ background: "var(--color-background)", color: "var(--color-muted)" }}>
        Loading settings…
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6"
      style={{ background: "var(--color-background)" }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-foreground)" }}>Settings</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            Gateway configuration, model defaults, and UI preferences
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <div className="flex items-center gap-1.5 text-sm"
              style={{ color: "var(--color-success)" }}>
              <CheckCircle size={14} /> Saved
            </div>
          )}
          <button
            onClick={() => { setDraft(null); void qc.invalidateQueries({ queryKey: ["settings"] }); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
            <RefreshCw size={13} /> Reset
          </button>
          <button
            disabled={saveMut.isPending}
            onClick={() => saveMut.mutate(s)}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: "var(--color-accent)", color: "#fff", opacity: saveMut.isPending ? 0.6 : 1 }}>
            <Save size={13} /> {saveMut.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {saveMut.isError && (
        <div className="text-sm px-2" style={{ color: "var(--color-error)" }}>
          {saveMut.error instanceof Error ? saveMut.error.message : "Save failed"}
        </div>
      )}

      {/* Models */}
      <Card>
        <SectionHeader title="Model Defaults" />
        <SettingRow label="Default chat model" description="Used when no model is specified in chat">
          <TextInput value={s.defaultChatModel} onChange={(v) => update("defaultChatModel", v)} placeholder="e.g. qwen2.5:7b" />
        </SettingRow>
        <SettingRow label="Default coding model" description="Used by Aider and code-specific chat routes">
          <TextInput value={s.defaultCodingModel} onChange={(v) => update("defaultCodingModel", v)} placeholder="e.g. qwen2.5-coder:7b" />
        </SettingRow>
        <SettingRow label="Auto-start Ollama" description="Launch Ollama when the server starts">
          <Toggle value={s.autoStartOllama} onChange={(v) => update("autoStartOllama", v)} />
        </SettingRow>
        <SettingRow label="Model download path" description="Leave empty to use Ollama default">
          <TextInput value={s.modelDownloadPath} onChange={(v) => update("modelDownloadPath", v)} placeholder="C:\Users\you\.ollama\models" mono />
        </SettingRow>
        <SettingRow label="Preferred install method" description="Default method when installing integrations">
          <SelectInput
            value={s.preferredInstallMethod}
            onChange={(v) => update("preferredInstallMethod", v)}
            options={[
              { value: "pip",    label: "pip" },
              { value: "winget", label: "winget" },
              { value: "npm",    label: "npm" },
            ]}
          />
        </SettingRow>
      </Card>

      {/* Token tracking */}
      <Card>
        <SectionHeader title="Token Tracking" />
        <SettingRow label="Show token counts" description="Display token usage in chat UI">
          <Toggle value={s.showTokenCounts} onChange={(v) => update("showTokenCounts", v)} />
        </SettingRow>
        <SettingRow label="Daily token limit" description="Warn or block when exceeded (0 = disabled)">
          <NumberInput value={s.dailyTokenLimit} onChange={(v) => update("dailyTokenLimit", v)} min={0} />
        </SettingRow>
        <SettingRow label="Warning threshold" description="Show a warning badge at this token count">
          <NumberInput value={s.tokenWarningThreshold} onChange={(v) => update("tokenWarningThreshold", v)} min={0} />
        </SettingRow>
        <SettingRow label="Chat history retention" description="Days to keep chat history files">
          <NumberInput value={s.chatHistoryDays} onChange={(v) => update("chatHistoryDays", v)} min={1} max={365} />
        </SettingRow>
      </Card>

      {/* UI */}
      <Card>
        <SectionHeader title="UI" />
        <SettingRow label="Theme" description="Color scheme">
          <SelectInput
            value={s.theme}
            onChange={(v) => update("theme", v)}
            options={[
              { value: "dark",  label: "Dark" },
              { value: "light", label: "Light" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Notifications" description="Enable desktop-level notifications">
          <Toggle value={s.notificationsEnabled} onChange={(v) => update("notificationsEnabled", v)} />
        </SettingRow>
      </Card>

      {/* Agent Permissions */}
      <Card>
        <SectionHeader title="Agent Permissions" />
        <SettingRow label="Allow agent file edits" description="Agent can apply proposed file edits via sovereignEdit">
          <Toggle value={s.allowAgentEdits ?? true} onChange={(v) => update("allowAgentEdits", v)} />
        </SettingRow>
        <SettingRow label="Allow agent command execution" description="Agent can run shell commands (opt-in, use with caution)">
          <Toggle value={s.allowAgentExec ?? false} onChange={(v) => update("allowAgentExec", v)} />
        </SettingRow>
        <SettingRow label="Allow agent self-heal" description="Agent can run scripts and auto-fix errors in a loop">
          <Toggle value={s.allowAgentSelfHeal ?? true} onChange={(v) => update("allowAgentSelfHeal", v)} />
        </SettingRow>
        <SettingRow label="Allow agent refactors" description="Agent can plan and execute multi-file refactors">
          <Toggle value={s.allowAgentRefactor ?? true} onChange={(v) => update("allowAgentRefactor", v)} />
        </SettingRow>
        <SettingRow label="Require action confirmation" description="Every Approve button requires explicit click — cannot be bypassed">
          <Toggle value={s.requireActionConfirmation ?? true} onChange={(v) => update("requireActionConfirmation", v)} />
        </SettingRow>
      </Card>

      {/* Phase 6 settings */}
      <Card>
        <SectionHeader title="Voice & Speech" />
        <SettingRow label="Speak replies (TTS)" description="Reads assistant replies aloud via Piper TTS — install with: winget install piper-tts">
          <Toggle value={(s as typeof s & { speakReplies?: boolean }).speakReplies ?? false} onChange={(v) => update("speakReplies" as keyof AppSettings, v)} />
        </SettingRow>
        <SettingRow label="TTS voice" description="Piper voice model name (must be in ~/LocalAI-Tools/tts/voices/)">
          <TextInput
            value={(s as typeof s & { ttsVoice?: string }).ttsVoice ?? "en_US-libritts_r-medium"}
            onChange={(v) => update("ttsVoice" as keyof AppSettings, v)}
            placeholder="en_US-libritts_r-medium"
            mono
          />
        </SettingRow>
      </Card>

      <Card>
        <SectionHeader title="Web & Privacy" />
        <SettingRow label="Enable web search" description="Allow /web command and chat RAG to fetch from SearxNG or DuckDuckGo">
          <Toggle value={(s as typeof s & { enableWebSearch?: boolean }).enableWebSearch ?? false} onChange={(v) => update("enableWebSearch" as keyof AppSettings, v)} />
        </SettingRow>
        <SettingRow
          label={<span className="flex items-center gap-1.5">
            <span style={{
              display: "inline-block", width: 8, height: 8, borderRadius: "50%",
              background: (s as typeof s & { strictLocalMode?: boolean }).strictLocalMode ? "var(--color-success)" : "var(--color-muted)",
            }} />
            Strict Local Mode
          </span> as unknown as string}
          description="Blocks all outbound HTTP requests to non-loopback addresses. Disables web search and update checks.">
          <Toggle value={(s as typeof s & { strictLocalMode?: boolean }).strictLocalMode ?? false} onChange={(v) => update("strictLocalMode" as keyof AppSettings, v)} />
        </SettingRow>
        <SettingRow label="Adaptive foreground profiles" description="Swap chat model when VS Code, Fusion360, etc. is in the foreground (Windows only)">
          <Toggle value={(s as typeof s & { adaptiveForegroundProfiles?: boolean }).adaptiveForegroundProfiles ?? true} onChange={(v) => update("adaptiveForegroundProfiles" as keyof AppSettings, v)} />
        </SettingRow>
      </Card>

      <UsageSection />
      <LifetimeCostCard />
      <ContinueRulesSection />
    </div>
  );
}

// ── Lifetime cost-saved counter (Step 5.6) ────────────────────────────────────

function LifetimeCostCard() {
  const lifetimeQ = useQuery({
    queryKey: ["usage-lifetime"],
    queryFn:  () => api.usage.lifetime(),
    staleTime: 60_000,
  });

  const data = lifetimeQ.data as LifetimeUsage | undefined;

  function fmt(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
    return n.toString();
  }

  return (
    <Card>
      <SectionHeader title="Lifetime Local Savings" />
      <div className="p-4">
        {lifetimeQ.isLoading && (
          <div className="text-xs" style={{ color: "var(--color-muted)" }}>
            <RefreshCw size={11} className="inline animate-spin mr-1" />Loading…
          </div>
        )}
        {data && data.success && (
          <div className="space-y-3">
            {/* Big number */}
            <div className="flex items-center gap-3 p-4 rounded-xl"
              style={{ background: "color-mix(in srgb, var(--color-success) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--color-success) 20%, transparent)" }}>
              <DollarSign size={24} style={{ color: "var(--color-success)", flexShrink: 0 }} />
              <div>
                <div className="text-2xl font-bold" style={{ color: "var(--color-success)" }}>
                  ${data.costEstimateUsd.toFixed(2)}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                  estimated savings vs. {data.pricing.model} API rates
                  {data.firstDate ? ` since ${data.firstDate}` : ""}
                </div>
              </div>
            </div>

            {/* Token breakdown */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Total tokens", value: fmt(data.totalTokens) },
                { label: "Input tokens",  value: fmt(data.totalTokensIn) },
                { label: "Output tokens", value: fmt(data.totalTokensOut) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg p-3 text-center"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                  <div className="text-xs mb-0.5" style={{ color: "var(--color-muted)" }}>{label}</div>
                  <div className="font-semibold text-sm" style={{ color: "var(--color-foreground)" }}>{value}</div>
                </div>
              ))}
            </div>

            <div className="text-xs p-2.5 rounded-lg"
              style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
              Pricing: ${data.pricing.inputPer1M}/1M input · ${data.pricing.outputPer1M}/1M output
              ({data.pricing.model})
            </div>
          </div>
        )}
        {lifetimeQ.isError && (
          <div className="text-xs" style={{ color: "var(--color-error)" }}>
            Could not load lifetime stats
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Usage Section ─────────────────────────────────────────────────────────────

function UsageSection() {
  const qc = useQueryClient();

  const todayQ = useQuery({
    queryKey: ["usage-today"],
    queryFn: () => api.usage.today(),
    staleTime: 30_000,
  });

  const historyQ = useQuery({
    queryKey: ["usage-history"],
    queryFn: () => api.usage.history(7),
    staleTime: 60_000,
  });

  const purgeMut = useMutation({
    mutationFn: () => api.usage.purge(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["usage-today"] });
      void qc.invalidateQueries({ queryKey: ["usage-history"] });
    },
  });

  type UsageDay = { date?: string; totalTokens?: number; promptTokens?: number; completionTokens?: number; requests?: number };
  type TodayData = { date?: string; totalTokens?: number; promptTokens?: number; completionTokens?: number; requests?: number; byModel?: Record<string, unknown> };

  const today = todayQ.data as TodayData | null;
  const history = (historyQ.data as { days?: UsageDay[] } | null)?.days ?? [];
  const avgDailyTokens = history.length > 0
    ? Math.round(history.reduce((sum, d) => sum + (d.totalTokens ?? 0), 0) / history.length)
    : null;

  return (
    <Card>
      <SectionHeader title="Usage & Token Tracking" />
      <div className="p-4 space-y-4">
        {/* Today summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Today tokens", value: today?.totalTokens?.toLocaleString() ?? "—" },
            { label: "Prompt", value: today?.promptTokens?.toLocaleString() ?? "—" },
            { label: "Completion", value: today?.completionTokens?.toLocaleString() ?? "—" },
            { label: "Requests", value: today?.requests?.toLocaleString() ?? "—" },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg p-3 text-center"
              style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
              <div className="text-xs mb-0.5" style={{ color: "var(--color-muted)" }}>{label}</div>
              <div className="font-semibold text-sm" style={{ color: "var(--color-foreground)" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* 7-day history bar */}
        {history.length > 0 && (
          <div>
            <div className="text-xs font-semibold mb-2 flex items-center gap-1.5"
              style={{ color: "var(--color-muted)" }}>
              <BarChart2 size={11} /> 7-day token history
            </div>
            <div className="flex items-end gap-1 h-12">
              {history.map((day, i) => {
                const max = Math.max(...history.map(d => d.totalTokens ?? 0), 1);
                const pct = ((day.totalTokens ?? 0) / max) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${day.date}: ${day.totalTokens} tokens`}>
                    <div className="w-full rounded-t"
                      style={{ height: `${Math.max(pct, 4)}%`, background: "var(--color-accent)", opacity: 0.7 + (i / history.length) * 0.3 }} />
                    <div className="text-xs" style={{ color: "var(--color-muted)", fontSize: 9 }}>
                      {day.date ? new Date(day.date).toLocaleDateString(undefined, { weekday: "narrow" }) : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 7-day average */}
        {avgDailyTokens !== null && (
          <div className="text-xs p-3 rounded-lg"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
            <span style={{ color: "var(--color-muted)" }}>7-day avg: </span>
            <span className="font-semibold" style={{ color: "var(--color-foreground)" }}>
              {avgDailyTokens.toLocaleString()} tokens/day
            </span>
          </div>
        )}

        {/* Purge */}
        <div className="flex items-center justify-between">
          <div className="text-xs" style={{ color: "var(--color-muted)" }}>
            Purge all usage history — cannot be undone
          </div>
          <button
            disabled={purgeMut.isPending}
            onClick={() => { if (confirm("Purge all usage history?")) purgeMut.mutate(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{
              background: "color-mix(in srgb, var(--color-error) 12%, transparent)",
              color: "var(--color-error)",
              border: "1px solid color-mix(in srgb, var(--color-error) 25%, transparent)",
              opacity: purgeMut.isPending ? 0.6 : 1,
            }}>
            <Trash2 size={11} /> {purgeMut.isPending ? "Purging…" : "Purge History"}
          </button>
        </div>
        {purgeMut.isSuccess && (
          <div className="text-xs" style={{ color: "var(--color-success)" }}>
            Purged {(purgeMut.data as { removed?: number })?.removed ?? 0} records
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Continue.dev Rules ────────────────────────────────────────────────────────

function ContinueRulesSection() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ filename: string; content: string } | null>(null);
  const [newFilename, setNewFilename] = useState("");
  const [newContent, setNewContent] = useState("");
  const [showNew, setShowNew] = useState(false);

  const rulesQ = useQuery({
    queryKey: ["continue-rules"],
    queryFn: () => api.continueApi.rules(),
    staleTime: 30_000,
  });

  const configQ = useQuery({
    queryKey: ["continue-config"],
    queryFn: () => api.continueApi.config(),
    staleTime: 60_000,
  });

  const saveMut = useMutation({
    mutationFn: ({ filename, content }: { filename: string; content: string }) =>
      api.continueApi.saveRule(filename, content),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["continue-rules"] });
      setEditing(null);
      setShowNew(false);
      setNewFilename("");
      setNewContent("");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (filename: string) => api.continueApi.deleteRule(filename),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["continue-rules"] }),
  });

  const rules: ContinueRule[] = rulesQ.data?.rules ?? [];
  const config = configQ.data;

  return (
    <Card>
      <SectionHeader title="Continue.dev Rules" />
      <div className="p-4 space-y-3">
        {/* Config status */}
        {config && (
          <div className="flex items-center gap-2 text-xs p-2.5 rounded-lg"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
            {config.configExists
              ? <CheckCircle size={12} style={{ color: "var(--color-success)" }} />
              : <AlertCircle size={12} style={{ color: "var(--color-warn)" }} />}
            <span style={{ color: config.configExists ? "var(--color-success)" : "var(--color-warn)" }}>
              {config.configExists ? "config.json found" : "No config.json"}
            </span>
            <span className="mx-1 opacity-50" style={{ color: "var(--color-muted)" }}>·</span>
            <span className="font-mono truncate" style={{ color: "var(--color-muted)" }}>{config.configPath}</span>
            {config.models.length > 0 && (
              <span className="ml-auto shrink-0" style={{ color: "var(--color-muted)" }}>
                {config.models.length} model{config.models.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

        {/* Rules list */}
        {rules.length === 0 && !rulesQ.isLoading && (
          <div className="text-sm text-center py-4" style={{ color: "var(--color-muted)" }}>
            No rules yet — add one below
          </div>
        )}

        {rules.map((rule) => (
          <div key={rule.filename} className="rounded-lg overflow-hidden"
            style={{ border: "1px solid var(--color-border)" }}>
            {editing?.filename === rule.filename ? (
              <div className="p-3 space-y-2">
                <textarea
                  value={editing.content}
                  onChange={(e) => setEditing(ed => ed ? { ...ed, content: e.target.value } : null)}
                  rows={6}
                  className="w-full px-3 py-2 rounded-lg text-xs resize-none font-mono"
                  style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
                />
                <div className="flex gap-2">
                  <button
                    disabled={saveMut.isPending}
                    onClick={() => saveMut.mutate({ filename: editing.filename, content: editing.content })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: "var(--color-accent)", color: "#fff", opacity: saveMut.isPending ? 0.6 : 1 }}>
                    <Save size={10} /> {saveMut.isPending ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => setEditing(null)}
                    className="px-3 py-1.5 rounded-lg text-xs"
                    style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-3 py-2">
                <Code2 size={12} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono" style={{ color: "var(--color-foreground)" }}>{rule.filename}</div>
                  <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                    {(rule.sizeBytes / 1024).toFixed(1)} KB · {new Date(rule.modifiedAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setEditing({ filename: rule.filename, content: rule.content })}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
                    Edit
                  </button>
                  <button
                    disabled={deleteMut.isPending && deleteMut.variables === rule.filename}
                    onClick={() => { if (confirm(`Delete rule ${rule.filename}?`)) deleteMut.mutate(rule.filename); }}
                    className="p-1 rounded"
                    style={{ background: "color-mix(in srgb, var(--color-error) 10%, transparent)", color: "var(--color-error)" }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* New rule */}
        {showNew ? (
          <div className="rounded-lg p-3 space-y-2"
            style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Filename (e.g. my-rule.md)</div>
              <input
                value={newFilename}
                onChange={(e) => setNewFilename(e.target.value)}
                placeholder="my-rule.md"
                className="w-full px-3 py-1.5 rounded-lg text-xs font-mono"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
              />
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Content</div>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 rounded-lg text-xs font-mono resize-none"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", outline: "none" }}
              />
            </div>
            <div className="flex gap-2">
              <button
                disabled={!newFilename || !newContent || saveMut.isPending}
                onClick={() => saveMut.mutate({ filename: newFilename, content: newContent })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: "var(--color-accent)", color: "#fff", opacity: (!newFilename || !newContent || saveMut.isPending) ? 0.5 : 1 }}>
                <Save size={10} /> {saveMut.isPending ? "Saving…" : "Save rule"}
              </button>
              <button onClick={() => { setShowNew(false); setNewFilename(""); setNewContent(""); }}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ background: "var(--color-surface)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: "var(--color-elevated)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
            <Plus size={11} /> Add rule
          </button>
        )}
      </div>
    </Card>
  );
}
