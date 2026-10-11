/**
 * Seeds and reads registered items in the fake browser's storage the way the extension stores
 * them (`{ v, data }` under the registry key), so tests never spell a key or the envelope.
 */
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { type StorageItem, storageAreaKey } from '@/lib/storage/registry';

export { STORAGE_ITEMS } from '@/lib/storage/registry';

/** What `browser.storage[item.area]` holds for `data`. */
export function storedEntry(item: StorageItem, data: unknown, id?: string) {
  return { [storageAreaKey(item, id)]: { v: item.v, data } };
}

export async function seedStored(item: StorageItem, data: unknown, id?: string): Promise<void> {
  await fakeBrowser.storage[item.area].set(storedEntry(item, data, id));
}

/** The raw stored value (the envelope), or undefined when the key is missing. */
export async function readStoredRaw(item: StorageItem, id?: string): Promise<unknown> {
  const key = storageAreaKey(item, id);
  return (await fakeBrowser.storage[item.area].get(key))[key];
}

/** The stored data, or undefined when the key is missing. */
export async function readStoredData(item: StorageItem, id?: string): Promise<unknown> {
  const raw = await readStoredRaw(item, id);
  return raw === undefined ? undefined : (raw as { data: unknown }).data;
}
