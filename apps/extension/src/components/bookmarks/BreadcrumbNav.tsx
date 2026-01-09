/**
 * Breadcrumb navigation for BookmarksPage.
 * Shows the current folder path and allows clicking ancestors.
 */

import { ChevronRight, Home } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { t } from '@/hooks/use-i18n';

interface BreadcrumbItem {
  id: string;
  title: string;
}

interface BreadcrumbNavProps {
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
}

/**
 * Fetches a bookmark node by ID.
 * Reusable utility for bookmark operations.
 */
async function getBookmarkById(
  id: string
): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
  if (!chrome?.bookmarks) return null;

  return new Promise((resolve) => {
    chrome.bookmarks.get(id, (results) => {
      if (chrome.runtime.lastError || results.length === 0) {
        resolve(null);
        return;
      }
      resolve(results[0]);
    });
  });
}

export function BreadcrumbNav({ currentFolderId, onNavigate }: BreadcrumbNavProps) {
  const [path, setPath] = useState<BreadcrumbItem[]>([]);

  // Build the path from root to current folder
  const buildPath = useCallback(async () => {
    if (!currentFolderId) {
      setPath([]);
      return;
    }

    const pathItems: BreadcrumbItem[] = [];
    let nodeId: string | undefined = currentFolderId;

    while (nodeId) {
      const node = await getBookmarkById(nodeId);
      if (!node) break;

      // Skip the root node (id "0")
      if (node.id !== '0') {
        pathItems.unshift({
          id: node.id,
          title: node.title || t('bookmarks_untitled'),
        });
      }
      nodeId = node.parentId;
    }

    setPath(pathItems);
  }, [currentFolderId]);

  useEffect(() => {
    buildPath();
  }, [buildPath]);

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground overflow-x-auto">
      <button
        type="button"
        onClick={() => onNavigate(null)}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted hover:text-foreground transition-colors shrink-0"
      >
        <Home className="h-4 w-4" />
        <span className="hidden sm:inline">{t('bookmarks_root')}</span>
      </button>

      {path.map((item, index) => {
        const isLast = index === path.length - 1;
        return (
          <div key={item.id} className="flex items-center gap-1 shrink-0">
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            {isLast ? (
              <span className="px-2 py-1 font-medium text-foreground truncate max-w-[200px]">
                {item.title}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(item.id)}
                className="px-2 py-1 rounded hover:bg-muted hover:text-foreground transition-colors truncate max-w-[150px]"
              >
                {item.title}
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
