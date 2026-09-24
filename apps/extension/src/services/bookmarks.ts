/**
 * Browser bookmarks API service layer.
 * Centralizes all browser bookmarks API interactions.
 */

import type { BookmarkTreeNode } from '@/types';

/**
 * Gets the favicon URL for a given page URL using Chrome's favicon API.
 * @param pageUrl - The URL of the page to get the favicon for
 * @param size - The size of the favicon (default: 16)
 */
export function getFaviconUrl(pageUrl: string, size = 16): string {
  // The _favicon path is a Chromium feature, so it is not part of the typed public paths.
  const url = new URL(browser.runtime.getURL('/_favicon/' as '/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', size.toString());
  return url.toString();
}

/**
 * Converts a browser bookmark node to our BookmarkTreeNode type.
 */
function processNode(node: Browser.bookmarks.BookmarkTreeNode): BookmarkTreeNode {
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

function requireBookmarksApi(): typeof browser.bookmarks {
  if (!browser?.bookmarks) throw new Error('Browser bookmarks API not available.');
  return browser.bookmarks;
}

/**
 * Fetches the entire bookmark tree.
 * @returns Promise resolving to the bookmark tree
 */
export async function fetchBookmarkTree(): Promise<BookmarkTreeNode[]> {
  const tree = await requireBookmarksApi().getTree();
  return tree.map(processNode);
}

/**
 * Gets a single bookmark by ID.
 * @param id - The bookmark ID
 */
export async function getBookmark(id: string): Promise<Browser.bookmarks.BookmarkTreeNode> {
  const [result] = await requireBookmarksApi().get(id);
  if (!result) throw new Error('Bookmark not found.');
  return result;
}

/**
 * Gets the named folders containing an item, from the browser's bookmark root
 * down to its immediate parent. The synthetic "Root" used by the manager is
 * not a browser bookmark ID.
 */
export async function getBookmarkFolderPath(parentId?: string): Promise<string[]> {
  const path: string[] = [];
  const visited = new Set<string>();
  let folderId = parentId;

  while (folderId && folderId !== 'Root' && !visited.has(folderId)) {
    visited.add(folderId);
    const folder = await getBookmark(folderId);
    // The browser's unnamed root has no parent and is represented by the UI label.
    if (folder.parentId) path.unshift(folder.title);
    folderId = folder.parentId;
  }

  return path;
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
}): Promise<Browser.bookmarks.BookmarkTreeNode> {
  return requireBookmarksApi().create(details);
}

/**
 * Moves a bookmark to a new location.
 * @param id - The bookmark ID
 * @param destination - The new parent folder ID and/or index
 */
export async function moveBookmark(
  id: string,
  destination: { parentId?: string; index?: number },
): Promise<Browser.bookmarks.BookmarkTreeNode> {
  return requireBookmarksApi().move(id, destination);
}

/**
 * Updates an existing bookmark.
 */
export async function updateBookmark(
  id: string,
  changes: Browser.bookmarks.UpdateChanges,
): Promise<Browser.bookmarks.BookmarkTreeNode> {
  return requireBookmarksApi().update(id, changes);
}

/**
 * Deletes a bookmark or folder (and all its contents).
 * @param id - The bookmark/folder ID
 */
export async function deleteBookmark(id: string): Promise<void> {
  await requireBookmarksApi().removeTree(id);
}

/**
 * Gets the current active tab information.
 */
export async function getCurrentTab(): Promise<Browser.tabs.Tab> {
  if (!browser?.tabs) throw new Error('Browser tabs API not available.');
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab found.');
  return tab;
}

/**
 * Truncates a string to a specified length.
 * @param text - The text to truncate
 * @param length - Maximum length (default: 50)
 */
export function truncate(text?: string, length = 50): string {
  if (!text) return '';
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

/**
 * Formats a timestamp to a locale string.
 * @param timestamp - The timestamp in milliseconds
 */
export function formatDate(timestamp?: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString();
}
