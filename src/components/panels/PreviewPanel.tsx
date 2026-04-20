import { useState, useEffect, useCallback } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { Eye, GitCompare, FileCode, X, Loader2, AlertCircle } from "lucide-react";
import { useI18n } from "../../i18n";
import { cn } from "../../lib/utils";
import { useUIStore } from "../../stores/uiStore";
import { invoke } from "../../lib/ipc";

/** Map file extension to Monaco language identifier. */
function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "rs":
      return "rust";
    case "py":
      return "python";
    case "json":
      return "json";
    case "toml":
      return "toml";
    case "yaml":
    case "yml":
      return "yaml";
    case "md":
      return "markdown";
    case "css":
      return "css";
    case "html":
      return "html";
    case "sh":
    case "bash":
      return "shell";
    case "sql":
      return "sql";
    default:
      return "plaintext";
  }
}

/** Extract filename from a path. */
function getFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

interface FileContent {
  content: string;
  language: string;
}

const EDITOR_OPTIONS = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 12,
  lineHeight: 1.6,
  padding: { top: 8, bottom: 8 },
  scrollBeyondLastLine: false,
  renderLineHighlight: "none" as const,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  overviewRulerLanes: 0,
  scrollbar: {
    verticalScrollbarSize: 6,
    horizontalScrollbarSize: 6,
  },
};

export function PreviewPanel() {
  const { t } = useI18n();
  const previewFile = useUIStore((s) => s.previewFile);
  const setPreviewFile = useUIStore((s) => s.setPreviewFile);

  const [mode, setMode] = useState<"file" | "diff">("file");
  const [fileData, setFileData] = useState<FileContent | null>(null);
  const diffData = useUIStore((s) => s.diffData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFileContent = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setFileData(null);

    try {
      const result = await invoke<{
        content: string;
        totalLines: number;
      }>("read_text_file", { path });

      setFileData({
        content: result.content,
        language: getLanguage(path),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (previewFile) {
      fetchFileContent(previewFile);
    } else {
      setFileData(null);
      setError(null);
      setLoading(false);
    }
  }, [previewFile, fetchFileContent]);

  const handleClose = () => {
    setPreviewFile("");
    setFileData(null);
    setError(null);
  };

  // Determine what diff shows: use diffData if available, otherwise placeholder
  const hasDiff = diffData !== null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Eye size={14} className="text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">{t("preview")}</span>
        <div className="ml-auto flex items-center gap-1 rounded-md bg-muted/50 p-0.5">
          <button
            onClick={() => setMode("file")}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors",
              mode === "file"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <FileCode size={11} />
            {t("file")}
          </button>
          <button
            onClick={() => setMode("diff")}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors",
              mode === "diff"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <GitCompare size={11} />
            {t("diff")}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0">
        {mode === "file" && (
          <>
            {previewFile && (fileData || loading || error) ? (
              <div className="flex flex-1 flex-col min-w-0">
                {/* File tab */}
                <div className="flex items-center gap-2 border-b border-border bg-background px-3 py-1">
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {getFileName(previewFile)}
                  </span>
                  <button
                    onClick={handleClose}
                    className="ml-auto text-muted-foreground/50 hover:text-foreground"
                  >
                    <X size={12} />
                  </button>
                </div>

                {/* Loading state */}
                {loading && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-muted-foreground">
                    <Loader2 size={20} className="animate-spin opacity-50" />
                    <p className="text-xs">{t("loading")}</p>
                  </div>
                )}

                {/* Error state */}
                {!loading && error && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-destructive">
                    <AlertCircle size={20} className="opacity-60" />
                    <p className="max-w-xs text-center text-xs">{error}</p>
                  </div>
                )}

                {/* Editor */}
                {!loading && !error && fileData && (
                  <div className="flex-1 min-h-0">
                    <Editor
                      height="100%"
                      language={fileData.language}
                      value={fileData.content}
                      theme="vs-dark"
                      options={EDITOR_OPTIONS}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-muted-foreground">
                <FileCode size={24} className="opacity-40" />
                <p className="text-xs text-center">
                  {t("selectFileToPreview")}
                </p>
              </div>
            )}
          </>
        )}

        {mode === "diff" && (
          <div className="flex flex-1 flex-col min-w-0">
            <div className="flex items-center gap-2 border-b border-border bg-background px-3 py-1">
              <GitCompare size={11} className="text-muted-foreground" />
              <span className="text-[11px] font-mono text-muted-foreground">
                {t("diff")}
              </span>
            </div>
            {hasDiff ? (
              <div className="flex-1 min-h-0">
                <DiffEditor
                  height="100%"
                  language={diffData!.language}
                  original={diffData!.original}
                  modified={diffData!.modified}
                  theme="vs-dark"
                  options={{
                    ...EDITOR_OPTIONS,
                    renderSideBySide: true,
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-1 min-h-0 items-center justify-center px-4">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <GitCompare size={24} className="opacity-40" />
                  <p className="text-xs text-center">{t("noDiffAvailable")}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
