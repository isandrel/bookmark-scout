/**
 * Fuzzy Matching's edit distance (`bm25-search.ts`) and its word scan (`search-documents.ts`),
 * which read text in place for speed: both must give what the plain definitions give, a full
 * Damerau-Levenshtein table and the words a `[\p{L}\p{M}\p{N}]+` pattern finds. And a search
 * box typing on (`bookmark-query-filter.lazy.ts`), which checks only what the last query found
 * plus the documents the library's word list says are near: it must find what a search of the
 * whole library finds.
 */
import { describe, expect, it } from 'vitest';
import { editDistanceWithin, editDistanceWithinRange, searchMatchingOf } from '@/lib/bm25-search';
import { matchBookmarkTreeQuery, prepareSearchDocuments } from '@/lib/bookmark-query-filter.lazy';
import { buildSearchDocuments, compileSearchQuery } from '@/lib/search-documents';
import { parseSearchQuery } from '@/lib/search-query';
import { defaultSettings } from '@/lib/settings-schema';
import type { BookmarkTreeNode } from '@/types';

/** Damerau-Levenshtein (neighbour swaps count once) by its full table: the definition. */
function plainDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

/** A repeatable stream of numbers in [0, 1): the same words on every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

describe('edit distance', () => {
  it('gives the plain distance up to the limit and one more than the limit beyond it', () => {
    const random = seeded(7);
    // Few letters, so random words are often close to each other.
    const word = () =>
      Array.from({ length: Math.floor(random() * 9) }, () => 'abcd'[Math.floor(random() * 4)]).join(
        '',
      );
    const pairs: [string, string][] = [
      ['react', 'recat'],
      ['react', 'raect'],
      ['example', 'exmaple'],
      ['', 'ab'],
      ['abc', ''],
      ['書籤管理', '書簽管理'],
      ...Array.from({ length: 3000 }, (): [string, string] => [word(), word()]),
    ];
    for (const [a, b] of pairs) {
      const plain = plainDistance(a, b);
      for (const limit of [0, 1, 2, 3]) {
        expect(editDistanceWithin(a, b, limit), `${a}|${b}|${limit}`).toBe(
          Math.min(plain, limit + 1),
        );
      }
    }
  });

  it('reads a word in place, and a word longer than any before it', () => {
    expect(editDistanceWithinRange('react', 'learn recat today', 6, 11, 2)).toBe(1);
    const long = 'a'.repeat(300);
    expect(editDistanceWithin(long, `${long}b`, 2)).toBe(1);
    expect(editDistanceWithin(`${long}cc`, long, 1)).toBe(2);
  });
});

describe('fuzzy matches in a title', () => {
  const titles = [
    'Recat hooks, explained',
    'Café Réact — notes',
    '学习 Raect 入门',
    '🚀React🚀 quick start',
    'reactive_streams react-dom',
    'Nothing close',
  ];
  const tree: BookmarkTreeNode[] = [
    {
      id: '0',
      title: '',
      syncing: false,
      children: [
        {
          id: '1',
          parentId: '0',
          title: 'Bar',
          syncing: false,
          children: titles.map((title, index) => ({
            id: String(10 + index),
            parentId: '1',
            title,
            url: `https://e2e.invalid/${index}`,
            syncing: false,
          })),
        },
      ],
    },
  ];
  const documents = buildSearchDocuments(tree, {});
  const matching = searchMatchingOf(defaultSettings);

  /** The ranges a pattern for words finds, each within the same edits: the definition. */
  function plainRanges(title: string, needle: string, budget: number): [number, number][] {
    const ranges: [number, number][] = [];
    for (const match of title.toLowerCase().matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
      if (plainDistance(needle, match[0]) > budget) continue;
      ranges.push([match.index, match.index + match[0].length]);
    }
    return ranges;
  }

  it('marks the same words a word pattern finds, in any script and beside emoji', () => {
    // Longer than Fuzzy Matching's two-edit length, found in no title as typed.
    const needle = 'reactx';
    const budget = needle.length >= defaultSettings.searchFuzzyTwoEdits ? 2 : 1;
    const match = compileSearchQuery(parseSearchQuery(needle).query, matching);
    for (const document of documents) {
      const expected = plainRanges(document.title, needle, budget);
      const found = match(document)?.reasons.find((reason) => reason.field === 'title');
      expect(found && 'ranges' in found ? found.ranges : [], document.title).toEqual(expected);
    }
    // The check above compares something: some titles match and one does not.
    expect(documents.filter((document) => match(document)).length).toBeGreaterThanOrEqual(2);
    expect(match(documents[documents.length - 1])).toBeUndefined();
  });
});

describe('typing on in a search box with Fuzzy Matching', () => {
  // More documents than one search reads before it uses the library's word list.
  const words = ['react', 'recat', 'raect', 'reach', 'redux', 'rect', 'recipe', 'reading', 'tread'];
  const makeTree = (extra: string[] = []): BookmarkTreeNode[] => [
    {
      id: '0',
      title: '',
      syncing: false,
      children: [
        {
          id: '1',
          parentId: '0',
          title: 'Bar',
          syncing: false,
          children: [
            ...Array.from({ length: 240 }, (_, index) => ({
              id: String(100 + index),
              parentId: '1',
              title: `${words[index % words.length]} notes ${index % 7}`,
              url: `https://e2e.invalid/${index}`,
              syncing: false,
            })),
            ...extra.map((title, index) => ({
              id: String(900 + index),
              parentId: '1',
              title,
              url: `https://e2e.invalid/extra/${index}`,
              syncing: false,
            })),
          ],
        },
      ],
    },
  ];
  const matching = searchMatchingOf(defaultSettings);

  /** What a query matches when every document is read with no word list and no earlier query. */
  function plainMatches(tree: BookmarkTreeNode[], text: string) {
    const match = compileSearchQuery(parseSearchQuery(text).query, matching);
    const found = new Map<string, unknown>();
    for (const document of buildSearchDocuments(tree, {})) {
      const result = match(document);
      if (result) found.set(document.id, result.reasons);
    }
    return found;
  }

  // One object, as a page holds it: typing on reuses the last query's documents only for the same
  // tree and the same tags and summaries.
  const metadata = {};
  const typed = (tree: BookmarkTreeNode[], text: string) =>
    new Map(matchBookmarkTreeQuery(tree, text, metadata) ?? []);

  it('finds what a fresh search of the whole library finds, at every letter', () => {
    const tree = makeTree();
    for (const word of ['react', 'rectt', 'redux notes 3', 'treadd', 'recipee 5', 'zzzzz']) {
      for (let length = 1; length <= word.length; length++) {
        const text = word.slice(0, length);
        if (!text.trim() || text.endsWith(' ')) continue;
        expect([...typed(tree, text)], text).toEqual([...plainMatches(tree, text)]);
      }
    }
    // The case narrowing alone would miss: `rec` is in no `react`, `rect` is one edit from it.
    typed(tree, 'rec');
    const ids = [...typed(tree, 'rect').keys()];
    expect(ids).toContain('100');
    expect(typed(tree, 'rec').has('100')).toBe(false);
  });

  it('finds a near spelling in a bookmark added after the last search', () => {
    const before = makeTree();
    expect([...typed(before, 'reakt')]).toEqual([...plainMatches(before, 'reakt')]);
    const after = makeTree(['Reakt handbook', 'Unrelated']);
    const found = typed(after, 'reakt');
    expect([...found]).toEqual([...plainMatches(after, 'reakt')]);
    expect(found.has('900')).toBe(true);
    expect(found.has('901')).toBe(false);
  });

  it('prepares the documents and then the word list in slices, and a search in between is right', () => {
    // A few documents per slice, as an idle callback with little time left gives.
    const slice = (tree: BookmarkTreeNode[]) => {
      let left = 30;
      return prepareSearchDocuments(tree, metadata, () => left-- <= 0);
    };
    const tree = makeTree(['Reakt extra']);
    let slices = 1;
    while (!slice(tree) && slices < 200) slices += 1;
    // More than the documents alone take: the word list has slices of its own.
    expect(slices).toBeGreaterThan(Math.ceil(241 / 30));
    expect(slice(tree)).toBe(true);
    expect([...typed(tree, 'reakt')]).toEqual([...plainMatches(tree, 'reakt')]);
    expect(typed(tree, 'reakt').has('900')).toBe(true);

    // A search before the preparation is done reads what is left itself.
    const early = makeTree(['Reakt early']);
    slice(early);
    slice(early);
    expect([...typed(early, 'reakt')]).toEqual([...plainMatches(early, 'reakt')]);
    expect(typed(early, 'reakt').has('900')).toBe(true);
  });

  it('follows a renamed bookmark and a library that shrank', () => {
    const before = makeTree();
    expect(typed(before, 'reakt').has('100')).toBe(true);
    // The same bookmark under another title: its old word is no match, its new one is.
    const renamed = makeTree();
    const first = renamed[0]?.children?.[0]?.children?.[0];
    if (first) first.title = 'Svelte handbook';
    expect([...typed(renamed, 'reakt')]).toEqual([...plainMatches(renamed, 'reakt')]);
    expect(typed(renamed, 'reakt').has('100')).toBe(false);
    expect([...typed(renamed, 'sveltee').keys()]).toEqual(['100']);
    // Far fewer bookmarks than the word list remembers: it is made afresh, and still right.
    const small = makeTree();
    const bar = small[0]?.children?.[0];
    if (bar?.children) bar.children = bar.children.slice(0, 20);
    expect([...typed(small, 'reakt')]).toEqual([...plainMatches(small, 'reakt')]);
    expect(typed(small, 'reakt').size).toBeGreaterThan(0);
  });
});
