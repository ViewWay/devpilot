import { create } from "zustand";
import type { ModelInfo, AgentMode } from "../types";

const DEFAULT_MODELS: ModelInfo[] = [
  { id: "claude-4-sonnet", name: "Claude 4 Sonnet", provider: "Anthropic", color: "bg-orange-500" },
  { id: "gpt-5.2", name: "GPT-5.2", provider: "OpenAI", color: "bg-emerald-500" },
  { id: "glm-5", name: "GLM-5", provider: "智谱", color: "bg-blue-500" },
  { id: "deepseek-v3", name: "DeepSeek V3", provider: "DeepSeek", color: "bg-violet-500" },
  { id: "qwen-max", name: "通义千问 Max", provider: "阿里云", color: "bg-purple-500" },
  { id: "gemini-3-pro", name: "Gemini 3 Pro", provider: "Google", color: "bg-red-500" },
  { id: "ollama-llama4", name: "Llama 4 (local)", provider: "Ollama", color: "bg-gray-500" },
];

export type Theme = "dark" | "light" | "system";
export type ActiveView = "chat" | "settings";
export type RightPanel = "none" | "files" | "terminal" | "preview";

interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  selectedModel: ModelInfo;
  models: ModelInfo[];
  setSelectedModel: (model: ModelInfo) => void;

  activeMode: AgentMode;
  setActiveMode: (mode: AgentMode) => void;

  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;

  rightPanel: RightPanel;
  setRightPanel: (panel: RightPanel) => void;
  toggleRightPanel: (panel: RightPanel) => void;

  panelSize: number; // percentage 20-80, default 50
  setPanelSize: (size: number) => void;

  theme: Theme;
  setTheme: (theme: Theme) => void;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
  } else if (theme === "light") {
    root.classList.add("light");
    root.classList.remove("dark");
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
    root.classList.toggle("light", !prefersDark);
  }
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  selectedModel: DEFAULT_MODELS[0]!,
  models: DEFAULT_MODELS,
  setSelectedModel: (model) => set({ selectedModel: model }),

  activeMode: "code",
  setActiveMode: (mode) => set({ activeMode: mode }),

  activeView: "chat",
  setActiveView: (view) => set({ activeView: view }),

  rightPanel: "none",
  setRightPanel: (panel) => set({ rightPanel: panel }),
  toggleRightPanel: (panel) =>
    set((s) => ({ rightPanel: s.rightPanel === panel ? "none" : panel })),

  panelSize: 50,
  setPanelSize: (size) => set({ panelSize: Math.max(20, Math.min(80, size)) }),

  theme: "dark",
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
}));
