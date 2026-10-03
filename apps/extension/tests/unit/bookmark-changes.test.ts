import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  applyBookmarkChanges,
  BOOKMARK_DELETION_UNDO_WINDOW_MS,
  type BookmarkChange,
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
      { id: 'gone', title: 'GONE', reason: 'changed' },
    ]);
    expect(bookmarks.get('a')?.url).toBe('https://e2e.invalid/a2');
    expect(bookmarks.get('b')?.url).toBe('https://e2e.invalid/b');
    expect(bookmarks.get('c')).toBeUndefined();
    expect(result.deletions).toHaveLength(1);
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

  it('undoes updates, then removals newest first, back into their places', async () => {
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
    // The update is reverted before the removals are restored, newest removal first.
    expect(bookmarks.writes.slice(-3)).toEqual(['update b', 'create 1000', 'create 1001']);
    expect(bookmarks.get('1000')?.url).toBe('https://e2e.invalid/c');
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

  it('removes without a snapshot when the change is not undoable', async () => {
    const result = await applyBookmarkChanges([{ ...remove('a'), undoable: false }]);
    expect(result).toMatchObject({ applied: 1, deletions: [] });
    await expect(result.undo()).resolves.toEqual({ restored: 0, failed: 0 });
    expect(bookmarks.get('a')).toBeUndefined();
  });

  it('reports when the undo window for removals ends', async () => {
    const now = 1_000;
    const result = await applyBookmarkChanges([remove('a')], now);
    expect(result.expiresAt).toBe(now + BOOKMARK_DELETION_UNDO_WINDOW_MS);
    expect(result.deletions[0].expiresAt).toBe(result.expiresAt);
  });
});
