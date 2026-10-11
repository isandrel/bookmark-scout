/**
 * A row of the bookmark manager and what the browser lets the manager do with it. The table,
 * its menus, and the bookmark actions (`services/actions.ts`) all use it, so it lives on its own
 * with no dependencies: the background may load the actions.
 */

/** What a manager row is: a folder or a bookmark (link). */
export enum ItemTypeEnum {
  Folder = 'folder',
  Link = 'link',
}

/**
 * One row of the bookmark manager: a bookmark or folder with its folder path. Its menus and the
 * bookmark actions (`services/actions.ts`) act on these, so it lives here, apart from the table.
 */
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
  /** Top-level folders only: the browser's kind of permanent folder, such as `bookmarks-bar`. */
  folderType?: string;
  /** Top-level folders only: stored in the signed-in account rather than only on this device. */
  syncing?: boolean;
};

/** Whether the browser allows renaming, moving, or deleting this item. */
export function isModifiableBookmark(bookmark: Bookmark): boolean {
  return !bookmark.isRootFolder && !bookmark.unmodifiable;
}

/** Whether the manager can open this item in a tab (bookmarklets cannot be opened from here). */
export function isOpenableBookmark(bookmark: Bookmark): boolean {
  return bookmark.type === ItemTypeEnum.Link && Boolean(bookmark.url) && !isScriptUrl(bookmark.url);
}
