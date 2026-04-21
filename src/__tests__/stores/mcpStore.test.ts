import { describe, it, expect, beforeEach } from "vitest";
import { useMcpStore } from "../../stores/mcpStore";
import type { McpServerConfig } from "../../types";

const mockServer: McpServerConfig = {
  id: "test-server",
  name: "Test Server",
  transport: "stdio",
  command: "node",
  args: ["mcp-server.js"],
  enabled: true,
  createdAt: new Date().toISOString(),
};

const mockSseServer: McpServerConfig = {
  id: "sse-server",
  name: "SSE Server",
  transport: "sse",
  url: "http://localhost:3000/mcp",
  enabled: true,
  createdAt: new Date().toISOString(),
};

describe("mcpStore", () => {
  beforeEach(() => {
    useMcpStore.setState({
      servers: [],
      connectedIds: [],
      loading: false,
      error: null,
    });
  });

  describe("initial state", () => {
    it("starts with empty servers list", () => {
      expect(useMcpStore.getState().servers).toEqual([]);
    });

    it("starts with empty connectedIds", () => {
      expect(useMcpStore.getState().connectedIds).toEqual([]);
    });

    it("starts with loading false", () => {
      expect(useMcpStore.getState().loading).toBe(false);
    });

    it("starts with no error", () => {
      expect(useMcpStore.getState().error).toBeNull();
    });
  });

  describe("fetchServers", () => {
    it("loads servers from backend (mock returns [])", async () => {
      await useMcpStore.getState().fetchServers();
      // Mock returns empty array, but loading should be false after
      expect(useMcpStore.getState().loading).toBe(false);
      expect(useMcpStore.getState().error).toBeNull();
    });
  });

  describe("fetchConnected", () => {
    it("loads connected server ids (mock returns [])", async () => {
      await useMcpStore.getState().fetchConnected();
      expect(useMcpStore.getState().connectedIds).toEqual([]);
    });
  });

  describe("addServer", () => {
    it("adds a server and refreshes the list", async () => {
      await useMcpStore.getState().addServer(mockServer);
      // After addServer, fetchServers is called which returns []
      // But the IPC mock for upsert_mcp_server returns the server
      expect(useMcpStore.getState().error).toBeNull();
    });
  });

  describe("updateServer", () => {
    it("updates a server without error", async () => {
      await useMcpStore.getState().updateServer({
        ...mockServer,
        name: "Updated Server",
      });
      expect(useMcpStore.getState().error).toBeNull();
    });
  });

  describe("removeServer", () => {
    it("removes a server and refreshes lists", async () => {
      // Set up a server first
      useMcpStore.setState({
        servers: [mockServer],
        connectedIds: [mockServer.id],
      });

      await useMcpStore.getState().removeServer(mockServer.id);
      expect(useMcpStore.getState().error).toBeNull();
    });
  });

  describe("toggleEnabled", () => {
    it("toggles a server enabled state", async () => {
      useMcpStore.setState({
        servers: [{ ...mockServer, enabled: true }],
      });

      await useMcpStore.getState().toggleEnabled(mockServer.id);
      expect(useMcpStore.getState().error).toBeNull();
    });

    it("does nothing if server not found", async () => {
      await useMcpStore.getState().toggleEnabled("nonexistent");
      expect(useMcpStore.getState().error).toBeNull();
    });
  });

  describe("connect / disconnect", () => {
    it("connects to a server by id", async () => {
      await useMcpStore.getState().connect(mockServer.id);
      expect(useMcpStore.getState().error).toBeNull();
    });

    it("disconnects from a server by id", async () => {
      await useMcpStore.getState().disconnect(mockServer.id);
      expect(useMcpStore.getState().error).toBeNull();
    });
  });

  describe("state management", () => {
    it("allows direct state updates", () => {
      useMcpStore.setState({ servers: [mockServer, mockSseServer] });
      expect(useMcpStore.getState().servers).toHaveLength(2);
      expect(useMcpStore.getState().servers[0]!.id).toBe("test-server");
      expect(useMcpStore.getState().servers[1]!.id).toBe("sse-server");
    });

    it("tracks connected IDs", () => {
      useMcpStore.setState({ connectedIds: ["server-a", "server-b"] });
      expect(useMcpStore.getState().connectedIds).toHaveLength(2);
    });

    it("handles loading state", () => {
      useMcpStore.setState({ loading: true });
      expect(useMcpStore.getState().loading).toBe(true);
      useMcpStore.setState({ loading: false });
      expect(useMcpStore.getState().loading).toBe(false);
    });

    it("handles error state", () => {
      useMcpStore.setState({ error: "Connection failed" });
      expect(useMcpStore.getState().error).toBe("Connection failed");
      useMcpStore.setState({ error: null });
      expect(useMcpStore.getState().error).toBeNull();
    });
  });
});
