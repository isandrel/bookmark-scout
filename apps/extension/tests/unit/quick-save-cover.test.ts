import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import {
  type CoverPreference,
  coverPreferenceKinds,
  getQuickSaveCoverSourceLabel,
  quickSaveCoverSourceSchema,
  resolveQuickSaveCoverPreference,
} from '@/lib/cover-preferences';
import { type CoverInfo, clearCovers, getCoverInfos, saveCovers } from '@/lib/cover-store';
import { defaultSettings, type Settings } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
import {
  type QuickSaveCoverRules,
  quickSaveCoverKinds,
  quickSaveCoverRules,
  removeQuickSaveCover,
  startQuickSaveCover,
} from '@/services/quick-save-cover';
import { pngDataUrl, pngHeader } from './png-header';

const URL_SAVED = 'https://news.example.com/story';

const rules = (overrides: Partial<QuickSaveCoverRules> = {}): QuickSaveCoverRules => ({
  enabled: true,
  preference: 'page_first',
  existing: 'keep',
  neverSites: [],
  ...overrides,
});

const info = (source: CoverInfo['source'], overrides: Partial<CoverInfo> = {}): CoverInfo => ({
  bookmarkId: 'b1',
  url: URL_SAVED,
  width: 320,
  height: 200,
  bytes: 9,
  savedAt: 0,
  version: 1,
  source,
  ...overrides,
});

const kinds = (
  ruleOverrides: Partial<QuickSaveCoverRules> = {},
  page: { url?: string; incognito?: boolean; current?: CoverInfo } = {},
) =>
  quickSaveCoverKinds(rules(ruleOverrides), {
    url: page.url ?? URL_SAVED,
    incognito: page.incognito ?? false,
    current: page.current,
  });

describe('which covers quick save tries', () => {
  it('none while the setting or Fetch Covers is off', () => {
    const settings = (overrides: Partial<Settings>) =>
      quickSaveCoverRules({ ...defaultSettings, ...overrides }).enabled;
    // On by default, but Fetch Covers is off by default, so a default install keeps none.
    expect(defaultSettings.quickSaveCover).toBe(true);
    expect(settings({})).toBe(false);
    expect(settings({ coversEnabled: true })).toBe(true);
    expect(settings({ coversEnabled: true, quickSaveCover: false })).toBe(false);
    expect(kinds({ enabled: false })).toEqual([]);
  });

  it('none in a private window, for a page that is not a web page, or on a site never covered', () => {
    expect(kinds({}, { incognito: true })).toEqual([]);
    expect(kinds({}, { url: 'file:///home/notes.html' })).toEqual([]);
    expect(kinds({}, { url: 'chrome://settings/' })).toEqual([]);
    expect(kinds({ neverSites: ['example.com'] })).toEqual([]);
    // Never Read These Sites counts too.
    const never = quickSaveCoverRules({
      ...defaultSettings,
      coversEnabled: true,
      pageTextExcludedSites: ['news.example.com'],
    });
    expect(
      quickSaveCoverKinds(never, { url: URL_SAVED, incognito: false, current: undefined }),
    ).toEqual([]);
  });

  it('follows each Cover Source choice, best first', () => {
    const order = (preference: CoverPreference) => kinds({ preference });
    expect(order('page_first')).toEqual(['page', 'screenshot']);
    expect(order('screenshot_first')).toEqual(['screenshot', 'page']);
    expect(order('page_only')).toEqual(['page']);
    expect(order('screenshot_only')).toEqual(['screenshot']);
    for (const preference of quickSaveCoverSourceSchema.options) {
      if (preference === 'same') continue;
      expect(order(preference)).toEqual(coverPreferenceKinds(preference));
    }
  });

  it('Same as Cover Source follows Cover Source; any other choice is quick save only', () => {
    expect(resolveQuickSaveCoverPreference('same', 'screenshot_first')).toBe('screenshot_first');
    expect(resolveQuickSaveCoverPreference('page_only', 'screenshot_first')).toBe('page_only');
    const resolved = (overrides: Partial<Settings>) =>
      quickSaveCoverRules({ ...defaultSettings, ...overrides }).preference;
    expect(defaultSettings.quickSaveCoverSource).toBe('same');
    expect(resolved({ coversSourcePreference: 'screenshot_only' })).toBe('screenshot_only');
    expect(
      resolved({ coversSourcePreference: 'screenshot_only', quickSaveCoverSource: 'page_first' }),
    ).toBe('page_first');
    setLanguage('en');
    expect(getQuickSaveCoverSourceLabel('same')).toBe('Same as Cover Source');
    expect(getQuickSaveCoverSourceLabel('screenshot_only')).toBe('Screenshot only');
  });

  it('keeps a cover the bookmark has unless told to replace it, and never one the user chose', () => {
    expect(defaultSettings.quickSaveCoverExisting).toBe('keep');
    expect(kinds({}, { current: info('page') })).toEqual([]);
    expect(kinds({ existing: 'replace' }, { current: info('page') })).toEqual([
      'page',
      'screenshot',
    ]);
    expect(kinds({ existing: 'replace' }, { current: info('browse') })).toEqual([
      'page',
      'screenshot',
    ]);
    expect(kinds({ existing: 'replace' }, { current: info('tab') })).toEqual([]);
    // A cover of another address, or made an older way, is no cover of this page.
    expect(kinds({}, { current: info('page', { url: 'https://news.example.com/old' }) })).toEqual([
      'page',
      'screenshot',
    ]);
    expect(kinds({}, { current: info('page', { version: 0 }) })).toEqual(['page', 'screenshot']);
  });
});

describe('a quick save cover', () => {
  type Tab = Browser.tabs.Tab;
  const tab = (overrides: Partial<Tab> = {}) =>
    ({ id: 7, windowId: 1, url: URL_SAVED, incognito: false, active: true, ...overrides }) as Tab;
  const PICTURE_WAIT = { pictureWaitMs: 1000, picture: true };
  let capture: ReturnType<typeof vi.fn>;
  let quality: number | undefined;
  /** The meta tags the page in the tab names. */
  let metas: { key: string; content: string }[];

  const settings = (overrides: Partial<Settings> = {}): Settings => ({
    ...defaultSettings,
    coversEnabled: true,
    coversWidthPx: 320,
    ...overrides,
  });
  const stored = async () =>
    [...(await getCoverInfos()).values()].map(({ bookmarkId, source, width }) => ({
      bookmarkId,
      source,
      width,
    }));
  const wanted = async () => true;

  beforeEach(async () => {
    fakeBrowser.reset();
    await saveSettings({ language: 'en' });
    await clearCovers();
    metas = [{ key: 'og:image', content: '/cover.png' }];
    quality = undefined;
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
        async convertToBlob(options: { type: string; quality: number }) {
          quality = options.quality;
          return new Blob([new Uint8Array(9)], { type: options.type });
        }
      },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const png = pngHeader(1600, 1000);
        return new Response(png as BodyInit, {
          status: 200,
          headers: { 'content-type': 'image/png', 'content-length': String(png.byteLength) },
        });
      }),
    );
    vi.spyOn(fakeBrowser.tabs, 'get').mockResolvedValue(tab());
    capture = vi.fn(async () => pngDataUrl(1600, 1000));
    (fakeBrowser.tabs as unknown as Record<string, unknown>).captureVisibleTab = capture;
    vi.spyOn(fakeBrowser.scripting, 'executeScript').mockImplementation((async () => [
      { frameId: 0, result: { url: URL_SAVED, metas } },
    ]) as never);
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is none while Fetch Covers is off, and takes no picture', () => {
    expect(startQuickSaveCover(settings({ coversEnabled: false }), tab(), PICTURE_WAIT)).toBeNull();
    expect(
      startQuickSaveCover(settings({ quickSaveCover: false }), tab(), PICTURE_WAIT),
    ).toBeNull();
    expect(startQuickSaveCover(settings(), tab({ incognito: true }), PICTURE_WAIT)).toBeNull();
    expect(capture).not.toHaveBeenCalled();
  });

  it("Page image first keeps the page's own image, at the cover quality", async () => {
    const cover = startQuickSaveCover(settings({ coversQuality: 0.6 }), tab(), PICTURE_WAIT);
    expect(await cover?.save('b1', wanted)).toBe('page');
    expect(await stored()).toEqual([{ bookmarkId: 'b1', source: 'page', width: 320 }]);
    expect(quality).toBe(0.6);
    expect(fetch).toHaveBeenCalledWith('https://news.example.com/cover.png', expect.anything());
  });

  it('falls back to the picture of the tab, taken at once, when the page names no image', async () => {
    metas = [];
    const cover = startQuickSaveCover(settings(), tab(), PICTURE_WAIT);
    // Taken when the shortcut is pressed: ready, which the notification waits for, follows it.
    await cover?.ready;
    expect(capture).toHaveBeenCalledWith(1, { format: 'png' });
    expect(await cover?.save('b1', wanted)).toBe('quickSave');
    expect(await stored()).toEqual([{ bookmarkId: 'b1', source: 'quickSave', width: 320 }]);
  });

  it('downloads an image on another site only with access to it', async () => {
    metas = [{ key: 'og:image', content: 'https://cdn.other.net/a.png' }];
    const cover = startQuickSaveCover(
      settings({ coversSourcePreference: 'page_only' }),
      tab(),
      PICTURE_WAIT,
    );
    expect(await cover?.save('b1', wanted)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true);
    const allowed = startQuickSaveCover(
      settings({ coversSourcePreference: 'page_only' }),
      tab(),
      PICTURE_WAIT,
    );
    expect(await allowed?.save('b1', wanted)).toBe('page');
  });

  it('Screenshot first and Screenshot only keep the picture; Page image only takes none', async () => {
    for (const [preference, source] of [
      ['screenshot_first', 'quickSave'],
      ['screenshot_only', 'quickSave'],
      ['page_only', 'page'],
    ] as const) {
      await clearCovers();
      capture.mockClear();
      const cover = startQuickSaveCover(
        settings({ quickSaveCoverSource: preference }),
        tab(),
        PICTURE_WAIT,
      );
      expect(await cover?.save('b1', wanted), preference).toBe(source);
      expect(capture.mock.calls.length, preference).toBe(preference === 'page_only' ? 0 : 1);
    }
  });

  it('Retry and Save without AI take no picture, since the notification is on screen', async () => {
    metas = [];
    const cover = startQuickSaveCover(
      settings({ coversSourcePreference: 'screenshot_only' }),
      tab(),
      { ...PICTURE_WAIT, picture: false },
    );
    expect(cover).toBeNull();
    const pageFirst = startQuickSaveCover(settings(), tab(), { ...PICTURE_WAIT, picture: false });
    expect(await pageFirst?.save('b1', wanted)).toBeNull();
    expect(capture).not.toHaveBeenCalled();
  });

  it('keeps no picture of another page, or one taken after the notification may show', async () => {
    metas = [];
    vi.spyOn(fakeBrowser.tabs, 'get')
      .mockResolvedValueOnce(tab())
      .mockResolvedValue(tab({ url: 'https://news.example.com/next' }));
    const moved = startQuickSaveCover(settings(), tab(), PICTURE_WAIT);
    expect(await moved?.save('b1', wanted)).toBeNull();

    vi.useFakeTimers();
    try {
      vi.spyOn(fakeBrowser.tabs, 'get').mockResolvedValue(tab());
      let finish: (value: string) => void = () => undefined;
      capture.mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      );
      const slow = startQuickSaveCover(settings(), tab(), PICTURE_WAIT);
      await vi.advanceTimersByTimeAsync(PICTURE_WAIT.pictureWaitMs);
      await slow?.ready;
      finish(pngDataUrl(1600, 1000));
      vi.useRealTimers();
      expect(await slow?.save('b1', wanted)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
    expect(await stored()).toEqual([]);
  });

  it('keeps the cover the bookmark has, replaces it when told, and never one the user chose', async () => {
    const existing = (source: 'page' | 'tab') =>
      saveCovers(
        [
          {
            bookmarkId: 'b1',
            url: URL_SAVED,
            source,
            width: 100,
            height: 60,
            type: 'image/png',
            data: new ArrayBuffer(4),
          },
        ],
        1_000_000,
      );
    await existing('page');
    expect(
      await startQuickSaveCover(settings(), tab(), PICTURE_WAIT)?.save('b1', wanted),
    ).toBeNull();
    expect(await stored()).toEqual([{ bookmarkId: 'b1', source: 'page', width: 100 }]);

    const replace = settings({ quickSaveCoverExisting: 'replace' });
    expect(await startQuickSaveCover(replace, tab(), PICTURE_WAIT)?.save('b1', wanted)).toBe(
      'page',
    );
    expect(await stored()).toEqual([{ bookmarkId: 'b1', source: 'page', width: 320 }]);

    await existing('tab');
    expect(await startQuickSaveCover(replace, tab(), PICTURE_WAIT)?.save('b1', wanted)).toBeNull();
    expect(await stored()).toEqual([{ bookmarkId: 'b1', source: 'tab', width: 100 }]);
  });

  it('stores nothing for a quick save undone meanwhile', async () => {
    const cover = startQuickSaveCover(settings(), tab(), PICTURE_WAIT);
    expect(await cover?.save('b1', async () => false)).toBeNull();
    expect(await stored()).toEqual([]);
  });

  it('Remove cover removes only the cover quick save stored', async () => {
    const cover = startQuickSaveCover(settings(), tab(), PICTURE_WAIT);
    expect(await cover?.save('b1', wanted)).toBe('page');
    await removeQuickSaveCover('b1', URL_SAVED, 'quickSave');
    expect(await stored()).toHaveLength(1);
    await removeQuickSaveCover('b1', URL_SAVED, 'page');
    expect(await stored()).toEqual([]);
  });
});
