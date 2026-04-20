import { useEffect, useState } from "react";
import { useCheckpointStore } from "../../stores/checkpointStore";
import { useChatStore } from "../../stores/chatStore";
import type { CheckpointInfo } from "../../types";
import { History, RotateCcw, Plus, Clock } from "lucide-react";
import { useI18n } from "../../i18n";

/**
 * CheckpointPanel — side panel showing session checkpoint timeline.
 * Users can create checkpoints, view history, and rewind to a previous state.
 */
export function CheckpointPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const checkpoints = useCheckpointStore((s) => s.checkpoints);
  const loading = useCheckpointStore((s) => s.loading);
  const error = useCheckpointStore((s) => s.error);
  const loadCheckpoints = useCheckpointStore((s) => s.loadCheckpoints);
  const rewindCheckpoint = useCheckpointStore((s) => s.rewindCheckpoint);
  const messages = useChatStore((s) => {
    const sess = s.sessions.find((x) => x.id === s.activeSessionId);
    return sess?.messages ?? [];
  });
  const { t } = useI18n();

  const [rewinding, setRewinding] = useState<string | null>(null);

  // Load checkpoints when session changes or panel opens
  useEffect(() => {
    if (open && activeSessionId) {
      loadCheckpoints(activeSessionId);
    }
  }, [open, activeSessionId, loadCheckpoints]);

  const handleRewind = async (checkpointId: string) => {
    if (!activeSessionId) { return; }
    setRewinding(checkpointId);
    try {
      await rewindCheckpoint(checkpointId, activeSessionId);
    } finally {
      setRewinding(null);
    }
  };

  const handleCreateCheckpoint = async () => {
    if (!activeSessionId || messages.length === 0) { return; }
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) { return; }
    const summary = lastMsg.content.slice(0, 80);
    const { createCheckpoint } = useCheckpointStore.getState();
    await createCheckpoint(activeSessionId, lastMsg.id, summary, 0);
  };

  if (!open) { return null; }

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-72 flex-col border-l border-border bg-background/95 backdrop-blur-sm shadow-lg animate-in slide-in-from-right">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <History size={14} className="text-muted-foreground" />
          <span className="text-sm font-medium">{t("checkpoints") ?? "Checkpoints"}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCreateCheckpoint}
            className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
            title={t("createCheckpoint") ?? "Create checkpoint"}
          >
            <Plus size={14} />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading && (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            {t("loading") ?? "Loading..."}
          </div>
        )}
        {error && (
          <div className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
            {error}
          </div>
        )}
        {!loading && checkpoints.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {t("noCheckpoints") ?? "No checkpoints yet"}
          </div>
        )}
        {checkpoints.map((cp: CheckpointInfo) => (
          <CheckpointItem
            key={cp.id}
            checkpoint={cp}
            isRewinding={rewinding === cp.id}
            onRewind={() => handleRewind(cp.id)}
            t={t}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
        {checkpoints.length} {t("checkpointsCount") ?? "checkpoints"}
      </div>
    </div>
  );
}

function CheckpointItem({
  checkpoint,
  isRewinding,
  onRewind,
  t,
}: {
  checkpoint: CheckpointInfo;
  isRewinding: boolean;
  onRewind: () => void;
  t: (key: string) => string | undefined;
}) {
  const timeStr = new Date(checkpoint.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = new Date(checkpoint.createdAt).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="group mb-2 rounded-md border border-border/50 p-2 hover:border-border">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">
            {checkpoint.summary || `Checkpoint ${checkpoint.id.slice(0, 8)}`}
          </p>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {dateStr} {timeStr}
            </span>
            {checkpoint.tokenCount > 0 && (
              <span>{checkpoint.tokenCount} tokens</span>
            )}
          </div>
        </div>
        <button
          onClick={onRewind}
          disabled={isRewinding}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-50"
          title={t("rewindToHere") ?? "Rewind to here"}
        >
          <RotateCcw size={12} className={isRewinding ? "animate-spin" : ""} />
        </button>
      </div>
    </div>
  );
}
