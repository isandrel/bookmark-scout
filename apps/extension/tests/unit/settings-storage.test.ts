import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { syncItemBytes } from '@/lib/prompt-library-storage';
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
  settingsValue,
  undoResetSettings,
  validateSettingsUpdate,
} from '@/lib/settings-storage';
import { DEVICE_SETTING_KEYS, storageAreaKey } from '@/lib/storage/registry';
import { toStoredEnvelope } from '@/lib/storage/stored-value';
import { readStoredData, STORAGE_ITEMS, seedStored } from './storage-helpers';

/** What sync storage holds for settings. */
async function readStored() {
  return (await readStoredData(STORAGE_ITEMS.settings)) as Record<string, unknown> | undefined;
}

/** What this device's storage holds for settings. */
async function readStoredOnDevice() {
  return (await readStoredData(STORAGE_ITEMS.deviceSettings)) as
    | Record<string, unknown>
    | undefined;
}

beforeEach(() => {
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

  it('keeps list settings in their own synced item, and moves lists an earlier release stored', async () => {
    await saveSettings({ urlCleanerRemoveParams: ['utm_*'], theme: 'dark' });
    expect(await readStored()).toEqual({ theme: 'dark' });
    expect(await readStoredData(STORAGE_ITEMS.settingsLists)).toEqual({
      urlCleanerRemoveParams: ['utm_*'],
    });
    expect(getSettingScope('urlCleanerRemoveParams')).toBe('lists');
    expect(getSettingScope('agentBridgeDisabledActions')).toBe('device');

    // Lists an earlier release kept in the settings item still count, and the next save moves them.
    await seedStored(STORAGE_ITEMS.settingsLists, {});
    await seedStored(STORAGE_ITEMS.settings, { theme: 'dark', managerMenuActions: ['open'] });
    expect((await getSettings()).managerMenuActions).toEqual(['open']);
    await saveSettings({ showFavicons: false });
    expect(await readStored()).toEqual({ theme: 'dark', showFavicons: false });
    expect(await readStoredData(STORAGE_ITEMS.settingsLists)).toEqual({
      managerMenuActions: ['open'],
    });
    expect((await getSettings()).managerMenuActions).toEqual(['open']);
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

  it('caps each synced settings item within the 8,192-byte sync quota at its largest', () => {
    // Every synced setting at its largest stored form: lists full of the longest names, text at
    // its maximum length in the costliest character (Chrome stores `<` as 6 bytes), numbers at
    // their longest form, and each choice at its longest option.
    const meta = getSettingsFieldMeta();
    const bounds: Partial<Record<keyof Settings, NumberSetting>> = SETTING_NUMBER_BOUNDS;
    const longestOf = <T>(values: T[]) =>
      values.reduce((a, b) => (JSON.stringify(b).length > JSON.stringify(a).length ? b : a));
    const largest = Object.fromEntries(
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
          expect(field.maxLength ?? options.length, `${key} has no length limit`).toBeGreaterThan(
            0,
          );
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
    expect(settingsSchema.safeParse({ ...defaultSettings, ...largest }).success).toBe(true);
    // A name takes one byte a character: the characters that take more are not allowed.
    for (const name of ['a"b', 'a<b', 'a\\b', 'äb', 'a b']) {
      expect(settingsSchema.shape.urlCleanerRemoveParams.safeParse([name]).success, name).toBe(
        false,
      );
    }

    // Each synced item holds its own scope's settings and has its own quota.
    for (const [scope, item] of [
      ['sync', STORAGE_ITEMS.settings],
      ['lists', STORAGE_ITEMS.settingsLists],
    ] as const) {
      const stored = Object.fromEntries(
        SETTING_KEYS_BY_SCOPE[scope].map((key) => [key, largest[key]]),
      );
      const bytes = syncItemBytes(storageAreaKey(item), toStoredEnvelope(item, stored));
      expect(bytes, item.name).toBeLessThanOrEqual(8192);
    }
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
