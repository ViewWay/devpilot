import { useEffect, useState, useCallback } from "react";
import { useSchedulerStore } from "../stores/schedulerStore";
import { useI18n } from "../i18n";
import type { TaskActionIPC } from "../lib/ipc";
import type { TaskScheduleDef } from "../stores/schedulerStore";
import { reportError } from "../lib/errors";

type ActionType = "shellCommand" | "httpRequest" | "custom";
type ScheduleMode = "cron" | "interval";

interface FormState {
  name: string;
  scheduleMode: ScheduleMode;
  cronExpr: string;
  intervalSeconds: string;
  actionType: ActionType;
  command: string;
  url: string;
  method: string;
  headers: string;
  body: string;
  customId: string;
  maxExecutions: string;
}

const INITIAL_FORM: FormState = {
  name: "",
  scheduleMode: "cron",
  cronExpr: "",
  intervalSeconds: "30",
  actionType: "shellCommand",
  command: "",
  url: "",
  method: "GET",
  headers: "",
  body: "",
  customId: "",
  maxExecutions: "",
};

/** Format interval seconds into a human-readable string. */
function formatInterval(seconds: number): string {
  if (seconds < 60) { return `every ${seconds}s`; }
  if (seconds < 3600) {
    const m = seconds / 60;
    return Number.isInteger(m) ? `every ${m}m` : `every ${m.toFixed(1)}m`;
  }
  const h = seconds / 3600;
  return Number.isInteger(h) ? `every ${h}h` : `every ${h.toFixed(1)}h`;
}

/** Build schedule display text for a task. */
function scheduleLabel(task: { cronExpr?: string; intervalSeconds?: number; scheduleType: string }): string {
  if (task.scheduleType === "interval" && task.intervalSeconds !== undefined && task.intervalSeconds !== null) {
    return formatInterval(task.intervalSeconds);
  }
  return task.cronExpr ?? "";
}

export function SchedulerPage() {
  const { t } = useI18n();
  const { tasks, loading, error, fetchTasks, createTask, removeTask, pauseTask, resumeTask } =
    useSchedulerStore();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM);
    setShowForm(false);
  }, []);

  const buildSchedule = useCallback((): TaskScheduleDef | null => {
    switch (form.scheduleMode) {
      case "cron":
        if (!form.cronExpr.trim()) { return null; }
        return { type: "cron", expr: form.cronExpr.trim() };
      case "interval": {
        const secs = Number(form.intervalSeconds);
        if (!secs || secs <= 0) { return null; }
        return { type: "interval", seconds: secs };
      }
    }
  }, [form]);

  const buildAction = useCallback((): TaskActionIPC | null => {
    switch (form.actionType) {
      case "shellCommand":
        if (!form.command.trim()) { return null; }
        return { type: "shellCommand", command: form.command };
      case "httpRequest":
        if (!form.url.trim()) { return null; }
        return {
          type: "httpRequest",
          url: form.url,
          method: form.method || "GET",
          headers: form.headers
            ? form.headers.split("\n").map((l) => {
                const idx = l.indexOf(":");
                return idx >= 0 ? [l.slice(0, idx).trim(), l.slice(idx + 1).trim()] : ["", ""];
              })
            : undefined,
          body: form.body || undefined,
        };
      case "custom":
        if (!form.customId.trim()) { return null; }
        return { type: "custom", id: form.customId };
    }
  }, [form]);

  const handleCreate = useCallback(async () => {
    const schedule = buildSchedule();
    const action = buildAction();
    if (!schedule || !action) { return; }
    setCreating(true);
    try {
      const maxExec = form.maxExecutions ? Number(form.maxExecutions) : undefined;
      await createTask(form.name || t("newTask"), schedule, action, maxExec);
      resetForm();
    } catch (err) {
      reportError(err, "SchedulerPage.createTask");
    } finally {
      setCreating(false);
    }
  }, [form, buildSchedule, buildAction, createTask, resetForm, t]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await removeTask(id);
      } finally {
        setDeleteConfirmId(null);
      }
    },
    [removeTask],
  );

  const handleToggle = useCallback(
    async (task: (typeof tasks)[0]) => {
      if (task.status === "Active") {
        await pauseTask(task.id);
      } else {
        await resumeTask(task.id);
      }
    },
    [pauseTask, resumeTask],
  );

  const statusBadge = (status: string) => {
    const base = "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium";
    switch (status) {
      case "Active":
        return <span className={`${base} bg-green-900/50 text-green-400`}>{status}</span>;
      case "Paused":
        return <span className={`${base} bg-yellow-900/50 text-yellow-400`}>{status}</span>;
      default:
        return <span className={`${base} bg-red-900/50 text-red-400`}>{status}</span>;
    }
  };

  const isFormValid = buildSchedule() !== null && buildAction() !== null;

  return (
    <div className="max-w-4xl mx-auto p-6 text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t("taskScheduler")}</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {showForm ? t("cancel") : t("newTask")}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="mb-6 rounded-lg border border-border bg-card p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">{t("taskName")}</label>
            <input
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
              placeholder={t("taskName")}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          {/* Schedule Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Schedule Type</label>
              <select
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                value={form.scheduleMode}
                onChange={(e) => setForm((f) => ({ ...f, scheduleMode: e.target.value as ScheduleMode }))}
              >
                <option value="cron">Cron Expression</option>
                <option value="interval">Fixed Interval</option>
              </select>
            </div>
            <div>
              {form.scheduleMode === "cron" ? (
                <>
                  <label className="mb-1 block text-sm text-muted-foreground">{t("cronExpression")}</label>
                  <input
                    className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
                    placeholder={t("cronPlaceholder")}
                    value={form.cronExpr}
                    onChange={(e) => setForm((f) => ({ ...f, cronExpr: e.target.value }))}
                  />
                </>
              ) : (
                <>
                  <label className="mb-1 block text-sm text-muted-foreground">Interval (seconds)</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
                    placeholder="30"
                    value={form.intervalSeconds}
                    onChange={(e) => setForm((f) => ({ ...f, intervalSeconds: e.target.value }))}
                  />
                </>
              )}
            </div>
          </div>

          {/* Action Type */}
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">{t("actionType")}</label>
            <select
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              value={form.actionType}
              onChange={(e) => setForm((f) => ({ ...f, actionType: e.target.value as ActionType }))}
            >
              <option value="shellCommand">{t("shellCommand")}</option>
              <option value="httpRequest">{t("httpRequest")}</option>
              <option value="custom">{t("customAction")}</option>
            </select>
          </div>

          {/* Action fields */}
          {form.actionType === "shellCommand" && (
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">{t("command")}</label>
              <input
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
                placeholder="echo hello"
                value={form.command}
                onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))}
              />
            </div>
          )}

          {form.actionType === "httpRequest" && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">{t("mcpUrl")}</label>
                <input
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
                  placeholder="https://example.com/api"
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">{t("httpMethod")}</label>
                <select
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  value={form.method}
                  onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                  <option value="PATCH">PATCH</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">{t("httpHeaders")}</label>
                <textarea
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none resize-y"
                  rows={2}
                  placeholder={"Content-Type: application/json\nAuthorization: Bearer ***"}
                  value={form.headers}
                  onChange={(e) => setForm((f) => ({ ...f, headers: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">{t("httpBody")}</label>
                <textarea
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none resize-y"
                  rows={3}
                  placeholder='{"key": "value"}'
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                />
              </div>
            </div>
          )}

          {form.actionType === "custom" && (
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">{t("customActionId")}</label>
              <input
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
                placeholder="my-custom-action"
                value={form.customId}
                onChange={(e) => setForm((f) => ({ ...f, customId: e.target.value }))}
              />
            </div>
          )}

          {/* Max Executions */}
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">{t("maxExecutionsOptional")}</label>
            <input
              type="number"
              min={1}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
              placeholder={t("maxExecutionsUnlimited")}
              value={form.maxExecutions}
              onChange={(e) => setForm((f) => ({ ...f, maxExecutions: e.target.value }))}
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={resetForm}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
            >
              {t("cancel")}
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !isFormValid}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? t("creating") : t("createTask")}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <svg className="h-8 w-8 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      )}

      {/* Empty state */}
      {!loading && tasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <svg className="h-12 w-12 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12,6 12,12 16,14" />
          </svg>
          <p className="text-lg font-medium text-muted-foreground">{t("noTasks")}</p>
          <p className="text-sm mt-1">{t("noTasksHint")}</p>
        </div>
      )}

      {/* Task list */}
      {!loading && tasks.length > 0 && (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-medium truncate">
                      {task.name || t("newTask")}
                    </h3>
                    {statusBadge(task.status)}
                    {task.scheduleType === "interval" && (
                      <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-blue-900/50 text-blue-400">
                        interval
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="font-mono text-xs bg-muted rounded px-1.5 py-0.5">
                      {scheduleLabel(task)}
                    </span>
                    <span>
                      {t("executionCount")}: {task.executionCount}
                      {task.maxExecutions !== null && task.maxExecutions !== undefined ? ` / ${task.maxExecutions}` : ""}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Pause / Resume */}
                  <button
                    onClick={() => handleToggle(task)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      task.status === "Active"
                        ? "bg-yellow-900/40 text-yellow-400 hover:bg-yellow-900/60"
                        : "bg-green-900/40 text-green-400 hover:bg-green-900/60"
                    }`}
                  >
                    {task.status === "Active" ? t("pause") : t("resume")}
                  </button>

                  {/* Delete */}
                  {deleteConfirmId === task.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="rounded-lg bg-red-900/50 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/70 transition-colors"
                      >
                        {t("confirm")}
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(task.id)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-red-400 hover:bg-red-950/30 transition-colors"
                    >
                      {t("delete")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
