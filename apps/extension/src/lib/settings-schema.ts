/**
 * Settings schema using Zod.
 * Defines all configurable settings with validation and defaults.
 */

import { z } from 'zod';

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
 */
export const settingsSchema = z.object({
  // Appearance
  theme: themeSchema.default('system'),
  showFavicons: z.boolean().default(true),
  faviconSize: faviconSizeSchema.default(16),

  // Search
  searchDebounceMs: z.number().min(50).max(1000).default(300),
  maxSearchResults: maxSearchResultsSchema.default(20),
  expandFoldersOnSearch: z.boolean().default(true),
  searchHistory: z.boolean().default(true),

  // Behavior
  sortOrder: sortOrderSchema.default('date'),
  groupByFolders: z.boolean().default(true),
  confirmBeforeDelete: z.boolean().default(true),
  defaultNewFolderName: z.string().min(1).max(100).default('New Folder'),

  // Advanced
  popupWidth: z.number().min(300).max(800).default(400),
  popupHeight: z.number().min(300).max(1000).default(500),
  truncateLength: z.number().min(20).max(200).default(50),
});

export type Settings = z.infer<typeof settingsSchema>;

/**
 * Default settings values.
 */
export const defaultSettings: Settings = settingsSchema.parse({});

/**
 * Settings categories for UI grouping.
 */
export const settingsCategories = {
  appearance: {
    label: 'Appearance',
    description: 'Customize how bookmarks look',
    fields: ['theme', 'showFavicons', 'faviconSize'] as const,
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
