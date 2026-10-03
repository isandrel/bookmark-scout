/**
 * Row-action registry for the bookmark manager table. Each entry is one item in a row's menu;
 * adding an action is one new entry here and needs no change to the menu or table components.
 */

import { Copy, ExternalLink, Info, type LucideIcon, Pencil, Trash2 } from 'lucide-react';

/** What row actions can ask of the manager page. */
export type BookmarkRowActionContext = {
  showDetails: (bookmark: Bookmark) => void;
  edit: (bookmark: Bookmark) => void;
  /** Starts the manager's delete flow: confirmation when enabled, then an undo toast. */
  requestDeletion: (bookmark: Bookmark) => void;
  /** Reports a failed action in an error toast titled with the message `titleKey`. */
  reportError: (titleKey: string, error: unknown) => void;
};

export type BookmarkRowAction = {
  id: string;
  /** Locale key of the menu item text. */
  labelKey: string;
  icon: LucideIcon;
  /** Whether the menu offers the action for a row (default: always). */
  isAvailable?: (bookmark: Bookmark) => boolean;
  /** Destructive actions come last, after a separator, in the destructive color. */
  isDestructive?: boolean;
  run: (bookmark: Bookmark, context: BookmarkRowActionContext) => void | Promise<void>;
};

export const BOOKMARK_ROW_ACTIONS: readonly BookmarkRowAction[] = [
  {
    id: 'openInNewTab',
    labelKey: 'table_openInNewTab',
    icon: ExternalLink,
    isAvailable: isOpenableBookmark,
    run: async (bookmark, context) => {
      if (!bookmark.url || !isOpenableBookmark(bookmark)) return;
      try {
        await openBookmarkInNewTab(bookmark.url);
      } catch (error) {
        context.reportError('bookmarks_openFailed', error);
      }
    },
  },
  {
    id: 'edit',
    labelKey: 'table_edit',
    icon: Pencil,
    isAvailable: isModifiableBookmark,
    run: (bookmark, context) => context.edit(bookmark),
  },
  {
    id: 'viewDetails',
    labelKey: 'bookmarks_viewDetails',
    icon: Info,
    run: (bookmark, context) => context.showDetails(bookmark),
  },
  {
    id: 'copyId',
    labelKey: 'table_copyId',
    icon: Copy,
    run: (bookmark) => navigator.clipboard.writeText(bookmark.id),
  },
  {
    id: 'delete',
    labelKey: 'action_delete',
    icon: Trash2,
    isAvailable: isModifiableBookmark,
    isDestructive: true,
    run: (bookmark, context) => context.requestDeletion(bookmark),
  },
];

/** The actions a row's menu shows, split into regular ones and the destructive ones after them. */
export function getAvailableRowActions(
  bookmark: Bookmark,
  actions: readonly BookmarkRowAction[],
): { regular: BookmarkRowAction[]; destructive: BookmarkRowAction[] } {
  const available = actions.filter((action) => action.isAvailable?.(bookmark) ?? true);
  return {
    regular: available.filter((action) => !action.isDestructive),
    destructive: available.filter((action) => action.isDestructive),
  };
}
