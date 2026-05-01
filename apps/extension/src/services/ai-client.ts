/**
 * Shared AI client for multi-provider support.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import {
  getDefaultModel,
  getProviderBaseUrl,
  getProviderKind,
  providerRequiresApiKey,
  type AIProviderKind,
} from './ai-models';

export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'groq'
  | 'mistral'
  | 'deepseek'
  | 'openrouter'
  | 'ollama'
  | 'cliproxyapi'
  | 'custom';

export type AISettings = {
  enabled: boolean;
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  customModel?: string;
  extraHeaders?: Record<string, string>;
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
      const ollama = createOllama({ baseURL: settings.baseUrl || getProviderBaseUrl(settings.provider) });
      return ollama(modelId) as unknown as AnyLanguageModel;
    }
    case 'openai_compatible': {
      const compatible = createOpenAI({
        apiKey: settings.apiKey || 'not-required',
        baseURL: settings.baseUrl || getProviderBaseUrl(settings.provider),
        headers: settings.extraHeaders,
      });
      return compatible(modelId) as unknown as AnyLanguageModel;
    }
    default:
      throw new Error(`Unsupported provider kind: ${kind satisfies never}`);
  }
}

export function validateAISettings(settings: AISettings): void {
  if (!settings.enabled) {
    throw new Error('AI features are disabled');
  }

  if (providerRequiresApiKey(settings.provider) && !settings.apiKey) {
    throw new Error('API key is required');
  }

  if (!settings.model && !settings.customModel) {
    throw new Error('Model is required');
  }
}

export async function verifyAIService(settings: AISettings): Promise<void> {
  const model = createAIModel(settings);
  await generateText({
    model,
    maxOutputTokens: 8,
    prompt: 'Reply with exactly: ok',
  });
}

export async function detectAIModels(settings: AISettings): Promise<DetectedAIModel[]> {
  const baseUrl = getModelListBaseUrl(settings);
  if (!baseUrl) {
    throw new Error('Model detection is not available for this provider. Use a custom model instead.');
  }

  const url = new URL('models', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...settings.extraHeaders,
  };

  if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }

  if (settings.provider === 'anthropic') {
    headers['x-api-key'] = settings.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    delete headers.Authorization;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Model detection failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json() as { data?: unknown };
  const data = Array.isArray(payload.data) ? payload.data : [];

  return data
    .map((item) => {
      if (!item || typeof item !== 'object' || !('id' in item)) {
        return null;
      }

      const id = String(item.id);
      return { id, name: id };
    })
    .filter((model): model is DetectedAIModel => model !== null);
}

function getModelListBaseUrl(settings: AISettings): string | undefined {
  if (settings.provider === 'openai') {
    return settings.baseUrl || 'https://api.openai.com/v1';
  }

  if (settings.provider === 'anthropic') {
    return settings.baseUrl || 'https://api.anthropic.com/v1';
  }

  return settings.baseUrl || getProviderBaseUrl(settings.provider);
}

function createNativeModel(settings: AISettings, modelId: string) {
  switch (settings.provider) {
    case 'openai': {
      const openai = createOpenAI({ apiKey: settings.apiKey });
      return openai(modelId);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey: settings.apiKey });
      return anthropic(modelId) as unknown as AnyLanguageModel;
    }
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey: settings.apiKey });
      return google(modelId) as unknown as AnyLanguageModel;
    }
    case 'groq': {
      const groq = createGroq({ apiKey: settings.apiKey });
      return groq(modelId) as unknown as AnyLanguageModel;
    }
    case 'mistral': {
      const mistral = createMistral({ apiKey: settings.apiKey });
      return mistral(modelId) as unknown as AnyLanguageModel;
    }
    case 'deepseek': {
      const deepseek = createDeepSeek({ apiKey: settings.apiKey });
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
