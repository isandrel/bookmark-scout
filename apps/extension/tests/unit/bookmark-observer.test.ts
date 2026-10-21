import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { OBSERVER_LIMITS } from '@/services/bookmark-intents';
import { handleBookmarkEvent, reconcileBookmarks } from '@/services/bookmark-observer';
import { createBookmark, deleteBookmark, moveBookmark, updateBookmark } from '@/services/bookmarks';
import { installFakeBookmarks } from '../fake-bookmarks';
import { auditRecords, resetAuditDatabase } from './audit-helpers';
import { STORAGE_ITEMS, seedStored } from './storage-helpers';

const node = (id: string) => fakeBrowser.bookmarks.get(id).then(([found]) => found);

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await resetAuditDatabase();
  installFakeBookmarks([
    { id: 'f', title: 'Folder' },
    { id: 'g', title: 'Other' },
    { id: 'a', parentId: 'f', title: 'A', url: 'https://e2e.invalid/a' },
    { id: 's', parentId: 'f', title: 'Sub' },
    { id: 's1', parentId: 's', title: 'S1', url: 'https://e2e.invalid/s1' },
  ]);
  // The first start takes the baseline and records nothing.
  await reconcileBookmarks({ force: true, now: 1_000 });
});

describe('changes made outside Bookmark Scout', () => {
  it('takes a baseline on first start without claiming any change (X11)', async () => {
    expect(await auditRecords()).toEqual([]);
  });

  it('records a bookmark added elsewhere as from an unknown source (X01)', async () => {
    // Created through the browser directly, with no note of an own write.
    const created = await fakeBrowser.bookmarks.create({
      parentId: 'g',
      title: 'From the browser',
      url: 'https://e2e.invalid/native?b=2&a=1',
    });
    await handleBookmarkEvent({ type: 'created', id: created.id, node: created }, 2_000);

    const [record, ...others] = await auditRecords();
    expect(others).toEqual([]);
    expect(record).toMatchObject({
      source: 'source_unknown',
      actor: 'unknown',
      state: 'observed',
      originConfidence: 'unattributed_event',
      label: { action: 'add', title: 'From the browser' },
    });
    expect(record.details).toMatchObject({
      items: [
        {
          id: created.id,
          change: 'create',
          url: 'https://e2e.invalid/native?b=2&a=1',
          after: { parentId: 'g' },
        },
      ],
    });
  });

  it("does not record Bookmark Scout's own writes as from elsewhere (X07)", async () => {
    const created = await createBookmark({
      parentId: 'g',
      title: 'Own',
      url: 'https://e2e.invalid/own',
    });
    await handleBookmarkEvent({ type: 'created', id: created.id, node: created }, 2_000);
    await updateBookmark('a', { title: 'A2' });
    await handleBookmarkEvent(
      { type: 'changed', id: 'a', title: 'A2', url: 'https://e2e.invalid/a' },
      2_001,
    );
    await moveBookmark('a', { parentId: 'g' });
    await handleBookmarkEvent(
      { type: 'moved', id: 'a', parentId: 'g', index: 1, oldParentId: 'f', oldIndex: 0 },
      2_002,
    );
    const removed = await node('s');
    await deleteBookmark('s');
    await handleBookmarkEvent(
      { type: 'removed', id: 's', parentId: 'f', index: 0, node: removed },
      2_003,
    );
    expect(await auditRecords()).toEqual([]);
  });

  it('never matches an own note to a different change made elsewhere (X08)', async () => {
    // Bookmark Scout renames A, while something else renames it differently.
    await updateBookmark('a', { title: 'Own name' });
    await handleBookmarkEvent({ type: 'changed', id: 'a', title: 'Other name' }, 2_000);
    const [record] = await auditRecords();
    expect(record).toMatchObject({ source: 'source_unknown' });
  });

  it('records a rename with the title before, from the baseline (X02)', async () => {
    await fakeBrowser.bookmarks.update('a', { title: 'Renamed elsewhere' });
    await handleBookmarkEvent(
      { type: 'changed', id: 'a', title: 'Renamed elsewhere', url: 'https://e2e.invalid/a' },
      2_000,
    );
    const [record] = await auditRecords();
    expect(record.details).toMatchObject({
      items: [{ change: 'update', before: { title: 'A' }, after: { title: 'Renamed elsewhere' } }],
    });
  });

  it('says the earlier state is unknown when the baseline never had the item (X06)', async () => {
    await handleBookmarkEvent({ type: 'changed', id: 'unseen', title: 'New title' }, 2_000);
    const [record] = await auditRecords();
    expect(record.details).toMatchObject({
      items: [{ change: 'update', reason: 'before_unknown', after: { title: 'New title' } }],
    });
    const [item] =
      record.details === 'missing' || record.details === 'corrupt' ? [] : record.details.items;
    expect(item.before).toBeUndefined();
  });

  it('records a move between folders with both places (X03)', async () => {
    await handleBookmarkEvent(
      { type: 'moved', id: 'a', parentId: 'g', index: 0, oldParentId: 'f', oldIndex: 0 },
      2_000,
    );
    const [record] = await auditRecords();
    expect(record.details).toMatchObject({
      items: [
        {
          id: 'a',
          change: 'move',
          title: 'A',
          before: { parentId: 'f', index: 0 },
          after: { parentId: 'g', index: 0 },
        },
      ],
    });
  });

  it('records a folder deleted elsewhere once, with what was inside it (X05)', async () => {
    const removed = await node('s');
    await handleBookmarkEvent(
      { type: 'removed', id: 's', parentId: 'f', index: 1, node: removed },
      2_000,
    );
    const [record, ...others] = await auditRecords();
    expect(others).toEqual([]);
    expect(record.details).toMatchObject({
      items: [{ id: 's', change: 'remove', title: 'Sub', type: 'folder', descendants: 1 }],
    });
  });

  it('groups a burst into one record and starts a new one after a pause (X12)', async () => {
    await handleBookmarkEvent({ type: 'changed', id: 'a', title: 'One' }, 2_000);
    await handleBookmarkEvent({ type: 'changed', id: 's1', title: 'Two' }, 2_500);
    let records = await auditRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      label: { action: 'edit', count: 2 },
      counts: { applied: 2 },
    });

    await handleBookmarkEvent(
      { type: 'changed', id: 'a', title: 'Three' },
      2_500 + OBSERVER_LIMITS.burstWindowMs + 1,
    );
    records = await auditRecords();
    expect(records).toHaveLength(2);
  });

  it('records changes made while it was not watching as one net difference (X10)', async () => {
    // Changed with no events heard: a disabled extension, or a closed browser and sync.
    await fakeBrowser.bookmarks.update('a', { title: 'Changed while away' });
    await fakeBrowser.bookmarks.move('s1', { parentId: 'g' });
    await fakeBrowser.bookmarks.removeTree('s');
    await fakeBrowser.bookmarks.create({ parentId: 'g', title: 'Added while away' });
    await reconcileBookmarks({ force: true, now: 5_000 });

    const [record, ...others] = await auditRecords();
    expect(others).toEqual([]);
    expect(record).toMatchObject({
      source: 'reconciliation',
      actor: 'unknown',
      originConfidence: 'inferred_net_diff',
      observedSince: 1_000,
      startedAt: 5_000,
    });
    const items =
      record.details === 'missing' || record.details === 'corrupt' ? [] : record.details.items;
    expect(items.map((item) => `${item.change} ${item.title}`).sort()).toEqual([
      'create Added while away',
      'move S1',
      'remove Sub',
      'update Changed while away',
    ]);
    // Compared again right away, nothing more differs.
    await reconcileBookmarks({ force: true, now: 6_000 });
    expect(await auditRecords()).toHaveLength(1);
  });

  it('records nothing while paused, then the difference once it is back on (X16)', async () => {
    await seedStored(STORAGE_ITEMS.deviceSettings, { historyRecordOutsideChanges: false });
    await fakeBrowser.bookmarks.update('a', { title: 'While paused' });
    await handleBookmarkEvent({ type: 'changed', id: 'a', title: 'While paused' }, 2_000);
    await reconcileBookmarks({ force: true, now: 3_000 });
    expect(await auditRecords()).toEqual([]);

    await seedStored(STORAGE_ITEMS.deviceSettings, { historyRecordOutsideChanges: true });
    await reconcileBookmarks({ force: true, now: 4_000 });
    const [record] = await auditRecords();
    expect(record).toMatchObject({ source: 'reconciliation', observedSince: 1_000 });
  });
});
