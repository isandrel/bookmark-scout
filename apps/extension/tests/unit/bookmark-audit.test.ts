import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  AUDIT_LIMITS,
  type AuditOperation,
  AuditStoreError,
  clearAuditHistory,
  closeAuditDb,
  listAuditOperations,
  pruneAuditOperations,
  putAuditOperation,
} from '@/lib/bookmark-audit-store';
import { isInterruptedAuditOperation } from '@/services/bookmark-audit';
import {
  recordBookmarkWrites,
  redoBookmarkChange,
  undoBookmarkChange,
} from '@/services/bookmark-history';
import { applyBookmarkChanges } from '@/services/bookmarks';
import { readConfigToml } from '../config-files';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';
import { auditRecords, resetAuditDatabase } from './audit-helpers';

let bookmarks: FakeBookmarks;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await resetAuditDatabase();
  bookmarks = installFakeBookmarks([
    { id: 'f', title: 'Folder' },
    { id: 'g', title: 'Other' },
    { id: 'a', parentId: 'f', title: 'A', url: 'https://e2e.invalid/a' },
    { id: 'b', parentId: 'f', title: 'B', url: 'https://e2e.invalid/b?x=%20y&x=2#frag' },
    { id: 's', parentId: 'f', title: 'Sub' },
    { id: 's1', parentId: 's', title: 'S1', url: 'https://e2e.invalid/s1' },
  ]);
});

/** Makes the audit database impossible to open, as when storage is broken or full. */
async function breakAuditStore() {
  await closeAuditDb();
  globalThis.indexedDB = {
    open: () => {
      throw new Error('storage unavailable');
    },
  } as unknown as IDBFactory;
}

function operation(overrides: Partial<AuditOperation>): AuditOperation {
  return {
    id: 'op',
    schemaVersion: 1,
    startedAt: Date.now(),
    label: { action: 'edit' },
    source: 'manager',
    actor: 'user',
    state: 'verified_success',
    counts: { planned: 1, applied: 1, skipped: 0, failed: 0 },
    originConfidence: 'verified_internal',
    ...overrides,
  };
}

describe('bookmark audit history', () => {
  it('records one verified record per change, with its rows and Ctrl+Z entry', async () => {
    const { recorded } = await recordBookmarkWrites(
      { action: 'change' },
      async (writer) => {
        await writer.update('a', { title: 'A2' });
        await writer.move('b', { parentId: 'g' });
        await writer.remove('s');
      },
      { source: 'manager' },
    );

    const [record, ...others] = await auditRecords();
    expect(others).toEqual([]);
    expect(record).toMatchObject({
      source: 'manager',
      actor: 'user',
      state: 'verified_success',
      counts: { planned: 3, applied: 3, skipped: 0, failed: 0 },
      verification: { status: 'passed', mismatchCount: 0 },
      undoHistoryId: recorded?.entry.id,
      originConfidence: 'verified_internal',
    });
    expect(recorded?.entry.operationId).toBe(record.id);
    expect(record.details).toMatchObject({
      omitted: 0,
      items: [
        {
          id: 'a',
          change: 'update',
          outcome: 'applied',
          before: { title: 'A' },
          after: { title: 'A2' },
        },
        {
          id: 'b',
          change: 'move',
          title: 'B',
          // The exact address, never normalized.
          url: 'https://e2e.invalid/b?x=%20y&x=2#frag',
          before: { parentId: 'f', index: 1 },
          after: { parentId: 'g', index: 0 },
        },
        { id: 's', change: 'remove', type: 'folder', descendants: 1, before: { parentId: 'f' } },
      ],
    });
  });

  it('records a partial batch with what was skipped, never as a success (H11)', async () => {
    await fakeBrowser.bookmarks.update('b', { title: 'Edited elsewhere' });
    await applyBookmarkChanges([
      { kind: 'update', id: 'a', title: 'A', expect: { title: 'A' }, set: { title: 'A2' } },
      { kind: 'update', id: 'b', title: 'B', expect: { title: 'B' }, set: { title: 'B2' } },
    ]);
    const [record] = await auditRecords();
    expect(record).toMatchObject({
      state: 'partially_applied',
      counts: { planned: 2, applied: 1, skipped: 1, failed: 0 },
    });
    expect(record.details).toMatchObject({
      items: [
        { id: 'a', outcome: 'applied' },
        { id: 'b', outcome: 'skipped', reason: 'changed' },
      ],
    });
    expect(bookmarks.get('b')?.title).toBe('Edited elsewhere');
  });

  it('records a batch that changed nothing as failed, not as done', async () => {
    await fakeBrowser.bookmarks.removeTree('a');
    await applyBookmarkChanges([
      { kind: 'update', id: 'a', title: 'A', expect: { title: 'A' }, set: { title: 'A2' } },
    ]);
    const [record] = await auditRecords();
    expect(record).toMatchObject({ state: 'failed', counts: { applied: 0, skipped: 1 } });
  });

  it('keeps no record of a change that planned and did nothing', async () => {
    await recordBookmarkWrites({ action: 'sort' }, async () => undefined);
    expect(await auditRecords()).toEqual([]);
  });

  it('refuses to remove bookmarks when their record cannot be stored (H10)', async () => {
    await breakAuditStore();
    await expect(
      applyBookmarkChanges([{ kind: 'remove', id: 's', title: 'Sub' }]),
    ).rejects.toBeInstanceOf(AuditStoreError);
    expect(bookmarks.get('s')?.title).toBe('Sub');
    expect(bookmarks.writes).toEqual([]);
  });

  it('still makes changes that remove nothing when the store is down', async () => {
    await breakAuditStore();
    await applyBookmarkChanges([
      { kind: 'update', id: 'a', title: 'A', expect: { title: 'A' }, set: { title: 'A2' } },
    ]);
    expect(bookmarks.get('a')?.title).toBe('A2');
  });

  it('marks a change that does not read back as intended as needing review', async () => {
    // The browser reports success but keeps the old title.
    vi.mocked(fakeBrowser.bookmarks.update).mockImplementationOnce(
      async (id) => (await fakeBrowser.bookmarks.get(id))[0],
    );
    await recordBookmarkWrites({ action: 'edit' }, (writer) => writer.update('a', { title: 'A2' }));
    const [record] = await auditRecords();
    expect(record).toMatchObject({
      state: 'needs_review',
      verification: { status: 'failed', mismatchCount: 1 },
    });
  });

  it('keeps records when the database is closed and opened again, as after a restart (H08)', async () => {
    await recordBookmarkWrites({ action: 'edit' }, (writer) => writer.update('a', { title: 'A2' }));
    await closeAuditDb();
    const { operations } = await listAuditOperations();
    expect(operations).toHaveLength(1);
  });

  it('counts a record still reserved after the time limit as interrupted (H09)', () => {
    const now = Date.now();
    const reserved = operation({
      state: 'prepared',
      startedAt: now - AUDIT_LIMITS.interruptedAfterMs - 1,
    });
    expect(isInterruptedAuditOperation(reserved, now)).toBe(true);
    expect(isInterruptedAuditOperation({ ...reserved, startedAt: now }, now)).toBe(false);
    expect(isInterruptedAuditOperation({ ...reserved, state: 'failed' }, now)).toBe(false);
  });

  it('prunes old finished records but never unresolved ones', async () => {
    const now = Date.now();
    const old = now - AUDIT_LIMITS.retentionMs - 1;
    await putAuditOperation(operation({ id: 'old-done', startedAt: old }));
    await putAuditOperation(operation({ id: 'old-review', startedAt: old, state: 'needs_review' }));
    await putAuditOperation(operation({ id: 'new-done', startedAt: now }));
    await expect(pruneAuditOperations(now)).resolves.toBe(1);
    const { operations } = await listAuditOperations();
    expect(operations.map((record) => record.id)).toEqual(['new-done', 'old-review']);
  });

  it('clearing keeps records that still need review (H19)', async () => {
    await putAuditOperation(operation({ id: 'done', startedAt: 1 }));
    await putAuditOperation(operation({ id: 'review', startedAt: 2, state: 'conflicted' }));
    await expect(clearAuditHistory()).resolves.toEqual({ removed: 1, kept: 1 });
    const { operations } = await listAuditOperations();
    expect(operations.map((record) => record.id)).toEqual(['review']);
  });

  it('reads its limits from config/bookmarks/audit.toml', () => {
    const config = readConfigToml('bookmarks/audit.toml');
    expect(AUDIT_LIMITS.maxOperations).toBe(config.max_operations);
    expect(AUDIT_LIMITS.maxItemsPerOperation).toBe(config.max_items_per_operation);
  });
});

describe('undo and redo in the audit history', () => {
  it('records an undo as its own record linked to the change, exactly once (H04, H05, L30)', async () => {
    await recordBookmarkWrites({ action: 'delete' }, (writer) => writer.remove('s'), {
      source: 'manager',
    });
    await expect(undoBookmarkChange()).resolves.toMatchObject({ applied: 1, skipped: 0 });
    // A second undo (the toast after Ctrl+Z) finds nothing and records nothing.
    await expect(undoBookmarkChange()).resolves.toBeNull();

    const [undo, original, ...others] = await auditRecords();
    expect(others).toEqual([]);
    expect(undo).toMatchObject({
      label: { action: 'delete' },
      replay: 'undo',
      relatedOperationId: original.id,
      state: 'verified_success',
      counts: { planned: 1, applied: 1, skipped: 0 },
    });
    expect(undo.details).toMatchObject({
      items: [{ change: 'create', title: 'Sub', descendants: 1 }],
    });
    // The original keeps its own outcome and gains the undone mark.
    expect(original).toMatchObject({
      state: 'verified_success',
      undo: { operationId: undo.id, complete: true },
    });

    await redoBookmarkChange();
    const [redo, , first] = await auditRecords();
    expect(redo).toMatchObject({ replay: 'redo', relatedOperationId: first.id });
    expect(first.undo).toBeUndefined();
  });

  it('records an undo that skipped newer work as partial, and the change as not fully undone', async () => {
    await recordBookmarkWrites({ action: 'edit' }, async (writer) => {
      await writer.update('a', { title: 'A2' });
      await writer.update('b', { title: 'B2' });
    });
    await fakeBrowser.bookmarks.update('b', { title: 'Edited elsewhere' });
    await undoBookmarkChange();
    const [undo, original] = await auditRecords();
    expect(undo).toMatchObject({
      state: 'partially_applied',
      counts: { planned: 2, applied: 1, skipped: 1 },
    });
    expect(original.undo).toMatchObject({ complete: false });
    expect(bookmarks.get('b')?.title).toBe('Edited elsewhere');
  });
});
