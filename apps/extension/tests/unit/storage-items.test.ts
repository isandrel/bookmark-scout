import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  aiActivityRecordingItem,
  aiActivityRecordingValue,
  aiActivityValue,
} from '@/lib/ai-activity-storage';
import {
  aiModelListValue,
  aiProviderConfigItem,
  aiProviderConfigValue,
  saveStoredAIProviderConfig,
} from '@/lib/ai-provider-storage';
import { aiServicesValue } from '@/lib/ai-services-storage';
import { bookmarkMetadataValue } from '@/lib/bookmark-metadata-storage';
import { bookmarkTableViewValue } from '@/lib/bookmark-table-view-storage';
import { recentFoldersItem, recentFoldersValue } from '@/lib/recent-folders-storage';
import { savedSearchesValue } from '@/lib/saved-searches-storage';
import { searchHistoryValue } from '@/lib/search-history-storage';
import { defaultSettings } from '@/lib/settings-schema';
import { settingsItem, settingsValue } from '@/lib/settings-storage';
import { siteIconCacheValue } from '@/lib/site-icon-storage';
import { STORAGE_KEYS, THEME_CACHE_STORAGE_KEY } from '@/lib/storage-keys';
import { appRoot } from '../config-files';

// Existing installs already hold data under these keys; changing one silently drops user data.
const values = [
  ['settings', settingsValue, STORAGE_KEYS.settings],
  ['table view', bookmarkTableViewValue, STORAGE_KEYS.tableView],
  ['recent folders', recentFoldersValue, STORAGE_KEYS.recentFolders],
  ['AI provider config', aiProviderConfigValue, STORAGE_KEYS.aiProviders],
  ['AI model lists', aiModelListValue, STORAGE_KEYS.aiModelLists],
  ['AI services', aiServicesValue, STORAGE_KEYS.aiServices],
  ['AI activity', aiActivityValue, STORAGE_KEYS.aiActivity],
  ['AI activity recording', aiActivityRecordingValue, STORAGE_KEYS.aiActivityRecording],
  ['bookmark metadata', bookmarkMetadataValue, STORAGE_KEYS.bookmarkMetadata],
  ['search history', searchHistoryValue, STORAGE_KEYS.searchHistory],
  ['saved searches', savedSearchesValue, STORAGE_KEYS.savedSearches],
  ['site icons', siteIconCacheValue, STORAGE_KEYS.siteIcons],
] as const;

// WXT items still read by services and components that have not moved to the stored values.
const legacyItems = [
  ['settings item', settingsItem, STORAGE_KEYS.settings],
  ['recent folders item', recentFoldersItem, STORAGE_KEYS.recentFolders],
  ['AI provider config item', aiProviderConfigItem, STORAGE_KEYS.aiProviders],
  ['AI activity recording item', aiActivityRecordingItem, STORAGE_KEYS.aiActivityRecording],
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

  it.each(values)('%s keeps its storage area and key', async (_name, value, storageKey) => {
    const [area, key] = storageKey.split(/:(.*)/s) as ['sync' | 'local', string];
    expect(value.key).toBe(`${area}:${key}`);

    // The same key in the other area is never read or cleared.
    const otherArea = area === 'sync' ? 'local' : 'sync';
    const read = value.get as () => Promise<unknown>;
    const empty = await read();
    await fakeBrowser.storage[otherArea].set({ [key]: { probe: true } });
    expect(await read()).toEqual(empty);
    await fakeBrowser.storage[area].set({ [key]: { probe: true } });
    await value.clear();
    expect(await fakeBrowser.storage[area].get()).toEqual({});
    expect(await fakeBrowser.storage[otherArea].get()).toEqual({ [key]: { probe: true } });
  });

  it.each(legacyItems)('%s keeps its storage area and key', (_name, item, storageKey) => {
    expect(item.key).toBe(storageKey);
  });

  it('writes plain values without WXT version metadata', async () => {
    await settingsValue.set(defaultSettings);
    await recentFoldersValue.set([{ id: '1', title: 'Folder', lastUsed: 1 }]);
    await bookmarkTableViewValue.set(await bookmarkTableViewValue.get());
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
