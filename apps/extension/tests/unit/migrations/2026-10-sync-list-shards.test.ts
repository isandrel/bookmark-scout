/**
 * The move of every synced list setting to an item of its own
 * (`src/lib/storage/migrations/2026-10-sync-list-shards.ts`); deleted with it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { defaultSettings } from '@/lib/settings-schema';
import {
  getSettings,
  registerStorageMigrations,
  resetSettings,
  runStorageMigrations,
  saveSettings,
  settingsOverrideValues,
  undoResetSettings,
} from '@/lib/settings-storage';
import {
  markItemMenu0_3_4,
  syncListShards,
} from '@/lib/storage/migrations/2026-10-sync-list-shards';
import { storageKey } from '@/lib/storage/registry';
import { makeBackupFile, undoBackupImport } from '@/services/backup';
import { installFakeBookmarks } from '../../fake-bookmarks';
import { formatOneFile, restoreParts, stubManifestVersion } from '../backup-helpers';
import { readStoredData, readStoredRaw, STORAGE_ITEMS, seedStored } from '../storage-helpers';

// biome-ignore lint/style/noNonNullAssertion: this migration reads an old item.
const OLD_ITEM = syncListShards.legacy!.item;

/** The shared lists item as builds after 0.3.4 stored it, with entries to drop. */
const OLD_LISTS = {
  urlCleanerRemoveParams: ['utm_*'],
  managerMenuActions: ['edit'],
  askAiDisabledActions: ['deleteBookmarks'],
  // Not valid: dropped alone.
  deadLinksSuccessStatuses: ['not a status'],
  // Not a setting this release knows.
  listFromAnOldBuild: ['x'],
};

/** The lists 0.3.4 kept in the settings item, with a scalar setting. */
const SETTINGS_0_3_4 = {
  theme: 'dark',
  askAiDisabledActions: ['checkLinks'],
  privacyScannerSensitiveParams: ['secret'],
};

/** Menus this device kept, and a setting that stays on it. */
const DEVICE_MENUS = {
  managerOrganizeMenu: ['addFolder', 'sortByName'],
  managerEmptySpaceMenu: ['paste'],
  managerPreviewMenu: ['edit'],
  popupBookmarkMenu: ['delete'],
  popupFolderMenu: ['addFolder'],
  managerCardSize: 'small',
};

/** 0.3.4's item menu but Edit, marked hidden. */
const HIDDEN_BESIDE_EDIT = [
  '!showInFolder',
  '!viewDetails',
  '!cut',
  '!copy',
  '!paste',
  '!copyFolderLink',
  '!copyId',
  '!openInNewTab',
  '!openInNewWindow',
  '!openInPrivateWindow',
  '!delete',
];

const listItems = () => settingsOverrideValues.lists.get();
const completed = () => readStoredData(STORAGE_ITEMS.storageMigrations);

async function seedEarlierReleases() {
  await seedStored(STORAGE_ITEMS.settings, SETTINGS_0_3_4);
  await seedStored(OLD_ITEM, OLD_LISTS);
  await seedStored(STORAGE_ITEMS.deviceSettings, DEVICE_MENUS);
}

beforeEach(() => {
  vi.restoreAllMocks();
  fakeBrowser.reset();
  setLanguage('en');
});

describe('each list setting in its own item', () => {
  it('reads the lists where earlier releases kept them until it has run', async () => {
    await seedEarlierReleases();
    expect(await getSettings()).toMatchObject({
      theme: 'dark',
      urlCleanerRemoveParams: ['utm_*'],
      // The shared lists item wins over the settings item.
      askAiDisabledActions: ['deleteBookmarks'],
      privacyScannerSensitiveParams: ['secret'],
      managerOrganizeMenu: ['addFolder', 'sortByName'],
      deadLinksSuccessStatuses: defaultSettings.deadLinksSuccessStatuses,
    });
  });

  it('moves every list to its item in one sync write, keeping the old places', async () => {
    await seedEarlierReleases();
    // A list item another device wrote wins over the old places.
    await seedStored(STORAGE_ITEMS.settingsList, ['rename'], 'popupFolderMenu');
    const oldRaw = await readStoredRaw(OLD_ITEM);
    const set = vi.spyOn(fakeBrowser.storage.sync, 'set');

    await runStorageMigrations();
    expect(set).toHaveBeenCalledOnce();
    expect(await listItems()).toEqual({
      urlCleanerRemoveParams: ['utm_*'],
      // With no marks, in the form menus are stored in now: the rest of 0.3.4's menu hidden.
      managerMenuActions: ['-edit', ...HIDDEN_BESIDE_EDIT],
      askAiDisabledActions: ['deleteBookmarks'],
      privacyScannerSensitiveParams: ['secret'],
      managerOrganizeMenu: ['addFolder', 'sortByName'],
      managerEmptySpaceMenu: ['paste'],
      managerPreviewMenu: ['edit'],
      popupBookmarkMenu: ['delete'],
      popupFolderMenu: ['rename'],
    });
    // Devices still on an earlier release keep reading the old places, which are never written.
    expect(await readStoredRaw(OLD_ITEM)).toEqual(oldRaw);
    expect(await readStoredData(STORAGE_ITEMS.settings)).toEqual(SETTINGS_0_3_4);
    // This device's menus moved to sync; what stays on it stays.
    expect(await readStoredData(STORAGE_ITEMS.deviceSettings)).toEqual({
      managerCardSize: 'small',
    });
    expect(await completed()).toEqual([syncListShards.id]);

    // Once run, it reads and writes nothing more, and a list set back to its default stays so.
    set.mockClear();
    await runStorageMigrations();
    expect(set).not.toHaveBeenCalled();
    await saveSettings({ urlCleanerRemoveParams: defaultSettings.urlCleanerRemoveParams });
    expect((await getSettings()).urlCleanerRemoveParams).toEqual(
      defaultSettings.urlCleanerRemoveParams,
    );
    expect(await readStoredRaw(OLD_ITEM)).toEqual(oldRaw);
  });

  it('keeps 0.3.4 lists in the settings item current for devices still on 0.3.4', async () => {
    await seedEarlierReleases();
    await runStorageMigrations();
    await saveSettings({
      theme: 'light',
      urlCleanerRemoveParams: ['ref'],
      privacyScannerSensitiveParams: defaultSettings.privacyScannerSensitiveParams,
      // A list 0.3.4 did not have stays out of the settings item.
      pageTextExcludedSites: ['example.com'],
    });
    expect(await readStoredData(STORAGE_ITEMS.settings)).toEqual({
      theme: 'light',
      askAiDisabledActions: ['checkLinks'],
      urlCleanerRemoveParams: ['ref'],
    });
    expect((await listItems()).urlCleanerRemoveParams).toEqual(['ref']);
    expect((await listItems()).pageTextExcludedSites).toEqual(['example.com']);
  });

  it('does not bring back a list set back to its default when another device migrates', async () => {
    await seedStored(STORAGE_ITEMS.settings, { theme: 'dark', urlCleanerRemoveParams: ['ref'] });
    // Device A moves the lists, then the user sets the list back to its default there.
    await runStorageMigrations();
    await saveSettings({ urlCleanerRemoveParams: defaultSettings.urlCleanerRemoveParams });
    // Device B: the same synced items, nothing of its own yet.
    await fakeBrowser.storage.local.clear();
    expect((await getSettings()).urlCleanerRemoveParams).toEqual(
      defaultSettings.urlCleanerRemoveParams,
    );
    await runStorageMigrations();
    expect(await readStoredData(STORAGE_ITEMS.settingsList, 'urlCleanerRemoveParams')).toBe(
      undefined,
    );
    expect((await getSettings()).urlCleanerRemoveParams).toEqual(
      defaultSettings.urlCleanerRemoveParams,
    );
  });

  it('resets the copies 0.3.4 reads, so neither 0.3.4 nor a new device brings them back', async () => {
    await seedStored(STORAGE_ITEMS.settings, SETTINGS_0_3_4);
    await runStorageMigrations();
    await resetSettings();
    expect(await readStoredData(STORAGE_ITEMS.settings)).toBeUndefined();
    await fakeBrowser.storage.local.clear();
    await runStorageMigrations();
    expect(await getSettings()).toMatchObject({
      theme: defaultSettings.theme,
      askAiDisabledActions: defaultSettings.askAiDisabledActions,
      privacyScannerSensitiveParams: defaultSettings.privacyScannerSensitiveParams,
    });
  });

  it('puts back the copies 0.3.4 reads, as they were stored, when Reset All is undone', async () => {
    // 0.3.4's item menu in its own form, and a list this release has changed since.
    await seedStored(STORAGE_ITEMS.settings, { ...SETTINGS_0_3_4, managerMenuActions: ['edit'] });
    await runStorageMigrations();
    await saveSettings({ urlCleanerRemoveParams: ['ref'] });
    const settingsItem = await readStoredRaw(STORAGE_ITEMS.settings);
    const lists = await listItems();
    expect(settingsItem).toMatchObject({
      data: { managerMenuActions: ['edit'], urlCleanerRemoveParams: ['ref'] },
    });

    const reset = await resetSettings();
    expect(await readStoredData(STORAGE_ITEMS.settings)).toBeUndefined();
    await undoResetSettings(reset);
    expect(await readStoredRaw(STORAGE_ITEMS.settings)).toEqual(settingsItem);
    expect(await listItems()).toEqual(lists);

    // A device that runs the migration later reads the same lists.
    await fakeBrowser.storage.local.clear();
    await runStorageMigrations();
    expect(await getSettings()).toMatchObject({
      theme: 'dark',
      askAiDisabledActions: ['checkLinks'],
      privacyScannerSensitiveParams: ['secret'],
      urlCleanerRemoveParams: ['ref'],
      managerMenuActions: ['-edit', ...HIDDEN_BESIDE_EDIT],
    });
  });

  it('gives no 0.3.4 copies to a user who had none when Reset All is undone', async () => {
    await saveSettings({ theme: 'dark', urlCleanerRemoveParams: ['ref'] });
    const reset = await resetSettings();
    await undoResetSettings(reset);
    expect(await readStoredData(STORAGE_ITEMS.settings)).toEqual({ theme: 'dark' });
    expect(await listItems()).toEqual({ urlCleanerRemoveParams: ['ref'] });
  });

  it('puts back no 0.3.4 copy of a list changed since Reset All that the undo leaves as it is', async () => {
    await seedStored(STORAGE_ITEMS.settings, { askAiDisabledActions: ['checkLinks'] });
    await runStorageMigrations();
    // A device still on 0.3.4 then changed a list this device has at its default.
    await seedStored(STORAGE_ITEMS.settings, {
      askAiDisabledActions: ['checkLinks'],
      urlCleanerRemoveParams: ['from-0.3.4'],
    });
    const reset = await resetSettings();
    await saveSettings({ urlCleanerRemoveParams: ['since'] });
    await undoResetSettings(reset);
    expect(await readStoredData(STORAGE_ITEMS.settings)).toEqual({
      askAiDisabledActions: ['checkLinks'],
    });
    expect((await getSettings()).urlCleanerRemoveParams).toEqual(['since']);
  });

  it('puts back the copies 0.3.4 reads, as they were stored, when a settings restore is undone', async () => {
    stubManifestVersion();
    installFakeBookmarks([]);
    await seedStored(STORAGE_ITEMS.settings, { ...SETTINGS_0_3_4, managerMenuActions: ['edit'] });
    await runStorageMigrations();
    const { json } = await makeBackupFile({ categories: ['settings'], protection: 'none' });
    await saveSettings({ theme: 'light', urlCleanerRemoveParams: ['ref'] });
    const settingsItem = await readStoredRaw(STORAGE_ITEMS.settings);
    const lists = await listItems();

    const { operationId } = await restoreParts(json, { settings: 'replace' });
    expect((await getSettings()).urlCleanerRemoveParams).toEqual(
      defaultSettings.urlCleanerRemoveParams,
    );
    await undoBackupImport(operationId);
    expect(await readStoredRaw(STORAGE_ITEMS.settings)).toEqual(settingsItem);
    expect(await listItems()).toEqual(lists);
  });

  it('saves the settings item without 0.3.4 lists, once, when they no longer fit beside it', async () => {
    await seedEarlierReleases();
    await runStorageMigrations();
    const settingsKey = storageKey(STORAGE_ITEMS.settings).slice('sync:'.length);
    const set = fakeBrowser.storage.sync.set.bind(fakeBrowser.storage.sync);
    // As Chrome does when the item would pass 8,192 bytes with the old lists in it.
    const tooLarge = vi
      .spyOn(fakeBrowser.storage.sync, 'set')
      .mockImplementation(async (items: Record<string, unknown>) => {
        const data = (items[settingsKey] as { data?: Record<string, unknown> } | undefined)?.data;
        if (data && 'askAiDisabledActions' in data) {
          throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
        }
        return set(items);
      });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await saveSettings({
      theme: 'light',
      urlCleanerPreserveParams: ['id'],
      quickSaveFixedFolder: '9',
    });
    expect(tooLarge).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledOnce();
    expect(await readStoredData(STORAGE_ITEMS.settings)).toEqual({ theme: 'light' });
    expect((await listItems()).urlCleanerPreserveParams).toEqual(['id']);
    expect(await readStoredData(STORAGE_ITEMS.deviceSettings)).toEqual({
      managerCardSize: 'small',
      quickSaveFixedFolder: '9',
    });
    // The lists already have their own items, so nothing the user set is lost.
    expect(await getSettings()).toMatchObject({
      theme: 'light',
      askAiDisabledActions: ['deleteBookmarks'],
      privacyScannerSensitiveParams: ['secret'],
      urlCleanerPreserveParams: ['id'],
      quickSaveFixedFolder: '9',
    });
  });

  it.each([
    'This request exceeds the MAX_WRITE_OPERATIONS_PER_MINUTE quota.',
    'This request exceeds the MAX_WRITE_OPERATIONS_PER_HOUR quota.',
    'MAX_ITEMS quota exceeded',
  ])(
    'keeps the 0.3.4 lists and reports a sync write refused for another reason: %s',
    async (message) => {
      await seedEarlierReleases();
      await runStorageMigrations();
      const set = vi
        .spyOn(fakeBrowser.storage.sync, 'set')
        .mockRejectedValueOnce(new Error(message));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await expect(saveSettings({ theme: 'light' })).rejects.toThrow(message);
      expect(set).toHaveBeenCalledOnce();
      expect(warn).not.toHaveBeenCalled();
      expect(await readStoredData(STORAGE_ITEMS.settings)).toEqual(SETTINGS_0_3_4);
    },
  );

  it('keeps reading the old places and tries again at the next start when a write fails', async () => {
    await seedEarlierReleases();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(fakeBrowser.storage.sync, 'set').mockRejectedValueOnce(
      new Error('QUOTA_BYTES quota exceeded'),
    );
    await runStorageMigrations();
    expect(error).toHaveBeenCalled();
    expect(await completed()).toBeUndefined();
    expect(await listItems()).toEqual({});
    expect(await readStoredData(STORAGE_ITEMS.deviceSettings)).toEqual(DEVICE_MENUS);
    expect((await getSettings()).urlCleanerRemoveParams).toEqual(['utm_*']);

    await runStorageMigrations();
    expect(await completed()).toEqual([syncListShards.id]);
    expect((await listItems()).urlCleanerRemoveParams).toEqual(['utm_*']);
  });

  it('ends with the same lists when two runs overlap', async () => {
    await seedEarlierReleases();
    await Promise.all([runStorageMigrations(), runStorageMigrations(), getSettings()]);
    expect(Object.keys(await listItems()).sort()).toEqual([
      'askAiDisabledActions',
      'managerEmptySpaceMenu',
      'managerMenuActions',
      'managerOrganizeMenu',
      'managerPreviewMenu',
      'popupBookmarkMenu',
      'popupFolderMenu',
      'privacyScannerSensitiveParams',
      'urlCleanerRemoveParams',
    ]);
  });

  it('runs at start, after an update, and when sync delivers an old item later', async () => {
    // A new device: nothing to move yet, so it is not recorded as run.
    registerStorageMigrations();
    await vi.waitFor(async () =>
      expect(await readStoredRaw(STORAGE_ITEMS.storageMigrations)).toBeUndefined(),
    );
    await seedStored(OLD_ITEM, { urlCleanerRemoveParams: ['utm_*'] });
    await vi.waitFor(async () => expect(await completed()).toEqual([syncListShards.id]));
    expect((await listItems()).urlCleanerRemoveParams).toEqual(['utm_*']);

    await seedStored(STORAGE_ITEMS.storageMigrations, []);
    await seedStored(STORAGE_ITEMS.deviceSettings, { popupBookmarkMenu: ['delete'] });
    await fakeBrowser.runtime.onInstalled.trigger({
      reason: 'update',
      previousVersion: '0.3.4',
    } as Browser.runtime.InstalledDetails);
    await vi.waitFor(async () => expect((await listItems()).popupBookmarkMenu).toEqual(['delete']));
  });

  it('restores the lists of a backup file from before each list had its own item', async () => {
    stubManifestVersion();
    installFakeBookmarks([]);
    const file = formatOneFile({
      [storageKey(STORAGE_ITEMS.settings)]: { v: 1, data: { language: 'en', ...SETTINGS_0_3_4 } },
      [storageKey(OLD_ITEM)]: { v: 1, data: OLD_LISTS },
      [storageKey(STORAGE_ITEMS.deviceSettings)]: {
        v: 1,
        data: { quickSaveFixedFolder: '42', popupBookmarkMenu: ['delete'] },
      },
    });
    await saveSettings({ managerOrganizeMenu: ['paste'] });
    // So the old places are not read on this device.
    await seedStored(STORAGE_ITEMS.storageMigrations, [syncListShards.id]);

    // Converted by the backup file converter and this migration: one path for every older file.
    await restoreParts(file, { settings: 'replace', deviceSettings: 'merge' });
    expect(await getSettings()).toMatchObject({
      theme: 'dark',
      urlCleanerRemoveParams: ['utm_*'],
      askAiDisabledActions: ['deleteBookmarks'],
      privacyScannerSensitiveParams: ['secret'],
      popupBookmarkMenu: ['delete'],
      deadLinksSuccessStatuses: defaultSettings.deadLinksSuccessStatuses,
      managerOrganizeMenu: defaultSettings.managerOrganizeMenu,
    });
    expect(await readStoredData(STORAGE_ITEMS.settingsList, 'popupBookmarkMenu')).toEqual([
      'delete',
    ]);
    expect(await readStoredData(STORAGE_ITEMS.settingsList, 'managerMenuActions')).toEqual([
      '-edit',
      ...HIDDEN_BESIDE_EDIT,
    ]);
    // The old item in a file is not restored.
    expect(await readStoredRaw(OLD_ITEM)).toBeUndefined();
  });
});

describe('the item menu as 0.3.4 stored it', () => {
  it("keeps 0.3.4's sections and the user's order, and marks the rest of its menu hidden", () => {
    expect(markItemMenu0_3_4(['delete', 'copyId', 'edit', 'cut', 'copyId'])).toEqual([
      '-edit',
      '-copyId',
      'cut',
      '-delete',
      '!showInFolder',
      '!viewDetails',
      '!copy',
      '!paste',
      '!copyFolderLink',
      '!openInNewTab',
      '!openInNewWindow',
      '!openInPrivateWindow',
    ]);
    // An action 0.3.4 did not have is not named, so it shows wherever it is configured.
    expect(markItemMenu0_3_4(['preview', 'edit'])).toEqual(['-edit', ...HIDDEN_BESIDE_EDIT]);
  });

  it('leaves a marked, empty, or malformed list as it is', () => {
    for (const stored of [
      ['-edit', 'delete'],
      ['edit', '!delete'],
      [],
      ['edit', 3],
      'edit',
      null,
    ]) {
      expect(markItemMenu0_3_4(stored)).toBe(stored);
    }
  });

  it('reads a 0.3.4 item menu in the new form before and after it moves', async () => {
    await seedStored(STORAGE_ITEMS.settings, { managerMenuActions: ['edit'] });
    expect((await getSettings()).managerMenuActions).toEqual(['-edit', ...HIDDEN_BESIDE_EDIT]);
    await runStorageMigrations();
    expect(await readStoredData(STORAGE_ITEMS.settingsList, 'managerMenuActions')).toEqual([
      '-edit',
      ...HIDDEN_BESIDE_EDIT,
    ]);
    // 0.3.4 keeps reading its own form.
    expect(await readStoredData(STORAGE_ITEMS.settings)).toEqual({ managerMenuActions: ['edit'] });
  });
});
