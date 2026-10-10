/**
 * Settings schema using Zod. Defaults and numeric bounds come from config/settings/**.toml, and
 * each setting is defined once below: its zod schema and its Options field meta are both derived
 * from that one definition, so a bound or option list cannot drift between validation and the UI.
 */

import { z } from 'zod';

type SettingsFieldType = 'switch' | 'select' | 'number' | 'text';

export type SettingsFieldMeta = {
  label: string;
  description: string;
  type: SettingsFieldType;
  options?: { value: string | number; label: string; group?: string; iconUrl?: string }[];
  /** Long option lists get a search box instead of a plain select. */
  searchable?: boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** -1 means "no limit"; the slider shows it as 0 and never stores 0. */
  unlimited?: boolean;
  /** Comma-separated list input; values are parsed when the input is committed. */
  list?: 'string' | 'number';
  /** Numbers use a stepper; a slider suits only fractional values such as a confidence. */
  control?: 'slider';
};

type SettingsCategoryMeta = {
  label: string;
  description: string;
  fields: readonly (keyof Settings)[];
};

// ============================================================================
// Config: config/settings/**.toml
// ============================================================================

/**
 * A numeric setting in the TOML: `{ default, min, max, step }`, plus `integer` (whole numbers
 * only), `unlimited` (-1 means no limit), and `clamp` (out-of-range values snap to the nearest
 * bound instead of resetting to the default).
 */
const numberSettingSchema = z
  .strictObject({
    default: z.number(),
    min: z.number(),
    max: z.number(),
    step: z.number().positive(),
    integer: z.boolean().optional(),
    unlimited: z.boolean().optional(),
    clamp: z.boolean().optional(),
  })
  .superRefine((setting, ctx) => {
    if (setting.min > setting.max) {
      ctx.addIssue({ code: 'custom', message: 'min is greater than max' });
    }
    const unlimitedDefault = setting.unlimited === true && setting.default === -1;
    if (!unlimitedDefault && (setting.default < setting.min || setting.default > setting.max)) {
      ctx.addIssue({ code: 'custom', message: 'default is outside min..max' });
    }
    if (setting.integer && !Number.isInteger(setting.default)) {
      ctx.addIssue({ code: 'custom', message: 'default must be a whole number' });
    }
  });

export type NumberSetting = z.output<typeof numberSettingSchema>;

/** A text setting with length limits: `{ default, min_length, max_length }`. */
const textSettingSchema = z
  .strictObject({
    default: z.string(),
    min_length: z.number().int().nonnegative(),
    max_length: z.number().int().positive(),
  })
  .refine(
    (setting) =>
      setting.default.length >= setting.min_length && setting.default.length <= setting.max_length,
    'default is outside min_length..max_length',
  );

/** Every settings file, as one tree; each key is checked by the definition that reads it. */
const settingsConfig = readConfig('settings', z.record(z.string(), z.unknown()));
const readSettingsPaths = new Set<string>();

/** Validated value at `path` under config/settings (e.g. `search.debounce_ms`). */
function configValue<S extends z.ZodType>(path: string, schema: S): z.output<S> {
  if (readSettingsPaths.has(path)) throw new Error(`settings.${path} is read twice`);
  readSettingsPaths.add(path);
  const value = path
    .split('.')
    .reduce<unknown>((node, key) => (isPlainObject(node) ? node[key] : undefined), settingsConfig);
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`Invalid config settings.${path}: ${issues}`);
  }
  return result.data;
}

/** Fails on any settings key no definition reads, so a typo in the TOML is a load error. */
function assertEverySettingsKeyRead(node: Record<string, unknown>, prefix = ''): void {
  for (const [key, value] of Object.entries(node)) {
    const path = `${prefix}${key}`;
    if (readSettingsPaths.has(path)) continue;
    if (isPlainObject(value) && !('default' in value)) {
      assertEverySettingsKeyRead(value, `${path}.`);
    } else {
      throw new Error(`Unknown config key settings.${path}`);
    }
  }
}

// ============================================================================
// Value types shared with the rest of the extension
// ============================================================================

// Featured providers from config/ai/providers plus the bundled models.dev catalog.
const aiProviderSchema = z.enum(getAvailableProviders().map((provider) => provider.id));

export const themeSchema = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof themeSchema>;

export const sortOrderSchema = z.enum(['date', 'alphabetical', 'folders']);
export type SortOrder = z.infer<typeof sortOrderSchema>;

export const languageSchema = z.enum([AUTO_LANGUAGE, ...SUPPORTED_LOCALES]);
export type Language = z.infer<typeof languageSchema>;

export const faviconSizeSchema = z.literal([16, 24, 32]);
export type FaviconSize = z.infer<typeof faviconSizeSchema>;

export const maxSearchResultsSchema = z.literal([10, 20, 50, 100]);

export const httpStatusCodeSchema = z.number().int().min(100).max(599);

const toolScopeSchema = z.enum(['folder', 'all']);
const contextMenuNamingSchema = z.enum(['link_text', 'page_title', 'link_url']);
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
const exportFormatSchema = z.enum(['html', 'json', 'markdown', 'csv']);

/**
 * Which scopes each tool can run on. A tool limited to one scope has no `default_scope` in its
 * config file and always stores that scope.
 */
export const TOOL_SCOPE_CAPABILITIES = {
  aiContextPacker: 'both',
  autoTagging: 'folder',
  summarizer: 'folder',
  reorganization: 'both',
  duplicates: 'all',
  urlCleaner: 'both',
  deadLinks: 'both',
  metadataFetcher: 'both',
  siteIcons: 'both',
  privacyScanner: 'all',
  statistics: 'both',
} as const satisfies Record<string, z.infer<typeof toolScopeSchema> | 'both'>;

// ============================================================================
// One definition per setting
// ============================================================================

type FieldDefinition<S extends z.ZodType = z.ZodType> = {
  schema: S;
  meta: () => SettingsFieldMeta;
};

type NumberFieldDefinition = FieldDefinition<z.ZodType<number>> & { bounds: NumberSetting };

/** Units a numeric setting can show, as locale keys so they follow the language. */
const UNIT_MESSAGE_KEYS = {
  ms: 'unit_ms',
  px: 'unit_px',
  chars: 'unit_chars',
  kb: 'unit_kb',
} as const;

type SettingUnit = keyof typeof UNIT_MESSAGE_KEYS;

type FieldExtras = Pick<SettingsFieldMeta, 'control'> & {
  unit?: SettingUnit;
};

/** Field meta for `extras`, with the unit localized when the meta is read. */
function extrasMeta({ unit, ...extras }: FieldExtras): Partial<SettingsFieldMeta> {
  return unit ? { ...extras, unit: t(UNIT_MESSAGE_KEYS[unit]) } : extras;
}

/** Labels follow `settings_<stem>` and `settings_<stem>Desc` in the locale files. */
function fieldLabels(stem: string): Pick<SettingsFieldMeta, 'label' | 'description'> {
  return { label: t(`settings_${stem}`), description: t(`settings_${stem}Desc`) };
}

function switchField(
  path: string,
  stem: string,
  extras: FieldExtras = {},
): FieldDefinition<z.ZodDefault<z.ZodBoolean>> {
  const value = configValue(path, z.boolean());
  return {
    schema: z.boolean().default(value),
    meta: () => ({ ...fieldLabels(stem), type: 'switch', ...extrasMeta(extras) }),
  };
}

/** Out-of-range sizes snap to the nearest limit instead of resetting to the default. */
const clampedNumber = (min: number, max: number) => (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : value;

function numberSchema(bounds: NumberSetting): z.ZodType<number> {
  const base = bounds.integer ? z.number().int() : z.number();
  const ranged = bounds.unlimited
    ? base.max(bounds.max).refine((value) => value === -1 || value >= bounds.min)
    : base.min(bounds.min).max(bounds.max);
  const schema = bounds.clamp
    ? z.preprocess(clampedNumber(bounds.min, bounds.max), ranged)
    : ranged;
  return schema.default(bounds.default);
}

function numberField(path: string, stem: string, extras: FieldExtras = {}): NumberFieldDefinition {
  const bounds = configValue(path, numberSettingSchema);
  return {
    bounds,
    schema: numberSchema(bounds),
    meta: () => ({
      ...fieldLabels(stem),
      type: 'number',
      min: bounds.min,
      max: bounds.max,
      step: bounds.step,
      ...(bounds.unlimited ? { unlimited: true } : {}),
      ...extrasMeta(extras),
    }),
  };
}

function textField(path: string, stem: string): FieldDefinition<z.ZodDefault<z.ZodString>> {
  const setting = configValue(path, z.union([z.string(), textSettingSchema]));
  const schema =
    typeof setting === 'string'
      ? z.string().default(setting)
      : z.string().min(setting.min_length).max(setting.max_length).default(setting.default);
  return { schema, meta: () => ({ ...fieldLabels(stem), type: 'text' }) };
}

function listField<S extends z.ZodArray<z.ZodType<string | number>>>(
  path: string,
  stem: string,
  schema: S,
  list: 'string' | 'number',
): FieldDefinition<z.ZodDefault<S>> {
  const value = configValue(path, schema);
  return {
    schema: schema.default(value as z.util.NoUndefined<z.output<S>>),
    meta: () => ({ ...fieldLabels(stem), type: 'text', list }),
  };
}

type OptionValues = Readonly<Record<string, string>>;

/** A select whose options are the values of `schema`, labelled by `label`. */
function enumField<T extends OptionValues>(
  path: string,
  stem: string,
  schema: z.ZodEnum<T>,
  label: (value: T[keyof T]) => string,
): FieldDefinition<z.ZodDefault<z.ZodEnum<T>>> {
  const value = configValue(path, schema);
  return {
    schema: schema.default(value as z.util.NoUndefined<T[keyof T]>),
    meta: () => ({
      ...fieldLabels(stem),
      type: 'select',
      options: schema.options.map((option) => ({ value: option, label: label(option) })),
    }),
  };
}

function literalField<T extends number>(
  path: string,
  stem: string,
  schema: z.ZodLiteral<T>,
  label: (value: T) => string,
): FieldDefinition<z.ZodDefault<z.ZodLiteral<T>>> {
  const value = configValue(path, schema);
  return {
    schema: schema.default(value as z.util.NoUndefined<T>),
    meta: () => ({
      ...fieldLabels(stem),
      type: 'select',
      options: [...schema.values].map((option) => ({ value: option, label: label(option) })),
    }),
  };
}

type ScopeValue = z.infer<typeof toolScopeSchema>;

const scopeLabel = (scope: ScopeValue) =>
  scope === 'folder' ? t('settings_scopeFolder') : t('settings_scopeAll');

/**
 * A tool's default scope: selectable (from `default_scope` in its config file) when the tool
 * supports both scopes, otherwise fixed. Unsupported or malformed saved scopes fall back without
 * failing the other settings.
 */
function scopeField(
  tool: string,
  stem: string,
  capability: 'both',
): FieldDefinition<z.ZodDefault<z.ZodCatch<typeof toolScopeSchema>>>;
function scopeField<S extends ScopeValue>(
  tool: string,
  stem: string,
  capability: S,
): FieldDefinition<z.ZodDefault<z.ZodCatch<z.ZodLiteral<S>>>>;
function scopeField(tool: string, stem: string, capability: ScopeValue | 'both'): FieldDefinition {
  const scopes = capability === 'both' ? toolScopeSchema.options : [capability];
  const fallback =
    capability === 'both'
      ? configValue(`tools.${tool}.default_scope`, toolScopeSchema)
      : capability;
  const schema =
    capability === 'both'
      ? toolScopeSchema.catch(fallback).default(fallback)
      : z.literal(fallback).catch(fallback).default(fallback);
  return {
    schema,
    meta: () => ({
      ...fieldLabels(stem),
      type: 'select',
      options: scopes.map((scope) => ({ value: scope, label: scopeLabel(scope) })),
    }),
  };
}

const sameAsValue = (value: string) => value;
const mergeModeLabel = (mode: z.infer<typeof mergeModeSchema>) =>
  mode === 'append' ? t('settings_mergeAppend') : t('settings_mergeReplace');

const aiProviderField: FieldDefinition<z.ZodDefault<typeof aiProviderSchema>> = {
  schema: aiProviderSchema.default(configValue('ai.provider', aiProviderSchema)),
  meta: () => ({
    ...fieldLabels('aiProvider'),
    type: 'select',
    searchable: true,
    options: getAvailableProviders().map((provider) => ({
      value: provider.id,
      label: getLocalizedProviderName(provider.id),
      iconUrl: getProviderLogoUrl(provider.id),
      group: t(providerGroupLabelKeys[getProviderGroup(provider.id)]),
    })),
  }),
};

const aiModelField: FieldDefinition<z.ZodDefault<z.ZodString>> = {
  schema: z.string().default(configValue('ai.model', z.string())),
  meta: () => ({
    ...fieldLabels('aiModel'),
    type: 'select',
    options: getAvailableProviders().flatMap((provider) =>
      getModelsForProvider(provider.id).map((model) => ({
        value: model.id,
        label: `${model.name} (${getLocalizedProviderName(provider.id)})`,
      })),
    ),
  }),
};

const fields = {
  language: enumField('appearance.language', 'language', languageSchema, (value) =>
    value === AUTO_LANGUAGE ? t('settings_languageAuto') : getLanguageName(value),
  ),
  theme: enumField(
    'appearance.theme',
    'theme',
    themeSchema,
    (value) =>
      ({
        system: t('settings_themeSystem'),
        light: t('settings_themeLight'),
        dark: t('settings_themeDark'),
      })[value],
  ),
  showFavicons: switchField('appearance.show_favicons', 'showFavicons'),
  browserIconCache: switchField('appearance.browser_icon_cache', 'browserIconCache'),
  faviconSize: literalField(
    'appearance.favicon_size',
    'faviconSize',
    faviconSizeSchema,
    (value) =>
      ({
        16: t('settings_faviconSmall'),
        24: t('settings_faviconMedium'),
        32: t('settings_faviconLarge'),
      })[value],
  ),

  searchDebounceMs: numberField('search.debounce_ms', 'searchDelay', { unit: 'ms' }),
  maxSearchResults: literalField(
    'search.max_results',
    'maxResults',
    maxSearchResultsSchema,
    (value) => t('settings_results', String(value)),
  ),
  expandFoldersOnSearch: switchField('search.expand_folders_on_search', 'expandFolders'),
  searchHistory: switchField('search.search_history', 'searchHistory'),
  folderMatchesEnabled: switchField('search.folder_matches_enabled', 'folderMatchesEnabled'),
  folderMatchesMax: numberField('search.folder_matches_max', 'folderMatchesMax'),
  folderMatchesTypos: switchField('search.folder_matches_typos', 'folderMatchesTypos'),

  sortOrder: enumField(
    'behavior.sort_order',
    'sortOrder',
    sortOrderSchema,
    (value) =>
      ({
        date: t('settings_sortDate'),
        alphabetical: t('settings_sortAlphabetical'),
        folders: t('settings_sortFolders'),
      })[value],
  ),
  groupByFolders: switchField('behavior.group_by_folders', 'groupByFolders'),
  confirmBeforeDelete: switchField('behavior.confirm_before_delete', 'confirmDelete'),
  defaultNewFolderName: textField('behavior.default_new_folder_name', 'defaultFolderName'),
  recentFoldersMax: numberField('behavior.recent_folders_max', 'recentFoldersMax'),
  recentFoldersEnabled: switchField('behavior.recent_folders_enabled', 'recentFoldersEnabled'),

  popupWidth: numberField('advanced.popup_width', 'popupWidth', { unit: 'px' }),
  popupHeight: numberField('advanced.popup_height', 'popupHeight', { unit: 'px' }),
  truncateLength: numberField('advanced.truncate_length', 'truncateLength', { unit: 'chars' }),
  toastDurationMs: numberField('advanced.toast_duration_ms', 'toastDuration', { unit: 'ms' }),

  aiEnabled: switchField('ai.enabled', 'aiEnabled'),
  aiProvider: aiProviderField,
  aiModel: aiModelField,
  aiMaxRecommendations: numberField('ai.max_recommendations', 'aiMaxRecommendations'),
  aiAutoTriggerOnOpen: switchField('ai.auto_trigger_on_open', 'aiAutoTrigger'),
  aiReadPageContent: switchField('ai.read_page_content', 'aiReadPageContent'),
  aiMaxCategories: numberField('ai.max_categories', 'aiMaxCategories'),
  aiMinItemsPerFolder: numberField('ai.min_items_per_folder', 'aiMinItemsPerFolder'),
  aiMaxItemsPerFolder: numberField('ai.max_items_per_folder', 'aiMaxItemsPerFolder'),

  exportFilenamePrefix: textField('export.filename_prefix', 'exportFilenamePrefix'),
  exportFilenameMaxLength: numberField('export.filename_max_length', 'exportFilenameMaxLength', {
    unit: 'chars',
  }),
  exportJsonIndentSize: numberField('export.json_indent_size', 'exportJsonIndentSize'),
  exportHtmlIndentSpaces: numberField('export.html_indent_spaces', 'exportHtmlIndentSpaces'),
  exportMarkdownIndentSpaces: numberField(
    'export.markdown_indent_spaces',
    'exportMarkdownIndentSpaces',
  ),
  exportIncludeDates: switchField('export.include_dates_by_default', 'exportIncludeDates'),
  exportIncludeUrls: switchField('export.include_urls_by_default', 'exportIncludeUrls'),

  contextMenuEnabled: switchField('context_menu.enabled', 'contextMenuEnabled'),
  contextMenuBookmarkNaming: enumField(
    'context_menu.bookmark_naming',
    'contextMenuNaming',
    contextMenuNamingSchema,
    (value) =>
      ({
        link_text: t('settings_namingLinkText'),
        page_title: t('settings_namingPageTitle'),
        link_url: t('settings_namingLinkUrl'),
      })[value],
  ),

  aiContextPackerEnabled: switchField('tools.ai_context_packer.enabled', 'aiContextPackerEnabled'),
  aiContextPackerDefaultScope: scopeField(
    'ai_context_packer',
    'aiContextPackerDefaultScope',
    TOOL_SCOPE_CAPABILITIES.aiContextPacker,
  ),
  aiContextPackerOutputFormat: enumField(
    'tools.ai_context_packer.output_format',
    'aiContextPackerOutputFormat',
    aiContextFormatSchema,
    (value) => ({ markdown: 'Markdown', xml: 'XML' })[value],
  ),
  aiContextPackerIncludeFolderPath: switchField(
    'tools.ai_context_packer.include_folder_path',
    'aiContextPackerIncludeFolderPath',
  ),
  aiContextPackerIncludeDates: switchField(
    'tools.ai_context_packer.include_dates',
    'aiContextPackerIncludeDates',
  ),
  aiContextPackerIncludeTags: switchField(
    'tools.ai_context_packer.include_tags',
    'aiContextPackerIncludeTags',
  ),
  aiContextPackerIncludeSummaries: switchField(
    'tools.ai_context_packer.include_summaries',
    'aiContextPackerIncludeSummaries',
  ),
  aiContextPackerMaxItems: numberField(
    'tools.ai_context_packer.max_items',
    'aiContextPackerMaxItems',
  ),
  aiContextPackerMaxDepth: numberField(
    'tools.ai_context_packer.max_depth',
    'aiContextPackerMaxDepth',
  ),
  aiContextPackerExcerptLength: numberField(
    'tools.ai_context_packer.excerpt_length',
    'aiContextPackerExcerptLength',
    { unit: 'chars' },
  ),

  autoTaggingEnabled: switchField('tools.auto_tagging.enabled', 'autoTaggingEnabled'),
  autoTaggingDefaultScope: scopeField(
    'auto_tagging',
    'autoTaggingDefaultScope',
    TOOL_SCOPE_CAPABILITIES.autoTagging,
  ),
  autoTaggingMinTags: numberField('tools.auto_tagging.min_tags', 'autoTaggingMinTags'),
  autoTaggingMaxTags: numberField('tools.auto_tagging.max_tags', 'autoTaggingMaxTags'),
  autoTaggingTagStyle: enumField(
    'tools.auto_tagging.tag_style',
    'autoTaggingTagStyle',
    tagStyleSchema,
    sameAsValue,
  ),
  autoTaggingMergeMode: enumField(
    'tools.auto_tagging.merge_mode',
    'autoTaggingMergeMode',
    mergeModeSchema,
    mergeModeLabel,
  ),
  autoTaggingDedupeTags: switchField('tools.auto_tagging.dedupe_tags', 'autoTaggingDedupeTags'),

  summarizerEnabled: switchField('tools.summarizer.enabled', 'summarizerEnabled'),
  summarizerDefaultScope: scopeField(
    'summarizer',
    'summarizerDefaultScope',
    TOOL_SCOPE_CAPABILITIES.summarizer,
  ),
  summarizerSummaryLength: numberField(
    'tools.summarizer.summary_length',
    'summarizerSummaryLength',
    { unit: 'chars' },
  ),
  summarizerIncludeDomainHint: switchField(
    'tools.summarizer.include_domain_hint',
    'summarizerIncludeDomainHint',
  ),
  summarizerMergeMode: enumField(
    'tools.summarizer.merge_mode',
    'summarizerMergeMode',
    mergeModeSchema,
    mergeModeLabel,
  ),

  reorganizationEnabled: switchField('tools.reorganization.enabled', 'reorganizationEnabled'),
  reorganizationDefaultScope: scopeField(
    'reorganization',
    'reorganizationDefaultScope',
    TOOL_SCOPE_CAPABILITIES.reorganization,
  ),
  reorganizationDryRunFirst: switchField(
    'tools.reorganization.dry_run_first',
    'reorganizationDryRunFirst',
  ),
  reorganizationMinConfidence: numberField(
    'tools.reorganization.min_confidence',
    'reorganizationMinConfidence',
    { control: 'slider' },
  ),
  reorganizationBatchSize: numberField(
    'tools.reorganization.batch_size',
    'reorganizationBatchSize',
  ),

  duplicatesEnabled: switchField('tools.duplicates.enabled', 'duplicatesEnabled'),
  duplicatesDefaultScope: scopeField(
    'duplicates',
    'duplicatesDefaultScope',
    TOOL_SCOPE_CAPABILITIES.duplicates,
  ),
  duplicatesMatchStrategy: enumField(
    'tools.duplicates.match_strategy',
    'duplicatesMatchStrategy',
    duplicateMatchStrategySchema,
    (value) =>
      ({
        exact_url: t('settings_duplicatesMatchExactUrl'),
        normalized_url: t('settings_duplicatesMatchNormalizedUrl'),
        title_url: t('settings_duplicatesMatchTitleUrl'),
        title_only: t('settings_duplicatesMatchTitleOnly'),
      })[value],
  ),
  duplicatesNormalizeWww: switchField('tools.duplicates.normalize_www', 'duplicatesNormalizeWww'),
  duplicatesIgnoreProtocol: switchField(
    'tools.duplicates.ignore_protocol',
    'duplicatesIgnoreProtocol',
  ),
  duplicatesIgnoreTrailingSlash: switchField(
    'tools.duplicates.ignore_trailing_slash',
    'duplicatesIgnoreTrailingSlash',
  ),
  duplicatesKeepRule: enumField(
    'tools.duplicates.keep_rule',
    'duplicatesKeepRule',
    duplicateKeepRuleSchema,
    (value) =>
      ({
        oldest: t('settings_duplicatesKeepOldest'),
        newest: t('settings_duplicatesKeepNewest'),
        first: t('settings_duplicatesKeepFirst'),
      })[value],
  ),
  duplicatesMaxGroups: numberField('tools.duplicates.max_groups', 'duplicatesMaxGroups'),

  urlCleanerEnabled: switchField('tools.url_cleaner.enabled', 'urlCleanerEnabled'),
  urlCleanerDefaultScope: scopeField(
    'url_cleaner',
    'urlCleanerDefaultScope',
    TOOL_SCOPE_CAPABILITIES.urlCleaner,
  ),
  urlCleanerRemoveHash: switchField('tools.url_cleaner.remove_hash', 'urlCleanerRemoveHash'),
  urlCleanerSortQueryParams: switchField(
    'tools.url_cleaner.sort_query_params',
    'urlCleanerSortQueryParams',
  ),
  urlCleanerDedupeQueryParams: switchField(
    'tools.url_cleaner.dedupe_query_params',
    'urlCleanerDedupeQueryParams',
  ),
  urlCleanerPreserveParams: listField(
    'tools.url_cleaner.preserve_params',
    'urlCleanerPreserveParams',
    z.array(z.string()),
    'string',
  ),
  urlCleanerRemoveParams: listField(
    'tools.url_cleaner.remove_params',
    'urlCleanerRemoveParams',
    z.array(z.string()),
    'string',
  ),

  deadLinksEnabled: switchField('tools.dead_links.enabled', 'deadLinksEnabled'),
  deadLinksDefaultScope: scopeField(
    'dead_links',
    'deadLinksDefaultScope',
    TOOL_SCOPE_CAPABILITIES.deadLinks,
  ),
  deadLinksRequestTimeoutMs: numberField(
    'tools.dead_links.request_timeout_ms',
    'deadLinksRequestTimeoutMs',
    { unit: 'ms' },
  ),
  deadLinksConcurrency: numberField('tools.dead_links.concurrency', 'deadLinksConcurrency'),
  deadLinksRetryCount: numberField('tools.dead_links.retry_count', 'deadLinksRetryCount'),
  deadLinksFollowRedirects: switchField(
    'tools.dead_links.follow_redirects',
    'deadLinksFollowRedirects',
  ),
  deadLinksSuccessStatuses: listField(
    'tools.dead_links.success_statuses',
    'deadLinksSuccessStatuses',
    z.array(httpStatusCodeSchema).min(1),
    'number',
  ),

  metadataFetcherEnabled: switchField('tools.metadata_fetcher.enabled', 'metadataFetcherEnabled'),
  metadataFetcherDefaultScope: scopeField(
    'metadata_fetcher',
    'metadataFetcherDefaultScope',
    TOOL_SCOPE_CAPABILITIES.metadataFetcher,
  ),
  metadataFetcherOverwriteTitles: switchField(
    'tools.metadata_fetcher.overwrite_titles',
    'metadataFetcherOverwriteTitles',
  ),
  metadataFetcherFetchDescriptions: switchField(
    'tools.metadata_fetcher.fetch_descriptions',
    'metadataFetcherFetchDescriptions',
  ),
  metadataFetcherRequestTimeoutMs: numberField(
    'tools.metadata_fetcher.request_timeout_ms',
    'metadataFetcherRequestTimeoutMs',
    { unit: 'ms' },
  ),
  metadataFetcherConcurrency: numberField(
    'tools.metadata_fetcher.concurrency',
    'metadataFetcherConcurrency',
  ),

  siteIconsEnabled: switchField('tools.site_icons.enabled', 'siteIconsEnabled'),
  siteIconsDefaultScope: scopeField(
    'site_icons',
    'siteIconsDefaultScope',
    TOOL_SCOPE_CAPABILITIES.siteIcons,
  ),
  siteIconsPreferredSize: numberField('tools.site_icons.preferred_size', 'siteIconsPreferredSize', {
    unit: 'px',
  }),
  siteIconsMaxIconKb: numberField('tools.site_icons.max_icon_kb', 'siteIconsMaxIconKb', {
    unit: 'kb',
  }),
  siteIconsMaxCacheKb: numberField('tools.site_icons.max_cache_kb', 'siteIconsMaxCacheKb', {
    unit: 'kb',
  }),

  privacyScannerEnabled: switchField('tools.privacy_scanner.enabled', 'privacyScannerEnabled'),
  privacyScannerDefaultScope: scopeField(
    'privacy_scanner',
    'privacyScannerDefaultScope',
    TOOL_SCOPE_CAPABILITIES.privacyScanner,
  ),
  privacyScannerScanTitles: switchField(
    'tools.privacy_scanner.scan_titles',
    'privacyScannerScanTitles',
  ),
  privacyScannerScanQueryParams: switchField(
    'tools.privacy_scanner.scan_query_params',
    'privacyScannerScanQueryParams',
  ),
  privacyScannerScanFragments: switchField(
    'tools.privacy_scanner.scan_fragments',
    'privacyScannerScanFragments',
  ),
  privacyScannerSensitiveParams: listField(
    'tools.privacy_scanner.sensitive_params',
    'privacyScannerSensitiveParams',
    z.array(z.string()),
    'string',
  ),
  privacyScannerEmailDetection: switchField(
    'tools.privacy_scanner.email_detection',
    'privacyScannerEmailDetection',
  ),
  privacyScannerUuidDetection: switchField(
    'tools.privacy_scanner.uuid_detection',
    'privacyScannerUuidDetection',
  ),

  statisticsEnabled: switchField('tools.statistics.enabled', 'statisticsEnabled'),
  statisticsDefaultScope: scopeField(
    'statistics',
    'statisticsDefaultScope',
    TOOL_SCOPE_CAPABILITIES.statistics,
  ),
  statisticsIncludeDomains: switchField(
    'tools.statistics.include_domains',
    'statisticsIncludeDomains',
  ),
  statisticsIncludeFolders: switchField(
    'tools.statistics.include_folders',
    'statisticsIncludeFolders',
  ),
  statisticsIncludeDuplicates: switchField(
    'tools.statistics.include_duplicates',
    'statisticsIncludeDuplicates',
  ),
  statisticsIncludeProtocols: switchField(
    'tools.statistics.include_protocols',
    'statisticsIncludeProtocols',
  ),
  statisticsIncludeDepthBreakdown: switchField(
    'tools.statistics.include_depth_breakdown',
    'statisticsIncludeDepthBreakdown',
  ),
  statisticsTopN: numberField('tools.statistics.top_n', 'statisticsTopN'),

  dataShowExport: switchField('tools.data.show_export', 'dataShowExport'),
  dataShowImport: switchField('tools.data.show_import', 'dataShowImport'),
  dataDefaultExportFormat: enumField(
    'tools.data.default_export_format',
    'dataDefaultExportFormat',
    exportFormatSchema,
    (value) => ({ html: 'HTML', json: 'JSON', markdown: 'Markdown', csv: 'CSV' })[value],
  ),
} satisfies Record<string, FieldDefinition>;

assertEverySettingsKeyRead(settingsConfig);

type SettingsFields = typeof fields;
type SettingsKey = keyof SettingsFields;

const settingsShape = Object.fromEntries(
  Object.entries(fields).map(([key, field]) => [key, field.schema]),
) as { [K in SettingsKey]: SettingsFields[K]['schema'] };

export const settingsSchema = z.object(settingsShape).superRefine((value, ctx) => {
  if (value.autoTaggingMinTags > value.autoTaggingMaxTags) {
    ctx.addIssue({
      code: 'custom',
      path: ['autoTaggingMinTags'],
      message: 'Minimum tags cannot exceed maximum tags',
    });
  }

  if (
    value.aiMinItemsPerFolder > 0 &&
    value.aiMaxItemsPerFolder > 0 &&
    value.aiMinItemsPerFolder > value.aiMaxItemsPerFolder
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['aiMinItemsPerFolder'],
      message: 'Minimum items per folder cannot exceed maximum items per folder',
    });
  }
});

export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = settingsSchema.parse({});

type NumberSettingKey = {
  [K in SettingsKey]: SettingsFields[K] extends NumberFieldDefinition ? K : never;
}[SettingsKey];

/** Default, bounds, and step of every numeric setting, as configured. */
export const SETTING_NUMBER_BOUNDS = Object.fromEntries(
  Object.entries(fields).flatMap(([key, field]) =>
    'bounds' in field ? [[key, field.bounds]] : [],
  ),
) as Readonly<Record<NumberSettingKey, NumberSetting>>;

function buildCategories(): Record<string, SettingsCategoryMeta> {
  return {
    appearance: {
      label: t('settings_appearance'),
      description: t('settings_appearanceDesc'),
      fields: ['language', 'theme', 'showFavicons', 'browserIconCache', 'faviconSize'],
    },
    search: {
      label: t('settings_search'),
      description: t('settings_searchDesc'),
      fields: [
        'searchDebounceMs',
        'maxSearchResults',
        'expandFoldersOnSearch',
        'searchHistory',
        'folderMatchesEnabled',
        'folderMatchesMax',
        'folderMatchesTypos',
      ],
    },
    behavior: {
      label: t('settings_behavior'),
      description: t('settings_behaviorDesc'),
      fields: [
        'sortOrder',
        'groupByFolders',
        'confirmBeforeDelete',
        'defaultNewFolderName',
        'recentFoldersEnabled',
        'recentFoldersMax',
      ],
    },
    advanced: {
      label: t('settings_advanced'),
      description: t('settings_advancedDesc'),
      fields: ['popupWidth', 'popupHeight', 'truncateLength', 'toastDurationMs'],
    },
    ai: {
      label: t('settings_ai'),
      description: t('settings_aiDesc'),
      // The provider and model live on AI services (AIServicesPanel), not in these synced fields.
      fields: [
        'aiEnabled',
        'aiAutoTriggerOnOpen',
        'aiReadPageContent',
        'aiMaxRecommendations',
        'aiMaxCategories',
        'aiMinItemsPerFolder',
        'aiMaxItemsPerFolder',
      ],
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
        'metadataFetcherFetchDescriptions',
        'metadataFetcherRequestTimeoutMs',
        'metadataFetcherConcurrency',
        'siteIconsEnabled',
        'siteIconsDefaultScope',
        'siteIconsPreferredSize',
        'siteIconsMaxIconKb',
        'siteIconsMaxCacheKb',
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

/**
 * Switches that turn on a feature needing a permission the browser may not have granted
 * (`lib/permission-catalog.ts`). Options asks for it when the switch is turned on (it stays off
 * if the user declines), and the feature counts as off while the permission is missing.
 */
export const SETTING_PERMISSIONS = {
  aiEnabled: 'ai',
  aiReadPageContent: 'pageReading',
  browserIconCache: 'browserIcons',
  contextMenuEnabled: 'contextMenu',
} as const satisfies Partial<Record<keyof Settings, PermissionFeature>>;

/** The permission feature a setting turns on, if any. */
export function getSettingPermission(key: keyof Settings): PermissionFeature | undefined {
  return (SETTING_PERMISSIONS as Partial<Record<keyof Settings, PermissionFeature>>)[key];
}

/** False for a setting whose feature this browser lacks (the icon cache in Firefox). */
function isSettingSupported(key: keyof Settings): boolean {
  const feature = getSettingPermission(key);
  return (
    !feature || isPermissionFeatureSupported(feature, import.meta.env.BROWSER as PermissionBrowser)
  );
}

export function getSettingsCategories(): Record<string, SettingsCategoryMeta> {
  return Object.fromEntries(
    Object.entries(buildCategories()).map(([id, category]) => [
      id,
      { ...category, fields: category.fields.filter(isSettingSupported) },
    ]),
  );
}

const localizedProviderNameKeys: Partial<Record<AIProvider, string>> = {
  ollama: 'settings_aiProviderOllama',
  custom: 'settings_aiProviderCustom',
  custom_anthropic: 'settings_aiProviderCustomAnthropic',
};

const providerGroupLabelKeys: Record<AIProviderGroup, string> = {
  featured: 'settings_aiProviderGroupFeatured',
  local: 'settings_aiProviderGroupLocal',
  custom: 'settings_aiProviderGroupCustom',
  catalog: 'settings_aiProviderGroupCatalog',
};

/** Brand names stay as configured; generic provider names are translated. */
export function getLocalizedProviderName(provider: AIProvider): string {
  const key = localizedProviderNameKeys[provider];
  return key ? t(key) : getProviderName(provider);
}

export function getSettingsFieldMeta(): Record<keyof Settings, SettingsFieldMeta> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field.meta()]),
  ) as Record<keyof Settings, SettingsFieldMeta>;
}

export type SettingsFieldGroup = {
  id: string;
  label: string;
  description: string;
  /** On/off settings shown together as one checklist; each keeps its own stored value. */
  fields: readonly (keyof Settings)[];
};

/** Related switches that read better as one checklist than as separate rows. */
export function getSettingsFieldGroups(): SettingsFieldGroup[] {
  return [
    {
      id: 'exportInclude',
      label: t('settings_groupExportInclude'),
      description: t('settings_groupExportIncludeDesc'),
      fields: ['exportIncludeDates', 'exportIncludeUrls'],
    },
    {
      id: 'aiContextPackerInclude',
      label: t('settings_groupAiContextPackerInclude'),
      description: t('settings_groupAiContextPackerIncludeDesc'),
      fields: [
        'aiContextPackerIncludeFolderPath',
        'aiContextPackerIncludeDates',
        'aiContextPackerIncludeTags',
        'aiContextPackerIncludeSummaries',
      ],
    },
    {
      id: 'duplicatesMatching',
      label: t('settings_groupDuplicatesMatching'),
      description: t('settings_groupDuplicatesMatchingDesc'),
      fields: [
        'duplicatesNormalizeWww',
        'duplicatesIgnoreProtocol',
        'duplicatesIgnoreTrailingSlash',
      ],
    },
    {
      id: 'urlCleanerRules',
      label: t('settings_groupUrlCleanerRules'),
      description: t('settings_groupUrlCleanerRulesDesc'),
      fields: ['urlCleanerRemoveHash', 'urlCleanerSortQueryParams', 'urlCleanerDedupeQueryParams'],
    },
    {
      id: 'metadataFetcherOptions',
      label: t('settings_groupMetadataFetcherOptions'),
      description: t('settings_groupMetadataFetcherOptionsDesc'),
      fields: ['metadataFetcherOverwriteTitles', 'metadataFetcherFetchDescriptions'],
    },
    {
      id: 'privacyScannerChecks',
      label: t('settings_groupPrivacyScannerChecks'),
      description: t('settings_groupPrivacyScannerChecksDesc'),
      fields: [
        'privacyScannerScanTitles',
        'privacyScannerScanQueryParams',
        'privacyScannerScanFragments',
        'privacyScannerEmailDetection',
        'privacyScannerUuidDetection',
      ],
    },
    {
      id: 'statisticsInclude',
      label: t('settings_groupStatisticsInclude'),
      description: t('settings_groupStatisticsIncludeDesc'),
      fields: [
        'statisticsIncludeDomains',
        'statisticsIncludeFolders',
        'statisticsIncludeDuplicates',
        'statisticsIncludeProtocols',
        'statisticsIncludeDepthBreakdown',
      ],
    },
    {
      id: 'dataShow',
      label: t('settings_groupDataShow'),
      description: t('settings_groupDataShowDesc'),
      fields: ['dataShowExport', 'dataShowImport'],
    },
  ];
}
