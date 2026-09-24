/**
 * Chrome Bookmarks API service layer.
 * Centralizes all Chrome bookmarks API interactions.
 */

import type { BookmarkTreeNode } from '@/types';

/** How long a deletion can be undone from the popup or side panel. */
export const BOOKMARK_DELETION_UNDO_WINDOW_MS = 10_000;

export type RecoverableBookmarkNode = {
  title: string;
  url?: string;
  index?: number;
  /** Firefox separators have no URL or children and must not be recreated as folders. */
  type?: 'separator';
  /** Tags and summary stored for the node, re-keyed to its new ID on restore. */
  metadata?: StoredBookmarkMetadata;
  children?: RecoverableBookmarkNode[];
};

export type BookmarkDeletionSnapshot = {
  parentId: string;
  node: RecoverableBookmarkNode;
  /** Epoch milliseconds after which the snapshot is no longer restorable. */
  expiresAt: number;
};

export type BookmarkRestoreErrorCode = 'expired' | 'parent-missing' | 'restore-failed';

export class BookmarkRestoreError extends Error {
  constructor(
    message: string,
    readonly code: BookmarkRestoreErrorCode,
  ) {
    super(message);
    this.name = 'BookmarkRestoreError';
  }
}

function toRecoverableNode(
  node: chrome.bookmarks.BookmarkTreeNode,
  metadataById: StoredBookmarkMetadataById,
): RecoverableBookmarkNode {
  const nodeType = (node as { type?: string }).type;
  const metadata = metadataById[node.id];
  return {
    title: node.title,
    ...(node.url ? { url: node.url } : {}),
    ...(typeof node.index === 'number' ? { index: node.index } : {}),
    ...(nodeType === 'separator' ? { type: 'separator' as const } : {}),
    ...(metadata ? { metadata } : {}),
    ...(node.children
      ? { children: node.children.map((child) => toRecoverableNode(child, metadataById)) }
      : {}),
  };
}

function collectSubtreeIds(node: chrome.bookmarks.BookmarkTreeNode, ids: string[] = []): string[] {
  ids.push(node.id);
  for (const child of node.children ?? []) collectSubtreeIds(child, ids);
  return ids;
}

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
    ...(node.folderType ? { folderType: node.folderType } : {}),
    ...(node.unmodifiable ? { unmodifiable: node.unmodifiable } : {}),
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
      if (!results[0]) {
        reject(new Error('Bookmark not found.'));
        return;
      }
      resolve(results[0]);
    });
  });
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
 * Gets the direct children of a bookmark folder.
 */
export async function getBookmarkChildren(
  id: string,
): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  return new Promise((resolve, reject) => {
    if (!chrome?.bookmarks) {
      reject(new Error('Chrome bookmarks API not available.'));
      return;
    }
    chrome.bookmarks.getChildren(id, (results) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(results);
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
  /** Firefox-only; Chrome has no separators and never receives this field. */
  type?: 'separator';
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
 * Updates an existing bookmark.
 */
export async function updateBookmark(
  id: string,
  changes: chrome.bookmarks.UpdateChanges,
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  return new Promise((resolve, reject) => {
    if (!chrome?.bookmarks) {
      reject(new Error('Chrome bookmarks API not available.'));
      return;
    }
    chrome.bookmarks.update(id, changes, (result) => {
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
 * Captures an in-memory snapshot of a bookmark or folder subtree before deletion
 * so it can be recreated within {@link BOOKMARK_DELETION_UNDO_WINDOW_MS}.
 */
export async function captureBookmarkDeletion(
  id: string,
  now: number = Date.now(),
): Promise<BookmarkDeletionSnapshot> {
  const [node] = await getBookmarkSubTree(id);
  if (!node?.parentId) {
    throw new Error('Bookmark cannot be recovered without its parent folder.');
  }

  // Tags and summaries are keyed by browser ID, which changes when the tree is recreated.
  const metadataById = await getStoredBookmarkMetadata(collectSubtreeIds(node)).catch(
    () => ({}) as StoredBookmarkMetadataById,
  );
  return {
    parentId: node.parentId,
    node: toRecoverableNode(node, metadataById),
    expiresAt: now + BOOKMARK_DELETION_UNDO_WINDOW_MS,
  };
}

async function recreateBookmarkNode(
  node: RecoverableBookmarkNode,
  parentId: string,
  index: number | undefined,
  restoredMetadata: StoredBookmarkMetadataById,
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  const restored = await createBookmark({
    parentId,
    ...(typeof index === 'number' ? { index } : {}),
    title: node.title,
    ...(node.url ? { url: node.url } : {}),
    ...(node.type ? { type: node.type } : {}),
  });

  if (node.metadata) restoredMetadata[restored.id] = node.metadata;

  // Children are recreated in their captured order, so sequential indexes are always in bounds.
  const children = node.children ?? [];
  for (const [childIndex, child] of children.entries()) {
    await recreateBookmarkNode(child, restored.id, childIndex, restoredMetadata);
  }
  return restored;
}

/**
 * Recreates a captured deletion under its original parent. Browser-generated IDs and
 * dates are new. A partially restored tree is rolled back before the error is thrown.
 */
export async function restoreBookmarkDeletion(
  snapshot: BookmarkDeletionSnapshot,
  now: number = Date.now(),
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  if (now > snapshot.expiresAt) {
    throw new BookmarkRestoreError('The undo window for this deletion has expired.', 'expired');
  }

  let siblingCount: number;
  try {
    const [parent] = await getBookmarkSubTree(snapshot.parentId);
    if (!parent || parent.url) throw new Error('Original parent is not a folder.');
    siblingCount = parent.children?.length ?? 0;
  } catch {
    throw new BookmarkRestoreError(
      'The original parent folder no longer exists.',
      'parent-missing',
    );
  }

  // Siblings may have changed since deletion; clamp so the browser accepts the index.
  const index =
    typeof snapshot.node.index === 'number'
      ? Math.min(snapshot.node.index, siblingCount)
      : undefined;

  let restoredRoot: chrome.bookmarks.BookmarkTreeNode | undefined;
  const restoredMetadata: StoredBookmarkMetadataById = {};
  try {
    restoredRoot = await createBookmark({
      parentId: snapshot.parentId,
      ...(typeof index === 'number' ? { index } : {}),
      title: snapshot.node.title,
      ...(snapshot.node.url ? { url: snapshot.node.url } : {}),
      ...(snapshot.node.type ? { type: snapshot.node.type } : {}),
    });
    if (snapshot.node.metadata) restoredMetadata[restoredRoot.id] = snapshot.node.metadata;
    const children = snapshot.node.children ?? [];
    for (const [childIndex, child] of children.entries()) {
      await recreateBookmarkNode(child, restoredRoot.id, childIndex, restoredMetadata);
    }
  } catch (error) {
    if (restoredRoot) {
      try {
        await deleteBookmark(restoredRoot.id);
      } catch {
        // Keep the original restore failure if best-effort rollback also fails.
      }
    }
    throw new BookmarkRestoreError(
      error instanceof Error ? error.message : 'Failed to restore bookmark deletion.',
      'restore-failed',
    );
  }

  if (Object.keys(restoredMetadata).length > 0) {
    // The bookmarks are already back; losing tags must not report the whole undo as failed.
    await mergeStoredBookmarkMetadata(restoredMetadata, {
      tagMode: 'replace',
      summaryMode: 'replace',
      dedupeTags: true,
    }).catch((error: unknown) => console.error('Failed to restore bookmark metadata:', error));
  }
  return restoredRoot;
}

async function getBookmarkSubTree(id: string): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  return new Promise((resolve, reject) => {
    if (!chrome?.bookmarks) {
      reject(new Error('Chrome bookmarks API not available.'));
      return;
    }
    chrome.bookmarks.getSubTree(id, (results) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(results);
    });
  });
}

/**
 * Opens a bookmark URL in a new foreground tab.
 */
export async function openBookmarkInNewTab(url: string): Promise<void> {
  await browser.tabs.create({ url, active: true });
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
