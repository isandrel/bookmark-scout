/**
 * Starts an extension page: the shared providers every entrypoint wraps its page in, the root
 * element, and a tab title that follows the Language setting.
 */

import { type ReactNode, StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

const pageOpenConfig = readConfig(
  'ui/page-open',
  z.strictObject({ preload_wait_ms: boundedNumber({ integer: true }) }),
);

/** The element each entrypoint's index.html renders into (unit-tested against the HTML files). */
export const EXTENSION_ROOT_ID = 'root';

export type ExtensionPageOptions = {
  /** Locale key of the page's name, shown before the extension name; omit for the name alone. */
  titleKey?: MessageKey;
  /**
   * Reads to finish before the first render, so the page opens in its final layout. Started at
   * once, beside the language; the render waits for it at most `preload_wait_ms`
   * (`config/ui/page-open.toml`) and never fails because of it.
   */
  preload?: () => Promise<unknown>;
};

/**
 * "Options - Bookmark Scout", or the extension name alone, in the current language. Every tab
 * title reads most specific first; the manager adds the folder or search in front.
 */
export function getExtensionPageTitle(titleKey?: MessageKey): string {
  return titleKey ? t('page_title', [t(titleKey), t('extName')]) : t('extName');
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
 * another language first, and for the page's `preload`, up to its cap.
 */
export function mountExtensionPage(
  page: ReactNode,
  { titleKey, preload }: ExtensionPageOptions = {},
): void {
  const rootElement = document.getElementById(EXTENSION_ROOT_ID);
  if (!rootElement) throw new Error(`Missing #${EXTENSION_ROOT_ID} element`);
  const preloaded = preload ? waitAtMost(preload(), pageOpenConfig.preload_wait_ms) : undefined;
  // Reading settings selects the language; neither step rejects.
  void getSettings()
    .then(whenLanguageReady)
    .then(() => preloaded)
    .then(() => renderPage(rootElement, page, titleKey));
}

/** Settles when `work` does or after `ms`, whichever comes first, and never rejects. */
function waitAtMost(work: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    work.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      },
    );
  });
}

function renderPage(rootElement: HTMLElement, page: ReactNode, titleKey?: MessageKey): void {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <ThemeProvider storageKey={THEME_CACHE_STORAGE_KEY}>
          <LanguageRoot>
            <TooltipProvider>
              <PageTitle titleKey={titleKey} />
              {page}
            </TooltipProvider>
          </LanguageRoot>
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
