/**
 * Acting on the page the user is viewing, for a bookmark of it (Use this view as the cover, Index
 * this page's text): only on the active tab of the current window, only while that tab shows the
 * bookmarked address both before and after the work, and never in a private window, so what is
 * pictured or read always belongs to that bookmark. The click that starts it gives the toolbar
 * popup `activeTab` for that tab; elsewhere the browser refuses and the work reports `denied`.
 */

/** Why the active tab was not used. */
export type ActiveTabError = 'changed' | 'private' | 'denied';

/** The active tab, with the id every tab the browser shows has. */
export type ActiveTab = Browser.tabs.Tab & { id: number };

/**
 * Runs `work` on the active tab while it shows `url`: `changed` when it shows another address
 * before or after, `private` in a private window, and `denied` when `work` throws (the browser
 * did not allow it).
 */
export async function withActiveTabAt<T>(
  url: string,
  work: (tab: ActiveTab) => Promise<T>,
): Promise<{ value: T } | { error: ActiveTabError }> {
  const activeTab = async () =>
    (await browser.tabs.query({ active: true, currentWindow: true }))[0];
  const tab = await activeTab();
  if (tab?.id === undefined || tab.url !== url) return { error: 'changed' };
  if (tab.incognito) return { error: 'private' };
  let value: T;
  try {
    value = await work({ ...tab, id: tab.id });
  } catch {
    return { error: 'denied' };
  }
  const after = await activeTab();
  if (after?.id !== tab.id || after.url !== url) return { error: 'changed' };
  return { value };
}
