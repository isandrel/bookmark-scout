/**
 * AI Prompt Configuration
 * Configurable, customizable, and extensible prompt system.
 * Prompts can be edited by users in the options page.
 */

import { defaultSettings } from '@/lib/settings-schema';

// ============================================================================
// Prompt Template Types
// ============================================================================

/**
 * A prompt template with placeholders for dynamic content.
 * Placeholders use {{variableName}} syntax.
 */
export interface PromptTemplate {
  /** Unique identifier for the prompt */
  id: string;
  /** i18n key for display name */
  nameKey: string;
  /** System prompt (instructions for AI) */
  system: string;
  /** User prompt template with {{placeholders}} */
  userTemplate?: string;
  /** Description for options page */
  descriptionKey: string;
}

/**
 * Variables that can be substituted in prompt templates.
 */
export interface PromptVariables {
  [key: string]: string | number | string[] | undefined;
}

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
3. All 3 recommendations should use type "existing" unless truly no match exists
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
1. Suggest 2-5 tags per bookmark
2. Use lowercase, single words or hyphenated-phrases
3. Tags should describe content type, topic, technology, or purpose
4. Prioritize commonly used tag conventions
5. Avoid overly generic tags like "website" or "page"`;

/**
 * Default system prompt for content summarization.
 */
export const DEFAULT_SUMMARIZATION_PROMPT = `You are a content summarizer. Given a bookmark's title and URL, provide a brief description.

RULES:
1. Keep summary under 100 characters
2. Focus on what the resource is about
3. Be specific and informative
4. Don't start with "This is..." or "A page about..."`;

// ============================================================================
// Prompt Registry
// ============================================================================

/**
 * All available prompt templates.
 */
export const PROMPT_TEMPLATES: Record<string, PromptTemplate> = {
  folder_recommendation: {
    id: 'folder_recommendation',
    nameKey: 'ai_promptFolderRecommendation',
    descriptionKey: 'ai_promptFolderRecommendationDesc',
    system: DEFAULT_FOLDER_RECOMMENDATION_PROMPT,
  },
  folder_reorganization: {
    id: 'folder_reorganization',
    nameKey: 'ai_promptFolderReorganization',
    descriptionKey: 'ai_promptFolderReorganizationDesc',
    system: DEFAULT_FOLDER_REORGANIZATION_PROMPT,
  },
  auto_tagging: {
    id: 'auto_tagging',
    nameKey: 'ai_promptAutoTagging',
    descriptionKey: 'ai_promptAutoTaggingDesc',
    system: DEFAULT_AUTO_TAGGING_PROMPT,
  },
  summarization: {
    id: 'summarization',
    nameKey: 'ai_promptSummarization',
    descriptionKey: 'ai_promptSummarizationDesc',
    system: DEFAULT_SUMMARIZATION_PROMPT,
  },
};

// ============================================================================
// Prompt Utilities
// ============================================================================

/**
 * Get a prompt by ID, with user customizations applied.
 * Falls back to default if not customized.
 */
export function getPrompt(promptId: string): PromptTemplate {
  const template = PROMPT_TEMPLATES[promptId];
  if (!template) {
    throw new Error(`Unknown prompt: ${promptId}`);
  }

  // Check for user customization in settings
  // This will be populated from settings storage
  const customPrompts = getCustomPrompts();
  const customSystem = customPrompts[promptId];

  if (customSystem) {
    return {
      ...template,
      system: customSystem,
    };
  }

  return template;
}

/**
 * Get all prompts with user customizations applied.
 */
export function getAllPrompts(): PromptTemplate[] {
  return Object.keys(PROMPT_TEMPLATES).map(getPrompt);
}

/**
 * Get custom prompts from settings.
 * Returns empty object if not configured.
 */
export function getCustomPrompts(): Record<string, string> {
  // Access settings - this will be enhanced to use settings storage
  try {
    const settings = defaultSettings as Record<string, unknown>;
    return (settings.aiCustomPrompts as Record<string, string>) || {};
  } catch {
    return {};
  }
}

/**
 * Interpolate variables into a prompt template.
 * Replaces {{variableName}} with actual values.
 */
export function interpolatePrompt(
  template: string,
  variables: PromptVariables
): string {
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

/**
 * Build a complete prompt with variables interpolated.
 */
export function buildPrompt(
  promptId: string,
  variables: PromptVariables = {}
): { system: string; user?: string } {
  const template = getPrompt(promptId);
  
  return {
    system: interpolatePrompt(template.system, variables),
    user: template.userTemplate 
      ? interpolatePrompt(template.userTemplate, variables) 
      : undefined,
  };
}

/**
 * Reset a prompt to its default value.
 * This removes custom overrides.
 */
export function getDefaultPrompt(promptId: string): string {
  const template = PROMPT_TEMPLATES[promptId];
  if (!template) {
    throw new Error(`Unknown prompt: ${promptId}`);
  }
  return template.system;
}

/**
 * Validate a custom prompt.
 * Returns error message if invalid, null if valid.
 */
export function validatePrompt(prompt: string): string | null {
  if (!prompt || prompt.trim().length === 0) {
    return 'Prompt cannot be empty';
  }
  if (prompt.length > 10000) {
    return 'Prompt is too long (max 10,000 characters)';
  }
  return null;
}
