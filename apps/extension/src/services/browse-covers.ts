/**
 * Capture Covers While Browsing: when a bookmarked page finishes loading in the active tab of the
 * focused window, and none of its bookmarks has a cover of that address (or the cover is older
 * than `max_age_days`), the background waits for the page to settle, checks the tab still shows
 * it, takes a picture of the tab, and stores it like any cover (`cover-store.ts`, source
 * `browse`). The picture never leaves the device.
 *
 * It runs only while Fetch Covers and Capture Covers While Browsing are on and the browser granted
 * `<all_urls>` (`browseCovers` in `lib/permission-catalog.ts`): without a click, Chrome, Edge, and
 * Firefox let `captureVisibleTab` run only with that pattern. Never in private windows, never of
 * the extension's or the browser's own pages, `file:`, or `about:` (web pages only), and never of
 * a site on Never Capture These Sites or Index Page Text's Never Read These Sites, and never over the page's own image unless Cover Source puts
 * pictures of the tab first. Pictures are at least `min_interval_ms` apart, below the
 * browser's own limit, and at most one page waits for its picture: a page that loads meanwhile
 * takes its place. Limits are in config/bookmarks/browse-covers.toml.
 *
 * A service worker cannot load code later, so this stays small, and the tab listener is removed
 * while the feature is off, so loading pages does not wake the background for nothing.
 */
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

const browseCoverConfig = readConfig(
  'bookmarks/browse-covers',
  z.strictObject({
    settle_delay_ms: boundedNumber({ integer: true }),
    min_interval_ms: boundedNumber({ integer: true }),
    max_age_days: boundedNumber({ integer: true }),
  }),
);

export const BROWSE_COVER_LIMITS = {
  settleDelayMs: browseCoverConfig.settle_delay_ms,
  minIntervalMs: browseCoverConfig.min_interval_ms,
  maxAgeMs: browseCoverConfig.max_age_days * MS_PER_DAY,
} as const;

/** What a picture needs from the settings while the feature is on. */
export type BrowseCaptureSettings = {
  /** Never Capture These Sites, and Index Page Text's Never Read These Sites. */
  neverSites: readonly string[];
  /** Cover Width. */
  widthPx: number;
  /** Cover Storage, in bytes. */
  maxCacheBytes: number;
  /** Cover Source. */
  preference: CoverPreference;
};

/**
 * Whether a page at `url` may be pictured while browsing: a web page (never the extension's or
 * the browser's own pages, `file:`, or `about:`), on no site of `neverSites`.
 */
export function isBrowseCaptureUrl(
  url: string | undefined,
  neverSites: readonly string[],
): url is string {
  return url !== undefined && isWebUrl(url) && !isUrlOnSites(url, neverSites);
}

/**
 * Whether a bookmark at `url` gets a new picture under Cover Source `preference`: it has no cover
 * of that address made the current way; or its cover is the page's own image and the preference
 * ranks pictures of the tab above it (Screenshot first); or its cover is a picture of the tab saved
 * more than `maxAgeMs` before `now`. A choice that takes no pictures (Page image only) gets none.
 */
export function needsBrowseCover(
  info: CoverInfo | undefined,
  url: string,
  { now, maxAgeMs, preference }: { now: number; maxAgeMs: number; preference: CoverPreference },
): boolean {
  if (!acceptsCoverKind(preference, 'screenshot')) return false;
  if (!isCoverCurrent(info, url)) return true;
  if (!isScreenshotCover(info.source)) return replacesCover(preference, 'screenshot', info.source);
  return now - info.savedAt > maxAgeMs;
}

/**
 * How long a page that just loaded waits for its picture: the settle delay, or longer while the
 * last picture is less than `minIntervalMs` ago.
 */
export function nextCaptureDelay(
  now: number,
  lastCaptureAt: number | undefined,
  { settleDelayMs, minIntervalMs }: { settleDelayMs: number; minIntervalMs: number },
): number {
  if (lastCaptureAt === undefined) return settleDelayMs;
  return Math.max(settleDelayMs, lastCaptureAt + minIntervalMs - now);
}

/** A page that loaded in the active tab, waiting for its picture. */
export type CaptureCandidate = { tabId: number; windowId: number; url: string };

/**
 * Pictures one page at a time, with at most one waiting: `offer` replaces the page that waits,
 * since the user has moved on from it. `capture` resolves true when it took a picture, which
 * starts the least interval before the next. `cancel` drops the waiting page.
 */
export function createCaptureQueue({
  capture,
  settleDelayMs,
  minIntervalMs,
  now = Date.now,
}: {
  capture: (candidate: CaptureCandidate) => Promise<boolean>;
  settleDelayMs: number;
  minIntervalMs: number;
  now?: () => number;
}): { offer: (candidate: CaptureCandidate) => void; cancel: () => void } {
  let waiting: CaptureCandidate | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let lastCaptureAt: number | undefined;

  const schedule = () => {
    clearTimeout(timer);
    timer = undefined;
    // A picture being taken schedules the next one when it ends.
    if (!waiting || running) return;
    const delay = nextCaptureDelay(now(), lastCaptureAt, { settleDelayMs, minIntervalMs });
    timer = setTimeout(() => void run(), delay);
  };

  const run = async () => {
    timer = undefined;
    const candidate = waiting;
    waiting = undefined;
    if (!candidate) return;
    running = true;
    try {
      if (await capture(candidate)) lastCaptureAt = now();
    } catch (error) {
      // The page is left without a picture; the next load tries again.
      console.error('[Covers] Picture while browsing failed:', error);
    } finally {
      running = false;
      schedule();
    }
  };

  return {
    offer(candidate) {
      waiting = candidate;
      schedule();
    },
    cancel() {
      waiting = undefined;
      schedule();
    },
  };
}

/**
 * The tab still shows `candidate`'s page, loaded, as the active tab of a focused normal window
 * that is not private.
 */
async function isShowing(candidate: CaptureCandidate): Promise<boolean> {
  const tab = await browser.tabs.get(candidate.tabId).catch(() => undefined);
  if (!tab?.active || tab.incognito || tab.status !== 'complete' || tab.url !== candidate.url) {
    return false;
  }
  const shown = await browser.windows.get(tab.windowId).catch(() => undefined);
  return shown?.focused === true && shown.type === 'normal' && !shown.incognito;
}

/**
 * Settings while the feature is on and allowed; null while it is off, or while Cover Source takes
 * no pictures of the tab (Page image only).
 */
async function readBrowseCaptureSettings(): Promise<BrowseCaptureSettings | null> {
  const settings = await getSettings();
  if (!settings.coversEnabled || !settings.coversBrowseCapture) return null;
  if (!acceptsCoverKind(settings.coversSourcePreference, 'screenshot')) return null;
  if (!(await hasPermission('browseCovers'))) return null;
  return {
    neverSites: [...settings.coversNeverCaptureSites, ...settings.pageTextExcludedSites],
    widthPx: settings.coversWidthPx,
    maxCacheBytes: settings.coversMaxCacheMb * BYTES_PER_MB,
    preference: settings.coversSourcePreference,
  };
}

/**
 * Pictures `candidate`'s page for its bookmarks that need a cover, once the page has settled.
 * Resolves true when a picture was taken (kept or not), false when none was needed or allowed.
 */
export async function captureBrowsedPage(candidate: CaptureCandidate): Promise<boolean> {
  const settings = await readBrowseCaptureSettings();
  const { url } = candidate;
  if (!settings || !isBrowseCaptureUrl(url, settings.neverSites)) return false;
  if (!(await isShowing(candidate))) return false;
  const bookmarks = (await findBookmarksByUrl(url)).filter((node) => node.url === url);
  const rules = {
    now: Date.now(),
    maxAgeMs: BROWSE_COVER_LIMITS.maxAgeMs,
    preference: settings.preference,
  };
  const due: string[] = [];
  for (const node of bookmarks) {
    if (needsBrowseCover(await getCoverInfo(node.id, url), url, rules)) due.push(node.id);
  }
  if (due.length === 0) return false;
  const shot = await browser.tabs.captureVisibleTab(candidate.windowId, { format: 'png' });
  // The tab moved on while the picture was taken: it may show another page, so it is not kept.
  if (!(await isShowing(candidate))) return true;
  const image = await shrinkTabPicture(shot, settings.widthPx);
  if (!image) return true;
  await saveCovers(
    due.map((bookmarkId) => ({ bookmarkId, url, source: 'browse' as const, ...image })),
    settings.maxCacheBytes,
  );
  return true;
}

/**
 * Called once from the background. The tab listener is added synchronously, so the load that
 * woke the worker is not missed, then removed while the feature is off; settings and permission
 * changes add or remove it again.
 */
export function registerBrowseCovers(): void {
  const queue = createCaptureQueue({
    capture: captureBrowsedPage,
    settleDelayMs: BROWSE_COVER_LIMITS.settleDelayMs,
    minIntervalMs: BROWSE_COVER_LIMITS.minIntervalMs,
  });
  // Set by `follow` below, before any event can arrive.
  let current: Promise<BrowseCaptureSettings | null> = Promise.resolve(null);
  const onUpdated = (
    tabId: number,
    change: Browser.tabs.OnUpdatedInfo,
    tab: Browser.tabs.Tab,
  ): void => {
    if (change.status !== 'complete' || !tab.active || tab.incognito) return;
    const { url, windowId } = tab;
    void current.then((settings) => {
      if (settings && isBrowseCaptureUrl(url, settings.neverSites)) {
        queue.offer({ tabId, windowId, url });
      }
    });
  };
  const events = browser.tabs.onUpdated;
  events.addListener(onUpdated);

  let revision = 0;
  const follow = () => {
    revision += 1;
    const asked = revision;
    current = readBrowseCaptureSettings().catch(() => null);
    void current.then((settings) => {
      // A later change decides.
      if (asked !== revision) return;
      if (settings && !events.hasListener(onUpdated)) events.addListener(onUpdated);
      if (!settings) {
        events.removeListener(onUpdated);
        queue.cancel();
      }
    });
  };
  settingsValue.watch(follow);
  watchPermissions(follow);
  follow();
}
