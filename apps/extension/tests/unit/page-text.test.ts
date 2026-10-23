import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { DOMParser as LinkedomParser, parseHTML } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  TOOL_DEFINITIONS,
  type ToolApplyContext,
} from '@/components/bookmarks/tools/tool-definitions';
import { setLanguage } from '@/hooks/use-i18n';
import {
  clearPageTexts,
  getPageTextSummary,
  getPageTexts,
  isPageTextCurrent,
  PAGE_TEXT_LIMITS,
  prunePageTexts,
  savePageTexts,
} from '@/lib/page-text-store';
import { QUICK_SAVE_MESSAGE } from '@/lib/quick-save-protocol';
import { pageTextReadingSchema } from '@/lib/quick-save-validation';
import { buildSearchDocuments } from '@/lib/search-documents';
import { parseSearchQuery } from '@/lib/search-query';
import { searchReasonLabel } from '@/lib/search-reasons';
import { saveSettings } from '@/lib/settings-storage';
import { INDEXED_SAVE_BATCH_SIZE } from '@/lib/storage/indexed-batches';
import { INDEXED_DATABASES } from '@/lib/storage/registry';
import { sha256Hex } from '@/lib/utils';
import {
  listPageTextSites,
  pageTextNeed,
  readPageTextHtml,
  readTabPageText,
  savePageTextResults,
  scanPageTexts,
} from '@/services/page-text';
import { handleAIHostRequest } from '@/services/quick-save-ai-runner';
import type { BookmarkTreeNode } from '@/types';
import { installFakePermissions } from '../fake-permissions';
import { searchDocuments } from '../search-results';
import { runOutOfStorageAfter } from './indexeddb-quota';

const tree: BookmarkTreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        parentId: '0',
        title: 'Bookmarks bar',
        children: [
          { id: 'a', parentId: '1', title: 'Field notes', url: 'https://notes.example/a' },
          { id: 'b', parentId: '1', title: 'Recipes', url: 'https://food.example/b' },
          { id: 'moved', parentId: '1', title: 'Moved page', url: 'https://new.example/' },
        ],
      },
    ],
  },
];

const pageTexts = new Map([
  [
    'a',
    { url: 'https://notes.example/a', text: 'We saw a quokka near the river and wrote it down.' },
  ],
  ['b', { url: 'https://food.example/b', text: 'Tomato soup with basil.' }],
  // Read from the address the bookmark had before; it is not this page any more.
  ['moved', { url: 'https://old.example/', text: 'A quokka on the old page.' }],
]);

const find = (query: string) =>
  searchDocuments(buildSearchDocuments(tree, {}, pageTexts), parseSearchQuery(query).query);

describe('page text in search', () => {
  it('finds words only the indexed page text has, with a plain-text snippet', () => {
    const [result, ...rest] = find('quokka');
    expect(rest).toEqual([]);
    expect(result?.document.id).toBe('a');
    expect(result?.reasons).toEqual([
      expect.objectContaining({ field: 'content', snippet: expect.stringContaining('quokka') }),
    ]);
  });

  it('limits a term to page text with content:, and asks for it with has:content', () => {
    expect(find('content:basil').map((result) => result.document.id)).toEqual(['b']);
    expect(find('title:basil')).toEqual([]);
    expect(
      find('has:content')
        .map((result) => result.document.id)
        .sort(),
    ).toEqual(['a', 'b']);
    expect(find('-has:content').map((result) => result.document.id)).toEqual(['moved']);
  });

  it('ranks a title match above a match in page text', () => {
    const titles = new Map([['b', { url: 'https://food.example/b', text: 'field notes inside' }]]);
    const documents = buildSearchDocuments(tree, {}, titles);
    const ids = searchDocuments(documents, parseSearchQuery('field').query).map(
      (result) => result.document.id,
    );
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('page text store', () => {
  beforeEach(async () => {
    await clearPageTexts();
  });

  it('keeps each page cut to the limit, current only at the address it was read from', async () => {
    await savePageTexts(
      [
        {
          bookmarkId: 'a',
          url: 'https://notes.example/a',
          text: 'x'.repeat(PAGE_TEXT_LIMITS.maxCharsPerPage + 50),
        },
      ],
      'download',
    );
    const pages = await getPageTexts();
    expect(pages.get('a')?.text).toHaveLength(PAGE_TEXT_LIMITS.maxCharsPerPage);
    expect(isPageTextCurrent(pages.get('a'), 'https://notes.example/a')).toBe(true);
    expect(isPageTextCurrent(pages.get('a'), 'https://notes.example/other')).toBe(false);
    expect(await getPageTextSummary()).toEqual({
      pages: 1,
      chars: PAGE_TEXT_LIMITS.maxCharsPerPage,
    });
  });

  it('keeps the pages saved before storage ran out, and says how many were not saved', async () => {
    await savePageTexts(
      [{ bookmarkId: 'kept', url: 'https://kept.example/', text: 'kept' }],
      'download',
    );
    const pages = Array.from({ length: INDEXED_SAVE_BATCH_SIZE * 2 + 3 }, (_, index) => ({
      bookmarkId: `p${index}`,
      url: `https://notes.example/${index}`,
      text: `page ${index}`,
    }));
    // Storage runs out in the second batch, which is rolled back as a whole.
    const full = runOutOfStorageAfter(INDEXED_SAVE_BATCH_SIZE + 1);
    try {
      expect(await savePageTexts(pages, 'download')).toEqual({
        saved: INDEXED_SAVE_BATCH_SIZE,
        notSaved: pages.length - INDEXED_SAVE_BATCH_SIZE,
      });
    } finally {
      full.mockRestore();
    }
    const stored = await getPageTexts();
    expect(stored.size).toBe(INDEXED_SAVE_BATCH_SIZE + 1);
    expect(stored.has('kept')).toBe(true);
    expect(stored.has(`p${INDEXED_SAVE_BATCH_SIZE - 1}`)).toBe(true);
    expect(stored.has(`p${INDEXED_SAVE_BATCH_SIZE}`)).toBe(false);
  });

  it('drops the text of bookmarks that are gone, and clears everything', async () => {
    await savePageTexts(
      [
        { bookmarkId: 'a', url: 'https://notes.example/a', text: 'one' },
        { bookmarkId: 'gone', url: 'https://gone.example/', text: 'two' },
      ],
      'download',
    );
    expect(await prunePageTexts(new Set(['a']))).toBe(1);
    expect([...(await getPageTexts()).keys()]).toEqual(['a']);
    await clearPageTexts();
    expect((await getPageTexts()).size).toBe(0);
  });
});

const ARTICLE = `<!doctype html><html><head><title>Trip</title></head><body><article>
<h1>Trip</h1><p>We finally saw a quokka resting under a peppermint tree on the island.</p>
<p>${'More notes about the trip and the island. '.repeat(20)}</p></article></body></html>`;

/** A page that asks for a password instead of showing what was bookmarked. */
const SIGN_IN = `<!doctype html><html><head><title>Sign in</title></head><body><main>
<h1>Sign in to continue</h1><form><label>Email <input name="user"></label>
<label>Password <input type="password" name="pw"></label><button>Sign in</button></form>
</main></body></html>`;

describe('Index Page Text runs', () => {
  const folder = (children: BookmarkTreeNode[]): BookmarkTreeNode[] => [
    { id: 'f', parentId: '1', title: 'Folder', children },
  ];

  beforeEach(async () => {
    await clearPageTexts();
    // Website access to every site: a review saves only text from sites still allowed.
    installFakePermissions({ origins: ['https://*/*', 'http://*/*'] });
    vi.stubGlobal('DOMParser', LinkedomParser);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (input.includes('down.')) throw new TypeError('Failed to fetch');
        // An HTTP 401 is a sign-in page whatever its body says.
        const status = input.includes('locked.') ? 401 : 200;
        let body = ARTICLE;
        if (input.includes('empty.')) body = '<html><body></body></html>';
        if (input.includes('login.')) body = SIGN_IN;
        return new Response(body, { status, headers: { 'content-type': 'text/html' } });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads each page once, sorting what it found, and skips pages it cannot read', async () => {
    await savePageTexts(
      [{ bookmarkId: 'kept', url: 'https://kept.example/', text: 'old' }],
      'download',
    );
    const { items, overLimit } = await scanPageTexts(
      folder([
        { id: 'read', parentId: 'f', title: 'Trip', url: 'https://trip.example/' },
        { id: 'empty', parentId: 'f', title: 'Empty', url: 'https://empty.example/' },
        { id: 'down', parentId: 'f', title: 'Down', url: 'https://down.example/' },
        { id: 'login', parentId: 'f', title: 'Wall', url: 'https://login.example/' },
        { id: 'locked', parentId: 'f', title: 'Locked', url: 'https://locked.example/' },
        { id: 'kept', parentId: 'f', title: 'Kept', url: 'https://kept.example/' },
        { id: 'local', parentId: 'f', title: 'Router', url: 'http://192.168.1.1/' },
        { id: 'js', parentId: 'f', title: 'Script', url: 'javascript:void(0)' },
      ]),
      { skipPrivateHosts: true, sensitiveParams: [], excludedSites: [] },
    );
    expect(overLimit).toBe(0);
    expect(Object.fromEntries(items.map((item) => [item.id, item.status]))).toEqual({
      read: 'read',
      empty: 'empty',
      down: 'failed',
      login: 'signIn',
      locked: 'signIn',
      kept: 'current',
      local: 'skipped',
      js: 'skipped',
    });
    expect(items.find((item) => item.id === 'read')?.text).toContain('quokka');
    // A sign-in page keeps no text, so it can never be saved as the page.
    expect(items.find((item) => item.id === 'login')?.text).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('lists the sites a run would download from, and reads only the chosen ones (S03)', async () => {
    await savePageTexts(
      [{ bookmarkId: 'kept', url: 'https://kept.example/', text: 'old' }],
      'download',
    );
    const nodes = folder([
      { id: 'a1', parentId: 'f', title: 'A one', url: 'https://www.alpha.example/1' },
      { id: 'a2', parentId: 'f', title: 'A two', url: 'https://docs.alpha.example/2' },
      { id: 'b1', parentId: 'f', title: 'B one', url: 'https://beta.example/1' },
      { id: 'c1', parentId: 'f', title: 'C one', url: 'https://gamma.example/1' },
      { id: 'd1', parentId: 'f', title: 'D one', url: 'https://delta.example/1' },
      { id: 'e1', parentId: 'f', title: 'E one', url: 'https://epsilon.example/1' },
      { id: 'kept', parentId: 'f', title: 'Kept', url: 'https://kept.example/' },
      { id: 'local', parentId: 'f', title: 'Router', url: 'http://192.168.1.1/' },
      { id: 'js', parentId: 'f', title: 'Script', url: 'javascript:void(0)' },
    ]);
    // Pages indexed already and pages that may not be read are not sites to choose.
    expect(
      await listPageTextSites(nodes, {
        skipPrivateHosts: true,
        sensitiveParams: [],
        excludedSites: [],
      }),
    ).toEqual([
      { site: 'alpha.example', count: 2 },
      { site: 'beta.example', count: 1 },
      { site: 'delta.example', count: 1 },
      { site: 'epsilon.example', count: 1 },
      { site: 'gamma.example', count: 1 },
    ]);

    const { items } = await scanPageTexts(nodes, {
      skipPrivateHosts: true,
      sensitiveParams: [],
      excludedSites: [],
      sites: ['alpha.example', 'gamma.example'],
    });
    expect(Object.fromEntries(items.map((item) => [item.id, item.status]))).toEqual({
      a1: 'read',
      a2: 'read',
      b1: 'notChosen',
      c1: 'read',
      d1: 'notChosen',
      e1: 'notChosen',
      kept: 'current',
      local: 'skipped',
      js: 'skipped',
    });
    // Only the chosen sites were requested.
    const requested = vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url)).hostname);
    expect(requested.sort()).toEqual(['docs.alpha.example', 'gamma.example', 'www.alpha.example']);
  });

  it('leaves room in a nearly full index for the chosen sites only (S03)', async () => {
    const limits = PAGE_TEXT_LIMITS as { maxPages: number };
    const maxPages = limits.maxPages;
    let result: Awaited<ReturnType<typeof scanPageTexts>>;
    try {
      limits.maxPages = 1;
      result = await scanPageTexts(
        folder([
          { id: 'b1', parentId: 'f', title: 'B one', url: 'https://beta.example/1' },
          { id: 'c1', parentId: 'f', title: 'C one', url: 'https://gamma.example/1' },
        ]),
        {
          skipPrivateHosts: true,
          sensitiveParams: [],
          excludedSites: [],
          sites: ['gamma.example'],
        },
      );
    } finally {
      limits.maxPages = maxPages;
    }
    const { items, overLimit } = result;
    expect(overLimit).toBe(0);
    expect(items.map((item) => [item.id, item.status])).toEqual([
      ['b1', 'notChosen'],
      ['c1', 'read'],
    ]);
  });

  it('lists a page that redirects as redirected, without requesting where it leads', async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        requested.push(input);
        expect(init?.redirect).toBe('manual');
        if (input === 'https://moved.example/') {
          return new Response(null, { status: 302, headers: { location: 'http://192.168.1.1/' } });
        }
        if (input === 'https://elsewhere.example/') {
          return new Response(null, {
            status: 301,
            headers: { location: 'https://other-site.example/' },
          });
        }
        return new Response(ARTICLE, { status: 200, headers: { 'content-type': 'text/html' } });
      }),
    );
    // The run has access to no other site than the bookmarks' own.
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(false);
    const { items } = await scanPageTexts(
      folder([
        { id: 'moved', parentId: 'f', title: 'Moved', url: 'https://moved.example/' },
        { id: 'elsewhere', parentId: 'f', title: 'Away', url: 'https://elsewhere.example/' },
      ]),
      { skipPrivateHosts: true, sensitiveParams: [], excludedSites: [] },
    );
    expect(Object.fromEntries(items.map((item) => [item.id, item.status]))).toEqual({
      moved: 'redirected',
      elsewhere: 'redirected',
    });
    expect(requested).toEqual(['https://moved.example/', 'https://elsewhere.example/']);
  });

  it('reads the https: address of a page whose redirect the browser hides, and says so', async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        requested.push(input);
        if (input.startsWith('http:')) {
          // What Chrome and Firefox return to an extension for `redirect: 'manual'`.
          const opaque = new Response(null, { status: 200 });
          Object.defineProperty(opaque, 'type', { value: 'opaqueredirect' });
          Object.defineProperty(opaque, 'status', { value: 0 });
          return opaque;
        }
        return new Response(ARTICLE, { status: 200, headers: { 'content-type': 'text/html' } });
      }),
    );
    const { items } = await scanPageTexts(
      folder([{ id: 'old', parentId: 'f', title: 'Old link', url: 'http://trip.example/notes' }]),
      { skipPrivateHosts: true, sensitiveParams: [], excludedSites: [] },
    );
    expect(items[0]).toMatchObject({ status: 'read', readFrom: 'https://trip.example/notes' });
    expect(requested).toEqual(['http://trip.example/notes', 'https://trip.example/notes']);
  });

  it('reads a page the background downloaded in the AI host page, cut to the limit it asks for', async () => {
    const maxChars = 40;
    const response = await handleAIHostRequest({
      type: QUICK_SAVE_MESSAGE.hostReadText,
      token: 'token',
      html: ARTICLE,
      maxChars,
    });
    expect(response).toMatchObject({
      ok: true,
      reading: { status: 'read', text: expect.stringContaining('quokka') },
    });
    const reading = response.ok ? response.reading : undefined;
    expect(reading?.status === 'read' && reading.text.length).toBeLessThanOrEqual(maxChars);
    expect(pageTextReadingSchema.safeParse(reading).success).toBe(true);
    const ask = (html: string) =>
      handleAIHostRequest({
        type: QUICK_SAVE_MESSAGE.hostReadText,
        token: 'token',
        html,
        maxChars,
      });
    expect(await ask('<html><body></body></html>')).toEqual({
      ok: true,
      reading: { status: 'empty' },
    });
    expect(await ask(SIGN_IN)).toEqual({ ok: true, reading: { status: 'signIn' } });
  });

  it('saves only the pages left on Save, and drops text of bookmarks that are gone', async () => {
    await savePageTexts(
      [{ bookmarkId: 'gone', url: 'https://gone.example/', text: 'old' }],
      'download',
    );
    vi.spyOn(fakeBrowser.bookmarks, 'getTree').mockResolvedValue([
      {
        id: '0',
        title: '',
        syncing: false,
        children: [
          {
            id: 'read',
            parentId: '0',
            title: 'Trip',
            url: 'https://trip.example/',
            syncing: false,
          },
        ],
      },
    ]);
    const { saved } = await savePageTextResults([
      {
        id: 'read',
        title: 'Trip',
        url: 'https://trip.example/',
        folderPath: '',
        status: 'read',
        text: 'quokka',
      },
      {
        id: 'empty',
        title: 'Empty',
        url: 'https://empty.example/',
        folderPath: '',
        status: 'empty',
      },
    ]);
    expect(saved).toBe(1);
    expect([...(await getPageTexts()).keys()]).toEqual(['read']);
  });

  it('saves no text from a site whose access was taken back, or on Never Read These Sites by the address read from, since the run (media review 5, 8)', async () => {
    const pages = [
      { id: 'kept', url: 'https://kept.example/' },
      { id: 'revoked', url: 'https://revoked.example/' },
      { id: 'never', url: 'http://short.example/', readFrom: 'https://never.example/' },
    ];
    vi.spyOn(fakeBrowser.bookmarks, 'getTree').mockResolvedValue([
      {
        id: '0',
        title: '',
        syncing: false,
        children: pages.map(({ id, url }) => ({
          id,
          parentId: '0',
          title: id,
          url,
          syncing: false,
        })),
      },
    ]);
    installFakePermissions({
      origins: ['kept', 'short', 'never'].flatMap((site) => [
        `http://*.${site}.example/*`,
        `https://*.${site}.example/*`,
      ]),
    });
    await saveSettings({ pageTextExcludedSites: ['never.example'] });
    const { saved } = await savePageTextResults(
      pages.map((page) => ({
        ...page,
        title: page.id,
        folderPath: '',
        status: 'read',
        text: 'quokka',
      })),
    );
    expect(saved).toBe(1);
    expect([...(await getPageTexts()).keys()]).toEqual(['kept']);
    await saveSettings({ pageTextExcludedSites: [] });
  });

  it('never follows a redirect to a site on Never Read These Sites (media review 8)', async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        requested.push(input);
        if (input === 'https://away.example/') {
          return new Response(null, {
            status: 301,
            headers: { location: 'https://never.example/' },
          });
        }
        return new Response(ARTICLE, { status: 200, headers: { 'content-type': 'text/html' } });
      }),
    );
    // With access to every site, only Never Read These Sites keeps the redirect from being read.
    const { items } = await scanPageTexts(
      folder([{ id: 'away', parentId: 'f', title: 'Away', url: 'https://away.example/' }]),
      { skipPrivateHosts: true, sensitiveParams: [], excludedSites: ['never.example'] },
    );
    expect(items[0]?.status).toBe('redirected');
    expect(requested).toEqual(['https://away.example/']);
  });

  it('reports a save cut short by full storage as partial, never as saved', async () => {
    await saveSettings({ language: 'en' });
    setLanguage('en');
    vi.spyOn(fakeBrowser.bookmarks, 'getTree').mockResolvedValue([
      {
        id: '0',
        title: '',
        syncing: false,
        children: ['a', 'b'].map((id) => ({
          id,
          parentId: '0',
          title: id,
          url: `https://${id}.example/`,
          syncing: false,
        })),
      },
    ]);
    const picked = ['a', 'b'].map((id) => ({
      id,
      title: id,
      url: `https://${id}.example/`,
      folderPath: '',
      status: 'read' as const,
      text: id,
    }));
    const full = runOutOfStorageAfter(0);
    let outcome: Awaited<ReturnType<NonNullable<typeof TOOL_DEFINITIONS.pageText.apply>>>;
    try {
      outcome = await TOOL_DEFINITIONS.pageText.apply?.(
        { items: picked, overLimit: 0 },
        picked,
        {} as ToolApplyContext,
      );
    } finally {
      full.mockRestore();
    }
    expect(outcome).toEqual({
      title: 'Some page text was not saved',
      description:
        "Saved: 0. Not saved because this device's storage for the extension is full: 2. " +
        'Free up disk space or delete page text in Settings, then index again.',
      variant: 'destructive',
    });
  });
});

describe('sign-in pages (S12)', () => {
  const page = (body: string) =>
    `<!doctype html><html><head><title>Page</title></head><body>${body}</body></html>`;
  const shortArticle =
    '<article><h1>Trip</h1><p>We finally saw a quokka resting under a peppermint tree.</p></article>';

  beforeEach(() => {
    vi.stubGlobal('DOMParser', LinkedomParser);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks a page asking for a password in its main content, with little text, as sign-in', async () => {
    const max = PAGE_TEXT_LIMITS.maxCharsPerPage;
    expect(await readPageTextHtml(SIGN_IN, max)).toEqual({ status: 'signIn' });
    // A password field alone, with no readable text at all, is a sign-in page, not an empty one.
    expect(await readPageTextHtml(page('<form><input type="PASSWORD"></form>'), max)).toEqual({
      status: 'signIn',
    });
    expect(
      await readPageTextHtml(page('<input autocomplete="username current-password">'), max),
    ).toEqual({ status: 'signIn' });
  });

  it('keeps the text of articles with a newsletter form, a header sign-in box, or much text', async () => {
    const max = PAGE_TEXT_LIMITS.maxCharsPerPage;
    const newsletter = page(
      `${shortArticle}<form><input type="email" placeholder="Email"><button>Subscribe</button></form>`,
    );
    const headerSignIn = page(
      `<header><form><input name="user"><input type="password"></form></header>${shortArticle}`,
    );
    const long = page(
      `<main><article><h1>Trip</h1><p>${'We saw a quokka by the river. '.repeat(60)}</p>
      <form><input type="password"></form></article></main>`,
    );
    for (const html of [newsletter, headerSignIn, long]) {
      expect(await readPageTextHtml(html, max)).toMatchObject({
        status: 'read',
        text: expect.stringContaining('quokka'),
      });
    }
  });

  it('cuts the text to the limit asked for, after deciding with as much text as the check needs', async () => {
    const long = page(
      `<main><article><p>${'We saw a quokka by the river. '.repeat(60)}</p>
      <form><input type="password"></form></article></main>`,
    );
    const maxChars = 20;
    const reading = await readPageTextHtml(long, maxChars);
    expect(reading.status).toBe('read');
    expect(reading.status === 'read' && reading.text.length).toBeLessThanOrEqual(maxChars);
  });
});

describe("Index this page's text from the current tab (S17, S18)", () => {
  type Tab = Browser.tabs.Tab;
  const URL_SAVED = 'https://news.example/story';
  const SHOWN = `<!doctype html><html><head><title>Story</title></head><body><article>
  <h1>Story</h1><p>Only signed-in readers see that the quokka story continues here.</p>
  <p>${'More of the story for subscribers. '.repeat(10)}</p>
  <form><input name="comment" value="typed-secret"><textarea>draft-secret</textarea></form>
  <div contenteditable="true"><p>editor-draft-secret</p></div>
  <div contenteditable><p>plain-editor-secret</p></div>
  <div contenteditable="false"><p>Read-only part of the story.</p></div>
  </article></body></html>`;
  const tab = (overrides: Partial<Tab> = {}) =>
    ({ id: 7, windowId: 1, url: URL_SAVED, incognito: false, ...overrides }) as Tab;
  let shownHtml = SHOWN;
  let shownUrl = URL_SAVED;
  const snapshots: { url: string; html: string }[] = [];

  beforeEach(async () => {
    await clearPageTexts();
    vi.stubGlobal('DOMParser', LinkedomParser);
    shownHtml = SHOWN;
    shownUrl = URL_SAVED;
    snapshots.length = 0;
    // Runs the function the extension injects, against the page the tab shows.
    vi.spyOn(fakeBrowser.scripting, 'executeScript').mockImplementation((async (injection: {
      func: (...args: unknown[]) => { url: string; html: string };
      args: unknown[];
    }) => {
      const { document } = parseHTML(shownHtml);
      vi.stubGlobal('document', document);
      vi.stubGlobal('location', { href: shownUrl });
      const result = injection.func(...injection.args);
      snapshots.push(result);
      return [{ frameId: 0, documentId: 'doc', result }];
    }) as never);
    vi.spyOn(fakeBrowser.bookmarks, 'search').mockResolvedValue([
      { id: 'b1', title: 'Story', url: URL_SAVED, syncing: false },
      { id: 'b2', title: 'Story again', url: URL_SAVED, syncing: false },
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads what the tab shows for every bookmark of its address, without typed text', async () => {
    vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([tab()]);
    const result = await readTabPageText(URL_SAVED);
    if (!('page' in result)) throw new Error(result.error);
    expect(result.page.text).toContain('quokka story continues');
    expect(result.page.text.length).toBeLessThanOrEqual(PAGE_TEXT_LIMITS.maxCharsPerPage);
    expect(result.page.pages.map((page) => page.bookmarkId)).toEqual(['b1', 'b2']);
    expect(fakeBrowser.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 7 }, args: [PAGE_TEXT_LIMITS.maxBytes] }),
    );
    // What was typed into the page's fields never leaves the tab.
    expect(snapshots[0]?.html).not.toContain('typed-secret');
    expect(snapshots[0]?.html).not.toContain('draft-secret');
    // Nor what was typed into a rich text editor (media review 9); a part marked not editable stays.
    expect(snapshots[0]?.html).not.toContain('editor-draft-secret');
    expect(snapshots[0]?.html).not.toContain('plain-editor-secret');
    expect(snapshots[0]?.html).toContain('Read-only part of the story.');
    // Nothing is kept before the preview is saved.
    expect((await getPageTexts()).size).toBe(0);
  });

  it('rejects the read when the tab shows or moves to another page, and never reads private windows', async () => {
    const query = vi.spyOn(fakeBrowser.tabs, 'query');
    query.mockResolvedValue([tab({ url: 'https://other.example/' })]);
    expect(await readTabPageText(URL_SAVED)).toEqual({ error: 'changed' });
    query.mockResolvedValue([tab({ incognito: true })]);
    expect(await readTabPageText(URL_SAVED)).toEqual({ error: 'private' });
    expect(fakeBrowser.scripting.executeScript).not.toHaveBeenCalled();

    // The tab moved on while the text was read.
    query
      .mockResolvedValueOnce([tab()])
      .mockResolvedValueOnce([tab({ url: 'https://next.example/' })]);
    expect(await readTabPageText(URL_SAVED)).toEqual({ error: 'changed' });
    // ...or the document read was already another one.
    query.mockResolvedValue([tab()]);
    shownUrl = 'https://news.example/next-story';
    expect(await readTabPageText(URL_SAVED)).toEqual({ error: 'changed' });
  });

  it('reports a refused read, a sign-in page, a page without text, and a full index', async () => {
    vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([tab()]);
    shownHtml = SIGN_IN;
    expect(await readTabPageText(URL_SAVED)).toEqual({ error: 'signIn' });
    shownHtml = '<html><body></body></html>';
    expect(await readTabPageText(URL_SAVED)).toEqual({ error: 'empty' });

    shownHtml = SHOWN;
    const limits = PAGE_TEXT_LIMITS as { maxPages: number };
    const maxPages = limits.maxPages;
    try {
      limits.maxPages = 1;
      expect(await readTabPageText(URL_SAVED)).toEqual({ error: 'full' });
    } finally {
      limits.maxPages = maxPages;
    }

    vi.spyOn(fakeBrowser.scripting, 'executeScript').mockRejectedValue(new Error('no access'));
    expect(await readTabPageText(URL_SAVED)).toEqual({ error: 'denied' });
  });

  it('never reads a page on a site in Never Read These Sites (S1)', async () => {
    vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([tab()]);
    await saveSettings({ pageTextExcludedSites: ['news.example'] });
    try {
      expect(await readTabPageText(URL_SAVED)).toEqual({ error: 'excluded' });
      expect(fakeBrowser.scripting.executeScript).not.toHaveBeenCalled();
    } finally {
      await saveSettings({ pageTextExcludedSites: [] });
    }
    const result = await readTabPageText(URL_SAVED);
    if (!('page' in result)) throw new Error(result.error);
    expect(result.page.pages[0]).toMatchObject({ truncated: false });
  });
});

describe('where page text came from (PROMPT S2.5)', () => {
  beforeEach(async () => {
    await clearPageTexts();
    // Website access to every site: a review saves only text from sites still allowed.
    installFakePermissions({ origins: ['https://*/*', 'http://*/*'] });
    await saveSettings({ language: 'en' });
    setLanguage('en');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps how the text was captured, the address it was read from, its fingerprint, and whether it was cut', async () => {
    const long = 'y'.repeat(PAGE_TEXT_LIMITS.maxCharsPerPage + 1);
    await savePageTexts(
      [
        {
          bookmarkId: 'a',
          url: 'http://notes.example/a',
          readFrom: 'https://notes.example/a',
          text: 'short',
        },
        { bookmarkId: 'long', url: 'https://long.example/', text: long },
      ],
      'download',
    );
    await savePageTexts(
      [{ bookmarkId: 't', url: 'https://tab.example/', text: 'seen', truncated: true }],
      'tab',
    );
    const pages = await getPageTexts();
    expect(pages.get('a')?.provenance).toEqual({
      source: 'download',
      readFrom: 'https://notes.example/a',
      fingerprint: await sha256Hex('short'),
      truncated: false,
    });
    // Cut to the limit here, so marked cut; the fingerprint is of the text kept.
    expect(pages.get('long')?.provenance).toMatchObject({
      readFrom: 'https://long.example/',
      truncated: true,
      fingerprint: await sha256Hex(long.slice(0, PAGE_TEXT_LIMITS.maxCharsPerPage)),
    });
    // Cut by the reader already.
    expect(pages.get('t')?.provenance).toMatchObject({ source: 'tab', truncated: true });
  });

  it('says whether the reader had more text than it kept', async () => {
    vi.stubGlobal('DOMParser', LinkedomParser);
    expect(await readPageTextHtml(ARTICLE, 40)).toMatchObject({ status: 'read', truncated: true });
    expect(await readPageTextHtml(ARTICLE, PAGE_TEXT_LIMITS.maxCharsPerPage)).toMatchObject({
      status: 'read',
      truncated: false,
    });
  });

  it('saves a run with source download and the address each page was read from', async () => {
    vi.spyOn(fakeBrowser.bookmarks, 'getTree').mockResolvedValue([
      {
        id: '0',
        title: '',
        syncing: false,
        children: [
          { id: 'r', parentId: '0', title: 'Trip', url: 'http://trip.example/', syncing: false },
        ],
      },
    ]);
    await savePageTextResults([
      {
        id: 'r',
        title: 'Trip',
        url: 'http://trip.example/',
        readFrom: 'https://trip.example/',
        folderPath: '',
        status: 'read',
        text: 'quokka',
        truncated: true,
      },
    ]);
    expect((await getPageTexts()).get('r')?.provenance).toMatchObject({
      source: 'download',
      readFrom: 'https://trip.example/',
      truncated: true,
    });
  });

  it('counts a record from an older extractor as out of date, so it is read again', async () => {
    const url = 'https://notes.example/a';
    await savePageTexts([{ bookmarkId: 'a', url, text: 'old' }], 'download');
    const current = (await getPageTexts()).get('a');
    expect(isPageTextCurrent(current, url)).toBe(true);
    const older = current && {
      ...current,
      extractorVersion: PAGE_TEXT_LIMITS.extractorVersion - 1,
    };
    expect(isPageTextCurrent(older, url)).toBe(false);
    const options = {
      skipPrivateHosts: true,
      skipSecretUrls: true,
      sensitiveParams: [],
      excludedSites: [],
    };
    expect(pageTextNeed(url, older, options, () => false)).toEqual({ status: 'read' });
    expect(pageTextNeed(url, current, options, () => false)).toEqual({ status: 'current' });
  });

  it('keeps records saved before provenance (database version 1), searchable and out of date', async () => {
    globalThis.indexedDB = new IDBFactory();
    const url = 'https://notes.example/a';
    const legacy = await openDB(INDEXED_DATABASES.pageText.name, 1, {
      upgrade(db) {
        db.createObjectStore('pages', { keyPath: 'bookmarkId' });
      },
    });
    await legacy.put('pages', {
      bookmarkId: 'a',
      url,
      text: 'A quokka from before.',
      indexedAt: 1,
      extractorVersion: PAGE_TEXT_LIMITS.extractorVersion,
    });
    legacy.close();
    vi.resetModules();
    const store = await import('@/lib/page-text-store');
    const record = (await store.getPageTexts()).get('a');
    expect(record).toMatchObject({ text: 'A quokka from before.' });
    expect(record?.provenance).toBeUndefined();
    expect(store.isPageTextCurrent(record, url)).toBe(false);
    const upgraded = await openDB(INDEXED_DATABASES.pageText.name);
    expect(upgraded.version).toBe(2);
    upgraded.close();
    // Search still finds it, saying only "page".
    const [result] = searchDocuments(
      buildSearchDocuments(tree, {}, new Map([['a', { url, text: record?.text ?? '' }]])),
      parseSearchQuery('quokka').query,
    );
    expect(searchReasonLabel(result?.reasons)).toBe('page: A quokka from before.');
  });

  it('says in search results where the text came from', () => {
    const texts = new Map([
      [
        'a',
        {
          url: 'https://notes.example/a',
          text: 'A quokka by the river.',
          source: 'download' as const,
        },
      ],
      [
        'b',
        { url: 'https://food.example/b', text: 'A quokka in the kitchen.', source: 'tab' as const },
      ],
    ]);
    const results = searchDocuments(
      buildSearchDocuments(tree, {}, texts),
      parseSearchQuery('quokka').query,
    );
    const labels = Object.fromEntries(
      results.map((result) => [result.document.id, searchReasonLabel(result.reasons)]),
    );
    expect(labels).toEqual({
      a: 'downloaded page: A quokka by the river.',
      b: 'page from your tab: A quokka in the kitchen.',
    });
  });
});

describe('content: with code terms, quotes, and negation (S33)', () => {
  const texts = new Map([
    [
      'a',
      {
        url: 'https://notes.example/a',
        text: 'Templates in C++ and the GPT-6 notes.\nA “smart quote” here.',
      },
    ],
    ['b', { url: 'https://food.example/b', text: 'C is not C plus plus. GPT 6 spaced out.' }],
  ]);
  const ids = (query: string) => {
    const { query: parsed, diagnostics } = parseSearchQuery(query);
    expect(diagnostics).toEqual([]);
    return searchDocuments(buildSearchDocuments(tree, {}, texts), parsed)
      .map((result) => result.document.id)
      .sort();
  };

  it('finds code terms with punctuation as written', () => {
    expect(ids('content:C++')).toEqual(['a']);
    expect(ids('content:GPT-6')).toEqual(['a']);
    expect(ids('content:"GPT 6"')).toEqual(['b']);
  });

  it('finds a phrase with curly quotes in the page, in straight or curly quotes in the query', () => {
    expect(ids('content:"“smart quote”"')).toEqual(['a']);
    expect(ids('content:“smart')).toEqual(['a']);
  });

  it('excludes with -content:, which keeps bookmarks without page text', () => {
    expect(ids('-content:C++')).toEqual(['b', 'moved']);
    expect(ids('-content:"GPT 6" has:content')).toEqual(['a']);
  });
});
