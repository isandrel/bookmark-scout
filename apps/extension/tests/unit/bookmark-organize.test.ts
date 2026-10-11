import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { urlsInText } from '@/lib/bookmark-drop';
import { undoBookmarkChange } from '@/services/bookmark-history';
import {
  addDroppedLinks,
  bookmarkClipboardData,
  moveBookmarksTo,
  pasteBookmarks,
  setBookmarkClipboard,
  sortBookmarkFolder,
  sortedFolderOrder,
} from '@/services/bookmark-organize';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';

let bookmarks: FakeBookmarks;

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  bookmarks = installFakeBookmarks([
    { id: 'f', title: 'Folder' },
    { id: 'g', title: 'Other' },
    { id: 'b10', parentId: 'f', title: 'Item 10', url: 'https://e2e.invalid/10' },
    { id: 'sub', parentId: 'f', title: 'Zeta folder' },
    { id: 'in', parentId: 'sub', title: 'Inside', url: 'https://e2e.invalid/in' },
    { id: 'b2', parentId: 'f', title: 'item 2', url: 'https://e2e.invalid/2' },
    { id: 'a', parentId: 'f', title: 'Alpha folder' },
  ]);
});

const titles = (id: string) => bookmarks.childIds(id).map((child) => bookmarks.get(child)?.title);

describe('sort by name', () => {
  it('puts folders first, then titles in natural order', () => {
    expect(
      sortedFolderOrder([
        { id: '1', title: 'Item 10', url: 'u' },
        { id: '2', title: 'Zeta' },
        { id: '3', title: 'item 2', url: 'u' },
        { id: '4', title: 'Alpha' },
      ]),
    ).toEqual(['4', '2', '3', '1']);
  });

  it('moves the children into that order as one undo step', async () => {
    await expect(sortBookmarkFolder('f', 'Folder')).resolves.toBe(true);
    expect(titles('f')).toEqual(['Alpha folder', 'Zeta folder', 'item 2', 'Item 10']);
    await expect(sortBookmarkFolder('f', 'Folder')).resolves.toBe(false);
    await expect(undoBookmarkChange()).resolves.toMatchObject({
      label: { action: 'sort', title: 'Folder' },
      skipped: 0,
    });
    expect(titles('f')).toEqual(['Item 10', 'Zeta folder', 'item 2', 'Alpha folder']);
  });
});

describe('cut, copy, and paste', () => {
  it('puts URLs on the clipboard as text and escaped HTML links', () => {
    expect(
      bookmarkClipboardData([
        { title: '<b>One</b>', url: 'https://e2e.invalid/a?x=1&y="2"' },
        { title: 'Folder' },
      ]),
    ).toEqual({
      text: 'https://e2e.invalid/a?x=1&y="2"',
      html: '<a href="https://e2e.invalid/a?x=1&amp;y=&quot;2&quot;">&lt;b&gt;One&lt;/b&gt;</a>',
    });
    expect(bookmarkClipboardData([{ title: 'Only folder' }]).text).toBe('Only folder');
  });

  it('pastes copies of copied items, folders with their contents, as they were when copied', async () => {
    await setBookmarkClipboard('copy', ['sub', 'b2']);
    await fakeBrowser.bookmarks.update('b2', { title: 'Renamed after copy' });
    await expect(pasteBookmarks({ parentId: 'g' })).resolves.toEqual({ pasted: 2, skipped: 0 });
    expect(titles('g')).toEqual(['Zeta folder', 'item 2']);
    const [copy] = bookmarks.childIds('g');
    expect(titles(copy)).toEqual(['Inside']);
    // Copies paste again, and one undo removes a whole paste.
    await pasteBookmarks({ parentId: 'g', index: 0 });
    expect(titles('g')).toHaveLength(4);
    await undoBookmarkChange();
    await undoBookmarkChange();
    expect(titles('g')).toEqual([]);
  });

  it('moves cut items on paste, once, skipping a folder pasted into itself', async () => {
    await setBookmarkClipboard('cut', ['b10', 'sub']);
    expect(titles('f')).toContain('Item 10');
    await expect(pasteBookmarks({ parentId: 'sub' })).resolves.toEqual({
      pasted: 1,
      skipped: 1,
    });
    expect(titles('sub')).toEqual(['Inside', 'Item 10']);
    await expect(pasteBookmarks({ parentId: 'g' })).resolves.toBeNull();
  });

  it('creates bookmarks for URLs another app put on the clipboard', async () => {
    await setBookmarkClipboard('copy', ['b2']);
    expect(
      urlsInText('see https://a.example/x and\nftp://files.example/f javascript:alert(1)'),
    ).toEqual(['https://a.example/x', 'ftp://files.example/f']);
    await expect(
      pasteBookmarks({ parentId: 'g' }, 'https://a.example/x https://b.example/'),
    ).resolves.toEqual({ pasted: 2, skipped: 0 });
    expect(titles('g')).toEqual(['https://a.example/x', 'https://b.example/']);
    // The text this page put there pastes the copied items instead.
    await pasteBookmarks({ parentId: 'g' }, 'https://e2e.invalid/2');
    expect(titles('g')).toEqual(['https://a.example/x', 'https://b.example/', 'item 2']);
  });
});

describe('drag and drop', () => {
  it('moves the dragged items, in order, before the drop target as one undo step', async () => {
    await expect(moveBookmarksTo(['b2', 'b10'], { parentId: 'f', beforeId: 'sub' })).resolves.toBe(
      2,
    );
    expect(titles('f')).toEqual(['item 2', 'Item 10', 'Zeta folder', 'Alpha folder']);
    await expect(undoBookmarkChange()).resolves.toMatchObject({
      label: { action: 'move', count: 2 },
      skipped: 0,
    });
    expect(titles('f')).toEqual(['Item 10', 'Zeta folder', 'item 2', 'Alpha folder']);
  });

  it('moves to the end of a folder, its own or another', async () => {
    await moveBookmarksTo(['b10'], { parentId: 'f', beforeId: null });
    expect(titles('f')).toEqual(['Zeta folder', 'item 2', 'Alpha folder', 'Item 10']);
    await moveBookmarksTo(['a'], { parentId: 'sub', beforeId: null });
    expect(titles('sub')).toEqual(['Inside', 'Alpha folder']);
  });

  it('adds dropped links before the drop target as one undo step', async () => {
    const links = [
      { url: 'https://a.example/', title: 'A' },
      { url: 'https://b.example/', title: 'B' },
    ];
    await expect(addDroppedLinks(links, { parentId: 'f', beforeId: 'b2' })).resolves.toBe(2);
    expect(titles('f')).toEqual(['Item 10', 'Zeta folder', 'A', 'B', 'item 2', 'Alpha folder']);
    await expect(undoBookmarkChange()).resolves.toMatchObject({
      label: { action: 'add', count: 2 },
    });
    expect(titles('f')).toEqual(['Item 10', 'Zeta folder', 'item 2', 'Alpha folder']);
  });
});
