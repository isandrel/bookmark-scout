import { describe, expect, it } from 'vitest';
import { collectBookmarkStatistics, getScopedNodes } from '@/services/bookmark-tooling';
import type { BookmarkTreeNode } from '@/types';

const tree: BookmarkTreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        parentId: '0',
        title: 'Bookmarks Bar',
        children: [
          { id: '10', parentId: '1', title: 'Top', url: 'https://e2e.invalid/top' },
          {
            id: '11',
            parentId: '1',
            title: 'Tracking',
            children: [
              { id: '12', parentId: '11', title: 'A', url: 'https://e2e.invalid/a' },
              {
                id: '13',
                parentId: '11',
                title: 'Deep',
                children: [{ id: '14', parentId: '13', title: 'B', url: 'https://e2e.invalid/b' }],
              },
            ],
          },
        ],
      },
      { id: '2', parentId: '0', title: 'Other Bookmarks', children: [] },
    ],
  },
];

const options = {
  includeDomains: false,
  includeFolders: false,
  includeProtocols: false,
  includeDuplicates: false,
  topN: 5,
};

describe('bookmark statistics', () => {
  it('counts folders inside the selected folder, excluding the folder itself', () => {
    const stats = collectBookmarkStatistics(getScopedNodes(tree, '11', 'folder'), options);
    expect(stats.totalFolders).toBe(1);
    expect(stats.totalBookmarks).toBe(2);
  });

  it('counts real browser folders for all bookmarks without the unnamed root', () => {
    expect(collectBookmarkStatistics(getScopedNodes(tree, '11', 'all'), options).totalFolders).toBe(
      4,
    );
  });

  it('measures levels consistently between folder and all scopes', () => {
    expect(
      collectBookmarkStatistics(getScopedNodes(tree, '11', 'folder'), options).deepestLevel,
    ).toBe(2);
    expect(
      collectBookmarkStatistics(getScopedNodes(tree, '1', 'folder'), options).deepestLevel,
    ).toBe(3);
    expect(collectBookmarkStatistics(getScopedNodes(tree, null, 'all'), options).deepestLevel).toBe(
      3,
    );
  });

  it('counts untitled folders as a level and lists them as Untitled in top folders', () => {
    const untitled: BookmarkTreeNode[] = [
      {
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            parentId: '0',
            title: 'Bookmarks Bar',
            children: [
              {
                id: '20',
                parentId: '1',
                title: '',
                children: [
                  { id: '21', parentId: '20', title: 'X', url: 'https://e2e.invalid/x' },
                  { id: '22', parentId: '20', title: 'Y', url: 'https://e2e.invalid/y' },
                ],
              },
              {
                id: '30',
                parentId: '1',
                title: '',
                children: [{ id: '31', parentId: '30', title: 'Z', url: 'https://e2e.invalid/z' }],
              },
            ],
          },
        ],
      },
    ];
    const stats = collectBookmarkStatistics(untitled, {
      ...options,
      includeFolders: true,
      includeDepthBreakdown: true,
    });
    expect(stats.deepestLevel).toBe(2);
    expect(stats.depthBreakdown).toEqual([{ level: 2, count: 3 }]);
    expect(stats.topFolders).toEqual([
      { label: 'Bookmarks Bar / bookmarks_untitled', count: 2 },
      { label: 'Bookmarks Bar / bookmarks_untitled', count: 1 },
    ]);
    expect(
      collectBookmarkStatistics(getScopedNodes(untitled, '20', 'folder'), options).deepestLevel,
    ).toBe(1);
  });

  it('includes the depth breakdown only when enabled', () => {
    expect(collectBookmarkStatistics(tree, options).depthBreakdown).toBeUndefined();
    expect(
      collectBookmarkStatistics(tree, { ...options, includeDepthBreakdown: true }).depthBreakdown,
    ).toEqual([
      { level: 1, count: 1 },
      { level: 2, count: 1 },
      { level: 3, count: 1 },
    ]);
  });
});
