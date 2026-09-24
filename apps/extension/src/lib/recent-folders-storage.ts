/**
 * Recent folders storage backed by WXT storage in the local area.
 * Tracks folders where bookmarks were recently added for quick access.
 */

import { useEffect, useState, useCallback } from "react";

const MAX_RECENT_FOLDERS = 5;

export interface RecentFolder {
	id: string;
	title: string;
	lastUsed: number;
}

export const recentFoldersStorageItem = storage.defineItem<RecentFolder[]>(
	"local:bookmark-scout-recent-folders",
);

/**
 * Get recent folders from local storage.
 */
export async function getRecentFolders(): Promise<RecentFolder[]> {
	try {
		const stored = await recentFoldersStorageItem.getValue();
		return Array.isArray(stored) ? stored : [];
	} catch (error) {
		console.error("Error reading recent folders:", error);
		return [];
	}
}

/**
 * Add a folder to recent folders list.
 * If folder already exists, moves it to the front and updates lastUsed.
 */
export async function addRecentFolder(
	id: string,
	title: string,
): Promise<void> {
	const current = await getRecentFolders();
	const updated: RecentFolder[] = [
		{ id, title, lastUsed: Date.now() },
		...current.filter((f) => f.id !== id),
	].slice(0, MAX_RECENT_FOLDERS);
	await recentFoldersStorageItem.setValue(updated);
}

/**
 * Remove a folder from recent folders (e.g., when folder is deleted).
 */
export async function removeRecentFolder(id: string): Promise<void> {
	const current = await getRecentFolders();
	await recentFoldersStorageItem.setValue(current.filter((f) => f.id !== id));
}

/**
 * Clear all recent folders.
 */
export async function clearRecentFolders(): Promise<void> {
	await recentFoldersStorageItem.removeValue();
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
		getRecentFolders().then((folders) => {
			setRecentFolders(folders);
			setIsLoading(false);
		});

		return recentFoldersStorageItem.watch((newValue) => {
			setRecentFolders(Array.isArray(newValue) ? newValue : []);
		});
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
