/**
 * AgentTaskPanel — Displays a list of agent tasks with status tracking.
 *
 * Features:
 *  - Task list with status badges (pending / in_progress / completed / failed / cancelled)
 *  - Filter by status
 *  - Expandable task details showing description and result
 *  - Auto-refresh via polling
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  List,
  Filter,
} from "lucide-react";
import { invoke } from "../../lib/ipc";
import { useI18n } from "../../i18n";
import { cn } from "../../lib/utils";

// ── Types ──────────────────────────────────────────────────

type TaskStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

interface AgentTask {
  id: string;
  name: string;
  description?: string;
  status: TaskStatus;
  result?: string;
  createdAt: string;
  updatedAt?: string;
}

// ── Status badge config ────────────────────────────────────

const STATUS_CONFIG: Record<
  TaskStatus,
  { icon: typeof CheckCircle; color: string; bg: string; label: string }
> = {
  pending: {
    icon: Clock,
    color: "text-muted-foreground",
    bg: "bg-muted/50",
    label: "Pending",
  },
  in_progress: {
    icon: Loader2,
    color: "text-[var(--color-brand)]",
    bg: "bg-[var(--color-brand)]/10",
    label: "In Progress",
  },
  completed: {
    icon: CheckCircle,
    color: "text-success",
    bg: "bg-success/10",
    label: "Completed",
  },
  failed: {
    icon: XCircle,
    color: "text-error",
    bg: "bg-error/10",
    label: "Failed",
  },
  cancelled: {
    icon: XCircle,
    color: "text-muted-foreground",
    bg: "bg-muted/30",
    label: "Cancelled",
  },
};

const STATUS_FILTERS: Array<{ value: TaskStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

// ── Component ──────────────────────────────────────────────

export function AgentTaskPanel() {
  const { t: _t } = useI18n();
  void _t;
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    try {
      setError(null);
      const result = await invoke<AgentTask[]>("agent_list_tasks", {});
      setTasks(result ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + auto-refresh every 10s
  useEffect(() => {
    fetchTasks();
    refreshTimer.current = setInterval(fetchTasks, 10_000);
    return () => {
      if (refreshTimer.current) {clearInterval(refreshTimer.current);}
    };
  }, [fetchTasks]);

  // Toggle task details
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Filtered tasks
  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--color-surface)", color: "var(--color-text-primary)" }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--color-border)" }}>
        <List size={14} />
        <span className="text-xs font-semibold">Agent Tasks</span>
        <span className="text-xs text-muted-foreground">({tasks.length})</span>
        <div className="flex-1" />

        {/* Filter dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className={cn(
              "flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
              "hover:bg-accent/50",
            )}
            style={{ borderColor: "var(--color-border)" }}
          >
            <Filter size={11} />
            {STATUS_FILTERS.find((f) => f.value === filter)?.label ?? "All"}
          </button>

          {showFilterMenu && (
            <div
              className="absolute right-0 top-full z-10 mt-1 min-w-[140px] rounded-md border shadow-lg"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => {
                    setFilter(f.value);
                    setShowFilterMenu(false);
                  }}
                  className={cn(
                    "block w-full text-left px-3 py-1.5 text-xs transition-colors",
                    "hover:bg-accent/50",
                    filter === f.value && "font-medium",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
            <Loader2 size={14} className="mr-2 animate-spin" />
            Loading tasks...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-error text-xs">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
            No tasks found
          </div>
        ) : (
          filtered.map((task) => {
            const cfg = STATUS_CONFIG[task.status];
            const StatusIcon = cfg.icon;
            const isExpanded = expandedIds.has(task.id);

            return (
              <div
                key={task.id}
                className="border-b transition-colors hover:bg-accent/30"
                style={{ borderColor: "var(--color-border)" }}
              >
                {/* Task row */}
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 text-left"
                  onClick={() => toggleExpand(task.id)}
                >
                  <StatusIcon
                    size={13}
                    className={cn(cfg.color, task.status === "in_progress" && "animate-spin")}
                  />
                  <span className="flex-1 text-xs truncate">{task.name}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      cfg.bg,
                      cfg.color,
                    )}
                  >
                    {cfg.label}
                  </span>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-3 pb-2 space-y-1.5">
                    {task.description && (
                      <div className="text-xs text-muted-foreground">
                        {task.description}
                      </div>
                    )}
                    {task.result && (
                      <div
                        className="rounded-md border p-2 text-xs font-mono whitespace-pre-wrap"
                        style={{
                          borderColor: "var(--color-border)",
                          background: "var(--color-surface)",
                          opacity: 0.8,
                        }}
                      >
                        {task.result}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground">
                      Created: {new Date(task.createdAt).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
