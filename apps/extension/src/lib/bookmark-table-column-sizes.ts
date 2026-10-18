import { z } from 'zod';

/** Saved widths in pixels, keyed by column id. Only columns the user resized are present. */
export type BookmarkColumnSizing = Record<string, number>;

type ColumnSizeLimits = { size: number; minSize: number; maxSize: number };

const columnLimits = readConfig(
  'limits/table-columns',
  z.strictObject({
    max_column_width: z.number().int().positive(),
    column_resize_step: z.number().int().positive(),
  }),
);

const MAX_COLUMN_WIDTH = columnLimits.max_column_width;

// Widths come from each column's `size` in the column registry (components/ui/table/columns.tsx).
// The registry is read inside these functions, never at module load, because it imports lib
// helpers itself.

function getResizableLimits(columnId: string): ColumnSizeLimits | undefined {
  const size = findBookmarkColumn(columnId)?.size;
  return size && 'minSize' in size ? { ...size, maxSize: MAX_COLUMN_WIDTH } : undefined;
}

/** A resizable column's share of the spare width (`fillWeight` in the registry), or 0. */
function getFillWeight(columnId: string): number {
  return getResizableLimits(columnId) ? (findBookmarkColumn(columnId)?.fillWeight ?? 0) : 0;
}

/** Pixels one ArrowLeft/ArrowRight press on a resize handle changes a column by. */
export const COLUMN_RESIZE_KEYBOARD_STEP = columnLimits.column_resize_step;

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
  if (!isPlainObject(value)) return sizing;
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
 * Splits `room` between fill columns by their weights. A column whose share would be below its
 * default size gets that size and the rest is shared again by the others; rounding leftovers go
 * to the first column, so the widths add up to the room exactly.
 */
function shareFillRoom(room: number, columnIds: readonly string[]): BookmarkColumnSizing {
  const widths: BookmarkColumnSizing = {};
  const fillDefault = (id: string) => getResizableLimits(id)?.size ?? 0;
  const totalWeight = (ids: readonly string[]) =>
    ids.reduce((total, id) => total + getFillWeight(id), 0);
  let open = [...columnIds];
  let left = room;
  while (open.length > 0) {
    const weight = totalWeight(open);
    const atDefault = open.filter((id) => (left * getFillWeight(id)) / weight < fillDefault(id));
    if (atDefault.length === 0) break;
    for (const id of atDefault) {
      widths[id] = fillDefault(id);
      left -= widths[id];
    }
    open = open.filter((id) => !atDefault.includes(id));
  }
  const weight = totalWeight(open);
  let given = 0;
  for (const id of open) {
    widths[id] = Math.floor((left * getFillWeight(id)) / weight);
    given += widths[id];
  }
  if (open[0] !== undefined) widths[open[0]] += left - given;
  for (const id of columnIds) widths[id] = clampBookmarkColumnSize(id, widths[id] ?? 0) ?? 0;
  return widths;
}

/**
 * Widths the table renders with. Until the user sizes them, the fill columns (Title and URL)
 * share whatever the other visible columns leave of `tableWidth` by their weights, but never
 * go below their default sizes.
 */
export function getRenderedColumnSizing(
  sizing: BookmarkColumnSizing,
  visibleColumnIds: readonly string[],
  tableWidth: number | undefined,
): BookmarkColumnSizing {
  const filling = visibleColumnIds.filter(
    (id) => sizing[id] === undefined && getFillWeight(id) > 0,
  );
  if (filling.length === 0) return sizing;
  const othersWidth = visibleColumnIds
    .filter((id) => !filling.includes(id))
    .reduce((total, id) => total + getColumnWidth(id, sizing), 0);
  // Round down so sub-pixel frame widths never add a horizontal scrollbar.
  const room = tableWidth === undefined ? 0 : Math.floor(tableWidth) - othersWidth;
  return { ...sizing, ...shareFillRoom(room, filling) };
}

/**
 * Turns a size update applied to the rendered widths back into saved widths. Widths are clamped,
 * a width equal to the column default is not saved, and a fill column keeps filling unless its
 * width actually changed (a click on its handle without dragging must not pin it).
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
    if (getFillWeight(id) > 0) {
      if (saved[id] === undefined && clamped === rendered[id]) continue;
    } else if (clamped === getResizableLimits(id)?.size) {
      continue;
    }
    result[id] = clamped;
  }
  return result;
}
