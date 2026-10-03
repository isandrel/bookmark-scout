import { describe, expect, it } from 'vitest';
import {
  getTreeDropZone,
  resolveTreeDrop,
  type TreeDragSource,
  type TreeDropTarget,
} from '@/components/bookmark/tree-drop';
import type { BookmarkTreeNode } from '@/types';
import { readConfigToml } from '../config-files';

const { folder_edge_fraction: edge, bookmark_split_fraction: split } = readConfigToml(
  'ui/popup-tree.toml',
) as { folder_edge_fraction: number; bookmark_split_fraction: number };

const folderNode: BookmarkTreeNode = {
  id: 'f1',
  parentId: 'p1',
  index: 3,
  title: 'Folder',
  children: [
    { id: 'c1', parentId: 'f1', index: 0, title: 'One', url: 'https://e.invalid/1' },
    { id: 'c2', parentId: 'f1', index: 1, title: 'Two', url: 'https://e.invalid/2' },
  ],
};
const bookmarkNode: BookmarkTreeNode = {
  id: 'b1',
  parentId: 'p1',
  index: 5,
  title: 'Bookmark',
  url: 'https://e.invalid/b',
};

const folderTarget: TreeDropTarget = { kind: 'folder', node: folderNode, movable: true };
const bookmarkTarget: TreeDropTarget = { kind: 'bookmark', node: bookmarkNode, movable: true };
const draggedBookmark: TreeDragSource = {
  kind: 'bookmark',
  node: { id: 's1', parentId: 'p2', index: 7, title: 'Source', url: 'https://e.invalid/s' },
};
const draggedFolder: TreeDragSource = {
  kind: 'folder',
  node: { id: 's2', parentId: 'p2', index: 2, title: 'Source folder', children: [] },
};

/** A pointer at `fraction` of a 32px row that starts at y = 100. */
const at = (fraction: number) => ({ clientY: 100 + 32 * fraction, top: 100, height: 32 });

describe('getTreeDropZone', () => {
  it('splits folder rows into before, into, and after bands from the config', () => {
    expect(getTreeDropZone(folderTarget, at(edge / 2))).toBe('before');
    expect(getTreeDropZone(folderTarget, at(edge))).toBe('into');
    expect(getTreeDropZone(folderTarget, at(0.5))).toBe('into');
    expect(getTreeDropZone(folderTarget, at(1 - edge))).toBe('into');
    expect(getTreeDropZone(folderTarget, at(1 - edge / 2))).toBe('after');
  });

  it('only drops into folders that cannot move', () => {
    const fixed = { ...folderTarget, movable: false };
    expect(getTreeDropZone(fixed, at(0.01))).toBe('into');
    expect(getTreeDropZone(fixed, at(0.99))).toBe('into');
  });

  it('splits bookmark rows into before and after, never into', () => {
    expect(getTreeDropZone(bookmarkTarget, at(split - 0.01))).toBe('before');
    expect(getTreeDropZone(bookmarkTarget, at(split))).toBe('after');
    expect(getTreeDropZone(bookmarkTarget, at(0.5 * edge))).toBe('before');
    expect(getTreeDropZone(bookmarkTarget, at(1))).toBe('after');
  });

  it('treats a row without height as its middle', () => {
    expect(getTreeDropZone(folderTarget, { clientY: 0, top: 0, height: 0 })).toBe('into');
  });
});

describe('resolveTreeDrop', () => {
  it('moves a bookmark into the end of a folder from its middle band', () => {
    expect(resolveTreeDrop(draggedBookmark, folderTarget, at(0.5))).toEqual({
      type: 'bookmark-move',
      sourceId: 's1',
      sourceParentId: 'p2',
      sourceIndex: 7,
      targetId: 'f1',
      targetParentId: 'f1',
      targetIndex: 2,
    });
  });

  it('reorders a folder beside a folder from its edge bands', () => {
    expect(resolveTreeDrop(draggedFolder, folderTarget, at(edge / 2))).toMatchObject({
      type: 'folder-reorder',
      targetParentId: 'p1',
      targetIndex: 3,
    });
    expect(resolveTreeDrop(draggedFolder, folderTarget, at(1 - edge / 2))).toMatchObject({
      type: 'folder-reorder',
      targetParentId: 'p1',
      targetIndex: 4,
    });
  });

  it('reorders before or after a bookmark for both source kinds', () => {
    expect(resolveTreeDrop(draggedBookmark, bookmarkTarget, at(0.2))).toMatchObject({
      type: 'bookmark-reorder',
      targetId: 'b1',
      targetParentId: 'p1',
      targetIndex: 5,
    });
    expect(resolveTreeDrop(draggedFolder, bookmarkTarget, at(0.8))).toMatchObject({
      type: 'folder-reorder',
      targetParentId: 'p1',
      targetIndex: 6,
    });
  });

  it('moves into a fixed folder from any band', () => {
    const fixed = { ...folderTarget, movable: false };
    expect(resolveTreeDrop(draggedFolder, fixed, at(0.01))).toMatchObject({
      type: 'folder-move',
      targetParentId: 'f1',
      targetIndex: 2,
    });
  });

  it('records root parents and missing indexes for top-level nodes', () => {
    const root: TreeDropTarget = {
      kind: 'folder',
      node: { id: 'r1', title: 'Root folder' },
      movable: true,
    };
    const topLevel: TreeDragSource = { kind: 'folder', node: { id: 'r2', title: 'Other root' } };
    expect(resolveTreeDrop(topLevel, root, at(0.9))).toEqual({
      type: 'folder-reorder',
      sourceId: 'r2',
      sourceParentId: 'root',
      sourceIndex: 0,
      targetId: 'r1',
      targetParentId: 'root',
      targetIndex: 1,
    });
    expect(resolveTreeDrop(topLevel, root, at(0.5))).toMatchObject({
      type: 'folder-move',
      targetParentId: 'r1',
      targetIndex: 0,
    });
  });

  it('ignores a row dropped on itself', () => {
    expect(resolveTreeDrop({ kind: 'folder', node: folderNode }, folderTarget, at(0.5))).toBeNull();
  });
});
