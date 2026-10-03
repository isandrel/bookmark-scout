import { useEffect } from 'react';

/**
 * The icon URL for a bookmark (see `getSiteIconUrl`): a saved site icon for its origin first,
 * then the browser's icon cache while that setting is on and its permission granted, else null.
 * Reads the shared in-memory cache, never storage.
 */
export function useSiteIconUrl(pageUrl: string, size = 16): string | null {
  useEffect(() => {
    ensureSiteIconsLoaded();
  }, []);
  const cachedIcon = useSiteIconStore((state) => lookupSiteIcon(state, pageUrl));
  const useBrowserCache = useEffectiveSetting('browserIconCache');
  return getSiteIconUrl(pageUrl, size, cachedIcon, useBrowserCache);
}

/** Number and stored size of the saved site icons. */
export function useSiteIconCacheSummary(): { count: number; bytes: number } {
  useEffect(() => {
    ensureSiteIconsLoaded();
  }, []);
  const count = useSiteIconStore((state) => state.count);
  const bytes = useSiteIconStore((state) => state.bytes);
  return { count, bytes };
}
