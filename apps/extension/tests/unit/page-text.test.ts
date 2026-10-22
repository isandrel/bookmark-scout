import { DOMParser as LinkedomParser } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  clearPageTexts,
  getPageTextSummary,
  getPageTexts,
  isPageTextCurrent,
  PAGE_TEXT_LIMITS,
  prunePageTexts,
  savePageTexts,
} from '@/lib/page-text-store';
import { buildSearchDocuments, searchDocuments } from '@/lib/search-documents';
import { parseSearchQuery } from '@/lib/search-query';
import { savePageTextResults, scanPageTexts } from '@/services/page-text';
import type { BookmarkTreeNode } from '@/types';

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
    await savePageTexts([
      {
        bookmarkId: 'a',
        url: 'https://notes.example/a',
        text: 'x'.repeat(PAGE_TEXT_LIMITS.maxCharsPerPage + 50),
      },
    ]);
    const pages = await getPageTexts();
    expect(pages.get('a')?.text).toHaveLength(PAGE_TEXT_LIMITS.maxCharsPerPage);
    expect(isPageTextCurrent(pages.get('a'), 'https://notes.example/a')).toBe(true);
    expect(isPageTextCurrent(pages.get('a'), 'https://notes.example/other')).toBe(false);
    expect(await getPageTextSummary()).toEqual({
      pages: 1,
      chars: PAGE_TEXT_LIMITS.maxCharsPerPage,
    });
  });

  it('drops the text of bookmarks that are gone, and clears everything', async () => {
    await savePageTexts([
      { bookmarkId: 'a', url: 'https://notes.example/a', text: 'one' },
      { bookmarkId: 'gone', url: 'https://gone.example/', text: 'two' },
    ]);
    expect(await prunePageTexts(new Set(['a']))).toBe(1);
    expect([...(await getPageTexts()).keys()]).toEqual(['a']);
    await clearPageTexts();
    expect((await getPageTexts()).size).toBe(0);
  });
});

const ARTICLE = `<!doctype html><html><head><title>Trip</title></head><body><article>
<h1>Trip</h1><p>We finally saw a quokka resting under a peppermint tree on the island.</p>
<p>${'More notes about the trip and the island. '.repeat(20)}</p></article></body></html>`;

describe('Index Page Text runs', () => {
  const folder = (children: BookmarkTreeNode[]): BookmarkTreeNode[] => [
    { id: 'f', parentId: '1', title: 'Folder', children },
  ];

  beforeEach(async () => {
    await clearPageTexts();
    vi.stubGlobal('DOMParser', LinkedomParser);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (input.includes('down.')) throw new TypeError('Failed to fetch');
        const body = input.includes('empty.') ? '<html><body></body></html>' : ARTICLE;
        return new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads each page once, sorting what it found, and skips pages it cannot read', async () => {
    await savePageTexts([{ bookmarkId: 'kept', url: 'https://kept.example/', text: 'old' }]);
    const { items, overLimit } = await scanPageTexts(
      folder([
        { id: 'read', parentId: 'f', title: 'Trip', url: 'https://trip.example/' },
        { id: 'empty', parentId: 'f', title: 'Empty', url: 'https://empty.example/' },
        { id: 'down', parentId: 'f', title: 'Down', url: 'https://down.example/' },
        { id: 'kept', parentId: 'f', title: 'Kept', url: 'https://kept.example/' },
        { id: 'local', parentId: 'f', title: 'Router', url: 'http://192.168.1.1/' },
        { id: 'js', parentId: 'f', title: 'Script', url: 'javascript:void(0)' },
      ]),
      { skipPrivateHosts: true },
    );
    expect(overLimit).toBe(0);
    expect(Object.fromEntries(items.map((item) => [item.id, item.status]))).toEqual({
      read: 'read',
      empty: 'empty',
      down: 'failed',
      kept: 'current',
      local: 'skipped',
      js: 'skipped',
    });
    expect(items.find((item) => item.id === 'read')?.text).toContain('quokka');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('saves only the pages left on Save, and drops text of bookmarks that are gone', async () => {
    await savePageTexts([{ bookmarkId: 'gone', url: 'https://gone.example/', text: 'old' }]);
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
});
