/**
 * BridgePage — Notification bridge management UI.
 *
 * Allows users to add, configure, test, enable/disable, and remove
 * notification bridges (Telegram, Discord, Feishu, Slack, Webhook).
 */

import { useEffect, useState, useCallback } from "react";
import { useBridgeStore } from "../stores/bridgeStore";
import type { BridgeInfo } from "../stores/bridgeStore";
import { useI18n } from "../i18n";
import { reportError } from "../lib/errors";
import {
  Bell,
  Plus,
  Trash2,
  Send,
  ToggleLeft,
  ToggleRight,
  Loader2,
  AlertCircle,
  Radio,
} from "lucide-react";

/** Supported platforms for the dropdown. */
const PLATFORMS = [
  { value: "telegram", label: "Telegram", icon: "✈️" },
  { value: "discord", label: "Discord", icon: "💬" },
  { value: "feishu", label: "Feishu / Lark", icon: "🐦" },
  { value: "slack", label: "Slack", icon: "📱" },
  { value: "webhook", label: "Generic Webhook", icon: "🔗" },
] as const;

interface FormState {
  name: string;
  platform: string;
  url: string;
  channel: string;
  token: string;
}

const INITIAL_FORM: FormState = {
  name: "",
  platform: "telegram",
  url: "",
  channel: "",
  token: "",
};

export function BridgePage() {
  const { t } = useI18n();
  const {
    bridges,
    loading,
    error,
    fetchBridges,
    createBridge,
    removeBridge,
    enableBridge,
    disableBridge,
    sendTest,
  } = useBridgeStore();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [sendingTestId, setSendingTestId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    fetchBridges();
  }, [fetchBridges]);

  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM);
    setShowForm(false);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!form.name.trim() || !form.url.trim()) {
      return;
    }
    setCreating(true);
    try {
      await createBridge(
        form.name.trim(),
        form.platform,
        form.url.trim(),
        form.channel.trim() || undefined,
        form.token.trim() || undefined,
      );
      resetForm();
    } catch (e: unknown) {
      reportError(e);
    } finally {
      setCreating(false);
    }
  }, [form, createBridge, resetForm]);

  const handleSendTest = useCallback(
    async (id: string) => {
      setSendingTestId(id);
      try {
        await sendTest(id);
      } catch (e: unknown) {
        reportError(e);
      } finally {
        setSendingTestId(null);
      }
    },
    [sendTest],
  );

  const handleToggle = useCallback(
    async (bridge: BridgeInfo) => {
      try {
        if (bridge.enabled) {
          await disableBridge(bridge.id);
        } else {
          await enableBridge(bridge.id);
        }
      } catch (e: unknown) {
        reportError(e);
      }
    },
    [enableBridge, disableBridge],
  );

  const handleRemove = useCallback(
    async (id: string) => {
      try {
        await removeBridge(id);
        setDeleteConfirmId(null);
      } catch (e: unknown) {
        reportError(e);
      }
    },
    [removeBridge],
  );

  /** Get platform display info. */
  const getPlatformInfo = (platformStr: string) => {
    const normalized = platformStr.toLowerCase();
    return (
      PLATFORMS.find((p) => normalized.includes(p.value)) ?? {
        value: normalized,
        label: platformStr,
        icon: "🔗",
      }
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
            <Radio size={18} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">
              {t("bridges")}
            </h1>
            <p className="text-xs text-muted-foreground">{t("bridgesDesc")}</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={showForm}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus size={14} />
          {t("addBridge")}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Create form */}
        {showForm && (
          <div className="mb-6 rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-medium text-foreground">
              {t("addBridge")}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Name */}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  {t("name")}
                </label>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="My Bridge"
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Platform */}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  {t("platform")}
                </label>
                <select
                  value={form.platform}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, platform: e.target.value }))
                  }
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.icon} {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Webhook URL */}
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-muted-foreground">
                  {t("webhookUrl")}
                </label>
                <input
                  value={form.url}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, url: e.target.value }))
                  }
                  placeholder={
                    form.platform === "telegram"
                      ? "https://api.telegram.org/bot<TOKEN>/sendMessage"
                      : "https://hooks.example.com/..."
                  }
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Channel */}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  {t("channelOptional")}
                </label>
                <input
                  value={form.channel}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, channel: e.target.value }))
                  }
                  placeholder={
                    form.platform === "telegram" ? "@channel_or_chat_id" : ""
                  }
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Token */}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  {t("tokenOptional")}
                </label>
                <input
                  value={form.token}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, token: e.target.value }))
                  }
                  type="password"
                  placeholder="Bot token / secret"
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Form actions */}
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !form.name.trim() || !form.url.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : null}
                {creating ? t("creating") : t("create")}
              </button>
              <button
                onClick={resetForm}
                className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && bridges.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Loader2 size={24} className="mb-2 animate-spin" />
            <span className="text-xs">{t("loading")}</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && bridges.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Bell size={32} className="mb-3 opacity-30" />
            <span className="text-sm font-medium">{t("noBridges")}</span>
            <span className="mt-1 text-xs">{t("noBridgesHint")}</span>
          </div>
        )}

        {/* Bridge list */}
        {bridges.length > 0 && (
          <div className="space-y-3">
            {bridges.map((bridge) => {
              const pinfo = getPlatformInfo(bridge.platform);
              const isSending = sendingTestId === bridge.id;
              const isConfirmDelete = deleteConfirmId === bridge.id;

              return (
                <div
                  key={bridge.id}
                  className="rounded-lg border border-border bg-card p-4 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {/* Platform icon */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-base">
                      {pinfo.icon}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {bridge.name ?? t("bridge")}
                        </span>
                        <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {pinfo.label}
                        </span>
                        {!bridge.enabled && (
                          <span className="rounded-full bg-yellow-500/10 px-1.5 py-0.5 text-[10px] text-yellow-500">
                            {t("paused")}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        ID: {bridge.id.slice(0, 8)}…
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-1">
                      {/* Toggle */}
                      <button
                        onClick={() => handleToggle(bridge)}
                        title={bridge.enabled ? "Disable" : "Enable"}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        {bridge.enabled ? (
                          <ToggleRight size={16} className="text-green-400" />
                        ) : (
                          <ToggleLeft size={16} />
                        )}
                      </button>

                      {/* Test */}
                      <button
                        onClick={() => handleSendTest(bridge.id)}
                        disabled={isSending || !bridge.enabled}
                        title={t("sendTest")}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                      >
                        {isSending ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Send size={14} />
                        )}
                      </button>

                      {/* Delete */}
                      {isConfirmDelete ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleRemove(bridge.id)}
                            className="rounded-md bg-destructive/10 px-2 py-1 text-[10px] text-destructive transition-colors hover:bg-destructive/20"
                          >
                            {t("confirm")}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="rounded-md px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent"
                          >
                            {t("cancel")}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(bridge.id)}
                          title={t("delete")}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
