/**
 * Where a drop in the popup and side panel tree lands. Folder rows have three zones (before,
 * into, after) and bookmark rows two (before, after); the zone sizes come from
 * config/ui/drag-drop.toml through `getManagerDropZone`, the rule the manager uses too: rows
 * reorder only while the tree shows the browser's own order. Under a date or name sort a reorder
 * would not show, so a drop then only moves an item into another folder: into a folder row, or
 * into the folder of a bookmark row from elsewhere. Pure, so it is unit tested; `use-tree-dnd.ts`
 * wires it to the DOM.
 */
import type { BookmarkTreeNode, DragOperation } from '@/types';

/** Parent id recorded for a node without one, such as the browser's own root folders. */
const ROOT_PARENT_ID = 'root';

/** The target index of a drop into a folder: past its last child, so the item goes at the end. */
export const TREE_DROP_END_INDEX = Number.MAX_SAFE_INTEGER;

/** Sort orders that show each folder's items in the browser's order, so a reorder shows. */
const BROWSER_ORDER_SORTS: ReadonlySet<SortOrder> = new Set(['browser', 'folders']);

/** Whether the tree, sorted by `order`, shows the browser's order, so rows can be reordered. */
export function treeShowsBrowserOrder(order: SortOrder): boolean {
  return BROWSER_ORDER_SORTS.has(order);
}

export type TreeRowKind = 'folder' | 'bookmark';
export type TreeDropZone = 'before' | 'into' | 'after';

/** The row being dragged. */
export type TreeDragSource = { kind: TreeRowKind; node: BookmarkTreeNode };

/** The row under the pointer. */
export type TreeDropTarget = TreeDragSource & {
  /** False for permanent and managed folders: they take drops into them but never reorder. */
  movable: boolean;
};

/** The pointer's height and the target row's bounding box, in client pixels. */
export type TreeDropPointer = { clientY: number; top: number; height: number };

const parentOf = (node: BookmarkTreeNode) => node.parentId || ROOT_PARENT_ID;

/**
 * The zone of `target` under the pointer. Without `canReorder`, every drop goes into a folder:
 * the folder row's own, or a bookmark row's folder.
 */
export function getTreeDropZone(
  target: TreeDropTarget,
  pointer: TreeDropPointer,
  canReorder = true,
): TreeDropZone {
  const fraction = pointer.height > 0 ? (pointer.clientY - pointer.top) / pointer.height : 0.5;
  const zone = getManagerDropZone(
    {
      id: target.node.id,
      parentId: target.node.parentId,
      isFolder: target.kind === 'folder',
      movable: target.movable,
    },
    fraction,
    canReorder,
  );
  return zone ?? 'into';
}

/**
 * Whether `target` takes a drop of `source` at all. Without `canReorder`, a drop that would only
 * change the item's place in its own folder is refused, since the sorted tree would not show it.
 */
export function acceptsTreeDrop(
  source: TreeDragSource,
  target: TreeDropTarget,
  canReorder = true,
): boolean {
  if (source.node.id === target.node.id) return false;
  if (canReorder) return true;
  const into = target.kind === 'folder' ? target.node.id : parentOf(target.node);
  return into !== parentOf(source.node);
}

/** The move a drop makes, or null when it would do nothing or is refused. */
export function resolveTreeDrop(
  source: TreeDragSource,
  target: TreeDropTarget,
  pointer: TreeDropPointer,
  canReorder = true,
): DragOperation | null {
  if (!acceptsTreeDrop(source, target, canReorder)) return null;
  const zone = getTreeDropZone(target, pointer, canReorder);
  const into = zone === 'into';
  const targetIndex = target.node.index ?? 0;
  return {
    type: `${source.kind}-${into ? 'move' : 'reorder'}`,
    sourceId: source.node.id,
    sourceParentId: parentOf(source.node),
    sourceIndex: source.node.index ?? 0,
    targetId: target.node.id,
    targetParentId: into && target.kind === 'folder' ? target.node.id : parentOf(target.node),
    targetIndex: into ? TREE_DROP_END_INDEX : targetIndex + (zone === 'after' ? 1 : 0),
  };
}
