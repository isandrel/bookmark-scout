/**
 * Shared AI client for multi-provider support.
 * This module provides a reusable AI client that can be used by different AI features.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOllama } from 'ollama-ai-provider';

/**
 * Supported AI providers.
 */
export type AIProvider = 'openai' | 'anthropic' | 'google' | 'groq' | 'mistral' | 'deepseek' | 'ollama';

/**
 * Base AI settings shared across all AI features.
 */
export interface AISettings {
  enabled: boolean;
  provider: AIProvider;
  model: string;
  apiKey: string;
}

/**
 * Default AI settings.
 */
export const defaultAISettings: AISettings = {
  enabled: false,
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: '',
};

/**
 * Creates an AI model instance based on provider settings.
 * This is the shared client used by all AI features.
 */
export function createAIModel(settings: AISettings) {
  // API key check is relaxed for Ollama as it is local
  if (settings.provider !== 'ollama' && !settings.apiKey) {
    throw new Error('API key is required');
  }

  switch (settings.provider) {
    case 'openai': {
      const openai = createOpenAI({ apiKey: settings.apiKey });
      return openai(settings.model);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey: settings.apiKey });
      return anthropic(settings.model);
    }
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey: settings.apiKey });
      return google(settings.model);
    }
    case 'groq': {
      const groq = createGroq({ apiKey: settings.apiKey });
      return groq(settings.model);
    }
    case 'mistral': {
      const mistral = createMistral({ apiKey: settings.apiKey });
      return mistral(settings.model);
    }
    case 'deepseek': {
      const deepseek = createDeepSeek({ apiKey: settings.apiKey });
      return deepseek(settings.model);
    }
    case 'ollama': {
      const ollama = createOllama();
      return ollama(settings.model);
    }
    default:
      throw new Error(`Unsupported provider: ${settings.provider}`);
  }
}

/**
 * Validates AI settings before use.
 */
export function validateAISettings(settings: AISettings): void {
  if (!settings.enabled) {
    throw new Error('AI features are disabled');
  }
  // API key check is relaxed for Ollama as it is local
  if (settings.provider !== 'ollama' && !settings.apiKey) {
    throw new Error('API key is required');
  }
  if (!settings.model) {
    throw new Error('Model is required');
  }
}