import { useState, useCallback, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download } from "lucide-react";
import { useI18n } from "../../i18n";

export interface ImageItem {
  /** Unique identifier. */
  id: string;
  /** Image source URL (can be data URL, blob URL, or remote). */
  src: string;
  /** Alt text / caption. */
  alt?: string;
  /** Optional width (for aspect ratio hints). */
  width?: number;
  /** Optional height (for aspect ratio hints). */
  height?: number;
}

type ImageGalleryModalProps = {
  /** Whether the modal is open. */
  open: boolean;
  /** Callback to close the modal. */
  onClose: () => void;
  /** List of images to browse. */
  images: ImageItem[];
  /** Index of the initially selected image. */
  initialIndex?: number;
};

/**
 * ImageGalleryModal — fullscreen image viewer with navigation, zoom,
 * and download capabilities. Keyboard accessible (← → Escape).
 */
export function ImageGalleryModal({
  open,
  onClose,
  images,
  initialIndex = 0,
}: ImageGalleryModalProps) {
  const { t } = useI18n();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);

  const goToPrev = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : images.length - 1));
  }, [images.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((i) => (i < images.length - 1 ? i + 1 : 0));
  }, [images.length]);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(5, z + 0.5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.25, z - 0.5));
  }, []);

  const handleDownload = useCallback(() => {
    const img = images[currentIndex];
    if (!img) { return; }
    const a = document.createElement("a");
    a.href = img.src;
    a.download = img.alt ?? `image-${img.id}`;
    a.click();
  }, [currentIndex, images]);

  // Reset zoom when image changes
  useEffect(() => {
    setZoom(1);
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) { return; }
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          goToPrev();
          break;
        case "ArrowRight":
          goToNext();
          break;
        case "+":
        case "=":
          handleZoomIn();
          break;
        case "-":
          handleZoomOut();
          break;
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, currentIndex, images.length, onClose, goToPrev, goToNext, handleZoomIn, handleZoomOut]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || images.length === 0) { return null; }

  const currentImage = images[currentIndex];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-label={t("imageGallery")}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-black/40">
        <div className="text-sm text-white/80">
          {currentIndex + 1} / {images.length}
          {currentImage?.alt && (
            <span className="ml-2 text-white/60">— {currentImage.alt}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <GalleryButton
            icon={<ZoomOut size={18} />}
            label={t("zoomOut")}
            onClick={handleZoomOut}
            disabled={zoom <= 0.25}
          />
          <span className="text-xs text-white/60 min-w-[3rem] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <GalleryButton
            icon={<ZoomIn size={18} />}
            label={t("zoomIn")}
            onClick={handleZoomIn}
            disabled={zoom >= 5}
          />
          <GalleryButton
            icon={<Download size={18} />}
            label={t("download")}
            onClick={handleDownload}
          />
          <GalleryButton
            icon={<X size={18} />}
            label={t("close")}
            onClick={onClose}
          />
        </div>
      </div>

      {/* Navigation arrows */}
      {images.length > 1 && (
        <>
          <GalleryButton
            icon={<ChevronLeft size={24} />}
            label={t("previous")}
            onClick={goToPrev}
            className="absolute left-4 top-1/2 -translate-y-1/2"
          />
          <GalleryButton
            icon={<ChevronRight size={24} />}
            label={t("next")}
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2"
          />
        </>
      )}

      {/* Image container */}
      <div
        className="flex items-center justify-center w-full h-full p-16 overflow-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget) { onClose(); }
        }}
      >
        <img
          src={currentImage?.src}
          alt={currentImage?.alt ?? ""}
          className="max-w-full max-h-full object-contain transition-transform duration-200"
          style={{ transform: `scale(${zoom})` }}
          draggable={false}
        />
      </div>
    </div>
  );
}

function GalleryButton({
  icon,
  label,
  onClick,
  disabled,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`
        flex h-9 w-9 items-center justify-center rounded-full
        text-white/80 hover:text-white hover:bg-white/10
        transition-colors disabled:opacity-30 disabled:cursor-not-allowed
        ${className}
      `}
    >
      {icon}
    </button>
  );
}
