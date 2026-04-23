import { FolderOpen, Terminal, Eye, GitBranch, X } from "lucide-react";
import { useUIStore } from "../../stores/uiStore";
import { useI18n } from "../../i18n";
import { cn } from "../../lib/utils";

const TABS = [
  { key: "files" as const, icon: FolderOpen, labelKey: "files" },
  { key: "terminal" as const, icon: Terminal, labelKey: "terminal" },
  { key: "preview" as const, icon: Eye, labelKey: "preview" },
  { key: "git" as const, icon: GitBranch, labelKey: "git" },
];

export function RightPanelTabs() {
  const rightPanel = useUIStore((s) => s.rightPanel);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const { t } = useI18n();

  if (rightPanel === "none") {return null;}

  return (
    <div className="flex items-center gap-1 border-b border-border px-2 py-1">
      {TABS.map(({ key, icon: Icon, labelKey }) => (
        <button
          key={key}
          onClick={() => toggleRightPanel(key)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
            rightPanel === key
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <Icon size={12} />
          <span>{t(labelKey)}</span>
        </button>
      ))}
      <div className="flex-1" />
      <button
        onClick={() => toggleRightPanel("none")}
        className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        title={t("close")}
      >
        <X size={12} />
      </button>
    </div>
  );
}
