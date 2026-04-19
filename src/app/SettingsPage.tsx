import { useState, useEffect, useCallback } from "react";
import { useI18n } from "../i18n";
import { useProviderStore, type Provider, type ModelConfig } from "../stores/providerStore";
import { useUIStore } from "../stores/uiStore";
import { useUsageStore } from "../stores/usageStore";
import { cn } from "../lib/utils";
import { invoke, type BridgeInfoIPC } from "../lib/ipc";
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
  Pencil,
  MessageSquare,
  Send,
} from "lucide-react";

type TabId = "providers" | "appearance" | "shortcuts" | "usage" | "bridge";

const TABS: { id: TabId; icon: typeof Settings; labelKey: string }[] = [
  { id: "providers", icon: Plug, labelKey: "providers" },
  { id: "appearance", icon: Palette, labelKey: "appearance" },
  { id: "shortcuts", icon: Keyboard, labelKey: "shortcuts" },
  { id: "usage", icon: BarChart3, labelKey: "usage" },
  { id: "bridge" as const, icon: MessageSquare, labelKey: "bridge" },
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
        {activeTab === "bridge" && <BridgeTab />}
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("https://");

  const handleTest = async (id: string) => {
    setTestingId(id);
    await testConnection(id);
    setTestingId(null);
  };

  const handleAddProvider = () => {
    if (!newName.trim()) {return;}
    addProvider({
      name: newName.trim(),
      baseUrl: newUrl.trim() || "https://",
      apiKey: "",
      models: [],
      enabled: true,
    });
    setNewName("");
    setNewUrl("https://");
    setShowAddForm(false);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t("providers")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("providersDesc")}</p>
      </div>

      {providers.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          expanded={expandedId === provider.id}
          showKey={showKeys[provider.id] ?? false}
          onToggleExpand={() => setExpandedId(expandedId === provider.id ? null : provider.id)}
          onToggleKey={() => setShowKeys((s) => ({ ...s, [provider.id]: !s[provider.id] }))}
          onSetEnabled={(enabled) => updateProvider(provider.id, { enabled })}
          onSetApiKey={(key) => updateProvider(provider.id, { apiKey: key })}
          onSetBaseUrl={(url) => updateProvider(provider.id, { baseUrl: url })}
          onSetModels={(models) => updateProvider(provider.id, { models })}
          onTest={() => handleTest(provider.id)}
          onRemove={() => removeProvider(provider.id)}
          isTesting={testingId === provider.id}
        />
      ))}

      {/* Add Custom Provider */}
      {!showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-4 py-3 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Plus size={14} />
          {t("addCustomProvider")}
        </button>
      ) : (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">{t("addCustomProvider")}</span>
            <button onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
          </div>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("name")}</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("providerNamePlaceholder")}
                className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
                onKeyDown={(e) => e.key === "Enter" && handleAddProvider()}
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("baseUrl")}</label>
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder={t("baseUrlPlaceholder")}
                className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
                onKeyDown={(e) => e.key === "Enter" && handleAddProvider()}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddProvider}
              disabled={!newName.trim()}
              className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {t("createProvider")}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  expanded,
  showKey,
  onToggleExpand,
  onToggleKey,
  onSetEnabled,
  onSetApiKey,
  onSetBaseUrl,
  onSetModels,
  onTest,
  onRemove,
  isTesting,
}: {
  provider: Provider;
  expanded: boolean;
  showKey: boolean;
  onToggleExpand: () => void;
  onToggleKey: () => void;
  onSetEnabled: (enabled: boolean) => void;
  onSetApiKey: (key: string) => void;
  onSetBaseUrl: (url: string) => void;
  onSetModels: (models: ModelConfig[]) => void;
  onTest: () => void;
  onRemove: () => void;
  isTesting: boolean;
}) {
  const { t } = useI18n();
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [showAddModel, setShowAddModel] = useState(false);
  const [modelDraft, setModelDraft] = useState<Partial<ModelConfig>>({});

  const resetModelDraft = () => {
    setModelDraft({
      id: "",
      name: "",
      maxTokens: 4096,
      supportsStreaming: true,
      supportsVision: false,
      inputPrice: undefined,
      outputPrice: undefined,
    });
  };

  const handleAddModel = () => {
    if (!modelDraft.id || !modelDraft.name) { return; }
    const newModel: ModelConfig = {
      id: modelDraft.id!,
      name: modelDraft.name!,
      maxTokens: modelDraft.maxTokens ?? 4096,
      supportsStreaming: modelDraft.supportsStreaming ?? true,
      supportsVision: modelDraft.supportsVision ?? false,
      inputPrice: modelDraft.inputPrice,
      outputPrice: modelDraft.outputPrice,
    };
    onSetModels([...provider.models, newModel]);
    setShowAddModel(false);
    resetModelDraft();
  };

  const handleUpdateModel = () => {
    if (!modelDraft.id || !modelDraft.name) { return; }
    const updated: ModelConfig = {
      id: modelDraft.id!,
      name: modelDraft.name!,
      maxTokens: modelDraft.maxTokens ?? 4096,
      supportsStreaming: modelDraft.supportsStreaming ?? true,
      supportsVision: modelDraft.supportsVision ?? false,
      inputPrice: modelDraft.inputPrice,
      outputPrice: modelDraft.outputPrice,
    };
    onSetModels(provider.models.map((m) => (m.id === editingModelId ? updated : m)));
    setEditingModelId(null);
    resetModelDraft();
  };

  const handleDeleteModel = (modelId: string) => {
    onSetModels(provider.models.filter((m) => m.id !== modelId));
  };

  const startEdit = (model: ModelConfig) => {
    setEditingModelId(model.id);
    setShowAddModel(false);
    setModelDraft({ ...model });
  };

  const startAdd = () => {
    setEditingModelId(null);
    setShowAddModel(true);
    resetModelDraft();
  };

  const cancelEdit = () => {
    setEditingModelId(null);
    setShowAddModel(false);
    resetModelDraft();
  };

  const isEditing = editingModelId !== null || showAddModel;

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
          <button
            onClick={onToggleExpand}
            className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {expanded ? t("collapse") : t("edit")}
          </button>
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

      {expanded && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("baseUrl")}</label>
            <input
              type="url"
              value={provider.baseUrl}
              onChange={(e) => onSetBaseUrl(e.target.value)}
              placeholder={t("baseUrlPlaceholder")}
              className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
            />
          </div>

        {/* API Key */}
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("apiKey")}</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type={showKey ? "text" : "password"}
                value={provider.apiKey}
                onChange={(e) => onSetApiKey(e.target.value)}
                placeholder={provider.id === "provider-ollama" ? t("notRequiredForLocal") : "sk-..."}
                className="flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
              />
              <button onClick={onToggleKey} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Models */}
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("models")} ({provider.models.length})</label>
            <div className="mt-1 space-y-1">
              {provider.models.map((model) => (
                <div key={model.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-foreground truncate">{model.name}</span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{model.maxTokens.toLocaleString()}</span>
                    {model.supportsVision && <span className="shrink-0 text-[9px] text-primary">👁</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startEdit(model)}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={() => handleDeleteModel(model.id)}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}

              {provider.models.length === 0 && !isEditing && (
                <div className="text-[10px] text-muted-foreground py-2 text-center">{t("models")} —</div>
              )}

              {/* Add / Edit Model Form */}
              {isEditing && (
                <div className="mt-2 space-y-2 rounded-md border border-border bg-card p-3">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {showAddModel ? t("addModel") : t("editModel")}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("modelId")}</label>
                      <input
                        value={modelDraft.id ?? ""}
                        onChange={(e) => setModelDraft((d) => ({ ...d, id: e.target.value }))}
                        className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-ring"
                        placeholder="model-id"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("modelName")}</label>
                      <input
                        value={modelDraft.name ?? ""}
                        onChange={(e) => setModelDraft((d) => ({ ...d, name: e.target.value }))}
                        className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-ring"
                        placeholder="Model Name"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("maxTokens")}</label>
                      <input
                        type="number"
                        value={modelDraft.maxTokens ?? 4096}
                        onChange={(e) => setModelDraft((d) => ({ ...d, maxTokens: Number(e.target.value) || 4096 }))}
                        className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-ring"
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-1.5 cursor-pointer py-1.5">
                        <input
                          type="checkbox"
                          checked={modelDraft.supportsVision ?? false}
                          onChange={(e) => setModelDraft((d) => ({ ...d, supportsVision: e.target.checked }))}
                          className="accent-primary"
                        />
                        <span className="text-[9px] text-muted-foreground">{t("visionSupport")}</span>
                      </label>
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("inputPrice")} ({t("pricePerMillion")})</label>
                      <input
                        type="number"
                        step="0.01"
                        value={modelDraft.inputPrice ?? ""}
                        onChange={(e) => setModelDraft((d) => ({ ...d, inputPrice: e.target.value ? Number(e.target.value) : undefined }))}
                        className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-ring"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("outputPrice")} ({t("pricePerMillion")})</label>
                      <input
                        type="number"
                        step="0.01"
                        value={modelDraft.outputPrice ?? ""}
                        onChange={(e) => setModelDraft((d) => ({ ...d, outputPrice: e.target.value ? Number(e.target.value) : undefined }))}
                        className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-ring"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={showAddModel ? handleAddModel : handleUpdateModel}
                      disabled={!modelDraft.id || !modelDraft.name}
                      className="rounded-md bg-primary px-3 py-1 text-[10px] text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {showAddModel ? t("addModel") : t("editModel")}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="rounded-md border border-border px-3 py-1 text-[10px] text-muted-foreground hover:bg-accent transition-colors"
                    >
                      {t("cancel")}
                    </button>
                  </div>
                </div>
              )}

              {/* Add Model Button */}
              {!isEditing && (
                <button
                  onClick={startAdd}
                  className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <Plus size={12} />
                  {t("addModel")}
                </button>
              )}
            </div>
          </div>

          {provider.testError && (
            <div className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-[10px] text-destructive">{provider.testError}</div>
          )}
          {provider.lastTested && (
            <div className="text-[10px] text-muted-foreground">
              {t("lastTested")}: {new Date(provider.lastTested).toLocaleString()}
            </div>
          )}
        </div>
      )}
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

// --- Bridge Tab ---

const BRIDGE_PLATFORMS = ["telegram", "discord", "feishu", "slack", "webhook"] as const;
type BridgePlatform = (typeof BRIDGE_PLATFORMS)[number];

function BridgeTab() {
  const { t } = useI18n();
  const [bridges, setBridges] = useState<BridgeInfoIPC[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPlatform, setFormPlatform] = useState<BridgePlatform>("telegram");
  const [formUrl, setFormUrl] = useState("");
  const [formChannel, setFormChannel] = useState("");
  const [formToken, setFormToken] = useState("");
  const [sendingTestId, setSendingTestId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refreshList = useCallback(async () => {
    try {
      const list = await invoke<BridgeInfoIPC[]>("bridge_list");
      setBridges(list);
    } catch {
      // TODO: i18n error handling
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const handleCreate = async () => {
    if (!formName.trim() || !formUrl.trim()) { return; }
    setCreating(true);
    try {
      await invoke("bridge_create", {
        name: formName.trim(),
        platform: formPlatform,
        url: formUrl.trim(),
        channel: formChannel.trim() || undefined,
        token: formToken.trim() || undefined,
      });
      setFormName("");
      setFormPlatform("telegram");
      setFormUrl("");
      setFormChannel("");
      setFormToken("");
      setShowAddForm(false);
      await refreshList();
    } catch {
      // TODO: i18n error handling
    } finally {
      setCreating(false);
    }
  };

  const handleRemove = async (bridgeId: string) => {
    try {
      await invoke("bridge_remove", { bridgeId });
      await refreshList();
    } catch {
      // TODO: i18n error handling
    }
  };

  const handleToggle = async (bridge: BridgeInfoIPC) => {
    try {
      if (bridge.enabled) {
        await invoke("bridge_disable", { bridgeId: bridge.id });
      } else {
        await invoke("bridge_enable", { bridgeId: bridge.id });
      }
      await refreshList();
    } catch {
      // TODO: i18n error handling
    }
  };

  const handleTestSend = async (bridgeId: string) => {
    setSendingTestId(bridgeId);
    try {
      await invoke("bridge_send", {
        bridgeId,
        content: "Test notification from DevPilot",
        title: "Test",
      });
    } catch {
      // TODO: i18n error handling
    } finally {
      setSendingTestId(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t("bridge")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {/* TODO: i18n */}
          Notification bridges &amp; integrations
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Bridge cards */}
          <div className="space-y-2">
            {bridges.map((bridge) => (
              <div
                key={bridge.id}
                className="rounded-lg border border-border bg-card"
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleToggle(bridge)}>
                      {bridge.enabled ? (
                        <ToggleRight size={22} className="text-primary" />
                      ) : (
                        <ToggleLeft size={22} className="text-muted-foreground" />
                      )}
                    </button>
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {bridge.name || bridge.id}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">
                          {bridge.platform}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {bridge.enabled ? t("enabled") : "Disabled"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTestSend(bridge.id)}
                      disabled={sendingTestId === bridge.id}
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                    >
                      {sendingTestId === bridge.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Send size={11} />
                      )}
                      {/* TODO: i18n */}
                      Test
                    </button>
                    <button
                      onClick={() => handleRemove(bridge.id)}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {bridges.length === 0 && !showAddForm && (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <MessageSquare size={24} className="mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {/* TODO: i18n */}
                  No bridges configured
                </p>
              </div>
            )}
          </div>

          {/* Add Bridge Form */}
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-4 py-3 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <Plus size={14} />
              {/* TODO: i18n */}
              Add Bridge
            </button>
          ) : (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">
                  {/* TODO: i18n */}
                  Add Bridge
                </span>
                <button onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t("name")}
                  </label>
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="My Notification Bridge"
                    className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {/* TODO: i18n */}
                    Platform
                  </label>
                  <select
                    value={formPlatform}
                    onChange={(e) => setFormPlatform(e.target.value as BridgePlatform)}
                    className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-ring"
                  >
                    {BRIDGE_PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    URL
                  </label>
                  <input
                    type="url"
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    placeholder="https://"
                    className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {/* TODO: i18n */}
                    Channel (optional)
                  </label>
                  <input
                    value={formChannel}
                    onChange={(e) => setFormChannel(e.target.value)}
                    placeholder="#general"
                    className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {/* TODO: i18n */}
                    Token (optional)
                  </label>
                  <input
                    value={formToken}
                    onChange={(e) => setFormToken(e.target.value)}
                    placeholder="bot-token / webhook-secret"
                    className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!formName.trim() || !formUrl.trim() || creating}
                  className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {creating ? <Loader2 size={12} className="animate-spin inline" /> : "Create"}
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
