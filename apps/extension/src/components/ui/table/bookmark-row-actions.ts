/**
 * Item-action registry for the bookmark manager: the commands of a row's ⋯ menu, the right-click
 * menu on rows (acting on the selection) and on folders in the tree, after Chrome's manager. Each
 * entry is one menu item; adding an action is one new entry here and needs no change to the menus.
 */

import {
  AppWindow,
  ClipboardPaste,
  Copy,
  ExternalLink,
  FolderSearch,
  Hash,
  Info,
  Link2,
  type LucideIcon,
  Pencil,
  Scissors,
  Trash2,
  VenetianMask,
} from 'lucide-react';

/** What item actions can ask of the manager page. */
export type BookmarkRowActionContext = {
  showDetails: (bookmark: Bookmark) => void;
  edit: (bookmark: Bookmark) => void;
  /** Starts the manager's delete flow: confirmation when enabled, then an undo toast. */
  requestDeletion: (items: Bookmark[]) => void;
  /** Reports a failed action in an error toast titled with the message `titleKey`. */
  reportError: (titleKey: string, error: unknown) => void;
  /** Whether the row is a search result from a folder other than the one open. */
  isOutsideOpenFolder: (bookmark: Bookmark) => boolean;
  /** Opens the row's folder without the search, with the row selected (Show in folder). */
  showInFolder: (bookmark: Bookmark) => void;
  /** Copies the manager address that opens this folder. */
  copyFolderLink: (folderId: string) => void;
  /** The URLs opening `items` would open: bookmarks, and the bookmarks directly in folders. */
  openableUrls: (items: Bookmark[]) => string[];
  /** Opens `items` (asking first for many tabs). */
  open: (items: Bookmark[], target: BookmarkOpenTarget) => void;
  /** Whether this browser lets the manager open private (incognito) windows. */
  privateWindowsAllowed: boolean;
  cut: (items: Bookmark[]) => void;
  copy: (items: Bookmark[]) => void;
  /** Pastes next to `items` (a row menu) or into them (a folder in the tree). */
  paste: (items: Bookmark[]) => void;
  /** Whether there is something to paste where `items` are. */
  canPaste: (items: Bookmark[]) => boolean;
};

/** Menu sections, in order, with a separator between them. */
export type BookmarkRowActionGroup = 'main' | 'clipboard' | 'open' | 'destructive';

export const BOOKMARK_ROW_ACTION_GROUPS: readonly BookmarkRowActionGroup[] = [
  'main',
  'clipboard',
  'open',
  'destructive',
];

export type BookmarkRowAction = {
  id: string;
  group: BookmarkRowActionGroup;
  /** Locale key of the menu item text. */
  labelKey: string;
  /** The text when it depends on the items, such as "Open all (12)". */
  label?: (items: Bookmark[], context: BookmarkRowActionContext) => string;
  icon: LucideIcon;
  /** Whether the menu offers the action for the items (default: always). */
  isAvailable?: (items: Bookmark[], context: BookmarkRowActionContext) => boolean;
  run: (items: Bookmark[], context: BookmarkRowActionContext) => void | Promise<void>;
};

const single = (items: Bookmark[]) => (items.length === 1 ? items[0] : undefined);
const isFolder = (bookmark: Bookmark | undefined) => bookmark?.type === ItemTypeEnum.Folder;
const allModifiable = (items: Bookmark[]) =>
  items.length > 0 && items.every((item) => isModifiableBookmark(item));

/** "Open in new tab" for one bookmark, "Open all (3)" for several or a folder, as in Chrome. */
function openLabel(one: MessageKey, many: MessageKey) {
  return (items: Bookmark[], context: BookmarkRowActionContext) => {
    const bookmark = single(items);
    if (bookmark && !isFolder(bookmark)) return t(one);
    return t(many, String(context.openableUrls(items).length));
  };
}

/** Each browser's name for a private window. */
const PRIVATE_WINDOW_LABELS: Record<string, { one: MessageKey; many: MessageKey }> = {
  chrome: { one: 'menu_openIncognito', many: 'menu_openAllIncognito' },
  edge: { one: 'menu_openInPrivate', many: 'menu_openAllInPrivate' },
  firefox: { one: 'menu_openPrivate', many: 'menu_openAllPrivate' },
};
const privateWindowLabel =
  PRIVATE_WINDOW_LABELS[import.meta.env.BROWSER] ?? PRIVATE_WINDOW_LABELS.chrome;

const canOpen = (items: Bookmark[], context: BookmarkRowActionContext) =>
  context.openableUrls(items).length > 0;

export const BOOKMARK_ROW_ACTIONS: readonly BookmarkRowAction[] = [
  {
    id: 'showInFolder',
    group: 'main',
    labelKey: 'table_showInFolder',
    icon: FolderSearch,
    // As in Chrome: search results only, and not the top-level folders, which have no folder.
    isAvailable: (items, context) => {
      const bookmark = single(items);
      return Boolean(
        bookmark?.parentId && !bookmark.isRootFolder && context.isOutsideOpenFolder(bookmark),
      );
    },
    run: (items, context) => context.showInFolder(items[0]),
  },
  {
    id: 'edit',
    group: 'main',
    labelKey: 'table_edit',
    label: (items) => (isFolder(single(items)) ? t('menu_rename') : t('table_edit')),
    icon: Pencil,
    isAvailable: (items) => single(items) !== undefined && allModifiable(items),
    run: (items, context) => context.edit(items[0]),
  },
  {
    id: 'viewDetails',
    group: 'main',
    labelKey: 'bookmarks_viewDetails',
    icon: Info,
    isAvailable: (items) => single(items) !== undefined,
    run: (items, context) => context.showDetails(items[0]),
  },
  {
    id: 'cut',
    group: 'clipboard',
    labelKey: 'menu_cut',
    icon: Scissors,
    isAvailable: allModifiable,
    run: (items, context) => context.cut(items),
  },
  {
    id: 'copy',
    group: 'clipboard',
    labelKey: 'menu_copy',
    icon: Copy,
    isAvailable: (items) => items.length > 0 && items.every((item) => !item.isRootFolder),
    run: (items, context) => context.copy(items),
  },
  {
    id: 'paste',
    group: 'clipboard',
    labelKey: 'menu_paste',
    icon: ClipboardPaste,
    isAvailable: (items, context) => context.canPaste(items),
    run: (items, context) => context.paste(items),
  },
  {
    id: 'copyFolderLink',
    group: 'clipboard',
    labelKey: 'bookmarks_copyFolderLink',
    icon: Link2,
    isAvailable: (items) => isFolder(single(items)),
    run: (items, context) => context.copyFolderLink(items[0].id),
  },
  {
    id: 'copyId',
    group: 'clipboard',
    labelKey: 'table_copyId',
    icon: Hash,
    isAvailable: (items) => single(items) !== undefined,
    run: (items) => navigator.clipboard.writeText(items[0].id),
  },
  {
    id: 'openInNewTab',
    group: 'open',
    labelKey: 'table_openInNewTab',
    label: openLabel('table_openInNewTab', 'menu_openAll'),
    icon: ExternalLink,
    isAvailable: canOpen,
    // One bookmark comes to the front; "Open all" opens in the background, as in Chrome.
    run: (items, context) =>
      context.open(items, single(items) && !isFolder(items[0]) ? 'tabs' : 'background-tabs'),
  },
  {
    id: 'openInNewWindow',
    group: 'open',
    labelKey: 'menu_openInNewWindow',
    label: openLabel('menu_openInNewWindow', 'menu_openAllInNewWindow'),
    icon: AppWindow,
    isAvailable: canOpen,
    run: (items, context) => context.open(items, 'window'),
  },
  {
    id: 'openInPrivateWindow',
    group: 'open',
    labelKey: privateWindowLabel.one,
    label: openLabel(privateWindowLabel.one, privateWindowLabel.many),
    icon: VenetianMask,
    isAvailable: (items, context) => context.privateWindowsAllowed && canOpen(items, context),
    run: (items, context) => context.open(items, 'private-window'),
  },
  {
    id: 'delete',
    group: 'destructive',
    labelKey: 'action_delete',
    icon: Trash2,
    isAvailable: allModifiable,
    run: (items, context) => context.requestDeletion(items),
  },
];

/** The actions a menu shows for `items`, by section, in registry order; empty sections dropped. */
export function getAvailableRowActions(
  items: Bookmark[],
  actions: readonly BookmarkRowAction[],
  context: BookmarkRowActionContext,
): { group: BookmarkRowActionGroup; actions: BookmarkRowAction[] }[] {
  const available = actions.filter((action) => action.isAvailable?.(items, context) ?? true);
  return BOOKMARK_ROW_ACTION_GROUPS.map((group) => ({
    group,
    actions: available.filter((action) => action.group === group),
  })).filter((section) => section.actions.length > 0);
}

/** The text an action shows for `items`. */
export function getRowActionLabel(
  action: BookmarkRowAction,
  items: Bookmark[],
  context: BookmarkRowActionContext,
): string {
  return action.label ? action.label(items, context) : t(action.labelKey);
}
