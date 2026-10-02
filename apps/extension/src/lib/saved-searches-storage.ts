/**
 * Saved searches for the bookmark manager ("smart views"): named queries that are evaluated
 * against the live bookmark tree each time they are opened.
 *
 * They stay in local storage and are never synced: their title and URL filters can reveal
 * bookmark contents (like the popup search history), and the folder IDs they name are local to
 * this browser profile, so on another device they would point at different folders.
 */

import { z } from 'zod';

export const SAVED_SEARCHES_STORAGE_KEY = 'bookmark-scout-saved-searches';
export const MAX_SAVED_SEARCHES = 50;
export const SAVED_SEARCH_NAME_MAX_LENGTH = 80;

export type SavedSearch = {
  id: string;
  name: string;
  createdAt: number;
  query: SavedSearchQuery;
};

export type SavedSearchesPayload = {
  version: 1;
  searches: SavedSearch[];
};

/**
 * `version` is the payload's own schema version, so no WXT `$` metadata key is written.
 * Reads go through `parseSavedSearches`.
 */
export const savedSearchesItem = storage.defineItem<SavedSearchesPayload>(
  `local:${SAVED_SEARCHES_STORAGE_KEY}`,
);

const nameSchema = z.string().trim().min(1).max(SAVED_SEARCH_NAME_MAX_LENGTH);

const savedSearchSchema = z.object({
  id: z.string().min(1).max(100),
  name: nameSchema,
  createdAt: z.number().finite(),
  query: z.unknown(),
});

// A payload without `version` is read as version 1, so the first schema needs no migration.
const payloadSchema = z.object({
  version: z.literal(1).default(1),
  searches: z.array(z.unknown()),
});

const nameKey = (name: string) => name.trim().toLocaleLowerCase();

/**
 * Validates stored saved searches. A malformed payload or an unsupported version yields an empty
 * list; a malformed entry, a repeated ID, and anything past the limit are dropped one by one, so
 * one bad entry never hides the others or breaks the manager.
 */
export function parseSavedSearches(value: unknown): SavedSearch[] {
  const payload = payloadSchema.safeParse(value);
  if (!payload.success) return [];

  const searches: SavedSearch[] = [];
  const seenIds = new Set<string>();
  for (const entry of payload.data.searches) {
    const parsed = savedSearchSchema.safeParse(entry);
    if (!parsed.success || seenIds.has(parsed.data.id)) continue;
    const query = parseSavedSearchQuery(parsed.data.query);
    if (!query) continue;
    seenIds.add(parsed.data.id);
    searches.push({ ...parsed.data, query });
    if (searches.length === MAX_SAVED_SEARCHES) break;
  }
  return searches;
}

export async function getSavedSearches(): Promise<SavedSearch[]> {
  try {
    return parseSavedSearches(await savedSearchesItem.getValue());
  } catch (error) {
    console.error('Error reading saved searches:', error);
    return [];
  }
}

export function watchSavedSearches(callback: (searches: SavedSearch[]) => void): () => void {
  return savedSearchesItem.watch((value) => callback(parseSavedSearches(value)));
}

async function writeSavedSearches(searches: SavedSearch[]): Promise<SavedSearch[]> {
  await savedSearchesItem.setValue({ version: 1, searches });
  return searches;
}

export type SavedSearchError =
  | 'empty-name'
  | 'duplicate-name'
  | 'limit'
  | 'invalid-query'
  | 'not-found';

export type SavedSearchResult =
  | { ok: true; searches: SavedSearch[]; search: SavedSearch }
  | { ok: false; error: SavedSearchError };

function validateName(
  name: string,
  searches: readonly SavedSearch[],
  ignoreId?: string,
): { name: string } | { error: SavedSearchError } {
  const trimmed = name.trim().slice(0, SAVED_SEARCH_NAME_MAX_LENGTH).trim();
  if (!trimmed) return { error: 'empty-name' };
  const key = nameKey(trimmed);
  const taken = searches.some((search) => search.id !== ignoreId && nameKey(search.name) === key);
  return taken ? { error: 'duplicate-name' } : { name: trimmed };
}

/** Adds a saved search to the end of the list. Names are unique, ignoring case. */
export function addSavedSearch(
  searches: readonly SavedSearch[],
  input: { name: string; query: SavedSearchQuery },
  { id = crypto.randomUUID(), now = Date.now() }: { id?: string; now?: number } = {},
): SavedSearchResult {
  if (searches.length >= MAX_SAVED_SEARCHES) return { ok: false, error: 'limit' };
  const validated = validateName(input.name, searches);
  if ('error' in validated) return { ok: false, error: validated.error };
  const query = parseSavedSearchQuery(input.query);
  if (!query || !hasSavedSearchFilters(query)) return { ok: false, error: 'invalid-query' };
  const search: SavedSearch = { id, name: validated.name, createdAt: now, query };
  return { ok: true, searches: [...searches, search], search };
}

export function renameSavedSearchInList(
  searches: readonly SavedSearch[],
  id: string,
  newName: string,
): SavedSearchResult {
  const existing = searches.find((search) => search.id === id);
  if (!existing) return { ok: false, error: 'not-found' };
  const validated = validateName(newName, searches, id);
  if ('error' in validated) return { ok: false, error: validated.error };
  const search = { ...existing, name: validated.name };
  return {
    ok: true,
    searches: searches.map((entry) => (entry.id === id ? search : entry)),
    search,
  };
}

async function updateSavedSearches(
  change: (searches: SavedSearch[]) => SavedSearchResult,
): Promise<SavedSearchResult> {
  const result = change(await getSavedSearches());
  if (result.ok) await writeSavedSearches(result.searches);
  return result;
}

export function createSavedSearch(name: string, query: SavedSearchQuery) {
  return updateSavedSearches((searches) => addSavedSearch(searches, { name, query }));
}

export function renameSavedSearch(id: string, name: string) {
  return updateSavedSearches((searches) => renameSavedSearchInList(searches, id, name));
}

export async function deleteSavedSearch(id: string): Promise<SavedSearch[]> {
  const searches = await getSavedSearches();
  return writeSavedSearches(searches.filter((search) => search.id !== id));
}

/** Puts a deleted saved search back at its old position (undo). */
export function restoreSavedSearchInList(
  searches: readonly SavedSearch[],
  search: SavedSearch,
  index: number,
): SavedSearchResult {
  if (searches.some((entry) => entry.id === search.id)) {
    return { ok: true, searches: [...searches], search };
  }
  if (searches.length >= MAX_SAVED_SEARCHES) return { ok: false, error: 'limit' };
  const validated = validateName(search.name, searches);
  if ('error' in validated) return { ok: false, error: validated.error };
  const restored = [...searches];
  restored.splice(Math.min(Math.max(index, 0), restored.length), 0, search);
  return { ok: true, searches: restored, search };
}

export function restoreSavedSearch(search: SavedSearch, index: number) {
  return updateSavedSearches((searches) => restoreSavedSearchInList(searches, search, index));
}
