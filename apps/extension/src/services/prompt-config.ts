/**
 * AI prompt tasks: each AI tool's built-in default prompt, the rules the app adds after it, and
 * the {{variables}} it fills in. The texts live in config/ai/prompts.toml. Users keep any number
 * of their own prompts per task in the prompt library (src/lib/prompt-library-storage.ts); the
 * active one replaces the default. To give a new AI tool editable prompts, add its texts to the
 * TOML and its variables to PROMPT_VARIABLES, then call buildPrompt with its id.
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
// Variables: one table for previews and runs
// ============================================================================

/**
 * What each task fills in, from the settings it runs with. Prompt previews pass the stored
 * settings and tools pass the values they run with, so a preview always shows what is sent.
 */
const PROMPT_VARIABLES = {
  folder_recommendation: (settings: Pick<Settings, 'aiMaxRecommendations'>) => ({
    maxRecommendations: settings.aiMaxRecommendations,
  }),
  folder_reorganization: (
    settings: Pick<Settings, 'aiMaxCategories' | 'aiMinItemsPerFolder' | 'aiMaxItemsPerFolder'>,
  ) => ({
    maxCategories: settings.aiMaxCategories,
    minItemsPerFolder: settings.aiMinItemsPerFolder,
    maxItemsPerFolder: settings.aiMaxItemsPerFolder,
  }),
  auto_tagging: (
    settings: Pick<Settings, 'autoTaggingMinTags' | 'autoTaggingMaxTags' | 'autoTaggingTagStyle'>,
  ) => ({
    minTags: settings.autoTaggingMinTags,
    maxTags: settings.autoTaggingMaxTags,
    tagStyle: settings.autoTaggingTagStyle,
  }),
  summarization: (
    settings: Pick<Settings, 'summarizerSummaryLength' | 'summarizerIncludeDomainHint'>,
  ) => ({
    summaryLength: settings.summarizerSummaryLength,
    includeDomainHint: settings.summarizerIncludeDomainHint ? 'true' : 'false',
  }),
  ask_ai: (_settings: Pick<Settings, never>) => ({ today: formatToday() }),
} satisfies Record<PromptTaskId, (settings: Settings) => PromptVariables>;

/** The settings a task's variables are made from; full Settings always fit. */
export type PromptSettings<T extends PromptTaskId> = Parameters<(typeof PROMPT_VARIABLES)[T]>[0];

/** The values a task fills into its {{variables}}. */
export function getPromptVariables<T extends PromptTaskId>(
  taskId: T,
  settings: PromptSettings<T>,
): PromptVariables {
  const variables = PROMPT_VARIABLES[taskId] as (settings: PromptSettings<T>) => PromptVariables;
  return variables(settings);
}

/**
 * The values each task's tool would fill in with the current settings, for prompt previews.
 * @deprecated Call {@link getPromptVariables}.
 */
export function getPromptPreviewVariables(taskId: PromptTaskId, settings: Settings): PromptVariables {
  return getPromptVariables(taskId, settings);
}

/** Today's date in ISO form, which every model reads the same way. */
export function formatToday(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

// ============================================================================
// Prompt Registry
// ============================================================================

type PromptTaskMeta = Pick<PromptTask, 'nameKey' | 'descriptionKey' | 'variables'>;

const PROMPT_TASK_META: Record<PromptTaskId, PromptTaskMeta> = {
  folder_recommendation: {
    nameKey: 'ai_folderRecommendation',
    descriptionKey: 'ai_promptFolderRecommendationDesc',
    variables: [{ name: 'maxRecommendations', descriptionKey: 'prompt_varMaxRecommendations' }],
  },
  folder_reorganization: {
    nameKey: 'tools_aiReorganize',
    descriptionKey: 'ai_promptFolderReorganizationDesc',
    variables: [
      { name: 'maxCategories', descriptionKey: 'prompt_varMaxCategories' },
      { name: 'minItemsPerFolder', descriptionKey: 'prompt_varMinItemsPerFolder' },
      { name: 'maxItemsPerFolder', descriptionKey: 'prompt_varMaxItemsPerFolder' },
    ],
  },
  auto_tagging: {
    nameKey: 'tools_autoTagging',
    descriptionKey: 'ai_promptAutoTaggingDesc',
    variables: [
      { name: 'minTags', descriptionKey: 'prompt_varMinTags' },
      { name: 'maxTags', descriptionKey: 'prompt_varMaxTags' },
      { name: 'tagStyle', descriptionKey: 'prompt_varTagStyle' },
    ],
  },
  summarization: {
    nameKey: 'tools_summarizer',
    descriptionKey: 'ai_promptSummarizationDesc',
    variables: [
      { name: 'summaryLength', descriptionKey: 'prompt_varSummaryLength' },
      { name: 'includeDomainHint', descriptionKey: 'prompt_varIncludeDomainHint' },
    ],
  },
  ask_ai: {
    nameKey: 'askAI_title',
    descriptionKey: 'ai_promptAskAIDesc',
    variables: [{ name: 'today', descriptionKey: 'prompt_varToday' }],
  },
};

export const PROMPT_TASKS: Record<PromptTaskId, PromptTask> = Object.fromEntries(
  PROMPT_TASK_ID_LIST.map((id) => [
    id,
    { id, ...PROMPT_TASK_META[id], system: prompts.tasks[id].system },
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
 * with the task's variables filled in from `settings`.
 */
export async function buildPrompt<T extends PromptTaskId>(
  taskId: T,
  settings: PromptSettings<T>,
  options: BuildPromptOptions = {},
): Promise<{ system: string }> {
  const prompt = (await getActivePromptText(taskId)) ?? PROMPT_TASKS[taskId].system;
  const rules = [
    ...prompts.tasks[taskId].rules,
    ...(options.hasPageText ? ['page_text'] : []),
  ].map((name) => prompts.rules[name]);
  const variables = getPromptVariables(taskId, settings);
  return {
    system: [prompt, ...rules].map((text) => interpolatePrompt(text, variables)).join('\n\n'),
  };
}
