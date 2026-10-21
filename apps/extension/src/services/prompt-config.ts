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
        Object.fromEntries(
          SUPPORTED_LOCALES.map((locale) => [locale, z.string().min(1)]),
        ) as Record<SupportedLocale, z.ZodString>,
      ),
      existing_tags: z.strictObject({
        max_tags: z.number().int().positive(),
        max_chars: z.number().int().positive(),
      }),
      editor: z.strictObject({ suggest_max_edits: z.number().int().nonnegative() }),
      blocks: z.strictObject({
        existing_tags: z.string().includes('{{tags}}'),
        about_me: z.string().includes('{{text}}'),
      }),
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

/** `text` inside a block template, with the block's closing tag taken out so it cannot end it. */
function fillBlock(template: string, name: 'tags' | 'text', text: string): string {
  const closing = template.match(/<\/\w+>/g)?.at(-1);
  const safe = closing ? text.split(closing).join('') : text;
  return interpolatePrompt(template, { [name]: safe });
}

/**
 * What {{existingTags}} reads: the tags in use, most used first, up to the configured count and
 * length, in their block; nothing when there are none or sending them is off.
 */
function existingTagsBlock(
  settings: Pick<Settings, 'autoTaggingSendExistingTags'>,
  vocabulary: readonly string[] = [],
): string {
  if (!settings.autoTaggingSendExistingTags) return '';
  const { max_tags: maxTags, max_chars: maxChars } = prompts.existing_tags;
  const tags: string[] = [];
  let length = 0;
  for (const tag of vocabulary.slice(0, maxTags)) {
    const line = tag.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (length + line.length + 1 > maxChars) break;
    tags.push(line);
    length += line.length + 1;
  }
  return tags.length > 0 ? fillBlock(prompts.blocks.existing_tags, 'tags', tags.join('\n')) : '';
}

/** What {{aboutMe}} reads: the user's "About me" in its block, or nothing while it is empty. */
function aboutMeBlock(text = ''): string {
  return text.trim() ? fillBlock(prompts.blocks.about_me, 'text', text.trim()) : '';
}

type PromptValue = string | number;

type PromptPlaceholder<Tasks, Keys extends keyof Settings, Data> = {
  /** The tasks whose prompts it fills, or 'all'. */
  tasks: Tasks;
  /** i18n key explaining the value, shown in the prompt editor. */
  descriptionKey: MessageKey;
  /** The settings it reads; they type what buildPrompt and previews must pass. */
  settings: readonly Keys[];
  /**
   * Data it reads from storage rather than settings, such as the user's tags. buildPrompt loads it
   * only when the prompt uses the placeholder; previews load it with `loadPromptData`.
   */
  load?: () => Promise<Data>;
  /** The value; `data` is undefined until loaded. An empty string leaves the placeholder out. */
  resolve: (settings: Pick<Settings, Keys>, data: Data | undefined) => PromptValue;
};

function placeholder<
  const Tasks extends readonly PromptTaskId[] | 'all',
  Keys extends keyof Settings = never,
  Data = never,
>(spec: PromptPlaceholder<Tasks, Keys, Data>): PromptPlaceholder<Tasks, Keys, Data> {
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
  existingTags: placeholder({
    tasks: ['auto_tagging'],
    descriptionKey: 'prompt_varExistingTags',
    settings: ['autoTaggingSendExistingTags'],
    load: async () => getTagVocabulary(await bookmarkMetadataValue.get()),
    resolve: existingTagsBlock,
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
    tasks: 'all',
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
  aboutMe: placeholder({
    tasks: 'all',
    descriptionKey: 'prompt_varAboutMe',
    settings: [],
    load: () => aboutMeValue.get(),
    resolve: (_settings, text) => aboutMeBlock(text),
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
  load?: () => Promise<unknown>;
  // Method syntax, so each entry's resolver keeps its own data type.
  resolve(settings: Settings, data: unknown): PromptValue;
};

/** Data loaded from storage for the placeholders that read it, by placeholder name. */
export type PromptData = {
  [N in PlaceholderName]?: Awaited<ReturnType<NonNullable<Placeholders[N]['load']>>>;
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

/** The values a task fills into its {{placeholders}}; ones that read storage need `data`. */
export function getPromptVariables<T extends PromptTaskId>(
  taskId: T,
  settings: PromptSettings<T> & SharedPromptSettings,
  data: PromptData = {},
): PromptVariables {
  return Object.fromEntries(
    PLACEHOLDER_ENTRIES.filter(([, entry]) => appliesTo(entry, taskId)).map(([name, entry]) => [
      name,
      // Each resolver reads only the settings it declares, which the parameter type requires.
      entry.resolve(settings as Settings, data[name as PlaceholderName]),
    ]),
  );
}

/**
 * Loads what the task's placeholders read from storage (the user's tags, "About me"): all of it,
 * or with `usedIn`, only for the placeholders that text uses, and none that `have` already holds
 * (returned with it). A failed read leaves its placeholder empty rather than failing the prompt.
 */
export async function loadPromptData(
  taskId: PromptTaskId,
  usedIn?: string,
  have: PromptData = {},
): Promise<PromptData> {
  const used = usedIn === undefined ? undefined : new Set(promptPlaceholderNames(usedIn));
  const entries = PLACEHOLDER_ENTRIES.filter(
    ([name, entry]) =>
      entry.load && appliesTo(entry, taskId) && (!used || used.has(name)) && !(name in have),
  );
  const loaded = await Promise.all(
    entries.map(async ([name, entry]) => [name, await entry.load?.().catch(() => undefined)]),
  );
  return { ...Object.fromEntries(loaded), ...have };
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

/** `{{name}}`, or `\{{`, which writes literal braces. */
const PLACEHOLDER_OR_ESCAPE = /\\\{\{|\{\{(\w+)\}\}/g;

/** A line that holds one placeholder and nothing else. */
const PLACEHOLDER_LINE = /^[ \t]*\{\{(\w+)\}\}[ \t]*$/;

/** The placeholder names `text` uses, in order, without `\{{` escapes. */
export function promptPlaceholderNames(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER_OR_ESCAPE)].flatMap((match) => (match[1] ? [match[1]] : []));
}

/**
 * Fills `{{name}}` placeholders in one pass: a value that itself contains `{{...}}` (page text,
 * "About me") is never expanded again. `\{{` writes `{{`, unknown names stay as written, and a
 * placeholder alone on its line that fills in nothing takes its line, and a blank line before it,
 * with it.
 */
export function interpolatePrompt(template: string, variables: PromptVariables): string {
  const lines: string[] = [];
  for (const line of template.split('\n')) {
    const alone = line.match(PLACEHOLDER_LINE);
    if (alone && variables[alone[1]] === '') {
      if (lines.at(-1)?.trim() === '') lines.pop();
      continue;
    }
    lines.push(
      line.replace(PLACEHOLDER_OR_ESCAPE, (match, key: string | undefined) => {
        if (key === undefined) return '{{';
        const value = variables[key];
        if (value === undefined) return match;
        return Array.isArray(value) ? value.join(', ') : String(value);
      }),
    );
  }
  return lines.join('\n');
}

/** {{variables}} in `text` that the task does not fill in, so they would reach the model as is. */
export function findUnknownPromptVariables(taskId: PromptTaskId, text: string): string[] {
  const known = new Set(PROMPT_TASKS[taskId].variables.map((variable) => variable.name));
  return [...new Set(promptPlaceholderNames(text).filter((name) => !known.has(name)))];
}

/** Edits that turn `a` into `b` (Levenshtein distance). */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
    }
    previous = current;
  }
  return previous[b.length];
}

/** The task's placeholder an unknown name was most likely meant to be ("maxtag" for maxTags). */
export function suggestPromptVariable(taskId: PromptTaskId, name: string): string | undefined {
  const lower = name.toLowerCase();
  let best: { name: string; distance: number } | undefined;
  for (const variable of PROMPT_TASKS[taskId].variables) {
    const distance = editDistance(lower, variable.name.toLowerCase());
    if (distance <= prompts.editor.suggest_max_edits && (!best || distance < best.distance)) {
      best = { name: variable.name, distance };
    }
  }
  return best?.name;
}

export type BuildPromptOptions = {
  /** Items carry text read from web pages, which the model must treat as data. */
  hasPageText?: boolean;
  /** Data for placeholders that read storage, when the caller already has it; the rest is read. */
  data?: PromptData;
};

/** The texts of the rules a task adds after its prompt, before placeholders are filled in. */
function promptRuleTexts<T extends PromptTaskId>(
  taskId: T,
  settings: PromptSettings<T>,
  options: BuildPromptOptions,
): string[] {
  const settingRules = SETTING_RULES[taskId] as
    | ((settings: PromptSettings<T>) => string[])
    | undefined;
  return [
    ...prompts.tasks[taskId].rules,
    ...(settingRules?.(settings) ?? []),
    ...(options.hasPageText ? ['page_text'] : []),
  ].map((name) => prompts.rules[name]);
}

/** A prompt as sent: the editable text, then the rules the app adds after it, all filled in. */
export type PromptParts = { prompt: string; rules: string[] };

/**
 * Fills in a prompt text and the task's rules, for previews (which show the rules as fixed) and
 * runs alike. Parts left empty by empty placeholders are dropped.
 */
export function composePrompt<T extends PromptTaskId>(
  taskId: T,
  text: string,
  settings: PromptSettings<T> & SharedPromptSettings,
  options: BuildPromptOptions = {},
): PromptParts {
  const variables = getPromptVariables(taskId, settings, options.data);
  return {
    prompt: interpolatePrompt(text, variables).trim(),
    rules: promptRuleTexts(taskId, settings, options)
      .map((rule) => interpolatePrompt(rule, variables).trim())
      .filter(Boolean),
  };
}

/**
 * The full system prompt a task sends: the active custom prompt from the prompt library (or the
 * built-in default), then the task's fixed rules and, for page text, the page-text rule, all
 * with the task's placeholders filled in from `settings`. Settings every task shares (the output
 * language) are read from storage unless `settings` has them, and so is the data placeholders
 * read (tags, "About me"), for the placeholders the prompt uses that `options.data` lacks.
 */
export async function buildPrompt<T extends PromptTaskId>(
  taskId: T,
  settings: PromptSettings<T> & Partial<SharedPromptSettings>,
  options: BuildPromptOptions = {},
): Promise<{ system: string }> {
  const text = (await getActivePromptText(taskId)) ?? PROMPT_TASKS[taskId].system;
  const runSettings = { ...(await getSettings()), ...settings };
  const used = [text, ...promptRuleTexts(taskId, runSettings, options)].join('\n');
  const data = await loadPromptData(taskId, used, options.data);
  const { prompt, rules } = composePrompt(taskId, text, runSettings, { ...options, data });
  return { system: [prompt, ...rules].filter(Boolean).join('\n\n') };
}
