import { useTabStore } from "../../stores/tabStore";
import { ChatPanel } from "../chat/ChatPanel";
import { SettingsPage } from "../../app/SettingsPage";
import { SchedulerPage } from "../../app/SchedulerPage";
import { SkillsPage } from "../../app/SkillsPage";
import { GalleryPage } from "../../app/GalleryPage";
import { BridgePage } from "../../app/BridgePage";
import { useI18n } from "../../i18n";
import { MessageSquare } from "lucide-react";

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
    return <SettingsPage />;
  }

  if (activeTabType === "scheduled") {
    return <SchedulerPage />;
  }

  if (activeTabType === "skills") {
    return <SkillsPage />;
  }

  if (activeTabType === "gallery") {
    return <GalleryPage />;
  }

  if (activeTabType === "bridge") {
    return <BridgePage />;
  }

  // Session tab — ChatPanel handles the active session display
  return <ChatPanel />;
}
