import { create } from "zustand";
import { invoke } from "../lib/ipc";

// ── Types ────────────────────────────────────────────────

export interface OpenFile {
  /** Absolute file path (used as unique key). */
  path: string;
  /** File name (last component). */
  name: string;
  /** File content. */
  content: string;
  /** Original content at load time — used for dirty detection. */
  originalContent: string;
  /** Monaco language identifier (e.g. "rust", "typescript"). */
  language: string;
  /** Whether the file is dirty (content differs from original). */
  dirty: boolean;
}

// ── Store State ──────────────────────────────────────────

interface EditorState {
  /** Open files in tab order. */
  openFiles: OpenFile[];
  /** Currently active file path. */
  activeFilePath: string | null;
  /** Whether a file operation is in progress. */
  loading: boolean;
  /** Last error message. */
  error: string | null;
}

interface EditorActions {
  /** Open a file (adds to tabs, makes active). */
  openFile: (filePath: string) => Promise<void>;

  /** Close a file tab. */
  closeFile: (filePath: string) => void;

  /** Switch to a different tab. */
  setActiveFile: (filePath: string) => void;

  /** Update file content (marks as dirty if changed). */
  updateContent: (filePath: string, content: string) => void;

  /** Save a file back to disk. */
  saveFile: (filePath: string) => Promise<void>;

  /** Save the currently active file. */
  saveActiveFile: () => Promise<void>;

  /** Clear error. */
  clearError: () => void;
}

/** Map file extension to Monaco language identifier. */
function extToLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    rs: "rust",
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    json: "json",
    html: "html",
    css: "css",
    scss: "scss",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
    toml: "ini",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    go: "go",
    java: "java",
    c: "c",
    h: "c",
    cpp: "cpp",
    hpp: "cpp",
    zig: "zig",
  };
  return map[ext] ?? "plaintext";
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

export const useEditorStore = create<EditorState & EditorActions>()(
  (set, get) => ({
    openFiles: [],
    activeFilePath: null,
    loading: false,
    error: null,

    openFile: async (filePath: string) => {
      const { openFiles } = get();
      // Already open? Just switch to it
      const existing = openFiles.find((f) => f.path === filePath);
      if (existing) {
        set({ activeFilePath: filePath });
        return;
      }

      set({ loading: true, error: null });
      try {
        const content = await invoke<string>("read_file_content", {
          path: filePath,
          sessionId: undefined, // will be wired to active session in a future update
        });
        const file: OpenFile = {
          path: filePath,
          name: fileName(filePath),
          content,
          originalContent: content,
          language: extToLanguage(filePath),
          dirty: false,
        };
        set((s) => ({
          openFiles: [...s.openFiles, file],
          activeFilePath: filePath,
          loading: false,
        }));
      } catch (e: unknown) {
        set({ error: String(e), loading: false });
      }
    },

    closeFile: (filePath: string) => {
      set((s) => {
        const idx = s.openFiles.findIndex((f) => f.path === filePath);
        const newFiles = s.openFiles.filter((f) => f.path !== filePath);

        // Determine new active file
        let newActive = s.activeFilePath;
        if (s.activeFilePath === filePath) {
          if (newFiles.length === 0) {
            newActive = null;
          } else if (idx > 0) {
            newActive = newFiles[Math.min(idx - 1, newFiles.length - 1)]!.path;
          } else {
            newActive = newFiles[0]!.path;
          }
        }

        return { openFiles: newFiles, activeFilePath: newActive };
      });
    },

    setActiveFile: (filePath: string) => {
      set({ activeFilePath: filePath });
    },

    updateContent: (filePath: string, content: string) => {
      set((s) => ({
        openFiles: s.openFiles.map((f) =>
          f.path === filePath
            ? { ...f, content, dirty: content !== f.originalContent }
            : f,
        ),
      }));
    },

    saveFile: async (filePath: string) => {
      const file = get().openFiles.find((f) => f.path === filePath);
      if (!file) {
        return;
      }

      set({ loading: true, error: null });
      try {
        await invoke("write_file_content", {
          path: filePath,
          content: file.content,
          sessionId: undefined, // will be wired to active session in a future update
        });
        // Mark as clean
        set((s) => ({
          openFiles: s.openFiles.map((f) =>
            f.path === filePath
              ? { ...f, originalContent: file.content, dirty: false }
              : f,
          ),
          loading: false,
        }));
      } catch (e: unknown) {
        set({ error: String(e), loading: false });
      }
    },

    saveActiveFile: async () => {
      const { activeFilePath } = get();
      if (activeFilePath) {
        await get().saveFile(activeFilePath);
      }
    },

    clearError: () => set({ error: null }),
  }),
);
