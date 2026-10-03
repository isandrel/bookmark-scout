/**
 * Starts an extension page: the shared providers every entrypoint wraps its page in, the root
 * element, and a tab title that follows the Language setting.
 */

import { type ReactNode, StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

/** The element each entrypoint's index.html renders into (unit-tested against the HTML files). */
export const EXTENSION_ROOT_ID = 'root';

export type ExtensionPageOptions = {
  /** Locale key of the page's name, shown after the extension name; omit for the name alone. */
  titleKey?: MessageKey;
};

/** "Bookmark Scout - Options", or the extension name alone, in the current language. */
export function getExtensionPageTitle(titleKey?: MessageKey): string {
  return titleKey ? t('page_title', [t('extName'), t(titleKey)]) : t('extName');
}

function PageTitle({ titleKey }: { titleKey?: MessageKey }) {
  // Re-runs after a language change, once settings have set the language `t()` uses.
  const { value: language, isLoading } = useSetting('language');
  useEffect(() => {
    if (!isLoading) document.title = getExtensionPageTitle(titleKey);
  }, [language, isLoading, titleKey]);
  return null;
}

/** Renders `page` into the root element inside the error boundary, theme, and language roots. */
export function mountExtensionPage(page: ReactNode, { titleKey }: ExtensionPageOptions = {}): void {
  const rootElement = document.getElementById(EXTENSION_ROOT_ID);
  if (!rootElement) throw new Error(`Missing #${EXTENSION_ROOT_ID} element`);
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <ThemeProvider storageKey={THEME_CACHE_STORAGE_KEY}>
          <LanguageRoot>
            <PageTitle titleKey={titleKey} />
            {page}
          </LanguageRoot>
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
