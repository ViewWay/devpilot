import { useState, useMemo } from "react";
import {
  ChevronRight, ChevronDown, File, Folder, FolderOpen,
  FileText, FileCode, FileJson, FileImage, FileCog,
  Search,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n";

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  gitStatus?: "modified" | "added" | "deleted" | "untracked";
}

/** Demo file tree — in production this comes from the backend */
const DEMO_TREE: FileNode[] = [
  {
    name: "src",
    path: "src",
    type: "directory",
    children: [
      {
        name: "components",
        path: "src/components",
        type: "directory",
        children: [
          { name: "chat", path: "src/components/chat", type: "directory", children: [
            { name: "ChatPanel.tsx", path: "src/components/chat/ChatPanel.tsx", type: "file", gitStatus: "modified" },
            { name: "MessageList.tsx", path: "src/components/chat/MessageList.tsx", type: "file" },
            { name: "MessageInput.tsx", path: "src/components/chat/MessageInput.tsx", type: "file" },
            { name: "CodeBlock.tsx", path: "src/components/chat/CodeBlock.tsx", type: "file" },
          ]},
          { name: "layout", path: "src/components/layout", type: "directory", children: [
            { name: "AppShell.tsx", path: "src/components/layout/AppShell.tsx", type: "file", gitStatus: "modified" },
            { name: "Sidebar.tsx", path: "src/components/layout/Sidebar.tsx", type: "file" },
            { name: "TopBar.tsx", path: "src/components/layout/TopBar.tsx", type: "file", gitStatus: "modified" },
            { name: "SplitView.tsx", path: "src/components/layout/SplitView.tsx", type: "file", gitStatus: "added" },
          ]},
          { name: "panels", path: "src/components/panels", type: "directory", children: [
            { name: "FilesPanel.tsx", path: "src/components/panels/FilesPanel.tsx", type: "file", gitStatus: "added" },
            { name: "TerminalPanel.tsx", path: "src/components/panels/TerminalPanel.tsx", type: "file", gitStatus: "added" },
            { name: "PreviewPanel.tsx", path: "src/components/panels/PreviewPanel.tsx", type: "file", gitStatus: "added" },
          ]},
        ],
      },
      { name: "stores", path: "src/stores", type: "directory", children: [
        { name: "chatStore.ts", path: "src/stores/chatStore.ts", type: "file" },
        { name: "uiStore.ts", path: "src/stores/uiStore.ts", type: "file", gitStatus: "modified" },
      ]},
      { name: "App.tsx", path: "src/App.tsx", type: "file", gitStatus: "modified" },
      { name: "main.tsx", path: "src/main.tsx", type: "file" },
    ],
  },
  { name: "package.json", path: "package.json", type: "file" },
  { name: "tsconfig.json", path: "tsconfig.json", type: "file" },
  { name: "vite.config.ts", path: "vite.config.ts", type: "file" },
  { name: "AGENTS.md", path: "AGENTS.md", type: "file" },
  { name: "README.md", path: "README.md", type: "file" },
];

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
      return <FileImage size={13} className="text-purple-400" />;
    case "toml":
    case "yaml":
    case "yml":
      return <FileCog size={13} className="text-orange-400" />;
    default:
      return <File size={13} className="text-muted-foreground" />;
  }
}

function getGitColor(status?: string) {
  switch (status) {
    case "modified":
      return "text-yellow-400";
    case "added":
      return "text-green-400";
    case "deleted":
      return "text-red-400";
    case "untracked":
      return "text-muted-foreground";
    default:
      return "";
  }
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  defaultExpanded?: boolean;
}

function TreeNode({ node, depth, defaultExpanded = false }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || depth < 1);
  const isDir = node.type === "directory";
  const gitColor = getGitColor(node.gitStatus);

  return (
    <div>
      <button
        onClick={() => isDir && setExpanded(!expanded)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-sm px-1 py-[3px] text-[12px] transition-colors hover:bg-accent",
          depth === 0 && "font-medium",
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {isDir ? (
          expanded ? <ChevronDown size={12} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {isDir ? (
          expanded ? <FolderOpen size={13} className="shrink-0 text-yellow-400" /> : <Folder size={13} className="shrink-0 text-yellow-400" />
        ) : (
          getFileIcon(node.name)
        )}
        <span className={cn("truncate text-foreground/90", gitColor)}>{node.name}</span>
        {node.gitStatus && (
          <span className={cn("ml-auto shrink-0 text-[9px] font-medium uppercase", gitColor)}>
            {node.gitStatus === "modified" ? "M" : node.gitStatus === "added" ? "A" : node.gitStatus === "deleted" ? "D" : "?"}
          </span>
        )}
      </button>
      {isDir && expanded && node.children?.map((child) => (
        <TreeNode key={child.path} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function FileTree() {
  const [filter, setFilter] = useState("");
  const { t } = useI18n();

  const filteredTree = useMemo(() => {
    if (!filter.trim()) return DEMO_TREE;

    const lower = filter.toLowerCase();
    function matches(node: FileNode): boolean {
      if (node.name.toLowerCase().includes(lower)) return true;
      if (node.children) return node.children.some(matches);
      return false;
    }
    return DEMO_TREE.filter(matches);
  }, [filter]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex h-6 flex-1 items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2">
          <Search size={11} className="text-muted-foreground" />
          <input
            type="text"
            placeholder={t("filterFiles")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-full flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {filteredTree.map((node) => (
          <TreeNode key={node.path} node={node} depth={0} defaultExpanded={!!filter} />
        ))}
        {filteredTree.length === 0 && (
          <div className="px-4 py-6 text-center text-[11px] text-muted-foreground">
            {t("noMatchingFiles")}
          </div>
        )}
      </div>
    </div>
  );
}
