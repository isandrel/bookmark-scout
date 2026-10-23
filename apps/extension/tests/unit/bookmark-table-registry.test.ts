import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BOOKMARK_COLUMNS,
  type BookmarkColumn,
  createColumns,
  findBookmarkColumn,
  getBookmarkColumnLabel,
} from '@/components/ui/table/columns';
import { DataTable } from '@/components/ui/table/data-table';
import {
  getManagerColumnLayout,
  LEADING_MANAGER_COLUMN_IDS,
} from '@/components/ui/table/table-config';
import { setLanguage } from '@/hooks/use-i18n';
import {
  BOOKMARK_TABLE_COLUMN_IDS,
  DEFAULT_BOOKMARK_TABLE_VIEW,
  HIDEABLE_COLUMN_IDS,
  parseBookmarkTableColumns,
} from '@/lib/bookmark-table-view-storage';
import { type Bookmark, ItemTypeEnum } from '@/lib/manager-bookmark';
import { defaultSettings } from '@/lib/settings-schema';
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
      'cover',
      'type',
      'id',
      'parentId',
      'folderPath',
      'url',
      'title',
      'dateAdded',
      'dateGroupModified',
      'unmodifiable',
      'tags',
      'summary',
      'actions',
    ]);
  });

  it('shows Title, URL, and Date Added in a new view, in that order, and keeps the rest', () => {
    expect(defaultSettings.managerDefaultColumns).toEqual(['title', 'url', 'dateAdded']);
    expect(DEFAULT_BOOKMARK_TABLE_VIEW.columnVisibility).toEqual({
      cover: false,
      type: false,
      id: false,
      parentId: false,
      folderPath: false,
      dateGroupModified: false,
      unmodifiable: false,
      tags: false,
      summary: false,
    });
    // The checkbox stays first and the row menu last; the Cover thumbnail, hidden, waits right
    // after the checkbox (`leading_columns`), and the other hidden columns follow in registry order.
    expect(DEFAULT_BOOKMARK_TABLE_VIEW.columnOrder).toEqual([
      'select',
      'cover',
      'title',
      'url',
      'dateAdded',
      'type',
      'id',
      'parentId',
      'folderPath',
      'dateGroupModified',
      'unmodifiable',
      'tags',
      'summary',
      'actions',
    ]);
    // Every default column is one the View menu can show and hide.
    expect(
      defaultSettings.managerDefaultColumns.filter((id) => !HIDEABLE_COLUMN_IDS.includes(id)),
    ).toEqual([]);
  });

  it('keeps a saved view as the user left it', () => {
    const saved = parseBookmarkTableColumns({
      columnVisibility: { type: true, folderPath: true },
      columnOrder: ['select', 'type', 'folderPath', 'url', 'title', 'dateAdded', 'actions'],
    });
    expect(saved.columnVisibility).toMatchObject({ type: true, folderPath: true, id: false });
    // The Cover column, new to this view, joins hidden right after the checkbox.
    expect(saved.columnVisibility.cover).toBe(false);
    expect(saved.columnOrder.slice(0, 7)).toEqual([
      'select',
      'cover',
      'type',
      'folderPath',
      'url',
      'title',
      'dateAdded',
    ]);
  });

  it('offers the Cover column in the View menu, hidden at first, unsorted, and only in the list', () => {
    expect(LEADING_MANAGER_COLUMN_IDS).toEqual(['cover']);
    expect(HIDEABLE_COLUMN_IDS).toContain('cover');
    expect(defaultSettings.managerDefaultColumns).not.toContain('cover');
    const cover = findBookmarkColumn('cover');
    expect(cover).toMatchObject({ labelKey: 'table_columnCover', enableSorting: false });
    expect(cover?.size).toEqual(getManagerColumnLayout('cover').size);
    expect(getBookmarkColumnLabel('cover')).toBe('Cover');
    // The header is an icon, with the column's name for screen readers and as its tooltip.
    const [coverDef] = createColumns({ actionHost: createItemHost() }, [cover as BookmarkColumn]);
    const header = renderToStaticMarkup(
      createElement(coverDef.header as () => ReturnType<typeof createElement>),
    );
    expect(header).toContain('title="Cover"');
    expect(header).toContain('<span class="sr-only">Cover</span>');
  });

  it('draws no cover in the list before one is read, and none for folders', () => {
    // Server rendering runs no effects, so no cover is read: rows show nothing until one loads.
    const markup = renderToStaticMarkup(
      createElement(DataTable<Bookmark>, {
        columns: createColumns({ actionHost: createItemHost() }),
        data: [link, folder],
        browserOrderData: [link, folder],
        allData: [link, folder],
        getRowId: (row: Bookmark) => row.id,
        facetOptions: { parentId: [], domain: [] },
        searchQuery: '',
        onSearchQueryChange: () => undefined,
      }),
    );
    expect(markup).not.toContain('bookmark-cover-thumbnail');
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
