import { describe, expect, it } from 'vitest';
import {
  countSearchMatches,
  filterBookmarkTree,
  getSearchExpandedFolderIds,
  getSearchMatchRanges,
  isSearchQueryValid,
  limitSearchResults,
  type SearchOptions,
} from '@/lib/bookmark-search';
import type { BookmarkTreeNode } from '@/types';

const defaults: SearchOptions = { matchCase: false, wholeWord: false, useRegex: false };

const tree: BookmarkTreeNode[] = [
  {
    id: 'root',
    title: '',
    children: [
      {
        id: 'bar',
        parentId: 'root',
        title: 'Bookmarks bar',
        children: [
          {
            id: 'recipes',
            parentId: 'bar',
            title: 'Recipes',
            children: [
              { id: 'soup', parentId: 'recipes', title: 'Soup', url: 'https://soup.example' },
              { id: 'recipe-cake', parentId: 'recipes', title: 'Recipe cake', url: 'https://c.example' },
              { id: 'baking', parentId: 'recipes', title: 'Baking', children: [] },
            ],
          },
          {
            id: 'work',
            parentId: 'bar',
            title: 'Work',
            children: [
              { id: 'recipe-db', parentId: 'work', title: 'Recipe DB', url: 'https://db.example' },
              { id: 'jira', parentId: 'work', title: 'Jira', url: 'https://jira.example' },
            ],
          },
        ],
      },
    ],
  },
];

function ids(nodes: readonly BookmarkTreeNode[]): string[] {
  return nodes.flatMap((node) => [node.id, ...ids(node.children ?? [])]);
}

describe('filterBookmarkTree', () => {
  it('keeps matches, their ancestors, and all contents of matching folders', () => {
    const result = filterBookmarkTree(tree, 'recipe', defaults);

    expect(ids(result)).toEqual([
      'root',
      'bar',
      'recipes',
      'soup',
      'recipe-cake',
      'baking',
      'work',
      'recipe-db',
    ]);
    expect(countSearchMatches(result)).toBe(3);
  });

  it('highlights and flags nested matches inside a matching folder', () => {
    const result = filterBookmarkTree(tree, 'recipe', defaults);
    const recipes = result[0].children?.[0].children?.[0];
    const cake = recipes?.children?.find((node) => node.id === 'recipe-cake');

    expect(recipes).toMatchObject({ title: 'Recipes', searchMatchRanges: [[0, 6]] });
    expect(cake).toMatchObject({
      title: 'Recipe cake',
      isSearchMatch: true,
      searchMatchRanges: [[0, 6]],
    });
    expect(recipes?.children?.find((node) => node.id === 'soup')?.isSearchMatch).toBeUndefined();
  });

  it('keeps markup-like titles verbatim and reports match offsets instead of HTML', () => {
    const title = '<img src=x onerror=alert(1)><style>*{display:none}</style> a&b';
    const markupTree: BookmarkTreeNode[] = [
      {
        id: 'root',
        title: '',
        children: [
          {
            id: 'bar',
            parentId: 'root',
            title: 'Bar',
            children: [{ id: 'x', parentId: 'bar', title, url: 'https://x.example' }],
          },
        ],
      },
    ];

    const [bar] = filterBookmarkTree(markupTree, 'style', defaults)[0].children ?? [];
    const [match] = bar.children ?? [];
    expect(match.title).toBe(title);
    expect(match.searchMatchRanges).toEqual([
      [29, 34],
      [52, 57],
    ]);
  });
});

describe('getSearchMatchRanges', () => {
  it('finds every match for plain, special-character, and case-sensitive queries', () => {
    expect(getSearchMatchRanges('a<b> & <b>', '<b>', defaults)).toEqual([
      [1, 4],
      [7, 10],
    ]);
    expect(getSearchMatchRanges('Tom & Jerry', '&', defaults)).toEqual([[4, 5]]);
    expect(getSearchMatchRanges('Aa aA', 'a', { ...defaults, matchCase: true })).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('matches whole words at Unicode, CJK, and symbol boundaries', () => {
    const whole = { ...defaults, wholeWord: true };
    expect(getSearchMatchRanges('日本語のブックマーク', '日本語', whole)).toEqual([[0, 3]]);
    expect(getSearchMatchRanges('日本語のブックマーク', 'ブックマーク', whole)).toEqual([[4, 10]]);
    expect(getSearchMatchRanges('Learn C++ today', 'C++', whole)).toEqual([[6, 9]]);
    expect(getSearchMatchRanges('C# notes', 'c#', whole)).toEqual([[0, 2]]);
    expect(getSearchMatchRanges('Café menu', 'café', whole)).toEqual([[0, 4]]);
    expect(getSearchMatchRanges('Cafés', 'café', whole)).toEqual([]);
    expect(getSearchMatchRanges('Javaの本', 'java', whole)).toEqual([[0, 4]]);
    expect(getSearchMatchRanges('JavaScript', 'java', whole)).toEqual([]);
    expect(getSearchMatchRanges('word_part', 'word', whole)).toEqual([]);
  });

  it('skips zero-length regex matches', () => {
    expect(getSearchMatchRanges('abc', 'x*', { ...defaults, useRegex: true })).toEqual([]);
  });
});

describe('permanent folders and invalid queries', () => {
  it('does not match the hidden root or permanent folder titles', () => {
    expect(ids(filterBookmarkTree(tree, 'bookmarks', defaults))).toEqual([]);
    expect(ids(filterBookmarkTree(tree, '^$', { ...defaults, useRegex: true }))).toEqual([]);
    expect(ids(filterBookmarkTree(tree, 'bar', defaults))).toEqual([]);
    expect(ids(filterBookmarkTree(tree, 'jira', defaults))).toEqual(['root', 'bar', 'work', 'jira']);
  });

  it('reports invalid regex queries and still searches them as plain text', () => {
    const regex = { ...defaults, useRegex: true };
    expect(isSearchQueryValid('[', regex)).toBe(false);
    expect(isSearchQueryValid('(', regex)).toBe(false);
    expect(isSearchQueryValid('rec.*', regex)).toBe(true);
    expect(isSearchQueryValid('[', defaults)).toBe(true);
    expect(getSearchMatchRanges('a [b]', '[', regex)).toEqual([[2, 3]]);
  });

  it('compiles and matches regex queries the same way with or without Whole Word', () => {
    const regex = { ...defaults, useRegex: true };
    const wholeRegex = { ...regex, wholeWord: true };
    for (const options of [regex, wholeRegex]) {
      // Unicode property escapes work in both modes instead of silently matching nothing.
      expect(getSearchMatchRanges('café 42', '\\p{L}+', options)).toEqual([[0, 4]]);
      // Escapes Unicode mode rejects are reported as invalid in both modes.
      expect(isSearchQueryValid('a\\-b', options)).toBe(false);
      expect(isSearchQueryValid('\\p{L}+', options)).toBe(true);
    }
  });
});

describe('getSearchExpandedFolderIds', () => {
  it('expands ancestors of matches and matching folders, but not match-free subfolders', () => {
    const result = filterBookmarkTree(tree, 'recipe', defaults);
    expect(getSearchExpandedFolderIds(result)).toEqual(['root', 'bar', 'recipes', 'work']);
  });

  it('expands a matching folder even when none of its children match', () => {
    const result = filterBookmarkTree(tree, 'work', defaults);
    expect(getSearchExpandedFolderIds(result)).toEqual(['root', 'bar', 'work']);
  });
});

describe('limitSearchResults', () => {
  it('returns the tree unchanged when within the limit', () => {
    const result = filterBookmarkTree(tree, 'recipe', defaults);
    expect(limitSearchResults(result, 3)).toEqual(result);
  });

  it('keeps only the first matches in display order and drops empty ancestors', () => {
    const result = filterBookmarkTree(tree, 'recipe', defaults);
    const limited = limitSearchResults(result, 2);

    expect(countSearchMatches(limited)).toBe(2);
    expect(ids(limited)).toEqual(['root', 'bar', 'recipes', 'soup', 'recipe-cake', 'baking']);
  });

  it('keeps a single match when the limit is one', () => {
    const limited = limitSearchResults(filterBookmarkTree(tree, 'recipe', defaults), 1);
    expect(ids(limited)).toEqual(['root', 'bar', 'recipes', 'soup', 'baking']);
  });
});
