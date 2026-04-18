import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import en, { type I18nKey } from "./en";
import zh from "./zh";

type Locale = "en" | "zh";

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: I18nKey) => string;
}

const translations: Record<Locale, Record<string, string>> = { en, zh };

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("zh");

  const t = useCallback(
    (key: I18nKey) => {
      return translations[locale][key] ?? translations.en[key as keyof typeof en] ?? key;
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
