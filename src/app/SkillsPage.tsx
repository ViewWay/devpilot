import { useState, useEffect, useMemo, useCallback } from "react";
import { useI18n } from "../i18n";
import { useSkillStore } from "../stores/skillStore";
import type { SkillInfo } from "../types";
import {
  Package,
  Search,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Plus,
  ChevronDown,
  ChevronUp,
  X,
  FileText,
  Loader2,
  AlertCircle,
} from "lucide-react";

// ── Main Page ──────────────────────────────────────────────

export function SkillsPage() {
  const { t } = useI18n();
  const skills = useSkillStore((s) => s.skills);
  const loading = useSkillStore((s) => s.loading);
  const hydrated = useSkillStore((s) => s.hydrated);
  const hydrateFromBackend = useSkillStore((s) => s.hydrateFromBackend);
  const toggleSkill = useSkillStore((s) => s.toggleSkill);
  const uninstallSkill = useSkillStore((s) => s.uninstallSkill);

  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);

  // Hydrate on mount
  useEffect(() => {
    hydrateFromBackend();
  }, [hydrateFromBackend]);

  // Client-side filtering
  const filteredSkills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {return skills;}
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.category ?? "").toLowerCase().includes(q) ||
        s.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [skills, searchQuery]);

  // Auto-dismiss confirm state
  useEffect(() => {
    if (!confirmUninstall) {return;}
    const timer = setTimeout(() => setConfirmUninstall(null), 5000);
    return () => clearTimeout(timer);
  }, [confirmUninstall]);

  const handleToggle = useCallback(
    (name: string) => {
      toggleSkill(name);
    },
    [toggleSkill],
  );

  const handleUninstall = useCallback(
    (name: string) => {
      if (confirmUninstall === name) {
        uninstallSkill(name);
        setConfirmUninstall(null);
        if (expandedSkill === name) {setExpandedSkill(null);}
      } else {
        setConfirmUninstall(name);
      }
    },
    [confirmUninstall, expandedSkill, uninstallSkill],
  );

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--color-surface, var(--color-bg))" }}>
      {/* Header */}
      <div
        className="shrink-0 border-b px-6 py-4"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package
              size={20}
              style={{ color: "var(--color-text-secondary)" }}
            />
            <div>
              <h1
                className="text-base font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                {t("skills")}
              </h1>
              <p
                className="mt-0.5 text-xs"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {t("skillsDesc")}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowInstallDialog(true)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: "var(--color-primary)",
              color: "var(--color-primary-foreground, #fff)",
              borderRadius: "var(--radius-md, 6px)",
            }}
          >
            <Plus size={14} />
            {t("installSkill")}
          </button>
        </div>

        {/* Search bar */}
        <div className="relative mt-3">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-text-secondary)" }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchSkills")}
            className="w-full py-2 pl-9 pr-3 text-xs outline-none transition-colors"
            style={{
              background: "var(--color-surface-hover, var(--color-bg-secondary))",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md, 6px)",
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Loading skeleton */}
        {!hydrated && loading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-lg p-4"
                style={{
                  background: "var(--color-surface-selected, var(--color-bg-secondary))",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md, 6px)",
                  height: 160,
                }}
              >
                <div
                  className="mb-3 h-4 w-2/3 rounded"
                  style={{ background: "var(--color-border)" }}
                />
                <div
                  className="mb-2 h-3 w-full rounded"
                  style={{ background: "var(--color-border)" }}
                />
                <div
                  className="h-3 w-1/2 rounded"
                  style={{ background: "var(--color-border)" }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {hydrated && filteredSkills.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <Package
              size={40}
              style={{ color: "var(--color-text-secondary)", opacity: 0.4 }}
            />
            <p
              className="mt-3 text-sm font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {t("noSkillsFound")}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="mt-2 text-xs underline"
                style={{ color: "var(--color-primary)" }}
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {/* Skill cards grid */}
        {filteredSkills.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSkills.map((skill) => (
              <SkillCard
                key={skill.name}
                skill={skill}
                expanded={expandedSkill === skill.name}
                confirmUninstall={confirmUninstall === skill.name}
                onToggleExpand={() =>
                  setExpandedSkill(
                    expandedSkill === skill.name ? null : skill.name,
                  )
                }
                onToggle={handleToggle}
                onUninstall={handleUninstall}
                onCancelUninstall={() => setConfirmUninstall(null)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Install dialog overlay */}
      {showInstallDialog && (
        <InstallDialog
          onClose={() => setShowInstallDialog(false)}
        />
      )}
    </div>
  );
}

// ── Skill Card ─────────────────────────────────────────────

function SkillCard({
  skill,
  expanded,
  confirmUninstall,
  onToggleExpand,
  onToggle,
  onUninstall,
  onCancelUninstall,
}: {
  skill: SkillInfo;
  expanded: boolean;
  confirmUninstall: boolean;
  onToggleExpand: () => void;
  onToggle: (name: string) => void;
  onUninstall: (name: string) => void;
  onCancelUninstall: () => void;
}) {
  const { t } = useI18n();
  const loading = useSkillStore((s) => s.loading);

  return (
    <div
      className="flex flex-col transition-shadow"
      style={{
        background: "var(--color-surface-selected, var(--color-bg-secondary))",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md, 6px)",
      }}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="truncate text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              {skill.name}
            </span>
            {skill.version && (
              <span
                className="shrink-0 text-[10px]"
                style={{
                  color: "var(--color-text-secondary)",
                  background: "var(--color-border)",
                  borderRadius: "var(--radius-md, 4px)",
                  padding: "1px 6px",
                }}
              >
                v{skill.version}
              </span>
            )}
          </div>
          <p
            className="mt-1 line-clamp-2 text-xs leading-relaxed"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {skill.description}
          </p>
        </div>

        {/* Toggle */}
        <button
          onClick={() => onToggle(skill.name)}
          disabled={loading}
          className="shrink-0 mt-0.5 transition-opacity disabled:opacity-50"
          title={skill.enabled ? t("disableSkill") : t("enableSkill")}
        >
          {skill.enabled ? (
            <ToggleRight size={22} style={{ color: "var(--color-primary)" }} />
          ) : (
            <ToggleLeft
              size={22}
              style={{ color: "var(--color-text-secondary)" }}
            />
          )}
        </button>
      </div>

      {/* Category badge & tags */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
        {skill.category && (
          <span
            className="inline-flex items-center text-[10px] font-medium"
            style={{
              color: "var(--color-primary)",
              background: "color-mix(in srgb, var(--color-primary) 12%, transparent)",
              borderRadius: "var(--radius-md, 4px)",
              padding: "2px 8px",
            }}
          >
            {skill.category}
          </span>
        )}
        {skill.tags.slice(0, 4).map((tag) => (
          <span
            key={tag}
            className="text-[10px]"
            style={{
              color: "var(--color-text-secondary)",
              background: "var(--color-surface-hover, var(--color-bg-tertiary, var(--color-bg)))",
              borderRadius: "var(--radius-md, 4px)",
              padding: "2px 6px",
            }}
          >
            {tag}
          </span>
        ))}
        {skill.tags.length > 4 && (
          <span
            className="text-[10px]"
            style={{ color: "var(--color-text-secondary)" }}
          >
            +{skill.tags.length - 4}
          </span>
        )}
      </div>

      {/* Meta row */}
      <div
        className="flex items-center gap-3 px-3 py-1.5 text-[10px]"
        style={{
          color: "var(--color-text-secondary)",
          borderTop: "1px solid var(--color-border)",
          borderBottom: expanded ? "1px solid var(--color-border)" : undefined,
        }}
      >
        {skill.author && (
          <span className="flex items-center gap-1 truncate">
            {t("skillAuthor")}: {skill.author}
          </span>
        )}
        {skill.trigger && (
          <span className="flex items-center gap-1 truncate">
            {t("skillTrigger")}: {skill.trigger}
          </span>
        )}
        {skill.installedAt && (
          <span className="ml-auto shrink-0">
            {t("installedAt")} {new Date(skill.installedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 py-3">
          <div className="mb-2 flex items-center gap-1.5">
            <FileText size={12} style={{ color: "var(--color-text-secondary)" }} />
            <span
              className="text-[10px] font-medium uppercase tracking-wider"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {t("skillContent")}
            </span>
          </div>
          <pre
            className="max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-relaxed"
            style={{
              background: "var(--color-surface-hover, var(--color-bg))",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md, 6px)",
              padding: "12px",
              color: "var(--color-text-primary)",
              fontFamily:
                "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
              fontSize: "11px",
            }}
          >
            {skill.content}
          </pre>
          {skill.updatedAt && (
            <p
              className="mt-2 text-[10px]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {t("updatedAt")}: {new Date(skill.updatedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Actions bar */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <button
          onClick={onToggleExpand}
          className="flex items-center gap-1 text-[10px] transition-colors"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {expanded ? (
            <>
              <ChevronUp size={12} /> Collapse
            </>
          ) : (
            <>
              <ChevronDown size={12} /> View content
            </>
          )}
        </button>

        {confirmUninstall ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium" style={{ color: "var(--color-destructive, #ef4444)" }}>
              <AlertCircle size={10} className="mr-0.5 inline" />
              Confirm?
            </span>
            <button
              onClick={() => onUninstall(skill.name)}
              className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
              style={{
                background: "var(--color-destructive, #ef4444)",
                color: "#fff",
                borderRadius: "var(--radius-md, 4px)",
              }}
            >
              {t("uninstallSkill")}
            </button>
            <button
              onClick={onCancelUninstall}
              className="rounded px-2 py-0.5 text-[10px] transition-colors"
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md, 4px)",
                color: "var(--color-text-secondary)",
              }}
            >
              {t("cancel") ?? "Cancel"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => onUninstall(skill.name)}
            className="flex items-center gap-1 rounded p-1 text-[10px] transition-colors"
            style={{
              color: "var(--color-text-secondary)",
              borderRadius: "var(--radius-md, 4px)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-destructive, #ef4444)";
              e.currentTarget.style.background = "color-mix(in srgb, var(--color-destructive, #ef4444) 10%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--color-text-secondary)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <Trash2 size={12} />
            {t("uninstallSkill")}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Install Dialog ─────────────────────────────────────────

function InstallDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const installSkill = useSkillStore((s) => s.installSkill);
  const loading = useSkillStore((s) => s.loading);
  const [content, setContent] = useState("");

  const handleInstall = useCallback(async () => {
    if (!content.trim()) {return;}
    await installSkill(content.trim());
    onClose();
  }, [content, installSkill, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {onClose();}
    },
    [onClose],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.5)" }}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="flex w-full max-w-xl flex-col"
        style={{
          background: "var(--color-surface-selected, var(--color-bg-secondary))",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md, 8px)",
          maxHeight: "80vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dialog header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center gap-2">
            <Plus size={16} style={{ color: "var(--color-primary)" }} />
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {t("installFromMarkdown")}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Dialog body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <label
            className="mb-2 block text-xs font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {t("pasteSkillContent")}
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("pasteSkillContent")}
            className="h-64 w-full resize-none p-3 text-xs outline-none transition-colors"
            style={{
              background: "var(--color-surface-hover, var(--color-bg))",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md, 6px)",
              fontFamily:
                "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
            }}
            autoFocus
          />
        </div>

        {/* Dialog footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          <button
            onClick={onClose}
            className="rounded-md px-4 py-1.5 text-xs font-medium transition-colors"
            style={{
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
              borderRadius: "var(--radius-md, 6px)",
            }}
          >
            {t("cancel") ?? "Cancel"}
          </button>
          <button
            onClick={handleInstall}
            disabled={!content.trim() || loading}
            className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
            style={{
              background: "var(--color-primary)",
              color: "var(--color-primary-foreground, #fff)",
              borderRadius: "var(--radius-md, 6px)",
            }}
          >
            {loading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Package size={12} />
            )}
            {t("installSkill")}
          </button>
        </div>
      </div>
    </div>
  );
}
