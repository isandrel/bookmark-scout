import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { aiProviderConfigItem, saveStoredAIProviderConfig } from '@/lib/ai-provider-storage';
import { bookmarkMetadataItem } from '@/lib/bookmark-metadata-storage';
import { bookmarkTableViewItem } from '@/lib/bookmark-table-view-storage';
import { recentFoldersItem } from '@/lib/recent-folders-storage';
import { searchHistoryItem } from '@/lib/search-history-storage';
import { settingsItem } from '@/lib/settings-storage';

// Existing installs already hold data under these keys; changing one silently drops user data.
const items = [
  ['settings', settingsItem, 'sync', 'bookmark-scout-settings'],
  ['table view', bookmarkTableViewItem, 'sync', 'bookmark-scout-table-view'],
  ['recent folders', recentFoldersItem, 'local', 'bookmark-scout-recent-folders'],
  ['AI provider config', aiProviderConfigItem, 'local', 'bookmark-scout-ai'],
  ['bookmark metadata', bookmarkMetadataItem, 'local', 'bookmark-scout-bookmark-metadata'],
  ['search history', searchHistoryItem, 'local', 'bookmark-scout-search-history'],
] as const;

describe('storage items', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it.each(items)('%s keeps its storage area and key', async (_name, item, area, key) => {
    expect(item.key).toBe(`${area}:${key}`);

    const otherArea = area === 'sync' ? 'local' : 'sync';
    const value = { probe: true };
    await fakeBrowser.storage[area].set({ [key]: value });
    expect(await (item.getValue as () => Promise<unknown>)()).toEqual(value);

    await item.removeValue();
    expect(await fakeBrowser.storage[area].get()).toEqual({});
    expect(await fakeBrowser.storage[otherArea].get()).toEqual({});
  });

  it('writes plain values without WXT version metadata', async () => {
    await settingsItem.setValue({} as never);
    await recentFoldersItem.setValue([]);
    const keys = [
      ...Object.keys(await fakeBrowser.storage.sync.get()),
      ...Object.keys(await fakeBrowser.storage.local.get()),
    ];
    expect(keys.some((key) => key.endsWith('$'))).toBe(false);
  });

  it('keeps AI provider credentials out of sync storage', async () => {
    await saveStoredAIProviderConfig('openai', { apiKey: 'sk-synthetic' });
    expect(await fakeBrowser.storage.sync.get()).toEqual({});
    expect(await fakeBrowser.storage.local.get('bookmark-scout-ai')).toEqual({
      'bookmark-scout-ai': { openai: { apiKey: 'sk-synthetic' } },
    });
  });
});
