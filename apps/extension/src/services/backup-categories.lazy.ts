/**
 * What each part of a backup file does (`config/data/backup.toml`, `[[categories]]`): one entry per
 * part in `CATEGORY_HANDLERS`, each with the same five steps, so a new part is a new entry:
 * - `export`: this device's data for the file, and `estimate`, its count and size for the dialog;
 * - `schema`: the part as a file must hold it, checked on import before anything else;
 * - `review`: what importing it would do here (added, changed, unchanged, removed by Replace,
 *   skipped, and the conflicts the user chooses for), changing nothing;
 * - `apply`: the import, Merge (the file adds and updates, what it lacks stays) or Replace (the
 *   part holds exactly what the file has), with each conflict resolved as chosen;
 * - `snapshot` and `undo`: what the part held before, for Undo import.
 *
 * `apply` and `undo` both read back what they wrote and count what does not match
 * (`mismatches`), which the History record of the import shows as its check.
 *
 * Most parts are stored items (`STORAGE_ITEMS` whose `backup` names the part). They share one code
 * path: each item is a list of entries (a setting, a prompt, a rule, a service) read and written
 * through its stored value, so Merge, Replace, conflicts, and counts work the same everywhere. A
 * part's file data is `{ items }`, each item as stored (`{ v, data }` under its key), so the file
 * keeps the shape versions the stored values already know how to migrate. AI services also carry
 * each service's endpoint (`endpoints`), and their keys are a part of their own. Covers live in
 * IndexedDB and have their own entry (`cover-backup.lazy.ts`).
 *
 * Secrets (the AI service keys part) are never logged and never named in a message.
 */
import { z } from 'zod';
import {
  applyCoverRestore,
  type BackupCovers,
  type CoverSnapshot,
  estimateCoverBackup,
  exportBackupCovers,
  previewCoverRestore,
  readBackupCovers,
  restoreCoverSnapshot,
  snapshotCoversFor,
} from './cover-backup.lazy';

type Envelope = { v: number; data: unknown };

/** A part's stored items in a file, by storage key. */
export type FileItems = Record<string, Envelope>;

const envelopeSchema = z.object({ v: z.number().int().positive(), data: z.unknown() });
const fileItemsSchema = z.record(z.string(), envelopeSchema);

/** How a part is imported. */
export type ImportStrategy = 'merge' | 'replace';

/**
 * Which side wins when an entry changed on both: this device's, the file's, or the one changed
 * last (`newer`, offered only for entries that record when they changed).
 */
export type ConflictChoice = 'device' | 'file' | 'newer';

/** The user's choices for one part. */
export type PartChoice = {
  strategy: ImportStrategy;
  /** For every conflict without a choice of its own. */
  conflicts: ConflictChoice;
  /** By conflict key (`ConflictEntry.key`). */
  perItem?: Readonly<Record<string, ConflictChoice>>;
};

/** An entry both this device and the file have, changed. */
export type ConflictEntry = {
  key: string;
  label: string;
  /** When each side changed it, where entries record it. */
  deviceTime?: number;
  fileTime?: number;
};

/** A line of a review or outcome: a message key and its substitutions. */
export type BackupNote = { key: MessageKey; values: string[] };

/** What importing a part would do on this device now. Nothing changes to compute it. */
export type PartReview = {
  /** Entries in the file. */
  count: number;
  added: number;
  changed: number;
  unchanged: number;
  /** This device's entries the file lacks: Replace removes them, Merge keeps them. */
  removed: number;
  /** Entries in the file that cannot be imported (not valid, or from a newer release). */
  skipped: number;
  /** The conflicts, at most `max_conflicts_listed`; `conflictCount` counts them all. */
  conflicts: ConflictEntry[];
  conflictCount: number;
  /** Whether `newer` can decide its conflicts. */
  dated: boolean;
  notes: BackupNote[];
};

/** What importing a part did. */
export type PartOutcome = {
  /** Entries added, and entries changed. */
  added: number;
  changed: number;
  /** Entries Replace removed. */
  removed: number;
  /** Entries left as they were: unchanged, or conflicts kept from this device. */
  kept: number;
  skipped: number;
  /** Entries that did not read back as written. */
  mismatches: number;
  notes: BackupNote[];
  /** AI services that need a secret entered again. */
  needsSetup?: ServiceNeedingSetup[];
};

/** An AI service a restore could not fully set up, and the secret fields it still needs. */
export type ServiceNeedingSetup = { name: string; fields: AISecretField[] };

/** A part's count and estimated size in a file made now. */
export type PartEstimate = { count: number; bytes: number; notes?: BackupNote[] };

export type CategoryHandler<S = unknown> = {
  schema: z.ZodType<S>;
  export(): Promise<S>;
  estimate(): Promise<PartEstimate>;
  count(section: S): number;
  review(section: S, context: ImportContext): Promise<PartReview>;
  /**
   * Checks, before anything is written, that importing the part as chosen can be stored whole
   * (each synced item within the browser's per-item quota); throws `BackupTooLargeError` if not.
   */
  check?(section: S, choice: PartChoice): Promise<void>;
  apply(section: S, choice: PartChoice, context: ImportContext): Promise<PartOutcome>;
  /** What the part holds now that `apply` may change, structured-cloneable, for Undo import. */
  snapshot(section: S, choice: PartChoice): Promise<unknown>;
  /** Puts `snapshot` back; resolves to how many entries did not read back as it. */
  undo(snapshot: unknown): Promise<number>;
};

/** What other parts of the same import bring, which a part may depend on. */
export type ImportContext = {
  /** The AI services part's file data, when it is imported too (keys are stored by service). */
  aiServices?: AIServicesSection;
};

// ---------------------------------------------------------------------------------------------
// Stored items as entries

type Entries = Map<string, unknown>;

/** Importing a part would make a synced item larger than the browser stores. */
export class BackupTooLargeError extends Error {
  constructor() {
    super(t('backup_errorTooLarge'));
    this.name = 'BackupTooLargeError';
  }
}

/**
 * Throws `BackupTooLargeError` when `data` stored as `item` (under `key`) would pass the
 * per-item sync quota: a file edited by hand can hold values no setting allows at that size, and
 * a write past the quota fails halfway through a restore.
 */
function assertFitsStorage(item: StorageItem, key: StorageKey, data: unknown): void {
  if (item.area !== 'sync') return;
  const name = key.slice(item.area.length + 1);
  if (syncItemBytes(name, toStoredEnvelope(item, data)) > SYNC_QUOTA.bytesPerItem) {
    throw new BackupTooLargeError();
  }
}

/** One stored item of a part, seen as entries by key. */
type ItemPart = {
  readonly item: StorageItemId;
  /** This device's entries. */
  read(): Promise<Entries>;
  /** The entries the file's items hold for this item, and how many could not be read. */
  fromFile(items: FileItems): { entries: Entries; skipped: number };
  /** The file's items for `entries`. */
  toFile(entries: Entries): FileItems;
  /**
   * Stores the entries `change` makes from this device's current ones, under the item's lock;
   * throws `BackupTooLargeError`, writing nothing, when they would not fit the storage quota.
   */
  write(change: (device: Entries) => Entries): Promise<void>;
  /** Throws `BackupTooLargeError` when `entries` would not fit the storage quota. */
  assertFits(entries: Entries): void;
  /** For stored settings: their scope, whose folder settings are matched by path on import. */
  settingsScope?: SettingScope;
  /** The item's stored keys and values, as stored, for Undo import. */
  snapshot(): Promise<Record<string, unknown>>;
  restore(snapshot: Record<string, unknown>): Promise<void>;
  /** The entries `snapshot` holds, to check a restore against. */
  fromSnapshot(snapshot: Record<string, unknown>): Entries;
  /** Left out of the part's count (an index of another item's entries). */
  uncounted?: boolean;
  /** Entries are the user's own named things: their conflicts are listed and chosen. */
  named?: { label(entry: unknown): string; updatedAt?(entry: unknown): number | undefined };
  /** Most entries the item holds; past it, the file's new entries are skipped. */
  max?: number;
};

function readable(items: FileItems, key: string, item: StorageItem): Envelope | undefined {
  const envelope = items[key];
  return envelope && envelope.v <= item.v ? envelope : undefined;
}

/** A stored value read and written whole, as its entries. */
function valueItem<T>(
  id: StorageItemId,
  source: StoredValue<T>,
  shape: {
    toEntries(value: T): Entries;
    fromEntries(entries: Entries, current: T): T;
    /** Whether a file entry may be imported; others are skipped. */
    accept?(key: string, value: unknown): boolean;
  },
  options: Pick<ItemPart, 'uncounted' | 'named' | 'max' | 'settingsScope'> = {},
): ItemPart {
  const accept = shape.accept ?? (() => true);
  const assertFits = (entries: Entries) =>
    assertFitsStorage(source.item, source.key, shape.fromEntries(entries, source.empty));
  return {
    item: id,
    ...options,
    read: async () => shape.toEntries(await source.get()),
    fromFile(items) {
      const raw = items[source.key];
      if (!raw) return { entries: new Map(), skipped: 0 };
      const envelope = readable(items, source.key, source.item);
      if (!envelope) return { entries: new Map(), skipped: 1 };
      const all = shape.toEntries(source.parseStored(envelope));
      const entries: Entries = new Map();
      let skipped = 0;
      for (const [key, value] of all) {
        if (accept(key, value)) entries.set(key, value);
        else skipped += 1;
      }
      return { entries, skipped };
    },
    toFile: (entries) => ({
      [source.key]: toStoredEnvelope(source.item, shape.fromEntries(entries, source.empty)),
    }),
    assertFits,
    write: async (change) => {
      await source.update((current) => {
        const next = change(shape.toEntries(current));
        assertFits(next);
        return shape.fromEntries(next, current);
      });
    },
    snapshot: async () => ({ [source.key]: await storage.getItem(source.key) }),
    restore: async (snapshot) => {
      const raw = snapshot[source.key];
      if (raw === null || raw === undefined) await source.clear();
      else await source.set(source.parseStored(raw));
    },
    fromSnapshot: (snapshot) => shape.toEntries(source.parseStored(snapshot[source.key] ?? null)),
  };
}

/** A collection, one stored entry per id. */
function collectionItem<T>(
  id: StorageItemId,
  source: StoredCollection<T>,
  accept: (key: string, value: T) => boolean,
  options: Pick<ItemPart, 'uncounted' | 'named' | 'max'> = {},
): ItemPart {
  const prefix = storageKey(source.item, '');
  const kept = (value: T) => value !== null && value !== undefined;
  const assertEntriesFit = (entries: Entries) => {
    for (const [entryId, value] of entries) {
      assertFitsStorage(source.item, storageKey(source.item, entryId), value);
    }
  };
  const readEntries = async (): Promise<Entries> => {
    const ids = await source.listIds();
    const values = await source.getMany(ids);
    return new Map(
      ids.flatMap((entryId) => (kept(values[entryId]) ? [[entryId, values[entryId]]] : [])),
    );
  };
  return {
    item: id,
    ...options,
    read: readEntries,
    fromFile(items) {
      const entries: Entries = new Map();
      let skipped = 0;
      for (const [key, envelope] of Object.entries(items)) {
        if (!key.startsWith(prefix) || key.length === prefix.length) continue;
        const entryId = key.slice(prefix.length);
        const value =
          envelope.v <= source.item.v ? source.entry(entryId).parseStored(envelope) : undefined;
        if (value !== undefined && kept(value) && accept(entryId, value))
          entries.set(entryId, value);
        else skipped += 1;
      }
      return { entries, skipped };
    },
    toFile: (entries) =>
      Object.fromEntries(
        [...entries].map(([entryId, value]) => [
          storageKey(source.item, entryId),
          toStoredEnvelope(source.item, value),
        ]),
      ),
    assertFits: assertEntriesFit,
    async write(change) {
      const ids = await source.listIds();
      const device = await readEntries();
      const next = change(device);
      assertEntriesFit(next);
      const all = [...new Set([...ids, ...next.keys()])];
      await source.record(all).update(() => Object.fromEntries(next) as Record<string, T>);
    },
    async snapshot() {
      const ids = await source.listIds();
      const keys = ids.map((entryId) => storageKey(source.item, entryId));
      const raws = keys.length > 0 ? await storage.getItems(keys) : [];
      return Object.fromEntries(raws.map(({ key, value }) => [key, value]));
    },
    fromSnapshot(snapshot) {
      return new Map(
        Object.keys(snapshot).flatMap((key) => {
          if (!key.startsWith(prefix)) return [];
          const entryId = key.slice(prefix.length);
          const value = source.entry(entryId).parseStored(snapshot[key] ?? null);
          return kept(value) ? [[entryId, value]] : [];
        }),
      );
    },
    async restore(snapshot) {
      const ids = await source.listIds();
      const snapshotIds = Object.keys(snapshot)
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length));
      const all = [...new Set([...ids, ...snapshotIds])];
      await source.record(all).update(
        () =>
          Object.fromEntries(
            snapshotIds.flatMap((entryId) => {
              const value = source.entry(entryId).parseStored(snapshot[prefix + entryId] ?? null);
              return kept(value) ? [[entryId, value]] : [];
            }),
          ) as Record<string, T>,
      );
    },
  };
}

/** A stored list of objects with ids, as entries by id. */
function listItem<V, E>(
  id: StorageItemId,
  source: StoredValue<V>,
  list: { get(value: V): E[]; set(value: V, entries: E[]): V; id(entry: E): string },
  options: Pick<ItemPart, 'named' | 'max'>,
): ItemPart {
  return valueItem(
    id,
    source,
    {
      toEntries: (value) => new Map(list.get(value).map((entry) => [list.id(entry), entry])),
      fromEntries: (entries, current) => list.set(current, [...entries.values()] as E[]),
    },
    options,
  );
}

/** A single value (the table view, About me) as one entry, or none when it is empty. */
function singleItem<T>(id: StorageItemId, source: StoredValue<T>, isEmpty: (value: T) => boolean) {
  return valueItem(id, source, {
    toEntries: (value) => new Map(isEmpty(value) ? [] : [[id, value]]),
    fromEntries: (entries) => (entries.has(id) ? (entries.get(id) as T) : source.empty),
  });
}

/** Stored settings overrides of one scope, as entries by setting key; invalid ones are skipped. */
function overridesItem(
  id: StorageItemId,
  source: StoredValue<Record<string, unknown>>,
  scope: SettingScope,
) {
  return valueItem(
    id,
    source,
    {
      toEntries: (value) => new Map(Object.entries(value)),
      fromEntries: (entries) => Object.fromEntries(entries),
      accept: (key, value) => isValidSetting(key, value, scope),
    },
    { settingsScope: scope },
  );
}

/**
 * The settings that hold a bookmark folder's id (a `folder` field in the settings schema, such
 * as the quick save folder). Folder ids differ on every device and can name another folder
 * there, so a backup carries each with its folder's path, and a restore keeps one only where a
 * folder of that path exists here, set to that folder's id.
 */
function folderSettingKeys(): Set<string> {
  const meta = getSettingsFieldMeta();
  return new Set(
    (Object.keys(meta) as (keyof Settings)[]).filter((key) => meta[key].type === 'folder'),
  );
}

/** Every folder here with its path, as the backup names folders. */
async function folderPathsHere(): Promise<{ id: string; path: string }[]> {
  return extractFolderPaths(await fetchBookmarkTree());
}

/** The folder settings `parts` hold in `items`, with each one's value, by item key. */
function folderSettingsIn(parts: readonly ItemPart[], items: FileItems) {
  const keys = folderSettingKeys();
  const found: { itemKey: string; key: string; value: string }[] = [];
  for (const part of parts) {
    if (!part.settingsScope) continue;
    const itemKey = storageKey(STORAGE_ITEMS[part.item]);
    const data = items[itemKey]?.data;
    if (!isPlainObject(data)) continue;
    for (const [key, value] of Object.entries(data)) {
      if (keys.has(key) && typeof value === 'string' && value !== '') {
        found.push({ itemKey, key, value });
      }
    }
  }
  return found;
}

function isValidSetting(key: string, value: unknown, scope: SettingScope): boolean {
  if (!(key in settingsSchema.shape)) return false;
  const settingKey = key as keyof Settings;
  return (
    getSettingScope(settingKey) === scope &&
    settingsSchema.shape[settingKey].safeParse(value).success
  );
}

const named = (label: (entry: never) => string, updatedAt?: (entry: never) => number) => ({
  label: label as (entry: unknown) => string,
  ...(updatedAt ? { updatedAt: updatedAt as (entry: unknown) => number } : {}),
});

/** The stored items of the parts that are stored items, each as entries. */
function itemParts(): Partial<Record<StorageItemId, ItemPart>> {
  return {
    settings: overridesItem('settings', settingsOverrideValues.sync, 'sync'),
    settingsList: collectionItem('settingsList', settingsListItems, (key, value) =>
      isValidSetting(key, value, 'lists'),
    ),
    deviceSettings: overridesItem('deviceSettings', settingsOverrideValues.device, 'device'),
    tableView: singleItem('tableView', bookmarkTableViewValue, (value) =>
      isSameJson(value, bookmarkTableViewValue.empty),
    ),
    savedSearches: listItem(
      'savedSearches',
      savedSearchesValue,
      { get: (value) => value, set: (_, entries) => entries, id: (entry) => entry.id },
      { named: named((entry: SavedSearch) => entry.name), max: MAX_SAVED_SEARCHES },
    ),
    prompt: collectionItem('prompt', customPromptItems, () => true, {
      named: named(
        (entry: CustomPrompt) => entry.name,
        (entry: CustomPrompt) => entry.updatedAt,
      ),
      max: MAX_PROMPTS,
    }),
    promptIndex: valueItem(
      'promptIndex',
      promptLibraryIndexValue,
      {
        // The active prompt of each task; the order of the prompts follows the prompts stored.
        toEntries: (index) => new Map(Object.entries(index.active)),
        fromEntries: (entries, current) => ({
          ids: current.ids,
          active: Object.fromEntries(entries) as typeof current.active,
        }),
      },
      { uncounted: true },
    ),
    aboutMe: singleItem('aboutMe', aboutMeValue, (text) => text.trim() === ''),
    bookmarkRules: listItem(
      'bookmarkRules',
      bookmarkRulesValue,
      { get: (value) => value, set: (_, entries) => entries, id: (entry) => entry.id },
      { named: named((entry: BookmarkRule) => entry.name), max: MAX_BOOKMARK_RULES },
    ),
    aiServices: listItem(
      'aiServices',
      aiServicesValue,
      {
        get: (state) => state.services,
        set: (state, services) => ({ ...state, services }),
        id: (service) => service.id,
      },
      { named: named((entry: AIService) => entry.name) },
    ),
  };
}

/** The stored items of part `category`, in registry order. */
function registryItemsOf(category: string): StorageItemId[] {
  return (Object.entries(STORAGE_ITEMS) as [StorageItemId, StorageItem][])
    .filter(([, item]) => item.backup === category)
    .map(([id]) => id);
}

/**
 * The stored items of part `category` as entries; an index of another item's entries (the
 * prompts' active ones) comes last, so it is written after the entries it names.
 */
function partsOf(category: string): ItemPart[] {
  const parts = itemParts();
  return registryItemsOf(category)
    .map((id) => {
      const part = parts[id];
      if (!part) throw new Error(`${id} is in backup part ${category} but has no handler`);
      return part;
    })
    .sort((a, b) => Number(Boolean(a.uncounted)) - Number(Boolean(b.uncounted)));
}

const sameEntry = (left: unknown, right: unknown) => isSameJson(left, right);

/** How many entries of `expected` and `actual` differ, by key, whatever their order. */
function countMismatches(expected: Entries, actual: Entries): number {
  let mismatches = 0;
  for (const key of new Set([...expected.keys(), ...actual.keys()])) {
    if (!sameEntry(expected.get(key), actual.get(key))) mismatches += 1;
  }
  return mismatches;
}

/** Which side an entry changed on both sides comes from. */
function resolveConflict(
  choice: ConflictChoice,
  device: unknown,
  file: unknown,
  part: ItemPart,
): 'device' | 'file' {
  if (choice !== 'newer') return choice;
  const deviceTime = part.named?.updatedAt?.(device);
  const fileTime = part.named?.updatedAt?.(file);
  if (deviceTime === undefined || fileTime === undefined) return 'file';
  return fileTime > deviceTime ? 'file' : 'device';
}

const conflictKey = (part: ItemPart, entryId: string) => `${part.item}:${entryId}`;

type EntriesPlan = {
  next: Entries;
  added: number;
  changed: number;
  unchanged: number;
  removed: number;
  kept: number;
  skippedOverMax: number;
};

/** The entries an import leaves, and what it did to get there. */
function planEntries(
  part: ItemPart,
  device: Entries,
  file: Entries,
  choice: PartChoice,
): EntriesPlan {
  const plan: EntriesPlan = {
    next: new Map(),
    added: 0,
    changed: 0,
    unchanged: 0,
    removed: 0,
    kept: 0,
    skippedOverMax: 0,
  };
  if (choice.strategy === 'replace') {
    for (const [key, value] of file) {
      if (part.max !== undefined && plan.next.size >= part.max) {
        plan.skippedOverMax += 1;
        continue;
      }
      if (!device.has(key)) plan.added += 1;
      else if (sameEntry(device.get(key), value)) plan.unchanged += 1;
      else plan.changed += 1;
      plan.next.set(key, value);
    }
    plan.removed = [...device.keys()].filter((key) => !file.has(key)).length;
    return plan;
  }
  plan.next = new Map(device);
  for (const [key, value] of file) {
    if (!device.has(key)) {
      if (part.max !== undefined && plan.next.size >= part.max) {
        plan.skippedOverMax += 1;
        continue;
      }
      plan.next.set(key, value);
      plan.added += 1;
      continue;
    }
    const current = device.get(key);
    if (sameEntry(current, value)) {
      plan.unchanged += 1;
      continue;
    }
    const pick = part.named
      ? resolveConflict(
          choice.perItem?.[conflictKey(part, key)] ?? choice.conflicts,
          current,
          value,
          part,
        )
      : 'file';
    if (pick === 'file') {
      plan.next.set(key, value);
      plan.changed += 1;
    } else {
      plan.kept += 1;
    }
  }
  return plan;
}

/** File data of a part made of stored items. */
const itemsSectionSchema = z.object({
  items: fileItemsSchema,
  /** The path of the folder each folder setting names, by setting key. */
  folderPaths: z.record(z.string(), z.string()).optional(),
});
type ItemsSection = z.infer<typeof itemsSectionSchema>;

async function exportItems(parts: readonly ItemPart[]): Promise<ItemsSection> {
  const items: FileItems = {};
  for (const part of parts) Object.assign(items, part.toFile(await part.read()));
  const folders = folderSettingsIn(parts, items);
  if (folders.length === 0) return { items };
  const paths = new Map((await folderPathsHere()).map(({ id, path }) => [id, path]));
  const folderPaths = Object.fromEntries(
    folders.flatMap(({ key, value }) => {
      const path = paths.get(value);
      return path === undefined ? [] : [[key, path]];
    }),
  );
  return { items, folderPaths };
}

/**
 * The file's items with each folder setting set to the id of the folder of its path here, or
 * left out (counted) where no single folder has that path, or the file names none (files from
 * before folder paths were kept).
 */
async function resolveFolderSettings(
  parts: readonly ItemPart[],
  section: ItemsSection,
): Promise<{ section: ItemsSection; matched: number; missing: number }> {
  const folders = folderSettingsIn(parts, section.items);
  if (folders.length === 0) return { section, matched: 0, missing: 0 };
  const here = await folderPathsHere();
  const items: FileItems = { ...section.items };
  let matched = 0;
  let missing = 0;
  for (const { itemKey, key, value } of folders) {
    const path = section.folderPaths?.[key];
    const candidates = path === undefined ? [] : here.filter((folder) => folder.path === path);
    const folder = candidates.find((candidate) => candidate.id === value) ?? candidates[0];
    const data = { ...(items[itemKey].data as Record<string, unknown>) };
    if (folder && (candidates.length === 1 || folder.id === value)) {
      data[key] = folder.id;
      matched += 1;
    } else {
      delete data[key];
      missing += 1;
    }
    items[itemKey] = { ...items[itemKey], data };
  }
  return { section: { ...section, items }, matched, missing };
}

const folderNote = (matched: number, missing: number): BackupNote[] =>
  matched + missing > 0
    ? [{ key: 'backup_folderSettingsByPath', values: [String(matched), String(missing)] }]
    : [];

/** Throws `BackupTooLargeError` when importing `section` as chosen would not fit storage. */
async function checkItems(parts: readonly ItemPart[], section: ItemsSection, choice: PartChoice) {
  for (const part of parts) {
    const { entries } = part.fromFile(section.items);
    part.assertFits(planEntries(part, await part.read(), entries, choice).next);
  }
}

function countEntries(parts: readonly ItemPart[], items: FileItems): number {
  return parts.reduce(
    (total, part) => total + (part.uncounted ? 0 : part.fromFile(items).entries.size),
    0,
  );
}

async function reviewItems(parts: readonly ItemPart[], section: ItemsSection): Promise<PartReview> {
  const review: PartReview = {
    count: 0,
    added: 0,
    changed: 0,
    unchanged: 0,
    removed: 0,
    skipped: 0,
    conflicts: [],
    conflictCount: 0,
    dated: false,
    notes: [],
  };
  for (const part of parts) {
    const { entries, skipped } = part.fromFile(section.items);
    const device = await part.read();
    const replace = planEntries(part, device, entries, { strategy: 'replace', conflicts: 'file' });
    review.skipped += skipped + replace.skippedOverMax;
    if (part.uncounted) continue;
    review.count += entries.size;
    review.added += replace.added;
    review.changed += replace.changed;
    review.unchanged += replace.unchanged;
    review.removed += replace.removed;
    if (!part.named) continue;
    if (part.named.updatedAt) review.dated = true;
    for (const [key, value] of entries) {
      const current = device.get(key);
      if (current === undefined || sameEntry(current, value)) continue;
      review.conflictCount += 1;
      if (review.conflicts.length >= BACKUP_LIMITS.maxConflictsListed) continue;
      review.conflicts.push({
        key: conflictKey(part, key),
        label: part.named.label(value),
        deviceTime: part.named.updatedAt?.(current),
        fileTime: part.named.updatedAt?.(value),
      });
    }
  }
  return review;
}

async function applyItems(
  parts: readonly ItemPart[],
  section: ItemsSection,
  choice: PartChoice,
): Promise<PartOutcome & { applied: Map<StorageItemId, EntriesPlan> }> {
  const outcome = {
    added: 0,
    changed: 0,
    removed: 0,
    kept: 0,
    skipped: 0,
    mismatches: 0,
    notes: [],
  };
  const applied = new Map<StorageItemId, EntriesPlan>();
  for (const part of parts) {
    const { entries, skipped } = part.fromFile(section.items);
    let plan: EntriesPlan | undefined;
    await part.write((device) => {
      plan = planEntries(part, device, entries, choice);
      return plan.next;
    });
    if (!plan) continue;
    applied.set(part.item, plan);
    outcome.skipped += skipped + plan.skippedOverMax;
    if (part.uncounted) continue;
    outcome.added += plan.added;
    outcome.changed += plan.changed;
    outcome.removed += plan.removed;
    outcome.kept += plan.unchanged + plan.kept;
    outcome.mismatches += countMismatches(plan.next, await part.read());
  }
  return { ...outcome, applied };
}

async function snapshotItems(parts: readonly ItemPart[]): Promise<Record<string, unknown>> {
  const snapshot: Record<string, unknown> = {};
  for (const part of parts) Object.assign(snapshot, await part.snapshot());
  return snapshot;
}

/** Puts every item back as `snapshot` holds it; resolves to the entries that read back otherwise. */
async function restoreItems(parts: readonly ItemPart[], snapshot: unknown): Promise<number> {
  if (!isPlainObject(snapshot)) return 0;
  let mismatches = 0;
  for (const part of parts) {
    await part.restore(snapshot);
    if (!part.uncounted)
      mismatches += countMismatches(part.fromSnapshot(snapshot), await part.read());
  }
  return mismatches;
}

/** A part made of stored items only, through the shared code path. */
function itemsHandler(category: string): CategoryHandler<ItemsSection> {
  const parts = () => partsOf(category);
  return {
    schema: itemsSectionSchema,
    export: () => exportItems(parts()),
    estimate: async () => {
      const section = await exportItems(parts());
      return { count: countEntries(parts(), section.items), bytes: jsonBytes(section) };
    },
    count: (section) => countEntries(parts(), section.items),
    review: async (section) => {
      const resolved = await resolveFolderSettings(parts(), section);
      const review = await reviewItems(parts(), resolved.section);
      review.notes.push(...folderNote(resolved.matched, resolved.missing));
      return review;
    },
    check: async (section, choice) =>
      checkItems(parts(), (await resolveFolderSettings(parts(), section)).section, choice),
    apply: async (section, choice) => {
      const resolved = await resolveFolderSettings(parts(), section);
      const { applied: _applied, ...outcome } = await applyItems(parts(), resolved.section, choice);
      outcome.notes.push(...folderNote(resolved.matched, resolved.missing));
      return outcome;
    },
    snapshot: () => snapshotItems(parts()),
    undo: (snapshot) => restoreItems(parts(), snapshot),
  };
}

const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

// ---------------------------------------------------------------------------------------------
// Prompts: the index lists the prompts stored, in order.

function promptsHandler(): CategoryHandler<ItemsSection> {
  const base = itemsHandler('prompts');
  return {
    ...base,
    async apply(section, choice, context) {
      const outcome = await base.apply(section, choice, context);
      // Prompts the index does not list yet (added by the import) go at its end; with Replace,
      // in the file's order.
      const fileIndex = promptLibraryIndexValue.parseStored(
        section.items[promptLibraryIndexValue.key] ?? null,
      );
      const stored = new Set(await customPromptItems.listIds());
      await promptLibraryIndexValue.update((index) => {
        const order = choice.strategy === 'replace' ? fileIndex.ids : index.ids;
        const ids = [...new Set([...order, ...index.ids, ...stored])].filter((id) =>
          stored.has(id),
        );
        const active = Object.fromEntries(
          Object.entries(index.active).filter(([, id]) => id !== undefined && stored.has(id)),
        ) as typeof index.active;
        return { ids, active };
      });
      return outcome;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// AI services and their keys

/** One AI service's connection without its secrets, and which secrets the file left out. */
const aiEndpointSchema = z.object({
  baseUrl: z.string().optional(),
  options: z.record(z.string(), z.string()).optional(),
  leftOut: z.array(z.enum(AI_SECRET_FIELDS)).optional(),
});

const aiServicesSectionSchema = itemsSectionSchema.extend({
  /** By service id. */
  endpoints: z.record(z.string(), aiEndpointSchema).optional(),
});
export type AIServicesSection = z.infer<typeof aiServicesSectionSchema>;

/** Each AI service's endpoint fields, without the secrets, naming the secrets it has. */
async function exportAIEndpoints(): Promise<NonNullable<AIServicesSection['endpoints']>> {
  const { services } = await aiServicesValue.get();
  const configs = await aiProviderConfigValue.get();
  const endpoints: NonNullable<AIServicesSection['endpoints']> = {};
  for (const { id } of services) {
    const config = configs[id] ?? {};
    const leftOut = AI_SECRET_FIELDS.filter(
      (field) => config[field] || config.pendingSecrets?.includes(field),
    );
    const options = Object.entries(config.options ?? {}).filter(([, value]) => value);
    endpoints[id] = {
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      ...(options.length > 0 ? { options: Object.fromEntries(options) } : {}),
      ...(leftOut.length > 0 ? { leftOut } : {}),
    };
  }
  return endpoints;
}

/**
 * Gives the services the import took from the file their endpoints, keeping this device's
 * secrets, marks each that still lacks a secret it had (or its provider requires), and removes
 * the connection of services no longer listed. Resolves to the services needing setup.
 */
async function restoreAIEndpoints(
  fromFile: ReadonlySet<string>,
  endpoints: AIServicesSection['endpoints'],
): Promise<ServiceNeedingSetup[]> {
  const { services } = await aiServicesValue.get();
  const listed = new Set(services.map((service) => service.id));
  const needsSetup: ServiceNeedingSetup[] = [];
  await aiProviderConfigValue.update((configs) => {
    const next = Object.fromEntries(Object.entries(configs).filter(([id]) => listed.has(id)));
    for (const service of services) {
      if (!fromFile.has(service.id)) continue;
      const endpoint = endpoints?.[service.id];
      const current = configs[service.id] ?? {};
      const wanted = new Set<AISecretField>(endpoint?.leftOut ?? []);
      if (serviceRequiresApiKey(service)) wanted.add('apiKey');
      const missing = AI_SECRET_FIELDS.filter((field) => wanted.has(field) && !current[field]);
      const secrets = Object.fromEntries(
        AI_SECRET_FIELDS.flatMap((field) => (current[field] ? [[field, current[field]]] : [])),
      );
      next[service.id] = {
        ...(endpoint ? secrets : current),
        ...(endpoint?.baseUrl ? { baseUrl: endpoint.baseUrl } : {}),
        ...(endpoint?.options ? { options: endpoint.options } : {}),
        ...(missing.length > 0 ? { pendingSecrets: missing } : {}),
      };
      if (missing.length > 0) needsSetup.push({ name: service.name, fields: missing });
    }
    return next;
  });
  return needsSetup;
}

function aiServicesHandler(): CategoryHandler<AIServicesSection> {
  const base = itemsHandler('aiServices');
  const parts = () => partsOf('aiServices');
  const credentials = valueItem('aiCredentials', aiProviderConfigValue, {
    toEntries: (value) => new Map(Object.entries(value)),
    fromEntries: (entries) => Object.fromEntries(entries) as Record<string, StoredAIProviderConfig>,
  });
  return {
    schema: aiServicesSectionSchema,
    export: async () => ({ ...(await base.export()), endpoints: await exportAIEndpoints() }),
    estimate: async () => {
      const section = { ...(await base.export()), endpoints: await exportAIEndpoints() };
      return { count: base.count(section), bytes: jsonBytes(section) };
    },
    count: base.count,
    review: base.review,
    async apply(section, choice) {
      const { applied, ...outcome } = await applyItems(parts(), section, choice);
      const plan = applied.get('aiServices');
      const fileServices = new Map(
        parts()[0]?.fromFile(section.items).entries ?? new Map<string, unknown>(),
      );
      // Services whose entry now is the file's.
      const fromFile = new Set(
        [...(plan?.next ?? new Map())]
          .filter(
            ([id, service]) => fileServices.has(id) && sameEntry(fileServices.get(id), service),
          )
          .map(([id]) => id),
      );
      const fileDefault = aiServicesValue.parseStored(
        section.items[aiServicesValue.key] ?? null,
      ).defaultServiceId;
      await aiServicesValue.update((state) => ({
        ...state,
        defaultServiceId:
          fileDefault && state.services.some((service) => service.id === fileDefault)
            ? fileDefault
            : state.defaultServiceId,
      }));
      const needsSetup = await restoreAIEndpoints(fromFile, section.endpoints);
      return { ...outcome, needsSetup };
    },
    snapshot: async () => ({
      ...(await snapshotItems(parts())),
      ...(await credentials.snapshot()),
    }),
    undo: async (snapshot) => {
      const mismatches = await restoreItems(parts(), snapshot);
      if (!isPlainObject(snapshot)) return mismatches;
      await credentials.restore(snapshot);
      return (
        mismatches + countMismatches(credentials.fromSnapshot(snapshot), await credentials.read())
      );
    },
  };
}

/** One service's secrets in a file. */
const aiSecretsSchema = z.object({
  apiKey: z.string().optional(),
  extraHeaders: z.string().optional(),
});

const aiKeysSectionSchema = z.object({
  /** By service id; only services with a secret. */
  secrets: z.record(z.string(), aiSecretsSchema),
});
type AIKeysSection = z.infer<typeof aiKeysSectionSchema>;

type Secrets = z.infer<typeof aiSecretsSchema>;

const pickSecrets = (config: StoredAIProviderConfig): Secrets =>
  Object.fromEntries(
    AI_SECRET_FIELDS.flatMap((field) => (config[field] ? [[field, config[field]]] : [])),
  );

const hasSecret = (secrets: Secrets) => AI_SECRET_FIELDS.some((field) => Boolean(secrets[field]));

/**
 * The AI service keys part: each service's API key and extra headers, by service id. Only for
 * services this device lists after the import (keys are stored by service); a key for any other
 * service is skipped. Merge sets the file's secrets on those services; Replace also removes the
 * secrets of the services the file has none for.
 */
function aiServiceKeysHandler(): CategoryHandler<AIKeysSection> {
  const credentials = valueItem('aiCredentials', aiProviderConfigValue, {
    toEntries: (value) => new Map(Object.entries(value)),
    fromEntries: (entries) => Object.fromEntries(entries) as Record<string, StoredAIProviderConfig>,
  });
  const fileSecrets = (section: AIKeysSection) =>
    Object.entries(section.secrets).filter(([, secrets]) => hasSecret(secrets));
  const exportKeys = async (): Promise<AIKeysSection> => {
    const { services } = await aiServicesValue.get();
    const configs = await aiProviderConfigValue.get();
    const secrets: AIKeysSection['secrets'] = {};
    for (const { id } of services) {
      const picked = pickSecrets(configs[id] ?? {});
      if (hasSecret(picked)) secrets[id] = picked;
    }
    return { secrets };
  };
  /** The services this import leaves, by id, with their names. */
  const servicesAfter = async (context: ImportContext) => {
    const names = new Map((await aiServicesValue.get()).services.map((s) => [s.id, s.name]));
    if (context.aiServices) {
      const parsed = aiServicesValue.parseStored(
        context.aiServices.items[aiServicesValue.key] ?? null,
      );
      for (const service of parsed.services)
        if (!names.has(service.id)) names.set(service.id, service.name);
    }
    return names;
  };
  return {
    schema: aiKeysSectionSchema,
    export: exportKeys,
    estimate: async () => {
      const section = await exportKeys();
      return { count: Object.keys(section.secrets).length, bytes: jsonBytes(section) };
    },
    count: (section) => fileSecrets(section).length,
    async review(section, context) {
      const names = await servicesAfter(context);
      const configs = await aiProviderConfigValue.get();
      const review: PartReview = {
        count: 0,
        added: 0,
        changed: 0,
        unchanged: 0,
        removed: 0,
        skipped: 0,
        conflicts: [],
        conflictCount: 0,
        dated: false,
        notes: [],
      };
      const inFile = new Set<string>();
      for (const [id, secrets] of fileSecrets(section)) {
        review.count += 1;
        if (!names.has(id)) {
          review.skipped += 1;
          continue;
        }
        inFile.add(id);
        const current = pickSecrets(configs[id] ?? {});
        if (!hasSecret(current)) review.added += 1;
        else if (sameEntry(current, secrets)) review.unchanged += 1;
        else review.changed += 1;
      }
      review.removed = Object.entries(configs).filter(
        ([id, config]) => !inFile.has(id) && hasSecret(pickSecrets(config)),
      ).length;
      if (review.skipped > 0) {
        review.notes.push({
          key: 'backup_keysForMissingServices',
          values: [String(review.skipped)],
        });
      }
      return review;
    },
    async apply(section, choice) {
      const listed = new Set((await aiServicesValue.get()).services.map((service) => service.id));
      const outcome: PartOutcome = {
        added: 0,
        changed: 0,
        removed: 0,
        kept: 0,
        skipped: 0,
        mismatches: 0,
        notes: [],
      };
      const incoming = new Map(fileSecrets(section));
      await aiProviderConfigValue.update((configs) => {
        const next = { ...configs };
        if (choice.strategy === 'replace') {
          for (const [id, config] of Object.entries(configs)) {
            if (incoming.has(id) || !hasSecret(pickSecrets(config))) continue;
            const { apiKey: _key, extraHeaders: _headers, ...rest } = config;
            next[id] = rest;
            outcome.removed += 1;
          }
        }
        for (const [id, secrets] of incoming) {
          if (!listed.has(id)) {
            outcome.skipped += 1;
            continue;
          }
          const current = configs[id] ?? {};
          if (sameEntry(pickSecrets(current), secrets)) {
            outcome.kept += 1;
            continue;
          }
          const pending = current.pendingSecrets?.filter((field) => !secrets[field]);
          const { pendingSecrets: _pending, ...rest } = current;
          next[id] = {
            ...rest,
            ...secrets,
            ...(pending?.length ? { pendingSecrets: pending } : {}),
          };
          if (hasSecret(pickSecrets(current))) outcome.changed += 1;
          else outcome.added += 1;
        }
        return next;
      });
      // Read back: each service the file has secrets for holds exactly them now.
      const stored = await aiProviderConfigValue.get();
      for (const [id, secrets] of incoming) {
        if (listed.has(id) && !sameEntry(pickSecrets(stored[id] ?? {}), secrets)) {
          outcome.mismatches += 1;
        }
      }
      return outcome;
    },
    snapshot: () => credentials.snapshot(),
    undo: async (snapshot) => {
      if (!isPlainObject(snapshot)) return 0;
      await credentials.restore(snapshot);
      return countMismatches(credentials.fromSnapshot(snapshot), await credentials.read());
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Covers, in IndexedDB, by address (`cover-backup.lazy.ts`)

const coversSectionSchema = z.object({ covers: z.array(z.unknown()) });
type CoversSection = z.infer<typeof coversSectionSchema>;

/** Each file's covers, read and checked once (decoding base64 is the costly part). */
const readCovers = (() => {
  const cache = new WeakMap<object, BackupCovers>();
  return (section: CoversSection): BackupCovers => {
    let covers = cache.get(section);
    if (!covers) {
      covers = readBackupCovers(section.covers);
      cache.set(section, covers);
    }
    return covers;
  };
})();

function coversHandler(): CategoryHandler<CoversSection> {
  return {
    schema: coversSectionSchema,
    export: async () => ({ covers: await exportBackupCovers() }),
    estimate: async () => {
      const estimate = await estimateCoverBackup();
      return {
        count: estimate.covers,
        bytes: estimate.fileBytes,
        ...(estimate.leftOut > 0
          ? { notes: [{ key: 'backup_coversLeftOut', values: [String(estimate.leftOut)] }] }
          : {}),
      };
    },
    count: (section) => section.covers.length,
    async review(section, _context) {
      const covers = readCovers(section);
      const plan = await previewCoverRestore(covers);
      const replace = await previewCoverRestore(covers, 'replace');
      const notes: BackupNote[] = [
        { key: 'backup_coversMatched', values: [String(plan.matched)] },
        { key: 'backup_coversUnmatched', values: [String(plan.unmatched)] },
        ...(plan.overStorage > 0
          ? [{ key: 'backup_coversOverStorage' as MessageKey, values: [String(plan.overStorage)] }]
          : []),
      ];
      return {
        count: plan.inFile,
        added: plan.added,
        changed: plan.replaced,
        unchanged: plan.kept,
        removed: replace.removed,
        skipped: plan.skipped,
        conflicts: [],
        conflictCount: 0,
        dated: false,
        notes,
      };
    },
    async apply(section, choice) {
      const covers = readCovers(section);
      const outcome = await applyCoverRestore(covers, choice.strategy);
      return {
        added: outcome.added,
        changed: outcome.restored - outcome.added,
        removed: outcome.removed,
        kept: outcome.kept,
        skipped: outcome.skipped + outcome.notStored,
        mismatches: outcome.mismatches,
        notes: [
          ...(outcome.unmatched > 0
            ? [{ key: 'backup_coversUnmatched' as MessageKey, values: [String(outcome.unmatched)] }]
            : []),
        ],
      };
    },
    snapshot: (section, choice) => snapshotCoversFor(readCovers(section), choice.strategy),
    undo: (snapshot) => restoreCoverSnapshot(snapshot as CoverSnapshot),
  };
}

// ---------------------------------------------------------------------------------------------

/** Every part's handler by id; a part in the config without one fails the backup tests. */
export const CATEGORY_HANDLERS: Readonly<Record<string, CategoryHandler<never>>> = {
  settings: itemsHandler('settings'),
  deviceSettings: itemsHandler('deviceSettings'),
  views: itemsHandler('views'),
  prompts: promptsHandler(),
  rules: itemsHandler('rules'),
  aiServices: aiServicesHandler(),
  aiServiceKeys: aiServiceKeysHandler(),
  covers: coversHandler(),
} as unknown as Record<string, CategoryHandler<never>>;

/** The handler of part `id`; throws for a part this release has no handler for. */
export function getCategoryHandler(id: string): CategoryHandler<unknown> {
  const handler = CATEGORY_HANDLERS[id];
  if (!handler) throw new Error(`No handler for backup part ${id}`);
  return handler as CategoryHandler<unknown>;
}

/** The stored items each part holds, for the tests. */
export function getItemsOfCategory(id: string): StorageItemId[] {
  return registryItemsOf(id);
}
