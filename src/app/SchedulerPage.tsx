import { useEffect, useState, useCallback } from "react";
import { useSchedulerStore } from "../stores/schedulerStore";
import { useI18n } from "../i18n";
import type { TaskActionIPC } from "../lib/ipc";

type ActionType = "shellCommand" | "httpRequest" | "custom";

interface FormState {
  name: string;
  cronExpr: string;
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
  cronExpr: "",
  actionType: "shellCommand",
  command: "",
  url: "",
  method: "GET",
  headers: "",
  body: "",
  customId: "",
  maxExecutions: "",
};

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
    const action = buildAction();
    if (!action) { return; }
    setCreating(true);
    try {
      const maxExec = form.maxExecutions ? Number(form.maxExecutions) : undefined;
      await createTask(form.name || "Untitled", form.cronExpr, action, maxExec);
      resetForm();
    } catch (err) {
      console.error("Failed to create task:", err);
    } finally {
      setCreating(false);
    }
  }, [form, buildAction, createTask, resetForm]);

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

  return (
    <div className="max-w-4xl mx-auto p-6 text-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t("scheduler")}</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          {showForm ? t("cancel") : "New Task"}
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
        <div className="mb-6 rounded-lg border border-gray-800 bg-gray-900 p-5 space-y-4">
          {/* Name & Cron */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-gray-400">{t("name")}</label>
              <input
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                placeholder="My Task"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-400">Cron Expression</label>
              <input
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                placeholder="0 * * * *"
                value={form.cronExpr}
                onChange={(e) => setForm((f) => ({ ...f, cronExpr: e.target.value }))}
              />
            </div>
          </div>

          {/* Action Type */}
          <div>
            <label className="mb-1 block text-sm text-gray-400">Action Type</label>
            <select
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              value={form.actionType}
              onChange={(e) => setForm((f) => ({ ...f, actionType: e.target.value as ActionType }))}
            >
              <option value="shellCommand">Shell Command</option>
              <option value="httpRequest">HTTP Request</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {/* Action fields */}
          {form.actionType === "shellCommand" && (
            <div>
              <label className="mb-1 block text-sm text-gray-400">Command</label>
              <input
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                placeholder="echo hello"
                value={form.command}
                onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))}
              />
            </div>
          )}

          {form.actionType === "httpRequest" && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm text-gray-400">URL</label>
                <input
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  placeholder="https://example.com/api"
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-400">Method</label>
                <select
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
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
                <label className="mb-1 block text-sm text-gray-400">Headers (one per line, Key: Value)</label>
                <textarea
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-y"
                  rows={2}
                  placeholder={"Content-Type: application/json\nAuthorization: Bearer token"}
                  value={form.headers}
                  onChange={(e) => setForm((f) => ({ ...f, headers: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-400">Body</label>
                <textarea
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-y"
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
              <label className="mb-1 block text-sm text-gray-400">Custom Action ID</label>
              <input
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                placeholder="my-custom-action"
                value={form.customId}
                onChange={(e) => setForm((f) => ({ ...f, customId: e.target.value }))}
              />
            </div>
          )}

          {/* Max Executions */}
          <div>
            <label className="mb-1 block text-sm text-gray-400">Max Executions (optional)</label>
            <input
              type="number"
              min={1}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              placeholder="Leave empty for unlimited"
              value={form.maxExecutions}
              onChange={(e) => setForm((f) => ({ ...f, maxExecutions: e.target.value }))}
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={resetForm}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm hover:bg-gray-800 transition-colors"
            >
              {t("cancel")}
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !form.cronExpr.trim() || !buildAction()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? "Creating..." : "Create Task"}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <svg className="h-8 w-8 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
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
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <svg className="h-12 w-12 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12,6 12,12 16,14" />
          </svg>
          <p className="text-lg font-medium text-gray-400">No scheduled tasks</p>
          <p className="text-sm mt-1">Create a new task to automate recurring actions.</p>
        </div>
      )}

      {/* Task list */}
      {!loading && tasks.length > 0 && (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-lg border border-gray-800 bg-gray-900 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-medium truncate">
                      {task.name || "Untitled"}
                    </h3>
                    {statusBadge(task.status)}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <span className="font-mono text-xs bg-gray-800 rounded px-1.5 py-0.5">
                      {task.cronExpr}
                    </span>
                    <span>
                      Executions: {task.executionCount}
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
                    {task.status === "Active" ? "Pause" : "Resume"}
                  </button>

                  {/* Delete */}
                  {deleteConfirmId === task.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="rounded-lg bg-red-900/50 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/70 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs hover:bg-gray-800 transition-colors"
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(task.id)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-red-400 hover:bg-red-950/30 transition-colors"
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
