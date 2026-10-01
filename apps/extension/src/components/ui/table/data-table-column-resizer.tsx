import type { Header, RowData } from '@tanstack/react-table';
import type * as React from 'react';

interface DataTableColumnResizerProps<TData extends RowData, TValue> {
  header: Header<BookmarkTableFeatures, TData, TValue>;
}

/**
 * Drag handle on a header's right edge. Dragging resizes the column, double-click restores its
 * default width, and ArrowLeft/ArrowRight resize it from the keyboard.
 */
export function DataTableColumnResizer<TData extends RowData, TValue>({
  header,
}: DataTableColumnResizerProps<TData, TValue>) {
  const { column } = header;
  const { table } = header.getContext();
  const size = column.getSize();
  const isResizing = column.getIsResizing();
  const resizeHandler = header.getResizeHandler();

  const startResize = (event: React.MouseEvent | React.TouchEvent) => {
    // Keep the press from reaching the header's sort menu or selecting header text.
    event.stopPropagation();
    if (event.type === 'mousedown') event.preventDefault();
    resizeHandler(event);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (direction === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const width = clampBookmarkColumnSize(
      column.id,
      size + direction * COLUMN_RESIZE_KEYBOARD_STEP,
    );
    if (width === undefined) return;
    table.setColumnSizing((previous) => ({ ...previous, [column.id]: width }));
  };

  return (
    // A focusable separator is the ARIA pattern for a keyboard-operable splitter.
    // biome-ignore lint/a11y/useSemanticElements: <hr> cannot be focused or hold a pointer handle.
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('table_resizeColumn', getBookmarkColumnLabel(column.id))}
      aria-valuenow={Math.round(size)}
      aria-valuemin={column.columnDef.minSize}
      aria-valuemax={column.columnDef.maxSize}
      tabIndex={0}
      data-resizing={isResizing || undefined}
      onMouseDown={startResize}
      onTouchStart={startResize}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        column.resetSize();
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        'group/resizer absolute inset-y-0 right-0 z-20 flex w-2 cursor-col-resize touch-none select-none justify-end',
        'focus-visible:outline-none',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'my-3 w-px bg-border transition-colors',
          'group-hover/resizer:w-0.5 group-hover/resizer:bg-primary',
          'group-focus-visible/resizer:w-0.5 group-focus-visible/resizer:bg-ring',
          isResizing && 'w-0.5 bg-primary',
        )}
      />
    </div>
  );
}
