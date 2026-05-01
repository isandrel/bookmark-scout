/**
 * Settings schema using Zod.
 * Reads default values from TOML config so runtime defaults stay configurable.
 */

import { z } from 'zod';
import { parse } from 'smol-toml';
import { t } from '@/hooks/use-i18n';
import { getAvailableProviders, getModelsForProvider, getProviderName } from '@/services/ai-models';
import type { AIProvider } from '@/services/ai-client';
import settingsToml from '../../config/settings.default.toml?raw';

type SettingsFieldType = 'switch' | 'select' | 'number' | 'text';

type SettingsFieldMeta = {
  label: string;
  description: string;
  type: SettingsFieldType;
  options?: { value: string | number; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
};

type SettingsCategoryMeta = {
  label: string;
  description: string;
  fields: readonly (keyof Settings)[];
};

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
    max_categories?: number;
    min_items_per_folder?: number;
    max_items_per_folder?: number;
    providers?: Record<string, unknown>;
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
  context_menu: {
    enabled: boolean;
    bookmark_naming: string;
  };
  tools: {
    ai_context_packer: {
      enabled: boolean;
      default_scope: string;
      output_format: string;
      include_folder_path: boolean;
      include_dates: boolean;
      include_tags: boolean;
      include_summaries: boolean;
      max_items: number;
      max_depth: number;
      excerpt_length: number;
    };
    auto_tagging: {
      enabled: boolean;
      default_scope: string;
      min_tags: number;
      max_tags: number;
      tag_style: string;
      merge_mode: string;
      dedupe_tags: boolean;
    };
    summarizer: {
      enabled: boolean;
      default_scope: string;
      summary_length: number;
      include_domain_hint: boolean;
      merge_mode: string;
    };
    reorganization: {
      enabled: boolean;
      default_scope: string;
      dry_run_first: boolean;
      min_confidence: number;
      batch_size: number;
    };
    duplicates: {
      enabled: boolean;
      default_scope: string;
      match_strategy: string;
      normalize_www: boolean;
      ignore_protocol: boolean;
      ignore_trailing_slash: boolean;
      keep_rule: string;
      max_groups: number;
    };
    url_cleaner: {
      enabled: boolean;
      default_scope: string;
      remove_hash: boolean;
      sort_query_params: boolean;
      dedupe_query_params: boolean;
      preserve_params: string[];
      remove_params: string[];
    };
    dead_links: {
      enabled: boolean;
      default_scope: string;
      request_timeout_ms: number;
      concurrency: number;
      retry_count: number;
      follow_redirects: boolean;
      success_statuses: number[];
    };
    metadata_fetcher: {
      enabled: boolean;
      default_scope: string;
      overwrite_titles: boolean;
      fetch_favicons: boolean;
      fetch_descriptions: boolean;
      request_timeout_ms: number;
      concurrency: number;
    };
    privacy_scanner: {
      enabled: boolean;
      default_scope: string;
      scan_titles: boolean;
      scan_query_params: boolean;
      scan_fragments: boolean;
      sensitive_params: string[];
      email_detection: boolean;
      uuid_detection: boolean;
    };
    statistics: {
      enabled: boolean;
      default_scope: string;
      include_domains: boolean;
      include_folders: boolean;
      include_duplicates: boolean;
      include_protocols: boolean;
      include_depth_breakdown: boolean;
      top_n: number;
    };
    data: {
      show_export: boolean;
      show_import: boolean;
      default_export_format: string;
    };
  };
}

const config = parse(settingsToml) as TomlConfig;

const configuredProviderIds = Object.keys(config.ai.providers ?? {});
const aiProviderSchema = configuredProviderIds.length > 0
  ? z.enum(configuredProviderIds as [AIProvider, ...AIProvider[]])
  : z.enum(['openai']);

export const themeSchema = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof themeSchema>;

export const sortOrderSchema = z.enum(['date', 'alphabetical', 'folders']);
export type SortOrder = z.infer<typeof sortOrderSchema>;

export const languageSchema = z.enum(['auto', 'en', 'ja', 'ko']);
export type Language = z.infer<typeof languageSchema>;

export const faviconSizeSchema = z.union([z.literal(16), z.literal(24), z.literal(32)]);
export type FaviconSize = z.infer<typeof faviconSizeSchema>;

export const maxSearchResultsSchema = z.union([
  z.literal(10),
  z.literal(20),
  z.literal(50),
  z.literal(100),
]);

const scopeSchema = z.enum(['folder', 'all', 'both']);
const aiContextFormatSchema = z.enum(['markdown', 'xml']);
const mergeModeSchema = z.enum(['append', 'replace']);
const tagStyleSchema = z.enum(['kebab-case', 'snake_case', 'lowercase']);
const duplicateMatchStrategySchema = z.enum([
  'exact_url',
  'normalized_url',
  'title_url',
  'title_only',
]);
const duplicateKeepRuleSchema = z.enum(['oldest', 'newest', 'first']);

export const settingsSchema = z.object({
  language: languageSchema.default(config.appearance.language as Language),
  theme: themeSchema.default(config.appearance.theme as Theme),
  showFavicons: z.boolean().default(config.appearance.show_favicons),
  faviconSize: faviconSizeSchema.default(config.appearance.favicon_size as FaviconSize),

  searchDebounceMs: z.number().min(50).max(1000).default(config.search.debounce_ms),
  maxSearchResults: maxSearchResultsSchema.default(config.search.max_results as 10 | 20 | 50 | 100),
  expandFoldersOnSearch: z.boolean().default(config.search.expand_folders_on_search),
  searchHistory: z.boolean().default(config.search.search_history),

  sortOrder: sortOrderSchema.default(config.behavior.sort_order as SortOrder),
  groupByFolders: z.boolean().default(config.behavior.group_by_folders),
  confirmBeforeDelete: z.boolean().default(config.behavior.confirm_before_delete),
  defaultNewFolderName: z.string().min(1).max(100).default(config.behavior.default_new_folder_name),
  recentFoldersMax: z.number().min(1).max(10).default(config.behavior.recent_folders_max),
  recentFoldersEnabled: z.boolean().default(config.behavior.recent_folders_enabled),

  popupWidth: z.number().min(300).max(800).default(config.advanced.popup_width),
  popupHeight: z.number().min(300).max(1000).default(config.advanced.popup_height),
  truncateLength: z.number().min(20).max(200).default(config.advanced.truncate_length),
  toastDurationMs: z.number().min(2000).max(10000).default(config.advanced.toast_duration_ms),

  aiEnabled: z.boolean().default(config.ai.enabled),
  aiProvider: aiProviderSchema.default(config.ai.provider as AIProvider),
  aiModel: z.string().default(config.ai.model),
  aiMaxRecommendations: z.number().min(1).max(10).default(config.tools.auto_tagging.max_tags),
  aiAutoTriggerOnOpen: z.boolean().default(config.ai.auto_trigger_on_open),
  aiMaxCategories: z.number().default(config.ai.max_categories ?? -1),
  aiMinItemsPerFolder: z.number().min(1).default(config.ai.min_items_per_folder ?? 1),
  aiMaxItemsPerFolder: z.number().default(config.ai.max_items_per_folder ?? -1),

  exportFilenamePrefix: z.string().default(config.export.filename_prefix),
  exportFilenameMaxLength: z.number().min(10).max(100).default(config.export.filename_max_length),
  exportJsonIndentSize: z.number().min(1).max(8).default(config.export.json_indent_size),
  exportHtmlIndentSpaces: z.number().min(1).max(8).default(config.export.html_indent_spaces),
  exportMarkdownIndentSpaces: z.number().min(1).max(8).default(config.export.markdown_indent_spaces),
  exportIncludeDates: z.boolean().default(config.export.include_dates_by_default),
  exportIncludeUrls: z.boolean().default(config.export.include_urls_by_default),

  contextMenuEnabled: z.boolean().default(config.context_menu.enabled),
  contextMenuBookmarkNaming: z.enum(['link_text', 'page_title', 'link_url']).default(
    config.context_menu.bookmark_naming as 'link_text' | 'page_title' | 'link_url',
  ),

  aiContextPackerEnabled: z.boolean().default(config.tools.ai_context_packer.enabled),
  aiContextPackerDefaultScope: scopeSchema.default(config.tools.ai_context_packer.default_scope as 'folder' | 'all' | 'both'),
  aiContextPackerOutputFormat: aiContextFormatSchema.default(config.tools.ai_context_packer.output_format as 'markdown' | 'xml'),
  aiContextPackerIncludeFolderPath: z.boolean().default(config.tools.ai_context_packer.include_folder_path),
  aiContextPackerIncludeDates: z.boolean().default(config.tools.ai_context_packer.include_dates),
  aiContextPackerIncludeTags: z.boolean().default(config.tools.ai_context_packer.include_tags),
  aiContextPackerIncludeSummaries: z.boolean().default(config.tools.ai_context_packer.include_summaries),
  aiContextPackerMaxItems: z.number().min(1).max(2000).default(config.tools.ai_context_packer.max_items),
  aiContextPackerMaxDepth: z.number().min(1).max(20).default(config.tools.ai_context_packer.max_depth),
  aiContextPackerExcerptLength: z.number().min(40).max(2000).default(config.tools.ai_context_packer.excerpt_length),

  autoTaggingEnabled: z.boolean().default(config.tools.auto_tagging.enabled),
  autoTaggingDefaultScope: scopeSchema.default(config.tools.auto_tagging.default_scope as 'folder' | 'all' | 'both'),
  autoTaggingMinTags: z.number().min(1).max(20).default(config.tools.auto_tagging.min_tags),
  autoTaggingMaxTags: z.number().min(1).max(20).default(config.tools.auto_tagging.max_tags),
  autoTaggingTagStyle: tagStyleSchema.default(config.tools.auto_tagging.tag_style as 'kebab-case' | 'snake_case' | 'lowercase'),
  autoTaggingMergeMode: mergeModeSchema.default(config.tools.auto_tagging.merge_mode as 'append' | 'replace'),
  autoTaggingDedupeTags: z.boolean().default(config.tools.auto_tagging.dedupe_tags),

  summarizerEnabled: z.boolean().default(config.tools.summarizer.enabled),
  summarizerDefaultScope: scopeSchema.default(config.tools.summarizer.default_scope as 'folder' | 'all' | 'both'),
  summarizerSummaryLength: z.number().min(40).max(1000).default(config.tools.summarizer.summary_length),
  summarizerIncludeDomainHint: z.boolean().default(config.tools.summarizer.include_domain_hint),
  summarizerMergeMode: mergeModeSchema.default(config.tools.summarizer.merge_mode as 'append' | 'replace'),

  reorganizationEnabled: z.boolean().default(config.tools.reorganization.enabled),
  reorganizationDefaultScope: scopeSchema.default(config.tools.reorganization.default_scope as 'folder' | 'all' | 'both'),
  reorganizationDryRunFirst: z.boolean().default(config.tools.reorganization.dry_run_first),
  reorganizationMinConfidence: z.number().min(0).max(1).default(config.tools.reorganization.min_confidence),
  reorganizationBatchSize: z.number().min(1).max(1000).default(config.tools.reorganization.batch_size),

  duplicatesEnabled: z.boolean().default(config.tools.duplicates.enabled),
  duplicatesDefaultScope: scopeSchema.default(config.tools.duplicates.default_scope as 'folder' | 'all' | 'both'),
  duplicatesMatchStrategy: duplicateMatchStrategySchema.default(config.tools.duplicates.match_strategy as z.infer<typeof duplicateMatchStrategySchema>),
  duplicatesNormalizeWww: z.boolean().default(config.tools.duplicates.normalize_www),
  duplicatesIgnoreProtocol: z.boolean().default(config.tools.duplicates.ignore_protocol),
  duplicatesIgnoreTrailingSlash: z.boolean().default(config.tools.duplicates.ignore_trailing_slash),
  duplicatesKeepRule: duplicateKeepRuleSchema.default(config.tools.duplicates.keep_rule as z.infer<typeof duplicateKeepRuleSchema>),
  duplicatesMaxGroups: z.number().min(1).max(5000).default(config.tools.duplicates.max_groups),

  urlCleanerEnabled: z.boolean().default(config.tools.url_cleaner.enabled),
  urlCleanerDefaultScope: scopeSchema.default(config.tools.url_cleaner.default_scope as 'folder' | 'all' | 'both'),
  urlCleanerRemoveHash: z.boolean().default(config.tools.url_cleaner.remove_hash),
  urlCleanerSortQueryParams: z.boolean().default(config.tools.url_cleaner.sort_query_params),
  urlCleanerDedupeQueryParams: z.boolean().default(config.tools.url_cleaner.dedupe_query_params),
  urlCleanerPreserveParams: z.array(z.string()).default(config.tools.url_cleaner.preserve_params),
  urlCleanerRemoveParams: z.array(z.string()).default(config.tools.url_cleaner.remove_params),

  deadLinksEnabled: z.boolean().default(config.tools.dead_links.enabled),
  deadLinksDefaultScope: scopeSchema.default(config.tools.dead_links.default_scope as 'folder' | 'all' | 'both'),
  deadLinksRequestTimeoutMs: z.number().min(1000).max(60000).default(config.tools.dead_links.request_timeout_ms),
  deadLinksConcurrency: z.number().min(1).max(20).default(config.tools.dead_links.concurrency),
  deadLinksRetryCount: z.number().min(0).max(10).default(config.tools.dead_links.retry_count),
  deadLinksFollowRedirects: z.boolean().default(config.tools.dead_links.follow_redirects),
  deadLinksSuccessStatuses: z.array(z.number()).default(config.tools.dead_links.success_statuses),

  metadataFetcherEnabled: z.boolean().default(config.tools.metadata_fetcher.enabled),
  metadataFetcherDefaultScope: scopeSchema.default(config.tools.metadata_fetcher.default_scope as 'folder' | 'all' | 'both'),
  metadataFetcherOverwriteTitles: z.boolean().default(config.tools.metadata_fetcher.overwrite_titles),
  metadataFetcherFetchFavicons: z.boolean().default(config.tools.metadata_fetcher.fetch_favicons),
  metadataFetcherFetchDescriptions: z.boolean().default(config.tools.metadata_fetcher.fetch_descriptions),
  metadataFetcherRequestTimeoutMs: z.number().min(1000).max(60000).default(config.tools.metadata_fetcher.request_timeout_ms),
  metadataFetcherConcurrency: z.number().min(1).max(20).default(config.tools.metadata_fetcher.concurrency),

  privacyScannerEnabled: z.boolean().default(config.tools.privacy_scanner.enabled),
  privacyScannerDefaultScope: scopeSchema.default(config.tools.privacy_scanner.default_scope as 'folder' | 'all' | 'both'),
  privacyScannerScanTitles: z.boolean().default(config.tools.privacy_scanner.scan_titles),
  privacyScannerScanQueryParams: z.boolean().default(config.tools.privacy_scanner.scan_query_params),
  privacyScannerScanFragments: z.boolean().default(config.tools.privacy_scanner.scan_fragments),
  privacyScannerSensitiveParams: z.array(z.string()).default(config.tools.privacy_scanner.sensitive_params),
  privacyScannerEmailDetection: z.boolean().default(config.tools.privacy_scanner.email_detection),
  privacyScannerUuidDetection: z.boolean().default(config.tools.privacy_scanner.uuid_detection),

  statisticsEnabled: z.boolean().default(config.tools.statistics.enabled),
  statisticsDefaultScope: scopeSchema.default(config.tools.statistics.default_scope as 'folder' | 'all' | 'both'),
  statisticsIncludeDomains: z.boolean().default(config.tools.statistics.include_domains),
  statisticsIncludeFolders: z.boolean().default(config.tools.statistics.include_folders),
  statisticsIncludeDuplicates: z.boolean().default(config.tools.statistics.include_duplicates),
  statisticsIncludeProtocols: z.boolean().default(config.tools.statistics.include_protocols),
  statisticsIncludeDepthBreakdown: z.boolean().default(config.tools.statistics.include_depth_breakdown),
  statisticsTopN: z.number().min(1).max(100).default(config.tools.statistics.top_n),

  dataShowExport: z.boolean().default(config.tools.data.show_export),
  dataShowImport: z.boolean().default(config.tools.data.show_import),
  dataDefaultExportFormat: z.enum(['html', 'json', 'markdown', 'csv']).default(
    config.tools.data.default_export_format as 'html' | 'json' | 'markdown' | 'csv',
  ),
}).superRefine((value, ctx) => {
  if (value.autoTaggingMinTags > value.autoTaggingMaxTags) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['autoTaggingMinTags'],
      message: 'Minimum tags cannot exceed maximum tags',
    });
  }

  if (value.aiMinItemsPerFolder > 0 && value.aiMaxItemsPerFolder > 0 && value.aiMinItemsPerFolder > value.aiMaxItemsPerFolder) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['aiMinItemsPerFolder'],
      message: 'Minimum items per folder cannot exceed maximum items per folder',
    });
  }
});

export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = settingsSchema.parse({});

function buildCategories(): Record<string, SettingsCategoryMeta> {
  return {
    appearance: {
      label: t('settings_appearance'),
      description: t('settings_appearanceDesc'),
      fields: ['language', 'theme', 'showFavicons', 'faviconSize'],
    },
    search: {
      label: t('settings_search'),
      description: t('settings_searchDesc'),
      fields: ['searchDebounceMs', 'maxSearchResults', 'expandFoldersOnSearch', 'searchHistory'],
    },
    behavior: {
      label: t('settings_behavior'),
      description: t('settings_behaviorDesc'),
      fields: ['sortOrder', 'groupByFolders', 'confirmBeforeDelete', 'defaultNewFolderName', 'recentFoldersEnabled', 'recentFoldersMax'],
    },
    advanced: {
      label: t('settings_advanced'),
      description: t('settings_advancedDesc'),
      fields: ['popupWidth', 'popupHeight', 'truncateLength', 'toastDurationMs'],
    },
    ai: {
      label: t('settings_ai'),
      description: t('settings_aiDesc'),
      fields: ['aiEnabled', 'aiAutoTriggerOnOpen', 'aiProvider', 'aiModel', 'aiMaxRecommendations', 'aiMaxCategories', 'aiMinItemsPerFolder', 'aiMaxItemsPerFolder'],
    },
    aiTools: {
      label: t('settings_aiTools'),
      description: t('settings_aiToolsDesc'),
      fields: [
        'aiContextPackerEnabled',
        'aiContextPackerDefaultScope',
        'aiContextPackerOutputFormat',
        'aiContextPackerIncludeFolderPath',
        'aiContextPackerIncludeDates',
        'aiContextPackerIncludeTags',
        'aiContextPackerIncludeSummaries',
        'aiContextPackerMaxItems',
        'aiContextPackerMaxDepth',
        'aiContextPackerExcerptLength',
        'autoTaggingEnabled',
        'autoTaggingDefaultScope',
        'autoTaggingMinTags',
        'autoTaggingMaxTags',
        'autoTaggingTagStyle',
        'autoTaggingMergeMode',
        'autoTaggingDedupeTags',
        'summarizerEnabled',
        'summarizerDefaultScope',
        'summarizerSummaryLength',
        'summarizerIncludeDomainHint',
        'summarizerMergeMode',
        'reorganizationEnabled',
        'reorganizationDefaultScope',
        'reorganizationDryRunFirst',
        'reorganizationMinConfidence',
        'reorganizationBatchSize',
      ],
    },
    maintenance: {
      label: t('settings_maintenance'),
      description: t('settings_maintenanceDesc'),
      fields: [
        'duplicatesEnabled',
        'duplicatesDefaultScope',
        'duplicatesMatchStrategy',
        'duplicatesNormalizeWww',
        'duplicatesIgnoreProtocol',
        'duplicatesIgnoreTrailingSlash',
        'duplicatesKeepRule',
        'duplicatesMaxGroups',
        'urlCleanerEnabled',
        'urlCleanerDefaultScope',
        'urlCleanerRemoveHash',
        'urlCleanerSortQueryParams',
        'urlCleanerDedupeQueryParams',
        'urlCleanerPreserveParams',
        'urlCleanerRemoveParams',
        'deadLinksEnabled',
        'deadLinksDefaultScope',
        'deadLinksRequestTimeoutMs',
        'deadLinksConcurrency',
        'deadLinksRetryCount',
        'deadLinksFollowRedirects',
        'deadLinksSuccessStatuses',
      ],
    },
    metadataContent: {
      label: t('settings_metadataContent'),
      description: t('settings_metadataContentDesc'),
      fields: [
        'metadataFetcherEnabled',
        'metadataFetcherDefaultScope',
        'metadataFetcherOverwriteTitles',
        'metadataFetcherFetchFavicons',
        'metadataFetcherFetchDescriptions',
        'metadataFetcherRequestTimeoutMs',
        'metadataFetcherConcurrency',
      ],
    },
    security: {
      label: t('settings_security'),
      description: t('settings_securityDesc'),
      fields: [
        'privacyScannerEnabled',
        'privacyScannerDefaultScope',
        'privacyScannerScanTitles',
        'privacyScannerScanQueryParams',
        'privacyScannerScanFragments',
        'privacyScannerSensitiveParams',
        'privacyScannerEmailDetection',
        'privacyScannerUuidDetection',
      ],
    },
    analytics: {
      label: t('settings_analytics'),
      description: t('settings_analyticsDesc'),
      fields: [
        'statisticsEnabled',
        'statisticsDefaultScope',
        'statisticsIncludeDomains',
        'statisticsIncludeFolders',
        'statisticsIncludeDuplicates',
        'statisticsIncludeProtocols',
        'statisticsIncludeDepthBreakdown',
        'statisticsTopN',
      ],
    },
    data: {
      label: t('settings_data'),
      description: t('settings_dataDesc'),
      fields: [
        'dataShowExport',
        'dataShowImport',
        'dataDefaultExportFormat',
        'exportFilenamePrefix',
        'exportFilenameMaxLength',
        'exportJsonIndentSize',
        'exportHtmlIndentSpaces',
        'exportMarkdownIndentSpaces',
        'exportIncludeDates',
        'exportIncludeUrls',
        'contextMenuEnabled',
        'contextMenuBookmarkNaming',
      ],
    },
  };
}

export function getSettingsCategories() {
  return buildCategories();
}

function buildFieldMeta(): Record<keyof Settings, SettingsFieldMeta> {
  return {
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
    showFavicons: { label: t('settings_showFavicons'), description: t('settings_showFaviconsDesc'), type: 'switch' },
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
    searchDebounceMs: { label: t('settings_searchDelay'), description: t('settings_searchDelayDesc'), type: 'number', min: 50, max: 1000, step: 50, unit: 'ms' },
    maxSearchResults: {
      label: t('settings_maxResults'),
      description: t('settings_maxResultsDesc'),
      type: 'select',
      options: [10, 20, 50, 100].map((value) => ({ value, label: t('settings_results', String(value)) })),
    },
    expandFoldersOnSearch: { label: t('settings_expandFolders'), description: t('settings_expandFoldersDesc'), type: 'switch' },
    searchHistory: { label: t('settings_searchHistory'), description: t('settings_searchHistoryDesc'), type: 'switch' },
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
    groupByFolders: { label: t('settings_groupByFolders'), description: t('settings_groupByFoldersDesc'), type: 'switch' },
    confirmBeforeDelete: { label: t('settings_confirmDelete'), description: t('settings_confirmDeleteDesc'), type: 'switch' },
    defaultNewFolderName: { label: t('settings_defaultFolderName'), description: t('settings_defaultFolderNameDesc'), type: 'text' },
    recentFoldersMax: { label: t('settings_recentFoldersMax'), description: t('settings_recentFoldersMaxDesc'), type: 'number', min: 1, max: 10, step: 1 },
    recentFoldersEnabled: { label: t('settings_recentFoldersEnabled'), description: t('settings_recentFoldersEnabledDesc'), type: 'switch' },
    popupWidth: { label: t('settings_popupWidth'), description: t('settings_popupWidthDesc'), type: 'number', min: 300, max: 800, step: 50, unit: 'px' },
    popupHeight: { label: t('settings_popupHeight'), description: t('settings_popupHeightDesc'), type: 'number', min: 300, max: 1000, step: 50, unit: 'px' },
    truncateLength: { label: t('settings_truncateLength'), description: t('settings_truncateLengthDesc'), type: 'number', min: 20, max: 200, step: 10, unit: 'chars' },
    toastDurationMs: { label: t('settings_toastDuration'), description: t('settings_toastDurationDesc'), type: 'number', min: 2000, max: 10000, step: 500, unit: 'ms' },
    aiEnabled: { label: t('settings_aiEnabled'), description: t('settings_aiEnabledDesc'), type: 'switch' },
    aiProvider: {
      label: t('settings_aiProvider'),
      description: t('settings_aiProviderDesc'),
      type: 'select',
      options: getAvailableProviders().map((provider) => ({ value: provider.id, label: provider.name })),
    },
    aiModel: {
      label: t('settings_aiModel'),
      description: t('settings_aiModelDesc'),
      type: 'select',
      options: getAvailableProviders().flatMap((provider) =>
        getModelsForProvider(provider.id).map((model) => ({
          value: model.id,
          label: `${model.name} (${getProviderName(provider.id)})`,
        })),
      ),
    },
    aiMaxRecommendations: { label: t('settings_aiMaxRecommendations'), description: t('settings_aiMaxRecommendationsDesc'), type: 'number', min: 1, max: 10, step: 1 },
    aiAutoTriggerOnOpen: { label: t('settings_aiAutoTrigger'), description: t('settings_aiAutoTriggerDesc'), type: 'switch' },
    aiMaxCategories: { label: t('settings_aiMaxCategories'), description: t('settings_aiMaxCategoriesDesc'), type: 'number', min: -1, max: 100, step: 1 },
    aiMinItemsPerFolder: { label: t('settings_aiMinItemsPerFolder'), description: t('settings_aiMinItemsPerFolderDesc'), type: 'number', min: 1, max: 100, step: 1 },
    aiMaxItemsPerFolder: { label: t('settings_aiMaxItemsPerFolder'), description: t('settings_aiMaxItemsPerFolderDesc'), type: 'number', min: -1, max: 500, step: 1 },
    exportFilenamePrefix: { label: t('settings_exportFilenamePrefix'), description: t('settings_exportFilenamePrefixDesc'), type: 'text' },
    exportFilenameMaxLength: { label: t('settings_exportFilenameMaxLength'), description: t('settings_exportFilenameMaxLengthDesc'), type: 'number', min: 10, max: 100, step: 5 },
    exportJsonIndentSize: { label: t('settings_exportJsonIndentSize'), description: t('settings_exportJsonIndentSizeDesc'), type: 'number', min: 1, max: 8, step: 1 },
    exportHtmlIndentSpaces: { label: t('settings_exportHtmlIndentSpaces'), description: t('settings_exportHtmlIndentSpacesDesc'), type: 'number', min: 1, max: 8, step: 1 },
    exportMarkdownIndentSpaces: { label: t('settings_exportMarkdownIndentSpaces'), description: t('settings_exportMarkdownIndentSpacesDesc'), type: 'number', min: 1, max: 8, step: 1 },
    exportIncludeDates: { label: t('settings_exportIncludeDates'), description: t('settings_exportIncludeDatesDesc'), type: 'switch' },
    exportIncludeUrls: { label: t('settings_exportIncludeUrls'), description: t('settings_exportIncludeUrlsDesc'), type: 'switch' },
    contextMenuEnabled: { label: t('settings_contextMenuEnabled'), description: t('settings_contextMenuEnabledDesc'), type: 'switch' },
    contextMenuBookmarkNaming: {
      label: t('settings_contextMenuNaming'),
      description: t('settings_contextMenuNamingDesc'),
      type: 'select',
      options: [
        { value: 'link_text', label: t('settings_namingLinkText') },
        { value: 'page_title', label: t('settings_namingPageTitle') },
        { value: 'link_url', label: t('settings_namingLinkUrl') },
      ],
    },
    aiContextPackerEnabled: { label: t('settings_aiContextPackerEnabled'), description: t('settings_aiContextPackerEnabledDesc'), type: 'switch' },
    aiContextPackerDefaultScope: { label: t('settings_aiContextPackerDefaultScope'), description: t('settings_aiContextPackerDefaultScopeDesc'), type: 'select', options: scopeOptions() },
    aiContextPackerOutputFormat: { label: t('settings_aiContextPackerOutputFormat'), description: t('settings_aiContextPackerOutputFormatDesc'), type: 'select', options: [{ value: 'markdown', label: 'Markdown' }, { value: 'xml', label: 'XML' }] },
    aiContextPackerIncludeFolderPath: { label: t('settings_aiContextPackerIncludeFolderPath'), description: t('settings_aiContextPackerIncludeFolderPathDesc'), type: 'switch' },
    aiContextPackerIncludeDates: { label: t('settings_aiContextPackerIncludeDates'), description: t('settings_aiContextPackerIncludeDatesDesc'), type: 'switch' },
    aiContextPackerIncludeTags: { label: t('settings_aiContextPackerIncludeTags'), description: t('settings_aiContextPackerIncludeTagsDesc'), type: 'switch' },
    aiContextPackerIncludeSummaries: { label: t('settings_aiContextPackerIncludeSummaries'), description: t('settings_aiContextPackerIncludeSummariesDesc'), type: 'switch' },
    aiContextPackerMaxItems: { label: t('settings_aiContextPackerMaxItems'), description: t('settings_aiContextPackerMaxItemsDesc'), type: 'number', min: 1, max: 2000, step: 10 },
    aiContextPackerMaxDepth: { label: t('settings_aiContextPackerMaxDepth'), description: t('settings_aiContextPackerMaxDepthDesc'), type: 'number', min: 1, max: 20, step: 1 },
    aiContextPackerExcerptLength: { label: t('settings_aiContextPackerExcerptLength'), description: t('settings_aiContextPackerExcerptLengthDesc'), type: 'number', min: 40, max: 2000, step: 10 },
    autoTaggingEnabled: { label: t('settings_autoTaggingEnabled'), description: t('settings_autoTaggingEnabledDesc'), type: 'switch' },
    autoTaggingDefaultScope: { label: t('settings_autoTaggingDefaultScope'), description: t('settings_autoTaggingDefaultScopeDesc'), type: 'select', options: scopeOptions() },
    autoTaggingMinTags: { label: t('settings_autoTaggingMinTags'), description: t('settings_autoTaggingMinTagsDesc'), type: 'number', min: 1, max: 20, step: 1 },
    autoTaggingMaxTags: { label: t('settings_autoTaggingMaxTags'), description: t('settings_autoTaggingMaxTagsDesc'), type: 'number', min: 1, max: 20, step: 1 },
    autoTaggingTagStyle: { label: t('settings_autoTaggingTagStyle'), description: t('settings_autoTaggingTagStyleDesc'), type: 'select', options: [{ value: 'kebab-case', label: 'kebab-case' }, { value: 'snake_case', label: 'snake_case' }, { value: 'lowercase', label: 'lowercase' }] },
    autoTaggingMergeMode: { label: t('settings_autoTaggingMergeMode'), description: t('settings_autoTaggingMergeModeDesc'), type: 'select', options: mergeModeOptions() },
    autoTaggingDedupeTags: { label: t('settings_autoTaggingDedupeTags'), description: t('settings_autoTaggingDedupeTagsDesc'), type: 'switch' },
    summarizerEnabled: { label: t('settings_summarizerEnabled'), description: t('settings_summarizerEnabledDesc'), type: 'switch' },
    summarizerDefaultScope: { label: t('settings_summarizerDefaultScope'), description: t('settings_summarizerDefaultScopeDesc'), type: 'select', options: scopeOptions() },
    summarizerSummaryLength: { label: t('settings_summarizerSummaryLength'), description: t('settings_summarizerSummaryLengthDesc'), type: 'number', min: 40, max: 1000, step: 10 },
    summarizerIncludeDomainHint: { label: t('settings_summarizerIncludeDomainHint'), description: t('settings_summarizerIncludeDomainHintDesc'), type: 'switch' },
    summarizerMergeMode: { label: t('settings_summarizerMergeMode'), description: t('settings_summarizerMergeModeDesc'), type: 'select', options: mergeModeOptions() },
    reorganizationEnabled: { label: t('settings_reorganizationEnabled'), description: t('settings_reorganizationEnabledDesc'), type: 'switch' },
    reorganizationDefaultScope: { label: t('settings_reorganizationDefaultScope'), description: t('settings_reorganizationDefaultScopeDesc'), type: 'select', options: scopeOptions() },
    reorganizationDryRunFirst: { label: t('settings_reorganizationDryRunFirst'), description: t('settings_reorganizationDryRunFirstDesc'), type: 'switch' },
    reorganizationMinConfidence: { label: t('settings_reorganizationMinConfidence'), description: t('settings_reorganizationMinConfidenceDesc'), type: 'number', min: 0, max: 1, step: 0.05 },
    reorganizationBatchSize: { label: t('settings_reorganizationBatchSize'), description: t('settings_reorganizationBatchSizeDesc'), type: 'number', min: 1, max: 1000, step: 10 },
    duplicatesEnabled: { label: t('settings_duplicatesEnabled'), description: t('settings_duplicatesEnabledDesc'), type: 'switch' },
    duplicatesDefaultScope: { label: t('settings_duplicatesDefaultScope'), description: t('settings_duplicatesDefaultScopeDesc'), type: 'select', options: scopeOptions() },
    duplicatesMatchStrategy: { label: t('settings_duplicatesMatchStrategy'), description: t('settings_duplicatesMatchStrategyDesc'), type: 'select', options: [{ value: 'exact_url', label: 'Exact URL' }, { value: 'normalized_url', label: 'Normalized URL' }, { value: 'title_url', label: 'Title + URL' }, { value: 'title_only', label: 'Title only' }] },
    duplicatesNormalizeWww: { label: t('settings_duplicatesNormalizeWww'), description: t('settings_duplicatesNormalizeWwwDesc'), type: 'switch' },
    duplicatesIgnoreProtocol: { label: t('settings_duplicatesIgnoreProtocol'), description: t('settings_duplicatesIgnoreProtocolDesc'), type: 'switch' },
    duplicatesIgnoreTrailingSlash: { label: t('settings_duplicatesIgnoreTrailingSlash'), description: t('settings_duplicatesIgnoreTrailingSlashDesc'), type: 'switch' },
    duplicatesKeepRule: { label: t('settings_duplicatesKeepRule'), description: t('settings_duplicatesKeepRuleDesc'), type: 'select', options: [{ value: 'oldest', label: 'Oldest' }, { value: 'newest', label: 'Newest' }, { value: 'first', label: 'First found' }] },
    duplicatesMaxGroups: { label: t('settings_duplicatesMaxGroups'), description: t('settings_duplicatesMaxGroupsDesc'), type: 'number', min: 1, max: 5000, step: 10 },
    urlCleanerEnabled: { label: t('settings_urlCleanerEnabled'), description: t('settings_urlCleanerEnabledDesc'), type: 'switch' },
    urlCleanerDefaultScope: { label: t('settings_urlCleanerDefaultScope'), description: t('settings_urlCleanerDefaultScopeDesc'), type: 'select', options: scopeOptions() },
    urlCleanerRemoveHash: { label: t('settings_urlCleanerRemoveHash'), description: t('settings_urlCleanerRemoveHashDesc'), type: 'switch' },
    urlCleanerSortQueryParams: { label: t('settings_urlCleanerSortQueryParams'), description: t('settings_urlCleanerSortQueryParamsDesc'), type: 'switch' },
    urlCleanerDedupeQueryParams: { label: t('settings_urlCleanerDedupeQueryParams'), description: t('settings_urlCleanerDedupeQueryParamsDesc'), type: 'switch' },
    urlCleanerPreserveParams: { label: t('settings_urlCleanerPreserveParams'), description: t('settings_urlCleanerPreserveParamsDesc'), type: 'text' },
    urlCleanerRemoveParams: { label: t('settings_urlCleanerRemoveParams'), description: t('settings_urlCleanerRemoveParamsDesc'), type: 'text' },
    deadLinksEnabled: { label: t('settings_deadLinksEnabled'), description: t('settings_deadLinksEnabledDesc'), type: 'switch' },
    deadLinksDefaultScope: { label: t('settings_deadLinksDefaultScope'), description: t('settings_deadLinksDefaultScopeDesc'), type: 'select', options: scopeOptions() },
    deadLinksRequestTimeoutMs: { label: t('settings_deadLinksRequestTimeoutMs'), description: t('settings_deadLinksRequestTimeoutMsDesc'), type: 'number', min: 1000, max: 60000, step: 500 },
    deadLinksConcurrency: { label: t('settings_deadLinksConcurrency'), description: t('settings_deadLinksConcurrencyDesc'), type: 'number', min: 1, max: 20, step: 1 },
    deadLinksRetryCount: { label: t('settings_deadLinksRetryCount'), description: t('settings_deadLinksRetryCountDesc'), type: 'number', min: 0, max: 10, step: 1 },
    deadLinksFollowRedirects: { label: t('settings_deadLinksFollowRedirects'), description: t('settings_deadLinksFollowRedirectsDesc'), type: 'switch' },
    deadLinksSuccessStatuses: { label: t('settings_deadLinksSuccessStatuses'), description: t('settings_deadLinksSuccessStatusesDesc'), type: 'text' },
    metadataFetcherEnabled: { label: t('settings_metadataFetcherEnabled'), description: t('settings_metadataFetcherEnabledDesc'), type: 'switch' },
    metadataFetcherDefaultScope: { label: t('settings_metadataFetcherDefaultScope'), description: t('settings_metadataFetcherDefaultScopeDesc'), type: 'select', options: scopeOptions() },
    metadataFetcherOverwriteTitles: { label: t('settings_metadataFetcherOverwriteTitles'), description: t('settings_metadataFetcherOverwriteTitlesDesc'), type: 'switch' },
    metadataFetcherFetchFavicons: { label: t('settings_metadataFetcherFetchFavicons'), description: t('settings_metadataFetcherFetchFaviconsDesc'), type: 'switch' },
    metadataFetcherFetchDescriptions: { label: t('settings_metadataFetcherFetchDescriptions'), description: t('settings_metadataFetcherFetchDescriptionsDesc'), type: 'switch' },
    metadataFetcherRequestTimeoutMs: { label: t('settings_metadataFetcherRequestTimeoutMs'), description: t('settings_metadataFetcherRequestTimeoutMsDesc'), type: 'number', min: 1000, max: 60000, step: 500 },
    metadataFetcherConcurrency: { label: t('settings_metadataFetcherConcurrency'), description: t('settings_metadataFetcherConcurrencyDesc'), type: 'number', min: 1, max: 20, step: 1 },
    privacyScannerEnabled: { label: t('settings_privacyScannerEnabled'), description: t('settings_privacyScannerEnabledDesc'), type: 'switch' },
    privacyScannerDefaultScope: { label: t('settings_privacyScannerDefaultScope'), description: t('settings_privacyScannerDefaultScopeDesc'), type: 'select', options: scopeOptions() },
    privacyScannerScanTitles: { label: t('settings_privacyScannerScanTitles'), description: t('settings_privacyScannerScanTitlesDesc'), type: 'switch' },
    privacyScannerScanQueryParams: { label: t('settings_privacyScannerScanQueryParams'), description: t('settings_privacyScannerScanQueryParamsDesc'), type: 'switch' },
    privacyScannerScanFragments: { label: t('settings_privacyScannerScanFragments'), description: t('settings_privacyScannerScanFragmentsDesc'), type: 'switch' },
    privacyScannerSensitiveParams: { label: t('settings_privacyScannerSensitiveParams'), description: t('settings_privacyScannerSensitiveParamsDesc'), type: 'text' },
    privacyScannerEmailDetection: { label: t('settings_privacyScannerEmailDetection'), description: t('settings_privacyScannerEmailDetectionDesc'), type: 'switch' },
    privacyScannerUuidDetection: { label: t('settings_privacyScannerUuidDetection'), description: t('settings_privacyScannerUuidDetectionDesc'), type: 'switch' },
    statisticsEnabled: { label: t('settings_statisticsEnabled'), description: t('settings_statisticsEnabledDesc'), type: 'switch' },
    statisticsDefaultScope: { label: t('settings_statisticsDefaultScope'), description: t('settings_statisticsDefaultScopeDesc'), type: 'select', options: scopeOptions() },
    statisticsIncludeDomains: { label: t('settings_statisticsIncludeDomains'), description: t('settings_statisticsIncludeDomainsDesc'), type: 'switch' },
    statisticsIncludeFolders: { label: t('settings_statisticsIncludeFolders'), description: t('settings_statisticsIncludeFoldersDesc'), type: 'switch' },
    statisticsIncludeDuplicates: { label: t('settings_statisticsIncludeDuplicates'), description: t('settings_statisticsIncludeDuplicatesDesc'), type: 'switch' },
    statisticsIncludeProtocols: { label: t('settings_statisticsIncludeProtocols'), description: t('settings_statisticsIncludeProtocolsDesc'), type: 'switch' },
    statisticsIncludeDepthBreakdown: { label: t('settings_statisticsIncludeDepthBreakdown'), description: t('settings_statisticsIncludeDepthBreakdownDesc'), type: 'switch' },
    statisticsTopN: { label: t('settings_statisticsTopN'), description: t('settings_statisticsTopNDesc'), type: 'number', min: 1, max: 100, step: 1 },
    dataShowExport: { label: t('settings_dataShowExport'), description: t('settings_dataShowExportDesc'), type: 'switch' },
    dataShowImport: { label: t('settings_dataShowImport'), description: t('settings_dataShowImportDesc'), type: 'switch' },
    dataDefaultExportFormat: { label: t('settings_dataDefaultExportFormat'), description: t('settings_dataDefaultExportFormatDesc'), type: 'select', options: [{ value: 'html', label: 'HTML' }, { value: 'json', label: 'JSON' }, { value: 'markdown', label: 'Markdown' }, { value: 'csv', label: 'CSV' }] },
  };
}

function scopeOptions() {
  return [
    { value: 'folder', label: t('settings_scopeFolder') },
    { value: 'all', label: t('settings_scopeAll') },
    { value: 'both', label: t('settings_scopeBoth') },
  ];
}

function mergeModeOptions() {
  return [
    { value: 'append', label: t('settings_mergeAppend') },
    { value: 'replace', label: t('settings_mergeReplace') },
  ];
}

export function getSettingsFieldMeta(): Record<keyof Settings, SettingsFieldMeta> {
  return buildFieldMeta();
}
