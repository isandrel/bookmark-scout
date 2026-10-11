import { DOMParser as LinkedomParser } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getManagerDropZone,
  isBookmarkableUrl,
  MANAGER_DRAG_AUTO_EXPAND_MS,
  type ManagerDropTarget,
  parseDroppedLinks,
  resolveManagerDrop,
  urlsInText,
} from '@/lib/bookmark-drop';
import { readConfigToml } from '../config-files';

const config = readConfigToml('ui/drag-drop.toml') as {
  folder_edge_fraction: number;
  bookmark_split_fraction: number;
  manager_auto_expand_ms: number;
};

const folder: ManagerDropTarget = { id: 'f', parentId: 'root', isFolder: true, movable: true };
const bookmark: ManagerDropTarget = { id: 'b', parentId: 'root', isFolder: false, movable: true };

// root: [a, f, b, c]; f: [f1, sub]; sub: [s1]
const items = [
  { id: 'root' },
  { id: 'a', parentId: 'root', index: 0 },
  { id: 'f', parentId: 'root', index: 1 },
  { id: 'b', parentId: 'root', index: 2 },
  { id: 'c', parentId: 'root', index: 3 },
  { id: 'f1', parentId: 'f', index: 0 },
  { id: 'sub', parentId: 'f', index: 1 },
  { id: 's1', parentId: 'sub', index: 0 },
];

describe('manager drop zones', () => {
  it('reads the zone sizes and hover delay from config', () => {
    expect(MANAGER_DRAG_AUTO_EXPAND_MS).toBe(config.manager_auto_expand_ms);
    const edge = config.folder_edge_fraction;
    expect(getManagerDropZone(folder, edge / 2, true)).toBe('before');
    expect(getManagerDropZone(folder, 0.5, true)).toBe('into');
    expect(getManagerDropZone(folder, 1 - edge / 2, true)).toBe('after');
    const split = config.bookmark_split_fraction;
    expect(getManagerDropZone(bookmark, split / 2, true)).toBe('before');
    expect(getManagerDropZone(bookmark, (1 + split) / 2, true)).toBe('after');
  });

  it('only goes into folders when the rows cannot reorder or the target never moves', () => {
    expect(getManagerDropZone(folder, 0.01, false)).toBe('into');
    expect(getManagerDropZone(bookmark, 0.01, false)).toBeNull();
    expect(getManagerDropZone({ ...folder, movable: false }, 0.01, true)).toBe('into');
    expect(getManagerDropZone({ ...bookmark, movable: false }, 0.01, true)).toBeNull();
  });
});

describe('manager drop destinations', () => {
  it('goes before the target, after it, or into a folder at its end', () => {
    expect(resolveManagerDrop(['c'], bookmark, 'before', items)).toEqual({
      parentId: 'root',
      beforeId: 'b',
    });
    expect(resolveManagerDrop(['a'], bookmark, 'after', items)).toEqual({
      parentId: 'root',
      beforeId: 'c',
    });
    expect(resolveManagerDrop(['a'], folder, 'into', items)).toEqual({
      parentId: 'f',
      beforeId: null,
    });
  });

  it('skips dragged items when finding the row after the target', () => {
    expect(resolveManagerDrop(['c'], bookmark, 'after', items)).toEqual({
      parentId: 'root',
      beforeId: null,
    });
  });

  it('refuses a drop on a dragged item or a folder into itself or inside itself', () => {
    expect(resolveManagerDrop(['b'], bookmark, 'before', items)).toBeNull();
    expect(resolveManagerDrop(['f'], folder, 'into', items)).toBeNull();
    const inside: ManagerDropTarget = { id: 'sub', parentId: 'f', isFolder: true, movable: true };
    expect(resolveManagerDrop(['f'], inside, 'into', items)).toBeNull();
    expect(resolveManagerDrop(['f'], inside, 'before', items)).toBeNull();
  });
});

describe('dropped links', () => {
  beforeEach(() => vi.stubGlobal('DOMParser', LinkedomParser));
  afterEach(() => vi.unstubAllGlobals());

  it('reads text/uri-list, skipping comments, and titles links from the HTML', () => {
    expect(
      parseDroppedLinks({
        uriList: '# comment\r\nhttps://a.example/\r\nhttps://b.example/x\r\njavascript:alert(1)',
        html: '<a href="https://a.example/">Page A</a>',
      }),
    ).toEqual([
      { url: 'https://a.example/', title: 'Page A' },
      { url: 'https://b.example/x', title: 'https://b.example/x' },
    ]);
  });

  it("reads Firefox's text/x-moz-url pairs of URL and title", () => {
    expect(
      parseDroppedLinks({ mozUrl: 'https://a.example/\nPage A\nhttps://b.example/\nPage B' }),
    ).toEqual([
      { url: 'https://a.example/', title: 'Page A' },
      { url: 'https://b.example/', title: 'Page B' },
    ]);
  });

  it('falls back to URLs in plain text, once each', () => {
    expect(
      parseDroppedLinks({ plain: 'see https://a.example/ and https://a.example/ file:///x' }),
    ).toEqual([
      { url: 'https://a.example/', title: 'https://a.example/' },
      { url: 'file:///x', title: 'file:///x' },
    ]);
    expect(parseDroppedLinks({ plain: 'no links here' })).toEqual([]);
    // Browsers pass empty strings for the types a drag does not carry.
    expect(
      parseDroppedLinks({ uriList: '', mozUrl: '', html: '', plain: 'https://a.example/' }),
    ).toEqual([{ url: 'https://a.example/', title: 'https://a.example/' }]);
  });

  it('keeps only web, ftp, and file URLs', () => {
    expect(
      urlsInText('https://a.example/ chrome://settings data:text/plain,x ftp://f.example/'),
    ).toEqual(['https://a.example/', 'ftp://f.example/']);
    expect(isBookmarkableUrl('mailto:someone@example.com')).toBe(false);
  });
});
