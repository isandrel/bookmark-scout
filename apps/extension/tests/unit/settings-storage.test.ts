import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { ABOUT_ME_MAX_LENGTH } from '@/lib/about-me-storage';
import { INPUT_LIMITS } from '@/lib/input-limits';
import { MAX_PROMPT_BYTES, MAX_PROMPTS, syncItemBytes } from '@/lib/prompt-library-storage';
import {
  coerceSelectValue,
  commitNumberSetting,
  dropSettledErrors,
  formatListSetting,
  fromUnlimitedSliderValue,
  getChangedSettings,
  parseListSetting,
  parseListTokens,
  toUnlimitedSliderValue,
} from '@/lib/settings-form';
import {
  defaultSettings,
  getSettingScope,
  getSettingsFieldMeta,
  type NumberSetting,
  SETTING_KEYS_BY_SCOPE,
  SETTING_NUMBER_BOUNDS,
  type Settings,
  settingsSchema,
} from '@/lib/settings-schema';
import {
  getSettings,
  importSettings,
  registerSettingsSaveListener,
  resetSettings,
  SettingsValidationError,
  sanitizeSettings,
  saveSettings,
  saveValidSettings,
  settingsOverrideValues,
  settingsValue,
  undoResetSettings,
  validateSettingsUpdate,
} from '@/lib/settings-storage';
import { MIGRATIONS } from '@/lib/storage/migrations';
import {
  DEVICE_SETTING_KEYS,
  type StorageItem,
  SYNC_QUOTA,
  storageAreaKey,
} from '@/lib/storage/registry';
import { NewerStoredValueError, toStoredEnvelope } from '@/lib/storage/stored-value';
import { PROMPT_TASK_IDS } from '@/services/prompt-config';
import { readStoredData, STORAGE_ITEMS, seedStored } from './storage-helpers';

/** What sync storage holds for settings. */
async function readStored() {
  return (await readStoredData(STORAGE_ITEMS.settings)) as Record<string, unknown> | undefined;
}

/** What the list setting `key`'s synced item holds. */
async function readList(key: string) {
  return readStoredData(STORAGE_ITEMS.settingsList, key);
}

/** What this device's storage holds for settings. */
async function readStoredOnDevice() {
  return (await readStoredData(STORAGE_ITEMS.deviceSettings)) as
    | Record<string, unknown>
    | undefined;
}

beforeEach(() => {
  vi.restoreAllMocks();
  fakeBrowser.reset();
  setLanguage('en');
});

describe('settings validation', () => {
  it('keeps valid fields and reports invalid ones instead of rejecting the whole update', () => {
    const { settings, errors } = validateSettingsUpdate(defaultSettings, {
      showFavicons: false,
      theme: 0,
      faviconSize: 0,
    });
    expect(settings.showFavicons).toBe(false);
    expect(settings.theme).toBe(defaultSettings.theme);
    expect(settings.faviconSize).toBe(defaultSettings.faviconSize);
    expect(Object.keys(errors).sort()).toEqual(['faviconSize', 'theme']);
    expect(errors.theme).toBe('Choose one of the available options.');
    expect(errors.theme).not.toContain('invalid_');
  });

  it('localizes range and list errors', () => {
    const { errors } = validateSettingsUpdate(defaultSettings, {
      recentFoldersMax: 0,
      deadLinksSuccessStatuses: ['200'],
      defaultNewFolderName: '',
    });
    expect(errors.recentFoldersMax).toBe('Choose a value from 1 to 10.');
    expect(errors.deadLinksSuccessStatuses).toBe(
      'Enter HTTP status codes from 100 to 599, separated by commas.',
    );
    expect(errors.defaultNewFolderName).toBe("This field can't be empty.");

    setLanguage('ja');
    const ja = validateSettingsUpdate(defaultSettings, { recentFoldersMax: 0 });
    expect(ja.errors.recentFoldersMax).toBe('1〜10 の値を選んでください。');
  });

  it('reports cross-field errors on the field that changed', () => {
    const current = { ...defaultSettings, autoTaggingMinTags: 3, autoTaggingMaxTags: 5 };
    const { settings, errors } = validateSettingsUpdate(current, { autoTaggingMaxTags: 2 });
    expect(settings.autoTaggingMaxTags).toBe(5);
    expect(settings.autoTaggingMinTags).toBe(3);
    expect(errors).toEqual({
      autoTaggingMaxTags: 'The minimum cannot be greater than the maximum.',
    });
  });

  it('rejects 0 for limits where -1 means no limit', () => {
    expect(validateSettingsUpdate(defaultSettings, { aiMaxCategories: 0 }).errors).toHaveProperty(
      'aiMaxCategories',
    );
    expect(
      validateSettingsUpdate(defaultSettings, { aiMaxCategories: -1, aiMaxItemsPerFolder: 20 })
        .errors,
    ).toEqual({});
  });

  it('sanitizes stored settings field by field', () => {
    const settings = sanitizeSettings({
      theme: 'dark',
      language: 'ja',
      faviconSize: 0,
      deadLinksSuccessStatuses: ['200', '301'],
      popupHeight: 900,
    });
    expect(settings.theme).toBe('dark');
    expect(settings.language).toBe('ja');
    expect(settings.faviconSize).toBe(defaultSettings.faviconSize);
    expect(settings.deadLinksSuccessStatuses).toEqual(defaultSettings.deadLinksSuccessStatuses);
    expect(settings.popupHeight).toBe(600);
  });

  it('clamps a stored popup size below the minimum instead of resetting it', () => {
    const settings = sanitizeSettings({ popupHeight: 250, popupWidth: 120 });
    expect(settings.popupHeight).toBe(300);
    expect(settings.popupWidth).toBe(300);
  });
});

describe('settings persistence', () => {
  it('stores only settings that differ from the default, and removes one set back to it', async () => {
    await saveSettings({ theme: 'dark', showFavicons: defaultSettings.showFavicons });
    expect(await readStored()).toEqual({ theme: 'dark' });
    expect(await getSettings()).toEqual({ ...defaultSettings, theme: 'dark' });

    await saveSettings({ theme: defaultSettings.theme });
    expect(await readStored()).toBeUndefined();
    expect(await getSettings()).toEqual(defaultSettings);
  });

  it('keeps device settings on this device and the rest in sync storage', async () => {
    await saveSettings({ quickSaveFixedFolder: '42', siteIconsMaxCacheKb: 1024, theme: 'dark' });
    expect(await readStored()).toEqual({ theme: 'dark' });
    expect(await readStoredOnDevice()).toEqual({
      quickSaveFixedFolder: '42',
      siteIconsMaxCacheKb: 1024,
    });
    for (const key of DEVICE_SETTING_KEYS) expect(getSettingScope(key)).toBe('device');
    expect(getSettingScope('theme')).toBe('sync');

    // A device setting another device synced by mistake is not read.
    await seedStored(STORAGE_ITEMS.settings, { theme: 'dark', quickSaveFixedFolder: '7' });
    expect((await getSettings()).quickSaveFixedFolder).toBe('42');
  });

  it('keeps the settings that take covers without a click on this device', async () => {
    // Capture Covers While Browsing needs access to all pages, granted per browser, and the
    // pictures stay on the device that took them.
    const covers = {
      coversBrowseCapture: true,
      coversBrowseCapturePrivate: true,
      quickSaveCover: true,
    } as const;
    await saveSettings(covers);
    expect(await readStored()).toBeUndefined();
    expect(await readStoredOnDevice()).toEqual(covers);
    expect(await getSettings()).toMatchObject(covers);
  });

  it('keeps each list setting in its own synced item, and writes only the list that changed', async () => {
    await saveSettings({ urlCleanerRemoveParams: ['utm_*'], theme: 'dark' });
    expect(await readStored()).toEqual({ theme: 'dark' });
    expect(await readList('urlCleanerRemoveParams')).toEqual(['utm_*']);
    expect(getSettingScope('urlCleanerRemoveParams')).toBe('lists');
    expect(getSettingScope('agentBridgeDisabledActions')).toBe('device');

    const set = vi.spyOn(fakeBrowser.storage.sync, 'set');
    const remove = vi.spyOn(fakeBrowser.storage.sync, 'remove');
    await saveSettings({ managerMenuActions: ['open'] });
    expect(set.mock.calls.map(([items]) => Object.keys(items))).toEqual([
      [storageAreaKey(STORAGE_ITEMS.settingsList, 'managerMenuActions')],
    ]);
    expect(remove).not.toHaveBeenCalled();

    // Back at its default, a list's item is removed, and only its item.
    set.mockClear();
    await saveSettings({ urlCleanerRemoveParams: defaultSettings.urlCleanerRemoveParams });
    expect(set).not.toHaveBeenCalled();
    expect(remove.mock.calls).toEqual([
      [[storageAreaKey(STORAGE_ITEMS.settingsList, 'urlCleanerRemoveParams')]],
    ]);
    expect(await readList('urlCleanerRemoveParams')).toBeUndefined();
    expect(await getSettings()).toMatchObject({ theme: 'dark', managerMenuActions: ['open'] });
  });

  it('reads every list item at once and follows a list another device changed', async () => {
    await seedStored(STORAGE_ITEMS.settingsList, ['utm_*'], 'urlCleanerRemoveParams');
    await seedStored(STORAGE_ITEMS.settingsList, ['open'], 'managerMenuActions');
    // An invalid list reads as its default alone; one a newer release added is left alone.
    await seedStored(STORAGE_ITEMS.settingsList, ['not a status'], 'deadLinksSuccessStatuses');
    await seedStored(STORAGE_ITEMS.settingsList, ['x'], 'listFromANewerRelease');
    const get = vi.spyOn(fakeBrowser.storage.sync, 'get');
    expect(await settingsOverrideValues.lists.get()).toEqual({
      urlCleanerRemoveParams: ['utm_*'],
      managerMenuActions: ['open'],
      deadLinksSuccessStatuses: ['not a status'],
    });
    expect(get).toHaveBeenCalledOnce();
    expect(await getSettings()).toMatchObject({
      urlCleanerRemoveParams: ['utm_*'],
      managerMenuActions: ['open'],
      deadLinksSuccessStatuses: defaultSettings.deadLinksSuccessStatuses,
    });

    const seen: Settings[] = [];
    const stop = settingsValue.observe((settings) => seen.push(settings));
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    await seedStored(STORAGE_ITEMS.settingsList, ['edit'], 'managerMenuActions');
    await vi.waitFor(() => expect(seen.at(-1)?.managerMenuActions).toEqual(['edit']));
    stop();
    await saveSettings({ theme: 'dark' });
    expect(await readList('listFromANewerRelease')).toEqual(['x']);
  });

  it('refuses to change a list a newer release stored, and writes nothing', async () => {
    const key = storageAreaKey(STORAGE_ITEMS.settingsList, 'managerMenuActions');
    await fakeBrowser.storage.sync.set({ [key]: { v: 99, data: ['open'] } });
    await expect(saveSettings({ managerMenuActions: ['edit'], theme: 'dark' })).rejects.toThrow(
      NewerStoredValueError,
    );
    expect(await readStored()).toBeUndefined();
    expect((await fakeBrowser.storage.sync.get(key))[key]).toEqual({ v: 99, data: ['open'] });
  });

  it('keeps settings a newer release stored when it saves its own', async () => {
    await seedStored(STORAGE_ITEMS.settings, {
      theme: 'dark',
      settingFromANewerRelease: 'kept',
      faviconSize: 48,
    });
    await saveSettings({ showFavicons: false });
    expect(await readStored()).toEqual({
      theme: 'dark',
      settingFromANewerRelease: 'kept',
      faviconSize: 48,
      showFavicons: false,
    });
    expect((await getSettings()).faviconSize).toBe(defaultSettings.faviconSize);
  });

  it('a single invalid field does not block saving other fields', async () => {
    await seedStored(STORAGE_ITEMS.settings, { theme: 'dark', faviconSize: 32 });
    const { errors } = await saveValidSettings({
      showFavicons: false,
      theme: '' as never,
    });
    expect(Object.keys(errors)).toEqual(['theme']);
    expect(await readStored()).toEqual({ showFavicons: false, theme: 'dark', faviconSize: 32 });
  });

  it('saveSettings rejects with a readable, field-level error', async () => {
    await seedStored(STORAGE_ITEMS.settings, { language: 'en' });
    const error = await saveSettings({ recentFoldersMax: 99 }).catch((reason) => reason);
    expect(error).toBeInstanceOf(SettingsValidationError);
    expect(error.message).toBe('These settings have invalid values: Recent Folders Max');
    expect(await readStored()).toEqual({ language: 'en' });
  });

  it('reads invalid stored data without discarding valid fields', async () => {
    await seedStored(STORAGE_ITEMS.settings, { theme: 'dark', faviconSize: 0 });
    const settings = await getSettings();
    expect(settings.theme).toBe('dark');
    expect(settings.faviconSize).toBe(defaultSettings.faviconSize);
  });

  it('resets both scopes but keeps what a newer release stored', async () => {
    await saveSettings({ theme: 'dark', quickSaveFixedFolder: '42' });
    await seedStored(STORAGE_ITEMS.settings, { theme: 'dark', settingFromANewerRelease: 1 });
    await resetSettings();
    expect(await readStored()).toEqual({ settingFromANewerRelease: 1 });
    expect(await readStoredOnDevice()).toBeUndefined();
    expect(await getSettings()).toEqual(defaultSettings);
  });

  it('undoes a reset in both scopes, keeping a change made since to a default setting', async () => {
    await saveSettings({ theme: 'dark', quickSaveFixedFolder: '42' });
    const previous = await resetSettings();
    expect(previous).toMatchObject({ theme: 'dark', quickSaveFixedFolder: '42' });
    await saveSettings({ showFavicons: false });

    await undoResetSettings(previous);
    expect(await readStored()).toEqual({ theme: 'dark', showFavicons: false });
    expect(await readStoredOnDevice()).toEqual({ quickSaveFixedFolder: '42' });
  });

  it('follows changes to either scope live', async () => {
    const seen: Settings[] = [];
    const stop = settingsValue.observe((settings) => seen.push(settings));
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    await saveSettings({ theme: 'dark' });
    await seedStored(STORAGE_ITEMS.deviceSettings, { siteIconsMaxCacheKb: 2048 });
    await vi.waitFor(() =>
      expect(seen.at(-1)).toMatchObject({ theme: 'dark', siteIconsMaxCacheKb: 2048 }),
    );
    stop();
  });
});

/**
 * Every synced setting at its largest stored form: lists full of the longest names, text at its
 * maximum length in the costliest character (Chrome stores `<` as 6 bytes), numbers at their
 * longest form, and each choice at its longest option.
 */
function largestSyncedSettings(): Record<string, unknown> {
  const meta = getSettingsFieldMeta();
  const bounds: Partial<Record<keyof Settings, NumberSetting>> = SETTING_NUMBER_BOUNDS;
  const longestOf = <T>(values: T[]) =>
    values.reduce((a, b) => (JSON.stringify(b).length > JSON.stringify(a).length ? b : a));
  return Object.fromEntries(
    [...SETTING_KEYS_BY_SCOPE.sync, ...SETTING_KEYS_BY_SCOPE.lists].map((key) => {
      const field = meta[key];
      const fallback = defaultSettings[key];
      if (field.list && field.options) {
        // A checklist holds each of its choices at most once: all of them is its largest.
        return [key, field.options.map((option) => option.value)];
      }
      if (field.list) {
        expect(field.maxItems, `${key} has no item limit`).toBeGreaterThan(0);
        const item = field.list === 'string' ? 'x'.repeat(field.maxLength ?? 0) : 599;
        return [key, Array.from({ length: field.maxItems ?? 0 }, () => item)];
      }
      if (typeof fallback === 'string') {
        const options = field.options?.map((option) => String(option.value)) ?? [];
        expect(field.maxLength ?? options.length, `${key} has no length limit`).toBeGreaterThan(0);
        return [key, options.length > 0 ? longestOf(options) : '<'.repeat(field.maxLength ?? 0)];
      }
      if (typeof fallback === 'number') {
        const range = bounds[key];
        if (!range) return [key, longestOf((field.options ?? []).map((option) => option.value))];
        // -1 (no limit) is a value only where the setting allows it.
        const candidates = [range.min, range.max, ...(range.unlimited ? [-1] : [])];
        if (!range.integer) candidates.push(range.min + (range.max - range.min) / 3);
        return [key, longestOf(candidates)];
      }
      return [key, false];
    }),
  );
}

/** Bytes `item` (or its entry `id`) takes in sync storage holding `data`. */
const storedBytes = (item: StorageItem, data: unknown, id?: string) =>
  syncItemBytes(storageAreaKey(item, id), toStoredEnvelope(item, data));

/**
 * Every synced item at its largest, by name, and how many of it there can be. A new synced item
 * fails here until it has a size: its own measure, or the per-item quota when it has none.
 */
function largestSyncItems(): { name: string; bytes: number; count: number }[] {
  const largest = largestSyncedSettings();
  const promptIndex = {
    ids: Array.from({ length: MAX_PROMPTS }, () => 'x'.repeat(INPUT_LIMITS.ids.prompt)),
    active: Object.fromEntries(
      PROMPT_TASK_IDS.map((task) => [task, 'x'.repeat(INPUT_LIMITS.ids.prompt)]),
    ),
  };
  const sizes: Record<string, () => { name: string; bytes: number; count: number }[]> = {
    settings: () => [
      {
        name: 'settings',
        bytes: storedBytes(
          STORAGE_ITEMS.settings,
          Object.fromEntries(SETTING_KEYS_BY_SCOPE.sync.map((key) => [key, largest[key]])),
        ),
        count: 1,
      },
    ],
    settingsList: () =>
      SETTING_KEYS_BY_SCOPE.lists.map((key) => ({
        name: `settings.list/${key}`,
        bytes: storedBytes(STORAGE_ITEMS.settingsList, largest[key], key),
        count: 1,
      })),
    // Columns and sort have no byte limit of their own: counted at the whole per-item quota.
    tableView: () => [{ name: 'manager.table-view', bytes: SYNC_QUOTA.bytesPerItem, count: 1 }],
    promptIndex: () => [
      {
        name: 'prompts.index',
        bytes: storedBytes(STORAGE_ITEMS.promptIndex, promptIndex),
        count: 1,
      },
    ],
    aboutMe: () => [
      {
        name: 'ai.about-me',
        bytes: storedBytes(STORAGE_ITEMS.aboutMe, '<'.repeat(ABOUT_ME_MAX_LENGTH)),
        count: 1,
      },
    ],
    // `customPromptBytes` refuses a prompt past MAX_PROMPT_BYTES, key and envelope included.
    prompt: () => [{ name: 'prompts.prompt/<id>', bytes: MAX_PROMPT_BYTES, count: MAX_PROMPTS }],
  };
  const synced = (Object.entries(STORAGE_ITEMS) as [string, StorageItem][]).filter(
    ([, item]) => item.area === 'sync',
  );
  // An old item a migration still reads stays while the migration is registered.
  const legacy = MIGRATIONS.flatMap(({ legacy: item }) =>
    item?.item.area === 'sync'
      ? [{ name: item.key, bytes: SYNC_QUOTA.bytesPerItem, count: 1 }]
      : [],
  );
  return [
    ...synced.flatMap(([id]) => {
      const size = sizes[id];
      if (!size) throw new Error(`${id} syncs but has no largest size in this test`);
      return size();
    }),
    ...legacy,
  ];
}

describe('sync quota', () => {
  it('keeps the settings item and each list item within the per-item quota at their largest', () => {
    const largest = largestSyncedSettings();
    expect(settingsSchema.safeParse({ ...defaultSettings, ...largest }).success).toBe(true);
    // A name takes one byte a character: the characters that take more are not allowed.
    for (const name of ['a"b', 'a<b', 'a\\b', 'äb', 'a b']) {
      expect(settingsSchema.shape.urlCleanerRemoveParams.safeParse([name]).success, name).toBe(
        false,
      );
    }
    const settingsItems = largestSyncItems().filter(({ name }) => name.startsWith('settings'));
    expect(settingsItems).toHaveLength(1 + SETTING_KEYS_BY_SCOPE.lists.length);
    for (const { name, bytes } of settingsItems) {
      expect(bytes, name).toBeLessThanOrEqual(SYNC_QUOTA.bytesPerItem);
    }
  });

  it('keeps every synced item together within the total quota and the item limit', () => {
    // Room left for what the browser counts that the measures here do not (its own bookkeeping
    // per item), and for a setting added without lowering another limit to make room.
    const BYTES_MARGIN = 1_024;
    // Room for synced items added before this test is updated, and for collections to grow.
    const ITEMS_MARGIN = 64;
    const items = largestSyncItems();
    const total = items.reduce((sum, { bytes, count }) => sum + bytes * count, 0);
    const count = items.reduce((sum, item) => sum + item.count, 0);
    const biggest = [...items]
      .sort((a, b) => b.bytes * b.count - a.bytes * a.count)
      .slice(0, 8)
      .map(
        ({ name, bytes, count: n }) => `${name}: ${bytes * n}${n > 1 ? ` (${n} × ${bytes})` : ''}`,
      )
      .join(', ');
    expect(
      total,
      `synced items at their largest take ${total} bytes, over ${SYNC_QUOTA.bytes} less ${BYTES_MARGIN}; ` +
        `lower the limits of the biggest: ${biggest}`,
    ).toBeLessThanOrEqual(SYNC_QUOTA.bytes - BYTES_MARGIN);
    expect(
      count,
      `${count} synced items at most, over ${SYNC_QUOTA.maxItems} less ${ITEMS_MARGIN}`,
    ).toBeLessThanOrEqual(SYNC_QUOTA.maxItems - ITEMS_MARGIN);
  });
});

describe('saving from a closing page', () => {
  it('hands the changes to the background, which saves the valid ones', async () => {
    registerSettingsSaveListener();
    await seedStored(STORAGE_ITEMS.settings, { language: 'en' });
    const page = { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL('/options.html') };
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'settings/save', updates: { theme: 'dark', recentFoldersMax: 99 } },
      page,
    );
    await vi.waitFor(async () =>
      expect(await readStored()).toMatchObject({ language: 'en', theme: 'dark' }),
    );

    // Not from a script the extension injects into a web page.
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'settings/save', updates: { theme: 'light' } },
      { id: fakeBrowser.runtime.id, url: 'https://example.com/' },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await readStored()).toMatchObject({ language: 'en', theme: 'dark' });
  });
});

describe('settings file import', () => {
  it('places each setting in its scope, and an empty file changes nothing', async () => {
    const file = { theme: 'dark', siteIconsMaxCacheKb: 1024, groupByFolders: false };
    expect((await importSettings(JSON.stringify(file))).sort()).toEqual([
      'groupByFolders',
      'siteIconsMaxCacheKb',
      'theme',
    ]);
    expect(await readStored()).toEqual({ theme: 'dark', groupByFolders: false });
    expect(await readStoredOnDevice()).toEqual({ siteIconsMaxCacheKb: 1024 });
    expect(await importSettings('{}')).toEqual([]);
  });

  it('merges a partial file onto current settings and returns what changed', async () => {
    await seedStored(STORAGE_ITEMS.settings, { defaultNewFolderName: 'Inbox' });
    const changed = await importSettings(JSON.stringify({ theme: 'dark', unknownKey: true }));
    expect(changed).toEqual(['theme']);
    expect(await readStored()).toEqual({ theme: 'dark', defaultNewFolderName: 'Inbox' });
  });

  it.each([
    ['malformed JSON', '{not json'],
    ['an array', '[]'],
    ['no known settings', '{"foo":1}'],
  ])('rejects %s without touching storage', async (_name, json) => {
    await expect(importSettings(json)).rejects.toThrow('Invalid settings file');
    expect(await readStored()).toBeUndefined();
  });

  it('rejects files with invalid values', async () => {
    await expect(importSettings('{"theme":"neon","showFavicons":false}')).rejects.toBeInstanceOf(
      SettingsValidationError,
    );
    expect(await readStored()).toBeUndefined();
  });
});

describe('settings form helpers', () => {
  it('coerces select values by field type and ignores empty emissions', () => {
    expect(coerceSelectValue('faviconSize', '24')).toBe(24);
    expect(coerceSelectValue('maxSearchResults', '50')).toBe(50);
    expect(coerceSelectValue('theme', 'dark')).toBe('dark');
    expect(coerceSelectValue('theme', '42')).toBe('42');
    expect(coerceSelectValue('theme', '')).toBeUndefined();
    expect(coerceSelectValue('faviconSize', '')).toBeUndefined();
  });

  it('parses committed lists and validates status codes', () => {
    expect(parseListSetting('ref, page,, ref ', 'string')).toEqual(['ref', 'page']);
    expect(parseListSetting('', 'string')).toEqual([]);
    // The list editor splits typed and pasted names at commas and whitespace.
    expect(parseListTokens('utm_source, fbclid\n gclid  fbclid')).toEqual([
      'utm_source',
      'fbclid',
      'gclid',
    ]);
    expect(parseListTokens(' , ')).toEqual([]);
    expect(parseListSetting('200, 301,404', 'number')).toEqual([200, 301, 404]);
    expect(parseListSetting('200, abc', 'number')).toBeNull();
    expect(parseListSetting('99', 'number')).toBeNull();
    expect(parseListSetting('', 'number')).toBeNull();
    expect(formatListSetting(['ref', 'page'])).toBe('ref, page');
  });

  it('maps unlimited slider positions without ever storing 0', () => {
    expect(toUnlimitedSliderValue(-1)).toBe(0);
    expect(toUnlimitedSliderValue(5)).toBe(5);
    expect(fromUnlimitedSliderValue(0)).toBe(-1);
    expect(fromUnlimitedSliderValue(3)).toBe(3);
  });

  it('commits -1 and an empty field as no limit, and clamps everything else', () => {
    const unlimited = { min: 1, max: 100, unlimited: true };
    expect(commitNumberSetting(-1, unlimited)).toBe(-1);
    expect(commitNumberSetting(null, unlimited)).toBe(-1);
    expect(commitNumberSetting(0, unlimited)).toBe(1);
    expect(commitNumberSetting(1000, unlimited)).toBe(100);
    expect(commitNumberSetting(42, unlimited)).toBe(42);
    const limited = { min: 1, max: 10 };
    expect(commitNumberSetting(-1, limited)).toBe(1);
    expect(commitNumberSetting(null, limited)).toBeUndefined();
    expect(commitNumberSetting(11, limited)).toBe(10);
  });

  it('drops save errors of fields that are back at their saved value', () => {
    const errors = { defaultNewFolderName: 'empty', popupWidth: 'too wide' };
    const values = { ...defaultSettings, popupWidth: 9999 };
    expect(dropSettledErrors(errors, defaultSettings, values)).toEqual({ popupWidth: 'too wide' });
    const unchanged = { popupWidth: 'too wide' };
    expect(dropSettledErrors(unchanged, defaultSettings, values)).toBe(unchanged);
  });

  it('lists only changed fields', () => {
    const values = { ...defaultSettings, theme: 'dark' as const };
    expect(getChangedSettings(defaultSettings, values)).toEqual({ theme: 'dark' });
  });
});
