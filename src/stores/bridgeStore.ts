import { create } from "zustand";
import { invoke } from "../lib/ipc";

/** Bridge info returned by the backend. */
export interface BridgeInfo {
  id: string;
  name: string | null;
  platform: string;
  enabled: boolean;
}

interface BridgeState {
  bridges: BridgeInfo[];
  loading: boolean;
  error: string | null;

  fetchBridges: () => Promise<void>;
  createBridge: (
    name: string,
    platform: string,
    url: string,
    channel?: string,
    token?: string,
  ) => Promise<string>;
  removeBridge: (bridgeId: string) => Promise<void>;
  enableBridge: (bridgeId: string) => Promise<void>;
  disableBridge: (bridgeId: string) => Promise<void>;
  sendTest: (bridgeId: string) => Promise<void>;
}

export const useBridgeStore = create<BridgeState>((set, get) => ({
  bridges: [],
  loading: false,
  error: null,

  fetchBridges: async () => {
    set({ loading: true, error: null });
    try {
      const bridges = await invoke<BridgeInfo[]>("bridge_list");
      set({ bridges, loading: false });
    } catch (e: unknown) {
      set({
        error: e instanceof Error ? e.message : String(e),
        loading: false,
      });
    }
  },

  createBridge: async (name, platform, url, channel, token) => {
    const id = await invoke<string>("bridge_create", {
      name,
      platform,
      url,
      channel,
      token,
    });
    await get().fetchBridges();
    return id;
  },

  removeBridge: async (bridgeId) => {
    await invoke("bridge_remove", { bridgeId });
    await get().fetchBridges();
  },

  enableBridge: async (bridgeId) => {
    await invoke("bridge_enable", { bridgeId });
    await get().fetchBridges();
  },

  disableBridge: async (bridgeId) => {
    await invoke("bridge_disable", { bridgeId });
    await get().fetchBridges();
  },

  sendTest: async (bridgeId) => {
    await invoke("bridge_send", {
      bridgeId,
      content: "🔔 Test notification from DevPilot",
      title: "Test Notification",
    });
  },
}));
