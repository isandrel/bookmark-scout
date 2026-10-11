import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { Archive } from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  BOOKMARK_ROW_ACTIONS,
  type BookmarkRowAction,
  type BookmarkRowActionContext,
  getAvailableRowActions,
  getRowActionLabel,
} from '@/components/ui/table/bookmark-row-actions';
import { BookmarkActionMenuItems } from '@/components/ui/table/bookmark-row-menu';
import {
  BOOKMARK_COLUMNS,
  type Bookmark,
  type BookmarkColumn,
  createColumns,
  getBookmarkColumnLabel,
  ItemTypeEnum,
} from '@/components/ui/table/columns';
import { DataTable } from '@/components/ui/table/data-table';
import { setLanguage } from '@/hooks/use-i18n';
import {
  BOOKMARK_TABLE_COLUMN_IDS,
  DEFAULT_BOOKMARK_TABLE_VIEW,
} from '@/lib/bookmark-table-view-storage';
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

function createActionContext(
  overrides: Partial<BookmarkRowActionContext> = {},
): BookmarkRowActionContext {
  return {
    showDetails: vi.fn(),
    edit: vi.fn(),
    requestDeletion: vi.fn(),
    reportError: vi.fn(),
    isOutsideOpenFolder: () => false,
    showInFolder: vi.fn(),
    copyFolderLink: vi.fn(),
    openableUrls: (items) => items.flatMap((item) => (item.url ? [item.url] : [])),
    open: vi.fn(),
    privateWindowsAllowed: true,
    cut: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    canPaste: () => false,
    ...overrides,
  };
}

/** Available action ids for `items`, by section. */
function availableIds(
  items: Bookmark[],
  actions: readonly BookmarkRowAction[],
  context = createActionContext(),
) {
  return Object.fromEntries(
    getAvailableRowActions(items, actions, context).map((section) => [
      section.group,
      section.actions.map((action) => action.id),
    ]),
  );
}

// A metadata column and an action defined outside the table, as a future feature would add them.
const visitCounts: Record<string, number> = { 'link-1': 7 };
const visitsColumn: BookmarkColumn = {
  id: 'visits',
  labelKey: 'test_columnVisits',
  accessor: (row) => visitCounts[row.id] ?? 0,
  header: 'sortable',
  cell: ({ getValue }) => `${String(getValue())} visits`,
  size: { size: 90, minSize: 60 },
};
const archiveAction: BookmarkRowAction = {
  id: 'archive',
  group: 'main',
  labelKey: 'test_actionArchive',
  icon: Archive,
  isAvailable: (items) => items.every((item) => item.type === ItemTypeEnum.Link),
  run: vi.fn(),
};

function renderRowMenu(bookmark: Bookmark, actions: readonly BookmarkRowAction[]) {
  // The real menu renders its content in a portal, which does not render on the server, so the
  // items are rendered directly in an open menu root.
  return renderToStaticMarkup(
    createElement(
      MenuPrimitive.Root,
      { open: true, modal: false },
      createElement(BookmarkActionMenuItems, {
        items: [bookmark],
        actions,
        context: createActionContext(),
      }),
    ),
  );
}

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

  it('names every column and action with an existing message', () => {
    const keys = [
      ...BOOKMARK_COLUMNS.flatMap((column) => (column.labelKey ? [column.labelKey] : [])),
      ...BOOKMARK_ROW_ACTIONS.map((action) => action.labelKey),
    ];
    expect(keys.filter((key) => !(key in enMessages))).toEqual([]);
    expect(getBookmarkColumnLabel('folderPath')).toBe('Folder Path');
    expect(getBookmarkColumnLabel('unknown')).toBe('unknown');
  });

  it('renders a newly registered column in the table without changing the table', () => {
    const columns = createColumns(
      { rowActions: BOOKMARK_ROW_ACTIONS, actionContext: createActionContext() },
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

  it('shows a newly registered row action where it is available and runs it', async () => {
    const actions = [...BOOKMARK_ROW_ACTIONS, archiveAction];

    const linkMenu = renderRowMenu(link, actions);
    expect(linkMenu).toContain('test_actionArchive');
    // Destructive actions stay last, after the new regular action.
    expect(linkMenu.indexOf('test_actionArchive')).toBeLessThan(linkMenu.indexOf('Delete'));
    expect(renderRowMenu(folder, actions)).not.toContain('test_actionArchive');

    expect(availableIds([link], actions)).toEqual({
      main: ['edit', 'viewDetails', 'archive'],
      clipboard: ['cut', 'copy', 'copyId'],
      open: ['openInNewTab', 'openInNewWindow', 'openInPrivateWindow'],
      destructive: ['delete'],
    });

    const context = createActionContext();
    await actions.find((action) => action.id === 'archive')?.run([link], context);
    expect(archiveAction.run).toHaveBeenCalledWith([link], context);
  });

  it('keeps edit, cut, and delete off rows the browser does not allow changing', () => {
    const rootFolder: Bookmark = { ...folder, id: '1', isRootFolder: true };
    const context = createActionContext({ isOutsideOpenFolder: () => true });
    expect(availableIds([rootFolder], BOOKMARK_ROW_ACTIONS, context)).toEqual({
      main: ['viewDetails'],
      clipboard: ['copyFolderLink', 'copyId'],
    });
  });

  it('acts on several items: no single-item actions, and Open all counts the bookmarks', () => {
    const second: Bookmark = { ...link, id: 'link-2', url: 'https://example.org/' };
    const context = createActionContext({ canPaste: () => true });
    expect(availableIds([link, second], BOOKMARK_ROW_ACTIONS, context)).toEqual({
      clipboard: ['cut', 'copy', 'paste'],
      open: ['openInNewTab', 'openInNewWindow', 'openInPrivateWindow'],
      destructive: ['delete'],
    });
    const open = BOOKMARK_ROW_ACTIONS.find((action) => action.id === 'openInNewTab');
    if (!open) throw new Error('missing');
    expect(getRowActionLabel(open, [link, second], context)).toBe('Open all (2)');
    expect(getRowActionLabel(open, [link], context)).toBe('Open in new tab');
    void open.run([link, second], context);
    expect(context.open).toHaveBeenCalledWith([link, second], 'background-tabs');
    // A private window is offered only where the browser allows it.
    expect(
      availableIds(
        [link],
        BOOKMARK_ROW_ACTIONS,
        createActionContext({ privateWindowsAllowed: false }),
      ).open,
    ).toEqual(['openInNewTab', 'openInNewWindow']);
  });

  it('names a folder edit Rename', () => {
    const edit = BOOKMARK_ROW_ACTIONS.find((action) => action.id === 'edit');
    if (!edit) throw new Error('missing');
    expect(getRowActionLabel(edit, [folder], createActionContext())).toBe('Rename');
    expect(getRowActionLabel(edit, [link], createActionContext())).toBe('Edit');
  });

  it('offers Show in folder only on search results from another folder', () => {
    expect(availableIds([link], BOOKMARK_ROW_ACTIONS).main).not.toContain('showInFolder');
    const showInFolder = vi.fn();
    const context = createActionContext({ isOutsideOpenFolder: () => true, showInFolder });
    expect(availableIds([link], BOOKMARK_ROW_ACTIONS, context).main).toEqual([
      'showInFolder',
      'edit',
      'viewDetails',
    ]);
    BOOKMARK_ROW_ACTIONS.find((action) => action.id === 'showInFolder')?.run([link], context);
    expect(showInFolder).toHaveBeenCalledWith(link);
  });
});
