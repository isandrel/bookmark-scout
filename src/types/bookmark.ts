/**
 * Centralized type definitions for bookmark-related types.
 * Used across PopupPage, BookmarksPage, and other components.
 */

/**
 * Extended bookmark tree node with additional UI state properties.
 * Extends the Chrome bookmarks API type with UI-specific fields.
 */
export interface BookmarkTreeNode {
  id: string;
  parentId?: string;
  index?: number;
  title: string;
  url?: string;
  dateAdded?: number;
  dateGroupModified?: number;
  children?: BookmarkTreeNode[];
  /** Whether the folder is expanded in the UI */
  isOpen?: boolean;
  /** Whether this is a temporary node (e.g., new folder being created) */
  isTemporary?: boolean;
}

/**
 * Types of drag-and-drop operations.
 */
export type DragOperationType =
  | 'folder-move'
  | 'folder-reorder'
  | 'bookmark-move'
  | 'bookmark-reorder';

/**
 * Represents a drag-and-drop operation for bookmarks/folders.
 */
export interface DragOperation {
  type: DragOperationType;
  sourceId: string;
  sourceParentId: string;
  sourceIndex: number;
  targetId: string;
  targetParentId: string;
  targetIndex: number;
}

/**
 * Data attached to draggable elements.
 */
export interface DragData {
  type: 'folder' | 'bookmark';
  node: BookmarkTreeNode;
  instanceId: symbol;
}

/**
 * Bookmark item for table view (used in BookmarksPage).
 */
export enum ItemTypeEnum {
  Folder = 'folder',
  Link = 'link',
}

export interface BookmarkTableItem {
  type: ItemTypeEnum;
  id: string;
  parentId: string;
  index?: number;
  title: string;
  url?: string;
  dateAdded?: string;
  dateGroupModified?: string;
  unmodifiable?: 'managed';
}
