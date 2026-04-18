import { Terminal as TerminalIcon } from "lucide-react";

export function TerminalPanel() {
  return (
    <div className="flex h-full flex-col bg-[#1a1b26]">
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
        <TerminalIcon size={14} className="text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Terminal</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500/70" />
          <span className="h-2 w-2 rounded-full bg-yellow-500/70" />
          <span className="h-2 w-2 rounded-full bg-green-500/70" />
        </div>
      </div>
      <div className="flex flex-1 flex-col px-3 py-2 font-mono text-xs text-green-400">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">$</span>
          <span className="animate-pulse">_</span>
        </div>
      </div>
    </div>
  );
}
