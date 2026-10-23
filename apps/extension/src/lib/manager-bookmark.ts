/**
 * A row of the bookmark manager and what the browser lets the manager do with it. The table,
 * its menus, and the bookmark actions (`services/actions.ts`) all use it, so it lives on its own
 * with no dependencies: the background may load the actions.
 */

/** What a manager row is: a folder, a bookmark (link), or a Firefox separator. */
export enum ItemTypeEnum {
  Folder = 'folder',
  Link = 'link',
  /** Firefox only; a row with no address, which cannot be opened or renamed. */
  Separator = 'separator',
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

/** Whether `bookmark` is a Firefox separator. */
export function isSeparatorItem(bookmark: Pick<Bookmark, 'type'> | undefined): boolean {
  return bookmark?.type === ItemTypeEnum.Separator;
}

/** Whether the browser allows renaming, moving, or deleting this item. */
export function isModifiableBookmark(bookmark: Bookmark): boolean {
  return !bookmark.isRootFolder && !bookmark.unmodifiable;
}

/** Whether the manager can open this item in a tab (`isOpenableBookmarkUrl`). */
export function isOpenableBookmark(bookmark: Bookmark): boolean {
  return bookmark.type === ItemTypeEnum.Link && isOpenableBookmarkUrl(bookmark.url);
}

/** Whether the manager can preview this item: a bookmark with an address, not a folder or a separator. */
export function isPreviewableBookmark(bookmark: Bookmark | undefined): boolean {
  return bookmark?.type === ItemTypeEnum.Link && Boolean(bookmark.url);
}

/** The bookmarks a preview's Previous and Next go to; missing at either end of the rows. */
export type PreviewNeighbors = { previous?: Bookmark; next?: Bookmark };

/**
 * The previewable rows just before and after the one with `id`, in the order of `rows` (the
 * table's page as shown), skipping folders and separators. Nothing past either end: the preview
 * stops there rather than wrapping around. A row that is not in `rows` has no neighbors.
 */
export function previewNeighbors(rows: readonly Bookmark[], id: string): PreviewNeighbors {
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return {};
  return {
    previous: rows.slice(0, index).reverse().find(isPreviewableBookmark),
    next: rows.slice(index + 1).find(isPreviewableBookmark),
  };
}
