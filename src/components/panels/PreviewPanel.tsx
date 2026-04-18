import { Eye } from "lucide-react";

export function PreviewPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Eye size={14} className="text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Preview</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-muted-foreground">
        <Eye size={24} className="opacity-40" />
        <p className="text-xs text-center">
          Preview will appear here when a file is selected.
        </p>
      </div>
    </div>
  );
}
