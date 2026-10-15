import { useEffect, useState } from 'react';

/**
 * The title of the page the popup or side panel would save, or null while it is unknown. It never
 * asks for a permission: the toolbar popup can read the active tab through activeTab, while the
 * side panel reads it only once `tabs` is granted, and shows nothing until then. Follows the
 * active tab in the side panel, which stays open while the user browses.
 */
export function useCurrentPageTitle(): string | null {
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const read = () => {
      browser.tabs
        ?.query({ active: true, currentWindow: true })
        .then(([tab]) => {
          if (active) setTitle(tab?.url && tab.title ? tab.title : null);
        })
        .catch(() => {
          if (active) setTitle(null);
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

  return title;
}
