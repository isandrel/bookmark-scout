/**
 * Storage housekeeping the background runs: removing keys the registry does not list, and keeping
 * the local area (which holds API keys) away from content scripts.
 */
import { isMigrationLegacyKey } from './migrations';
import { isRegisteredKey, type StorageAreaName } from './registry';

const AREAS: readonly StorageAreaName[] = ['sync', 'local', 'session'];

type KeyListingArea = {
  get: (keys: null) => Promise<Record<string, unknown>>;
  getKeys?: () => Promise<string[]>;
  remove: (keys: string[]) => Promise<void>;
};

async function storedKeys(area: KeyListingArea): Promise<string[]> {
  // getKeys (Chrome 130+) lists keys without reading every value; elsewhere read them all.
  if (typeof area.getKeys === 'function') {
    try {
      return await area.getKeys();
    } catch {
      // Declared but not implemented; read the values instead.
    }
  }
  return Object.keys(await area.get(null));
}

/**
 * Removes every key in every area that `STORAGE_ITEMS` does not list: data from older releases,
 * which this release neither reads nor migrates. An old item a registered migration still reads
 * is kept, and goes once the migration is removed. Resolves to the removed keys per area.
 */
export async function removeUnregisteredKeys(): Promise<
  Partial<Record<StorageAreaName, string[]>>
> {
  const removed: Partial<Record<StorageAreaName, string[]>> = {};
  for (const name of AREAS) {
    const area = browser.storage[name] as KeyListingArea | undefined;
    if (!area) continue;
    const stale = (await storedKeys(area)).filter(
      (key) => !isRegisteredKey(name, key) && !isMigrationLegacyKey(name, key),
    );
    if (stale.length === 0) continue;
    await area.remove(stale);
    removed[name] = stale;
  }
  return removed;
}

/**
 * Removes unregistered keys whenever this extension is installed or updated (not when only the
 * browser updates). Call it synchronously when the background starts, so the event is not missed.
 */
export function registerStorageCleanup(): void {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason !== 'install' && reason !== 'update') return;
    void removeUnregisteredKeys().catch((error) => {
      console.error('[Storage] Failed to remove old keys:', error);
    });
  });
}

type AccessLevelArea = {
  setAccessLevel?: (options: { accessLevel: 'TRUSTED_CONTEXTS' }) => Promise<void>;
};

/**
 * Keeps `storage.local` (API keys among it) out of content scripts where the browser allows it
 * (Chrome 140+); older Chrome rejects the call for this area and Firefox lacks it, which is fine:
 * no content script of this extension reads storage.
 */
export async function restrictLocalStorageAccess(): Promise<boolean> {
  const area = browser.storage.local as AccessLevelArea;
  if (typeof area.setAccessLevel !== 'function') return false;
  try {
    await area.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    return true;
  } catch {
    return false;
  }
}
