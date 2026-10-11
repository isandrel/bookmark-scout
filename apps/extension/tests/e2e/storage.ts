/**
 * Seeds and reads the extension's stored items from a test, through the service worker or any
 * extension page. Keys and the `{ v, data }` envelope come from the registry
 * (`src/lib/storage/registry.ts`), so specs never spell a storage key.
 */
import type { Page, Worker } from '@playwright/test';
import {
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

/** Merges `updates` into the stored settings. */
export async function setSettings(
  target: StorageTarget,
  updates: Record<string, unknown>,
): Promise<void> {
  await updateStored<Record<string, unknown>>(target, STORAGE_ITEMS.settings, (current) => ({
    ...current,
    ...updates,
  }));
}

/** The stored settings (only what was saved, not the defaults). */
export async function readSettings(target: StorageTarget): Promise<Record<string, unknown>> {
  return (await readStored<Record<string, unknown>>(target, STORAGE_ITEMS.settings)) ?? {};
}
