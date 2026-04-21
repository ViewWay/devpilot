import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import type { ApprovalRequest } from "../../types";

// Helper to create a test approval request
function makeRequest(overrides?: Partial<ApprovalRequest>): ApprovalRequest {
  return {
    id: "approval-1",
    toolCallId: "tc-1",
    command: "rm -rf /tmp/test",
    description: "Remove temporary files",
    riskLevel: "medium",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("ApprovalOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the command being approved", async () => {
    const { ApprovalOverlay } = await import("../../components/chat/ApprovalOverlay");
    renderWithProviders(
      <ApprovalOverlay
        request={makeRequest()}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onAllowAll={vi.fn()}
      />,
    );
    expect(screen.getByText("rm -rf /tmp/test")).toBeInTheDocument();
  });

  it("shows approve and deny buttons", async () => {
    const { ApprovalOverlay } = await import("../../components/chat/ApprovalOverlay");
    renderWithProviders(
      <ApprovalOverlay
        request={makeRequest()}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onAllowAll={vi.fn()}
      />,
    );
    // i18n resolves: allowCommand → "Allow", denyCommand → "Deny"
    expect(screen.getByText("Allow")).toBeInTheDocument();
    expect(screen.getByText("Deny")).toBeInTheDocument();
  });

  it("shows allow all button", async () => {
    const { ApprovalOverlay } = await import("../../components/chat/ApprovalOverlay");
    renderWithProviders(
      <ApprovalOverlay
        request={makeRequest()}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onAllowAll={vi.fn()}
      />,
    );
    // i18n resolves: allowAll → "Allow All"
    expect(screen.getByText("Allow All")).toBeInTheDocument();
  });

  it("calls onApprove with the correct id when approve is clicked", async () => {
    const onApprove = vi.fn();
    const { ApprovalOverlay } = await import("../../components/chat/ApprovalOverlay");
    const user = userEvent.setup();
    renderWithProviders(
      <ApprovalOverlay
        request={makeRequest({ id: "approval-42" })}
        onApprove={onApprove}
        onDeny={vi.fn()}
        onAllowAll={vi.fn()}
      />,
    );
    await user.click(screen.getByText("Allow"));
    expect(onApprove).toHaveBeenCalledWith("approval-42");
  });

  it("calls onDeny with the correct id when deny is clicked", async () => {
    const onDeny = vi.fn();
    const { ApprovalOverlay } = await import("../../components/chat/ApprovalOverlay");
    const user = userEvent.setup();
    renderWithProviders(
      <ApprovalOverlay
        request={makeRequest({ id: "approval-99" })}
        onApprove={vi.fn()}
        onDeny={onDeny}
        onAllowAll={vi.fn()}
      />,
    );
    await user.click(screen.getByText("Deny"));
    expect(onDeny).toHaveBeenCalledWith("approval-99");
  });

  it("calls onAllowAll when allow all is clicked", async () => {
    const onAllowAll = vi.fn();
    const { ApprovalOverlay } = await import("../../components/chat/ApprovalOverlay");
    const user = userEvent.setup();
    renderWithProviders(
      <ApprovalOverlay
        request={makeRequest()}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onAllowAll={onAllowAll}
      />,
    );
    await user.click(screen.getByText("Allow All"));
    expect(onAllowAll).toHaveBeenCalled();
  });

  it("shows working directory when present", async () => {
    const { ApprovalOverlay } = await import("../../components/chat/ApprovalOverlay");
    renderWithProviders(
      <ApprovalOverlay
        request={makeRequest({ workingDir: "/home/user/project" })}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onAllowAll={vi.fn()}
      />,
    );
    expect(screen.getByText(/\/home\/user\/project/)).toBeInTheDocument();
  });

  it("hides working directory when not present", async () => {
    const { ApprovalOverlay } = await import("../../components/chat/ApprovalOverlay");
    renderWithProviders(
      <ApprovalOverlay
        request={makeRequest()}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onAllowAll={vi.fn()}
      />,
    );
    expect(screen.queryByText(/executionDirectory/)).not.toBeInTheDocument();
  });

  it("shows risk level badge", async () => {
    const { ApprovalOverlay } = await import("../../components/chat/ApprovalOverlay");
    renderWithProviders(
      <ApprovalOverlay
        request={makeRequest({ riskLevel: "high" })}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onAllowAll={vi.fn()}
      />,
    );
    // Risk level is rendered in a badge span. i18n resolves: high → "High"
    const badges = screen.getAllByText("High");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});

describe("ApprovalQueue", () => {
  it("renders nothing when requests array is empty", async () => {
    const { ApprovalQueue } = await import("../../components/chat/ApprovalOverlay");
    const { container } = renderWithProviders(
      <ApprovalQueue
        requests={[]}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onAllowAll={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders multiple approval requests", async () => {
    const { ApprovalQueue } = await import("../../components/chat/ApprovalOverlay");
    renderWithProviders(
      <ApprovalQueue
        requests={[
          makeRequest({ id: "a1", command: "ls -la" }),
          makeRequest({ id: "a2", command: "cat file.txt" }),
        ]}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onAllowAll={vi.fn()}
      />,
    );
    expect(screen.getByText("ls -la")).toBeInTheDocument();
    expect(screen.getByText("cat file.txt")).toBeInTheDocument();
  });

  it("renders all three risk levels correctly", async () => {
    const { ApprovalQueue } = await import("../../components/chat/ApprovalOverlay");
    renderWithProviders(
      <ApprovalQueue
        requests={[
          makeRequest({ id: "a1", command: "cmd1", riskLevel: "low" }),
          makeRequest({ id: "a2", command: "cmd2", riskLevel: "medium" }),
          makeRequest({ id: "a3", command: "cmd3", riskLevel: "high" }),
        ]}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onAllowAll={vi.fn()}
      />,
    );
    // i18n resolves: low → "Low", medium → "Medium", high → "High"
    expect(screen.getAllByText("Low").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Medium").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("High").length).toBeGreaterThanOrEqual(1);
  });
});
