import type { ColumnDef } from '@tanstack/react-table';
import { Folder, Link } from 'lucide-react';
import type { ComponentType, MouseEvent } from 'react';
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

const columnLabelKeys: Record<string, string> = {
  type: 'table_columnType',
  id: 'table_columnId',
  parentId: 'table_columnParentId',
  folderPath: 'bookmarks_folderPath',
  url: 'table_columnUrl',
  title: 'table_columnTitle',
  dateAdded: 'table_columnDateAdded',
  dateGroupModified: 'table_columnDateGroupModified',
  unmodifiable: 'table_columnUnmodifiable',
};

/** Localized display name for a bookmark table column, falling back to its id. */
export function getBookmarkColumnLabel(columnId: string): string {
  const key = columnLabelKeys[columnId];
  return key ? t(key) : columnId;
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

export type BookmarkRowActionHandlers = {
  onViewDetails: (bookmark: Bookmark) => void;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
  onOpenInNewTab: (bookmark: Bookmark) => void;
};

/** Hidden column that groups links by registrable domain for the URL domain chips. */
export const DOMAIN_COLUMN_ID = 'domain';

function formatTimestamp(value: unknown): string {
  return typeof value === 'number' ? new Date(value).toLocaleString() : '';
}

type MoveDirection = 'up' | 'down' | 'top' | 'bottom';

// Checkboxes live inside clickable rows; keep toggling them from opening folders.
const stopRowClick = (event: MouseEvent) => event.stopPropagation();

async function moveWithinFolder(bookmark: Bookmark, direction: MoveDirection): Promise<void> {
  if (!bookmark.parentId) return;
  const siblings = await getBookmarkChildren(bookmark.parentId);
  const currentIndex = siblings.findIndex((sibling) => sibling.id === bookmark.id);
  if (currentIndex < 0) return;

  // The browser inserts before the item at the target index, counting the moved item itself,
  // so moving down one slot targets index + 2.
  const targetIndex = {
    top: 0,
    up: Math.max(0, currentIndex - 1),
    down: Math.min(siblings.length, currentIndex + 2),
    bottom: siblings.length,
  }[direction];
  if (direction === 'down' && currentIndex >= siblings.length - 1) return;
  if ((direction === 'up' || direction === 'top') && currentIndex === 0) return;
  await moveBookmark(bookmark.id, { parentId: bookmark.parentId, index: targetIndex });
}

export const createColumns = (
  actions: BookmarkRowActionHandlers,
): ColumnDef<BookmarkTableFeatures, Bookmark>[] => [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
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
  },
  {
    accessorKey: 'type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={getBookmarkColumnLabel('type')} />
    ),
    cell: ({ row }) => {
      const type = getLocalizedTypeOptions().find((type) => type.value === row.getValue('type'));

      if (!type) {
        return null;
      }

      return (
        <div className="flex items-center">
          {type.icon && <type.icon className="mr-2 h-4 w-4 text-muted-foreground" />}
          <span>{type.label}</span>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={getBookmarkColumnLabel('id')} />
    ),
  },
  {
    accessorKey: 'parentId',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={getBookmarkColumnLabel('parentId')} />
    ),
    // The parent is the last folder of the item's path, so no bookmark lookup is needed.
    cell: ({ row }) =>
      row.original.parentId ? (
        <div className="flex min-w-0 items-center" title={row.original.parentId}>
          <Folder className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="block max-w-72 truncate">{row.original.folderPath}</span>
        </div>
      ) : null,
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: 'folderPath',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={getBookmarkColumnLabel('folderPath')} />
    ),
    cell: ({ row }) => {
      const path = row.original.folderPath;
      return (
        <span className="block max-w-72 truncate" title={path}>
          {path}
        </span>
      );
    },
  },
  {
    accessorKey: 'url',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={getBookmarkColumnLabel('url')} />
    ),
    cell: ({ row }) => {
      const rowUrl = row.original.url;
      if (!rowUrl) {
        return null;
      }

      return (
        <div className="flex min-w-0 items-center gap-2">
          <img src={getFaviconUrl(rowUrl)} alt="" className="h-4 w-4 shrink-0" />
          <span className="block max-w-72 truncate" title={rowUrl}>
            {rowUrl}
          </span>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      const query = String(value ?? '').trim().toLowerCase();
      return !query || String(row.getValue(id) ?? '').toLowerCase().includes(query);
    },
  },
  {
    id: DOMAIN_COLUMN_ID,
    accessorFn: (row) => getUrlDomain(row.url),
    enableHiding: false,
    enableSorting: false,
    // Match by hostname so "bbc.co.uk" covers news.bbc.co.uk but not example.com/?q=bbc.co.uk.
    filterFn: (row, _id, value) => {
      const domains: string[] = Array.isArray(value) ? value : [];
      if (domains.length === 0) return true;
      const hostname = getUrlHostname(row.original.url);
      return Boolean(hostname) && domains.some((domain) => hostnameMatchesDomain(hostname, domain));
    },
  },
  {
    accessorKey: 'title',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={getBookmarkColumnLabel('title')} />
    ),
    cell: ({ row }) => {
      const title = row.original.title.trim();
      const url = row.original.url;
      const type = row.original.type;

      // Show favicon for links, folder icon for folders
      const icon =
        type === 'folder' ? (
          <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : url ? (
          <img
            src={getFaviconUrl(url)}
            alt=""
            className="h-4 w-4 shrink-0 rounded-sm"
            onError={(e) => {
              // Fallback to generic link icon
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <Link className="h-4 w-4 text-muted-foreground shrink-0" />
        );

      return (
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          {title ? (
            <span className="max-w-72 truncate" title={title}>
              {title}
            </span>
          ) : (
            <span className="max-w-72 truncate italic text-muted-foreground">
              {t('bookmarks_untitled')}
            </span>
          )}
        </div>
      );
    },
    filterFn: (row, id, value) => {
      const query = String(value ?? '').trim().toLowerCase();
      return !query || String(row.getValue(id) ?? '').toLowerCase().includes(query);
    },
  },
  {
    accessorKey: 'dateAdded',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={getBookmarkColumnLabel('dateAdded')} />
    ),
    filterFn: (row, id, value: DateRange | undefined) => isWithinDateRange(row.getValue(id), value),
    cell: ({ row }) => {
      return formatTimestamp(row.getValue('dateAdded'));
    },
  },
  {
    accessorKey: 'dateGroupModified',
    header: () => getBookmarkColumnLabel('dateGroupModified'),
    cell: ({ row }) => formatTimestamp(row.getValue('dateGroupModified')),
  },
  {
    accessorKey: 'unmodifiable',
    header: () => getBookmarkColumnLabel('unmodifiable'),
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const bookmark = row.original;
      return (
        <div className="flex items-center justify-end gap-2">
          {isModifiableBookmark(bookmark) && (
            <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <MoveBookmarkButtons onMove={(direction) => moveWithinFolder(bookmark, direction)} />
            </div>
          )}
          <BookmarkRowMenu bookmark={bookmark} actions={actions} />
        </div>
      );
    },
  },
];
