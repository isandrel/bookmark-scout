/**
 * Every item the extension keeps in extension storage, in one registry. A key that is not listed
 * here is removed when the extension is installed or updated (`storage/cleanup.ts`), so anything
 * stored must be listed first. An old item a registered migration still reads
 * (`storage/migrations/`) is kept until that migration is removed.
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
 *   user has browser sync on). Limited by `SYNC_QUOTA` (8,192 bytes per item, 102,400 in total),
 *   so large or per-device data never goes here, and neither do credentials.
 * - `local`: this device only; credentials, caches, logs, and anything naming local bookmark ids.
 * - `session`: in memory until the browser closes.
 *
 * `backup` names the part of the backup file the item belongs to, an id from `[[categories]]` in
 * `config/data/backup.toml` (`lib/backup-config.ts`), or `exclude` for what no backup holds
 * (device-bound, rebuildable, or short-lived). A part marked `secret` there holds credentials: never
 * synced, and in a file only when the user selects that part and confirms its warning.
 * `tests/unit/backup-categories.test.ts` fails on a name that is not a part.
 *
 * No WXT auto-imports here: end-to-end tests import this file in Node to name the keys they seed.
 */

export type StorageAreaName = 'local' | 'sync' | 'session';

/**
 * Chrome's limits on `storage.sync`, a protocol constant rather than a tunable: a write past them
 * fails. Firefox's are the same or looser. Tests size every synced item against them.
 * [chrome.storage.sync](https://developer.chrome.com/docs/extensions/reference/api/storage#property-sync)
 */
export const SYNC_QUOTA = {
  /** `QUOTA_BYTES_PER_ITEM`: one item's key plus its value's JSON, in UTF-8 bytes. */
  bytesPerItem: 8_192,
  /** `QUOTA_BYTES`: every item together, measured the same way. */
  bytes: 102_400,
  /** `MAX_ITEMS`. */
  maxItems: 512,
  /** `MAX_WRITE_OPERATIONS_PER_MINUTE`: each `set`, `remove`, or `clear` call is one. */
  writesPerMinute: 120,
  /** `MAX_WRITE_OPERATIONS_PER_HOUR`. */
  writesPerHour: 1_800,
} as const;

/**
 * A backup part's id (`config/data/backup.toml`), or `exclude`. A plain string here, since the
 * parts come from config, which this file cannot read; a unit test checks each one.
 */
export type BackupPolicy = 'exclude' | (string & {});

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
  settings: { area: 'sync', name: 'settings', v: 1, backup: 'settings' },
  /**
   * Synced: each changed setting that is a list (parameter names, menu actions, status codes) in
   * an item of its own, under its setting key, so every list has the whole per-item quota and
   * changing one writes only its item. Which settings are lists comes from the settings schema
   * (`SETTING_KEYS_BY_SCOPE.lists`), so a new list setting gets its item with no entry here.
   */
  settingsList: {
    area: 'sync',
    name: 'settings.list',
    v: 1,
    backup: 'settings',
    collection: true,
  },
  /**
   * Local: the ids of the storage migrations (`storage/migrations/`) that have run on this
   * device, so each runs once here; device state, so not backed up.
   */
  storageMigrations: { area: 'local', name: 'storage.migrations', v: 1, backup: 'exclude' },
  /** Local: the changed settings that belong to this device only (`DEVICE_SETTING_KEYS`). */
  deviceSettings: { area: 'local', name: 'settings', v: 1, backup: 'deviceSettings' },
  /** Synced: the manager table's columns (shown, order) and sort, so the layout follows the user. */
  tableView: { area: 'sync', name: 'manager.table-view', v: 1, backup: 'views' },
  /** Local: the manager table's column widths and page size, which suit one screen. */
  tableLayout: { area: 'local', name: 'manager.table-layout', v: 1, backup: 'exclude' },
  /**
   * Local: the folder the manager showed last, by id, for Start Folder's "Last opened folder";
   * written only while that is chosen. Folder ids differ on every device.
   */
  managerLastFolder: { area: 'local', name: 'manager.last-folder', v: 1, backup: 'exclude' },
  /**
   * Local: the manager's sidebar widths the user dragged, and whether each sidebar was open last
   * (kept while Sidebars on Open is "Remember"), which suit one screen.
   */
  managerSidebars: { area: 'local', name: 'manager.sidebars', v: 1, backup: 'exclude' },
  /** Synced: which custom prompts exist and which one each task uses. */
  promptIndex: { area: 'sync', name: 'prompts.index', v: 1, backup: 'prompts' },
  /**
   * Synced: "About me" for AI prompts, which the user writes once for every device. Its own item:
   * at its length limit it does not fit in the settings item's share of the 8,192-byte quota.
   */
  aboutMe: { area: 'sync', name: 'ai.about-me', v: 1, backup: 'prompts' },
  /** Synced: one item per custom prompt, so each stays under the 8,192-byte item quota. */
  prompt: { area: 'sync', name: 'prompts.prompt', v: 1, backup: 'prompts', collection: true },
  /** Local: names folder ids, which differ on every device. */
  recentFolders: { area: 'local', name: 'folders.recent', v: 1, backup: 'exclude' },
  /**
   * Local: API keys, endpoints, and extra headers per AI service. Credentials, so never synced;
   * their own backup part, which the user must select and confirm. The endpoints (Base URL and
   * the provider's extra fields) go with the AI services part (`services/backup-categories.lazy.ts`).
   */
  aiCredentials: { area: 'local', name: 'ai.credentials', v: 1, backup: 'aiServiceKeys' },
  /** Local: model lists fetched from each provider; fetched again when missing. */
  aiModelCache: { area: 'local', name: 'ai.model-cache', v: 1, backup: 'exclude' },
  /** Local: named AI services sit next to their credentials, which never sync. */
  aiServices: { area: 'local', name: 'ai.services', v: 1, backup: 'aiServices' },
  /** Local: the opt-in AI request log holds bookmark titles and URLs. */
  aiActivity: { area: 'local', name: 'ai.activity-log', v: 1, backup: 'exclude' },
  /** Local: tags and summaries are keyed by bookmark id, which differs on every device. */
  bookmarkMetadata: { area: 'local', name: 'bookmarks.metadata', v: 1, backup: 'exclude' },
  /**
   * Local: Ask AI's past chats hold what the user asked, bookmark titles and addresses, and page text
   * the model read; never synced or backed up, and cleared when Keep Chats is turned off.
   */
  askAiChats: { area: 'local', name: 'ai.chats', v: 1, backup: 'exclude' },
  /** Local: queries can reveal bookmark contents. */
  searchHistory: { area: 'local', name: 'search.history', v: 1, backup: 'exclude' },
  /** Local: filters can reveal bookmark contents and name folder ids local to this device. */
  savedSearches: { area: 'local', name: 'search.saved', v: 1, backup: 'views' },
  /** Local: rules name folder ids local to this device, and their searches can reveal bookmarks. */
  bookmarkRules: { area: 'local', name: 'rules.list', v: 1, backup: 'rules' },
  /**
   * Local: what Smart Rules changed lately: bookmarks tagged or moved on their own (Tag New
   * Bookmarks, Move New Bookmarks), with the tags or the folders and their titles, and the
   * bookmarks reviewed runs tagged, by id, for the list and Undo in Settings; bookmark and folder
   * ids belong to this device, and the titles can be private. The name is from when it held only
   * taggings, kept so the list survives the update.
   */
  ruleAutoLog: { area: 'local', name: 'rules.auto-tag-log', v: 1, backup: 'exclude' },
  /**
   * Local: how each Smart Rule did in its last reviewed run (when, and how many bookmarks it
   * tagged, moved, or left), and the bookmarks that run found two rules disagreeing on, with
   * their ids, titles, and folders, for Settings; ids belong to this device and titles can be
   * private. Rebuilt by the next run, so not backed up.
   */
  ruleRunStatus: { area: 'local', name: 'rules.run-status', v: 1, backup: 'exclude' },
  /** Local: downloaded icons are large and can be downloaded again. */
  siteIcons: { area: 'local', name: 'site-icons.cache', v: 1, backup: 'exclude' },
  /**
   * Local: the notices the user dismissed, such as the popup's missing quick save shortcut line.
   * They describe this browser profile (shortcuts are not synced), so they stay on this device.
   */
  dismissedNotices: { area: 'local', name: 'ui.dismissed-notices', v: 1, backup: 'exclude' },
  /**
   * Local: the folders open in the popup and side panel when they last closed, for Expand on Open's
   * "As last left". Folder ids belong to this browser, so it stays on this device, and it is
   * written only while that choice is on.
   */
  popupExpandedFolders: {
    area: 'local',
    name: 'ui.popup-expanded-folders',
    v: 1,
    backup: 'exclude',
  },
  /** Session: the last quick save, for Undo and Move; gone when the browser closes. */
  quickSave: { area: 'session', name: 'quick-save.last', v: 1, backup: 'exclude' },
  /**
   * Session: the manager's undo and redo history of bookmark changes. It names bookmark ids,
   * which belong to this browser, and like Chrome's own it ends when the browser closes.
   */
  bookmarkHistory: { area: 'session', name: 'bookmarks.history', v: 1, backup: 'exclude' },
  /**
   * Session: what the manager's Cut or Copy holds for Paste (bookmark ids, cut or copy, and
   * when), so another manager tab or a reload can paste it. Ids belong to this browser, and like
   * the system clipboard it is gone when the browser closes.
   */
  bookmarkClipboard: { area: 'session', name: 'manager.clipboard', v: 1, backup: 'exclude' },
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
  /**
   * Session: changes local AI agents asked to make, waiting for the user's approval in the
   * approval window (the action, its input, and the agent's name); each waits a few minutes.
   */
  agentApprovals: { area: 'session', name: 'agent-bridge.approvals', v: 1, backup: 'exclude' },
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
  /** How much of this device's storage bookmark covers may take. */
  'coversMaxCacheMb',
  /**
   * Taking covers without a click: Capture Covers While Browsing needs access to all pages, which
   * is granted per browser, and the pictures of both stay on this device, so each is chosen here.
   */
  'coversBrowseCapture',
  'coversBrowseCapturePrivate',
  'quickSaveCover',
  /** Smart Rules are kept on this device, so tagging new bookmarks with them is set here too. */
  'bookmarkRulesAutoTag',
  /** And so is moving new bookmarks with them, to folders that exist on this device only. */
  'bookmarkRulesAutoMove',
  /** And which new bookmarks both act on, as part of the same choice. */
  'bookmarkRulesNewFrom',
  /** Recording AI requests is a debugging choice for one device; the log stays on it too. */
  'aiActivityRecording',
  /** Whether Ask AI adds the provider's web search, chosen where the chat runs. */
  'askAiWebSearch',
  /** Access for local AI agents: the bridge program is installed on one computer. */
  'agentBridgeEnabled',
  'agentBridgeWrites',
  'agentBridgeRedactUrls',
  'agentBridgeDisabledActions',
  /** The History is kept on each device, and so is whether it records changes from elsewhere. */
  'historyRecordOutsideChanges',
  /**
   * How the Tools sidebar lists its tools, which suits one screen's size, and with it the tab it
   * opens on and the tools it shows.
   */
  'toolsSidebarLayout',
  'toolsSidebarDefaultTab',
  'toolsSidebarOrder',
  /** Whether the manager shows a list or cards, which suits one screen's size too. */
  'managerViewMode',
  /** The manager's start folder: the last one, or a chosen one, is a folder of this device. */
  'managerStartFolder',
  'managerStartFolderId',
  /** Whether the manager's sidebars reopen as they were, which suits one screen. */
  'managerSidebarsStart',
  /** What a new table view, a card, and the preview show suit one screen, as Manager View does. */
  'managerDefaultColumns',
  'managerDefaultPageSize',
  'managerDefaultSort',
  'managerCardFields',
  'managerCardSize',
  'cardMaxTags',
  'cardSummaryLines',
  'previewFields',
  /**
   * The popup and side panel's layout suits one screen as well: their parts and toolbar buttons,
   * row height, and the hover card's details. (Their row menus, like every menu, sync.)
   */
  'popupSections',
  'popupToolbarButtons',
  'treeDensity',
  'hoverCardFields',
  /** Keys typed on this device's keyboard, with its platform's modifiers (Cmd or Ctrl). */
  'pageShortcutOverrides',
  /**
   * The parts Back up settings selects, remembered from the last backup made here: what to back
   * up differs per computer (covers and this device's settings, for one).
   */
  'backupExportCategories',
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
 * The registered item a full key (`<area>:<name>`, or `<area>:<name>/<id>` in a collection) belongs
 * to, with the entry id for a collection; undefined for a key no item lists.
 */
export function findStorageItem(key: string): { id: StorageItemId; entryId?: string } | undefined {
  for (const [id, item] of Object.entries(STORAGE_ITEMS) as [StorageItemId, StorageItem][]) {
    const prefix = `${item.area}:${item.name}`;
    if (!item.collection && key === prefix) return { id };
    if (item.collection && key.startsWith(`${prefix}/`) && key.length > prefix.length + 1) {
      return { id, entryId: key.slice(prefix.length + 1) };
    }
  }
  return undefined;
}

/**
 * next-themes' page `localStorage` cache of the theme, which avoids a flash on first paint. Page
 * storage, not extension storage, so the cleanup never sees it.
 */
export const THEME_CACHE_STORAGE_KEY = 'theme';

/**
 * IndexedDB databases the extension keeps, next to the storage items above, for data too large
 * or too structured for extension storage. Device-local like `local` and never synced. `backup`
 * is the backup part, as for stored items; only covers are one, which a backup holds when the
 * user selects them (`services/cover-backup.lazy.ts`). The install and update
 * cleanup does not touch them; each owner versions its own schema (IndexedDB's `version` and an
 * upgrade step) and prunes by its own retention.
 */
export const INDEXED_DATABASES = {
  /**
   * The Bookmark Audit History (`lib/bookmark-audit-store.ts`): records of bookmark changes and
   * their item rows, kept for `config/bookmarks/audit.toml`'s retention.
   */
  bookmarkAudit: { name: 'bookmark-scout-audit', backup: 'exclude' },
  /**
   * Background jobs (`lib/job-store.ts`): long tools' progress and results, so they survive
   * the page that started them and a browser restart; finished ones kept for
   * `config/jobs/scheduler.toml`'s retention.
   */
  backgroundJobs: { name: 'bookmark-scout-jobs', backup: 'exclude' },
  /**
   * Page text (`lib/page-text-store.ts`): the readable text of the pages the user indexed, for
   * search; derived from the pages and downloaded again when needed, so never backed up.
   */
  pageText: { name: 'bookmark-scout-page-text', backup: 'exclude' },
  /**
   * Covers (`lib/cover-store.ts`): small copies of the preview images of the pages the user
   * fetched covers for, or pictures of the tab, shown on the manager's cards. In the backup file,
   * by address, when the user selects them (`services/cover-backup.lazy.ts`): pictures the user
   * chose cannot be fetched again.
   */
  covers: { name: 'bookmark-scout-covers', backup: 'covers' },
  /**
   * Undo import (`lib/backup-undo-store.ts`): a copy of what the parts a restore changed held
   * before it (settings, prompts, AI services and, when they were restored, their API keys, and
   * the covers it replaced), so Undo import can put them back; one at a time, removed after
   * `config/data/backup.toml`'s `[undo]` time or by the next restore. Never in a backup itself.
   */
  backupUndo: { name: 'bookmark-scout-backup-undo', backup: 'exclude' },
} as const satisfies Record<string, { name: string; backup: BackupPolicy }>;
