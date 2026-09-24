/**
 * Hooks for the BookmarksPage component.
 * Extracts navigation, folder mapping, and URL mapping logic.
 */

import { type ComponentType, useCallback, useEffect, useState } from 'react';
import { Folder } from 'lucide-react';

const processNode = (node: Browser.bookmarks.BookmarkTreeNode, folderPath: string): Bookmark => {
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
  };
};

async function getBookmarkTree(): Promise<Browser.bookmarks.BookmarkTreeNode[]> {
  if (!browser?.bookmarks) return [];
  return browser.bookmarks.getTree();
}

function flattenBookmarks(
  nodes: Browser.bookmarks.BookmarkTreeNode[],
  ancestorTitles: string[] = [],
): Bookmark[] {
  const bookmarks: Bookmark[] = [];
  for (const node of nodes) {
    const folderPath = ancestorTitles.length ? ancestorTitles.join(' / ') : t('bookmarks_root');
    bookmarks.push(processNode(node, folderPath));
    if (node.children) {
      const childBookmarks = flattenBookmarks(node.children, [
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

  const refreshCurrentFolder = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const tree = await getBookmarkTree();
      const root = tree[0];
      const bookmarks = flattenBookmarks(root?.children ?? []);
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
    const load = async () => {
      const nodes = await getBookmarkTree();
      const map: IconMap = {};

      const processNode = (node: Browser.bookmarks.BookmarkTreeNode) => {
        map[node.id] = {
          value: node.id,
          label: node.title || 'Untitled',
          icon: Folder,
        };
        node.children?.forEach(processNode);
      };

      nodes.forEach(processNode);
      setParentIdMap(map);
    };

    load().catch((error) => console.error('Failed to build bookmark folder map:', error));
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
    const load = async () => {
      const nodes = await getBookmarkTree();
      const map: IconMap = {};

      const processNode = (node: Browser.bookmarks.BookmarkTreeNode) => {
        if (node.children) {
          node.children.forEach(processNode);
        } else if (node.url) {
          try {
            const domain = new URL(node.url).hostname.split('.').slice(-2).join('.');
            map[domain] = {
              value: domain,
              label: domain,
              icon: () => (
                <img src={getFaviconUrl(node.url || '')} alt="favicon" className="w-4 h-4" />
              ),
            };
          } catch {
            // Invalid URL, skip
          }
        }
      };

      nodes.forEach(processNode);
      setUrlMap(map);
    };

    load().catch((error) => console.error('Failed to build bookmark domain map:', error));
  }, []);

  return urlMap;
}
