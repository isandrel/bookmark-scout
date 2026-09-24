import { describe, expect, it } from 'vitest';
import {
  countSearchMatches,
  filterBookmarkTree,
  getSearchExpandedFolderIds,
  getSearchMatchRanges,
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
      { id: 'root', title: '', children: [{ id: 'x', parentId: 'root', title, url: 'https://x.example' }] },
    ];

    const [match] = filterBookmarkTree(markupTree, 'style', defaults)[0].children ?? [];
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

  it('skips zero-length regex matches', () => {
    expect(getSearchMatchRanges('abc', 'x*', { ...defaults, useRegex: true })).toEqual([]);
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
