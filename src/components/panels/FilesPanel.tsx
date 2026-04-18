import { FolderOpen } from "lucide-react";
import { FileTree } from "./FileTree";

export function FilesPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <FolderOpen size={14} className="text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Files</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <FileTree />
      </div>
    </div>
  );
}
