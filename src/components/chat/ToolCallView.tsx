import { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Wrench,
  FileText,
  Terminal,
  CheckCircle2,
  Loader2,
  AlertCircle,
  FilePlus,
  FileEdit,
  Search,
  Globe,
  FolderOpen,
} from "lucide-react";
import type { ToolCall } from "../../types";
import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n";
import { DiffView } from "./DiffView";

/* -------------------------------------------------------------------------- */
/*  Shared helpers                                                            */
/* -------------------------------------------------------------------------- */

interface ToolCallViewProps {
  toolCall: ToolCall;
}

function getStatusIcon(status: ToolCall["status"]) {
  switch (status) {
    case "running":
      return <Loader2 size={11} className="animate-spin text-secondary" />;
    case "done":
      return <CheckCircle2 size={11} className="text-success" />;
    case "error":
      return <AlertCircle size={11} className="text-error" />;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Try to parse toolCall.input as JSON; fall back to raw string. */
function tryParseInput(input: string): Record<string, unknown> | null {
  try {
    return JSON.parse(input) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Derive a file extension from a path string. */
function fileExt(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1) : "";
}

/** Language badge color lookup. */
const LANG_COLORS: Record<string, string> = {
  ts: "#3178c6",
  tsx: "#3178c6",
  js: "#f7df1e",
  jsx: "#f7df1e",
  py: "#3776ab",
  rs: "#dea584",
  go: "#00add8",
  css: "#563d7c",
  html: "#e34c26",
  json: "#292929",
  md: "#083fa1",
  sh: "#89e051",
  bash: "#89e051",
  yaml: "#cb171e",
  yml: "#cb171e",
  toml: "#9c4221",
  sql: "#e38c00",
};

/** Status badge component. */
function StatusBadge({ status }: { status: ToolCall["status"] }) {
  const { t } = useI18n();
  const styles: Record<ToolCall["status"], string> = {
    running:
      "bg-secondary/15 text-secondary animate-pulse",
    done: "bg-success/15 text-success",
    error: "bg-error/15 text-error",
  };
  const labels: Record<ToolCall["status"], string> = {
    running: t("a11y.toolCallRunning"),
    done: t("a11y.toolCallDone"),
    error: t("a11y.toolCallError"),
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
        styles[status],
      )}
    >
      {getStatusIcon(status)}
      {labels[status]}
    </span>
  );
}

/** Duration pill. */
function Duration({ ms }: { ms: number }) {
  return (
    <span className="text-[10px] text-muted-foreground tabular-nums">
      {formatDuration(ms)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Collapsible shell — used by every renderer                                */
/* -------------------------------------------------------------------------- */

interface RendererShellProps {
  toolCall: ToolCall;
  icon: React.ReactNode;
  iconColor?: string;
  label: string;
  preview?: string;
  children: React.ReactNode;
}

function RendererShell({
  toolCall,
  icon,
  iconColor,
  label,
  preview,
  children,
}: RendererShellProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-muted/30"
      role="region"
      aria-label={t("a11y.toolCallRegion")}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50"
        aria-label={t("a11y.toolCallToggle")}
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
        )}
        <span className={cn("shrink-0", iconColor ?? "text-muted-foreground")}>
          {icon}
        </span>
        <span className="font-medium text-foreground">{label}</span>
        {preview && (
          <span className="truncate text-muted-foreground">{preview}</span>
        )}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <StatusBadge status={toolCall.status} />
          {/* eslint-disable-next-line eqeqeq -- intentional loose eq to exclude both null and undefined */}
          {toolCall.duration != null && <Duration ms={toolCall.duration} />}
        </div>
      </button>

      {/* Expandable body */}
      {expanded && <div className="border-t border-border">{children}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  BashToolRenderer  — shell_exec                                            */
/* -------------------------------------------------------------------------- */

function BashToolRenderer({ toolCall }: ToolCallViewProps) {
  const parsed = tryParseInput(toolCall.input);
  const command =
    (parsed?.["command"] as string) ??
    (parsed?.["cmd"] as string) ??
    toolCall.input;

  return (
    <RendererShell
      toolCall={toolCall}
      icon={<Terminal size={12} />}
      iconColor="text-success"
      label="shell"
      preview={command.slice(0, 80)}
    >
      {/* Command header */}
      <div className="flex items-center gap-2 border-b border-border bg-[var(--color-surface-container)]/50 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-secondary">
          $
        </span>
        <span className="flex-1 truncate font-mono text-xs text-foreground">
          {command}
        </span>
      </div>

      {/* Output */}
      <ToolOutput toolCall={toolCall} variant="terminal" />
    </RendererShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  ReadToolRenderer  — file_read                                             */
/* -------------------------------------------------------------------------- */

function ReadToolRenderer({ toolCall }: ToolCallViewProps) {
  const parsed = tryParseInput(toolCall.input);
  const filePath =
    (parsed?.["path"] as string) ??
    (parsed?.["file_path"] as string) ??
    toolCall.input;
  const fileName = filePath.split("/").pop() ?? filePath;

  return (
    <RendererShell
      toolCall={toolCall}
      icon={<FileText size={12} />}
      iconColor="text-[var(--color-text-secondary)]"
      label="read"
      preview={filePath}
    >
      {/* File path header */}
      <div className="flex items-center gap-2 border-b border-border bg-[var(--color-surface-container)]/50 px-3 py-1.5">
        <span className="text-[10px] text-muted-foreground">{fileName}</span>
      </div>

      {/* Content with line numbers */}
      {toolCall.output ? (
        <div className="overflow-x-auto">
          <pre className="whitespace-pre-wrap px-3 py-2 text-xs font-mono leading-relaxed text-foreground/80">
            {toolCall.output.split("\n").map((line, i) => (
              <div key={i} className="flex">
                <span className="mr-3 inline-block w-8 shrink-0 select-none text-right text-muted-foreground/40 tabular-nums">
                  {i + 1}
                </span>
                <span>{line}</span>
              </div>
            ))}
          </pre>
        </div>
      ) : (
        <RunningPlaceholder />
      )}
    </RendererShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  WriteToolRenderer  — file_write                                           */
/* -------------------------------------------------------------------------- */

function WriteToolRenderer({ toolCall }: ToolCallViewProps) {
  const parsed = tryParseInput(toolCall.input);
  const filePath =
    (parsed?.["path"] as string) ??
    (parsed?.["file_path"] as string) ??
    toolCall.input;
  const fileName = filePath.split("/").pop() ?? filePath;
  const ext = fileExt(filePath);
  const langColor = LANG_COLORS[ext];

  return (
    <RendererShell
      toolCall={toolCall}
      icon={<FilePlus size={12} />}
      iconColor="text-primary"
      label="write"
      preview={filePath}
    >
      {/* File path + language badge */}
      <div className="flex items-center gap-2 border-b border-border bg-[var(--color-surface-container)]/50 px-3 py-1.5">
        <span className="text-[10px] text-muted-foreground">{fileName}</span>
        {ext && (
          <span
            className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none text-white"
            style={{ backgroundColor: langColor ?? "var(--color-secondary)" }}
          >
            {ext}
          </span>
        )}
      </div>

      <ToolOutput toolCall={toolCall} variant="code" />
    </RendererShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  PatchToolRenderer  — apply_patch                                          */
/* -------------------------------------------------------------------------- */

function PatchToolRenderer({ toolCall }: ToolCallViewProps) {
  const parsed = tryParseInput(toolCall.input);
  const filePath =
    (parsed?.["path"] as string) ??
    (parsed?.["file_path"] as string) ??
    toolCall.input;

  // Try to extract old/new content from output or input for diff display
  const oldContent = (parsed?.["oldContent"] as string) ?? (parsed?.["old"] as string) ?? "";
  const newContent =
    (parsed?.["newContent"] as string) ??
    (parsed?.["new"] as string) ??
    toolCall.output ??
    "";

  const hasDiffContent = oldContent || newContent;

  return (
    <RendererShell
      toolCall={toolCall}
      icon={<FileEdit size={12} />}
      iconColor="text-secondary"
      label="patch"
      preview={filePath}
    >
      {hasDiffContent ? (
        <DiffView
          filePath={filePath}
          oldContent={oldContent}
          newContent={newContent}
          defaultExpanded={true}
        />
      ) : (
        <ToolOutput toolCall={toolCall} variant="code" />
      )}
    </RendererShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  SearchToolRenderer  — file_search / glob                                  */
/* -------------------------------------------------------------------------- */

function SearchToolRenderer({ toolCall }: ToolCallViewProps) {
  const parsed = tryParseInput(toolCall.input);
  const pattern =
    (parsed?.["pattern"] as string) ??
    (parsed?.["query"] as string) ??
    toolCall.input;

  // Parse output as file list (one per line) and count
  const outputLines = toolCall.output
    ? toolCall.output.split("\n").filter(Boolean)
    : [];
  const matchCount = outputLines.length;

  return (
    <RendererShell
      toolCall={toolCall}
      icon={<Search size={12} />}
      iconColor="text-primary"
      label="search"
      preview={pattern.slice(0, 60)}
    >
      {/* Match count badge */}
      {toolCall.output && (
        <div className="flex items-center gap-2 border-b border-border bg-[var(--color-surface-container)]/50 px-3 py-1.5">
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
            {matchCount} {matchCount === 1 ? "result" : "results"}
          </span>
        </div>
      )}

      {/* File list */}
      {toolCall.output ? (
        <div className="max-h-48 overflow-y-auto">
          {outputLines.map((line, i) => (
            <div
              key={i}
              className="flex items-center gap-2 border-b border-border/30 px-3 py-1 text-xs last:border-b-0"
            >
              <FileText size={10} className="shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-foreground/80">
                {line}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <RunningPlaceholder />
      )}
    </RendererShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  FetchToolRenderer  — web_fetch                                            */
/* -------------------------------------------------------------------------- */

function FetchToolRenderer({ toolCall }: ToolCallViewProps) {
  const parsed = tryParseInput(toolCall.input);
  const url = (parsed?.["url"] as string) ?? toolCall.input;

  // Try to extract status code from output
  const statusCodeMatch = toolCall.output?.match(/(\d{3})/);
  const statusCode = statusCodeMatch?.[1];
  const isOk = statusCode && Number(statusCode) >= 200 && Number(statusCode) < 300;

  return (
    <RendererShell
      toolCall={toolCall}
      icon={<Globe size={12} />}
      iconColor="text-[var(--color-info, var(--color-primary))]"
      label="fetch"
      preview={url.slice(0, 80)}
    >
      {/* URL + status bar */}
      <div className="flex items-center gap-2 border-b border-border bg-[var(--color-surface-container)]/50 px-3 py-1.5">
        <Globe size={10} className="shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate font-mono text-[11px] text-foreground/70">
          {url}
        </span>
        {statusCode && (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none",
              isOk
                ? "bg-success/15 text-success"
                : "bg-error/15 text-error",
            )}
          >
            {statusCode}
          </span>
        )}
      </div>

      <ToolOutput toolCall={toolCall} variant="code" />
    </RendererShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  DirToolRenderer  — list_directory                                         */
/* -------------------------------------------------------------------------- */

function DirToolRenderer({ toolCall }: ToolCallViewProps) {
  const parsed = tryParseInput(toolCall.input);
  const dirPath =
    (parsed?.["path"] as string) ??
    (parsed?.["dir"] as string) ??
    toolCall.input;

  // Parse entries from output
  const entries = toolCall.output
    ? toolCall.output.split("\n").filter(Boolean)
    : [];

  return (
    <RendererShell
      toolCall={toolCall}
      icon={<FolderOpen size={12} />}
      iconColor="text-[var(--color-warning, var(--color-secondary))]"
      label="ls"
      preview={dirPath.slice(0, 60)}
    >
      {/* Directory path header */}
      <div className="flex items-center gap-2 border-b border-border bg-[var(--color-surface-container)]/50 px-3 py-1.5">
        <FolderOpen size={10} className="shrink-0 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">{dirPath}</span>
        {entries.length > 0 && (
          <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {entries.length} items
          </span>
        )}
      </div>

      {/* Tree-style listing */}
      {entries.length > 0 ? (
        <div className="max-h-48 overflow-y-auto">
          {entries.map((entry, i) => {
            const isDir =
              entry.endsWith("/") || entry.startsWith("📁") || entry.startsWith("d");
            const cleanName = entry
              .replace(/^[\u{1F4C1}\u{1F4C2}\u{1F4C2}\u{1F4C4}\u{1F5C2}]\s*/u, "")
              .replace(/^[drwx-]{10}\s+\S+\s+\S+\s+/, "");
            return (
              <div
                key={i}
                className="flex items-center gap-2 border-b border-border/30 px-3 py-1 text-xs last:border-b-0"
              >
                {isDir ? (
                  <FolderOpen
                    size={10}
                    className="shrink-0 text-[var(--color-warning, var(--color-secondary))]"
                  />
                ) : (
                  <FileText size={10} className="shrink-0 text-muted-foreground" />
                )}
                <span className="truncate font-mono text-foreground/80">
                  {cleanName || entry}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <RunningPlaceholder />
      )}
    </RendererShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Generic fallback renderer (unchanged behaviour)                           */
/* -------------------------------------------------------------------------- */

function GenericRenderer({ toolCall }: ToolCallViewProps) {
  return (
    <RendererShell
      toolCall={toolCall}
      icon={<Wrench size={12} />}
      label={toolCall.name}
      preview={toolCall.input.slice(0, 80)}
    >
      <ToolOutput toolCall={toolCall} variant="default" />
    </RendererShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared output sub-component                                               */
/* -------------------------------------------------------------------------- */

function ToolOutput({
  toolCall,
  variant,
}: {
  toolCall: ToolCall;
  variant: "default" | "terminal" | "code";
}) {
  if (toolCall.output) {
    if (variant === "terminal") {
      // Split stdout / stderr heuristically
      const lines = toolCall.output.split("\n");
      return (
        <div className="overflow-x-auto px-3 py-2 font-mono text-xs leading-relaxed">
          {lines.map((line, i) => (
            <div
              key={i}
              className={cn(
                toolCall.status === "error" && i === lines.length - 1
                  ? "text-error"
                  : "text-success/90",
              )}
            >
              {line}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div
        className={cn(
          "overflow-x-auto px-3 py-2 text-xs font-mono leading-relaxed",
          toolCall.status === "error"
            ? "text-error"
            : "text-muted-foreground",
        )}
      >
        <pre className="whitespace-pre-wrap">{toolCall.output}</pre>
      </div>
    );
  }

  return <RunningPlaceholder />;
}

function RunningPlaceholder() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
      <Loader2 size={11} className="animate-spin" />
      <span>Running...</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Renderer selector                                                         */
/* -------------------------------------------------------------------------- */

function selectRenderer(name: string): React.ComponentType<ToolCallViewProps> {
  if (name === "shell_exec" || name === "terminal" || name === "exec") {
    return BashToolRenderer;
  }
  if (name === "file_read") {
    return ReadToolRenderer;
  }
  if (name === "file_write") {
    return WriteToolRenderer;
  }
  if (name === "apply_patch") {
    return PatchToolRenderer;
  }
  if (name === "file_search" || name === "glob") {
    return SearchToolRenderer;
  }
  if (name === "web_fetch") {
    return FetchToolRenderer;
  }
  if (name === "list_directory") {
    return DirToolRenderer;
  }
  return GenericRenderer;
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

export function ToolCallView({ toolCall }: ToolCallViewProps) {
  const Renderer = useMemo(() => selectRenderer(toolCall.name), [toolCall.name]);
  return <Renderer toolCall={toolCall} />;
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
