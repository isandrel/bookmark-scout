/**
 * A vertical list whose items reorder by drag and drop, with Pragmatic drag and drop, after
 * Atlassian's guidelines: each movable item has a visible handle that drags it and is also a menu
 * button with Move to top, Move up, Move down, and Move to bottom, so every move works from the
 * keyboard and assistive technology too. Atlassian's `DropIndicator` (a 2px line with a terminal,
 * in `primary` through its `--ds-border-selected` token in theme.css) shows where the item will
 * land, the dragged item stays at 40% opacity, the moved item flashes (`flash_ms`), each move is
 * announced in a live region, and the window scrolls when a drag nears its edges.
 *
 * Items that cannot move (`isMovable`) take no drops and have no handle; the rest reorder only
 * among themselves (`src/lib/sortable.ts`). Each list is its own drag scope.
 */
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { pointerOutsideOfPreview } from '@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import { autoScrollWindowForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import {
  attachClosestEdge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { announce } from '@atlaskit/pragmatic-drag-and-drop-live-region';
import { DropIndicator } from '@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/box';
import { GripVertical } from 'lucide-react';
import {
  type CSSProperties,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

type SortableListProps<T> = {
  items: readonly T[];
  getId: (item: T) => string;
  /** The item's name, for the handle's label, the drag preview, and announcements. */
  getLabel: (item: T) => string;
  /** Called with every id in the new order. */
  onReorder: (ids: string[]) => void;
  renderItem: (item: T, handle: ReactNode) => ReactNode;
  /** Items that keep their place; they take no drops and show no handle. */
  isMovable?: (item: T) => boolean;
  /** The list's accessible name. */
  label: string;
  className?: string;
  itemClassName?: string;
  /** Extra attributes for an item's `li`, such as test ids. */
  itemProps?: (item: T) => Record<`data-${string}`, string>;
  listRef?: Ref<HTMLUListElement>;
  'data-testid'?: string;
};

type ItemData = { listId: symbol; id: string };

function itemDataOf(data: Record<string | symbol, unknown>): ItemData | null {
  return typeof data.listId === 'symbol' && typeof data.id === 'string'
    ? (data as unknown as ItemData)
    : null;
}

const MOVE_LABEL_KEYS = {
  top: 'sortable_moveTop',
  up: 'sortable_moveUp',
  down: 'sortable_moveDown',
  bottom: 'sortable_moveBottom',
} as const satisfies Record<SortableMove, MessageKey>;

export function SortableList<T>({
  items,
  getId,
  getLabel,
  onReorder,
  renderItem,
  isMovable,
  label,
  className,
  itemClassName,
  itemProps,
  listRef,
  'data-testid': testId,
}: SortableListProps<T>) {
  const [listId] = useState(() => Symbol('sortable-list'));
  const [dragging, setDragging] = useState<string | null>(null);
  const [flashing, setFlashing] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; edge: 'top' | 'bottom' } | null>(null);

  const ids = items.map(getId);
  const byId = new Map(items.map((item) => [getId(item), item]));
  const movable = (id: string) => {
    const item = byId.get(id);
    return item !== undefined && (isMovable?.(item) ?? true);
  };

  // Registrations outlive renders, so they read the latest list through a ref.
  const latest = useRef({ ids, movable, onReorder, getLabel, byId });
  useLayoutEffect(() => {
    latest.current = { ids, movable, onReorder, getLabel, byId };
  });

  const commit = useCallback((next: string[], id: string) => {
    const { onReorder: reorder, getLabel: nameOf, byId: items } = latest.current;
    reorder(next);
    setFlashing(id);
    const item = items.get(id);
    if (item !== undefined) {
      announce(
        t('sortable_moved', [nameOf(item), String(next.indexOf(id) + 1), String(next.length)]),
      );
    }
  }, []);

  useEffect(() => {
    if (!flashing) return;
    const timer = setTimeout(() => setFlashing(null), SORTABLE_FLASH_MS);
    return () => clearTimeout(timer);
  }, [flashing]);

  useEffect(
    () =>
      combine(
        monitorForElements({
          canMonitor: ({ source }) => itemDataOf(source.data)?.listId === listId,
          onDragStart: ({ source }) => setDragging(itemDataOf(source.data)?.id ?? null),
          onDrop: ({ source, location }) => {
            setDragging(null);
            setDrop(null);
            const from = itemDataOf(source.data);
            const target = location.current.dropTargets[0];
            const to = target ? itemDataOf(target.data) : null;
            const edge = target ? extractClosestEdge(target.data) : null;
            if (!from || !to || (edge !== 'top' && edge !== 'bottom')) return;
            const { ids: order, movable: canMove } = latest.current;
            const next = reorderByDrop(order, from.id, to.id, edge, canMove);
            if (next) commit(next, from.id);
          },
        }),
        autoScrollWindowForElements({
          canScroll: ({ source }) => itemDataOf(source.data)?.listId === listId,
        }),
      ),
    [commit, listId],
  );

  const register = useCallback(
    (id: string) => (element: HTMLElement | null, handle: HTMLElement | null) => {
      if (!element || !handle) return undefined;
      const data = { listId, id } satisfies ItemData;
      return combine(
        draggable({
          element,
          dragHandle: handle,
          canDrag: () => latest.current.movable(id),
          getInitialData: () => data,
          onGenerateDragPreview: ({ nativeSetDragImage }) =>
            setCustomNativeDragPreview({
              nativeSetDragImage,
              getOffset: pointerOutsideOfPreview(SORTABLE_PREVIEW_OFFSET),
              render: ({ container }) => {
                const item = latest.current.byId.get(id);
                const preview = document.createElement('div');
                preview.className = 'sortable-preview';
                preview.textContent = item === undefined ? '' : latest.current.getLabel(item);
                container.appendChild(preview);
              },
            }),
        }),
        dropTargetForElements({
          element,
          getData: ({ input }) =>
            attachClosestEdge(data, { element, input, allowedEdges: ['top', 'bottom'] }),
          canDrop: ({ source }) => {
            const from = itemDataOf(source.data);
            return from?.listId === listId && latest.current.movable(id);
          },
          onDrag: ({ self, source }) => {
            const edge = extractClosestEdge(self.data);
            const from = itemDataOf(source.data);
            // No line where the drop would change nothing (the item itself, or its own gap).
            const next =
              from && (edge === 'top' || edge === 'bottom')
                ? reorderByDrop(latest.current.ids, from.id, id, edge, latest.current.movable)
                : null;
            setDrop(next && (edge === 'top' || edge === 'bottom') ? { id, edge } : null);
          },
          onDragLeave: () => setDrop((current) => (current?.id === id ? null : current)),
        }),
      );
    },
    [listId],
  );

  const moveBy = (id: string, move: SortableMove) => {
    const next = reorderByMove(ids, id, move, movable);
    if (next) commit(next, id);
  };

  return (
    <ul
      ref={listRef}
      aria-label={label}
      className={className}
      data-testid={testId}
      // The flash animation's length comes from config, like every other timing.
      style={{ '--sortable-flash': `${SORTABLE_FLASH_MS}ms` } as CSSProperties}
    >
      {items.map((item) => {
        const id = getId(item);
        return (
          <SortableItem
            key={id}
            id={id}
            name={getLabel(item)}
            movable={movable(id)}
            moves={availableMoves(ids, id, movable)}
            onMove={(move) => moveBy(id, move)}
            register={register}
            dragging={dragging === id}
            flashing={flashing === id}
            dropEdge={drop?.id === id ? drop.edge : null}
            className={itemClassName}
            attributes={itemProps?.(item)}
          >
            {(handle) => renderItem(item, handle)}
          </SortableItem>
        );
      })}
    </ul>
  );
}

type SortableItemProps = {
  id: string;
  name: string;
  movable: boolean;
  moves: Record<SortableMove, boolean>;
  onMove: (move: SortableMove) => void;
  register: (
    id: string,
  ) => (element: HTMLElement | null, handle: HTMLElement | null) => (() => void) | undefined;
  dragging: boolean;
  flashing: boolean;
  dropEdge: 'top' | 'bottom' | null;
  className?: string;
  attributes?: Record<`data-${string}`, string>;
  children: (handle: ReactNode) => ReactNode;
};

function SortableItem({
  id,
  name,
  movable,
  moves,
  onMove,
  register,
  dragging,
  flashing,
  dropEdge,
  className,
  attributes,
  children,
}: SortableItemProps) {
  const itemRef = useRef<HTMLLIElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!movable) return;
    return register(id)(itemRef.current, handleRef.current);
  }, [id, movable, register]);

  // Base UI opens a menu on mousedown, which would take the press a drag starts with, so the
  // handle opens its menu on click instead; a keyboard press still opens it the usual way.
  const [menuOpen, setMenuOpen] = useState(false);

  const handle = movable ? (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(open, details) => {
        if (open && details.event?.type === 'mousedown') return;
        setMenuOpen(open);
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            ref={handleRef}
            type="button"
            variant="ghost"
            size="icon-sm"
            className="sortable-handle"
            aria-label={t('sortable_handle', name)}
            title={t('sortable_handle', name)}
            // A keyboard press (detail 0) is already handled by the menu itself.
            onClick={(event) => {
              if (event.detail > 0) setMenuOpen((open) => !open);
            }}
          />
        }
      >
        <GripVertical aria-hidden="true" className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {SORTABLE_MOVES.map((move) => (
          <DropdownMenuItem key={move} disabled={!moves[move]} onClick={() => onMove(move)}>
            {t(MOVE_LABEL_KEYS[move])}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    // Keeps the row's columns aligned with movable rows.
    <span aria-hidden="true" className="sortable-handle-slot" />
  );

  return (
    <li
      {...attributes}
      ref={itemRef}
      data-sortable-id={id}
      data-dragging={dragging || undefined}
      data-flash={flashing || undefined}
      data-drop-edge={dropEdge ?? undefined}
      className={cn('sortable-item', className)}
    >
      {children(handle)}
      {dropEdge && <DropIndicator edge={dropEdge} />}
    </li>
  );
}
