import { useI18n } from "../../i18n";
import { MessageSquarePlus, Settings, Image, Clock, Radio } from "lucide-react";

const mockSessions = [
  { id: "1", title: "Rust HDLC parser", model: "claude-4-sonnet", time: "2m ago" },
  { id: "2", title: "Fix auth middleware", model: "gpt-5.2", time: "15m ago" },
  { id: "3", title: "DLMS COSEM tests", model: "glm-5", time: "1h ago" },
];

export function Sidebar() {
  const { t } = useI18n();

  return (
    <aside className="flex w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
      <div className="p-3">
        <button className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]">
          <MessageSquarePlus size={16} />
          {t("newChat")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        <div className="mb-1 px-2 py-1 text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          {t("recentChats")}
        </div>
        {mockSessions.map((session) => (
          <button
            key={session.id}
            className="flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-[var(--color-bg-tertiary)]"
          >
            <span className="truncate text-sm text-[var(--color-text-primary)]">
              {session.title}
            </span>
            <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
              {session.model} · {session.time}
            </span>
          </button>
        ))}
      </div>

      <nav className="border-t border-[var(--color-border)] p-2">
        <div className="flex items-center gap-1">
          <NavButton icon={<Image size={16} />} label={t("gallery")} />
          <NavButton icon={<Clock size={16} />} label={t("scheduler")} />
          <NavButton icon={<Radio size={16} />} label={t("bridge")} />
          <NavButton icon={<Settings size={16} />} label={t("settings")} />
        </div>
      </nav>
    </aside>
  );
}

function NavButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      title={label}
      className="flex flex-1 items-center justify-center rounded-md p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
    >
      {icon}
    </button>
  );
}
