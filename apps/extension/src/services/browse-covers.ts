/**
 * Capture Covers While Browsing: when a bookmarked page finishes loading in the active tab of the
 * focused window, and a bookmark of it needs a cover (`needsBrowseCover`), the background waits for
 * the page to settle, checks the tab still shows it, takes a picture of the tab, and stores it like
 * any cover (`cover-store.ts`, source `browse`). The picture never leaves the device.
 *
 * It runs only while Fetch Covers and Capture Covers While Browsing are on and the browser granted
 * `<all_urls>` (`browseCovers` in `lib/permission-catalog.ts`): without a click, Chrome, Edge, and
 * Firefox let `captureVisibleTab` run only with that pattern. Never of the extension's or the
 * browser's own pages, `file:`, or `about:` (web pages only), never of a site on Never Capture These
 * Sites or Index Page Text's Never Read These Sites, never over a cover the user chose, and never
 * over the page's own image unless Cover Source puts pictures of the tab first. Private windows only
 * with Also Capture in Private Windows on and the browser letting the extension run there. The
 * wait, the time between pictures, and the retake age are user settings; the browser's own limit
 * on pictures is in config/bookmarks/browse-covers.toml, below the setting's floor. At most one page
 * waits for its picture: a page that loads meanwhile takes its place.
 *
 * A service worker cannot load code later, so this stays small, and the tab listener is removed
 * while the feature is off, so loading pages does not wake the background for nothing.
 */
import { z } from 'zod';

const browseCoverConfig = readConfig(
  'bookmarks/browse-covers',
  z.strictObject({ browser_min_interval_ms: z.number().int().positive() }),
);

/**
 * The browser's own limit between two pictures (Chrome's MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND).
 * The Time Between Pictures setting may not go down to it (`tests/unit/browse-covers.test.ts`).
 */
export const BROWSER_MIN_CAPTURE_INTERVAL_MS = browseCoverConfig.browser_min_interval_ms;

/** The pace of pictures: how long a page settles first, and the least time between two. */
export type CapturePace = { settleDelayMs: number; minIntervalMs: number };

/** What a picture needs from the settings while the feature is on. */
export type BrowseCaptureSettings = CapturePace & {
  /** Never Capture These Sites, and Index Page Text's Never Read These Sites. */
  neverSites: readonly string[];
  /** Cover Width. */
  widthPx: number;
  /** Cover Image Quality. */
  quality: number;
  /** Cover Storage, in bytes. */
  maxCacheBytes: number;
  /** Cover Source. */
  preference: CoverPreference;
  /** Retake Screenshots Older Than, in ms; null never retakes one. */
  maxAgeMs: number | null;
  /** Also Capture in Private Windows. */
  capturePrivate: boolean;
};

/** Retake Screenshots Older Than as an age in ms: 0 days never retakes (null). */
export function retakeAgeMs(days: number): number | null {
  return days === 0 ? null : days * MS_PER_DAY;
}

/**
 * Whether a tab of a private window may be pictured: only with Also Capture in Private Windows on
 * and the browser letting the extension run in private windows.
 */
export function mayCapturePrivate(capturePrivate: boolean, allowedThere: boolean): boolean {
  return capturePrivate && allowedThere;
}

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
 * of that address made the current way; or its cover is the page's own image (or one saved before
 * sources were recorded) and the preference ranks pictures of the tab above it (Screenshot first);
 * or its cover is a picture taken while browsing (`browse`), saved more than `maxAgeMs` before
 * `now` (null: never retaken), as Retake Screenshots Older Than says; a picture quick save took is
 * not retaken. Never a cover the user chose with Use this view as the cover, whatever version made
 * it, and none at all with a choice that takes no pictures (Page image only).
 */
export function needsBrowseCover(
  info: CoverInfo | undefined,
  url: string,
  {
    now,
    maxAgeMs,
    preference,
  }: { now: number; maxAgeMs: number | null; preference: CoverPreference },
): boolean {
  if (!acceptsCoverKind(preference, 'screenshot')) return false;
  if (isKeptCoverOf(info, url)) return false;
  if (!isCoverCurrent(info, url)) return true;
  if (!isScreenshotCover(info.source)) return replacesCover(preference, 'screenshot', info.source);
  return info.source === 'browse' && maxAgeMs !== null && now - info.savedAt > maxAgeMs;
}

/**
 * How long a page that just loaded waits for its picture: the settle delay, or longer while the
 * last picture is less than `minIntervalMs` ago.
 */
export function nextCaptureDelay(
  now: number,
  lastCaptureAt: number | undefined,
  { settleDelayMs, minIntervalMs }: CapturePace,
): number {
  if (lastCaptureAt === undefined) return settleDelayMs;
  return Math.max(settleDelayMs, lastCaptureAt + minIntervalMs - now);
}

/** A page that loaded in the active tab, waiting for its picture. */
export type CaptureCandidate = { tabId: number; windowId: number; url: string };

/**
 * Pictures one page at a time, with at most one waiting: `offer` replaces the page that waits,
 * since the user has moved on from it. `capture` resolves true when it took a picture, which
 * starts the least interval before the next. `cancel` drops the waiting page. `pace` is read each
 * time a picture is scheduled, so a changed setting applies to the next page; null schedules none.
 */
export function createCaptureQueue({
  capture,
  pace,
  now = Date.now,
}: {
  capture: (candidate: CaptureCandidate) => Promise<boolean>;
  pace: () => CapturePace | null;
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
    const current = pace();
    if (!current) return;
    const delay = nextCaptureDelay(now(), lastCaptureAt, current);
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
 * The tab still shows `candidate`'s page, loaded, as the active tab of a focused normal window;
 * a private one only when `privateAllowed` (`mayCapturePrivate`).
 */
async function isShowing(candidate: CaptureCandidate, privateAllowed: boolean): Promise<boolean> {
  const tab = await browser.tabs.get(candidate.tabId).catch(() => undefined);
  if (!tab?.active || tab.status !== 'complete' || tab.url !== candidate.url) return false;
  if (tab.incognito && !privateAllowed) return false;
  const shown = await browser.windows.get(tab.windowId).catch(() => undefined);
  if (shown?.incognito && !privateAllowed) return false;
  return shown?.focused === true && shown.type === 'normal';
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
    quality: settings.coversQuality,
    maxCacheBytes: settings.coversMaxCacheMb * BYTES_PER_MB,
    preference: settings.coversSourcePreference,
    maxAgeMs: retakeAgeMs(settings.coversBrowseMaxAgeDays),
    capturePrivate: settings.coversBrowseCapturePrivate,
    settleDelayMs: settings.coversBrowseSettleMs,
    minIntervalMs: settings.coversBrowseIntervalMs,
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
  const privateAllowed = mayCapturePrivate(
    settings.capturePrivate,
    settings.capturePrivate && (await isAllowedInPrivateWindows()),
  );
  if (!(await isShowing(candidate, privateAllowed))) return false;
  const bookmarks = (await findBookmarksByUrl(url)).filter((node) => node.url === url);
  const rules = { now: Date.now(), maxAgeMs: settings.maxAgeMs, preference: settings.preference };
  const due: string[] = [];
  for (const node of bookmarks) {
    if (needsBrowseCover(await getCoverInfo(node.id, url), url, rules)) due.push(node.id);
  }
  if (due.length === 0) return false;
  const shot = await browser.tabs.captureVisibleTab(candidate.windowId, { format: 'png' });
  // The tab moved on while the picture was taken: it may show another page, so it is not kept.
  if (!(await isShowing(candidate, privateAllowed))) return true;
  const image = await shrinkTabPicture(shot, settings);
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
  // The pace of the settings last read; the queue schedules only while they are on.
  let pace: CapturePace | null = null;
  const queue = createCaptureQueue({ capture: captureBrowsedPage, pace: () => pace });
  // Set by `follow` below, before any event can arrive.
  let current: Promise<BrowseCaptureSettings | null> = Promise.resolve(null);
  const onUpdated = (
    tabId: number,
    change: Browser.tabs.OnUpdatedInfo,
    tab: Browser.tabs.Tab,
  ): void => {
    if (change.status !== 'complete' || !tab.active) return;
    const { url, windowId, incognito } = tab;
    void current.then((settings) => {
      if (!settings || (incognito && !settings.capturePrivate)) return;
      if (isBrowseCaptureUrl(url, settings.neverSites)) queue.offer({ tabId, windowId, url });
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
      pace = settings;
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
