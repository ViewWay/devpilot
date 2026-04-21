import { useState, useEffect, useCallback } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useI18n } from "../i18n";
import { Download, X, RefreshCw } from "lucide-react";

interface UpdateInfo {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
}

type UpdateState =
  | { status: "idle" }
  | { status: "available"; info: UpdateInfo }
  | { status: "downloading"; progress: number }
  | { status: "installing" }
  | { status: "error"; message: string };

/**
 * UpdateChecker — checks for app updates on mount and displays a banner
 * when a new version is available. The user can update & restart or dismiss.
 *
 * Gracefully handles the case where the updater is not configured (e.g. no
 * pubkey) — it simply stays idle without crashing.
 */
export function UpdateChecker() {
  const { t } = useI18n();
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const [dismissed, setDismissed] = useState(false);

  // Check for updates on mount
  useEffect(() => {
    let cancelled = false;

    async function checkForUpdate() {
      try {
        const update = await check();

        if (cancelled) { return; }

        if (update) {
          setState({
            status: "available",
            info: {
              version: update.version,
              currentVersion: update.currentVersion ?? "",
              date: update.date ?? undefined,
              body: update.body ?? undefined,
            },
          });
        }
        // If no update available, stay idle (no banner)
      } catch (err) {
        if (cancelled) { return; }
        // Gracefully handle — updater might not be configured (empty pubkey, etc.)
        // Only show error in dev for debugging, otherwise silently ignore
        console.warn("[UpdateChecker] Update check failed:", err);
        setState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    checkForUpdate();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdate = useCallback(async () => {
    try {
      const update = await check();
      if (!update) { return; }

      setState({ status: "downloading", progress: 0 });

      let downloaded = 0;
      let total = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started": {
            total = event.data.contentLength ?? 0;
            downloaded = 0;
            setState({ status: "downloading", progress: 0 });
            break;
          }
          case "Progress": {
            downloaded += event.data.chunkLength;
            const pct = total > 0 ? Math.min(99, Math.round((downloaded / total) * 100)) : 0;
            setState({ status: "downloading", progress: pct });
            break;
          }
          case "Finished": {
            setState({ status: "installing" });
            break;
          }
        }
      });

      await relaunch();
    } catch (err) {
      console.error("[UpdateChecker] Update failed:", err);
      setState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  // Don't render anything if idle, dismissed, or no update available
  if (dismissed) { return null; }
  if (state.status === "idle") { return null; }

  // Show error banner briefly but allow dismiss
  if (state.status === "error") {
    // Only show error banner if it's a real connectivity issue, not a missing-config issue
    const msg = state.message.toLowerCase();
    if (
      msg.includes("pubkey") ||
      msg.includes("public key") ||
      msg.includes("signature") ||
      msg.includes("not configured")
    ) {
      return null;
    }
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-[var(--color-warning)] text-[var(--color-on-primary)] px-4 py-2 text-sm flex items-center justify-between gap-3">
        <span>{t("updateCheckFailed")}</span>
        <button
          onClick={handleDismiss}
          className="hover:opacity-80 rounded p-1 transition-colors"
          aria-label={t("updateDismiss")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (state.status === "available") {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-[var(--color-brand)] text-white px-4 py-3 text-sm flex items-center justify-between gap-4 animate-in slide-in-from-top">
        <div className="flex items-center gap-3 min-w-0">
          <Download className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium">{t("updateAvailable")}</div>
            <div className="text-xs opacity-80 truncate">
              {t("updateAvailableDesc")}{" "}
              {state.info.currentVersion && (
                <span>
                  {t("currentVersion")}: {state.info.currentVersion} → {t("newVersion")}: {state.info.version}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleUpdate}
            className="bg-white/20 hover:bg-white/30 rounded-md px-3 py-1.5 font-medium transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("updateAndRestart")}
          </button>
          <button
            onClick={handleDismiss}
            className="hover:bg-white/20 rounded-md p-1.5 transition-colors"
            aria-label={t("updateDismiss")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (state.status === "downloading") {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-[var(--color-brand)] text-white px-4 py-3 text-sm flex items-center gap-3">
        <Download className="h-5 w-5 animate-pulse" />
        <div className="flex-1 min-w-0">
          <div className="font-medium">{t("updateDownloading")}</div>
          <div className="mt-1 h-1.5 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full bg-white/80 rounded-full transition-all duration-300"
              style={{ width: `${state.progress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "installing") {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-[var(--color-brand)] text-white px-4 py-3 text-sm flex items-center gap-3">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <span className="font-medium">{t("updateInstalling")}</span>
      </div>
    );
  }

  return null;
}
