import { z } from 'zod';

export const BOOKMARK_TABLE_VIEW_STORAGE_KEY = 'bookmark-scout-table-view';

export const BOOKMARK_TABLE_COLUMN_IDS = [
  'select',
  'type',
  'id',
  'parentId',
  'folderPath',
  'url',
  'title',
  'dateAdded',
  'dateGroupModified',
  'unmodifiable',
  'actions',
] as const;

const SORTABLE_COLUMN_IDS = new Set(
  BOOKMARK_TABLE_COLUMN_IDS.filter((id) => id !== 'select' && id !== 'actions'),
);
const ALLOWED_COLUMN_IDS = new Set<string>(BOOKMARK_TABLE_COLUMN_IDS);

const tableViewSchema = z.object({
  version: z.literal(1).default(1),
  columnVisibility: z.record(z.string(), z.boolean()).default({}),
  columnOrder: z.array(z.string()).default([...BOOKMARK_TABLE_COLUMN_IDS]),
  pageSize: z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(40), z.literal(50)]).default(10),
  sorting: z
    .array(z.object({ id: z.string(), desc: z.boolean() }))
    .default([]),
  browserOrder: z.boolean().default(false),
});

export type BookmarkTableView = {
  version: 1;
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
  pageSize: 10 | 20 | 30 | 40 | 50;
  sorting: Array<{ id: string; desc: boolean }>;
  /** Show the current folder in the browser's own order so row moves are visible. */
  browserOrder: boolean;
};

/**
 * `version` above is the payload's own schema version, not a WXT item version, so no
 * `$` metadata key is written. Reads go through `parseBookmarkTableView`.
 */
export const bookmarkTableViewItem = storage.defineItem<BookmarkTableView>(
  `sync:${BOOKMARK_TABLE_VIEW_STORAGE_KEY}`,
);

export const DEFAULT_BOOKMARK_TABLE_VIEW: BookmarkTableView = {
  version: 1,
  columnVisibility: {
    id: false,
    parentId: false,
    dateGroupModified: false,
    unmodifiable: false,
  },
  columnOrder: [...BOOKMARK_TABLE_COLUMN_IDS],
  pageSize: 10,
  sorting: [],
  browserOrder: false,
};

function cloneDefaultTableView(): BookmarkTableView {
  return {
    ...DEFAULT_BOOKMARK_TABLE_VIEW,
    columnVisibility: { ...DEFAULT_BOOKMARK_TABLE_VIEW.columnVisibility },
    columnOrder: [...DEFAULT_BOOKMARK_TABLE_VIEW.columnOrder],
    sorting: [],
  };
}

/**
 * Validates persisted state and migrates the original unversioned shape to version 1.
 * Unknown columns are discarded, while newly introduced columns are appended in their
 * default order so future releases can extend the table without invalidating a saved view.
 */
export function parseBookmarkTableView(value: unknown): BookmarkTableView {
  const parsed = tableViewSchema.safeParse(value);
  if (!parsed.success) return cloneDefaultTableView();

  const seenColumns = new Set<string>();
  const columnOrder = parsed.data.columnOrder.filter((id) => {
    if (!ALLOWED_COLUMN_IDS.has(id) || seenColumns.has(id)) return false;
    seenColumns.add(id);
    return true;
  });
  for (const id of BOOKMARK_TABLE_COLUMN_IDS) {
    if (!seenColumns.has(id)) columnOrder.push(id);
  }

  const columnVisibility = { ...DEFAULT_BOOKMARK_TABLE_VIEW.columnVisibility };
  for (const [id, visible] of Object.entries(parsed.data.columnVisibility)) {
    if (ALLOWED_COLUMN_IDS.has(id)) columnVisibility[id] = visible;
  }

  const seenSorting = new Set<string>();
  const sorting = parsed.data.sorting.filter(({ id }) => {
    if (!SORTABLE_COLUMN_IDS.has(id) || seenSorting.has(id)) return false;
    seenSorting.add(id);
    return true;
  });

  return {
    version: 1,
    columnVisibility,
    columnOrder,
    pageSize: parsed.data.pageSize,
    sorting,
    browserOrder: parsed.data.browserOrder,
  };
}

export async function getBookmarkTableView(): Promise<BookmarkTableView> {
  try {
    return parseBookmarkTableView(await bookmarkTableViewItem.getValue());
  } catch (error) {
    console.error('Error reading bookmark table view:', error);
    return cloneDefaultTableView();
  }
}

export async function saveBookmarkTableView(view: BookmarkTableView): Promise<void> {
  await bookmarkTableViewItem.setValue(parseBookmarkTableView(view));
}

export async function resetBookmarkTableView(): Promise<void> {
  await saveBookmarkTableView(cloneDefaultTableView());
}
