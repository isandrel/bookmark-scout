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
 *
 * The manager's item menu (`managerMenuActions`) also changes form on the way: 0.3.4 stored only
 * the actions it shows, so an action it leaves out was hidden, while menus now mark each hidden
 * action and the first of each section (`encodeMenu` in `services/action-menus.ts`) and show any
 * action they do not name, which is one the menu gained since. An item menu with no marks is
 * written in the new form (`markItemMenu0_3_4`), against 0.3.4's own item menu, so the actions it
 * hid stay hidden and every action added after 0.3.4 shows with no list of them to keep. That
 * menu is a fact about the old release, like `LISTS_0_3_4`, so it is kept here rather than in
 * config/ui/actions.toml, and goes with this module.
 */
import {
  getSettingScope,
  MENU_SECTION_START,
  type Settings,
  settingsSchema,
} from '@/lib/settings-schema';
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

/** The manager's item menu by section, as 0.3.4 configured it (`[menus] item` in actions.toml). */
const ITEM_MENU_0_3_4: readonly (readonly string[])[] = [
  ['showInFolder', 'edit', 'viewDetails'],
  ['cut', 'copy', 'paste', 'copyFolderLink', 'copyId'],
  ['openInNewTab', 'openInNewWindow', 'openInPrivateWindow'],
  ['delete'],
];

/**
 * An item menu stored with no marks (0.3.4's form: the actions shown, in the user's order) in the
 * form menus are stored in now: 0.3.4's sections, each with the actions it shows in the user's
 * order and the first marked, then the rest of 0.3.4's menu marked hidden. Actions 0.3.4 did not
 * have are not named, so they show in their configured place. Anything else (a list already
 * marked, an empty one, which is the configured menu, or not a list) is returned as it is.
 */
export function markItemMenu0_3_4(stored: unknown): unknown {
  if (!Array.isArray(stored) || stored.length === 0) return stored;
  const ids = stored.filter((entry): entry is string => typeof entry === 'string');
  const marked = (entry: string) =>
    entry.startsWith(MENU_SECTION_START) || entry.startsWith(HIDDEN_ID_MARK);
  if (ids.length !== stored.length || ids.some(marked)) return stored;
  const order = new Map<string, number>();
  for (const [index, id] of ids.entries()) {
    if (!order.has(id)) order.set(id, index);
  }
  const position = (id: string) => order.get(id) ?? 0;
  const sections = ITEM_MENU_0_3_4.map((section) =>
    section.filter((id) => order.has(id)).sort((left, right) => position(left) - position(right)),
  ).filter((section) => section.length > 0);
  return [
    ...sections.flatMap((section) =>
      section.map((id, index) => (index === 0 ? `${MENU_SECTION_START}${id}` : id)),
    ),
    ...ITEM_MENU_0_3_4.flat()
      .filter((id) => !order.has(id))
      .map((id) => `${HIDDEN_ID_MARK}${id}`),
  ];
}

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
    if ('managerMenuActions' in found) {
      found.managerMenuActions = markItemMenu0_3_4(found.managerMenuActions);
    }
    return { found, dropFromDevice: fromDevice };
  },
  // 0.3.4 reads its lists from the settings item: keep them there, current, for devices on it.
  keepsInSettingsItem: (key) => LISTS_0_3_4.has(key),
};
