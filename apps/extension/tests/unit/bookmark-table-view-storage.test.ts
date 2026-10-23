import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  BOOKMARK_TABLE_COLUMN_IDS,
  createBookmarkTableViewFollower,
  DEFAULT_BOOKMARK_TABLE_VIEW,
  getBookmarkTableView,
  getBookmarkTableViewDefaults,
  parseBookmarkTableColumns,
  parseBookmarkTableLayout,
  resetBookmarkColumnWidths,
  resetBookmarkTableView,
  updateBookmarkTableView,
} from '@/lib/bookmark-table-view-storage';
import { defaultSettings } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
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

  it('keeps a part changed back to its default, and removes both items on reset', async () => {
    await updateBookmarkTableView({ browserOrder: true, pageSize: 50 });
    await updateBookmarkTableView({ browserOrder: false });
    // Changed in the manager, so it no longer follows Default Sort.
    expect(await readStoredData(STORAGE_ITEMS.tableView)).toEqual({ browserOrder: false });
    await resetBookmarkTableView();
    expect(await readStoredData(STORAGE_ITEMS.tableView)).toBeUndefined();
    expect(await readStoredData(STORAGE_ITEMS.tableLayout)).toBeUndefined();
    expect(await getBookmarkTableView()).toEqual(DEFAULT_BOOKMARK_TABLE_VIEW);
  });

  it('forgets only the column widths on Reset column widths', async () => {
    await updateBookmarkTableView({ columnSizing: { url: 320 }, pageSize: 20 });
    await resetBookmarkColumnWidths();
    expect(await readStoredData(STORAGE_ITEMS.tableLayout)).toEqual({ pageSize: 20 });
  });
});

describe('bookmark table view defaults', () => {
  it('builds a new view from Default Columns, Default Rows per Page, and Default Sort', () => {
    const view = getBookmarkTableViewDefaults({
      managerDefaultColumns: ['cover', 'title', 'tags', 'unknown', 'title'],
      managerDefaultPageSize: 20,
      managerDefaultSort: 'dateAddedDesc',
    });
    // The Cover column goes where the defaults put it; unknown and repeated ids are left out.
    expect(view.columnOrder.slice(0, 4)).toEqual(['select', 'cover', 'title', 'tags']);
    expect(view.columnOrder.at(-1)).toBe('actions');
    expect(new Set(view.columnOrder)).toEqual(new Set(BOOKMARK_TABLE_COLUMN_IDS));
    const shown = view.columnOrder.filter((id) => view.columnVisibility[id] !== false);
    expect(shown).toEqual(['select', 'cover', 'title', 'tags', 'actions']);
    expect(view).toMatchObject({
      pageSize: 20,
      sorting: [{ id: 'dateAdded', desc: true }],
      browserOrder: false,
      columnSizing: {},
    });
    expect(
      getBookmarkTableViewDefaults({ ...defaultsOf(), managerDefaultSort: 'browser' }),
    ).toMatchObject({ sorting: [], browserOrder: true });
  });

  it('shows the Options defaults for every part the manager has not changed', async () => {
    await saveSettings({ managerDefaultColumns: ['title', 'tags'], managerDefaultPageSize: 20 });
    await updateBookmarkTableView({ sorting: [{ id: 'title', desc: true }] });
    const view = await getBookmarkTableView();
    expect(view.pageSize).toBe(20);
    // Shown by Default Columns: Tags; hidden: URL.
    expect(view.columnVisibility.url).toBe(false);
    expect(view.columnVisibility.tags).toBeUndefined();
    expect(view.sorting).toEqual([{ id: 'title', desc: true }]);
    // A saved page size wins over the default.
    await updateBookmarkTableView({ pageSize: 100 });
    expect((await getBookmarkTableView()).pageSize).toBe(100);
  });

  it('lets a table follow the defaults for parts nobody changed, also after a reset elsewhere', () => {
    const follower = createBookmarkTableViewFollower();
    const defaults = getBookmarkTableViewDefaults({ ...defaultsOf(), managerDefaultPageSize: 20 });
    expect(follower.follow({}, {}, defaults)).toEqual(defaults);
    // The table changed the sort: it stays the user's, even before storage has it.
    follower.own(['sorting']);
    expect(follower.follow({}, {}, defaults)).not.toHaveProperty('sorting');
    // Storage has it now; the page size is still the default's.
    const stored = { sorting: [{ id: 'title', desc: false }] };
    expect(Object.keys(follower.follow(stored, {}, defaults))).toEqual([
      'columnVisibility',
      'columnOrder',
      'browserOrder',
      'pageSize',
      'columnSizing',
    ]);
    // Reset in another tab or in Options: the sort follows the defaults again.
    expect(follower.follow({}, {}, defaults)).toHaveProperty('sorting', []);
    follower.own(['pageSize']);
    follower.reset();
    expect(follower.follow({}, {}, defaults)).toHaveProperty('pageSize', 20);
  });
});

function defaultsOf() {
  return {
    managerDefaultColumns: [...defaultSettings.managerDefaultColumns],
    managerDefaultPageSize: DEFAULT_BOOKMARK_TABLE_VIEW.pageSize,
    managerDefaultSort: 'none',
  };
}
