/**
 * The popup and side panel tree as the flat list of rows it shows: every top-level folder, and
 * the children of each expanded folder, depth first. The tree renders only the rows on screen
 * from this list, so its cost no longer grows with the library, and keyboard navigation reaches
 * rows that are not rendered. Pure, so it is unit tested.
 */
import type { BookmarkTreeNode } from '@/types';

export type PopupTreeRowKind = 'folder' | 'bookmark' | 'new-folder';

export type PopupTreeRow = {
  kind: PopupTreeRowKind;
  node: BookmarkTreeNode;
  /** 1 for top-level folders, as `aria-level` counts. */
  level: number;
  /** Position among its siblings, from 1, and how many siblings there are (`aria-posinset`, `aria-setsize`). */
  posInSet: number;
  setSize: number;
  /** The folder the row is in; undefined at the top level. */
  parentId: string | undefined;
  /** Folders only: whether its children are shown. */
  expanded: boolean;
};

/**
 * The native tooltip of a bookmark row: its whole title, then its address on the next line. A
 * plain `title` attribute, so the virtualized rows stay cheap.
 */
export function bookmarkRowTooltip(node: Pick<BookmarkTreeNode, 'title' | 'url'>): string {
  return [getBookmarkDisplayTitle(node.title), node.url].filter(Boolean).join('\n');
}

function rowKind(node: BookmarkTreeNode): PopupTreeRowKind {
  if (node.isTemporary) return 'new-folder';
  return node.children ? 'folder' : 'bookmark';
}

/** The rows on screen for `roots` with the folders in `expanded` open. */
export function flattenVisibleTree(
  roots: readonly BookmarkTreeNode[],
  expanded: ReadonlySet<string>,
): PopupTreeRow[] {
  const rows: PopupTreeRow[] = [];
  const visit = (nodes: readonly BookmarkTreeNode[], level: number, parentId?: string) => {
    nodes.forEach((node, index) => {
      const kind = rowKind(node);
      const isOpen = kind === 'folder' && expanded.has(node.id);
      rows.push({
        kind,
        node,
        level,
        posInSet: index + 1,
        setSize: nodes.length,
        parentId,
        expanded: isOpen,
      });
      if (isOpen && node.children) visit(node.children, level + 1, node.id);
    });
  };
  visit(roots, 1);
  return rows;
}

/**
 * Whether `node` has subfolders and every one of them, at any depth, is in `expanded`. Stops at
 * the first closed folder instead of listing the whole subtree.
 */
export function areAllSubfoldersExpanded(
  node: Pick<BookmarkTreeNode, 'children'>,
  expanded: ReadonlySet<string>,
): boolean {
  let found = false;
  const allOpen = (nodes: readonly BookmarkTreeNode[]): boolean => {
    for (const child of nodes) {
      if (!child.children) continue;
      found = true;
      if (!expanded.has(child.id) || !allOpen(child.children)) return false;
    }
    return true;
  };
  return allOpen(node.children ?? []) && found;
}
