import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Save, RefreshCw, CheckCircle } from "lucide-react";
import api, { type AppSettings } from "../api.js";

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
    </div>
  );
}
