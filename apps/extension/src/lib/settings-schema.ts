/**
 * Settings schema using Zod.
 * Reads default values from TOML config file - no hardcoded defaults in code.
 */

import { z } from 'zod';
import { parse } from 'smol-toml';

// Import TOML config as raw string (bundled at build time)
import settingsToml from '../../config/settings.default.toml?raw';

/**
 * Parse TOML config to get default values.
 */
interface TomlConfig {
  appearance: {
    language: string;
    theme: string;
    show_favicons: boolean;
    favicon_size: number;
  };
  search: {
    debounce_ms: number;
    max_results: number;
    expand_folders_on_search: boolean;
    search_history: boolean;
  };
  behavior: {
    sort_order: string;
    group_by_folders: boolean;
    confirm_before_delete: boolean;
    default_new_folder_name: string;
  };
  advanced: {
    popup_width: number;
    popup_height: number;
    truncate_length: number;
  };
}

const config = parse(settingsToml) as TomlConfig;

/**
 * Theme options
 */
export const themeSchema = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof themeSchema>;

/**
 * Sort order options
 */
export const sortOrderSchema = z.enum(['date', 'alphabetical', 'folders']);
export type SortOrder = z.infer<typeof sortOrderSchema>;

/**
 * Language options
 */
export const languageSchema = z.enum(['auto', 'en', 'ja', 'ko']);
export type Language = z.infer<typeof languageSchema>;

/**
 * Favicon size options
 */
export const faviconSizeSchema = z.union([z.literal(16), z.literal(24), z.literal(32)]);
export type FaviconSize = z.infer<typeof faviconSizeSchema>;

/**
 * Maximum search results options
 */
export const maxSearchResultsSchema = z.union([
  z.literal(10),
  z.literal(20),
  z.literal(50),
  z.literal(100),
]);
export type MaxSearchResults = z.infer<typeof maxSearchResultsSchema>;

/**
 * Complete settings schema with all configurable options.
 * Default values are read from config/settings.default.toml - NOT hardcoded.
 */
export const settingsSchema = z.object({
  // Appearance - defaults from config.appearance
  language: languageSchema.default(config.appearance.language as Language),
  theme: themeSchema.default(config.appearance.theme as Theme),
  showFavicons: z.boolean().default(config.appearance.show_favicons),
  faviconSize: faviconSizeSchema.default(config.appearance.favicon_size as FaviconSize),

  // Search - defaults from config.search
  searchDebounceMs: z.number().min(50).max(1000).default(config.search.debounce_ms),
  maxSearchResults: maxSearchResultsSchema.default(config.search.max_results as MaxSearchResults),
  expandFoldersOnSearch: z.boolean().default(config.search.expand_folders_on_search),
  searchHistory: z.boolean().default(config.search.search_history),

  // Behavior - defaults from config.behavior
  sortOrder: sortOrderSchema.default(config.behavior.sort_order as SortOrder),
  groupByFolders: z.boolean().default(config.behavior.group_by_folders),
  confirmBeforeDelete: z.boolean().default(config.behavior.confirm_before_delete),
  defaultNewFolderName: z.string().min(1).max(100).default(config.behavior.default_new_folder_name),

  // Advanced - defaults from config.advanced
  popupWidth: z.number().min(300).max(800).default(config.advanced.popup_width),
  popupHeight: z.number().min(300).max(1000).default(config.advanced.popup_height),
  truncateLength: z.number().min(20).max(200).default(config.advanced.truncate_length),
});

export type Settings = z.infer<typeof settingsSchema>;

/**
 * Default settings values - generated from TOML config.
 */
export const defaultSettings: Settings = settingsSchema.parse({});

/**
 * Settings categories for UI grouping.
 */
export const settingsCategories = {
  appearance: {
    label: 'Appearance',
    description: 'Customize how bookmarks look',
    fields: ['language', 'theme', 'showFavicons', 'faviconSize'] as const,
  },
  search: {
    label: 'Search',
    description: 'Configure search behavior',
    fields: ['searchDebounceMs', 'maxSearchResults', 'expandFoldersOnSearch', 'searchHistory'] as const,
  },
  behavior: {
    label: 'Behavior',
    description: 'Control extension behavior',
    fields: ['sortOrder', 'groupByFolders', 'confirmBeforeDelete', 'defaultNewFolderName'] as const,
  },
  advanced: {
    label: 'Advanced',
    description: 'Advanced settings',
    fields: ['popupWidth', 'popupHeight', 'truncateLength'] as const,
  },
} as const;

/**
 * Field metadata for rendering forms.
 * Labels and descriptions loaded from config comments would be ideal,
 * but kept here for type safety and internationalization support.
 */
export const settingsFieldMeta: Record<
  keyof Settings,
  {
    label: string;
    description: string;
    type: 'switch' | 'select' | 'number' | 'text';
    options?: { value: string | number; label: string }[];
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
  }
> = {
  // Appearance
  language: {
    label: 'Language',
    description: 'Choose extension language',
    type: 'select',
    options: [
      { value: 'auto', label: 'Auto (Browser)' },
      { value: 'en', label: 'English' },
      { value: 'ja', label: '日本語' },
      { value: 'ko', label: '한국어' },
    ],
  },
  theme: {
    label: 'Theme',
    description: 'Choose your preferred color scheme',
    type: 'select',
    options: [
      { value: 'system', label: 'System' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ],
  },
  showFavicons: {
    label: 'Show Favicons',
    description: 'Display website icons next to bookmarks',
    type: 'switch',
  },
  faviconSize: {
    label: 'Favicon Size',
    description: 'Size of favicon icons in pixels',
    type: 'select',
    options: [
      { value: 16, label: '16px (Small)' },
      { value: 24, label: '24px (Medium)' },
      { value: 32, label: '32px (Large)' },
    ],
  },

  // Search
  searchDebounceMs: {
    label: 'Search Delay',
    description: 'Delay before search starts after typing',
    type: 'number',
    min: 50,
    max: 1000,
    step: 50,
    unit: 'ms',
  },
  maxSearchResults: {
    label: 'Max Search Results',
    description: 'Maximum number of results to show',
    type: 'select',
    options: [
      { value: 10, label: '10 results' },
      { value: 20, label: '20 results' },
      { value: 50, label: '50 results' },
      { value: 100, label: '100 results' },
    ],
  },
  expandFoldersOnSearch: {
    label: 'Expand Folders on Search',
    description: 'Automatically expand folders when searching',
    type: 'switch',
  },
  searchHistory: {
    label: 'Search History',
    description: 'Remember recent searches',
    type: 'switch',
  },

  // Behavior
  sortOrder: {
    label: 'Sort Order',
    description: 'Default sort order for bookmarks',
    type: 'select',
    options: [
      { value: 'date', label: 'Date Added' },
      { value: 'alphabetical', label: 'Alphabetical' },
      { value: 'folders', label: 'Folders First' },
    ],
  },
  groupByFolders: {
    label: 'Group by Folders',
    description: 'Organize bookmarks by folder structure',
    type: 'switch',
  },
  confirmBeforeDelete: {
    label: 'Confirm Before Delete',
    description: 'Show confirmation dialog before deleting',
    type: 'switch',
  },
  defaultNewFolderName: {
    label: 'Default Folder Name',
    description: 'Default name for new folders',
    type: 'text',
  },

  // Advanced
  popupWidth: {
    label: 'Popup Width',
    description: 'Width of the popup window',
    type: 'number',
    min: 300,
    max: 800,
    step: 50,
    unit: 'px',
  },
  popupHeight: {
    label: 'Popup Height',
    description: 'Height of the popup window',
    type: 'number',
    min: 300,
    max: 1000,
    step: 50,
    unit: 'px',
  },
  truncateLength: {
    label: 'Truncate Length',
    description: 'Maximum characters before truncating text',
    type: 'number',
    min: 20,
    max: 200,
    step: 10,
    unit: 'chars',
  },
};
