import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  addSearchHistoryEntry,
  clearSearchHistory,
  getSearchHistory,
} from '@/lib/search-history-storage';
import { defaultSettings } from '@/lib/settings-schema';
import { STORAGE_ITEMS, seedStored } from './storage-helpers';

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
    const max = defaultSettings.searchHistoryMax;
    for (let index = 0; index < max + 3; index += 1) {
      await addSearchHistoryEntry(`query ${index}`);
    }

    const history = await getSearchHistory();
    expect(history).toHaveLength(max);
    expect(history[0]).toBe(`query ${max + 2}`);
  });

  it('keeps as many as the Recent Searches Kept setting says', async () => {
    await seedStored(STORAGE_ITEMS.settings, { searchHistoryMax: 2 });
    for (const query of ['one', 'two', 'three']) await addSearchHistoryEntry(query);
    expect(await getSearchHistory()).toEqual(['three', 'two']);
  });

  it('clears all entries and stays on local storage only', async () => {
    await addSearchHistoryEntry('private query');
    expect(await fakeBrowser.storage.sync.get(null)).toEqual({});

    await clearSearchHistory();
    expect(await getSearchHistory()).toEqual([]);
  });
});
