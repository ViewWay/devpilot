import { create } from "zustand";
import { invoke, isTauriRuntime } from "../lib/ipc";
import type { ProviderRecordIPC } from "../lib/ipc";
import { mapProviderType } from "../lib/utils";

export interface Provider {
  id: string;
  name: string;
  providerType?: string;
  baseUrl: string;
  apiKey: string;
  models: ModelConfig[];
  enabled: boolean;
  lastTested?: string;
  testStatus?: "ok" | "error";
  testError?: string;
  /** Ordered IDs of fallback providers to try on retryable errors. */
  fallbackProviderIds?: string[];
}

export interface ModelConfig {
  id: string;
  name: string;
  maxTokens: number;
  /** Max output tokens. Defaults to 8192 if not specified. */
  maxOutputTokens?: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
  inputPrice?: number; // per 1M tokens
  outputPrice?: number;
}

/** Mirrors Rust DiagnosticCheck (camelCase via serde). */
export interface DiagnosticCheck {
  name: string;
  severity: "ok" | "warning" | "error";
  message: string;
  suggestion?: string;
}

/** Mirrors Rust DiagnosticReport (camelCase via serde). */
export interface DiagnosticReport {
  providerId: string;
  providerName: string;
  healthy: boolean;
  durationMs: number;
  checks: DiagnosticCheck[];
  modelsCount?: number;
}

export interface ProviderStore {
  providers: Provider[];
  hydrated: boolean;
  /** Last diagnostic report keyed by provider id. */
  diagnosticReports: Record<string, DiagnosticReport>;

  // Actions
  hydrateFromBackend: () => Promise<void>;
  addProvider: (provider: Omit<Provider, "id">) => string;
  updateProvider: (id: string, partial: Partial<Provider>) => void;
  removeProvider: (id: string) => void;
  testConnection: (id: string) => Promise<boolean>;
  diagnoseProvider: (id: string) => Promise<DiagnosticReport | null>;
  setApiKey: (id: string, key: string) => void;
  getEnabledProviders: () => Provider[];
  getProviderById: (id: string) => Provider | undefined;
}

let nextId = 200;
function genId() {
  return `provider-${++nextId}`;
}

// Default providers (pre-configured, but need API keys)
const DEFAULT_PROVIDERS: Provider[] = [
  {
    id: "provider-anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    apiKey: "",
    models: [
      { id: "claude-4-sonnet", name: "Claude 4 Sonnet", maxTokens: 200000, maxOutputTokens: 16384, supportsStreaming: true, supportsVision: true, inputPrice: 3, outputPrice: 15 },
      { id: "claude-4-opus", name: "Claude 4 Opus", maxTokens: 200000, maxOutputTokens: 32768, supportsStreaming: true, supportsVision: true, inputPrice: 15, outputPrice: 75 },
      { id: "claude-4-haiku", name: "Claude 4 Haiku", maxTokens: 200000, maxOutputTokens: 8192, supportsStreaming: true, supportsVision: true, inputPrice: 0.8, outputPrice: 4 },
    ],
    enabled: true,
  },
  {
    id: "provider-openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    models: [
      { id: "gpt-5.2", name: "GPT-5.2", maxTokens: 128000, maxOutputTokens: 16384, supportsStreaming: true, supportsVision: true, inputPrice: 2.5, outputPrice: 10 },
      { id: "gpt-5.2-mini", name: "GPT-5.2 Mini", maxTokens: 128000, maxOutputTokens: 16384, supportsStreaming: true, supportsVision: false, inputPrice: 0.6, outputPrice: 2.4 },
      { id: "o3-pro", name: "o3 Pro", maxTokens: 200000, maxOutputTokens: 32768, supportsStreaming: true, supportsVision: true, inputPrice: 10, outputPrice: 40 },
    ],
    enabled: true,
  },
  {
    id: "provider-zhipu",
    name: "智谱 AI",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKey: "",
    models: [
      { id: "glm-5", name: "GLM-5", maxTokens: 128000, supportsStreaming: true, supportsVision: true, inputPrice: 0.05, outputPrice: 0.05 },
      { id: "glm-5-turbo", name: "GLM-5 Turbo", maxTokens: 128000, supportsStreaming: true, supportsVision: false, inputPrice: 0.01, outputPrice: 0.01 },
    ],
    enabled: true,
  },
  {
    id: "provider-deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    models: [
      { id: "deepseek-v3", name: "DeepSeek V3", maxTokens: 64000, maxOutputTokens: 8192, supportsStreaming: true, supportsVision: false, inputPrice: 0.14, outputPrice: 0.28 },
      { id: "deepseek-r1", name: "DeepSeek R1", maxTokens: 64000, maxOutputTokens: 16384, supportsStreaming: true, supportsVision: false, inputPrice: 0.55, outputPrice: 2.19 },
    ],
    enabled: true,
  },
  {
    id: "provider-google",
    name: "Google AI",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKey: "",
    models: [
      { id: "gemini-3-pro", name: "Gemini 3 Pro", maxTokens: 1000000, maxOutputTokens: 65536, supportsStreaming: true, supportsVision: true, inputPrice: 1.25, outputPrice: 10 },
      { id: "gemini-3-flash", name: "Gemini 3 Flash", maxTokens: 1000000, maxOutputTokens: 65536, supportsStreaming: true, supportsVision: true, inputPrice: 0.15, outputPrice: 0.6 },
    ],
    enabled: true,
  },
  {
    id: "provider-openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "",
    models: [
      { id: "anthropic/claude-4-sonnet", name: "Claude 4 Sonnet (OpenRouter)", maxTokens: 200000, supportsStreaming: true, supportsVision: true, inputPrice: 3, outputPrice: 15 },
      { id: "openai/gpt-5.2", name: "GPT-5.2 (OpenRouter)", maxTokens: 128000, supportsStreaming: true, supportsVision: true, inputPrice: 2.5, outputPrice: 10 },
      { id: "google/gemini-3-pro", name: "Gemini 3 Pro (OpenRouter)", maxTokens: 1000000, supportsStreaming: true, supportsVision: true, inputPrice: 1.25, outputPrice: 10 },
    ],
    enabled: false,
  },
  {
    id: "provider-qwen",
    name: "通义千问 (Qwen)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: "",
    models: [
      { id: "qwen-max", name: "Qwen Max", maxTokens: 32000, supportsStreaming: true, supportsVision: false, inputPrice: 0.4, outputPrice: 1.2 },
      { id: "qwen-plus", name: "Qwen Plus", maxTokens: 131072, supportsStreaming: true, supportsVision: true, inputPrice: 0.08, outputPrice: 0.2 },
      { id: "qwen-turbo", name: "Qwen Turbo", maxTokens: 131072, supportsStreaming: true, supportsVision: false, inputPrice: 0.02, outputPrice: 0.06 },
      { id: "qwen3-coder", name: "Qwen3 Coder", maxTokens: 131072, supportsStreaming: true, supportsVision: false, inputPrice: 0.08, outputPrice: 0.2 },
    ],
    enabled: true,
  },
  {
    id: "provider-ollama",
    name: "Ollama (Local)",
    baseUrl: "http://localhost:11434",
    apiKey: "",
    models: [
      { id: "llama-4", name: "Llama 4 (local)", maxTokens: 128000, supportsStreaming: true, supportsVision: false },
      { id: "codellama", name: "Code Llama (local)", maxTokens: 16000, supportsStreaming: true, supportsVision: false },
      { id: "deepseek-coder", name: "DeepSeek Coder (local)", maxTokens: 16000, supportsStreaming: true, supportsVision: false },
    ],
    enabled: false,
  },
  {
    id: "provider-kimi",
    name: "Kimi (月之暗面)",
    baseUrl: "https://api.moonshot.cn/v1",
    apiKey: "",
    models: [
      { id: "moonshot-v1-8k", name: "Moonshot V1 8K", maxTokens: 8192, supportsStreaming: true, supportsVision: true, inputPrice: 12, outputPrice: 12 },
      { id: "moonshot-v1-32k", name: "Moonshot V1 32K", maxTokens: 32768, supportsStreaming: true, supportsVision: true, inputPrice: 24, outputPrice: 24 },
      { id: "moonshot-v1-128k", name: "Moonshot V1 128K", maxTokens: 131072, supportsStreaming: true, supportsVision: true, inputPrice: 60, outputPrice: 60 },
    ],
    enabled: false,
  },
  {
    id: "provider-minimax",
    name: "MiniMax",
    baseUrl: "https://api.minimax.chat/v1",
    apiKey: "",
    models: [
      { id: "MiniMax-Text-01", name: "MiniMax-Text-01", maxTokens: 1000000, supportsStreaming: true, supportsVision: false, inputPrice: 1, outputPrice: 2 },
      { id: "abab6.5s-chat", name: "ABAB 6.5s Chat", maxTokens: 131072, supportsStreaming: true, supportsVision: false, inputPrice: 2, outputPrice: 2 },
    ],
    enabled: false,
  },
  {
    id: "provider-volcengine",
    name: "火山引擎 (豆包)",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v1",
    apiKey: "",
    models: [
      { id: "doubao-1.5-pro", name: "豆包 1.5 Pro", maxTokens: 131072, supportsStreaming: true, supportsVision: false, inputPrice: 4, outputPrice: 8 },
      { id: "doubao-1.5-lite", name: "豆包 1.5 Lite", maxTokens: 131072, supportsStreaming: true, supportsVision: false, inputPrice: 0.8, outputPrice: 2 },
    ],
    enabled: false,
  },
];

/** Persist a provider to SQLite via Tauri IPC. */
async function persistProvider(provider: Provider): Promise<void> {
  if (!isTauriRuntime()) { return; }
  try {
    const record: ProviderRecordIPC = {
      id: provider.id,
      name: provider.name,
      providerType: mapProviderType(provider.id),
      baseUrl: provider.baseUrl,
      apiKeySet: !!provider.apiKey,
      models: JSON.stringify(
        provider.models.map((m) => ({
          id: m.id,
          name: m.name,
          provider: mapProviderType(provider.id),
          maxInputTokens: m.maxTokens,
          maxOutputTokens: m.maxOutputTokens ?? 8192,
          supportsStreaming: m.supportsStreaming,
          supportsTools: true,
          supportsVision: m.supportsVision,
          inputPricePerMillion: m.inputPrice,
          outputPricePerMillion: m.outputPrice,
        })),
      ),
      enabled: provider.enabled,
      createdAt: new Date().toISOString(),
    };
    await invoke("upsert_provider", {
      provider: record,
      apiKey: provider.apiKey || undefined,
    });
  } catch {
    // Silently fail — persistence is best-effort
  }
}

/** Remove a provider from SQLite via Tauri IPC. */
async function unpersistProvider(id: string): Promise<void> {
  if (!isTauriRuntime()) { return; }
  try {
    await invoke("delete_provider", { id });
  } catch {
    // Silently fail
  }
}

export const useProviderStore = create<ProviderStore>((set, get) => ({
  providers: DEFAULT_PROVIDERS,
  hydrated: false,
  diagnosticReports: {},

  hydrateFromBackend: async () => {
    if (!isTauriRuntime() || get().hydrated) { return; }
    try {
      const records = await invoke<ProviderRecordIPC[]>("list_providers");
      if (records.length > 0) {
        // Merge persisted records with defaults — persisted takes priority
        const persisted: Provider[] = [];
        for (const r of records) {
          // Restore API key from encrypted storage
          let apiKey = "";
          try {
            const key = await invoke<string | null>("get_provider_api_key", { id: r.id });
            apiKey = key ?? "";
          } catch { /* ignore */ }

          persisted.push({
            id: r.id,
            name: r.name,
            baseUrl: r.baseUrl,
            apiKey,
            enabled: r.enabled,
            models: r.models ? JSON.parse(r.models).map((m: Record<string, unknown>) => ({
              id: m.id as string,
              name: m.name as string,
              maxTokens: (m.maxInputTokens as number) || 128000,
              maxOutputTokens: (m.maxOutputTokens as number) || undefined,
              supportsStreaming: (m.supportsStreaming as boolean) ?? true,
              supportsVision: (m.supportsVision as boolean) ?? false,
              inputPrice: m.inputPricePerMillion as number | undefined,
              outputPrice: m.outputPricePerMillion as number | undefined,
            })) : [],
          });
        }
        // Merge: start with defaults, overlay persisted (keeping restored API keys)
        const merged = DEFAULT_PROVIDERS.map((d) => {
          const found = persisted.find((p) => p.id === d.id);
          return found ? { ...d, ...found } : d;
        });
        // Add any persisted providers not in defaults
        for (const p of persisted) {
          if (!merged.some((m) => m.id === p.id)) {
            merged.push(p);
          }
        }
        set({ providers: merged, hydrated: true });
      } else {
        set({ hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },

  addProvider: (provider) => {
    const id = genId();
    set((s) => ({ providers: [...s.providers, { ...provider, id }] }));
    const newProvider = { ...provider, id };
    persistProvider(newProvider);
    return id;
  },

  updateProvider: (id, partial) => {
    set((s) => ({
      providers: s.providers.map((p) => (p.id === id ? { ...p, ...partial } : p)),
    }));
    const updated = get().providers.find((p) => p.id === id);
    if (updated) { persistProvider(updated); }
  },

  removeProvider: (id) => {
    set((s) => ({ providers: s.providers.filter((p) => p.id !== id) }));
    unpersistProvider(id);
  },

  testConnection: async (id) => {
    const provider = get().providers.find((p) => p.id === id);
    if (!provider) {
      return false;
    }

    const requiresApiKey = provider.id !== "provider-ollama";
    if (requiresApiKey && !provider.apiKey) {
      set((s) => ({
        providers: s.providers.map((p) =>
          p.id === id
            ? { ...p, testStatus: "error" as const, testError: "No API key configured", lastTested: new Date().toISOString() }
            : p,
        ),
      }));
      return false;
    }

    // Clear previous status
    set((s) => ({
      providers: s.providers.map((p) =>
        p.id === id
          ? { ...p, testStatus: undefined as "ok" | "error" | undefined } : p,
      ),
    }));

    // Try real Tauri backend first
    if (isTauriRuntime()) {
      try {
        const result = await invoke<{ connected: boolean; message: string; modelsCount?: number }>(
          "check_provider",
          {
            config: {
              id: provider.id,
              name: provider.name,
              providerType: mapProviderType(provider.id),
              baseUrl: provider.baseUrl,
              apiKey: provider.apiKey || undefined,
              models: provider.models.map((m) => ({
                id: m.id,
                name: m.name,
                provider: mapProviderType(provider.id),
                maxInputTokens: m.maxTokens,
                maxOutputTokens: 4096,
                supportsStreaming: m.supportsStreaming,
                supportsTools: true,
                supportsVision: m.supportsVision,
                inputPricePerMillion: m.inputPrice,
                outputPricePerMillion: m.outputPrice,
              })),
              enabled: provider.enabled,
            },
          },
        );

        set((s) => ({
          providers: s.providers.map((p) =>
            p.id === id
              ? {
                  ...p,
                  testStatus: result.connected ? ("ok" as const) : ("error" as const),
                  testError: result.connected ? undefined : result.message,
                  lastTested: new Date().toISOString(),
                }
              : p,
          ),
        }));
        return result.connected;
      } catch (err) {
        set((s) => ({
          providers: s.providers.map((p) =>
            p.id === id
              ? {
                  ...p,
                  testStatus: "error" as const,
                  testError: err instanceof Error ? err.message : String(err),
                  lastTested: new Date().toISOString(),
                }
              : p,
          ),
        }));
        return false;
      }
    }

    // Browser mock fallback
    try {
      if (!requiresApiKey) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        set((s) => ({
          providers: s.providers.map((p) =>
            p.id === id
              ? { ...p, testStatus: "ok" as const, testError: undefined, lastTested: new Date().toISOString() }
              : p,
          ),
        }));
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 500));
      const success = provider.apiKey.length > 0;
      set((s) => ({
        providers: s.providers.map((p) =>
          p.id === id
            ? {
                ...p,
                testStatus: success ? ("ok" as const) : ("error" as const),
                testError: success ? undefined : "Invalid API key",
                lastTested: new Date().toISOString(),
              }
            : p,
        ),
      }));
      return success;
    } catch {
      set((s) => ({
        providers: s.providers.map((p) =>
          p.id === id
            ? { ...p, testStatus: "error" as const, testError: "Connection failed", lastTested: new Date().toISOString() }
            : p,
        ),
      }));
      return false;
    }
  },

  diagnoseProvider: async (id: string): Promise<DiagnosticReport | null> => {
    const provider = get().providers.find((p) => p.id === id);
    if (!provider) { return null; }

    if (isTauriRuntime()) {
      try {
        const report = await invoke<DiagnosticReport>(
          "diagnose_provider",
          {
            config: {
              id: provider.id,
              name: provider.name,
              providerType: mapProviderType(provider.id),
              baseUrl: provider.baseUrl,
              apiKey: provider.apiKey || undefined,
              models: provider.models.map((m) => ({
                id: m.id,
                name: m.name,
                provider: mapProviderType(provider.id),
                maxInputTokens: m.maxTokens,
                maxOutputTokens: 4096,
                supportsStreaming: m.supportsStreaming,
                supportsTools: true,
                supportsVision: m.supportsVision,
                inputPricePerMillion: m.inputPrice,
                outputPricePerMillion: m.outputPrice,
              })),
              enabled: provider.enabled,
            },
          },
        );
        set({ diagnosticReports: { ...get().diagnosticReports, [id]: report } });
        return report;
      } catch {
        return null;
      }
    }

    // Browser mock fallback
    await new Promise((resolve) => setTimeout(resolve, 600 + Math.random() * 400));
    const isLocal = provider.baseUrl.includes("localhost") || provider.baseUrl.includes("127.0.0.1");
    const hasKey = !!provider.apiKey;
    const healthy = isLocal || hasKey;
    const report: DiagnosticReport = {
      providerId: provider.id,
      providerName: provider.name,
      healthy,
      durationMs: Math.round(400 + Math.random() * 400),
      checks: [
        { name: "Configuration", severity: "ok", message: "Base URL configured" },
        ...(isLocal
          ? [{ name: "API Key", severity: "ok" as const, message: "Not required for local provider" }]
          : hasKey
            ? [{ name: "API Key", severity: "ok" as const, message: "API key is set" }]
            : [{ name: "API Key", severity: "error" as const, message: "No API key configured", suggestion: "Add your API key to use this provider" }]),
        { name: "Models", severity: "ok", message: `${provider.models.length} model(s) configured` },
      ],
      modelsCount: provider.models.length,
    };
    set({ diagnosticReports: { ...get().diagnosticReports, [id]: report } });
    return report;
  },

  setApiKey: (id, key) => {
    set((s) => ({
      providers: s.providers.map((p) => (p.id === id ? { ...p, apiKey: key } : p)),
    }));
    const updated = get().providers.find((p) => p.id === id);
    if (updated) { persistProvider(updated); }
  },

  getEnabledProviders: () => get().providers.filter((p) => {
    if (!p.enabled) { return false; }
    // Local providers (Ollama, etc.) don't need API keys
    const isLocal = p.baseUrl.includes("localhost") || p.baseUrl.includes("127.0.0.1");
    return isLocal || !!p.apiKey;
  }),

  getProviderById: (id) => get().providers.find((p) => p.id === id),
}));
