import { DOMParser as LinkedomParser } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  TOOL_DEFINITIONS,
  type ToolApplyContext,
} from '@/components/bookmarks/tools/tool-definitions';
import { setLanguage } from '@/hooks/use-i18n';
import {
  COVER_LIMITS,
  type CoverImage,
  clearCovers,
  getCoverImage,
  getCoverInfos,
  getCoverSummary,
  isCoverCurrent,
  pruneCovers,
  saveCovers,
  showCoverImage,
} from '@/lib/cover-store';
import { saveSettings } from '@/lib/settings-storage';
import { INDEXED_SAVE_BATCH_SIZE } from '@/lib/storage/indexed-batches';
import { captureTabCover, findCoverUrls, saveCoverResults, scanCovers } from '@/services/covers';
import { mayRequestFrom } from '@/services/page-reader';
import { runOutOfStorageAfter } from './indexeddb-quota';

const PAGE = 'https://news.example.com/story/1';

describe('cover candidates in a page head', () => {
  beforeEach(() => vi.stubGlobal('DOMParser', LinkedomParser));

  it('takes Open Graph before Twitter cards, resolved against the page, web URLs only', () => {
    const html = [
      '<html><head>',
      '<meta name="twitter:image" content="https://cdn.example.net/card.jpg">',
      '<meta property="og:image" content="/cover.jpg#top">',
      '<meta property="og:image" content="javascript:alert(1)">',
      '<meta property="og:image" content="data:image/png;base64,AAAA">',
      '</head><body></body></html>',
    ].join('');
    expect(findCoverUrls(html, PAGE)).toEqual([
      'https://news.example.com/cover.jpg',
      'https://cdn.example.net/card.jpg',
    ]);
  });

  it('finds nothing in a page that names no image', () => {
    expect(findCoverUrls('<html><head><title>Plain</title></head></html>', PAGE)).toEqual([]);
  });
});

describe('where a cover may be downloaded from', () => {
  const noAccess = async () => false;

  it('allows the site of the page, including its other subdomains', async () => {
    expect(await mayRequestFrom('https://img.example.com/a.jpg', PAGE, true, noAccess)).toBe(true);
  });

  it('refuses another site unless the user gave access to it', async () => {
    const image = 'https://cdn.example.net/a.jpg';
    expect(await mayRequestFrom(image, PAGE, true, noAccess)).toBe(false);
    expect(await mayRequestFrom(image, PAGE, true, async (site) => site === 'example.net')).toBe(
      true,
    );
  });

  it('refuses the local network while Skip Local Network Pages is on, and other schemes', async () => {
    const granted = async () => true;
    expect(await mayRequestFrom('http://192.168.1.4/a.jpg', PAGE, true, granted)).toBe(false);
    expect(await mayRequestFrom('http://192.168.1.4/a.jpg', PAGE, false, granted)).toBe(true);
    expect(await mayRequestFrom('file:///etc/a.jpg', PAGE, false, granted)).toBe(false);
  });
});

const cover = (bookmarkId: string, bytes: number, url = `https://site.example/${bookmarkId}`) =>
  ({
    bookmarkId,
    url,
    width: 4,
    height: 2,
    type: 'image/webp',
    data: new Uint8Array(bytes).buffer,
  }) satisfies CoverImage;

describe('stored covers', () => {
  beforeEach(async () => {
    await clearCovers();
  });

  it('belong to the address they were fetched from', async () => {
    await saveCovers([cover('a', 10)], 1000);
    const info = (await getCoverInfos()).get('a');
    expect(isCoverCurrent(info, 'https://site.example/a')).toBe(true);
    expect(isCoverCurrent(info, 'https://site.example/moved')).toBe(false);
    expect((await getCoverImage('a', 'https://site.example/a'))?.size).toBe(10);
    expect(await getCoverImage('a', 'https://site.example/moved')).toBeUndefined();
  });

  it('remove the oldest past the storage limit', async () => {
    // Only the clock: IndexedDB needs real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(1000);
      await saveCovers([cover('old', 60)], 100);
      vi.setSystemTime(2000);
      expect(await saveCovers([cover('new', 60)], 100)).toEqual({ saved: 1, notSaved: 0 });
    } finally {
      vi.useRealTimers();
    }
    expect([...(await getCoverInfos()).keys()]).toEqual(['new']);
    expect(await getCoverSummary()).toEqual({ covers: 1, bytes: 60 });
  });

  it('keep the covers stored before storage ran out, each with its image, and count the rest', async () => {
    await saveCovers([cover('kept', 5)], 1_000_000);
    const covers = Array.from({ length: INDEXED_SAVE_BATCH_SIZE + 2 }, (_, index) =>
      cover(`c${index}`, 3),
    );
    // Two writes a cover (its info and its image): storage runs out inside the second batch.
    const full = runOutOfStorageAfter(INDEXED_SAVE_BATCH_SIZE * 2 + 1);
    try {
      expect(await saveCovers(covers, 1_000_000)).toEqual({
        saved: INDEXED_SAVE_BATCH_SIZE,
        notSaved: 2,
      });
    } finally {
      full.mockRestore();
    }
    const infos = await getCoverInfos();
    expect(infos.size).toBe(INDEXED_SAVE_BATCH_SIZE + 1);
    expect(infos.has(`c${INDEXED_SAVE_BATCH_SIZE}`)).toBe(false);
    // No info is left without its image.
    for (const id of infos.keys()) {
      expect(await getCoverImage(id, `https://site.example/${id}`)).toBeDefined();
    }
  });

  it('drop covers of bookmarks that are gone, and clear without touching anything else', async () => {
    await saveCovers([cover('a', 5), cover('gone', 5)], 1000);
    expect(await pruneCovers(new Set(['a']))).toBe(1);
    expect([...(await getCoverInfos()).keys()]).toEqual(['a']);
    await clearCovers();
    expect(await getCoverSummary()).toEqual({ covers: 0, bytes: 0 });
  });
});

describe('a cover shown on a card (Visual Cards V27)', () => {
  const image = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
  let made: string[];
  let revoked: string[];

  beforeEach(() => {
    made = [];
    revoked = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:cover-${made.length + 1}`;
      made.push(url);
      return url;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
      revoked.push(url);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('revokes its image when the card goes away', async () => {
    const show = vi.fn();
    const stop = showCoverImage(async () => image, show);
    await vi.waitFor(() => expect(show).toHaveBeenCalledWith('blob:cover-1'));
    stop();
    expect(revoked).toEqual(['blob:cover-1']);
  });

  it('makes no image for a read still running when the card goes away', async () => {
    let finish: (blob: Blob) => void = () => {};
    const show = vi.fn();
    const stop = showCoverImage(() => new Promise<Blob>((resolve) => (finish = resolve)), show);
    stop();
    finish(image);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(show).not.toHaveBeenCalled();
    expect(made).toEqual([]);
  });

  it('shows nothing without a cover or when the read fails', async () => {
    const none = vi.fn();
    showCoverImage(async () => undefined, none);
    const failed = vi.fn();
    showCoverImage(async () => Promise.reject(new Error('quota')), failed);
    await vi.waitFor(() => {
      expect(none).toHaveBeenCalledWith(undefined);
      expect(failed).toHaveBeenCalledWith(undefined);
    });
    expect(made).toEqual([]);
  });
});

/** The first bytes of a PNG, enough for the type check; decoding is stubbed below. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const OPTIONS = {
  widthPx: 320,
  maxImageBytes: 1000,
  skipPrivateHosts: true,
  maxCacheBytes: 1_000_000,
};

const head = (image: string) =>
  `<html><head><meta property="og:image" content="${image}"></head><body></body></html>`;

describe('Fetch Covers runs', () => {
  let decoded: { width: number; height: number };

  beforeEach(async () => {
    await clearCovers();
    decoded = { width: 1200, height: 630 };
    vi.stubGlobal('DOMParser', LinkedomParser);
    vi.stubGlobal('createImageBitmap', async () => ({ ...decoded, close: () => undefined }));
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
          return new Blob([new Uint8Array(42)], { type });
        }
      },
    );
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = new URL(input);
        const html = (body: string) =>
          new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
        if (url.hostname === 'down.example') throw new TypeError('Failed to fetch');
        if (url.pathname.endsWith('.html.png')) {
          // An error page served where the page said its image is.
          return new Response('<html>Not found</html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          });
        }
        if (url.pathname.endsWith('.png')) {
          const size = url.pathname.includes('huge') ? 5000 : PNG.byteLength;
          return new Response(size === PNG.byteLength ? PNG : new Uint8Array(size), {
            status: 200,
            headers: { 'content-type': 'image/png', 'content-length': String(size) },
          });
        }
        if (url.pathname.endsWith('.svg')) {
          return new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
            status: 200,
            headers: { 'content-type': 'image/svg+xml' },
          });
        }
        if (url.hostname === 'plain.example') return html('<html><head></head></html>');
        if (url.hostname === 'cdn.example') return html(head('https://cdn.other.net/a.png'));
        if (url.hostname === 'huge.example') return html(head('/huge.png'));
        if (url.hostname === 'svg.example') return html(head('/logo.svg'));
        if (url.hostname === 'wrongtype.example') return html(head('/error.html.png'));
        if (url.hostname === 'tiny.example') return html(head('/tiny.png'));
        return html(head('/cover.png'));
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const node = (id: string, url: string) => ({ id, parentId: 'f', title: id, url });

  it('keeps a shrunk copy of a same-site image and sorts every other page', async () => {
    await saveCovers([cover('kept', 5, 'https://kept.example/')], 1000);
    const { items } = await scanCovers(
      [
        {
          id: 'f',
          parentId: '1',
          title: 'Folder',
          children: [
            node('found', 'https://news.example/story'),
            node('none', 'https://plain.example/'),
            node('elsewhere', 'https://cdn.example/'),
            node('huge', 'https://huge.example/'),
            node('svg', 'https://svg.example/'),
            node('wrongtype', 'https://wrongtype.example/'),
            node('down', 'https://down.example/'),
            node('kept', 'https://kept.example/'),
            node('local', 'http://192.168.1.1/'),
          ],
        },
      ],
      OPTIONS,
    );
    const status = Object.fromEntries(items.map((item) => [item.id, item.status]));
    expect(status).toEqual({
      found: 'found',
      none: 'none',
      elsewhere: 'elsewhere',
      huge: 'unusable',
      svg: 'unusable',
      wrongtype: 'unusable',
      down: 'failed',
      kept: 'current',
      local: 'skipped',
    });
    const found = items.find((item) => item.id === 'found');
    expect(found?.cover).toMatchObject({ width: 320, height: 168, type: COVER_LIMITS.outputType });
    expect(found?.preview).toMatch(/^data:image\//);
    expect(items.find((item) => item.id === 'elsewhere')?.imageSite).toBe('other.net');
  });

  it('never follows a redirect for an image, and tries the next one the page names', async () => {
    const inner = vi.mocked(fetch).getMockImplementation();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        if (url.hostname === 'moved.example' && url.pathname === '/') {
          return new Response(
            '<html><head><meta property="og:image" content="/moved.png">' +
              '<meta name="twitter:image" content="/cover.png"></head></html>',
            { status: 200, headers: { 'content-type': 'text/html' } },
          );
        }
        if (url.pathname.endsWith('.png')) expect(init?.redirect).toBe('error');
        // The browser rejects a redirect it was told not to follow.
        if (url.pathname === '/moved.png') throw new TypeError('Failed to fetch');
        return inner?.(input, init) as Promise<Response>;
      }),
    );
    const { items } = await scanCovers([node('moved', 'https://moved.example/')], OPTIONS);
    expect(items[0]?.status).toBe('found');
  });

  it('lists an image the browser cannot decode as unusable, and still tries the next one', async () => {
    let decodes = 0;
    vi.stubGlobal('createImageBitmap', async () => {
      decodes += 1;
      throw new DOMException('The source image could not be decoded.', 'InvalidStateError');
    });
    const { items } = await scanCovers([node('broken', 'https://news.example/story')], OPTIONS);
    expect(items[0]?.status).toBe('unusable');
    expect(items[0]?.cover).toBeUndefined();
    expect(decodes).toBe(1);

    // A broken first image does not hide a good second one.
    let calls = 0;
    vi.stubGlobal('createImageBitmap', async () => {
      calls += 1;
      if (calls === 1) throw new DOMException('broken', 'InvalidStateError');
      return { ...decoded, close: () => undefined };
    });
    const inner = vi.mocked(fetch).getMockImplementation();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) =>
        new URL(input).hostname === 'two.example' && new URL(input).pathname === '/'
          ? new Response(
              '<html><head><meta property="og:image" content="/a.png">' +
                '<meta name="twitter:image" content="/b.png"></head></html>',
              { status: 200, headers: { 'content-type': 'text/html' } },
            )
          : (inner?.(input, init) as Promise<Response>),
      ),
    );
    const second = await scanCovers([node('two', 'https://two.example/')], OPTIONS);
    expect(second.items[0]?.status).toBe('found');
  });

  it('lists a page that redirects as redirected, without requesting where it leads', async () => {
    const requested: string[] = [];
    const inner = vi.mocked(fetch).getMockImplementation();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        requested.push(input);
        if (input === 'https://local.example/') {
          return new Response(null, { status: 302, headers: { location: 'http://10.0.0.2/' } });
        }
        if (input === 'https://away.example/') {
          return new Response(null, {
            status: 307,
            headers: { location: 'https://cdn.other.net/' },
          });
        }
        if (input === 'https://hidden.example/') {
          // What Chrome and Firefox return to an extension for `redirect: 'manual'`.
          const opaque = new Response(null, { status: 200 });
          Object.defineProperty(opaque, 'type', { value: 'opaqueredirect' });
          Object.defineProperty(opaque, 'status', { value: 0 });
          return opaque;
        }
        return inner?.(input, init) as Promise<Response>;
      }),
    );
    const { items } = await scanCovers(
      [
        node('local', 'https://local.example/'),
        node('away', 'https://away.example/'),
        node('hidden', 'https://hidden.example/'),
      ],
      OPTIONS,
    );
    expect(items.map((item) => item.status)).toEqual(['redirected', 'redirected', 'redirected']);
    expect(requested.sort()).toEqual([
      'https://away.example/',
      'https://hidden.example/',
      'https://local.example/',
    ]);
  });

  it('reports a save cut short by full storage as partial, never as saved', async () => {
    await saveSettings({ language: 'en' });
    setLanguage('en');
    vi.spyOn(fakeBrowser.bookmarks, 'getTree').mockResolvedValue([
      { id: '0', title: '', syncing: false, children: [] },
    ]);
    const picked = [
      {
        id: 'a',
        title: 'A',
        url: 'https://site.example/a',
        folderPath: '',
        status: 'found' as const,
        cover: cover('a', 7),
      },
    ];
    const full = runOutOfStorageAfter(0);
    let outcome: Awaited<ReturnType<NonNullable<typeof TOOL_DEFINITIONS.covers.apply>>>;
    try {
      outcome = await TOOL_DEFINITIONS.covers.apply?.({ items: picked }, picked, {
        options: { covers: { maxCacheBytes: 1000 } },
      } as ToolApplyContext);
    } finally {
      full.mockRestore();
    }
    expect(outcome).toEqual({
      title: 'Some covers were not saved',
      description:
        "Saved: 0. Not saved because this device's storage for the extension is full: 1. " +
        'Free up disk space or delete covers in Settings, then fetch again.',
      variant: 'destructive',
    });
    expect(await getCoverSummary()).toEqual({ covers: 0, bytes: 0 });
  });

  it('leaves out an image too small to be a cover', async () => {
    decoded = { width: COVER_LIMITS.minWidthPx - 1, height: 10 };
    const { items } = await scanCovers([node('tiny', 'https://tiny.example/')], OPTIONS);
    expect(items[0]?.status).toBe('none');
  });

  it('stores only the covers left on Save, and drops those of bookmarks that are gone', async () => {
    await saveCovers([cover('gone', 5)], 1000);
    vi.spyOn(fakeBrowser.bookmarks, 'getTree').mockResolvedValue([
      {
        id: '0',
        title: '',
        syncing: false,
        children: [
          { id: 'a', parentId: '0', title: 'A', url: 'https://site.example/a', syncing: false },
        ],
      },
    ]);
    const { saved, notSaved } = await saveCoverResults(
      [
        {
          id: 'a',
          title: 'A',
          url: 'https://site.example/a',
          folderPath: '',
          status: 'found',
          cover: cover('a', 7),
        },
        { id: 'b', title: 'B', url: 'https://site.example/b', folderPath: '', status: 'none' },
      ],
      1000,
    );
    expect([saved, notSaved]).toEqual([1, 0]);
    expect([...(await getCoverInfos()).keys()]).toEqual(['a']);
  });
});

describe('Use this view as the cover', () => {
  const URL_SAVED = 'https://news.example.com/story';
  const PNG_DATA_URL = `data:image/png;base64,${btoa(String.fromCharCode(...PNG))}`;
  type Tab = Browser.tabs.Tab;
  const tab = (overrides: Partial<Tab> = {}) =>
    ({ id: 7, windowId: 1, url: URL_SAVED, incognito: false, ...overrides }) as Tab;

  beforeEach(() => {
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
      { id: 'b1', title: 'Story', url: URL_SAVED, syncing: false },
      { id: 'b2', title: 'Story again', url: URL_SAVED, syncing: false },
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('pictures the tab, shrunk, for every bookmark of its address', async () => {
    vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([tab()]);
    const capture = vi
      .spyOn(fakeBrowser.tabs, 'captureVisibleTab')
      .mockResolvedValue(PNG_DATA_URL as never);
    const result = await captureTabCover(URL_SAVED, 320);
    expect(capture).toHaveBeenCalledWith(1, { format: 'png' });
    if (!('cover' in result)) throw new Error(result.error);
    expect(
      result.cover.covers.map((cover) => [cover.bookmarkId, cover.width, cover.height]),
    ).toEqual([
      ['b1', 320, 200],
      ['b2', 320, 200],
    ]);
    expect(result.cover.preview).toMatch(/^data:image\//);
  });

  it('takes no picture of another page, or of a private window', async () => {
    const capture = vi.spyOn(fakeBrowser.tabs, 'captureVisibleTab');
    vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([tab({ url: 'https://other.example/' })]);
    expect(await captureTabCover(URL_SAVED, 320)).toEqual({ error: 'changed' });
    vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([tab({ incognito: true })]);
    expect(await captureTabCover(URL_SAVED, 320)).toEqual({ error: 'private' });
    expect(capture).not.toHaveBeenCalled();
  });

  it('drops a picture when the tab moved on while it was taken, or the browser refused', async () => {
    const query = vi
      .spyOn(fakeBrowser.tabs, 'query')
      .mockResolvedValueOnce([tab()])
      .mockResolvedValueOnce([tab({ url: 'https://other.example/' })]);
    vi.spyOn(fakeBrowser.tabs, 'captureVisibleTab').mockResolvedValue(PNG_DATA_URL as never);
    expect(await captureTabCover(URL_SAVED, 320)).toEqual({ error: 'changed' });
    query.mockResolvedValue([tab()]);
    vi.spyOn(fakeBrowser.tabs, 'captureVisibleTab').mockRejectedValue(new Error('no access'));
    expect(await captureTabCover(URL_SAVED, 320)).toEqual({ error: 'denied' });
  });
});
