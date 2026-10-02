import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  captureSavedSearchQuery,
  hasSavedSearchFilters,
  isSameSavedSearchQuery,
  parseSavedSearchQuery,
  resolveSavedSearchQuery,
  type SavedSearchQuery,
} from '@/lib/saved-search-query';
import {
  addSavedSearch,
  createSavedSearch,
  deleteSavedSearch,
  getSavedSearches,
  MAX_SAVED_SEARCHES,
  parseSavedSearches,
  renameSavedSearch,
  renameSavedSearchInList,
  restoreSavedSearch,
  restoreSavedSearchInList,
  type SavedSearch,
} from '@/lib/saved-searches-storage';

const KEY = 'bookmark-scout-saved-searches';
const from = new Date(2026, 0, 5);
const to = new Date(2026, 0, 20);

const query = (filters: SavedSearchQuery['filters'], extra: Partial<SavedSearchQuery> = {}) => ({
  filters,
  sorting: [],
  ...extra,
});

const savedSearch = (id: string, name: string, filters = { title: name }): SavedSearch => ({
  id,
  name,
  createdAt: 1,
  query: query(filters),
});

describe('saved search query', () => {
  it('captures every manager filter, the sort, and the folder scope in canonical form', () => {
    const captured = captureSavedSearchQuery({
      columnFilters: [
        { id: 'domain', value: ['github.com', 'example.com', 'github.com'] },
        { id: 'title', value: '  docs  ' },
        { id: 'url', value: '/guide' },
        { id: 'type', value: ['link'] },
        { id: 'parentId', value: ['20', '10'] },
        { id: 'dateAdded', value: { from, to } },
        { id: 'select', value: 'ignored' },
      ],
      sorting: [
        { id: 'title', desc: true },
        { id: 'actions', desc: false },
        { id: 'title', desc: false },
      ],
      currentFolderOnly: true,
      currentFolderId: '10',
    });

    expect(captured).toEqual({
      filters: {
        title: 'docs',
        url: '/guide',
        type: ['link'],
        parentId: ['10', '20'],
        domain: ['example.com', 'github.com'],
        dateAdded: { from: from.getTime(), to: to.getTime() },
      },
      sorting: [{ id: 'title', desc: true }],
      folderId: '10',
    });
    expect(JSON.parse(JSON.stringify(captured))).toEqual(captured);
  });

  it('leaves out empty filters and the scope when results are not limited to a folder', () => {
    const captured = captureSavedSearchQuery({
      columnFilters: [
        { id: 'title', value: '   ' },
        { id: 'domain', value: [] },
        { id: 'dateAdded', value: { from: undefined, to: undefined } },
      ],
      sorting: [],
      currentFolderOnly: false,
      currentFolderId: '10',
    });

    expect(captured).toEqual({ filters: {}, sorting: [] });
    expect(hasSavedSearchFilters(captured)).toBe(false);
  });

  it('keeps the top level as a null folder scope', () => {
    const captured = captureSavedSearchQuery({
      columnFilters: [{ id: 'title', value: 'news' }],
      sorting: [],
      currentFolderOnly: true,
      currentFolderId: null,
    });
    expect(captured.folderId).toBeNull();
    expect(resolveSavedSearchQuery(captured, new Set()).folderId).toBeNull();
  });

  it('applies a saved query back to the same table state', () => {
    const state = {
      columnFilters: [
        { id: 'title', value: 'docs' },
        { id: 'parentId', value: ['10'] },
        { id: 'dateAdded', value: { from, to: undefined } },
      ],
      sorting: [{ id: 'dateAdded', desc: true }],
      currentFolderOnly: true,
      currentFolderId: '10',
    };
    const captured = captureSavedSearchQuery(state);
    const resolved = resolveSavedSearchQuery(captured, new Set(['10']));

    expect(resolved).toEqual({
      columnFilters: [
        { id: 'title', value: 'docs' },
        { id: 'parentId', value: ['10'] },
        { id: 'dateAdded', value: { from, to: undefined } },
      ],
      sorting: [{ id: 'dateAdded', desc: true }],
      folderId: '10',
      missingFolderCount: 0,
    });
    const reapplied = captureSavedSearchQuery({
      columnFilters: resolved.columnFilters,
      sorting: resolved.sorting,
      currentFolderOnly: resolved.folderId !== undefined,
      currentFolderId: resolved.folderId ?? null,
    });
    expect(isSameSavedSearchQuery(reapplied, captured)).toBe(true);
  });

  it('skips stale folder IDs instead of matching nothing, and counts them', () => {
    const saved = query(
      { title: 'docs', parentId: ['10', 'gone-1', 'gone-2'] },
      { folderId: 'gone-3' },
    );

    const resolved = resolveSavedSearchQuery(saved, new Set(['10']));
    expect(resolved.columnFilters).toEqual([
      { id: 'title', value: 'docs' },
      { id: 'parentId', value: ['10'] },
    ]);
    expect(resolved.folderId).toBeUndefined();
    expect(resolved.missingFolderCount).toBe(3);

    // With every folder gone, the folder filter is dropped and the rest still applies.
    const allStale = resolveSavedSearchQuery(saved, new Set());
    expect(allStale.columnFilters).toEqual([{ id: 'title', value: 'docs' }]);
    expect(allStale.missingFolderCount).toBe(4);
  });

  it('treats queries that differ only in value order as the same', () => {
    expect(
      isSameSavedSearchQuery(
        query({ domain: ['b.com', 'a.com'] }),
        query({ domain: ['a.com', 'b.com'] }),
      ),
    ).toBe(true);
    expect(
      isSameSavedSearchQuery(query({ title: 'a' }), query({ title: 'a' }, { folderId: '1' })),
    ).toBe(false);
  });

  it('rejects malformed stored queries', () => {
    expect(parseSavedSearchQuery(null)).toBeNull();
    expect(parseSavedSearchQuery({ filters: { title: 42 } })).toBeNull();
    expect(parseSavedSearchQuery({ filters: { type: ['bookmark'] } })).toBeNull();
    expect(parseSavedSearchQuery({ filters: { dateAdded: {} } })).toBeNull();
    expect(parseSavedSearchQuery({ filters: { dateAdded: { from: 'yesterday' } } })).toBeNull();
    expect(parseSavedSearchQuery({ filters: { title: 'x'.repeat(501) } })).toBeNull();
    // Unknown filters are dropped and a missing sort defaults to none.
    expect(parseSavedSearchQuery({ filters: { title: 'ok', future: true } })).toEqual(
      query({ title: 'ok' }),
    );
  });
});

describe('saved searches parsing and migration', () => {
  it('reads a version 1 payload and migrates one without a version', () => {
    const search = savedSearch('a', 'Docs');
    expect(parseSavedSearches({ version: 1, searches: [search] })).toEqual([search]);
    expect(parseSavedSearches({ searches: [search] })).toEqual([search]);
  });

  it('ignores malformed payloads and unsupported versions', () => {
    for (const value of [null, undefined, 'text', 42, [], {}, { version: 2, searches: [] }]) {
      expect(parseSavedSearches(value)).toEqual([]);
    }
    expect(parseSavedSearches({ version: 1, searches: 'nope' })).toEqual([]);
  });

  it('drops only the malformed entries, repeated IDs, and anything past the limit', () => {
    const good = savedSearch('a', 'Docs');
    const parsed = parseSavedSearches({
      version: 1,
      searches: [
        good,
        { ...savedSearch('b', 'Bad query'), query: { filters: { title: 7 } } },
        { ...savedSearch('c', 'No name'), name: '   ' },
        { id: 'd' },
        null,
        savedSearch('a', 'Repeated ID'),
        {
          ...savedSearch('e', 'Unknown sort'),
          query: { filters: { title: 'x' }, sorting: [{ id: 'gone', desc: true }] },
        },
      ],
    });
    expect(parsed.map((search) => search.id)).toEqual(['a', 'e']);
    expect(parsed[1].query.sorting).toEqual([]);

    const many = Array.from({ length: MAX_SAVED_SEARCHES + 5 }, (_, index) =>
      savedSearch(`id-${index}`, `Search ${index}`),
    );
    expect(parseSavedSearches({ version: 1, searches: many })).toHaveLength(MAX_SAVED_SEARCHES);
  });
});

describe('saved search list changes', () => {
  const docs = savedSearch('a', 'Docs');

  it('adds with a trimmed, unique name and only when something is filtered', () => {
    const added = addSavedSearch(
      [docs],
      { name: '  News  ', query: query({ title: 'news' }) },
      {
        id: 'b',
        now: 5,
      },
    );
    expect(added).toMatchObject({ ok: true, search: { id: 'b', name: 'News', createdAt: 5 } });

    expect(addSavedSearch([docs], { name: 'docs', query: query({ title: 'x' }) })).toEqual({
      ok: false,
      error: 'duplicate-name',
    });
    expect(addSavedSearch([docs], { name: '  ', query: query({ title: 'x' }) })).toEqual({
      ok: false,
      error: 'empty-name',
    });
    expect(addSavedSearch([], { name: 'Empty', query: query({}) })).toEqual({
      ok: false,
      error: 'invalid-query',
    });
    const full = Array.from({ length: MAX_SAVED_SEARCHES }, (_, index) =>
      savedSearch(`id-${index}`, `Search ${index}`),
    );
    expect(addSavedSearch(full, { name: 'One more', query: query({ title: 'x' }) })).toEqual({
      ok: false,
      error: 'limit',
    });
  });

  it('renames, allowing a change of case but not another search name', () => {
    const news = savedSearch('b', 'News');
    expect(renameSavedSearchInList([docs, news], 'a', 'DOCS')).toMatchObject({
      ok: true,
      searches: [{ id: 'a', name: 'DOCS' }, news],
    });
    expect(renameSavedSearchInList([docs, news], 'a', 'news')).toEqual({
      ok: false,
      error: 'duplicate-name',
    });
    expect(renameSavedSearchInList([docs], 'missing', 'X')).toEqual({
      ok: false,
      error: 'not-found',
    });
  });

  it('restores a deleted search at its old position, once', () => {
    const news = savedSearch('b', 'News');
    const restored = restoreSavedSearchInList([news], docs, 0);
    expect(restored).toMatchObject({ ok: true, searches: [docs, news] });
    expect(restoreSavedSearchInList([docs, news], docs, 0)).toMatchObject({
      ok: true,
      searches: [docs, news],
    });
  });
});

describe('saved searches storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('keeps saved searches in local storage only, as a versioned payload', async () => {
    const result = await createSavedSearch('GitHub', query({ domain: ['github.com'] }));
    expect(result.ok).toBe(true);

    expect(await fakeBrowser.storage.sync.get()).toEqual({});
    const stored = (await fakeBrowser.storage.local.get(KEY))[KEY];
    expect(stored).toMatchObject({
      version: 1,
      searches: [{ name: 'GitHub', query: { filters: { domain: ['github.com'] } } }],
    });
    expect(
      Object.keys(await fakeBrowser.storage.local.get()).some((key) => key.endsWith('$')),
    ).toBe(false);
  });

  it('creates, renames, deletes, and restores through storage', async () => {
    const created = await createSavedSearch('Docs', query({ title: 'docs' }));
    if (!created.ok) throw new Error('create failed');
    await createSavedSearch('News', query({ title: 'news' }));

    await renameSavedSearch(created.search.id, 'Manuals');
    expect((await getSavedSearches()).map((search) => search.name)).toEqual(['Manuals', 'News']);

    const [manuals] = await getSavedSearches();
    await deleteSavedSearch(manuals.id);
    expect((await getSavedSearches()).map((search) => search.name)).toEqual(['News']);

    await restoreSavedSearch(manuals, 0);
    expect((await getSavedSearches()).map((search) => search.name)).toEqual(['Manuals', 'News']);
  });

  it('reads malformed stored data as empty and replaces it on the next save', async () => {
    await fakeBrowser.storage.local.set({ [KEY]: { version: 1, searches: [{ id: 5 }] } });
    expect(await getSavedSearches()).toEqual([]);

    await fakeBrowser.storage.local.set({ [KEY]: 'corrupted' });
    expect(await getSavedSearches()).toEqual([]);

    const result = await createSavedSearch('Docs', query({ title: 'docs' }));
    expect(result.ok).toBe(true);
    expect((await fakeBrowser.storage.local.get(KEY))[KEY]).toMatchObject({
      version: 1,
      searches: [{ name: 'Docs' }],
    });
  });
});
