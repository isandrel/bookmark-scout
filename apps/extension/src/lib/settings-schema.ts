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

/** Options content that is not synced settings, drawn by its own component. */
export type SettingsPanelId = 'aiServices' | 'aiActivity' | 'promptLibrary';

/** A titled group of settings inside a category: the Options page's second level. */
export type SettingsSectionMeta = {
  id: string;
  /** Omitted for a category's lead setting, such as the AI switch, which needs no heading. */
  label?: string;
  /**
   * An on/off setting shown as a switch beside the heading, such as a tool's Enable switch.
   * While it is off, the rest of the section is folded away.
   */
  toggle?: keyof Settings;
  fields: readonly (keyof Settings)[];
  /**
   * Technical settings most people never change, under a closed "Advanced settings" fold. Only
   * worth a fold from 3 settings up (fewer stay in `fields`); search and changed values open it.
   */
  advanced?: readonly (keyof Settings)[];
  /** A panel drawn after the section's fields (it brings its own heading). */
  panel?: SettingsPanelId;
};

/** Every field of a section, in display order: the heading switch, the fields, then the fold. */
export function getSectionFields(section: SettingsSectionMeta): (keyof Settings)[] {
  return [...(section.toggle ? [section.toggle] : []), ...section.fields, ...(section.advanced ?? [])];
}

export type SettingsCategoryMeta = {
  label: string;
  description: string;
  sections: readonly SettingsSectionMeta[];
  /** Every field of the category, in section order (search and counts read this). */
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

export const linkOpenTargetSchema = z.enum(['new_tab', 'background_tab', 'current_tab']);
export type LinkOpenTarget = z.infer<typeof linkOpenTargetSchema>;

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
  linkOpenTarget: enumField(
    'behavior.link_open_target',
    'linkOpenTarget',
    linkOpenTargetSchema,
    (value) =>
      ({
        new_tab: t('settings_linkOpenNewTab'),
        background_tab: t('settings_linkOpenBackgroundTab'),
        current_tab: t('settings_linkOpenCurrentTab'),
      })[value],
  ),
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

type SectionSpec = Omit<SettingsSectionMeta, 'label'> & { labelKey?: string };

/** A category from its message keys and sections; `fields` is derived from the sections. */
function category(
  labelKey: string,
  descriptionKey: string,
  sections: readonly SectionSpec[],
): SettingsCategoryMeta {
  const built = sections.map(({ labelKey: key, ...section }) => ({
    ...section,
    ...(key ? { label: t(key) } : {}),
  }));
  return {
    label: t(labelKey),
    description: t(descriptionKey),
    sections: built,
    fields: built.flatMap(getSectionFields),
  };
}

/**
 * The Options page: categories on the left, titled sections on the right, in display order.
 * The AI tool and maintenance categories mirror the manager's Tools sidebar, and their sections
 * reuse the tool titles, so a tool has the same name in both places.
 */
function buildCategories(): Record<string, SettingsCategoryMeta> {
  return {
    search: category('settings_savingSearch', 'settings_savingSearchDesc', [
      {
        id: 'folderMatches',
        labelKey: 'settings_folderMatchesEnabled',
        toggle: 'folderMatchesEnabled',
        fields: ['folderMatchesMax', 'folderMatchesTypos'],
      },
      {
        id: 'search',
        labelKey: 'settings_search',
        fields: ['maxSearchResults', 'expandFoldersOnSearch', 'searchHistory', 'searchDebounceMs'],
      },
      {
        id: 'saving',
        labelKey: 'settings_sectionSaving',
        fields: ['recentFoldersEnabled', 'recentFoldersMax', 'defaultNewFolderName'],
      },
      {
        id: 'contextMenu',
        labelKey: 'settings_contextMenuEnabled',
        toggle: 'contextMenuEnabled',
        fields: ['contextMenuBookmarkNaming'],
      },
    ]),
    appearance: category('settings_appearance', 'settings_appearanceDesc', [
      {
        id: 'themeIcons',
        labelKey: 'settings_sectionThemeIcons',
        fields: ['language', 'theme', 'showFavicons', 'browserIconCache', 'faviconSize'],
      },
      {
        id: 'popup',
        labelKey: 'settings_sectionPopup',
        fields: ['popupWidth', 'popupHeight', 'truncateLength'],
      },
      {
        id: 'notifications',
        labelKey: 'settings_sectionNotifications',
        fields: ['toastDurationMs'],
      },
    ]),
    behavior: category('settings_behavior', 'settings_behaviorDesc', [
      { id: 'tree', labelKey: 'settings_sectionTree', fields: ['sortOrder', 'groupByFolders'] },
      { id: 'links', labelKey: 'settings_sectionLinks', fields: ['linkOpenTarget'] },
      { id: 'deleting', labelKey: 'settings_sectionDeleting', fields: ['confirmBeforeDelete'] },
    ]),
    ai: category('settings_ai', 'settings_aiDesc', [
      // The switch comes first, then the services it turns on (provider and model live there,
      // not in synced settings), then what the services are used for.
      { id: 'enable', fields: ['aiEnabled'], panel: 'aiServices' },
      {
        id: 'suggestions',
        labelKey: 'settings_sectionSuggestions',
        fields: ['aiAutoTriggerOnOpen', 'aiMaxRecommendations'],
      },
      {
        id: 'pageReading',
        labelKey: 'settings_aiReadPageContent',
        fields: ['aiReadPageContent'],
      },
      { id: 'activity', fields: [], panel: 'aiActivity' },
    ]),
    aiTools: category('settings_aiTools', 'settings_aiToolsDesc', [
      { id: 'prompts', fields: [], panel: 'promptLibrary' },
      {
        id: 'contextPacker',
        labelKey: 'tools_exportAI',
        toggle: 'aiContextPackerEnabled',
        fields: [
          'aiContextPackerDefaultScope',
          'aiContextPackerOutputFormat',
          'aiContextPackerIncludeFolderPath',
          'aiContextPackerIncludeDates',
          'aiContextPackerIncludeTags',
          'aiContextPackerIncludeSummaries',
        ],
        advanced: ['aiContextPackerMaxItems', 'aiContextPackerMaxDepth', 'aiContextPackerExcerptLength'],
      },
      {
        id: 'autoTagging',
        labelKey: 'tools_autoTagging',
        toggle: 'autoTaggingEnabled',
        fields: [
          'autoTaggingDefaultScope',
          'autoTaggingMinTags',
          'autoTaggingMaxTags',
          'autoTaggingTagStyle',
          'autoTaggingMergeMode',
          'autoTaggingDedupeTags',
        ],
      },
      {
        id: 'summarizer',
        labelKey: 'tools_summarizer',
        toggle: 'summarizerEnabled',
        fields: [
          'summarizerDefaultScope',
          'summarizerSummaryLength',
          'summarizerIncludeDomainHint',
          'summarizerMergeMode',
        ],
      },
      {
        id: 'reorganization',
        labelKey: 'tools_aiReorganize',
        toggle: 'reorganizationEnabled',
        fields: [
          'reorganizationDefaultScope',
          'reorganizationDryRunFirst',
        ],
        advanced: [
          'reorganizationMinConfidence',
          'reorganizationBatchSize',
          'aiMaxCategories',
          'aiMinItemsPerFolder',
          'aiMaxItemsPerFolder',
        ],
      },
    ]),
    maintenance: category('settings_maintenance', 'settings_maintenanceDesc', [
      {
        id: 'duplicates',
        labelKey: 'tools_findDuplicates',
        toggle: 'duplicatesEnabled',
        fields: [
          'duplicatesDefaultScope',
          'duplicatesMatchStrategy',
          'duplicatesNormalizeWww',
          'duplicatesIgnoreProtocol',
          'duplicatesIgnoreTrailingSlash',
          'duplicatesKeepRule',
          'duplicatesMaxGroups',
        ],
      },
      {
        id: 'urlCleaner',
        labelKey: 'tools_cleanUrls',
        toggle: 'urlCleanerEnabled',
        fields: [
          'urlCleanerDefaultScope',
          'urlCleanerRemoveHash',
          'urlCleanerSortQueryParams',
          'urlCleanerDedupeQueryParams',
          'urlCleanerPreserveParams',
          'urlCleanerRemoveParams',
        ],
      },
      {
        id: 'deadLinks',
        labelKey: 'tools_checkDeadLinks',
        toggle: 'deadLinksEnabled',
        fields: [
          'deadLinksDefaultScope',
          'deadLinksFollowRedirects',
        ],
        advanced: [
          'deadLinksRequestTimeoutMs',
          'deadLinksConcurrency',
          'deadLinksRetryCount',
          'deadLinksSuccessStatuses',
        ],
      },
    ]),
    metadataContent: category('settings_metadataContent', 'settings_metadataContentDesc', [
      {
        id: 'metadataFetcher',
        labelKey: 'tools_metadataFetcher',
        toggle: 'metadataFetcherEnabled',
        fields: [
          'metadataFetcherDefaultScope',
          'metadataFetcherOverwriteTitles',
          'metadataFetcherFetchDescriptions',
          'metadataFetcherRequestTimeoutMs',
          'metadataFetcherConcurrency',
        ],
      },
      {
        id: 'siteIcons',
        labelKey: 'tools_siteIcons',
        toggle: 'siteIconsEnabled',
        fields: [
          'siteIconsDefaultScope',
        ],
        advanced: ['siteIconsPreferredSize', 'siteIconsMaxIconKb', 'siteIconsMaxCacheKb'],
      },
    ]),
    security: category('settings_security', 'settings_securityDesc', [
      {
        id: 'privacyScanner',
        labelKey: 'tools_privacyScanner',
        toggle: 'privacyScannerEnabled',
        fields: [
          'privacyScannerDefaultScope',
          'privacyScannerScanTitles',
          'privacyScannerScanQueryParams',
          'privacyScannerScanFragments',
          'privacyScannerSensitiveParams',
          'privacyScannerEmailDetection',
          'privacyScannerUuidDetection',
        ],
      },
    ]),
    analytics: category('settings_analytics', 'settings_analyticsDesc', [
      {
        id: 'statistics',
        labelKey: 'tools_statistics',
        toggle: 'statisticsEnabled',
        fields: [
          'statisticsDefaultScope',
          'statisticsIncludeDomains',
          'statisticsIncludeFolders',
          'statisticsIncludeDuplicates',
          'statisticsIncludeProtocols',
          'statisticsIncludeDepthBreakdown',
          'statisticsTopN',
        ],
      },
    ]),
    data: category('settings_importExport', 'settings_importExportDesc', [
      // Which of the two tools the Tools sidebar shows, as one checklist, leads the page.
      { id: 'tools', fields: ['dataShowExport', 'dataShowImport'] },
      {
        id: 'export',
        labelKey: 'tools_export',
        fields: [
          'dataDefaultExportFormat',
          'exportIncludeDates',
          'exportIncludeUrls',
        ],
        advanced: [
          'exportFilenamePrefix',
          'exportFilenameMaxLength',
          'exportJsonIndentSize',
          'exportHtmlIndentSpaces',
          'exportMarkdownIndentSpaces',
        ],
      },
    ]),
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
      {
        ...category,
        sections: category.sections.map((section) => ({
          ...section,
          fields: section.fields.filter(isSettingSupported),
          ...(section.advanced ? { advanced: section.advanced.filter(isSettingSupported) } : {}),
        })),
        fields: category.fields.filter(isSettingSupported),
      },
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

/**
 * Related settings shown as one row; each keeps its own stored value.
 * - `checklist`: on/off settings as checkboxes.
 * - `pair`: two numbers side by side, such as a width and a height or a minimum and a maximum.
 * - `switch`: an on/off setting with what it controls beside it (numbers and choices) and below
 *   it (on/off options), disabled while it is off. Its label is the switch's own.
 */
export type SettingsFieldGroup = {
  id: string;
  kind: 'checklist' | 'pair' | 'switch';
  label: string;
  description: string;
  fields: readonly (keyof Settings)[];
};

type GroupSpec = { id: string; fields: readonly (keyof Settings)[] } & (
  | { kind: 'checklist' | 'pair'; labelKey: string }
  | { kind: 'switch' }
);

function group(spec: GroupSpec): SettingsFieldGroup {
  if (spec.kind === 'switch') {
    const lead = getSettingsFieldMeta()[spec.fields[0]];
    return { ...spec, label: lead.label, description: lead.description };
  }
  const { labelKey, ...rest } = spec;
  return { ...rest, label: t(labelKey), description: t(`${labelKey}Desc`) };
}

/** Related settings that read better as one row than as separate rows. */
export function getSettingsFieldGroups(): SettingsFieldGroup[] {
  return [
    group({ id: 'popupSize', kind: 'pair', labelKey: 'settings_groupPopupSize', fields: ['popupWidth', 'popupHeight'] }),
    group({
      id: 'tagsPerBookmark',
      kind: 'pair',
      labelKey: 'settings_groupTagsPerBookmark',
      fields: ['autoTaggingMinTags', 'autoTaggingMaxTags'],
    }),
    group({
      id: 'itemsPerFolder',
      kind: 'pair',
      labelKey: 'settings_groupItemsPerFolder',
      fields: ['aiMinItemsPerFolder', 'aiMaxItemsPerFolder'],
    }),
    group({ id: 'recentFolders', kind: 'switch', fields: ['recentFoldersEnabled', 'recentFoldersMax'] }),
    group({ id: 'favicons', kind: 'switch', fields: ['showFavicons', 'faviconSize', 'browserIconCache'] }),
    ...CHECKLISTS.map((spec) => group({ ...spec, kind: 'checklist' })),
  ];
}

const CHECKLISTS: readonly { id: string; labelKey: string; fields: readonly (keyof Settings)[] }[] = [
    {
      id: 'exportInclude',
      labelKey: 'settings_groupExportInclude',
      fields: ['exportIncludeDates', 'exportIncludeUrls'],
    },
    {
      id: 'aiContextPackerInclude',
      labelKey: 'settings_groupAiContextPackerInclude',
      fields: [
        'aiContextPackerIncludeFolderPath',
        'aiContextPackerIncludeDates',
        'aiContextPackerIncludeTags',
        'aiContextPackerIncludeSummaries',
      ],
    },
    {
      id: 'duplicatesMatching',
      labelKey: 'settings_groupDuplicatesMatching',
      fields: [
        'duplicatesNormalizeWww',
        'duplicatesIgnoreProtocol',
        'duplicatesIgnoreTrailingSlash',
      ],
    },
    {
      id: 'urlCleanerRules',
      labelKey: 'settings_groupUrlCleanerRules',
      fields: ['urlCleanerRemoveHash', 'urlCleanerSortQueryParams', 'urlCleanerDedupeQueryParams'],
    },
    {
      id: 'metadataFetcherOptions',
      labelKey: 'settings_groupMetadataFetcherOptions',
      fields: ['metadataFetcherOverwriteTitles', 'metadataFetcherFetchDescriptions'],
    },
    {
      id: 'privacyScannerChecks',
      labelKey: 'settings_groupPrivacyScannerChecks',
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
      labelKey: 'settings_groupStatisticsInclude',
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
      labelKey: 'settings_groupDataShow',
      fields: ['dataShowExport', 'dataShowImport'],
    },
];
