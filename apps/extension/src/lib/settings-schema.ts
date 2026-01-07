/**
 * Settings schema using Zod.
 * Reads default values from TOML config file - no hardcoded defaults in code.
 */

import { z } from 'zod';
import { parse } from 'smol-toml';
import { t } from '@/hooks/use-i18n';

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
    recent_folders_max: number;
    recent_folders_enabled: boolean;
  };
  advanced: {
    popup_width: number;
    popup_height: number;
    truncate_length: number;
  };
  ai: {
    enabled: boolean;
    provider: string;
    model: string;
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
  recentFoldersMax: z.number().min(1).max(10).default(config.behavior.recent_folders_max),
  recentFoldersEnabled: z.boolean().default(config.behavior.recent_folders_enabled),

  // Advanced - defaults from config.advanced
  popupWidth: z.number().min(300).max(800).default(config.advanced.popup_width),
  popupHeight: z.number().min(300).max(1000).default(config.advanced.popup_height),
  truncateLength: z.number().min(20).max(200).default(config.advanced.truncate_length),

  // AI - defaults from config.ai
  aiEnabled: z.boolean().default(config.ai.enabled),
  aiProvider: z.enum(['openai', 'anthropic', 'google']).default(config.ai.provider as 'openai' | 'anthropic' | 'google'),
  aiModel: z.string().default(config.ai.model),
  aiMaxRecommendations: z.number().min(1).max(5).default(3),
});

export type Settings = z.infer<typeof settingsSchema>;

/**
 * Default settings values - generated from TOML config.
 */
export const defaultSettings: Settings = settingsSchema.parse({});

/**
 * Settings categories for UI grouping.
 * Returns translated labels and descriptions.
 */
export function getSettingsCategories() {
  return {
    appearance: {
      label: t('settingsAppearance'),
      description: t('settingsAppearanceDesc'),
      fields: ['language', 'theme', 'showFavicons', 'faviconSize'] as const,
    },
    search: {
      label: t('settingsSearch'),
      description: t('settingsSearchDesc'),
      fields: ['searchDebounceMs', 'maxSearchResults', 'expandFoldersOnSearch', 'searchHistory'] as const,
    },
    behavior: {
      label: t('settingsBehavior'),
      description: t('settingsBehaviorDesc'),
      fields: ['sortOrder', 'groupByFolders', 'confirmBeforeDelete', 'defaultNewFolderName', 'recentFoldersEnabled', 'recentFoldersMax'] as const,
    },
    advanced: {
      label: t('settingsAdvanced'),
      description: t('settingsAdvancedDesc'),
      fields: ['popupWidth', 'popupHeight', 'truncateLength'] as const,
    },
    ai: {
      label: t('settingsAI'),
      description: t('settingsAIDesc'),
      fields: ['aiEnabled', 'aiProvider', 'aiModel'] as const,
    },
  } as const;
}

// Keep static version for type inference
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
    fields: ['sortOrder', 'groupByFolders', 'confirmBeforeDelete', 'defaultNewFolderName', 'recentFoldersEnabled', 'recentFoldersMax'] as const,
  },
  advanced: {
    label: 'Advanced',
    description: 'Advanced settings',
    fields: ['popupWidth', 'popupHeight', 'truncateLength'] as const,
  },
  ai: {
    label: 'AI',
    description: 'AI-powered folder recommendations',
    fields: ['aiEnabled', 'aiProvider', 'aiModel', 'aiMaxRecommendations'] as const,
  },
} as const;

/**
 * Field metadata for rendering forms with translations.
 * Call this in components to get translated labels.
 */
export function getSettingsFieldMeta(): Record<
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
> {
  return {
    // Appearance
    language: {
      label: t('settingsLanguage'),
      description: t('settingsLanguageDesc'),
      type: 'select',
      options: [
        { value: 'auto', label: t('settingsLanguageAuto') },
        { value: 'en', label: 'English' },
        { value: 'ja', label: '日本語' },
        { value: 'ko', label: '한국어' },
      ],
    },
    theme: {
      label: t('settingsTheme'),
      description: t('settingsThemeDesc'),
      type: 'select',
      options: [
        { value: 'system', label: t('settingsThemeSystem') },
        { value: 'light', label: t('settingsThemeLight') },
        { value: 'dark', label: t('settingsThemeDark') },
      ],
    },
    showFavicons: {
      label: t('settingsShowFavicons'),
      description: t('settingsShowFaviconsDesc'),
      type: 'switch',
    },
    faviconSize: {
      label: t('settingsFaviconSize'),
      description: t('settingsFaviconSizeDesc'),
      type: 'select',
      options: [
        { value: 16, label: t('settingsFaviconSmall') },
        { value: 24, label: t('settingsFaviconMedium') },
        { value: 32, label: t('settingsFaviconLarge') },
      ],
    },

    // Search
    searchDebounceMs: {
      label: t('settingsSearchDelay'),
      description: t('settingsSearchDelayDesc'),
      type: 'number',
      min: 50,
      max: 1000,
      step: 50,
      unit: 'ms',
    },
    maxSearchResults: {
      label: t('settingsMaxResults'),
      description: t('settingsMaxResultsDesc'),
      type: 'select',
      options: [
        { value: 10, label: t('settingsResults', '10') },
        { value: 20, label: t('settingsResults', '20') },
        { value: 50, label: t('settingsResults', '50') },
        { value: 100, label: t('settingsResults', '100') },
      ],
    },
    expandFoldersOnSearch: {
      label: t('settingsExpandFolders'),
      description: t('settingsExpandFoldersDesc'),
      type: 'switch',
    },
    searchHistory: {
      label: t('settingsSearchHistory'),
      description: t('settingsSearchHistoryDesc'),
      type: 'switch',
    },

    // Behavior
    sortOrder: {
      label: t('settingsSortOrder'),
      description: t('settingsSortOrderDesc'),
      type: 'select',
      options: [
        { value: 'date', label: t('settingsSortDate') },
        { value: 'alphabetical', label: t('settingsSortAlphabetical') },
        { value: 'folders', label: t('settingsSortFolders') },
      ],
    },
    groupByFolders: {
      label: t('settingsGroupByFolders'),
      description: t('settingsGroupByFoldersDesc'),
      type: 'switch',
    },
    confirmBeforeDelete: {
      label: t('settingsConfirmDelete'),
      description: t('settingsConfirmDeleteDesc'),
      type: 'switch',
    },
    defaultNewFolderName: {
      label: t('settingsDefaultFolderName'),
      description: t('settingsDefaultFolderNameDesc'),
      type: 'text',
    },
    recentFoldersMax: {
      label: t('settingsRecentFoldersMax'),
      description: t('settingsRecentFoldersMaxDesc'),
      type: 'number',
      min: 1,
      max: 10,
      step: 1,
    },
    recentFoldersEnabled: {
      label: t('settingsRecentFoldersEnabled'),
      description: t('settingsRecentFoldersEnabledDesc'),
      type: 'switch',
    },

    // Advanced
    popupWidth: {
      label: t('settingsPopupWidth'),
      description: t('settingsPopupWidthDesc'),
      type: 'number',
      min: 300,
      max: 800,
      step: 50,
      unit: 'px',
    },
    popupHeight: {
      label: t('settingsPopupHeight'),
      description: t('settingsPopupHeightDesc'),
      type: 'number',
      min: 300,
      max: 1000,
      step: 50,
      unit: 'px',
    },
    truncateLength: {
      label: t('settingsTruncateLength'),
      description: t('settingsTruncateLengthDesc'),
      type: 'number',
      min: 20,
      max: 200,
      step: 10,
      unit: 'chars',
    },

    // AI
    aiEnabled: {
      label: 'AI Recommendations',
      description: 'Enable AI-powered folder suggestions',
      type: 'switch',
    },
    aiProvider: {
      label: 'AI Provider',
      description: 'Choose your AI provider',
      type: 'select',
      options: [
        { value: 'openai', label: 'OpenAI' },
        { value: 'anthropic', label: 'Anthropic' },
        { value: 'google', label: 'Google' },
      ],
    },
    aiModel: {
      label: 'Model',
      description: 'AI model to use',
      type: 'select',
      options: [
        { value: 'gpt-5.2', label: 'GPT-5.2 (OpenAI)' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini (OpenAI)' },
        { value: 'claude-opus-4.5', label: 'Claude Opus 4.5 (Anthropic)' },
        { value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (Anthropic)' },
        { value: 'gemini-3-flash', label: 'Gemini 3 Flash (Google)' },
        { value: 'gemini-3-pro', label: 'Gemini 3 Pro (Google)' },
      ],
    },
    aiMaxRecommendations: {
      label: 'Max Recommendations',
      description: 'Maximum number of folder suggestions (1-5)',
      type: 'number',
      min: 1,
      max: 5,
    },
  };
}

// Keep static version for type inference (fallback for non-i18n contexts)
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
  recentFoldersMax: {
    label: 'Recent Folders Max',
    description: 'Maximum number of recent folders to show for quick select',
    type: 'number',
    min: 1,
    max: 10,
    step: 1,
  },
  recentFoldersEnabled: {
    label: 'Recent Folders',
    description: 'Show recent folders for quick bookmark saving',
    type: 'switch',
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

  // AI
  aiEnabled: {
    label: 'AI Recommendations',
    description: 'Enable AI-powered folder suggestions',
    type: 'switch',
  },
  aiProvider: {
    label: 'AI Provider',
    description: 'Choose your AI provider',
    type: 'select',
    options: [
      { value: 'openai', label: 'OpenAI' },
      { value: 'anthropic', label: 'Anthropic' },
      { value: 'google', label: 'Google' },
    ],
  },
  aiModel: {
    label: 'Model',
    description: 'AI model to use',
    type: 'select',
    options: [
      { value: 'gpt-5.2', label: 'GPT-5.2 (OpenAI)' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini (OpenAI)' },
      { value: 'claude-opus-4.5', label: 'Claude Opus 4.5 (Anthropic)' },
      { value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (Anthropic)' },
      { value: 'gemini-3-flash', label: 'Gemini 3 Flash (Google)' },
      { value: 'gemini-3-pro', label: 'Gemini 3 Pro (Google)' },
    ],
  },
  aiMaxRecommendations: {
    label: 'Max Recommendations',
    description: 'Maximum number of folder suggestions (1-5)',
    type: 'number',
    min: 1,
    max: 5,
  },
};
