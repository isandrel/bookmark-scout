/** Saved widths in pixels, keyed by column id. Only columns the user resized are present. */
export type BookmarkColumnSizing = Record<string, number>;

type ColumnSizeLimits = { size: number; minSize: number; maxSize: number };

const MAX_COLUMN_WIDTH = 1200;

// Defaults are chosen so every default column fits at the narrowest width that still shows it
// (see SPACE_HIDDEN_COLUMNS in bookmark-manager-data.ts), with Title at its fill minimum.
const RESIZABLE_COLUMN_SIZES: Record<string, ColumnSizeLimits> = {
  type: { size: 120, minSize: 70, maxSize: MAX_COLUMN_WIDTH },
  id: { size: 100, minSize: 60, maxSize: MAX_COLUMN_WIDTH },
  parentId: { size: 180, minSize: 80, maxSize: MAX_COLUMN_WIDTH },
  folderPath: { size: 180, minSize: 80, maxSize: MAX_COLUMN_WIDTH },
  url: { size: 200, minSize: 80, maxSize: MAX_COLUMN_WIDTH },
  // Title fills the room the other columns leave until the user sizes it; `size` is the narrowest
  // it fills to, and `minSize` keeps a resized Title readable.
  title: { size: 160, minSize: 120, maxSize: MAX_COLUMN_WIDTH },
  dateAdded: { size: 190, minSize: 100, maxSize: MAX_COLUMN_WIDTH },
  dateGroupModified: { size: 190, minSize: 100, maxSize: MAX_COLUMN_WIDTH },
  unmodifiable: { size: 130, minSize: 80, maxSize: MAX_COLUMN_WIDTH },
};

// The checkbox and row-menu columns never resize.
const FIXED_COLUMN_SIZES: Record<string, number> = { select: 40, actions: 68 };

/** The column that absorbs spare width while it has no saved size. */
export const FILL_COLUMN_ID = 'title';

/** Pixels one ArrowLeft/ArrowRight press on a resize handle changes a column by. */
export const COLUMN_RESIZE_KEYBOARD_STEP = 10;

/** Column definition sizing for a table column id (fixed or resizable). */
export function getBookmarkColumnSizeDef(columnId: string): {
  size: number;
  minSize: number;
  maxSize: number;
  enableResizing: boolean;
} {
  const fixed = FIXED_COLUMN_SIZES[columnId];
  if (fixed !== undefined) {
    return { size: fixed, minSize: fixed, maxSize: fixed, enableResizing: false };
  }
  const limits = RESIZABLE_COLUMN_SIZES[columnId];
  if (!limits) return { size: 0, minSize: 0, maxSize: 0, enableResizing: false };
  return { ...limits, enableResizing: true };
}

/** Clamps a width to the column's limits; `undefined` for columns that cannot be resized. */
export function clampBookmarkColumnSize(columnId: string, width: number): number | undefined {
  const limits = RESIZABLE_COLUMN_SIZES[columnId];
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
  const fixed = FIXED_COLUMN_SIZES[columnId];
  if (fixed !== undefined) return fixed;
  const saved = sizing[columnId];
  return saved ?? RESIZABLE_COLUMN_SIZES[columnId]?.size ?? 0;
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
  const fillDefault = RESIZABLE_COLUMN_SIZES[FILL_COLUMN_ID].size;
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
    } else if (clamped === RESIZABLE_COLUMN_SIZES[id].size) {
      continue;
    }
    result[id] = clamped;
  }
  return result;
}
