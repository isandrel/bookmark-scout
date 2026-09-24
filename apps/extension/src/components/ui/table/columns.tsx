import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, Folder, Link } from 'lucide-react';
import { type ComponentType, useEffect, useState } from 'react';
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

export type BookmarkRowActionHandlers = {
  onViewDetails: (bookmark: Bookmark) => void;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
  onOpenInNewTab: (bookmark: Bookmark) => void;
};

function formatTimestamp(value: unknown): string {
  return typeof value === 'number' ? new Date(value).toLocaleString() : '';
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
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label={t('table_selectRow')}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'type',
    header: ({ column }) => <DataTableColumnHeader column={column} title={getBookmarkColumnLabel('type')} />,
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
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        {getBookmarkColumnLabel('id')}
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: 'parentId',
    header: ({ column }) => <DataTableColumnHeader column={column} title={getBookmarkColumnLabel('parentId')} />,
    cell: ({ row }) => {
      const parentIdMap = useParentIdMap();
      const parentIds = Object.values(parentIdMap);
      const parentId = parentIds.find((parentId) => parentId.value === row.getValue('parentId'));

      if (!parentId) {
        return null;
      }

      return (
        <div className="flex items-center">
          {parentId.icon && <parentId.icon className="mr-2 h-4 w-4 text-muted-foreground" />}
          <span>{parentId.label}</span>
        </div>
      );
    },
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
    header: ({ column }) => <DataTableColumnHeader column={column} title={getBookmarkColumnLabel('url')} />,
    cell: ({ row }) => {
      const urlMap = useUrlMap();
      const urls = Object.values(urlMap);

      const rowUrl = row.getValue('url') as string;
      if (!rowUrl) {
        return null;
      }
      const matchedUrl = urls.find(({ value }) => rowUrl.includes(value));
      const Icon = matchedUrl?.icon ?? Link;

      return (
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="block max-w-72 truncate" title={rowUrl}>
            {rowUrl}
          </span>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      const url = String(row.getValue(id) ?? '').toLowerCase();
      if (Array.isArray(value)) {
        return value.some((domain: string) => url.includes(domain.toLowerCase()));
      }
      return url.includes(String(value).toLowerCase());
    },
  },
  {
    accessorKey: 'title',
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        {getBookmarkColumnLabel('title')}
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const title = row.getValue('title') as string;
      const url = row.original.url;
      const type = row.original.type;

      // Show favicon for links, folder icon for folders
      const icon =
        type === 'folder' ? (
          <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : url ? (
          <img
            src={`chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=16`}
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
          <span className="max-w-72 truncate" title={title}>
            {title}
          </span>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      const title = row.getValue(id) as string;
      return title.toLowerCase().includes(value.toLowerCase());
    },
  },
  {
    accessorKey: 'dateAdded',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={getBookmarkColumnLabel('dateAdded')}>
        <DataTableDateFilter
          title={getBookmarkColumnLabel('dateAdded')}
          value={column.getFilterValue() as DateRange}
          onChange={(value) => column.setFilterValue(value)}
        />
      </DataTableColumnHeader>
    ),
    filterFn: (row, id, value: DateRange) => {
      const dateAdded = new Date(row.getValue(id));
      if (!value?.from && !value?.to) return true;
      if (value?.from && !value?.to) return dateAdded >= value.from;
      if (!value?.from && value?.to) return dateAdded <= value.to;
      if (value?.from && value?.to) return dateAdded >= value.from && dateAdded <= value.to;
      return true;
    },
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
      const [, setSiblingCount] = useState<number | null>(null);

      useEffect(() => {
        const getSiblingCount = async () => {
          if (!chrome?.bookmarks || !bookmark.parentId) {
            setSiblingCount(null);
            return;
          }

          try {
            const parent = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>(
              (resolve, reject) => {
                chrome.bookmarks.getChildren(bookmark.parentId!, (result) => {
                  if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                  }
                  resolve(result);
                });
              },
            );
            setSiblingCount(parent.length);
          } catch (error) {
            console.error('Failed to get sibling count:', error);
            setSiblingCount(null);
          }
        };

        getSiblingCount();
      }, [bookmark.parentId]);

      const moveBookmark = async (direction: 'up' | 'down' | 'top' | 'bottom') => {
        if (!chrome?.bookmarks) {
          console.error('Chrome bookmarks API not available');
          return;
        }

        try {
          if (!bookmark.parentId || typeof bookmark.index !== 'number') {
            console.error('Missing parentId or index:', {
              parentId: bookmark.parentId,
              index: bookmark.index,
            });
            return;
          }

          // First, get the parent node to verify the operation and get current state
          const parent = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>(
            (resolve, reject) => {
              chrome.bookmarks.getChildren(bookmark.parentId!, (result) => {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError);
                  return;
                }
                resolve(result);
              });
            },
          );

          // Find the current bookmark in the parent's children to get its actual index
          const currentBookmark = parent.find((b) => b.id === bookmark.id);
          if (!currentBookmark || typeof currentBookmark.index !== 'number') {
            console.error('Bookmark not found in parent or missing index:', bookmark.id);
            return;
          }

          const currentIndex = currentBookmark.index;
          let newIndex: number;

          switch (direction) {
            case 'up':
              newIndex = Math.max(0, currentIndex - 1);
              break;
            case 'down':
              newIndex = Math.min(parent.length - 1, currentIndex + 1);
              break;
            case 'top':
              newIndex = 0;
              break;
            case 'bottom':
              newIndex = parent.length;
              break;
          }

          console.log('Moving bookmark:', {
            id: bookmark.id,
            currentIndex,
            newIndex,
            parentId: bookmark.parentId,
            direction,
            totalItems: parent.length,
          });

          // Verify the move is valid
          if (direction === 'down' && currentIndex >= parent.length - 1) {
            console.log('Cannot move down: already at bottom');
            return;
          }

          // Perform the move
          await new Promise<chrome.bookmarks.BookmarkTreeNode>((resolve, reject) => {
            chrome.bookmarks.move(
              bookmark.id,
              {
                parentId: bookmark.parentId,
                index: direction === 'down' ? newIndex + 1 : newIndex,
              },
              (result) => {
                if (chrome.runtime.lastError) {
                  console.error('Move error:', chrome.runtime.lastError);
                  reject(chrome.runtime.lastError);
                  return;
                }
                console.log('Move operation completed:', result);
                resolve(result);
              },
            );
          });

          // Trigger a refresh of the current folder's contents
          const event = new CustomEvent('bookmarkMoved', {
            detail: { parentId: bookmark.parentId },
          });
          window.dispatchEvent(event);
        } catch (error) {
          console.error('Failed to move bookmark:', error);
        }
      };

      return (
        <div className="flex items-center justify-end gap-2">
          {isModifiableBookmark(bookmark) && (
            <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <MoveBookmarkButtons onMove={moveBookmark} />
            </div>
          )}
          <BookmarkRowMenu bookmark={bookmark} actions={actions} />
        </div>
      );
    },
  },
];
