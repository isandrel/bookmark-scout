/**
 * Shared AI client for multi-provider support.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createXai } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { createOllama } from 'ollama-ai-provider-v2';

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
  customModel?: string;
  extraHeaders?: Record<string, string>;
  /** Provider-specific connection fields such as OpenAI's organization or Azure's resource. */
  providerOptions?: Partial<Record<AIProviderExtraField, string>>;
};

export type DetectedAIModel = {
  id: string;
  name: string;
};

export const defaultAISettings: AISettings = {
  enabled: false,
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: '',
};

type AnyLanguageModel = ReturnType<ReturnType<typeof createOpenAI>>;

export function createAIModel(settings: AISettings): AnyLanguageModel {
  validateAISettings(settings);

  const modelId = settings.customModel?.trim() || settings.model || getDefaultModel(settings.provider);
  const kind = getProviderKind(settings.provider);

  switch (kind) {
    case 'native':
      return createNativeModel(settings, modelId);
    case 'ollama': {
      const ollama = createOllama({
        baseURL: settings.baseUrl || getProviderBaseUrl(settings.provider),
        headers: settings.extraHeaders,
      });
      return ollama(modelId) as unknown as AnyLanguageModel;
    }
    case 'anthropic_compatible': {
      const compatible = createAnthropic({
        apiKey: settings.apiKey,
        baseURL: settings.baseUrl || getProviderBaseUrl(settings.provider),
        headers: { ...ANTHROPIC_BROWSER_ACCESS_HEADER, ...settings.extraHeaders },
      });
      return compatible(modelId) as unknown as AnyLanguageModel;
    }
    case 'openai_compatible': {
      // Chat Completions is the API that OpenAI-compatible servers share; the OpenAI package
      // would call OpenAI's own Responses API, which most of them do not implement.
      const compatible = createOpenAICompatible({
        name: settings.provider,
        apiKey: settings.apiKey || undefined,
        baseURL: settings.baseUrl || getProviderBaseUrl(settings.provider) || '',
        headers: settings.extraHeaders,
      });
      return compatible.chatModel(modelId) as unknown as AnyLanguageModel;
    }
    default:
      throw new Error(`Unsupported provider kind: ${kind satisfies never}`);
  }
}

export function validateAISettings(settings: AISettings): void {
  if (!settings.enabled) {
    throw new Error(t('ai_featuresDisabled'));
  }

  if (providerRequiresApiKey(settings.provider) && !settings.apiKey) {
    throw new Error('API key is required');
  }

  if (!settings.model && !settings.customModel) {
    throw new Error('Model is required');
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
    const model = createAIModel(settings);
    await generateText({ model, maxOutputTokens: 8, prompt: 'Reply with exactly: ok' });
    return { models: [] };
  }
  try {
    const models = await listProviderModels(settings);
    const modelId = settings.customModel?.trim() || settings.model;
    return { models, modelListed: models.some((model) => model.id === modelId) };
  } catch (error) {
    if (error instanceof AIConnectionError && error.code === 'rate_limited') {
      return { models: [], rateLimited: true };
    }
    throw error;
  }
}

/**
 * Native SDKs use their own endpoint unless the user configured a Base URL; extra headers always
 * apply so Verify Service and real calls hit the same configured endpoint.
 */
function nativeProviderOptions(settings: AISettings) {
  return {
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl || undefined,
    headers: settings.extraHeaders,
  };
}

const optionValue = (settings: AISettings, field: AIProviderExtraField) =>
  settings.providerOptions?.[field]?.trim() || undefined;

function createNativeModel(settings: AISettings, modelId: string) {
  switch (settings.provider) {
    case 'openai': {
      const openai = createOpenAI({
        ...nativeProviderOptions(settings),
        organization: optionValue(settings, 'organization'),
        project: optionValue(settings, 'project'),
      });
      return openai(modelId);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({
        ...nativeProviderOptions(settings),
        // Without it, Anthropic rejects requests that come from a browser origin.
        headers: { ...ANTHROPIC_BROWSER_ACCESS_HEADER, ...settings.extraHeaders },
      });
      return anthropic(modelId) as unknown as AnyLanguageModel;
    }
    case 'xai': {
      const xai = createXai(nativeProviderOptions(settings));
      return xai(modelId) as unknown as AnyLanguageModel;
    }
    case 'azure': {
      // The model id is the deployment name; a Base URL, when set, replaces the resource name.
      const azure = createAzure({
        ...nativeProviderOptions(settings),
        resourceName: settings.baseUrl ? undefined : optionValue(settings, 'resourceName'),
        apiVersion: optionValue(settings, 'apiVersion'),
      });
      return azure(modelId) as unknown as AnyLanguageModel;
    }
    case 'google': {
      const google = createGoogleGenerativeAI(nativeProviderOptions(settings));
      return google(modelId) as unknown as AnyLanguageModel;
    }
    case 'groq': {
      const groq = createGroq(nativeProviderOptions(settings));
      return groq(modelId) as unknown as AnyLanguageModel;
    }
    case 'mistral': {
      const mistral = createMistral(nativeProviderOptions(settings));
      return mistral(modelId) as unknown as AnyLanguageModel;
    }
    case 'deepseek': {
      const deepseek = createDeepSeek(nativeProviderOptions(settings));
      return deepseek(modelId) as unknown as AnyLanguageModel;
    }
    default:
      return createCompatibleFallback(settings, modelId, 'native');
  }
}

function createCompatibleFallback(
  settings: AISettings,
  modelId: string,
  _kind: AIProviderKind,
) {
  const compatible = createOpenAI({
    apiKey: settings.apiKey || 'not-required',
    baseURL: settings.baseUrl || getProviderBaseUrl(settings.provider),
    headers: settings.extraHeaders,
  });
  return compatible(modelId) as unknown as AnyLanguageModel;
}
