/**
 * Recent folders storage using browser.storage.local.
 * Tracks folders where bookmarks were recently added for quick access.
 */

import { useCallback, useEffect, useState } from 'react';

// Storage key for recent folders
const RECENT_FOLDERS_KEY = 'bookmark-scout-recent-folders';
/** Upper bound of the recentFoldersMax setting; readers apply the user's own limit. */
export const RECENT_FOLDERS_STORAGE_LIMIT = 10;

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

async function readRecentFolders(): Promise<RecentFolder[]> {
  try {
    const result = await browser.storage.local.get(RECENT_FOLDERS_KEY);
    return normalizeRecentFolders(result?.[RECENT_FOLDERS_KEY]);
  } catch (error) {
    console.error('Error reading recent folders:', error);
    return [];
  }
}

async function writeRecentFolders(folders: RecentFolder[]): Promise<void> {
  await browser.storage.local.set({ [RECENT_FOLDERS_KEY]: normalizeRecentFolders(folders) });
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
  const stored = await readRecentFolders();
  const reconciled = await reconcileWithBookmarks(stored);
  if (JSON.stringify(reconciled) !== JSON.stringify(stored)) {
    await writeRecentFolders(reconciled).catch((error) => {
      console.error('Error pruning recent folders:', error);
    });
  }
  return limit === undefined ? reconciled : reconciled.slice(0, Math.max(0, limit));
}

/**
 * Add a folder to recent folders list.
 * If folder already exists, moves it to the front and updates lastUsed.
 */
export async function addRecentFolder(id: string, title: string): Promise<void> {
  const current = await readRecentFolders();
  await writeRecentFolders([
    { id, title, lastUsed: Date.now() },
    ...current.filter((folder) => folder.id !== id),
  ]);
}

/**
 * Remove folders from recent folders (e.g., when a folder or its parent is deleted).
 */
export async function removeRecentFolders(ids: readonly string[]): Promise<void> {
  const removed = new Set(ids);
  const current = await readRecentFolders();
  const next = current.filter((folder) => !removed.has(folder.id));
  if (next.length !== current.length) await writeRecentFolders(next);
}

export async function removeRecentFolder(id: string): Promise<void> {
  await removeRecentFolders([id]);
}

/**
 * Keep a recent folder's title in sync after a rename.
 */
export async function updateRecentFolderTitle(id: string, title: string): Promise<void> {
  const current = await readRecentFolders();
  if (!current.some((folder) => folder.id === id && folder.title !== title)) return;
  await writeRecentFolders(
    current.map((folder) => (folder.id === id ? { ...folder, title } : folder)),
  );
}

/**
 * Clear all recent folders.
 */
export async function clearRecentFolders(): Promise<void> {
  await browser.storage.local.remove(RECENT_FOLDERS_KEY);
}

/**
 * React hook for recent folders with live updates.
 */
export function useRecentFolders(): {
  recentFolders: RecentFolder[];
  isLoading: boolean;
  addFolder: (id: string, title: string) => Promise<void>;
  removeFolder: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
} {
  const [recentFolders, setRecentFolders] = useState<RecentFolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getRecentFolders().then((folders) => {
      if (!active) return;
      setRecentFolders(folders);
      setIsLoading(false);
    });

    const handleStorageChange = (
      changes: Record<string, { newValue?: unknown }>,
      areaName: string,
    ) => {
      if (areaName === 'local' && changes[RECENT_FOLDERS_KEY]) {
        setRecentFolders(normalizeRecentFolders(changes[RECENT_FOLDERS_KEY].newValue));
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const addFolder = useCallback(async (id: string, title: string) => {
    await addRecentFolder(id, title);
  }, []);

  const removeFolder = useCallback(async (id: string) => {
    await removeRecentFolder(id);
  }, []);

  const clearAll = useCallback(async () => {
    await clearRecentFolders();
  }, []);

  return { recentFolders, isLoading, addFolder, removeFolder, clearAll };
}
