import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  clearSiteIconCache,
  fitSiteIconCache,
  getSiteIconCache,
  normalizeSiteIconCache,
  saveSiteIcons,
} from '@/lib/site-icon-storage';
import { getSiteIconUrl } from '@/services/bookmarks';
import {
  getSavableSiteIcons,
  isImageContentType,
  parseIconCandidates,
  rankIconCandidates,
  refreshSiteIcons,
  selectIconUrls,
  sniffImageType,
  toDataUrl,
} from '@/services/site-icons';
import { lookupSiteIcon } from '@/stores/site-icon-store';
import type { BookmarkTreeNode } from '@/types';
import { STORAGE_KEYS } from '@/lib/storage-keys';

const SITE_ICON_STORAGE_KEY = STORAGE_KEYS.siteIcons.replace(/^local:/, '');

const PNG_BYTES = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (char) => char.charCodeAt(0),
);
const PNG_DATA_URL = toDataUrl(PNG_BYTES, 'image/png');
const ICO_BYTES = new Uint8Array([0, 0, 1, 0, 1, 0, 16, 16]);

function folder(urls: Record<string, string>): BookmarkTreeNode[] {
  return [
    {
      id: 'root',
      title: 'Folder',
      children: Object.entries(urls).map(([id, url]) => ({ id, title: id, url })),
    },
  ];
}

const refreshOptions = {
  preferredSize: 32,
  maxIconBytes: 64 * 1024,
  requestTimeoutMs: 1000,
  concurrency: 2,
};

type Route = { status?: number; type?: string; body?: BodyInit; headers?: Record<string, string> };

function stubSite(routes: Record<string, Route | 'fail'>) {
  const requests: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    requests.push(url);
    const route = routes[url];
    if (route === 'fail') throw new TypeError('Failed to fetch');
    if (!route) return new Response('missing', { status: 404 });
    return new Response(route.body ?? '', {
      status: route.status ?? 200,
      headers: { ...(route.type ? { 'content-type': route.type } : {}), ...route.headers },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return requests;
}

describe('icon candidate parsing', () => {
  it('parses icon links, honors base href, and ignores comments and mask icons', () => {
    const html = `
      <head>
        <base href="https://cdn.example.com/assets/">
        <!-- <link rel="icon" href="/commented.png"> -->
        <link rel="mask-icon" href="/pinned.svg">
        <link rel="stylesheet" href="/style.css">
        <link rel="SHORTCUT ICON" href="favicon.ico?v=1&amp;x=2">
        <link href='icon-32.png' sizes="16x16 32x32" type="image/png" rel=icon>
        <link rel="apple-touch-icon-precomposed" href="/touch.png">
        <link rel="icon" href="javascript:alert(1)">
        <link rel="icon" href="data:image/png;base64,AAAA">
        <link rel="icon" href="icon-32.png#dup">
      </head>`;
    expect(parseIconCandidates(html, 'https://www.example.com/page')).toEqual([
      {
        url: 'https://cdn.example.com/assets/favicon.ico?v=1&x=2',
        rel: 'icon',
        type: '',
        sizes: null,
      },
      {
        url: 'https://cdn.example.com/assets/icon-32.png',
        rel: 'icon',
        type: 'image/png',
        sizes: [16, 32],
      },
      { url: 'https://cdn.example.com/touch.png', rel: 'apple-touch-icon', type: '', sizes: null },
    ]);
  });

  it('ignores links inside an unterminated comment', () => {
    expect(
      parseIconCandidates('<link rel="icon" href="/a.png"><!-- <link rel="icon" href="/b.png">', 'https://a.test/')
        .map((candidate) => candidate.url),
    ).toEqual(['https://a.test/a.png']);
  });

  it('resolves relative icons against the page when there is no base', () => {
    expect(
      parseIconCandidates('<link rel="icon" href="../img/i.svg" sizes="any">', 'https://a.test/x/y/z')
        .map((candidate) => [candidate.url, candidate.sizes]),
    ).toEqual([['https://a.test/x/img/i.svg', 'any']]);
  });

  it('prefers the declared icon closest to the saved preferred size', () => {
    const candidates = parseIconCandidates(
      `<link rel="icon" sizes="16x16" href="/16.png">
       <link rel="icon" sizes="32x32" href="/32.png">
       <link rel="icon" sizes="192x192" href="/192.png">
       <link rel="apple-touch-icon" href="/touch.png">`,
      'https://a.test/',
    );
    const best = (size: number) => rankIconCandidates(candidates, size)[0].url;
    expect(best(32)).toBe('https://a.test/32.png');
    expect(best(16)).toBe('https://a.test/16.png');
    // Apple touch icons without sizes count as 180px.
    expect(best(180)).toBe('https://a.test/touch.png');
    expect(best(192)).toBe('https://a.test/192.png');
  });

  it('ranks scalable and common formats ahead of uncommon ones', () => {
    const candidates = parseIconCandidates(
      `<link rel="icon" href="/icon.gif" sizes="32x32">
       <link rel="icon" href="/icon.svg">
       <link rel="icon" href="/icon.ico">`,
      'https://a.test/',
    );
    expect(rankIconCandidates(candidates, 32).map((candidate) => candidate.url)).toEqual([
      'https://a.test/icon.svg',
      'https://a.test/icon.ico',
      'https://a.test/icon.gif',
    ]);
  });

  it('keeps only same-site icons and falls back to favicon.ico', () => {
    const candidates = parseIconCandidates(
      `<link rel="icon" href="https://static.example.com/a.png" sizes="32x32">
       <link rel="icon" href="https://tracker.test/b.png" sizes="32x32">
       <link rel="icon" href="https://www.example.com/favicon.ico">`,
      'https://www.example.com/page',
    );
    expect(selectIconUrls(candidates, 'https://www.example.com/page', 32)).toEqual([
      'https://static.example.com/a.png',
      'https://www.example.com/favicon.ico',
    ]);
    expect(selectIconUrls([], 'http://192.0.2.1:8080/x', 32)).toEqual([
      'http://192.0.2.1:8080/favicon.ico',
    ]);
  });

  it('sniffs real image types and rejects HTML served as an image', () => {
    const text = (value: string) => new TextEncoder().encode(value);
    expect(sniffImageType(PNG_BYTES)).toBe('image/png');
    expect(sniffImageType(ICO_BYTES)).toBe('image/x-icon');
    expect(sniffImageType(text('<?xml version="1.0"?>\n<!-- c --><svg xmlns="x"></svg>'))).toBe(
      'image/svg+xml',
    );
    expect(sniffImageType(text('<!doctype html><html><svg></svg></html>'))).toBeNull();
    expect(sniffImageType(text('Not Found'))).toBeNull();
    expect(isImageContentType('image/png; charset=binary')).toBe(true);
    expect(isImageContentType('text/html')).toBe(false);
    expect(isImageContentType(null)).toBe(false);
  });
});

describe('site icon refresh', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dedupes bookmarks by origin, skips non-web URLs, and never stores anything', async () => {
    const requests = stubSite({
      'https://a.test/one': { type: 'text/html', body: '<link rel="icon" href="/i.png">' },
      'https://a.test/i.png': { type: 'image/png', body: PNG_BYTES },
      'https://b.test/page': { type: 'text/html', body: '<title>No icon links</title>' },
      'https://b.test/favicon.ico': { type: 'image/x-icon', body: ICO_BYTES },
    });
    const result = await refreshSiteIcons(
      folder({
        one: 'https://a.test/one',
        two: 'https://a.test/two',
        three: 'https://b.test/page',
        bookmarklet: 'javascript:void(0)',
        local: 'chrome://settings',
      }),
      refreshOptions,
    );
    expect(result.scannedBookmarks).toBe(5);
    expect(result.skippedBookmarks).toBe(2);
    expect(
      result.items.map((item) => [item.origin, item.status, item.bookmarkCount, item.iconUrl]),
    ).toEqual([
      ['https://a.test', 'updated', 2, 'https://a.test/i.png'],
      ['https://b.test', 'updated', 1, 'https://b.test/favicon.ico'],
    ]);
    expect(result.items[0].icon).toBe(PNG_DATA_URL);
    expect(result.items[1].icon).toBe(toDataUrl(ICO_BYTES, 'image/x-icon'));
    // One page per origin, however many bookmarks share it.
    expect([...requests].sort()).toEqual([
      'https://a.test/i.png',
      'https://a.test/one',
      'https://b.test/favicon.ico',
      'https://b.test/page',
    ]);
    expect(await getSiteIconCache()).toEqual({});
  });

  it('rejects icon files over the saved byte cap and files that are not images', async () => {
    const big = new Uint8Array(2048);
    big.set(PNG_BYTES.subarray(0, 8));
    stubSite({
      'https://big.test/': { type: 'text/html', body: '<link rel="icon" href="/big.png">' },
      'https://big.test/big.png': { type: 'image/png', body: big },
      'https://html.test/': { type: 'text/html', body: '' },
      'https://html.test/favicon.ico': { type: 'image/x-icon', body: '<html>Not found</html>' },
      'https://text.test/': { type: 'text/html', body: '' },
      'https://text.test/favicon.ico': { type: 'text/html', body: ICO_BYTES },
    });
    const nodes = folder({
      big: 'https://big.test/',
      html: 'https://html.test/',
      text: 'https://text.test/',
    });

    const capped = await refreshSiteIcons(nodes, { ...refreshOptions, maxIconBytes: 1024 });
    expect(capped.items.map((item) => [item.origin, item.status, item.rejection])).toEqual([
      ['https://big.test', 'noIcon', 'tooLarge'],
      ['https://html.test', 'noIcon', 'notImage'],
      ['https://text.test', 'noIcon', 'notImage'],
    ]);

    const roomy = await refreshSiteIcons(nodes, { ...refreshOptions, maxIconBytes: 4096 });
    expect(roomy.items[0].status).toBe('updated');
    expect(roomy.items[0].icon?.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('reports unchanged icons and keeps cached icons when a site fails', async () => {
    stubSite({
      'https://same.test/': { type: 'text/html', body: '' },
      'https://same.test/favicon.ico': { type: 'image/png', body: PNG_BYTES },
      'https://down.test/': 'fail',
      'https://gone.test/': { status: 404, type: 'text/html', body: '' },
    });
    const result = await refreshSiteIcons(
      folder({ same: 'https://same.test/', down: 'https://down.test/', gone: 'https://gone.test/' }),
      refreshOptions,
      { 'https://same.test': PNG_DATA_URL, 'https://down.test': PNG_DATA_URL },
    );
    expect(
      result.items.map((item) => [item.origin, item.status, item.keepsCachedIcon ?? false]),
    ).toEqual([
      ['https://same.test', 'unchanged', false],
      ['https://down.test', 'failed', true],
      ['https://gone.test', 'noIcon', false],
    ]);
    expect(result.items[1].errorKind).toBe('network');
    expect(getSavableSiteIcons(result)).toEqual({ 'https://same.test': PNG_DATA_URL });
  });
});

describe('site icon storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('evicts the oldest icons to stay within the saved cache limit', async () => {
    const entry = (fetchedAt: number) => ({ icon: PNG_DATA_URL, fetchedAt });
    const size = PNG_DATA_URL.length;
    const cache = { 'https://a.test': entry(1), 'https://b.test': entry(3), 'https://c.test': entry(2) };
    expect(fitSiteIconCache(cache, size * 3)).toEqual({ cache, evicted: [] });
    const trimmed = fitSiteIconCache(cache, size * 2);
    expect(Object.keys(trimmed.cache).sort()).toEqual(['https://b.test', 'https://c.test']);
    expect(trimmed.evicted).toEqual(['https://a.test']);

    await saveSiteIcons({ 'https://a.test': PNG_DATA_URL }, { maxCacheBytes: size * 2, now: 1 });
    await saveSiteIcons({ 'https://b.test': PNG_DATA_URL }, { maxCacheBytes: size * 2, now: 2 });
    expect(
      await saveSiteIcons({ 'https://c.test': PNG_DATA_URL }, { maxCacheBytes: size * 2, now: 3 }),
    ).toEqual({ saved: 1, evicted: 1 });
    expect(Object.keys(await getSiteIconCache()).sort()).toEqual([
      'https://b.test',
      'https://c.test',
    ]);
    // A larger limit keeps all of them.
    await saveSiteIcons({ 'https://a.test': PNG_DATA_URL }, { maxCacheBytes: size * 3, now: 4 });
    expect(Object.keys(await getSiteIconCache())).toHaveLength(3);

    await clearSiteIconCache();
    expect(await fakeBrowser.storage.local.get(SITE_ICON_STORAGE_KEY)).toEqual({});
  });

  it('drops malformed stored icons and keys on read and save', async () => {
    expect(
      normalizeSiteIconCache({
        'https://ok.test': { icon: PNG_DATA_URL, fetchedAt: 5 },
        'https://ok.test/path': { icon: PNG_DATA_URL, fetchedAt: 5 },
        'https://html.test': { icon: 'data:text/html;base64,PGI+', fetchedAt: 5 },
        'https://js.test': { icon: 'javascript:alert(1)', fetchedAt: 5 },
        'https://time.test': { icon: PNG_DATA_URL, fetchedAt: 'yesterday' },
        'chrome://settings': { icon: PNG_DATA_URL, fetchedAt: 5 },
      }),
    ).toEqual({ 'https://ok.test': { icon: PNG_DATA_URL, fetchedAt: 5 } });
    expect(normalizeSiteIconCache(['nope'])).toEqual({});

    await saveSiteIcons(
      { 'https://ok.test': PNG_DATA_URL, 'https://bad.test': 'data:image/svg+xml,<svg onload=x>' },
      { maxCacheBytes: 1024 * 1024 },
    );
    expect(Object.keys(await getSiteIconCache())).toEqual(['https://ok.test']);
  });
});

describe('site icon rendering', () => {
  it('looks up saved icons by origin, then by host under the other scheme or www', () => {
    const state = {
      byOrigin: { 'https://www.a.test': 'data:image/png;base64,QQ==' },
      byHost: { 'www.a.test': 'data:image/png;base64,QQ==', 'b.test': 'data:image/png;base64,Qg==' },
    };
    expect(lookupSiteIcon(state, 'https://www.a.test/page')).toBe('data:image/png;base64,QQ==');
    expect(lookupSiteIcon(state, 'http://a.test/')).toBe('data:image/png;base64,QQ==');
    expect(lookupSiteIcon(state, 'https://www.b.test/x')).toBe('data:image/png;base64,Qg==');
    expect(lookupSiteIcon(state, 'https://c.test/')).toBeUndefined();
    expect(lookupSiteIcon(state, 'javascript:void(0)')).toBeUndefined();
  });

  it('prefers a saved icon over the browser icon cache, which is used only when allowed', () => {
    expect(getSiteIconUrl('https://a.test/', 32, PNG_DATA_URL, true)).toBe(PNG_DATA_URL);
    const browserIcon = getSiteIconUrl('https://a.test/', 32, undefined, true);
    expect(browserIcon).toContain('/_favicon/');
    expect(browserIcon).toContain('size=32');
    expect(getSiteIconUrl('https://a.test/', 32, undefined, false)).toBeNull();
    expect(getSiteIconUrl('https://a.test/', 32, PNG_DATA_URL, false)).toBe(PNG_DATA_URL);
  });
});
