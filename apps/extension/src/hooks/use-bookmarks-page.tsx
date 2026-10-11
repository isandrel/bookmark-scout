/**
 * Navigation and data loading for the bookmark manager page.
 * The whole tree is loaded once and refreshed on bookmark events; the current folder is
 * derived from it, synced with `?id=` and the browser history.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BookmarkTreeNode } from '@/types';

/** The manager page's query parameter for the open folder: `bookmarks.html?id=<folder id>`. */
export const FOLDER_QUERY_PARAM = 'id';

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

const ROW_FIELDS = [
  'type',
  'parentId',
  'folderPath',
  'index',
  'title',
  'url',
  'dateAdded',
  'dateGroupModified',
  'unmodifiable',
  'isRootFolder',
] as const satisfies readonly (keyof Bookmark)[];

/**
 * Flattens the tree into the manager's rows. Event patches keep unchanged subtrees as the same
 * objects, so their rows are reused as they are, and a row whose values did not change (a folder
 * whose children changed) stays the same object: memoized work keyed on rows can skip it.
 */
function createBookmarkRowsBuilder() {
  const subtreeRows = new WeakMap<BookmarkTreeNode, { folderPath: string; rows: Bookmark[] }>();
  const rowsById = new Map<string, Bookmark>();

  const rowFor = (node: BookmarkTreeNode, folderPath: string, isRootFolder: boolean) => {
    const row = processNode(node, folderPath, isRootFolder);
    const previous = rowsById.get(node.id);
    if (previous && ROW_FIELDS.every((field) => previous[field] === row[field])) return previous;
    rowsById.set(node.id, row);
    return row;
  };

  const collect = (
    node: BookmarkTreeNode,
    folderPath: string,
    childPath: (title: string) => string,
    rootIds: ReadonlySet<string>,
    out: Bookmark[],
  ) => {
    const cached = subtreeRows.get(node);
    if (cached?.folderPath === folderPath) {
      for (const row of cached.rows) out.push(row);
      return;
    }
    const rows = [rowFor(node, folderPath, isPermanentBookmarkFolder(node, rootIds))];
    if (node.children) {
      const path = childPath(getBookmarkDisplayTitle(node.title.trim()));
      const below = (title: string) => `${path}${FOLDER_PATH_SEPARATOR}${title}`;
      for (const child of node.children) collect(child, path, below, rootIds, rows);
    }
    subtreeRows.set(node, { folderPath, rows });
    for (const row of rows) out.push(row);
  };

  return (tree: readonly BookmarkTreeNode[]): Bookmark[] => {
    const rootIds = getBookmarkRootIds(tree);
    const rootLabel = t('bookmarks_root');
    const rows: Bookmark[] = [];
    for (const node of tree[0]?.children ?? []) {
      collect(node, rootLabel, (title) => title, rootIds, rows);
    }
    return rows;
  };
}

/** Table page saved on a history entry, so Back returns to the page that was open. */
export function readPageIndexFromHistory(state: unknown): number {
  const pageIndex = (state as { pageIndex?: unknown } | null)?.pageIndex;
  return typeof pageIndex === 'number' && Number.isInteger(pageIndex) && pageIndex > 0
    ? pageIndex
    : 0;
}

function readFolderIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get(FOLDER_QUERY_PARAM) || null;
}

function folderUrl(folderId: string | null): string {
  const url = new URL(window.location.href);
  if (folderId) {
    url.searchParams.set(FOLDER_QUERY_PARAM, folderId);
  } else {
    url.searchParams.delete(FOLDER_QUERY_PARAM);
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
  // The table page to open for the current folder: 0 for new navigation, or the page saved on
  // the history entry when going Back or Forward.
  const [folderPageIndex, setFolderPageIndex] = useState(() =>
    readPageIndexFromHistory(window.history.state),
  );

  const currentFolderRef = useRef(currentFolder);
  const itemsRef = useRef<Bookmark[]>([]);
  const rootIdRef = useRef<string | undefined>(undefined);
  const hasLoadedRef = useRef(false);
  const treeRef = useRef<readonly BookmarkTreeNode[] | undefined>(undefined);
  const [buildRows] = useState(createBookmarkRowsBuilder);
  // Rows of the previous tree let a deleted folder fall back to its nearest ancestor.
  const previousItemsRef = useRef<Bookmark[]>([]);
  const previousParentIds = useMemo(
    () => ({
      get: (id: string) => getManagerItemsById(previousItemsRef.current).get(id)?.parentId,
    }),
    [],
  );

  const showFolder = useCallback(
    (requestedId: string | null, history: 'push' | 'replace' | 'none') => {
      const resolution = resolveManagerFolder(
        requestedId,
        itemsRef.current,
        rootIdRef.current,
        previousParentIds,
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
    [previousParentIds],
  );

  const setTree = useCallback(
    (tree: readonly BookmarkTreeNode[]) => {
      const bookmarks = buildRows(tree);
      treeRef.current = tree;
      previousItemsRef.current = itemsRef.current;
      itemsRef.current = bookmarks;
      rootIdRef.current = tree[0]?.id;
      setAllData(bookmarks);
      setRootId(tree[0]?.id);
      showFolder(currentFolderRef.current, 'none');
      hasLoadedRef.current = true;
    },
    [buildRows, showFolder],
  );
  const setTreeRef = useRef(setTree);
  setTreeRef.current = setTree;

  // Reloads and event patches run one at a time; see createBookmarkTreeSync.
  const [sync] = useState(() =>
    createBookmarkTreeSync({
      getTree: () => treeRef.current,
      setTree: (tree) => setTreeRef.current(tree),
      reload: async () => {
        const isInitialLoad = !hasLoadedRef.current;
        setError(null);
        try {
          setTreeRef.current(await fetchBookmarkTree());
          if (isInitialLoad) {
            // Cleanup for bookmarks removed while the extension was not running must never
            // block loading. It runs only once so it cannot race an undo re-keying metadata.
            void reconcileStoredBookmarkMetadata(
              itemsRef.current.filter((bookmark) => Boolean(bookmark.url)).map(({ id }) => id),
            ).catch(() => undefined);
          }
        } catch (err) {
          setError(getErrorMessage(err, 'error_failedToLoadBookmarks'));
        } finally {
          setIsLoading(false);
        }
      },
    }),
  );
  // Reads the whole tree again; changes that arrive as events are patched in instead.
  const refresh = sync.reload;

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Changes from this page, other extension pages, the browser UI, and sync all land here.
  useBookmarkEvents(sync.applyBatch);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      setFolderPageIndex(readPageIndexFromHistory(event.state));
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
      setFolderPageIndex(0);
      showFolder(folderId, 'push');
    },
    [showFolder],
  );

  /** Saves the open table page on the current history entry. */
  const rememberPageIndex = useCallback((pageIndex: number) => {
    const state: unknown = window.history.state;
    if (readPageIndexFromHistory(state) === pageIndex) return;
    window.history.replaceState({ ...(state as object | null), pageIndex }, '');
  }, []);

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
    folderPageIndex,
    rememberPageIndex,
    refresh,
  };
}
