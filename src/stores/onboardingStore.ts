/**
 * Onboarding store — manages the first-launch setup wizard state.
 *
 * The onboarding flow has 4 steps:
 * 1. Welcome — language & theme selection
 * 2. Provider setup — add at least one LLM provider API key
 * 3. Preferences — coding style, default mode, working directory
 * 4. Done — generates initial USER.md persona file
 *
 * Completion state is persisted via the settings backend (key: "onboarding.completed").
 */

import { create } from "zustand";
import { invoke } from "../lib/ipc";
import { reportError } from "../lib/errors";

// ── Types ──────────────────────────────────────────────

export type OnboardingStep = "welcome" | "provider" | "preferences" | "done";

export interface OnboardingPreferences {
  /** User's preferred coding language for responses. */
  preferredLanguage: string;
  /** Default interaction mode. */
  defaultMode: "code" | "plan" | "ask";
  /** Whether to show thinking blocks by default. */
  showThinking: boolean;
  /** Whether to enable auto-compact when context gets long. */
  autoCompact: boolean;
  /** Default working directory (empty = current directory). */
  defaultWorkingDir: string;
}

export interface OnboardingState {
  /** Whether onboarding has been completed previously. */
  completed: boolean;
  /** Whether we're currently checking/loading onboarding state. */
  loading: boolean;
  /** Current step in the onboarding flow. */
  currentStep: OnboardingStep;
  /** User preferences collected during onboarding. */
  preferences: OnboardingPreferences;
  /** Number of providers configured during onboarding. */
  providersConfigured: number;
}

// ── Store ──────────────────────────────────────────────

export const useOnboardingStore = create<OnboardingState>()(() => ({
  completed: false,
  loading: true,
  currentStep: "welcome",
  preferences: {
    preferredLanguage: "english",
    defaultMode: "code",
    showThinking: false,
    autoCompact: true,
    defaultWorkingDir: "",
  },
  providersConfigured: 0,
}));

// ── Actions ────────────────────────────────────────────

/** Check if onboarding has been completed (call on app startup). */
export async function checkOnboardingStatus(): Promise<void> {
  try {
    const result = await invoke<{ key: string; value: string } | null>(
      "get_setting",
      { key: "onboarding.completed" },
    );
    useOnboardingStore.setState({
      completed: result?.value === "true",
      loading: false,
    });
  } catch {
    // If get_setting fails (e.g., no backend), assume not completed
    useOnboardingStore.setState({ loading: false });
  }
}

/** Move to the next onboarding step. */
export function nextOnboardingStep(): void {
  const steps: OnboardingStep[] = ["welcome", "provider", "preferences", "done"];
  const { currentStep } = useOnboardingStore.getState();
  const idx = steps.indexOf(currentStep);
  if (idx < steps.length - 1) {
    useOnboardingStore.setState({ currentStep: steps[idx + 1] });
  }
}

/** Move to the previous onboarding step. */
export function prevOnboardingStep(): void {
  const steps: OnboardingStep[] = ["welcome", "provider", "preferences", "done"];
  const { currentStep } = useOnboardingStore.getState();
  const idx = steps.indexOf(currentStep);
  if (idx > 0) {
    useOnboardingStore.setState({ currentStep: steps[idx - 1] });
  }
}

/** Update onboarding preferences. */
export function updateOnboardingPreferences(
  partial: Partial<OnboardingPreferences>,
): void {
  const { preferences } = useOnboardingStore.getState();
  useOnboardingStore.setState({ preferences: { ...preferences, ...partial } });
}

/** Mark that a provider was configured during onboarding. */
export function incrementProvidersConfigured(): void {
  const { providersConfigured } = useOnboardingStore.getState();
  useOnboardingStore.setState({ providersConfigured: providersConfigured + 1 });
}

/** Complete onboarding and persist the state. */
export async function completeOnboarding(): Promise<void> {
  try {
    await invoke("set_setting", {
      key: "onboarding.completed",
      value: "true",
    });

    // Save preferences as settings
    const { preferences } = useOnboardingStore.getState();
    await invoke("set_setting", {
      key: "preferences.defaultMode",
      value: preferences.defaultMode,
    });
    await invoke("set_setting", {
      key: "preferences.showThinking",
      value: String(preferences.showThinking),
    });
    await invoke("set_setting", {
      key: "preferences.autoCompact",
      value: String(preferences.autoCompact),
    });
    if (preferences.defaultWorkingDir) {
      await invoke("set_setting", {
        key: "preferences.defaultWorkingDir",
        value: preferences.defaultWorkingDir,
      });
    }

    // Generate USER.md persona content from preferences
    const userMd = generateUserMd(preferences);
    await invoke("save_persona_file", {
      fileType: "USER",
      content: userMd,
    });

    useOnboardingStore.setState({ completed: true });
  } catch (err) {
    reportError(err, "onboarding.complete");
    // Still mark as completed in local state even if persistence fails
    useOnboardingStore.setState({ completed: true });
  }
}

/** Skip onboarding entirely. */
export async function skipOnboarding(): Promise<void> {
  try {
    await invoke("set_setting", { key: "onboarding.completed", value: "true" });
  } catch {
    // Ignore persistence errors
  }
  useOnboardingStore.setState({ completed: true });
}

// ── Helpers ────────────────────────────────────────────

function generateUserMd(prefs: OnboardingPreferences): string {
  const lines: string[] = [
    "# User Profile",
    "",
    "This file was auto-generated during onboarding.",
    "Edit it anytime in Settings → Persona & Memory.",
    "",
    "## Preferences",
    "",
    `- Response language: ${prefs.preferredLanguage}`,
    `- Default mode: ${prefs.defaultMode}`,
    `- Show thinking: ${prefs.showThinking ? "yes" : "no"}`,
    `- Auto-compact: ${prefs.autoCompact ? "yes" : "no"}`,
    "",
  ];
  if (prefs.defaultWorkingDir) {
    lines.push(`- Default working directory: \`${prefs.defaultWorkingDir}\``, "");
  }
  lines.push("## Notes", "", "<!-- Add your personal preferences, coding style, and context here -->");
  return lines.join("\n");
}
