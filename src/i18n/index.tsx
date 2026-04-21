import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import en, { type TranslationKey } from "./en";
import zh from "./zh";

export type Locale = "en" | "zh";

type TranslateFn = (key: TranslationKey | string, params?: Record<string, string | number>) => string;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {throw new Error("useI18n must be used within I18nProvider");}
  return ctx;
}

const translations: Record<Locale, Record<string, string>> = { en: en as unknown as Record<string, string>, zh: zh as unknown as Record<string, string> };

/**
 * Translate a key with optional interpolation params.
 * Falls back to the key itself if no translation is found.
 *
 * @example
 * translate("en", "claudeImportSuccess", { count: 3, messages: 42 })
 * // => "Successfully imported 3 thread(s) with 42 messages."
 */
function translate(
  locale: Locale,
  key: TranslationKey | string,
  params?: Record<string, string | number>,
): string {
  let text = translations[locale]?.[key] ?? translations.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(
    (localStorage.getItem("devpilot-locale") as Locale) ?? "en",
  );

  const handleSetLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem("devpilot-locale", newLocale);
  }, []);

  const t: TranslateFn = useCallback(
    (key: TranslationKey | string, params?: Record<string, string | number>): string => {
      return translate(locale, key, params);
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale: handleSetLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

/**
 * Get a translation outside of React (e.g. in stores or utilities).
 * Reads the current locale from localStorage.
 *
 * @example
 * getTranslation("diagnosticDuration", { ms: 150 })
 * // => "Completed in 150ms"
 */
export function getTranslation(
  key: TranslationKey | string,
  params?: Record<string, string | number>,
): string {
  const locale = (localStorage.getItem("devpilot-locale") as Locale) ?? "en";
  return translate(locale, key, params);
}

export type { TranslationKey };
