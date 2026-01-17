/**
 * AI Model Configuration.
 * Provider-specific model lists loaded from TOML config for extensibility.
 */

import { parse } from 'smol-toml';
import type { AIProvider } from './ai-client';
import settingsToml from '../../config/settings.default.toml?raw';

export interface AIModel {
  id: string;
  name: string;
  description?: string;
}

interface ProviderConfig {
  name: string;
  default_model: string;
  models: AIModel[];
}

interface AIConfig {
  providers: Record<string, ProviderConfig>;
}

interface TomlConfig {
  ai: AIConfig;
}

// Parse config at module load time
const config = parse(settingsToml) as unknown as TomlConfig;

/**
 * Get all available provider IDs from config.
 */
export function getAvailableProviders(): { id: AIProvider; name: string }[] {
  const providers = config.ai?.providers || {};
  return Object.entries(providers).map(([id, provider]) => ({
    id: id as AIProvider,
    name: provider.name,
  }));
}

/**
 * Models available for each provider (loaded from TOML config).
 */
export const AI_MODELS: Record<AIProvider, AIModel[]> = (() => {
  const providers = config.ai?.providers || {};
  const result: Record<string, AIModel[]> = {};

  for (const [providerId, provider] of Object.entries(providers)) {
    result[providerId] = provider.models || [];
  }

  // Ensure all expected providers exist (fallback to empty arrays)
  return {
    openai: result.openai || [],
    anthropic: result.anthropic || [],
    google: result.google || [],
  };
})();

/**
 * Get default model for a provider (from TOML config).
 */
export function getDefaultModel(provider: AIProvider): string {
  const providerConfig = config.ai?.providers?.[provider];
  if (providerConfig?.default_model) {
    return providerConfig.default_model;
  }
  // Fallback defaults if config is missing
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

/**
 * Get provider display name.
 */
export function getProviderName(provider: AIProvider): string {
  return config.ai?.providers?.[provider]?.name || provider;
}
