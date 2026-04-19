import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ApprovalQueue } from "./ApprovalOverlay";
import { useChatStore } from "../../stores/chatStore";
import { useUIStore } from "../../stores/uiStore";
import { SplitView } from "../layout/SplitView";
import { FilesPanel } from "../panels/FilesPanel";
import { TerminalPanel } from "../panels/TerminalPanel";
import { PreviewPanel } from "../panels/PreviewPanel";
import { RightPanelTabs } from "../panels/RightPanelTabs";
import { Loader2, AlertCircle } from "lucide-react";
import { useI18n } from "../../i18n";

function ChatContent() {
  const isLoading = useChatStore((s) => s.isLoading);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  const error = useChatStore((s) => s.error);
  const pendingApprovals = useChatStore((s) => s.pendingApprovals);
  const resolveApproval = useChatStore((s) => s.resolveApproval);
  const approveAll = useChatStore((s) => s.approveAll);
  const { t } = useI18n();

  return (
    <div className="flex h-full flex-col">
      {isLoading && !streamingMessageId && (
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
      {pendingApprovals.length > 0 && (
        <div className="border-t border-border px-4 py-2 max-h-[40vh] overflow-y-auto">
          <ApprovalQueue
            requests={pendingApprovals}
            onApprove={(id) => resolveApproval(id, true)}
            onDeny={(id) => resolveApproval(id, false)}
            onAllowAll={approveAll}
          />
        </div>
      )}
      <MessageInput />
    </div>
  );
}

function RightContent() {
  const rightPanel = useUIStore((s) => s.rightPanel);
  return (
    <div className="flex h-full flex-col">
      <RightPanelTabs />
      <div className="flex-1 overflow-hidden">
        {rightPanel === "files" && <FilesPanel />}
        {rightPanel === "terminal" && <TerminalPanel />}
        {rightPanel === "preview" && <PreviewPanel />}
      </div>
    </div>
  );
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
