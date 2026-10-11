import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { aiActivityValue } from '@/lib/ai-activity-storage';
import {
  aiModelListValue,
  aiProviderConfigValue,
  saveStoredAIProviderConfig,
} from '@/lib/ai-provider-storage';
import { aiServicesValue } from '@/lib/ai-services-storage';
import { bookmarkMetadataValue } from '@/lib/bookmark-metadata-storage';
import {
  bookmarkTableLayoutValue,
  bookmarkTableViewValue,
} from '@/lib/bookmark-table-view-storage';
import { dismissedNoticesValue } from '@/lib/dismissed-notices-storage';
import { promptLibraryIndexValue } from '@/lib/prompt-library-storage';
import { recentFoldersValue } from '@/lib/recent-folders-storage';
import { savedSearchesValue } from '@/lib/saved-searches-storage';
import { searchHistoryValue } from '@/lib/search-history-storage';
import { settingsOverrideValues } from '@/lib/settings-storage';
import { siteIconCacheValue } from '@/lib/site-icon-storage';
import {
  registerStorageCleanup,
  removeUnregisteredKeys,
  restrictLocalStorageAccess,
} from '@/lib/storage/cleanup';
import {
  isRegisteredKey,
  STORAGE_ITEMS,
  type StorageItem,
  type StorageItemId,
  storageAreaKey,
  storageKey,
} from '@/lib/storage/registry';
import type { StoredValue } from '@/lib/storage/stored-value';
import { quickSaveRecordValue } from '@/services/quick-save';
import { appRoot } from '../config-files';
import { readStoredData, storedEntry } from './storage-helpers';

/** Every single (non-collection) item's stored value; a new registry item must be added here. */
const values: Record<Exclude<StorageItemId, 'prompt'>, StoredValue<unknown>> = {
  settings: settingsOverrideValues.sync,
  deviceSettings: settingsOverrideValues.device,
  tableView: bookmarkTableViewValue,
  tableLayout: bookmarkTableLayoutValue,
  promptIndex: promptLibraryIndexValue,
  recentFolders: recentFoldersValue,
  aiCredentials: aiProviderConfigValue,
  aiModelCache: aiModelListValue,
  aiServices: aiServicesValue,
  aiActivity: aiActivityValue,
  bookmarkMetadata: bookmarkMetadataValue,
  searchHistory: searchHistoryValue,
  savedSearches: savedSearchesValue,
  siteIcons: siteIconCacheValue,
  dismissedNotices: dismissedNoticesValue,
  quickSave: quickSaveRecordValue,
} as Record<Exclude<StorageItemId, 'prompt'>, StoredValue<unknown>>;

const items = Object.entries(STORAGE_ITEMS) as [StorageItemId, StorageItem][];
const registryFile = path.join(appRoot, 'src/lib/storage/registry.ts');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('storage registry', () => {
  it('names every item <area>:<domain>.<name> in kebab-case, each key once', () => {
    const kebab = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*';
    const pattern = new RegExp(`^(sync|local|session):${kebab}(\\.${kebab})?$`);
    const keys = items.map(([, item]) => `${item.area}:${item.name}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(pattern);
    for (const [, item] of items) {
      expect(item.name).not.toContain('bookmark-scout');
      expect(Number.isInteger(item.v) && item.v >= 1, item.name).toBe(true);
    }
  });

  it('builds collection keys with /<id> and recognizes only registered keys', () => {
    expect(storageKey(STORAGE_ITEMS.prompt, 'abc')).toBe('sync:prompts.prompt/abc');
    expect(() => storageKey(STORAGE_ITEMS.prompt)).toThrow();
    expect(() => storageKey(STORAGE_ITEMS.settings, 'abc')).toThrow();
    expect(isRegisteredKey('sync', 'prompts.prompt/abc')).toBe(true);
    expect(isRegisteredKey('sync', 'prompts.prompt/')).toBe(false);
    expect(isRegisteredKey('sync', 'settings')).toBe(true);
    expect(isRegisteredKey('local', 'settings')).toBe(true);
    expect(isRegisteredKey('local', 'prompts.index')).toBe(false);
    expect(isRegisteredKey('sync', 'bookmark-scout-settings')).toBe(false);
  });

  it('never syncs a secret', () => {
    const secrets = items.filter(([, item]) => item.backup === 'secret');
    expect(secrets.map(([id]) => id)).toContain('aiCredentials');
    for (const [, item] of secrets) expect(item.area).not.toBe('sync');
  });

  it('defines every item with defineStoredValue exactly once in src', () => {
    const uses = new Map<string, number>();
    for (const file of sourceFiles(path.join(appRoot, 'src'))) {
      for (const [, id] of readFileSync(file, 'utf8').matchAll(
        /defineStored(?:Value|Collection)<[^(]*>\(\s*STORAGE_ITEMS\.(\w+)/g,
      )) {
        uses.set(id, (uses.get(id) ?? 0) + 1);
      }
    }
    expect(Object.fromEntries(uses)).toEqual(Object.fromEntries(items.map(([id]) => [id, 1])));
  });

  it('keeps storage key literals out of src outside the registry', () => {
    const found = sourceFiles(path.join(appRoot, 'src'))
      .filter((file) => file !== registryFile)
      .flatMap((file) =>
        [
          ...readFileSync(file, 'utf8').matchAll(
            /['"`](?:sync|local|session):[a-z][\w.-]*|bookmark-scout-(?:settings|ai|prompt|recent|search|saved|site|quick|table|ask|bookmark-metadata)[\w-]*/g,
          ),
        ].map(([literal]) => `${path.relative(appRoot, file)}: ${literal}`),
      );
    expect(found).toEqual([]);
  });

  it.each(Object.entries(values))(
    '%s reads its empty value back unchanged and has a migration from every older version',
    async (id, value) => {
      const item = STORAGE_ITEMS[id as StorageItemId];
      expect(value.item).toBe(item);
      expect(value.key).toBe(storageKey(item));
      expect(Object.keys(value.migrations).map(Number)).toEqual(
        Array.from({ length: item.v - 1 }, (_, index) => index + 1),
      );
      fakeBrowser.reset();
      await fakeBrowser.storage[item.area].set(storedEntry(item, value.empty));
      expect(await value.get()).toEqual(value.empty);
    },
  );
});

describe('storage items', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it.each(Object.entries(values))(
    '%s keeps its area and never reads or clears the same key in another area',
    async (id, value) => {
      const item = STORAGE_ITEMS[id as StorageItemId];
      const key = storageAreaKey(item);
      const empty = await value.get();
      for (const other of (['sync', 'local', 'session'] as const).filter((a) => a !== item.area)) {
        await fakeBrowser.storage[other].set({ [key]: { v: item.v, data: { probe: true } } });
      }
      expect(await value.get()).toEqual(empty);
      await fakeBrowser.storage[item.area].set({ [key]: { v: item.v, data: { probe: true } } });
      await value.clear();
      expect(await fakeBrowser.storage[item.area].get()).toEqual({});
    },
  );

  it('keeps AI provider credentials out of sync storage', async () => {
    await saveStoredAIProviderConfig('openai', { apiKey: 'sk-synthetic' });
    expect(await fakeBrowser.storage.sync.get()).toEqual({});
    expect(await readStoredData(STORAGE_ITEMS.aiCredentials)).toEqual({
      openai: { apiKey: 'sk-synthetic' },
    });
  });
});

describe('storage cleanup', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  async function seedMixed() {
    await fakeBrowser.storage.sync.set({
      'bookmark-scout-settings': { theme: 'dark' },
      ...storedEntry(STORAGE_ITEMS.settings, { theme: 'dark' }),
      ...storedEntry(STORAGE_ITEMS.prompt, { name: 'p' }, 'abc'),
      'prompts.prompt': 'not a collection entry',
    });
    await fakeBrowser.storage.local.set({
      'bookmark-scout-ai': { openai: { apiKey: 'old' } },
      'search.history$': { v: 1 },
      ...storedEntry(STORAGE_ITEMS.searchHistory, ['react']),
    });
    await fakeBrowser.storage.session.set({
      'bookmark-scout-quick-save': {},
      ...storedEntry(STORAGE_ITEMS.quickSave, null),
    });
  }

  async function expectOnlyRegisteredKeysLeft() {
    expect(Object.keys(await fakeBrowser.storage.sync.get()).sort()).toEqual([
      'prompts.prompt/abc',
      'settings',
    ]);
    expect(Object.keys(await fakeBrowser.storage.local.get())).toEqual(['search.history']);
    expect(Object.keys(await fakeBrowser.storage.session.get())).toEqual(['quick-save.last']);
  }

  it('removes every key the registry does not list, in every area', async () => {
    await seedMixed();
    expect(await removeUnregisteredKeys()).toEqual({
      sync: ['bookmark-scout-settings', 'prompts.prompt'],
      local: ['bookmark-scout-ai', 'search.history$'],
      session: ['bookmark-scout-quick-save'],
    });
    await expectOnlyRegisteredKeysLeft();
    expect(await removeUnregisteredKeys()).toEqual({});
  });

  it('lists keys with getKeys where the browser has it', async () => {
    await seedMixed();
    const getKeys = vi.fn(async () => Object.keys(await fakeBrowser.storage.local.get()));
    Object.assign(fakeBrowser.storage.local, { getKeys });
    try {
      await removeUnregisteredKeys();
    } finally {
      Reflect.deleteProperty(fakeBrowser.storage.local, 'getKeys');
    }
    expect(getKeys).toHaveBeenCalledOnce();
    await expectOnlyRegisteredKeysLeft();
  });

  it('runs when the extension is installed or updated, not on a browser update', async () => {
    registerStorageCleanup();
    await seedMixed();
    await fakeBrowser.runtime.onInstalled.trigger({
      reason: 'chrome_update',
      previousVersion: '1.0.0',
    } as Browser.runtime.InstalledDetails);
    expect(await fakeBrowser.storage.local.get('bookmark-scout-ai')).not.toEqual({});

    await fakeBrowser.runtime.onInstalled.trigger({
      reason: 'update',
      previousVersion: '0.3.2',
    } as Browser.runtime.InstalledDetails);
    await vi.waitFor(expectOnlyRegisteredKeysLeft);
  });

  it('restricts local storage to extension pages where the browser supports it', async () => {
    expect(await restrictLocalStorageAccess()).toBe(false);
    const setAccessLevel = vi.fn(async () => undefined);
    Object.assign(fakeBrowser.storage.local, { setAccessLevel });
    try {
      expect(await restrictLocalStorageAccess()).toBe(true);
      expect(setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
      setAccessLevel.mockRejectedValueOnce(new Error('Unsupported area'));
      expect(await restrictLocalStorageAccess()).toBe(false);
    } finally {
      Reflect.deleteProperty(fakeBrowser.storage.local, 'setAccessLevel');
    }
  });
});
