/**
 * AI prompt tasks: each AI tool's built-in default prompt, the rules the app adds after it, and
 * the {{placeholders}} it fills in. The texts live in config/ai/prompts.toml. Users keep any number
 * of their own prompts per task in the prompt library (src/lib/prompt-library-storage.ts); the
 * active one replaces the default. To give a new AI tool editable prompts, add its texts to the
 * TOML and its id to PromptTaskId, then call buildPrompt with its id.
 *
 * PROMPT_PLACEHOLDERS is the one table of placeholders: the prompt editor's list, the check for
 * unknown placeholders, previews, and buildPrompt all read it. To add one, add an entry (the tasks
 * it fills or 'all', the settings it reads, and how it resolves) and its `prompt_var<Name>`
 * description in every locale; nothing else changes.
 */
import { z } from 'zod';

// ============================================================================
// Prompt Template Types
// ============================================================================

/**
 * A prompt template with placeholders for dynamic content.
 * Placeholders use {{variableName}} syntax.
 */
export type PromptVariable = {
  name: string;
  /** i18n key explaining the value, shown on the variable chip. */
  descriptionKey: MessageKey;
};

export type PromptTaskId =
  | 'folder_recommendation'
  | 'folder_reorganization'
  | 'auto_tagging'
  | 'summarization'
  | 'ask_ai';

export type PromptTask = {
  id: PromptTaskId;
  /** i18n key for the task name; the tool's own title, so users recognize it */
  nameKey: MessageKey;
  /** i18n key for the task description */
  descriptionKey: MessageKey;
  /** Built-in system prompt, used when no custom prompt is active */
  system: string;
  /** Variables the tool fills in; anything else stays as written. */
  variables: PromptVariable[];
};

/**
 * Variables that can be substituted in prompt templates.
 */
export type PromptVariables = Record<string, string | number | string[] | undefined>;

/** `{{name}}` placeholders in prompts and rules. */
const PROMPT_VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

// ============================================================================
// Texts: config/ai/prompts.toml
// ============================================================================

const PROMPT_TASK_ID_LIST = [
  'folder_recommendation',
  'folder_reorganization',
  'auto_tagging',
  'summarization',
  'ask_ai',
] as const satisfies readonly PromptTaskId[];

const prompts = readConfig(
  'ai/prompts',
  z
    .strictObject({
      variables: z.strictObject({
        no_limit: z.string().min(1),
        language_name: z.string().includes('{{english}}').includes('{{native}}'),
        page_language: z.string().includes('{{fallback}}'),
      }),
      // Exactly one name per bundled locale, so a new language fails here until it has one.
      languages: z.strictObject(
        Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, z.string().min(1)])) as Record<
          SupportedLocale,
          z.ZodString
        >,
      ),
      rules: z.record(z.string(), z.string().min(1)),
      tasks: z.strictObject(
        Object.fromEntries(
          PROMPT_TASK_ID_LIST.map((id) => [
            id,
            z.strictObject({ system: z.string().min(1), rules: z.array(z.string()) }),
          ]),
        ) as Record<
          PromptTaskId,
          z.ZodObject<{ system: z.ZodString; rules: z.ZodArray<z.ZodString> }>
        >,
      ),
    })
    .superRefine((config, ctx) => {
      if (!('page_text' in config.rules)) {
        ctx.addIssue({ code: 'custom', message: 'rules.page_text is missing' });
      }
      for (const [id, task] of Object.entries(config.tasks)) {
        for (const rule of task.rules) {
          if (!(rule in config.rules)) {
            ctx.addIssue({ code: 'custom', message: `tasks.${id} uses unknown rule "${rule}"` });
          }
        }
      }
    }),
);

// ============================================================================
// Placeholders: one table for the editor, previews, and runs
// ============================================================================

/** A limit setting is unlimited at -1, the only value below its minimum of 1. */
const hasLimit = (value: number) => value > 0;

/** A limit as a prompt reads it: the number, or a phrase while there is none (never "-1"). */
const limitVariable = (value: number) => (hasLimit(value) ? value : prompts.variables.no_limit);

/** A bundled language as the model reads it: "Japanese (日本語)", or "English" alone. */
function languageForModel(locale: SupportedLocale): string {
  const english = prompts.languages[locale];
  const native = getLanguageName(locale);
  return native === english
    ? english
    : interpolatePrompt(prompts.variables.language_name, { english, native });
}

/**
 * What {{language}} reads: the chosen language, the extension's own for `auto`, or for `page` the
 * "same as each page" phrase with the extension's language as its fallback.
 */
function outputLanguageName(settings: Pick<Settings, 'aiOutputLanguage' | 'language'>): string {
  const { aiOutputLanguage } = settings;
  if (aiOutputLanguage !== AUTO_LANGUAGE && aiOutputLanguage !== PAGE_LANGUAGE) {
    return languageForModel(aiOutputLanguage);
  }
  const uiLanguage = languageForModel(resolveLanguagePreference(settings.language));
  return aiOutputLanguage === PAGE_LANGUAGE
    ? interpolatePrompt(prompts.variables.page_language, { fallback: uiLanguage })
    : uiLanguage;
}

type PromptValue = string | number;

type PromptPlaceholder<Tasks, Keys extends keyof Settings> = {
  /** The tasks whose prompts it fills, or 'all'. */
  tasks: Tasks;
  /** i18n key explaining the value, shown in the prompt editor. */
  descriptionKey: MessageKey;
  /** The settings it reads; they type what buildPrompt and previews must pass. */
  settings: readonly Keys[];
  resolve: (settings: Pick<Settings, Keys>) => PromptValue;
};

function placeholder<
  const Tasks extends readonly PromptTaskId[] | 'all',
  Keys extends keyof Settings = never,
>(spec: PromptPlaceholder<Tasks, Keys>): PromptPlaceholder<Tasks, Keys> {
  return spec;
}

/**
 * Every placeholder, in the order the prompt editor lists them. Prompt previews pass the stored
 * settings and tools pass the values they run with, so a preview always shows what is sent.
 */
const PROMPT_PLACEHOLDERS = {
  maxRecommendations: placeholder({
    tasks: ['folder_recommendation'],
    descriptionKey: 'prompt_varMaxRecommendations',
    settings: ['aiMaxRecommendations'],
    resolve: (settings) => settings.aiMaxRecommendations,
  }),
  maxCategories: placeholder({
    tasks: ['folder_reorganization'],
    descriptionKey: 'prompt_varMaxCategories',
    settings: ['aiMaxCategories'],
    resolve: (settings) => limitVariable(settings.aiMaxCategories),
  }),
  minItemsPerFolder: placeholder({
    tasks: ['folder_reorganization'],
    descriptionKey: 'prompt_varMinItemsPerFolder',
    settings: ['aiMinItemsPerFolder'],
    resolve: (settings) => settings.aiMinItemsPerFolder,
  }),
  maxItemsPerFolder: placeholder({
    tasks: ['folder_reorganization'],
    descriptionKey: 'prompt_varMaxItemsPerFolder',
    settings: ['aiMaxItemsPerFolder'],
    resolve: (settings) => limitVariable(settings.aiMaxItemsPerFolder),
  }),
  minTags: placeholder({
    tasks: ['auto_tagging'],
    descriptionKey: 'prompt_varMinTags',
    settings: ['autoTaggingMinTags'],
    resolve: (settings) => settings.autoTaggingMinTags,
  }),
  maxTags: placeholder({
    tasks: ['auto_tagging'],
    descriptionKey: 'prompt_varMaxTags',
    settings: ['autoTaggingMaxTags'],
    resolve: (settings) => settings.autoTaggingMaxTags,
  }),
  tagStyle: placeholder({
    tasks: ['auto_tagging'],
    descriptionKey: 'prompt_varTagStyle',
    settings: ['autoTaggingTagStyle'],
    resolve: (settings) => settings.autoTaggingTagStyle,
  }),
  summaryLength: placeholder({
    tasks: ['summarization'],
    descriptionKey: 'prompt_varSummaryLength',
    settings: ['summarizerSummaryLength'],
    resolve: (settings) => settings.summarizerSummaryLength,
  }),
  includeDomainHint: placeholder({
    tasks: ['summarization'],
    descriptionKey: 'prompt_varIncludeDomainHint',
    settings: ['summarizerIncludeDomainHint'],
    resolve: (settings) => (settings.summarizerIncludeDomainHint ? 'true' : 'false'),
  }),
  today: placeholder({
    tasks: ['ask_ai'],
    descriptionKey: 'prompt_varToday',
    settings: [],
    resolve: () => formatToday(),
  }),
  language: placeholder({
    tasks: 'all',
    descriptionKey: 'prompt_varLanguage',
    settings: ['aiOutputLanguage', 'language'],
    resolve: outputLanguageName,
  }),
};

type Placeholders = typeof PROMPT_PLACEHOLDERS;
type PlaceholderName = keyof Placeholders;
type SettingsOf<N extends PlaceholderName> = Placeholders[N]['settings'][number];

/** Placeholders only some tasks have: their settings are what a tool runs with. */
type TaskPlaceholder<T extends PromptTaskId> = {
  [N in PlaceholderName]: Placeholders[N]['tasks'] extends 'all'
    ? never
    : T extends Placeholders[N]['tasks'][number]
      ? N
      : never;
}[PlaceholderName];

/** Placeholders every task has: their settings are the stored ones unless a caller passes them. */
type SharedPlaceholder = {
  [N in PlaceholderName]: Placeholders[N]['tasks'] extends 'all' ? N : never;
}[PlaceholderName];

/** The settings a task's own placeholders are made from; full Settings always fit. */
export type PromptSettings<T extends PromptTaskId> = Pick<Settings, SettingsOf<TaskPlaceholder<T>>>;

/** The settings of the placeholders every task shares, such as the output language. */
export type SharedPromptSettings = Pick<Settings, SettingsOf<SharedPlaceholder>>;

type AnyPlaceholder = {
  tasks: readonly PromptTaskId[] | 'all';
  descriptionKey: MessageKey;
  resolve: (settings: Settings) => PromptValue;
};

const PLACEHOLDER_ENTRIES: [string, AnyPlaceholder][] = Object.entries(PROMPT_PLACEHOLDERS);

const appliesTo = (entry: AnyPlaceholder, taskId: PromptTaskId) =>
  entry.tasks === 'all' || entry.tasks.includes(taskId);

/** Rules in config/ai/prompts.toml that state the reorganization folder limits. */
const REORGANIZATION_LIMIT_RULES = {
  maxCategories: 'reorganization_max_categories',
  folderSize: 'reorganization_folder_size',
  minFolderSize: 'reorganization_min_folder_size',
} as const;

for (const rule of Object.values(REORGANIZATION_LIMIT_RULES)) {
  if (!(rule in prompts.rules)) throw new Error(`config/ai/prompts.toml: rules.${rule} is missing`);
}

/**
 * Rules a task adds only for some settings, after its fixed rules: a limit that is unlimited is
 * left out instead of telling the model "at most -1".
 */
const SETTING_RULES: {
  [T in PromptTaskId]?: (settings: PromptSettings<T>) => string[];
} = {
  folder_reorganization: (settings) => {
    const rules: string[] = [];
    if (hasLimit(settings.aiMaxCategories)) rules.push(REORGANIZATION_LIMIT_RULES.maxCategories);
    if (hasLimit(settings.aiMaxItemsPerFolder)) {
      rules.push(REORGANIZATION_LIMIT_RULES.folderSize);
    } else if (settings.aiMinItemsPerFolder > 1) {
      // At least one bookmark per folder goes without saying.
      rules.push(REORGANIZATION_LIMIT_RULES.minFolderSize);
    }
    return rules;
  },
};

/** The values a task fills into its {{placeholders}}. */
export function getPromptVariables<T extends PromptTaskId>(
  taskId: T,
  settings: PromptSettings<T> & SharedPromptSettings,
): PromptVariables {
  return Object.fromEntries(
    PLACEHOLDER_ENTRIES.filter(([, entry]) => appliesTo(entry, taskId)).map(([name, entry]) => [
      name,
      // Each resolver reads only the settings it declares, which the parameter type requires.
      entry.resolve(settings as Settings),
    ]),
  );
}

/** Today's date in ISO form, which every model reads the same way. */
export function formatToday(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

// ============================================================================
// Prompt Registry
// ============================================================================

type PromptTaskMeta = Pick<PromptTask, 'nameKey' | 'descriptionKey'>;

const PROMPT_TASK_META: Record<PromptTaskId, PromptTaskMeta> = {
  folder_recommendation: {
    nameKey: 'ai_folderRecommendation',
    descriptionKey: 'ai_promptFolderRecommendationDesc',
  },
  folder_reorganization: {
    nameKey: 'tools_aiReorganize',
    descriptionKey: 'ai_promptFolderReorganizationDesc',
  },
  auto_tagging: { nameKey: 'tools_autoTagging', descriptionKey: 'ai_promptAutoTaggingDesc' },
  summarization: { nameKey: 'tools_summarizer', descriptionKey: 'ai_promptSummarizationDesc' },
  ask_ai: { nameKey: 'askAI_title', descriptionKey: 'ai_promptAskAIDesc' },
};

export const PROMPT_TASKS: Record<PromptTaskId, PromptTask> = Object.fromEntries(
  PROMPT_TASK_ID_LIST.map((id) => [
    id,
    {
      id,
      ...PROMPT_TASK_META[id],
      system: prompts.tasks[id].system,
      variables: PLACEHOLDER_ENTRIES.filter(([, entry]) => appliesTo(entry, id)).map(
        ([name, entry]) => ({ name, descriptionKey: entry.descriptionKey }),
      ),
    },
  ]),
) as Record<PromptTaskId, PromptTask>;

export const PROMPT_TASK_IDS: PromptTaskId[] = [...PROMPT_TASK_ID_LIST];

// ============================================================================
// Prompt Utilities
// ============================================================================

/**
 * Interpolate variables into a prompt template.
 * Replaces {{variableName}} with actual values.
 */
export function interpolatePrompt(template: string, variables: PromptVariables): string {
  return template.replace(PROMPT_VARIABLE_PATTERN, (_, key) => {
    const value = variables[key];
    if (value === undefined) {
      return `{{${key}}}`; // Keep unresolved placeholders
    }
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return String(value);
  });
}

/** {{variables}} in `text` that the task does not fill in, so they would reach the model as is. */
export function findUnknownPromptVariables(taskId: PromptTaskId, text: string): string[] {
  const known = new Set(PROMPT_TASKS[taskId].variables.map((variable) => variable.name));
  const used = [...text.matchAll(PROMPT_VARIABLE_PATTERN)].map((match) => match[1]);
  return [...new Set(used.filter((name) => !known.has(name)))];
}

export type BuildPromptOptions = {
  /** Items carry text read from web pages, which the model must treat as data. */
  hasPageText?: boolean;
};

/**
 * The full system prompt a task sends: the active custom prompt from the prompt library (or the
 * built-in default), then the task's fixed rules and, for page text, the page-text rule, all
 * with the task's placeholders filled in from `settings`. Settings every task shares (the output
 * language) are read from storage unless `settings` has them.
 */
export async function buildPrompt<T extends PromptTaskId>(
  taskId: T,
  settings: PromptSettings<T> & Partial<SharedPromptSettings>,
  options: BuildPromptOptions = {},
): Promise<{ system: string }> {
  const prompt = (await getActivePromptText(taskId)) ?? PROMPT_TASKS[taskId].system;
  const settingRules = SETTING_RULES[taskId] as
    | ((settings: PromptSettings<T>) => string[])
    | undefined;
  const rules = [
    ...prompts.tasks[taskId].rules,
    ...(settingRules?.(settings) ?? []),
    ...(options.hasPageText ? ['page_text'] : []),
  ].map((name) => prompts.rules[name]);
  const variables = getPromptVariables(taskId, { ...(await getSettings()), ...settings });
  return {
    system: [prompt, ...rules].map((text) => interpolatePrompt(text, variables)).join('\n\n'),
  };
}
