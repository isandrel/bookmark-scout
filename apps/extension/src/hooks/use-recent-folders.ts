/**
 * React hook over `lib/recent-folders-storage.ts`, which stays free of React for the background.
 */

import { useEffect, useState } from 'react';

/**
 * Live recent folders for React. The list is pruned against the bookmark tree once on mount,
 * and stays loading until then, so deleted folders never flash.
 */
export function useRecentFolders(): { recentFolders: RecentFolder[]; isLoading: boolean } {
  const { value: recentFolders, isLoading } = useStoredValue(recentFoldersValue);
  const [isReconciled, setIsReconciled] = useState(false);

  useEffect(() => {
    let active = true;
    void getRecentFolders().finally(() => {
      if (active) setIsReconciled(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return { recentFolders, isLoading: isLoading || !isReconciled };
}
