/**
 * The query a saved search keeps: the manager table's filters, sort, and folder scope. A saved
 * search stores only this definition, never bookmarks, so opening it filters the live bookmark
 * tree and its results follow every later change.
 */

import type { ColumnFiltersState, SortingState } from '@tanstack/react-table';
import { z } from 'zod';

const queryLimits = readConfig(
  'limits/saved-search-query',
  z.strictObject({
    text_max_length: z.number().int().positive(),
    value_list_max_length: z.number().int().positive(),
    value_max_length: z.number().int().positive(),
    sorting_max_length: z.number().int().positive(),
  }),
);

/** Longest title or URL filter text a saved search keeps. */
export const SAVED_SEARCH_TEXT_MAX_LENGTH = queryLimits.text_max_length;
const VALUE_LIST_MAX_LENGTH = queryLimits.value_list_max_length;
const VALUE_MAX_LENGTH = queryLimits.value_max_length;
const SORTING_MAX_LENGTH = queryLimits.sorting_max_length;

const textSchema = z.string().trim().min(1).max(SAVED_SEARCH_TEXT_MAX_LENGTH);
const valueListSchema = z
  .array(z.string().min(1).max(VALUE_MAX_LENGTH))
  .min(1)
  .max(VALUE_LIST_MAX_LENGTH);
const timestampSchema = z.number().finite();

const filtersSchema = z.object({
  title: textSchema.optional(),
  url: textSchema.optional(),
  type: z
    .array(z.enum(['folder', 'link']))
    .min(1)
    .max(2)
    .optional(),
  parentId: valueListSchema.optional(),
  domain: valueListSchema.optional(),
  dateAdded: z
    .object({ from: timestampSchema.optional(), to: timestampSchema.optional() })
    .refine((range) => range.from !== undefined || range.to !== undefined)
    .optional(),
});

export const savedSearchQuerySchema = z.object({
  filters: filtersSchema,
  sorting: z
    .array(z.object({ id: z.string(), desc: z.boolean() }))
    .max(SORTING_MAX_LENGTH)
    .default([]),
  // Set when results are limited to one folder ("Current folder only"); null is the top level.
  folderId: z.string().min(1).max(VALUE_MAX_LENGTH).nullable().optional(),
});

export type SavedSearchFilters = {
  title?: string;
  url?: string;
  type?: Array<'folder' | 'link'>;
  /** Folder IDs; they are local to this browser profile and may go stale. */
  parentId?: string[];
  domain?: string[];
  /** Epoch milliseconds of the selected days. */
  dateAdded?: { from?: number; to?: number };
};

export type SavedSearchQuery = {
  filters: SavedSearchFilters;
  sorting: Array<{ id: string; desc: boolean }>;
  /** Present when the search is limited to one folder; null is the top level. */
  folderId?: string | null;
};

const SORTABLE_COLUMN_IDS = new Set(
  BOOKMARK_COLUMNS.filter(
    (column) => !column.internal && column.accessor && column.enableSorting !== false,
  ).map((column) => column.id),
);

type FilterCodec = {
  /** Table filter value to its stored form, or undefined when it does not filter. */
  toStored: (value: unknown) => unknown;
  /** Stored form back to the table filter value. */
  toTable: (value: never) => unknown;
};

const uniqueSorted = (values: string[]) => [...new Set(values)].sort();

const textCodec: FilterCodec = {
  toStored: (value) => {
    const text = typeof value === 'string' ? value.trim() : '';
    return text ? text.slice(0, SAVED_SEARCH_TEXT_MAX_LENGTH) : undefined;
  },
  toTable: (value: string) => value,
};

const valueListCodec: FilterCodec = {
  toStored: (value) => {
    const values = Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
      : [];
    return values.length ? uniqueSorted(values) : undefined;
  },
  toTable: (value: string[]) => [...value],
};

const toTimestamp = (value: unknown) =>
  value instanceof Date && Number.isFinite(value.getTime()) ? value.getTime() : undefined;

const dateRangeCodec: FilterCodec = {
  toStored: (value) => {
    const range = (value ?? {}) as { from?: unknown; to?: unknown };
    const from = toTimestamp(range.from);
    const to = toTimestamp(range.to);
    if (from === undefined && to === undefined) return undefined;
    return { ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) };
  },
  toTable: (value: { from?: number; to?: number }) => ({
    from: value.from !== undefined ? new Date(value.from) : undefined,
    to: value.to !== undefined ? new Date(value.to) : undefined,
  }),
};

// Table filter column → how it is stored. Filters on other columns are not saved. The order here
// is the stored key order, so equal queries serialize identically.
const FILTER_CODECS: Record<keyof SavedSearchFilters, FilterCodec> = {
  title: textCodec,
  url: textCodec,
  type: valueListCodec,
  parentId: valueListCodec,
  domain: valueListCodec,
  dateAdded: dateRangeCodec,
};
const FILTER_IDS = Object.keys(FILTER_CODECS) as Array<keyof SavedSearchFilters>;

function normalizeSorting(sorting: readonly { id: string; desc: boolean }[]) {
  const seen = new Set<string>();
  return sorting
    .filter(({ id }) => {
      if (!SORTABLE_COLUMN_IDS.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map(({ id, desc }) => ({ id, desc }));
}

/** Rebuilds a query in canonical key and value order. */
function normalizeQuery(query: SavedSearchQuery): SavedSearchQuery {
  const filters: SavedSearchFilters = {};
  for (const id of FILTER_IDS) {
    const value = query.filters[id];
    if (value === undefined) continue;
    const normalized = Array.isArray(value) ? uniqueSorted(value) : value;
    Object.assign(filters, { [id]: normalized });
  }
  if (filters.dateAdded) {
    const { from, to } = filters.dateAdded;
    filters.dateAdded = {
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
    };
  }
  return {
    filters,
    sorting: normalizeSorting(query.sorting),
    ...(query.folderId !== undefined ? { folderId: query.folderId } : {}),
  };
}

/** Validates a stored query; null when it is malformed. Unknown sort columns are dropped. */
export function parseSavedSearchQuery(value: unknown): SavedSearchQuery | null {
  const parsed = savedSearchQuerySchema.safeParse(value);
  return parsed.success ? normalizeQuery(parsed.data) : null;
}

export type ManagerQueryState = {
  columnFilters: ColumnFiltersState;
  sorting: SortingState;
  currentFolderOnly: boolean;
  /** The folder the manager shows; null is the top level. */
  currentFolderId: string | null;
};

/** The saveable query of the manager's current filters, sort, and scope. */
export function captureSavedSearchQuery(state: ManagerQueryState): SavedSearchQuery {
  const filters: SavedSearchFilters = {};
  for (const { id, value } of state.columnFilters) {
    if (!(id in FILTER_CODECS)) continue;
    const stored = FILTER_CODECS[id as keyof SavedSearchFilters].toStored(value);
    if (stored !== undefined) Object.assign(filters, { [id]: stored });
  }
  return normalizeQuery({
    filters,
    sorting: state.sorting,
    ...(state.currentFolderOnly ? { folderId: state.currentFolderId } : {}),
  });
}

/** Whether a query filters anything; only those are worth saving. */
export function hasSavedSearchFilters(query: SavedSearchQuery): boolean {
  return Object.keys(query.filters).length > 0;
}

/** Whether two queries select and order the same results. */
export function isSameSavedSearchQuery(left: SavedSearchQuery, right: SavedSearchQuery): boolean {
  return isSameJson(normalizeQuery(left), normalizeQuery(right));
}

export type ResolvedSavedSearch = {
  columnFilters: ColumnFiltersState;
  sorting: SortingState;
  /** Folder to limit results to (null is the top level), or undefined to search everything. */
  folderId: string | null | undefined;
  /** Folders the query names that no longer exist; they are skipped. */
  missingFolderCount: number;
};

/**
 * Turns a saved query into table state against the current bookmark tree. Folder IDs that no
 * longer exist (the folder was deleted, or the search came from another profile) are skipped
 * rather than matching nothing, and counted so the user can be told.
 */
export function resolveSavedSearchQuery(
  query: SavedSearchQuery,
  existingFolderIds: ReadonlySet<string>,
): ResolvedSavedSearch {
  let missingFolderCount = 0;
  const columnFilters: ColumnFiltersState = [];
  for (const id of FILTER_IDS) {
    let value: unknown = query.filters[id];
    if (value === undefined) continue;
    if (id === 'parentId') {
      const folderIds = value as string[];
      const kept = folderIds.filter((folderId) => existingFolderIds.has(folderId));
      missingFolderCount += folderIds.length - kept.length;
      if (kept.length === 0) continue;
      value = kept;
    }
    columnFilters.push({ id, value: FILTER_CODECS[id].toTable(value as never) });
  }

  let folderId = query.folderId;
  if (typeof folderId === 'string' && !existingFolderIds.has(folderId)) {
    missingFolderCount += 1;
    folderId = undefined;
  }

  return {
    columnFilters,
    sorting: normalizeSorting(query.sorting),
    folderId,
    missingFolderCount,
  };
}
