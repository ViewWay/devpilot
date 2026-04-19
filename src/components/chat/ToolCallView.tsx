import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Wrench,
  FileText,
  Terminal,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { ToolCall } from "../../types";
import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n";

interface ToolCallViewProps {
  toolCall: ToolCall;
}

function getToolIcon(name: string) {
  if (name.includes("shell") || name.includes("terminal") || name.includes("exec")) {
    return <Terminal size={12} />;
  }
  if (name.includes("file") || name.includes("read") || name.includes("write")) {
    return <FileText size={12} />;
  }
  return <Wrench size={12} />;
}

function getStatusIcon(status: ToolCall["status"]) {
  switch (status) {
    case "running":
      return <Loader2 size={11} className="animate-spin text-blue-400" />;
    case "done":
      return <CheckCircle2 size={11} className="text-emerald-400" />;
    case "error":
      return <AlertCircle size={11} className="text-red-400" />;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) {return `${ms}ms`;}
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ToolCallView({ toolCall }: ToolCallViewProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/30" role="region" aria-label={t("a11y.toolCallRegion")}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50"
        aria-label={t("a11y.toolCallToggle")}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={12} className="text-muted-foreground" /> : <ChevronRight size={12} className="text-muted-foreground" />}
        <span className="text-muted-foreground">{getToolIcon(toolCall.name)}</span>
        <span className="font-medium text-foreground">{toolCall.name}</span>
        <span className="truncate text-muted-foreground">{toolCall.input}</span>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {getStatusIcon(toolCall.status)}
          {/* eslint-disable-next-line eqeqeq -- intentional loose eq to exclude both null and undefined */}
          {toolCall.duration != null && (
            <span className="text-[10px] text-muted-foreground">{formatDuration(toolCall.duration)}</span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border">
          {toolCall.output && (
            <div className={cn(
              "overflow-x-auto px-3 py-2 text-xs font-mono leading-relaxed",
              toolCall.status === "error" ? "text-red-400" : "text-muted-foreground",
            )}>
              <pre className="whitespace-pre-wrap">{toolCall.output}</pre>
            </div>
          )}
          {!toolCall.output && toolCall.status === "running" && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 size={11} className="animate-spin" />
              <span>Running...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ToolCallListProps {
  toolCalls: ToolCall[];
}

export function ToolCallList({ toolCalls }: ToolCallListProps) {
  return (
    <div className="space-y-1.5 mt-2">
      {toolCalls.map((tc) => (
        <ToolCallView key={tc.id} toolCall={tc} />
      ))}
    </div>
  );
}
