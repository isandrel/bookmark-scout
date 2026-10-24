/**
 * Updating from 0.3.4, the last store release. What 0.3.4 stored must still be read: the
 * background removes every key the registry no longer lists (except the old items a registered
 * migration reads), a settings key that is gone or moved to another scope is dropped on read, and
 * a value the schema no longer accepts falls back to its default. Since 0.3.4, list settings moved
 * out of the settings item into an item each (`2026-10-sync-list-shards`), the right-click menu got
 * its own recent folder count (`2026-10-context-menu-recent-max`), and lists of shown ids mark the
 * ids the user hid (`lib/shown-ids.ts`), which 0.3.4's item menu did not.
 *
 * The fixtures below are frozen copies of what 0.3.4 stored and accepted (`git show v0.3.4:` of its
 * `storage/registry.ts`, `settings-schema.ts`, `config/settings/*.toml`, and `config/ui/
 * actions.toml`), so a rename, a moved setting, a narrowed schema, or a list that loses what the
 * user hid fails here instead of resetting users' data. 0.3.4 had no Smart Rules, covers, or
 * IndexedDB databases, so nothing of theirs is frozen here.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { aboutMeValue } from '@/lib/about-me-storage';
import { aiProviderConfigValue } from '@/lib/ai-provider-storage';
import { getAIServicesState, serviceRequiresApiKey } from '@/lib/ai-services-storage';
import { bookmarkMetadataValue, getTagVocabulary } from '@/lib/bookmark-metadata-storage';
import {
  BOOKMARK_TABLE_COLUMN_IDS,
  bookmarkTableLayoutValue,
  bookmarkTableViewValue,
  DEFAULT_BOOKMARK_TABLE_VIEW,
  resolveBookmarkTableView,
} from '@/lib/bookmark-table-view-storage';
import { dismissedNoticesValue } from '@/lib/dismissed-notices-storage';
import {
  customPromptBytes,
  getPromptLibrary,
  MAX_PROMPT_BYTES,
} from '@/lib/prompt-library-storage';
import { recentFoldersValue } from '@/lib/recent-folders-storage';
import { savedSearchesValue } from '@/lib/saved-searches-storage';
import { searchHistoryValue } from '@/lib/search-history-storage';
import {
  defaultSettings,
  getSettingScope,
  type Settings,
  settingsSchema,
} from '@/lib/settings-schema';
import {
  getSettings,
  registerStorageMigrations,
  settingsOverrideValues,
} from '@/lib/settings-storage';
import { registerStorageCleanup } from '@/lib/storage/cleanup';
import { MIGRATIONS } from '@/lib/storage/migrations';
import { isRegisteredKey, STORAGE_ITEMS, type StorageItem } from '@/lib/storage/registry';
import { ACTION_MENUS, customizeMenu } from '@/services/action-menus';
import { ACTIONS } from '@/services/actions';
import { providerRequiresApiKey } from '@/services/ai-models';

/** `STORAGE_ITEMS` as 0.3.4 shipped it (area, name, shape version, collection). */
const ITEMS_0_3_4 = {
  settings: { area: 'sync', name: 'settings', v: 1 },
  deviceSettings: { area: 'local', name: 'settings', v: 1 },
  tableView: { area: 'sync', name: 'manager.table-view', v: 1 },
  tableLayout: { area: 'local', name: 'manager.table-layout', v: 1 },
  promptIndex: { area: 'sync', name: 'prompts.index', v: 1 },
  aboutMe: { area: 'sync', name: 'ai.about-me', v: 1 },
  prompt: { area: 'sync', name: 'prompts.prompt', v: 1, collection: true },
  recentFolders: { area: 'local', name: 'folders.recent', v: 1 },
  aiCredentials: { area: 'local', name: 'ai.credentials', v: 1 },
  aiModelCache: { area: 'local', name: 'ai.model-cache', v: 1 },
  aiServices: { area: 'local', name: 'ai.services', v: 1 },
  aiActivity: { area: 'local', name: 'ai.activity-log', v: 1 },
  bookmarkMetadata: { area: 'local', name: 'bookmarks.metadata', v: 1 },
  searchHistory: { area: 'local', name: 'search.history', v: 1 },
  savedSearches: { area: 'local', name: 'search.saved', v: 1 },
  siteIcons: { area: 'local', name: 'site-icons.cache', v: 1 },
  dismissedNotices: { area: 'local', name: 'ui.dismissed-notices', v: 1 },
  quickSave: { area: 'session', name: 'quick-save.last', v: 1 },
  bookmarkHistory: { area: 'session', name: 'bookmarks.history', v: 1 },
  bookmarkClipboard: { area: 'session', name: 'manager.clipboard', v: 1 },
  actionPlans: { area: 'session', name: 'ai.action-plans', v: 1 },
  agentBridgeProfile: { area: 'local', name: 'agent-bridge.profile', v: 1 },
  agentBridgeStatus: { area: 'session', name: 'agent-bridge.status', v: 1 },
  agentApprovals: { area: 'session', name: 'agent-bridge.approvals', v: 1 },
} as const satisfies Record<string, Omit<StorageItem, 'backup'>>;

/** 0.3.4's choice settings and every option they offered. */
const CHOICES_0_3_4: Record<string, readonly (string | number)[]> = {
  language: ['auto', 'de', 'en', 'es', 'fr', 'ja', 'ko', 'pt_BR', 'zh_CN', 'zh_TW'],
  theme: ['system', 'light', 'dark'],
  faviconSize: [16, 24, 32],
  maxSearchResults: [10, 20, 50, 100],
  sortOrder: ['browser', 'date', 'alphabetical', 'folders'],
  linkOpenTarget: ['new_tab', 'background_tab', 'current_tab'],
  aiOutputLanguage: ['auto', 'page', 'de', 'en', 'es', 'fr', 'ja', 'ko', 'pt_BR', 'zh_CN', 'zh_TW'],
  contextMenuBookmarkNaming: ['link_text', 'page_title', 'link_url'],
  quickSaveFolderStrategy: ['best_match', 'last_used', 'fixed'],
  aiContextPackerDefaultScope: ['folder', 'all'],
  aiContextPackerOutputFormat: ['markdown', 'xml'],
  autoTaggingDefaultScope: ['folder'],
  autoTaggingTagStyle: ['kebab-case', 'snake_case', 'lowercase'],
  autoTaggingMergeMode: ['append', 'replace'],
  summarizerDefaultScope: ['folder'],
  summarizerMergeMode: ['append', 'replace'],
  reorganizationDefaultScope: ['folder', 'all'],
  duplicatesDefaultScope: ['all'],
  duplicatesMatchStrategy: ['exact_url', 'normalized_url', 'title_url', 'title_only'],
  duplicatesKeepRule: ['oldest', 'newest', 'first'],
  urlCleanerDefaultScope: ['folder', 'all'],
  deadLinksDefaultScope: ['folder', 'all'],
  metadataFetcherDefaultScope: ['folder', 'all'],
  siteIconsDefaultScope: ['folder', 'all'],
  privacyScannerDefaultScope: ['all'],
  statisticsDefaultScope: ['folder', 'all'],
  dataDefaultExportFormat: ['html', 'json', 'markdown', 'csv'],
};

/** 0.3.4's number settings: their lowest and highest value, and -1 where it meant no limit. */
const NUMBERS_0_3_4: Record<string, readonly number[]> = {
  searchDebounceMs: [50, 1000],
  folderMatchesMax: [1, 10],
  recentFoldersMax: [1, 10],
  popupWidth: [300, 800],
  popupHeight: [300, 600],
  truncateLength: [20, 200],
  toastDurationMs: [2000, 10000],
  aiMaxRecommendations: [1, 10],
  aiMaxCategories: [1, 100, -1],
  aiMinItemsPerFolder: [1, 100],
  aiMaxItemsPerFolder: [1, 500, -1],
  exportFilenameMaxLength: [10, 100],
  exportJsonIndentSize: [1, 8],
  exportHtmlIndentSpaces: [1, 8],
  exportMarkdownIndentSpaces: [1, 8],
  aiContextPackerMaxItems: [1, 2000],
  aiContextPackerMaxDepth: [1, 20],
  aiContextPackerExcerptLength: [40, 2000],
  autoTaggingMinTags: [1, 20],
  autoTaggingMaxTags: [1, 20],
  summarizerSummaryLength: [40, 1000],
  reorganizationMinConfidence: [0, 1],
  reorganizationBatchSize: [1, 1000],
  duplicatesMaxGroups: [1, 5000],
  deadLinksRequestTimeoutMs: [1000, 60000],
  deadLinksConcurrency: [1, 20],
  deadLinksRetryCount: [0, 10],
  metadataFetcherRequestTimeoutMs: [1000, 60000],
  metadataFetcherConcurrency: [1, 20],
  siteIconsPreferredSize: [16, 256],
  siteIconsMaxIconKb: [1, 512],
  siteIconsMaxCacheKb: [256, 8192],
  statisticsTopN: [1, 100],
};

/** 0.3.4's list settings: what each held, how many entries, and how long each could be. */
const LISTS_0_3_4: Record<
  string,
  { of: 'string' | 'number'; maxItems: number; maxLength?: number }
> = {
  askAiDisabledActions: { of: 'string', maxItems: 16, maxLength: 20 },
  agentBridgeDisabledActions: { of: 'string', maxItems: 16, maxLength: 20 },
  managerMenuActions: { of: 'string', maxItems: 16, maxLength: 20 },
  urlCleanerPreserveParams: { of: 'string', maxItems: 20, maxLength: 32 },
  urlCleanerRemoveParams: { of: 'string', maxItems: 20, maxLength: 32 },
  deadLinksSuccessStatuses: { of: 'number', maxItems: 20 },
  privacyScannerSensitiveParams: { of: 'string', maxItems: 20, maxLength: 32 },
};

/** 0.3.4's text settings and their longest value; `quickSaveFixedFolder` held a folder id. */
const TEXTS_0_3_4: Record<string, number> = { defaultNewFolderName: 100, exportFilenamePrefix: 50 };

/** 0.3.4's on/off settings. */
const SWITCHES_0_3_4 = `
  showFavicons browserIconCache expandFoldersOnSearch searchHistory folderMatchesEnabled
  folderMatchesTypos groupByFolders confirmBeforeDelete recentFoldersEnabled aiEnabled
  aiAutoTriggerOnOpen aiReadPageContent aiActivityRecording askAiWebSearch agentBridgeEnabled
  agentBridgeWrites agentBridgeRedactUrls exportIncludeDates exportIncludeUrls contextMenuEnabled
  aiContextPackerEnabled aiContextPackerIncludeFolderPath aiContextPackerIncludeDates
  aiContextPackerIncludeTags aiContextPackerIncludeSummaries autoTaggingEnabled
  autoTaggingDedupeTags autoTaggingSendExistingTags summarizerEnabled summarizerIncludeDomainHint
  reorganizationEnabled duplicatesEnabled duplicatesNormalizeWww duplicatesIgnoreProtocol
  duplicatesIgnoreTrailingSlash urlCleanerEnabled urlCleanerRemoveHash urlCleanerSortQueryParams
  urlCleanerDedupeQueryParams deadLinksEnabled deadLinksFollowRedirects metadataFetcherEnabled
  metadataFetcherOverwriteTitles metadataFetcherFetchDescriptions siteIconsEnabled
  privacyScannerEnabled privacyScannerScanTitles privacyScannerScanQueryParams
  privacyScannerScanFragments privacyScannerEmailDetection privacyScannerUuidDetection
  statisticsEnabled statisticsIncludeDomains statisticsIncludeFolders statisticsIncludeDuplicates
  statisticsIncludeProtocols statisticsIncludeDepthBreakdown dataShowExport dataShowImport
`
  .trim()
  .split(/\s+/);

/** Every settings key 0.3.4 knew (129). */
const SETTINGS_0_3_4 = [
  ...Object.keys(CHOICES_0_3_4),
  ...Object.keys(NUMBERS_0_3_4),
  ...Object.keys(LISTS_0_3_4),
  ...Object.keys(TEXTS_0_3_4),
  ...SWITCHES_0_3_4,
  'quickSaveFixedFolder',
];

/** The settings 0.3.4 kept on each device (`DEVICE_SETTING_KEYS`); every other one synced. */
const DEVICE_SETTINGS_0_3_4 = [
  'quickSaveFixedFolder',
  'siteIconsMaxCacheKb',
  'aiActivityRecording',
  'askAiWebSearch',
  'agentBridgeEnabled',
  'agentBridgeWrites',
  'agentBridgeRedactUrls',
  'agentBridgeDisabledActions',
] as const;

/** 0.3.4's action ids, which its lists of actions (menus, disabled for Ask AI or agents) name. */
const ACTIONS_0_3_4 = `
  searchBookmarks listFolders getBookmarks getCurrentPage readPage findDuplicates checkLinks
  suggestFolders showInFolder edit viewDetails cut copy paste copyFolderLink copyId openInNewTab
  openInNewWindow openInPrivateWindow delete sortByName addBookmark addFolder moveBookmarks
  renameBookmark deleteBookmarks createFolder saveBookmark undoChange proposeChanges applyChanges
  suggestActions
`
  .trim()
  .split(/\s+/);

/** 0.3.4's item menu (`[menus] item`), which its `managerMenuActions` arranged. */
const ITEM_MENU_0_3_4 = [
  ['showInFolder', 'edit', 'viewDetails'],
  ['cut', 'copy', 'paste', 'copyFolderLink', 'copyId'],
  ['openInNewTab', 'openInNewWindow', 'openInPrivateWindow'],
  ['delete'],
];

/** The manager table's saved columns in 0.3.4, in registry order. */
const COLUMNS_0_3_4 = [
  'select',
  'type',
  'id',
  'parentId',
  'folderPath',
  'url',
  'title',
  'dateAdded',
  'dateGroupModified',
  'unmodifiable',
  'actions',
];

/**
 * Settings a 0.3.4 user changed, as 0.3.4 stored them: every one in the settings item, its lists
 * too, and the item menu as the actions shown, in the user's order, with no marks (here Show in
 * Folder, View Details, Copy, Paste, and the other open actions are hidden).
 */
const SYNCED_OVERRIDES_0_3_4 = {
  language: 'ja',
  theme: 'dark',
  sortOrder: 'date',
  popupWidth: 500,
  recentFoldersMax: 8,
  aiEnabled: true,
  aiOutputLanguage: 'page',
  autoTaggingSendExistingTags: false,
  quickSaveFolderStrategy: 'fixed',
  deadLinksRequestTimeoutMs: 15000,
  dataDefaultExportFormat: 'markdown',
  askAiDisabledActions: ['checkLinks', 'deleteBookmarks'],
  managerMenuActions: ['delete', 'copyId', 'edit', 'cut', 'copyFolderLink', 'openInNewTab'],
  urlCleanerPreserveParams: ['id', 'q'],
  urlCleanerRemoveParams: ['utm_source', 'fbclid'],
  deadLinksSuccessStatuses: [200, 204, 301],
  privacyScannerSensitiveParams: ['secret', 'token'],
};

const DEVICE_OVERRIDES_0_3_4 = {
  quickSaveFixedFolder: '42',
  siteIconsMaxCacheKb: 2048,
  aiActivityRecording: true,
  askAiWebSearch: true,
  agentBridgeEnabled: true,
  agentBridgeDisabledActions: ['saveBookmark'],
} as const satisfies Partial<Record<(typeof DEVICE_SETTINGS_0_3_4)[number], unknown>>;

const SERVICES_0_3_4 = {
  services: [
    { id: 'openai', name: 'Work', provider: 'openai', model: 'gpt-5-mini', enabled: true },
    { id: 'anthropic', name: 'Anthropic', provider: 'anthropic', model: '', enabled: true },
    { id: 'ollama', name: 'Ollama (Local)', provider: 'ollama', model: 'llama3', enabled: true },
    { id: 'custom', name: 'Proxy', provider: 'custom', model: 'm', enabled: false },
    { id: 'togetherai', name: 'Together', provider: 'togetherai', model: '', enabled: true },
  ],
  defaultServiceId: 'anthropic',
};

const CREDENTIALS_0_3_4 = {
  openai: { apiKey: 'sk-synthetic' },
  custom: { baseUrl: 'http://localhost:8080/v1', extraHeaders: 'X-Synthetic: 1' },
};

/** The largest prompt 0.3.4 saved (`prompt_max_bytes`), as sync storage counts it. */
const PROMPT_MAX_BYTES_0_3_4 = 6_900;

/** A prompt near 0.3.4's largest, which is past this release's limit. */
const PROMPT_0_3_4 = {
  id: 'p1',
  task: 'auto_tagging',
  name: 'Short tags',
  system: `Use {{maxTags}} one-word tags at most. ${'Prefer nouns. '.repeat(480)}`,
  updatedAt: 1_760_000_000_000,
};

const ABOUT_ME_0_3_4 = "I'm a teacher; I save lesson material.";

/** The manager view as 0.3.4 wrote it: every column's visibility and place, and the sort. */
const TABLE_VIEW_0_3_4 = {
  columnVisibility: {
    type: false,
    id: false,
    parentId: false,
    folderPath: true,
    url: true,
    title: true,
    dateAdded: false,
    dateGroupModified: false,
    unmodifiable: false,
  },
  columnOrder: [
    'select',
    'url',
    'title',
    'folderPath',
    'dateAdded',
    'type',
    'id',
    'parentId',
    'dateGroupModified',
    'unmodifiable',
    'actions',
  ],
  sorting: [{ id: 'dateAdded', desc: true }],
  browserOrder: false,
};

const SAVED_SEARCHES_0_3_4 = [
  {
    id: 's1',
    name: 'Docs',
    createdAt: 1_760_000_000_000,
    query: { filters: { url: 'docs' }, sorting: [] },
  },
  {
    id: 's2',
    name: 'React on GitHub',
    createdAt: 1_760_000_000_001,
    query: {
      filters: { title: 'react hooks', type: ['link'], domain: ['github.com'] },
      sorting: [{ id: 'dateAdded', desc: true }],
      folderId: null,
    },
  },
];

const entry = (item: Omit<StorageItem, 'backup'>, data: unknown, id?: string) => ({
  [id === undefined ? item.name : `${item.name}/${id}`]: { v: item.v, data },
});

/** What a 0.3.4 profile holds, by item, plus keys from releases before 0.3.3. */
async function seed0_3_4Profile() {
  const items = ITEMS_0_3_4;
  await fakeBrowser.storage.sync.set({
    ...entry(items.settings, SYNCED_OVERRIDES_0_3_4),
    ...entry(items.tableView, TABLE_VIEW_0_3_4),
    ...entry(items.promptIndex, { ids: ['p1'], active: { auto_tagging: 'p1' } }),
    ...entry(items.prompt, PROMPT_0_3_4, 'p1'),
    ...entry(items.aboutMe, ABOUT_ME_0_3_4),
    // Before 0.3.3: removed on update.
    'bookmark-scout-settings': { theme: 'light' },
  });
  await fakeBrowser.storage.local.set({
    ...entry(items.deviceSettings, DEVICE_OVERRIDES_0_3_4),
    ...entry(items.tableLayout, { pageSize: 100, columnSizing: { url: 320 } }),
    ...entry(items.recentFolders, [{ id: '42', title: 'Reading', lastUsed: 1_760_000_000_000 }]),
    ...entry(items.aiCredentials, CREDENTIALS_0_3_4),
    ...entry(items.aiServices, SERVICES_0_3_4),
    ...entry(items.bookmarkMetadata, {
      '7': { tags: ['react', 'hooks'], summary: 'React hooks guide.' },
      '8': { tags: ['React'] },
    }),
    ...entry(items.searchHistory, ['react', 'news']),
    ...entry(items.savedSearches, SAVED_SEARCHES_0_3_4),
    ...entry(items.dismissedNotices, ['quick-save-shortcut', 'quick-save-bookmark-key']),
    ...entry(items.agentBridgeProfile, 'profile-synthetic'),
    'bookmark-scout-ai': { openai: { apiKey: 'old' } },
  });
}

/** The background after the update is installed: cleanup, then the migrations, as it starts. */
async function update() {
  registerStorageCleanup();
  registerStorageMigrations();
  await fakeBrowser.runtime.onInstalled.trigger({
    reason: 'update',
    previousVersion: '0.3.4',
  } as Browser.runtime.InstalledDetails);
}

const accepts = (key: string, value: unknown) =>
  settingsSchema.shape[key as keyof Settings].safeParse(value).success;

beforeEach(() => {
  fakeBrowser.reset();
  setLanguage('en');
});

describe('updating from 0.3.4', () => {
  it('still registers every item 0.3.4 stored, in its area, at its shape version or a later one', () => {
    const current = Object.values(STORAGE_ITEMS) as StorageItem[];
    for (const [id, old] of Object.entries(ITEMS_0_3_4)) {
      const item = current.find(
        (candidate) => candidate.area === old.area && candidate.name === old.name,
      );
      expect(item, id).toBeDefined();
      expect(Boolean(item?.collection), id).toBe('collection' in old && old.collection);
      // A higher `v` needs a migration from this one (storage-items and stored-value tests).
      expect(item?.v, id).toBeGreaterThanOrEqual(old.v);
      const key = 'collection' in old ? `${old.name}/p1` : old.name;
      expect(isRegisteredKey(old.area, key), id).toBe(true);
    }
  });

  it('keeps every 0.3.4 setting in the scope 0.3.4 stored it in, or moves it with a migration', () => {
    expect(SETTINGS_0_3_4).toHaveLength(129);
    const device = new Set<string>(DEVICE_SETTINGS_0_3_4);
    for (const key of SETTINGS_0_3_4) {
      expect(key in defaultSettings, key).toBe(true);
      const scope = getSettingScope(key as keyof Settings);
      if (device.has(key)) {
        expect(scope, key).toBe('device');
      } else if (scope === 'lists') {
        // 0.3.4 kept its lists in the settings item: a migration must carry them over and keep
        // them there, current, for devices still on 0.3.4.
        expect(
          MIGRATIONS.some((migration) => migration.keepsInSettingsItem?.(key as keyof Settings)),
          key,
        ).toBe(true);
      } else {
        expect(scope, key).toBe('sync');
      }
    }
  });

  it('accepts every value 0.3.4 could store', () => {
    for (const [key, options] of Object.entries(CHOICES_0_3_4)) {
      for (const option of options) expect(accepts(key, option), `${key}: ${option}`).toBe(true);
    }
    for (const [key, values] of Object.entries(NUMBERS_0_3_4)) {
      for (const value of values) expect(accepts(key, value), `${key}: ${value}`).toBe(true);
    }
    for (const [key, { of, maxItems, maxLength = 1 }] of Object.entries(LISTS_0_3_4)) {
      // The longest list of the longest entries; ids and parameter names are letters.
      const full = Array.from({ length: maxItems }, (_, index) =>
        of === 'number' ? 200 + index : String.fromCharCode(97 + index).repeat(maxLength),
      );
      expect(accepts(key, full), key).toBe(true);
    }
    for (const [key, maxLength] of Object.entries(TEXTS_0_3_4)) {
      expect(accepts(key, 'x'.repeat(maxLength)), key).toBe(true);
    }
    for (const key of SWITCHES_0_3_4) {
      expect(accepts(key, true) && accepts(key, false), key).toBe(true);
    }
    expect(accepts('quickSaveFixedFolder', '42')).toBe(true);
    // Lists of actions name actions that still exist.
    for (const id of ACTIONS_0_3_4) expect(id in ACTIONS, id).toBe(true);
  });

  it('keeps every 0.3.4 key and value through the update, and removes only older keys', async () => {
    await seed0_3_4Profile();
    const before = {
      sync: await fakeBrowser.storage.sync.get(),
      local: await fakeBrowser.storage.local.get(),
    };

    await update();

    await expect
      .poll(async () => Object.keys(await fakeBrowser.storage.local.get()))
      .not.toContain('bookmark-scout-ai');
    await expect
      .poll(async () => Object.keys(await fakeBrowser.storage.sync.get()))
      .not.toContain('bookmark-scout-settings');
    // 0.3.4 data is never rewritten or removed: a device still on 0.3.4 keeps reading it.
    const after = {
      sync: await fakeBrowser.storage.sync.get(),
      local: await fakeBrowser.storage.local.get(),
    };
    for (const area of ['sync', 'local'] as const) {
      for (const [key, value] of Object.entries(before[area])) {
        if (key.startsWith('bookmark-scout-')) continue;
        expect(after[area][key], `${area}:${key}`).toMatchObject(value as object);
      }
    }
    // The menu's count, added beside the settings 0.3.4 stored, which 0.3.4 ignores.
    expect(
      (after.sync[ITEMS_0_3_4.settings.name] as { data: Record<string, unknown> }).data,
    ).toEqual({ ...SYNCED_OVERRIDES_0_3_4, contextMenuRecentMax: 8 });
  });

  it.each([
    ['before the migrations run', async () => {}],
    ['after the update', update],
  ])(
    "reads 0.3.4's settings back %s, with defaults for the settings added since",
    async (_, run) => {
      await seed0_3_4Profile();
      await run();
      const settings = await getSettings();
      expect(settings).toMatchObject({ ...SYNCED_OVERRIDES_0_3_4, ...DEVICE_OVERRIDES_0_3_4 });
      // 0.3.4's one count for the popup and the right-click menu, now the menu's own.
      expect(settings.contextMenuRecentMax).toBe(SYNCED_OVERRIDES_0_3_4.recentFoldersMax);
      // Settings 0.3.4 left at their default follow this release's default.
      expect(settings.statisticsDefaultScope).toBe(defaultSettings.statisticsDefaultScope);
      expect(settings.managerOrganizeMenu).toEqual(defaultSettings.managerOrganizeMenu);
    },
  );

  it("moves 0.3.4's changed lists into an item each and keeps them in the settings item", async () => {
    await seed0_3_4Profile();
    await update();
    const lists = Object.fromEntries(
      Object.keys(LISTS_0_3_4)
        .filter((key) => key in SYNCED_OVERRIDES_0_3_4)
        .map((key) => [key, SYNCED_OVERRIDES_0_3_4[key as keyof typeof SYNCED_OVERRIDES_0_3_4]]),
    );
    await expect.poll(() => settingsOverrideValues.lists.get()).toEqual(lists);
    expect(await settingsOverrideValues.sync.get()).toMatchObject(lists);
    // The device list stays on this device.
    expect(await settingsOverrideValues.device.get()).toMatchObject({
      agentBridgeDisabledActions: ['saveBookmark'],
    });
  });

  it('keeps the item menu 0.3.4 stored: hidden actions stay hidden, actions added since show', async () => {
    await seed0_3_4Profile();
    await update();
    const sections = customizeMenu('item', (await getSettings()).managerMenuActions);
    const shown = sections.flat();
    const stored: readonly string[] = SYNCED_OVERRIDES_0_3_4.managerMenuActions;
    const menu0_3_4 = ITEM_MENU_0_3_4.flat();
    const addedSince = ACTION_MENUS.item.flat().filter((id) => !menu0_3_4.includes(id));
    // In the configured sections, in the user's order within each.
    expect(shown.filter((id) => stored.includes(id))).toEqual([
      'edit',
      'copyId',
      'cut',
      'copyFolderLink',
      'openInNewTab',
      'delete',
    ]);
    expect(addedSince.length).toBeGreaterThan(0);
    for (const id of addedSince) expect(shown, id).toContain(id);
    for (const id of menu0_3_4.filter((id) => !stored.includes(id))) {
      expect(shown, id).not.toContain(id);
    }
  });

  it("reads 0.3.4's AI services, credentials, About me, and custom prompts back", async () => {
    await seed0_3_4Profile();
    await update();
    const state = await getAIServicesState();
    expect(state.services.map((service) => service.id)).toEqual(
      SERVICES_0_3_4.services.map((service) => service.id),
    );
    expect(state.defaultServiceId).toBe('anthropic');
    // 0.3.4 stored no API key choice: each service follows its provider.
    for (const service of state.services) {
      expect(service.requiresApiKey, service.id).toBeUndefined();
      expect(serviceRequiresApiKey(service), service.id).toBe(
        providerRequiresApiKey(service.provider),
      );
    }
    expect(await aiProviderConfigValue.get()).toEqual(CREDENTIALS_0_3_4);
    expect(await aboutMeValue.get()).toBe(ABOUT_ME_0_3_4);
    // Kept although this release refuses to save one this large.
    expect(customPromptBytes(PROMPT_0_3_4)).toBeGreaterThan(MAX_PROMPT_BYTES);
    expect(customPromptBytes(PROMPT_0_3_4)).toBeLessThanOrEqual(PROMPT_MAX_BYTES_0_3_4);
    expect(await getPromptLibrary()).toEqual({
      prompts: [PROMPT_0_3_4],
      active: { auto_tagging: 'p1' },
    });
  });

  it("reads 0.3.4's manager view, saved searches, folders, tags, and notices back", async () => {
    await seed0_3_4Profile();
    await update();
    const view = resolveBookmarkTableView(await bookmarkTableViewValue.get(), {});
    expect(view.sorting).toEqual([{ id: 'dateAdded', desc: true }]);
    expect(view.columnVisibility).toMatchObject(TABLE_VIEW_0_3_4.columnVisibility);
    // 0.3.4's columns keep the user's order; columns added since join as a new view has them.
    expect(view.columnOrder.filter((id) => COLUMNS_0_3_4.includes(id))).toEqual(
      TABLE_VIEW_0_3_4.columnOrder,
    );
    expect([...view.columnOrder].sort()).toEqual([...BOOKMARK_TABLE_COLUMN_IDS].sort());
    for (const id of BOOKMARK_TABLE_COLUMN_IDS.filter(
      (column) => !COLUMNS_0_3_4.includes(column),
    )) {
      expect(view.columnVisibility[id], id).toBe(DEFAULT_BOOKMARK_TABLE_VIEW.columnVisibility[id]);
    }
    expect(resolveBookmarkTableView({}, await bookmarkTableLayoutValue.get())).toMatchObject({
      pageSize: 100,
      columnSizing: { url: 320 },
    });

    const searches = await savedSearchesValue.get();
    expect(searches.map((search) => search.name)).toEqual(['Docs', 'React on GitHub']);
    // Text saved before the search language reads as the phrase 0.3.4 matched.
    expect(searches[1]?.query).toMatchObject({
      filters: { title: '"react hooks"', type: ['link'], domain: ['github.com'] },
      sorting: [{ id: 'dateAdded', desc: true }],
      folderId: null,
    });
    expect(searches[1]?.query.syntaxVersion).toBeDefined();

    expect(await recentFoldersValue.get()).toEqual([
      { id: '42', title: 'Reading', lastUsed: 1_760_000_000_000 },
    ]);
    expect(await searchHistoryValue.get()).toEqual(['react', 'news']);
    expect(await dismissedNoticesValue.get()).toEqual([
      'quick-save-shortcut',
      'quick-save-bookmark-key',
    ]);
    // Tags from 0.3.4 feed {{existingTags}}, merged across spellings.
    expect(getTagVocabulary(await bookmarkMetadataValue.get())).toEqual(['react', 'hooks']);
  });
});
