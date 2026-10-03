/**
 * Site icons downloaded by the Refresh Site Icons tool, keyed by origin
 * (`https://www.example.com`). They stay in local storage on this device and are never synced.
 * The total size is capped by the `siteIconsMaxCacheKb` setting; the oldest icons go first.
 */

export type SiteIconEntry = {
  /** A base64 `data:image/...` URL. */
  icon: string;
  /** When the icon was downloaded (ms since the epoch). */
  fetchedAt: number;
};

export type SiteIconCache = Record<string, SiteIconEntry>;

/** Raster and SVG icon types the refresh stores; anything else in storage is dropped on read. */
const SITE_ICON_DATA_URL_PATTERN =
  /^data:image\/(?:png|x-icon|gif|jpeg|webp|bmp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;

export function isSiteIconDataUrl(value: unknown): value is string {
  return typeof value === 'string' && SITE_ICON_DATA_URL_PATTERN.test(value);
}

/** The cache key for a page URL: its origin, or null for non-web URLs. */
export function getSiteIconOrigin(pageUrl: string | undefined): string | null {
  if (!pageUrl) return null;
  try {
    const url = new URL(pageUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** Stored size of the cache, counted as the length of the data URLs (one byte per character). */
export function siteIconCacheBytes(cache: SiteIconCache): number {
  return Object.values(cache).reduce((total, entry) => total + entry.icon.length, 0);
}

/**
 * Drops the oldest icons until the cache fits in `maxBytes`. Returns the kept cache and the
 * evicted origins. An icon larger than the whole budget is never kept.
 */
export function fitSiteIconCache(
  cache: SiteIconCache,
  maxBytes: number,
): { cache: SiteIconCache; evicted: string[] } {
  const newestFirst = Object.entries(cache).sort(
    ([leftOrigin, left], [rightOrigin, right]) =>
      right.fetchedAt - left.fetchedAt || leftOrigin.localeCompare(rightOrigin),
  );
  const kept: SiteIconCache = {};
  const evicted: string[] = [];
  let total = 0;
  for (const [origin, entry] of newestFirst) {
    if (total + entry.icon.length <= maxBytes) {
      kept[origin] = entry;
      total += entry.icon.length;
    } else {
      evicted.push(origin);
    }
  }
  return { cache: kept, evicted };
}

export function normalizeSiteIconCache(raw: unknown): SiteIconCache {
  if (!isPlainObject(raw)) return {};
  const cache: SiteIconCache = {};
  for (const [origin, value] of Object.entries(raw)) {
    if (getSiteIconOrigin(origin) !== origin) continue;
    if (typeof value !== 'object' || value === null) continue;
    const { icon, fetchedAt } = value as Record<string, unknown>;
    if (!isSiteIconDataUrl(icon) || typeof fetchedAt !== 'number' || !Number.isFinite(fetchedAt)) {
      continue;
    }
    cache[origin] = { icon, fetchedAt };
  }
  return cache;
}

/** Valid entries only; an empty cache removes the key. */
export const siteIconCacheValue = defineStoredValue<SiteIconCache>({
  key: STORAGE_KEYS.siteIcons,
  parse: normalizeSiteIconCache,
  empty: {},
  isEmpty: (cache) => Object.keys(cache).length === 0,
});

export function getSiteIconCache(): Promise<SiteIconCache> {
  return siteIconCacheValue.get();
}

export type SiteIconSaveResult = {
  saved: number;
  /** Older icons removed to stay within the cache limit (including any that did not fit). */
  evicted: number;
};

/** Stores icons by origin with the current time, then trims the cache to `maxCacheBytes`. */
export async function saveSiteIcons(
  icons: Record<string, string>,
  options: { maxCacheBytes: number; now?: number },
): Promise<SiteIconSaveResult> {
  const fetchedAt = options.now ?? Date.now();
  const savedOrigins = Object.entries(icons)
    .filter(([origin, icon]) => getSiteIconOrigin(origin) === origin && isSiteIconDataUrl(icon))
    .map(([origin]) => origin);
  let evicted = 0;
  const stored = await siteIconCacheValue.update((current) => {
    const cache = { ...current };
    for (const origin of savedOrigins) cache[origin] = { icon: icons[origin], fetchedAt };
    const fitted = fitSiteIconCache(cache, options.maxCacheBytes);
    evicted = fitted.evicted.length;
    return fitted.cache;
  });
  return { saved: savedOrigins.filter((origin) => origin in stored).length, evicted };
}

export function clearSiteIconCache(): Promise<void> {
  return siteIconCacheValue.clear();
}
