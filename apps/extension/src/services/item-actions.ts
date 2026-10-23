/**
 * The actions the bookmark manager's menus offer, after Chrome's manager: on items (a row's ⋯
 * menu, the right-click menus on rows and on folders in the tree) and on the folder shown (the
 * header's Organize menu and the right-click menu on the table's empty space). They are entries
 * of the one action registry (`actions.ts`), like the actions AI calls; which menu shows which,
 * in what order and sections, is `config/ui/actions.toml` (`action-menus.ts`). Each entry's
 * `itemMenu` or `folderMenu` says what it does there through the page (`ActionItemHost`,
 * `ActionFolderHost`), so a menu needs no code of its own per action. The popup and side panel
 * tree's row buttons and menus are entries' `popupMenu`, acting through `ActionPopupHost`.
 *
 * No React: icons are names (`ActionIconName`) the menus map to components.
 */
import type { BookmarkTreeNode } from '@/types';

const single = (items: readonly Bookmark[]) => (items.length === 1 ? items[0] : undefined);
const isFolderItem = (item: Bookmark | undefined) => item?.type === ItemTypeEnum.Folder;
const allModifiable = (items: readonly Bookmark[]) =>
  items.length > 0 && items.every((item) => isModifiableBookmark(item));
const canOpen = (items: readonly Bookmark[], host: ActionItemHost) =>
  host.openableUrls(items).length > 0;
/** A bookmark of a web page, which Fetch Covers can read. */
const isWebBookmark = (item: Bookmark) =>
  item.type === ItemTypeEnum.Link && item.url !== undefined && isWebUrl(item.url);

/** "Open in new tab" for one bookmark, "Open all (3)" for several or a folder, as in Chrome. */
function openLabel(one: MessageKey, many: MessageKey) {
  return (items: readonly Bookmark[], host: ActionItemHost) => {
    const bookmark = single(items);
    if (bookmark && !isFolderItem(bookmark)) return t(one);
    return t(many, String(host.openableUrls(items).length));
  };
}

/** The menu commands for each browser's name for a private window. */
const PRIVATE_WINDOW_LABELS: Record<
  BrowserProfile['privateWindow'],
  { one: MessageKey; many: MessageKey }
> = {
  incognito: { one: 'menu_openIncognito', many: 'menu_openAllIncognito' },
  in_private: { one: 'menu_openInPrivate', many: 'menu_openAllInPrivate' },
  private: { one: 'menu_openPrivate', many: 'menu_openAllPrivate' },
};
const privateWindowLabel = PRIVATE_WINDOW_LABELS[browserProfile().privateWindow];

/** A popup tree row's folder; bookmarks and Firefox separators have no children. */
const isPopupFolder = (node: BookmarkTreeNode) => node.children !== undefined;
const canOpenRow = (node: BookmarkTreeNode, host: ActionPopupHost) =>
  host.openableUrls(node).length > 0;

/** The popup's Open commands: one bookmark, or "Open all (3)" for a folder, as in the manager. */
function popupOpen(
  one: MessageKey,
  many: MessageKey,
  target: BookmarkOpenTarget,
  allowed: (host: ActionPopupHost) => boolean = () => true,
): ActionPopupMenu {
  return {
    label: (node, host) =>
      isPopupFolder(node) ? t(many, String(host.openableUrls(node).length)) : t(one),
    available: (node, host) => allowed(host) && canOpenRow(node, host),
    // A folder's bookmarks open in the background, as "Open all" does in the manager.
    run: (node, host) =>
      host.open(node, target === 'tabs' && isPopupFolder(node) ? 'background-tabs' : target),
  };
}

export const ITEM_ACTIONS = {
  preview: defineMenuAction({
    risk: 'read',
    targets: ['bookmark'],
    labelKey: 'bookmarks_preview',
    icon: 'eye',
    itemMenu: {
      // One bookmark with an address; folders and separators have nothing to preview.
      available: (items) => isPreviewableBookmark(single(items)),
      run: (items, host) => host.preview(items[0]),
    },
  }),
  showInFolder: defineMenuAction({
    risk: 'read',
    targets: ['bookmark', 'folder'],
    labelKey: 'table_showInFolder',
    icon: 'folderSearch',
    itemMenu: {
      // As in Chrome: search results only, and not the top-level folders, which have no folder.
      available: (items, host) => {
        const item = single(items);
        return Boolean(item?.parentId && !item.isRootFolder && host.isOutsideOpenFolder(item));
      },
      run: (items, host) => host.showInFolder(items[0]),
    },
  }),
  edit: defineMenuAction({
    risk: 'write',
    targets: ['bookmark', 'folder'],
    labelKey: 'table_edit',
    icon: 'pencil',
    itemMenu: {
      label: (items) => (isFolderItem(single(items)) ? t('menu_rename') : t('table_edit')),
      // Firefox cannot rename a separator.
      available: (items) =>
        single(items) !== undefined && !isSeparatorItem(items[0]) && allModifiable(items),
      run: (items, host) => host.edit(items[0]),
    },
  }),
  viewDetails: defineMenuAction({
    risk: 'read',
    targets: ['bookmark', 'folder'],
    labelKey: 'bookmarks_viewDetails',
    icon: 'info',
    itemMenu: {
      available: (items) => single(items) !== undefined && !isSeparatorItem(items[0]),
      run: (items, host) => host.showDetails(items[0]),
    },
  }),
  cut: defineMenuAction({
    risk: 'write',
    targets: ['bookmark', 'folder'],
    labelKey: 'menu_cut',
    icon: 'scissors',
    itemMenu: { available: allModifiable, run: (items, host) => host.cut(items) },
  }),
  copy: defineMenuAction({
    risk: 'read',
    targets: ['bookmark', 'folder'],
    labelKey: 'menu_copy',
    icon: 'copy',
    itemMenu: {
      available: (items) => items.length > 0 && items.every((item) => !item.isRootFolder),
      run: (items, host) => host.copy(items),
    },
  }),
  paste: defineMenuAction({
    risk: 'write',
    targets: ['folder'],
    labelKey: 'menu_paste',
    icon: 'clipboardPaste',
    itemMenu: {
      available: (items, host) => host.canPaste(items),
      run: (items, host) => host.paste(items),
    },
    folderMenu: {
      enabled: (host) => host.canChangeFolder && host.canPaste,
      run: (host) => host.paste(),
    },
  }),
  copyFolderLink: defineMenuAction({
    risk: 'read',
    targets: ['folder'],
    labelKey: 'bookmarks_copyFolderLink',
    icon: 'link',
    itemMenu: {
      available: (items) => isFolderItem(single(items)),
      run: (items, host) => host.copyFolderLink(items[0].id),
    },
  }),
  copyId: defineMenuAction({
    risk: 'read',
    targets: ['bookmark', 'folder'],
    labelKey: 'table_copyId',
    icon: 'hash',
    itemMenu: {
      available: (items) => single(items) !== undefined,
      run: (items, host) => host.copyId(items[0].id),
    },
  }),
  openInNewTab: defineMenuAction({
    risk: 'read',
    targets: ['bookmark', 'folder'],
    labelKey: 'table_openInNewTab',
    icon: 'externalLink',
    itemMenu: {
      label: openLabel('table_openInNewTab', 'menu_openAll'),
      available: canOpen,
      // One bookmark comes to the front; "Open all" opens in the background, as in Chrome.
      run: (items, host) =>
        host.open(items, single(items) && !isFolderItem(items[0]) ? 'tabs' : 'background-tabs'),
    },
    popupMenu: popupOpen('table_openInNewTab', 'menu_openAll', 'tabs'),
  }),
  openInNewWindow: defineMenuAction({
    risk: 'read',
    targets: ['bookmark', 'folder'],
    labelKey: 'menu_openInNewWindow',
    icon: 'appWindow',
    itemMenu: {
      label: openLabel('menu_openInNewWindow', 'menu_openAllInNewWindow'),
      available: canOpen,
      run: (items, host) => host.open(items, 'window'),
    },
    popupMenu: popupOpen('menu_openInNewWindow', 'menu_openAllInNewWindow', 'window'),
  }),
  openInPrivateWindow: defineMenuAction({
    risk: 'read',
    targets: ['bookmark', 'folder'],
    labelKey: privateWindowLabel.one,
    icon: 'venetianMask',
    itemMenu: {
      label: openLabel(privateWindowLabel.one, privateWindowLabel.many),
      available: (items, host) => host.privateWindowsAllowed && canOpen(items, host),
      run: (items, host) => host.open(items, 'private-window'),
    },
    popupMenu: popupOpen(
      privateWindowLabel.one,
      privateWindowLabel.many,
      'private-window',
      (host) => host.privateWindowsAllowed,
    ),
  }),
  fetchCover: defineMenuAction({
    risk: 'write',
    targets: ['bookmark'],
    labelKey: 'menu_fetchCover',
    icon: 'imageDown',
    itemMenu: {
      // While Fetch Covers is on; for a selection, the web bookmarks in it.
      available: (items, host) => host.canFetchCovers && items.some(isWebBookmark),
      run: (items, host) => host.fetchCovers(items.filter(isWebBookmark)),
    },
  }),
  removeCover: defineMenuAction({
    risk: 'write',
    targets: ['bookmark'],
    labelKey: 'menu_removeCover',
    icon: 'imageOff',
    itemMenu: {
      // Only where a stored cover shows; for a selection, removes each one's cover.
      available: (items, host) => items.some((item) => host.hasCover(item)),
      run: (items, host) => host.removeCovers(items.filter((item) => host.hasCover(item))),
    },
  }),
  delete: defineMenuAction({
    risk: 'destructive',
    targets: ['bookmark', 'folder'],
    labelKey: 'action_delete',
    icon: 'trash',
    itemMenu: { available: allModifiable, run: (items, host) => host.requestDeletion(items) },
    popupMenu: {
      label: (node) => t(isPopupFolder(node) ? 'popup_deleteFolder' : 'popup_deleteBookmark'),
      available: (node, host) => host.canModify(node),
      run: (node, host) => host.requestDeletion(node),
    },
  }),
  sortByName: defineMenuAction({
    risk: 'write',
    targets: ['folder'],
    labelKey: 'menu_sortByName',
    icon: 'sortAZ',
    folderMenu: {
      enabled: (host) => host.canChangeFolder && host.canSort,
      run: (host) => host.sort(),
    },
  }),
  addBookmark: defineMenuAction({
    risk: 'write',
    targets: ['folder'],
    labelKey: 'menu_addBookmark',
    icon: 'bookmarkPlus',
    folderMenu: { enabled: (host) => host.canChangeFolder, run: (host) => host.addBookmark() },
    // The popup saves the page you are on into the folder.
    popupMenu: {
      labelKey: 'popup_addBookmark',
      available: (node, host) => host.canAddTo(node),
      busy: (node, host) => host.isSaving(node),
      run: (node, host) => host.addBookmark(node),
    },
  }),
  addFolder: defineMenuAction({
    risk: 'write',
    targets: ['folder'],
    labelKey: 'menu_addFolder',
    icon: 'folderPlus',
    folderMenu: { enabled: (host) => host.canChangeFolder, run: (host) => host.addFolder() },
    popupMenu: {
      labelKey: 'popup_addFolder',
      available: (node, host) => host.canAddTo(node),
      run: (node, host) => host.addFolder(node),
    },
  }),
  /** Opens a folder and every folder inside it in the popup tree, or closes those inside. */
  expandSubfolders: defineMenuAction({
    risk: 'read',
    targets: ['folder'],
    labelKey: 'popup_expandAllSubfolders',
    icon: 'chevronsDown',
    popupMenu: {
      label: (node, host) =>
        t(
          host.allSubfoldersExpanded(node)
            ? 'popup_collapseAllSubfolders'
            : 'popup_expandAllSubfolders',
        ),
      icon: (node, host) => (host.allSubfoldersExpanded(node) ? 'chevronsUp' : 'chevronsDown'),
      pressed: (node, host) => host.allSubfoldersExpanded(node),
      available: (node, host) => host.hasSubfolders(node),
      run: (node, host) => host.toggleSubfolders(node),
    },
  }),
};
