import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { coverPlaceholderHue, coverPlaceholderSite } from '@/lib/cover-placeholder';
import type { CoverPreference } from '@/lib/cover-preferences';
import {
  COVER_LIMITS,
  type CoverInfo,
  clearCovers,
  getCoverInfos,
  saveCovers,
} from '@/lib/cover-store';
import { defaultSettings, getSettingsFieldMeta, settingsSchema } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
import { MS_PER_DAY, MS_PER_SECOND } from '@/lib/units';
import {
  BROWSER_MIN_CAPTURE_INTERVAL_MS,
  type CaptureCandidate,
  captureBrowsedPage,
  createCaptureQueue,
  isBrowseCaptureUrl,
  mayCapturePrivate,
  needsBrowseCover,
  nextCaptureDelay,
  retakeAgeMs,
} from '@/services/browse-covers';
import { installFakePermissions } from '../fake-permissions';
import { pngDataUrl } from './png-header';

const PAGE = 'https://news.example.com/story';

describe('which pages are pictured while browsing', () => {
  it('only web pages: never the extension, the browser, local files, or about:', () => {
    expect(isBrowseCaptureUrl(PAGE, [])).toBe(true);
    expect(isBrowseCaptureUrl('http://plain.example/', [])).toBe(true);
    for (const url of [
      'chrome-extension://abcdefghijklmnop/options.html',
      'moz-extension://5e1b/popup.html',
      'chrome://settings/',
      'edge://favorites/',
      'about:blank',
      'file:///Users/me/notes.html',
      'data:text/html,<p>hi</p>',
      undefined,
    ]) {
      expect(isBrowseCaptureUrl(url, [])).toBe(false);
    }
  });

  it('never a site on Never Capture These Sites, or one of its subdomains', () => {
    expect(isBrowseCaptureUrl(PAGE, ['example.com'])).toBe(false);
    expect(isBrowseCaptureUrl(PAGE, ['news.example.com'])).toBe(false);
    expect(isBrowseCaptureUrl(PAGE, ['mail.example.com'])).toBe(true);
    // A name that only ends the same way is another site.
    expect(isBrowseCaptureUrl('https://notexample.com/', ['example.com'])).toBe(true);
  });
});

describe('which bookmarks get a new picture', () => {
  const NOW = Date.UTC(2026, 9, 22);
  const info = (overrides: Partial<CoverInfo> = {}): CoverInfo => ({
    bookmarkId: 'b1',
    url: PAGE,
    width: 4,
    height: 2,
    bytes: 1,
    savedAt: NOW - MS_PER_DAY,
    version: COVER_LIMITS.version,
    source: 'page',
    ...overrides,
  });
  const maxAge = 30 * MS_PER_DAY;
  const needs = (
    cover: CoverInfo | undefined,
    preference: CoverPreference = 'page_first',
    url = PAGE,
  ) => needsBrowseCover(cover, url, { now: NOW, maxAgeMs: maxAge, preference });

  it('one with no cover, or a cover of another address or made another way', () => {
    expect(needs(undefined)).toBe(true);
    expect(needs(info({ url: 'https://news.example.com/old' }))).toBe(true);
    expect(needs(info({ version: COVER_LIMITS.version + 1 }))).toBe(true);
  });

  it('one whose picture taken while browsing is older than the maximum age', () => {
    expect(needs(info({ source: 'browse' }))).toBe(false);
    expect(needs(info({ source: 'browse', savedAt: NOW - maxAge }))).toBe(false);
    expect(needs(info({ source: 'browse', savedAt: NOW - maxAge - 1 }))).toBe(true);
  });

  it('never one the user chose with Use this view as the cover, whatever its age or Cover Source', () => {
    const chosen = info({ source: 'tab', savedAt: NOW - maxAge * 10 });
    for (const preference of ['page_first', 'screenshot_first', 'page_only'] as const) {
      expect(needs(chosen, preference)).toBe(false);
    }
    // Only its own address counts: a bookmark moved elsewhere has no cover there.
    expect(needs(chosen, 'page_first', 'https://news.example.com/moved')).toBe(true);
  });

  it('a cover saved before sources were recorded is replaced as a fetched page image', () => {
    const legacy = info({ source: 'unknown', savedAt: NOW - maxAge - 1 });
    expect(needs(legacy)).toBe(false);
    expect(needs(legacy, 'screenshot_first')).toBe(true);
    expect(needs(legacy, 'page_only')).toBe(false);
  });

  it('a fetched page image is kept unless Cover Source puts screenshots first', () => {
    const old = info({ source: 'page', savedAt: NOW - maxAge - 1 });
    expect(needs(info({ source: 'page' }))).toBe(false);
    expect(needs(old)).toBe(false);
    expect(needs(info({ source: 'page' }), 'screenshot_first')).toBe(true);
    // Screenshot first still keeps a recent picture of the tab.
    expect(needs(info({ source: 'browse' }), 'screenshot_first')).toBe(false);
    // Page image only takes no pictures at all, not even for a bookmark without a cover.
    expect(needs(undefined, 'page_only')).toBe(false);
    expect(needs(old, 'page_only')).toBe(false);
  });

  it('never retakes a picture taken while browsing with Retake Screenshots Older Than at 0', () => {
    expect(retakeAgeMs(0)).toBeNull();
    expect(retakeAgeMs(30)).toBe(30 * MS_PER_DAY);
    const ancient = info({ source: 'browse', savedAt: 0 });
    expect(
      needsBrowseCover(ancient, PAGE, { now: NOW, maxAgeMs: null, preference: 'page_first' }),
    ).toBe(false);
    // A bookmark without a cover still gets one.
    expect(
      needsBrowseCover(undefined, PAGE, { now: NOW, maxAgeMs: null, preference: 'page_first' }),
    ).toBe(true);
  });
});

describe('when pictures are taken', () => {
  const limits = { settleDelayMs: 1500, minIntervalMs: 4000 };

  it('waits for the page to settle, and longer while the last picture is recent', () => {
    expect(nextCaptureDelay(10_000, undefined, limits)).toBe(1500);
    expect(nextCaptureDelay(10_000, 1_000, limits)).toBe(1500);
    expect(nextCaptureDelay(10_000, 9_000, limits)).toBe(3000);
  });

  it('keeps the Time Between Pictures floor above the browser limit of two pictures a second', () => {
    // Chrome's MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND = 2.
    expect(BROWSER_MIN_CAPTURE_INTERVAL_MS).toBe(MS_PER_SECOND / 2);
    const { min = 0 } = getSettingsFieldMeta().coversBrowseIntervalMs;
    expect(min).toBeGreaterThan(BROWSER_MIN_CAPTURE_INTERVAL_MS);
    expect(defaultSettings.coversBrowseIntervalMs).toBeGreaterThanOrEqual(min);
    expect(settingsSchema.shape.coversBrowseIntervalMs.safeParse(min - 1).success).toBe(false);
  });

  describe('the queue', () => {
    beforeEach(() => vi.useFakeTimers({ now: 0 }));
    afterEach(() => vi.useRealTimers());

    const page = (tabId: number): CaptureCandidate => ({
      tabId,
      windowId: 1,
      url: `https://site.example/${tabId}`,
    });

    it('takes one picture at a time, with only the latest page waiting', async () => {
      const taken: number[] = [];
      let finish: (() => void) | undefined;
      const queue = createCaptureQueue({
        pace: () => limits,
        capture: (candidate) =>
          new Promise<boolean>((resolve) => {
            taken.push(candidate.tabId);
            finish = () => resolve(true);
          }),
      });
      queue.offer(page(1));
      queue.offer(page(2));
      await vi.advanceTimersByTimeAsync(1499);
      expect(taken).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      // Page 1 was replaced while it waited.
      expect(taken).toEqual([2]);
      // Pages that load while a picture is taken wait for it; only the last one is kept.
      queue.offer(page(3));
      queue.offer(page(4));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(taken).toEqual([2]);
      finish?.();
      // The next waits out the least interval after the picture.
      await vi.advanceTimersByTimeAsync(3999);
      expect(taken).toEqual([2]);
      await vi.advanceTimersByTimeAsync(1);
      expect(taken).toEqual([2, 4]);
    });

    it('does not count a page that needed no picture toward the interval, and cancel drops the waiting one', async () => {
      const taken: number[] = [];
      const queue = createCaptureQueue({
        pace: () => limits,
        capture: async (candidate) => {
          taken.push(candidate.tabId);
          return false;
        },
      });
      queue.offer(page(1));
      await vi.advanceTimersByTimeAsync(1500);
      queue.offer(page(2));
      await vi.advanceTimersByTimeAsync(1500);
      expect(taken).toEqual([1, 2]);
      queue.offer(page(3));
      queue.cancel();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(taken).toEqual([1, 2]);
    });

    it('keeps going after a picture fails', async () => {
      const taken: number[] = [];
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const queue = createCaptureQueue({
        pace: () => limits,
        capture: async (candidate) => {
          taken.push(candidate.tabId);
          throw new Error('capture failed');
        },
      });
      queue.offer(page(1));
      await vi.advanceTimersByTimeAsync(1500);
      queue.offer(page(2));
      await vi.advanceTimersByTimeAsync(1500);
      expect(taken).toEqual([1, 2]);
      vi.restoreAllMocks();
    });
  });
});

const DEFAULT_MAX_AGE_MS = defaultSettings.coversBrowseMaxAgeDays * MS_PER_DAY;

describe('a picture of a bookmarked page that loaded', () => {
  type Tab = Browser.tabs.Tab;
  const candidate: CaptureCandidate = { tabId: 7, windowId: 1, url: PAGE };
  const tab = (overrides: Partial<Tab> = {}) =>
    ({
      id: 7,
      windowId: 1,
      url: PAGE,
      active: true,
      status: 'complete',
      incognito: false,
      ...overrides,
    }) as Tab;
  const focusedWindow = (overrides: Partial<Browser.windows.Window> = {}) =>
    ({
      id: 1,
      focused: true,
      type: 'normal',
      incognito: false,
      ...overrides,
    }) as Browser.windows.Window;
  let capture: ReturnType<typeof vi.fn>;
  let permissions: ReturnType<typeof installFakePermissions>;

  beforeEach(async () => {
    await clearCovers();
    permissions = installFakePermissions({ origins: ['<all_urls>'] });
    await saveSettings({
      coversEnabled: true,
      coversBrowseCapture: true,
      coversWidthPx: 320,
      coversNeverCaptureSites: [],
      coversSourcePreference: 'page_first',
      pageTextExcludedSites: [],
      coversBrowseCapturePrivate: false,
    });
    vi.stubGlobal('createImageBitmap', async () => ({
      width: 1600,
      height: 1000,
      close: () => undefined,
    }));
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor(
          readonly width: number,
          readonly height: number,
        ) {}
        getContext() {
          return { drawImage: () => undefined };
        }
        async convertToBlob({ type }: { type: string }) {
          return new Blob([new Uint8Array(9)], { type });
        }
      },
    );
    vi.spyOn(fakeBrowser.bookmarks, 'search').mockResolvedValue([
      { id: 'b1', title: 'Story', url: PAGE, syncing: false },
      { id: 'b2', title: 'Story again', url: PAGE, syncing: false },
    ]);
    vi.spyOn(fakeBrowser.tabs, 'get').mockResolvedValue(tab());
    vi.spyOn(fakeBrowser.windows, 'get').mockResolvedValue(focusedWindow());
    capture = vi.fn(async () => pngDataUrl(1600, 1000));
    (fakeBrowser.tabs as unknown as Record<string, unknown>).captureVisibleTab = capture;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const stored = async () =>
    [...(await getCoverInfos()).values()].map(({ bookmarkId, url, width, source }) => ({
      bookmarkId,
      url,
      width,
      source,
    }));

  it('is stored, shrunk, for every bookmark of the address, as captured while browsing', async () => {
    expect(await captureBrowsedPage(candidate)).toBe(true);
    expect(capture).toHaveBeenCalledWith(1, { format: 'png' });
    expect(await stored()).toEqual([
      { bookmarkId: 'b1', url: PAGE, width: 320, source: 'browse' },
      { bookmarkId: 'b2', url: PAGE, width: 320, source: 'browse' },
    ]);
  });

  it('is taken only for bookmarks without a recent cover', async () => {
    const image = { width: 4, height: 2, type: 'image/webp', data: new ArrayBuffer(3) };
    await saveCovers([{ bookmarkId: 'b1', url: PAGE, source: 'page', ...image }], 1_000_000);
    expect(await captureBrowsedPage(candidate)).toBe(true);
    expect(await stored()).toEqual([
      { bookmarkId: 'b1', url: PAGE, width: 4, source: 'page' },
      { bookmarkId: 'b2', url: PAGE, width: 320, source: 'browse' },
    ]);
    // Both are recent now: no picture at all.
    capture.mockClear();
    expect(await captureBrowsedPage(candidate)).toBe(false);
    expect(capture).not.toHaveBeenCalled();
  });

  it('keeps a fetched page image unless Cover Source puts screenshots first, and takes none with Page image only', async () => {
    const image = { width: 4, height: 2, type: 'image/webp', data: new ArrayBuffer(3) };
    await saveCovers(
      ['b1', 'b2'].map((bookmarkId) => ({
        bookmarkId,
        url: PAGE,
        source: 'page' as const,
        ...image,
      })),
      1_000_000,
    );
    expect(await captureBrowsedPage(candidate)).toBe(false);
    await clearCovers();
    await saveSettings({ coversSourcePreference: 'page_only' });
    expect(await captureBrowsedPage(candidate)).toBe(false);
    expect(capture).not.toHaveBeenCalled();
    await saveCovers(
      ['b1', 'b2'].map((bookmarkId) => ({
        bookmarkId,
        url: PAGE,
        source: 'page' as const,
        ...image,
      })),
      1_000_000,
    );
    await saveSettings({ coversSourcePreference: 'screenshot_first' });
    expect(await captureBrowsedPage(candidate)).toBe(true);
    expect((await stored()).map((cover) => cover.source)).toEqual(['browse', 'browse']);
  });

  it('never replaces a cover chosen with Use this view as the cover, even an old one', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now - DEFAULT_MAX_AGE_MS * 2);
    const image = { width: 4, height: 2, type: 'image/webp', data: new ArrayBuffer(3) };
    await saveCovers(
      ['b1', 'b2'].map((bookmarkId) => ({
        bookmarkId,
        url: PAGE,
        source: 'tab' as const,
        ...image,
      })),
      1_000_000,
    );
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await saveSettings({ coversSourcePreference: 'screenshot_first' });
    expect(await captureBrowsedPage(candidate)).toBe(false);
    expect(capture).not.toHaveBeenCalled();
    expect((await stored()).map((cover) => cover.source)).toEqual(['tab', 'tab']);
  });

  it('replaces a cover older than the maximum age', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now - DEFAULT_MAX_AGE_MS - 1);
    const image = { width: 4, height: 2, type: 'image/webp', data: new ArrayBuffer(3) };
    await saveCovers(
      ['b1', 'b2'].map((bookmarkId) => ({
        bookmarkId,
        url: PAGE,
        source: 'browse' as const,
        ...image,
      })),
      1_000_000,
    );
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(await captureBrowsedPage(candidate)).toBe(true);
    expect((await stored()).map((cover) => cover.source)).toEqual(['browse', 'browse']);
  });

  it('is not taken while the setting is off, Fetch Covers is off, or the access is missing', async () => {
    await saveSettings({ coversBrowseCapture: false });
    expect(await captureBrowsedPage(candidate)).toBe(false);
    await saveSettings({ coversBrowseCapture: true, coversEnabled: false });
    expect(await captureBrowsedPage(candidate)).toBe(false);
    await saveSettings({ coversEnabled: true });
    permissions.revoke({ origins: ['<all_urls>'] });
    expect(await captureBrowsedPage(candidate)).toBe(false);
    expect(capture).not.toHaveBeenCalled();
    expect(await stored()).toEqual([]);
  });

  it('is not taken of a site on Never Capture These Sites, or a page with no bookmark of its address', async () => {
    await saveSettings({ coversNeverCaptureSites: ['example.com'] });
    expect(await captureBrowsedPage(candidate)).toBe(false);
    // Index Page Text's Never Read These Sites is honored too.
    await saveSettings({
      coversNeverCaptureSites: [],
      pageTextExcludedSites: ['news.example.com'],
    });
    expect(await captureBrowsedPage(candidate)).toBe(false);
    await saveSettings({ pageTextExcludedSites: [] });
    vi.spyOn(fakeBrowser.bookmarks, 'search').mockResolvedValue([
      // Search matches similar addresses too; only the exact one counts.
      { id: 'b3', title: 'Other', url: `${PAGE}?ref=feed`, syncing: false },
    ]);
    expect(await captureBrowsedPage(candidate)).toBe(false);
    expect(capture).not.toHaveBeenCalled();
  });

  it('is not taken once the tab moved on, is private, or its window is not focused', async () => {
    const cases: [Partial<Tab>, Partial<Browser.windows.Window>][] = [
      [{ url: 'https://news.example.com/next' }, {}],
      [{ active: false }, {}],
      [{ status: 'loading' }, {}],
      [{ incognito: true }, {}],
      [{}, { focused: false }],
      [{}, { type: 'popup' }],
    ];
    for (const [tabChange, windowChange] of cases) {
      vi.spyOn(fakeBrowser.tabs, 'get').mockResolvedValue(tab(tabChange));
      vi.spyOn(fakeBrowser.windows, 'get').mockResolvedValue(focusedWindow(windowChange));
      expect(await captureBrowsedPage(candidate)).toBe(false);
    }
    vi.spyOn(fakeBrowser.tabs, 'get').mockRejectedValue(new Error('No tab with id: 7'));
    expect(await captureBrowsedPage(candidate)).toBe(false);
    expect(capture).not.toHaveBeenCalled();
  });

  it('takes a private window only with Also Capture in Private Windows on and the browser allowing the extension there', async () => {
    expect(mayCapturePrivate(false, true)).toBe(false);
    expect(mayCapturePrivate(true, false)).toBe(false);
    expect(mayCapturePrivate(true, true)).toBe(true);
    let allowed = false;
    (fakeBrowser.extension as unknown as Record<string, unknown>).isAllowedIncognitoAccess =
      async () => allowed;
    vi.spyOn(fakeBrowser.tabs, 'get').mockResolvedValue(tab({ incognito: true }));
    vi.spyOn(fakeBrowser.windows, 'get').mockResolvedValue(focusedWindow({ incognito: true }));
    // Off by default.
    expect(await captureBrowsedPage(candidate)).toBe(false);
    // On, but the browser does not let the extension run in private windows: still skipped.
    await saveSettings({ coversBrowseCapturePrivate: true });
    expect(await captureBrowsedPage(candidate)).toBe(false);
    expect(capture).not.toHaveBeenCalled();
    // On and allowed there.
    allowed = true;
    expect(await captureBrowsedPage(candidate)).toBe(true);
    expect((await stored()).map((cover) => cover.source)).toEqual(['browse', 'browse']);
  });

  it('is dropped when the tab showed another page by the time the picture was taken', async () => {
    vi.spyOn(fakeBrowser.tabs, 'get')
      .mockResolvedValueOnce(tab())
      .mockResolvedValueOnce(tab({ url: 'https://elsewhere.example/' }));
    expect(await captureBrowsedPage(candidate)).toBe(true);
    expect(capture).toHaveBeenCalledOnce();
    expect(await stored()).toEqual([]);
  });
});

describe('the placeholder of a card without a cover', () => {
  it('names the site and takes one hue per site, the same every time', () => {
    expect(coverPlaceholderSite('https://www.example.com/a')).toBe('example.com');
    expect(coverPlaceholderSite('https://news.example.com/a')).toBe('news.example.com');
    expect(coverPlaceholderSite('javascript:void(0)')).toBe('');
    const hue = coverPlaceholderHue('https://example.com/a');
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
    expect(Number.isInteger(hue)).toBe(true);
    // Every page and subdomain of a site shares it.
    expect(coverPlaceholderHue('https://www.example.com/b')).toBe(hue);
    expect(coverPlaceholderHue('https://news.example.com/c')).toBe(hue);
    // FNV-1a of the domain: a fixed value, so a site's color never changes between releases.
    expect(hue).toBe(278);
    const hues = new Set(
      ['github.com', 'wikipedia.org', 'mozilla.org', 'nytimes.com', 'bbc.co.uk'].map((site) =>
        coverPlaceholderHue(`https://${site}/`),
      ),
    );
    expect(hues.size).toBeGreaterThan(1);
  });
});
