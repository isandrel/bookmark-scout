import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  getUndoableBookmarkChange,
  redoBookmarkChange,
  undoBookmarkChange,
} from '@/services/bookmark-history';
import {
  applyBookmarkChanges,
  BOOKMARK_DELETION_UNDO_WINDOW_MS,
  type BookmarkChange,
  removeEmptyFolders,
} from '@/services/bookmarks';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';

let bookmarks: FakeBookmarks;

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  bookmarks = installFakeBookmarks([
    { id: 'f', title: 'Folder' },
    { id: 'a', parentId: 'f', title: 'A', url: 'https://e2e.invalid/a' },
    { id: 'b', parentId: 'f', title: 'B', url: 'https://e2e.invalid/b' },
    { id: 'c', parentId: 'f', title: 'C', url: 'https://e2e.invalid/c' },
  ]);
});

const update = (id: string, expect: object, set: object): BookmarkChange => ({
  kind: 'update',
  id,
  title: id.toUpperCase(),
  expect,
  set,
});
const remove = (id: string, expectUrl = `https://e2e.invalid/${id}`): BookmarkChange => ({
  kind: 'remove',
  id,
  title: id.toUpperCase(),
  expect: { url: expectUrl },
});

describe('applyBookmarkChanges', () => {
  it('writes each change only while the bookmark still matches the review', async () => {
    const result = await applyBookmarkChanges([
      update('a', { url: 'https://e2e.invalid/a' }, { url: 'https://e2e.invalid/a2' }),
      update('b', { url: 'https://e2e.invalid/old' }, { url: 'https://e2e.invalid/b2' }),
      update('gone', { title: 'Gone' }, { title: 'New' }),
      remove('c'),
    ]);

    expect(result).toMatchObject({ applied: 2, skipped: 2, failed: 0 });
    expect(result.issues).toEqual([
      { id: 'b', title: 'B', reason: 'changed' },
      { id: 'gone', title: 'GONE', reason: 'deleted' },
    ]);
    expect(bookmarks.get('a')?.url).toBe('https://e2e.invalid/a2');
    expect(bookmarks.get('b')?.url).toBe('https://e2e.invalid/b');
    expect(bookmarks.get('c')).toBeUndefined();
    expect(result.recorded?.entry.operations.map((op) => op.kind)).toEqual(['update', 'remove']);
  });

  it('skips a change whose live check fails', async () => {
    const result = await applyBookmarkChanges([
      { ...remove('a'), check: (live) => live.title === 'Renamed' },
    ]);
    expect(result).toMatchObject({ applied: 0, skipped: 1, failed: 0 });
    expect(bookmarks.get('a')).toBeDefined();
  });

  it('counts browser failures and keeps going', async () => {
    bookmarks.fail.update.add('a');
    bookmarks.fail.remove.add('b');
    const result = await applyBookmarkChanges([
      update('a', {}, { title: 'X' }),
      remove('b'),
      remove('c'),
    ]);
    expect(result).toMatchObject({ applied: 1, skipped: 0, failed: 2 });
    expect(result.issues.map((issue) => [issue.id, issue.reason])).toEqual([
      ['a', 'failed'],
      ['b', 'failed'],
    ]);
  });

  it('undoes newest first, putting removals back into their places', async () => {
    const result = await applyBookmarkChanges([
      remove('a'),
      update('b', {}, { title: 'Renamed B' }),
      remove('c'),
    ]);
    expect(bookmarks.childIds('f')).toEqual(['b']);

    const undone = await result.undo();

    expect(undone).toEqual({ restored: 3, failed: 0 });
    expect(bookmarks.get('b')?.title).toBe('B');
    const restoredUrls = bookmarks.childIds('f').map((id) => bookmarks.get(id)?.url);
    expect(restoredUrls).toEqual([
      'https://e2e.invalid/a',
      'https://e2e.invalid/b',
      'https://e2e.invalid/c',
    ]);
    // Newest change first: the last removal, the update, then the first removal.
    expect(bookmarks.writes.slice(-3)).toEqual(['create 1000', 'update b', 'create 1001']);
    expect(bookmarks.get('1000')?.url).toBe('https://e2e.invalid/c');
  });

  it('records one undo history entry named after the tool, shared with Ctrl+Z', async () => {
    const result = await applyBookmarkChanges([remove('a'), remove('b')], {
      tool: 'tools_findDuplicates',
    });
    const entry = result.recorded?.entry;
    expect(entry?.label).toMatchObject({
      action: 'delete',
      count: 2,
      tool: 'tools_findDuplicates',
    });

    // Ctrl+Z undoes the tool's change, so the toast's Undo has nothing left to do.
    await expect(undoBookmarkChange()).resolves.toMatchObject({ applied: 2, skipped: 0 });
    expect(bookmarks.childIds('f')).toHaveLength(3);
    await expect(result.undo()).resolves.toEqual({ restored: 0, failed: 0, alreadyUndone: true });
    expect(bookmarks.childIds('f')).toHaveLength(3);

    // And Ctrl+Y redoes it.
    await expect(redoBookmarkChange()).resolves.toMatchObject({ applied: 2 });
    expect(bookmarks.childIds('f').map((id) => bookmarks.get(id)?.title)).toEqual(['C']);
  });

  it("takes the entry out of the history when the toast's Undo reverts it", async () => {
    const result = await applyBookmarkChanges([update('a', {}, { title: 'Cleaned' })], {
      tool: 'tools_cleanUrls',
    });
    expect(result.recorded?.entry.label).toEqual({
      action: 'edit',
      count: 1,
      title: 'A',
      tool: 'tools_cleanUrls',
    });

    await expect(result.undo()).resolves.toEqual({ restored: 1, failed: 0 });
    expect(bookmarks.get('a')?.title).toBe('A');
    const entryId = result.recorded?.entry.id ?? '';
    await expect(getUndoableBookmarkChange(entryId)).resolves.toBeUndefined();
    await expect(undoBookmarkChange()).resolves.toBeNull();
    await expect(redoBookmarkChange()).resolves.toMatchObject({ applied: 1 });
    expect(bookmarks.get('a')?.title).toBe('Cleaned');
  });

  it('undoes moves into created folders and removes the folders again', async () => {
    const result = await applyBookmarkChanges([
      { kind: 'move', id: 'a', title: 'A', to: { parentId: 'f', createPath: ['New'] } },
      { kind: 'move', id: 'b', title: 'B', to: { parentId: 'f', createPath: ['New'] } },
    ]);
    expect(result).toMatchObject({ applied: 2, foldersCreated: 1 });
    expect(result.recorded?.entry.label).toMatchObject({ action: 'move', count: 2 });

    await expect(result.undo()).resolves.toEqual({ restored: 2, failed: 0 });
    expect(bookmarks.childIds('f')).toEqual(['a', 'b', 'c']);
  });

  it('leaves an update edited again since alone and runs undo only once', async () => {
    const result = await applyBookmarkChanges([update('a', {}, { title: 'Tool title' })]);
    await fakeBrowser.bookmarks.update('a', { title: 'User title' });

    const first = await result.undo();
    const second = await result.undo();

    expect(first).toEqual({ restored: 0, failed: 1 });
    expect(second).toBe(first);
    expect(bookmarks.get('a')?.title).toBe('User title');
  });

  it('removes without recording when the change is not undoable', async () => {
    const result = await applyBookmarkChanges([{ ...remove('a'), undoable: false }]);
    expect(result).toMatchObject({ applied: 1, recorded: null });
    await expect(undoBookmarkChange()).resolves.toBeNull();
    await expect(result.undo()).resolves.toEqual({ restored: 0, failed: 0 });
    expect(bookmarks.get('a')).toBeUndefined();
  });

  it('reports when its undo stops being offered', async () => {
    const now = 1_000;
    const result = await applyBookmarkChanges([remove('a')], { now });
    expect(result.expiresAt).toBe(now + BOOKMARK_DELETION_UNDO_WINDOW_MS);
  });
});

describe('removeEmptyFolders', () => {
  it('removes created folders innermost first and keeps one something was put in', async () => {
    bookmarks = installFakeBookmarks([
      { id: 'f', title: 'Folder' },
      { id: 'new', parentId: 'f', title: 'New' },
      { id: 'inner', parentId: 'new', title: 'Inner' },
      { id: 'kept', parentId: 'f', title: 'Kept' },
      { id: 'mine', parentId: 'kept', title: 'Mine', url: 'https://e2e.invalid/mine' },
    ]);

    await removeEmptyFolders(['new', 'inner', 'kept', 'missing']);

    expect(bookmarks.get('new')).toBeUndefined();
    expect(bookmarks.get('inner')).toBeUndefined();
    expect(bookmarks.get('kept')?.title).toBe('Kept');
    expect(bookmarks.get('mine')?.title).toBe('Mine');
  });
});
