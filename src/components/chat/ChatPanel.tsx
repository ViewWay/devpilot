import { useState } from "react";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ApprovalQueue } from "./ApprovalOverlay";
import { CheckpointPanel } from "./CheckpointPanel";
import { useChatStore } from "../../stores/chatStore";
import { useUIStore } from "../../stores/uiStore";
import { SplitView } from "../layout/SplitView";
import { FilesPanel } from "../panels/FilesPanel";
import { TerminalPanel } from "../panels/TerminalPanel";
import { PreviewPanel } from "../panels/PreviewPanel";
import { RightPanelTabs } from "../panels/RightPanelTabs";
import { Loader2, AlertCircle, History, ChevronDown, ChevronRight } from "lucide-react";
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
      <SystemPromptEditor />
      <MessageInput />
    </div>
  );
}

/** Collapsible system prompt editor above the message input. */
function SystemPromptEditor() {
  const [open, setOpen] = useState(false);
  const systemPrompt = useUIStore((s) => s.systemPrompt);
  const setSystemPrompt = useUIStore((s) => s.setSystemPrompt);
  const { t } = useI18n();

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="font-medium">{t("systemPrompt")}</span>
        {systemPrompt && !open && (
          <span className="truncate text-muted-foreground/60 max-w-[200px]">
            — {systemPrompt.slice(0, 50)}
          </span>
        )}
      </button>
      {open && (
        <div className="px-4 pb-2">
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder={t("systemPromptPlaceholder")}
            rows={3}
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}
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
  const [checkpointOpen, setCheckpointOpen] = useState(false);

  const chatContent = (
    <div className="relative flex h-full">
      {/* Chat area */}
      <div className="flex flex-1 flex-col">
        {/* Checkpoint toggle button */}
        <button
          onClick={() => setCheckpointOpen(!checkpointOpen)}
          className="absolute right-2 top-2 z-10 rounded-md border border-border bg-background/80 p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground backdrop-blur-sm"
          title={checkpointOpen ? "Close checkpoints" : "Open checkpoints"}
        >
          <History size={14} />
        </button>
        <ChatContent />
      </div>
      {/* Checkpoint side panel */}
      <CheckpointPanel open={checkpointOpen} onClose={() => setCheckpointOpen(false)} />
    </div>
  );

  if (rightPanel === "none") {
    return chatContent;
  }

  return (
    <SplitView left={chatContent} right={<RightContent />} />
  );
}
