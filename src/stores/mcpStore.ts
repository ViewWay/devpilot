import { create } from "zustand";
import { invoke, isTauriRuntime } from "../lib/ipc";
import type { McpServerConfig } from "../types";

interface McpState {
  servers: McpServerConfig[];
  connectedIds: string[];
  loading: boolean;
  error: string | null;
  fetchServers: () => Promise<void>;
  fetchConnected: () => Promise<void>;
  addServer: (server: McpServerConfig) => Promise<void>;
  updateServer: (server: McpServerConfig) => Promise<void>;
  removeServer: (id: string) => Promise<void>;
  toggleEnabled: (id: string) => Promise<void>;
  connect: (id: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
}

export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  connectedIds: [],
  loading: false,
  error: null,

  fetchServers: async () => {
    if (!isTauriRuntime()) {
      set({ servers: [], loading: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const servers = await invoke<McpServerConfig[]>("list_mcp_servers");
      set({ servers, loading: false });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  },

  fetchConnected: async () => {
    if (!isTauriRuntime()) {
      set({ connectedIds: [] });
      return;
    }
    try {
      const connected = await invoke<McpServerConfig[]>("mcp_list_connected");
      set({ connectedIds: connected.map((s) => s.id) });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  addServer: async (server) => {
    try {
      await invoke<McpServerConfig>("upsert_mcp_server", { server });
      await get().fetchServers();
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  updateServer: async (server) => {
    try {
      await invoke<McpServerConfig>("upsert_mcp_server", { server });
      await get().fetchServers();
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  removeServer: async (id) => {
    try {
      await invoke("delete_mcp_server", { id });
      await get().fetchServers();
      await get().fetchConnected();
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  toggleEnabled: async (id) => {
    const server = get().servers.find((s) => s.id === id);
    if (!server) { return; }
    const updated = { ...server, enabled: !server.enabled };
    try {
      await invoke<McpServerConfig>("upsert_mcp_server", { server: updated });
      await get().fetchServers();
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  connect: async (id) => {
    try {
      await invoke("mcp_connect_server", { id });
      await get().fetchConnected();
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  disconnect: async (id) => {
    try {
      await invoke("mcp_disconnect_server", { id });
      await get().fetchConnected();
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },
}));
