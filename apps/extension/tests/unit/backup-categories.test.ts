/**
 * The backup's parts are one table (`config/data/backup.toml`), and every stored item and
 * IndexedDB database names its part in the storage registry, so nothing new is left unclassified.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BACKUP_CATEGORIES,
  BACKUP_REMEMBERED_CATEGORY_IDS,
  formatBackupFilename,
  getBackupCategory,
} from '@/lib/backup-config';
import { defaultSettings } from '@/lib/settings-schema';
import { INDEXED_DATABASES, STORAGE_ITEMS, type StorageItem } from '@/lib/storage/registry';
import { CATEGORY_HANDLERS, getItemsOfCategory } from '@/services/backup-categories.lazy';
import { appRoot } from '../config-files';

const en = JSON.parse(
  readFileSync(path.join(appRoot, 'public/_locales/en/messages.json'), 'utf8'),
) as Record<string, unknown>;

const items = Object.entries(STORAGE_ITEMS) as [keyof typeof STORAGE_ITEMS, StorageItem][];

describe('backup parts', () => {
  it('classify every stored item and database as a part from the config, or exclude', () => {
    const unclassified = [
      ...items.map(([id, item]) => [id, item.backup] as const),
      ...Object.entries(INDEXED_DATABASES).map(([id, db]) => [id, db.backup] as const),
    ].filter(([, part]) => part !== 'exclude' && !getBackupCategory(part));
    expect(unclassified).toEqual([]);
  });

  it('each have a handler, a name and description in English, and something in them', () => {
    for (const category of BACKUP_CATEGORIES) {
      expect(CATEGORY_HANDLERS[category.id], category.id).toBeDefined();
      expect(en[category.labelKey], category.labelKey).toBeDefined();
      expect(en[category.descriptionKey], category.descriptionKey).toBeDefined();
      const holds =
        getItemsOfCategory(category.id).length +
        Object.values(INDEXED_DATABASES).filter((db) => db.backup === category.id).length;
      expect(holds, category.id).toBeGreaterThan(0);
    }
    expect(Object.keys(CATEGORY_HANDLERS).sort()).toEqual(
      BACKUP_CATEGORIES.map(({ id }) => id).sort(),
    );
  });

  it('keep secrets out of sync storage, and keys after the services they belong to', () => {
    const secret = BACKUP_CATEGORIES.filter((category) => category.secret).map(({ id }) => id);
    expect(secret).toEqual(['aiServiceKeys']);
    for (const [id, item] of items) {
      if (secret.includes(item.backup)) expect(item.area, id).toBe('local');
    }
    const order = BACKUP_CATEGORIES.map(({ id }) => id);
    expect(order.indexOf('aiServiceKeys')).toBeGreaterThan(order.indexOf('aiServices'));
  });

  it('start a new backup without device-specific or secret parts', () => {
    expect(BACKUP_REMEMBERED_CATEGORY_IDS).not.toContain('aiServiceKeys');
    for (const id of defaultSettings.backupExportCategories) {
      const category = getBackupCategory(id);
      expect(category?.deviceSpecific, id).toBe(false);
      expect(category?.secret, id).toBe(false);
    }
    expect(defaultSettings.backupEncryptByDefault).toBe(false);
    expect(defaultSettings.backupEncryptSecrets).toBe(true);
  });

  it('name the file by date, parts, and password', () => {
    const now = new Date(2026, 9, 23, 23, 30);
    const all = BACKUP_REMEMBERED_CATEGORY_IDS;
    expect(formatBackupFilename(all, false, now)).toBe('bookmark-scout-backup_2026-10-23_all.json');
    expect(formatBackupFilename(['prompts', 'settings'], true, now)).toBe(
      'bookmark-scout-backup_2026-10-23_settings-prompts_protected.json',
    );
    expect(formatBackupFilename([...all, 'aiServiceKeys'], true, now)).toBe(
      'bookmark-scout-backup_2026-10-23_all-keys_protected.json',
    );
    expect(formatBackupFilename(['settings', 'views', 'prompts', 'rules'], false, now)).toBe(
      'bookmark-scout-backup_2026-10-23_4-parts.json',
    );
  });
});
