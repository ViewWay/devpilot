import { type ReactNode } from "react";
import { render } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { BrowserRouter } from "react-router-dom";

/**
 * Wraps components with required providers for testing.
 */
export function renderWithProviders(ui: ReactNode) {
  return render(
    <BrowserRouter>
      <I18nProvider>{ui}</I18nProvider>
    </BrowserRouter>,
  );
}
