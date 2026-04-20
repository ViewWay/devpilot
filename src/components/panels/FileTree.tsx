import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  ChevronRight, ChevronDown, File, Folder, FolderOpen,
  FileText, FileCode, FileJson, FileImage, FileCog,
  Search, RefreshCw, Loader2, Home,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n";
import { isTauriRuntime, invoke } from "../../lib/ipc";
import { useUIStore } from "../../stores/uiStore";

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  /** Lazy-loaded: true if children have been fetched. */
  loaded?: boolean;
  gitStatus?: "modified" | "added" | "deleted" | "untracked";
}

/** Directory entry returned by the Rust `list_directory` command. */
interface DirEntry {
  name: string;
  path: string;
  entryType: "file" | "directory";
  size: number;
  modified: number | null;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "tsx":
    case "ts":
      return <FileCode size={13} className="text-blue-400" />;
    case "json":
      return <FileJson size={13} className="text-yellow-400" />;
    case "md":
      return <FileText size={13} className="text-gray-400" />;
    case "png":
    case "jpg":
    case "svg":
    case "gif":
      return <FileImage size={13} className="text-purple-400" />;
    case "toml":
    case "yaml":
    case "yml":
      return <FileCog size={13} className="text-orange-400" />;
    case "rs":
      return <FileCode size={13} className="text-orange-500" />;
    case "css":
    case "scss":
      return <FileCode size={13} className="text-pink-400" />;
    case "html":
      return <FileCode size={13} className="text-red-400" />;
    default:
      return <File size={13} className="text-muted-foreground" />;
  }
}

/** Fetch directory entries from the backend. */
async function fetchDirEntries(dirPath: string): Promise<FileNode[]> {
  if (!isTauriRuntime()) {
    return [];
  }
  const entries = await invoke<DirEntry[]>("listDirectory", {
    path: dirPath,
    showHidden: false,
  });
  return entries.map((e) => ({
    name: e.name,
    path: e.path,
    type: e.entryType,
    children: e.entryType === "directory" ? [] : undefined,
    loaded: e.entryType !== "directory",
  }));
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  defaultExpanded?: boolean;
  onExpand: (node: FileNode) => Promise<void>;
  onFileClick: (node: FileNode) => void;
}

function TreeNode({ node, depth, defaultExpanded = false, onExpand, onFileClick }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [loading, setLoading] = useState(false);
  const isDir = node.type === "directory";

  const handleClick = async () => {
    if (isDir) {
      const next = !expanded;
      setExpanded(next);
      if (next && !node.loaded) {
        setLoading(true);
        try {
          await onExpand(node);
        } finally {
          setLoading(false);
        }
      }
    } else {
      onFileClick(node);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-sm px-1 py-[3px] text-[12px] transition-colors hover:bg-accent",
          depth === 0 && "font-medium",
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {isDir ? (
          loading ? (
            <Loader2 size={12} className="shrink-0 animate-spin text-muted-foreground" />
          ) : expanded ? (
            <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {isDir ? (
          expanded ? (
            <FolderOpen size={13} className="shrink-0 text-yellow-400" />
          ) : (
            <Folder size={13} className="shrink-0 text-yellow-400" />
          )
        ) : (
          getFileIcon(node.name)
        )}
        <span className="truncate text-foreground/90">{node.name}</span>
      </button>
      {isDir && expanded && node.children?.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          onExpand={onExpand}
          onFileClick={onFileClick}
        />
      ))}
    </div>
  );
}

/** Get the user's home directory as default. */
function getHomeDir(): string {
  // In Tauri (webview), we can't access process.env directly.
  // The user should set workingDir in settings. Return "." as fallback.
  return ".";
}

export function FileTree() {
  const [filter, setFilter] = useState("");
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [rootPath] = useState("");
  const { t } = useI18n();
  const workingDir = useUIStore((s) => s.workingDir);
  const setPreviewFile = useUIStore((s) => s.setPreviewFile);
  const setRightPanel = useUIStore((s) => s.setRightPanel);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve effective root path
  const effectiveRoot = workingDir || rootPath || getHomeDir();

  /** Load the root directory. */
  const fetchTree = useCallback(async () => {
    if (!isTauriRuntime()) {
      return;
    }
    setLoading(true);
    try {
      const children = await fetchDirEntries(effectiveRoot);
      setTree(children);
    } catch (err) {
      console.error("Failed to load directory:", err);
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveRoot]);

  /** Lazily expand a directory node. */
  const handleExpand = useCallback(async (node: FileNode) => {
    try {
      const children = await fetchDirEntries(node.path);
      // Update the tree by finding and replacing the node
      setTree((prev) => {
        const update = (nodes: FileNode[]): FileNode[] =>
          nodes.map((n) => {
            if (n.path === node.path) {
              return { ...n, children, loaded: true };
            }
            if (n.children) {
              return { ...n, children: update(n.children) };
            }
            return n;
          });
        return update(prev);
      });
    } catch (err) {
      console.error("Failed to expand:", node.path, err);
    }
  }, []);

  /** Handle file click: open in preview panel. */
  const handleFileClick = useCallback(
    (node: FileNode) => {
      setPreviewFile(node.path);
      setRightPanel("preview");
    },
    [setPreviewFile, setRightPanel],
  );

  // Load tree on mount and when working dir changes
  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // Filter tree
  const filteredTree = useMemo(() => {
    if (!filter.trim()) {
      return tree;
    }
    const lower = filter.toLowerCase();
    function matches(node: FileNode): boolean {
      if (node.name.toLowerCase().includes(lower)) {
        return true;
      }
      if (node.children) {
        return node.children.some(matches);
      }
      return false;
    }
    return tree.filter(matches);
  }, [filter, tree]);

  // Keyboard shortcut: focus filter with /
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        const active = document.activeElement;
        if (active?.tagName === "INPUT" || active?.tagName === "TEXTAREA") {
          return;
        }
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Header with path breadcrumb */}
      <div className="border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate" title={effectiveRoot}>
          <Home size={10} className="shrink-0" />
          <span className="truncate">{effectiveRoot}</span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex h-6 flex-1 items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2">
          <Search size={11} className="text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            placeholder={`${t("filterFiles") ?? "Filter files"} (/)`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-full flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <button
          onClick={fetchTree}
          disabled={loading}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          title={t("refresh") ?? "Refresh"}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading && tree.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : tree.length === 0 ? (
          <div className="px-4 py-6 text-center text-[11px] text-muted-foreground">
            {workingDir ? (t("noFiles") ?? "No files found") : (t("setWorkingDir") ?? "Set a working directory to browse files")}
          </div>
        ) : (
          filteredTree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              defaultExpanded={!!filter}
              onExpand={handleExpand}
              onFileClick={handleFileClick}
            />
          ))
        )}
        {filteredTree.length === 0 && tree.length > 0 && (
          <div className="px-4 py-6 text-center text-[11px] text-muted-foreground">
            {t("noMatchingFiles") ?? "No matching files"}
          </div>
        )}
      </div>
    </div>
  );
}
