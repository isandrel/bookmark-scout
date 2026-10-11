/**
 * Folder paths as AI features send and receive them ("Bookmarks Bar/Work/Docs"). Pure, and apart
 * from the AI services that use them, so the background can resolve a suggested path without
 * bundling the AI client.
 */

import type { BookmarkTreeNode } from '@/types';

/** Joins folder names in the paths AI tools send and receive, e.g. "Bookmarks Bar/Work". */
export const AI_FOLDER_PATH_SEPARATOR = '/';

export interface FolderInfo {
  id: string;
  title: string;
  path: string;
  bookmarkCount: number;
}

/** Every titled folder in `nodes` and below with its path, parents first. */
export function collectFolders(nodes: BookmarkTreeNode[], parentPath = ''): FolderInfo[] {
  const result: FolderInfo[] = [];
  for (const node of nodes) {
    if (node.url) continue;
    const currentPath =
      parentPath && node.title
        ? `${parentPath}${AI_FOLDER_PATH_SEPARATOR}${node.title}`
        : node.title || '';
    if (node.title) {
      const bookmarkCount = node.children?.filter((c) => c.url).length ?? 0;
      result.push({ id: node.id, title: node.title, path: currentPath, bookmarkCount });
    }
    if (node.children) {
      result.push(...collectFolders(node.children, currentPath));
    }
  }
  return result;
}
