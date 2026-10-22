/**
 * Column registry for the bookmark manager table. Each entry is the single place a column is
 * described: its label, how it reads, renders, filters, and sorts a row, its width, and below
 * which table width it gives way. Which columns a new view shows, and in what order, is
 * `default_columns` in config/ui/manager-table.toml. The saved table view, column sizing,
 * narrow-width hiding, and the View menu all read this list, so adding a column is one new entry
 * here and needs no change to the table component.
 */

import type {
  CellContext,
  ColumnDef,
  FilterFn,
  HeaderContext,
  SortFn,
} from '@tanstack/react-table';
import { Folder, Link, SeparatorHorizontal } from 'lucide-react';
import type { ComponentType, MouseEvent, ReactNode } from 'react';
import type { DateRange } from 'react-day-picker';

const ITEM_TYPES: Record<ItemTypeEnum, { labelKey: MessageKey; icon: ItemType['icon'] }> = {
  [ItemTypeEnum.Folder]: { labelKey: 'table_typeFolder', icon: Folder },
  [ItemTypeEnum.Link]: { labelKey: 'table_typeLink', icon: Link },
  [ItemTypeEnum.Separator]: { labelKey: 'table_typeSeparator', icon: SeparatorHorizontal },
};

/** Type filter options with labels resolved in the active UI language. */
export function getLocalizedTypeOptions(): ItemType[] {
  return (
    Object.values(ItemTypeEnum)
      // Only browsers with separators (Firefox) offer the kind.
      .filter((type) => type !== ItemTypeEnum.Separator || browserProfile().separators)
      .map((type) => ({
        value: type,
        label: t(ITEM_TYPES[type].labelKey),
        icon: ITEM_TYPES[type].icon,
      }))
  );
}

type ItemType = {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const bookmarkDomains = new WeakMap<Bookmark, string>();

/**
 * The registrable domain of a row's URL, worked out once per row: the domain facet and its
 * counts read it for every bookmark whenever the list changes, and rows that did not change keep
 * their identity.
 */
export function getBookmarkDomain(bookmark: Bookmark): string {
  let domain = bookmarkDomains.get(bookmark);
  if (domain === undefined) {
    domain = getUrlDomain(bookmark.url);
    bookmarkDomains.set(bookmark, domain);
  }
  return domain;
}

/** What column cells can use beyond the row: what the row's menu actions may ask the page. */
export type BookmarkColumnContext = {
  actionHost: ActionItemHost;
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
  /**
   * The column's share of the width the other columns leave, while the user has not sized it;
   * its `size` is then the narrowest it fills to. Columns without one keep their width.
   */
  fillWeight?: number;
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

/** Whether any of `texts` contains the filter `value`, ignoring case; an empty filter matches. */
function includesQuery(value: unknown, ...texts: (string | undefined)[]) {
  const query = String(value ?? '')
    .trim()
    .toLowerCase();
  return !query || texts.some((text) => text?.toLowerCase().includes(query));
}

/**
 * The search box's filter on the Title column: what was typed, and what the search query language
 * (`use-search-matches.ts`) found for it, matched by row id.
 */
export type TitleSearchFilter = { text: string; matches: SearchMatches };

/** The text of the Title column's filter, which saved searches also set as plain text. */
export function titleSearchText(value: unknown): string {
  if (typeof value === 'string') return value;
  return (value as Partial<TitleSearchFilter> | undefined)?.text ?? '';
}

function matchesTitleSearch(rowId: string, value: unknown): boolean {
  const matches = (value as Partial<TitleSearchFilter> | undefined)?.matches;
  if (matches === undefined || matches === 'all') return true;
  // Nothing is listed until the query filter has read the query, so all bookmarks never flash.
  if (matches === 'pending') return false;
  return matches.has(rowId);
}

function textFilter(row: { getValue: (id: string) => unknown }, id: string, value: unknown) {
  return includesQuery(value, String(row.getValue(id) ?? ''));
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
        aria-label={t('table_selectRow', getBookmarkDisplayTitle(row.original.title.trim()))}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    ...getManagerColumnLayout('select'),
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
    ...getManagerColumnLayout('type'),
  },
  {
    id: 'id',
    labelKey: 'table_columnId',
    accessor: (row) => row.id,
    header: 'sortable',
    ...getManagerColumnLayout('id'),
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
    ...getManagerColumnLayout('parentId'),
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
    // Dropped first when the table is narrow (for example with the Tools sidebar open), so Title
    // and Date Added stay in view instead of scrolling away.
    ...getManagerColumnLayout('folderPath'),
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
          <UrlLink href={rowUrl} className="block min-w-0 truncate" title={rowUrl} />
        </div>
      );
    },
    filterFn: textFilter,
    ...getManagerColumnLayout('url'),
  },
  {
    id: DOMAIN_COLUMN_ID,
    accessor: getBookmarkDomain,
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

      if (isSeparatorItem(row.original)) {
        return (
          <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <SeparatorHorizontal className="h-4 w-4 shrink-0" />
            <div className="flex min-w-0 flex-col">
              <span className="min-w-0 truncate italic">{t('table_typeSeparator')}</span>
              <RowFolderPath path={row.original.folderPath} />
            </div>
          </div>
        );
      }

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
          <div className="flex min-w-0 flex-col">
            {title ? (
              <span className="min-w-0 truncate" title={title}>
                {title}
              </span>
            ) : (
              <span className="min-w-0 truncate italic text-muted-foreground">
                {t('popup_untitled')}
              </span>
            )}
            <RowFolderPath path={row.original.folderPath} />
          </div>
        </div>
      );
    },
    // The search box, in the search query language: title, address, site, folder, tags, summary.
    filterFn: (row, _id, value) => matchesTitleSearch(row.original.id, value),
    // Title shares the room the other columns leave with URL until the user sizes it
    // (`fillWeight`); `size` is the narrowest it fills to, and `minSize` keeps a resized Title
    // readable.
    ...getManagerColumnLayout('title'),
  },
  {
    id: 'dateAdded',
    labelKey: 'table_columnDateAdded',
    accessor: (row) => row.dateAdded,
    header: 'sortable',
    cell: ({ getValue }) => formatTimestamp(getValue()),
    filterFn: (row, id, value: DateRange | undefined) => isWithinDateRange(row.getValue(id), value),
    ...getManagerColumnLayout('dateAdded'),
  },
  {
    id: 'dateGroupModified',
    labelKey: 'table_columnDateGroupModified',
    accessor: (row) => row.dateGroupModified,
    header: 'label',
    cell: ({ getValue }) => formatTimestamp(getValue()),
    ...getManagerColumnLayout('dateGroupModified'),
  },
  {
    id: 'unmodifiable',
    labelKey: 'table_columnUnmodifiable',
    accessor: (row) => row.unmodifiable,
    header: 'label',
    ...getManagerColumnLayout('unmodifiable'),
  },
  {
    id: 'actions',
    cell: ({ row, table }, { actionHost }) => {
      const bookmark = row.original;
      // Moves are only enabled while the table shows the whole folder in browser order, so the
      // table data is the folder's children and the index says where the item sits among them.
      const position = { index: bookmark.index ?? 0, siblingCount: table.options.data.length };
      return (
        <div className="flex items-center justify-end gap-1">
          {isModifiableBookmark(bookmark) && (
            // Shown on hover or focus in the column's own room before the menu (its width in
            // config/ui/manager-table.toml), so they never cover the row's other columns.
            <div className="pointer-events-none opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
              <MoveBookmarkButtons
                position={position}
                onMove={async (direction) => {
                  // Recorded, so Ctrl+Z puts the item back.
                  await recordBookmarkWrites({ action: 'move', title: bookmark.title }, (writer) =>
                    moveBookmarkWithinFolder(bookmark, direction, writer.move),
                  );
                }}
              />
            </div>
          )}
          <BookmarkRowMenu bookmark={bookmark} host={actionHost} />
        </div>
      );
    },
    ...getManagerColumnLayout('actions'),
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
