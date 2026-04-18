import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { useChatStore } from "../../stores/chatStore";
import { useUIStore } from "../../stores/uiStore";
import { SplitView } from "../layout/SplitView";
import { FilesPanel } from "../panels/FilesPanel";
import { TerminalPanel } from "../panels/TerminalPanel";
import { PreviewPanel } from "../panels/PreviewPanel";
import { Loader2, AlertCircle } from "lucide-react";
import { useI18n } from "../../i18n";

function ChatContent() {
  const isLoading = useChatStore((s) => s.isLoading);
  const error = useChatStore((s) => s.error);
  const { t } = useI18n();

  return (
    <div className="flex h-full flex-col">
      {isLoading && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2">
          <Loader2 size={14} className="animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">{t("thinking")}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2">
          <AlertCircle size={14} className="text-destructive" />
          <span className="text-xs text-destructive">{error}</span>
        </div>
      )}
      <MessageList />
      <MessageInput />
    </div>
  );
}

function RightContent() {
  const rightPanel = useUIStore((s) => s.rightPanel);
  switch (rightPanel) {
    case "files":
      return <FilesPanel />;
    case "terminal":
      return <TerminalPanel />;
    case "preview":
      return <PreviewPanel />;
    default:
      return null;
  }
}

export function ChatPanel() {
  const rightPanel = useUIStore((s) => s.rightPanel);

  if (rightPanel === "none") {
    return <ChatContent />;
  }

  return (
    <SplitView left={<ChatContent />} right={<RightContent />} />
  );
}
