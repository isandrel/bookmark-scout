import { describe, expect, it } from 'vitest';
import {
  BOOKMARK_TABLE_COLUMN_IDS,
  DEFAULT_BOOKMARK_TABLE_VIEW,
  parseBookmarkTableView,
} from '@/lib/bookmark-table-view-storage';

describe('bookmark table view storage', () => {
  it('migrates an unversioned view and appends newly introduced columns', () => {
    const view = parseBookmarkTableView({
      columnVisibility: { url: false },
      columnOrder: ['title', 'type'],
      pageSize: 20,
      sorting: [{ id: 'title', desc: true }],
    });

    expect(view).toMatchObject({
      version: 1,
      pageSize: 20,
      sorting: [{ id: 'title', desc: true }],
      columnVisibility: { ...DEFAULT_BOOKMARK_TABLE_VIEW.columnVisibility, url: false },
    });
    expect(view.columnOrder.slice(0, 2)).toEqual(['title', 'type']);
    expect(new Set(view.columnOrder)).toEqual(new Set(BOOKMARK_TABLE_COLUMN_IDS));
  });

  it('filters unknown and duplicate columns from a valid saved view', () => {
    const view = parseBookmarkTableView({
      version: 1,
      columnVisibility: { url: false, obsolete: false },
      columnOrder: ['title', 'obsolete', 'title', 'url'],
      pageSize: 50,
      sorting: [
        { id: 'title', desc: false },
        { id: 'obsolete', desc: true },
        { id: 'title', desc: true },
      ],
    });

    expect(view.columnOrder.slice(0, 2)).toEqual(['title', 'url']);
    expect(view.columnOrder).not.toContain('obsolete');
    expect(view.columnVisibility).not.toHaveProperty('obsolete');
    expect(view.sorting).toEqual([{ id: 'title', desc: false }]);
  });

  it('falls back to defaults for an unsupported version or invalid page size', () => {
    expect(parseBookmarkTableView({ version: 2 })).toEqual(DEFAULT_BOOKMARK_TABLE_VIEW);
    expect(parseBookmarkTableView({ pageSize: 25 })).toEqual(DEFAULT_BOOKMARK_TABLE_VIEW);
  });
});
