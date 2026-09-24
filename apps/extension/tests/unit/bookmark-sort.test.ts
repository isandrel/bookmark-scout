import { describe, expect, it } from 'vitest';
import { sortBookmarkItems, sortBookmarkTree } from '@/lib/bookmark-sort';
import type { SortOrder } from '@/lib/settings-schema';
import type { BookmarkTreeNode } from '@/types';

type SortableFixture = {
  title: string;
  dateAdded?: number;
  folder: boolean;
  index: number;
};

const fixtureAccessors = {
  getTitle: (item: SortableFixture) => item.title,
  getDateAdded: (item: SortableFixture) => item.dateAdded,
  isFolder: (item: SortableFixture) => item.folder,
  getIndex: (item: SortableFixture) => item.index,
};

describe('sortBookmarkItems', () => {
  it('sorts newest dates first and places missing dates last', () => {
    const items: SortableFixture[] = [
      { title: 'Older', dateAdded: 100, folder: false, index: 0 },
      { title: 'Unknown', folder: false, index: 1 },
      { title: 'Newest', dateAdded: 300, folder: false, index: 2 },
    ];

    const result = sortBookmarkItems(items, 'date', fixtureAccessors);

    expect(result.map((item) => item.title)).toEqual(['Newest', 'Older', 'Unknown']);
  });

  it('sorts titles case-insensitively with numeric segments', () => {
    const items: SortableFixture[] = [
      { title: 'Item 10', folder: false, index: 0 },
      { title: 'item 2', folder: false, index: 1 },
      { title: 'Alpha', folder: false, index: 2 },
    ];

    const result = sortBookmarkItems(items, 'alphabetical', fixtureAccessors);

    expect(result.map((item) => item.title)).toEqual(['Alpha', 'item 2', 'Item 10']);
  });

  it('groups folders first while preserving browser order within each group', () => {
    const items: SortableFixture[] = [
      { title: 'Link A', folder: false, index: 0 },
      { title: 'Folder B', folder: true, index: 1 },
      { title: 'Link C', folder: false, index: 2 },
      { title: 'Folder D', folder: true, index: 3 },
    ];

    const result = sortBookmarkItems(items, 'folders', fixtureAccessors);

    expect(result.map((item) => item.title)).toEqual(['Folder B', 'Folder D', 'Link A', 'Link C']);
  });

  it('returns a new array without mutating its input', () => {
    const items: SortableFixture[] = [
      { title: 'Zulu', folder: false, index: 0 },
      { title: 'Alpha', folder: false, index: 1 },
    ];
    const snapshot = structuredClone(items);

    const result = sortBookmarkItems(items, 'alphabetical', fixtureAccessors);

    expect(result).not.toBe(items);
    expect(items).toEqual(snapshot);
  });
});

describe('sortBookmarkTree', () => {
  it('sorts recursively and keeps temporary folder inputs pinned', () => {
    const tree: BookmarkTreeNode[] = [
      {
        id: 'root',
        title: 'Root',
        children: [
          { id: 'zulu', title: 'Zulu', url: 'https://z.example', index: 0 },
          {
            id: 'nested',
            title: 'Nested',
            index: 1,
            children: [
              { id: 'nested-zulu', title: 'Zulu child', url: 'https://z.example', index: 0 },
              { id: 'nested-alpha', title: 'Alpha child', url: 'https://a.example', index: 1 },
            ],
          },
          {
            id: 'temporary',
            title: 'New Folder',
            index: 2,
            isTemporary: true,
            children: [],
          },
          { id: 'alpha', title: 'Alpha', url: 'https://a.example', index: 3 },
        ],
      },
    ];

    const result = sortBookmarkTree(tree, 'alphabetical');

    expect(result[0].children?.map((item) => item.id)).toEqual([
      'temporary',
      'alpha',
      'nested',
      'zulu',
    ]);
    expect(
      result[0].children?.find((item) => item.id === 'nested')?.children?.map((item) => item.id),
    ).toEqual(['nested-alpha', 'nested-zulu']);
    expect(tree[0].children?.map((item) => item.id)).toEqual([
      'zulu',
      'nested',
      'temporary',
      'alpha',
    ]);
  });

  it('uses original titles when the visible tree contains search highlighting', () => {
    const original: BookmarkTreeNode[] = [
      { id: 'zulu', title: 'Zulu', url: 'https://z.example' },
      { id: 'alpha', title: 'Alpha', url: 'https://a.example' },
    ];
    const highlighted: BookmarkTreeNode[] = [
      { ...original[0], title: '<mark>Zulu</mark>' },
      original[1],
    ];

    expect(sortBookmarkTree(highlighted, 'alphabetical', original).map((node) => node.id)).toEqual([
      'alpha',
      'zulu',
    ]);
  });
});

describe('groupFolders option (groupByFolders setting)', () => {
  const mixed: SortableFixture[] = [
    { title: 'Zulu Link', dateAdded: 400, folder: false, index: 0 },
    { title: 'Zulu Folder', dateAdded: 300, folder: true, index: 1 },
    { title: 'Alpha Link', dateAdded: 200, folder: false, index: 2 },
    { title: 'Alpha Folder', dateAdded: 100, folder: true, index: 3 },
  ];
  const titlesFor = (order: SortOrder, groupFolders: boolean) =>
    sortBookmarkItems(mixed, order, fixtureAccessors, { groupFolders }).map((item) => item.title);

  it('lists folders before links and sorts alphabetically within each group', () => {
    expect(titlesFor('alphabetical', true)).toEqual([
      'Alpha Folder',
      'Zulu Folder',
      'Alpha Link',
      'Zulu Link',
    ]);
  });

  it('lists folders before links and sorts newest first within each group', () => {
    expect(titlesFor('date', true)).toEqual([
      'Zulu Folder',
      'Alpha Folder',
      'Zulu Link',
      'Alpha Link',
    ]);
  });

  it('interleaves folders and links when disabled', () => {
    expect(titlesFor('alphabetical', false)).toEqual([
      'Alpha Folder',
      'Alpha Link',
      'Zulu Folder',
      'Zulu Link',
    ]);
    expect(titlesFor('date', false)).toEqual([
      'Zulu Link',
      'Zulu Folder',
      'Alpha Link',
      'Alpha Folder',
    ]);
  });

  it('keeps temporary folders pinned above grouped folders in trees', () => {
    const tree: BookmarkTreeNode[] = [
      { id: 'link', title: 'Alpha Link', url: 'https://a.example', index: 0 },
      { id: 'folder', title: 'Zulu Folder', index: 1, children: [] },
      { id: 'temporary', title: 'New Folder', index: 2, isTemporary: true, children: [] },
    ];

    expect(
      sortBookmarkTree(tree, 'alphabetical', tree, { groupFolders: true }).map((node) => node.id),
    ).toEqual(['temporary', 'folder', 'link']);
  });
});
