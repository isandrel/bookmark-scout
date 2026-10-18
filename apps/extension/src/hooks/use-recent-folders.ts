/**
 * React hook over `lib/recent-folders-storage.ts`, which stays free of React for the background.
 */

import { useEffect, useState } from 'react';

/** Whether this page already pruned the list against the tree (`preloadRecentFolders`). */
let reconciledBeforeRender = false;

/**
 * Prunes and reads the recent folders before a page's first render (`mountExtensionPage`'s
 * `preload`), so their row shows on the first frame instead of pushing the tree down.
 */
export async function preloadRecentFolders(): Promise<void> {
  await Promise.all([preloadStoredValue(recentFoldersValue), getRecentFolders()]).catch(
    () => undefined,
  );
  reconciledBeforeRender = true;
}

/**
 * Live recent folders for React. The list is pruned against the bookmark tree once on mount,
 * and stays loading until then, so deleted folders never flash.
 */
export function useRecentFolders(): { recentFolders: RecentFolder[]; isLoading: boolean } {
  const { value: recentFolders, isLoading } = useStoredValue(recentFoldersValue);
  const [isReconciled, setIsReconciled] = useState(() => reconciledBeforeRender);

  useEffect(() => {
    if (reconciledBeforeRender) return;
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
