/**
 * Where a drop in the popup and side panel tree lands. Folder rows have three zones (before,
 * into, after) and bookmark rows two (before, after); the zone sizes come from
 * config/ui/popup-tree.toml. Pure, so it is unit tested; `use-tree-dnd.ts` wires it to the DOM.
 */
import { z } from 'zod';
import type { BookmarkTreeNode, DragOperation } from '@/types';

const dropConfig = readConfig(
  'ui/popup-tree',
  z.strictObject({
    folder_edge_fraction: z.number().gt(0).max(0.5),
    bookmark_split_fraction: z.number().gt(0).lt(1),
  }),
);

/** Parent id recorded for a node without one, such as the browser's own root folders. */
const ROOT_PARENT_ID = 'root';

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

/** The zone of `target` under the pointer. */
export function getTreeDropZone(target: TreeDropTarget, pointer: TreeDropPointer): TreeDropZone {
  const fraction = pointer.height > 0 ? (pointer.clientY - pointer.top) / pointer.height : 0.5;
  if (target.kind === 'bookmark') {
    return fraction < dropConfig.bookmark_split_fraction ? 'before' : 'after';
  }
  if (!target.movable) return 'into';
  if (fraction < dropConfig.folder_edge_fraction) return 'before';
  if (fraction > 1 - dropConfig.folder_edge_fraction) return 'after';
  return 'into';
}

/** The move a drop makes, or null when it would do nothing (a row dropped on itself). */
export function resolveTreeDrop(
  source: TreeDragSource,
  target: TreeDropTarget,
  pointer: TreeDropPointer,
): DragOperation | null {
  if (source.node.id === target.node.id) return null;
  const zone = getTreeDropZone(target, pointer);
  const into = zone === 'into';
  const targetIndex = target.node.index ?? 0;
  return {
    type: `${source.kind}-${into ? 'move' : 'reorder'}`,
    sourceId: source.node.id,
    sourceParentId: source.node.parentId || ROOT_PARENT_ID,
    sourceIndex: source.node.index ?? 0,
    targetId: target.node.id,
    targetParentId: into ? target.node.id : target.node.parentId || ROOT_PARENT_ID,
    targetIndex: into
      ? (target.node.children?.length ?? 0)
      : targetIndex + (zone === 'after' ? 1 : 0),
  };
}
