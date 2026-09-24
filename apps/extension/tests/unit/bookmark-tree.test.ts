import { describe, expect, it } from 'vitest';
import {
  getBookmarkRootIds,
  getTopLevelBookmarkNodes,
  isBookmarkTreeRoot,
  isPermanentBookmarkFolder,
} from '@/lib/bookmark-tree';
import type { BookmarkTreeNode } from '@/types';

const chromeTree: BookmarkTreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      { id: '1', parentId: '0', title: 'Bookmarks bar', folderType: 'bookmarks-bar', children: [] },
      {
        id: '2',
        parentId: '0',
        title: 'Other bookmarks',
        folderType: 'other',
        children: [{ id: '10', parentId: '2', title: 'Nested', children: [] }],
      },
      { id: '3', parentId: '0', title: 'Mobile bookmarks', folderType: 'mobile', children: [] },
    ],
  },
];

const firefoxTree: BookmarkTreeNode[] = [
  {
    id: 'root________',
    title: '',
    children: [
      { id: 'menu________', parentId: 'root________', title: 'Bookmarks Menu', children: [] },
      { id: 'toolbar_____', parentId: 'root________', title: 'Bookmarks Toolbar', children: [] },
      { id: 'mobile______', parentId: 'root________', title: 'Mobile Bookmarks', children: [] },
    ],
  },
];

describe('getTopLevelBookmarkNodes', () => {
  it('replaces the unnamed Chrome root with its permanent folders and hides empty mobile', () => {
    expect(getTopLevelBookmarkNodes(chromeTree).map((node) => node.title)).toEqual([
      'Bookmarks bar',
      'Other bookmarks',
    ]);
  });

  it('keeps a non-empty mobile folder', () => {
    const [root] = chromeTree;
    const withMobile: BookmarkTreeNode[] = [
      {
        ...root,
        children: root.children?.map((child) =>
          child.id === '3'
            ? { ...child, children: [{ id: '30', parentId: '3', title: 'Phone', url: 'https://m.example' }] }
            : child,
        ),
      },
    ];

    expect(getTopLevelBookmarkNodes(withMobile).map((node) => node.id)).toEqual(['1', '2', '3']);
  });

  it('uses tree structure rather than Chrome ids for Firefox', () => {
    expect(getTopLevelBookmarkNodes(firefoxTree).map((node) => node.id)).toEqual([
      'menu________',
      'toolbar_____',
    ]);
  });

  it('leaves already non-root nodes untouched', () => {
    const nodes: BookmarkTreeNode[] = [{ id: '10', parentId: '2', title: 'Nested', children: [] }];
    expect(getTopLevelBookmarkNodes(nodes)).toEqual(nodes);
  });
});

describe('permanent folder detection', () => {
  it('treats roots and their direct children as permanent in any browser', () => {
    for (const tree of [chromeTree, firefoxTree]) {
      const rootIds = getBookmarkRootIds(tree);
      const [root] = tree;
      expect(isBookmarkTreeRoot(root)).toBe(true);
      expect(isPermanentBookmarkFolder(root, rootIds)).toBe(true);
      for (const child of root.children ?? []) {
        expect(isBookmarkTreeRoot(child)).toBe(false);
        expect(isPermanentBookmarkFolder(child, rootIds)).toBe(true);
      }
    }
  });

  it('treats user folders as modifiable', () => {
    const rootIds = getBookmarkRootIds(chromeTree);
    expect(isPermanentBookmarkFolder({ id: '10', parentId: '2' }, rootIds)).toBe(false);
  });
});
