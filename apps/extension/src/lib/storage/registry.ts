/**
 * Every item the extension keeps in extension storage, in one registry. A key that is not listed
 * here is removed when the extension is installed or updated (`storage/cleanup.ts`), so anything
 * stored must be listed first.
 *
 * Keys are `<area>:<domain>.<name>` in kebab-case (`local:search.history`); a collection stores one
 * item per id under `<area>:<domain>.<name>/<id>`. Each value is stored as `{ v, data }`, where `v`
 * is the shape version below: a device that finds a newer `v` than it knows reads the item but
 * never writes it, so an older release cannot overwrite data a newer one synced. Raising `v` needs
 * a migration step from the previous version in the item's `defineStoredValue` call; a unit test
 * fails without one.
 *
 * Which area:
 * - `sync`: small values the user expects on every device (the browser vendor syncs them when the
 *   user has browser sync on). 8,192 bytes per item and 102,400 in total, so large or per-device
 *   data never goes here, and neither do credentials.
 * - `local`: this device only; credentials, caches, logs, and anything naming local bookmark ids.
 * - `session`: in memory until the browser closes.
 *
 * `backup` says what the backup file does with the item: `include` it, `exclude` it (device-bound,
 * rebuildable, or short-lived), or `secret` (credentials: never synced, never in any file).
 *
 * No WXT auto-imports here: end-to-end tests import this file in Node to name the keys they seed.
 */

export type StorageAreaName = 'local' | 'sync' | 'session';

export type BackupPolicy = 'include' | 'exclude' | 'secret';

export type StorageItem = {
  readonly area: StorageAreaName;
  /** `<domain>.<name>` in kebab-case. */
  readonly name: string;
  /** Version of the stored shape; starts at 1. */
  readonly v: number;
  readonly backup: BackupPolicy;
  /** One stored item per id, under `<name>/<id>`. */
  readonly collection?: boolean;
};

/** A WXT storage key, `<area>:<name>`. */
export type StorageKey = `${StorageAreaName}:${string}`;

export const STORAGE_ITEMS = {
  /**
   * Synced: the settings the user changed (only those that differ from the default), so their
   * choices follow them to every device. Device settings (`DEVICE_SETTING_KEYS`) are left out.
   */
  settings: { area: 'sync', name: 'settings', v: 1, backup: 'include' },
  /** Local: the changed settings that belong to this device only (`DEVICE_SETTING_KEYS`). */
  deviceSettings: { area: 'local', name: 'settings', v: 1, backup: 'include' },
  /** Synced: the manager table's columns (shown, order) and sort, so the layout follows the user. */
  tableView: { area: 'sync', name: 'manager.table-view', v: 1, backup: 'include' },
  /** Local: the manager table's column widths and page size, which suit one screen. */
  tableLayout: { area: 'local', name: 'manager.table-layout', v: 1, backup: 'exclude' },
  /** Synced: which custom prompts exist and which one each task uses. */
  promptIndex: { area: 'sync', name: 'prompts.index', v: 1, backup: 'include' },
  /** Synced: one item per custom prompt, so each stays under the 8,192-byte item quota. */
  prompt: { area: 'sync', name: 'prompts.prompt', v: 1, backup: 'include', collection: true },
  /** Local: names folder ids, which differ on every device. */
  recentFolders: { area: 'local', name: 'folders.recent', v: 1, backup: 'exclude' },
  /** Local and secret: API keys, endpoints, and extra headers per AI service. */
  aiCredentials: { area: 'local', name: 'ai.credentials', v: 1, backup: 'secret' },
  /** Local: model lists fetched from each provider; fetched again when missing. */
  aiModelCache: { area: 'local', name: 'ai.model-cache', v: 1, backup: 'exclude' },
  /** Local: named AI services sit next to their credentials, which never sync. */
  aiServices: { area: 'local', name: 'ai.services', v: 1, backup: 'include' },
  /** Local: the opt-in AI request log holds bookmark titles and URLs. */
  aiActivity: { area: 'local', name: 'ai.activity-log', v: 1, backup: 'exclude' },
  /** Local: tags and summaries are keyed by bookmark id, which differs on every device. */
  bookmarkMetadata: { area: 'local', name: 'bookmarks.metadata', v: 1, backup: 'exclude' },
  /** Local: queries can reveal bookmark contents. */
  searchHistory: { area: 'local', name: 'search.history', v: 1, backup: 'exclude' },
  /** Local: filters can reveal bookmark contents and name folder ids local to this device. */
  savedSearches: { area: 'local', name: 'search.saved', v: 1, backup: 'include' },
  /** Local: downloaded icons are large and can be downloaded again. */
  siteIcons: { area: 'local', name: 'site-icons.cache', v: 1, backup: 'exclude' },
  /**
   * Local: the notices the user dismissed, such as the popup's missing quick save shortcut line.
   * They describe this browser profile (shortcuts are not synced), so they stay on this device.
   */
  dismissedNotices: { area: 'local', name: 'ui.dismissed-notices', v: 1, backup: 'exclude' },
  /** Session: the last quick save, for Undo and Move; gone when the browser closes. */
  quickSave: { area: 'session', name: 'quick-save.last', v: 1, backup: 'exclude' },
  /**
   * Session: the manager's undo and redo history of bookmark changes. It names bookmark ids,
   * which belong to this browser, and like Chrome's own it ends when the browser closes.
   */
  bookmarkHistory: { area: 'session', name: 'bookmarks.history', v: 1, backup: 'exclude' },
  /**
   * Session: bookmark changes an AI agent proposed, waiting for the user's approval. They name
   * bookmark ids and expire within the hour, so they stay in memory until the browser closes.
   */
  actionPlans: { area: 'session', name: 'ai.action-plans', v: 1, backup: 'exclude' },
  /**
   * Local: the random id that tells local AI agents which browser profile they reach through the
   * bridge. It names this profile only, so it never syncs or goes into a backup.
   */
  agentBridgeProfile: { area: 'local', name: 'agent-bridge.profile', v: 1, backup: 'exclude' },
  /** Session: whether the bridge for local AI agents is running, for Options to show. */
  agentBridgeStatus: { area: 'session', name: 'agent-bridge.status', v: 1, backup: 'exclude' },
} as const satisfies Record<string, StorageItem>;

export type StorageItemId = keyof typeof STORAGE_ITEMS;

/**
 * Settings stored for this device only (`STORAGE_ITEMS.deviceSettings`); every other setting syncs
 * (`STORAGE_ITEMS.settings`).
 */
export const DEVICE_SETTING_KEYS = [
  /** A bookmark folder id, which differs on every device. */
  'quickSaveFixedFolder',
  /** How much of this device's local storage saved site icons may take. */
  'siteIconsMaxCacheKb',
  /** Recording AI requests is a debugging choice for one device; the log stays on it too. */
  'aiActivityRecording',
  /** Whether Ask AI adds the provider's web search, chosen where the chat runs. */
  'askAiWebSearch',
  /** Access for local AI agents: the bridge program is installed on one computer. */
  'agentBridgeEnabled',
  'agentBridgeRedactUrls',
  'agentBridgeDisabledActions',
] as const;

export type DeviceSettingKey = (typeof DEVICE_SETTING_KEYS)[number];

/** The storage key of `item`, or of the entry `id` in a collection. */
export function storageKey(item: StorageItem, id?: string): StorageKey {
  if (Boolean(item.collection) !== (id !== undefined)) {
    throw new Error(`${item.name}: ${item.collection ? 'needs' : 'takes no'} item id`);
  }
  return `${item.area}:${item.name}${id === undefined ? '' : `/${id}`}`;
}

/** The key's name within its area, as `browser.storage[area]` sees it. */
export function storageAreaKey(item: StorageItem, id?: string): string {
  return storageKey(item, id).slice(item.area.length + 1);
}

/** Whether `key` (a name within `area`) belongs to a registered item. */
export function isRegisteredKey(area: StorageAreaName, key: string): boolean {
  return Object.values(STORAGE_ITEMS).some((item: StorageItem) => {
    if (item.area !== area) return false;
    return item.collection
      ? key.startsWith(`${item.name}/`) && key.length > item.name.length + 1
      : key === item.name;
  });
}

/**
 * next-themes' page `localStorage` cache of the theme, which avoids a flash on first paint. Page
 * storage, not extension storage, so the cleanup never sees it.
 */
export const THEME_CACHE_STORAGE_KEY = 'theme';
