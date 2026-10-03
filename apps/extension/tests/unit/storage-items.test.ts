import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { aiActivityItem, aiActivityRecordingItem } from '@/lib/ai-activity-storage';
import {
  aiModelListItem,
  aiProviderConfigItem,
  saveStoredAIProviderConfig,
} from '@/lib/ai-provider-storage';
import { aiServicesItem } from '@/lib/ai-services-storage';
import { bookmarkMetadataItem } from '@/lib/bookmark-metadata-storage';
import { bookmarkTableViewItem } from '@/lib/bookmark-table-view-storage';
import { recentFoldersItem } from '@/lib/recent-folders-storage';
import { savedSearchesItem } from '@/lib/saved-searches-storage';
import { searchHistoryItem } from '@/lib/search-history-storage';
import { settingsItem } from '@/lib/settings-storage';
import { siteIconCacheItem } from '@/lib/site-icon-storage';
import { STORAGE_KEYS, THEME_CACHE_STORAGE_KEY } from '@/lib/storage-keys';
import { appRoot } from '../config-files';

// Existing installs already hold data under these keys; changing one silently drops user data.
const items = [
  ['settings', settingsItem, STORAGE_KEYS.settings],
  ['table view', bookmarkTableViewItem, STORAGE_KEYS.tableView],
  ['recent folders', recentFoldersItem, STORAGE_KEYS.recentFolders],
  ['AI provider config', aiProviderConfigItem, STORAGE_KEYS.aiProviders],
  ['AI model lists', aiModelListItem, STORAGE_KEYS.aiModelLists],
  ['AI services', aiServicesItem, STORAGE_KEYS.aiServices],
  ['AI activity', aiActivityItem, STORAGE_KEYS.aiActivity],
  ['AI activity recording', aiActivityRecordingItem, STORAGE_KEYS.aiActivityRecording],
  ['bookmark metadata', bookmarkMetadataItem, STORAGE_KEYS.bookmarkMetadata],
  ['search history', searchHistoryItem, STORAGE_KEYS.searchHistory],
  ['saved searches', savedSearchesItem, STORAGE_KEYS.savedSearches],
  ['site icons', siteIconCacheItem, STORAGE_KEYS.siteIcons],
] as const;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('storage key registry', () => {
  it('lists every released key exactly once', () => {
    const keys = Object.values(STORAGE_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^(sync|local):bookmark-scout-[a-z0-9-]+$/);
    // Released values; never edit these to make the test pass.
    expect(STORAGE_KEYS).toMatchObject({
      settings: 'sync:bookmark-scout-settings',
      tableView: 'sync:bookmark-scout-table-view',
      promptLibraryIndex: 'sync:bookmark-scout-prompts',
      promptPrefix: 'sync:bookmark-scout-prompt-',
      aiProviders: 'local:bookmark-scout-ai',
    });
  });

  it('includes every storage key literal used in src', () => {
    const registry = new Set<string>([...Object.values(STORAGE_KEYS), THEME_CACHE_STORAGE_KEY]);
    const bareKeys = new Set([...registry].map((key) => key.replace(/^(sync|local):/, '')));
    const unlisted = sourceFiles(path.join(appRoot, 'src')).flatMap((file) =>
      [
        ...readFileSync(file, 'utf8').matchAll(
          /\b(?:(sync|local|session):)?(bookmark-scout-[a-z0-9-]+)/g,
        ),
      ]
        .filter(([literal, area, key]) =>
          area ? !registry.has(literal) : !bareKeys.has(key.replace(/\.[a-z]+$/, '')),
        )
        .map(([literal]) => `${path.relative(appRoot, file)}: ${literal}`),
    );
    expect(unlisted).toEqual([]);
  });
});

describe('storage items', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it.each(items)('%s keeps its storage area and key', async (_name, item, storageKey) => {
    const [area, key] = storageKey.split(/:(.*)/s) as ['sync' | 'local', string];
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
