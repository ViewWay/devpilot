import { create } from "zustand";
import type { ModelInfo, AgentMode } from "../types";

const DEFAULT_MODELS: ModelInfo[] = [
  { id: "claude-4-sonnet", name: "Claude 4 Sonnet", provider: "Anthropic", color: "bg-orange-500" },
  { id: "gpt-5.2", name: "GPT-5.2", provider: "OpenAI", color: "bg-emerald-500" },
  { id: "glm-5", name: "GLM-5", provider: "智谱", color: "bg-[var(--color-brand)]" },
  { id: "deepseek-v3", name: "DeepSeek V3", provider: "DeepSeek", color: "bg-violet-500" },
  { id: "qwen-max", name: "通义千问 Max", provider: "阿里云", color: "bg-purple-500" },
  { id: "gemini-3-pro", name: "Gemini 3 Pro", provider: "Google", color: "bg-red-500" },
  { id: "ollama-llama4", name: "Llama 4 (local)", provider: "Ollama", color: "bg-[var(--color-outline)]" },
];

export type Theme = "dark" | "light" | "system";
export type ActiveView = "chat" | "settings" | "scheduler" | "gallery";
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

  reasoningEffort: number; // 0-100, default 50
  setReasoningEffort: (effort: number) => void;

  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;

  rightPanel: RightPanel;
  setRightPanel: (panel: RightPanel) => void;
  toggleRightPanel: (panel: RightPanel) => void;

  panelSize: number; // percentage 20-80, default 50
  setPanelSize: (size: number) => void;

  theme: Theme;
  setTheme: (theme: Theme) => void;

  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;

  workingDir: string;
  setWorkingDir: (dir: string) => void;

  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;

  previewFile: string;
  setPreviewFile: (path: string) => void;

  fontSize: number; // 12-18, default 14
  setFontSize: (size: number) => void;

  sandboxPolicy: "default" | "permissive" | "strict";
  setSandboxPolicy: (policy: "default" | "permissive" | "strict") => void;

  // Diff data for PreviewPanel — populated from apply_patch tool results
  diffData: { original: string; modified: string; language: string } | null;
  setDiffData: (data: { original: string; modified: string; language: string } | null) => void;

  // Split View (dual session)
  splitViewActive: boolean;
  secondarySessionId: string | null;
  splitViewSize: number; // percentage 20-80, default 50
  toggleSplitView: (sessionId?: string) => void;
  closeSplitView: () => void;
  setSecondarySession: (sessionId: string) => void;
  swapSplitView: () => void;
  setSplitViewSize: (size: number) => void;

  // Quick File Search
  quickFileSearchOpen: boolean;
  setQuickFileSearchOpen: (open: boolean) => void;
  toggleQuickFileSearch: () => void;
}

/** Lazy reference to chatStore — avoids circular dependency at module level. */
let _getChatState: (() => { sessions: Array<{ id: string; archived?: boolean }>; activeSessionId: string | null }) | null = null;

/** Lazy setter for active session — registered by chatStore. */
let _setActiveSession: ((id: string) => void) | null = null;

/** Called once from chatStore to register the accessor. */
export function registerChatStoreAccessor(
  getter: () => { sessions: Array<{ id: string; archived?: boolean }>; activeSessionId: string | null },
) {
  _getChatState = getter;
}

/** Called once from chatStore to register the setActiveSession function. */
export function registerChatStoreSetActiveSession(setter: (id: string) => void) {
  _setActiveSession = setter;
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  selectedModel: DEFAULT_MODELS[0]!,
  models: DEFAULT_MODELS,
  setSelectedModel: (model) => set({ selectedModel: model }),

  activeMode: "code",
  setActiveMode: (mode) => set({ activeMode: mode }),

  reasoningEffort: 50,
  setReasoningEffort: (effort) => set({ reasoningEffort: Math.max(0, Math.min(100, effort)) }),

  activeView: "chat",
  setActiveView: (view) => set({ activeView: view }),

  rightPanel: "none",
  setRightPanel: (panel) => set({ rightPanel: panel }),
  toggleRightPanel: (panel) =>
    set((s) => ({ rightPanel: s.rightPanel === panel ? "none" : panel })),

  panelSize: 50,
  setPanelSize: (size) => set({ panelSize: Math.max(20, Math.min(80, size)) }),

  theme: "system",
  setTheme: (theme) => set({ theme }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

  workingDir: "",
  setWorkingDir: (dir) => set({ workingDir: dir }),

  systemPrompt: "",
  setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),

  previewFile: "",
  setPreviewFile: (path: string) => set({ previewFile: path }),

  fontSize: 14,
  setFontSize: (size: number) => set({ fontSize: Math.max(12, Math.min(18, size)) }),

  sandboxPolicy: "default",
  setSandboxPolicy: (policy) => set({ sandboxPolicy: policy }),

  diffData: null,
  setDiffData: (data) => set({ diffData: data }),

  splitViewActive: false,
  secondarySessionId: null,
  splitViewSize: 50,
  toggleSplitView: (sessionId) => {
    const s = get();
    if (s.splitViewActive) {
      set({ splitViewActive: false, secondarySessionId: null });
      return;
    }
    // Pick a secondary session: use provided id, or auto-pick the first non-active session
    let secondaryId = sessionId ?? null;
    if (!secondaryId && _getChatState) {
      const chatState = _getChatState();
      secondaryId =
        chatState.sessions.find((sess) => sess.id !== chatState.activeSessionId && !sess.archived)?.id ?? null;
    }
    set({ splitViewActive: true, secondarySessionId: secondaryId });
  },
  closeSplitView: () => set({ splitViewActive: false, secondarySessionId: null }),
  setSecondarySession: (sessionId) => set({ secondarySessionId: sessionId }),
  swapSplitView: () => {
    const s = get();
    if (!s.splitViewActive || !s.secondarySessionId) { return; }
    const chatState = _getChatState?.();
    if (!chatState?.activeSessionId) { return; }
    const oldPrimary = chatState.activeSessionId;
    const oldSecondary = s.secondarySessionId;
    // Swap: old secondary becomes the new primary (active), old primary becomes secondary
    _setActiveSession?.(oldSecondary);
    set({ secondarySessionId: oldPrimary });
  },
  setSplitViewSize: (size) => set({ splitViewSize: Math.max(20, Math.min(80, size)) }),

  // Quick File Search
  quickFileSearchOpen: false,
  setQuickFileSearchOpen: (open) => set({ quickFileSearchOpen: open }),
  toggleQuickFileSearch: () => set((s) => ({ quickFileSearchOpen: !s.quickFileSearchOpen })),
}));
