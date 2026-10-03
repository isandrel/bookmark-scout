import { DOMParser as LinkedomParser } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  addPageText,
  extractPageText,
  isPrivateHost,
  isReadablePageUrl,
  readPagesText,
} from '@/services/page-reader';
import { readConfigToml } from '../config-files';

const MAX_PAGES_PER_RUN = readConfigToml('ai/page-reading.toml').max_pages_per_run as number;

const ARTICLE = `<!doctype html><html><head><title>Rust ownership explained</title>
<meta name="description" content="A guide to borrowing."></head><body>
<nav><a href="/">Home</a> <a href="/blog">Blog</a></nav>
<article><h1>Rust ownership explained</h1>
<p>Every value in Rust has a single owner. When the owner goes out of scope, the value is dropped.
Borrowing lets code use a value without taking ownership, and the borrow checker enforces the rules.</p>
<p>Mutable borrows are exclusive: while one exists, no other borrow of the value may be used.
This prevents data races at compile time, which is one of the reasons Rust is popular.</p>
<p>Read the <a href="https://doc.rust-lang.org/book/">official book</a> for more.</p>
<script>window.tracking = true;</script></article>
<footer>Copyright example</footer></body></html>`;

const parse = (html: string) => new LinkedomParser().parseFromString(html, 'text/html') as unknown as Document;

beforeEach(() => {
  fakeBrowser.reset();
  vi.stubGlobal('DOMParser', LinkedomParser);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isPrivateHost', () => {
  it.each([
    'localhost',
    'app.localhost',
    'printer.local',
    'nas.home.arpa',
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.0.1',
    '100.64.0.1',
    '0.0.0.0',
    '[::1]',
    '[fd00::1]',
    '[fe80::1]',
    '[::ffff:192.168.0.1]',
  ])('treats %s as local', (host) => {
    expect(isPrivateHost(host)).toBe(true);
  });

  it.each(['example.com', '8.8.8.8', '172.32.0.1', '192.169.0.1', '[2001:db8::1]', 'localhost.com'])(
    'treats %s as public',
    (host) => {
      expect(isPrivateHost(host)).toBe(false);
    },
  );

  it('reads only web URLs on public hosts', () => {
    expect(isReadablePageUrl('https://example.com/a')).toBe(true);
    expect(isReadablePageUrl('http://localhost:3000/')).toBe(false);
    expect(isReadablePageUrl('javascript:alert(1)')).toBe(false);
    expect(isReadablePageUrl('chrome://settings')).toBe(false);
  });
});

describe('extractPageText', () => {
  it('keeps the article as Markdown without navigation, scripts, or link addresses', () => {
    const page = extractPageText(parse(ARTICLE));
    expect(page?.title).toBe('Rust ownership explained');
    expect(page?.text).toContain('A guide to borrowing.');
    expect(page?.text).toContain('Every value in Rust has a single owner.');
    expect(page?.text).toContain('official book');
    expect(page?.text).not.toContain('doc.rust-lang.org');
    expect(page?.text).not.toContain('window.tracking');
  });

  it('cuts the text to the configured length', () => {
    const page = extractPageText(parse(ARTICLE), 40);
    expect(page?.text).toHaveLength(40);
  });

  it('returns nothing for an empty page', () => {
    expect(extractPageText(parse('<html><body></body></html>'))).toBeUndefined();
  });
});

describe('readPagesText', () => {
  const html = (body: string, contentType = 'text/html; charset=utf-8') =>
    new Response(body, { status: 200, headers: { 'content-type': contentType } });

  it('reads public pages, skips local and non-HTML ones, and never sends cookies', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/file.pdf')) return html('%PDF', 'application/pdf');
      if (url.endsWith('/missing')) return new Response('gone', { status: 404 });
      return html(ARTICLE);
    });
    vi.stubGlobal('fetch', fetchMock);

    const pages = await readPagesText([
      'https://example.com/article',
      'https://example.com/article',
      'https://example.com/file.pdf',
      'https://example.com/missing',
      'http://192.168.1.10/admin',
    ]);
    expect([...pages.keys()]).toEqual(['https://example.com/article']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(
      'http://192.168.1.10/admin',
    );
    for (const [, init] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(init.credentials).toBe('omit');
    }
  });

  it('reads at most the configured number of pages in one run', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => html(ARTICLE)));
    const urls = Array.from(
      { length: MAX_PAGES_PER_RUN + 5 },
      (_, index) => `https://example.com/${index}`,
    );
    const pages = await readPagesText(urls);
    expect(pages.size).toBe(MAX_PAGES_PER_RUN);
  });
});

describe('addPageText', () => {
  it('leaves items unchanged when page reading is off or website access is missing', async () => {
    const fetchMock = vi.fn(async () => new Response(ARTICLE));
    vi.stubGlobal('fetch', fetchMock);
    const items = [{ url: 'https://example.com/article' }];

    expect(await addPageText(items, false)).toEqual(items);
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(false);
    expect(await addPageText(items, true)).toEqual(items);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adds the page title and text when reading is on and access is granted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(ARTICLE, { headers: { 'content-type': 'text/html' } })));
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true);
    const [item] = await addPageText([{ url: 'https://example.com/article', id: 'a' }], true);
    expect(item).toMatchObject({ id: 'a', pageTitle: 'Rust ownership explained' });
    expect(item.pageText).toContain('single owner');
  });
});
