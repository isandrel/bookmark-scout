import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import {
  type BookmarkHistory,
  type BookmarkHistoryEntry,
  bookmarkHistoryValue,
  describeBookmarkChangeUndo,
  describeBookmarkHistoryLabel,
  getUndoableBookmarkChange,
  recordBookmarkWrites,
  redoBookmarkChange,
  remapBookmarkHistoryIds,
  trimBookmarkHistory,
  undoBookmarkChange,
  undoRecordedBookmarkChange,
} from '@/services/bookmark-history';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';
import { readStoredData, STORAGE_ITEMS } from './storage-helpers';

let bookmarks: FakeBookmarks;

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  bookmarks = installFakeBookmarks([
    { id: 'f', title: 'Folder' },
    { id: 'g', title: 'Other' },
    { id: 'a', parentId: 'f', title: 'A', url: 'https://e2e.invalid/a' },
    { id: 'b', parentId: 'f', title: 'B', url: 'https://e2e.invalid/b' },
    { id: 'c', parentId: 'f', title: 'C', url: 'https://e2e.invalid/c' },
    { id: 's', parentId: 'f', title: 'Sub' },
    { id: 's1', parentId: 's', title: 'S1', url: 'https://e2e.invalid/s1' },
  ]);
});

const titles = (id: string) => bookmarks.childIds(id).map((child) => bookmarks.get(child)?.title);

describe('bookmark history', () => {
  it('records one entry per call and undoes and redoes all of it', async () => {
    const { recorded } = await recordBookmarkWrites({ action: 'edit', title: 'A' }, async (w) => {
      await w.update('a', { title: 'A2' });
      await w.move('b', { parentId: 'g' });
    });
    expect(recorded?.stored).toBe(true);
    expect(titles('f')).toEqual(['A2', 'C', 'Sub']);
    expect(titles('g')).toEqual(['B']);

    await expect(undoBookmarkChange()).resolves.toEqual({
      label: { action: 'edit', title: 'A', count: 2 },
      applied: 2,
      skipped: 0,
    });
    expect(titles('f')).toEqual(['A', 'B', 'C', 'Sub']);
    expect(titles('g')).toEqual([]);

    await expect(redoBookmarkChange()).resolves.toMatchObject({ applied: 2, skipped: 0 });
    expect(titles('f')).toEqual(['A2', 'C', 'Sub']);
    expect(titles('g')).toEqual(['B']);
    await expect(redoBookmarkChange()).resolves.toBeNull();
  });

  it('restores a reorder within a folder to the exact positions', async () => {
    await recordBookmarkWrites({ action: 'sort', title: 'Folder' }, async (w) => {
      await w.move('c', { parentId: 'f', index: 0 });
      await w.move('a', { parentId: 'f', index: 4 });
    });
    expect(titles('f')).toEqual(['C', 'B', 'Sub', 'A']);
    await undoBookmarkChange();
    expect(titles('f')).toEqual(['A', 'B', 'C', 'Sub']);
    await redoBookmarkChange();
    expect(titles('f')).toEqual(['C', 'B', 'Sub', 'A']);
  });

  it('recreates a deleted folder and points older entries at the new ids', async () => {
    await recordBookmarkWrites({ action: 'move', title: 'S1' }, (w) =>
      w.move('s1', { parentId: 's', index: 0 }),
    );
    await recordBookmarkWrites({ action: 'edit', title: 'S1' }, (w) =>
      w.update('s1', { title: 'S1 renamed' }),
    );
    await recordBookmarkWrites({ action: 'delete', title: 'Sub' }, (w) => w.remove('s'));
    expect(bookmarks.get('s')).toBeUndefined();

    await undoBookmarkChange();
    const [subId] = bookmarks.childIds('f').filter((id) => bookmarks.get(id)?.title === 'Sub');
    expect(subId).not.toBe('s');
    const [childId] = bookmarks.childIds(subId);
    expect(bookmarks.get(childId)?.title).toBe('S1 renamed');

    // The edit made before the deletion now names the recreated bookmark.
    await expect(undoBookmarkChange()).resolves.toMatchObject({ applied: 1, skipped: 0 });
    expect(bookmarks.get(childId)?.title).toBe('S1');
    const history = (await readStoredData(STORAGE_ITEMS.bookmarkHistory)) as BookmarkHistory;
    expect(JSON.stringify(history)).not.toMatch(/"s1"|"s"/);

    // Redo deletes the recreated folder again, and undo brings it back once more.
    await redoBookmarkChange();
    await redoBookmarkChange();
    expect(titles('f')).toEqual(['A', 'B', 'C']);
    await undoBookmarkChange();
    expect(titles('f')).toEqual(['A', 'B', 'C', 'Sub']);
  });

  it('skips what changed since, and never overwrites a newer edit', async () => {
    await recordBookmarkWrites({ action: 'edit', title: 'A' }, async (w) => {
      await w.update('a', { title: 'A2' });
      await w.update('b', { title: 'B2' });
    });
    await fakeBrowser.bookmarks.update('a', { title: 'Edited elsewhere' });
    await fakeBrowser.bookmarks.removeTree('b');

    await expect(undoBookmarkChange()).resolves.toMatchObject({ applied: 0, skipped: 2 });
    expect(bookmarks.get('a')?.title).toBe('Edited elsewhere');
  });

  it('removes an added folder on undo only while nothing was put in it', async () => {
    const { result: folder } = await recordBookmarkWrites({ action: 'add', title: 'New' }, (w) =>
      w.create({ parentId: 'f', title: 'New' }),
    );
    await fakeBrowser.bookmarks.create({ parentId: folder.id, title: 'Inside', url: 'https://x/' });
    await expect(undoBookmarkChange()).resolves.toMatchObject({ applied: 0, skipped: 1 });
    expect(bookmarks.get(folder.id)).toBeDefined();
  });

  it('a new change clears what could be redone', async () => {
    await recordBookmarkWrites({ action: 'edit', title: 'A' }, (w) =>
      w.update('a', { title: 'X' }),
    );
    await undoBookmarkChange();
    await recordBookmarkWrites({ action: 'edit', title: 'B' }, (w) =>
      w.update('b', { title: 'Y' }),
    );
    await expect(redoBookmarkChange()).resolves.toBeNull();
    expect((await bookmarkHistoryValue.get()).undo).toHaveLength(1);
  });

  it('records what ran before a write failed, then passes the error on', async () => {
    bookmarks.fail.update.add('b');
    await expect(
      recordBookmarkWrites({ action: 'edit', count: 2 }, async (w) => {
        await w.update('a', { title: 'A2' });
        await w.update('b', { title: 'B2' });
      }),
    ).rejects.toThrow('update failed');
    await undoBookmarkChange();
    expect(bookmarks.get('a')?.title).toBe('A');
  });

  it("a toast's Undo undoes its own change once, even when it was too large to keep", async () => {
    const { recorded } = await recordBookmarkWrites({ action: 'delete', title: 'A' }, (w) =>
      w.remove('a'),
    );
    if (!recorded) throw new Error('not recorded');
    await undoBookmarkChange();
    // Ctrl+Z already undid it, so the toast's Undo does nothing more.
    await expect(undoRecordedBookmarkChange(recorded)).resolves.toBeNull();
    expect(titles('f').filter((title) => title === 'A')).toHaveLength(1);

    const unstored = { ...recorded, stored: false };
    await fakeBrowser.bookmarks.removeTree(bookmarks.childIds('f')[0]);
    await expect(undoRecordedBookmarkChange(unstored)).resolves.toMatchObject({ applied: 1 });
    expect(titles('f')).toEqual(['A', 'B', 'C', 'Sub']);
  });
});

describe('bookmark history limits', () => {
  const entry = (id: string, size = 0): BookmarkHistoryEntry => ({
    id,
    label: { action: 'edit', title: 'x'.repeat(size) },
    operations: [{ kind: 'update', id: 'a', before: { title: 'a' }, after: { title: 'b' } }],
  });

  it('keeps the newest entries within the count and size limits', () => {
    const history = { undo: ['1', '2', '3'].map((id) => entry(id)), redo: [entry('r')] };
    expect(trimBookmarkHistory(history, { maxEntries: 2, maxBytes: 10_000 }).undo).toEqual([
      entry('2'),
      entry('3'),
    ]);
    const large = { undo: [entry('1', 500), entry('2', 500)], redo: [] };
    expect(trimBookmarkHistory(large, { maxEntries: 10, maxBytes: 800 }).undo).toEqual([
      entry('2', 500),
    ]);
    expect(trimBookmarkHistory(large, { maxEntries: 10, maxBytes: 100 }).undo).toEqual([]);
  });

  it('rewrites ids in both stacks', () => {
    const history: BookmarkHistory = {
      undo: [
        {
          id: 'e',
          label: { action: 'move' },
          operations: [
            {
              kind: 'move',
              id: 'a',
              from: { parentId: 'f', index: 0 },
              to: { parentId: 'g', index: 1 },
            },
          ],
        },
      ],
      redo: [],
    };
    const remapped = remapBookmarkHistoryIds(
      history,
      new Map([
        ['a', 'a2'],
        ['g', 'g2'],
      ]),
    );
    expect(remapped.undo[0].operations[0]).toEqual({
      kind: 'move',
      id: 'a2',
      from: { parentId: 'f', index: 0 },
      to: { parentId: 'g2', index: 1 },
    });
  });
});

describe('bookmark history labels', () => {
  beforeAll(() => setLanguage('en'));
  afterAll(() => setLanguage('auto'));

  it('names one item by title and several by count', () => {
    expect(describeBookmarkHistoryLabel({ action: 'delete', title: 'News' })).toBe('Delete "News"');
    expect(describeBookmarkHistoryLabel({ action: 'move', count: 3 })).toBe('Move 3 items');
    expect(describeBookmarkHistoryLabel({ action: 'sort', title: 'Work' })).toBe('Sort "Work"');
  });

  it('lists what undoing an entry restores, item by item, in the order undo runs', async () => {
    const { recorded } = await recordBookmarkWrites({ action: 'change' }, async (w) => {
      await w.update('a', { title: 'A2' });
      await w.update('c', { url: 'https://e2e.invalid/c2' });
      await w.move('b', { parentId: 'g' });
      await w.remove('s');
      await w.create({ parentId: 'g', title: 'New', url: 'https://e2e.invalid/new' });
    });
    const entry = recorded?.entry;
    if (!entry) throw new Error('nothing recorded');
    expect(await getUndoableBookmarkChange(entry.id)).toEqual(entry);
    expect(await describeBookmarkChangeUndo(entry)).toEqual([
      'Remove “New”',
      'Put “Sub” back in Folder',
      'Move “B” back to Folder',
      'Change the address of “C” back to https://e2e.invalid/c',
      'Rename “A2” back to “A”',
    ]);
    await undoBookmarkChange(entry.id);
    expect(await getUndoableBookmarkChange(entry.id)).toBeUndefined();
  });
});
