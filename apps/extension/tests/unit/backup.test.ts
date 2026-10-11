import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { getStoredAIProviderConfig, saveStoredAIProviderConfig } from '@/lib/ai-provider-storage';
import { addAIService, getAIServicesState } from '@/lib/ai-services-storage';
import { getBookmarkTableView, updateBookmarkTableView } from '@/lib/bookmark-table-view-storage';
import { getPromptLibrary, saveCustomPrompt, setActivePrompt } from '@/lib/prompt-library-storage';
import { createSavedSearch, getSavedSearches } from '@/lib/saved-searches-storage';
import { addSearchHistoryEntry, getSearchHistory } from '@/lib/search-history-storage';
import { getSettings, saveSettings } from '@/lib/settings-storage';
import { STORAGE_ITEMS, type StorageItem, type StorageItemId } from '@/lib/storage/registry';
import { exportBackup, getBackupItemIds, isBackupFile, restoreBackup } from '@/services/backup';
import { seedStored } from './storage-helpers';

beforeEach(async () => {
  fakeBrowser.reset();
  await saveSettings({ language: 'en' });
  setLanguage('en');
});

/** Fills every backed-up item and a few that must stay out of a backup. */
async function seedUserData() {
  await saveSettings({ theme: 'dark', quickSaveFixedFolder: '42' });
  await updateBookmarkTableView({ sorting: [{ id: 'title', desc: true }], pageSize: 50 });
  const prompt = await saveCustomPrompt({ task: 'auto_tagging', name: 'Mine', system: 'Tag it' });
  await setActivePrompt('auto_tagging', prompt.id);
  const service = await addAIService('openai', 'Work');
  await saveStoredAIProviderConfig(service.id, { apiKey: 'sk-synthetic-secret' });
  await createSavedSearch('Docs', { filters: { title: 'docs' }, sorting: [] });
  await addSearchHistoryEntry('private query');
  return { prompt, service };
}

describe('backup file', () => {
  it('holds every item the registry backs up, and nothing secret or device-bound', async () => {
    const included = (Object.entries(STORAGE_ITEMS) as [StorageItemId, StorageItem][])
      .filter(([, item]) => item.backup === 'include')
      .map(([id]) => id);
    expect(getBackupItemIds()).toEqual(included);

    await seedUserData();
    const json = await exportBackup(new Date('2026-10-11T00:00:00Z'));
    const file = JSON.parse(json);
    expect(file).toMatchObject({ format: 'bookmark-scout-backup', version: 1 });
    expect(Object.keys(file.items).sort()).toEqual(
      expect.arrayContaining([
        'local:ai.services',
        'local:search.saved',
        'local:settings',
        'sync:manager.table-view',
        'sync:prompts.index',
        'sync:settings',
      ]),
    );
    expect(Object.keys(file.items).some((key) => key.startsWith('sync:prompts.prompt/'))).toBe(
      true,
    );
    expect(json).not.toContain('sk-synthetic-secret');
    expect(json).not.toContain('private query');
    expect(json).not.toContain('pageSize');
    expect(isBackupFile(json)).toBe(true);
    expect(isBackupFile('{"theme":"dark"}')).toBe(false);
  });

  it('restores everything it holds on a fresh install, without credentials', async () => {
    const { service } = await seedUserData();
    const json = await exportBackup();
    fakeBrowser.reset();
    await saveSettings({ language: 'en' });

    await restoreBackup(json);
    expect(await getSettings()).toMatchObject({ theme: 'dark', quickSaveFixedFolder: '42' });
    expect((await getBookmarkTableView()).sorting).toEqual([{ id: 'title', desc: true }]);
    const library = await getPromptLibrary();
    expect(library.prompts.map((prompt) => prompt.name)).toEqual(['Mine']);
    expect(library.active.auto_tagging).toBe(library.prompts[0].id);
    expect((await getAIServicesState()).services.map((item) => item.id)).toEqual([service.id]);
    expect(await getStoredAIProviderConfig(service.id)).toEqual({});
    expect((await getSavedSearches()).map((search) => search.name)).toEqual(['Docs']);
    expect(await getSearchHistory()).toEqual([]);
  });

  it('replaces prompts the backup does not have and skips items from a newer release', async () => {
    const json = JSON.parse(await exportBackup());
    await saveCustomPrompt({ task: 'auto_tagging', name: 'Local only', system: 'x' });
    await saveSettings({ theme: 'light' });
    json.items['sync:settings'] = { v: 99, data: { theme: 'dark' } };

    expect(await restoreBackup(JSON.stringify(json))).not.toContain('settings');
    expect((await getPromptLibrary()).prompts).toEqual([]);
    expect((await getSettings()).theme).toBe('light');
  });

  it('rejects a file that is not a backup', async () => {
    await seedStored(STORAGE_ITEMS.settings, { theme: 'dark' });
    for (const json of ['{nope', '{"format":"bookmark-scout-backup","version":2,"items":{}}']) {
      await expect(restoreBackup(json)).rejects.toThrow('Invalid backup file');
    }
    expect((await getSettings()).theme).toBe('dark');
  });
});
