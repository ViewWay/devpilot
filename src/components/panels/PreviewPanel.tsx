import { useState, useMemo } from "react";
import Editor, { DiffEditor, type OnMount } from "@monaco-editor/react";
import { Eye, GitCompare, FileCode, X, ChevronRight } from "lucide-react";
import { useI18n } from "../../i18n";
import { cn } from "../../lib/utils";

// Demo file contents
const DEMO_FILES: Record<string, { content: string; lang: string }> = {
  "src/main.tsx": {
    lang: "typescript",
    content: `import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);`,
  },
  "src/App.tsx": {
    lang: "typescript",
    content: `import { useState } from "react";
import { ChatPanel } from "./components/chat/ChatPanel";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { useUIStore } from "./stores/uiStore";
import { I18nProvider } from "./i18n";

export function App() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);

  return (
    <I18nProvider>
      <div className="flex h-screen bg-background text-foreground">
        {sidebarOpen && <Sidebar />}
        <div className="flex flex-1 flex-col min-w-0">
          <TopBar />
          <ChatPanel />
        </div>
      </div>
    </I18nProvider>
  );
}`,
  },
  "Cargo.toml": {
    lang: "toml",
    content: `[workspace]
resolver = "2"
members = [
    "crates/devpilot-core",
    "crates/devpilot-llm",
    "crates/devpilot-tools",
    "crates/devpilot-store",
    "crates/devpilot-protocol",
]

[workspace.package]
version = "0.1.0"
edition = "2024"
authors = ["DevPilot Team"]
license = "MIT"`,
  },
  "package.json": {
    lang: "json",
    content: `{
  "name": "devpilot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint ."
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}`,
  },
};

const DEMO_DIFF = {
  original: `export function ChatPanel() {
  return (
    <div className="flex h-full flex-col">
      <MessageList />
      <MessageInput />
    </div>
  );
}`,
  modified: `export function ChatPanel() {
  const rightPanel = useUIStore((s) => s.rightPanel);

  if (rightPanel === "none") {
    return <ChatContent />;
  }

  return (
    <SplitView left={<ChatContent />} right={<RightContent />} />
  );
}`,
  filename: "src/components/chat/ChatPanel.tsx",
};

const FILE_LIST = Object.keys(DEMO_FILES);

export function PreviewPanel() {
  const { t } = useI18n();
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [mode, setMode] = useState<"file" | "diff">("file");

  const activeFileData = useMemo(
    () => (activeFile ? DEMO_FILES[activeFile] : null),
    [activeFile],
  );

  const handleEditorMount: OnMount = (editor) => {
    editor.updateOptions({ readOnly: true });
  };

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
            {/* File list sidebar */}
            <div className="w-44 shrink-0 border-r border-border overflow-y-auto bg-muted/20">
              <div className="p-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t("files")}
                </span>
              </div>
              {FILE_LIST.map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFile(f)}
                  className={cn(
                    "flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors",
                    activeFile === f
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <ChevronRight size={10} className="shrink-0" />
                  <span className="truncate">{f.split("/").pop()}</span>
                </button>
              ))}
            </div>

            {/* Editor */}
            {activeFile && activeFileData ? (
              <div className="flex flex-1 flex-col min-w-0">
                {/* File tab */}
                <div className="flex items-center gap-2 border-b border-border bg-background px-3 py-1">
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {activeFile}
                  </span>
                  <button
                    onClick={() => setActiveFile(null)}
                    className="ml-auto text-muted-foreground/50 hover:text-foreground"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="flex-1 min-h-0">
                  <Editor
                    height="100%"
                    language={activeFileData.lang}
                    value={activeFileData.content}
                    onMount={handleEditorMount}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 12,
                      lineHeight: 1.6,
                      padding: { top: 8, bottom: 8 },
                      scrollBeyondLastLine: false,
                      renderLineHighlight: "none",
                      overviewRulerBorder: false,
                      hideCursorInOverviewRuler: true,
                      overviewRulerLanes: 0,
                      scrollbar: {
                        verticalScrollbarSize: 6,
                        horizontalScrollbarSize: 6,
                      },
                    }}
                  />
                </div>
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
                {DEMO_DIFF.filename}
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <DiffEditor
                height="100%"
                language="typescript"
                original={DEMO_DIFF.original}
                modified={DEMO_DIFF.modified}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 12,
                  lineHeight: 1.6,
                  padding: { top: 8, bottom: 8 },
                  scrollBeyondLastLine: false,
                  renderSideBySide: true,
                  scrollbar: {
                    verticalScrollbarSize: 6,
                    horizontalScrollbarSize: 6,
                  },
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
