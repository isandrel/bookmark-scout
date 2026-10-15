/**
 * The manager table's saved view, in two items: which columns show, their order, and the sort
 * sync (`STORAGE_ITEMS.tableView`), so the layout follows the user; column widths and the page
 * size stay on this device (`STORAGE_ITEMS.tableLayout`), since they suit one screen.
 */
import { z } from 'zod';

// The saved view covers every column in the registry (components/ui/table/columns.tsx) except
// filter-only ones, in registry order.
const SAVED_COLUMNS = BOOKMARK_COLUMNS.filter((column) => !column.internal);

export const BOOKMARK_TABLE_COLUMN_IDS: readonly string[] = SAVED_COLUMNS.map(
  (column) => column.id,
);

const SORTABLE_COLUMN_IDS = new Set(
  SAVED_COLUMNS.filter((column) => column.accessor && column.enableSorting !== false).map(
    (column) => column.id,
  ),
);
const ALLOWED_COLUMN_IDS = new Set<string>(BOOKMARK_TABLE_COLUMN_IDS);

/**
 * Columns the View menu shows and hides (data columns the user may hide); `default_columns` may
 * name only these (unit tested).
 */
export const HIDEABLE_COLUMN_IDS: readonly string[] = SAVED_COLUMNS.filter(
  (column) => column.accessor && column.enableHiding !== false,
).map((column) => column.id);

/**
 * A new view's column order: columns that cannot be hidden (the checkbox, the row menu) keep their
 * registry place, and the other places take the configured default columns first, then the rest
 * in registry order.
 */
const DEFAULT_COLUMN_ORDER: readonly string[] = (() => {
  const hideableInOrder = [
    ...DEFAULT_MANAGER_COLUMN_IDS,
    ...HIDEABLE_COLUMN_IDS.filter((id) => !DEFAULT_MANAGER_COLUMN_IDS.includes(id)),
  ];
  let next = 0;
  return BOOKMARK_TABLE_COLUMN_IDS.map((id) =>
    HIDEABLE_COLUMN_IDS.includes(id) ? (hideableInOrder[next++] ?? id) : id,
  );
})();

const columnsSchema = z.object({
  columnVisibility: z.record(z.string(), z.boolean()).default({}),
  columnOrder: z.array(z.string()).default([...DEFAULT_COLUMN_ORDER]),
  sorting: z.array(z.object({ id: z.string(), desc: z.boolean() })).default([]),
  browserOrder: z.boolean().default(false),
});

const layoutSchema = z.object({
  pageSize: managerPageSizeSchema.default(DEFAULT_MANAGER_PAGE_SIZE),
  // Parsed separately so one bad width drops that width instead of the whole layout.
  columnSizing: z.unknown().optional(),
});

/** What syncs: the columns shown, their order, and the sort. */
export type BookmarkTableColumns = {
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
  sorting: Array<{ id: string; desc: boolean }>;
  /** Show the current folder in the browser's own order so row moves are visible. */
  browserOrder: boolean;
};

/** What stays on this device. */
export type BookmarkTableLayout = {
  /** One of MANAGER_PAGE_SIZES. */
  pageSize: number;
  /** Widths of the columns the user resized, in pixels. */
  columnSizing: BookmarkColumnSizing;
};

export type BookmarkTableView = BookmarkTableColumns & BookmarkTableLayout;

const DEFAULT_COLUMNS: BookmarkTableColumns = {
  columnVisibility: Object.fromEntries(
    HIDEABLE_COLUMN_IDS.filter((id) => !DEFAULT_MANAGER_COLUMN_IDS.includes(id)).map((id) => [
      id,
      false,
    ]),
  ),
  columnOrder: [...DEFAULT_COLUMN_ORDER],
  sorting: [],
  browserOrder: false,
};

const DEFAULT_LAYOUT: BookmarkTableLayout = {
  pageSize: DEFAULT_MANAGER_PAGE_SIZE,
  columnSizing: {},
};

export const DEFAULT_BOOKMARK_TABLE_VIEW: BookmarkTableView = {
  ...DEFAULT_COLUMNS,
  ...DEFAULT_LAYOUT,
};

const COLUMN_KEYS = Object.keys(DEFAULT_COLUMNS) as (keyof BookmarkTableColumns)[];
const LAYOUT_KEYS = Object.keys(DEFAULT_LAYOUT) as (keyof BookmarkTableLayout)[];

/**
 * Validates the synced columns. Unknown columns are discarded, while newly introduced columns are
 * appended in their default order so future releases can extend the table without invalidating
 * a saved view. Anything malformed reads as the default.
 */
export function parseBookmarkTableColumns(value: unknown): BookmarkTableColumns {
  const parsed = columnsSchema.safeParse(value ?? {});
  if (!parsed.success) return structuredClone(DEFAULT_COLUMNS);

  const seenColumns = new Set<string>();
  const columnOrder = parsed.data.columnOrder.filter((id) => {
    if (!ALLOWED_COLUMN_IDS.has(id) || seenColumns.has(id)) return false;
    seenColumns.add(id);
    return true;
  });
  for (const id of BOOKMARK_TABLE_COLUMN_IDS) {
    if (!seenColumns.has(id)) columnOrder.push(id);
  }

  const columnVisibility = { ...DEFAULT_COLUMNS.columnVisibility };
  for (const [id, visible] of Object.entries(parsed.data.columnVisibility)) {
    if (ALLOWED_COLUMN_IDS.has(id)) columnVisibility[id] = visible;
  }

  const seenSorting = new Set<string>();
  const sorting = parsed.data.sorting.filter(({ id }) => {
    if (!SORTABLE_COLUMN_IDS.has(id) || seenSorting.has(id)) return false;
    seenSorting.add(id);
    return true;
  });

  return { columnVisibility, columnOrder, sorting, browserOrder: parsed.data.browserOrder };
}

/** Validates this device's layout; a malformed page size reads as the default. */
export function parseBookmarkTableLayout(value: unknown): BookmarkTableLayout {
  const parsed = layoutSchema.safeParse(value ?? {});
  if (!parsed.success) return structuredClone(DEFAULT_LAYOUT);
  return {
    pageSize: parsed.data.pageSize,
    columnSizing: parseBookmarkColumnSizing(parsed.data.columnSizing),
  };
}

/** Synced, so the columns and sort follow the user to other devices. */
export const bookmarkTableViewValue = defineStoredValue<BookmarkTableColumns>(
  STORAGE_ITEMS.tableView,
  {
    parse: parseBookmarkTableColumns,
    empty: DEFAULT_COLUMNS,
    isEmpty: (columns) => isSameJson(columns, DEFAULT_COLUMNS),
  },
);

/** This device's column widths and page size. */
export const bookmarkTableLayoutValue = defineStoredValue<BookmarkTableLayout>(
  STORAGE_ITEMS.tableLayout,
  {
    parse: parseBookmarkTableLayout,
    empty: DEFAULT_LAYOUT,
    isEmpty: (layout) => isSameJson(layout, DEFAULT_LAYOUT),
  },
);

export async function getBookmarkTableView(): Promise<BookmarkTableView> {
  try {
    const [columns, layout] = await Promise.all([
      bookmarkTableViewValue.get(),
      bookmarkTableLayoutValue.get(),
    ]);
    return { ...columns, ...layout };
  } catch (error) {
    uiLogger.error({ error }, 'Error reading bookmark table view');
    return structuredClone(DEFAULT_BOOKMARK_TABLE_VIEW);
  }
}

const pick = <K extends keyof BookmarkTableView>(
  changes: Partial<BookmarkTableView>,
  keys: readonly K[],
): Partial<Pick<BookmarkTableView, K>> =>
  Object.fromEntries(
    keys.filter((key) => key in changes).map((key) => [key, changes[key]]),
  ) as Partial<Pick<BookmarkTableView, K>>;

/**
 * Stores the parts of the view that changed, each in its item, on top of what is stored now, so
 * a change made in another manager tab to another part is kept.
 */
export async function updateBookmarkTableView(changes: Partial<BookmarkTableView>): Promise<void> {
  const columns = pick(changes, COLUMN_KEYS);
  const layout = pick(changes, LAYOUT_KEYS);
  if (Object.keys(columns).length > 0) {
    await bookmarkTableViewValue.update((current) => ({ ...current, ...columns }));
  }
  if (Object.keys(layout).length > 0) {
    await bookmarkTableLayoutValue.update((current) => ({ ...current, ...layout }));
  }
}

export async function resetBookmarkTableView(): Promise<void> {
  await bookmarkTableViewValue.clear();
  await bookmarkTableLayoutValue.clear();
}
