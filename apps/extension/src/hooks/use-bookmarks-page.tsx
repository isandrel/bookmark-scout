/**
 * Navigation and data loading for the bookmark manager page.
 * The whole tree is loaded once and refreshed on bookmark events; the current folder is
 * derived from it, synced with `?id=` and the browser history.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BookmarkTreeNode } from '@/types';

const processNode = (
  node: BookmarkTreeNode,
  folderPath: string,
  isRootFolder: boolean,
): Bookmark => {
  const isFolder = node.children !== undefined;
  return {
    type: isFolder ? ItemTypeEnum.Folder : ItemTypeEnum.Link,
    id: node.id,
    parentId: node.parentId,
    folderPath,
    index: node.index,
    title: node.title,
    url: node.url,
    dateAdded: node.dateAdded,
    dateGroupModified: node.dateGroupModified,
    unmodifiable: node.unmodifiable,
    ...(isRootFolder ? { isRootFolder } : {}),
  };
};

function flattenBookmarks(
  nodes: readonly BookmarkTreeNode[],
  rootIds: ReadonlySet<string>,
  ancestorTitles: string[] = [],
): Bookmark[] {
  const bookmarks: Bookmark[] = [];
  for (const node of nodes) {
    const folderPath = ancestorTitles.length ? ancestorTitles.join(' / ') : t('bookmarks_root');
    bookmarks.push(processNode(node, folderPath, isPermanentBookmarkFolder(node, rootIds)));
    if (node.children) {
      const childBookmarks = flattenBookmarks(node.children, rootIds, [
        ...ancestorTitles,
        node.title.trim() || t('bookmarks_untitled'),
      ]);
      for (const child of childBookmarks) bookmarks.push(child);
    }
  }
  return bookmarks;
}

function readFolderIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('id') || null;
}

function folderUrl(folderId: string | null): string {
  const url = new URL(window.location.href);
  if (folderId) {
    url.searchParams.set('id', folderId);
  } else {
    url.searchParams.delete('id');
  }
  return url.toString();
}

const noticeKeys = {
  missing: 'bookmarks_folderUnavailable',
  'not-folder': 'bookmarks_folderNotAFolder',
} as const;

/**
 * Hook for bookmark folder navigation.
 * Folder navigation adds exactly one history entry; refreshes, edits, and fallbacks from
 * missing folders replace the current entry instead.
 */
export function useBookmarkNavigation() {
  const [currentFolder, setCurrentFolder] = useState<string | null>(readFolderIdFromUrl);
  const [allData, setAllData] = useState<Bookmark[]>([]);
  const [rootId, setRootId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currentFolderRef = useRef(currentFolder);
  const itemsRef = useRef<Bookmark[]>([]);
  const rootIdRef = useRef<string | undefined>(undefined);
  const hasLoadedRef = useRef(false);
  // Parents seen in the previous load let a deleted folder fall back to its nearest ancestor.
  const previousParentsRef = useRef(new Map<string, string | undefined>());

  const showFolder = useCallback(
    (requestedId: string | null, history: 'push' | 'replace' | 'none') => {
      const resolution = resolveManagerFolder(
        requestedId,
        itemsRef.current,
        rootIdRef.current,
        previousParentsRef.current,
      );
      const folderId = resolution.folderId;
      if (resolution.status !== 'ok') {
        setNotice(t(noticeKeys[resolution.status]));
      } else if (history === 'push') {
        setNotice(null);
      }

      const changed = folderId !== currentFolderRef.current;
      currentFolderRef.current = folderId;
      setCurrentFolder(folderId);
      if (history === 'push' && changed) {
        window.history.pushState({ folderId }, '', folderUrl(folderId));
      } else if (resolution.status !== 'ok' || (history === 'replace' && changed)) {
        window.history.replaceState({ folderId }, '', folderUrl(folderId));
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    const isInitialLoad = !hasLoadedRef.current;
    setError(null);
    try {
      const tree = await fetchBookmarkTree();
      const root = tree[0];
      const bookmarks = flattenBookmarks(root?.children ?? [], getBookmarkRootIds(tree));
      if (isInitialLoad) {
        // Cleanup for bookmarks removed while the extension was not running must never block
        // loading. It runs only once so it cannot race an undo that is re-keying metadata.
        void reconcileStoredBookmarkMetadata(
          bookmarks.filter((bookmark) => Boolean(bookmark.url)).map((bookmark) => bookmark.id),
        ).catch(() => undefined);
      }

      itemsRef.current = bookmarks;
      rootIdRef.current = root?.id;
      setAllData(bookmarks);
      setRootId(root?.id);
      showFolder(currentFolderRef.current, 'none');
      previousParentsRef.current = new Map(bookmarks.map((item) => [item.id, item.parentId]));
      hasLoadedRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bookmarks');
    } finally {
      setIsLoading(false);
    }
  }, [showFolder]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Changes from this page, other extension pages, the browser UI, and sync all land here.
  useBookmarkEvents(refresh);

  useEffect(() => {
    const handlePopState = () => {
      if (!hasLoadedRef.current) {
        // Resolved against the tree once the first load finishes.
        currentFolderRef.current = readFolderIdFromUrl();
        setCurrentFolder(currentFolderRef.current);
        return;
      }
      showFolder(readFolderIdFromUrl(), 'none');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showFolder]);

  const navigateToFolder = useCallback(
    (folderId: string | null) => {
      if (folderId === currentFolderRef.current) return;
      showFolder(folderId, 'push');
    },
    [showFolder],
  );

  const data = useMemo(
    () => allData.filter((bookmark) => bookmark.parentId === (currentFolder ?? rootId)),
    [allData, currentFolder, rootId],
  );

  return {
    currentFolder,
    data,
    allData,
    isLoading,
    error,
    notice,
    dismissNotice: useCallback(() => setNotice(null), []),
    navigateToFolder,
    refresh,
  };
}
