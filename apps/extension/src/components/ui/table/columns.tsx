/**
 * Column registry for the bookmark manager table. Each entry is the single place a column is
 * described: its label, how it reads, renders, filters, and sorts a row, its width, whether it is
 * shown by default, and below which table width it gives way. The saved table view, column
 * sizing, narrow-width hiding, and the View menu all read this list, so adding a column is one
 * new entry here and needs no change to the table component.
 */

import type {
  CellContext,
  ColumnDef,
  FilterFn,
  HeaderContext,
  SortFn,
} from '@tanstack/react-table';
import { Folder, Link } from 'lucide-react';
import type { ComponentType, MouseEvent, ReactNode } from 'react';
import type { DateRange } from 'react-day-picker';

export enum ItemTypeEnum {
  Folder = 'folder',
  Link = 'link',
}

export const typeMap: Record<ItemTypeEnum, ItemType> = {
  [ItemTypeEnum.Folder]: { value: 'folder', label: 'Folder', icon: Folder },
  [ItemTypeEnum.Link]: { value: 'link', label: 'Link', icon: Link },
};

const typeLabelKeys: Record<ItemTypeEnum, string> = {
  [ItemTypeEnum.Folder]: 'table_typeFolder',
  [ItemTypeEnum.Link]: 'table_typeLink',
};

/** Type filter options with labels resolved in the active UI language. */
export function getLocalizedTypeOptions(): ItemType[] {
  return Object.values(ItemTypeEnum).map((type) => ({
    ...typeMap[type],
    label: t(typeLabelKeys[type]),
  }));
}

type ItemType = {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export type Bookmark = {
  type: ItemTypeEnum;
  id: string;
  parentId?: string;
  folderPath: string;
  index?: number;
  title: string;
  url?: string;
  dateAdded?: number;
  dateGroupModified?: number;
  unmodifiable?: 'managed';
  /** Direct child of the browser's bookmark root (e.g. Bookmarks Bar); cannot be edited or removed. */
  isRootFolder?: boolean;
};

/** Whether the browser allows renaming, moving, or deleting this item. */
export function isModifiableBookmark(bookmark: Bookmark): boolean {
  return !bookmark.isRootFolder && !bookmark.unmodifiable;
}

/** Whether the manager can open this item in a tab (bookmarklets cannot be opened from here). */
export function isOpenableBookmark(bookmark: Bookmark): boolean {
  return bookmark.type === ItemTypeEnum.Link && Boolean(bookmark.url) && !isScriptUrl(bookmark.url);
}

/** What column cells can use beyond the row: the row actions and what they may ask the page. */
export type BookmarkColumnContext = {
  rowActions: readonly BookmarkRowAction[];
  actionContext: BookmarkRowActionContext;
};

export type BookmarkCellContext = CellContext<BookmarkTableFeatures, Bookmark, unknown>;
type BookmarkHeaderContext = HeaderContext<BookmarkTableFeatures, Bookmark, unknown>;

/** A resizable column's default and minimum width, or the width of a column that never resizes. */
export type BookmarkColumnSize = { size: number; minSize: number } | { fixed: number };

export type BookmarkColumn = {
  id: string;
  /** Locale key of the column name (header, View menu, filters, resize handle). */
  labelKey?: string;
  /** The value sorted, filtered, and faceted on; columns without one only render. */
  accessor?: (row: Bookmark) => unknown;
  /**
   * `sortable` is a header with the sort menu, `label` plain text, or a custom renderer.
   * Columns without a header render none.
   */
  header?: 'sortable' | 'label' | ((context: BookmarkHeaderContext) => ReactNode);
  /** Cell content; defaults to the accessor value as text. */
  cell?: (context: BookmarkCellContext, columnContext: BookmarkColumnContext) => ReactNode;
  filterFn?: FilterFn<BookmarkTableFeatures, Bookmark>;
  sortFn?: SortFn<BookmarkTableFeatures, Bookmark>;
  /** Defaults to true for columns with an accessor. */
  enableSorting?: boolean;
  /** Whether the View menu can hide it (default true). */
  enableHiding?: boolean;
  size?: BookmarkColumnSize;
  /** Shown until the user hides it (default true). */
  defaultVisible?: boolean;
  /** Hidden while the table is narrower than this many pixels; the saved choice is kept. */
  hideBelowWidth?: number;
  /** Backs a filter only: never displayed, listed in the View menu, or saved in the table view. */
  internal?: boolean;
};

/** Hidden column that groups links by registrable domain for the URL domain chips. */
export const DOMAIN_COLUMN_ID = 'domain';

function formatTimestamp(value: unknown): string {
  return typeof value === 'number' ? formatDateTime(value) : '';
}

function textFilter(row: { getValue: (id: string) => unknown }, id: string, value: unknown) {
  const query = String(value ?? '').trim().toLowerCase();
  return !query || String(row.getValue(id) ?? '').toLowerCase().includes(query);
}

const facetFilter: FilterFn<BookmarkTableFeatures, Bookmark> = (row, id, value) =>
  value.includes(row.getValue(id));

// Checkboxes live inside clickable rows; keep toggling them from opening folders.
const stopRowClick = (event: MouseEvent) => event.stopPropagation();

export const BOOKMARK_COLUMNS: readonly BookmarkColumn[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={!table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label={t('table_selectAll')}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onClick={stopRowClick}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label={t('table_selectRow', row.original.title.trim() || t('bookmarks_untitled'))}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: { fixed: 40 },
  },
  {
    id: 'type',
    labelKey: 'table_columnType',
    accessor: (row) => row.type,
    header: 'sortable',
    cell: ({ row }) => {
      const type = getLocalizedTypeOptions().find((option) => option.value === row.original.type);
      if (!type) return null;
      return (
        <div className="flex min-w-0 items-center whitespace-nowrap">
          {type.icon && <type.icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="truncate">{type.label}</span>
        </div>
      );
    },
    filterFn: facetFilter,
    size: { size: 120, minSize: 70 },
  },
  {
    id: 'id',
    labelKey: 'table_columnId',
    accessor: (row) => row.id,
    header: 'sortable',
    size: { size: 100, minSize: 60 },
    defaultVisible: false,
  },
  {
    id: 'parentId',
    labelKey: 'table_columnParentId',
    accessor: (row) => row.parentId,
    header: 'sortable',
    // The parent is the last folder of the item's path, so no bookmark lookup is needed.
    cell: ({ row }) =>
      row.original.parentId ? (
        <div className="flex min-w-0 items-center" title={row.original.parentId}>
          <Folder className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="block min-w-0 truncate">{row.original.folderPath}</span>
        </div>
      ) : null,
    filterFn: facetFilter,
    size: { size: 180, minSize: 80 },
    defaultVisible: false,
  },
  {
    id: 'folderPath',
    labelKey: 'bookmarks_folderPath',
    accessor: (row) => row.folderPath,
    header: 'sortable',
    cell: ({ row }) => (
      <span className="block truncate" title={row.original.folderPath}>
        {row.original.folderPath}
      </span>
    ),
    size: { size: 180, minSize: 80 },
    // Dropped first when the table is narrow (for example with the Tools sidebar open), so Title
    // and Date Added stay in view instead of scrolling away.
    hideBelowWidth: 960,
  },
  {
    id: 'url',
    labelKey: 'table_columnUrl',
    accessor: (row) => row.url,
    header: 'sortable',
    cell: ({ row }) => {
      const rowUrl = row.original.url;
      if (!rowUrl) return null;
      return (
        <div className="flex min-w-0 items-center gap-2">
          <SiteIcon url={rowUrl} className="shrink-0" />
          <span className="block min-w-0 truncate" title={rowUrl}>
            {rowUrl}
          </span>
        </div>
      );
    },
    filterFn: textFilter,
    size: { size: 200, minSize: 80 },
    hideBelowWidth: 880,
  },
  {
    id: DOMAIN_COLUMN_ID,
    accessor: (row) => getUrlDomain(row.url),
    enableHiding: false,
    enableSorting: false,
    // Match by hostname so "bbc.co.uk" covers news.bbc.co.uk but not example.com/?q=bbc.co.uk.
    filterFn: (row, _id, value) => {
      const domains: string[] = Array.isArray(value) ? value : [];
      if (domains.length === 0) return true;
      const hostname = getUrlHostname(row.original.url);
      return Boolean(hostname) && domains.some((domain) => hostnameMatchesDomain(hostname, domain));
    },
    internal: true,
  },
  {
    id: 'title',
    labelKey: 'table_columnTitle',
    accessor: (row) => row.title,
    header: 'sortable',
    cell: ({ row }) => {
      const title = row.original.title.trim();
      const url = row.original.url;

      // Show favicon for links, folder icon for folders
      const icon =
        row.original.type === ItemTypeEnum.Folder ? (
          <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : url ? (
          <SiteIcon url={url} className="shrink-0 rounded-sm" />
        ) : (
          <Link className="h-4 w-4 text-muted-foreground shrink-0" />
        );

      return (
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          {title ? (
            <span className="min-w-0 truncate" title={title}>
              {title}
            </span>
          ) : (
            <span className="min-w-0 truncate italic text-muted-foreground">
              {t('bookmarks_untitled')}
            </span>
          )}
        </div>
      );
    },
    filterFn: textFilter,
    // Title fills the room the other columns leave until the user sizes it (FILL_COLUMN_ID);
    // `size` is the narrowest it fills to, and `minSize` keeps a resized Title readable.
    size: { size: 160, minSize: 120 },
  },
  {
    id: 'dateAdded',
    labelKey: 'table_columnDateAdded',
    accessor: (row) => row.dateAdded,
    header: 'sortable',
    cell: ({ getValue }) => formatTimestamp(getValue()),
    filterFn: (row, id, value: DateRange | undefined) => isWithinDateRange(row.getValue(id), value),
    size: { size: 190, minSize: 100 },
  },
  {
    id: 'dateGroupModified',
    labelKey: 'table_columnDateGroupModified',
    accessor: (row) => row.dateGroupModified,
    header: 'label',
    cell: ({ getValue }) => formatTimestamp(getValue()),
    size: { size: 190, minSize: 100 },
    defaultVisible: false,
  },
  {
    id: 'unmodifiable',
    labelKey: 'table_columnUnmodifiable',
    accessor: (row) => row.unmodifiable,
    header: 'label',
    size: { size: 130, minSize: 80 },
    defaultVisible: false,
  },
  {
    id: 'actions',
    cell: ({ row, table }, { rowActions, actionContext }) => {
      const bookmark = row.original;
      // Moves are only enabled while the table shows the whole folder in browser order, so the
      // table data is the folder's children and the index says where the item sits among them.
      const position = { index: bookmark.index ?? 0, siblingCount: table.options.data.length };
      return (
        <div className="flex items-center justify-end">
          {isModifiableBookmark(bookmark) && (
            // Shown on hover or focus as an overlay left of the menu, so the pinned column only
            // reserves room for the menu button and never pushes other columns out of view.
            <div className="pointer-events-none absolute right-full top-1/2 mr-1 -translate-y-1/2 rounded-md border bg-background p-1 opacity-0 shadow-sm transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
              <MoveBookmarkButtons
                position={position}
                onMove={(direction) => moveBookmarkWithinFolder(bookmark, direction)}
              />
            </div>
          )}
          <BookmarkRowMenu bookmark={bookmark} actions={rowActions} context={actionContext} />
        </div>
      );
    },
    size: { fixed: 68 },
  },
];

/** Columns that only back filters; the table always hides them. */
export const INTERNAL_BOOKMARK_COLUMN_IDS: readonly string[] = BOOKMARK_COLUMNS.filter(
  (column) => column.internal,
).map((column) => column.id);

/** The registry entry for a column id, if any. */
export function findBookmarkColumn(columnId: string): BookmarkColumn | undefined {
  return BOOKMARK_COLUMNS.find((column) => column.id === columnId);
}

/** Localized display name for a bookmark table column, falling back to its id. */
export function getBookmarkColumnLabel(columnId: string): string {
  const key = findBookmarkColumn(columnId)?.labelKey;
  return key ? t(key) : columnId;
}

function renderHeader(
  column: BookmarkColumn,
): ColumnDef<BookmarkTableFeatures, Bookmark>['header'] {
  const { header, labelKey } = column;
  const label = () => (labelKey ? t(labelKey) : column.id);
  if (header === 'sortable') {
    return ({ column: tableColumn }) => (
      <DataTableColumnHeader column={tableColumn} title={label()} />
    );
  }
  if (header === 'label') return label;
  return header;
}

/** Turns registry entries into table column definitions. */
export function createColumns(
  context: BookmarkColumnContext,
  columns: readonly BookmarkColumn[] = BOOKMARK_COLUMNS,
): ColumnDef<BookmarkTableFeatures, Bookmark>[] {
  return columns.map((column) => {
    const header = renderHeader(column);
    const { cell } = column;
    return {
      id: column.id,
      ...(column.accessor ? { accessorFn: column.accessor } : {}),
      ...(header ? { header } : {}),
      ...(cell ? { cell: (cellContext: BookmarkCellContext) => cell(cellContext, context) } : {}),
      ...(column.filterFn ? { filterFn: column.filterFn } : {}),
      ...(column.sortFn ? { sortFn: column.sortFn } : {}),
      ...(column.enableSorting !== undefined ? { enableSorting: column.enableSorting } : {}),
      ...(column.enableHiding !== undefined ? { enableHiding: column.enableHiding } : {}),
      ...getColumnSizeDef(column.size),
    } as ColumnDef<BookmarkTableFeatures, Bookmark>;
  });
}
