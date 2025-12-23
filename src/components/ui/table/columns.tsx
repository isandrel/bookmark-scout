import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Folder, Link, MoreHorizontal } from "lucide-react";
import { DateRange } from "react-day-picker";
import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ComponentType } from "react";
import { DataTableColumnHeader } from "./data-table-column-header";
import { DataTableDateFilter } from "./data-table-date-filter";
import { useParentIdMap, useUrlMap } from "@/components/page/BookmarksPage";
import { MoveBookmarkButtons } from "./move-bookmark-buttons";

export enum ItemTypeEnum {
  Folder = "folder",
  Link = "link",
}

export const typeMap: Record<ItemTypeEnum, ItemType> = {
  [ItemTypeEnum.Folder]: { value: "folder", label: "Folder", icon: Folder },
  [ItemTypeEnum.Link]: { value: "link", label: "Link", icon: Link },
};

type ItemType = {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export type Bookmark = {
  type: ItemTypeEnum;
  id: string;
  parentId?: string;
  index?: number;
  title: string;
  url?: string;
  dateAdded?: string;
  dateGroupModified?: string;
  unmodifiable?: "managed";
};

export const columns: ColumnDef<Bookmark>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => {
      const types = Object.values(typeMap);
      const type = types.find(
        (type) => type.value === row.getValue("type")
      )

      if (!type) {
        return null
      }

      return (
        <div className="flex items-center">
          {type.icon && (
            <type.icon className="mr-2 h-4 w-4 text-muted-foreground" />
          )}
          <span>{type.label}</span>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    }
  },
  {
    accessorKey: "id",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        ID
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: "parentId",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Parent ID" />
    ),
    cell: ({ row }) => {
      const parentIdMap = useParentIdMap();
      const parentIds = Object.values(parentIdMap);
      const parentId = parentIds.find(
        (parentId) => parentId.value === row.getValue("parentId")
      )

      if (!parentId) {
        return null
      }

      return (
        <div className="flex items-center">
          {parentId.icon && (
            <parentId.icon className="mr-2 h-4 w-4 text-muted-foreground" />
          )}
          <span>{parentId.label}</span>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "url",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="URL" />
    ),
    cell: ({ row }) => {
      const urlMap = useUrlMap();
      const urls = Object.values(urlMap);

      const rowUrl = row.getValue("url") as string;
      const matchedUrl = urls.find(({ value }) => rowUrl.includes(value));

      if (!matchedUrl) {
        return null
      }

      return (
        <div className="flex items-center">
          {matchedUrl.icon && (
            <matchedUrl.icon className="mr-2 h-4 w-4 text-muted-foreground" />
          )}
          <span>{rowUrl}</span>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "title",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Title
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    filterFn: (row, id, value) => {
      const title = row.getValue(id) as string;
      return title.toLowerCase().includes(value.toLowerCase());
    },
  },
  {
    accessorKey: "dateAdded",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Date Added">
        <DataTableDateFilter
          title="Date Added"
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
      const date = new Date(row.getValue("dateAdded"));
      return date.toLocaleString();
    },
  },
  {
    accessorKey: "dateGroupModified",
    header: "Date Group Modified",
  },
  {
    accessorKey: "unmodifiable",
    header: "Unmodifiable",
  },
  {
    id: "actions",
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
            const parent = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve, reject) => {
              chrome.bookmarks.getChildren(bookmark.parentId!, (result) => {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError);
                  return;
                }
                resolve(result);
              });
            });
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
            console.error('Missing parentId or index:', { parentId: bookmark.parentId, index: bookmark.index });
            return;
          }

          // First, get the parent node to verify the operation and get current state
          const parent = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve, reject) => {
            chrome.bookmarks.getChildren(bookmark.parentId!, (result) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
              }
              resolve(result);
            });
          });

          // Find the current bookmark in the parent's children to get its actual index
          const currentBookmark = parent.find(b => b.id === bookmark.id);
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
            totalItems: parent.length
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
                index: direction === 'down' ? newIndex + 1 : newIndex
              },
              (result) => {
                if (chrome.runtime.lastError) {
                  console.error('Move error:', chrome.runtime.lastError);
                  reject(chrome.runtime.lastError);
                  return;
                }
                console.log('Move operation completed:', result);
                resolve(result);
              }
            );
          });

          // Trigger a refresh of the current folder's contents
          const event = new CustomEvent('bookmarkMoved', {
            detail: { parentId: bookmark.parentId }
          });
          window.dispatchEvent(event);

        } catch (error) {
          console.error('Failed to move bookmark:', error);
        }
      };

      return (
        <div className="flex items-center space-x-2">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <MoveBookmarkButtons onMove={moveBookmark} />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(bookmark.id);
                }}
              >
                Copy Bookmark ID
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>View Details</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];
