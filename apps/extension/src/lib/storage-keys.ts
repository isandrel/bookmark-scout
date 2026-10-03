/**
 * Every key the extension stores data under, in one registry. Existing installs already hold data
 * under these exact strings, so a key never changes once released; renaming one silently drops user
 * data. Values are WXT storage keys (`<area>:<key>`); `tests/unit/storage-items.test.ts` checks that
 * every storage key literal in src/ is listed here.
 */
export const STORAGE_KEYS = {
  settings: 'sync:bookmark-scout-settings',
  tableView: 'sync:bookmark-scout-table-view',
  promptLibraryIndex: 'sync:bookmark-scout-prompts',
  /** Prefix of one sync item per custom prompt; the prompt id follows. */
  promptPrefix: 'sync:bookmark-scout-prompt-',
  recentFolders: 'local:bookmark-scout-recent-folders',
  /** Per-provider credentials and endpoint overrides; never synced. */
  aiProviders: 'local:bookmark-scout-ai',
  aiModelLists: 'local:bookmark-scout-ai-models',
  aiServices: 'local:bookmark-scout-ai-services',
  aiActivity: 'local:bookmark-scout-ai-activity',
  aiActivityRecording: 'local:bookmark-scout-ai-activity-recording',
  askAiWebSearch: 'local:bookmark-scout-ask-ai-web-search',
  bookmarkMetadata: 'local:bookmark-scout-bookmark-metadata',
  searchHistory: 'local:bookmark-scout-search-history',
  savedSearches: 'local:bookmark-scout-saved-searches',
  siteIcons: 'local:bookmark-scout-site-icons',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** next-themes' page localStorage cache of the theme, which avoids a flash on first paint. */
export const THEME_CACHE_STORAGE_KEY = 'bookmark-scout-theme';
