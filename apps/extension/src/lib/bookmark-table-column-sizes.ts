/** Saved widths in pixels, keyed by column id. Only columns the user resized are present. */
export type BookmarkColumnSizing = Record<string, number>;

type ColumnSizeLimits = { size: number; minSize: number; maxSize: number };

const MAX_COLUMN_WIDTH = 1200;

// Widths come from each column's `size` in the column registry (components/ui/table/columns.tsx).
// The registry is read inside these functions, never at module load, because it imports lib
// helpers itself.

function getResizableLimits(columnId: string): ColumnSizeLimits | undefined {
  const size = findBookmarkColumn(columnId)?.size;
  return size && 'minSize' in size ? { ...size, maxSize: MAX_COLUMN_WIDTH } : undefined;
}

/** The column that absorbs spare width while it has no saved size. */
export const FILL_COLUMN_ID = 'title';

/** Pixels one ArrowLeft/ArrowRight press on a resize handle changes a column by. */
export const COLUMN_RESIZE_KEYBOARD_STEP = 10;

type ColumnSizeDef = {
  size?: number;
  minSize?: number;
  maxSize?: number;
  enableResizing: boolean;
};

/**
 * Column definition sizing for a registry size. Fixed columns never resize; columns without a
 * size keep the table's default width and do not resize either.
 */
export function getColumnSizeDef(size: BookmarkColumnSize | undefined): ColumnSizeDef {
  if (!size) return { enableResizing: false };
  if ('fixed' in size) {
    return { size: size.fixed, minSize: size.fixed, maxSize: size.fixed, enableResizing: false };
  }
  return { ...size, maxSize: MAX_COLUMN_WIDTH, enableResizing: true };
}

/** Column definition sizing for a table column id (fixed or resizable). */
export function getBookmarkColumnSizeDef(columnId: string): ColumnSizeDef {
  return getColumnSizeDef(findBookmarkColumn(columnId)?.size);
}

/** Clamps a width to the column's limits; `undefined` for columns that cannot be resized. */
export function clampBookmarkColumnSize(columnId: string, width: number): number | undefined {
  const limits = getResizableLimits(columnId);
  if (!limits || !Number.isFinite(width)) return undefined;
  return Math.round(Math.min(limits.maxSize, Math.max(limits.minSize, width)));
}

/** Validates saved widths: drops unknown, fixed, and non-numeric entries and clamps the rest. */
export function parseBookmarkColumnSizing(value: unknown): BookmarkColumnSizing {
  const sizing: BookmarkColumnSizing = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return sizing;
  for (const [id, width] of Object.entries(value)) {
    if (typeof width !== 'number') continue;
    const clamped = clampBookmarkColumnSize(id, width);
    if (clamped !== undefined) sizing[id] = clamped;
  }
  return sizing;
}

function getColumnWidth(columnId: string, sizing: BookmarkColumnSizing): number {
  const { enableResizing, size } = getBookmarkColumnSizeDef(columnId);
  return (enableResizing ? sizing[columnId] : undefined) ?? size ?? 0;
}

/**
 * Widths the table renders with. Until the user sizes Title, it takes whatever the visible
 * columns leave of `tableWidth`, but never less than its default size.
 */
export function getRenderedColumnSizing(
  sizing: BookmarkColumnSizing,
  visibleColumnIds: readonly string[],
  tableWidth: number | undefined,
): BookmarkColumnSizing {
  if (sizing[FILL_COLUMN_ID] !== undefined || !visibleColumnIds.includes(FILL_COLUMN_ID)) {
    return sizing;
  }
  const fillDefault = getResizableLimits(FILL_COLUMN_ID)?.size ?? 0;
  const othersWidth = visibleColumnIds
    .filter((id) => id !== FILL_COLUMN_ID)
    .reduce((total, id) => total + getColumnWidth(id, sizing), 0);
  // Round down so sub-pixel frame widths never add a horizontal scrollbar.
  const room = tableWidth === undefined ? 0 : Math.floor(tableWidth) - othersWidth;
  return {
    ...sizing,
    [FILL_COLUMN_ID]: clampBookmarkColumnSize(FILL_COLUMN_ID, Math.max(fillDefault, room)) ?? 0,
  };
}

/**
 * Turns a size update applied to the rendered widths back into saved widths. Widths are clamped,
 * a width equal to the column default is not saved, and Title keeps filling unless its width
 * actually changed (a click on its handle without dragging must not pin it).
 */
export function toSavedColumnSizing(
  next: BookmarkColumnSizing,
  rendered: BookmarkColumnSizing,
  saved: BookmarkColumnSizing,
): BookmarkColumnSizing {
  const result: BookmarkColumnSizing = {};
  for (const [id, width] of Object.entries(next)) {
    const clamped = clampBookmarkColumnSize(id, width);
    if (clamped === undefined) continue;
    if (id === FILL_COLUMN_ID) {
      if (saved[id] === undefined && clamped === rendered[id]) continue;
    } else if (clamped === getResizableLimits(id)?.size) {
      continue;
    }
    result[id] = clamped;
  }
  return result;
}
