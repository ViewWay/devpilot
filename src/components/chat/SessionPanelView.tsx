import { useState } from "react";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ApprovalQueue } from "./ApprovalOverlay";
import { CheckpointPanel } from "./CheckpointPanel";
import { useChatStore } from "../../stores/chatStore";
import { useUIStore } from "../../stores/uiStore";
import { Loader2, AlertCircle, History, X } from "lucide-react";
import { useI18n } from "../../i18n";
import { cn } from "../../lib/utils";

interface SessionPanelViewProps {
  /** The session ID to display. If null, shows the active session. */
  sessionId?: string | null;
  /** Whether this is a secondary panel in split view (shows header + close) */
  isSecondary?: boolean;
  /** Callback when the user closes this panel */
  onClose?: () => void;
  /** Additional class names */
  className?: string;
}

/**
 * A self-contained chat session panel. Renders the full chat interface
 * (messages, input, approvals, checkpoint) for a given session ID.
 *
 * In split view, two of these are rendered side-by-side.
 */
export function SessionPanelView({
  sessionId,
  isSecondary = false,
  onClose,
  className,
}: SessionPanelViewProps) {
  const { t } = useI18n();
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const isLoading = useChatStore((s) => s.isLoading);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  const error = useChatStore((s) => s.error);
  const pendingApprovals = useChatStore((s) => s.pendingApprovals);
  const resolveApproval = useChatStore((s) => s.resolveApproval);
  const approveAll = useChatStore((s) => s.approveAll);
  const [checkpointOpen, setCheckpointOpen] = useState(false);

  const sid = sessionId ?? activeSessionId;
  const session = useChatStore((s) => s.sessions.find((sess) => sess.id === sid));

  if (!session) {
    return (
      <div className={cn("flex h-full items-center justify-center text-muted-foreground", className)}>
        <p className="text-sm">{t("noSessionSelected")}</p>
      </div>
    );
  }

  return (
    <div className={cn("relative flex h-full flex-col", className)}>
      {/* Panel header for secondary split view panel */}
      {isSecondary && (
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-sm">
          <span className="truncate text-xs font-medium text-muted-foreground">{session.title}</span>
          <div className="flex-1" />
          <button
            onClick={() => setCheckpointOpen(!checkpointOpen)}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              checkpointOpen && "text-primary",
            )}
            title={t("checkpoints")}
          >
            <History size={12} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title={t("close")}
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* Loading indicator */}
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

      {/* Messages */}
      <MessageList sessionId={sid ?? undefined} />

      {/* Approval overlay */}
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

      {/* System prompt editor */}
      <SystemPromptEditorSlim />

      {/* Message input */}
      <MessageInput sessionId={sid ?? undefined} />

      {/* Checkpoint side panel */}
      <CheckpointPanel open={checkpointOpen} onClose={() => setCheckpointOpen(false)} />
    </div>
  );
}

/** Compact system prompt editor for split view panels. */
function SystemPromptEditorSlim() {
  const [open, setOpen] = useState(false);
  const systemPrompt = useUIStore((s) => s.systemPrompt);
  const setSystemPrompt = useUIStore((s) => s.setSystemPrompt);
  const { t } = useI18n();

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <span className="font-medium">{t("systemPrompt")}</span>
        {systemPrompt && !open && (
          <span className="truncate text-muted-foreground/60 max-w-[120px]">
            — {systemPrompt.slice(0, 30)}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-1.5">
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder={t("systemPromptPlaceholder")}
            rows={2}
            className="w-full resize-y rounded-md border border-input bg-background px-2 py-1 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}
    </div>
  );
}
