import { lazy, Suspense } from "react";
import { useTabStore } from "../../stores/tabStore";
import { ChatPanel } from "../chat/ChatPanel";
import { Loader2 } from "lucide-react";
import { useI18n } from "../../i18n";
import { MessageSquare } from "lucide-react";

/**
 * Lazy-loaded page components. These pages are rarely visited (user must
 * explicitly open them via a tab) so they should not be in the main chunk.
 */
const SettingsPage = lazy(() =>
  import("../../app/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const SchedulerPage = lazy(() =>
  import("../../app/SchedulerPage").then((m) => ({ default: m.SchedulerPage })),
);
const SkillsPage = lazy(() =>
  import("../../app/SkillsPage").then((m) => ({ default: m.SkillsPage })),
);
const GalleryPage = lazy(() =>
  import("../../app/GalleryPage").then((m) => ({ default: m.GalleryPage })),
);
const BridgePage = lazy(() =>
  import("../../app/BridgePage").then((m) => ({ default: m.BridgePage })),
);
const RemotePage = lazy(() =>
  import("../../app/RemotePage").then((m) => ({ default: m.RemotePage })),
);

/** Centered spinner fallback for lazy-loaded pages. */
function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 size={18} className="animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptySession() {
  const { t } = useI18n();
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-[var(--color-text-secondary)]">
      <MessageSquare size={48} className="text-[var(--color-text-tertiary)] opacity-50" />
      <p className="text-sm">{t("noSessions")}</p>
      <p className="text-xs text-[var(--color-text-tertiary)]">{t("noSessionsHint")}</p>
    </div>
  );
}

export function ContentRouter() {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const activeTabType = useTabStore((s) => s.tabs.find((t) => t.sessionId === s.activeTabId)?.type);

  // No tabs open — show empty state
  if (!activeTabId || !activeTabType) {
    return <EmptySession />;
  }

  // Special tabs
  if (activeTabType === "settings") {
    return <Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>;
  }

  if (activeTabType === "scheduled") {
    return <Suspense fallback={<PageLoader />}><SchedulerPage /></Suspense>;
  }

  if (activeTabType === "skills") {
    return <Suspense fallback={<PageLoader />}><SkillsPage /></Suspense>;
  }

  if (activeTabType === "gallery") {
    return <Suspense fallback={<PageLoader />}><GalleryPage /></Suspense>;
  }

  if (activeTabType === "bridge") {
    return <Suspense fallback={<PageLoader />}><BridgePage /></Suspense>;
  }

  if (activeTabType === "remote") {
    return <Suspense fallback={<PageLoader />}><RemotePage /></Suspense>;
  }

  // Session tab — ChatPanel handles the active session display
  return <ChatPanel />;
}
