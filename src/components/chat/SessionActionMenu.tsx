/**
 * SessionActionMenu — Dropdown menu for session actions.
 *
 * Actions:
 *  - Export (opens SessionExportDialog)
 *  - Fork (creates new session from current)
 *  - Rewind (select message to rewind to)
 *  - Share (copy session link)
 *  - Delete
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Download,
  GitFork,
  RotateCcw,
  Share2,
  Trash2,
} from "lucide-react";
import { invoke } from "../../lib/ipc";
import { useI18n } from "../../i18n";
import { cn } from "../../lib/utils";
import { SessionExportDialog } from "./SessionExportDialog";

// ── Types ──────────────────────────────────────────────────

interface SessionActionMenuProps {
  sessionId: string;
}

interface MenuAction {
  id: string;
  icon: typeof Download;
  label: string;
  danger?: boolean;
}

// ── Actions config ─────────────────────────────────────────

const ACTIONS: MenuAction[] = [
  { id: "export", icon: Download, label: "Export" },
  { id: "fork", icon: GitFork, label: "Fork" },
  { id: "rewind", icon: RotateCcw, label: "Rewind" },
  { id: "share", icon: Share2, label: "Share" },
  { id: "delete", icon: Trash2, label: "Delete", danger: true },
];

// ── Component ──────────────────────────────────────────────

export function SessionActionMenu({ sessionId }: SessionActionMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showRewind, setShowRewind] = useState(false);
  const [messages, setMessages] = useState<Array<{ id: string; content: string; role: string; timestamp: string }>>([]);
  const [rewindToId, setRewindToId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) {return;}
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Handle action click
  const handleAction = useCallback(
    async (actionId: string) => {
      switch (actionId) {
        case "export":
          setOpen(false);
          setShowExport(true);
          break;

        case "fork": {
          setOpen(false);
          try {
            await invoke("fork_session", { sessionId });
          } catch (err) {
            console.error("Failed to fork session:", err);
          }
          break;
        }

        case "rewind": {
          setOpen(false);
          try {
            const msgs = await invoke<
              Array<{ id: string; content: string; role: string; timestamp: string }>
            >("get_session_messages", { sessionId });
            setMessages(msgs ?? []);
            setShowRewind(true);
          } catch (err) {
            console.error("Failed to load messages:", err);
          }
          break;
        }

        case "share": {
          try {
            const url = `${window.location.origin}/session/${sessionId}`;
            await navigator.clipboard.writeText(url);
            setShareCopied(true);
            setTimeout(() => setShareCopied(false), 2000);
          } catch (err) {
            console.error("Failed to copy link:", err);
          }
          break;
        }

        case "delete":
          setConfirmDelete(true);
          break;
      }
    },
    [sessionId],
  );

  // Confirm delete
  const handleDelete = useCallback(async () => {
    try {
      await invoke("delete_session", { id: sessionId });
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
    setOpen(false);
    setConfirmDelete(false);
  }, [sessionId]);

  // Rewind to message
  const handleRewind = useCallback(
    async (messageId: string) => {
      try {
        await invoke("rewind_session", { sessionId, messageId });
      } catch (err) {
        console.error("Failed to rewind:", err);
      }
      setShowRewind(false);
      setRewindToId(null);
    },
    [sessionId],
  );

  return (
    <>
      <div className="relative inline-block" ref={menuRef}>
        {/* Trigger */}
        <button
          onClick={() => setOpen(!open)}
          className="p-1 rounded-md hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
          title="Session actions"
        >
          <Download size={14} />
        </button>

        {/* Dropdown */}
        {open && (
          <div
            className="absolute right-0 top-full z-20 mt-1 min-w-[160px] rounded-lg border shadow-lg py-1"
            style={{
              background: "var(--color-surface)",
              borderColor: "var(--color-border)",
            }}
          >
            {ACTIONS.map((action) => {
              const Icon = action.icon;

              // Special handling for share (shows feedback)
              if (action.id === "share" && shareCopied) {
                return (
                  <button
                    key={action.id}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-success"
                    disabled
                  >
                    <Share2 size={12} />
                    Link copied!
                  </button>
                );
              }

              // Delete with confirmation
              if (action.id === "delete" && confirmDelete) {
                return (
                  <div key={action.id} className="px-3 py-1.5">
                    <div className="text-[10px] text-error mb-1">
                      {t("confirmDelete")}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={handleDelete}
                        className="flex-1 rounded-md bg-error/80 px-2 py-1 text-[10px] text-white hover:bg-error transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 rounded-md border px-2 py-1 text-[10px] hover:bg-accent/50 transition-colors"
                        style={{ borderColor: "var(--color-border)" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={action.id}
                  onClick={() => handleAction(action.id)}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors",
                    action.danger
                      ? "text-error hover:bg-error/10"
                      : "hover:bg-accent/50",
                  )}
                >
                  <Icon size={12} />
                  {action.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Export dialog */}
      {showExport && (
        <SessionExportDialog
          sessionId={sessionId}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* Rewind dialog */}
      {showRewind && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowRewind(false);
              setRewindToId(null);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border shadow-xl"
            style={{
              background: "var(--color-surface)",
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span className="text-sm font-semibold">Rewind to Message</span>
              <button
                onClick={() => {
                  setShowRewind(false);
                  setRewindToId(null);
                }}
                className="p-1 rounded-md hover:bg-accent/50 transition-colors"
              >
                ×
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
                  No messages to rewind to
                </div>
              ) : (
                messages.map((msg, i) => (
                  <button
                    key={msg.id}
                    onClick={() => setRewindToId(msg.id)}
                    className={cn(
                      "w-full text-left px-4 py-2 border-b transition-colors",
                      rewindToId === msg.id
                        ? "bg-[var(--color-brand)]/10"
                        : "hover:bg-accent/30",
                    )}
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
                      <span className="font-medium capitalize">{msg.role}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {msg.content.slice(0, 100)}
                    </div>
                  </button>
                ))
              )}
            </div>

            <div
              className="flex items-center justify-end gap-2 px-4 py-3 border-t"
              style={{ borderColor: "var(--color-border)" }}
            >
              <button
                onClick={() => {
                  setShowRewind(false);
                  setRewindToId(null);
                }}
                className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors"
                style={{ borderColor: "var(--color-border)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => rewindToId && handleRewind(rewindToId)}
                disabled={!rewindToId}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 transition-colors"
                style={{ background: "var(--color-brand)" }}
              >
                <RotateCcw size={12} />
                Rewind
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
