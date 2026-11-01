/**
 * The bookmark manager's commands for its menus, after Chrome's command manager: what the item
 * menus' actions may ask the page for rows and for folders in the tree, and what the folder menus'
 * actions (sort by name, add, paste) may ask for the folder shown. The actions themselves are the
 * registry's (`services/actions.ts`). Each context reads the page's latest state through a ref, so the objects
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
  preview: (bookmark: Bookmark) => void;
  edit: (target: BookmarkEditTarget) => void;
  requestDeletion: (items: Bookmark[]) => void;
  showInFolder: (bookmark: Bookmark) => void;
  copyFolderLink: (folderId: string) => void;
  open: (items: Bookmark[], target: BookmarkOpenTarget) => void;
  /** Whether Fetch Covers is on (`useCoverFetch`). */
  canFetchCovers: boolean;
  /** Fetch Covers on exactly these bookmarks (`useCoverFetch`). */
  fetchCovers: (items: readonly Bookmark[]) => void;
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
  // Some browsers (Firefox) open private windows only when the user allowed the extension in them.
  const [canOpenPrivate, setCanOpenPrivate] = useState(
    !browserProfile().privateWindowsNeedPermission,
  );
  useEffect(() => {
    void canOpenPrivateWindows().then(setCanOpenPrivate);
  }, []);
  const canOpenPrivateRef = useRef(canOpenPrivate);
  canOpenPrivateRef.current = canOpenPrivate;
  // Which bookmarks have a stored cover, for Remove cover; the menus read it when they open.
  const covered = useCoveredBookmarks();
  const coveredRef = useRef(covered);
  coveredRef.current = covered;
  // What Cut or Copy holds, from this tab or another; the menus read it when they open.
  const { value: clipboard } = useStoredValue(bookmarkClipboardValue);
  const hasClipboardRef = useRef(clipboard !== null);
  hasClipboardRef.current = clipboard !== null;

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

    const pasteInto = async (target: { parentId: string; index?: number }, systemText?: string) => {
      try {
        const result = await pasteBookmarks(target, systemText);
        if (!result) {
          toast({ title: t('toast_nothingToPaste') });
          return;
        }
        if (result.pasted === 0) {
          // Nothing went in: say why instead of reporting "Pasted 0 items" as a success.
          toast({
            title: t('toast_nothingPasted'),
            description: t('toast_pasteSkipped', String(result.skipped)),
          });
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
    const pasteNextTo = (items: Bookmark[], systemText?: string) => {
      const folder = currentFolder();
      if (!canAddTo(folder) || !folder) return;
      const inFolder = items.filter((item) => item.parentId === folder.id);
      const last = Math.max(-1, ...inFolder.map((item) => item.index ?? -1));
      void pasteInto(
        { parentId: folder.id, ...(last >= 0 ? { index: last + 1 } : {}) },
        systemText,
      );
    };

    /**
     * Ctrl/Cmd+C, X, and V, as the browser's copy, cut, and paste events (Chrome's manager does
     * the same): the event carries the clipboard, so no clipboard permission is needed. Copy and
     * cut write the rows' URLs into it; paste pastes this page's items, or the URLs another app
     * put there.
     */
    const clipboardEvents = {
      copyOrCut: (event: ClipboardEvent, rows: Bookmark[]) => {
        const mode = event.type === 'cut' ? 'cut' : 'copy';
        if (rows.length === 0 || (mode === 'cut' && !rows.every(isModifiableBookmark))) return;
        if (mode === 'copy' && rows.some((row) => row.isRootFolder)) return;
        event.preventDefault();
        const { text, html } = bookmarkClipboardData(rows);
        event.clipboardData?.setData(MIME.plainText, text);
        event.clipboardData?.setData(MIME.html, html);
        const ids = pruneNestedSelection(rows, latest.current.allData).map((item) => item.id);
        void setBookmarkClipboard(mode, ids, { systemText: text }).then(
          () => reportClipboard(mode, rows),
          (error: unknown) =>
            toast.error({
              title: t('bookmarks_detailsCopyFailed'),
              description: getErrorMessage(error),
            }),
        );
      },
      paste: (event: ClipboardEvent, rows: Bookmark[]) => {
        if (!canAddTo(currentFolder())) return;
        event.preventDefault();
        pasteNextTo(rows, event.clipboardData?.getData(MIME.plainText) ?? undefined);
      },
      /** Paste on a folder in the tree: at the end of that folder. */
      pasteInto: (event: ClipboardEvent, folder: Bookmark) => {
        if (!canAddTo(folder)) return;
        event.preventDefault();
        void pasteInto(
          { parentId: folder.id },
          event.clipboardData?.getData(MIME.plainText) ?? undefined,
        );
      },
    };

    const base = {
      showDetails: (bookmark: Bookmark) => latest.current.showDetails(bookmark),
      preview: (bookmark: Bookmark) => latest.current.preview(bookmark),
      edit: (bookmark: Bookmark) => latest.current.edit({ mode: 'edit', bookmark }),
      requestDeletion: (items: Bookmark[]) => latest.current.requestDeletion(items),
      reportError: (titleKey: string, error: unknown) =>
        toast.error({ title: t(titleKey), description: getErrorMessage(error) }),
      showInFolder: (bookmark: Bookmark) => latest.current.showInFolder(bookmark),
      copyFolderLink: (folderId: string) => latest.current.copyFolderLink(folderId),
      copyId: (id: string) =>
        void navigator.clipboard.writeText(id).then(
          () => toast.success({ title: t('toast_idCopied') }),
          (error: unknown) =>
            toast.error({
              title: t('bookmarks_detailsCopyFailed'),
              description: getErrorMessage(error),
            }),
        ),
      openableUrls: (items: readonly Bookmark[]) => getOpenableUrls(items, latest.current.allData),
      open: (items: Bookmark[], target: BookmarkOpenTarget) => latest.current.open(items, target),
      cut: (items: Bookmark[]) => void setClipboard('cut', items),
      copy: (items: Bookmark[]) => void setClipboard('copy', items),
      hasCover: (bookmark: Bookmark) => hasStoredCover(coveredRef.current, bookmark),
      removeCovers: (items: Bookmark[]) => void removeCoversWithUndo(items),
      bookmarksWithin: (items: readonly Bookmark[]) =>
        getBookmarksWithin(items, latest.current.allData),
      fetchCovers: (items: Bookmark[]) => latest.current.fetchCovers(items),
    };

    /** Rows of the table and their ⋯ menus. */
    const tableItemHost: ActionItemHost = {
      ...base,
      get privateWindowsAllowed() {
        return canOpenPrivateRef.current;
      },
      get canFetchCovers() {
        return latest.current.canFetchCovers;
      },
      isOutsideOpenFolder: (bookmark) =>
        !latest.current.folderItems.some((item) => item.id === bookmark.id),
      paste: (items) => pasteNextTo(items),
      canPaste: () => hasClipboardRef.current && canAddTo(currentFolder()),
    };

    /** Folders in the tree: paste goes into the folder, and there is no Show in folder. */
    const treeItemHost: ActionItemHost = {
      ...base,
      get privateWindowsAllowed() {
        return canOpenPrivateRef.current;
      },
      get canFetchCovers() {
        return latest.current.canFetchCovers;
      },
      isOutsideOpenFolder: () => false,
      paste: (items) => {
        const [folder] = items;
        if (folder) void pasteInto({ parentId: folder.id });
      },
      canPaste: (items) => hasClipboardRef.current && items.length === 1 && canAddTo(items[0]),
    };

    const folderHost: ActionFolderHost = {
      get canChangeFolder() {
        return canAddTo(currentFolder());
      },
      get canSort() {
        return latest.current.folderItems.length > 1 && latest.current.searchQuery === '';
      },
      get canPaste() {
        return hasClipboardRef.current;
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

    return { tableItemHost, treeItemHost, folderHost, clipboardEvents };
  }, []);
}
