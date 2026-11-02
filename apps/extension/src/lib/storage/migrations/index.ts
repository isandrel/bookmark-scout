/**
 * Storage migrations: moving settings an earlier release stored in another place or shape into
 * where this release keeps them. The background runs every registered migration at each start
 * and on install or update (`registerStorageMigrations` in `lib/settings-storage.ts`), the backup
 * restore converts older files with them (`upgradeBackupFile` in `./backup-files.ts`, which runs the
 * backup file converters and, for files from before list settings had items of their own,
 * `upgradeBackupItems`), and settings read through them
 * on a device where they have not run yet, so a user never sees a moved setting reset meanwhile.
 *
 * Each migration is one standalone module in this folder, `<yyyy-mm>-<name>.ts`, exporting
 * `migration`: everything about the old layout (the old item's key and shape, and where its values
 * go) and nothing else. Its table in `config/data/migrations.toml` turns it on or off and says when
 * it came and when it goes; the registry finds the modules itself (`import.meta.glob`) and fails
 * on a module without a table or a table without a module. No other file names an old key
 * (`tests/unit/migrations/index.test.ts` checks `src`). Adding or removing one is
 * `.agents/skills/extension-stored-data/scripts/migration.ts add <name>` or `remove <id>`: its
 * module, its table, and its test. Once it is gone the install and update cleanup removes the old
 * item it kept, and the next settings save drops the old keys it kept in the settings item
 * (`keepsInSettingsItem`).
 *
 * Rules for a migration:
 * - It never writes or removes the old item, so a device still on an earlier release keeps
 *   reading it; the cleanup removes it once the migration is deleted.
 * - It only fills: a setting already stored where this release keeps it wins over an old value,
 *   since another device may have written it later. An old value that is not valid is dropped
 *   alone.
 * - It runs on stored state, not on the update event alone: it records each device that has run
 *   it (`STORAGE_ITEMS.storageMigrations`), and runs again until then, so an interrupted or
 *   failed run (a write over the sync quota) is retried at the next start.
 *
 * WXT's `storage.defineItem` has versions and migrations too, but they run per item, on update
 * only, and cannot move a value into another item; this registry is the one mechanism here.
 */

import { z } from 'zod';
import {
  getSettingScope,
  type SettingScope,
  type Settings,
  settingsSchema,
} from '@/lib/settings-schema';
import { STORAGE_ITEMS, type StorageAreaName, type StorageKey, storageKey } from '../registry';
import type { StoredValue } from '../stored-value';

/** Stored settings that differ from the default, by key, as one settings item holds them. */
export type StoredOverrides = Record<string, unknown>;

/** What each settings scope stores: the settings item, the list items, and this device's. */
export type SettingsLayers = Record<SettingScope, StoredOverrides>;

/** What a migration found in earlier releases' places. */
export type Recovered = {
  /** Values by setting key: each goes to its scope where that holds none, if valid. */
  found: StoredOverrides;
  /** Keys to remove from this device's settings once moved; synced places are never changed. */
  dropFromDevice?: readonly string[];
};

export type StorageMigration = {
  /** Unique; recorded on each device that has run it. */
  readonly id: string;
  /** What it moves, from where to where. */
  readonly description: string;
  /**
   * The first release that ships it: the release after the last store release, which is ahead
   * of the package version until the release change raises it.
   */
  readonly addedIn: string;
  /**
   * The first package version that should no longer carry it: a unit test fails from then on, so
   * the release that reaches it removes the migration, or moves this on when the store
   * dashboards still show installs of a release from before `addedIn`.
   */
  readonly removeAfter: string;
  /**
   * The item an earlier release stored that the registry no longer lists, if any. Read only; the
   * install and update cleanup keeps it while the migration is registered.
   */
  readonly legacy?: StoredValue<unknown>;
  /** Finds the settings earlier releases kept elsewhere, from the stored layers and `legacy`. */
  recover(layers: SettingsLayers, legacy: unknown): Recovered;
  /**
   * Whether the settings writer keeps a copy of `key`, a setting this release keeps elsewhere, in
   * the settings item, where an earlier release still reads it. Every change to the setting is
   * written to the copy too (or removes it at the default), as is each list Restore settings
   * changes; Reset removes it, and its Undo puts it back as it was stored, so neither that release
   * nor a device that runs this migration later reads a value changed since. Once no registered
   * migration keeps it, the next settings save drops it; it is also dropped when the item would
   * not fit the per-item quota with it.
   */
  keepsInSettingsItem?(key: keyof Settings): boolean;
  /**
   * Whether the settings writer stores `key`, a synced setting, even at its default, given what
   * the settings item holds: a setting this migration fills from an older one where none is
   * stored must stay stored once the user sets it back to its default, or a device that runs
   * the migration later fills it again.
   */
  keepsAtDefault?(key: keyof Settings, settingsItem: StoredOverrides): boolean;
};

/** What a migration's module holds: its logic. Its id, and when it came and goes, are config. */
export type MigrationModule = Omit<StorageMigration, 'id' | 'addedIn' | 'removeAfter'>;

const version = z.string().regex(/^\d+\.\d+\.\d+$/);

const migrationsConfig = readConfig(
  'data/migrations',
  z.strictObject({
    // Read by the add script only (`migration.ts add`): how long a new migration is kept.
    defaults: z.strictObject({ keep_minor_releases: z.number().int().positive() }),
    migrations: z.record(
      z.string().regex(/^\d{4}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/),
      z.strictObject({ enabled: z.boolean(), added_in: version, remove_after: version }),
    ),
  }),
);

/**
 * Every storage migration module in this folder, by file: `./<yyyy-mm>-<name>.ts`. The pattern is
 * `20*` because the glob takes no character classes; backup converters are named `backup-*`.
 */
const MODULES = import.meta.glob<{ migration: MigrationModule }>('./20*.ts', {
  eager: true,
});

/**
 * The migrations config turns on, each its module with its id and versions, oldest first. A module
 * without a table, or a table without a module, is an error, so neither can be left behind.
 */
export function loadMigrations(
  modules: Readonly<Record<string, { migration: MigrationModule }>> = MODULES,
  config: typeof migrationsConfig = migrationsConfig,
): StorageMigration[] {
  const byId = new Map(
    Object.entries(modules).map(([file, module]) => [
      file.replace(/^\.\/|\.ts$/g, ''),
      module.migration,
    ]),
  );
  for (const id of byId.keys()) {
    if (!(id in config.migrations)) {
      throw new Error(`Storage migration ${id} has no table in config/data/migrations.toml`);
    }
  }
  return Object.entries(config.migrations)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([id, entry]) => {
      const module = byId.get(id);
      if (!module) throw new Error(`config/data/migrations.toml names ${id}, which has no module`);
      return entry.enabled
        ? [{ ...module, id, addedIn: entry.added_in, removeAfter: entry.remove_after }]
        : [];
    });
}

/** Every migration that is on, oldest first; the background runs them in this order. */
export const MIGRATIONS: readonly StorageMigration[] = loadMigrations();

/** The migration `id`, as registered; for its tests. */
export function getMigration(id: string): StorageMigration {
  const migration = MIGRATIONS.find((entry) => entry.id === id);
  if (!migration) throw new Error(`No storage migration ${id} is on`);
  return migration;
}

/** The ids of the migrations that have run on this device. */
export const completedMigrationsValue = defineStoredValue<string[]>(
  STORAGE_ITEMS.storageMigrations,
  {
    parse: (raw) => (Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : []),
    empty: [],
    isEmpty: (ids) => ids.length === 0,
  },
);

/** Whether `key` (a name within `area`) is an old item a registered migration still reads. */
export function isMigrationLegacyKey(area: StorageAreaName, key: string): boolean {
  return MIGRATIONS.some(
    ({ legacy }) => legacy?.item.area === area && legacy.key === `${area}:${key}`,
  );
}

function isSettingsKey(key: string): key is keyof Settings {
  return key in settingsSchema.shape;
}

/**
 * `layers` with every value the recoveries found added to its setting's scope, where that holds
 * nothing yet and the value is valid; the first recovery that has one wins. Keys a recovery
 * moved off this device are removed from its layer.
 */
export function fillRecovered(
  layers: SettingsLayers,
  recoveries: readonly Recovered[],
): SettingsLayers {
  const next: SettingsLayers = {
    sync: { ...layers.sync },
    lists: { ...layers.lists },
    device: { ...layers.device },
  };
  for (const { found, dropFromDevice = [] } of recoveries) {
    for (const [key, value] of Object.entries(found)) {
      if (!isSettingsKey(key)) continue;
      const scope = getSettingScope(key);
      if (key in next[scope] || !settingsSchema.shape[key].safeParse(value).success) continue;
      next[scope][key] = value;
    }
    for (const key of dropFromDevice) delete next.device[key];
  }
  return next;
}

/** What each of `migrations` that has not run here finds, given its legacy item's value. */
export function pendingRecoveries(
  migrations: readonly StorageMigration[],
  layers: SettingsLayers,
  completed: readonly string[],
  legacyValues: readonly unknown[],
): Recovered[] {
  return migrations.flatMap((migration, index) =>
    completed.includes(migration.id) ? [] : [migration.recover(layers, legacyValues[index])],
  );
}

/** Each of `migrations`' legacy value (undefined for one without), in their order. */
export function getLegacyValues(migrations: readonly StorageMigration[]): Promise<unknown[]> {
  return Promise.all(migrations.map(({ legacy }) => legacy?.get()));
}

export type Envelope = { v: number; data: unknown };

/**
 * A backup file's items as this release stores them: the settings an earlier release's file
 * holds in older places are added where this release keeps them, unless the file already has
 * them there. Every other item is left as it is.
 */
export function upgradeBackupItems(items: Record<string, Envelope>): Record<string, Envelope> {
  const readable = (key: StorageKey, v: number) => {
    const envelope = items[key];
    return envelope && envelope.v <= v ? envelope.data : undefined;
  };
  const overrides = (key: StorageKey, v: number): StoredOverrides => {
    const data = readable(key, v);
    return isPlainObject(data) ? data : {};
  };
  const settingsKey = storageKey(STORAGE_ITEMS.settings);
  const deviceKey = storageKey(STORAGE_ITEMS.deviceSettings);
  const listPrefix = storageKey(STORAGE_ITEMS.settingsList, '');
  const lists = Object.fromEntries(
    Object.keys(items)
      .filter((key) => key.startsWith(listPrefix) && key.length > listPrefix.length)
      .flatMap((key) => {
        const data = readable(key as StorageKey, STORAGE_ITEMS.settingsList.v);
        return data === undefined ? [] : [[key.slice(listPrefix.length), data]];
      }),
  );
  const layers: SettingsLayers = {
    sync: overrides(settingsKey, STORAGE_ITEMS.settings.v),
    lists,
    device: overrides(deviceKey, STORAGE_ITEMS.deviceSettings.v),
  };
  const recoveries = MIGRATIONS.map((migration) =>
    migration.recover(layers, migration.legacy?.parseStored(items[migration.legacy.key] ?? null)),
  );
  const next = fillRecovered(layers, recoveries);
  const upgraded = { ...items };
  const envelope = (v: number, data: unknown) => ({ v, data });
  if (readable(settingsKey, STORAGE_ITEMS.settings.v) !== undefined) {
    upgraded[settingsKey] = envelope(STORAGE_ITEMS.settings.v, next.sync);
  }
  if (readable(deviceKey, STORAGE_ITEMS.deviceSettings.v) !== undefined) {
    upgraded[deviceKey] = envelope(STORAGE_ITEMS.deviceSettings.v, next.device);
  }
  for (const [key, value] of Object.entries(next.lists)) {
    upgraded[storageKey(STORAGE_ITEMS.settingsList, key)] ??= envelope(
      STORAGE_ITEMS.settingsList.v,
      value,
    );
  }
  return upgraded;
}
