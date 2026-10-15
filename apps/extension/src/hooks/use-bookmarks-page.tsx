/**
 * Navigation and data loading for the bookmark manager page.
 * The whole tree is loaded once and refreshed on bookmark events; the current folder is
 * derived from it. The folder and the title search are synced with the address (`?id=` and
 * `?q=`, see `lib/manager-url.ts`) and the browser history.
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
    ...(isRootFolder
      ? {
          isRootFolder,
          ...(node.folderType ? { folderType: node.folderType } : {}),
          ...(node.syncing !== undefined ? { syncing: node.syncing } : {}),
        }
      : {}),
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
  'folderType',
  'syncing',
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

function readLocation(): ManagerLocation {
  return readManagerLocation(window.location.search);
}

/**
 * Whether the page was opened without a folder (`bookmarks.html`, `chrome://bookmarks`), so it
 * shows the bookmarks bar, as the browser's own manager does. A history entry this page wrote
 * keeps its folder: the top level ("Bookmarks" in the path) reloads as the top level.
 */
function opensOnBookmarksBar(): boolean {
  const state: unknown = window.history.state;
  const writtenByPage = typeof state === 'object' && state !== null && 'folderId' in state;
  return readLocation().folderId === null && !writtenByPage;
}

/**
 * Writes the address for `next` to history: a new entry, the current one replaced, or (`sync`)
 * the current one corrected only when it differs.
 */
function writeHistory(next: ManagerLocation, write: HistoryWrite | 'sync') {
  const url = buildManagerHistoryUrl(window.location, next);
  const state = { folderId: next.folderId };
  if (write === 'push') {
    window.history.pushState(state, '', url);
  } else if (
    write === 'replace' ||
    new URL(url, window.location.href).href !== window.location.href
  ) {
    window.history.replaceState(state, '', url);
  }
}

export type NavigateOptions = {
  /** Clears the title search too, in the same history entry (Show in folder). */
  clearSearch?: boolean;
};

const noticeKeys = {
  missing: 'bookmarks_folderUnavailable',
  'not-folder': 'bookmarks_folderNotAFolder',
} as const;

/**
 * Hook for bookmark folder navigation and the title search in the address.
 * Folder navigation adds exactly one history entry; refreshes, edits, and fallbacks from
 * missing folders replace the current entry instead. Search changes follow
 * `createSearchHistoryDwell`: one entry per burst of typing.
 */
export function useBookmarkNavigation() {
  const [currentFolder, setCurrentFolder] = useState<string | null>(() => readLocation().folderId);
  const [searchQuery, setSearchQueryState] = useState(() => readLocation().query);
  const searchQueryRef = useRef(searchQuery);
  const [searchHistoryDwell] = useState(() => createSearchHistoryDwell());
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
  const [opensOnBar] = useState(opensOnBookmarksBar);
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
    (requestedId: string | null, history: 'push' | 'none') => {
      // Links from Chrome 154 to 156 name the fixed folders by UUID.
      const alias =
        requestedId === null
          ? undefined
          : resolveManagerFolderAlias(requestedId, treeRef.current?.[0]?.children ?? []);
      const resolution = resolveManagerFolder(
        alias === undefined ? requestedId : alias,
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
      // Anything else (a fallback, a UUID link, a deleted folder) corrects the current entry.
      const push = history === 'push' && changed;
      writeHistory({ folderId, query: searchQueryRef.current }, push ? 'push' : 'sync');
      // A search set right after (a saved search) joins this entry instead of adding one.
      if (push) searchHistoryDwell();
    },
    [previousParentIds, searchHistoryDwell],
  );

  /** Sets the title search and writes it to the address, one entry per burst of typing. */
  const setSearchQuery = useCallback(
    (query: string) => {
      if (query === searchQueryRef.current) return;
      searchQueryRef.current = query;
      setSearchQueryState(query);
      writeHistory({ folderId: currentFolderRef.current, query }, searchHistoryDwell());
    },
    [searchHistoryDwell],
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
      // The first load of a page opened without a folder shows the bookmarks bar; the address
      // then names it, so Back and reload keep it.
      if (!hasLoadedRef.current && opensOnBar && currentFolderRef.current === null) {
        currentFolderRef.current = findBookmarksBarFolder(tree)?.id ?? null;
      }
      showFolder(currentFolderRef.current, 'none');
      hasLoadedRef.current = true;
    },
    [buildRows, opensOnBar, showFolder],
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
      const { folderId, query } = readLocation();
      searchQueryRef.current = query;
      setSearchQueryState(query);
      if (!hasLoadedRef.current) {
        // Resolved against the tree once the first load finishes.
        currentFolderRef.current = folderId;
        setCurrentFolder(folderId);
        return;
      }
      showFolder(folderId, 'none');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showFolder]);

  const navigateToFolder = useCallback(
    (folderId: string | null, { clearSearch = false }: NavigateOptions = {}) => {
      const clearsSearch = clearSearch && searchQueryRef.current !== '';
      if (folderId === currentFolderRef.current && !clearsSearch) return;
      setFolderPageIndex(0);
      if (clearsSearch) {
        searchQueryRef.current = '';
        setSearchQueryState('');
      }
      if (folderId === currentFolderRef.current) {
        writeHistory({ folderId, query: '' }, 'push');
        return;
      }
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
    /** The browser's root folder: `?id=` with it opens the top level. */
    rootId,
    data,
    allData,
    isLoading,
    error,
    notice,
    dismissNotice: useCallback(() => setNotice(null), []),
    navigateToFolder,
    searchQuery,
    setSearchQuery,
    folderPageIndex,
    rememberPageIndex,
    refresh,
  };
}
