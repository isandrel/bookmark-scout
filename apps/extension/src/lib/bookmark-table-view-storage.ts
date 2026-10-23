/**
 * The manager table's saved view, in two items: which columns show, their order, and the sort
 * sync (`STORAGE_ITEMS.tableView`), so the layout follows the user; column widths and the page
 * size stay on this device (`STORAGE_ITEMS.tableLayout`), since they suit one screen.
 *
 * Each item holds only the parts of the view the user changed in the manager (the columns shown,
 * their order, the sort, Browser order, the page size, the widths). Every other part follows the
 * defaults in Options > Behavior > Manager table (Default Columns, Default Rows per Page, Default
 * Sort), also when they change, and Reset view (in the manager or Options) removes both items, so
 * the whole view follows them again.
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

/** Whether a column can sort the table (Default Sort may only name these; unit tested). */
export function isSortableBookmarkColumn(columnId: string): boolean {
  return SORTABLE_COLUMN_IDS.has(columnId);
}

/**
 * Columns the View menu shows and hides (data columns the user may hide); Default Columns offers
 * these.
 */
export const HIDEABLE_COLUMN_IDS: readonly string[] = SAVED_COLUMNS.filter(
  (column) => column.accessor && column.enableHiding !== false,
).map((column) => column.id);

/** Columns that stay before every column the user may hide, such as the checkbox. */
const LEADING_FIXED_COLUMN_IDS: ReadonlySet<string> = new Set(
  BOOKMARK_TABLE_COLUMN_IDS.slice(
    0,
    BOOKMARK_TABLE_COLUMN_IDS.findIndex((id) => HIDEABLE_COLUMN_IDS.includes(id)),
  ),
);

/** Columns that stay after every column the user may hide, such as the row menu. */
const TRAILING_COLUMN_IDS: ReadonlySet<string> = (() => {
  const lastHideable = Math.max(
    ...HIDEABLE_COLUMN_IDS.map((id) => BOOKMARK_TABLE_COLUMN_IDS.indexOf(id)),
  );
  return new Set(BOOKMARK_TABLE_COLUMN_IDS.slice(lastHideable + 1));
})();

const columnsSchema = z.object({
  columnVisibility: z.record(z.string(), z.boolean()).optional(),
  columnOrder: z.array(z.string()).optional(),
  sorting: z.array(z.object({ id: z.string(), desc: z.boolean() })).optional(),
  browserOrder: z.boolean().optional(),
});

const layoutSchema = z.object({
  pageSize: managerPageSizeSchema.optional(),
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

/** The parts of the synced view the user changed in the manager. */
export type SavedBookmarkTableColumns = Partial<BookmarkTableColumns>;
/** The parts of this device's layout the user changed in the manager. */
export type SavedBookmarkTableLayout = Partial<BookmarkTableLayout>;

/** The settings a new view starts from. */
export type BookmarkTableDefaultSettings = Pick<
  Settings,
  'managerDefaultColumns' | 'managerDefaultPageSize' | 'managerDefaultSort'
>;

/**
 * A new view's column order for `shown` (Default Columns): columns that cannot be hidden (the
 * checkbox, the row menu) keep their registry place, and the other places take the configured
 * leading columns not in `shown` first (hidden until the user shows them), then `shown`, then the
 * rest in registry order.
 */
function defaultColumnOrder(shown: readonly string[]): string[] {
  const leading = LEADING_MANAGER_COLUMN_IDS.filter((id) => !shown.includes(id));
  const placed = [...leading, ...shown];
  const hideableInOrder = [...placed, ...HIDEABLE_COLUMN_IDS.filter((id) => !placed.includes(id))];
  let next = 0;
  return BOOKMARK_TABLE_COLUMN_IDS.map((id) =>
    HIDEABLE_COLUMN_IDS.includes(id) ? (hideableInOrder[next++] ?? id) : id,
  );
}

/** The view a new or reset table shows, from the Options defaults. */
export function getBookmarkTableViewDefaults(
  settings: BookmarkTableDefaultSettings,
): BookmarkTableView {
  const shown = [...new Set(settings.managerDefaultColumns)].filter((id) =>
    HIDEABLE_COLUMN_IDS.includes(id),
  );
  const sort = MANAGER_SORT_CHOICES[settings.managerDefaultSort];
  return {
    columnVisibility: Object.fromEntries(
      HIDEABLE_COLUMN_IDS.filter((id) => !shown.includes(id)).map((id) => [id, false]),
    ),
    columnOrder: defaultColumnOrder(shown),
    sorting: (sort?.sorting ?? []).filter(({ id }) => SORTABLE_COLUMN_IDS.has(id)),
    browserOrder: sort?.browserOrder ?? false,
    pageSize: settings.managerDefaultPageSize,
    columnSizing: {},
  };
}

/** The view a new table shows with every setting at its default. */
export const DEFAULT_BOOKMARK_TABLE_VIEW: BookmarkTableView =
  getBookmarkTableViewDefaults(defaultSettings);

const COLUMN_KEYS = [
  'columnVisibility',
  'columnOrder',
  'sorting',
  'browserOrder',
] as const satisfies readonly (keyof BookmarkTableColumns)[];
const LAYOUT_KEYS = [
  'pageSize',
  'columnSizing',
] as const satisfies readonly (keyof BookmarkTableLayout)[];

/** Every part of the view, each of which is either saved or follows the defaults. */
export const BOOKMARK_TABLE_VIEW_KEYS: readonly (keyof BookmarkTableView)[] = [
  ...COLUMN_KEYS,
  ...LAYOUT_KEYS,
];

/**
 * A saved column order with unknown and repeated columns left out. Columns the saved view does
 * not know join it in registry order, before the row menu (and any other column fixed at the
 * end), so they never land after it; a leading column (the Cover thumbnail) joins right after the
 * checkbox instead, where a new view has it.
 */
function normalizeColumnOrder(saved: readonly string[]): string[] {
  const seenColumns = new Set<string>();
  const columnOrder = saved.filter((id) => {
    if (!ALLOWED_COLUMN_IDS.has(id) || seenColumns.has(id)) return false;
    seenColumns.add(id);
    return true;
  });
  const missing = BOOKMARK_TABLE_COLUMN_IDS.filter((id) => !seenColumns.has(id));
  const hasFixedStart = columnOrder.some((id) => LEADING_FIXED_COLUMN_IDS.has(id));
  const leading = hasFixedStart
    ? missing.filter((id) => LEADING_MANAGER_COLUMN_IDS.includes(id))
    : [];
  const end = columnOrder.findIndex((id) => TRAILING_COLUMN_IDS.has(id));
  columnOrder.splice(
    end < 0 ? columnOrder.length : end,
    0,
    ...missing.filter((id) => !leading.includes(id)),
  );
  const lastFixed = columnOrder.reduce(
    (last, id, index) => (LEADING_FIXED_COLUMN_IDS.has(id) ? index : last),
    -1,
  );
  columnOrder.splice(lastFixed + 1, 0, ...leading);
  return columnOrder;
}

/**
 * Validates the synced parts. Unknown columns are discarded, while newly introduced columns are
 * placed by `normalizeColumnOrder`, so future releases can extend the table without invalidating
 * a saved view. Anything malformed reads as nothing saved.
 */
export function parseSavedBookmarkTableColumns(value: unknown): SavedBookmarkTableColumns {
  const parsed = columnsSchema.safeParse(value ?? {});
  if (!parsed.success) return {};
  const { columnVisibility, columnOrder, sorting, browserOrder } = parsed.data;
  const saved: SavedBookmarkTableColumns = {};
  if (columnVisibility) {
    saved.columnVisibility = Object.fromEntries(
      Object.entries(columnVisibility).filter(([id]) => ALLOWED_COLUMN_IDS.has(id)),
    );
  }
  if (columnOrder) saved.columnOrder = normalizeColumnOrder(columnOrder);
  if (sorting) {
    const seenSorting = new Set<string>();
    saved.sorting = sorting.filter(({ id }) => {
      if (!SORTABLE_COLUMN_IDS.has(id) || seenSorting.has(id)) return false;
      seenSorting.add(id);
      return true;
    });
  }
  if (browserOrder !== undefined) saved.browserOrder = browserOrder;
  return saved;
}

/** Validates this device's parts; a malformed page size reads as not saved. */
export function parseSavedBookmarkTableLayout(value: unknown): SavedBookmarkTableLayout {
  const parsed = layoutSchema.safeParse(value ?? {});
  if (!parsed.success) return {};
  const saved: SavedBookmarkTableLayout = {};
  if (parsed.data.pageSize !== undefined) saved.pageSize = parsed.data.pageSize;
  if (parsed.data.columnSizing !== undefined) {
    saved.columnSizing = parseBookmarkColumnSizing(parsed.data.columnSizing);
  }
  return saved;
}

/** The whole view: the saved parts over the defaults (column visibility entry by entry). */
export function resolveBookmarkTableView(
  columns: SavedBookmarkTableColumns,
  layout: SavedBookmarkTableLayout,
  defaults: BookmarkTableView = DEFAULT_BOOKMARK_TABLE_VIEW,
): BookmarkTableView {
  return {
    ...defaults,
    ...columns,
    ...layout,
    columnVisibility: { ...defaults.columnVisibility, ...columns.columnVisibility },
  };
}

/** The synced parts of `value` over `defaults`: what the table shows for a saved view. */
export function parseBookmarkTableColumns(
  value: unknown,
  defaults: BookmarkTableView = DEFAULT_BOOKMARK_TABLE_VIEW,
): BookmarkTableColumns {
  const { columnVisibility, columnOrder, sorting, browserOrder } = resolveBookmarkTableView(
    parseSavedBookmarkTableColumns(value),
    {},
    defaults,
  );
  return { columnVisibility, columnOrder, sorting, browserOrder };
}

/** This device's parts of `value` over `defaults`. */
export function parseBookmarkTableLayout(
  value: unknown,
  defaults: BookmarkTableView = DEFAULT_BOOKMARK_TABLE_VIEW,
): BookmarkTableLayout {
  const { pageSize, columnSizing } = resolveBookmarkTableView(
    {},
    parseSavedBookmarkTableLayout(value),
    defaults,
  );
  return { pageSize, columnSizing };
}

const isNothingSaved = (saved: object) => Object.keys(saved).length === 0;

/** Synced, so the columns and sort follow the user to other devices. */
export const bookmarkTableViewValue = defineStoredValue<SavedBookmarkTableColumns>(
  STORAGE_ITEMS.tableView,
  { parse: parseSavedBookmarkTableColumns, empty: {}, isEmpty: isNothingSaved },
);

/** This device's column widths and page size. */
export const bookmarkTableLayoutValue = defineStoredValue<SavedBookmarkTableLayout>(
  STORAGE_ITEMS.tableLayout,
  { parse: parseSavedBookmarkTableLayout, empty: {}, isEmpty: isNothingSaved },
);

/** Reads the view and its defaults before the manager's first render (`mountExtensionPage`). */
export function preloadBookmarkTableView(): Promise<unknown> {
  return Promise.all([
    preloadStoredValue(bookmarkTableViewValue),
    preloadStoredValue(bookmarkTableLayoutValue),
    preloadStoredValue(settingsValue),
  ]);
}

/**
 * The view as the page preloaded it, so the table opens with its columns, widths, and sort in
 * place; undefined until every part is read.
 */
export function readPreloadedBookmarkTableView(): BookmarkTableView | undefined {
  const columns = getStoredValueStore(bookmarkTableViewValue).getSnapshot();
  const layout = getStoredValueStore(bookmarkTableLayoutValue).getSnapshot();
  const settings = getStoredValueStore(settingsValue).getSnapshot();
  if (columns.isLoading || layout.isLoading || settings.isLoading) return undefined;
  return resolveBookmarkTableView(
    columns.value,
    layout.value,
    getBookmarkTableViewDefaults(settings.value),
  );
}

export async function getBookmarkTableView(): Promise<BookmarkTableView> {
  try {
    const [columns, layout, settings] = await Promise.all([
      bookmarkTableViewValue.get(),
      bookmarkTableLayoutValue.get(),
      getSettings(),
    ]);
    return resolveBookmarkTableView(columns, layout, getBookmarkTableViewDefaults(settings));
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
 * a change made in another manager tab to another part is kept. Stored parts no longer follow the
 * defaults.
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

/** Forgets every change made to the view, so it shows the defaults again everywhere. */
export async function resetBookmarkTableView(): Promise<void> {
  await bookmarkTableViewValue.clear();
  await bookmarkTableLayoutValue.clear();
}

/** Forgets the column widths the user set on this device, keeping the rest of the view. */
export async function resetBookmarkColumnWidths(): Promise<void> {
  await bookmarkTableLayoutValue.update(({ columnSizing: _widths, ...rest }) => rest);
}

/**
 * Which parts of the view follow the defaults in one table. A part the table changed is the
 * user's from then on (`own`), even before storage says so, so a defaults change arriving in
 * between never undoes it; a part that leaves storage afterwards (a reset in another tab or in
 * Options) follows the defaults again.
 */
export function createBookmarkTableViewFollower() {
  const owned = new Set<keyof BookmarkTableView>();
  let stored = new Set<keyof BookmarkTableView>();
  return {
    own(keys: readonly (keyof BookmarkTableView)[]) {
      for (const key of keys) owned.add(key);
    },
    /** The table was reset: every part follows the defaults again. */
    reset() {
      owned.clear();
    },
    /** The defaults for every part that is neither stored nor changed by this table. */
    follow(
      columns: SavedBookmarkTableColumns,
      layout: SavedBookmarkTableLayout,
      defaults: BookmarkTableView,
    ): Partial<BookmarkTableView> {
      const present = new Set([
        ...(Object.keys(columns) as (keyof BookmarkTableView)[]),
        ...(Object.keys(layout) as (keyof BookmarkTableView)[]),
      ]);
      for (const key of stored) if (!present.has(key)) owned.delete(key);
      stored = present;
      return pick(
        defaults,
        BOOKMARK_TABLE_VIEW_KEYS.filter((key) => !present.has(key) && !owned.has(key)),
      );
    },
  };
}
