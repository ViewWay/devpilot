import { useState, useEffect, useCallback } from "react";
import { useI18n } from "../i18n";
import { useProviderStore, type Provider, type ModelConfig } from "../stores/providerStore";
import { useUIStore } from "../stores/uiStore";
import { useUsageStore, type BudgetPeriod } from "../stores/usageStore";
import { cn } from "../lib/utils";
import {
  invoke,
  type BridgeInfoIPC,
  getAppDataDir,
  scanClaudeThreads,
  scanClaudeThreadsFrom,
  importClaudeThreadsBatch,
  type ClaudeThreadInfoIPC,
  type ClaudeImportResultIPC,
  configLoadGlobal,
  configSaveGlobal,
  configDeleteGlobal,
  configGlobalExists,
  type ConfigFileIPC,
} from "../lib/ipc";
import { useMcpStore } from "../stores/mcpStore";
import type { McpServerConfig } from "../types";
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
  AlertCircle,
  Wrench,
  Shield,
  BookOpen,
  Database,
  Download,
  Upload,
  FolderOpen,
  CheckSquare,
  Square,
  FileText,
  Search,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { PersonaMemoryTab } from "../components/PersonaMemoryTab";
import { useShortcutStore, SHORTCUT_DEFINITIONS, type ShortcutAction } from "../stores/shortcutStore";

type TabId = "providers" | "appearance" | "shortcuts" | "usage" | "bridge" | "mcp" | "security" | "persona" | "data" | "config";

const TABS: { id: TabId; icon: typeof Settings; labelKey: string }[] = [
  { id: "providers", icon: Plug, labelKey: "providers" },
  { id: "appearance", icon: Palette, labelKey: "appearance" },
  { id: "shortcuts", icon: Keyboard, labelKey: "shortcuts" },
  { id: "usage", icon: BarChart3, labelKey: "usage" },
  { id: "bridge" as const, icon: MessageSquare, labelKey: "bridge" },
  { id: "mcp" as const, icon: Wrench, labelKey: "mcpServers" },
  { id: "security" as const, icon: Shield, labelKey: "security" },
  { id: "persona" as const, icon: BookOpen, labelKey: "personaAndMemory" },
  { id: "data" as const, icon: Database, labelKey: "dataManagement" },
  { id: "config" as const, icon: FileText, labelKey: "config" },
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
        {activeTab === "mcp" && <McpTab />}
        {activeTab === "security" && <SecurityTab />}
        {activeTab === "persona" && <PersonaMemoryTabWrapper />}
        {activeTab === "data" && <DataTab />}
        {activeTab === "config" && <ConfigTab />}
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

          {/* Diagnostic Report */}
          <DiagnosticReportPanel providerId={provider.id} />
        </div>
      )}
    </div>
  );
}

/** Renders the full diagnostic report for a provider with severity badges and suggestions. */
function DiagnosticReportPanel({ providerId }: { providerId: string }) {
  const { t } = useI18n();
  const diagnoseProvider = useProviderStore((s) => s.diagnoseProvider);
  const report = useProviderStore((s) => s.diagnosticReports[providerId]);
  const [running, setRunning] = useState(false);

  const handleDiagnose = async () => {
    setRunning(true);
    await diagnoseProvider(providerId);
    setRunning(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("diagnosticReport")}
        </span>
        <button
          onClick={handleDiagnose}
          disabled={running}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          {running ? <Loader2 size={10} className="animate-spin" /> : <Wrench size={10} />}
          {running ? t("running") || "Running..." : t("runDiagnostics") || "Diagnose"}
        </button>
      </div>

      {report && (
        <div
          className={cn(
            "rounded-md border px-3 py-2 space-y-2",
            report.healthy
              ? "border-green-500/30 bg-green-500/5"
              : "border-destructive/30 bg-destructive/5",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {report.healthy ? (
                <Check size={12} className="text-green-500" />
              ) : (
                <AlertCircle size={12} className="text-destructive" />
              )}
              <span className="text-[10px] font-medium text-foreground">
                {report.healthy ? t("diagnosticHealthy") : t("diagnosticUnhealthy")}
              </span>
            </div>
            <span className="text-[9px] text-muted-foreground">
              {t("diagnosticDuration").replace("{ms}", String(report.durationMs))}
            </span>
          </div>

          {/* Check list */}
          {report.checks.length > 0 ? (
            <div className="space-y-1">
              {report.checks.map((check, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase leading-none",
                      check.severity === "ok" && "bg-green-500/15 text-green-500",
                      check.severity === "warning" && "bg-yellow-500/15 text-yellow-500",
                      check.severity === "error" && "bg-destructive/15 text-destructive",
                    )}
                  >
                    {check.severity === "ok" ? "✓" : check.severity === "warning" ? "!" : "✗"}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium text-foreground">{check.name}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">{check.message}</div>
                    {check.suggestion && (
                      <div className="mt-0.5 text-[9px] text-yellow-500/80">
                        💡 {check.suggestion}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground">{t("diagnosticNoChecks")}</div>
          )}

          {/* Models count footer */}
          {report.modelsCount !== null && (
            <div className="text-[9px] text-muted-foreground border-t border-border/50 pt-1.5">
              {t("diagnosticModels").replace("{count}", String(report.modelsCount))}
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
  const fontSize = useUIStore((s) => s.fontSize);
  const setFontSize = useUIStore((s) => s.setFontSize);

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
              <div className={cn("h-16 w-full rounded-md", t === "dark" ? "bg-[#0f0f0f]" : t === "light" ? "bg-[var(--color-surface-container-lowest)] border" : "bg-gradient-to-r from-[var(--color-surface-container-lowest)] to-[#0f0f0f]")} />
              <span className={cn("text-xs capitalize", theme === t ? "text-primary font-medium" : "text-muted-foreground")}>
                {t}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Font size */}
      <div>
        <label className="text-xs font-medium text-foreground">{t("messageFontSize")}</label>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground">A</span>
          <input
            type="range"
            min={12}
            max={18}
            step={1}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="text-sm text-muted-foreground">A</span>
          <span className="text-[10px] text-muted-foreground w-6 text-right">{fontSize}px</span>
        </div>
      </div>
    </div>
  );
}

// --- Shortcuts Tab ---

function ShortcutKey({ combo, isMac }: { combo: string; isMac: boolean }) {
  const parts = combo.split("+").map((p) => p.trim());
  return (
    <div className="flex items-center gap-1">
      {parts.map((part, i) => {
        let label = part;
        if (part === "ctrlOrCmd") {
          label = isMac ? "⌘" : "Ctrl";
        } else if (part === "shift") {
          label = "⇧";
        } else if (part === "alt") {
          label = isMac ? "⌥" : "Alt";
        } else {
          const keyMap: Record<string, string> = {
            enter: "Enter",
            escape: "Esc",
            "`": "`",
            ",": ",",
            ".": ".",
          };
          label = keyMap[part.toLowerCase()] ?? part.toUpperCase();
        }
        return (
          <span key={i}>
            {i > 0 && <span className="mx-0.5 text-muted-foreground">+</span>}
            <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1.5 text-[10px] font-mono text-muted-foreground">
              {label}
            </kbd>
          </span>
        );
      })}
    </div>
  );
}

function RecordingInput({
  onCapture,
  onCancel,
}: {
  onCapture: (combo: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<"recording" | "done">("recording");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignore lone modifier presses
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().startsWith("MAC");
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      // Build combo string
      const parts: string[] = [];
      if (ctrlOrCmd) { parts.push("ctrlOrCmd"); }
      if (e.shiftKey) { parts.push("shift"); }
      if (e.altKey) { parts.push("alt"); }

      // Key name
      let key = e.key;
      if (key === " ") { key = "Space"; }
      parts.push(key);

      const combo = parts.join("+");
      setStatus("done");
      onCapture(combo);
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onCapture]);

  // Auto-cancel on blur
  useEffect(() => {
    const handleBlur = () => {
      if (status === "recording") { onCancel(); }
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [status, onCancel]);

  // Listen for Escape to cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status === "recording") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [status, onCancel]);

  return (
    <div className="flex items-center gap-1">
      <kbd className="inline-flex h-5 min-w-[60px] items-center justify-center rounded border border-primary bg-primary/10 px-2 text-[10px] font-mono text-primary animate-pulse">
        {status === "recording" ? t("scRecording") : "✓"}
      </kbd>
    </div>
  );
}

function ShortcutsTab() {
  const { t } = useI18n();
  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const updateShortcut = useShortcutStore((s) => s.updateShortcut);
  const resetShortcut = useShortcutStore((s) => s.resetShortcut);
  const resetAllShortcuts = useShortcutStore((s) => s.resetAllShortcuts);
  const [recordingAction, setRecordingAction] = useState<string | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);

  const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().startsWith("MAC");

  const handleCapture = useCallback((action: ShortcutAction, combo: string) => {
    setRecordingAction(null);
    // Check for conflicts
    const conflict = SHORTCUT_DEFINITIONS.find(
      (def) => def.action !== action && shortcuts[def.action] === combo,
    );
    if (conflict) {
      setConflictMsg(`${t("scConflict")} "${t(conflict.labelKey)}"`);
      setTimeout(() => setConflictMsg(null), 3000);
      return;
    }
    updateShortcut(action, combo);
  }, [shortcuts, updateShortcut, t]);

  const [showResetDialog, setShowResetDialog] = useState(false);

  const handleResetAll = () => {
    setShowResetDialog(true);
  };

  const confirmResetAll = () => {
    resetAllShortcuts();
    setShowResetDialog(false);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t("keyboardShortcuts")}</h2>
          <p className="text-xs text-muted-foreground mt-1">{t("shortcutsDesc")}</p>
        </div>
        <button
          onClick={handleResetAll}
          className="rounded-md border border-border px-2.5 py-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {t("scResetAll")}
        </button>
      </div>

      {conflictMsg && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle size={14} />
          <span>{conflictMsg}</span>
          <button onClick={() => setConflictMsg(null)} className="ml-auto text-destructive/70 hover:text-destructive">
            <X size={12} />
          </button>
        </div>
      )}

      <div className="space-y-1">
        {SHORTCUT_DEFINITIONS.map((def) => {
          const currentCombo = shortcuts[def.action];
          const isDefault = currentCombo === def.defaultCombo;
          const isRecording = recordingAction === def.action;

          return (
            <div
              key={def.action}
              className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-accent/50 group"
            >
              <span className="text-xs text-foreground">{t(def.labelKey)}</span>
              <div className="flex items-center gap-2">
                {isRecording ? (
                  <RecordingInput
                    onCapture={(combo) => handleCapture(def.action, combo)}
                    onCancel={() => setRecordingAction(null)}
                  />
                ) : (
                  <button
                    onClick={() => setRecordingAction(def.action)}
                    className="flex items-center gap-1 rounded-md border border-transparent px-1 py-0.5 transition-colors hover:border-border hover:bg-muted/50"
                    title={t("scClickToRebind")}
                  >
                    <ShortcutKey combo={currentCombo} isMac={isMac} />
                  </button>
                )}

                {!isDefault && (
                  <button
                    onClick={() => resetShortcut(def.action)}
                    className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                    title={t("scReset")}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hint text */}
      <div className="text-[10px] text-muted-foreground/60 space-y-0.5">
        <p>{isMac ? "⌘ = Command key" : "Ctrl = Control key"}</p>
        <p>{t("scClickToRebind")} · Esc to cancel recording</p>
      </div>

      {/* Reset confirmation dialog */}
      {showResetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowResetDialog(false)}>
          <div className="w-80 rounded-lg border border-border bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium text-foreground">{t("scResetAll")}</p>
            <p className="mt-2 text-xs text-muted-foreground">{t("scResetAllConfirm")}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowResetDialog(false)}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={confirmResetAll}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs text-white hover:bg-destructive/90"
              >
                {t("scResetAll")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Usage Tab ---

function UsageTab() {
  const { t } = useI18n();
  const getSummary = useUsageStore((s) => s.getSummary);
  const records = useUsageStore((s) => s.records);
  const clearUsage = useUsageStore((s) => s.clearUsage);
  const budgetLimit = useUsageStore((s) => s.budgetLimit);
  const budgetPeriod = useUsageStore((s) => s.budgetPeriod);
  const setBudgetLimit = useUsageStore((s) => s.setBudgetLimit);
  const setBudgetPeriod = useUsageStore((s) => s.setBudgetPeriod);
  const getBudgetUsage = useUsageStore((s) => s.getBudgetUsage);
  const summary = getSummary();
  const budgetUsage = getBudgetUsage();

  const budgetPeriods: { value: BudgetPeriod; label: string }[] = [
    { value: "daily", label: t("budgetDaily") },
    { value: "weekly", label: t("budgetWeekly") },
    { value: "monthly", label: t("budgetMonthly") },
    { value: "total", label: t("budgetTotal") },
  ];

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

      {/* Budget Settings */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <AlertCircle size={16} className="text-primary" />
          <span className="text-sm font-medium text-foreground">{t("budgetAlert")}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t("budgetAlertDesc")}</p>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">{t("budgetLimitLabel")}</label>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">$</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={budgetLimit || ""}
                onChange={(e) => setBudgetLimit(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-20 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">{t("budgetPeriodLabel")}</label>
            <select
              value={budgetPeriod}
              onChange={(e) => setBudgetPeriod(e.target.value as BudgetPeriod)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {budgetPeriods.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Budget progress bar */}
        {budgetLimit > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>${budgetUsage.spent.toFixed(2)} {t("budgetSpent")}</span>
              <span>${budgetUsage.limit.toFixed(2)} {t("budgetLimit")}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  budgetUsage.percentage >= 100
                    ? "bg-destructive"
                    : budgetUsage.percentage >= 80
                      ? "bg-amber-500"
                      : "bg-primary",
                )}
                style={{ width: `${Math.min(budgetUsage.percentage, 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground text-right">
              {budgetUsage.percentage.toFixed(0)}% {t("budgetUsed")}
            </div>
          </div>
        )}
      </div>

      {/* Daily Cost Chart */}
      {records.length >= 2 ? (
        <div>
          <h3 className="text-xs font-medium text-foreground mb-2">{t("costOverTime")}</h3>
          <div className="rounded-lg border border-border bg-card p-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={(() => {
                  const map = new Map<string, number>();
                  for (const r of records) {
                    const day = new Date(r.timestamp).toISOString().slice(0, 10);
                    map.set(day, (map.get(day) ?? 0) + r.estimatedCost);
                  }
                  return Array.from(map.entries())
                    .sort(([a], [b]) => a.localeCompare(b))
                    .slice(-30)
                    .map(([date, cost]) => ({ date, cost }));
                })()}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <Tooltip
                  formatter={(value) => [`$${Number(value ?? 0).toFixed(4)}`, t("dailyCost")]}
                  labelStyle={{ color: "var(--foreground)" }}
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-xs text-muted-foreground">{t("costOverTime")} — {t("noUsageData")}</p>
        </div>
      )}

      {/* Daily Tokens Chart */}
      {records.length >= 2 ? (
        <div>
          <h3 className="text-xs font-medium text-foreground mb-2">{t("tokensOverTime")}</h3>
          <div className="rounded-lg border border-border bg-card p-3">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart
                data={(() => {
                  const map = new Map<string, { input: number; output: number }>();
                  for (const r of records) {
                    const day = new Date(r.timestamp).toISOString().slice(0, 10);
                    const prev = map.get(day) ?? { input: 0, output: 0 };
                    prev.input += r.inputTokens;
                    prev.output += r.outputTokens;
                    map.set(day, prev);
                  }
                  return Array.from(map.entries())
                    .sort(([a], [b]) => a.localeCompare(b))
                    .slice(-30)
                    .map(([date, v]) => ({ date, input: v.input, output: v.output }));
                })()}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <Tooltip
                  formatter={(value, name) => [
                    Number(value ?? 0).toLocaleString(),
                    name === "input" ? t("input") : t("output"),
                  ]}
                  labelStyle={{ color: "var(--foreground)" }}
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="input" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="input" />
                <Line type="monotone" dataKey="output" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} name="output" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

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
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refreshList = useCallback(async () => {
    try {
      const list = await invoke<BridgeInfoIPC[]>("bridge_list");
      setBridges(list);
    } catch {
      setError(t("bridgeError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      setError(t("bridgeError"));
    } finally {
      setCreating(false);
    }
  };

  const handleRemove = async (bridgeId: string) => {
    try {
      await invoke("bridge_remove", { bridgeId });
      await refreshList();
    } catch {
      setError(t("bridgeError"));
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
      setError(t("bridgeError"));
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
      setError(t("bridgeError"));
    } finally {
      setSendingTestId(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t("bridge")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("bridgeIntegrations")}
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-destructive/70 hover:text-destructive"
          >
            <X size={12} />
          </button>
        </div>
      )}

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
                      {t("test")}
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
                  {t("noBridges")}
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
              {t("addBridge")}
            </button>
          ) : (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">
                  {t("addBridge")}
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
                    {t("platform")}
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
                    {t("channelOptional")}
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
                    {t("tokenOptional")}
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
                  {creating ? <Loader2 size={12} className="animate-spin inline" /> : t("create")}
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

// --- Security Tab ---

const SANDBOX_POLICIES: { id: "default" | "permissive" | "strict"; labelKey: string; descKey: string }[] = [
  { id: "default", labelKey: "sandboxDefault", descKey: "sandboxDefaultDesc" },
  { id: "permissive", labelKey: "sandboxPermissive", descKey: "sandboxPermissiveDesc" },
  { id: "strict", labelKey: "sandboxStrict", descKey: "sandboxStrictDesc" },
];

function SecurityTab() {
  const { t } = useI18n();
  const sandboxPolicy = useUIStore((s) => s.sandboxPolicy);
  const setSandboxPolicy = useUIStore((s) => s.setSandboxPolicy);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t("security")}</h2>
        <p className="text-xs text-muted-foreground mt-1">{t("securityDesc")}</p>
      </div>

      {/* Sandbox Policy */}
      <div>
        <label className="text-xs font-medium text-foreground">{t("sandboxPolicy")}</label>
        <p className="text-[10px] text-muted-foreground mt-1 mb-3">{t("sandboxPolicyDesc")}</p>
        <div className="space-y-2">
          {SANDBOX_POLICIES.map((policy) => (
            <button
              key={policy.id}
              onClick={() => setSandboxPolicy(policy.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                sandboxPolicy === policy.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-accent",
              )}
            >
              <div className={cn(
                "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2",
                sandboxPolicy === policy.id
                  ? "border-primary bg-primary"
                  : "border-muted-foreground/30",
              )} />
              <div>
                <div className={cn(
                  "text-xs font-medium",
                  sandboxPolicy === policy.id ? "text-primary" : "text-foreground",
                )}>
                  {t(policy.labelKey)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {t(policy.descKey)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** MCP Marketplace — browse and install MCP servers from a catalog. */
function McpMarketplace() {
  const { t } = useI18n();
  const catalog = useMcpStore((s) => s.catalog);
  const catalogLoading = useMcpStore((s) => s.catalogLoading);
  const catalogError = useMcpStore((s) => s.catalogError);
  const fetchCatalog = useMcpStore((s) => s.fetchCatalog);
  const installFromCatalog = useMcpStore((s) => s.installFromCatalog);
  const servers = useMcpStore((s) => s.servers);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);

  useEffect(() => {
    if (!catalog) { fetchCatalog(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const entries = catalog?.servers ?? [];
  const categories = [...new Set(entries.map((e) => e.category))].sort();

  const filtered = entries.filter((e) => {
    const matchesSearch =
      !searchQuery ||
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || e.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleInstall = async (entry: typeof entries[0]) => {
    setInstallingId(entry.id);
    await installFromCatalog(entry);
    setInstallingId(null);
  };

  const isInstalled = (id: string) => servers.some((s) => s.id === id);

  const CATEGORY_ICONS: Record<string, string> = {
    filesystem: "📁",
    database: "🗄️",
    search: "🔍",
    devtools: "🛠️",
    utilities: "🔧",
    communication: "💬",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-foreground">{t("mcpMarketplace")}</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">{t("mcpMarketplaceDesc")}</p>
        </div>
        <button
          onClick={fetchCatalog}
          disabled={catalogLoading}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw size={10} className={catalogLoading ? "animate-spin" : ""} />
          {t("refresh") || "Refresh"}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("mcpSearchCatalog") || "Search servers..."}
          className="w-full rounded-md border border-input bg-background pl-8 pr-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
        />
      </div>

      {/* Category filters */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn(
              "rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors",
              !selectedCategory
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {t("all") || "All"}
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors",
                selectedCategory === cat
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {CATEGORY_ICONS[cat] ?? ""} {cat}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {catalogError && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-[10px] text-destructive">
          {catalogError}
        </div>
      )}

      {/* Loading */}
      {catalogLoading && !catalog && (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          {t("loading")}
        </div>
      )}

      {/* Catalog grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {filtered.map((entry) => {
            const installed = isInstalled(entry.id);
            const installing = installingId === entry.id;
            const requiresEnv = entry.env?.some((v) => v.required) ?? false;
            return (
              <div
                key={entry.id}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{CATEGORY_ICONS[entry.category] ?? "🔌"}</span>
                      <span className="text-xs font-medium text-foreground">{entry.name}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
                        {entry.category}
                      </span>
                      {entry.version && (
                        <span className="text-[9px] text-muted-foreground">v{entry.version}</span>
                      )}
                      {requiresEnv && (
                        <span className="rounded bg-yellow-500/10 px-1.5 py-0.5 text-[9px] text-yellow-500">
                          🔑 {t("mcpRequiresKey") || "Requires key"}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
                      {entry.description}
                    </p>
                    {/* Required env vars */}
                    {entry.env && entry.env.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {entry.env.map((ev) => (
                          <div key={ev.key} className="text-[9px] text-muted-foreground">
                            <code className="rounded bg-muted px-1 py-0.5 text-[8px]">{ev.key}</code>
                            {" — "}{ev.description}
                          </div>
                        ))}
                      </div>
                    )}
                    {entry.homepage && (
                      <a
                        href={entry.homepage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[9px] text-primary/70 hover:text-primary transition-colors"
                      >
                        <ExternalLink size={8} />
                        {t("mcpHomepage") || "Homepage"}
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => !installed && !installing && handleInstall(entry)}
                    disabled={installed || installing}
                    className={cn(
                      "shrink-0 rounded-md px-3 py-1.5 text-[10px] font-medium transition-colors",
                      installed
                        ? "bg-muted text-muted-foreground cursor-default"
                        : installing
                          ? "bg-primary/10 text-primary"
                          : "bg-primary/10 text-primary hover:bg-primary/20",
                    )}
                  >
                    {installing ? (
                      <Loader2 size={10} className="animate-spin inline" />
                    ) : installed ? (
                      t("mcpInstalled") || "Installed"
                    ) : (
                      t("mcpInstall") || "Install"
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!catalogLoading && filtered.length === 0 && catalog && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <Search size={20} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">{t("mcpNoCatalogResults") || "No servers found"}</p>
        </div>
      )}

      {/* Catalog metadata */}
      {catalog && (
        <div className="text-[9px] text-muted-foreground text-center">
          {entries.length} {t("mcpServersAvailable") || "servers available"} · {t("mcpCatalogUpdated") || "Updated"}: {catalog.updatedAt}
        </div>
      )}
    </div>
  );
}

function McpTab() {
  const { t } = useI18n();
  const servers = useMcpStore((s) => s.servers);
  const connectedIds = useMcpStore((s) => s.connectedIds);
  const loading = useMcpStore((s) => s.loading);
  const fetchServers = useMcpStore((s) => s.fetchServers);
  const fetchConnected = useMcpStore((s) => s.fetchConnected);
  const addServer = useMcpStore((s) => s.addServer);
  const updateServer = useMcpStore((s) => s.updateServer);
  const removeServer = useMcpStore((s) => s.removeServer);
  const toggleEnabled = useMcpStore((s) => s.toggleEnabled);
  const connectServer = useMcpStore((s) => s.connect);
  const disconnectServer = useMcpStore((s) => s.disconnect);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formTransport, setFormTransport] = useState<"stdio" | "sse">("stdio");
  const [formCommand, setFormCommand] = useState("");
  const [formArgs, setFormArgs] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);

  // MCP server presets for quick-add
  const MCP_PRESETS: Array<{
    id: string;
    nameKey: string;
    descKey: string;
    transport: "stdio";
    command: string;
    args: string[];
    icon: string;
  }> = [
    { id: "mcp-preset-filesystem", nameKey: "mcpPresetFilesystem", descKey: "mcpPresetFilesystemDesc", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "~/Documents"], icon: "📁" },
    { id: "mcp-preset-github", nameKey: "mcpPresetGithub", descKey: "mcpPresetGithubDesc", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], icon: "🐙" },
    { id: "mcp-preset-memory", nameKey: "mcpPresetMemory", descKey: "mcpPresetMemoryDesc", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], icon: "🧠" },
    { id: "mcp-preset-fetch", nameKey: "mcpPresetFetch", descKey: "mcpPresetFetchDesc", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-fetch"], icon: "🌐" },
    { id: "mcp-preset-postgres", nameKey: "mcpPresetPostgres", descKey: "mcpPresetPostgresDesc", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres"], icon: "🐘" },
    { id: "mcp-preset-sqlite", nameKey: "mcpPresetSqlite", descKey: "mcpPresetSqliteDesc", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-sqlite", "--db", "devpilot.db"], icon: "🗄️" },
    { id: "mcp-preset-brave-search", nameKey: "mcpPresetBraveSearch", descKey: "mcpPresetBraveSearchDesc", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-brave-search"], icon: "🔍" },
    { id: "mcp-preset-puppeteer", nameKey: "mcpPresetPuppeteer", descKey: "mcpPresetPuppeteerDesc", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-puppeteer"], icon: "🎭" },
    { id: "mcp-preset-sentry", nameKey: "mcpPresetSentry", descKey: "mcpPresetSentryDesc", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-sentry"], icon: "🛡️" },
    { id: "mcp-preset-everything", nameKey: "mcpPresetEverything", descKey: "mcpPresetEverythingDesc", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-everything"], icon: "🧪" },
  ];

  useEffect(() => {
    fetchServers();
    fetchConnected();
  }, [fetchServers, fetchConnected]);

  const resetForm = () => {
    setFormName("");
    setFormTransport("stdio");
    setFormCommand("");
    setFormArgs("");
    setFormUrl("");
    setFormEnabled(true);
    setShowAddForm(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!formName.trim()) { return; }
    const server = {
      id: editingId ?? `mcp-${Date.now()}`,
      name: formName.trim(),
      transport: formTransport,
      command: formTransport === "stdio" ? formCommand.trim() || undefined : undefined,
      args: formTransport === "stdio" && formArgs.trim() ? formArgs.split(",").map((a) => a.trim()).filter(Boolean) : undefined,
      url: formTransport === "sse" ? formUrl.trim() || undefined : undefined,
      enabled: formEnabled,
      createdAt: new Date().toISOString(),
    };
    if (editingId) {
      await updateServer(server as McpServerConfig);
    } else {
      await addServer(server as McpServerConfig);
    }
    resetForm();
  };

  const handleEdit = (srv: McpServerConfig) => {
    setEditingId(srv.id);
    setFormName(srv.name);
    setFormTransport(srv.transport);
    setFormCommand(srv.command ?? "");
    setFormArgs(srv.args?.join(", ") ?? "");
    setFormUrl(srv.url ?? "");
    setFormEnabled(srv.enabled);
    setShowAddForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("mcpServers")}</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">Model Context Protocol servers</p>
        </div>
        {!showAddForm && (
          <button
            onClick={() => { resetForm(); setShowAddForm(true); }}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus size={12} />
            {t("mcpAddServer")}
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          {t("loading")}
        </div>
      )}

      {/* Server list */}
      <div className="space-y-2">
        {servers.map((srv) => {
          const isConnected = connectedIds.includes(srv.id);
          return (
            <div key={srv.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{srv.name}</span>
                  <span className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    srv.transport === "stdio"
                      ? "bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
                      : "bg-green-500/10 text-green-500",
                  )}>
                    {srv.transport === "stdio" ? t("mcpStdio") : t("mcpSse")}
                  </span>
                  <span className={cn(
                    "rounded px-1.5 py-0.5 text-[10px]",
                    isConnected
                      ? "bg-green-500/10 text-green-500"
                      : "bg-muted text-muted-foreground",
                  )}>
                    {isConnected ? t("mcpConnected") : t("mcpDisconnected")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleEnabled(srv.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title={t("mcpEnabled")}
                  >
                    {srv.enabled ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
                  </button>
                  {isConnected ? (
                    <button
                      onClick={() => disconnectServer(srv.id)}
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {t("mcpDisconnect")}
                    </button>
                  ) : (
                    <button
                      onClick={() => connectServer(srv.id)}
                      disabled={!srv.enabled}
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                    >
                      {t("mcpConnect")}
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(srv)}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => removeServer(srv.id)}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {servers.length === 0 && !showAddForm && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Wrench size={24} className="mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">
              {t("mcpNoServers")}
            </p>
          </div>
        )}
      </div>

      {/* Popular presets */}
      {!showAddForm && (
        <div className="space-y-2">
          <div>
            <h3 className="text-xs font-semibold text-foreground">{t("mcpPresets")}</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">{t("mcpPresetsDesc")}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {MCP_PRESETS.map((preset) => {
              const alreadyAdded = servers.some((s) => s.id === preset.id);
              return (
                <div key={preset.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm shrink-0">{preset.icon}</span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-foreground truncate">{t(preset.nameKey)}</div>
                      <div className="text-[9px] text-muted-foreground truncate">{t(preset.descKey)}</div>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (alreadyAdded) { return; }
                      await addServer({
                        id: preset.id,
                        name: t(preset.nameKey),
                        transport: preset.transport,
                        command: preset.command,
                        args: preset.args,
                        enabled: true,
                        createdAt: new Date().toISOString(),
                      });
                    }}
                    disabled={alreadyAdded}
                    className={cn(
                      "shrink-0 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                      alreadyAdded
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary hover:bg-primary/20",
                    )}
                  >
                    {alreadyAdded ? t("mcpQuickAdded") : t("mcpQuickAdd")}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Marketplace */}
      {!showAddForm && <McpMarketplace />}

      {/* Add/Edit form */}
      {showAddForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">
              {editingId ? t("mcpSave") : t("mcpAddServer")}
            </span>
            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("mcpName")}
              </label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="My MCP Server"
                className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("mcpTransport")}
              </label>
              <select
                value={formTransport}
                onChange={(e) => setFormTransport(e.target.value as "stdio" | "sse")}
                className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-ring"
              >
                <option value="stdio">{t("mcpStdio")}</option>
                <option value="sse">{t("mcpSse")}</option>
              </select>
            </div>
            {formTransport === "stdio" && (
              <>
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t("mcpCommand")}
                  </label>
                  <input
                    value={formCommand}
                    onChange={(e) => setFormCommand(e.target.value)}
                    placeholder="npx"
                    className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t("mcpArgs")}
                  </label>
                  <input
                    value={formArgs}
                    onChange={(e) => setFormArgs(e.target.value)}
                    placeholder="-y, @modelcontextprotocol/server-memory"
                    className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
                  />
                </div>
              </>
            )}
            {formTransport === "sse" && (
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t("mcpUrl")}
                </label>
                <input
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="http://localhost:3001/sse"
                  className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFormEnabled(!formEnabled)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {formEnabled ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
              </button>
              <span className="text-xs text-muted-foreground">{t("mcpEnabled")}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!formName.trim()}
              className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {t("mcpSave")}
            </button>
            <button
              onClick={resetForm}
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

// --- Persona & Memory Tab Wrapper ---

function PersonaMemoryTabWrapper() {
  const { t } = useI18n();
  const workingDir = useUIStore((s) => s.workingDir);
  const [dataDir, setDataDir] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dir = await getAppDataDir();
        if (!cancelled) { setDataDir(dir); }
      } catch {
        if (!cancelled) { setDataDir(""); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!workingDir && !dataDir) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t("personaAndMemory")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("personaAndMemoryDesc")}</p>
        </div>
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <BookOpen size={24} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">{t("personaNoWorkspace")}</p>
        </div>
      </div>
    );
  }

  return (
    <PersonaMemoryTab
      workspaceDir={workingDir || dataDir}
      dataDir={dataDir || workingDir}
    />
  );
}

// --- Data Management Tab ---

type ImportStrategyType = "overwrite" | "merge" | "skipExisting";

interface ImportResultData {
  sessionsImported: number;
  messagesImported: number;
  providersImported: number;
  settingsImported: number;
  usageImported: number;
  skipped: number;
  errors: string[];
}

function DataTab() {
  const { t } = useI18n();
  const [strategy, setStrategy] = useState<ImportStrategyType>("skipExisting");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [importResult, setImportResult] = useState<ImportResultData | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setMessage(null);
    setImportResult(null);
    try {
      // Use Tauri dialog to pick save location
      const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      let filePath: string | null = null;

      if (isTauriRuntime) {
        const dialog: Record<string, unknown> = await import("@tauri-apps/plugin-dialog") as Record<string, unknown>;
        filePath = await (dialog.save as (opts: Record<string, unknown>) => Promise<string | null>)({
          defaultPath: `devpilot-backup-${new Date().toISOString().slice(0, 10)}.json`,
          filters: [{ name: "JSON", extensions: ["json"] }],
        });
      }

      if (!filePath) {
        // User cancelled or not in Tauri — export as JSON download
        const json = await invoke<string>("export_data");
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `devpilot-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setMessage({ type: "success", text: t("exportSuccess") });
      } else {
        await invoke("export_to_file", { path: filePath });
        setMessage({ type: "success", text: t("exportSuccess") });
      }
    } catch (e: unknown) {
      setMessage({ type: "error", text: String(e) });
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setMessage(null);
    setImportResult(null);
    try {
      const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      let filePath: string | null = null;

      if (isTauriRuntime) {
        const dialog: Record<string, unknown> = await import("@tauri-apps/plugin-dialog") as Record<string, unknown>;
        filePath = await (dialog.open as (opts: Record<string, unknown>) => Promise<string | null>)({
          filters: [{ name: "JSON", extensions: ["json"] }],
          multiple: false,
        });
      }

      if (!filePath) {
        // Fallback: file input
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) { setImporting(false); return; }
          const text = await file.text();
          const result = await invoke<ImportResultData>("import_data", {
            jsonData: text,
            strategy,
          });
          setImportResult(result);
          setMessage({ type: "success", text: t("importSuccess") });
          setImporting(false);
        };
        input.click();
        return; // async callback handles cleanup
      }

      const result = await invoke<ImportResultData>("import_from_file", {
        path: filePath,
        strategy,
      });
      setImportResult(result);
      setMessage({ type: "success", text: t("importSuccess") });
    } catch (e: unknown) {
      setMessage({ type: "error", text: String(e) });
    } finally {
      setImporting(false);
    }
  };

  const strategies: { value: ImportStrategyType; label: string; desc: string }[] = [
    { value: "overwrite", label: t("strategyOverwrite"), desc: t("strategyOverwriteDesc") },
    { value: "merge", label: t("strategyMerge"), desc: t("strategyMergeDesc") },
    { value: "skipExisting", label: t("strategySkipExisting"), desc: t("strategySkipExistingDesc") },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t("dataManagement")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("dataManagementDesc")}</p>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-500" />
        <span className="text-xs text-amber-600 dark:text-amber-400">{t("dataWarning")}</span>
      </div>

      {/* Export Section */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Download size={16} className="text-primary" />
          <span className="text-sm font-medium text-foreground">{t("exportAllData")}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t("exportAllDataDesc")}</p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {exporting ? t("exporting") : t("exportAllData")}
        </button>
      </div>

      {/* Import Section */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Upload size={16} className="text-primary" />
          <span className="text-sm font-medium text-foreground">{t("importData")}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t("importDataDesc")}</p>

        {/* Strategy Selector */}
        <div className="space-y-2">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("importStrategy")}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {strategies.map((s) => (
              <button
                key={s.value}
                onClick={() => setStrategy(s.value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md border px-3 py-2 text-xs transition-colors",
                  strategy === s.value
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border text-muted-foreground hover:bg-accent/50",
                )}
              >
                <span>{s.label}</span>
                <span className="text-[9px] opacity-70">{s.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleImport}
          disabled={importing}
          className="flex items-center gap-2 rounded-md border border-primary px-4 py-2 text-xs text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
        >
          {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {importing ? t("importing") : t("importData")}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-3 text-xs",
            message.type === "success"
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {message.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
          {message.text}
        </div>
      )}

      {/* Import Result Summary */}
      {importResult && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-foreground">{t("importResult")}</div>
          <div className="grid grid-cols-3 gap-3">
            <ResultStat label={t("sessionsImported")} value={importResult.sessionsImported} />
            <ResultStat label={t("messagesImported")} value={importResult.messagesImported} />
            <ResultStat label={t("providersImported")} value={importResult.providersImported} />
            <ResultStat label={t("settingsImported")} value={importResult.settingsImported} />
            <ResultStat label={t("usageImported")} value={importResult.usageImported} />
            <ResultStat label={t("skipped")} value={importResult.skipped} />
          </div>
          {importResult.errors.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-medium uppercase tracking-wider text-destructive">
                {t("errors")} ({importResult.errors.length})
              </div>
              {importResult.errors.slice(0, 5).map((err, i) => (
                <div key={i} className="text-[10px] text-muted-foreground truncate">
                  {err}
                </div>
              ))}
              {importResult.errors.length > 5 && (
                <div className="text-[10px] text-muted-foreground">
                  ...and {importResult.errors.length - 5} more
                </div>
              )}
            </div>
          )}
          {importResult.errors.length === 0 && (
            <div className="text-[10px] text-green-500">{t("noErrors")}</div>
          )}
        </div>
      )}

      {/* Claude Code Import Section */}
      <ClaudeImportSection />
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-center">
      <div className="text-lg font-semibold text-foreground">{value}</div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

// --- Claude Code Import Section ---

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ClaudeImportSection() {
  const { t } = useI18n();
  const [threads, setThreads] = useState<ClaudeThreadInfoIPC[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [importResult, setImportResult] =
    useState<ClaudeImportResultIPC | null>(null);

  const handleScan = async () => {
    setScanning(true);
    setMessage(null);
    setImportResult(null);
    try {
      const found = await scanClaudeThreads();
      setThreads(found);
      setScanned(true);
      setSelectedPaths(new Set());
      if (found.length === 0) {
        setMessage({
          type: "error",
          text: t("claudeNoThreadsFound"),
        });
      }
    } catch (e: unknown) {
      setMessage({ type: "error", text: String(e) });
    } finally {
      setScanning(false);
    }
  };

  const handleScanFrom = async () => {
    const isTauriRuntime =
      typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isTauriRuntime) {
      setMessage({
        type: "error",
        text: "Directory picker requires Tauri runtime.",
      });
      return;
    }
    try {
      const dialog: Record<string, unknown> =
        await import("@tauri-apps/plugin-dialog");
      const dirPath = await (dialog.open as (opts: Record<string, unknown>) => Promise<string | null>)({
        directory: true,
        multiple: false,
      });
      if (!dirPath) {
        return;
      }

      setScanning(true);
      setMessage(null);
      setImportResult(null);
      const found = await scanClaudeThreadsFrom(dirPath);
      setThreads(found);
      setScanned(true);
      setSelectedPaths(new Set());
      if (found.length === 0) {
        setMessage({
          type: "error",
          text: t("claudeNoThreadsFound"),
        });
      }
    } catch (e: unknown) {
      setMessage({ type: "error", text: String(e) });
    } finally {
      setScanning(false);
    }
  };

  const toggleThread = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedPaths.size === threads.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(threads.map((t) => t.path)));
    }
  };

  const handleImportSelected = async () => {
    if (selectedPaths.size === 0) {
      return;
    }
    setImporting(true);
    setMessage(null);
    setImportResult(null);
    try {
      const paths = Array.from(selectedPaths);
      const result = await importClaudeThreadsBatch(paths);
      setImportResult(result);
      setMessage({
        type: "success",
        text: t("claudeImportSuccess")
          .replace("{count}", String(result.sessionsImported))
          .replace("{messages}", String(result.messagesImported)),
      });
      // Clear selection after successful import
      setSelectedPaths(new Set());
    } catch (e: unknown) {
      setMessage({ type: "error", text: String(e) });
    } finally {
      setImporting(false);
    }
  };

  const handleImportAll = async () => {
    if (threads.length === 0) {
      return;
    }
    setImporting(true);
    setMessage(null);
    setImportResult(null);
    try {
      const paths = threads.map((t) => t.path);
      const result = await importClaudeThreadsBatch(paths);
      setImportResult(result);
      setMessage({
        type: "success",
        text: t("claudeImportSuccess")
          .replace("{count}", String(result.sessionsImported))
          .replace("{messages}", String(result.messagesImported)),
      });
      setSelectedPaths(new Set());
    } catch (e: unknown) {
      setMessage({ type: "error", text: String(e) });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-primary" />
        <span className="text-sm font-medium text-foreground">
          {t("claudeImport")}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{t("claudeImportDesc")}</p>

      {/* Scan Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleScan}
          disabled={scanning || importing}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {scanning ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <FolderOpen size={14} />
          )}
          {scanning ? t("scanning") : t("claudeScan")}
        </button>
        <button
          onClick={handleScanFrom}
          disabled={scanning || importing}
          className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-xs text-muted-foreground hover:bg-accent/50 transition-colors disabled:opacity-50"
        >
          <FolderOpen size={14} />
          {t("claudeScanFrom")}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-3 text-xs",
            message.type === "success"
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {message.type === "success" ? (
            <Check size={14} />
          ) : (
            <AlertCircle size={14} />
          )}
          {message.text}
        </div>
      )}

      {/* Thread List */}
      {scanned && threads.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t("claudeSelectThreads")} ({threads.length}{" "}
              {t("claudeThreadMessages")})
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleAll}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {selectedPaths.size === threads.length ? (
                  <CheckSquare size={12} />
                ) : (
                  <Square size={12} />
                )}
                {selectedPaths.size === threads.length
                  ? t("deselectAll")
                  : t("selectAll")}
              </button>
            </div>
          </div>

          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border">
            {threads.map((thread) => (
              <button
                key={thread.path}
                onClick={() => toggleThread(thread.path)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/30",
                  selectedPaths.has(thread.path) && "bg-primary/5",
                )}
              >
                {selectedPaths.has(thread.path) ? (
                  <CheckSquare size={14} className="shrink-0 text-primary" />
                ) : (
                  <Square
                    size={14}
                    className="shrink-0 text-muted-foreground"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-foreground">
                    {thread.filename}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {thread.preview}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] text-muted-foreground">
                    {thread.messageCount} {t("claudeThreadMessages")}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70">
                    {formatBytes(thread.sizeBytes)}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Import Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleImportSelected}
              disabled={importing || selectedPaths.size === 0}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {importing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              {importing
                ? t("claudeImporting")
                : `${t("claudeImportSelected")} (${selectedPaths.size})`}
            </button>
            <button
              onClick={handleImportAll}
              disabled={importing || threads.length === 0}
              className="flex items-center gap-2 rounded-md border border-primary px-4 py-2 text-xs text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
            >
              {t("claudeImportAll")} ({threads.length})
            </button>
          </div>
        </div>
      )}

      {/* Import Result */}
      {importResult && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-foreground">
            {t("importResult")}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <ResultStat
              label={t("sessionsImported")}
              value={importResult.sessionsImported}
            />
            <ResultStat
              label={t("messagesImported")}
              value={importResult.messagesImported}
            />
            <ResultStat
              label={t("skipped")}
              value={importResult.messagesSkipped}
            />
          </div>
          {importResult.warnings.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-medium uppercase tracking-wider text-amber-500">
                Warnings ({importResult.warnings.length})
              </div>
              {importResult.warnings.slice(0, 5).map((w, i) => (
                <div
                  key={i}
                  className="text-[10px] text-muted-foreground truncate"
                >
                  {w}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Config Tab (P13) ---

/** Default config matching Rust-side ConfigFile::default() */
const DEFAULT_CONFIG: ConfigFileIPC = {
  general: { theme: "dark", language: "en" },
  chat: { maxContextTokens: 128000, compactThreshold: 0.8, stream: true, defaultMode: "code", showThinking: false },
  sandbox: { policy: "moderate", allowedCommands: [], blockedCommands: [], timeoutSecs: 120, maxOutputBytes: 1000000 },
  terminal: { fontFamily: "Menlo", fontSize: 14, scrollback: 10000 },
  ui: { fontSize: 14, showSidebar: true, sidebarWidth: 280, messageMaxWidth: "max-w-3xl" },
  providers: {},
};

function ConfigTab() {
  const { t } = useI18n();
  const [config, setConfig] = useState<ConfigFileIPC>(DEFAULT_CONFIG);
  const [globalExists, setGlobalExists] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const exists = await configGlobalExists();
      setGlobalExists(exists);
      if (exists) {
        const cfg = await configLoadGlobal();
        setConfig(cfg);
      } else {
        setConfig(DEFAULT_CONFIG);
      }
    } catch {
      setMessage({ text: t("configLoadError"), type: "error" });
    }
  }, [t]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await configSaveGlobal(config);
      setGlobalExists(true);
      setMessage({ text: t("configSaved"), type: "success" });
    } catch {
      setMessage({ text: t("configSaveError"), type: "error" });
    }
    setSaving(false);
  }

  async function handleDelete() {
    try {
      await configDeleteGlobal();
      setGlobalExists(false);
      setConfig(DEFAULT_CONFIG);
      setMessage({ text: t("configDeleted"), type: "success" });
    } catch {
      setMessage({ text: t("configDeleteError"), type: "error" });
    }
  }

  function updateGeneral<K extends keyof ConfigFileIPC["general"]>(key: K, value: ConfigFileIPC["general"][K]) {
    setConfig((c) => ({ ...c, general: { ...c.general, [key]: value } }));
  }
  function updateChat<K extends keyof ConfigFileIPC["chat"]>(key: K, value: ConfigFileIPC["chat"][K]) {
    setConfig((c) => ({ ...c, chat: { ...c.chat, [key]: value } }));
  }
  function updateSandbox<K extends keyof ConfigFileIPC["sandbox"]>(key: K, value: ConfigFileIPC["sandbox"][K]) {
    setConfig((c) => ({ ...c, sandbox: { ...c.sandbox, [key]: value } }));
  }
  function updateTerminal<K extends keyof ConfigFileIPC["terminal"]>(key: K, value: ConfigFileIPC["terminal"][K]) {
    setConfig((c) => ({ ...c, terminal: { ...c.terminal, [key]: value } }));
  }
  function updateUi<K extends keyof ConfigFileIPC["ui"]>(key: K, value: ConfigFileIPC["ui"][K]) {
    setConfig((c) => ({ ...c, ui: { ...c.ui, [key]: value } }));
  }
  function updateProviders<K extends keyof ConfigFileIPC["providers"]>(key: K, value: ConfigFileIPC["providers"][K]) {
    setConfig((c) => ({ ...c, providers: { ...c.providers, [key]: value } }));
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-sm font-semibold">{t("configGlobal")}</h3>
        <p className="text-[11px] text-muted-foreground mt-1">{t("configLayerInfo")}</p>
        {globalExists && (
          <span className="inline-block mt-1 text-[10px] text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            {t("configHasGlobal")}
          </span>
        )}
      </div>

      {message && (
        <div
          className={cn(
            "text-xs px-3 py-2 rounded-md",
            message.type === "success"
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-red-500/10 text-red-600",
          )}
        >
          {message.text}
        </div>
      )}

      {/* General Section */}
      <ConfigSection title={t("configGeneral")}>
        <ConfigField label={t("configDefaultProvider")}>
          <input
            className="cfg-input"
            value={config.general.defaultProvider ?? ""}
            onChange={(e) => updateGeneral("defaultProvider", e.target.value || null)}
            placeholder="e.g. anthropic"
          />
        </ConfigField>
        <ConfigField label={t("configDefaultModel")}>
          <input
            className="cfg-input"
            value={config.general.defaultModel ?? ""}
            onChange={(e) => updateGeneral("defaultModel", e.target.value || null)}
            placeholder="e.g. claude-sonnet-4-20250514"
          />
        </ConfigField>
        <ConfigField label={t("configTheme")}>
          <select
            className="cfg-input"
            value={config.general.theme}
            onChange={(e) => updateGeneral("theme", e.target.value)}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">System</option>
          </select>
        </ConfigField>
        <ConfigField label={t("configLanguage")}>
          <select
            className="cfg-input"
            value={config.general.language}
            onChange={(e) => updateGeneral("language", e.target.value)}
          >
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </ConfigField>
        <ConfigField label={t("configWorkingDir")}>
          <input
            className="cfg-input"
            value={config.general.workingDirectory ?? ""}
            onChange={(e) => updateGeneral("workingDirectory", e.target.value || null)}
            placeholder="Default: OS home"
          />
        </ConfigField>
      </ConfigSection>

      {/* Chat Section */}
      <ConfigSection title={t("configChat")}>
        <ConfigField label={t("configMaxContextTokens")}>
          <input
            className="cfg-input"
            type="number"
            value={config.chat.maxContextTokens}
            onChange={(e) => updateChat("maxContextTokens", Number(e.target.value))}
          />
        </ConfigField>
        <ConfigField label={t("configCompactThreshold")}>
          <input
            className="cfg-input"
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={config.chat.compactThreshold}
            onChange={(e) => updateChat("compactThreshold", Number(e.target.value))}
          />
        </ConfigField>
        <ConfigField label={t("configStream")}>
          <ToggleSwitch
            checked={config.chat.stream}
            onChange={(v) => updateChat("stream", v)}
          />
        </ConfigField>
        <ConfigField label={t("configDefaultMode")}>
          <select
            className="cfg-input"
            value={config.chat.defaultMode}
            onChange={(e) => updateChat("defaultMode", e.target.value)}
          >
            <option value="code">Code</option>
            <option value="plan">Plan</option>
            <option value="ask">Ask</option>
          </select>
        </ConfigField>
        <ConfigField label={t("configReasoningEffort")}>
          <select
            className="cfg-input"
            value={config.chat.reasoningEffort ?? ""}
            onChange={(e) => updateChat("reasoningEffort", e.target.value || null)}
          >
            <option value="">Default</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </ConfigField>
        <ConfigField label={t("configShowThinking")}>
          <ToggleSwitch
            checked={config.chat.showThinking}
            onChange={(v) => updateChat("showThinking", v)}
          />
        </ConfigField>
      </ConfigSection>

      {/* Sandbox Section */}
      <ConfigSection title={t("configSandbox")}>
        <ConfigField label={t("configSandboxPolicy")}>
          <select
            className="cfg-input"
            value={config.sandbox.policy}
            onChange={(e) => updateSandbox("policy", e.target.value)}
          >
            <option value="strict">Strict</option>
            <option value="moderate">Moderate</option>
            <option value="permissive">Permissive</option>
            <option value="none">None</option>
          </select>
        </ConfigField>
        <ConfigField label={t("configTimeoutSecs")}>
          <input
            className="cfg-input"
            type="number"
            value={config.sandbox.timeoutSecs}
            onChange={(e) => updateSandbox("timeoutSecs", Number(e.target.value))}
          />
        </ConfigField>
        <ConfigField label={t("configMaxOutputBytes")}>
          <input
            className="cfg-input"
            type="number"
            value={config.sandbox.maxOutputBytes}
            onChange={(e) => updateSandbox("maxOutputBytes", Number(e.target.value))}
          />
        </ConfigField>
      </ConfigSection>

      {/* Terminal Section */}
      <ConfigSection title={t("configTerminal")}>
        <ConfigField label={t("configShell")}>
          <input
            className="cfg-input"
            value={config.terminal.shell ?? ""}
            onChange={(e) => updateTerminal("shell", e.target.value || null)}
            placeholder="Default: OS shell"
          />
        </ConfigField>
        <ConfigField label={t("configFontFamily")}>
          <input
            className="cfg-input"
            value={config.terminal.fontFamily}
            onChange={(e) => updateTerminal("fontFamily", e.target.value)}
          />
        </ConfigField>
        <ConfigField label={t("configFontSize")}>
          <input
            className="cfg-input"
            type="number"
            value={config.terminal.fontSize}
            onChange={(e) => updateTerminal("fontSize", Number(e.target.value))}
          />
        </ConfigField>
        <ConfigField label={t("configScrollback")}>
          <input
            className="cfg-input"
            type="number"
            value={config.terminal.scrollback}
            onChange={(e) => updateTerminal("scrollback", Number(e.target.value))}
          />
        </ConfigField>
      </ConfigSection>

      {/* UI Section */}
      <ConfigSection title={t("configUi")}>
        <ConfigField label={t("configFontSize")}>
          <input
            className="cfg-input"
            type="number"
            value={config.ui.fontSize}
            onChange={(e) => updateUi("fontSize", Number(e.target.value))}
          />
        </ConfigField>
        <ConfigField label={t("configShowSidebar")}>
          <ToggleSwitch
            checked={config.ui.showSidebar}
            onChange={(v) => updateUi("showSidebar", v)}
          />
        </ConfigField>
        <ConfigField label={t("configSidebarWidth")}>
          <input
            className="cfg-input"
            type="number"
            value={config.ui.sidebarWidth}
            onChange={(e) => updateUi("sidebarWidth", Number(e.target.value))}
          />
        </ConfigField>
        <ConfigField label={t("configMessageMaxWidth")}>
          <select
            className="cfg-input"
            value={config.ui.messageMaxWidth}
            onChange={(e) => updateUi("messageMaxWidth", e.target.value)}
          >
            <option value="max-w-2xl">Small (max-w-2xl)</option>
            <option value="max-w-3xl">Medium (max-w-3xl)</option>
            <option value="max-w-4xl">Large (max-w-4xl)</option>
            <option value="max-w-5xl">Extra Large (max-w-5xl)</option>
            <option value="max-w-none">Full Width</option>
          </select>
        </ConfigField>
      </ConfigSection>

      {/* Providers Section */}
      <ConfigSection title={t("configProviders")}>
        <ConfigField label={t("configOpenaiBaseUrl")}>
          <input
            className="cfg-input"
            value={config.providers.openaiBaseUrl ?? ""}
            onChange={(e) => updateProviders("openaiBaseUrl", e.target.value || null)}
            placeholder="https://api.openai.com/v1"
          />
        </ConfigField>
        <ConfigField label={t("configAnthropicBaseUrl")}>
          <input
            className="cfg-input"
            value={config.providers.anthropicBaseUrl ?? ""}
            onChange={(e) => updateProviders("anthropicBaseUrl", e.target.value || null)}
            placeholder="https://api.anthropic.com"
          />
        </ConfigField>
        <ConfigField label={t("configOllamaBaseUrl")}>
          <input
            className="cfg-input"
            value={config.providers.ollamaBaseUrl ?? ""}
            onChange={(e) => updateProviders("ollamaBaseUrl", e.target.value || null)}
            placeholder="http://localhost:11434"
          />
        </ConfigField>
        <ConfigField label={t("configGoogleBaseUrl")}>
          <input
            className="cfg-input"
            value={config.providers.googleBaseUrl ?? ""}
            onChange={(e) => updateProviders("googleBaseUrl", e.target.value || null)}
            placeholder="https://generativelanguage.googleapis.com"
          />
        </ConfigField>
        <ConfigField label={t("configRequestTimeoutSecs")}>
          <input
            className="cfg-input"
            type="number"
            value={config.providers.requestTimeoutSecs ?? ""}
            onChange={(e) => updateProviders("requestTimeoutSecs", e.target.value ? Number(e.target.value) : null)}
            placeholder="Default: 300"
          />
        </ConfigField>
        <ConfigField label={t("configRetryAttempts")}>
          <input
            className="cfg-input"
            type="number"
            value={config.providers.retryAttempts ?? ""}
            onChange={(e) => updateProviders("retryAttempts", e.target.value ? Number(e.target.value) : null)}
            placeholder="Default: 3"
          />
        </ConfigField>
      </ConfigSection>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-xs font-medium text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {saving && <Loader2 size={12} className="animate-spin" />}
          <Check size={12} />
          {t("configSave")}
        </button>
        {globalExists && (
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 rounded-md border border-red-500/30 px-4 py-2 text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={12} />
            {t("configDelete")}
          </button>
        )}
      </div>
    </div>
  );
}

/** Reusable config section with title. */
function ConfigSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-foreground/80 uppercase tracking-wider border-b border-border pb-1">
        {title}
      </div>
      <div className="space-y-2.5 pl-1">{children}</div>
    </div>
  );
}

/** Reusable config field with label + value. */
function ConfigField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-40 shrink-0 text-[11px] text-muted-foreground">{label}</div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

/** Toggle switch component. */
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
        checked ? "bg-accent" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 rounded-full bg-[var(--color-surface-container-lowest)] shadow transition-transform",
          checked ? "translate-x-4.5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
