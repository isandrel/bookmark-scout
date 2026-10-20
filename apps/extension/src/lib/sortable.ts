/**
 * The rules behind `SortableList` (src/components/ui/sortable-list.tsx): where a moved item goes,
 * by drag or by its handle menu, with Pragmatic drag and drop's own `reorder` and
 * `getReorderDestinationIndex`. Only movable items reorder: the moves work on the movable items
 * alone, and the fixed ones (such as hidden menu commands) keep their places in the list.
 */

import { reorder } from '@atlaskit/pragmatic-drag-and-drop/reorder';
import { getReorderDestinationIndex } from '@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index';
import { z } from 'zod';

const sortableConfig = readConfig(
  'ui/sortable-list',
  z.strictObject({
    flash_ms: z.number().int().nonnegative(),
    preview_offset_x: z.number().int().nonnegative(),
    preview_offset_y: z.number().int().nonnegative(),
  }),
);

/** How long the moved item stays highlighted after it lands. */
export const SORTABLE_FLASH_MS = sortableConfig.flash_ms;

/** Offset of the drag preview from the pointer. */
export const SORTABLE_PREVIEW_OFFSET = {
  x: `${sortableConfig.preview_offset_x}px`,
  y: `${sortableConfig.preview_offset_y}px`,
} as const;

/** The moves a handle menu offers, in menu order. */
export const SORTABLE_MOVES = ['top', 'up', 'down', 'bottom'] as const;
export type SortableMove = (typeof SORTABLE_MOVES)[number];

/** The edge of the target an item is dropped on: top and bottom in a list, left and right in a row. */
export type SortableEdge = 'top' | 'bottom' | 'left' | 'right';

type IsMovable = (id: string) => boolean;
const always: IsMovable = () => true;

/**
 * Reorders the movable items with `move` (indexes among the movable items) and puts them back
 * into the movable items' places, or returns null when the order would not change.
 */
function reorderMovable(
  ids: readonly string[],
  isMovable: IsMovable,
  move: (movable: string[]) => { startIndex: number; finishIndex: number } | null,
): string[] | null {
  const movable = ids.filter(isMovable);
  const indexes = move(movable);
  if (!indexes || indexes.startIndex === indexes.finishIndex) return null;
  if (indexes.finishIndex < 0 || indexes.finishIndex >= movable.length) return null;
  const reordered = reorder({ list: movable, ...indexes });
  let next = 0;
  return ids.map((id) => (isMovable(id) ? reordered[next++] : id));
}

/**
 * The order after dropping `id` on `targetId`'s `edge` (the axis follows the edge), or null when nothing would change or
 * either item cannot move.
 */
export function reorderByDrop(
  ids: readonly string[],
  id: string,
  targetId: string,
  edge: SortableEdge,
  isMovable: IsMovable = always,
): string[] | null {
  if (id === targetId || !isMovable(id) || !isMovable(targetId)) return null;
  return reorderMovable(ids, isMovable, (movable) => {
    const startIndex = movable.indexOf(id);
    const indexOfTarget = movable.indexOf(targetId);
    if (startIndex < 0 || indexOfTarget < 0) return null;
    const finishIndex = getReorderDestinationIndex({
      startIndex,
      indexOfTarget,
      closestEdgeOfTarget: edge,
      axis: edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical',
    });
    return { startIndex, finishIndex };
  });
}

/** The order after a handle-menu move, or null when the item cannot move that way. */
export function reorderByMove(
  ids: readonly string[],
  id: string,
  move: SortableMove,
  isMovable: IsMovable = always,
): string[] | null {
  if (!isMovable(id)) return null;
  return reorderMovable(ids, isMovable, (movable) => {
    const startIndex = movable.indexOf(id);
    if (startIndex < 0) return null;
    const finishIndex = {
      top: 0,
      up: startIndex - 1,
      down: startIndex + 1,
      bottom: movable.length - 1,
    }[move];
    return { startIndex, finishIndex };
  });
}

/** Which handle-menu moves would change the order, for enabling the menu items. */
export function availableMoves(
  ids: readonly string[],
  id: string,
  isMovable: IsMovable = always,
): Record<SortableMove, boolean> {
  return Object.fromEntries(
    SORTABLE_MOVES.map((move) => [move, reorderByMove(ids, id, move, isMovable) !== null]),
  ) as Record<SortableMove, boolean>;
}

/**
 * `items` in the order of `ids`, for storing a reordered list: ids that are gone are skipped,
 * and items missing from `ids` (added in another tab meanwhile) stay at the end in their order.
 */
export function orderByIds<T>(
  items: readonly T[],
  getId: (item: T) => string,
  ids: readonly string[],
): T[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  const last = Number.MAX_SAFE_INTEGER;
  return [...items].sort(
    (left, right) => (rank.get(getId(left)) ?? last) - (rank.get(getId(right)) ?? last),
  );
}
