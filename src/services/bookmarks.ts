/**
 * Chrome Bookmarks API service layer.
 * Centralizes all Chrome bookmarks API interactions.
 */

import type { BookmarkTreeNode } from '@/types';

/**
 * Gets the favicon URL for a given page URL using Chrome's favicon API.
 * @param pageUrl - The URL of the page to get the favicon for
 * @param size - The size of the favicon (default: 16)
 */
export function getFaviconUrl(pageUrl: string, size = 16): string {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', size.toString());
  return url.toString();
}

/**
 * Converts a Chrome bookmark node to our BookmarkTreeNode type.
 */
function processNode(node: chrome.bookmarks.BookmarkTreeNode): BookmarkTreeNode {
  return {
    id: node.id,
    parentId: node.parentId,
    index: node.index,
    title: node.title,
    url: node.url,
    dateAdded: node.dateAdded,
    dateGroupModified: node.dateGroupModified,
    children: node.children ? node.children.map(processNode) : undefined,
    isOpen: false,
  };
}

/**
 * Fetches the entire bookmark tree.
 * @returns Promise resolving to the bookmark tree
 */
export async function fetchBookmarkTree(): Promise<BookmarkTreeNode[]> {
  return new Promise((resolve, reject) => {
    if (!chrome?.bookmarks) {
      reject(new Error('Chrome bookmarks API not available.'));
      return;
    }
    chrome.bookmarks.getTree((tree) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tree.map(processNode));
    });
  });
}

/**
 * Gets a single bookmark by ID.
 * @param id - The bookmark ID
 */
export async function getBookmark(id: string): Promise<chrome.bookmarks.BookmarkTreeNode> {
  return new Promise((resolve, reject) => {
    if (!chrome?.bookmarks) {
      reject(new Error('Chrome bookmarks API not available.'));
      return;
    }
    chrome.bookmarks.get(id, (results) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(results[0]);
    });
  });
}

/**
 * Creates a new bookmark or folder.
 * @param details - The bookmark creation details
 */
export async function createBookmark(details: {
  parentId?: string;
  index?: number;
  title?: string;
  url?: string;
}): Promise<chrome.bookmarks.BookmarkTreeNode> {
  return new Promise((resolve, reject) => {
    if (!chrome?.bookmarks) {
      reject(new Error('Chrome bookmarks API not available.'));
      return;
    }
    chrome.bookmarks.create(details, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result);
    });
  });
}

/**
 * Moves a bookmark to a new location.
 * @param id - The bookmark ID
 * @param destination - The new parent folder ID and/or index
 */
export async function moveBookmark(
  id: string,
  destination: { parentId?: string; index?: number },
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  return new Promise((resolve, reject) => {
    if (!chrome?.bookmarks) {
      reject(new Error('Chrome bookmarks API not available.'));
      return;
    }
    chrome.bookmarks.move(id, destination, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result);
    });
  });
}

/**
 * Deletes a bookmark or folder (and all its contents).
 * @param id - The bookmark/folder ID
 */
export async function deleteBookmark(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!chrome?.bookmarks) {
      reject(new Error('Chrome bookmarks API not available.'));
      return;
    }
    chrome.bookmarks.removeTree(id, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

/**
 * Gets the current active tab information.
 */
export async function getCurrentTab(): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    if (!chrome?.tabs) {
      reject(new Error('Chrome tabs API not available.'));
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (tabs.length === 0) {
        reject(new Error('No active tab found.'));
        return;
      }
      resolve(tabs[0]);
    });
  });
}

/**
 * Truncates a string to a specified length.
 * @param text - The text to truncate
 * @param length - Maximum length (default: 50)
 */
export function truncate(text?: string, length = 50): string {
  if (!text) return '';
  return text.length > length ? text.slice(0, length) + '...' : text;
}

/**
 * Formats a timestamp to a locale string.
 * @param timestamp - The timestamp in milliseconds
 */
export function formatDate(timestamp?: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString();
}
