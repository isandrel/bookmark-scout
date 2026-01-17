/**
 * AI Model Configuration.
 * Provider-specific model lists for dynamic dropdown.
 */

import type { AIProvider } from './ai-client';

export interface AIModel {
  id: string;
  name: string;
  description?: string;
}

/**
 * Models available for each provider (December 2025).
 */
export const AI_MODELS: Record<AIProvider, AIModel[]> = {
  openai: [
    { id: 'gpt-5', name: 'GPT-5', description: 'Most capable model' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: 'Fast & efficient' },
    { id: 'gpt-4o', name: 'GPT-4o', description: 'Multimodal flagship' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Cost-effective' },
    { id: 'o1', name: 'o1', description: 'Reasoning model' },
  ],
  anthropic: [
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Most intelligent' },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Best balance' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fast & cheap' },
  ],
  google: [
    { id: 'gemini-3-pro', name: 'Gemini 3 Pro', description: 'Best reasoning' },
    { id: 'gemini-3-flash', name: 'Gemini 3 Flash', description: 'Fast frontier' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Cost-effective' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: '2M context' },
  ],
};

/**
 * Get default model for a provider.
 */
export function getDefaultModel(provider: AIProvider): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-sonnet-4-20250514';
    case 'google':
      return 'gemini-2.5-flash';
  }
}

/**
 * Get models for a specific provider.
 */
export function getModelsForProvider(provider: AIProvider): AIModel[] {
  return AI_MODELS[provider] || [];
}
