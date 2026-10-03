/**
 * Icons saved by Refresh Site Icons, loaded from local storage once per page and kept in sync
 * with later saves and clears, so bookmark rows never read storage themselves.
 */

import { create } from 'zustand';

type SiteIconState = {
  /** Data URL by origin. */
  byOrigin: Record<string, string>;
  /** Data URL by hostname, for bookmarks on the same host under another scheme. */
  byHost: Record<string, string>;
  count: number;
  /** Stored size in bytes (data URL characters). */
  bytes: number;
  loaded: boolean;
};

export const useSiteIconStore = create<SiteIconState>(() => ({
  byOrigin: {},
  byHost: {},
  count: 0,
  bytes: 0,
  loaded: false,
}));

function applySiteIconCache(cache: SiteIconCache) {
  const byOrigin: Record<string, string> = {};
  const byHost: Record<string, string> = {};
  // Oldest first, https last, so the newest https icon wins for a hostname.
  const entries = Object.entries(cache).sort(
    ([leftOrigin, left], [rightOrigin, right]) =>
      Number(leftOrigin.startsWith('https:')) - Number(rightOrigin.startsWith('https:')) ||
      left.fetchedAt - right.fetchedAt,
  );
  for (const [origin, entry] of entries) {
    byOrigin[origin] = entry.icon;
    byHost[new URL(origin).hostname] = entry.icon;
  }
  useSiteIconStore.setState({
    byOrigin,
    byHost,
    count: entries.length,
    bytes: siteIconCacheBytes(cache),
    loaded: true,
  });
}

let siteIconsStarted = false;

/** Loads the cache once and follows later changes for the life of the page. */
export function ensureSiteIconsLoaded(): void {
  if (siteIconsStarted) return;
  siteIconsStarted = true;
  siteIconCacheValue.observe(applySiteIconCache);
}

/**
 * The saved icon for a page: its exact origin, then the same host under the other scheme, then
 * the host with or without `www.`.
 */
export function lookupSiteIcon(
  state: Pick<SiteIconState, 'byOrigin' | 'byHost'>,
  pageUrl: string,
): string | undefined {
  const origin = getSiteIconOrigin(pageUrl);
  if (!origin) return undefined;
  const exact = state.byOrigin[origin];
  if (exact) return exact;
  const host = new URL(origin).hostname;
  const alternateHost = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
  return state.byHost[host] ?? state.byHost[alternateHost];
}
