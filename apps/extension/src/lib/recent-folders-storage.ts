/**
 * Folders where bookmarks were recently added, for quick access, in the local storage area.
 */

import { useEffect, useState } from 'react';

/** Upper bound of the recentFoldersMax setting; readers apply the user's own limit. */
export const RECENT_FOLDERS_STORAGE_LIMIT = SETTING_NUMBER_BOUNDS.recentFoldersMax.max;

export interface RecentFolder {
  id: string;
  title: string;
  lastUsed: number;
}

function isRecentFolder(value: unknown): value is RecentFolder {
  if (!value || typeof value !== 'object') return false;
  const folder = value as Partial<RecentFolder>;
  return typeof folder.id === 'string' && folder.id.length > 0 && typeof folder.title === 'string';
}

/**
 * Drop malformed entries and duplicate ids (keeping the most recent) and cap the list.
 */
export function normalizeRecentFolders(value: unknown): RecentFolder[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const folders: RecentFolder[] = [];
  for (const entry of value) {
    if (!isRecentFolder(entry) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    folders.push({
      id: entry.id,
      title: entry.title,
      lastUsed: typeof entry.lastUsed === 'number' ? entry.lastUsed : 0,
    });
  }
  return folders.slice(0, RECENT_FOLDERS_STORAGE_LIMIT);
}

/** Most recent first; malformed stored entries are dropped on read. */
export const recentFoldersValue = defineStoredValue<RecentFolder[]>({
  key: STORAGE_KEYS.recentFolders,
  parse: normalizeRecentFolders,
  empty: [],
});

/** @deprecated Watch `recentFoldersValue` instead; kept until services/context-menu.ts moves. */
export const recentFoldersItem = storage.defineItem<RecentFolder[]>(STORAGE_KEYS.recentFolders);

async function readRecentFolders(): Promise<RecentFolder[]> {
  try {
    return await recentFoldersValue.get();
  } catch (error) {
    bookmarkLogger.error({ error }, 'Error reading recent folders');
    return [];
  }
}

/**
 * Remove folders that no longer exist and pick up renamed titles.
 */
async function reconcileWithBookmarks(folders: RecentFolder[]): Promise<RecentFolder[]> {
  if (!browser.bookmarks?.get) return folders;
  const checked = await Promise.all(
    folders.map(async (folder) => {
      try {
        const [node] = await browser.bookmarks.get(folder.id);
        if (!node || node.url) return null;
        return node.title === folder.title ? folder : { ...folder, title: node.title };
      } catch {
        return null;
      }
    }),
  );
  return checked.filter((folder): folder is RecentFolder => folder !== null);
}

/**
 * Get recent folders, most recent first, pruned against the live bookmark tree.
 * Pass `limit` to apply the user's recentFoldersMax setting.
 */
export async function getRecentFolders(limit?: number): Promise<RecentFolder[]> {
  let folders: RecentFolder[];
  try {
    folders = await recentFoldersValue.update(reconcileWithBookmarks);
  } catch (error) {
    bookmarkLogger.error({ error }, 'Error pruning recent folders');
    folders = await readRecentFolders();
  }
  return limit === undefined ? folders : folders.slice(0, Math.max(0, limit));
}

/**
 * Add a folder to recent folders list.
 * If folder already exists, moves it to the front and updates lastUsed.
 */
export async function addRecentFolder(id: string, title: string): Promise<void> {
  await recentFoldersValue.update((current) => [
    { id, title, lastUsed: Date.now() },
    ...current.filter((folder) => folder.id !== id),
  ]);
}

/**
 * Remove folders from recent folders (e.g., when a folder or its parent is deleted).
 */
export async function removeRecentFolders(ids: readonly string[]): Promise<void> {
  const removed = new Set(ids);
  await recentFoldersValue.update((current) => current.filter((folder) => !removed.has(folder.id)));
}

/**
 * Keep a recent folder's title in sync after a rename.
 */
export async function updateRecentFolderTitle(id: string, title: string): Promise<void> {
  await recentFoldersValue.update((current) =>
    current.map((folder) => (folder.id === id ? { ...folder, title } : folder)),
  );
}

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
