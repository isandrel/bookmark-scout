/**
 * Settings schema using Zod. Defaults and numeric bounds come from config/settings/**.toml, and
 * each setting is defined once below: its zod schema and its Options field meta are both derived
 * from that one definition, so a bound or option list cannot drift between validation and the UI.
 */

import { z } from 'zod';
import { httpStatusCodeSchema } from '@/lib/http-status';

/** `folder` stores a bookmark folder id, chosen from the user's folders by path. */
type SettingsFieldType = 'switch' | 'select' | 'number' | 'text' | 'folder';

export type SettingsFieldMeta = {
  label: string;
  description: string;
  /**
   * More about the setting, for those who want it: shown in a toggletip beside the label. The
   * description under the label stays the one thing a user must read. Present when a
   * `settings_<stem>Help` message exists.
   */
  help?: string;
  /**
   * Other words a user may search for it by, separated by commas, which the row never shows
   * (`settings_<stem>Keywords`): only the settings search reads them.
   */
  keywords?: string;
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
  /** Most entries a list may hold. */
  maxItems?: number;
  /** Longest text, or longest entry of a list of names. */
  maxLength?: number;
  /** Numbers use a stepper; a slider suits only fractional values such as a confidence. */
  control?: 'slider';
  /**
   * Shown divided by this, in `unit`: a value stored in milliseconds can be edited in seconds.
   * The stored value and its bounds stay in the stored unit.
   */
  displayScale?: number;
  /** A fraction from 0 to 1 shown as a percentage. */
  percent?: boolean;
};

/** Options content that is not synced settings, drawn by its own component. */
export type SettingsPanelId =
  /** AI: what AI does, needs, costs, and sends, until a service is set up. */
  | 'aiIntro'
  | 'aiServices'
  | 'aiActivity'
  | 'promptLibrary'
  /** AI: "About me", its own synced item (src/lib/about-me-storage.ts), too long for settings. */
  | 'aboutMe'
  | 'shortcuts'
  | 'managerMenus'
  /** Behavior > Manager and popup shortcuts: the in-page keys, with a recorder for each. */
  | 'pageShortcuts'
  /** Behavior > Manager table: Default Columns, with Reset table view and Reset column widths. */
  | 'managerColumns'
  /** Behavior > Cards: what a card shows, in order. */
  | 'managerCardFields'
  /** Behavior > Preview: what a bookmark's preview shows, in order. */
  | 'previewFields'
  /** Behavior: the popup tree's row buttons and menus (`popupBookmarkMenu`, `popupFolderMenu`). */
  | 'popupMenus'
  /** Appearance > Popup: its parts, toolbar buttons, and hover card details, each in order. */
  | 'popupLayout'
  /** Behavior > Tools Sidebar: which tools it shows, in order. */
  | 'toolsSidebarOrder'
  /** Saving & Search > Right-Click Menu: which entries the menu shows, in order. */
  | 'contextMenuEntries'
  | 'askAiActions'
  | 'agentBridge'
  /** Maintenance: the smart rules, their own local item (src/lib/bookmark-rules-storage.ts). */
  | 'bookmarkRules'
  /** Metadata & Content: how much page text is indexed, and a button that deletes it. */
  | 'pageText'
  /** Metadata & Content: how many covers are stored, and a button that deletes them. */
  | 'covers'
  /** Essentials: a pointer to the AI tab, which is optional and set up there. */
  | 'essentialsAi';

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
  /**
   * An on/off setting the whole section depends on, such as AI Features for the AI tools. While
   * it is off, the section is shown greyed out under a notice, but stays editable, so it can be
   * set up before the feature is turned on. Its own values are never changed.
   */
  requires?: SectionRequirement;
};

/**
 * Switches whole sections can depend on (`SettingsSectionMeta.requires`), each with the notice
 * shown above the first greyed-out section while it is off.
 */
export const SECTION_REQUIREMENT_NOTICES = {
  aiEnabled: 'newcomer_aiOffNotice',
} as const satisfies Partial<Record<keyof Settings, string>>;

export type SectionRequirement = keyof typeof SECTION_REQUIREMENT_NOTICES;

/** Every field of a section, in display order: the heading switch, the fields, then the fold. */
export function getSectionFields(section: SettingsSectionMeta): (keyof Settings)[] {
  return [
    ...(section.toggle ? [section.toggle] : []),
    ...section.fields,
    ...(section.advanced ?? []),
  ];
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

/**
 * A list setting in the TOML: `{ default, max_items }`, plus `max_length` for each name in a list of
 * names. Settings sync, so every list is capped; the sync item quota test adds them all up.
 */
const listSettingSchema = z
  .strictObject({
    default: z.array(z.union([z.string(), z.number()])),
    max_items: z.number().int().positive(),
    max_length: z.number().int().positive().optional(),
  })
  .refine(
    (setting) => setting.default.length <= setting.max_items,
    'default has more than max_items',
  )
  .refine(
    (setting) =>
      setting.default.every(
        (item) => typeof item !== 'string' || item.length <= (setting.max_length ?? Infinity),
      ),
    'a default entry is longer than max_length',
  );

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

export const themeSchema = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof themeSchema>;

/**
 * The texts the Options settings search can find a setting by (`SETTING_SEARCH_SOURCES` in
 * `settings-search.ts` reads each): its name, description, extra words (`settings_<stem>Keywords`),
 * and setting ID. A new source is an id here, an entry there, and its label below.
 */
export const SETTING_SEARCH_SOURCE_IDS = ['label', 'description', 'keywords', 'id'] as const;
export type SettingSearchSource = (typeof SETTING_SEARCH_SOURCE_IDS)[number];

const SETTING_SEARCH_SOURCE_LABELS = {
  label: 'settings_settingsSearchSourceLabel',
  description: 'settings_settingsSearchSourceDescription',
  keywords: 'settings_settingsSearchSourceKeywordList',
  id: 'settings_settingsSearchSourceId',
} as const satisfies Record<SettingSearchSource, string>;

const SETTING_SEARCH_MATCH_LABELS = {
  allWords: 'settings_settingsSearchMatchAllWords',
  phrase: 'settings_settingsSearchMatchPhrase',
} as const satisfies Record<TextQueryMode, string>;

export const sortOrderSchema = z.enum(['browser', 'date', 'alphabetical', 'folders']);
export type SortOrder = z.infer<typeof sortOrderSchema>;

/** Name of each sort order, in Options and where the manager says which order its table is in. */
export function getSortOrderLabel(order: SortOrder): string {
  return {
    browser: t('qaOptions_sortBrowser'),
    date: t('settings_sortDate'),
    alphabetical: t('settings_sortAlphabetical'),
    folders: t('settings_sortFolders'),
  }[order];
}

/** The manager's order for a folder: the popup's Sort Order, or one of its own. */
export const managerSortOrderSchema = z.enum(['same_as_popup', ...sortOrderSchema.options]);
export type ManagerSortOrder = z.infer<typeof managerSortOrderSchema>;

/** The folder the manager opens on when its address names none. */
export const managerStartFolderSchema = z.enum(['bookmarks_bar', 'last', 'chosen']);

/** Whether the manager's sidebars open as configured or as they were last. */
export const managerSidebarsStartSchema = z.enum(['default', 'remember']);

/** Card Size: each maps to a narrowest card in config/ui/manager-table.toml. */
export const managerCardSizeSchema = z.enum(['small', 'medium', 'large']);
export type ManagerCardSize = z.infer<typeof managerCardSizeSchema>;

/** What a card of the manager's cards view can show below its title (`managerCardFields`). */
export const MANAGER_CARD_FIELDS = ['cover', 'url', 'folder', 'tags', 'summary'] as const;
export type ManagerCardField = (typeof MANAGER_CARD_FIELDS)[number];

/** What a bookmark's preview can show under its title and address (`previewFields`). */
export const PREVIEW_FIELDS = ['cover', 'folder', 'tags', 'summary', 'coverSource'] as const;
export type PreviewField = (typeof PREVIEW_FIELDS)[number];

/**
 * Each Tools sidebar section's title; their order is `sections` in config/ui/tools-sidebar.toml.
 * Here, not with the tools, because the tab the sidebar opens on is a setting.
 */
export const TOOL_SECTION_TITLES = {
  maintenance: 'tools_category_maintenance',
  metadata: 'tools_category_metadata',
  security: 'tools_category_security',
  analytics: 'tools_category_analytics',
  ai: 'tools_category_ai',
} as const;

export type ToolSectionId = keyof typeof TOOL_SECTION_TITLES;

/**
 * The tabs of the Tools sidebar, each with its title key: every section (All), one section, or
 * the Data section (export and import).
 */
const TOOL_SIDEBAR_TAB_TITLES = {
  all: 'tools_tabAll',
  ...TOOL_SECTION_TITLES,
  data: 'tools_category_data',
} as const;

/** A tab of the sidebar: every section, one section, or the data section (export and import). */
export type ToolSidebarTab = keyof typeof TOOL_SIDEBAR_TAB_TITLES;

export const toolSidebarTabSchema = z.enum(
  Object.keys(TOOL_SIDEBAR_TAB_TITLES) as [ToolSidebarTab, ...ToolSidebarTab[]],
);

/** A tab's name, in the sidebar and in Options. */
export function getToolSidebarTabLabel(tab: ToolSidebarTab): string {
  return t(TOOL_SIDEBAR_TAB_TITLES[tab]);
}

/** Where toasts show: each has its place and motion in `TOAST_POSITION_STYLES` (toast.tsx). */
export const TOAST_POSITIONS = [
  'bottom-right',
  'bottom-left',
  'bottom-center',
  'top-right',
  'top-left',
  'top-center',
] as const;
export type ToastPosition = (typeof TOAST_POSITIONS)[number];

const TOAST_POSITION_LABEL_KEYS = {
  'bottom-right': 'settings_toastPositionBottomRight',
  'bottom-left': 'settings_toastPositionBottomLeft',
  'bottom-center': 'settings_toastPositionBottomCenter',
  'top-right': 'settings_toastPositionTopRight',
  'top-left': 'settings_toastPositionTopLeft',
  'top-center': 'settings_toastPositionTopCenter',
} as const satisfies Record<ToastPosition, string>;

/** The order the manager shows a folder in: its own, or the popup's when set to follow it. */
export function resolveManagerSortOrder(manager: ManagerSortOrder, popup: SortOrder): SortOrder {
  return manager === 'same_as_popup' ? popup : manager;
}

/** What a card shows, in order, as stored in `managerCardFields`. */
export function getManagerCardFields(stored: readonly string[]): ManagerCardField[] {
  return readShownIds(stored, MANAGER_CARD_FIELDS);
}

/** What a bookmark's preview shows, in order, as stored in `previewFields`. */
export function getPreviewFields(stored: readonly string[]): PreviewField[] {
  return readShownIds(stored, PREVIEW_FIELDS);
}

/** The names of the fields cards and the preview show, for Options. */
export function getManagerFieldLabel(field: ManagerCardField | PreviewField): string {
  return {
    cover: t('table_columnCover'),
    url: t('table_columnUrl'),
    folder: t('bookmarks_detailsFolderPath'),
    tags: t('bookmarks_metadataTags'),
    summary: t('bookmarks_metadataSummary'),
    coverSource: t('settings_previewFieldCoverSource'),
  }[field];
}
/** How tall the popup and side panel tree's rows are (`config/ui/popup-tree-view.toml`). */
export const treeDensitySchema = z.enum(['comfortable', 'compact']);
export type TreeDensity = z.infer<typeof treeDensitySchema>;

/** Which folders are open when the popup or side panel opens. */
export const popupExpandOnOpenSchema = z.enum(['none', 'bookmarks_bar', 'last']);
export type PopupExpandOnOpen = z.infer<typeof popupExpandOnOpenSchema>;

export const linkOpenTargetSchema = z.enum(['new_tab', 'background_tab', 'current_tab']);
export type LinkOpenTarget = z.infer<typeof linkOpenTargetSchema>;

export const languageSchema = z.enum([AUTO_LANGUAGE, ...SUPPORTED_LOCALES]);
export type Language = z.infer<typeof languageSchema>;

/** AI output language for "write in the language of each page or bookmark title". */
export const PAGE_LANGUAGE = 'page';

/**
 * The language AI writes in: the extension's language (`auto`), each page's (`page`), or a
 * bundled language. Stored as the id; `{{language}}` in prompt-config.ts names it for the model.
 */
export const aiOutputLanguageSchema = z.enum([AUTO_LANGUAGE, PAGE_LANGUAGE, ...SUPPORTED_LOCALES]);
export type AIOutputLanguage = z.infer<typeof aiOutputLanguageSchema>;

const toolScopeSchema = z.enum(['folder', 'all']);
const contextMenuNamingSchema = z.enum(['link_text', 'page_title', 'link_url']);
export const quickSaveFolderStrategySchema = z.enum(['best_match', 'last_used', 'fixed']);
export type QuickSaveFolderStrategy = z.infer<typeof quickSaveFolderStrategySchema>;
/** When the Bookmark Already Has a Cover, for Save a Cover With Quick Save. */
export const quickSaveCoverExistingSchema = z.enum(['keep', 'replace']);
export type QuickSaveCoverExisting = z.infer<typeof quickSaveCoverExistingSchema>;
const aiContextFormatSchema = z.enum(['markdown', 'xml']);
const mergeModeSchema = z.enum(['append', 'replace']);
/**
 * Which new bookmarks Tag New Bookmarks and Move New Bookmarks act on: those saved through
 * Bookmark Scout, or any new bookmark (the browser's star, sync, other extensions too).
 */
export const ruleNewBookmarkSourceSchema = z.enum(['scout', 'any']);
export type RuleNewBookmarkSource = z.infer<typeof ruleNewBookmarkSourceSchema>;
const tagStyleSchema = z.enum(['kebab-case', 'snake_case', 'lowercase']);
const duplicateMatchStrategySchema = z.enum([
  'exact_url',
  'normalized_url',
  'title_url',
  'title_only',
]);
const duplicateKeepRuleSchema = z.enum(['oldest', 'newest', 'first']);
/** What the dead-link repair review starts a failed link and a redirect on. */
const deadLinkFailureActionSchema = z.enum(['keep', 'delete', 'archive']);
const deadLinkRedirectActionSchema = z.enum(['keep', 'redirect']);
/** The repair choices' own labels, shared with the review. */
const deadLinkActionLabel = (action: 'keep' | 'delete' | 'archive' | 'redirect') =>
  t(DEAD_LINK_REPAIR_CHOICE_LABEL_KEYS[action]);
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
  bookmarkRules: 'both',
  pageText: 'both',
  covers: 'both',
} as const satisfies Record<string, z.infer<typeof toolScopeSchema> | 'both'>;

// ============================================================================
// One definition per setting
// ============================================================================

type FieldDefinition<S extends z.ZodType = z.ZodType> = {
  schema: S;
  meta: () => SettingsFieldMeta;
  /** The config table that holds the default, such as `search.folder_matches`. */
  section: string;
};

/** `search.folder_matches.max` -> `search.folder_matches`. */
const sectionOf = (path: string) => path.slice(0, path.lastIndexOf('.'));

type NumberFieldDefinition = FieldDefinition<z.ZodType<number>> & { bounds: NumberSetting };

/** Units a numeric setting can show, as locale keys so they follow the language. */
const UNIT_MESSAGE_KEYS = {
  ms: 'unit_ms',
  s: 'unit_s',
  px: 'unit_px',
  chars: 'unit_chars',
  kb: 'unit_kb',
  mb: 'unit_mb',
  days: 'unit_days',
} as const;

type SettingUnit = keyof typeof UNIT_MESSAGE_KEYS;

type FieldExtras = Pick<SettingsFieldMeta, 'control' | 'percent'> & {
  unit?: SettingUnit;
  /** Edit in a friendlier unit: `{ unit: 's', scale: 1000 }` for a value stored in ms. */
  display?: { unit: SettingUnit; scale: number };
};

/** Field meta for `extras`, with the unit localized when the meta is read. */
function extrasMeta({ unit, display, ...extras }: FieldExtras): Partial<SettingsFieldMeta> {
  const shownUnit = display?.unit ?? unit;
  return {
    ...extras,
    ...(shownUnit ? { unit: t(UNIT_MESSAGE_KEYS[shownUnit]) } : {}),
    ...(display ? { displayScale: display.scale } : {}),
  };
}

const IN_SECONDS = { unit: 's', scale: 1000 } as const;

/** Labels follow `settings_<stem>` and `settings_<stem>Desc` in the locale files. */
function fieldLabels(
  stem: string,
): Pick<SettingsFieldMeta, 'label' | 'description' | 'help' | 'keywords'> {
  const help = tOptional(`settings_${stem}Help`);
  const keywords = tOptional(`settings_${stem}Keywords`);
  return {
    label: t(`settings_${stem}`),
    description: t(`settings_${stem}Desc`),
    ...(help ? { help } : {}),
    ...(keywords ? { keywords } : {}),
  };
}

function switchField(
  path: string,
  stem: string,
  extras: FieldExtras = {},
): FieldDefinition<z.ZodDefault<z.ZodBoolean>> {
  const value = configValue(path, z.boolean());
  return {
    section: sectionOf(path),
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
    section: sectionOf(path),
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
  const maxLength = typeof setting === 'string' ? undefined : setting.max_length;
  return {
    schema,
    section: sectionOf(path),
    meta: () => ({ ...fieldLabels(stem), type: 'text', ...(maxLength ? { maxLength } : {}) }),
  };
}

/** A bookmark folder, stored by id; empty means none chosen. */
function folderField(path: string, stem: string): FieldDefinition<z.ZodDefault<z.ZodString>> {
  const schema = z.string().max(INPUT_LIMITS.chars.folder_id);
  return {
    section: sectionOf(path),
    schema: schema.default(configValue(path, schema)),
    meta: () => ({ ...fieldLabels(stem), type: 'folder' }),
  };
}

/**
 * Query parameter names: printable ASCII without the characters JSON or Chrome's sync storage
 * escapes (`"`, `\`, `<`) or the list editor splits at (`,`), so each takes one byte in sync
 * storage.
 */
const QUERY_PARAM_NAME_PATTERN = /^(?:(?![",<\\])[\x21-\x7e])+$/;

export function isQueryParamName(name: string): boolean {
  return QUERY_PARAM_NAME_PATTERN.test(name);
}

/**
 * Ids of bookmark actions (`services/actions.ts`), table columns, and card or preview fields:
 * letters only, so a stored list stays small. Unknown ids are left out where the list is used.
 */
const ID_PATTERN = /^[A-Za-z]+$/;

/**
 * Marks the first action of each section of a menu the user arranged (`services/action-menus.ts`),
 * so sections take no entries of their own in a synced list.
 */
export const MENU_SECTION_START = '-';

/**
 * Entries of a list of the ids a part of a page shows (`src/lib/shown-ids.ts`): ids, those the
 * user hid marked by `HIDDEN_ID_MARK`.
 */
const SHOWN_ID_PATTERN = new RegExp(`^\\${HIDDEN_ID_MARK}?[A-Za-z]+$`);

/**
 * A menu's entries: action ids, the first of each section marked by `MENU_SECTION_START` and
 * those the user hid by `HIDDEN_ID_MARK`.
 */
const MENU_ENTRY_PATTERN = new RegExp(`^[\\${MENU_SECTION_START}\\${HIDDEN_ID_MARK}]?[A-Za-z]+$`);

/** A list of ids, each at most `max_length` long, at most `max_items` of them. */
function idListField(
  path: string,
  stem: string,
  pattern: RegExp = ID_PATTERN,
): FieldDefinition<z.ZodType<string[]>> {
  const config = configValue(path, listSettingSchema);
  const maxLength = config.max_length;
  if (maxLength === undefined) throw new Error(`settings.${path} needs max_length`);
  const schema = z.array(z.string().max(maxLength).regex(pattern)).max(config.max_items);
  return {
    section: sectionOf(path),
    schema: schema.default(schema.parse(config.default)),
    meta: () => ({
      ...fieldLabels(stem),
      type: 'text',
      list: 'string',
      maxItems: config.max_items,
      maxLength,
    }),
  };
}

/** One key combination, as config/ui/shortcuts.toml writes it: `KeyboardEvent.key` and modifiers. */
export const shortcutBindingSchema = z.strictObject({
  key: z.string().min(1),
  alt: z.boolean().optional(),
  shift: z.boolean().optional(),
  mod: z.boolean().optional(),
});
type ShortcutBindingValue = z.infer<typeof shortcutBindingSchema>;

/** A shortcut id of config/ui/shortcuts.toml: `manager.undo`. */
const SHORTCUT_ID_PATTERN = /^[a-z]+\.[a-z_]+$/;

/**
 * The keys the user gave in-page shortcuts, by shortcut id (`src/lib/shortcut-remap.ts`), edited
 * in its own Options panel. Its config holds the default (empty) and the size of each entry.
 */
function shortcutOverridesField(
  path: string,
  stem: string,
): FieldDefinition<z.ZodType<Record<string, ShortcutBindingValue[]>>> {
  const config = configValue(
    path,
    z.strictObject({
      default: z.strictObject({}),
      max_bindings: z.number().int().positive(),
      max_key_length: z.number().int().positive(),
      max_id_length: z.number().int().positive(),
    }),
  );
  const id = z.string().max(config.max_id_length).regex(SHORTCUT_ID_PATTERN);
  const bindings = z
    .array(shortcutBindingSchema.extend({ key: z.string().min(1).max(config.max_key_length) }))
    .min(1)
    .max(config.max_bindings);
  // Entry by entry, so one malformed entry is dropped alone. Which ids exist and which keys each
  // may have is checked where the keys are used (`parsePageShortcutOverrides`), which keeps the
  // shortcut tables out of every page that reads settings.
  const schema = z.preprocess(
    (raw) =>
      isPlainObject(raw)
        ? Object.fromEntries(
            Object.entries(raw).filter(
              ([key, value]) => id.safeParse(key).success && bindings.safeParse(value).success,
            ),
          )
        : raw,
    z.record(id, bindings),
  );
  return {
    section: sectionOf(path),
    schema: schema.default(config.default),
    meta: () => ({ ...fieldLabels(stem), type: 'text' }),
  };
}

/**
 * A checklist: some of `choices` (stored by id), each once, at least one. Its config is a list
 * setting whose `max_items` is the number of choices and `max_length` the longest id.
 */
function choiceListField<T extends string>(
  path: string,
  stem: string,
  choices: readonly [T, ...T[]],
  label: (value: T) => string,
): FieldDefinition<z.ZodType<T[]>> {
  const config = configValue(path, listSettingSchema);
  const maxLength = config.max_length;
  if (maxLength === undefined) throw new Error(`settings.${path} needs max_length`);
  if (config.max_items !== choices.length || choices.some((id) => id.length > maxLength)) {
    throw new Error(`settings.${path} must hold each of its ${choices.length} choices once`);
  }
  const schema = z
    .array(z.enum(choices))
    .min(1)
    .max(config.max_items)
    .refine((list) => new Set(list).size === list.length, 'each choice once');
  return {
    section: sectionOf(path),
    schema: schema.default(schema.parse(config.default)),
    meta: () => ({
      ...fieldLabels(stem),
      type: 'text',
      list: 'string',
      maxItems: config.max_items,
      maxLength,
      options: choices.map((value) => ({ value, label: label(value) })),
    }),
  };
}

/** A list of query parameter names, each at most `max_length` long, at most `max_items` of them. */
function nameListField(path: string, stem: string): FieldDefinition<z.ZodType<string[]>> {
  const config = configValue(path, listSettingSchema);
  const maxLength = config.max_length;
  if (maxLength === undefined) throw new Error(`settings.${path} needs max_length`);
  const schema = z
    .array(z.string().max(maxLength).regex(QUERY_PARAM_NAME_PATTERN))
    .max(config.max_items);
  return {
    section: sectionOf(path),
    schema: schema.default(schema.parse(config.default)),
    meta: () => ({
      ...fieldLabels(stem),
      type: 'text',
      list: 'string',
      maxItems: config.max_items,
      maxLength,
    }),
  };
}

/**
 * A list of site names as `toSiteName` keeps them (host names, one byte a character), each at most
 * `max_length` long, at most `max_items` of them.
 */
function siteListField(path: string, stem: string): FieldDefinition<z.ZodType<string[]>> {
  const config = configValue(path, listSettingSchema);
  const maxLength = config.max_length;
  if (maxLength === undefined) throw new Error(`settings.${path} needs max_length`);
  const schema = z
    .array(
      z
        .string()
        .max(maxLength)
        .refine((name) => toSiteName(name) === name, 'Not a site name'),
    )
    .max(config.max_items);
  return {
    section: sectionOf(path),
    schema: schema.default(schema.parse(config.default)),
    meta: () => ({
      ...fieldLabels(stem),
      type: 'text',
      list: 'string',
      maxItems: config.max_items,
      maxLength,
    }),
  };
}

/** A list of numbers that each pass `item`, at least one and at most `max_items`. */
function numberListField(
  path: string,
  stem: string,
  item: z.ZodType<number>,
): FieldDefinition<z.ZodType<number[]>> {
  const config = configValue(path, listSettingSchema);
  const schema = z.array(item).min(1).max(config.max_items);
  return {
    section: sectionOf(path),
    schema: schema.default(schema.parse(config.default)),
    meta: () => ({
      ...fieldLabels(stem),
      type: 'text',
      list: 'number',
      maxItems: config.max_items,
    }),
  };
}

/** A number picked from `values` (offered as they are), its default at `path`. */
function numberOptionsField(
  path: string,
  stem: string,
  values: readonly number[],
): FieldDefinition<z.ZodDefault<z.ZodNumber>> {
  const schema = z.number().refine((value) => values.includes(value), 'must be one of the options');
  return {
    section: sectionOf(path),
    schema: schema.default(configValue(path, schema)) as unknown as z.ZodDefault<z.ZodNumber>,
    meta: () => ({
      ...fieldLabels(stem),
      type: 'select',
      options: values.map((value) => ({ value, label: String(value) })),
    }),
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
    section: sectionOf(path),
    schema: schema.default(value as z.util.NoUndefined<T[keyof T]>),
    meta: () => ({
      ...fieldLabels(stem),
      type: 'select',
      options: schema.options.map((option) => ({ value: option, label: label(option) })),
    }),
  };
}

/**
 * A number picked from the options its config lists (`{ default, options = [{ value, label }] }`):
 * each label is a message key, given the value as its placeholder.
 */
function numberChoiceField(path: string, stem: string): FieldDefinition<z.ZodDefault<z.ZodNumber>> {
  const choice = configValue(
    path,
    z
      .strictObject({
        default: z.number(),
        options: z.array(z.strictObject({ value: z.number(), label: z.string().min(1) })).min(1),
      })
      .refine(
        ({ default: value, options }) => options.some((option) => option.value === value),
        'default must be one of the options',
      ),
  );
  const values = choice.options.map((option) => option.value);
  return {
    section: sectionOf(path),
    schema: z
      .number()
      .refine((value) => values.includes(value), 'must be one of the options')
      .default(choice.default) as unknown as z.ZodDefault<z.ZodNumber>,
    meta: () => ({
      ...fieldLabels(stem),
      type: 'select',
      options: choice.options.map((option) => ({
        value: option.value,
        label: t(option.label as MessageKey, String(option.value)),
      })),
    }),
  };
}

type ScopeValue = z.infer<typeof toolScopeSchema>;

const scopeLabel = (scope: ScopeValue) =>
  scope === 'folder' ? t('settings_scopeFolder') : t('settings_scopeAll');

/**
 * A tool's default scope: selectable (from `default_scope` in the tool's config table,
 * `section`) when the tool supports both scopes, otherwise fixed. Unsupported or malformed saved scopes fall back without
 * failing the other settings.
 */
function scopeField(
  section: string,
  stem: string,
  capability: 'both',
): FieldDefinition<z.ZodDefault<z.ZodCatch<typeof toolScopeSchema>>>;
function scopeField<S extends ScopeValue>(
  section: string,
  stem: string,
  capability: S,
): FieldDefinition<z.ZodDefault<z.ZodCatch<z.ZodLiteral<S>>>>;
function scopeField(
  section: string,
  stem: string,
  capability: ScopeValue | 'both',
): FieldDefinition {
  const scopes = capability === 'both' ? toolScopeSchema.options : [capability];
  const fallback =
    capability === 'both' ? configValue(`${section}.default_scope`, toolScopeSchema) : capability;
  const schema =
    capability === 'both'
      ? toolScopeSchema.catch(fallback).default(fallback)
      : z.literal(fallback).catch(fallback).default(fallback);
  return {
    schema,
    section,
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

const fields = {
  language: enumField('appearance.theme_icons.language', 'language', languageSchema, (value) =>
    value === AUTO_LANGUAGE ? t('settings_languageAuto') : getLanguageName(value),
  ),
  theme: enumField(
    'appearance.theme_icons.theme',
    'theme',
    themeSchema,
    (value) =>
      ({
        system: t('settings_themeSystem'),
        light: t('settings_themeLight'),
        dark: t('settings_themeDark'),
      })[value],
  ),
  dateFormat: enumField(
    'appearance.dates.date_format',
    'dateFormat',
    z.enum(DATE_FORMAT_IDS),
    (value) => `${t(dateFormatLabelKey('date', value))} (${formatDateSample('date', value)})`,
  ),
  timeFormat: enumField(
    'appearance.dates.time_format',
    'timeFormat',
    z.enum(TIME_FORMAT_IDS),
    (value) => `${t(dateFormatLabelKey('time', value))} (${formatDateSample('time', value)})`,
  ),
  showFavicons: switchField('appearance.theme_icons.show_favicons', 'showFavicons'),
  browserIconCache: switchField('appearance.theme_icons.browser_icon_cache', 'browserIconCache'),
  faviconSize: numberChoiceField('appearance.theme_icons.favicon_size', 'faviconSize'),
  showTrailingSlash: switchField('appearance.addresses.show_trailing_slash', 'showTrailingSlash'),

  searchDebounceMs: numberField('search.search.debounce_ms', 'searchDelay', { unit: 'ms' }),
  maxSearchResults: numberChoiceField('search.search.max_results', 'maxResults'),
  expandFoldersOnSearch: switchField('search.search.expand_folders', 'expandFolders'),
  searchHistory: switchField('search.search.history', 'searchHistory'),
  folderMatchesEnabled: switchField('search.folder_matches.enabled', 'folderMatchesEnabled'),
  folderMatchesMax: numberField('search.folder_matches.max', 'folderMatchesMax'),
  folderMatchesTypos: switchField('search.folder_matches.typos', 'folderMatchesTypos'),
  settingsSearchSources: choiceListField(
    'search.settings_search.sources',
    'settingsSearchSources',
    SETTING_SEARCH_SOURCE_IDS,
    (value) => t(SETTING_SEARCH_SOURCE_LABELS[value]),
  ),
  settingsSearchMatch: enumField(
    'search.settings_search.match',
    'settingsSearchMatch',
    z.enum(TEXT_QUERY_MODES),
    (value) => t(SETTING_SEARCH_MATCH_LABELS[value]),
  ),
  settingsSearchHighlight: switchField(
    'search.settings_search.highlight',
    'settingsSearchHighlight',
  ),
  settingsSearchNotes: switchField('search.settings_search.notes', 'settingsSearchNotes'),
  settingsSearchTabCounts: switchField(
    'search.settings_search.tab_counts',
    'settingsSearchTabCounts',
  ),

  sortOrder: enumField('behavior.tree.sort_order', 'sortOrder', sortOrderSchema, getSortOrderLabel),
  groupByFolders: switchField('behavior.tree.group_by_folders', 'groupByFolders'),
  treeDragAndDrop: switchField('behavior.tree.drag_and_drop', 'treeDragAndDrop'),
  popupExpandOnOpen: enumField(
    'behavior.tree.expand_on_open',
    'popupExpandOnOpen',
    popupExpandOnOpenSchema,
    (value) =>
      ({
        none: t('settings_popupExpandOnOpenNone'),
        bookmarks_bar: t('settings_popupExpandOnOpenBar'),
        last: t('settings_popupExpandOnOpenLast'),
      })[value],
  ),
  linkOpenTarget: enumField(
    'behavior.links.open_target',
    'linkOpenTarget',
    linkOpenTargetSchema,
    (value) =>
      ({
        new_tab: t('settings_linkOpenNewTab'),
        background_tab: t('settings_linkOpenBackgroundTab'),
        current_tab: t('settings_linkOpenCurrentTab'),
      })[value],
  ),
  showLinkTarget: switchField('behavior.links.show_target', 'showLinkTarget'),
  confirmBeforeDelete: switchField('behavior.deleting.confirm', 'confirmDelete'),
  historyRecordOutsideChanges: switchField(
    'behavior.history.record_outside_changes',
    'historyRecordOutsideChanges',
  ),
  defaultNewFolderName: textField('search.saving.default_new_folder_name', 'defaultFolderName'),
  recentFoldersMax: numberField('search.saving.recent_folders_max', 'recentFoldersMax'),
  recentFoldersEnabled: switchField('search.saving.recent_folders_enabled', 'recentFoldersEnabled'),

  popupWidth: numberField('appearance.popup.width', 'popupWidth', { unit: 'px' }),
  popupHeight: numberField('appearance.popup.height', 'popupHeight', { unit: 'px' }),
  truncateLength: numberField('appearance.popup.truncate_length', 'truncateLength', {
    unit: 'chars',
  }),
  showHoverDetails: switchField('appearance.popup.show_hover_details', 'showHoverDetails'),
  hoverCardFields: idListField(
    'appearance.popup.hover_card_fields',
    'hoverCardFields',
    SHOWN_ID_PATTERN,
  ),
  treeDensity: enumField(
    'appearance.popup.tree_density',
    'treeDensity',
    treeDensitySchema,
    (value) =>
      ({
        comfortable: t('settings_treeDensityComfortable'),
        compact: t('settings_treeDensityCompact'),
      })[value],
  ),
  popupSections: idListField('appearance.popup.sections', 'popupSections', SHOWN_ID_PATTERN),
  popupToolbarButtons: idListField(
    'appearance.popup.toolbar_buttons',
    'popupToolbarButtons',
    SHOWN_ID_PATTERN,
  ),
  toastDurationMs: numberField('appearance.notifications.toast_duration_ms', 'toastDuration', {
    unit: 'ms',
    display: IN_SECONDS,
  }),
  tooltipDelayMs: numberField('appearance.notifications.tooltip_delay_ms', 'tooltipDelay', {
    unit: 'ms',
  }),
  hoverCardOpenDelayMs: numberField(
    'appearance.notifications.hover_card_delay_ms',
    'hoverCardDelay',
    { unit: 'ms' },
  ),
  toastPosition: enumField(
    'appearance.notifications.toast_position',
    'toastPosition',
    z.enum(TOAST_POSITIONS),
    (value) => t(TOAST_POSITION_LABEL_KEYS[value]),
  ),
  openConfirmAbove: numberField('behavior.links.confirm_open_above', 'openConfirmAbove'),
  searchHistoryMax: numberField('search.search.history_max', 'searchHistoryMax'),
  quickSaveAlternatives: numberField('search.quick_save.alternatives', 'quickSaveAlternatives'),
  quickSaveNotificationMs: numberField(
    'search.quick_save.notification_ms',
    'quickSaveNotification',
    { unit: 'ms', display: IN_SECONDS },
  ),
  askAiMaxSteps: numberField('ai.ask_ai.max_steps', 'askAiMaxSteps'),
  readPageSkipPrivateHosts: switchField(
    'ai.page_reading.skip_private_hosts',
    'readPageSkipPrivateHosts',
  ),

  aiEnabled: switchField('ai.enable.enabled', 'aiEnabled'),
  aiMaxRecommendations: numberField('ai.suggestions.max_recommendations', 'aiMaxRecommendations'),
  aiAutoTriggerOnOpen: switchField('ai.suggestions.auto_trigger_on_open', 'aiAutoTrigger'),
  aiReadPageContent: switchField('ai.page_reading.read_page_content', 'aiReadPageContent'),
  aiOutputLanguage: enumField(
    'ai.output_language.language',
    'aiOutputLanguage',
    aiOutputLanguageSchema,
    (value) =>
      value === AUTO_LANGUAGE
        ? t('settings_aiOutputLanguageAuto')
        : value === PAGE_LANGUAGE
          ? t('settings_aiOutputLanguagePage')
          : getLanguageName(value),
  ),
  aiActivityRecording: switchField('ai.activity.recording', 'aiActivityRecording'),
  askAiWebSearch: switchField('ai.ask_ai.web_search', 'askAiWebSearch'),
  askAiKeepChats: switchField('ai.ask_ai.keep_chats', 'askAiKeepChats'),
  askAiChatsMax: numberField('ai.ask_ai.chats_max', 'askAiChatsMax'),
  askAiDisabledActions: idListField('ai.ask_ai.disabled_actions', 'askAiDisabledActions'),
  agentBridgeEnabled: switchField('developers.agent_bridge.enabled', 'agentBridgeEnabled'),
  agentBridgeWrites: switchField('developers.agent_bridge.writes', 'agentBridgeWrites'),
  agentBridgeRedactUrls: switchField(
    'developers.agent_bridge.redact_urls',
    'agentBridgeRedactUrls',
  ),
  agentBridgeDisabledActions: idListField(
    'developers.agent_bridge.disabled_actions',
    'agentBridgeDisabledActions',
  ),
  managerMenuActions: idListField(
    'behavior.manager_menus.actions',
    'managerMenuActions',
    MENU_ENTRY_PATTERN,
  ),
  managerOrganizeMenu: idListField(
    'behavior.manager_menus.organize',
    'managerOrganizeMenu',
    MENU_ENTRY_PATTERN,
  ),
  managerEmptySpaceMenu: idListField(
    'behavior.manager_menus.empty_space',
    'managerEmptySpaceMenu',
    MENU_ENTRY_PATTERN,
  ),
  managerPreviewMenu: idListField(
    'behavior.manager_menus.preview',
    'managerPreviewMenu',
    MENU_ENTRY_PATTERN,
  ),
  popupBookmarkMenu: idListField(
    'behavior.popup_menus.bookmark',
    'popupBookmarkMenu',
    SHOWN_ID_PATTERN,
  ),
  popupFolderMenu: idListField('behavior.popup_menus.folder', 'popupFolderMenu', SHOWN_ID_PATTERN),
  managerViewMode: enumField(
    'behavior.manager_view.mode',
    'managerViewMode',
    z.enum(['list', 'cards']),
    (value) =>
      ({ list: t('settings_managerViewModeList'), cards: t('settings_managerViewModeCards') })[
        value
      ],
  ),
  managerSortOrder: enumField(
    'behavior.manager_view.sort_order',
    'managerSortOrder',
    managerSortOrderSchema,
    (value) =>
      value === 'same_as_popup' ? t('settings_managerSortOrderSame') : getSortOrderLabel(value),
  ),
  managerStartFolder: enumField(
    'behavior.manager_view.start_folder',
    'managerStartFolder',
    managerStartFolderSchema,
    (value) =>
      ({
        bookmarks_bar: t('settings_managerStartFolderBar'),
        last: t('settings_managerStartFolderLast'),
        chosen: t('settings_managerStartFolderChosen'),
      })[value],
  ),
  managerStartFolderId: folderField(
    'behavior.manager_view.start_folder_id',
    'managerStartFolderId',
  ),
  managerSidebarsStart: enumField(
    'behavior.manager_view.sidebars_start',
    'managerSidebarsStart',
    managerSidebarsStartSchema,
    (value) =>
      ({
        default: t('settings_managerSidebarsStartDefault'),
        remember: t('settings_managerSidebarsStartRemember'),
      })[value],
  ),
  managerDefaultColumns: idListField('behavior.manager_table.columns', 'managerDefaultColumns'),
  managerDefaultPageSize: numberOptionsField(
    'behavior.manager_table.page_size',
    'managerDefaultPageSize',
    MANAGER_PAGE_SIZES,
  ),
  managerDefaultSort: enumField(
    'behavior.manager_table.sort',
    'managerDefaultSort',
    z.enum(MANAGER_SORT_CHOICE_IDS),
    (value) => t((MANAGER_SORT_CHOICES[value]?.labelKey ?? 'error_unknown') as MessageKey),
  ),
  managerTableDates: enumField(
    'behavior.manager_table.dates',
    'managerTableDates',
    z.enum(['date_and_time', 'date']),
    (value) =>
      ({
        date_and_time: t('settings_managerTableDatesDateAndTime'),
        date: t('settings_managerTableDatesDate'),
      })[value],
  ),
  managerCardFields: idListField(
    'behavior.manager_cards.fields',
    'managerCardFields',
    SHOWN_ID_PATTERN,
  ),
  managerCardSize: enumField(
    'behavior.manager_cards.size',
    'managerCardSize',
    managerCardSizeSchema,
    (value) =>
      ({
        small: t('settings_managerCardSizeSmall'),
        medium: t('settings_managerCardSizeMedium'),
        large: t('settings_managerCardSizeLarge'),
      })[value],
  ),
  managerCardCoverShape: enumField(
    'behavior.manager_cards.cover_shape',
    'managerCardCoverShape',
    z.enum(['wide', 'classic', 'square', 'portrait']),
    (value) =>
      ({
        wide: t('settings_managerCardCoverShapeWide'),
        classic: t('settings_managerCardCoverShapeClassic'),
        square: t('settings_managerCardCoverShapeSquare'),
        portrait: t('settings_managerCardCoverShapePortrait'),
      })[value],
  ),
  managerCardCoverFit: enumField(
    'behavior.manager_cards.cover_fit',
    'managerCardCoverFit',
    z.enum(['fill', 'fit']),
    (value) =>
      ({
        fill: t('settings_managerCardCoverFitFill'),
        fit: t('settings_managerCardCoverFitFit'),
      })[value],
  ),
  managerCardColumns: numberField('behavior.manager_cards.columns', 'managerCardColumns'),
  managerCardTitleLines: numberField('behavior.manager_cards.title_lines', 'managerCardTitleLines'),
  cardMaxTags: numberField('behavior.manager_cards.max_tags', 'cardMaxTags'),
  cardSummaryLines: numberField('behavior.manager_cards.summary_lines', 'cardSummaryLines'),
  previewFields: idListField('behavior.manager_preview.fields', 'previewFields', SHOWN_ID_PATTERN),
  pageShortcutOverrides: shortcutOverridesField(
    'behavior.page_shortcuts.overrides',
    'pageShortcuts',
  ),
  toolsSidebarLayout: enumField(
    'behavior.tools_sidebar.layout',
    'toolsSidebarLayout',
    z.enum(['tabs', 'list']),
    (value) =>
      ({ tabs: t('settings_toolsSidebarLayoutTabs'), list: t('settings_toolsSidebarLayoutList') })[
        value
      ],
  ),
  toolsSidebarDefaultTab: enumField(
    'behavior.tools_sidebar.default_tab',
    'toolsSidebarDefaultTab',
    toolSidebarTabSchema,
    getToolSidebarTabLabel,
  ),
  toolsSidebarOrder: idListField(
    'behavior.tools_sidebar.order',
    'toolsSidebarOrder',
    SHOWN_ID_PATTERN,
  ),
  aiMaxCategories: numberField('ai_tools.reorganization.max_categories', 'aiMaxCategories'),
  aiMinItemsPerFolder: numberField(
    'ai_tools.reorganization.min_items_per_folder',
    'aiMinItemsPerFolder',
  ),
  aiMaxItemsPerFolder: numberField(
    'ai_tools.reorganization.max_items_per_folder',
    'aiMaxItemsPerFolder',
  ),

  exportFilenamePrefix: textField('data.export.filename_prefix', 'exportFilenamePrefix'),
  exportFilenameMaxLength: numberField(
    'data.export.filename_max_length',
    'exportFilenameMaxLength',
    {
      unit: 'chars',
    },
  ),
  exportJsonIndentSize: numberField('data.export.json_indent_size', 'exportJsonIndentSize'),
  exportHtmlIndentSpaces: numberField('data.export.html_indent_spaces', 'exportHtmlIndentSpaces'),
  exportMarkdownIndentSpaces: numberField(
    'data.export.markdown_indent_spaces',
    'exportMarkdownIndentSpaces',
  ),
  exportIncludeDates: switchField('data.export.include_dates', 'exportIncludeDates'),
  exportIncludeUrls: switchField('data.export.include_urls', 'exportIncludeUrls'),

  contextMenuEnabled: switchField('search.context_menu.enabled', 'contextMenuEnabled'),
  contextMenuBookmarkNaming: enumField(
    'search.context_menu.bookmark_naming',
    'contextMenuNaming',
    contextMenuNamingSchema,
    (value) =>
      ({
        link_text: t('settings_namingLinkText'),
        page_title: t('settings_namingPageTitle'),
        link_url: t('settings_namingLinkUrl'),
      })[value],
  ),
  contextMenuContexts: choiceListField(
    'search.context_menu.contexts',
    'contextMenuContexts',
    CONTEXT_MENU_CONTEXT_IDS,
    getContextMenuContextLabel,
  ),
  contextMenuEntries: idListField(
    'search.context_menu.entries',
    'contextMenuEntries',
    SHOWN_ID_PATTERN,
  ),
  contextMenuRecentMax: numberField('search.context_menu.recent_max', 'contextMenuRecentMax'),

  quickSaveFolderStrategy: enumField(
    'search.quick_save.folder_strategy',
    'quickSaveFolderStrategy',
    quickSaveFolderStrategySchema,
    (value) =>
      ({
        best_match: t('settings_quickSaveBestMatch'),
        last_used: t('settings_quickSaveLastUsed'),
        fixed: t('settings_quickSaveFixed'),
      })[value],
  ),
  quickSaveFixedFolder: folderField('search.quick_save.fixed_folder', 'quickSaveFixedFolder'),
  quickSaveCover: switchField('search.quick_save.cover', 'quickSaveCover'),
  quickSaveCoverSource: enumField(
    'search.quick_save.cover_source',
    'quickSaveCoverSource',
    quickSaveCoverSourceSchema,
    getQuickSaveCoverSourceLabel,
  ),
  quickSaveCoverExisting: enumField(
    'search.quick_save.cover_existing',
    'quickSaveCoverExisting',
    quickSaveCoverExistingSchema,
    (value) =>
      ({
        keep: t('settings_quickSaveCoverExistingKeep'),
        replace: t('settings_quickSaveCoverExistingReplace'),
      })[value],
  ),

  aiContextPackerEnabled: switchField('ai_tools.context_packer.enabled', 'aiContextPackerEnabled'),
  aiContextPackerDefaultScope: scopeField(
    'ai_tools.context_packer',
    'aiContextPackerDefaultScope',
    TOOL_SCOPE_CAPABILITIES.aiContextPacker,
  ),
  aiContextPackerOutputFormat: enumField(
    'ai_tools.context_packer.output_format',
    'aiContextPackerOutputFormat',
    aiContextFormatSchema,
    (value) => ({ markdown: 'Markdown', xml: 'XML' })[value],
  ),
  aiContextPackerIncludeFolderPath: switchField(
    'ai_tools.context_packer.include_folder_path',
    'aiContextPackerIncludeFolderPath',
  ),
  aiContextPackerIncludeDates: switchField(
    'ai_tools.context_packer.include_dates',
    'aiContextPackerIncludeDates',
  ),
  aiContextPackerIncludeTags: switchField(
    'ai_tools.context_packer.include_tags',
    'aiContextPackerIncludeTags',
  ),
  aiContextPackerIncludeSummaries: switchField(
    'ai_tools.context_packer.include_summaries',
    'aiContextPackerIncludeSummaries',
  ),
  aiContextPackerMaxItems: numberField(
    'ai_tools.context_packer.max_items',
    'aiContextPackerMaxItems',
  ),
  aiContextPackerMaxDepth: numberField(
    'ai_tools.context_packer.max_depth',
    'aiContextPackerMaxDepth',
  ),
  aiContextPackerExcerptLength: numberField(
    'ai_tools.context_packer.excerpt_length',
    'aiContextPackerExcerptLength',
    { unit: 'chars' },
  ),

  autoTaggingEnabled: switchField('ai_tools.auto_tagging.enabled', 'autoTaggingEnabled'),
  autoTaggingDefaultScope: scopeField(
    'ai_tools.auto_tagging',
    'autoTaggingDefaultScope',
    TOOL_SCOPE_CAPABILITIES.autoTagging,
  ),
  autoTaggingMinTags: numberField('ai_tools.auto_tagging.min_tags', 'autoTaggingMinTags'),
  autoTaggingMaxTags: numberField('ai_tools.auto_tagging.max_tags', 'autoTaggingMaxTags'),
  autoTaggingTagStyle: enumField(
    'ai_tools.auto_tagging.tag_style',
    'autoTaggingTagStyle',
    tagStyleSchema,
    sameAsValue,
  ),
  autoTaggingMergeMode: enumField(
    'ai_tools.auto_tagging.merge_mode',
    'autoTaggingMergeMode',
    mergeModeSchema,
    mergeModeLabel,
  ),
  autoTaggingDedupeTags: switchField('ai_tools.auto_tagging.dedupe_tags', 'autoTaggingDedupeTags'),
  autoTaggingSendExistingTags: switchField(
    'ai_tools.auto_tagging.send_existing_tags',
    'autoTaggingSendExistingTags',
  ),

  summarizerEnabled: switchField('ai_tools.summarizer.enabled', 'summarizerEnabled'),
  summarizerDefaultScope: scopeField(
    'ai_tools.summarizer',
    'summarizerDefaultScope',
    TOOL_SCOPE_CAPABILITIES.summarizer,
  ),
  summarizerSummaryLength: numberField(
    'ai_tools.summarizer.summary_length',
    'summarizerSummaryLength',
    { unit: 'chars' },
  ),
  summarizerIncludeDomainHint: switchField(
    'ai_tools.summarizer.include_domain_hint',
    'summarizerIncludeDomainHint',
  ),
  summarizerMergeMode: enumField(
    'ai_tools.summarizer.merge_mode',
    'summarizerMergeMode',
    mergeModeSchema,
    mergeModeLabel,
  ),

  reorganizationEnabled: switchField('ai_tools.reorganization.enabled', 'reorganizationEnabled'),
  reorganizationDefaultScope: scopeField(
    'ai_tools.reorganization',
    'reorganizationDefaultScope',
    TOOL_SCOPE_CAPABILITIES.reorganization,
  ),
  reorganizationMinConfidence: numberField(
    'ai_tools.reorganization.min_confidence',
    'reorganizationMinConfidence',
    { control: 'slider', percent: true },
  ),
  reorganizationBatchSize: numberField(
    'ai_tools.reorganization.batch_size',
    'reorganizationBatchSize',
  ),

  duplicatesEnabled: switchField('maintenance.duplicates.enabled', 'duplicatesEnabled'),
  duplicatesDefaultScope: scopeField(
    'maintenance.duplicates',
    'duplicatesDefaultScope',
    TOOL_SCOPE_CAPABILITIES.duplicates,
  ),
  duplicatesMatchStrategy: enumField(
    'maintenance.duplicates.match_strategy',
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
  duplicatesNormalizeWww: switchField(
    'maintenance.duplicates.normalize_www',
    'duplicatesNormalizeWww',
  ),
  duplicatesIgnoreProtocol: switchField(
    'maintenance.duplicates.ignore_protocol',
    'duplicatesIgnoreProtocol',
  ),
  duplicatesIgnoreTrailingSlash: switchField(
    'maintenance.duplicates.ignore_trailing_slash',
    'duplicatesIgnoreTrailingSlash',
  ),
  duplicatesKeepRule: enumField(
    'maintenance.duplicates.keep_rule',
    'duplicatesKeepRule',
    duplicateKeepRuleSchema,
    (value) =>
      ({
        oldest: t('settings_duplicatesKeepOldest'),
        newest: t('settings_duplicatesKeepNewest'),
        first: t('settings_duplicatesKeepFirst'),
      })[value],
  ),
  duplicatesMaxGroups: numberField('maintenance.duplicates.max_groups', 'duplicatesMaxGroups'),

  urlCleanerEnabled: switchField('maintenance.url_cleaner.enabled', 'urlCleanerEnabled'),
  urlCleanerDefaultScope: scopeField(
    'maintenance.url_cleaner',
    'urlCleanerDefaultScope',
    TOOL_SCOPE_CAPABILITIES.urlCleaner,
  ),
  urlCleanerRemoveHash: switchField('maintenance.url_cleaner.remove_hash', 'urlCleanerRemoveHash'),
  urlCleanerSortQueryParams: switchField(
    'maintenance.url_cleaner.sort_query_params',
    'urlCleanerSortQueryParams',
  ),
  urlCleanerDedupeQueryParams: switchField(
    'maintenance.url_cleaner.dedupe_query_params',
    'urlCleanerDedupeQueryParams',
  ),
  urlCleanerPreserveParams: nameListField(
    'maintenance.url_cleaner.preserve_params',
    'urlCleanerPreserveParams',
  ),
  urlCleanerRemoveParams: nameListField(
    'maintenance.url_cleaner.remove_params',
    'urlCleanerRemoveParams',
  ),

  deadLinksEnabled: switchField('maintenance.dead_links.enabled', 'deadLinksEnabled'),
  deadLinksDefaultScope: scopeField(
    'maintenance.dead_links',
    'deadLinksDefaultScope',
    TOOL_SCOPE_CAPABILITIES.deadLinks,
  ),
  deadLinksRequestTimeoutMs: numberField(
    'maintenance.dead_links.request_timeout_ms',
    'deadLinksRequestTimeoutMs',
    { unit: 'ms', display: IN_SECONDS },
  ),
  deadLinksConcurrency: numberField('maintenance.dead_links.concurrency', 'deadLinksConcurrency'),
  deadLinksRetryCount: numberField('maintenance.dead_links.retry_count', 'deadLinksRetryCount'),
  deadLinksFollowRedirects: switchField(
    'maintenance.dead_links.follow_redirects',
    'deadLinksFollowRedirects',
  ),
  deadLinksOnDead: enumField(
    'maintenance.dead_links.on_dead',
    'deadLinksOnDead',
    deadLinkFailureActionSchema,
    deadLinkActionLabel,
  ),
  deadLinksOnCheck: enumField(
    'maintenance.dead_links.on_check',
    'deadLinksOnCheck',
    deadLinkFailureActionSchema,
    deadLinkActionLabel,
  ),
  deadLinksOnRedirect: enumField(
    'maintenance.dead_links.on_redirect',
    'deadLinksOnRedirect',
    deadLinkRedirectActionSchema,
    deadLinkActionLabel,
  ),
  deadLinksSuccessStatuses: numberListField(
    'maintenance.dead_links.success_statuses',
    'deadLinksSuccessStatuses',
    httpStatusCodeSchema,
  ),
  jobsApplyInBackgroundAbove: numberField(
    'maintenance.background_tasks.apply_in_background_above',
    'jobsApplyInBackgroundAbove',
  ),

  metadataFetcherEnabled: switchField(
    'metadata_content.metadata_fetcher.enabled',
    'metadataFetcherEnabled',
  ),
  metadataFetcherDefaultScope: scopeField(
    'metadata_content.metadata_fetcher',
    'metadataFetcherDefaultScope',
    TOOL_SCOPE_CAPABILITIES.metadataFetcher,
  ),
  metadataFetcherOverwriteTitles: switchField(
    'metadata_content.metadata_fetcher.overwrite_titles',
    'metadataFetcherOverwriteTitles',
  ),
  metadataFetcherFetchDescriptions: switchField(
    'metadata_content.metadata_fetcher.fetch_descriptions',
    'metadataFetcherFetchDescriptions',
  ),
  metadataFetcherRequestTimeoutMs: numberField(
    'metadata_content.metadata_fetcher.request_timeout_ms',
    'metadataFetcherRequestTimeoutMs',
    { unit: 'ms', display: IN_SECONDS },
  ),
  metadataFetcherConcurrency: numberField(
    'metadata_content.metadata_fetcher.concurrency',
    'metadataFetcherConcurrency',
  ),

  siteIconsEnabled: switchField('metadata_content.site_icons.enabled', 'siteIconsEnabled'),
  siteIconsDefaultScope: scopeField(
    'metadata_content.site_icons',
    'siteIconsDefaultScope',
    TOOL_SCOPE_CAPABILITIES.siteIcons,
  ),
  siteIconsPreferredSize: numberField(
    'metadata_content.site_icons.preferred_size',
    'siteIconsPreferredSize',
    {
      unit: 'px',
    },
  ),
  siteIconsMaxIconKb: numberField('metadata_content.site_icons.max_icon_kb', 'siteIconsMaxIconKb', {
    unit: 'kb',
  }),
  siteIconsMaxCacheKb: numberField(
    'metadata_content.site_icons.max_cache_kb',
    'siteIconsMaxCacheKb',
    {
      unit: 'kb',
      display: { unit: 'mb', scale: 1024 },
    },
  ),

  bookmarkRulesEnabled: switchField('maintenance.bookmark_rules.enabled', 'bookmarkRulesEnabled'),
  bookmarkRulesDefaultScope: scopeField(
    'maintenance.bookmark_rules',
    'bookmarkRulesDefaultScope',
    TOOL_SCOPE_CAPABILITIES.bookmarkRules,
  ),
  bookmarkRulesAutoTag: switchField('maintenance.bookmark_rules.auto_tag', 'bookmarkRulesAutoTag'),
  bookmarkRulesAutoMove: switchField(
    'maintenance.bookmark_rules.auto_move',
    'bookmarkRulesAutoMove',
  ),
  bookmarkRulesNewFrom: enumField(
    'maintenance.bookmark_rules.new_from',
    'bookmarkRulesNewFrom',
    ruleNewBookmarkSourceSchema,
    (value) =>
      ({
        scout: t('settings_bookmarkRulesNewFromScout'),
        any: t('settings_bookmarkRulesNewFromAny'),
      })[value],
  ),
  pageTextEnabled: switchField('metadata_content.page_text.enabled', 'pageTextEnabled'),
  pageTextDefaultScope: scopeField(
    'metadata_content.page_text',
    'pageTextDefaultScope',
    TOOL_SCOPE_CAPABILITIES.pageText,
  ),
  pageTextSkipSecretUrls: switchField(
    'metadata_content.page_text.skip_secret_urls',
    'pageTextSkipSecretUrls',
  ),
  pageTextExcludedSites: siteListField(
    'metadata_content.page_text.excluded_sites',
    'pageTextExcludedSites',
  ),

  coversEnabled: switchField('metadata_content.covers.enabled', 'coversEnabled'),
  coversDefaultScope: scopeField(
    'metadata_content.covers',
    'coversDefaultScope',
    TOOL_SCOPE_CAPABILITIES.covers,
  ),
  coversReviewSingle: switchField('metadata_content.covers.review_single', 'coversReviewSingle'),
  coversWidthPx: numberField('metadata_content.covers.width_px', 'coversWidthPx', { unit: 'px' }),
  coversMaxImageKb: numberField('metadata_content.covers.max_image_kb', 'coversMaxImageKb', {
    unit: 'kb',
  }),
  coversQuality: numberField('metadata_content.covers.quality', 'coversQuality', {
    control: 'slider',
    percent: true,
  }),
  coversMaxCacheMb: numberField('metadata_content.covers.max_cache_mb', 'coversMaxCacheMb', {
    unit: 'mb',
  }),
  coversSourcePreference: enumField(
    'metadata_content.covers.source_preference',
    'coversSourcePreference',
    coverPreferenceSchema,
    getCoverPreferenceLabel,
  ),
  coversBrowseCapture: switchField('metadata_content.covers.browse_capture', 'coversBrowseCapture'),
  coversBrowseCapturePrivate: switchField(
    'metadata_content.covers.browse_capture_private',
    'coversBrowseCapturePrivate',
  ),
  coversBrowseSettleMs: numberField(
    'metadata_content.covers.browse_settle_ms',
    'coversBrowseSettleMs',
    { unit: 'ms', display: IN_SECONDS },
  ),
  coversBrowseIntervalMs: numberField(
    'metadata_content.covers.browse_min_interval_ms',
    'coversBrowseIntervalMs',
    { unit: 'ms', display: IN_SECONDS },
  ),
  coversBrowseMaxAgeDays: numberField(
    'metadata_content.covers.browse_max_age_days',
    'coversBrowseMaxAgeDays',
    { unit: 'days' },
  ),
  coversNeverCaptureSites: siteListField(
    'metadata_content.covers.never_capture_sites',
    'coversNeverCaptureSites',
  ),

  privacyScannerEnabled: switchField('security.privacy_scanner.enabled', 'privacyScannerEnabled'),
  privacyScannerDefaultScope: scopeField(
    'security.privacy_scanner',
    'privacyScannerDefaultScope',
    TOOL_SCOPE_CAPABILITIES.privacyScanner,
  ),
  privacyScannerScanTitles: switchField(
    'security.privacy_scanner.scan_titles',
    'privacyScannerScanTitles',
  ),
  privacyScannerScanQueryParams: switchField(
    'security.privacy_scanner.scan_query_params',
    'privacyScannerScanQueryParams',
  ),
  privacyScannerScanFragments: switchField(
    'security.privacy_scanner.scan_fragments',
    'privacyScannerScanFragments',
  ),
  privacyScannerSensitiveParams: nameListField(
    'security.privacy_scanner.sensitive_params',
    'privacyScannerSensitiveParams',
  ),
  privacyScannerEmailDetection: switchField(
    'security.privacy_scanner.email_detection',
    'privacyScannerEmailDetection',
  ),
  privacyScannerUuidDetection: switchField(
    'security.privacy_scanner.uuid_detection',
    'privacyScannerUuidDetection',
  ),

  statisticsEnabled: switchField('analytics.statistics.enabled', 'statisticsEnabled'),
  statisticsDefaultScope: scopeField(
    'analytics.statistics',
    'statisticsDefaultScope',
    TOOL_SCOPE_CAPABILITIES.statistics,
  ),
  statisticsIncludeDomains: switchField(
    'analytics.statistics.include_domains',
    'statisticsIncludeDomains',
  ),
  statisticsIncludeFolders: switchField(
    'analytics.statistics.include_folders',
    'statisticsIncludeFolders',
  ),
  statisticsIncludeDuplicates: switchField(
    'analytics.statistics.include_duplicates',
    'statisticsIncludeDuplicates',
  ),
  statisticsIncludeProtocols: switchField(
    'analytics.statistics.include_protocols',
    'statisticsIncludeProtocols',
  ),
  statisticsIncludeDepthBreakdown: switchField(
    'analytics.statistics.include_depth_breakdown',
    'statisticsIncludeDepthBreakdown',
  ),
  statisticsTopN: numberField('analytics.statistics.top_n', 'statisticsTopN'),

  dataShowExport: switchField('data.tools.show_export', 'dataShowExport'),
  dataShowImport: switchField('data.tools.show_import', 'dataShowImport'),
  backupExportCategories: choiceListField(
    'data.backup.parts',
    'backupExportCategories',
    BACKUP_REMEMBERED_CATEGORY_IDS,
    getBackupCategoryLabel,
  ),
  backupEncryptByDefault: switchField('data.backup.encrypt_by_default', 'backupEncryptByDefault'),
  backupEncryptSecrets: switchField('data.backup.encrypt_secrets', 'backupEncryptSecrets'),
  dataDefaultExportFormat: enumField(
    'data.export.default_format',
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

/**
 * Number settings that form a range: the minimum may not exceed the maximum (a maximum of -1
 * means no limit). Validation rejects a stored range that breaks this, and Options keeps each
 * stepper within the other's value, so the range cannot be entered the wrong way round.
 */
export const SETTING_RANGES = [
  { min: 'autoTaggingMinTags', max: 'autoTaggingMaxTags' },
  { min: 'aiMinItemsPerFolder', max: 'aiMaxItemsPerFolder' },
] as const satisfies readonly { min: SettingsKey; max: SettingsKey }[];

export const settingsSchema = z.object(settingsShape).superRefine((value, ctx) => {
  for (const range of SETTING_RANGES) {
    const max = value[range.max];
    if (max !== -1 && value[range.min] > max) {
      ctx.addIssue({
        code: 'custom',
        path: [range.min],
        message: `${range.min} cannot exceed ${range.max}`,
      });
    }
  }
});

export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = settingsSchema.parse({});
// Dates show in the default formats until the settings are read.
setDefaultDateTimeFormat(defaultSettings.dateFormat, defaultSettings.timeFormat);

/**
 * Where a setting is stored: synced to every device (`sync`, or `lists` for a list, so each
 * synced item stays within the sync quota), or kept on this one (`DEVICE_SETTING_KEYS`).
 */
export type SettingScope = 'sync' | 'lists' | 'device';
export const SETTING_SCOPES = [
  'sync',
  'lists',
  'device',
] as const satisfies readonly SettingScope[];

const deviceSettingKeys = new Set<string>(DEVICE_SETTING_KEYS);

export function getSettingScope(key: keyof Settings): SettingScope {
  if (deviceSettingKeys.has(key)) return 'device';
  return Array.isArray(defaultSettings[key]) ? 'lists' : 'sync';
}

const SETTINGS_KEYS = Object.keys(defaultSettings) as (keyof Settings)[];

/** Every setting stored in `scope`. */
export const SETTING_KEYS_BY_SCOPE: Readonly<Record<SettingScope, readonly (keyof Settings)[]>> =
  Object.fromEntries(
    SETTING_SCOPES.map((scope) => [
      scope,
      SETTINGS_KEYS.filter((key) => getSettingScope(key) === scope),
    ]),
  ) as Record<SettingScope, (keyof Settings)[]>;

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
        fields: [
          'maxSearchResults',
          'expandFoldersOnSearch',
          'searchHistory',
          'searchHistoryMax',
          'searchDebounceMs',
        ],
      },
      {
        id: 'saving',
        labelKey: 'settings_sectionSaving',
        fields: ['recentFoldersEnabled', 'recentFoldersMax', 'defaultNewFolderName'],
      },
      {
        id: 'quickSave',
        labelKey: 'settings_sectionQuickSave',
        fields: [
          'quickSaveFolderStrategy',
          'quickSaveFixedFolder',
          'quickSaveAlternatives',
          'quickSaveNotificationMs',
          'quickSaveCover',
          'quickSaveCoverSource',
          'quickSaveCoverExisting',
        ],
        panel: 'shortcuts',
      },
      {
        id: 'contextMenu',
        labelKey: 'settings_contextMenuEnabled',
        toggle: 'contextMenuEnabled',
        fields: ['contextMenuContexts', 'contextMenuBookmarkNaming', 'contextMenuRecentMax'],
        panel: 'contextMenuEntries',
      },
      {
        id: 'settingsSearch',
        labelKey: 'settings_sectionSettingsSearch',
        fields: [
          'settingsSearchSources',
          'settingsSearchMatch',
          'settingsSearchHighlight',
          'settingsSearchNotes',
          'settingsSearchTabCounts',
        ],
      },
    ]),
    appearance: category('settings_appearance', 'settings_appearanceDesc', [
      {
        id: 'themeIcons',
        labelKey: 'settings_sectionThemeIcons',
        fields: ['language', 'theme', 'showFavicons', 'browserIconCache', 'faviconSize'],
      },
      { id: 'dates', labelKey: 'settings_sectionDates', fields: ['dateFormat', 'timeFormat'] },
      { id: 'addresses', labelKey: 'settings_sectionAddresses', fields: ['showTrailingSlash'] },
      {
        id: 'popup',
        labelKey: 'settings_sectionPopup',
        fields: ['popupWidth', 'popupHeight', 'truncateLength', 'treeDensity', 'showHoverDetails'],
        panel: 'popupLayout',
      },
      {
        id: 'notifications',
        labelKey: 'settings_sectionNotifications',
        fields: ['toastDurationMs', 'tooltipDelayMs', 'hoverCardOpenDelayMs', 'toastPosition'],
      },
    ]),
    behavior: category('settings_behavior', 'settings_behaviorDesc', [
      {
        id: 'tree',
        labelKey: 'settings_sectionTree',
        fields: ['sortOrder', 'groupByFolders', 'treeDragAndDrop', 'popupExpandOnOpen'],
      },
      {
        id: 'links',
        labelKey: 'settings_sectionLinks',
        fields: ['linkOpenTarget', 'showLinkTarget', 'openConfirmAbove'],
      },
      {
        id: 'managerView',
        labelKey: 'settings_sectionManagerView',
        fields: [
          'managerViewMode',
          'managerSortOrder',
          'managerStartFolder',
          'managerStartFolderId',
          'managerSidebarsStart',
        ],
      },
      {
        id: 'managerTable',
        labelKey: 'settings_sectionManagerTable',
        fields: ['managerDefaultPageSize', 'managerDefaultSort', 'managerTableDates'],
        panel: 'managerColumns',
      },
      {
        id: 'managerCards',
        labelKey: 'settings_sectionManagerCards',
        fields: [
          'managerCardSize',
          'managerCardColumns',
          'managerCardCoverShape',
          'managerCardCoverFit',
          'managerCardTitleLines',
          'cardMaxTags',
          'cardSummaryLines',
        ],
        panel: 'managerCardFields',
      },
      { id: 'managerPreview', fields: [], panel: 'previewFields' },
      {
        id: 'toolsSidebar',
        labelKey: 'settings_sectionToolsSidebar',
        fields: ['toolsSidebarLayout', 'toolsSidebarDefaultTab'],
        panel: 'toolsSidebarOrder',
      },
      { id: 'deleting', labelKey: 'settings_sectionDeleting', fields: ['confirmBeforeDelete'] },
      {
        id: 'history',
        labelKey: 'settings_sectionHistory',
        fields: ['historyRecordOutsideChanges'],
      },
      { id: 'managerMenus', fields: [], panel: 'managerMenus' },
      { id: 'popupMenus', fields: [], panel: 'popupMenus' },
      { id: 'pageShortcuts', fields: [], panel: 'pageShortcuts' },
    ]),
    ai: category('settings_ai', 'settings_aiDesc', [
      // What AI is and costs comes first, then the switch, then the services it turns on (provider
      // and model live there, not in synced settings), then what the services are used for.
      { id: 'intro', fields: [], panel: 'aiIntro' },
      { id: 'enable', fields: ['aiEnabled'], panel: 'aiServices' },
      {
        id: 'suggestions',
        labelKey: 'settings_sectionSuggestions',
        requires: 'aiEnabled',
        fields: ['aiAutoTriggerOnOpen', 'aiMaxRecommendations'],
      },
      {
        id: 'pageReading',
        labelKey: 'settings_aiReadPageContent',
        fields: ['aiReadPageContent', 'readPageSkipPrivateHosts'],
        requires: 'aiEnabled',
      },
      {
        id: 'outputLanguage',
        labelKey: 'settings_aiOutputLanguage',
        fields: ['aiOutputLanguage'],
        requires: 'aiEnabled',
      },
      { id: 'aboutMe', fields: [], panel: 'aboutMe', requires: 'aiEnabled' },
      {
        id: 'askAi',
        labelKey: 'askAI_title',
        fields: ['askAiMaxSteps', 'askAiKeepChats', 'askAiChatsMax'],
        requires: 'aiEnabled',
      },
      { id: 'askAiActions', fields: [], panel: 'askAiActions', requires: 'aiEnabled' },
      { id: 'activity', fields: [], panel: 'aiActivity' },
    ]),
    aiTools: category('settings_aiTools', 'settings_aiToolsDesc', [
      { id: 'prompts', fields: [], panel: 'promptLibrary', requires: 'aiEnabled' },
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
        advanced: [
          'aiContextPackerMaxItems',
          'aiContextPackerMaxDepth',
          'aiContextPackerExcerptLength',
        ],
      },
      {
        id: 'autoTagging',
        labelKey: 'tools_autoTagging',
        toggle: 'autoTaggingEnabled',
        requires: 'aiEnabled',
        fields: [
          'autoTaggingDefaultScope',
          'autoTaggingMinTags',
          'autoTaggingMaxTags',
          'autoTaggingTagStyle',
          'autoTaggingMergeMode',
          'autoTaggingDedupeTags',
          'autoTaggingSendExistingTags',
        ],
      },
      {
        id: 'summarizer',
        labelKey: 'tools_summarizer',
        toggle: 'summarizerEnabled',
        requires: 'aiEnabled',
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
        requires: 'aiEnabled',
        fields: ['reorganizationDefaultScope'],
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
          'deadLinksOnDead',
          'deadLinksOnCheck',
          'deadLinksOnRedirect',
        ],
        advanced: [
          'deadLinksRequestTimeoutMs',
          'deadLinksConcurrency',
          'deadLinksRetryCount',
          'deadLinksSuccessStatuses',
        ],
      },
      {
        id: 'bookmarkRules',
        labelKey: 'tools_bookmarkRules',
        toggle: 'bookmarkRulesEnabled',
        fields: [
          'bookmarkRulesDefaultScope',
          'bookmarkRulesAutoTag',
          'bookmarkRulesAutoMove',
          'bookmarkRulesNewFrom',
        ],
        panel: 'bookmarkRules',
      },
      {
        id: 'backgroundTasks',
        labelKey: 'jobs_title',
        fields: ['jobsApplyInBackgroundAbove'],
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
        fields: ['siteIconsDefaultScope'],
        advanced: ['siteIconsPreferredSize', 'siteIconsMaxIconKb', 'siteIconsMaxCacheKb'],
      },
      {
        id: 'pageText',
        labelKey: 'tools_pageText',
        toggle: 'pageTextEnabled',
        fields: ['pageTextDefaultScope', 'pageTextSkipSecretUrls', 'pageTextExcludedSites'],
        panel: 'pageText',
      },
      {
        id: 'covers',
        labelKey: 'tools_covers',
        toggle: 'coversEnabled',
        fields: [
          'coversDefaultScope',
          'coversSourcePreference',
          'coversReviewSingle',
          'coversBrowseCapture',
          'coversBrowseCapturePrivate',
          'coversBrowseSettleMs',
          'coversBrowseIntervalMs',
          'coversBrowseMaxAgeDays',
          'coversNeverCaptureSites',
        ],
        advanced: ['coversWidthPx', 'coversQuality', 'coversMaxImageKb', 'coversMaxCacheMb'],
        panel: 'covers',
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
        fields: ['dataDefaultExportFormat', 'exportIncludeDates', 'exportIncludeUrls'],
        advanced: [
          'exportFilenamePrefix',
          'exportFilenameMaxLength',
          'exportJsonIndentSize',
          'exportHtmlIndentSpaces',
          'exportMarkdownIndentSpaces',
        ],
      },
      {
        id: 'backup',
        labelKey: 'settings_sectionBackup',
        fields: ['backupExportCategories', 'backupEncryptByDefault', 'backupEncryptSecrets'],
      },
    ]),
    // Local agents need a program installed from a terminal and bring their own model, so they
    // sit apart from AI (and work with AI off).
    developers: category('essentials_developers', 'essentials_developersDesc', [
      {
        id: 'agentBridge',
        labelKey: 'settings_agentBridge',
        toggle: 'agentBridgeEnabled',
        fields: ['agentBridgeWrites', 'agentBridgeRedactUrls'],
        panel: 'agentBridge',
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
  agentBridgeEnabled: 'agentBridge',
  browserIconCache: 'browserIcons',
  contextMenuEnabled: 'contextMenu',
  coversBrowseCapture: 'browseCovers',
} as const satisfies Partial<Record<keyof Settings, PermissionFeature>>;

/**
 * Settings shown only while another on/off setting is on, such as the limits of Capture Covers
 * While Browsing under it. They keep their values while hidden.
 */
export const SETTING_SHOWN_WHEN = {
  coversBrowseCapturePrivate: 'coversBrowseCapture',
  coversBrowseSettleMs: 'coversBrowseCapture',
  coversBrowseIntervalMs: 'coversBrowseCapture',
  coversBrowseMaxAgeDays: 'coversBrowseCapture',
  quickSaveCoverSource: 'quickSaveCover',
  quickSaveCoverExisting: 'quickSaveCover',
  // The folder to start on, only while Start Folder says to use a chosen one.
  managerStartFolderId: { key: 'managerStartFolder', equals: 'chosen' },
  // The tab the Tools sidebar opens on, only while it shows tabs.
  toolsSidebarDefaultTab: { key: 'toolsSidebarLayout', equals: 'tabs' },
} as const satisfies Partial<Record<keyof Settings, ShownWhen>>;

/** What a setting shows with: another setting on, or another setting at one value. */
type ShownWhen = keyof Settings | { key: keyof Settings; equals: string };

/**
 * Whether `key` shows with these values: always, unless the setting it depends on is off (or at
 * another value).
 */
export function isSettingShownWith(key: keyof Settings, values: Settings): boolean {
  const lead = (SETTING_SHOWN_WHEN as Partial<Record<keyof Settings, ShownWhen>>)[key];
  if (lead === undefined) return true;
  return typeof lead === 'string' ? values[lead] === true : values[lead.key] === lead.equals;
}

/**
 * Settings that work only where the browser lets the extension run in private windows (Allow in
 * Incognito, Run in Private Windows); Options says so under them while it does not.
 */
const PRIVATE_WINDOW_SETTINGS: ReadonlySet<keyof Settings> = new Set([
  'coversBrowseCapturePrivate',
]);

export function isPrivateWindowSetting(key: keyof Settings): boolean {
  return PRIVATE_WINDOW_SETTINGS.has(key);
}

/** The permission feature a setting turns on, if any. */
export function getSettingPermission(key: keyof Settings): PermissionFeature | undefined {
  return (SETTING_PERMISSIONS as Partial<Record<keyof Settings, PermissionFeature>>)[key];
}

/** False for a setting whose feature this browser lacks (the icon cache in Firefox). */
function isSettingSupported(key: keyof Settings): boolean {
  const feature = getSettingPermission(key);
  return !feature || isPermissionFeatureSupported(feature, currentBrowser());
}

/**
 * Settings shown on the page: supported in this browser, and a real choice. A tool that works on
 * one scope only (Auto-Tagging on the current folder) has a one-option "Default Scope"; a choice
 * of one is left off the page.
 */
export function isSettingShown(key: keyof Settings): boolean {
  const meta = getSettingsFieldMeta()[key];
  return isSettingSupported(key) && (meta.type !== 'select' || (meta.options?.length ?? 0) > 1);
}

/** The category without the settings this browser does not show. */
function withShownSettings(category: SettingsCategoryMeta): SettingsCategoryMeta {
  return {
    ...category,
    sections: category.sections.map((section) => ({
      ...section,
      fields: section.fields.filter(isSettingShown),
      ...(section.advanced ? { advanced: section.advanced.filter(isSettingShown) } : {}),
    })),
    fields: category.fields.filter(isSettingShown),
  };
}

/**
 * Every setting's own tab, in display order; on the page they follow Essentials under an
 * "Advanced" heading. Search reads these, so it finds each setting once, in its own tab.
 */
export function getSettingsCategories(): Record<string, SettingsCategoryMeta> {
  return Object.fromEntries(
    Object.entries(buildCategories()).map(([id, category]) => [id, withShownSettings(category)]),
  );
}

/** Options' first tab: the few settings most people change (`config/ui/essentials.toml`). */
export const ESSENTIALS_CATEGORY = 'essentials';

const essentialsConfig = readConfig(
  'ui/essentials',
  z.strictObject({
    settings: z
      .array(z.string().refine((key) => key in defaultSettings, 'not a settings key'))
      .min(1)
      .refine((keys) => new Set(keys).size === keys.length, 'a setting is listed twice'),
  }),
);

/** The settings Essentials shows, as configured; each also stays in its own tab. */
export const ESSENTIAL_SETTINGS = essentialsConfig.settings as readonly (keyof Settings)[];

/**
 * Essentials: the configured settings as one section (the same rows, keys, and stored values as
 * in their own tabs), then a pointer to AI, which is optional and set up in its own tab.
 */
export function getEssentialsCategory(): SettingsCategoryMeta {
  return withShownSettings(
    category('essentials_title', 'essentials_description', [
      { id: 'essentials', fields: ESSENTIAL_SETTINGS, panel: 'essentialsAi' },
    ]),
  );
}

const localizedProviderNameKeys: Partial<Record<AIProvider, string>> = {
  ollama: 'settings_aiProviderOllama',
  custom: 'settings_aiProviderCustom',
  custom_anthropic: 'settings_aiProviderCustomAnthropic',
  chrome_builtin: 'builtinAi_providerName',
};

/** Brand names stay as configured; generic provider names are translated. */
export function getLocalizedProviderName(provider: AIProvider): string {
  const key = localizedProviderNameKeys[provider];
  return key ? t(key) : getProviderName(provider);
}

/**
 * The config table each setting's default lives in, `<tab>.<section>` as on the Options page
 * (`search.folder_matches`). tests/unit/settings-config.test.ts keeps the two in step.
 */
export function getSettingsConfigSections(): Record<keyof Settings, string> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field.section]),
  ) as Record<keyof Settings, string>;
}

let fieldMetaCache:
  | { revision: number; meta: Record<keyof Settings, SettingsFieldMeta> }
  | undefined;

/**
 * Labels, units, and options of every setting, in the language `t()` shows. Built once per
 * language: every row reads it on every render, and the AI model options alone list the whole
 * provider catalog, so rebuilding it per call made each edit on the Options page take seconds
 * on slow machines.
 */
export function getSettingsFieldMeta(): Readonly<Record<keyof Settings, SettingsFieldMeta>> {
  const revision = getLanguageRevision();
  if (fieldMetaCache?.revision !== revision) {
    const meta = Object.fromEntries(
      Object.entries(fields).map(([key, field]) => [key, field.meta()]),
    ) as Record<keyof Settings, SettingsFieldMeta>;
    fieldMetaCache = { revision, meta };
  }
  return fieldMetaCache.meta;
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
    group({
      id: 'popupSize',
      kind: 'pair',
      labelKey: 'settings_groupPopupSize',
      fields: ['popupWidth', 'popupHeight'],
    }),
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
    group({
      id: 'recentFolders',
      kind: 'switch',
      fields: ['recentFoldersEnabled', 'recentFoldersMax'],
    }),
    group({
      id: 'askAiChats',
      kind: 'switch',
      fields: ['askAiKeepChats', 'askAiChatsMax'],
    }),
    group({
      id: 'favicons',
      kind: 'switch',
      fields: ['showFavicons', 'faviconSize', 'browserIconCache'],
    }),
    ...CHECKLISTS.map((spec) => group({ ...spec, kind: 'checklist' })),
  ];
}

const CHECKLISTS: readonly { id: string; labelKey: string; fields: readonly (keyof Settings)[] }[] =
  [
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
      id: 'settingsSearchShow',
      labelKey: 'settings_groupSettingsSearchShow',
      fields: ['settingsSearchHighlight', 'settingsSearchNotes', 'settingsSearchTabCounts'],
    },
    {
      id: 'dataShow',
      labelKey: 'settings_groupDataShow',
      fields: ['dataShowExport', 'dataShowImport'],
    },
  ];
