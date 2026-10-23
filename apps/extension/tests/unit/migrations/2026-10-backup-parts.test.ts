/**
 * The backup file converter from format 1 to format 2
 * (`src/lib/storage/migrations/2026-10-backup-parts.ts`), reached through `upgradeBackupFile`.
 * Unlike a storage migration it is never removed: old files are restored for years.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { saveSettings } from '@/lib/settings-storage';
import { backupParts } from '@/lib/storage/migrations/2026-10-backup-parts';
import { BACKUP_FILE_CONVERTERS, upgradeBackupFile } from '@/lib/storage/migrations/backup-files';
import { STORAGE_ITEMS, storageKey } from '@/lib/storage/registry';

beforeEach(async () => {
  fakeBrowser.reset();
  await saveSettings({ language: 'en' });
  setLanguage('en');
});

describe('backup file converters', () => {
  it('go from each format to the next without gaps', () => {
    expect(BACKUP_FILE_CONVERTERS).toEqual([backupParts]);
    for (const converter of BACKUP_FILE_CONVERTERS) expect(converter.to).toBe(converter.from + 1);
  });

  it('put each format 1 item in the part its storage item names, and drop the rest', () => {
    const settings = storageKey(STORAGE_ITEMS.settings);
    const prompt = storageKey(STORAGE_ITEMS.prompt, 'p1');
    const history = storageKey(STORAGE_ITEMS.searchHistory);
    const converted = upgradeBackupFile(
      {
        format: 'bookmark-scout-backup',
        version: 1,
        exportedAt: '2026-10-01T00:00:00.000Z',
        items: {
          [settings]: { v: 1, data: { theme: 'dark' } },
          [prompt]: { v: 1, data: { id: 'p1' } },
          [history]: { v: 1, data: ['private'] },
          'sync:not-an-item': { v: 1, data: 1 },
          broken: 'not an envelope',
        },
        aiEndpoints: { s1: { baseUrl: 'http://localhost:1/v1' } },
        covers: [],
      },
      1,
      2,
    );
    expect(converted).toEqual({
      format: 'bookmark-scout-backup',
      formatVersion: 2,
      createdAt: '2026-10-01T00:00:00.000Z',
      categories: [{ id: 'settings' }, { id: 'prompts' }],
      sections: {
        settings: { items: { [settings]: { v: 1, data: { theme: 'dark' } } } },
        prompts: { items: { [prompt]: { v: 1, data: { id: 'p1' } } } },
      },
    });
  });

  it('refuse a format no converter starts from', () => {
    expect(() => upgradeBackupFile({}, 0, 2)).toThrow('Invalid backup file');
  });
});
