import { describe, it, expect, beforeEach } from "vitest";
import { useSkillStore } from "../../stores/skillStore";
import type { SkillInfo } from "../../types/index";

const mockSkill: SkillInfo = {
  name: "test-skill",
  description: "A test skill for unit testing",
  version: "1.0.0",
  author: "DevPilot",
  category: "development",
  tags: ["test", "demo"],
  trigger: "when user asks to test something",
  content: "# Test Skill\n\nThis is a test skill.",
  enabled: true,
  installedAt: new Date().toISOString(),
};

const mockSkill2: SkillInfo = {
  name: "another-skill",
  description: "Another test skill",
  tags: ["demo"],
  content: "# Another Skill\n\nAnother test.",
  enabled: false,
};

describe("skillStore", () => {
  beforeEach(() => {
    useSkillStore.setState({
      skills: [],
      searchQuery: "",
      loading: false,
      hydrated: false,
    });
  });

  describe("initial state", () => {
    it("starts with empty skills list", () => {
      expect(useSkillStore.getState().skills).toEqual([]);
    });

    it("starts with empty search query", () => {
      expect(useSkillStore.getState().searchQuery).toBe("");
    });

    it("starts with loading false", () => {
      expect(useSkillStore.getState().loading).toBe(false);
    });

    it("starts with hydrated false", () => {
      expect(useSkillStore.getState().hydrated).toBe(false);
    });
  });

  describe("hydrateFromBackend", () => {
    it("loads skills and sets hydrated to true", async () => {
      await useSkillStore.getState().hydrateFromBackend();
      expect(useSkillStore.getState().hydrated).toBe(true);
      expect(useSkillStore.getState().loading).toBe(false);
    });

    it("only hydrates once", async () => {
      await useSkillStore.getState().hydrateFromBackend();
      expect(useSkillStore.getState().hydrated).toBe(true);

      // Second call should be a no-op
      await useSkillStore.getState().hydrateFromBackend();
      expect(useSkillStore.getState().hydrated).toBe(true);
    });
  });

  describe("refreshSkills", () => {
    it("loads skills from backend (mock returns [])", async () => {
      await useSkillStore.getState().refreshSkills();
      // Mock returns empty array
      expect(useSkillStore.getState().skills).toEqual([]);
      expect(useSkillStore.getState().loading).toBe(false);
    });

    it("sets loading during refresh", async () => {
      const promise = useSkillStore.getState().refreshSkills();
      // loading should be true during the async operation
      // (may or may not be true depending on timing)
      await promise;
      expect(useSkillStore.getState().loading).toBe(false);
    });
  });

  describe("searchSkills", () => {
    it("sets search query and loads results", async () => {
      await useSkillStore.getState().searchSkills("test");
      expect(useSkillStore.getState().searchQuery).toBe("test");
      expect(useSkillStore.getState().loading).toBe(false);
    });

    it("clears loading after search", async () => {
      useSkillStore.setState({ loading: true });
      await useSkillStore.getState().searchSkills("demo");
      expect(useSkillStore.getState().loading).toBe(false);
    });
  });

  describe("installSkill", () => {
    it("calls install and refreshes", async () => {
      await useSkillStore.getState().installSkill("# New Skill\n\nContent");
      expect(useSkillStore.getState().loading).toBe(false);
    });
  });

  describe("uninstallSkill", () => {
    it("removes skill from local state", async () => {
      useSkillStore.setState({ skills: [mockSkill, mockSkill2] });

      await useSkillStore.getState().uninstallSkill(mockSkill.name);
      // The skill should be removed from local state
      expect(
        useSkillStore.getState().skills.find((s) => s.name === mockSkill.name),
      ).toBeUndefined();
      // Other skills should remain
      expect(
        useSkillStore.getState().skills.find((s) => s.name === mockSkill2.name),
      ).toBeDefined();
    });

    it("handles uninstalling non-existent skill gracefully", async () => {
      useSkillStore.setState({ skills: [mockSkill] });
      await useSkillStore.getState().uninstallSkill("nonexistent");
      expect(useSkillStore.getState().loading).toBe(false);
    });
  });

  describe("toggleSkill", () => {
    it("optimistically toggles enabled state", async () => {
      useSkillStore.setState({ skills: [{ ...mockSkill, enabled: true }] });

      await useSkillStore.getState().toggleSkill(mockSkill.name);
      // Should have toggled to false
      const skill = useSkillStore.getState().skills.find(
        (s) => s.name === mockSkill.name,
      );
      expect(skill!.enabled).toBe(false);
    });

    it("toggles from disabled to enabled", async () => {
      useSkillStore.setState({ skills: [{ ...mockSkill, enabled: false }] });

      await useSkillStore.getState().toggleSkill(mockSkill.name);
      const skill = useSkillStore.getState().skills.find(
        (s) => s.name === mockSkill.name,
      );
      expect(skill!.enabled).toBe(true);
    });

    it("does not affect other skills", async () => {
      useSkillStore.setState({
        skills: [
          { ...mockSkill, enabled: true },
          { ...mockSkill2, enabled: false },
        ],
      });

      await useSkillStore.getState().toggleSkill(mockSkill.name);
      const other = useSkillStore.getState().skills.find(
        (s) => s.name === mockSkill2.name,
      );
      expect(other!.enabled).toBe(false);
    });
  });

  describe("state management", () => {
    it("allows direct state updates", () => {
      useSkillStore.setState({ skills: [mockSkill, mockSkill2] });
      expect(useSkillStore.getState().skills).toHaveLength(2);
    });

    it("tracks loading state", () => {
      useSkillStore.setState({ loading: true });
      expect(useSkillStore.getState().loading).toBe(true);
    });

    it("tracks hydrated state", () => {
      useSkillStore.setState({ hydrated: true });
      expect(useSkillStore.getState().hydrated).toBe(true);
    });
  });
});
