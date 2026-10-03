/**
 * Drag and drop for the popup and side panel tree. One instance per tree owns the drag scope,
 * the dragged row, every row's registration and its cleanup, and the drop indicator classes;
 * `resolveTreeDrop` decides what a drop does.
 */
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BookmarkTreeNode, DragData, DragOperation } from '@/types';

/** Classes that `popup.scss` styles while a row is hovered as a drop target. */
const DROP_CLASSES = {
  target: 'drop-target',
  intoFolder: 'drop-into-folder',
  indicator: 'drop-indicator',
} as const;

type RowRef = (element: HTMLElement | null) => (() => void) | undefined;

type TreeDndOptions = {
  /** Whether a row may be dragged and reordered; permanent and managed folders may not. */
  canMove?: (node: BookmarkTreeNode) => boolean;
};

export type TreeDnd = {
  /** Ref for a row's drag handle; stable per node object, so rows are not re-registered. */
  rowRef: (node: BookmarkTreeNode, kind: TreeRowKind) => RowRef;
  /** The row being dragged, until it is dropped or the drag is cancelled. */
  draggingId: string | null;
};

const canAlwaysMove = () => true;

/** The element that shows the indicator line: bookmark handles are inside a positioned row. */
function indicatorHost(element: HTMLElement, kind: TreeRowKind): HTMLElement | null {
  return kind === 'bookmark' ? element.parentElement : element;
}

function clearDropIndicator(element: HTMLElement, kind: TreeRowKind) {
  element.classList.remove(DROP_CLASSES.target, DROP_CLASSES.intoFolder);
  indicatorHost(element, kind)?.querySelector(`.${DROP_CLASSES.indicator}`)?.remove();
}

function showDropIndicator(element: HTMLElement, kind: TreeRowKind, zone: TreeDropZone) {
  clearDropIndicator(element, kind);
  element.classList.add(DROP_CLASSES.target);
  if (zone === 'into') {
    element.classList.add(DROP_CLASSES.intoFolder);
    return;
  }
  const indicator = document.createElement('div');
  indicator.className = DROP_CLASSES.indicator;
  indicator.style[zone === 'before' ? 'top' : 'bottom'] = '-1px';
  indicatorHost(element, kind)?.appendChild(indicator);
}

/** The adapter types drag data as a plain record; every row in this tree attaches `DragData`. */
function dragDataOf(data: Record<string | symbol, unknown>): DragData {
  return data as unknown as DragData;
}

function pointerOver(element: HTMLElement, clientY: number): TreeDropPointer {
  const rect = element.getBoundingClientRect();
  return { clientY, top: rect.top, height: rect.height };
}

export function useTreeDnd(
  onDrop: (operation: DragOperation) => void,
  options: TreeDndOptions = {},
): TreeDnd {
  // Each tree is its own drag scope: rows only accept drags that started in the same tree.
  const [instanceId] = useState(() => Symbol('popup-tree-dnd'));
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Registrations outlive renders, so they read the latest callbacks through a ref.
  const latest = useRef({ onDrop, canMove: options.canMove ?? canAlwaysMove });
  useLayoutEffect(() => {
    latest.current = { onDrop, canMove: options.canMove ?? canAlwaysMove };
  });

  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => source.data.instanceId === instanceId,
        onDragStart: ({ source }) => setDraggingId(dragDataOf(source.data).node.id),
        // Fires for a drop anywhere and for a cancelled drag.
        onDrop: () => setDraggingId(null),
      }),
    [instanceId],
  );

  // One ref per node object: a re-render keeps the registration, and a changed node (new index
  // or children after a move) gets a fresh one while React runs the old one's cleanup.
  const refs = useRef(new WeakMap<BookmarkTreeNode, Partial<Record<TreeRowKind, RowRef>>>());

  const rowRef = useCallback(
    (node: BookmarkTreeNode, kind: TreeRowKind): RowRef => {
      const cached = refs.current.get(node) ?? {};
      const existing = cached[kind];
      if (existing) return existing;

      const data = { type: kind, node, instanceId } satisfies DragData;
      const ref: RowRef = (element) => {
        if (!element) return undefined;
        const target = () => ({ kind, node, movable: latest.current.canMove(node) });
        return combine(
          draggable({
            element,
            canDrag: () => latest.current.canMove(node),
            getInitialData: () => data,
          }),
          dropTargetForElements({
            element,
            getData: () => data,
            canDrop: ({ source }) => {
              const sourceData = dragDataOf(source.data);
              return sourceData.instanceId === instanceId && sourceData.node.id !== node.id;
            },
            onDrag: ({ location }) =>
              showDropIndicator(
                element,
                kind,
                getTreeDropZone(target(), pointerOver(element, location.current.input.clientY)),
              ),
            onDragLeave: () => clearDropIndicator(element, kind),
            onDrop: ({ source, location }) => {
              clearDropIndicator(element, kind);
              const sourceData = dragDataOf(source.data);
              // Use the drop position itself: onDrag may not have fired for a quick drop.
              const operation = resolveTreeDrop(
                { kind: sourceData.type, node: sourceData.node },
                target(),
                pointerOver(element, location.current.input.clientY),
              );
              if (operation) latest.current.onDrop(operation);
            },
          }),
          () => clearDropIndicator(element, kind),
        );
      };
      refs.current.set(node, { ...cached, [kind]: ref });
      return ref;
    },
    [instanceId],
  );

  return { rowRef, draggingId };
}
