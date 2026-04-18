import { useI18n } from "../../i18n";
import {
  Search,
  Plus,
  MoreHorizontal,
  Settings,
  Image,
  Clock,
  Radio,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";

const mockSessions = [
  { id: "1", title: "Rust HDLC parser refactor", model: "Claude 4 Sonnet", time: "2m ago", active: true },
  { id: "2", title: "Fix auth middleware token expiry", model: "GPT-5.2", time: "15m ago", active: false },
  { id: "3", title: "DLMS COSEM integration tests", model: "GLM-5", time: "1h ago", active: false },
  { id: "4", title: "Add WebSocket transport layer", model: "DeepSeek V3", time: "3h ago", active: false },
  { id: "5", title: "Power quality THD analysis", model: "Qwen Max", time: "Yesterday", active: false },
];

export function Sidebar() {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filteredSessions = mockSessions.filter(
    (s) => !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Header */}
      <div className="flex h-12 items-center gap-2 px-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Sparkles size={14} />
        </div>
        <span className="text-sm font-semibold tracking-tight">DevPilot</span>
        <span className="text-[10px] font-medium text-muted-foreground">v0.1.0</span>
      </div>

      {/* New Chat */}
      <div className="px-3 pb-2">
        <button className="flex w-full items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          <Plus size={15} />
          {t("newChat")}
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5">
          <Search size={13} className="shrink-0 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchChats")}
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto px-2">
        <div className="mb-1 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("recentChats")}
        </div>
        <div className="space-y-0.5">
          {filteredSessions.map((session) => (
            <button
              key={session.id}
              onMouseEnter={() => setHoveredId(session.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={cn(
                "group flex w-full flex-col rounded-md px-2.5 py-2 text-left transition-colors",
                session.active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50",
              )}
            >
              <div className="flex items-start gap-1.5">
                <span className="mt-0.5 shrink-0">
                  {session.active && (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-status-success" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[13px] leading-snug">{session.title}</span>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>{session.model}</span>
                    <span>·</span>
                    <span>{session.time}</span>
                  </div>
                </div>
                {hoveredId === session.id && (
                  <button className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
                    <MoreHorizontal size={13} />
                  </button>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Nav */}
      <div className="border-t border-sidebar-border px-2 py-2">
        <div className="flex items-center gap-0.5">
          <NavIcon icon={<Image size={15} />} label={t("gallery")} />
          <NavIcon icon={<Clock size={15} />} label={t("scheduler")} />
          <NavIcon icon={<Radio size={15} />} label={t("bridge")} />
          <NavIcon icon={<Settings size={15} />} label={t("settings")} />
        </div>
      </div>
    </aside>
  );
}

function NavIcon({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      title={label}
      className="flex flex-1 items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
    >
      {icon}
    </button>
  );
}
