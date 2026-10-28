/**
 * The popup's Recent Folders Max (0.3.4) to the right-click menu's own count
 * (`src/lib/storage/migrations/2026-10-context-menu-recent-max.ts`); deleted with it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { defaultSettings } from '@/lib/settings-schema';
import {
  getSettings,
  resetSettings,
  runStorageMigrations,
  saveSettings,
  undoResetSettings,
} from '@/lib/settings-storage';
import { upgradeBackupItems } from '@/lib/storage/migrations';
import { contextMenuRecentMax } from '@/lib/storage/migrations/2026-10-context-menu-recent-max';
import { storageKey } from '@/lib/storage/registry';
import { readStoredData, STORAGE_ITEMS, seedStored } from '../storage-helpers';

const completed = () => readStoredData(STORAGE_ITEMS.storageMigrations);
const menuDefault = defaultSettings.contextMenuRecentMax;
// A count 0.3.4 users could choose that is not the default.
const CHANGED = menuDefault === 8 ? 3 : 8;

beforeEach(() => {
  fakeBrowser.reset();
  setLanguage('en');
});

describe("the right-click menu's recent folder count", () => {
  it("starts at the popup's count a 0.3.4 user chose, read before and after the move", async () => {
    await seedStored(STORAGE_ITEMS.settings, { recentFoldersMax: CHANGED });
    expect((await getSettings()).contextMenuRecentMax).toBe(CHANGED);
    await runStorageMigrations();
    expect(await completed()).toContain(contextMenuRecentMax.id);
    expect(await readStoredData(STORAGE_ITEMS.settings)).toEqual({
      recentFoldersMax: CHANGED,
      contextMenuRecentMax: CHANGED,
    });
    expect(await getSettings()).toMatchObject({
      recentFoldersMax: CHANGED,
      contextMenuRecentMax: CHANGED,
    });
  });

  it("keeps a menu count the user already set, and does nothing for the popup's default", async () => {
    await seedStored(STORAGE_ITEMS.settings, {
      recentFoldersMax: CHANGED,
      contextMenuRecentMax: 2,
    });
    await runStorageMigrations();
    expect((await getSettings()).contextMenuRecentMax).toBe(2);

    fakeBrowser.reset();
    await seedStored(STORAGE_ITEMS.settings, { theme: 'dark' });
    await runStorageMigrations();
    expect(await completed()).toBeUndefined();
    expect(await readStoredData(STORAGE_ITEMS.settings)).toEqual({ theme: 'dark' });
  });

  it('does not bring back the popup count once the menu count is set back to its default', async () => {
    await seedStored(STORAGE_ITEMS.settings, { recentFoldersMax: CHANGED });
    await runStorageMigrations();
    await saveSettings({ contextMenuRecentMax: menuDefault });
    // Another device that runs the migration later, with the same synced items.
    await fakeBrowser.storage.local.clear();
    expect((await getSettings()).contextMenuRecentMax).toBe(menuDefault);
    await runStorageMigrations();
    expect((await getSettings()).contextMenuRecentMax).toBe(menuDefault);

    // Reset removes both, so nothing is filled again either.
    await resetSettings();
    expect(await readStoredData(STORAGE_ITEMS.settings)).toBeUndefined();
  });

  it('keeps the menu count at its default when Reset All is undone', async () => {
    await seedStored(STORAGE_ITEMS.settings, { recentFoldersMax: CHANGED });
    await runStorageMigrations();
    await saveSettings({ contextMenuRecentMax: menuDefault });
    const reset = await resetSettings();
    await undoResetSettings(reset);
    expect(await readStoredData(STORAGE_ITEMS.settings)).toEqual({
      recentFoldersMax: CHANGED,
      contextMenuRecentMax: menuDefault,
    });
    // Another device that runs the migration later does not fill it with the popup count.
    await fakeBrowser.storage.local.clear();
    await runStorageMigrations();
    expect((await getSettings()).contextMenuRecentMax).toBe(menuDefault);

    // A menu count changed since the reset stays.
    const again = await resetSettings();
    await saveSettings({ contextMenuRecentMax: CHANGED });
    await undoResetSettings(again);
    expect((await getSettings()).contextMenuRecentMax).toBe(CHANGED);
  });

  it('stores the menu count at its default only for users who have the popup count', async () => {
    await saveSettings({ contextMenuRecentMax: CHANGED });
    await saveSettings({ contextMenuRecentMax: menuDefault });
    expect(await readStoredData(STORAGE_ITEMS.settings)).toBeUndefined();
  });

  it("gives a 0.3.4 backup file's popup count to the menu", () => {
    const key = storageKey(STORAGE_ITEMS.settings);
    const upgraded = upgradeBackupItems({ [key]: { v: 1, data: { recentFoldersMax: CHANGED } } });
    expect(upgraded[key]?.data).toEqual({
      recentFoldersMax: CHANGED,
      contextMenuRecentMax: CHANGED,
    });
  });
});
