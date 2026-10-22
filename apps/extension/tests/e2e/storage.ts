/**
 * Seeds and reads the extension's stored items from a test, through the service worker or any
 * extension page. Keys and the `{ v, data }` envelope come from the registry
 * (`src/lib/storage/registry.ts`), so specs never spell a storage key.
 */
import type { Page, Worker } from '@playwright/test';
import {
  DEVICE_SETTING_KEYS,
  STORAGE_ITEMS,
  type StorageAreaName,
  type StorageItem,
  storageAreaKey,
} from '../../src/lib/storage/registry';

export { STORAGE_ITEMS };

/** The service worker or an extension page; both reach `chrome.storage`. */
export type StorageTarget = Page | Worker;

type RawEntries = { area: StorageAreaName; values: Record<string, unknown> }[];

/** What `chrome.storage[item.area]` holds for `data`. */
export function storedEntry(item: StorageItem, data: unknown, id?: string) {
  return { [storageAreaKey(item, id)]: { v: item.v, data } };
}

function evaluate<R, A>(target: StorageTarget, fn: (arg: A) => Promise<R>, arg: A): Promise<R> {
  return (target as Page).evaluate(fn, arg);
}

/** Writes raw values per area in one round trip. */
async function setRaw(target: StorageTarget, entries: RawEntries): Promise<void> {
  await evaluate(
    target,
    async (list) => {
      for (const { area, values } of list) await chrome.storage[area].set(values);
    },
    entries,
  );
}

/** Stores `data` as the extension would. */
export async function writeStored(
  target: StorageTarget,
  item: StorageItem,
  data: unknown,
  id?: string,
): Promise<void> {
  await setRaw(target, [{ area: item.area, values: storedEntry(item, data, id) }]);
}

/** Stores several items at once: `[item, data]` or `[item, data, id]` per entry. */
export async function writeStoredItems(
  target: StorageTarget,
  entries: readonly (readonly [StorageItem, unknown] | readonly [StorageItem, unknown, string])[],
): Promise<void> {
  await setRaw(
    target,
    entries.map(([item, data, id]) => ({ area: item.area, values: storedEntry(item, data, id) })),
  );
}

/** The raw stored value (the envelope), or undefined when the key is missing. */
export async function readStoredRaw(
  target: StorageTarget,
  item: StorageItem,
  id?: string,
): Promise<unknown> {
  return evaluate(target, async ({ area, key }) => (await chrome.storage[area].get(key))[key], {
    area: item.area,
    key: storageAreaKey(item, id),
  });
}

/** The stored data, or undefined when the key is missing. */
export async function readStored<T = unknown>(
  target: StorageTarget,
  item: StorageItem,
  id?: string,
): Promise<T | undefined> {
  const raw = await readStoredRaw(target, item, id);
  return raw === undefined ? undefined : (raw as { data: T }).data;
}

/** Applies `change` to the stored data (undefined when missing) and stores the result. */
export async function updateStored<T>(
  target: StorageTarget,
  item: StorageItem,
  change: (current: T | undefined) => T,
  id?: string,
): Promise<void> {
  await writeStored(target, item, change(await readStored<T>(target, item, id)), id);
}

export async function removeStored(
  target: StorageTarget,
  item: StorageItem,
  id?: string,
): Promise<void> {
  await evaluate(
    target,
    async ({ area, key }) => {
      await chrome.storage[area].remove(key);
    },
    { area: item.area, key: storageAreaKey(item, id) },
  );
}

const deviceSettingKeys = new Set<string>(DEVICE_SETTING_KEYS);

/** `settings` split into what sync storage holds and what this device's storage holds. */
/**
 * Settings by the item that stores them: this device's, synced lists (every list setting, as
 * `getSettingScope` decides by the default being a list), and the other synced ones.
 */
function splitSettings(settings: Record<string, unknown>) {
  const entries = Object.entries(settings);
  const device = (key: string) => deviceSettingKeys.has(key);
  return {
    sync: Object.fromEntries(
      entries.filter(([key, value]) => !device(key) && !Array.isArray(value)),
    ),
    lists: Object.fromEntries(
      entries.filter(([key, value]) => !device(key) && Array.isArray(value)),
    ),
    device: Object.fromEntries(entries.filter(([key]) => device(key))),
  };
}

/**
 * Merges `updates` into the stored settings, each in its scope (device settings in local
 * storage). Stored as given: a value equal to the default is kept, which the extension reads the
 * same as a missing one.
 */
export async function setSettings(
  target: StorageTarget,
  updates: Record<string, unknown>,
): Promise<void> {
  const { sync, lists, device } = splitSettings(updates);
  type Overrides = Record<string, unknown>;
  if (Object.keys(sync).length > 0) {
    await updateStored<Overrides>(target, STORAGE_ITEMS.settings, (current) => ({
      ...current,
      ...sync,
    }));
  }
  if (Object.keys(lists).length > 0) {
    await updateStored<Overrides>(target, STORAGE_ITEMS.settingsLists, (current) => ({
      ...current,
      ...lists,
    }));
  }
  if (Object.keys(device).length > 0) {
    await updateStored<Overrides>(target, STORAGE_ITEMS.deviceSettings, (current) => ({
      ...current,
      ...device,
    }));
  }
}

/** Replaces every stored setting with `settings` (the rest read as their defaults). */
export async function replaceSettings(
  target: StorageTarget,
  settings: Record<string, unknown>,
): Promise<void> {
  const { sync, lists, device } = splitSettings(settings);
  await writeStoredItems(target, [
    [STORAGE_ITEMS.settings, sync],
    [STORAGE_ITEMS.settingsLists, lists],
    [STORAGE_ITEMS.deviceSettings, device],
  ]);
}

/**
 * The stored settings from both scopes. Only settings that differ from their default are stored,
 * so a setting at its default reads as undefined.
 */
export async function readSettings(target: StorageTarget): Promise<Record<string, unknown>> {
  type Overrides = Record<string, unknown>;
  return {
    ...(await readStored<Overrides>(target, STORAGE_ITEMS.settings)),
    ...(await readStored<Overrides>(target, STORAGE_ITEMS.settingsLists)),
    ...(await readStored<Overrides>(target, STORAGE_ITEMS.deviceSettings)),
  };
}

export type SeededAIService = {
  provider: string;
  /** Defaults to the provider id, as the service id the credentials are keyed by. */
  id?: string;
  name?: string;
  /** Empty means the provider default. */
  model?: string;
  enabled?: boolean;
  /** API key, Base URL, and the rest, as stored for the service. */
  credentials?: Record<string, unknown>;
};

/** Stores `services` as the named AI services, the first one the default, with credentials. */
export async function seedAIServices(
  target: StorageTarget,
  services: readonly SeededAIService[],
): Promise<void> {
  const stored = services.map(
    ({ provider, id = provider, name = provider, model = '', enabled = true }) => ({
      id,
      name,
      provider,
      model,
      enabled,
    }),
  );
  await writeStoredItems(target, [
    [STORAGE_ITEMS.aiServices, { services: stored, defaultServiceId: stored[0]?.id }],
    [
      STORAGE_ITEMS.aiCredentials,
      Object.fromEntries(
        services.flatMap((service) =>
          service.credentials ? [[service.id ?? service.provider, service.credentials]] : [],
        ),
      ),
    ],
  ]);
}
