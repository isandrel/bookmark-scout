/**
 * Recent popup/side-panel search queries, kept on this device only.
 * Queries can reveal bookmark contents, so they stay in local storage and are never synced.
 */

import { z } from 'zod';

export const MAX_SEARCH_HISTORY_ENTRIES = readConfig(
  'limits/search-history',
  z.strictObject({ max_entries: z.number().int().positive() }),
).max_entries;

/** Non-blank queries, newest first. */
export const searchHistoryValue = defineStoredValue<string[]>({
  key: STORAGE_KEYS.searchHistory,
  parse: (raw) =>
    Array.isArray(raw)
      ? raw.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      : [],
  empty: [],
});

export function getSearchHistory(): Promise<string[]> {
  return searchHistoryValue.get();
}

/** Move the query to the front, dropping case-insensitive duplicates and the oldest overflow. */
export function addSearchHistoryEntry(query: string): Promise<string[]> {
  const entry = query.trim();
  if (!entry) return getSearchHistory();
  const key = entry.toLocaleLowerCase();
  return searchHistoryValue.update((current) =>
    [entry, ...current.filter((existing) => existing.toLocaleLowerCase() !== key)].slice(
      0,
      MAX_SEARCH_HISTORY_ENTRIES,
    ),
  );
}

export function clearSearchHistory(): Promise<void> {
  return searchHistoryValue.clear();
}
