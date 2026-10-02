/**
 * AI prompt tasks: each AI tool's built-in default prompt and the {{variables}} it fills in.
 * Users keep any number of their own prompts per task in the prompt library
 * (src/lib/prompt-library-storage.ts); the active one replaces the default. To give a new AI
 * tool editable prompts, add its task here and call buildPrompt with its id.
 */

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
  descriptionKey: string;
};

export type PromptTask = {
  id: PromptTaskId;
  /** i18n key for the task name; the tool's own title, so users recognize it */
  nameKey: string;
  /** i18n key for the task description */
  descriptionKey: string;
  /** Built-in system prompt, used when no custom prompt is active */
  system: string;
  /** Variables the tool fills in; anything else stays as written. */
  variables: PromptVariable[];
};

/**
 * Variables that can be substituted in prompt templates.
 */
export type PromptVariables = Record<string, string | number | string[] | undefined>;

export type PromptTaskId =
  | 'folder_recommendation'
  | 'folder_reorganization'
  | 'auto_tagging'
  | 'summarization';

// ============================================================================
// Default Prompts
// ============================================================================

/**
 * Default system prompt for folder recommendation.
 */
export const DEFAULT_FOLDER_RECOMMENDATION_PROMPT = `You are a bookmark organization assistant. Analyze the page title AND URL carefully to understand the content type, topic, and purpose.

Consider:
- Page title: What is the content about?
- URL domain: What website/service is this?
- URL path: Any category hints in the path?

IMPORTANT RULES:
1. STRONGLY PREFER existing folders - only suggest "new" if no folder matches at all
2. Use the EXACT folder path from the provided list (don't modify paths)
3. All {{maxRecommendations}} recommendations should use type "existing" unless truly no match exists
4. For "existing" type, parentPath must be empty string
5. Match partial folder names if relevant (e.g., "AI" folder for AI tools)

Return folders as exact paths from the provided list.`;

/**
 * Default system prompt for folder reorganization.
 */
export const DEFAULT_FOLDER_REORGANIZATION_PROMPT = `You are a bookmark organization expert. Analyze all bookmarks in the provided list and suggest an optimal folder structure.

RULES:
1. Group bookmarks by topic, domain, or purpose
2. Create clear, concise folder names (max 3 words)
3. Aim for {{minItemsPerFolder}}-{{maxItemsPerFolder}} bookmarks per folder
4. Create at most {{maxCategories}} top-level categories
5. Preserve existing good structure where possible
6. Use nested folders for subcategories if needed

For each bookmark, suggest which folder it should move to.
Provide a confidence score (0-1) for each move.`;

/**
 * Default system prompt for auto-tagging.
 */
export const DEFAULT_AUTO_TAGGING_PROMPT = `You are a bookmark tagging assistant. Analyze the bookmark's title and URL to suggest relevant tags.

RULES:
1. Suggest {{minTags}}-{{maxTags}} tags per bookmark
2. Write every tag in {{tagStyle}} style
3. Tags should describe content type, topic, technology, or purpose
4. Prioritize commonly used tag conventions
5. Avoid overly generic tags like "website" or "page"`;

/**
 * Default system prompt for content summarization.
 */
export const DEFAULT_SUMMARIZATION_PROMPT = `You are a content summarizer. Given a bookmark's title and URL, provide a brief description.

RULES:
1. Keep summary under {{summaryLength}} characters
2. Focus on what the resource is about
3. Be specific and informative
4. Don't start with "This is..." or "A page about..."`;

// ============================================================================
// Prompt Registry
// ============================================================================

export const PROMPT_TASKS: Record<PromptTaskId, PromptTask> = {
  folder_recommendation: {
    id: 'folder_recommendation',
    nameKey: 'ai_folderRecommendation',
    descriptionKey: 'ai_promptFolderRecommendationDesc',
    system: DEFAULT_FOLDER_RECOMMENDATION_PROMPT,
    variables: [{ name: 'maxRecommendations', descriptionKey: 'prompt_varMaxRecommendations' }],
  },
  folder_reorganization: {
    id: 'folder_reorganization',
    nameKey: 'tools_aiReorganize',
    descriptionKey: 'ai_promptFolderReorganizationDesc',
    system: DEFAULT_FOLDER_REORGANIZATION_PROMPT,
    variables: [
      { name: 'maxCategories', descriptionKey: 'prompt_varMaxCategories' },
      { name: 'minItemsPerFolder', descriptionKey: 'prompt_varMinItemsPerFolder' },
      { name: 'maxItemsPerFolder', descriptionKey: 'prompt_varMaxItemsPerFolder' },
    ],
  },
  auto_tagging: {
    id: 'auto_tagging',
    nameKey: 'tools_autoTagging',
    descriptionKey: 'ai_promptAutoTaggingDesc',
    system: DEFAULT_AUTO_TAGGING_PROMPT,
    variables: [
      { name: 'minTags', descriptionKey: 'prompt_varMinTags' },
      { name: 'maxTags', descriptionKey: 'prompt_varMaxTags' },
      { name: 'tagStyle', descriptionKey: 'prompt_varTagStyle' },
    ],
  },
  summarization: {
    id: 'summarization',
    nameKey: 'tools_summarizer',
    descriptionKey: 'ai_promptSummarizationDesc',
    system: DEFAULT_SUMMARIZATION_PROMPT,
    variables: [
      { name: 'summaryLength', descriptionKey: 'prompt_varSummaryLength' },
      { name: 'includeDomainHint', descriptionKey: 'prompt_varIncludeDomainHint' },
    ],
  },
};

export const PROMPT_TASK_IDS = Object.keys(PROMPT_TASKS) as PromptTaskId[];

// ============================================================================
// Prompt Utilities
// ============================================================================

/**
 * Interpolate variables into a prompt template.
 * Replaces {{variableName}} with actual values.
 */
export function interpolatePrompt(template: string, variables: PromptVariables): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
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
  const used = [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]);
  return [...new Set(used.filter((name) => !known.has(name)))];
}

/**
 * The task's system prompt with variables filled in: the active custom prompt from the prompt
 * library, or the built-in default.
 */
export async function buildPrompt(
  taskId: PromptTaskId,
  variables: PromptVariables = {},
): Promise<{ system: string }> {
  const system = (await getActivePromptText(taskId)) ?? PROMPT_TASKS[taskId].system;
  return { system: interpolatePrompt(system, variables) };
}

/** The values each task's tool would fill in with the current settings, for prompt previews. */
export function getPromptPreviewVariables(taskId: PromptTaskId, settings: Settings): PromptVariables {
  switch (taskId) {
    case 'folder_recommendation':
      return { maxRecommendations: settings.aiMaxRecommendations };
    case 'folder_reorganization':
      return {
        maxCategories: settings.aiMaxCategories,
        minItemsPerFolder: settings.aiMinItemsPerFolder,
        maxItemsPerFolder: settings.aiMaxItemsPerFolder,
      };
    case 'auto_tagging':
      return {
        minTags: settings.autoTaggingMinTags,
        maxTags: settings.autoTaggingMaxTags,
        tagStyle: settings.autoTaggingTagStyle,
      };
    case 'summarization':
      return {
        summaryLength: settings.summarizerSummaryLength,
        includeDomainHint: settings.summarizerIncludeDomainHint ? 'true' : 'false',
      };
  }
}
