import { describe, expect, it } from 'vitest';
import { getBookmarkDisplayTitle } from '@/lib/bookmark-tree';
import {
  areAllSubfoldersExpanded,
  bookmarkRowTooltip,
  flattenVisibleTree,
} from '@/lib/popup-tree-rows';
import type { BookmarkTreeNode } from '@/types';

const link = (id: string, parentId: string): BookmarkTreeNode => ({
  id,
  parentId,
  title: id,
  url: `https://example.com/${id}`,
});
const folder = (id: string, parentId: string, children: BookmarkTreeNode[]): BookmarkTreeNode => ({
  id,
  parentId,
  title: id,
  children,
});

const tree = [
  folder('bar', '0', [
    folder('work', 'bar', [link('w1', 'work'), folder('deep', 'work', [link('d1', 'deep')])]),
    link('b1', 'bar'),
  ]),
  folder('other', '0', []),
];

const ids = (expanded: string[]) =>
  flattenVisibleTree(tree, new Set(expanded)).map((row) => row.node.id);

describe('flattenVisibleTree', () => {
  it('shows only top-level folders while nothing is open', () => {
    expect(ids([])).toEqual(['bar', 'other']);
  });

  it('shows the children of open folders, depth first', () => {
    expect(ids(['bar', 'work'])).toEqual(['bar', 'work', 'w1', 'deep', 'b1', 'other']);
  });

  it('hides the children of an open folder inside a closed one', () => {
    expect(ids(['work', 'deep'])).toEqual(['bar', 'other']);
  });

  it('gives each row its tree position for assistive technology', () => {
    const rows = flattenVisibleTree(tree, new Set(['bar', 'work']));
    const deep = rows.find((row) => row.node.id === 'deep');
    expect(deep).toMatchObject({
      kind: 'folder',
      level: 3,
      posInSet: 2,
      setSize: 2,
      parentId: 'work',
      expanded: false,
    });
    expect(rows.find((row) => row.node.id === 'b1')).toMatchObject({
      kind: 'bookmark',
      level: 2,
      posInSet: 2,
    });
    expect(rows[0]).toMatchObject({ level: 1, parentId: undefined, expanded: true });
  });

  it('marks the temporary new-folder node', () => {
    const withNew = [
      folder('bar', '0', [{ id: 'temp', parentId: 'bar', title: '', isTemporary: true }]),
    ];
    expect(flattenVisibleTree(withNew, new Set(['bar'])).map((row) => row.kind)).toEqual([
      'folder',
      'new-folder',
    ]);
  });

  it('flattens a large library in linear time', () => {
    const big = [
      folder(
        'root',
        '0',
        Array.from({ length: 1_500 }, (_, f) =>
          folder(
            `f${f}`,
            'root',
            Array.from({ length: 13 }, (_, b) => link(`f${f}-${b}`, `f${f}`)),
          ),
        ),
      ),
    ];
    const open = new Set(['root', ...Array.from({ length: 1_500 }, (_, f) => `f${f}`)]);
    const start = performance.now();
    expect(flattenVisibleTree(big, open)).toHaveLength(1 + 1_500 * 14);
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe('areAllSubfoldersExpanded', () => {
  it('is true only when every subfolder at any depth is open', () => {
    const bar = tree[0];
    expect(areAllSubfoldersExpanded(bar, new Set(['work']))).toBe(false);
    expect(areAllSubfoldersExpanded(bar, new Set(['work', 'deep']))).toBe(true);
  });

  it('is false for a folder without subfolders', () => {
    expect(areAllSubfoldersExpanded(tree[1], new Set())).toBe(false);
    expect(areAllSubfoldersExpanded(folder('x', '0', [link('l', 'x')]), new Set())).toBe(false);
  });
});

describe('bookmarkRowTooltip', () => {
  it('shows the whole title and then the address', () => {
    const title = 'A very long bookmark title that the row cuts off long before its end';
    expect(bookmarkRowTooltip({ title, url: 'https://example.com/a' })).toBe(
      `${title}\nhttps://example.com/a`,
    );
  });

  it('names an untitled bookmark like its row does', () => {
    expect(bookmarkRowTooltip({ title: ' ', url: 'https://example.com/b' })).toBe(
      `${getBookmarkDisplayTitle(' ')}\nhttps://example.com/b`,
    );
  });
});
