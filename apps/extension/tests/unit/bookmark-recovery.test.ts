import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AuditStoreError, getRecoveryCheckpoints } from '@/lib/bookmark-audit-store';
import { bookmarkMetadataValue } from '@/lib/bookmark-metadata-storage';
import { bookmarkHistoryValue, recordBookmarkWrites } from '@/services/bookmark-history';
import { restoreFromCheckpoints } from '@/services/bookmark-recovery';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';
import { auditRecords, resetAuditDatabase } from './audit-helpers';

let bookmarks: FakeBookmarks;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await resetAuditDatabase();
  bookmarks = installFakeBookmarks([
    { id: 'f', title: 'Folder' },
    { id: 'a', parentId: 'f', title: 'A', url: 'https://e2e.invalid/a' },
    { id: 's', parentId: 'f', title: 'Sub' },
    { id: 's1', parentId: 's', title: 'S1', url: 'https://e2e.invalid/s1' },
    { id: 'empty', parentId: 's', title: 'Empty' },
    { id: 'z', parentId: 'f', title: 'Z', url: 'https://e2e.invalid/z' },
  ]);
  await bookmarkMetadataValue.set({ s1: { tags: ['kept'], summary: 'Kept note' } });
});

const titles = (id: string) => bookmarks.childIds(id).map((child) => bookmarks.get(child)?.title);

/** Deletes Sub and A in one change, then forgets the session's undo (a browser restart). */
async function deleteThenRestart() {
  await recordBookmarkWrites({ action: 'delete', count: 2 }, async (writer) => {
    await writer.remove('a');
    await writer.remove('s');
  });
  await bookmarkHistoryValue.set({ undo: [], redo: [] });
  const [record] = await auditRecords();
  return record;
}

describe('recovery points', () => {
  it('keeps each removed item with its contents and tags before removing it (H03)', async () => {
    const record = await deleteThenRestart();
    const checkpoints = await getRecoveryCheckpoints(record.id);
    expect(checkpoints.map((checkpoint) => checkpoint.node.title)).toEqual(['A', 'Sub']);
    expect(checkpoints[1]).toMatchObject({
      at: { parentId: 'f' },
      node: {
        title: 'Sub',
        children: [
          {
            title: 'S1',
            url: 'https://e2e.invalid/s1',
            metadata: { tags: ['kept'], summary: 'Kept note' },
          },
          { title: 'Empty', children: [] },
        ],
      },
    });
  });

  it('removes nothing when the recovery point cannot be stored (R01, L35)', async () => {
    const add = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      if (this.name === 'checkpoints')
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return add.apply(this, args);
    });
    await expect(
      recordBookmarkWrites({ action: 'delete' }, (writer) => writer.remove('s')),
    ).rejects.toBeInstanceOf(AuditStoreError);
    expect(bookmarks.get('s')?.title).toBe('Sub');
    expect(titles('s')).toEqual(['S1', 'Empty']);
  });

  it('restores removed items after a restart, in their places, once (L29, L30, H05)', async () => {
    const record = await deleteThenRestart();
    expect(titles('f')).toEqual(['Z']);

    await expect(restoreFromCheckpoints(record)).resolves.toEqual({
      restored: 2,
      parentMissing: 0,
    });
    expect(titles('f')).toEqual(['A', 'Sub', 'Z']);
    const [sub] = bookmarks.childIds('f').filter((id) => bookmarks.get(id)?.title === 'Sub');
    expect(titles(sub)).toEqual(['S1', 'Empty']);
    const [s1] = bookmarks.childIds(sub);
    expect((await bookmarkMetadataValue.get())[s1]).toEqual({
      tags: ['kept'],
      summary: 'Kept note',
    });

    // A second click, or another tab, brings nothing back twice.
    await expect(restoreFromCheckpoints(record)).resolves.toMatchObject({ alreadyUndone: true });
    expect(titles('f')).toEqual(['A', 'Sub', 'Z']);
    const [restore, original] = await auditRecords();
    expect(restore).toMatchObject({ replay: 'undo', relatedOperationId: record.id });
    expect(original.undo).toMatchObject({ operationId: restore.id, complete: true });
  });

  it('leaves out items whose folder is gone and says so (L32)', async () => {
    const record = await deleteThenRestart();
    await fakeBrowser.bookmarks.removeTree('f');
    await expect(restoreFromCheckpoints(record)).resolves.toEqual({
      restored: 0,
      parentMissing: 2,
    });
    const [restore, original] = await auditRecords();
    expect(restore).toMatchObject({ state: 'failed', counts: { skipped: 2 } });
    // Nothing came back, so the change is not marked undone: Restore stays on offer.
    expect(original.undo).toBeUndefined();
  });
});
