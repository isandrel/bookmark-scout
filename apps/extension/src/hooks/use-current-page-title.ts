import { useEffect, useState } from 'react';

/** The page the popup or side panel would save. */
export type CurrentPage = { title: string; url: string };

/** The page last read on this page, so a component mounted after a read starts with it. */
let lastPage: CurrentPage | null = null;

/** The active tab's page, or null when it is unknown or unreadable. */
async function readCurrentPage(): Promise<CurrentPage | null> {
  const [tab] = (await browser.tabs?.query({ active: true, currentWindow: true })) ?? [];
  lastPage = tab?.url && tab.title ? { title: tab.title, url: tab.url } : null;
  return lastPage;
}

/**
 * Reads the current page before a page's first render (`mountExtensionPage`'s `preload`), so the
 * lines naming it show on the first frame instead of pushing the tree down a moment later.
 */
export function preloadCurrentPage(): Promise<CurrentPage | null> {
  return readCurrentPage().catch(() => null);
}

/**
 * The page the popup or side panel would save, or null while it is unknown. It never
 * asks for a permission: the toolbar popup can read the active tab through activeTab, while the
 * side panel reads it only once `tabs` is granted, and shows nothing until then. Follows the
 * active tab in the side panel, which stays open while the user browses.
 */
export function useCurrentPage(): CurrentPage | null {
  const [page, setPage] = useState<CurrentPage | null>(() => lastPage);

  useEffect(() => {
    let active = true;
    const read = () => {
      readCurrentPage()
        .then((next) => {
          if (!active) return;
          setPage((current) =>
            current?.title === next?.title && current?.url === next?.url ? current : next,
          );
        })
        .catch(() => {
          if (active) setPage(null);
        });
    };
    const onUpdated = (_tabId: number, change: Browser.tabs.OnUpdatedInfo) => {
      if (change.title !== undefined || change.status === 'complete') read();
    };
    read();
    browser.tabs?.onActivated.addListener(read);
    browser.tabs?.onUpdated.addListener(onUpdated);
    window.addEventListener('focus', read);
    return () => {
      active = false;
      browser.tabs?.onActivated.removeListener(read);
      browser.tabs?.onUpdated.removeListener(onUpdated);
      window.removeEventListener('focus', read);
    };
  }, []);

  return page;
}
