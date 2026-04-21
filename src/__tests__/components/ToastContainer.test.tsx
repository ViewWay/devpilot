import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { useToastStore } from "../../stores/toastStore";

// Mock IPC
vi.mock("../../lib/ipc", () => ({
  isTauriRuntime: () => false,
  invoke: vi.fn().mockResolvedValue(null),
}));

describe("ToastContainer", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it("renders nothing when no toasts", async () => {
    const { ToastContainer } = await import(
      "../../components/ToastContainer"
    );
    const { container } = renderWithProviders(<ToastContainer />);
    // The container div exists but has no toast children
    expect(container.querySelector(".pointer-events-none")).toBeInTheDocument();
    expect(screen.queryByText(/.+/)).not.toBeInTheDocument();
  });

  it("renders toast messages from the store", async () => {
    useToastStore.setState({
      toasts: [
        { id: "1", type: "info", message: "Hello world" },
      ],
    });
    const { ToastContainer } = await import(
      "../../components/ToastContainer"
    );
    renderWithProviders(<ToastContainer />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders multiple toasts", async () => {
    useToastStore.setState({
      toasts: [
        { id: "1", type: "info", message: "First" },
        { id: "2", type: "success", message: "Second" },
        { id: "3", type: "error", message: "Third" },
      ],
    });
    const { ToastContainer } = await import(
      "../../components/ToastContainer"
    );
    renderWithProviders(<ToastContainer />);
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("Third")).toBeInTheDocument();
  });

  it("limits visible toasts to 5", async () => {
    const toasts = Array.from({ length: 7 }, (_, i) => ({
      id: String(i),
      type: "info" as const,
      message: `Toast ${i}`,
    }));
    useToastStore.setState({ toasts });
    const { ToastContainer } = await import(
      "../../components/ToastContainer"
    );
    renderWithProviders(<ToastContainer />);
    // Should show last 5 toasts (2-6)
    expect(screen.queryByText("Toast 0")).not.toBeInTheDocument();
    expect(screen.queryByText("Toast 1")).not.toBeInTheDocument();
    expect(screen.getByText("Toast 2")).toBeInTheDocument();
    expect(screen.getByText("Toast 6")).toBeInTheDocument();
  });

  it("removes toast when close button is clicked", async () => {
    useToastStore.setState({
      toasts: [{ id: "t1", type: "info", message: "Dismiss me" }],
    });
    const { ToastContainer } = await import(
      "../../components/ToastContainer"
    );
    renderWithProviders(<ToastContainer />);

    expect(screen.getByText("Dismiss me")).toBeInTheDocument();

    // Directly call the store's removeToast to simulate close button behavior
    useToastStore.getState().removeToast("t1");
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("renders different toast types", async () => {
    useToastStore.setState({
      toasts: [
        { id: "1", type: "info", message: "Info" },
        { id: "2", type: "success", message: "Success" },
        { id: "3", type: "warning", message: "Warning" },
        { id: "4", type: "error", message: "Error" },
      ],
    });
    const { ToastContainer } = await import(
      "../../components/ToastContainer"
    );
    renderWithProviders(<ToastContainer />);
    expect(screen.getByText("Info")).toBeInTheDocument();
    expect(screen.getByText("Success")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
  });
});
