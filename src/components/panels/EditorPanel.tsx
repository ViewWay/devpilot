/**
 * EditorPanel — Multi-file Monaco editor with tabs.
 *
 * Uses editorStore for file state management (open, close, save, dirty tracking).
 * Each tab represents an open file. Ctrl+S saves, Ctrl+W closes tab.
 * Double-click in FileTree opens files here.
 */
import { useRef, useCallback, useEffect } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { X, Circle, FileCode, Loader2, AlertCircle } from "lucide-react";
import { useI18n } from "../../i18n";
import { cn } from "../../lib/utils";
import { useEditorStore, type OpenFile } from "../../stores/editorStore";
import { useUIStore } from "../../stores/uiStore";

const EDITOR_OPTIONS = {
  readOnly: false,
  minimap: { enabled: false },
  fontSize: 13,
  lineHeight: 1.6,
  padding: { top: 8, bottom: 8 },
  scrollBeyondLastLine: false,
  renderLineHighlight: "all" as const,
  overviewRulerBorder: false,
  scrollbar: {
    verticalScrollbarSize: 6,
    horizontalScrollbarSize: 6,
  },
  wordWrap: "on" as const,
  automaticLayout: true,
  tabSize: 2,
};

/** File icon color based on extension */
function fileIconColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const colorMap: Record<string, string> = {
    ts: "text-blue-400",
    tsx: "text-blue-400",
    js: "text-yellow-400",
    jsx: "text-yellow-400",
    rs: "text-orange-400",
    py: "text-green-400",
    json: "text-yellow-300",
    toml: "text-gray-400",
    yaml: "text-red-300",
    yml: "text-red-300",
    md: "text-gray-300",
    css: "text-purple-400",
    html: "text-orange-500",
    sh: "text-green-300",
    bash: "text-green-300",
  };
  return colorMap[ext] ?? "text-muted-foreground";
}

/** Single file tab */
function FileTab({
  file,
  isActive,
  onClose,
  onSelect,
}: {
  file: OpenFile;
  isActive: boolean;
  onClose: (e: React.MouseEvent) => void;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "group flex items-center gap-1.5 border-r border-border/40 px-3 py-1.5 text-[11px] font-medium transition-colors min-w-0 max-w-[160px]",
        isActive
          ? "bg-background text-foreground border-b-2 border-b-brand"
          : "bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {file.dirty && (
        <Circle
          size={6}
          className="shrink-0 fill-yellow-400 text-yellow-400"
          aria-label="Unsaved changes"
        />
      )}
      {!file.dirty && (
        <FileCode size={12} className={cn("shrink-0", fileIconColor(file.name))} />
      )}
      <span className="truncate">{file.name}</span>
      <span
        onClick={onClose}
        className="ml-auto shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent"
        title="Close"
      >
        <X size={10} />
      </span>
    </button>
  );
}

export function EditorPanel() {
  const { t } = useI18n();
  const {
    openFiles,
    activeFilePath,
    loading,
    error,
    setActiveFile,
    closeFile,
    updateContent,
    saveActiveFile,
    clearError,
  } = useEditorStore();
  const setRightPanel = useUIStore((s) => s.setRightPanel);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const activeFile = openFiles.find((f) => f.path === activeFilePath) ?? null;

  // Ctrl+S → save, Ctrl+W → close tab
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveActiveFile();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        if (activeFilePath) {
          closeFile(activeFilePath);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveActiveFile, closeFile, activeFilePath]);

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    // Focus editor on mount
    editor.focus();
  }, []);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (activeFilePath && value !== undefined) {
        updateContent(activeFilePath, value);
      }
    },
    [activeFilePath, updateContent],
  );

  // Switch to preview panel if no files open
  const handleOpenPreview = useCallback(() => {
    setRightPanel("preview");
  }, [setRightPanel]);

  if (openFiles.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-muted-foreground">
        <FileCode size={32} className="opacity-30" />
        <p className="text-xs text-center">{t("editorEmpty")}</p>
        <p className="text-[11px] text-center opacity-60">{t("editorEmptyHint")}</p>
        <button
          onClick={handleOpenPreview}
          className="mt-1 rounded-md bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {t("openPreview")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center overflow-x-auto border-b border-border bg-muted/30 scrollbar-none">
        {openFiles.map((file) => (
          <FileTab
            key={file.path}
            file={file}
            isActive={file.path === activeFilePath}
            onSelect={() => setActiveFile(file.path)}
            onClose={(e) => {
              e.stopPropagation();
              closeFile(file.path);
            }}
          />
        ))}
        {/* Spacer */}
        <div className="flex-1" />
        {/* Status indicator */}
        <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-muted-foreground">
          {loading && <Loader2 size={10} className="animate-spin" />}
          {activeFile?.dirty && (
            <span className="text-yellow-400">Modified</span>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
          <AlertCircle size={12} />
          <span className="flex-1 truncate">{error}</span>
          <button onClick={clearError} className="hover:text-destructive/80">
            <X size={10} />
          </button>
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 min-h-0">
        {activeFile ? (
          <Editor
            key={activeFile.path}
            height="100%"
            language={activeFile.language}
            value={activeFile.content}
            theme="vs-dark"
            options={EDITOR_OPTIONS}
            onMount={handleEditorMount}
            onChange={handleEditorChange}
            loading={
              <div className="flex h-full items-center justify-center">
                <Loader2 size={20} className="animate-spin text-muted-foreground opacity-50" />
              </div>
            }
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <p className="text-xs">{t("selectFile")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
