import { Folder } from 'lucide-react';
import { type ComponentType, useCallback, useEffect, useState } from 'react';
import { type Bookmark, columns, ItemTypeEnum } from '../ui/table/columns';
import { DataTable } from '../ui/table/data-table';

function getFaviconUrl(pageUrl: string) {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', '16'); // You can adjust the size as needed
  return url.toString();
}

const Favicon: ComponentType<{ className?: string }> = ({ className }) => (
  <img src={className} alt="favicon" className="w-4 h-4" />
);

const formatDate = (timestamp?: number) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleString();
};

const truncate = (text?: string, length = 50) => {
  if (!text) return '';
  return text.length > length ? text.slice(0, length) + '...' : text;
};

const processNode = (node: chrome.bookmarks.BookmarkTreeNode, parentId = 'Root'): Bookmark => {
  // A node is a folder if it has children, regardless of whether it has a URL
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

async function getTopLevelFolders(): Promise<Bookmark[]> {
  return new Promise((resolve) => {
    if (chrome && chrome.bookmarks) {
      chrome.bookmarks.getTree((nodes) => {
        // Filter out the root node and only process the actual top-level folders
        const topLevelFolders = nodes[0].children?.map((node) => processNode(node)) || [];
        resolve(topLevelFolders);
      });
    } else {
      resolve([]);
    }
  });
}

async function getFolderContents(folderId: string): Promise<Bookmark[]> {
  return new Promise((resolve) => {
    if (chrome && chrome.bookmarks) {
      chrome.bookmarks.getTree((nodes) => {
        // Find the target folder in the tree
        const findFolder = (
          nodes: chrome.bookmarks.BookmarkTreeNode[],
        ): chrome.bookmarks.BookmarkTreeNode | null => {
          for (const node of nodes) {
            if (node.id === folderId) {
              return node;
            }
            if (node.children) {
              const found = findFolder(node.children);
              if (found) return found;
            }
          }
          return null;
        };

        const targetFolder = findFolder(nodes);
        if (targetFolder && targetFolder.children) {
          const contents = targetFolder.children.map((node) => processNode(node, folderId));
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

export const parentIdMap: Record<
  string,
  { value: string; label: string; icon: ComponentType<{ className?: string }> }
> = {};

export const useParentIdMap = () => {
  const [parentIdMapState, setParentIdMap] = useState(parentIdMap);

  useEffect(() => {
    if (chrome && chrome.bookmarks) {
      chrome.bookmarks.getTree((nodes) => {
        const map: Record<
          string,
          { value: string; label: string; icon: ComponentType<{ className?: string }> }
        > = {};

        const processNode = (node: chrome.bookmarks.BookmarkTreeNode, _parentId = 'Root') => {
          map[node.id] = {
            value: node.id,
            label: node.title || 'Untitled',
            icon: Folder, // Generate favicon
          };

          if (node.children) {
            node.children.forEach((child) => processNode(child, node.id));
          }
        };

        nodes.forEach((node) => processNode(node));
        setParentIdMap(map);
      });
    }
  }, []);

  return parentIdMapState;
};

export const urlMap: Record<
  string,
  { value: string; label: string; icon: ComponentType<{ className?: string }> }
> = {};

export const useUrlMap = () => {
  const [urlMapState, setUrlMap] = useState(urlMap);

  useEffect(() => {
    if (chrome && chrome.bookmarks) {
      chrome.bookmarks.getTree((nodes) => {
        const map: Record<
          string,
          { value: string; label: string; icon: ComponentType<{ className?: string }> }
        > = {};

        const processNode = (node: chrome.bookmarks.BookmarkTreeNode) => {
          if (node.children) {
            node.children.forEach((child) => processNode(child));
          } else if (node.url) {
            const domain = new URL(node.url).hostname.split('.').slice(-2).join('.');
            map[domain] = {
              value: domain,
              label: domain,
              icon: () => <Favicon className={getFaviconUrl(node.url || '')} />, // Generate favicon
            };
          }
        };

        nodes.forEach((node) => processNode(node));
        setUrlMap(map);
      });
    }
  }, []);

  return urlMapState;
};

export default function BookmarksPage() {
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
        // Update URL when folder changes
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('id', currentFolder);
        window.history.pushState({}, '', newUrl.toString());
      } else {
        const folders = await getTopLevelFolders();
        setData(folders);
        // Remove id parameter when at root
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

  if (error) {
    return (
      <div className="flex h-[450px] w-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-destructive">Error</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[450px] w-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold">Loading...</h2>
          <p className="text-sm text-muted-foreground">Please wait while we load your bookmarks</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <DataTable
        columns={columns}
        data={data}
        rowClassName={(row: Bookmark) => {
          const baseClass = 'cursor-pointer hover:bg-muted/50';
          const folderClass =
            row.type === ItemTypeEnum.Folder ? 'bg-muted/50 hover:bg-muted/70' : '';
          return `${baseClass} ${folderClass}`;
        }}
        onRowClick={(row: Bookmark) => {
          if (row.type === ItemTypeEnum.Folder) {
            setCurrentFolder(row.id);
            // Update URL immediately when clicking a folder
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('id', row.id);
            window.history.pushState({}, '', newUrl.toString());
          }
        }}
        currentFolderId={currentFolder || undefined}
      />
    </div>
  );
}
