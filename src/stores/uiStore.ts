import { create } from "zustand";

// Re-export Theme for backward compatibility
export type { Theme } from "./settingsStore";

export type ActiveView = "chat" | "settings" | "scheduler" | "gallery";
export type RightPanel = "none" | "files" | "terminal" | "preview" | "git" | "agent" | "marketplace";

interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;

  rightPanel: RightPanel;
  setRightPanel: (panel: RightPanel) => void;
  toggleRightPanel: (panel: RightPanel) => void;

  panelSize: number; // percentage 20-80, default 50
  setPanelSize: (size: number) => void;

  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;

  workingDir: string;
  setWorkingDir: (dir: string) => void;

  previewFile: string;
  setPreviewFile: (path: string) => void;

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

  // Message Search
  messageSearchOpen: boolean;
  setMessageSearchOpen: (open: boolean) => void;
  toggleMessageSearch: () => void;
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

// ── workingDir persistence ─────────────────────────────────────────
const WORKING_DIR_KEY = "devpilot-working-dir";

function loadWorkingDir(): string {
  try {
    return localStorage.getItem(WORKING_DIR_KEY) ?? "";
  } catch {
    return "";
  }
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  activeView: "chat",
  setActiveView: (view) => set({ activeView: view }),

  rightPanel: "none",
  setRightPanel: (panel) => set({ rightPanel: panel }),
  toggleRightPanel: (panel) =>
    set((s) => ({ rightPanel: s.rightPanel === panel ? "none" : panel })),

  panelSize: 50,
  setPanelSize: (size) => set({ panelSize: Math.max(20, Math.min(80, size)) }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

  workingDir: loadWorkingDir(),
  setWorkingDir: (dir) => {
    set({ workingDir: dir });
    try {
      if (dir) {
        localStorage.setItem(WORKING_DIR_KEY, dir);
      } else {
        localStorage.removeItem(WORKING_DIR_KEY);
      }
    } catch { /* noop */ }
  },

  previewFile: "",
  setPreviewFile: (path: string) => set({ previewFile: path }),

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

  // Message Search
  messageSearchOpen: false,
  setMessageSearchOpen: (open) => set({ messageSearchOpen: open }),
  toggleMessageSearch: () => set((s) => ({ messageSearchOpen: !s.messageSearchOpen })),
}));
