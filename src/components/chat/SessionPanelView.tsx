import { useState, useMemo } from "react";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ApprovalQueue } from "./ApprovalOverlay";
import { CheckpointPanel } from "./CheckpointPanel";
import { EnvVarsEditor } from "./EnvVarsEditor";
import { useChatStore } from "../../stores/chatStore";
import { useUIStore } from "../../stores/uiStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { Loader2, AlertCircle, History, X, ChevronsUpDown } from "lucide-react";
import { useI18n } from "../../i18n";
import { SessionCostBadge } from "./SessionCostBadge";
import { ContextSizeBar } from "./ContextSizeBar";
import { SessionActionMenu } from "./SessionActionMenu";
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
      <div className={cn("flex h-full items-center justify-center text-[var(--color-text-secondary)]", className)}>
        <p className="text-sm">{t("noSessionSelected")}</p>
      </div>
    );
  }

  return (
    <div className={cn("relative flex h-full flex-col", className)}>
      {/* Panel header for secondary split view panel */}
      {isSecondary && (
        <SecondaryPanelHeader
          sessionTitle={session.title}
          currentSessionId={sid!}
          onToggleCheckpoint={() => setCheckpointOpen(!checkpointOpen)}
          checkpointOpen={checkpointOpen}
          onClose={onClose}
        />
      )}

      {/* Loading indicator */}
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

      {/* Messages */}
      <MessageList sessionId={sid ?? undefined} />

      {/* Approval overlay */}
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

      {/* System prompt editor */}
      <SystemPromptEditorSlim />

      {/* Environment variables editor */}
      <EnvVarsEditor sessionId={sid ?? undefined} />

      {/* Session cost badge */}
      <SessionCostBadge />

      {/* Context size bar */}
      <ContextSizeBar sessionId={sid ?? undefined} />

      {/* Message input */}
      <MessageInput sessionId={sid ?? undefined} />

      {/* Checkpoint side panel */}
      <CheckpointPanel open={checkpointOpen} onClose={() => setCheckpointOpen(false)} />
    </div>
  );
}

// ── Secondary Panel Header with Session Switcher ──────────────────

interface SecondaryPanelHeaderProps {
  sessionTitle: string;
  currentSessionId: string;
  onToggleCheckpoint: () => void;
  checkpointOpen: boolean;
  onClose?: () => void;
}

function SecondaryPanelHeader({
  sessionTitle,
  currentSessionId,
  onToggleCheckpoint,
  checkpointOpen,
  onClose,
}: SecondaryPanelHeaderProps) {
  const { t } = useI18n();
  const sessions = useChatStore((s) => s.sessions);
  const setSecondarySession = useUIStore((s) => s.setSecondarySession);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Show sessions that are different from the current secondary session
  const availableSessions = useMemo(
    () => sessions.filter((s) => !s.archived),
    [sessions],
  );

  const handleSelect = (id: string) => {
    setSecondarySession(id);
    setDropdownOpen(false);
  };

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--color-border)]/40 bg-[var(--color-surface-container-low)]/80 px-3 backdrop-blur-sm">
      {/* Session switcher dropdown */}
      <div className="relative flex-1 min-w-0">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors",
            "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]",
          )}
        >
          <span className="truncate font-medium">{sessionTitle}</span>
          <ChevronsUpDown size={12} className="shrink-0 opacity-50" />
        </button>

        {/* Dropdown */}
        {dropdownOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-50"
              onClick={() => setDropdownOpen(false)}
            />
            <div className={cn(
              "absolute left-0 top-full z-50 mt-1 min-w-[200px] max-h-[300px] overflow-y-auto",
              "rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)]",
              "shadow-lg shadow-black/10 p-1",
            )}>
              {availableSessions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-[var(--color-text-tertiary)]">
                  {t("noSessions")}
                </div>
              ) : (
                availableSessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelect(s.id)}
                    className={cn(
                      "flex w-full items-center rounded-md px-3 py-1.5 text-xs transition-colors text-left",
                      s.id === currentSessionId
                        ? "bg-[var(--color-brand)]/10 text-[var(--color-brand)] font-medium"
                        : "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]",
                    )}
                  >
                    <span className="truncate">{s.title}</span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Session actions menu */}
      <SessionActionMenu sessionId={currentSessionId} />

      {/* Checkpoint toggle */}
      <button
        onClick={onToggleCheckpoint}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors",
          "hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]",
          checkpointOpen && "text-[var(--color-brand)]",
        )}
        title={t("checkpoints")}
      >
        <History size={13} />
      </button>

      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors",
            "hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]",
          )}
          title={t("close")}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

/** Compact system prompt editor for split view panels. */
function SystemPromptEditorSlim() {
  const [open, setOpen] = useState(false);
  const systemPrompt = useSettingsStore((s) => s.systemPrompt);
  const setSystemPrompt = useSettingsStore((s) => s.setSystemPrompt);
  const { t } = useI18n();

  return (
    <div className="border-t border-[var(--color-border)]/40">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-1 text-[11px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
      >
        <span className="font-medium">{t("systemPrompt")}</span>
        {systemPrompt && !open && (
          <span className="truncate text-[var(--color-text-tertiary)] max-w-[120px]">
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
            className="w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
          />
        </div>
      )}
    </div>
  );
}
