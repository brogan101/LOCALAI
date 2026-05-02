import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { Route, Switch, Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  MessageSquare,
  Cpu,
  Folder,
  Zap,
  Settings,
  Activity,
  ScrollText,
  Wrench,
  Radio,
  Plug,
  Wifi,
  WifiOff,
  AlertTriangle,
  ChevronRight,
  Server,
  CloudOff,
  Archive,
  Mic,
  BriefcaseBusiness,
  ShieldAlert,
  Network,
  Boxes,
  PackageSearch,
  Car,
} from "lucide-react";
import api from "./api.js";

// ── Pages ─────────────────────────────────────────────────────────────────────
const Dashboard = lazy(() => import("./pages/Dashboard.js"));
const ChatPage = lazy(() => import("./pages/Chat.js"));
const ModelsPage = lazy(() => import("./pages/Models.js"));
const DiagnosticsPage = lazy(() => import("./pages/Diagnostics.js"));
const IntegrationsPage = lazy(() => import("./pages/Integrations.js"));
const RemotePage = lazy(() => import("./pages/Remote.js"));
const CleanupPage = lazy(() => import("./pages/Cleanup.js"));
const LogsPage = lazy(() => import("./pages/Logs.js"));
const WorkspacePage = lazy(() => import("./pages/Workspace.js"));
const StudiosPage = lazy(() => import("./pages/Studios.js"));
const SettingsPage = lazy(() => import("./pages/SettingsPage.js"));
const OperationsPage = lazy(() => import("./pages/Operations.js"));
const EvidenceVaultPage = lazy(() => import("./pages/EvidenceVault.js"));
const VoicePage = lazy(() => import("./pages/Voice.js"));
const BusinessPage = lazy(() => import("./pages/Business.js"));
const ITSupportPage = lazy(() => import("./pages/ITSupport.js"));
const HomeLabPage = lazy(() => import("./pages/HomeLab.js"));
const DigitalTwinPage = lazy(() => import("./pages/DigitalTwin.js"));
const InventoryPage = lazy(() => import("./pages/Inventory.js"));
const AutomotivePage = lazy(() => import("./pages/Automotive.js"));

function Placeholder({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
      <div className="w-12 h-12 rounded-full flex items-center justify-center"
        style={{ background: "color-mix(in srgb, var(--color-accent) 15%, transparent)" }}>
        <Zap size={20} style={{ color: "var(--color-accent)" }} />
      </div>
      <h2 className="text-lg font-semibold" style={{ color: "var(--color-foreground)" }}>{title}</h2>
      <p className="text-sm max-w-sm" style={{ color: "var(--color-muted)" }}>
        {description ?? "This route does not exist."}
      </p>
    </div>
  );
}

function PageLoading() {
  return (
    <div className="flex h-full min-h-screen items-center justify-center px-8 text-sm"
      style={{ color: "var(--color-muted)" }}>
      Loading...
    </div>
  );
}

// ── Nav config ────────────────────────────────────────────────────────────────

// Grouped nav — section labels organize the 20 pages into readable clusters.
// Routes are preserved exactly; only the sidebar rendering is changed.

type NavItem = { path: string; label: string; icon: React.ElementType };

const NAV_GROUPS: Array<{ label?: string; items: NavItem[] }> = [
  {
    items: [
      { path: "/",    label: "Dashboard", icon: LayoutDashboard },
      { path: "/chat", label: "Chat",     icon: MessageSquare },
    ],
  },
  {
    label: "Models / Providers",
    items: [
      { path: "/models",    label: "Models",    icon: Cpu },
      { path: "/workspace", label: "Workspace", icon: Folder },
    ],
  },
  {
    label: "Studios",
    items: [
      { path: "/studios", label: "Studios", icon: Zap },
    ],
  },
  {
    label: "Automation / Tools",
    items: [
      { path: "/integrations", label: "Integrations", icon: Plug },
      { path: "/voice",        label: "Voice",        icon: Mic },
      { path: "/remote",       label: "Remote",       icon: Radio },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { path: "/evidence",    label: "Evidence",     icon: Archive },
      { path: "/inventory",   label: "Inventory",    icon: PackageSearch },
      { path: "/digital-twin", label: "Digital Twin", icon: Boxes },
      { path: "/automotive",  label: "Automotive",   icon: Car },
    ],
  },
  {
    label: "HomeLab / Network",
    items: [
      { path: "/homelab", label: "HomeLab", icon: Network },
    ],
  },
  {
    label: "Business / IT",
    items: [
      { path: "/business",   label: "Business",   icon: BriefcaseBusiness },
      { path: "/it-support", label: "IT Support", icon: ShieldAlert },
    ],
  },
  {
    label: "Operations",
    items: [
      { path: "/operations",  label: "Operations",  icon: Server },
      { path: "/diagnostics", label: "Diagnostics", icon: Activity },
      { path: "/logs",        label: "Logs",        icon: ScrollText },
      { path: "/cleanup",     label: "Cleanup",     icon: Wrench },
    ],
  },
  {
    items: [
      { path: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

// Flat list used only for active-path matching in the Sidebar
const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap(g => g.items);

// ── Status bar (top-right corner of sidebar) ──────────────────────────────────

function SidebarStatus() {
  const { data } = useQuery({
    queryKey: ["heartbeat"],
    queryFn: () => api.system.heartbeat(),
    refetchInterval: 15_000,
    retry: false,
  });

  const state = data?.state ?? "offline";
  const dot =
    state === "local"    ? "var(--color-success)" :
    state === "online"   ? "var(--color-info)"    :
    state === "degraded" ? "var(--color-warn)"    :
                           "var(--color-error)";

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
      style={{ background: "var(--color-elevated)", color: "var(--color-muted)" }}>
      {state === "offline"
        ? <WifiOff size={12} style={{ color: dot }} />
        : state === "degraded"
          ? <AlertTriangle size={12} style={{ color: dot }} />
          : <Wifi size={12} style={{ color: dot }} />
      }
      <span style={{ color: dot }} className="font-medium capitalize">{state}</span>
      {data?.latencyMs !== undefined && (
        <span className="ml-auto opacity-60">{data.latencyMs}ms</span>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="flex flex-col shrink-0 select-none"
      style={{
        width: 220,
        background: "var(--color-surface)",
        borderRight: "1px solid var(--color-border)",
        height: "100vh",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 40,
      }}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5"
        style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm"
          style={{ background: "var(--color-accent)", color: "#fff" }}>L</div>
        <div>
          <div className="font-bold text-sm tracking-wide" style={{ color: "var(--color-foreground)" }}>
            LOCAL<span style={{ color: "var(--color-accent)" }}>AI</span>
          </div>
          <div className="text-xs" style={{ color: "var(--color-muted)" }}>Control Center</div>
        </div>
      </div>

      {/* Nav links — grouped with section labels */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-1" : ""}>
            {group.label && (
              <div
                className="px-3 pt-2 pb-0.5 text-xs font-semibold uppercase tracking-wider select-none"
                style={{ color: "var(--color-muted)", opacity: 0.55, letterSpacing: "0.07em" }}
              >
                {group.label}
              </div>
            )}
            {group.items.map(({ path, label, icon: Icon }) => {
              const active = path === "/" ? location === "/" : location.startsWith(path);
              return (
                <Link
                  key={path}
                  href={path}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg mb-0.5 text-sm transition-colors cursor-pointer"
                  style={{
                    display: "flex",
                    background: active
                      ? "color-mix(in srgb, var(--color-accent) 18%, transparent)"
                      : "transparent",
                    color: active ? "var(--color-foreground)" : "var(--color-muted)",
                    fontWeight: active ? 500 : 400,
                    textDecoration: "none",
                  }}
                >
                  <Icon
                    size={15}
                    style={{ color: active ? "var(--color-accent)" : "inherit", flexShrink: 0 }}
                  />
                  <span style={{ flex: 1 }}>{label}</span>
                  {active && (
                    <ChevronRight size={12} style={{ color: "var(--color-accent)" }} />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom status */}
      <div className="p-3" style={{ borderTop: "1px solid var(--color-border)" }}>
        <SidebarStatus />
      </div>
    </aside>
  );
}

// ── Theme watcher ─────────────────────────────────────────────────────────────
// Reads the saved theme setting and applies data-theme="dark"|"light" to <html>.
// Runs once on mount and whenever settings change.

function ThemeWatcher() {
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings.get(),
    staleTime: 60_000,
  });

  useEffect(() => {
    const settings = data?.settings;
    const preset = settings?.themePreset ?? settings?.theme ?? "dark";
    document.documentElement.setAttribute("data-theme", preset);

    // Apply per-variable overrides on top of preset
    const overrides = settings?.themeOverrides ?? {};
    for (const [prop, val] of Object.entries(overrides)) {
      document.documentElement.style.setProperty(prop, val);
    }
    // Clear overrides that are no longer present (reset to CSS)
    const allVars = ["--color-background","--color-surface","--color-elevated","--color-border",
      "--color-foreground","--color-muted","--color-accent","--color-accent-dim",
      "--color-success","--color-warn","--color-error","--color-info"];
    for (const v of allVars) {
      if (!overrides[v]) document.documentElement.style.removeProperty(v);
    }
  }, [data?.settings?.themePreset, data?.settings?.theme, data?.settings?.themeOverrides]);

  return null;
}

// ── Query client ──────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
});

// ── App shell ─────────────────────────────────────────────────────────────────

// ── Offline mode banner (8.7) ─────────────────────────────────────────────────

function OfflineBanner() {
  const { data } = useQuery({
    queryKey: ["heartbeat"],
    queryFn: () => api.system.heartbeat(),
    refetchInterval: 15_000,
    retry: false,
  });

  const state = data?.state ?? "online";
  if (state !== "offline") return null;

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium"
      style={{
        background: "color-mix(in srgb, var(--color-error) 12%, transparent)",
        borderBottom: "1px solid color-mix(in srgb, var(--color-error) 25%, transparent)",
        color: "var(--color-error)",
      }}>
      <CloudOff size={14} />
      <span>Offline mode — catalog sync, web search and update checks disabled</span>
    </div>
  );
}

function AppShell() {
  return (
    <div className="flex" style={{ minHeight: "100vh" }}>
      <ThemeWatcher />
      <Sidebar />

      <main className="flex-1 flex flex-col min-h-screen overflow-hidden"
        style={{ marginLeft: 220, background: "var(--color-background)" }}>
        <OfflineBanner />
        <Suspense fallback={<PageLoading />}>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/chat" component={ChatPage} />
            <Route path="/models" component={ModelsPage} />
            <Route path="/workspace" component={WorkspacePage} />
            <Route path="/studios" component={StudiosPage} />
            <Route path="/diagnostics" component={DiagnosticsPage} />
            <Route path="/logs" component={LogsPage} />
            <Route path="/cleanup" component={CleanupPage} />
            <Route path="/remote" component={RemotePage} />
            <Route path="/integrations" component={IntegrationsPage} />
            <Route path="/operations" component={OperationsPage} />
            <Route path="/evidence" component={EvidenceVaultPage} />
            <Route path="/voice" component={VoicePage} />
            <Route path="/business" component={BusinessPage} />
            <Route path="/it-support" component={ITSupportPage} />
            <Route path="/homelab" component={HomeLabPage} />
            <Route path="/digital-twin" component={DigitalTwinPage} />
            <Route path="/inventory" component={InventoryPage} />
            <Route path="/automotive" component={AutomotivePage} />
            <Route path="/settings" component={SettingsPage} />
            <Route>
              <Placeholder title="404 — Page Not Found" description="This route does not exist." />
            </Route>
          </Switch>
        </Suspense>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}
