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
    toast_duration_ms: number;
  };
  ai: {
    enabled: boolean;
    provider: string;
    model: string;
    auto_trigger_on_open: boolean;
  };
  export: {
    filename_prefix: string;
    filename_max_length: number;
    json_indent_size: number;
    html_indent_spaces: number;
    markdown_indent_spaces: number;
    include_dates_by_default: boolean;
    include_urls_by_default: boolean;
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
  toastDurationMs: z.number().min(2000).max(10000).default(config.advanced.toast_duration_ms),

  // AI - defaults from config.ai
  aiEnabled: z.boolean().default(config.ai.enabled),
  aiProvider: z.enum(['openai', 'anthropic', 'google']).default(config.ai.provider as 'openai' | 'anthropic' | 'google'),
  aiModel: z.string().default(config.ai.model),
  aiMaxRecommendations: z.number().min(1).max(5).default(3),
  aiAutoTriggerOnOpen: z.boolean().default(config.ai.auto_trigger_on_open),

  // Export - defaults from config.export
  exportFilenamePrefix: z.string().default(config.export.filename_prefix),
  exportFilenameMaxLength: z.number().min(10).max(100).default(config.export.filename_max_length),
  exportJsonIndentSize: z.number().min(1).max(8).default(config.export.json_indent_size),
  exportHtmlIndentSpaces: z.number().min(1).max(8).default(config.export.html_indent_spaces),
  exportMarkdownIndentSpaces: z.number().min(1).max(8).default(config.export.markdown_indent_spaces),
  exportIncludeDates: z.boolean().default(config.export.include_dates_by_default),
  exportIncludeUrls: z.boolean().default(config.export.include_urls_by_default),
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
      label: t('settings_appearance'),
      description: t('settings_appearanceDesc'),
      fields: ['language', 'theme', 'showFavicons', 'faviconSize'] as const,
    },
    search: {
      label: t('settings_search'),
      description: t('settings_searchDesc'),
      fields: ['searchDebounceMs', 'maxSearchResults', 'expandFoldersOnSearch', 'searchHistory'] as const,
    },
    behavior: {
      label: t('settings_behavior'),
      description: t('settings_behaviorDesc'),
      fields: ['sortOrder', 'groupByFolders', 'confirmBeforeDelete', 'defaultNewFolderName', 'recentFoldersEnabled', 'recentFoldersMax'] as const,
    },
    advanced: {
      label: t('settings_advanced'),
      description: t('settings_advancedDesc'),
      fields: ['popupWidth', 'popupHeight', 'truncateLength', 'toastDurationMs'] as const,
    },
    ai: {
      label: t('settings_ai'),
      description: t('settings_aiDesc'),
      fields: ['aiEnabled', 'aiAutoTriggerOnOpen', 'aiProvider', 'aiModel', 'aiMaxRecommendations'] as const,
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
    fields: ['popupWidth', 'popupHeight', 'truncateLength', 'toastDurationMs'] as const,
  },
  ai: {
    label: 'AI',
    description: 'AI-powered folder recommendations',
    fields: ['aiEnabled', 'aiAutoTriggerOnOpen', 'aiProvider', 'aiModel', 'aiMaxRecommendations'] as const,
  },
  export: {
    label: 'Export',
    description: 'Bookmark export settings',
    fields: ['exportFilenamePrefix', 'exportFilenameMaxLength', 'exportJsonIndentSize', 'exportIncludeDates', 'exportIncludeUrls'] as const,
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
      label: t('settings_language'),
      description: t('settings_languageDesc'),
      type: 'select',
      options: [
        { value: 'auto', label: t('settings_languageAuto') },
        { value: 'en', label: 'English' },
        { value: 'ja', label: '日本語' },
        { value: 'ko', label: '한국어' },
      ],
    },
    theme: {
      label: t('settings_theme'),
      description: t('settings_themeDesc'),
      type: 'select',
      options: [
        { value: 'system', label: t('settings_themeSystem') },
        { value: 'light', label: t('settings_themeLight') },
        { value: 'dark', label: t('settings_themeDark') },
      ],
    },
    showFavicons: {
      label: t('settings_showFavicons'),
      description: t('settings_showFaviconsDesc'),
      type: 'switch',
    },
    faviconSize: {
      label: t('settings_faviconSize'),
      description: t('settings_faviconSizeDesc'),
      type: 'select',
      options: [
        { value: 16, label: t('settings_faviconSmall') },
        { value: 24, label: t('settings_faviconMedium') },
        { value: 32, label: t('settings_faviconLarge') },
      ],
    },

    // Search
    searchDebounceMs: {
      label: t('settings_searchDelay'),
      description: t('settings_searchDelayDesc'),
      type: 'number',
      min: 50,
      max: 1000,
      step: 50,
      unit: 'ms',
    },
    maxSearchResults: {
      label: t('settings_maxResults'),
      description: t('settings_maxResultsDesc'),
      type: 'select',
      options: [
        { value: 10, label: t('settingsResults', '10') },
        { value: 20, label: t('settingsResults', '20') },
        { value: 50, label: t('settingsResults', '50') },
        { value: 100, label: t('settingsResults', '100') },
      ],
    },
    expandFoldersOnSearch: {
      label: t('settings_expandFolders'),
      description: t('settings_expandFoldersDesc'),
      type: 'switch',
    },
    searchHistory: {
      label: t('settings_searchHistory'),
      description: t('settings_searchHistoryDesc'),
      type: 'switch',
    },

    // Behavior
    sortOrder: {
      label: t('settings_sortOrder'),
      description: t('settings_sortOrderDesc'),
      type: 'select',
      options: [
        { value: 'date', label: t('settings_sortDate') },
        { value: 'alphabetical', label: t('settings_sortAlphabetical') },
        { value: 'folders', label: t('settings_sortFolders') },
      ],
    },
    groupByFolders: {
      label: t('settings_groupByFolders'),
      description: t('settings_groupByFoldersDesc'),
      type: 'switch',
    },
    confirmBeforeDelete: {
      label: t('settings_confirmDelete'),
      description: t('settings_confirmDeleteDesc'),
      type: 'switch',
    },
    defaultNewFolderName: {
      label: t('settings_defaultFolderName'),
      description: t('settings_defaultFolderNameDesc'),
      type: 'text',
    },
    recentFoldersMax: {
      label: t('settings_recentFoldersMax'),
      description: t('settings_recentFoldersMaxDesc'),
      type: 'number',
      min: 1,
      max: 10,
      step: 1,
    },
    recentFoldersEnabled: {
      label: t('settings_recentFoldersEnabled'),
      description: t('settings_recentFoldersEnabledDesc'),
      type: 'switch',
    },

    // Advanced
    popupWidth: {
      label: t('settings_popupWidth'),
      description: t('settings_popupWidthDesc'),
      type: 'number',
      min: 300,
      max: 800,
      step: 50,
      unit: 'px',
    },
    popupHeight: {
      label: t('settings_popupHeight'),
      description: t('settings_popupHeightDesc'),
      type: 'number',
      min: 300,
      max: 1000,
      step: 50,
      unit: 'px',
    },
    truncateLength: {
      label: t('settings_truncateLength'),
      description: t('settings_truncateLengthDesc'),
      type: 'number',
      min: 20,
      max: 200,
      step: 10,
      unit: 'chars',
    },
    toastDurationMs: {
      label: t('settings_toastDuration'),
      description: t('settings_toastDurationDesc'),
      type: 'number',
      min: 2000,
      max: 10000,
      step: 500,
      unit: 'ms',
    },

    // AI
    aiEnabled: {
      label: 'AI Recommendations',
      description: 'Enable AI-powered folder suggestions',
      type: 'switch',
    },
    aiAutoTriggerOnOpen: {
      label: 'Auto-recommend on Open',
      description: 'Automatically suggest folders when popup opens',
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
  toastDurationMs: {
    label: 'Toast Duration',
    description: 'Duration before toast notifications auto-dismiss',
    type: 'number',
    min: 2000,
    max: 10000,
    step: 500,
    unit: 'ms',
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
  aiAutoTriggerOnOpen: {
    label: 'Auto-recommend on Open',
    description: 'Automatically suggest folders when popup opens',
    type: 'switch',
  },

  // Export
  exportFilenamePrefix: {
    label: 'Filename Prefix',
    description: 'Prefix for exported bookmark files',
    type: 'text',
  },
  exportFilenameMaxLength: {
    label: 'Max Filename Length',
    description: 'Maximum characters in exported filename',
    type: 'number',
    min: 10,
    max: 100,
    step: 5,
  },
  exportJsonIndentSize: {
    label: 'JSON Indent Size',
    description: 'Spaces for JSON formatting',
    type: 'number',
    min: 1,
    max: 8,
    step: 1,
  },
  exportHtmlIndentSpaces: {
    label: 'HTML Indent Size',
    description: 'Spaces for HTML formatting',
    type: 'number',
    min: 1,
    max: 8,
    step: 1,
  },
  exportMarkdownIndentSpaces: {
    label: 'Markdown Indent Size',
    description: 'Spaces for Markdown formatting',
    type: 'number',
    min: 1,
    max: 8,
    step: 1,
  },
  exportIncludeDates: {
    label: 'Include Dates',
    description: 'Include creation dates in exports',
    type: 'switch',
  },
  exportIncludeUrls: {
    label: 'Include URLs',
    description: 'Include bookmark URLs in exports',
    type: 'switch',
  },
};
