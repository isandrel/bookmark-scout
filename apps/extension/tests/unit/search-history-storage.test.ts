import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  addSearchHistoryEntry,
  clearSearchHistory,
  getSearchHistory,
  MAX_SEARCH_HISTORY_ENTRIES,
} from '@/lib/search-history-storage';

describe('search history storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('stores newest queries first and ignores blank queries', async () => {
    await addSearchHistoryEntry('alpha');
    await addSearchHistoryEntry('  beta  ');
    await addSearchHistoryEntry('   ');

    expect(await getSearchHistory()).toEqual(['beta', 'alpha']);
  });

  it('moves a repeated query to the front without case-insensitive duplicates', async () => {
    await addSearchHistoryEntry('Alpha');
    await addSearchHistoryEntry('beta');
    await addSearchHistoryEntry('alpha');

    expect(await getSearchHistory()).toEqual(['alpha', 'beta']);
  });

  it('retains at most the configured number of entries', async () => {
    for (let index = 0; index < MAX_SEARCH_HISTORY_ENTRIES + 3; index += 1) {
      await addSearchHistoryEntry(`query ${index}`);
    }

    const history = await getSearchHistory();
    expect(history).toHaveLength(MAX_SEARCH_HISTORY_ENTRIES);
    expect(history[0]).toBe(`query ${MAX_SEARCH_HISTORY_ENTRIES + 2}`);
  });

  it('clears all entries and stays on local storage only', async () => {
    await addSearchHistoryEntry('private query');
    expect(await fakeBrowser.storage.sync.get(null)).toEqual({});

    await clearSearchHistory();
    expect(await getSearchHistory()).toEqual([]);
  });
});
