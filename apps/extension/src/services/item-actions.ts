/**
 * The actions the bookmark manager's menus offer, after Chrome's manager: on items (a row's ⋯
 * menu, the right-click menus on rows and on folders in the tree) and on the folder shown (the
 * header's Organize menu and the right-click menu on the table's empty space). They are entries
 * of the one action registry (`actions.ts`), like the actions AI calls; which menu shows which,
 * in what order and sections, is `config/ui/actions.toml` (`action-menus.ts`). Each entry's
 * `itemMenu` or `folderMenu` says what it does there through the page (`ActionItemHost`,
 * `ActionFolderHost`), so a menu needs no code of its own per action.
 *
 * No React: icons are names (`ActionIconName`) the menus map to components.
 */

const single = (items: readonly Bookmark[]) => (items.length === 1 ? items[0] : undefined);
const isFolderItem = (item: Bookmark | undefined) => item?.type === ItemTypeEnum.Folder;
const allModifiable = (items: readonly Bookmark[]) =>
  items.length > 0 && items.every((item) => isModifiableBookmark(item));
const canOpen = (items: readonly Bookmark[], host: ActionItemHost) =>
  host.openableUrls(items).length > 0;

/** "Open in new tab" for one bookmark, "Open all (3)" for several or a folder, as in Chrome. */
function openLabel(one: MessageKey, many: MessageKey) {
  return (items: readonly Bookmark[], host: ActionItemHost) => {
    const bookmark = single(items);
    if (bookmark && !isFolderItem(bookmark)) return t(one);
    return t(many, String(host.openableUrls(items).length));
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

export const ITEM_ACTIONS = {
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
      available: (items) => single(items) !== undefined && allModifiable(items),
      run: (items, host) => host.edit(items[0]),
    },
  }),
  viewDetails: defineMenuAction({
    risk: 'read',
    targets: ['bookmark', 'folder'],
    labelKey: 'bookmarks_viewDetails',
    icon: 'info',
    itemMenu: {
      available: (items) => single(items) !== undefined,
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
      run: (items) => navigator.clipboard.writeText(items[0].id),
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
  }),
  delete: defineMenuAction({
    risk: 'destructive',
    targets: ['bookmark', 'folder'],
    labelKey: 'action_delete',
    icon: 'trash',
    itemMenu: { available: allModifiable, run: (items, host) => host.requestDeletion(items) },
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
  }),
  addFolder: defineMenuAction({
    risk: 'write',
    targets: ['folder'],
    labelKey: 'menu_addFolder',
    icon: 'folderPlus',
    folderMenu: { enabled: (host) => host.canChangeFolder, run: (host) => host.addFolder() },
  }),
};
