import { useState } from "react";
import { useI18n } from "../i18n";
import { useProviderStore, type Provider } from "../stores/providerStore";
import { useUIStore } from "../stores/uiStore";
import { useUsageStore } from "../stores/usageStore";
import { cn } from "../lib/utils";
import {
  Settings,
  Palette,
  Keyboard,
  Plug,
  Check,
  X,
  Eye,
  EyeOff,
  Loader2,
  ChevronRight,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Plus,
  BarChart3,
} from "lucide-react";

type TabId = "providers" | "appearance" | "shortcuts" | "usage";

const TABS: { id: TabId; icon: typeof Settings; labelKey: string }[] = [
  { id: "providers", icon: Plug, labelKey: "providers" },
  { id: "appearance", icon: Palette, labelKey: "appearance" },
  { id: "shortcuts", icon: Keyboard, labelKey: "shortcuts" },
  { id: "usage", icon: BarChart3, labelKey: "usage" },
];

export function SettingsPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("providers");

  return (
    <div className="flex h-full">
      {/* Tab sidebar */}
      <div className="w-48 shrink-0 border-r border-border bg-sidebar p-3">
        <div className="flex items-center gap-2 px-2 mb-4">
          <Settings size={16} className="text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{t("settings")}</span>
        </div>
        <nav className="space-y-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-xs transition-colors",
                activeTab === tab.id
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <tab.icon size={14} />
              <span>{t(tab.labelKey)}</span>
              <ChevronRight size={12} className="ml-auto opacity-40" />
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "providers" && <ProvidersTab />}
        {activeTab === "appearance" && <AppearanceTab />}
        {activeTab === "shortcuts" && <ShortcutsTab />}
        {activeTab === "usage" && <UsageTab />}
      </div>
    </div>
  );
}

// --- Providers Tab ---

function ProvidersTab() {
  const { t } = useI18n();
  const providers = useProviderStore((s) => s.providers);
  const updateProvider = useProviderStore((s) => s.updateProvider);
  const removeProvider = useProviderStore((s) => s.removeProvider);
  const testConnection = useProviderStore((s) => s.testConnection);
  const addProvider = useProviderStore((s) => s.addProvider);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [showAddForm, setShowAddForm] = useState(false);

  const handleTest = async (id: string) => {
    setTestingId(id);
    await testConnection(id);
    setTestingId(null);
  };

  const handleAddProvider = () => {
    addProvider({
      name: t("newProvider"),
      baseUrl: "https://",
      apiKey: "",
      models: [],
      enabled: true,
    });
    setShowAddForm(false);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t("providers")}</h2>
        <p className="text-xs text-muted-foreground mt-1">Configure API providers and keys.</p>
      </div>

      {providers.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          showKey={showKeys[provider.id] ?? false}
          onToggleKey={() => setShowKeys((s) => ({ ...s, [provider.id]: !s[provider.id] }))}
          onSetEnabled={(enabled) => updateProvider(provider.id, { enabled })}
          onSetApiKey={(key) => updateProvider(provider.id, { apiKey: key })}
          onTest={() => handleTest(provider.id)}
          onRemove={() => removeProvider(provider.id)}
          isTesting={testingId === provider.id}
        />
      ))}

      {/* Add Custom Provider */}
      <button
        onClick={() => setShowAddForm(!showAddForm)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-4 py-3 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        <Plus size={14} />
        {t("addCustomProvider")}
      </button>
      {showAddForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">{t("newProvider")}</span>
            <button onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
          </div>
          <button onClick={handleAddProvider} className="w-full rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 transition-colors">
            {t("createProvider")}
          </button>
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  showKey,
  onToggleKey,
  onSetEnabled,
  onSetApiKey,
  onTest,
  onRemove,
  isTesting,
}: {
  provider: Provider;
  showKey: boolean;
  onToggleKey: () => void;
  onSetEnabled: (enabled: boolean) => void;
  onSetApiKey: (key: string) => void;
  onTest: () => void;
  onRemove: () => void;
  isTesting: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => onSetEnabled(!provider.enabled)}>
            {provider.enabled ? (
              <ToggleRight size={22} className="text-primary" />
            ) : (
              <ToggleLeft size={22} className="text-muted-foreground" />
            )}
          </button>
          <div>
            <div className="text-sm font-medium text-foreground">{provider.name}</div>
            <div className="text-[10px] text-muted-foreground">{provider.baseUrl}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {provider.testStatus === "ok" && <Check size={14} className="text-green-500" />}
          {provider.testStatus === "error" && <X size={14} className="text-destructive" />}
          <button onClick={onTest} disabled={isTesting} className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50">
            {isTesting ? <Loader2 size={12} className="animate-spin" /> : t("testConnection")}
          </button>
          {provider.id.startsWith("provider-") && (
            <button onClick={onRemove} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-border px-4 py-3 space-y-3">
        {/* API Key */}
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("apiKey")}</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type={showKey ? "text" : "password"}
              value={provider.apiKey}
              onChange={(e) => onSetApiKey(e.target.value)}
              placeholder={provider.id === "provider-ollama" ? "Not required for local" : "sk-..."}
              className="flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
            />
            <button onClick={onToggleKey} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Models */}
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("models")} ({provider.models.length})</label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {provider.models.map((model) => (
              <span key={model.id} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                {model.name}
                {model.supportsVision && <span className="text-[9px] text-primary">👁</span>}
              </span>
            ))}
          </div>
        </div>

        {provider.testError && (
          <div className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-[10px] text-destructive">{provider.testError}</div>
        )}
        {provider.lastTested && (
          <div className="text-[10px] text-muted-foreground">Last tested: {new Date(provider.lastTested).toLocaleString()}</div>
        )}
      </div>
    </div>
  );
}

// --- Appearance Tab ---

function AppearanceTab() {
  const { t } = useI18n();
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t("appearance")}</h2>
        <p className="text-xs text-muted-foreground mt-1">{t("appearanceDesc")}</p>
      </div>

      {/* Theme */}
      <div>
        <label className="text-xs font-medium text-foreground">{t("theme")}</label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(["dark", "light", "system"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors",
                theme === t ? "border-primary bg-primary/5" : "border-border hover:border-accent",
              )}
            >
              <div className={cn("h-16 w-full rounded-md", t === "dark" ? "bg-[#0f0f0f]" : t === "light" ? "bg-white border" : "bg-gradient-to-r from-white to-[#0f0f0f]")} />
              <span className={cn("text-xs capitalize", theme === t ? "text-primary font-medium" : "text-muted-foreground")}>
                {t}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Font size placeholder */}
      <div>
        <label className="text-xs font-medium text-foreground">{t("messageFontSize")}</label>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground">A</span>
          <input type="range" min="12" max="18" defaultValue={14} className="flex-1 accent-primary" />
          <span className="text-sm text-muted-foreground">A</span>
        </div>
      </div>
    </div>
  );
}

// --- Shortcuts Tab ---

function ShortcutsTab() {
  const { t } = useI18n();
  const shortcuts = [
    { keys: ["⌘", "Enter"], description: t("scSendMessage") },
    { keys: ["Shift", "Enter"], description: t("scNewLine") },
    { keys: ["⌘", "N"], description: t("scNewChat") },
    { keys: ["⌘", "B"], description: t("scToggleSidebar") },
    { keys: ["⌘", ","], description: t("scOpenSettings") },
    { keys: ["⌘", "K"], description: t("scSearch") },
    { keys: ["⌘", "Shift", "S"], description: t("scTogglePrompt") },
    { keys: ["Escape"], description: t("scStopGeneration") },
    { keys: ["⌘", "↑"], description: t("scPrevConversation") },
    { keys: ["⌘", "↓"], description: t("scNextConversation") },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t("keyboardShortcuts")}</h2>
        <p className="text-xs text-muted-foreground mt-1">{t("shortcutsDesc")}</p>
      </div>

      <div className="space-y-1">
        {shortcuts.map((shortcut) => (
          <div key={shortcut.description} className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-accent/50">
            <span className="text-xs text-foreground">{shortcut.description}</span>
            <div className="flex items-center gap-1">
              {shortcut.keys.map((key, i) => (
                <span key={i}>
                  {i > 0 && <span className="mx-0.5 text-muted-foreground">+</span>}
                  <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1.5 text-[10px] font-mono text-muted-foreground">
                    {key}
                  </kbd>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Usage Tab ---

function UsageTab() {
  const { t } = useI18n();
  const getSummary = useUsageStore((s) => s.getSummary);
  const records = useUsageStore((s) => s.records);
  const clearUsage = useUsageStore((s) => s.clearUsage);
  const summary = getSummary();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t("usageAndCost")}</h2>
        <p className="text-xs text-muted-foreground mt-1">{t("usageDesc")}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("inputTokens")}</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{summary.totalInputTokens.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("outputTokens")}</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{summary.totalOutputTokens.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("estCost")}</div>
          <div className="mt-1 text-lg font-semibold text-foreground">${summary.totalCost.toFixed(4)}</div>
        </div>
      </div>

      {/* By Provider */}
      {Object.keys(summary.byProvider).length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-foreground mb-2">{t("byProvider")}</h3>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t("provider")}</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t("tokens")}</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t("cost")}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.byProvider).map(([provider, data]) => (
                  <tr key={provider} className="border-b border-border last:border-0 hover:bg-accent/30">
                    <td className="px-3 py-2 text-foreground">{provider}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{data.tokens.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-foreground">${data.cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Records */}
      {records.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-foreground">{t("recentRequests")} ({records.length})</h3>
            <button onClick={clearUsage} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">
              {t("clearAll")}
            </button>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {records.slice().reverse().slice(0, 20).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md px-3 py-1.5 text-xs hover:bg-accent/30">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{r.model}</span>
                  <span className="text-muted-foreground">({r.provider})</span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>{r.inputTokens + r.outputTokens} tokens</span>
                  <span>${r.estimatedCost.toFixed(4)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {records.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <BarChart3 size={24} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">{t("noUsageData")}</p>
        </div>
      )}
    </div>
  );
}