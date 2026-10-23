/**
 * The handle on a manager sidebar's inner edge that resizes it: drag it, or focus it and use the
 * arrow keys (Shift for bigger steps), Home, and End, as the ARIA window splitter pattern has it.
 * The width stays within the sidebar's configured range (config/ui/layout.toml) and is kept on
 * this device once the drag ends or a key is pressed.
 */
import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';

type SidebarResizeHandleProps = {
  id: ManagerSidebarId;
  sidebar: ManagerSidebar;
  /** Which edge of the sidebar it sits on: the folder sidebar's right, the Tools sidebar's left. */
  edge: 'left' | 'right';
  label: string;
  /** Told while a drag is under way, so the sidebar can stop animating its width. */
  onResizingChange: (resizing: boolean) => void;
};

export function SidebarResizeHandle({
  id,
  sidebar,
  edge,
  label,
  onResizingChange,
}: SidebarResizeHandleProps) {
  const { min, max } = MANAGER_SIDEBAR_WIDTHS[id];
  const dragRef = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  // Dragging toward the table widens the sidebar: right for the folders, left for the tools.
  const direction = edge === 'right' ? 1 : -1;

  const widthAt = (clientX: number) => {
    const drag = dragRef.current;
    return drag ? drag.width + (clientX - drag.x) * direction : sidebar.width;
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    sidebar.resize(widthAt(event.clientX), true);
    dragRef.current = null;
    setDragging(false);
    onResizingChange(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey
      ? MANAGER_SIDEBAR_RESIZE_STEPS.big
      : MANAGER_SIDEBAR_RESIZE_STEPS.small;
    const next = {
      ArrowLeft: sidebar.width - step * direction,
      ArrowRight: sidebar.width + step * direction,
      Home: min,
      End: max,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    sidebar.resize(next, true);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable window splitter, which <hr> cannot be.
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={sidebar.width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      data-testid={`${id}-sidebar-resize`}
      data-dragging={dragging || undefined}
      className={cn(
        'absolute inset-y-0 z-10 w-2 cursor-col-resize touch-none outline-none',
        'after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent',
        'hover:after:bg-ring focus-visible:after:w-0.5 focus-visible:after:bg-ring data-dragging:after:bg-ring',
        edge === 'right' ? 'right-0' : 'left-0',
      )}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { x: event.clientX, width: sidebar.width };
        setDragging(true);
        onResizingChange(true);
      }}
      onPointerMove={(event) => {
        if (dragRef.current) sidebar.resize(widthAt(event.clientX), false);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
    />
  );
}
