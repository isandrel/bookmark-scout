import { parse } from 'smol-toml';
import type { AIProvider } from './ai-client';
import settingsToml from '../../config/settings.default.toml?raw';

export type AIModel = {
  id: string;
  name: string;
  description?: string;
};

export type AIProviderKind = 'native' | 'openai_compatible' | 'ollama';

export type AIProviderConfig = {
  name: string;
  default_model: string;
  models: AIModel[];
  api_key_pattern?: string;
  api_key_placeholder?: string;
  provider_kind?: AIProviderKind;
  requires_api_key?: boolean;
  base_url?: string;
  supports_custom_model?: boolean;
};

type TomlConfig = {
  ai: {
    providers: Record<string, AIProviderConfig>;
  };
};

const config = parse(settingsToml) as unknown as TomlConfig;

function getProviders() {
  return config.ai?.providers ?? {};
}

export function getAvailableProviders(): { id: AIProvider; name: string }[] {
  return Object.entries(getProviders()).map(([id, provider]) => ({
    id: id as AIProvider,
    name: provider.name,
  }));
}

export function getProviderConfig(provider: AIProvider): AIProviderConfig | undefined {
  return getProviders()[provider];
}

export function getProviderName(provider: AIProvider): string {
  return getProviderConfig(provider)?.name ?? provider;
}

export function getModelsForProvider(provider: AIProvider): AIModel[] {
  return getProviderConfig(provider)?.models ?? [];
}

export function getDefaultModel(provider: AIProvider): string {
  const providerConfig = getProviderConfig(provider);
  if (providerConfig?.default_model) {
    return providerConfig.default_model;
  }

  return getModelsForProvider(provider)[0]?.id ?? '';
}

export function getProviderKind(provider: AIProvider): AIProviderKind {
  return getProviderConfig(provider)?.provider_kind ?? 'native';
}

export function getProviderBaseUrl(provider: AIProvider): string | undefined {
  return getProviderConfig(provider)?.base_url;
}

export function providerRequiresApiKey(provider: AIProvider): boolean {
  return getProviderConfig(provider)?.requires_api_key ?? true;
}

export function providerSupportsCustomModel(provider: AIProvider): boolean {
  return getProviderConfig(provider)?.supports_custom_model ?? false;
}
