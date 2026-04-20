import { useEffect, useState } from "react";
import { useMediaStore } from "../stores/mediaStore";
import { useI18n } from "../i18n";

const SIZES = ["256x256", "512x512", "1024x1024", "1024x1792", "1792x1024"];

export function GalleryPage() {
  const { t } = useI18n();
  const { images, providers, loading, error, fetchProviders, generate } = useMediaStore();

  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [size, setSize] = useState("1024x1024");

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const handleGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) { return; }
    await generate(trimmed, provider, model || undefined, size);
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

      {/* Gallery Grid */}
      {images.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-20 text-muted-foreground">
          <p>{t("noImagesEmpty")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {images.map((img) => (
            <div
              key={img.id}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              {/* Image area */}
              <div className="flex aspect-square items-center justify-center bg-muted/50">
                {img.url ? (
                  <img
                    src={img.url}
                    alt={img.prompt}
                    className="h-full w-full object-cover"
                  />
                ) : img.b64Json ? (
                  <img
                    src={`data:image/png;base64,${img.b64Json}`}
                    alt={img.prompt}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">{t("noPreview")}</span>
                )}
              </div>

              {/* Card info */}
              <div className="space-y-2 p-3">
                <p className="line-clamp-2 text-sm text-foreground">
                  {img.prompt}
                </p>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {img.provider}
                  </span>
                  <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {img.model}
                  </span>
                </div>
                {img.revisedPrompt && (
                  <p className="text-xs text-muted-foreground">
                    {img.revisedPrompt}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
