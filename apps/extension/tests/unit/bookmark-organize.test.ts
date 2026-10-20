import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { urlsInText } from '@/lib/bookmark-drop';
import { undoBookmarkChange } from '@/services/bookmark-history';
import {
  addDroppedLinks,
  bookmarkClipboardData,
  bookmarkClipboardValue,
  moveBookmarksTo,
  pasteBookmarks,
  setBookmarkClipboard,
  sortBookmarkFolder,
  sortedFolderOrder,
} from '@/services/bookmark-organize';
import { bookmarkMetadataValue } from '@/lib/bookmark-metadata-storage';
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

  it('pastes copies of copied items, folders with their contents, as they are when pasted', async () => {
    await setBookmarkClipboard('copy', ['sub', 'b2']);
    await fakeBrowser.bookmarks.update('b2', { title: 'Renamed after copy' });
    await expect(pasteBookmarks({ parentId: 'g' })).resolves.toEqual({ pasted: 2, skipped: 0 });
    expect(titles('g')).toEqual(['Zeta folder', 'Renamed after copy']);
    const [copy] = bookmarks.childIds('g');
    expect(titles(copy)).toEqual(['Inside']);
    // Copies paste again, and one undo removes a whole paste.
    await pasteBookmarks({ parentId: 'g', index: 0 });
    expect(titles('g')).toHaveLength(4);
    await undoBookmarkChange();
    await undoBookmarkChange();
    expect(titles('g')).toEqual([]);
  });

  it('copies a deep folder with tags, summaries, empty folders, and separators (L16, L17)', async () => {
    bookmarks = installFakeBookmarks([
      { id: 'src', title: 'Source' },
      { id: 'dst', title: 'Target' },
      { id: 'n1', parentId: 'src', title: 'Docs', url: 'https://e2e.invalid/docs' },
      { id: 'sep', parentId: 'src', title: '', type: 'separator' },
      { id: 'empty', parentId: 'src', title: 'Empty' },
      { id: 'deep', parentId: 'src', title: 'Deep' },
      { id: 'n2', parentId: 'deep', title: 'Docs', url: 'https://e2e.invalid/docs' },
      { id: 'n3', parentId: 'deep', title: '', url: 'https://e2e.invalid/x?b=2&a=1#frag' },
    ]);
    await bookmarkMetadataValue.set({
      n1: { tags: ['work'], summary: 'Top copy' },
      n2: { tags: ['deep'] },
    });
    const sourceBefore = await fakeBrowser.bookmarks.getSubTree('src');

    await setBookmarkClipboard('copy', ['src']);
    await expect(pasteBookmarks({ parentId: 'dst' })).resolves.toEqual({ pasted: 1, skipped: 0 });

    const [copy] = await fakeBrowser.bookmarks.getSubTree('dst');
    const [folder] = copy.children ?? [];
    const shape = (node: Browser.bookmarks.BookmarkTreeNode): unknown => ({
      title: node.title,
      url: node.url,
      type: (node as { type?: string }).type,
      children: node.children?.map(shape),
    });
    const [source] = sourceBefore;
    expect(shape(folder)).toEqual(shape(source));
    // Tags and summaries follow the copies, under their new ids.
    const metadata = await bookmarkMetadataValue.get();
    const [docs, , , deep] = folder.children ?? [];
    expect(metadata[docs.id]).toEqual({ tags: ['work'], summary: 'Top copy' });
    expect(metadata[deep.children?.[0]?.id ?? '']).toEqual({ tags: ['deep'] });
    // The source is untouched.
    expect(await fakeBrowser.bookmarks.getSubTree('src')).toEqual(sourceBefore);

    // One undo removes the whole paste, copied tags included.
    await expect(undoBookmarkChange()).resolves.toMatchObject({ skipped: 0 });
    expect(bookmarks.childIds('dst')).toEqual([]);
  });

  it('moves cut items on paste, once; one that could not move stays cut', async () => {
    await setBookmarkClipboard('cut', ['b10', 'sub']);
    expect(titles('f')).toContain('Item 10');
    await expect(pasteBookmarks({ parentId: 'sub' })).resolves.toEqual({
      pasted: 1,
      skipped: 1,
    });
    expect(titles('sub')).toEqual(['Inside', 'Item 10']);
    // The folder could not go inside itself, so it is still cut and pastes somewhere else.
    await expect(bookmarkClipboardValue.get()).resolves.toMatchObject({
      mode: 'cut',
      ids: ['sub'],
    });
    await expect(pasteBookmarks({ parentId: 'g' })).resolves.toEqual({ pasted: 1, skipped: 0 });
    expect(titles('g')).toEqual(['Zeta folder']);
    await expect(pasteBookmarks({ parentId: 'g' })).resolves.toBeNull();
  });

  it('keeps a failed cut whole, and drops items deleted since', async () => {
    await setBookmarkClipboard('cut', ['sub', 'b2']);
    await fakeBrowser.bookmarks.removeTree('b2');
    // Only the folder is left, and it cannot go into itself: nothing moves, and it stays cut.
    await expect(pasteBookmarks({ parentId: 'sub' })).resolves.toEqual({ pasted: 0, skipped: 2 });
    await expect(bookmarkClipboardValue.get()).resolves.toMatchObject({ ids: ['sub'] });
  });

  it('pastes what another manager tab cut or copied, skipping items deleted since', async () => {
    // Another tab stored the clipboard; this page has done nothing but read it.
    await bookmarkClipboardValue.set({ mode: 'copy', ids: ['b2', 'gone'], textHash: '0', at: 1 });
    await expect(pasteBookmarks({ parentId: 'g' })).resolves.toEqual({ pasted: 1, skipped: 1 });
    expect(titles('g')).toEqual(['item 2']);
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
