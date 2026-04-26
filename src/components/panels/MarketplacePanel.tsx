/**
 * MarketplacePanel — Browse and install skills from the marketplace.
 *
 * Features:
 *  - Search bar for filtering skills
 *  - Grid/list view toggle of skills
 *  - Install/Uninstall buttons per skill
 *  - Category filter tabs
 *  - Loading/error states
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Search,
  Download,
  Trash2,
  Tag,
  Star,
} from "lucide-react";
import { invoke } from "../../lib/ipc";
import { useI18n } from "../../i18n";
import { cn } from "../../lib/utils";
import type { SkillInfo } from "../../types";

// ── Types ──────────────────────────────────────────────────

interface MarketplaceSkill extends SkillInfo {
  rating?: number;
  downloads?: number;
}

// ── Component ──────────────────────────────────────────────

export function MarketplacePanel() {
  const { t: _t } = useI18n();
  void _t;
  const [skills, setSkills] = useState<MarketplaceSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [installingId, setInstallingId] = useState<string | null>(null);

  // Fetch skills from marketplace
  const fetchSkills = useCallback(async () => {
    try {
      setError(null);
      const result = await invoke<MarketplaceSkill[]>("search_skills", {
        query: "",
      });
      setSkills(result ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  // Derived categories
  const categories = useMemo(() => {
    const cats = new Set(skills.map((s) => s.category).filter(Boolean) as string[]);
    return ["all", ...Array.from(cats).sort()];
  }, [skills]);

  // Filtered skills
  const filtered = useMemo(() => {
    let result = skills;

    // Category filter
    if (activeCategory !== "all") {
      result = result.filter((s) => s.category === activeCategory);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q) ||
          s.tags?.some((tag) => tag.toLowerCase().includes(q)) ||
          s.author?.toLowerCase().includes(q),
      );
    }

    return result;
  }, [skills, activeCategory, searchQuery]);

  // Install a skill
  const handleInstall = useCallback(async (skill: MarketplaceSkill) => {
    try {
      setInstallingId(skill.name);
      await invoke("install_skill", { name: skill.name });
      setSkills((prev) =>
        prev.map((s) =>
          s.name === skill.name
            ? { ...s, enabled: true, installedAt: new Date().toISOString() }
            : s,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstallingId(null);
    }
  }, []);

  // Uninstall a skill
  const handleUninstall = useCallback(async (skill: MarketplaceSkill) => {
    try {
      setInstallingId(skill.name);
      await invoke("uninstall_skill", { name: skill.name });
      setSkills((prev) =>
        prev.map((s) =>
          s.name === skill.name ? { ...s, enabled: false } : s,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstallingId(null);
    }
  }, []);

  const isInstalled = useCallback(
    (skill: MarketplaceSkill) => !!skill.installedAt || skill.enabled,
    [],
  );

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "var(--color-surface)", color: "var(--color-text-primary)" }}
    >
      {/* Header + Search */}
      <div className="px-3 py-2 space-y-2 border-b" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">Marketplace</span>
          <span className="text-xs text-muted-foreground">({skills.length})</span>
          <div className="flex-1" />
          {/* View toggle */}
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "px-1.5 py-0.5 text-xs rounded transition-colors",
              viewMode === "grid" ? "bg-accent" : "hover:bg-accent/50",
            )}
          >
            Grid
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "px-1.5 py-0.5 text-xs rounded transition-colors",
              viewMode === "list" ? "bg-accent" : "hover:bg-accent/50",
            )}
          >
            List
          </button>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search skills..."
            className="w-full rounded-md border bg-input pl-8 pr-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            style={{ borderColor: "var(--color-border)" }}
          />
        </div>
      </div>

      {/* Category tabs */}
      <div
        className="flex items-center gap-1 px-3 py-1.5 overflow-x-auto border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors border",
              activeCategory === cat
                ? "bg-[var(--color-brand)] text-white border-transparent"
                : "hover:bg-accent/50",
            )}
            style={{
              borderColor:
                activeCategory === cat ? "transparent" : "var(--color-border)",
            }}
          >
            {cat === "all" ? "All" : cat}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
            Loading marketplace...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-error text-xs">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
            {searchQuery ? "No skills matching your search" : "No skills available"}
          </div>
        ) : viewMode === "grid" ? (
          /* Grid view */
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((skill) => (
              <div
                key={skill.name}
                className="rounded-lg border p-2.5 space-y-1.5 transition-colors hover:border-[var(--color-brand)]"
                style={{ borderColor: "var(--color-border)" }}
              >
                {/* Name + author */}
                <div className="flex items-start justify-between gap-1">
                  <span className="text-xs font-medium truncate">{skill.name}</span>
                  {skill.rating !== undefined && skill.rating !== null && (
                    <div className="flex items-center gap-0.5 text-[10px] text-warning shrink-0">
                      <Star size={9} fill="currentColor" />
                      {skill.rating.toFixed(1)}
                    </div>
                  )}
                </div>

                {/* Description */}
                <p className="text-[10px] text-muted-foreground line-clamp-2">
                  {skill.description || "No description"}
                </p>

                {/* Author */}
                {skill.author && (
                  <div className="text-[10px] text-muted-foreground">
                    by {skill.author}
                  </div>
                )}

                {/* Tags */}
                {skill.tags && skill.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {skill.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0 text-[9px] text-muted-foreground"
                        style={{ borderColor: "var(--color-border)" }}
                      >
                        <Tag size={7} />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Install / Uninstall button */}
                <div className="pt-1">
                  {isInstalled(skill) ? (
                    <button
                      onClick={() => handleUninstall(skill)}
                      disabled={installingId === skill.name}
                      className={cn(
                        "flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-colors",
                        "hover:bg-error/10 text-error",
                      )}
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      <Trash2 size={10} />
                      {installingId === skill.name ? "..." : "Uninstall"}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleInstall(skill)}
                      disabled={installingId === skill.name}
                      className={cn(
                        "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-white transition-colors",
                        "hover:opacity-90",
                      )}
                      style={{ background: "var(--color-brand)" }}
                    >
                      <Download size={10} />
                      {installingId === skill.name ? "..." : "Install"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List view */
          <div className="space-y-1">
            {filtered.map((skill) => (
              <div
                key={skill.name}
                className="flex items-center gap-2 rounded-md border px-3 py-2 transition-colors hover:bg-accent/30"
                style={{ borderColor: "var(--color-border)" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">
                      {skill.name}
                    </span>
                    {skill.author && (
                      <span className="text-[10px] text-muted-foreground">
                        by {skill.author}
                      </span>
                    )}
                    {skill.rating !== undefined && skill.rating !== null && (
                      <div className="flex items-center gap-0.5 text-[10px] text-warning">
                        <Star size={9} fill="currentColor" />
                        {skill.rating.toFixed(1)}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {skill.description || "No description"}
                  </p>
                </div>

                {/* Tags (show first 2) */}
                {skill.tags && skill.tags.length > 0 && (
                  <div className="hidden sm:flex items-center gap-1">
                    {skill.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border px-1.5 py-0 text-[9px] text-muted-foreground"
                        style={{ borderColor: "var(--color-border)" }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Action button */}
                {isInstalled(skill) ? (
                  <button
                    onClick={() => handleUninstall(skill)}
                    disabled={installingId === skill.name}
                    className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] hover:bg-error/10 text-error transition-colors shrink-0"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <Trash2 size={10} />
                    {installingId === skill.name ? "..." : "Uninstall"}
                  </button>
                ) : (
                  <button
                    onClick={() => handleInstall(skill)}
                    disabled={installingId === skill.name}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-white hover:opacity-90 transition-colors shrink-0"
                    style={{ background: "var(--color-brand)" }}
                  >
                    <Download size={10} />
                    {installingId === skill.name ? "..." : "Install"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
