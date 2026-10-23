/**
 * Backup files of format 1 (October 2026 and before) as format 2, the file of parts. Format 1 held
 * every backed-up stored item in one `items` map, each AI service's endpoint in `aiEndpoints`, and
 * covers in `covers`; format 2 puts each in the part its storage item belongs to (`backup` in
 * `STORAGE_ITEMS`), behind a manifest. Settings that format 1 files from before list settings got
 * items of their own are moved first by the storage migrations (`upgradeBackupItems`), so one path
 * converts every older file. The manifest's counts are left out; the restore counts the parts
 * itself.
 *
 * A converter is never removed: a file saved today may be restored years later.
 */
import { findStorageItem, INDEXED_DATABASES, STORAGE_ITEMS, type StorageItem } from '../registry';
import type { BackupFileConverter } from './index';

type Envelope = { v: number; data: unknown };

const isEnvelope = (value: unknown): value is Envelope =>
  isPlainObject(value) && Number.isInteger(value.v) && 'data' in value;

export const backupParts: BackupFileConverter = {
  id: '2026-10-backup-parts',
  from: 1,
  to: 2,
  convert(file, upgradeItems) {
    if (!isPlainObject(file)) return file;
    const rawItems = isPlainObject(file.items) ? file.items : {};
    const items = upgradeItems(
      Object.fromEntries(
        Object.entries(rawItems).filter(([, value]) => isEnvelope(value)),
      ) as Record<string, Envelope>,
    );
    const sections: Record<string, Record<string, unknown>> = {};
    const section = (id: string) => {
      sections[id] ??= { items: {} };
      return sections[id];
    };
    for (const [key, envelope] of Object.entries(items)) {
      const found = findStorageItem(key);
      const item: StorageItem | undefined = found && STORAGE_ITEMS[found.id];
      if (!item || item.backup === 'exclude') continue;
      (section(item.backup).items as Record<string, Envelope>)[key] = envelope;
    }
    if (isPlainObject(file.aiEndpoints) && sections[STORAGE_ITEMS.aiServices.backup]) {
      sections[STORAGE_ITEMS.aiServices.backup].endpoints = file.aiEndpoints;
    }
    if (Array.isArray(file.covers) && file.covers.length > 0) {
      sections[INDEXED_DATABASES.covers.backup] = { covers: file.covers };
    }
    return {
      format: file.format,
      formatVersion: backupParts.to,
      createdAt: typeof file.exportedAt === 'string' ? file.exportedAt : undefined,
      categories: Object.keys(sections).map((id) => ({ id })),
      sections,
    };
  },
};
