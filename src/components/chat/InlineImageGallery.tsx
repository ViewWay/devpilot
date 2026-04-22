import { useState } from "react";
import type { ImageItem } from "./ImageGalleryModal";
import { ImageGalleryModal } from "./ImageGalleryModal";
import { useI18n } from "../../i18n";

type InlineImageGalleryProps = {
  /** Images to display in the inline grid. */
  images: ImageItem[];
  /** Maximum number of images to show before "+N more" overlay. Default 4. */
  maxVisible?: number;
  /** Optional className for the container. */
  className?: string;
};

/**
 * InlineImageGallery — renders a responsive grid of image thumbnails
 * within a chat message. Clicking any image opens the full-screen
 * ImageGalleryModal for browsing.
 */
export function InlineImageGallery({
  images,
  maxVisible = 4,
  className = "",
}: InlineImageGalleryProps) {
  const { t } = useI18n();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (images.length === 0) { return null; }

  const visibleImages = images.slice(0, maxVisible);
  const overflowCount = images.length - maxVisible;

  const handleImageClick = (index: number) => {
    setSelectedIndex(index);
    setModalOpen(true);
  };

  return (
    <>
      <div
        className={`grid gap-2 mt-2 ${className}`}
        style={{
          gridTemplateColumns:
            visibleImages.length === 1
              ? "1fr"
              : visibleImages.length === 2
                ? "repeat(2, 1fr)"
                : `repeat(${Math.min(visibleImages.length, 3)}, 1fr)`,
          maxWidth: visibleImages.length === 1 ? "400px" : "500px",
        }}
      >
        {visibleImages.map((img, index) => (
          <button
            key={img.id}
            type="button"
            onClick={() => handleImageClick(index)}
            className={`
              relative group overflow-hidden rounded-lg border
              border-[var(--color-border)] bg-[var(--color-surface)]
              focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]
              transition-colors
              ${visibleImages.length >= 3 && index === 0 ? "col-span-full" : ""}
            `}
            aria-label={img.alt ?? t("openImage")}
          >
            <img
              src={img.src}
              alt={img.alt ?? ""}
              className="w-full h-auto max-h-48 object-cover"
              loading="lazy"
              draggable={false}
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />

            {/* Overflow count badge */}
            {index === visibleImages.length - 1 && overflowCount > 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <span className="text-white text-lg font-semibold">
                  +{overflowCount} {t("more")}
                </span>
              </div>
            )}
          </button>
        ))}
      </div>

      <ImageGalleryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        images={images}
        initialIndex={selectedIndex}
      />
    </>
  );
}
