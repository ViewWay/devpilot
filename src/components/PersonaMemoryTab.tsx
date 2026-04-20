import { useState, useEffect, useCallback } from "react";
import { useI18n } from "../i18n";
import { useMemoryStore } from "../stores/memoryStore";
import { cn } from "../lib/utils";
import {
  BookOpen,
  Loader2,
  Save,
  Search,
  AlertCircle,
  X,
  FileText,
  Calendar,
  Plus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

/** The four persona file types */
const PERSONA_FILES = [
  { type: "SOUL.md", labelKey: "personaSoulMd", descKey: "personaSoulMdDesc" },
  { type: "USER.md", labelKey: "personaUserMd", descKey: "personaUserMdDesc" },
  { type: "MEMORY.md", labelKey: "personaMemoryMd", descKey: "personaMemoryMdDesc" },
  { type: "AGENTS.md", labelKey: "personaAgentsMd", descKey: "personaAgentsMdDesc" },
] as const;

interface PersonaMemoryTabProps {
  workspaceDir: string;
  dataDir: string;
}

export function PersonaMemoryTab({ workspaceDir, dataDir }: PersonaMemoryTabProps) {
  const { t } = useI18n();
  const persona = useMemoryStore((s) => s.persona);
  const dailyMemories = useMemoryStore((s) => s.dailyMemories);
  const searchResults = useMemoryStore((s) => s.searchResults);
  const loadingPersona = useMemoryStore((s) => s.loadingPersona);
  const loadingMemories = useMemoryStore((s) => s.loadingMemories);
  const searching = useMemoryStore((s) => s.searching);
  const saving = useMemoryStore((s) => s.saving);
  const error = useMemoryStore((s) => s.error);
  const loadPersona = useMemoryStore((s) => s.loadPersona);
  const savePersonaFile = useMemoryStore((s) => s.savePersonaFile);
  const listMemories = useMemoryStore((s) => s.listMemories);
  const createMemory = useMemoryStore((s) => s.createMemory);
  const searchMemories = useMemoryStore((s) => s.searchMemories);
  const clearSearch = useMemoryStore((s) => s.clearSearch);

  // Local editor state for each persona file
  const [editors, setEditors] = useState<Record<string, string>>({});
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [newMemoryDate, setNewMemoryDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [newMemoryContent, setNewMemoryContent] = useState("");
  const [showNewMemory, setShowNewMemory] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadPersona(workspaceDir),
      listMemories(dataDir),
    ]);
  }, [workspaceDir, dataDir, loadPersona, listMemories]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Sync editor content when persona loads/changes
  useEffect(() => {
    setEditors({
      "SOUL.md": persona.soulMd ?? "",
      "USER.md": persona.userMd ?? "",
      "MEMORY.md": persona.memoryMd ?? "",
      "AGENTS.md": persona.agentsMd ?? "",
    });
  }, [persona]);

  const handleSave = async (fileType: string) => {
    const content = editors[fileType] ?? "";
    await savePersonaFile(workspaceDir, fileType, content);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) { return; }
    setShowSearch(true);
    await searchMemories(workspaceDir, dataDir, searchQuery.trim());
  };

  const handleCreateMemory = async () => {
    if (!newMemoryContent.trim()) { return; }
    await createMemory(dataDir, newMemoryDate, newMemoryContent.trim());
    setNewMemoryContent("");
    setShowNewMemory(false);
  };

  const isDirty = (fileType: string) => {
    const current = editors[fileType] ?? "";
    const original = getContentForKey(persona, fileType);
    return current !== original;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-foreground">{t("personaAndMemory")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("personaAndMemoryDesc")}</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle size={14} />
          <span className="flex-1">{error}</span>
          <button onClick={() => useMemoryStore.setState({ error: null })} className="text-destructive/70 hover:text-destructive">
            <X size={12} />
          </button>
        </div>
      )}

      {/* ── Persona Files Section ──────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-muted-foreground" />
          <h3 className="text-xs font-semibold text-foreground">{t("personaFiles")}</h3>
          {loadingPersona && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
        </div>

        {PERSONA_FILES.map(({ type, labelKey, descKey }) => {
          const isExpanded = expandedFile === type;
          const dirty = isDirty(type);
          const isSaving = saving === type;

          return (
            <div key={type} className="rounded-lg border border-border bg-card">
              {/* Collapsed header */}
              <button
                onClick={() => setExpandedFile(isExpanded ? null : type)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown size={14} className="text-muted-foreground" />
                  ) : (
                    <ChevronRight size={14} className="text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium text-foreground">{type}</span>
                  <span className="text-[10px] text-muted-foreground">— {t(descKey)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {dirty && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-500">
                      {t("unsaved")}
                    </span>
                  )}
                  {(editors[type]?.length ?? 0) > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {(editors[type]?.split("\n").length ?? 0)} {t("lines")}
                    </span>
                  )}
                </div>
              </button>

              {/* Expanded editor */}
              {isExpanded && (
                <div className="space-y-2 border-t border-border px-4 py-3">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t(labelKey)}
                  </label>
                  <textarea
                    value={editors[type] ?? ""}
                    onChange={(e) =>
                      setEditors((prev) => ({ ...prev, [type]: e.target.value }))
                    }
                    placeholder={t(descKey)}
                    rows={10}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-ring resize-y"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {(editors[type]?.length ?? 0).toLocaleString()} {t("characters")}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setEditors((prev) => ({
                            ...prev,
                            [type]: getContentForKey(persona, type),
                          }))
                        }
                        disabled={!dirty || isSaving}
                        className="rounded-md border border-border px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
                      >
                        {t("revert")}
                      </button>
                      <button
                        onClick={() => handleSave(type)}
                        disabled={!dirty || isSaving}
                        className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10px] text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {isSaving ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <Save size={10} />
                        )}
                        {t("save")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Daily Memories Section ─────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-muted-foreground" />
            <h3 className="text-xs font-semibold text-foreground">{t("dailyMemories")}</h3>
            {loadingMemories && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
          </div>
          {!showNewMemory && (
            <button
              onClick={() => setShowNewMemory(true)}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Plus size={10} />
              {t("addMemory")}
            </button>
          )}
        </div>

        {/* New memory form */}
        {showNewMemory && (
          <div className="rounded-lg border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("newMemory")}
              </span>
              <button onClick={() => setShowNewMemory(false)} className="text-muted-foreground hover:text-foreground">
                <X size={12} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-muted-foreground shrink-0">{t("date")}</label>
              <input
                type="date"
                value={newMemoryDate}
                onChange={(e) => setNewMemoryDate(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-ring"
              />
            </div>
            <textarea
              value={newMemoryContent}
              onChange={(e) => setNewMemoryContent(e.target.value)}
              placeholder={t("newMemoryPlaceholder")}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring resize-y"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateMemory}
                disabled={!newMemoryContent.trim()}
                className="rounded-md bg-primary px-3 py-1 text-[10px] text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {t("create")}
              </button>
              <button
                onClick={() => setShowNewMemory(false)}
                className="rounded-md border border-border px-3 py-1 text-[10px] text-muted-foreground hover:bg-accent transition-colors"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        )}

        {/* Daily memories list */}
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {dailyMemories.length === 0 && !loadingMemories && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <BookOpen size={20} className="mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-[10px] text-muted-foreground">{t("noMemories")}</p>
            </div>
          )}
          {dailyMemories.map((entry) => (
            <div
              key={entry.date}
              className="rounded-md border border-border bg-card px-3 py-2"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono font-medium text-primary">
                  {entry.date}
                </span>
              </div>
              <p className="text-xs text-foreground whitespace-pre-wrap line-clamp-4">
                {entry.content}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Search Section ─────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-muted-foreground" />
          <h3 className="text-xs font-semibold text-foreground">{t("searchMemories")}</h3>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchMemoriesPlaceholder")}
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {searching ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Search size={12} />
            )}
            {t("search")}
          </button>
          {showSearch && searchResults.length > 0 && (
            <button
              onClick={() => {
                clearSearch();
                setShowSearch(false);
                setSearchQuery("");
              }}
              className="rounded-md border border-border px-2 py-1.5 text-[10px] text-muted-foreground hover:bg-accent transition-colors"
            >
              {t("clear")}
            </button>
          )}
        </div>

        {/* Search results */}
        {showSearch && searchResults.length === 0 && !searching && (
          <div className="rounded-md border border-dashed border-border p-4 text-center">
            <p className="text-[10px] text-muted-foreground">{t("noSearchResults")}</p>
          </div>
        )}
        {searchResults.length > 0 && (
          <div className="space-y-1">
            {searchResults.map((result, idx) => (
              <div
                key={idx}
                className="rounded-md border border-border bg-card px-3 py-2"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn(
                    "rounded px-1.5 py-0.5 text-[9px] font-medium",
                    result.source.endsWith(".md")
                      ? "bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
                      : "bg-green-500/10 text-green-500",
                  )}>
                    {result.source}
                  </span>
                </div>
                <p className="text-xs text-foreground whitespace-pre-wrap line-clamp-3">
                  {result.snippet}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Get the persona content for a given file type key. */
function getContentForKey(
  persona: { soulMd: string | null; userMd: string | null; memoryMd: string | null; agentsMd: string | null },
  fileType: string,
): string {
  switch (fileType) {
    case "SOUL.md":
      return persona.soulMd ?? "";
    case "USER.md":
      return persona.userMd ?? "";
    case "MEMORY.md":
      return persona.memoryMd ?? "";
    case "AGENTS.md":
      return persona.agentsMd ?? "";
    default:
      return "";
  }
}
