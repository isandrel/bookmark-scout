import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BOOKMARK_COLUMNS,
  type BookmarkColumn,
  createColumns,
  getBookmarkColumnLabel,
} from '@/components/ui/table/columns';
import { DataTable } from '@/components/ui/table/data-table';
import { DEFAULT_MANAGER_COLUMN_IDS } from '@/components/ui/table/table-config';
import { setLanguage } from '@/hooks/use-i18n';
import {
  BOOKMARK_TABLE_COLUMN_IDS,
  DEFAULT_BOOKMARK_TABLE_VIEW,
  HIDEABLE_COLUMN_IDS,
  parseBookmarkTableColumns,
} from '@/lib/bookmark-table-view-storage';
import { type Bookmark, ItemTypeEnum } from '@/lib/manager-bookmark';
import enMessages from '../../public/_locales/en/messages.json';
import { createItemHost } from './action-menu-helpers';

const link: Bookmark = {
  type: ItemTypeEnum.Link,
  id: 'link-1',
  parentId: 'folder-1',
  folderPath: 'Bookmarks Bar',
  index: 0,
  title: 'Example',
  url: 'https://example.com/',
};
const folder: Bookmark = {
  type: ItemTypeEnum.Folder,
  id: 'folder-2',
  parentId: 'folder-1',
  folderPath: 'Bookmarks Bar',
  index: 1,
  title: 'Reading',
};

// A metadata column defined outside the table, as a future feature would add it.
const visitCounts: Record<string, number> = { 'link-1': 7 };
const visitsColumn: BookmarkColumn = {
  id: 'visits',
  labelKey: 'test_columnVisits',
  accessor: (row) => visitCounts[row.id] ?? 0,
  header: 'sortable',
  cell: ({ getValue }) => `${String(getValue())} visits`,
  size: { size: 90, minSize: 60 },
};
describe('bookmark table column registry', () => {
  beforeAll(() => setLanguage('en'));
  afterAll(() => setLanguage('auto'));

  it('keeps the saved table view contract', () => {
    expect(BOOKMARK_TABLE_COLUMN_IDS).toEqual([
      'select',
      'type',
      'id',
      'parentId',
      'folderPath',
      'url',
      'title',
      'dateAdded',
      'dateGroupModified',
      'unmodifiable',
      'actions',
    ]);
  });

  it('shows Title, URL, and Date Added in a new view, in that order, and keeps the rest', () => {
    expect(DEFAULT_MANAGER_COLUMN_IDS).toEqual(['title', 'url', 'dateAdded']);
    expect(DEFAULT_BOOKMARK_TABLE_VIEW.columnVisibility).toEqual({
      type: false,
      id: false,
      parentId: false,
      folderPath: false,
      dateGroupModified: false,
      unmodifiable: false,
    });
    // The checkbox stays first and the row menu last; hidden columns follow in registry order.
    expect(DEFAULT_BOOKMARK_TABLE_VIEW.columnOrder).toEqual([
      'select',
      'title',
      'url',
      'dateAdded',
      'type',
      'id',
      'parentId',
      'folderPath',
      'dateGroupModified',
      'unmodifiable',
      'actions',
    ]);
    // Every default column is one the View menu can show and hide.
    expect(DEFAULT_MANAGER_COLUMN_IDS.filter((id) => !HIDEABLE_COLUMN_IDS.includes(id))).toEqual(
      [],
    );
  });

  it('keeps a saved view as the user left it', () => {
    const saved = parseBookmarkTableColumns({
      columnVisibility: { type: true, folderPath: true },
      columnOrder: ['select', 'type', 'folderPath', 'url', 'title', 'dateAdded', 'actions'],
    });
    expect(saved.columnVisibility).toMatchObject({ type: true, folderPath: true, id: false });
    expect(saved.columnOrder.slice(0, 6)).toEqual([
      'select',
      'type',
      'folderPath',
      'url',
      'title',
      'dateAdded',
    ]);
  });

  it('names every column with an existing message', () => {
    const keys = BOOKMARK_COLUMNS.flatMap((column) => (column.labelKey ? [column.labelKey] : []));
    expect(keys.filter((key) => !(key in enMessages))).toEqual([]);
    expect(getBookmarkColumnLabel('folderPath')).toBe('Folder Path');
    expect(getBookmarkColumnLabel('unknown')).toBe('unknown');
  });

  it('renders a newly registered column in the table without changing the table', () => {
    const columns = createColumns({ actionHost: createItemHost() }, [
      ...BOOKMARK_COLUMNS,
      visitsColumn,
    ]);
    const visitsDef = columns.find((column) => column.id === 'visits');
    expect(visitsDef).toMatchObject({ size: 90, minSize: 60, enableResizing: true });

    const markup = renderToStaticMarkup(
      createElement(DataTable<Bookmark>, {
        columns,
        data: [link, folder],
        browserOrderData: [link, folder],
        allData: [link, folder],
        getRowId: (row: Bookmark) => row.id,
        facetOptions: { parentId: [], domain: [] },
        searchQuery: '',
        onSearchQueryChange: () => undefined,
      }),
    );
    expect(markup).toContain('test_columnVisits');
    expect(markup).toContain('7 visits');
    expect(markup).toContain('0 visits');
    // Existing columns still render alongside it.
    expect(markup).toContain('Example');
    expect(markup).toContain('Reading');
  });
});
