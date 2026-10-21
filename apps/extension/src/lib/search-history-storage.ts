/**
 * Recent popup/side-panel search queries, kept on this device only.
 * Queries can reveal bookmark contents, so they stay in local storage and are never synced.
 */

/** Non-blank queries, newest first. */
export const searchHistoryValue = defineStoredValue<string[]>(STORAGE_ITEMS.searchHistory, {
  parse: (raw) =>
    Array.isArray(raw)
      ? raw.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      : [],
  empty: [],
});

export function getSearchHistory(): Promise<string[]> {
  return searchHistoryValue.get();
}

/**
 * Move the query to the front, dropping case-insensitive duplicates and the oldest past the
 * Recent Searches Kept setting.
 */
export async function addSearchHistoryEntry(query: string): Promise<string[]> {
  const entry = query.trim();
  if (!entry) return getSearchHistory();
  const key = entry.toLocaleLowerCase();
  const { searchHistoryMax } = await getSettings();
  return searchHistoryValue.update((current) =>
    [entry, ...current.filter((existing) => existing.toLocaleLowerCase() !== key)].slice(
      0,
      searchHistoryMax,
    ),
  );
}

export function clearSearchHistory(): Promise<void> {
  return searchHistoryValue.clear();
}
