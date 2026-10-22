import { beforeEach, describe, expect, it } from 'vitest';
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
