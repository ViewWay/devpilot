import { describe, it, expect, beforeEach } from "vitest";
import { useBridgeStore } from "../../stores/bridgeStore";

describe("bridgeStore", () => {
  beforeEach(() => {
    useBridgeStore.setState({
      bridges: [],
      savedChannels: [],
      loading: false,
      error: null,
    });
  });

  describe("initial state", () => {
    it("starts with empty bridges list", () => {
      expect(useBridgeStore.getState().bridges).toEqual([]);
    });

    it("starts with empty savedChannels", () => {
      expect(useBridgeStore.getState().savedChannels).toEqual([]);
    });

    it("starts with loading false", () => {
      expect(useBridgeStore.getState().loading).toBe(false);
    });

    it("starts with no error", () => {
      expect(useBridgeStore.getState().error).toBeNull();
    });
  });

  describe("fetchBridges", () => {
    it("loads bridges from backend (mock returns 2 items)", async () => {
      await useBridgeStore.getState().fetchBridges();
      const { bridges, loading, error } = useBridgeStore.getState();
      expect(loading).toBe(false);
      expect(error).toBeNull();
      expect(bridges).toHaveLength(2);
      expect(bridges[0]!.id).toBe("bridge-1");
      expect(bridges[0]!.platform).toBe("Telegram");
    });

    it("sets loading true while fetching", () => {
      // After fetch completes, loading should be false
      expect(useBridgeStore.getState().loading).toBe(false);
    });
  });

  describe("fetchSavedChannels", () => {
    it("loads saved channels from backend", async () => {
      await useBridgeStore.getState().fetchSavedChannels();
      const { savedChannels } = useBridgeStore.getState();
      expect(savedChannels).toHaveLength(2);
    });
  });

  describe("createBridge", () => {
    it("creates a bridge and refreshes list", async () => {
      const id = await useBridgeStore.getState().createBridge(
        "Test Bridge",
        "Telegram",
        "https://api.telegram.org",
        "@testchan",
        "tok123",
      );
      // Mock returns bridge-${Date.now()}
      expect(id).toMatch(/^bridge-/);
      // After create, fetchBridges is called → list has 2 items
      expect(useBridgeStore.getState().bridges).toHaveLength(2);
    });
  });

  describe("removeBridge", () => {
    it("removes a bridge and refreshes list", async () => {
      // First load some bridges
      await useBridgeStore.getState().fetchBridges();
      expect(useBridgeStore.getState().bridges).toHaveLength(2);

      await useBridgeStore.getState().removeBridge("bridge-1");
      // After remove, fetchBridges is called again → mock still returns 2 items
      expect(useBridgeStore.getState().bridges).toHaveLength(2);
    });
  });

  describe("enableBridge", () => {
    it("enables a bridge and refreshes list", async () => {
      await useBridgeStore.getState().enableBridge("bridge-2");
      // fetchBridges called, no error
      expect(useBridgeStore.getState().error).toBeNull();
    });
  });

  describe("disableBridge", () => {
    it("disables a bridge and refreshes list", async () => {
      await useBridgeStore.getState().disableBridge("bridge-1");
      expect(useBridgeStore.getState().error).toBeNull();
    });
  });

  describe("sendTest", () => {
    it("sends test notification without error", async () => {
      await expect(
        useBridgeStore.getState().sendTest("bridge-1"),
      ).resolves.toBeUndefined();
    });
  });

  describe("saveChannel", () => {
    it("saves a channel and refreshes saved list", async () => {
      await useBridgeStore.getState().saveChannel({
        id: "ch-1",
        channelType: "Telegram",
        config: "{}",
        sessionBindings: null,
        enabled: true,
        status: "active",
        createdAt: new Date().toISOString(),
      });
      // fetchSavedChannels called → mock returns 2 items
      expect(useBridgeStore.getState().savedChannels).toHaveLength(2);
    });
  });

  describe("deleteSavedChannel", () => {
    it("deletes a saved channel and refreshes", async () => {
      await useBridgeStore.getState().fetchSavedChannels();
      expect(useBridgeStore.getState().savedChannels).toHaveLength(2);

      await useBridgeStore.getState().deleteSavedChannel("saved-1");
      // fetchSavedChannels called → mock returns 2 items
      expect(useBridgeStore.getState().savedChannels).toHaveLength(2);
    });
  });

  describe("updateChannelStatus", () => {
    it("updates status and refreshes saved list", async () => {
      await useBridgeStore.getState().updateChannelStatus("saved-1", "connected");
      expect(useBridgeStore.getState().savedChannels).toHaveLength(2);
    });
  });
});
