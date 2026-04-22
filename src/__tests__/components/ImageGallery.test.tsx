import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { InlineImageGallery } from "../../components/chat/InlineImageGallery";
import { ImageGalleryModal } from "../../components/chat/ImageGalleryModal";
import type { ImageItem } from "../../components/chat/ImageGalleryModal";

const mockImages: ImageItem[] = [
  { id: "1", src: "data:image/png;base64,aaa", alt: "Image 1" },
  { id: "2", src: "data:image/png;base64,bbb", alt: "Image 2" },
  { id: "3", src: "data:image/png;base64,ccc", alt: "Image 3" },
];

describe("InlineImageGallery", () => {
  it("renders nothing for empty images array", () => {
    const { container } = renderWithProviders(
      <InlineImageGallery images={[]} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders image thumbnails", () => {
    renderWithProviders(<InlineImageGallery images={mockImages} />);

    const images = screen.getAllByRole("button");
    // 3 image thumbnails
    expect(images.length).toBe(3);
  });

  it("shows overflow count when images exceed maxVisible", () => {
    const manyImages: ImageItem[] = Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      src: `data:image/png;base64,${i}`,
      alt: `Image ${i}`,
    }));

    renderWithProviders(
      <InlineImageGallery images={manyImages} maxVisible={4} />,
    );

    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("renders single image without grid", () => {
    renderWithProviders(
      <InlineImageGallery images={[mockImages[0]!]} />,
    );

    const images = screen.getAllByRole("img");
    expect(images.length).toBe(1);
    expect(images[0]).toHaveAttribute("alt", "Image 1");
  });

  it("opens modal on image click", () => {
    renderWithProviders(<InlineImageGallery images={mockImages} />);

    const firstImage = screen.getAllByRole("button")[0]!;
    fireEvent.click(firstImage);

    // Modal should be open with the gallery
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("ImageGalleryModal", () => {
  it("renders nothing when not open", () => {
    renderWithProviders(
      <ImageGalleryModal
        open={false}
        onClose={vi.fn()}
        images={mockImages}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders modal with image counter", () => {
    renderWithProviders(
      <ImageGalleryModal
        open={true}
        onClose={vi.fn()}
        images={mockImages}
        initialIndex={0}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("displays image alt text", () => {
    renderWithProviders(
      <ImageGalleryModal
        open={true}
        onClose={vi.fn()}
        images={mockImages}
        initialIndex={0}
      />,
    );

    expect(screen.getByText("— Image 1")).toBeInTheDocument();
  });

  it("shows navigation arrows for multiple images", () => {
    renderWithProviders(
      <ImageGalleryModal
        open={true}
        onClose={vi.fn()}
        images={mockImages}
      />,
    );

    // Should have prev/next buttons
    const buttons = screen.getAllByRole("button");
    // At minimum: zoom out, zoom in, download, close, prev, next
    expect(buttons.length).toBeGreaterThanOrEqual(6);
  });

  it("does not show navigation for single image", () => {
    renderWithProviders(
      <ImageGalleryModal
        open={true}
        onClose={vi.fn()}
        images={[mockImages[0]!]}
      />,
    );

    // Single image - should have zoom, download, close but NOT prev/next
    expect(screen.queryByLabelText("Previous")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Next")).not.toBeInTheDocument();
  });
});
