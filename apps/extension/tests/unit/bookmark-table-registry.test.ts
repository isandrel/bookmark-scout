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
import { setLanguage } from '@/hooks/use-i18n';
import {
  BOOKMARK_TABLE_COLUMN_IDS,
  DEFAULT_BOOKMARK_TABLE_VIEW,
} from '@/lib/bookmark-table-view-storage';
import { type Bookmark, ItemTypeEnum } from '@/lib/manager-bookmark';
import { createItemHost } from './action-menu-helpers';
import enMessages from '../../public/_locales/en/messages.json';

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
    expect(DEFAULT_BOOKMARK_TABLE_VIEW.columnVisibility).toEqual({
      id: false,
      parentId: false,
      dateGroupModified: false,
      unmodifiable: false,
    });
  });

  it('names every column with an existing message', () => {
    const keys = BOOKMARK_COLUMNS.flatMap((column) => (column.labelKey ? [column.labelKey] : []));
    expect(keys.filter((key) => !(key in enMessages))).toEqual([]);
    expect(getBookmarkColumnLabel('folderPath')).toBe('Folder Path');
    expect(getBookmarkColumnLabel('unknown')).toBe('unknown');
  });

  it('renders a newly registered column in the table without changing the table', () => {
    const columns = createColumns(
      { actionHost: createItemHost() },
      [...BOOKMARK_COLUMNS, visitsColumn],
    );
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
