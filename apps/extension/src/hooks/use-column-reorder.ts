/**
 * Reordering the manager table's columns by dragging their headers, with Pragmatic drag and drop
 * and the same rules as `SortableList` (`src/lib/sortable.ts`) on a horizontal axis: a header
 * drops on the left or right edge of another, only movable columns move (the fixed selection and
 * actions columns keep their places), each move is announced in a live region, and the header
 * menus offer Move Left and Move Right, so a move never needs a drag. `DraggableTableHead` reads
 * the result through `ColumnReorderContext`.
 */
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { pointerOutsideOfPreview } from '@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import {
  attachClosestEdge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { announce } from '@atlaskit/pragmatic-drag-and-drop-live-region';
import { createContext, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export type ColumnEdge = 'left' | 'right';

type ColumnReorderOptions = {
  /** Every column id, in table order. */
  order: readonly string[];
  onReorder: (order: string[]) => void;
  /** Columns that can move; the others keep their places and take no drops. */
  isMovable: (columnId: string) => boolean;
  getLabel: (columnId: string) => string;
};

export type ColumnReorder = {
  isMovable: (columnId: string) => boolean;
  /** Makes a header draggable by `handle` and a drop target; returns its cleanup. */
  register: (columnId: string, element: HTMLElement, handle: HTMLElement) => () => void;
  canMove: (columnId: string, direction: ColumnEdge) => boolean;
  move: (columnId: string, direction: ColumnEdge) => void;
  dragging: string | null;
  drop: { columnId: string; edge: ColumnEdge } | null;
};

export const ColumnReorderContext = createContext<ColumnReorder | null>(null);

type HeaderData = { scope: string; columnId: string };

function headerDataOf(data: Record<string | symbol, unknown>): HeaderData | null {
  return typeof data.scope === 'string' && typeof data.columnId === 'string'
    ? { scope: data.scope, columnId: data.columnId }
    : null;
}

const isColumnEdge = (edge: unknown): edge is ColumnEdge => edge === 'left' || edge === 'right';

const MOVE_FOR_EDGE = { left: 'up', right: 'down' } as const;

export function useColumnReorder(options: ColumnReorderOptions): ColumnReorder {
  const scope = useId();
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<ColumnReorder['drop']>(null);

  // Registrations outlive renders, so they read the latest options through a ref.
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  const commit = useCallback((next: string[], columnId: string) => {
    const { onReorder, isMovable, getLabel } = latest.current;
    onReorder(next);
    const movable = next.filter(isMovable);
    announce(
      t('sortable_moved', [
        getLabel(columnId),
        String(movable.indexOf(columnId) + 1),
        String(movable.length),
      ]),
    );
  }, []);

  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => headerDataOf(source.data)?.scope === scope,
        onDragStart: ({ source }) => setDragging(headerDataOf(source.data)?.columnId ?? null),
        onDrop: ({ source, location }) => {
          setDragging(null);
          setDrop(null);
          const from = headerDataOf(source.data);
          const target = location.current.dropTargets[0];
          const to = target ? headerDataOf(target.data) : null;
          const edge = target ? extractClosestEdge(target.data) : null;
          if (!from || !to || !isColumnEdge(edge)) return;
          const { order, isMovable } = latest.current;
          const next = reorderByDrop(order, from.columnId, to.columnId, edge, isMovable);
          if (next) commit(next, from.columnId);
        },
      }),
    [commit, scope],
  );

  const register = useCallback(
    (columnId: string, element: HTMLElement, handle: HTMLElement) => {
      const data = { scope, columnId } satisfies HeaderData;
      return combine(
        draggable({
          element,
          dragHandle: handle,
          canDrag: () => latest.current.isMovable(columnId),
          getInitialData: () => data,
          onGenerateDragPreview: ({ nativeSetDragImage }) =>
            setCustomNativeDragPreview({
              nativeSetDragImage,
              getOffset: pointerOutsideOfPreview(SORTABLE_PREVIEW_OFFSET),
              render: ({ container }) => {
                const preview = document.createElement('div');
                preview.className = 'sortable-preview';
                preview.textContent = latest.current.getLabel(columnId);
                container.appendChild(preview);
              },
            }),
        }),
        dropTargetForElements({
          element,
          getData: ({ input }) =>
            attachClosestEdge(data, { element, input, allowedEdges: ['left', 'right'] }),
          canDrop: ({ source }) =>
            headerDataOf(source.data)?.scope === scope && latest.current.isMovable(columnId),
          onDrag: ({ self, source }) => {
            const edge = extractClosestEdge(self.data);
            const from = headerDataOf(source.data);
            const { order, isMovable } = latest.current;
            // No line where the drop would change nothing (the column itself, or its own gap).
            const next =
              from && isColumnEdge(edge)
                ? reorderByDrop(order, from.columnId, columnId, edge, isMovable)
                : null;
            setDrop(next && isColumnEdge(edge) ? { columnId, edge } : null);
          },
          onDragLeave: () =>
            setDrop((current) => (current?.columnId === columnId ? null : current)),
        }),
      );
    },
    [scope],
  );

  const { order, isMovable } = options;
  const canMove = (columnId: string, direction: ColumnEdge) =>
    reorderByMove(order, columnId, MOVE_FOR_EDGE[direction], isMovable) !== null;
  const move = (columnId: string, direction: ColumnEdge) => {
    const next = reorderByMove(order, columnId, MOVE_FOR_EDGE[direction], isMovable);
    if (next) commit(next, columnId);
  };

  return { isMovable, register, canMove, move, dragging, drop };
}
