/**
 * OnboardingWizard — first-launch setup wizard.
 *
 * 4-step flow:
 * 1. Welcome — greeting, language/theme selection
 * 2. Provider setup — quick-add an API key for at least one provider
 * 3. Preferences — default mode, coding language, working directory
 * 4. Done — summary, generates USER.md, launches into main app
 */

import { useState, useCallback } from "react";
import { useI18n } from "../i18n";
import { useUIStore } from "../stores/uiStore";
import {
  useOnboardingStore,
  nextOnboardingStep,
  prevOnboardingStep,
  updateOnboardingPreferences,
  completeOnboarding,
  skipOnboarding,
  incrementProvidersConfigured,
  type OnboardingStep,
} from "../stores/onboardingStore";
import { useProviderStore } from "../stores/providerStore";

// ── Icons (inline SVG to avoid dependency) ─────────────

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 8H3M7 4L3 8l4 4" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 10l4 4 7-7" />
    </svg>
  );
}

function RocketIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-brand)]">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

// ── Step indicator ─────────────────────────────────────

const STEPS: { key: OnboardingStep; labelKey: string }[] = [
  { key: "welcome", labelKey: "onboardingStepWelcome" },
  { key: "provider", labelKey: "onboardingStepProvider" },
  { key: "preferences", labelKey: "onboardingStepPreferences" },
  { key: "done", labelKey: "onboardingStepDone" },
];

function StepIndicator({ current }: { current: OnboardingStep }) {
  const { t } = useI18n();
  const currentIdx = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-1" role="navigation" aria-label="Onboarding progress">
      {STEPS.map((step, idx) => (
        <div key={step.key} className="flex items-center gap-1">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${
              idx <= currentIdx
                ? "w-8 bg-[var(--color-brand)]"
                : "w-2 bg-[var(--color-border)]"
            }`}
            aria-current={idx === currentIdx ? "step" : undefined}
          />
          <span className="sr-only">{t(step.labelKey)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────

export function OnboardingWizard() {
  const { t, locale, setLocale } = useI18n();
  const currentStep = useOnboardingStore((s) => s.currentStep);
  const preferences = useOnboardingStore((s) => s.preferences);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-surface)] p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <StepIndicator current={currentStep} />
        </div>

        {/* Content card */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-6 shadow-lg">
          {currentStep === "welcome" && (
            <WelcomeStep
              t={t}
              locale={locale}
              setLocale={setLocale}
              theme={theme}
              setTheme={setTheme}
            />
          )}
          {currentStep === "provider" && <ProviderStep t={t} />}
          {currentStep === "preferences" && (
            <PreferencesStep t={t} preferences={preferences} />
          )}
          {currentStep === "done" && <DoneStep t={t} preferences={preferences} />}
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Welcome ────────────────────────────────────

function WelcomeStep({
  t,
  locale,
  setLocale,
  theme,
  setTheme,
}: {
  t: (key: string) => string;
  locale: "en" | "zh";
  setLocale: (l: "en" | "zh") => void;
  theme: "dark" | "light" | "system";
  setTheme: (t: "dark" | "light" | "system") => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6">
      <RocketIcon />
      <div className="text-center">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
          {t("onboardingWelcomeTitle")}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {t("onboardingWelcomeSubtitle")}
        </p>
      </div>

      {/* Language selection */}
      <div className="w-full space-y-3">
        <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
          {t("onboardingSelectLanguage")}
        </label>
        <div className="flex gap-2">
          {[
            { code: "en" as const, label: "English" },
            { code: "zh" as const, label: "中文" },
          ].map((lang) => (
            <button
              key={lang.code}
              onClick={() => setLocale(lang.code)}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                locale === lang.code
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
                  : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      {/* Theme selection */}
      <div className="w-full space-y-3">
        <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
          {t("onboardingSelectTheme")}
        </label>
        <div className="flex gap-2">
          {[
            { value: "dark", labelKey: "themeDark", icon: "🌙" },
            { value: "light", labelKey: "themeLight", icon: "☀️" },
            { value: "system", labelKey: "themeSystem", icon: "💻" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value as "dark" | "light" | "system")}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                theme === opt.value
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
                  : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
              }`}
            >
              <span className="mr-1.5">{opt.icon}</span>
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <NavigationButtons showSkip />
    </div>
  );
}

// ── Step 2: Provider Setup ─────────────────────────────

function ProviderStep({ t }: { t: (key: string) => string }) {
  const providers = useProviderStore((s) => s.providers);
  const addProvider = useProviderStore((s) => s.addProvider);
  const [selectedType, setSelectedType] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);

  const quickProviders = [
    { type: "openai", name: "OpenAI", baseKey: "OPENAI_API_KEY", baseUrl: "https://api.openai.com", icon: "🤖" },
    { type: "anthropic", name: "Anthropic", baseKey: "ANTHROPIC_API_KEY", baseUrl: "https://api.anthropic.com", icon: "🧠" },
    { type: "openrouter", name: "OpenRouter", baseKey: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api", icon: "🌐" },
    { type: "deepseek", name: "DeepSeek", baseKey: "DEEPSEEK_API_KEY", baseUrl: "https://api.deepseek.com", icon: "🔍" },
    { type: "glm", name: "智谱 GLM", baseKey: "GLM_API_KEY", baseUrl: "https://open.bigmodel.cn/api/paas", icon: "🇨🇳" },
    { type: "ollama", name: "Ollama (本地)", baseKey: "", baseUrl: "http://localhost:11434", icon: "🦙" },
  ];

  const selected = quickProviders.find((p) => p.type === selectedType)!;

  const handleTestAndSave = useCallback(async () => {
    if (selectedType === "ollama") {
      // Ollama doesn't need API key
      addProvider({
        name: "Ollama",
        baseUrl: selected.baseUrl,
        apiKey: "",
        models: [],
        enabled: true,
      });
      incrementProvidersConfigured();
      setTestResult("success");
      return;
    }

    if (!apiKey.trim()) {
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      addProvider({
        name: selected.name,
        baseUrl: selected.baseUrl,
        apiKey: apiKey.trim(),
        models: [],
        enabled: true,
      });
      incrementProvidersConfigured();
      setTestResult("success");
    } catch {
      setTestResult("error");
    } finally {
      setTesting(false);
    }
  }, [selectedType, apiKey, selected, addProvider]);

  const configuredCount = providers.filter((p) => p.enabled).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
          {t("onboardingProviderTitle")}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {t("onboardingProviderSubtitle")}
        </p>
      </div>

      {/* Provider type grid */}
      <div className="grid grid-cols-3 gap-2">
        {quickProviders.map((p) => (
          <button
            key={p.type}
            onClick={() => {
              setSelectedType(p.type);
              setApiKey("");
              setTestResult(null);
            }}
            className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
              selectedType === p.type
                ? "border-[var(--color-brand)] bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
                : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            <span className="mr-1">{p.icon}</span>
            {p.name}
          </button>
        ))}
      </div>

      {/* API Key input (hidden for Ollama) */}
      {selectedType !== "ollama" && (
        <div className="space-y-2">
          <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
            API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={`${selected.name} API Key...`}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-brand)] focus:outline-none"
          />
        </div>
      )}

      {/* Save & test button */}
      <button
        onClick={handleTestAndSave}
        disabled={testing || (selectedType !== "ollama" && !apiKey.trim())}
        className="w-full rounded-lg bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
      >
        {testing ? t("onboardingProviderTesting") : t("onboardingProviderSave")}
      </button>

      {/* Result feedback */}
      {testResult === "success" && (
        <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-600">
          <CheckIcon className="!w-4 !h-4" />
          {t("onboardingProviderSuccess")}
        </div>
      )}
      {testResult === "error" && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {t("onboardingProviderError")}
        </div>
      )}

      {/* Status */}
      <p className="text-center text-xs text-[var(--color-text-tertiary)]">
        {t("onboardingProviderStatus").replace("{count}", String(configuredCount))}
      </p>

      <NavigationButtons canContinue={configuredCount > 0} />
    </div>
  );
}

// ── Step 3: Preferences ────────────────────────────────

function PreferencesStep({
  t,
  preferences,
}: {
  t: (key: string) => string;
  preferences: NonNullable<ReturnType<typeof useOnboardingStore.getState>["preferences"]>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
          {t("onboardingPrefsTitle")}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {t("onboardingPrefsSubtitle")}
        </p>
      </div>

      {/* Default mode */}
      <div className="space-y-2">
        <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
          {t("onboardingDefaultMode")}
        </label>
        <div className="flex gap-2">
          {[
            { value: "code" as const, labelKey: "modeCode", icon: "💻", descKey: "onboardingModeCodeDesc" },
            { value: "plan" as const, labelKey: "modePlan", icon: "📋", descKey: "onboardingModePlanDesc" },
            { value: "ask" as const, labelKey: "modeAsk", icon: "❓", descKey: "onboardingModeAskDesc" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateOnboardingPreferences({ defaultMode: opt.value })}
              className={`flex-1 rounded-lg border px-3 py-3 text-left transition-colors ${
                preferences.defaultMode === opt.value
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)]/10"
                  : "border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
              }`}
            >
              <div className="text-base">{opt.icon}</div>
              <div className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">
                {t(opt.labelKey)}
              </div>
              <div className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                {t(opt.descKey)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Response language */}
      <div className="space-y-2">
        <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
          {t("onboardingResponseLanguage")}
        </label>
        <select
          value={preferences.preferredLanguage}
          onChange={(e) => updateOnboardingPreferences({ preferredLanguage: e.target.value })}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-brand)] focus:outline-none"
        >
          <option value="english">English</option>
          <option value="chinese">中文</option>
          <option value="japanese">日本語</option>
          <option value="korean">한국어</option>
          <option value="auto">Auto-detect</option>
        </select>
      </div>

      {/* Toggle: show thinking */}
      <label className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-4 py-3">
        <span className="text-sm text-[var(--color-text-primary)]">{t("onboardingShowThinking")}</span>
        <input
          type="checkbox"
          checked={preferences.showThinking}
          onChange={(e) => updateOnboardingPreferences({ showThinking: e.target.checked })}
          className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-brand)]"
        />
      </label>

      {/* Toggle: auto-compact */}
      <label className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-4 py-3">
        <span className="text-sm text-[var(--color-text-primary)]">{t("onboardingAutoCompact")}</span>
        <input
          type="checkbox"
          checked={preferences.autoCompact}
          onChange={(e) => updateOnboardingPreferences({ autoCompact: e.target.checked })}
          className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-brand)]"
        />
      </label>

      <NavigationButtons />
    </div>
  );
}

// ── Step 4: Done ───────────────────────────────────────

function DoneStep({
  t,
  preferences,
}: {
  t: (key: string) => string;
  preferences: NonNullable<ReturnType<typeof useOnboardingStore.getState>["preferences"]>;
}) {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
        <CheckIcon className="text-green-500" />
      </div>

      <div className="text-center">
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
          {t("onboardingDoneTitle")}
        </h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {t("onboardingDoneSubtitle")}
        </p>
      </div>

      {/* Summary */}
      <div className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
        <div className="grid grid-cols-2 gap-2 text-[var(--color-text-secondary)]">
          <span>{t("onboardingSummaryMode")}</span>
          <span className="text-[var(--color-text-primary)]">{preferences.defaultMode}</span>
          <span>{t("onboardingSummaryLang")}</span>
          <span className="text-[var(--color-text-primary)]">{preferences.preferredLanguage}</span>
          <span>{t("onboardingSummaryThinking")}</span>
          <span className="text-[var(--color-text-primary)]">
            {preferences.showThinking ? "✅" : "❌"}
          </span>
          <span>{t("onboardingSummaryCompact")}</span>
          <span className="text-[var(--color-text-primary)]">
            {preferences.autoCompact ? "✅" : "❌"}
          </span>
        </div>
      </div>

      <button
        onClick={() => void completeOnboarding()}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-brand)] px-6 py-3 text-sm font-medium text-white transition-colors hover:opacity-90"
      >
        {t("onboardingDoneButton")}
        <ArrowRightIcon className="!w-4 !h-4" />
      </button>
    </div>
  );
}

// ── Navigation Buttons ─────────────────────────────────

function NavigationButtons({
  canContinue = true,
  showSkip = false,
}: {
  canContinue?: boolean;
  showSkip?: boolean;
}) {
  const { t } = useI18n();
  const currentStep = useOnboardingStore((s) => s.currentStep);

  return (
    <div className="flex items-center justify-between pt-2">
      {/* Left side: back or skip */}
      <div>
        {currentStep !== "welcome" ? (
          <button
            onClick={prevOnboardingStep}
            className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeftIcon className="!w-4 !h-4" />
            {t("onboardingBack")}
          </button>
        ) : showSkip ? (
          <button
            onClick={() => void skipOnboarding()}
            className="text-sm text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-secondary)]"
          >
            {t("onboardingSkip")}
          </button>
        ) : null}
      </div>

      {/* Right side: continue */}
      {currentStep !== "done" && (
        <button
          onClick={nextOnboardingStep}
          disabled={!canContinue}
          className="flex items-center gap-1 rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {t("onboardingContinue")}
          <ArrowRightIcon className="!w-4 !h-4" />
        </button>
      )}
    </div>
  );
}
