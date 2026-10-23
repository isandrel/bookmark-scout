/**
 * The folders open in the popup and side panel tree when it was last closed, for Expand on Open's
 * "As last left" (`popupExpandOnOpen`), and which folders that setting opens when the tree first
 * loads (`initialExpandedFolders`).
 */
import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

/** At most this many folder ids are remembered, so the item stays small. */
const MAX_REMEMBERED_FOLDERS = POPUP_TREE_VIEW.max_remembered_folders;

const folderIdsSchema = z.array(z.string().max(INPUT_LIMITS.chars.folder_id));

export const popupExpandedFoldersValue = defineStoredValue<string[]>(
  STORAGE_ITEMS.popupExpandedFolders,
  {
    parse: (raw) => {
      const parsed = folderIdsSchema.safeParse(raw);
      return parsed.success ? [...new Set(parsed.data)].slice(0, MAX_REMEMBERED_FOLDERS) : [];
    },
    empty: [],
    isEmpty: (ids) => ids.length === 0,
  },
);

/** Remembers the open folders, at most `MAX_REMEMBERED_FOLDERS` of them. */
export async function rememberExpandedFolders(ids: readonly string[]): Promise<void> {
  await popupExpandedFoldersValue.set([...new Set(ids)].slice(0, MAX_REMEMBERED_FOLDERS));
}

/** Every folder id in the tree. */
function treeFolderIds(nodes: readonly BookmarkTreeNode[], into = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.children === undefined) continue;
    into.add(node.id);
    treeFolderIds(node.children, into);
  }
  return into;
}

/**
 * The folders open when the tree first loads: none, the bookmarks bar, or those remembered from
 * last time that still exist.
 */
export function initialExpandedFolders(
  mode: PopupExpandOnOpen,
  tree: readonly BookmarkTreeNode[],
  remembered: readonly string[],
): string[] {
  if (mode === 'bookmarks_bar') {
    const bar = findBookmarksBarFolder(tree);
    return bar ? [bar.id] : [];
  }
  if (mode === 'last') {
    const existing = treeFolderIds(tree);
    return remembered.filter((id) => existing.has(id));
  }
  return [];
}
