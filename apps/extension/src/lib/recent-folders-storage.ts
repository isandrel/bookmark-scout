/**
 * Recent folders storage using chrome.storage.local.
 * Tracks folders where bookmarks were recently added for quick access.
 */

import { useEffect, useState, useCallback } from "react";

// Storage key for recent folders
const RECENT_FOLDERS_KEY = "bookmark-scout-recent-folders";
const MAX_RECENT_FOLDERS = 5;

export interface RecentFolder {
	id: string;
	title: string;
	lastUsed: number;
}

/**
 * Get recent folders from chrome.storage.local.
 */
export async function getRecentFolders(): Promise<RecentFolder[]> {
	return new Promise((resolve) => {
		if (!chrome?.storage?.local) {
			console.warn("Chrome storage API not available");
			resolve([]);
			return;
		}

		chrome.storage.local.get(RECENT_FOLDERS_KEY, (result) => {
			if (chrome.runtime.lastError) {
				console.error(
					"Error reading recent folders:",
					chrome.runtime.lastError,
				);
				resolve([]);
				return;
			}

			const stored = result[RECENT_FOLDERS_KEY];
			if (!stored || !Array.isArray(stored)) {
				resolve([]);
				return;
			}

			resolve(stored as RecentFolder[]);
		});
	});
}

/**
 * Add a folder to recent folders list.
 * If folder already exists, moves it to the front and updates lastUsed.
 */
export async function addRecentFolder(
	id: string,
	title: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!chrome?.storage?.local) {
			console.warn("Chrome storage API not available");
			resolve();
			return;
		}

		getRecentFolders().then((current) => {
			// Remove if already exists
			const filtered = current.filter((f) => f.id !== id);

			// Add to front with current timestamp
			const updated: RecentFolder[] = [
				{ id, title, lastUsed: Date.now() },
				...filtered,
			].slice(0, MAX_RECENT_FOLDERS);

			chrome.storage.local.set({ [RECENT_FOLDERS_KEY]: updated }, () => {
				if (chrome.runtime.lastError) {
					reject(new Error(chrome.runtime.lastError.message));
					return;
				}
				resolve();
			});
		});
	});
}

/**
 * Remove a folder from recent folders (e.g., when folder is deleted).
 */
export async function removeRecentFolder(id: string): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!chrome?.storage?.local) {
			resolve();
			return;
		}

		getRecentFolders().then((current) => {
			const filtered = current.filter((f) => f.id !== id);

			chrome.storage.local.set({ [RECENT_FOLDERS_KEY]: filtered }, () => {
				if (chrome.runtime.lastError) {
					reject(new Error(chrome.runtime.lastError.message));
					return;
				}
				resolve();
			});
		});
	});
}

/**
 * Clear all recent folders.
 */
export async function clearRecentFolders(): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!chrome?.storage?.local) {
			resolve();
			return;
		}

		chrome.storage.local.remove(RECENT_FOLDERS_KEY, () => {
			if (chrome.runtime.lastError) {
				reject(new Error(chrome.runtime.lastError.message));
				return;
			}
			resolve();
		});
	});
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

		// Listen for storage changes
		const handleStorageChange = (
			changes: { [key: string]: chrome.storage.StorageChange },
			areaName: string,
		) => {
			if (areaName === "local" && changes[RECENT_FOLDERS_KEY]) {
				const newValue = changes[RECENT_FOLDERS_KEY].newValue;
				setRecentFolders(Array.isArray(newValue) ? newValue : []);
			}
		};

		chrome?.storage?.onChanged?.addListener(handleStorageChange);
		return () => {
			chrome?.storage?.onChanged?.removeListener(handleStorageChange);
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
