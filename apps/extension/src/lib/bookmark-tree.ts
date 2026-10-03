import type { BookmarkTreeNode } from '@/types';

type TreeNodeIdentity = Pick<BookmarkTreeNode, 'id' | 'parentId'>;

// Firefox exposes the mobile folder under a fixed GUID and has no `folderType`.
const MOBILE_FOLDER_IDS: ReadonlySet<string> = new Set(['mobile______']);

/** Joins folder titles into a readable path, e.g. "Bookmarks bar / Work / Docs". */
export const FOLDER_PATH_SEPARATOR = ' / ';

/** The node with `id` anywhere in `nodes` and their descendants, depth first. */
export function findNode<T extends { id: string; children?: readonly T[] }>(
  nodes: readonly T[],
  id: string,
): T | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = node.children ? findNode(node.children, id) : undefined;
    if (found) return found;
  }
  return undefined;
}

/** Ids of `node` and every node below it, parents before children. */
export function subtreeIds(node: Pick<BookmarkTreeNode, 'id' | 'children'>): string[] {
  return [node.id, ...(node.children ?? []).flatMap(subtreeIds)];
}

/** Ids of every folder (a node with `children`) in `nodes` and below, parents first. */
export function folderIds(nodes: readonly Pick<BookmarkTreeNode, 'id' | 'children'>[]): string[] {
  return nodes.flatMap((node) => (node.children ? [node.id, ...folderIds(node.children)] : []));
}

/** The browser's invisible root is the only node without a parent, in every browser. */
export function isBookmarkTreeRoot(node: Pick<BookmarkTreeNode, 'parentId'>): boolean {
  return !node.parentId;
}

/** Ids of the invisible browser roots, derived from the tree instead of browser-specific ids. */
export function getBookmarkRootIds(tree: readonly TreeNodeIdentity[]): Set<string> {
  return new Set(tree.filter(isBookmarkTreeRoot).map((node) => node.id));
}

/**
 * Permanent folders (Bookmarks bar, Other bookmarks, Mobile bookmarks, Firefox's menu/toolbar/
 * unfiled) are the direct children of the root. Browsers reject renaming, moving, or deleting them.
 */
export function isPermanentBookmarkFolder(
  node: TreeNodeIdentity,
  rootIds: ReadonlySet<string>,
): boolean {
  return isBookmarkTreeRoot(node) || (node.parentId !== undefined && rootIds.has(node.parentId));
}

/** A title to show for a bookmark or folder; blank titles read as the localized "Untitled". */
export function getBookmarkDisplayTitle(title: string | null | undefined): string {
  return title?.trim() ? title : t('popup_untitled');
}

function isEmptyMobileFolder(node: BookmarkTreeNode): boolean {
  const isMobile = node.folderType === 'mobile' || MOBILE_FOLDER_IDS.has(node.id);
  return isMobile && (node.children?.length ?? 0) === 0;
}

/**
 * Replace the unnamed browser root with its permanent folders so they render as top-level
 * nodes. An empty mobile folder is omitted because it can only hold synced mobile bookmarks.
 */
export function getTopLevelBookmarkNodes(nodes: readonly BookmarkTreeNode[]): BookmarkTreeNode[] {
  return nodes.flatMap((node) =>
    isBookmarkTreeRoot(node)
      ? (node.children ?? []).filter((child) => !isEmptyMobileFolder(child))
      : [node],
  );
}
