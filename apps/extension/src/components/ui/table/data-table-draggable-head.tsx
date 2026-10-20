/**
 * A table header cell that drags its column to a new place (`useColumnReorder`). The header's
 * sort menu button is the drag handle (`data-column-drag-handle`); a header without one drags by
 * the whole cell. While dragging, the header stays at 40% opacity and Atlassian's
 * `DropIndicator` marks the edge the column will land on, as in `SortableList`.
 */
import { DropIndicator } from '@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/box';
import { type ComponentProps, useContext, useEffect, useRef } from 'react';

type DraggableTableHeadProps = ComponentProps<typeof TableHead> & { columnId: string };

export function DraggableTableHead({
  columnId,
  className,
  children,
  ...props
}: DraggableTableHeadProps) {
  const reorder = useContext(ColumnReorderContext);
  const ref = useRef<HTMLTableCellElement>(null);
  const movable = reorder?.isMovable(columnId) ?? false;
  const register = reorder?.register;

  useEffect(() => {
    const element = ref.current;
    if (!movable || !register || !element) return;
    const handle = element.querySelector<HTMLElement>('[data-column-drag-handle]') ?? element;
    return register(columnId, element, handle);
  }, [columnId, movable, register]);

  const dropEdge = reorder?.drop?.columnId === columnId ? reorder.drop.edge : null;
  return (
    <TableHead
      {...props}
      ref={ref}
      data-column-id={columnId}
      data-dragging={reorder?.dragging === columnId || undefined}
      data-drop-edge={dropEdge ?? undefined}
      className={cn(movable && 'column-drag-head', className)}
    >
      {children}
      {dropEdge && <DropIndicator edge={dropEdge} />}
    </TableHead>
  );
}
