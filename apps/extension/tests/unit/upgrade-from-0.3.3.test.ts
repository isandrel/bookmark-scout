/**
 * Updating from 0.3.3, the last store release. Data from releases before 0.3.3 is removed on
 * update, but what 0.3.3 stored must still be read: the background removes every key the registry
 * no longer lists, a settings key that is gone or moved to the other scope is dropped on read, and
 * a value the schema no longer accepts falls back to its default. The fixtures below are frozen
 * copies of what 0.3.3 stored (its `STORAGE_ITEMS`, settings keys, and device settings), so a
 * rename, a moved setting, or a narrowed schema fails here instead of resetting users' data.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { aiProviderConfigValue } from '@/lib/ai-provider-storage';
import { getAIServicesState } from '@/lib/ai-services-storage';
import { bookmarkMetadataValue, getTagVocabulary } from '@/lib/bookmark-metadata-storage';
import {
  bookmarkTableLayoutValue,
  bookmarkTableViewValue,
} from '@/lib/bookmark-table-view-storage';
import { dismissedNoticesValue } from '@/lib/dismissed-notices-storage';
import { getPromptLibrary } from '@/lib/prompt-library-storage';
import { recentFoldersValue } from '@/lib/recent-folders-storage';
import { savedSearchesValue } from '@/lib/saved-searches-storage';
import { searchHistoryValue } from '@/lib/search-history-storage';
import { defaultSettings, getSettingScope, type Settings } from '@/lib/settings-schema';
import { getSettings } from '@/lib/settings-storage';
import { registerStorageCleanup } from '@/lib/storage/cleanup';
import { isRegisteredKey, STORAGE_ITEMS, type StorageItem } from '@/lib/storage/registry';
import { ACTIONS } from '@/services/actions';

/** `STORAGE_ITEMS` as 0.3.3 shipped it (area, name, shape version, collection). */
const ITEMS_0_3_3 = {
  settings: { area: 'sync', name: 'settings', v: 1 },
  deviceSettings: { area: 'local', name: 'settings', v: 1 },
  tableView: { area: 'sync', name: 'manager.table-view', v: 1 },
  tableLayout: { area: 'local', name: 'manager.table-layout', v: 1 },
  promptIndex: { area: 'sync', name: 'prompts.index', v: 1 },
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

/** Every settings key 0.3.3 knew, in its declaration order. */
const SETTINGS_0_3_3 = `
  language theme showFavicons browserIconCache faviconSize searchDebounceMs maxSearchResults
  expandFoldersOnSearch searchHistory folderMatchesEnabled folderMatchesMax folderMatchesTypos
  sortOrder groupByFolders linkOpenTarget confirmBeforeDelete defaultNewFolderName
  recentFoldersMax recentFoldersEnabled popupWidth popupHeight truncateLength toastDurationMs
  aiEnabled aiMaxRecommendations aiAutoTriggerOnOpen aiReadPageContent aiActivityRecording
  askAiWebSearch askAiDisabledActions agentBridgeEnabled agentBridgeWrites
  agentBridgeRedactUrls agentBridgeDisabledActions managerMenuActions aiMaxCategories
  aiMinItemsPerFolder aiMaxItemsPerFolder exportFilenamePrefix exportFilenameMaxLength
  exportJsonIndentSize exportHtmlIndentSpaces exportMarkdownIndentSpaces exportIncludeDates
  exportIncludeUrls contextMenuEnabled contextMenuBookmarkNaming quickSaveFolderStrategy
  quickSaveFixedFolder aiContextPackerEnabled aiContextPackerDefaultScope
  aiContextPackerOutputFormat aiContextPackerIncludeFolderPath aiContextPackerIncludeDates
  aiContextPackerIncludeTags aiContextPackerIncludeSummaries aiContextPackerMaxItems
  aiContextPackerMaxDepth aiContextPackerExcerptLength autoTaggingEnabled
  autoTaggingDefaultScope autoTaggingMinTags autoTaggingMaxTags autoTaggingTagStyle
  autoTaggingMergeMode autoTaggingDedupeTags summarizerEnabled summarizerDefaultScope
  summarizerSummaryLength summarizerIncludeDomainHint summarizerMergeMode
  reorganizationEnabled reorganizationDefaultScope reorganizationMinConfidence
  reorganizationBatchSize duplicatesEnabled duplicatesDefaultScope duplicatesMatchStrategy
  duplicatesNormalizeWww duplicatesIgnoreProtocol duplicatesIgnoreTrailingSlash
  duplicatesKeepRule duplicatesMaxGroups urlCleanerEnabled urlCleanerDefaultScope
  urlCleanerRemoveHash urlCleanerSortQueryParams urlCleanerDedupeQueryParams
  urlCleanerPreserveParams urlCleanerRemoveParams deadLinksEnabled deadLinksDefaultScope
  deadLinksRequestTimeoutMs deadLinksConcurrency deadLinksRetryCount deadLinksFollowRedirects
  deadLinksSuccessStatuses metadataFetcherEnabled metadataFetcherDefaultScope
  metadataFetcherOverwriteTitles metadataFetcherFetchDescriptions
  metadataFetcherRequestTimeoutMs metadataFetcherConcurrency siteIconsEnabled
  siteIconsDefaultScope siteIconsPreferredSize siteIconsMaxIconKb siteIconsMaxCacheKb
  privacyScannerEnabled privacyScannerDefaultScope privacyScannerScanTitles
  privacyScannerScanQueryParams privacyScannerScanFragments privacyScannerSensitiveParams
  privacyScannerEmailDetection privacyScannerUuidDetection statisticsEnabled
  statisticsDefaultScope statisticsIncludeDomains statisticsIncludeFolders
  statisticsIncludeDuplicates statisticsIncludeProtocols statisticsIncludeDepthBreakdown
  statisticsTopN dataShowExport dataShowImport dataDefaultExportFormat
`
  .trim()
  .split(/\s+/);

/** The settings 0.3.3 kept on each device (`DEVICE_SETTING_KEYS`); every other one synced. */
const DEVICE_SETTINGS_0_3_3 = [
  'quickSaveFixedFolder',
  'siteIconsMaxCacheKb',
  'aiActivityRecording',
  'askAiWebSearch',
  'agentBridgeEnabled',
  'agentBridgeWrites',
  'agentBridgeRedactUrls',
  'agentBridgeDisabledActions',
] as const;

/**
 * Settings a 0.3.3 user changed, as 0.3.3 stored them: values that were valid then, including
 * 0.3.3 defaults that are no longer the default (Date sort, a tool on the open folder).
 */
const SYNCED_OVERRIDES_0_3_3 = {
  language: 'ja',
  theme: 'dark',
  sortOrder: 'date',
  linkOpenTarget: 'background_tab',
  popupWidth: 500,
  toastDurationMs: 8000,
  defaultNewFolderName: 'Inbox',
  aiEnabled: true,
  aiMaxRecommendations: 3,
  askAiDisabledActions: ['checkLinks', 'deleteBookmarks'],
  managerMenuActions: ['edit', 'copy', 'delete'],
  quickSaveFolderStrategy: 'fixed',
  autoTaggingTagStyle: 'lowercase',
  autoTaggingMaxTags: 8,
  deadLinksDefaultScope: 'folder',
  deadLinksRequestTimeoutMs: 15000,
  deadLinksSuccessStatuses: [200, 204, 301],
  urlCleanerRemoveParams: ['utm_source', 'fbclid'],
  dataDefaultExportFormat: 'markdown',
};

const DEVICE_OVERRIDES_0_3_3 = {
  quickSaveFixedFolder: '42',
  siteIconsMaxCacheKb: 2048,
  aiActivityRecording: true,
  agentBridgeEnabled: true,
  agentBridgeDisabledActions: ['saveBookmark'],
} as const satisfies Partial<Record<(typeof DEVICE_SETTINGS_0_3_3)[number], unknown>>;

const SERVICES_0_3_3 = {
  services: [
    { id: 'openai', name: 'Work', provider: 'openai', model: 'gpt-5-mini', enabled: true },
    { id: 'anthropic', name: 'Anthropic', provider: 'anthropic', model: '', enabled: true },
    { id: 'ollama', name: 'Ollama (Local)', provider: 'ollama', model: 'llama3', enabled: true },
    { id: 'custom', name: 'Proxy', provider: 'custom', model: 'm', enabled: false },
    { id: 'togetherai', name: 'Together', provider: 'togetherai', model: '', enabled: true },
  ],
  defaultServiceId: 'anthropic',
};

const PROMPT_0_3_3 = {
  id: 'p1',
  task: 'auto_tagging',
  name: 'Short tags',
  system: 'Use {{maxTags}} one-word tags at most.',
  updatedAt: 1_760_000_000_000,
};

/** What a 0.3.3 profile holds, by item, plus keys from releases before it. */
async function seed0_3_3Profile() {
  const entry = (item: Omit<StorageItem, 'backup'>, data: unknown, id?: string) => ({
    [id === undefined ? item.name : `${item.name}/${id}`]: { v: item.v, data },
  });
  const items = ITEMS_0_3_3;
  await fakeBrowser.storage.sync.set({
    ...entry(items.settings, SYNCED_OVERRIDES_0_3_3),
    ...entry(items.tableView, {
      columnVisibility: { id: false, parentId: false, dateGroupModified: false, type: false },
      columnOrder: ['select', 'title', 'url', 'type', 'id', 'parentId', 'folderPath'],
      sorting: [{ id: 'title', desc: false }],
      browserOrder: false,
    }),
    ...entry(items.promptIndex, { ids: ['p1'], active: { auto_tagging: 'p1' } }),
    ...entry(items.prompt, PROMPT_0_3_3, 'p1'),
    // Before 0.3.3: removed on update.
    'bookmark-scout-settings': { theme: 'light' },
  });
  await fakeBrowser.storage.local.set({
    ...entry(items.deviceSettings, DEVICE_OVERRIDES_0_3_3),
    ...entry(items.tableLayout, { pageSize: 20, columnSizing: { url: 320 } }),
    ...entry(items.recentFolders, [{ id: '42', title: 'Reading', lastUsed: 1_760_000_000_000 }]),
    ...entry(items.aiCredentials, {
      openai: { apiKey: 'sk-synthetic' },
      custom: { baseUrl: 'http://localhost:8080/v1', extraHeaders: 'X-Synthetic: 1' },
    }),
    ...entry(items.aiServices, SERVICES_0_3_3),
    ...entry(items.bookmarkMetadata, {
      '7': { tags: ['react', 'hooks'], summary: 'React hooks guide.' },
      '8': { tags: ['React'] },
    }),
    ...entry(items.searchHistory, ['react', 'news']),
    ...entry(items.savedSearches, [
      {
        id: 's1',
        name: 'Docs',
        createdAt: 1_760_000_000_000,
        query: { filters: { url: 'docs' }, sorting: [] },
      },
    ]),
    ...entry(items.dismissedNotices, ['quick-save-bookmark-key']),
    ...entry(items.agentBridgeProfile, 'profile-synthetic'),
    'bookmark-scout-ai': { openai: { apiKey: 'old' } },
  });
}

beforeEach(() => {
  fakeBrowser.reset();
  setLanguage('en');
});

describe('updating from 0.3.3', () => {
  it('still registers every item 0.3.3 stored, in its area, at its shape version or a later one', () => {
    const current = Object.values(STORAGE_ITEMS) as StorageItem[];
    for (const [id, old] of Object.entries(ITEMS_0_3_3)) {
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

  it('keeps every 0.3.3 setting, in the scope 0.3.3 stored it in', () => {
    const device = new Set<string>(DEVICE_SETTINGS_0_3_3);
    for (const key of SETTINGS_0_3_3) {
      expect(key in defaultSettings, key).toBe(true);
      // A setting moved to another scope would be ignored where 0.3.3 stored it, except lists,
      // which are still read from the settings item until the next save moves them.
      const scope = getSettingScope(key as keyof Settings);
      expect(scope === 'lists' ? 'sync' : scope, key).toBe(device.has(key) ? 'device' : 'sync');
    }
  });

  it('removes only data from before 0.3.3 when the update is installed', async () => {
    registerStorageCleanup();
    await seed0_3_3Profile();
    const before = {
      sync: Object.keys(await fakeBrowser.storage.sync.get()).sort(),
      local: Object.keys(await fakeBrowser.storage.local.get()).sort(),
    };

    await fakeBrowser.runtime.onInstalled.trigger({
      reason: 'update',
      previousVersion: '0.3.3',
    } as Browser.runtime.InstalledDetails);

    await expect
      .poll(async () => Object.keys(await fakeBrowser.storage.local.get()).sort())
      .toEqual(before.local.filter((key) => key !== 'bookmark-scout-ai'));
    expect(Object.keys(await fakeBrowser.storage.sync.get()).sort()).toEqual(
      before.sync.filter((key) => key !== 'bookmark-scout-settings'),
    );
  });

  it("reads 0.3.3's settings back, with defaults for the settings added since", async () => {
    await seed0_3_3Profile();
    const settings = await getSettings();
    expect(settings).toMatchObject({ ...SYNCED_OVERRIDES_0_3_3, ...DEVICE_OVERRIDES_0_3_3 });
    expect(settings.aiOutputLanguage).toBe(defaultSettings.aiOutputLanguage);
    expect(settings.autoTaggingSendExistingTags).toBe(defaultSettings.autoTaggingSendExistingTags);
    // Settings 0.3.3 left at their default follow this release's default.
    expect(settings.statisticsDefaultScope).toBe(defaultSettings.statisticsDefaultScope);
    // Action ids the user turned off or arranged still name actions.
    for (const id of [
      ...SYNCED_OVERRIDES_0_3_3.askAiDisabledActions,
      ...SYNCED_OVERRIDES_0_3_3.managerMenuActions,
      ...DEVICE_OVERRIDES_0_3_3.agentBridgeDisabledActions,
    ]) {
      expect(id in ACTIONS, id).toBe(true);
    }
  });

  it("reads 0.3.3's AI services, credentials, and custom prompts back", async () => {
    await seed0_3_3Profile();
    const state = await getAIServicesState();
    expect(state.services.map((service) => service.id)).toEqual(
      SERVICES_0_3_3.services.map((service) => service.id),
    );
    expect(state.defaultServiceId).toBe('anthropic');
    expect(await aiProviderConfigValue.get()).toEqual({
      openai: { apiKey: 'sk-synthetic' },
      custom: { baseUrl: 'http://localhost:8080/v1', extraHeaders: 'X-Synthetic: 1' },
    });
    expect(await getPromptLibrary()).toEqual({
      prompts: [PROMPT_0_3_3],
      active: { auto_tagging: 'p1' },
    });
  });

  it("reads 0.3.3's manager view, saved searches, folders, tags, and notices back", async () => {
    await seed0_3_3Profile();
    const view = await bookmarkTableViewValue.get();
    expect(view.sorting).toEqual([{ id: 'title', desc: false }]);
    // The Cover column, newer than 0.3.3, joins hidden right after the checkbox.
    expect(view.columnOrder.slice(0, 8)).toEqual([
      'select',
      'cover',
      'title',
      'url',
      'type',
      'id',
      'parentId',
      'folderPath',
    ]);
    expect(view.columnVisibility).toMatchObject({
      type: false,
      id: false,
      parentId: false,
      cover: false,
    });
    expect(await bookmarkTableLayoutValue.get()).toEqual({
      pageSize: 20,
      columnSizing: { url: 320 },
    });
    expect((await savedSearchesValue.get()).map((search) => search.name)).toEqual(['Docs']);
    expect(await recentFoldersValue.get()).toEqual([
      { id: '42', title: 'Reading', lastUsed: 1_760_000_000_000 },
    ]);
    expect(await searchHistoryValue.get()).toEqual(['react', 'news']);
    expect(await dismissedNoticesValue.get()).toEqual(['quick-save-bookmark-key']);
    // Tags from 0.3.3 feed {{existingTags}}, merged across spellings.
    expect(getTagVocabulary(await bookmarkMetadataValue.get())).toEqual(['react', 'hooks']);
  });
});
