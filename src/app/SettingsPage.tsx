import { useState } from "react";
import { useI18n } from "../i18n";
import { useProviderStore, type Provider } from "../stores/providerStore";
import { useUIStore } from "../stores/uiStore";
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
} from "lucide-react";

type TabId = "providers" | "appearance" | "shortcuts";

const TABS: { id: TabId; icon: typeof Settings; labelKey: string }[] = [
  { id: "providers", icon: Plug, labelKey: "Providers" },
  { id: "appearance", icon: Palette, labelKey: "Appearance" },
  { id: "shortcuts", icon: Keyboard, labelKey: "Shortcuts" },
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
              <span>{tab.labelKey}</span>
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
      </div>
    </div>
  );
}

// --- Providers Tab ---

function ProvidersTab() {
  const providers = useProviderStore((s) => s.providers);
  const updateProvider = useProviderStore((s) => s.updateProvider);
  const removeProvider = useProviderStore((s) => s.removeProvider);
  const testConnection = useProviderStore((s) => s.testConnection);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const handleTest = async (id: string) => {
    setTestingId(id);
    await testConnection(id);
    setTestingId(null);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">LLM Providers</h2>
        <p className="text-xs text-muted-foreground mt-1">Configure API providers and keys. At least one enabled provider with a valid key is required.</p>
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
            {isTesting ? <Loader2 size={12} className="animate-spin" /> : "Test"}
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
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">API Key</label>
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
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Models ({provider.models.length})</label>
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
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Appearance</h2>
        <p className="text-xs text-muted-foreground mt-1">Customize the look and feel of DevPilot.</p>
      </div>

      {/* Theme */}
      <div>
        <label className="text-xs font-medium text-foreground">Theme</label>
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
        <label className="text-xs font-medium text-foreground">Message Font Size</label>
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
  const shortcuts = [
    { keys: ["⌘", "Enter"], description: "Send message" },
    { keys: ["Shift", "Enter"], description: "New line in input" },
    { keys: ["⌘", "N"], description: "New chat" },
    { keys: ["⌘", "B"], description: "Toggle sidebar" },
    { keys: ["⌘", ","], description: "Open settings" },
    { keys: ["⌘", "K"], description: "Search conversations" },
    { keys: ["⌘", "Shift", "S"], description: "Toggle system prompt" },
    { keys: ["Escape"], description: "Stop generation / Close panel" },
    { keys: ["⌘", "↑"], description: "Previous conversation" },
    { keys: ["⌘", "↓"], description: "Next conversation" },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Keyboard Shortcuts</h2>
        <p className="text-xs text-muted-foreground mt-1">Quick actions for power users.</p>
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
