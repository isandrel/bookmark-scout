/**
 * The backup file and its parts (`services/backup-file.lazy.ts`, `backup-categories.lazy.ts`):
 * export only what is selected, review without changing anything, Merge and Replace, conflicts,
 * the AI service keys opt-in, older files through the one converter path, and unknown parts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { aboutMeValue } from '@/lib/about-me-storage';
import { getStoredAIProviderConfig, saveStoredAIProviderConfig } from '@/lib/ai-provider-storage';
import { addAIService, getAIServicesState, updateAIService } from '@/lib/ai-services-storage';
import { bookmarkRulesValue } from '@/lib/bookmark-rules-storage';
import { getBookmarkTableView, updateBookmarkTableView } from '@/lib/bookmark-table-view-storage';
import {
  customPromptItems,
  getPromptLibrary,
  saveCustomPrompt,
  setActivePrompt,
} from '@/lib/prompt-library-storage';
import { createSavedSearch, getSavedSearches } from '@/lib/saved-searches-storage';
import { addSearchHistoryEntry } from '@/lib/search-history-storage';
import { SEARCH_SYNTAX_VERSION } from '@/lib/search-query';
import { defaultSettings } from '@/lib/settings-schema';
import { getSettings, saveSettings } from '@/lib/settings-storage';
import { STORAGE_ITEMS, storageKey } from '@/lib/storage/registry';
import {
  type BackupExportRequest,
  makeBackupFile,
  openBackup,
  reviewBackupImport,
} from '@/services/backup';
import { installFakeBookmarks } from '../fake-bookmarks';
import {
  formatOneFile,
  resetBackupDatabases,
  restoreParts,
  stubManifestVersion,
} from './backup-helpers';
import { seedStored } from './storage-helpers';

beforeEach(async () => {
  fakeBrowser.reset();
  await resetBackupDatabases();
  await saveSettings({ language: 'en' });
  setLanguage('en');
  stubManifestVersion();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const save = async (categories: string[], extra: Partial<BackupExportRequest> = {}) =>
  (await makeBackupFile({ categories, protection: 'none', ...extra })).json;

const rule = (id: string, name: string, tag: string) => ({
  id,
  name,
  enabled: true,
  query: 'docs',
  syntaxVersion: SEARCH_SYNTAX_VERSION,
  addTags: [tag],
});

/** Fills every part and a few things that are in no backup. */
async function seedUserData() {
  await saveSettings({ theme: 'dark', quickSaveFixedFolder: '42' });
  await updateBookmarkTableView({ sorting: [{ id: 'title', desc: true }], pageSize: 50 });
  const prompt = await saveCustomPrompt({ task: 'auto_tagging', name: 'Mine', system: 'Tag it' });
  await setActivePrompt('auto_tagging', prompt.id);
  await aboutMeValue.set('A teacher');
  const service = await addAIService('openai', 'Work');
  await saveStoredAIProviderConfig(service.id, { apiKey: 'sk-synthetic-secret' });
  await createSavedSearch('Docs', { filters: { title: 'docs' }, sorting: [] });
  await bookmarkRulesValue.set([rule('r1', 'Docs rule', 'docs')]);
  await addSearchHistoryEntry('private query');
  return { prompt, service };
}

describe('backup file', () => {
  it('holds only the parts selected, with a manifest, and never the keys unless selected', async () => {
    installFakeBookmarks([]);
    await seedUserData();
    const built = await makeBackupFile(
      { categories: ['prompts', 'settings'], protection: 'none' },
      new Date(2026, 9, 23, 12),
    );
    const file = JSON.parse(built.json);
    expect(file).toMatchObject({
      format: 'bookmark-scout-backup',
      formatVersion: 2,
      app: 'bookmark-scout',
      appVersion: '0.3.4',
      createdAt: new Date(2026, 9, 23, 12).toISOString(),
    });
    // In the config's order, whatever the request's order.
    expect(file.categories).toEqual([
      { id: 'settings', count: 2, bytes: expect.any(Number) },
      { id: 'prompts', count: 2, bytes: expect.any(Number) },
    ]);
    expect(Object.keys(file.sections)).toEqual(['settings', 'prompts']);
    expect(built.filename).toBe('bookmark-scout-backup_2026-10-23_settings-prompts.json');
    expect(built.json).not.toContain('sk-synthetic-secret');
    expect(built.json).not.toContain('private query');
    // This device's settings are their own part.
    expect(built.json).not.toContain('quickSaveFixedFolder');

    const everything = await save([
      'settings',
      'deviceSettings',
      'views',
      'prompts',
      'rules',
      'aiServices',
      'covers',
    ]);
    expect(everything).not.toContain('sk-synthetic-secret');
    expect(everything).toContain('quickSaveFixedFolder');
    expect(await save(['aiServiceKeys'])).toContain('sk-synthetic-secret');
    await expect(save([])).rejects.toThrow('Select at least one part.');
  });

  it('reviews a file without changing anything, then restores everything on a fresh install', async () => {
    const { service } = await seedUserData();
    const json = await save([
      'settings',
      'deviceSettings',
      'views',
      'prompts',
      'rules',
      'aiServices',
    ]);
    fakeBrowser.reset();
    await saveSettings({ language: 'en' });

    const opened = await openBackup(json);
    if (!opened) throw new Error('not a backup');
    const reviews = await reviewBackupImport(opened);
    expect(reviews.settings).toMatchObject({ count: 2, added: 1, changed: 0, unchanged: 1 });
    expect(reviews.views).toMatchObject({ count: 2, added: 2 });
    expect(reviews.rules).toMatchObject({ count: 1, added: 1, removed: 0 });
    // Nothing changed yet.
    expect((await getSettings()).theme).toBe(defaultSettings.theme);
    expect(await getSavedSearches()).toEqual([]);

    const outcome = await restoreParts(json, {
      settings: 'merge',
      deviceSettings: 'merge',
      views: 'merge',
      prompts: 'merge',
      rules: 'merge',
      aiServices: 'merge',
    });
    expect(outcome.failed).toBeUndefined();
    expect(outcome.outcomes.aiServices.needsSetup).toEqual([{ name: 'Work', fields: ['apiKey'] }]);
    expect(Object.values(outcome.outcomes).every((part) => part.mismatches === 0)).toBe(true);
    expect(await getSettings()).toMatchObject({ theme: 'dark', quickSaveFixedFolder: '42' });
    expect((await getBookmarkTableView()).sorting).toEqual([{ id: 'title', desc: true }]);
    const library = await getPromptLibrary();
    expect(library.prompts.map((prompt) => prompt.name)).toEqual(['Mine']);
    expect(library.active.auto_tagging).toBe(library.prompts[0].id);
    expect(await aboutMeValue.get()).toBe('A teacher');
    expect((await getAIServicesState()).services.map((item) => item.id)).toEqual([service.id]);
    expect(await getStoredAIProviderConfig(service.id)).toEqual({ pendingSecrets: ['apiKey'] });
    expect((await getSavedSearches()).map((search) => search.name)).toEqual(['Docs']);
    expect((await bookmarkRulesValue.get()).map((entry) => entry.name)).toEqual(['Docs rule']);
  });

  it('merges by default, keeping what only this device has; replace removes it', async () => {
    await bookmarkRulesValue.set([rule('r1', 'From file', 'a')]);
    await saveSettings({ theme: 'dark', urlCleanerRemoveParams: ['utm_*'] });
    const json = await save(['settings', 'rules']);
    await bookmarkRulesValue.set([rule('r2', 'Only here', 'b')]);
    await saveSettings({
      theme: 'light',
      showFavicons: !defaultSettings.showFavicons,
      urlCleanerRemoveParams: ['ref'],
    });

    const opened = await openBackup(json);
    if (!opened) throw new Error('not a backup');
    const reviews = await reviewBackupImport(opened);
    expect(reviews.rules).toMatchObject({ added: 1, removed: 1 });
    expect(reviews.settings).toMatchObject({ changed: 2, removed: 1 });

    await restoreParts(json, { settings: 'merge', rules: 'merge' });
    expect((await bookmarkRulesValue.get()).map((entry) => entry.id)).toEqual(['r2', 'r1']);
    expect(await getSettings()).toMatchObject({
      theme: 'dark',
      showFavicons: !defaultSettings.showFavicons,
      urlCleanerRemoveParams: ['utm_*'],
    });

    await restoreParts(json, { settings: 'replace', rules: 'replace' });
    expect((await bookmarkRulesValue.get()).map((entry) => entry.id)).toEqual(['r1']);
    expect((await getSettings()).showFavicons).toBe(defaultSettings.showFavicons);
  });

  it('lists conflicts and resolves each as chosen: newer by date, the file, or this device', async () => {
    const older = await saveCustomPrompt({ task: 'auto_tagging', name: 'Shared', system: 'old' });
    const other = await saveCustomPrompt({ task: 'summarization', name: 'Other', system: 'file' });
    await bookmarkRulesValue.set([rule('r1', 'Rule', 'file-tag')]);
    const json = await save(['prompts', 'rules']);
    // Changed here after the backup: this device's prompt is newer.
    await customPromptItems
      .entry(older.id)
      .set({ ...older, system: 'new here', updatedAt: older.updatedAt + 1000 });
    await customPromptItems
      .entry(other.id)
      .set({ ...other, system: 'older here', updatedAt: other.updatedAt - 1000 });
    await bookmarkRulesValue.set([rule('r1', 'Rule', 'device-tag')]);

    const opened = await openBackup(json);
    if (!opened) throw new Error('not a backup');
    const reviews = await reviewBackupImport(opened);
    expect(reviews.prompts.dated).toBe(true);
    expect(reviews.prompts.conflicts.map((conflict) => conflict.label).sort()).toEqual([
      'Other',
      'Shared',
    ]);
    expect(reviews.rules).toMatchObject({ dated: false, conflictCount: 1 });

    // Newer keeps this device's newer prompt and takes the file's newer one.
    await restoreParts(json, {
      prompts: { strategy: 'merge', conflicts: 'newer' },
      rules: {
        strategy: 'merge',
        conflicts: 'file',
        perItem: { [reviews.rules.conflicts[0].key]: 'device' },
      },
    });
    expect((await customPromptItems.entry(older.id).get())?.system).toBe('new here');
    expect((await customPromptItems.entry(other.id).get())?.system).toBe('file');
    expect((await bookmarkRulesValue.get())[0].addTags).toEqual(['device-tag']);

    await restoreParts(json, { prompts: { strategy: 'merge', conflicts: 'file' } });
    expect((await customPromptItems.entry(older.id).get())?.system).toBe('old');
  });

  it('skips settings that are not valid and items a newer release wrote', async () => {
    await saveSettings({ theme: 'dark' });
    const file = JSON.parse(await save(['settings', 'views']));
    file.sections.settings.items[storageKey(STORAGE_ITEMS.settings)].data.theme = 'neon';
    file.sections.views.items[storageKey(STORAGE_ITEMS.tableView)] = { v: 99, data: {} };
    await saveSettings({ theme: 'light' });
    const opened = await openBackup(JSON.stringify(file));
    if (!opened) throw new Error('not a backup');
    const reviews = await reviewBackupImport(opened);
    expect(reviews.settings.skipped).toBe(1);
    expect(reviews.views.skipped).toBe(1);
    await restoreParts(JSON.stringify(file), { settings: 'merge', views: 'merge' });
    expect((await getSettings()).theme).toBe('light');
  });

  it('includes the keys only when selected, and imports them only for services this device has', async () => {
    const work = await addAIService('openai', 'Work');
    await saveStoredAIProviderConfig(work.id, {
      apiKey: 'sk-synthetic-work',
      extraHeaders: '{"X":"y"}',
      baseUrl: 'https://proxy.invalid/v1',
    });
    const json = await save(['aiServices', 'aiServiceKeys']);
    expect(JSON.parse(json).sections.aiServiceKeys).toEqual({
      secrets: { [work.id]: { apiKey: 'sk-synthetic-work', extraHeaders: '{"X":"y"}' } },
    });

    // A new computer: only the keys are imported first, for a service it does not have.
    fakeBrowser.reset();
    await saveSettings({ language: 'en' });
    const keysOnly = await restoreParts(json, { aiServiceKeys: 'merge' });
    expect(keysOnly.outcomes.aiServiceKeys).toMatchObject({ added: 0, skipped: 1 });

    // With the services, the keys land and nothing waits for setup.
    const both = await restoreParts(json, { aiServices: 'merge', aiServiceKeys: 'merge' });
    expect(both.outcomes.aiServiceKeys).toMatchObject({ added: 1, mismatches: 0 });
    expect(await getStoredAIProviderConfig(work.id)).toEqual({
      apiKey: 'sk-synthetic-work',
      extraHeaders: '{"X":"y"}',
      baseUrl: 'https://proxy.invalid/v1',
    });

    // Replace removes the keys of services the file has none for.
    const other = await addAIService('anthropic', 'Other');
    await saveStoredAIProviderConfig(other.id, { apiKey: 'sk-synthetic-other' });
    await restoreParts(json, { aiServiceKeys: 'replace' });
    expect((await getStoredAIProviderConfig(other.id)).apiKey).toBeUndefined();
  });

  it('keeps AI service endpoints without keys, and says what to enter again', async () => {
    const custom = await addAIService('custom', 'Local');
    await updateAIService(custom.id, { model: 'my-model' });
    await saveStoredAIProviderConfig(custom.id, {
      baseUrl: 'http://localhost:8080/v1',
      extraHeaders: '{"Authorization":"Bearer synthetic-header-secret"}',
    });
    const json = await save(['aiServices']);
    expect(json).not.toContain('synthetic-header-secret');
    expect(JSON.parse(json).sections.aiServices.endpoints).toEqual({
      [custom.id]: { baseUrl: 'http://localhost:8080/v1', leftOut: ['extraHeaders'] },
    });
    fakeBrowser.reset();
    await saveSettings({ language: 'en' });
    const outcome = await restoreParts(json, { aiServices: 'merge' });
    expect(outcome.outcomes.aiServices.needsSetup).toEqual([
      { name: 'Local', fields: ['extraHeaders'] },
    ]);
    expect(await getStoredAIProviderConfig(custom.id)).toEqual({
      baseUrl: 'http://localhost:8080/v1',
      pendingSecrets: ['extraHeaders'],
    });
  });

  it('lists a part from a newer release as not supported and skips it', async () => {
    await saveSettings({ theme: 'dark' });
    const file = JSON.parse(await save(['settings']));
    file.categories.push({ id: 'futurePart', count: 3, bytes: 10 });
    file.sections.futurePart = { anything: true };
    const opened = await openBackup(JSON.stringify(file));
    expect(opened?.parts.map(({ id, known }) => [id, known])).toEqual([
      ['settings', true],
      ['futurePart', false],
    ]);
    const outcome = await restoreParts(JSON.stringify(file), {
      settings: 'merge',
      futurePart: 'merge',
    });
    expect(Object.keys(outcome.outcomes)).toEqual(['settings']);
  });

  it('marks a part whose data fails its checks, refuses a newer format, and ignores other JSON', async () => {
    const file = JSON.parse(await save(['settings', 'rules']));
    file.sections.rules = { items: 'not items' };
    const opened = await openBackup(JSON.stringify(file));
    expect(opened?.parts.find((part) => part.id === 'rules')?.invalid).toBe(true);
    await expect(openBackup(JSON.stringify({ ...file, formatVersion: 3 }))).rejects.toThrow(
      'newer version',
    );
    await expect(openBackup('{"format":"bookmark-scout-backup","version":"x"}')).rejects.toThrow(
      'Invalid backup file',
    );
    expect(await openBackup('{"theme":"dark"}')).toBeNull();
    expect(await openBackup('{nope')).toBeNull();
  });

  it('converts a format 1 file, with its AI endpoints and covers, through the converter', async () => {
    const opened = await openBackup(
      formatOneFile(
        {
          [storageKey(STORAGE_ITEMS.settings)]: { v: 1, data: { theme: 'dark' } },
          [storageKey(STORAGE_ITEMS.deviceSettings)]: { v: 1, data: { quickSaveFixedFolder: '7' } },
          [storageKey(STORAGE_ITEMS.aiServices)]: {
            v: 1,
            data: {
              services: [{ id: 's1', name: 'Work', provider: 'openai', model: '', enabled: true }],
            },
          },
          [storageKey(STORAGE_ITEMS.searchHistory)]: { v: 1, data: ['never restored'] },
        },
        { aiEndpoints: { s1: { leftOut: ['apiKey'] } }, covers: [{ url: 'https://a.invalid' }] },
      ),
    );
    expect(opened?.createdAt).toBe('2026-10-11T00:00:00.000Z');
    expect(opened?.parts.map(({ id, invalid }) => [id, invalid])).toEqual([
      ['settings', false],
      ['deviceSettings', false],
      ['aiServices', false],
      ['covers', false],
    ]);
    expect(opened?.sections.aiServices).toMatchObject({
      endpoints: { s1: { leftOut: ['apiKey'] } },
    });
    const outcome = await restoreParts(
      formatOneFile({ [storageKey(STORAGE_ITEMS.settings)]: { v: 1, data: { theme: 'dark' } } }),
      { settings: 'merge' },
    );
    expect(outcome.outcomes.settings).toMatchObject({ added: 1 });
    expect((await getSettings()).theme).toBe('dark');
  });

  it('remembers nothing secret: the Parts in New Backups setting has no keys part', async () => {
    await seedStored(STORAGE_ITEMS.deviceSettings, { backupExportCategories: ['aiServiceKeys'] });
    expect((await getSettings()).backupExportCategories).toEqual(
      defaultSettings.backupExportCategories,
    );
  });
});
