import { openDB } from 'idb';
import { DOMParser as LinkedomParser } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  TOOL_DEFINITIONS,
  type ToolApplyContext,
} from '@/components/bookmarks/tools/tool-definitions';
import { setLanguage } from '@/hooks/use-i18n';
import {
  COVER_CHANNEL,
  COVER_LIMITS,
  type CoverImage,
  clearCovers,
  coversOverLimit,
  fromPortableCover,
  getCoverChangeCount,
  getCoverImage,
  getCoverInfos,
  getCoverRevision,
  getCoverSummary,
  isCoverCurrent,
  isKeptCoverOf,
  pruneCovers,
  putBackCovers,
  removeCovers,
  restoreCoverRecords,
  saveCovers,
  showCoverImage,
  takeCovers,
  toPortableCover,
  watchCovers,
} from '@/lib/cover-store';
import { saveSettings } from '@/lib/settings-storage';
import { INDEXED_SAVE_BATCH_SIZE } from '@/lib/storage/indexed-batches';
import { INDEXED_DATABASES } from '@/lib/storage/registry';
import { captureTabCover, findCoverUrls, saveCoverResults, scanCovers } from '@/services/covers';
import { mayRequestFrom } from '@/services/page-reader';
import { runOutOfStorageAfter } from './indexeddb-quota';
import { PNG_SIGNATURE, pngHeader } from './png-header';

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
    source: 'page',
    type: 'image/webp',
    data: new Uint8Array(bytes).buffer,
  }) satisfies CoverImage;

describe('stored covers', () => {
  beforeEach(async () => {
    await clearCovers();
  });

  it('come back exactly as they were after Remove cover is undone, unless a new one came since', async () => {
    const image = { type: 'image/webp', data: new Uint8Array([1, 2, 3]).buffer };
    await saveCovers(
      [
        { ...cover('a', 3), source: 'tab', ...image },
        { ...cover('b', 3), source: 'browse', ...image },
      ],
      1000,
    );
    const before = await getCoverInfos();
    const taken = await takeCovers(['a', 'b', 'none']);
    expect(taken.map((record) => record.info.bookmarkId)).toEqual(['a', 'b']);
    expect((await getCoverInfos()).size).toBe(0);
    // A new cover for b arrived meanwhile: it is kept, and only a comes back.
    await saveCovers([{ ...cover('b', 4), source: 'page' }], 1000);
    expect(await putBackCovers(taken)).toBe(1);
    const after = await getCoverInfos();
    expect(after.get('a')).toEqual(before.get('a'));
    expect(after.get('b')?.source).toBe('page');
    expect((await getCoverImage('a', 'https://site.example/a'))?.size).toBe(3);
  });

  it('keep showing a cover saved before sources were recorded, as of an unknown source', async () => {
    // Written as the release before sources stored it: no `source` field.
    const db = await openDB(INDEXED_DATABASES.covers.name);
    await db.put('info', {
      bookmarkId: 'old',
      url: 'https://site.example/old',
      width: 4,
      height: 2,
      bytes: 3,
      savedAt: 1,
      version: COVER_LIMITS.version,
    });
    await db.put('images', { bookmarkId: 'old', type: 'image/webp', data: new ArrayBuffer(3) });
    db.close();
    const info = (await getCoverInfos()).get('old');
    expect(info?.source).toBe('unknown');
    expect(isCoverCurrent(info, 'https://site.example/old')).toBe(true);
    expect((await getCoverImage('old', 'https://site.example/old'))?.size).toBe(3);
    expect(await getCoverSummary()).toEqual({ covers: 1, bytes: 3 });
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
      expect(await saveCovers([cover('new', 60)], 100)).toEqual({
        saved: 1,
        notSaved: 0,
        replaced: [],
      });
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
        replaced: [],
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

  it('of deleted bookmarks are deleted with them, info and image (media review 4)', async () => {
    await saveCovers([cover('a', 5), cover('b', 5), cover('c', 5)], 1000);
    expect(await removeCovers(['a', 'c', 'never-had-one'])).toBe(2);
    expect([...(await getCoverInfos()).keys()]).toEqual(['b']);
    expect(await getCoverImage('a', 'https://site.example/a')).toBeUndefined();
    expect(await removeCovers([])).toBe(0);
  });

  it('a cover found automatically never replaces one the user chose for that address, checked when it is written (media review 2)', async () => {
    const url = 'https://site.example/a';
    await saveCovers([{ ...cover('a', 7, url), source: 'tab' }], 1000);
    // A review, a picture while browsing, and quick save that all checked before the pick.
    for (const source of ['page', 'browse', 'quickSave'] as const) {
      expect(await saveCovers([{ ...cover('a', 9, url), source }], 1000)).toEqual({
        saved: 0,
        notSaved: 0,
        replaced: [],
      });
    }
    expect((await getCoverInfos()).get('a')?.source).toBe('tab');
    expect((await getCoverImage('a', url))?.size).toBe(7);
    // The user's own new pick replaces it, and an automatic cover of another address may.
    expect((await saveCovers([{ ...cover('a', 8, url), source: 'tab' }], 1000)).saved).toBe(1);
    const moved = 'https://site.example/moved';
    expect((await saveCovers([{ ...cover('a', 4, moved), source: 'page' }], 1000)).saved).toBe(1);
    expect((await getCoverInfos()).get('a')).toMatchObject({ url: moved, source: 'page' });
  });

  it('a chosen cover stays chosen whatever version made it (media review 14)', async () => {
    const url = 'https://site.example/a';
    await saveCovers([{ ...cover('a', 3, url), source: 'tab' }], 1000);
    const [record] = await takeCovers(['a']);
    if (!record) throw new Error('no cover');
    // Stored by a release that made covers another way (`version` in config/bookmarks/covers.toml).
    const info = { ...record.info, source: 'tab' as const, version: COVER_LIMITS.version + 1 };
    await restoreCoverRecords([{ info, image: record.image }], 1000);
    const stored = (await getCoverInfos()).get('a');
    expect(isCoverCurrent(stored, url)).toBe(false);
    expect(isKeptCoverOf(stored, url)).toBe(true);
    expect(isKeptCoverOf(stored, 'https://site.example/other')).toBe(false);
    expect((await saveCovers([{ ...cover('a', 9, url), source: 'page' }], 1000)).saved).toBe(0);
  });

  it('past the storage limit go oldest first, and covers the user chose last (media review 3)', async () => {
    const infos = [
      { bookmarkId: 'picked-old', bytes: 40, savedAt: 1, source: 'tab' as const },
      { bookmarkId: 'page-new', bytes: 40, savedAt: 3, source: 'page' as const },
      { bookmarkId: 'browse-mid', bytes: 40, savedAt: 2, source: 'browse' as const },
    ];
    expect(coversOverLimit(infos, 80)).toEqual(new Set(['browse-mid']));
    expect(coversOverLimit(infos, 40)).toEqual(new Set(['browse-mid', 'page-new']));
    // Only chosen covers left: the oldest of them go first.
    const picked = [
      { bookmarkId: 'p1', bytes: 40, savedAt: 1, source: 'tab' as const },
      { bookmarkId: 'p2', bytes: 40, savedAt: 2, source: 'tab' as const },
    ];
    expect(coversOverLimit(picked, 40)).toEqual(new Set(['p1']));

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(1000);
      await saveCovers([{ ...cover('picked', 60), source: 'tab' }], 100);
      vi.setSystemTime(2000);
      await saveCovers([cover('newer', 30)], 100);
      vi.setSystemTime(3000);
      await saveCovers([cover('newest', 30)], 100);
    } finally {
      vi.useRealTimers();
    }
    expect([...(await getCoverInfos()).keys()].sort()).toEqual(['newest', 'picked']);
  });

  it('a save says which cover of the same address it replaced, as stored, to put back (media review 10)', async () => {
    const url = 'https://site.example/a';
    await saveCovers([{ ...cover('a', 6, url), source: 'browse' }], 1000);
    const before = await takeCovers(['a']);
    await putBackCovers(before);
    const { saved, replaced } = await saveCovers(
      [{ ...cover('a', 9, url), source: 'quickSave' }, cover('b', 2)],
      1000,
      { keepReplaced: true },
    );
    expect(saved).toBe(2);
    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.info).toEqual(before[0]?.info);
    // Kept as JSON (the last quick save) and read back, it is the same cover.
    const [first] = replaced;
    if (!first) throw new Error('no replaced cover');
    const portable = JSON.parse(JSON.stringify(toPortableCover(first)));
    const back = fromPortableCover(portable);
    expect(back?.info).toEqual(first.info);
    expect(new Uint8Array(back?.image.data ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array(first.image.data),
    );
    expect(fromPortableCover({ ...portable, data: 'AAAA' })).toBeUndefined();
    // Without `keepReplaced` nothing is read back.
    expect((await saveCovers([cover('a', 3, url)], 1000)).replaced).toEqual([]);
  });
});

describe('cover changes heard by open pages (media review 13)', () => {
  beforeEach(async () => {
    await clearCovers();
  });

  it('name the bookmarks whose cover changed, so a card reloads only its own', async () => {
    const stop = watchCovers(() => undefined);
    try {
      await saveCovers([cover('a', 5), cover('b', 5)], 1000);
      const a = getCoverRevision('a');
      const b = getCoverRevision('b');
      const all = getCoverChangeCount();
      await saveCovers([cover('a', 6)], 1000);
      expect(getCoverRevision('a')).toBe(a + 1);
      expect(getCoverRevision('b')).toBe(b);
      expect(getCoverChangeCount()).toBe(all + 1);
      await removeCovers(['b']);
      expect(getCoverRevision('a')).toBe(a + 1);
      expect(getCoverRevision('b')).toBe(b + 1);
      // Delete covers changes every cover.
      await clearCovers();
      expect(getCoverRevision('a')).toBe(a + 2);
      expect(getCoverRevision('untouched')).toBeGreaterThan(0);

      // Another page's message: its ids, or every cover for one that names none.
      const other = new BroadcastChannel(COVER_CHANNEL);
      const before = { a: getCoverRevision('a'), b: getCoverRevision('b') };
      other.postMessage({ ids: ['b'] });
      await vi.waitFor(() => expect(getCoverRevision('b')).toBe(before.b + 1));
      expect(getCoverRevision('a')).toBe(before.a);
      other.postMessage('changed');
      await vi.waitFor(() => expect(getCoverRevision('a')).toBe(before.a + 1));
      other.close();
    } finally {
      stop();
    }
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

const PNG = pngHeader(1200, 630);
const OPTIONS = {
  widthPx: 320,
  quality: 0.8,
  maxImageBytes: 1000,
  skipPrivateHosts: true,
  maxCacheBytes: 1_000_000,
  preference: 'page_first',
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
        const image = (body: Uint8Array) =>
          new Response(body as BodyInit, { status: 200, headers: { 'content-type': 'image/png' } });
        if (url.hostname === 'down.example') throw new TypeError('Failed to fetch');
        if (url.pathname.endsWith('.html.png')) {
          // An error page served where the page said its image is.
          return new Response('<html>Not found</html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          });
        }
        // Small files that state a picture past `max_pixels`, or no size at all.
        if (url.pathname === '/bomb.png') return image(pngHeader(40_000, 40_000));
        if (url.pathname === '/headless.png') return image(new Uint8Array(PNG_SIGNATURE));
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
        if (url.hostname === 'bomb.example') return html(head('/bomb.png'));
        if (url.hostname === 'headless.example') return html(head('/headless.png'));
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
    expect(found?.cover).toMatchObject({
      width: 320,
      height: 168,
      type: COVER_LIMITS.outputType,
      source: 'page',
    });
    // The run keeps each image once: the review draws it from these bytes, not from a copy.
    expect(found).not.toHaveProperty('preview');
    expect(found?.cover?.data.byteLength).toBeGreaterThan(0);
    expect(items.find((item) => item.id === 'elsewhere')?.imageSite).toBe('other.net');
  });

  it('stops reading pages once it has found max_found_per_run covers, and counts the rest (media review 1)', async () => {
    const limits = COVER_LIMITS as { maxFoundPerRun: number };
    const cap = limits.maxFoundPerRun;
    limits.maxFoundPerRun = 2;
    try {
      const nodes = Array.from({ length: 6 }, (_, index) =>
        node(`p${index}`, `https://p${index}.example/`),
      );
      const result = await scanCovers(nodes, OPTIONS);
      expect(result.items.filter((item) => item.status === 'found')).toHaveLength(2);
      expect(result.items.every((item) => item.status !== 'found' || item.cover)).toBe(true);
      expect(result.overLimit).toBe(4);
      expect(result.items.length + (result.overLimit ?? 0)).toBe(6);
      // Under the cap nothing is left out.
      expect((await scanCovers(nodes.slice(0, 2), OPTIONS)).overLimit).toBeUndefined();
    } finally {
      limits.maxFoundPerRun = cap;
    }
  });

  it('never fetches over a cover chosen with Use this view as the cover, and says it is kept', async () => {
    const url = 'https://news.example/story';
    await saveCovers([{ ...cover('chosen', 5, url), source: 'tab' }], 1000);
    for (const preference of ['page_first', 'page_only', 'screenshot_first']) {
      const { items } = await scanCovers([node('chosen', url)], { ...OPTIONS, preference });
      expect(items[0]?.status).toBe('kept');
    }
    // Also when covers are now made another way (media review 14).
    const [record] = await takeCovers(['chosen']);
    if (!record) throw new Error('no cover');
    const info = { ...record.info, source: 'tab' as const, version: COVER_LIMITS.version + 1 };
    await restoreCoverRecords([{ info, image: record.image }], 1000);
    const { items } = await scanCovers([node('chosen', url)], OPTIONS);
    expect(items[0]?.status).toBe('kept');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('fetches only the chosen bookmarks with Fetch Cover, and lists nothing else', async () => {
    const tree = [
      {
        id: 'f',
        parentId: '1',
        title: 'Folder',
        children: [
          node('chosen', 'https://news.example/story'),
          node('other', 'https://plain.example/'),
          node('also', 'https://kept.example/'),
        ],
      },
    ];
    const { items } = await scanCovers(tree, OPTIONS, new Set(['chosen']));
    expect(items.map((item) => [item.id, item.status])).toEqual([['chosen', 'found']]);
    const requested = vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input)).host);
    expect(new Set(requested)).toEqual(new Set(['news.example']));
  });

  it('fetches over a picture of the tab only when Cover Source ranks the page image first', async () => {
    const url = 'https://news.example/story';
    await saveCovers([{ ...cover('shot', 5, url), source: 'browse' }], 1000);
    const statusWith = async (preference: string) =>
      (await scanCovers([node('shot', url)], { ...OPTIONS, preference })).items[0]?.status;
    expect(await statusWith('page_first')).toBe('found');
    expect(await statusWith('page_only')).toBe('found');
    expect(await statusWith('screenshot_first')).toBe('current');
  });

  it('reads no page with Screenshot only, and the result says page images are off', async () => {
    const url = 'https://news.example/story';
    const result = await scanCovers([node('shot', url)], {
      ...OPTIONS,
      preference: 'screenshot_only',
    });
    expect(result.pageImagesOff).toBe(true);
    expect(result.items.map((item) => item.status)).toEqual(['skipped']);
    expect(fetch).not.toHaveBeenCalled();
    expect((await scanCovers([node('shot', url)], OPTIONS)).pageImagesOff).toBeUndefined();
  });

  it('writes each cover at the Cover Image Quality', async () => {
    const qualities: number[] = [];
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return { drawImage: () => undefined };
        }
        async convertToBlob(options: { type: string; quality: number }) {
          qualities.push(options.quality);
          return new Blob([new Uint8Array(42)], { type: options.type });
        }
      },
    );
    await scanCovers([node('a', 'https://news.example/a')], { ...OPTIONS, quality: 0.55 });
    expect(qualities).toEqual([0.55]);
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
        // Its likely target, the www. address, redirects too, so it is a wrong guess.
        if (input === 'https://hidden.example/' || input === 'https://www.hidden.example/') {
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
      'https://www.hidden.example/',
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

  it('refuses an image whose header states a huge picture or no size, before decoding it (V2)', async () => {
    let decodes = 0;
    vi.stubGlobal('createImageBitmap', async () => {
      decodes += 1;
      return { ...decoded, close: () => undefined };
    });
    expect(40_000 * 40_000).toBeGreaterThan(COVER_LIMITS.maxPixels);
    const { items } = await scanCovers(
      [node('bomb', 'https://bomb.example/'), node('headless', 'https://headless.example/')],
      OPTIONS,
    );
    expect(items.map((item) => [item.id, item.status])).toEqual([
      ['bomb', 'unusable'],
      ['headless', 'unusable'],
    ]);
    expect(decodes).toBe(0);
    // A header that states a cover size is decoded, and the decoded size is checked again.
    decoded = { width: 40_000, height: 40_000 };
    const checked = await scanCovers([node('lying', 'https://news.example/story')], OPTIONS);
    expect(checked.items[0]?.status).toBe('unusable');
    expect(decodes).toBe(1);
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
  const IMAGE = { widthPx: 320, quality: 0.8 };
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
    const result = await captureTabCover(URL_SAVED, IMAGE);
    expect(capture).toHaveBeenCalledWith(1, { format: 'png' });
    if (!('cover' in result)) throw new Error(result.error);
    expect(
      result.cover.covers.map((cover) => [
        cover.bookmarkId,
        cover.width,
        cover.height,
        cover.source,
      ]),
    ).toEqual([
      ['b1', 320, 200, 'tab'],
      ['b2', 320, 200, 'tab'],
    ]);
    expect(result.cover.preview).toMatch(/^data:image\//);
  });

  it('takes no picture of another page, or of a private window', async () => {
    const capture = vi.spyOn(fakeBrowser.tabs, 'captureVisibleTab');
    vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([tab({ url: 'https://other.example/' })]);
    expect(await captureTabCover(URL_SAVED, IMAGE)).toEqual({ error: 'changed' });
    vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([tab({ incognito: true })]);
    expect(await captureTabCover(URL_SAVED, IMAGE)).toEqual({ error: 'private' });
    expect(capture).not.toHaveBeenCalled();
  });

  it('drops a picture when the tab moved on while it was taken, or the browser refused', async () => {
    const query = vi
      .spyOn(fakeBrowser.tabs, 'query')
      .mockResolvedValueOnce([tab()])
      .mockResolvedValueOnce([tab({ url: 'https://other.example/' })]);
    vi.spyOn(fakeBrowser.tabs, 'captureVisibleTab').mockResolvedValue(PNG_DATA_URL as never);
    expect(await captureTabCover(URL_SAVED, IMAGE)).toEqual({ error: 'changed' });
    query.mockResolvedValue([tab()]);
    vi.spyOn(fakeBrowser.tabs, 'captureVisibleTab').mockRejectedValue(new Error('no access'));
    expect(await captureTabCover(URL_SAVED, IMAGE)).toEqual({ error: 'denied' });
  });
});
