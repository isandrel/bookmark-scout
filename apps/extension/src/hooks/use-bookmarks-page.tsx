/**
 * Hooks for the BookmarksPage component.
 * Extracts navigation, folder mapping, and URL mapping logic.
 */

import { type ComponentType, useCallback, useEffect, useState } from 'react';
import { Folder } from 'lucide-react';

const processNode = (
  node: chrome.bookmarks.BookmarkTreeNode,
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
    unmodifiable: node.unmodifiable as 'managed',
    ...(isRootFolder ? { isRootFolder } : {}),
  };
};

async function getBookmarkTree(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  if (!chrome?.bookmarks) return [];

  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree((nodes) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(nodes);
      }
    });
  });
}

function flattenBookmarks(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
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
        node.title || t('bookmarks_untitled'),
      ]);
      for (const child of childBookmarks) bookmarks.push(child);
    }
  }
  return bookmarks;
}

/**
 * Hook for bookmark folder navigation.
 * Handles folder state, URL sync, and data fetching.
 */
export function useBookmarkNavigation() {
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [data, setData] = useState<Bookmark[]>([]);
  const [allData, setAllData] = useState<Bookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Handle initial URL parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const folderId = urlParams.get('id');
    if (folderId) {
      setCurrentFolder(folderId);
    }
  }, []);

  // Background refreshes keep the table mounted so filters and pagination survive edits.
  const refreshCurrentFolder = useCallback(async (options: { background?: boolean } = {}) => {
    if (!options.background) setIsLoading(true);
    setError(null);
    try {
      const tree = await getBookmarkTree();
      const root = tree[0];
      const bookmarks = flattenBookmarks(root?.children ?? [], getBookmarkRootIds(tree));
      // Cleanup for bookmarks removed while the extension was not running must never block
      // loading the bookmark list.
      void reconcileStoredBookmarkMetadata(
        bookmarks.filter((bookmark) => Boolean(bookmark.url)).map((bookmark) => bookmark.id),
      ).catch(() => undefined);
      setAllData(bookmarks);
      setData(bookmarks.filter((bookmark) => bookmark.parentId === (currentFolder ?? root?.id)));

      const newUrl = new URL(window.location.href);
      if (currentFolder) {
        newUrl.searchParams.set('id', currentFolder);
      } else {
        newUrl.searchParams.delete('id');
      }
      window.history.pushState({}, '', newUrl.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bookmarks');
    } finally {
      setIsLoading(false);
    }
  }, [currentFolder]);

  useEffect(() => {
    refreshCurrentFolder();
  }, [refreshCurrentFolder]);

  // Refresh both the selected folder and global data after a table move.
  useEffect(() => {
    const handleBookmarkMove = () => refreshCurrentFolder();

    window.addEventListener('bookmarkMoved', handleBookmarkMove);
    return () => {
      window.removeEventListener('bookmarkMoved', handleBookmarkMove);
    };
  }, [refreshCurrentFolder]);

  const navigateToFolder = useCallback((folderId: string | null) => {
    setCurrentFolder(folderId);
    const newUrl = new URL(window.location.href);
    if (folderId) {
      newUrl.searchParams.set('id', folderId);
    } else {
      newUrl.searchParams.delete('id');
    }
    window.history.pushState({}, '', newUrl.toString());
  }, []);

  return {
    currentFolder,
    data,
    allData,
    isLoading,
    error,
    navigateToFolder,
    refreshCurrentFolder,
  };
}

type IconMap = Record<
  string,
  { value: string; label: string; icon: ComponentType<{ className?: string }> }
>;

/**
 * Hook for parent folder ID mapping.
 * Creates a map of folder IDs to their metadata.
 */
export function useParentIdMap(): IconMap {
  const [parentIdMap, setParentIdMap] = useState<IconMap>({});

  useEffect(() => {
    if (chrome?.bookmarks) {
      chrome.bookmarks.getTree((nodes) => {
        const map: IconMap = {};

        const processNode = (node: chrome.bookmarks.BookmarkTreeNode) => {
          map[node.id] = {
            value: node.id,
            label: node.title || 'Untitled',
            icon: Folder,
          };
          node.children?.forEach(processNode);
        };

        nodes.forEach(processNode);
        setParentIdMap(map);
      });
    }
  }, []);

  return parentIdMap;
}

/**
 * Hook for URL/domain mapping.
 * Creates a map of domains to their metadata with favicons.
 */
export function useUrlMap(): IconMap {
  const [urlMap, setUrlMap] = useState<IconMap>({});

  useEffect(() => {
    if (chrome?.bookmarks) {
      chrome.bookmarks.getTree((nodes) => {
        const map: IconMap = {};

        const processNode = (node: chrome.bookmarks.BookmarkTreeNode) => {
          if (node.children) {
            node.children.forEach(processNode);
          } else if (node.url) {
            try {
              const domain = new URL(node.url).hostname.split('.').slice(-2).join('.');
              map[domain] = {
                value: domain,
                label: domain,
                icon: () => (
                  <img
                    src={getFaviconUrl(node.url || '')}
                    alt="favicon"
                    className="w-4 h-4"
                  />
                ),
              };
            } catch {
              // Invalid URL, skip
            }
          }
        };

        nodes.forEach(processNode);
        setUrlMap(map);
      });
    }
  }, []);

  return urlMap;
}
