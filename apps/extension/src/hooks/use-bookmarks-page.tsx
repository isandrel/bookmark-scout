/**
 * Hooks for the BookmarksPage component.
 * Extracts navigation, folder mapping, and URL mapping logic.
 */

import { type ComponentType, useCallback, useEffect, useState } from 'react';
import { Folder } from 'lucide-react';
import { getFaviconUrl } from '@/services/bookmarks';
import { type Bookmark, ItemTypeEnum } from '@/components/ui/table/columns';

// Re-export for convenience
export { type Bookmark, ItemTypeEnum } from '@/components/ui/table/columns';

// Utility functions
const formatDate = (timestamp?: number): string => {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString();
};

const truncate = (text?: string, length = 50): string => {
  if (!text) return '';
  return text.length > length ? `${text.slice(0, length)}...` : text;
};

const processNode = (
  node: chrome.bookmarks.BookmarkTreeNode,
  parentId = 'Root',
): Bookmark => {
  const isFolder = node.children !== undefined;
  return {
    type: isFolder ? ItemTypeEnum.Folder : ItemTypeEnum.Link,
    id: node.id,
    parentId: parentId,
    index: node.index,
    title: truncate(node.title, 30),
    url: truncate(node.url, 50),
    dateAdded: formatDate(node.dateAdded),
    dateGroupModified: formatDate(node.dateGroupModified),
    unmodifiable: node.unmodifiable as 'managed',
  };
};

// API functions
async function getTopLevelFolders(): Promise<Bookmark[]> {
  return new Promise((resolve) => {
    if (chrome?.bookmarks) {
      chrome.bookmarks.getTree((nodes) => {
        const topLevelFolders =
          nodes[0].children?.map((node) => processNode(node)) || [];
        resolve(topLevelFolders);
      });
    } else {
      resolve([]);
    }
  });
}

async function getFolderContents(folderId: string): Promise<Bookmark[]> {
  return new Promise((resolve) => {
    if (chrome?.bookmarks) {
      chrome.bookmarks.getTree((nodes) => {
        const findFolder = (
          nodes: chrome.bookmarks.BookmarkTreeNode[],
        ): chrome.bookmarks.BookmarkTreeNode | null => {
          for (const node of nodes) {
            if (node.id === folderId) return node;
            if (node.children) {
              const found = findFolder(node.children);
              if (found) return found;
            }
          }
          return null;
        };

        const targetFolder = findFolder(nodes);
        if (targetFolder?.children) {
          const contents = targetFolder.children.map((node) =>
            processNode(node, folderId),
          );
          resolve(contents);
        } else {
          resolve([]);
        }
      });
    } else {
      resolve([]);
    }
  });
}

/**
 * Hook for bookmark folder navigation.
 * Handles folder state, URL sync, and data fetching.
 */
export function useBookmarkNavigation() {
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [data, setData] = useState<Bookmark[]>([]);
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
      if (currentFolder) {
        const contents = await getFolderContents(currentFolder);
        setData(contents);
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('id', currentFolder);
        window.history.pushState({}, '', newUrl.toString());
      } else {
        const folders = await getTopLevelFolders();
        setData(folders);
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('id');
        window.history.pushState({}, '', newUrl.toString());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bookmarks');
    } finally {
      setIsLoading(false);
    }
  }, [currentFolder]);

  useEffect(() => {
    refreshCurrentFolder();
  }, [refreshCurrentFolder]);

  // Listen for bookmark move events
  useEffect(() => {
    const handleBookmarkMove = (event: CustomEvent) => {
      if (event.detail.parentId === currentFolder) {
        refreshCurrentFolder();
      }
    };

    window.addEventListener('bookmarkMoved', handleBookmarkMove as EventListener);
    return () => {
      window.removeEventListener('bookmarkMoved', handleBookmarkMove as EventListener);
    };
  }, [currentFolder, refreshCurrentFolder]);

  const navigateToFolder = useCallback((folderId: string) => {
    setCurrentFolder(folderId);
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('id', folderId);
    window.history.pushState({}, '', newUrl.toString());
  }, []);

  return {
    currentFolder,
    data,
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
