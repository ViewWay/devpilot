import { create } from "zustand";
import type { ModelInfo, AgentMode } from "../types";
import type { Locale } from "../i18n";

export type Theme = "dark" | "light" | "system";

// ── localStorage helpers ──────────────────────────────────────────────

const STORAGE_KEY = "devpilot-settings";

interface PersistedSettings {
  locale: Locale;
  theme: Theme;
  selectedModel: ModelInfo;
  activeMode: AgentMode;
  reasoningEffort: number;
  fontSize: number;
  sandboxPolicy: "default" | "permissive" | "strict";
  systemPrompt: string;
}

const DEFAULT_MODELS: ModelInfo[] = [
  { id: "claude-4-sonnet", name: "Claude 4 Sonnet", provider: "Anthropic", color: "bg-orange-500" },
  { id: "gpt-5.2", name: "GPT-5.2", provider: "OpenAI", color: "bg-emerald-500" },
  { id: "glm-5", name: "GLM-5", provider: "智谱", color: "bg-[var(--color-brand)]" },
  { id: "deepseek-v3", name: "DeepSeek V3", provider: "DeepSeek", color: "bg-violet-500" },
  { id: "qwen-max", name: "通义千问 Max", provider: "阿里云", color: "bg-purple-500" },
  { id: "gemini-3-pro", name: "Gemini 3 Pro", provider: "Google", color: "bg-red-500" },
  { id: "ollama-llama4", name: "Llama 4 (local)", provider: "Ollama", color: "bg-[var(--color-outline)]" },
];

const DEFAULTS: PersistedSettings = {
  locale: "en",
  theme: "system",
  selectedModel: DEFAULT_MODELS[0]!,
  activeMode: "code",
  reasoningEffort: 50,
  fontSize: 14,
  sandboxPolicy: "default",
  systemPrompt: "",
};

function loadPersisted(): Partial<PersistedSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { return {}; }
    return JSON.parse(raw) as Partial<PersistedSettings>;
  } catch {
    return {};
  }
}

function persist(partial: Partial<PersistedSettings>) {
  try {
    const current = loadPersisted();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, ...current, ...partial }));
  } catch { /* noop */ }
}

// ── Store definition ──────────────────────────────────────────────────

type SettingsState = PersistedSettings & {
  models: ModelInfo[];

  setSelectedModel: (model: ModelInfo) => void;
  setActiveMode: (mode: AgentMode) => void;
  setReasoningEffort: (effort: number) => void;
  setTheme: (theme: Theme) => void;
  setLocale: (locale: Locale) => void;
  setFontSize: (size: number) => void;
  setSandboxPolicy: (policy: "default" | "permissive" | "strict") => void;
  setSystemPrompt: (prompt: string) => void;
};

const hydrated = loadPersisted();

export const useSettingsStore = create<SettingsState>((set) => ({
  locale: hydrated.locale ?? DEFAULTS.locale,
  theme: hydrated.theme ?? DEFAULTS.theme,
  selectedModel: hydrated.selectedModel ?? DEFAULTS.selectedModel,
  activeMode: hydrated.activeMode ?? DEFAULTS.activeMode,
  reasoningEffort: hydrated.reasoningEffort ?? DEFAULTS.reasoningEffort,
  fontSize: hydrated.fontSize ?? DEFAULTS.fontSize,
  sandboxPolicy: hydrated.sandboxPolicy ?? DEFAULTS.sandboxPolicy,
  systemPrompt: hydrated.systemPrompt ?? DEFAULTS.systemPrompt,
  models: DEFAULT_MODELS,

  setSelectedModel: (model) => {
    set({ selectedModel: model });
    persist({ selectedModel: model });
  },
  setActiveMode: (mode) => {
    set({ activeMode: mode });
    persist({ activeMode: mode });
  },
  setReasoningEffort: (effort) => {
    const clamped = Math.max(0, Math.min(100, effort));
    set({ reasoningEffort: clamped });
    persist({ reasoningEffort: clamped });
  },
  setTheme: (theme) => {
    set({ theme });
    persist({ theme });
  },
  setLocale: (locale) => {
    set({ locale });
    persist({ locale });
  },
  setFontSize: (size) => {
    const clamped = Math.max(12, Math.min(18, size));
    set({ fontSize: clamped });
    persist({ fontSize: clamped });
  },
  setSandboxPolicy: (policy) => {
    set({ sandboxPolicy: policy });
    persist({ sandboxPolicy: policy });
  },
  setSystemPrompt: (prompt) => {
    set({ systemPrompt: prompt });
    persist({ systemPrompt: prompt });
  },
}));
