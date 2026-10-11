/**
 * The backup file: every stored item the registry marks `backup: 'include'` (settings, the table
 * view, custom prompts, AI services, saved searches), as stored (`{ v, data }` under its key).
 * Credentials (`backup: 'secret'`) and device-bound or rebuildable data (`'exclude'`) are never in
 * it. Restoring replaces each item the file holds and leaves the rest alone; tags and summaries
 * travel with the JSON bookmark export instead (`bookmark-export.ts`).
 */
import { z } from 'zod';

/** Marks a file as a backup, so a plain settings export is still told apart. */
const BACKUP_FORMAT = 'bookmark-scout-backup';
const BACKUP_FORMAT_VERSION = 1;

type Envelope = { v: number; data: unknown };

const backupFileSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_FORMAT_VERSION),
  exportedAt: z.string().optional(),
  items: z.record(z.string(), z.object({ v: z.number().int().positive(), data: z.unknown() })),
});

/** Every item in a backup, by registry id, with the stored value or collection that holds it. */
const BACKUP_ITEMS: Partial<
  Record<StorageItemId, StoredValue<unknown> | StoredCollection<unknown>>
> = {
  settings: settingsOverrideValues.sync,
  deviceSettings: settingsOverrideValues.device,
  tableView: bookmarkTableViewValue,
  promptIndex: promptLibraryIndexValue,
  prompt: customPromptItems,
  aiServices: aiServicesValue,
  savedSearches: savedSearchesValue,
} as Partial<Record<StorageItemId, StoredValue<unknown> | StoredCollection<unknown>>>;

/** The registry ids a backup holds: every item with `backup: 'include'`. */
export function getBackupItemIds(): StorageItemId[] {
  return (Object.entries(STORAGE_ITEMS) as [StorageItemId, StorageItem][])
    .filter(([, item]) => item.backup === 'include')
    .map(([id]) => id);
}

function backupSource(id: StorageItemId) {
  const source = BACKUP_ITEMS[id];
  if (!source) throw new Error(`${id} is backed up but has no backup source`);
  return source;
}

const isCollection = (
  source: StoredValue<unknown> | StoredCollection<unknown>,
): source is StoredCollection<unknown> => 'entry' in source;

/** The backup file's JSON. */
export async function exportBackup(now = new Date()): Promise<string> {
  const items: Record<string, Envelope> = {};
  for (const id of getBackupItemIds()) {
    const source = backupSource(id);
    if (isCollection(source)) {
      const ids = await source.listIds();
      const entries = await source.getMany(ids);
      for (const entryId of ids) {
        if (entries[entryId] === null) continue;
        items[storageKey(source.item, entryId)] = toStoredEnvelope(source.item, entries[entryId]);
      }
    } else {
      items[source.key] = toStoredEnvelope(source.item, await source.get());
    }
  }
  return JSON.stringify(
    { format: BACKUP_FORMAT, version: BACKUP_FORMAT_VERSION, exportedAt: now.toISOString(), items },
    null,
    2,
  );
}

/** Whether `json` is a backup file rather than another JSON file, such as a settings export. */
export function isBackupFile(json: string): boolean {
  try {
    const parsed: unknown = JSON.parse(json);
    return isPlainObject(parsed) && parsed.format === BACKUP_FORMAT;
  } catch {
    return false;
  }
}

/**
 * Restores a backup: each item the file holds replaces the stored one, after the same parsing a
 * stored value gets (data from an older release is migrated); a collection's entries the file
 * lacks are removed. An item a newer release wrote is skipped, as are keys this release does not
 * back up. Collection entries are written first and removed last, so an index never lists an
 * entry that is not stored. Resolves to the registry ids restored.
 */
export async function restoreBackup(json: string): Promise<StorageItemId[]> {
  let parsed: z.infer<typeof backupFileSchema>;
  try {
    parsed = backupFileSchema.parse(JSON.parse(json));
  } catch {
    throw new Error(t('error_invalidBackupFile'));
  }
  const ids = getBackupItemIds();
  const sources = ids.map((id) => [id, backupSource(id)] as const);
  const restored = new Set<StorageItemId>();
  const removals: (() => Promise<void>)[] = [];

  for (const [id, source] of sources) {
    if (!isCollection(source)) continue;
    const prefix = storageKey(source.item, '');
    const inFile = Object.entries(parsed.items).filter(
      ([key]) => key.startsWith(prefix) && key.length > prefix.length,
    );
    const fileIds = new Set(inFile.map(([key]) => key.slice(prefix.length)));
    for (const [key, envelope] of inFile) {
      if (envelope.v > source.item.v) continue;
      const entry = source.entry(key.slice(prefix.length));
      await entry.set(entry.parseStored(envelope));
    }
    const storedIds = await source.listIds();
    removals.push(async () => {
      for (const entryId of storedIds) {
        if (!fileIds.has(entryId)) await source.entry(entryId).clear();
      }
    });
    restored.add(id);
  }

  for (const [id, source] of sources) {
    if (isCollection(source)) continue;
    const envelope = parsed.items[source.key];
    if (!envelope || envelope.v > source.item.v) continue;
    await source.set(source.parseStored(envelope));
    restored.add(id);
  }

  for (const remove of removals) await remove();
  return ids.filter((id) => restored.has(id));
}
