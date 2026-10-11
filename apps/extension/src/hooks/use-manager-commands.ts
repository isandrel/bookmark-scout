/**
 * The bookmark manager's commands for its menus, after Chrome's command manager: the item-action
 * context for rows and for folders in the tree, and the folder actions (sort by name, add, paste)
 * for the folder shown. Each context reads the page's latest state through a ref, so the objects
 * stay the same between renders and the table's columns are not rebuilt.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

export type ManagerCommandOptions = {
  allData: readonly Bookmark[];
  /** The children of the folder shown. */
  folderItems: readonly Bookmark[];
  /** The folder shown; null is the top level. */
  currentFolderId: string | null;
  /** The title search; sorting waits until it is cleared, as in Chrome. */
  searchQuery: string;
  showDetails: (bookmark: Bookmark) => void;
  edit: (target: BookmarkEditTarget) => void;
  requestDeletion: (items: Bookmark[]) => void;
  showInFolder: (bookmark: Bookmark) => void;
  copyFolderLink: (folderId: string) => void;
  open: (items: Bookmark[], target: BookmarkOpenTarget) => void;
};

async function quoteTitle(title: string) {
  return quoteToastItemTitle(getBookmarkDisplayTitle(title));
}

async function reportClipboard(mode: 'cut' | 'copy', items: Bookmark[]) {
  const one = items.length === 1 ? await quoteTitle(items[0].title) : '';
  const keys =
    mode === 'copy'
      ? { one: 'toast_itemCopied', many: 'toast_itemsCopied' }
      : { one: 'toast_itemCut', many: 'toast_itemsCut' };
  toast.success({
    title: one ? t(keys.one, one) : t(keys.many, String(items.length)),
    ...(mode === 'cut' ? { description: t('toast_cutHint') } : {}),
  });
}

export function useManagerCommands(options: ManagerCommandOptions) {
  const latest = useRef(options);
  latest.current = options;
  // Firefox opens private windows only when the user allowed the extension in them.
  const [canOpenPrivate, setCanOpenPrivate] = useState(import.meta.env.BROWSER !== 'firefox');
  useEffect(() => {
    void canOpenPrivateWindows().then(setCanOpenPrivate);
  }, []);
  const canOpenPrivateRef = useRef(canOpenPrivate);
  canOpenPrivateRef.current = canOpenPrivate;

  return useMemo(() => {
    const byId = () => getManagerItemsById(latest.current.allData);
    const currentFolder = () => {
      const { currentFolderId } = latest.current;
      return currentFolderId ? byId().get(currentFolderId) : undefined;
    };
    // A folder takes new items unless it is the top level or managed by policy.
    const canAddTo = (folder: Bookmark | undefined) =>
      folder?.type === ItemTypeEnum.Folder && !folder.unmodifiable;

    const setClipboard = async (mode: 'cut' | 'copy', items: Bookmark[]) => {
      try {
        const ids = pruneNestedSelection(items, latest.current.allData).map((item) => item.id);
        await setBookmarkClipboard(mode, ids, { toSystem: true });
        await reportClipboard(mode, items);
      } catch (error) {
        toast.error({
          title: t('bookmarks_detailsCopyFailed'),
          description: getErrorMessage(error),
        });
      }
    };

    const pasteInto = async (target: { parentId: string; index?: number }) => {
      try {
        const result = await pasteBookmarks(target);
        if (!result) {
          toast({ title: t('toast_nothingToPaste') });
          return;
        }
        toast.success({
          title: tPlural('toast_pasted', result.pasted),
          ...(result.skipped > 0
            ? { description: t('toast_pasteSkipped', String(result.skipped)) }
            : {}),
        });
      } catch (error) {
        toast.error({ title: t('toast_pasteFailed'), description: getErrorMessage(error) });
      }
    };

    /** Pastes after the last of `items` in the folder shown, else at its end. */
    const pasteNextTo = (items: Bookmark[]) => {
      const folder = currentFolder();
      if (!folder) return;
      const inFolder = items.filter((item) => item.parentId === folder.id);
      const last = Math.max(-1, ...inFolder.map((item) => item.index ?? -1));
      void pasteInto({ parentId: folder.id, ...(last >= 0 ? { index: last + 1 } : {}) });
    };

    const base = {
      showDetails: (bookmark: Bookmark) => latest.current.showDetails(bookmark),
      edit: (bookmark: Bookmark) => latest.current.edit({ mode: 'edit', bookmark }),
      requestDeletion: (items: Bookmark[]) => latest.current.requestDeletion(items),
      reportError: (titleKey: string, error: unknown) =>
        toast.error({ title: t(titleKey), description: getErrorMessage(error) }),
      showInFolder: (bookmark: Bookmark) => latest.current.showInFolder(bookmark),
      copyFolderLink: (folderId: string) => latest.current.copyFolderLink(folderId),
      openableUrls: (items: Bookmark[]) => getOpenableUrls(items, latest.current.allData),
      open: (items: Bookmark[], target: BookmarkOpenTarget) => latest.current.open(items, target),
      cut: (items: Bookmark[]) => void setClipboard('cut', items),
      copy: (items: Bookmark[]) => void setClipboard('copy', items),
    };

    /** Rows of the table and their ⋯ menus. */
    const tableItemContext: BookmarkRowActionContext = {
      ...base,
      get privateWindowsAllowed() {
        return canOpenPrivateRef.current;
      },
      isOutsideOpenFolder: (bookmark) =>
        !latest.current.folderItems.some((item) => item.id === bookmark.id),
      paste: pasteNextTo,
      canPaste: () => hasBookmarkClipboard() && canAddTo(currentFolder()),
    };

    /** Folders in the tree: paste goes into the folder, and there is no Show in folder. */
    const treeItemContext: BookmarkRowActionContext = {
      ...base,
      get privateWindowsAllowed() {
        return canOpenPrivateRef.current;
      },
      isOutsideOpenFolder: () => false,
      paste: (items) => {
        const [folder] = items;
        if (folder) void pasteInto({ parentId: folder.id });
      },
      canPaste: (items) => hasBookmarkClipboard() && items.length === 1 && canAddTo(items[0]),
    };

    const folderContext: FolderActionContext = {
      get canChangeFolder() {
        return canAddTo(currentFolder());
      },
      get canSort() {
        return latest.current.folderItems.length > 1 && latest.current.searchQuery === '';
      },
      get canPaste() {
        return hasBookmarkClipboard();
      },
      sort: () => {
        const folder = currentFolder();
        if (!folder) return;
        void sortBookmarkFolder(folder.id, folder.title).then(
          () => toast.success({ title: t('toast_folderSorted') }),
          (error: unknown) =>
            toast.error({ title: t('toast_sortFailed'), description: getErrorMessage(error) }),
        );
      },
      addBookmark: () => {
        const folder = currentFolder();
        if (folder) latest.current.edit({ mode: 'add', kind: 'bookmark', parentId: folder.id });
      },
      addFolder: () => {
        const folder = currentFolder();
        if (folder) latest.current.edit({ mode: 'add', kind: 'folder', parentId: folder.id });
      },
      paste: () => pasteNextTo([]),
    };

    return { tableItemContext, treeItemContext, folderContext };
  }, []);
}
