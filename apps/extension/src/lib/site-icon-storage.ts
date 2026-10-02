/**
 * Site icons downloaded by the Refresh Site Icons tool, keyed by origin
 * (`https://www.example.com`). They stay in local storage on this device and are never synced.
 * The total size is capped by the `siteIconsMaxCacheKb` setting; the oldest icons go first.
 */

export const SITE_ICON_STORAGE_KEY = 'bookmark-scout-site-icons';

export type SiteIconEntry = {
  /** A base64 `data:image/...` URL. */
  icon: string;
  /** When the icon was downloaded (ms since the epoch). */
  fetchedAt: number;
};

export type SiteIconCache = Record<string, SiteIconEntry>;

export const siteIconCacheItem = storage.defineItem<SiteIconCache>(`local:${SITE_ICON_STORAGE_KEY}`);

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
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
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

// Read-modify-write updates are serialized so a save and a clear in one page cannot interleave.
let siteIconWriteQueue: Promise<unknown> = Promise.resolve();

function withSiteIconWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const run = siteIconWriteQueue.then(task, task);
  siteIconWriteQueue = run.catch(() => undefined);
  return run;
}

export async function getSiteIconCache(): Promise<SiteIconCache> {
  return normalizeSiteIconCache(await siteIconCacheItem.getValue());
}

export type SiteIconSaveResult = {
  saved: number;
  /** Older icons removed to stay within the cache limit (including any that did not fit). */
  evicted: number;
};

/** Stores icons by origin with the current time, then trims the cache to `maxCacheBytes`. */
export function saveSiteIcons(
  icons: Record<string, string>,
  options: { maxCacheBytes: number; now?: number },
): Promise<SiteIconSaveResult> {
  return withSiteIconWriteLock(async () => {
    const fetchedAt = options.now ?? Date.now();
    const cache = await getSiteIconCache();
    const savedOrigins: string[] = [];
    for (const [origin, icon] of Object.entries(icons)) {
      if (getSiteIconOrigin(origin) !== origin || !isSiteIconDataUrl(icon)) continue;
      cache[origin] = { icon, fetchedAt };
      savedOrigins.push(origin);
    }
    const fitted = fitSiteIconCache(cache, options.maxCacheBytes);
    await writeSiteIconCache(fitted.cache);
    return {
      saved: savedOrigins.filter((origin) => origin in fitted.cache).length,
      evicted: fitted.evicted.length,
    };
  });
}

export function clearSiteIconCache(): Promise<void> {
  return withSiteIconWriteLock(() => siteIconCacheItem.removeValue());
}

export function watchSiteIconCache(callback: (cache: SiteIconCache) => void): () => void {
  return siteIconCacheItem.watch((value) => callback(normalizeSiteIconCache(value)));
}

async function writeSiteIconCache(cache: SiteIconCache): Promise<void> {
  if (Object.keys(cache).length === 0) {
    await siteIconCacheItem.removeValue();
    return;
  }
  await siteIconCacheItem.setValue(cache);
}
