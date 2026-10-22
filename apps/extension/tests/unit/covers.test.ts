import { DOMParser as LinkedomParser } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
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
} from '@/lib/cover-store';
import { findCoverUrls, mayFetchCover, saveCoverResults, scanCovers } from '@/services/covers';

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
    expect(await mayFetchCover('https://img.example.com/a.jpg', PAGE, true, noAccess)).toBe(true);
  });

  it('refuses another site unless the user gave access to it', async () => {
    const image = 'https://cdn.example.net/a.jpg';
    expect(await mayFetchCover(image, PAGE, true, noAccess)).toBe(false);
    expect(await mayFetchCover(image, PAGE, true, async (site) => site === 'example.net')).toBe(
      true,
    );
  });

  it('refuses the local network while Skip Local Network Pages is on, and other schemes', async () => {
    const granted = async () => true;
    expect(await mayFetchCover('http://192.168.1.4/a.jpg', PAGE, true, granted)).toBe(false);
    expect(await mayFetchCover('http://192.168.1.4/a.jpg', PAGE, false, granted)).toBe(true);
    expect(await mayFetchCover('file:///etc/a.jpg', PAGE, false, granted)).toBe(false);
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
      expect(await saveCovers([cover('new', 60)], 100)).toBe(1);
    } finally {
      vi.useRealTimers();
    }
    expect([...(await getCoverInfos()).keys()]).toEqual(['new']);
    expect(await getCoverSummary()).toEqual({ covers: 1, bytes: 60 });
  });

  it('drop covers of bookmarks that are gone, and clear without touching anything else', async () => {
    await saveCovers([cover('a', 5), cover('gone', 5)], 1000);
    expect(await pruneCovers(new Set(['a']))).toBe(1);
    expect([...(await getCoverInfos()).keys()]).toEqual(['a']);
    await clearCovers();
    expect(await getCoverSummary()).toEqual({ covers: 0, bytes: 0 });
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
      huge: 'none',
      svg: 'none',
      down: 'failed',
      kept: 'current',
      local: 'skipped',
    });
    const found = items.find((item) => item.id === 'found');
    expect(found?.cover).toMatchObject({ width: 320, height: 168, type: COVER_LIMITS.outputType });
    expect(found?.preview).toMatch(/^data:image\//);
    expect(items.find((item) => item.id === 'elsewhere')?.imageSite).toBe('other.net');
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
    const { saved } = await saveCoverResults(
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
    expect(saved).toBe(1);
    expect([...(await getCoverInfos()).keys()]).toEqual(['a']);
  });
});
