import { useState } from "react";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ApprovalQueue } from "./ApprovalOverlay";
import { CheckpointPanel } from "./CheckpointPanel";
import { SessionPanelView } from "./SessionPanelView";
import { useChatStore } from "../../stores/chatStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUIStore } from "../../stores/uiStore";
import { SplitView } from "../layout/SplitView";
import { DualSessionSplitView } from "../layout/DualSessionSplitView";
import { FilesPanel } from "../panels/FilesPanel";
import { TerminalPanel } from "../panels/TerminalPanel";
import { PreviewPanel } from "../panels/PreviewPanel";
import { GitPanel } from "../panels/GitPanel";
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
        <div className="flex items-center gap-2 border-b border-[var(--color-border)]/40 bg-[var(--color-surface-container)]/30 px-4 py-2">
          <Loader2 size={14} className="animate-spin text-[var(--color-brand)]" />
          <span className="text-xs text-[var(--color-text-secondary)]">{t("thinking")}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 border-b border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-4 py-2">
          <AlertCircle size={14} className="text-[var(--color-error)]" />
          <span className="text-xs text-[var(--color-error)]">{error}</span>
        </div>
      )}
      <MessageList />
      {pendingApprovals.length > 0 && (
        <div className="border-t border-[var(--color-border)]/40 px-4 py-2 max-h-[40vh] overflow-y-auto">
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
  const systemPrompt = useSettingsStore((s) => s.systemPrompt);
  const setSystemPrompt = useSettingsStore((s) => s.setSystemPrompt);
  const { t } = useI18n();

  return (
    <div className="border-t border-[var(--color-border)]/40">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-4 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="font-medium">{t("systemPrompt")}</span>
        {systemPrompt && !open && (
          <span className="truncate text-[var(--color-text-tertiary)] max-w-[200px]">
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
            className="w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
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
        {rightPanel === "git" && <GitPanel />}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const rightPanel = useUIStore((s) => s.rightPanel);
  const splitViewActive = useUIStore((s) => s.splitViewActive);
  const secondarySessionId = useUIStore((s) => s.secondarySessionId);
  const closeSplitView = useUIStore((s) => s.closeSplitView);
  const [checkpointOpen, setCheckpointOpen] = useState(false);

  const chatContent = (
    <div className="relative flex h-full overflow-hidden">
      {/* Chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Checkpoint toggle button */}
        <button
          onClick={() => setCheckpointOpen(!checkpointOpen)}
          className="absolute right-2 top-2 z-10 rounded-md border border-[var(--color-border)]/40 bg-[var(--color-surface)]/80 p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] backdrop-blur-sm"
          title={checkpointOpen ? "Close checkpoints" : "Open checkpoints"}
        >
          <History size={14} />
        </button>
        <ChatContent />
      </div>
      {/* Checkpoint side panel — absolute overlay to avoid layout collision */}
      <CheckpointPanel open={checkpointOpen} onClose={() => setCheckpointOpen(false)} />
    </div>
  );

  // When split view is active, render dual session layout
  if (splitViewActive && secondarySessionId) {
    const primaryPanel = <SessionPanelView />;
    const secondaryPanel = (
      <SessionPanelView
        sessionId={secondarySessionId}
        isSecondary
        onClose={closeSplitView}
      />
    );

    // If right panel is also open, nest split views
    if (rightPanel !== "none") {
      return (
        <SplitView
          left={
            <DualSessionSplitView primary={primaryPanel} secondary={secondaryPanel} />
          }
          right={<RightContent />}
        />
      );
    }

    return (
      <DualSessionSplitView primary={primaryPanel} secondary={secondaryPanel} />
    );
  }

  if (rightPanel === "none") {
    return chatContent;
  }

  return (
    <SplitView left={chatContent} right={<RightContent />} />
  );
}
