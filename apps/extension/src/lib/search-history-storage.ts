/**
 * Recent popup/side-panel search queries, kept on this device only.
 * Queries can reveal bookmark contents, so they stay in local storage and are never synced.
 */

export const MAX_SEARCH_HISTORY_ENTRIES = 10;

export const searchHistoryItem = storage.defineItem<string[]>(
  'local:bookmark-scout-search-history',
  { fallback: [] },
);

function normalizeHistory(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    : [];
}

export async function getSearchHistory(): Promise<string[]> {
  return normalizeHistory(await searchHistoryItem.getValue());
}

/** Move the query to the front, dropping case-insensitive duplicates and the oldest overflow. */
export async function addSearchHistoryEntry(query: string): Promise<string[]> {
  const entry = query.trim();
  const current = await getSearchHistory();
  if (!entry) return current;

  const key = entry.toLocaleLowerCase();
  const updated = [
    entry,
    ...current.filter((existing) => existing.toLocaleLowerCase() !== key),
  ].slice(0, MAX_SEARCH_HISTORY_ENTRIES);
  await searchHistoryItem.setValue(updated);
  return updated;
}

export async function clearSearchHistory(): Promise<void> {
  await searchHistoryItem.removeValue();
}

export function watchSearchHistory(callback: (history: string[]) => void): () => void {
  return searchHistoryItem.watch((value) => callback(normalizeHistory(value)));
}
