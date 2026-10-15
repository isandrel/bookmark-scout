/**
 * Shared AI client for multi-provider support: settings, checks, and the calls every AI feature
 * makes. The AI SDK itself (provider factories and model wiring) lives in ai-client.lazy.ts and
 * loads on the first AI call, so pages and users that never use AI do not download or parse it.
 */

import { z } from 'zod';

const verifyConfig = readConfig(
  'ai/verify',
  z.strictObject({
    fallback_prompt: z.string().min(1),
    fallback_max_output_tokens: z.number().int().positive(),
  }),
);

export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'groq'
  | 'mistral'
  | 'deepseek'
  | 'xai'
  | 'azure'
  | 'openrouter'
  | 'ollama'
  | 'cliproxyapi'
  | 'custom'
  // Any other id from the bundled models.dev provider catalog.
  | (string & {});

export type AISettings = {
  enabled: boolean;
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  extraHeaders?: Record<string, string>;
  /** Provider-specific connection fields such as OpenAI's organization or Azure's resource. */
  providerOptions?: Partial<Record<AIProviderExtraField, string>>;
};

export type DetectedAIModel = {
  id: string;
  name: string;
};

/** One model call: the service to use and what makes the call, named in the AI activity log. */
type AIModelRequest = {
  settings: AISettings;
  source: AIActivitySource;
  /**
   * Sends the provider requests instead of the logging fetch, for a context without the storage
   * and permissions APIs (Chrome's offscreen document). It must hand them to code that does use
   * the logging fetch, as quick save's AI host page does through the background.
   */
  transport?: typeof fetch;
};

export type AIObjectRequest<T> = AIModelRequest & {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  /** Stops the call, such as after a time limit. */
  abortSignal?: AbortSignal;
};

export type AITextRequest = AIModelRequest & {
  prompt: string;
  maxOutputTokens?: number;
};

/**
 * The AI SDK and provider factories, loaded on first use. Import the lazy module only through
 * here or another lazy module, never statically from code every page loads.
 */
function loadAIRuntime() {
  return import('./ai-client.lazy');
}

/** A structured answer from the service in `request.settings`, checked against `schema`. */
export async function generateAIObject<T>(request: AIObjectRequest<T>): Promise<{ object: T }> {
  const runtime = await loadAIRuntime();
  return runtime.requestAIObject(request);
}

export function validateAISettings(settings: AISettings): void {
  if (!settings.enabled) {
    throw new Error(t('ai_featuresDisabled'));
  }

  if (providerRequiresApiKey(settings.provider) && !settings.apiKey) {
    throw new Error(t('error_aiApiKeyRequired'));
  }

  if (!settings.model) {
    throw new Error(t('error_aiModelRequired'));
  }
}

export type AIServiceCheck = {
  /** Models the provider listed; empty when it has no model list and a test prompt was used. */
  models: DetectedAIModel[];
  /** Whether the selected model is in the list; undefined when there was no list to check. */
  modelListed?: boolean;
  /** The provider rate-limited the check: it is reachable and the key is accepted. */
  rateLimited?: boolean;
};

/**
 * Checks that the provider is reachable and accepts the key by listing its models, which costs
 * nothing, then whether the selected model is offered. Providers without a model list fall back
 * to a one-word prompt.
 */
export async function verifyAIService(settings: AISettings): Promise<AIServiceCheck> {
  if (getProviderModelListStyle(settings.provider) === 'none') {
    const runtime = await loadAIRuntime();
    await runtime.requestAIText({
      settings,
      source: 'verifyService',
      maxOutputTokens: verifyConfig.fallback_max_output_tokens,
      prompt: verifyConfig.fallback_prompt,
    });
    return { models: [] };
  }
  try {
    const models = await listProviderModels(settings, { source: 'verifyService' });
    return { models, modelListed: models.some((model) => model.id === settings.model) };
  } catch (error) {
    if (error instanceof AIConnectionError && error.code === 'rate_limited') {
      return { models: [], rateLimited: true };
    }
    throw error;
  }
}
