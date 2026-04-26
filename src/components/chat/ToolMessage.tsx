import {
  Wrench,
  Terminal,
  FileText,
  FilePlus,
  FileEdit,
  Search,
  Globe,
  FolderOpen,
} from "lucide-react";
import { useI18n } from "../../i18n";
import { ToolCallList } from "./ToolCallView";
import type { Message } from "../../types";

function getToolMessageIcon(toolCalls: Message["toolCalls"]) {
  if (!toolCalls || toolCalls.length === 0) {return <Wrench size={12} />;}
  const name = toolCalls[0]!.name;
  if (name === "shell_exec" || name === "terminal" || name === "exec")
    {return <Terminal size={12} className="text-[var(--color-text-secondary)]" />;}
  if (name === "file_read")
    {return <FileText size={12} className="text-[var(--color-text-secondary)]" />;}
  if (name === "file_write")
    {return <FilePlus size={12} className="text-[var(--color-text-secondary)]" />;}
  if (name === "apply_patch")
    {return <FileEdit size={12} className="text-[var(--color-text-secondary)]" />;}
  if (name === "file_search" || name === "glob")
    {return <Search size={12} className="text-[var(--color-text-secondary)]" />;}
  if (name === "web_fetch")
    {return <Globe size={12} className="text-[var(--color-text-secondary)]" />;}
  if (name === "list_directory")
    {return <FolderOpen size={12} className="text-[var(--color-text-secondary)]" />;}
  return <Wrench size={12} className="text-[var(--color-text-secondary)]" />;
}

type ToolMessageProps = {
  message: Message;
};

/**
 * ToolMessage — renders a tool call message with tool-specific icon,
 * content preview, and expandable tool call details via ToolCallList.
 */
export function ToolMessage({ message }: ToolMessageProps) {
  const { t } = useI18n();

  return (
    <div className="flex items-start gap-3" role="article" aria-label={t("a11y.toolMessage")}>
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--color-surface-container)]">
        {getToolMessageIcon(message.toolCalls)}
      </div>
      <div className="min-w-0 flex-1">
        {message.content && (
          <div className="rounded-lg border border-[var(--color-border)]/40 bg-[var(--color-surface-container)]/30 px-3 py-2 text-xs leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap">
            {message.content}
          </div>
        )}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallList toolCalls={message.toolCalls} />
        )}
      </div>
    </div>
  );
}
