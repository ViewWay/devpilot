import { useEffect, useState, useCallback } from "react";
import { useMediaStore } from "../stores/mediaStore";
import type { MediaGenerationRecord } from "../stores/mediaStore";
import { useI18n } from "../i18n";

const SIZES = ["256x256", "512x512", "1024x1024", "1024x1792", "1792x1024"];

/** Parse tags stored as JSON string or comma-separated string. */
function parseTags(raw: string | null): string[] {
  if (!raw) {return [];}
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {return parsed.map(String);}
  } catch {
    // fallback: comma-separated
  }
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}

export function GalleryPage() {
  const { t } = useI18n();
  const {
    images,
    savedGenerations,
    providers,
    loading,
    error,
    fetchProviders,
    fetchSavedGenerations,
    generate,
    updateGenerationTags,
  } = useMediaStore();

  // --- Generation form state ---
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [size, setSize] = useState("1024x1024");

  // --- View / search / selection state ---
  const [viewMode, setViewMode] = useState<"recent" | "saved">("recent");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    fetchProviders();
    fetchSavedGenerations();
  }, [fetchProviders, fetchSavedGenerations]);

  const handleGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }
    await generate(trimmed, provider, model || undefined, size);
  };

  // --- Tag helpers ---
  const handleAddTag = useCallback(
    async (recordId: string, currentTags: string[], newTag: string) => {
      const tag = newTag.trim();
      if (!tag || currentTags.includes(tag)) {return;}
      const updated = [...currentTags, tag];
      await updateGenerationTags(recordId, JSON.stringify(updated));
    },
    [updateGenerationTags],
  );

  const handleRemoveTag = useCallback(
    async (recordId: string, currentTags: string[], removeTag: string) => {
      const updated = currentTags.filter((tg) => tg !== removeTag);
      await updateGenerationTags(recordId, JSON.stringify(updated));
    },
    [updateGenerationTags],
  );

  // --- Export helper ---
  const handleDownload = useCallback(
    (imgSrc: string, filename: string) => {
      const link = document.createElement("a");
      link.href = imgSrc;
      link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [],
  );

  // --- Filtering ---
  const query = searchQuery.toLowerCase();

  const filteredImages = images.filter((img) => {
    if (!query) {return true;}
    return (
      img.prompt.toLowerCase().includes(query) ||
      (img.revisedPrompt && img.revisedPrompt.toLowerCase().includes(query))
    );
  });

  const filteredSaved = savedGenerations.filter((rec) => {
    if (!query) {return true;}
    const tags = parseTags(rec.tags);
    return (
      rec.prompt.toLowerCase().includes(query) ||
      tags.some((tg) => tg.toLowerCase().includes(query))
    );
  });

  // --- Tag pills component ---
  const TagEditor = ({ record }: { record: MediaGenerationRecord }) => {
    const tags = parseTags(record.tags);
    return (
      <div className="flex flex-wrap items-center gap-1">
        {tags.length === 0 && (
          <span className="text-xs italic text-muted-foreground">
            {t("noTags")}
          </span>
        )}
        {tags.map((tg) => (
          <span
            key={tg}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
          >
            {tg}
            <button
              type="button"
              className="ml-0.5 text-primary/60 hover:text-primary"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveTag(record.id, tags, tg);
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto bg-background p-6 text-foreground">
      {/* Header */}
      <h1 className="text-2xl font-bold">{t("gallery")}</h1>

      {/* Generation Form */}
      <div className="max-w-2xl space-y-4">
        {/* Prompt */}
        <textarea
          rows={3}
          className="w-full rounded-lg border border-border bg-muted p-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder={t("imagePromptPlaceholder")}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={loading}
        />

        {/* Controls row */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Provider */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">{t("provider")}</label>
            <select
              className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              disabled={loading}
            >
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">{t("modelLabel")}</label>
            <input
              type="text"
              className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={t("modelPlaceholder")}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Size */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">{t("imageSize")}</label>
            <select
              className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              disabled={loading}
            >
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Generate Button */}
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
          >
            {loading && (
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {loading ? t("generating") : t("generate")}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Tab Bar & Search */}
      <div className="flex flex-wrap items-center gap-3">
        {/* View mode tabs */}
        <div className="flex rounded-lg border border-border bg-muted">
          <button
            type="button"
            className={`px-4 py-1.5 text-sm font-medium rounded-l-lg ${
              viewMode === "recent"
                ? "bg-primary text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setViewMode("recent")}
          >
            {t("recentGenerations")}
          </button>
          <button
            type="button"
            className={`px-4 py-1.5 text-sm font-medium rounded-r-lg ${
              viewMode === "saved"
                ? "bg-primary text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setViewMode("saved")}
          >
            {t("savedGenerations")}
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          className="flex-1 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder={t("searchGenerations")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* ===================== Recent (in-memory) Gallery ===================== */}
      {viewMode === "recent" && (
        <>
          {filteredImages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-20 text-muted-foreground">
              <p>{t("noImagesEmpty")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredImages.map((img) => {
                const imgSrc = img.url
                  ? img.url
                  : img.b64Json
                    ? `data:image/png;base64,${img.b64Json}`
                    : "";
                const isSelected = selectedImage === img.id;
                return (
                  <div
                    key={img.id}
                    className={`cursor-pointer overflow-hidden rounded-lg border bg-card transition-shadow ${
                      isSelected ? "border-primary shadow-lg" : "border-border"
                    }`}
                    onClick={() =>
                      setSelectedImage(isSelected ? null : img.id)
                    }
                  >
                    {/* Image area */}
                    <div className="flex aspect-square items-center justify-center bg-muted/50">
                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          alt={img.prompt}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {t("noPreview")}
                        </span>
                      )}
                    </div>

                    {/* Card info */}
                    <div className="space-y-2 p-3">
                      <p className="line-clamp-2 text-sm text-foreground">
                        {img.prompt}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            {img.provider}
                          </span>
                          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {img.model}
                          </span>
                        </div>
                        {imgSrc && (
                          <button
                            type="button"
                            className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(imgSrc, `image-${img.id}`);
                            }}
                          >
                            {t("downloadImage")}
                          </button>
                        )}
                      </div>
                      {img.revisedPrompt && (
                        <p className="text-xs text-muted-foreground">
                          {img.revisedPrompt}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ===================== Saved (persisted) Gallery ===================== */}
      {viewMode === "saved" && (
        <>
          {filteredSaved.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-20 text-muted-foreground">
              <p>{t("noImages")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredSaved.map((rec) => {
                const imgSrc = rec.filePath
                  ? `asset://localhost/${rec.filePath}`
                  : "";
                const isSelected = selectedImage === rec.id;
                const tags = parseTags(rec.tags);
                return (
                  <div
                    key={rec.id}
                    className={`cursor-pointer overflow-hidden rounded-lg border bg-card transition-shadow ${
                      isSelected ? "border-primary shadow-lg" : "border-border"
                    }`}
                    onClick={() =>
                      setSelectedImage(isSelected ? null : rec.id)
                    }
                  >
                    {/* Image area */}
                    <div className="flex aspect-square items-center justify-center bg-muted/50">
                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          alt={rec.prompt}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {t("noPreview")}
                        </span>
                      )}
                    </div>

                    {/* Card info */}
                    <div className="space-y-2 p-3">
                      <p className="line-clamp-2 text-sm text-foreground">
                        {rec.prompt}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            {rec.provider}
                          </span>
                          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {rec.model}
                          </span>
                          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {t("imageStatus")}: {rec.status}
                          </span>
                        </div>
                        {imgSrc && (
                          <button
                            type="button"
                            className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(imgSrc, `saved-${rec.id}`);
                            }}
                          >
                            {t("downloadImage")}
                          </button>
                        )}
                      </div>

                      {/* Tags (always visible) */}
                      <TagEditor record={rec} />

                      {/* Add tag input (only when expanded) */}
                      {isSelected && (
                        <div className="flex items-center gap-1 pt-1">
                          <input
                            type="text"
                            className="flex-1 rounded border border-border bg-muted px-2 py-1 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder={t("addTag")}
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                e.stopPropagation();
                                handleAddTag(rec.id, tags, tagInput);
                                setTagInput("");
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button
                            type="button"
                            className="rounded bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddTag(rec.id, tags, tagInput);
                              setTagInput("");
                            }}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
