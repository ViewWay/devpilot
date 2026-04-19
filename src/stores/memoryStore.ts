import { create } from "zustand";
import {
  invoke,
  type PersonaFilesIPC,
  type DailyEntryIPC,
  type MemorySearchResultIPC,
} from "../lib/ipc";

interface MemoryState {
  /** Persona file contents loaded from workspace. */
  persona: PersonaFilesIPC;
  /** Daily memory entries (most recent first). */
  dailyMemories: DailyEntryIPC[];
  /** Search results from persona files + daily memories. */
  searchResults: MemorySearchResultIPC[];
  /** Loading flags. */
  loadingPersona: boolean;
  loadingMemories: boolean;
  searching: boolean;
  saving: string | null; // which file is being saved, e.g. "SOUL.md"
  /** Last error, if any. */
  error: string | null;

  // Actions
  loadPersona: (workspaceDir: string) => Promise<void>;
  savePersonaFile: (
    workspaceDir: string,
    fileType: string,
    content: string,
  ) => Promise<void>;
  listMemories: (dataDir: string, limit?: number) => Promise<void>;
  createMemory: (dataDir: string, date: string, content: string) => Promise<void>;
  searchMemories: (
    workspaceDir: string,
    dataDir: string,
    query: string,
  ) => Promise<void>;
  clearSearch: () => void;
}

const EMPTY_PERSONA: PersonaFilesIPC = {
  soulMd: null,
  userMd: null,
  memoryMd: null,
  agentsMd: null,
};

export const useMemoryStore = create<MemoryState>((set, get) => ({
  persona: { ...EMPTY_PERSONA },
  dailyMemories: [],
  searchResults: [],
  loadingPersona: false,
  loadingMemories: false,
  searching: false,
  saving: null,
  error: null,

  loadPersona: async (workspaceDir) => {
    set({ loadingPersona: true, error: null });
    try {
      const persona = await invoke<PersonaFilesIPC>("load_persona_files_cmd", {
        workspaceDir,
      });
      set({ persona, loadingPersona: false });
    } catch (e: unknown) {
      set({
        error: e instanceof Error ? e.message : String(e),
        loadingPersona: false,
      });
    }
  },

  savePersonaFile: async (workspaceDir, fileType, content) => {
    set({ saving: fileType, error: null });
    try {
      await invoke("save_persona_file_cmd", {
        workspaceDir,
        fileType,
        content,
      });
      // Update local state optimistically
      const key = fileTypeToKey(fileType);
      if (key) {
        set((s) => ({
          persona: { ...s.persona, [key]: content || null },
          saving: null,
        }));
      } else {
        set({ saving: null });
      }
    } catch (e: unknown) {
      set({
        error: e instanceof Error ? e.message : String(e),
        saving: null,
      });
    }
  },

  listMemories: async (dataDir, limit) => {
    set({ loadingMemories: true, error: null });
    try {
      const dailyMemories = await invoke<DailyEntryIPC[]>(
        "list_daily_memories_cmd",
        { dataDir, limit: limit ?? null },
      );
      set({ dailyMemories, loadingMemories: false });
    } catch (e: unknown) {
      set({
        error: e instanceof Error ? e.message : String(e),
        loadingMemories: false,
      });
    }
  },

  createMemory: async (dataDir, date, content) => {
    set({ error: null });
    try {
      await invoke("create_daily_memory_cmd", { dataDir, date, content });
      // Refresh list after creating
      await get().listMemories(dataDir);
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  searchMemories: async (workspaceDir, dataDir, query) => {
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }
    set({ searching: true, error: null });
    try {
      const searchResults = await invoke<MemorySearchResultIPC[]>(
        "search_memories_cmd",
        { workspaceDir, dataDir, query },
      );
      set({ searchResults, searching: false });
    } catch (e: unknown) {
      set({
        error: e instanceof Error ? e.message : String(e),
        searching: false,
      });
    }
  },

  clearSearch: () => set({ searchResults: [] }),
}));

/** Map file type string like "SOUL.md" to the PersonaFilesIPC key. */
function fileTypeToKey(
  ft: string,
): "soulMd" | "userMd" | "memoryMd" | "agentsMd" | null {
  switch (ft) {
    case "SOUL.md":
      return "soulMd";
    case "USER.md":
      return "userMd";
    case "MEMORY.md":
      return "memoryMd";
    case "AGENTS.md":
      return "agentsMd";
    default:
      return null;
  }
}
