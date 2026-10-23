import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  BOOKMARK_TABLE_COLUMN_IDS,
  DEFAULT_BOOKMARK_TABLE_VIEW,
  getBookmarkTableView,
  parseBookmarkTableColumns,
  parseBookmarkTableLayout,
  resetBookmarkTableView,
  updateBookmarkTableView,
} from '@/lib/bookmark-table-view-storage';
import { readStoredData, STORAGE_ITEMS } from './storage-helpers';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('bookmark table view parsing', () => {
  it('reads a partial view and appends newly introduced columns', () => {
    const columns = parseBookmarkTableColumns({
      columnVisibility: { url: false },
      columnOrder: ['title', 'type'],
      sorting: [{ id: 'title', desc: true }],
    });

    expect(columns).toMatchObject({
      sorting: [{ id: 'title', desc: true }],
      columnVisibility: { ...DEFAULT_BOOKMARK_TABLE_VIEW.columnVisibility, url: false },
    });
    expect(columns.columnOrder.slice(0, 2)).toEqual(['title', 'type']);
    expect(new Set(columns.columnOrder)).toEqual(new Set(BOOKMARK_TABLE_COLUMN_IDS));
  });

  it('puts columns a saved view does not know before the row menu, hidden', () => {
    // A view saved before the Tags and Summary columns existed, in the user's own order.
    const columns = parseBookmarkTableColumns({
      columnVisibility: { type: true },
      columnOrder: [
        'select',
        'url',
        'title',
        'type',
        'id',
        'parentId',
        'folderPath',
        'dateAdded',
        'dateGroupModified',
        'unmodifiable',
        'actions',
      ],
    });

    // The Cover thumbnail joins right after the checkbox, as in a new view.
    expect(columns.columnOrder).toEqual([
      'select',
      'cover',
      'url',
      'title',
      'type',
      'id',
      'parentId',
      'folderPath',
      'dateAdded',
      'dateGroupModified',
      'unmodifiable',
      'tags',
      'summary',
      'actions',
    ]);
    expect(columns.columnVisibility).toMatchObject({
      type: true,
      cover: false,
      tags: false,
      summary: false,
    });
  });

  it('keeps the Cover column where the user moved it, shown or hidden as they left it', () => {
    const columns = parseBookmarkTableColumns({
      columnVisibility: { cover: true },
      columnOrder: ['select', 'title', 'cover', 'url', 'actions'],
    });
    expect(columns.columnOrder.slice(0, 4)).toEqual(['select', 'title', 'cover', 'url']);
    expect(columns.columnVisibility.cover).toBe(true);
  });

  it('puts a leading column with the other new ones when the saved view lacks the checkbox', () => {
    const columns = parseBookmarkTableColumns({ columnOrder: ['title', 'url'] });
    expect(columns.columnOrder.slice(0, 2)).toEqual(['title', 'url']);
    expect(columns.columnOrder.indexOf('cover')).toBeGreaterThan(1);
    expect(new Set(columns.columnOrder)).toEqual(new Set(BOOKMARK_TABLE_COLUMN_IDS));
  });

  it('filters unknown and duplicate columns from a saved view', () => {
    const columns = parseBookmarkTableColumns({
      columnVisibility: { url: false, obsolete: false },
      columnOrder: ['title', 'obsolete', 'title', 'url'],
      sorting: [
        { id: 'title', desc: false },
        { id: 'obsolete', desc: true },
        { id: 'title', desc: true },
      ],
    });

    expect(columns.columnOrder.slice(0, 2)).toEqual(['title', 'url']);
    expect(columns.columnOrder).not.toContain('obsolete');
    expect(columns.columnVisibility).not.toHaveProperty('obsolete');
    expect(columns.sorting).toEqual([{ id: 'title', desc: false }]);
  });

  it('falls back to defaults for malformed data or an invalid page size', () => {
    const { pageSize, columnSizing, ...columns } = DEFAULT_BOOKMARK_TABLE_VIEW;
    expect(parseBookmarkTableColumns({ sorting: 'title' })).toEqual(columns);
    expect(parseBookmarkTableLayout({ pageSize: 25 })).toEqual({ pageSize, columnSizing });
    expect(parseBookmarkTableLayout(null)).toEqual({ pageSize, columnSizing });
  });
});

describe('bookmark table view storage', () => {
  it('syncs columns and sort, and keeps widths and page size on this device', async () => {
    await updateBookmarkTableView({
      sorting: [{ id: 'title', desc: true }],
      columnSizing: { url: 320 },
      pageSize: 50,
    });
    expect(await readStoredData(STORAGE_ITEMS.tableView)).toMatchObject({
      sorting: [{ id: 'title', desc: true }],
    });
    expect(await readStoredData(STORAGE_ITEMS.tableView)).not.toHaveProperty('pageSize');
    expect(await readStoredData(STORAGE_ITEMS.tableLayout)).toEqual({
      pageSize: 50,
      columnSizing: { url: 320 },
    });
    expect(await fakeBrowser.storage.sync.get()).not.toHaveProperty(STORAGE_ITEMS.tableLayout.name);
    expect(await getBookmarkTableView()).toMatchObject({
      sorting: [{ id: 'title', desc: true }],
      pageSize: 50,
      columnSizing: { url: 320 },
    });
  });

  it('stores only the parts that changed, keeping another tab’s change to another part', async () => {
    await updateBookmarkTableView({ sorting: [{ id: 'title', desc: false }] });
    // Another tab hides a column; this tab then changes the page size only.
    await updateBookmarkTableView({
      columnVisibility: { ...DEFAULT_BOOKMARK_TABLE_VIEW.columnVisibility, url: false },
    });
    await updateBookmarkTableView({ pageSize: 50 });
    expect(await getBookmarkTableView()).toMatchObject({
      sorting: [{ id: 'title', desc: false }],
      columnVisibility: { url: false },
      pageSize: 50,
    });
  });

  it('removes both items on reset and when a part is back at its default', async () => {
    await updateBookmarkTableView({ browserOrder: true, pageSize: 50 });
    await updateBookmarkTableView({ browserOrder: false });
    expect(await readStoredData(STORAGE_ITEMS.tableView)).toBeUndefined();
    await resetBookmarkTableView();
    expect(await readStoredData(STORAGE_ITEMS.tableLayout)).toBeUndefined();
    expect(await getBookmarkTableView()).toEqual(DEFAULT_BOOKMARK_TABLE_VIEW);
  });
});
