/**
 * Settings-to-behavior matrix. Every key in `src/lib/settings-schema.ts` needs an entry: the
 * runtime file that reads it and at least one test that changes it and asserts a different
 * result, or an explicit `unsupported` / `planned` status with the reason.
 * `tests/unit/settings-matrix.test.ts` enforces this; see `tests/settings-matrix.md`.
 */
import type { Settings } from '@/lib/settings-schema';

/** A test in `tests/<kind>/<file>` whose `test()` or `it()` title matches exactly. */
export type SettingTestRef = { kind: 'e2e' | 'unit'; file: string; title: string };

export type SettingCoverage =
  | {
      status: 'tested';
      /** Source file under `src/` that reads the setting and changes behavior with it. */
      consumer: string;
      tests: SettingTestRef[];
      note?: string;
    }
  | {
      status: 'unsupported' | 'planned';
      consumer?: string;
      reason: string;
      tests?: SettingTestRef[];
    };

const e2e = (file: string, title: string): SettingTestRef => ({ kind: 'e2e', file, title });
const unit = (file: string, title: string): SettingTestRef => ({ kind: 'unit', file, title });

const tested = (
  consumer: string,
  tests: SettingTestRef[],
  note?: string,
): SettingCoverage => ({ status: 'tested', consumer, tests, ...(note ? { note } : {}) });

const TOOL_TABLE = 'components/bookmarks/tools/tool-definitions.ts';
const TOOL_OPTIONS = 'services/tool-options.ts';
const DATA_TOOLS = 'components/bookmarks/tools/DataToolCards.tsx';
const TOOLS = 'components/bookmarks/ToolsSidebar.tsx';
const POPUP = 'components/page/PopupPage.tsx';

// Shared test references.
const SETTINGS_E2E = 'settings-behavior.spec.ts';
const SETTINGS_UNIT = 'settings-behavior.test.ts';
const toolFlags = e2e(
  'tool-settings.spec.ts',
  'enabled flags hide all tool cards and live settings restore selected cards',
);
const fixedScopes = e2e(
  'tool-settings.spec.ts',
  'unsupported and malformed saved scopes fall back without resetting other tool settings',
);
const popupAi = e2e(
  SETTINGS_E2E,
  '[mocked provider contract] popup AI model, auto-trigger, suggestion count, and title truncation follow settings',
);
const popupDisplay = e2e(
  'popup-tree-actions.spec.ts',
  'popup applies favicon, new folder name, and popup size settings',
);
const contextPack = e2e(
  'additional-workflows.spec.ts',
  'AI context pack exports the selected folder with AI disabled',
);
const contextPackLimits = e2e(
  SETTINGS_E2E,
  'AI context pack item, depth, and excerpt limits change the exported file',
);
const contextPackOptions = unit(
  'ai-context-pack.test.ts',
  'omits stored metadata when its export options are disabled',
);
const reportSettings = e2e(
  SETTINGS_E2E,
  'statistics top-N and privacy title scanning follow their settings',
);
const duplicateSettings = e2e(
  SETTINGS_E2E,
  'duplicate matching, group limit, and reorganization scope follow their settings',
);
const privacyUnit = unit(
  SETTINGS_UNIT,
  'scans titles, query params, and fragments only when enabled',
);
const privacyDetectors = unit(
  SETTINGS_UNIT,
  'uses the saved sensitive parameter list and detector toggles',
);
const statisticsSections = e2e(
  'tool-reports.spec.ts',
  'statistics hide sections that are turned off instead of showing zeros',
);
const exportPreferences = e2e(
  'tool-data-io.spec.ts',
  'export uses the selected folder and saved preferences, and neutralizes CSV formulas',
);
const exportUnit = unit('bookmark-export.test.ts', 'honors date, URL, and indentation preferences');
const urlCleanerE2e = e2e(
  'additional-workflows.spec.ts',
  'URL cleaner honors preserved parameters and fragment settings',
);
const metadataMerge = unit(
  'bookmark-metadata-storage.test.ts',
  'persists reviewed stubbed suggestions using merge settings',
);
const aiPrompts = unit(
  'ai-prompt-settings.test.ts',
  'puts the saved tag count and tag style into the auto-tagging prompt',
);
const reorgSafety = unit(
  'ai-reorganization.test.ts',
  'batches synthetic provider requests, filters low-confidence moves, and never mutates during preview',
);
const reorgLimits = unit(
  'ai-reorganization-settings.test.ts',
  'sends the saved category and folder-size limits to the provider',
);
const unlimitedPromptVariables = unit(
  'prompt-library.test.ts',
  'fills unlimited folder limits with a phrase, never -1, even in a custom prompt',
);
const recentFoldersMenu = unit(
  'context-menu.test.ts',
  'hides recent folders when the setting is disabled and restores them live',
);
const networkRealServer = e2e(
  'tool-network.spec.ts',
  'dead-link checker reaches a real non-CORS server, falls back to GET, reports redirects, and skips bookmarklets',
);

const SITE_ICONS_UNIT = 'site-icons.test.ts';
const siteIconsRefresh = e2e(
  'tool-site-icons.spec.ts',
  'site icon refresh dedupes origins, rejects oversized and non-image icons, and renders saved icons',
);

export const settingsMatrix: Record<keyof Settings, SettingCoverage> = {
  // Appearance
  language: tested('lib/settings-storage.ts', [
    e2e('bookmark-workflows.spec.ts', 'popup uses selected Japanese and Korean language settings'),
    unit(
      'context-menu.test.ts',
      'localizes menu titles with the selected language on the first build',
    ),
  ]),
  theme: tested('components/theme-provider.tsx', [
    e2e('options-settings.spec.ts', 'theme is one synced setting applied live in every open page'),
  ]),
  showFavicons: tested(POPUP, [popupDisplay]),
  browserIconCache: tested('hooks/use-site-icon.ts', [
    e2e('favicon-access.spec.ts', "Use the browser's icon cache shows cached icons only once it is on and allowed"),
    unit('site-icons.test.ts', 'prefers a saved icon over the browser icon cache, which is used only when allowed'),
  ], 'Chrome and Edge only; Options hides it in Firefox, which has no icon cache.'),
  faviconSize: tested(POPUP, [popupDisplay]),

  // Search
  searchDebounceMs: tested(POPUP, [
    e2e(SETTINGS_E2E, 'search delay setting controls when the popup filters results'),
  ]),
  maxSearchResults: tested(POPUP, [
    e2e('popup-tree.spec.ts', 'maxSearchResults limits visible matches and explains the limit'),
  ]),
  expandFoldersOnSearch: tested(POPUP, [
    e2e(
      'popup-tree.spec.ts',
      'expandFoldersOnSearch opens matching folders and ancestors only when enabled',
    ),
  ]),
  searchHistory: tested(POPUP, [
    e2e('popup-tree.spec.ts', 'search history records, reuses, clears, and respects the setting'),
  ]),
  folderMatchesEnabled: tested(POPUP, [e2e(
      'folder-match-save.spec.ts',
      'folder match settings hide the list, limit its length, and turn off typo matching',
    )]),
  folderMatchesMax: tested(POPUP, [e2e(
      'folder-match-save.spec.ts',
      'folder match settings hide the list, limit its length, and turn off typo matching',
    )]),
  folderMatchesTypos: tested(POPUP, [
    e2e(
      'folder-match-save.spec.ts',
      'folder match settings hide the list, limit its length, and turn off typo matching',
    ),
    unit('folder-match.test.ts', 'accepts one typo in longer words only'),
  ]),

  // Behavior
  sortOrder: tested(POPUP, [
    e2e('bookmark-workflows.spec.ts', 'updates popup ordering from synced settings and creates a folder'),
    e2e('sorting.spec.ts', 'applies an Options UI sorting change to an open bookmarks table'),
  ]),
  groupByFolders: tested(POPUP, [
    e2e('popup-tree.spec.ts', 'groupByFolders lists folders before links under date and alphabetical order'),
  ]),
  confirmBeforeDelete: tested('hooks/use-bookmark-deletion.tsx', [
    e2e(
      'bookmark-workflows.spec.ts',
      'confirms bookmark and folder deletion, and cancels without changing the tree',
    ),
    e2e(
      'bookmark-workflows.spec.ts',
      'deletes bookmarks and folders immediately when confirmation is disabled',
    ),
  ]),
  defaultNewFolderName: tested(POPUP, [popupDisplay]),
  recentFoldersMax: tested('services/context-menu.ts', [
    unit('context-menu.test.ts', 'shows recent folders limited by the recent-folders max setting'),
  ], 'The popup Recent Folders panel also reads it; only the context menu limit is asserted.'),
  recentFoldersEnabled: tested('services/context-menu.ts', [recentFoldersMenu],
    'The popup Recent Folders panel also reads it; only the context menu toggle is asserted.'),

  // Advanced
  popupWidth: tested('hooks/use-popup-size.ts', [popupDisplay]),
  popupHeight: tested('hooks/use-popup-size.ts', [popupDisplay]),
  truncateLength: tested(POPUP, [
    popupAi,
    unit('bookmark-deletion-flow.test.ts', 'quotes titles cut at the truncateLength setting'),
  ], 'Shortens the page title in the popup AI suggestions header and titles quoted in toasts.'),
  toastDurationMs: tested('components/ui/toaster.tsx', [
    e2e(SETTINGS_E2E, 'toast duration setting controls how long popup toasts stay open'),
  ], 'Undo toasts keep their own fixed undo window.'),

  // AI
  aiEnabled: tested(POPUP, [
    e2e('popup-search.spec.ts', 'theme toggle follows the system theme and AI button hides when AI is off'),
    e2e(
      'additional-workflows.spec.ts',
      '[mocked provider contract] provider-backed AI previews stop at opt-in without making external requests',
    ),
  ]),
  // Read by the AI services store, which derives the default service from them before any
  // service is saved.
  aiProvider: tested('lib/ai-services-storage.ts', [popupAi]),
  aiModel: tested('lib/ai-services-storage.ts', [popupAi]),
  aiMaxRecommendations: tested(POPUP, [
    popupAi,
    unit('ai-prompt-settings.test.ts', 'asks for and returns at most the saved number of folder recommendations'),
  ]),
  aiAutoTriggerOnOpen: tested(POPUP, [popupAi]),
  aiReadPageContent: tested(POPUP, [
    e2e('ai-page-reading.spec.ts', '[mocked provider contract] Read page content sends the page text as untrusted data'),
    e2e('ai-page-reading.spec.ts', '[mocked provider contract] without Read page content only the title and URL are sent'),
    e2e('ai-page-reading.spec.ts', 'Read page content turns on once website access is granted'),
    unit('page-reader.test.ts', 'leaves items unchanged when page reading is off or website access is missing'),
  ], 'Also read by Auto-Tagging and Content Summarizer in services/tool-options.ts.'),
  aiMaxCategories: tested('services/ai-reorganization.ts', [reorgLimits, unlimitedPromptVariables],
    'Prompt-level limit; provider compliance is not verified. Unlimited (-1) is left out of the rules and request, and its {{variable}} reads as a phrase.'),
  aiMinItemsPerFolder: tested('services/ai-reorganization.ts', [reorgLimits],
    'Prompt-level target; provider compliance is not verified.'),
  aiMaxItemsPerFolder: tested('services/ai-reorganization.ts', [reorgLimits, unlimitedPromptVariables],
    'Prompt-level limit; provider compliance is not verified. Unlimited (-1) is left out of the rules and request, and its {{variable}} reads as a phrase.'),

  // Export
  exportFilenamePrefix: tested(DATA_TOOLS, [exportPreferences]),
  exportFilenameMaxLength: tested(DATA_TOOLS, [
    unit('bookmark-export.test.ts', 'names files with the saved prefix and the local date'),
  ]),
  exportJsonIndentSize: tested(DATA_TOOLS, [exportUnit]),
  exportHtmlIndentSpaces: tested(DATA_TOOLS, [exportUnit]),
  exportMarkdownIndentSpaces: tested(DATA_TOOLS, [exportUnit]),
  exportIncludeDates: tested(DATA_TOOLS, [exportPreferences, exportUnit]),
  exportIncludeUrls: tested(DATA_TOOLS, [exportPreferences]),

  // Context menu
  contextMenuEnabled: tested('services/context-menu.ts', [
    unit('context-menu.test.ts', 'removes the menu when disabled, rejects stale clicks, and restores it when enabled'),
    unit('context-menu.test.ts', 'builds the menu only while its permission is granted and removes it on revoke'),
    e2e('permission-requests.spec.ts', 'turning on Context Menu asks for the permission, builds the menu, and a revoke turns it off'),
  ]),
  contextMenuBookmarkNaming: tested('services/context-menu.ts', [
    unit(SETTINGS_UNIT, 'names bookmarks from the page title or the link URL when selected'),
    unit('context-menu.test.ts', 'prefers Firefox linkText, then selection, then page title'),
  ]),

  // AI context packer
  aiContextPackerEnabled: tested(TOOL_TABLE, [toolFlags]),
  aiContextPackerDefaultScope: tested(TOOL_TABLE, [toolFlags]),
  aiContextPackerOutputFormat: tested(TOOL_OPTIONS, [
    unit('ai-context-pack.test.ts', 'escapes stored metadata in XML and omits missing fields'),
    contextPack,
  ]),
  aiContextPackerIncludeFolderPath: tested(TOOL_OPTIONS, [contextPack]),
  aiContextPackerIncludeDates: tested(TOOL_OPTIONS, [contextPackOptions]),
  aiContextPackerIncludeTags: tested(TOOL_OPTIONS, [contextPack, contextPackOptions]),
  aiContextPackerIncludeSummaries: tested(TOOL_OPTIONS, [contextPack, contextPackOptions]),
  aiContextPackerMaxItems: tested(TOOL_OPTIONS, [contextPackLimits]),
  aiContextPackerMaxDepth: tested(TOOL_OPTIONS, [contextPackLimits]),
  aiContextPackerExcerptLength: tested(TOOL_OPTIONS, [contextPackLimits]),

  // Auto-tagging
  autoTaggingEnabled: tested(TOOL_TABLE, [toolFlags]),
  autoTaggingDefaultScope: {
    status: 'unsupported',
    consumer: TOOL_TABLE,
    reason: 'Auto-tagging only runs on the current folder; the setting is fixed to "folder".',
    tests: [toolFlags],
  },
  autoTaggingMinTags: tested(TOOL_OPTIONS, [aiPrompts], 'Prompt-level; provider compliance is not verified.'),
  autoTaggingMaxTags: tested(TOOL_OPTIONS, [aiPrompts], 'Prompt-level; provider compliance is not verified.'),
  autoTaggingTagStyle: tested(TOOL_OPTIONS, [aiPrompts], 'Prompt-level; provider compliance is not verified.'),
  autoTaggingMergeMode: tested(TOOL_TABLE, [
    metadataMerge,
    unit('bookmark-metadata-storage.test.ts', 'appends tags without dedupe and replaces tags when requested'),
  ]),
  autoTaggingDedupeTags: tested(TOOL_TABLE, [
    unit('bookmark-metadata-storage.test.ts', 'appends tags without dedupe and replaces tags when requested'),
  ]),

  // Summarizer
  summarizerEnabled: tested(TOOL_TABLE, [toolFlags]),
  summarizerDefaultScope: {
    status: 'unsupported',
    consumer: TOOL_TABLE,
    reason: 'The summarizer only runs on the current folder; the setting is fixed to "folder".',
  },
  summarizerSummaryLength: tested(TOOL_OPTIONS, [
    unit('ai-prompt-settings.test.ts', 'puts the saved summary length into the summarizer prompt'),
  ], 'Prompt-level; provider compliance is not verified.'),
  summarizerIncludeDomainHint: tested(TOOL_OPTIONS, [
    unit('ai-bookmark-workflows.test.ts', 'includes optional domain context and filters unknown or duplicate summarizer results'),
  ]),
  summarizerMergeMode: tested(TOOL_TABLE, [
    metadataMerge,
    unit('bookmark-metadata-storage.test.ts', 'appends or replaces summaries according to the merge mode'),
  ]),

  // Reorganization
  reorganizationEnabled: tested(TOOL_TABLE, [toolFlags]),
  reorganizationDefaultScope: tested(TOOL_TABLE, [duplicateSettings]),
  reorganizationDryRunFirst: tested(TOOL_TABLE, [
    toolFlags,
    unit('ai-reorganization.test.ts', 'allows apply without preview confirmation when dry-run-first is disabled'),
  ]),
  reorganizationMinConfidence: tested(TOOL_OPTIONS, [reorgSafety]),
  reorganizationBatchSize: tested(TOOL_OPTIONS, [reorgSafety]),

  // Duplicates
  duplicatesEnabled: tested(TOOL_TABLE, [toolFlags]),
  duplicatesDefaultScope: {
    status: 'unsupported',
    consumer: TOOL_TABLE,
    reason: 'Duplicate scans always cover all bookmarks; the setting is fixed to "all".',
    tests: [fixedScopes],
  },
  duplicatesMatchStrategy: tested(TOOL_OPTIONS, [
    duplicateSettings,
    e2e('tool-data-safety.spec.ts', 'duplicate cleaner warns before title-only matching removes bookmarks with different URLs'),
  ]),
  duplicatesNormalizeWww: tested(TOOL_OPTIONS, [duplicateSettings]),
  duplicatesIgnoreProtocol: tested(TOOL_OPTIONS, [
    unit('bookmark-duplicates.test.ts', 'normalizes scheme and host case, default ports, www, protocol, and trailing slash'),
  ]),
  duplicatesIgnoreTrailingSlash: tested(TOOL_OPTIONS, [
    unit('bookmark-duplicates.test.ts', 'normalizes scheme and host case, default ports, www, protocol, and trailing slash'),
  ]),
  duplicatesKeepRule: tested(TOOL_OPTIONS, [
    e2e('tool-data-safety.spec.ts', 'duplicate cleaner keeps the newest item it labels Keep and ignores case, port, and query-order lookalikes'),
  ]),
  duplicatesMaxGroups: tested(TOOL_OPTIONS, [
    duplicateSettings,
    unit(SETTINGS_UNIT, 'duplicate scans return at most the saved number of groups'),
  ]),

  // URL cleaner
  urlCleanerEnabled: tested(TOOL_TABLE, [
    fixedScopes,
  ]),
  urlCleanerDefaultScope: tested(TOOL_TABLE, [
    e2e('tool-settings.spec.ts', 'tools sidebar headings, cards, scopes, and dialogs follow the selected language'),
  ]),
  urlCleanerRemoveHash: tested(TOOL_OPTIONS, [urlCleanerE2e]),
  urlCleanerSortQueryParams: tested(TOOL_OPTIONS, [
    e2e('tool-data-safety.spec.ts', 'URL cleaner keeps URL encoding, ignores pure reordering, and skips bookmarks edited after the preview'),
  ]),
  urlCleanerDedupeQueryParams: tested(TOOL_OPTIONS, [
    urlCleanerE2e,
    unit('url-cleaner.test.ts', 'dedupes identical key/value pairs only'),
  ]),
  urlCleanerPreserveParams: tested(TOOL_OPTIONS, [urlCleanerE2e]),
  urlCleanerRemoveParams: tested(TOOL_OPTIONS, [urlCleanerE2e]),

  // Dead links
  deadLinksEnabled: tested(TOOL_TABLE, [toolFlags]),
  deadLinksDefaultScope: tested(TOOL_TABLE, [networkRealServer]),
  deadLinksRequestTimeoutMs: tested(TOOL_OPTIONS, [
    unit(SETTINGS_UNIT, 'dead-link scans time out after the saved request timeout'),
  ]),
  deadLinksConcurrency: tested(TOOL_OPTIONS, [
    unit(SETTINGS_UNIT, 'dead-link scans never exceed the saved concurrency'),
  ]),
  deadLinksRetryCount: tested(TOOL_OPTIONS, [networkRealServer]),
  deadLinksFollowRedirects: tested(TOOL_OPTIONS, [networkRealServer]),
  deadLinksSuccessStatuses: tested(TOOL_OPTIONS, [
    unit(SETTINGS_UNIT, 'dead-link scans treat only the saved success statuses as reachable'),
  ]),

  // Metadata fetcher
  metadataFetcherEnabled: tested(TOOL_TABLE, [toolFlags]),
  metadataFetcherDefaultScope: tested(TOOL_TABLE, [
    e2e('tool-network.spec.ts', 'metadata fetcher decodes Shift_JIS, ignores error pages, and applies only reviewed titles'),
  ]),
  metadataFetcherOverwriteTitles: tested(TOOL_OPTIONS, [
    e2e('tool-network.spec.ts', 'metadata fetcher decodes Shift_JIS, ignores error pages, and applies only reviewed titles'),
  ]),
  metadataFetcherFetchDescriptions: tested(TOOL_OPTIONS, [
    e2e('additional-workflows.spec.ts', 'metadata fetcher previews mocked page metadata without changing bookmarks'),
  ]),
  metadataFetcherRequestTimeoutMs: tested(TOOL_OPTIONS, [
    e2e('tool-network.spec.ts', 'metadata fetcher times out on a stalled body, skips non-HTML files, and leaves Running'),
  ]),
  metadataFetcherConcurrency: tested(TOOL_OPTIONS, [
    unit(SETTINGS_UNIT, 'metadata fetches never exceed the saved concurrency'),
  ]),

  // Site icons (requests reuse the Metadata Fetcher's timeout and concurrency)
  siteIconsEnabled: tested(TOOL_TABLE, [toolFlags]),
  siteIconsDefaultScope: tested(TOOL_TABLE, [siteIconsRefresh]),
  siteIconsPreferredSize: tested(TOOL_OPTIONS, [
    unit(SITE_ICONS_UNIT, 'prefers the declared icon closest to the saved preferred size'),
  ]),
  siteIconsMaxIconKb: tested(TOOL_OPTIONS, [
    siteIconsRefresh,
    unit(SITE_ICONS_UNIT, 'rejects icon files over the saved byte cap and files that are not images'),
  ]),
  siteIconsMaxCacheKb: tested(TOOL_TABLE, [
    unit(SITE_ICONS_UNIT, 'evicts the oldest icons to stay within the saved cache limit'),
  ]),

  // Privacy scanner
  privacyScannerEnabled: tested(TOOL_TABLE, [toolFlags]),
  privacyScannerDefaultScope: {
    status: 'unsupported',
    consumer: TOOL_TABLE,
    reason: 'Privacy scans always cover all bookmarks; the setting is fixed to "all".',
  },
  privacyScannerScanTitles: tested(TOOL_OPTIONS, [reportSettings, privacyUnit]),
  privacyScannerScanQueryParams: tested(TOOL_OPTIONS, [privacyUnit]),
  privacyScannerScanFragments: tested(TOOL_OPTIONS, [privacyUnit]),
  privacyScannerSensitiveParams: tested(TOOL_OPTIONS, [privacyDetectors]),
  privacyScannerEmailDetection: tested(TOOL_OPTIONS, [privacyDetectors]),
  privacyScannerUuidDetection: tested(TOOL_OPTIONS, [privacyDetectors]),

  // Statistics
  statisticsEnabled: tested(TOOL_TABLE, [toolFlags]),
  statisticsDefaultScope: tested(TOOL_TABLE, [toolFlags]),
  statisticsIncludeDomains: tested(TOOL_OPTIONS, [statisticsSections]),
  statisticsIncludeFolders: tested(TOOL_OPTIONS, [statisticsSections]),
  statisticsIncludeDuplicates: tested(TOOL_OPTIONS, [statisticsSections]),
  statisticsIncludeProtocols: tested(TOOL_OPTIONS, [statisticsSections]),
  statisticsIncludeDepthBreakdown: tested(TOOL_OPTIONS, [
    e2e('tool-reports.spec.ts', 'statistics count folders inside the scope and show the depth breakdown only when enabled'),
  ]),
  statisticsTopN: tested(TOOL_OPTIONS, [
    reportSettings,
    unit(SETTINGS_UNIT, 'statistics top lists hold at most the saved top-N entries'),
  ]),

  // Data tools
  dataShowExport: tested(TOOLS, [
    e2e('tool-data-io.spec.ts', 'export and import cards follow their visibility settings without changing bookmarks'),
  ]),
  dataShowImport: tested(TOOLS, [
    e2e('tool-data-io.spec.ts', 'export and import cards follow their visibility settings without changing bookmarks'),
  ]),
  dataDefaultExportFormat: tested(DATA_TOOLS, [exportPreferences]),
};
