import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { defaultSettings } from '@/lib/settings-schema';
import {
  getSettings,
  importSettings,
  SETTINGS_SYNC_KEY,
  sanitizeSettings,
  saveSettings,
  saveValidSettings,
  SettingsValidationError,
  validateSettingsUpdate,
} from '@/lib/settings-storage';
import {
  coerceSelectValue,
  formatListSetting,
  fromUnlimitedSliderValue,
  getChangedSettings,
  parseListSetting,
  toUnlimitedSliderValue,
} from '@/lib/settings-form';
import { setLanguage } from '@/hooks/use-i18n';

async function readStored() {
  const result = await fakeBrowser.storage.sync.get(SETTINGS_SYNC_KEY);
  return result[SETTINGS_SYNC_KEY] as Record<string, unknown> | undefined;
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
  it('a single invalid field does not block saving other fields', async () => {
    await fakeBrowser.storage.sync.set({
      [SETTINGS_SYNC_KEY]: { ...defaultSettings, theme: 'dark', faviconSize: 32 },
    });
    const { errors } = await saveValidSettings({
      showFavicons: false,
      theme: '' as never,
    });
    expect(Object.keys(errors)).toEqual(['theme']);
    expect(await readStored()).toMatchObject({
      showFavicons: false,
      theme: 'dark',
      faviconSize: 32,
    });
  });

  it('saveSettings rejects with a readable, field-level error', async () => {
    await fakeBrowser.storage.sync.set({ [SETTINGS_SYNC_KEY]: { language: 'en' } });
    const error = await saveSettings({ recentFoldersMax: 99 }).catch((reason) => reason);
    expect(error).toBeInstanceOf(SettingsValidationError);
    expect(error.message).toBe('These settings have invalid values: Recent Folders Max');
    expect(await readStored()).toEqual({ language: 'en' });
  });

  it('reads invalid stored data without discarding valid fields', async () => {
    await fakeBrowser.storage.sync.set({
      [SETTINGS_SYNC_KEY]: { theme: 'dark', faviconSize: 0 },
    });
    const settings = await getSettings();
    expect(settings.theme).toBe('dark');
    expect(settings.faviconSize).toBe(defaultSettings.faviconSize);
  });
});

describe('settings import', () => {
  it('merges a partial file onto current settings and returns what changed', async () => {
    await fakeBrowser.storage.sync.set({
      [SETTINGS_SYNC_KEY]: { ...defaultSettings, defaultNewFolderName: 'Inbox' },
    });
    const changed = await importSettings(JSON.stringify({ theme: 'dark', unknownKey: true }));
    expect(changed).toEqual(['theme']);
    const stored = await readStored();
    expect(stored).toMatchObject({ theme: 'dark', defaultNewFolderName: 'Inbox' });
    expect(stored).not.toHaveProperty('unknownKey');
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
    expect(coerceSelectValue('aiModel', '42')).toBe('42');
    expect(coerceSelectValue('theme', '')).toBeUndefined();
    expect(coerceSelectValue('faviconSize', '')).toBeUndefined();
  });

  it('parses committed lists and validates status codes', () => {
    expect(parseListSetting('ref, page,, ref ', 'string')).toEqual(['ref', 'page']);
    expect(parseListSetting('', 'string')).toEqual([]);
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

  it('lists only changed fields', () => {
    const values = { ...defaultSettings, theme: 'dark' as const };
    expect(getChangedSettings(defaultSettings, values)).toEqual({ theme: 'dark' });
  });
});
