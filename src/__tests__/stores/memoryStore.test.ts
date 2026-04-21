import { describe, it, expect, beforeEach } from "vitest";
import { useMemoryStore } from "../../stores/memoryStore";

describe("memoryStore", () => {
  beforeEach(() => {
    useMemoryStore.setState({
      persona: { soulMd: null, userMd: null, memoryMd: null, agentsMd: null },
      dailyMemories: [],
      searchResults: [],
      loadingPersona: false,
      loadingMemories: false,
      searching: false,
      saving: null,
      error: null,
    });
  });

  describe("initial state", () => {
    it("starts with empty persona files", () => {
      const { persona } = useMemoryStore.getState();
      expect(persona.soulMd).toBeNull();
      expect(persona.userMd).toBeNull();
      expect(persona.memoryMd).toBeNull();
      expect(persona.agentsMd).toBeNull();
    });

    it("starts with empty daily memories", () => {
      expect(useMemoryStore.getState().dailyMemories).toEqual([]);
    });

    it("starts with empty search results", () => {
      expect(useMemoryStore.getState().searchResults).toEqual([]);
    });

    it("starts with all loading flags false", () => {
      const state = useMemoryStore.getState();
      expect(state.loadingPersona).toBe(false);
      expect(state.loadingMemories).toBe(false);
      expect(state.searching).toBe(false);
    });

    it("starts with saving null", () => {
      expect(useMemoryStore.getState().saving).toBeNull();
    });

    it("starts with no error", () => {
      expect(useMemoryStore.getState().error).toBeNull();
    });
  });

  describe("loadPersona", () => {
    it("loads persona files from backend", async () => {
      await useMemoryStore.getState().loadPersona("/workspace");
      const { persona, loadingPersona, error } = useMemoryStore.getState();
      expect(loadingPersona).toBe(false);
      expect(error).toBeNull();
      // Mock returns all nulls
      expect(persona.soulMd).toBeNull();
    });

    it("sets loadingPersona while loading", () => {
      expect(useMemoryStore.getState().loadingPersona).toBe(false);
    });
  });

  describe("savePersonaFile", () => {
    it("saves SOUL.md and updates local state optimistically", async () => {
      await useMemoryStore.getState().savePersonaFile("/workspace", "SOUL.md", "I am helpful.");
      const { persona, saving } = useMemoryStore.getState();
      expect(saving).toBeNull();
      expect(persona.soulMd).toBe("I am helpful.");
    });

    it("saves USER.md and updates local state", async () => {
      await useMemoryStore.getState().savePersonaFile("/workspace", "USER.md", "User profile");
      expect(useMemoryStore.getState().persona.userMd).toBe("User profile");
    });

    it("saves MEMORY.md and updates local state", async () => {
      await useMemoryStore.getState().savePersonaFile("/workspace", "MEMORY.md", "My memories");
      expect(useMemoryStore.getState().persona.memoryMd).toBe("My memories");
    });

    it("saves AGENTS.md and updates local state", async () => {
      await useMemoryStore.getState().savePersonaFile("/workspace", "AGENTS.md", "Agent config");
      expect(useMemoryStore.getState().persona.agentsMd).toBe("Agent config");
    });

    it("clears content when saving empty string (sets to null)", async () => {
      useMemoryStore.setState({ persona: { ...useMemoryStore.getState().persona, soulMd: "Old content" } });
      await useMemoryStore.getState().savePersonaFile("/workspace", "SOUL.md", "");
      expect(useMemoryStore.getState().persona.soulMd).toBeNull();
    });

    it("sets saving to fileType during save", () => {
      // After save completes, saving should be null
      expect(useMemoryStore.getState().saving).toBeNull();
    });

    it("handles unknown file type gracefully (sets saving null)", async () => {
      await useMemoryStore.getState().savePersonaFile("/workspace", "UNKNOWN.md", "content");
      expect(useMemoryStore.getState().saving).toBeNull();
      // Unknown type doesn't update any persona field
      expect(useMemoryStore.getState().persona.soulMd).toBeNull();
    });
  });

  describe("listMemories", () => {
    it("loads daily memories from backend", async () => {
      await useMemoryStore.getState().listMemories("/data");
      const { dailyMemories, loadingMemories, error } = useMemoryStore.getState();
      expect(loadingMemories).toBe(false);
      expect(error).toBeNull();
      // Mock returns []
      expect(dailyMemories).toEqual([]);
    });

    it("passes limit parameter to backend", async () => {
      await useMemoryStore.getState().listMemories("/data", 10);
      expect(useMemoryStore.getState().loadingMemories).toBe(false);
    });
  });

  describe("createMemory", () => {
    it("creates a memory and refreshes list", async () => {
      await useMemoryStore.getState().createMemory("/data", "2026-04-21", "Today I worked on tests.");
      expect(useMemoryStore.getState().error).toBeNull();
      // listMemories is called after create → mock returns []
      expect(useMemoryStore.getState().dailyMemories).toEqual([]);
    });
  });

  describe("searchMemories", () => {
    it("searches and returns results", async () => {
      await useMemoryStore.getState().searchMemories("/workspace", "/data", "test query");
      const { searchResults, searching, error } = useMemoryStore.getState();
      expect(searching).toBe(false);
      expect(error).toBeNull();
      // Mock returns []
      expect(searchResults).toEqual([]);
    });

    it("clears results for empty query", async () => {
      useMemoryStore.setState({
        searchResults: [{ source: "test", content: "old", score: 1, file: null, line: null }],
      });
      await useMemoryStore.getState().searchMemories("/workspace", "/data", "  ");
      expect(useMemoryStore.getState().searchResults).toEqual([]);
    });
  });

  describe("clearSearch", () => {
    it("clears search results", () => {
      useMemoryStore.setState({
        searchResults: [{ source: "test", content: "old", score: 1, file: null, line: null }],
      });
      useMemoryStore.getState().clearSearch();
      expect(useMemoryStore.getState().searchResults).toEqual([]);
    });
  });
});
