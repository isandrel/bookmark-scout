/**
 * Each synced list setting in its own item (October 2026). Earlier, list settings shared one
 * synced item, which filled the 8,192-byte item quota, so new lists had to stay on one device:
 * - 0.3.4, the store release, kept them in the settings item, beside the other settings;
 * - builds after it kept them in one synced lists item, `settings.lists`;
 * - and kept the manager's Organize, empty-space, and preview menus and the popup's row menus on
 *   each device, for lack of room.
 * Each of those now has its own synced item, `settings.list/<setting>`
 * (`STORAGE_ITEMS.settingsList`).
 * This finds them in the old places for `MIGRATIONS` (see `./index.ts` for what the runner does
 * with them): the lists item wins over the settings item, which wins over this device. While it
 * is registered, the settings writer keeps 0.3.4's lists in the settings item current for devices
 * still on 0.3.4: each change to one is written there too, or removed at its default, and Reset
 * removes them, so a device that runs this later never brings back a list since changed or reset.
 * Once it is deleted, the next settings save drops them, with nothing else to remove.
 */
import { getSettingScope, type Settings, settingsSchema } from '@/lib/settings-schema';
import type { StorageItem } from '../registry';
import type { StorageMigration, StoredOverrides } from './index';

/** The one item every list setting shared, as builds after 0.3.4 stored it. */
const LISTS_ITEM: StorageItem = { area: 'sync', name: 'settings.lists', v: 1, backup: 'exclude' };

const listsItemValue = defineStoredValue<unknown>(LISTS_ITEM, {
  parse: (raw) => (isPlainObject(raw) ? raw : {}),
  empty: {},
});

const isSettingsKey = (key: string): key is keyof Settings => key in settingsSchema.shape;

/** The list settings 0.3.4 had, which it reads from the settings item. */
const LISTS_0_3_4: ReadonlySet<string> = new Set([
  'askAiDisabledActions',
  'deadLinksSuccessStatuses',
  'managerMenuActions',
  'privacyScannerSensitiveParams',
  'urlCleanerPreserveParams',
  'urlCleanerRemoveParams',
]);

/** The settings in `overrides` stored where they no longer belong, as `getSettingScope` says. */
const keysNowIn = (overrides: StoredOverrides, scope: 'lists' | 'synced') =>
  Object.keys(overrides).filter((key) => {
    if (!isSettingsKey(key)) return false;
    const now = getSettingScope(key);
    return scope === 'lists' ? now === 'lists' : now !== 'device';
  });

export const syncListShards: StorageMigration = {
  id: '2026-10-sync-list-shards',
  description:
    'List settings from the settings item (0.3.4) and the shared lists item, and the menus kept ' +
    'on each device, to an item per list',
  addedIn: '0.3.5',
  // Kept for at least three releases after the first one that carries it, and until the store
  // dashboards show no installs of 0.3.4 or older; move this on while they still do.
  removeAfter: '0.4.0',
  legacy: listsItemValue,
  recover(layers, legacy) {
    const shared = isPlainObject(legacy) ? legacy : {};
    const fromDevice = keysNowIn(layers.device, 'synced');
    const found: StoredOverrides = {};
    for (const [from, keys] of [
      [shared, keysNowIn(shared, 'lists')],
      [layers.sync, keysNowIn(layers.sync, 'lists')],
      [layers.device, fromDevice],
    ] as const) {
      for (const key of keys) if (!(key in found)) found[key] = from[key];
    }
    return { found, dropFromDevice: fromDevice };
  },
  // 0.3.4 reads its lists from the settings item: keep them there, current, for devices on it.
  keepsInSettingsItem: (key) => LISTS_0_3_4.has(key),
};
