/**
 * Hook for managing bookmark tree state.
 * Handles fetching, caching, and error/loading states.
 */

import { useCallback, useEffect, useState } from 'react';
import { fetchBookmarkTree } from '@/services';
import type { BookmarkTreeNode } from '@/types';

interface UseBookmarksReturn {
  /** The full bookmark tree */
  folders: BookmarkTreeNode[];
  /** Whether bookmarks are loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Refresh the bookmark tree */
  refresh: () => Promise<void>;
  /** Update folders directly (for filtered views) */
  setFolders: React.Dispatch<React.SetStateAction<BookmarkTreeNode[]>>;
}

export function useBookmarks(): UseBookmarksReturn {
  const [folders, setFolders] = useState<BookmarkTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchBookmarkTree();
      setFolders(data);
    } catch (err) {
      console.error('Error fetching bookmarks:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch bookmarks');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    folders,
    isLoading,
    error,
    refresh,
    setFolders,
  };
}
