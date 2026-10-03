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
  // Re-runs once a newly selected language is applied to `t()`.
  const language = useLanguage();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `language` re-runs it; `t()` reads it.
  useEffect(() => {
    document.title = getExtensionPageTitle(titleKey);
  }, [language, titleKey]);
  return null;
}

/**
 * Renders `page` into the root element inside the error boundary, theme, and language roots.
 * The first render waits for the Language setting and its messages, so the page never paints in
 * another language first.
 */
export function mountExtensionPage(page: ReactNode, { titleKey }: ExtensionPageOptions = {}): void {
  const rootElement = document.getElementById(EXTENSION_ROOT_ID);
  if (!rootElement) throw new Error(`Missing #${EXTENSION_ROOT_ID} element`);
  // Reading settings selects the language; neither step rejects.
  void getSettings()
    .then(whenLanguageReady)
    .then(() => renderPage(rootElement, page, titleKey));
}

function renderPage(rootElement: HTMLElement, page: ReactNode, titleKey?: MessageKey): void {
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
