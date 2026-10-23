/**
 * List settings left in the settings item by an earlier release, once no storage migration keeps
 * them there (as after the migration that did is deleted): the next save drops them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { getSettings, saveSettings } from '@/lib/settings-storage';
import { readStoredData, STORAGE_ITEMS, seedStored } from './storage-helpers';

vi.mock('@/lib/storage/migrations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/migrations')>()),
  MIGRATIONS: [],
}));

beforeEach(() => {
  fakeBrowser.reset();
  setLanguage('en');
});

describe('list settings in the settings item with no migration keeping them', () => {
  it('are not read, and the next save drops them and keeps everything else', async () => {
    await seedStored(STORAGE_ITEMS.settings, {
      theme: 'dark',
      urlCleanerRemoveParams: ['utm_*'],
      settingFromANewerRelease: 'kept',
    });
    await seedStored(STORAGE_ITEMS.settingsList, ['ref'], 'urlCleanerPreserveParams');
    expect(await getSettings()).toMatchObject({
      theme: 'dark',
      urlCleanerRemoveParams: (await import('@/lib/settings-schema')).defaultSettings
        .urlCleanerRemoveParams,
      urlCleanerPreserveParams: ['ref'],
    });

    await saveSettings({ showFavicons: false });
    expect(await readStoredData(STORAGE_ITEMS.settings)).toEqual({
      theme: 'dark',
      settingFromANewerRelease: 'kept',
      showFavicons: false,
    });
    expect(await readStoredData(STORAGE_ITEMS.settingsList, 'urlCleanerPreserveParams')).toEqual([
      'ref',
    ]);
  });
});
