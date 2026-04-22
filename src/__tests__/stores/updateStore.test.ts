import { describe, it, expect } from "vitest";
import { useUpdateStore } from "../../stores/updateStore";

describe("updateStore", () => {
  it("starts with idle state", () => {
    const state = useUpdateStore.getState();
    expect(state.state.status).toBe("idle");
    expect(state.dismissed).toBe(false);
  });

  it("setState transitions to available", () => {
    useUpdateStore.getState().setState({
      status: "available",
      info: { version: "1.0.1", currentVersion: "1.0.0" },
    });

    const state = useUpdateStore.getState();
    expect(state.state.status).toBe("available");
    if (state.state.status === "available") {
      expect(state.state.info.version).toBe("1.0.1");
      expect(state.state.info.currentVersion).toBe("1.0.0");
    }
  });

  it("setState transitions to downloading with progress", () => {
    useUpdateStore.getState().setState({ status: "downloading", progress: 42 });

    const state = useUpdateStore.getState();
    expect(state.state.status).toBe("downloading");
    if (state.state.status === "downloading") {
      expect(state.state.progress).toBe(42);
    }
  });

  it("setState transitions to installing", () => {
    useUpdateStore.getState().setState({ status: "installing" });
    expect(useUpdateStore.getState().state.status).toBe("installing");
  });

  it("setState transitions to error", () => {
    useUpdateStore.getState().setState({
      status: "error",
      message: "network failure",
    });

    const state = useUpdateStore.getState();
    expect(state.state.status).toBe("error");
    if (state.state.status === "error") {
      expect(state.state.message).toBe("network failure");
    }
  });

  it("setState transitions to up-to-date", () => {
    useUpdateStore.getState().setState({ status: "up-to-date" });
    expect(useUpdateStore.getState().state.status).toBe("up-to-date");
  });

  it("setState transitions to checking", () => {
    useUpdateStore.getState().setState({ status: "checking" });
    expect(useUpdateStore.getState().state.status).toBe("checking");
  });

  it("dismiss sets dismissed flag", () => {
    useUpdateStore.getState().dismiss();
    expect(useUpdateStore.getState().dismissed).toBe(true);
  });

  it("reset clears state and dismissed", () => {
    useUpdateStore.getState().setState({ status: "downloading", progress: 50 });
    useUpdateStore.getState().dismiss();

    useUpdateStore.getState().reset();

    const state = useUpdateStore.getState();
    expect(state.state.status).toBe("idle");
    expect(state.dismissed).toBe(false);
  });

  it("full lifecycle: checking → available → downloading → installing", () => {
    const { setState } = useUpdateStore.getState();

    setState({ status: "checking" });
    expect(useUpdateStore.getState().state.status).toBe("checking");

    setState({
      status: "available",
      info: { version: "2.0.0", currentVersion: "1.0.0", body: "Major release" },
    });
    expect(useUpdateStore.getState().state.status).toBe("available");

    setState({ status: "downloading", progress: 0 });
    expect(useUpdateStore.getState().state.status).toBe("downloading");

    setState({ status: "downloading", progress: 50 });
    const s = useUpdateStore.getState().state;
    if (s.status === "downloading") {
      expect(s.progress).toBe(50);
    }

    setState({ status: "installing" });
    expect(useUpdateStore.getState().state.status).toBe("installing");

    // Reset at end
    useUpdateStore.getState().reset();
    expect(useUpdateStore.getState().state.status).toBe("idle");
  });
});
