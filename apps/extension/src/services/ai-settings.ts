import type { AIProvider, AISettings } from './ai-client';
import {
  getDefaultModel,
  getProviderBaseUrl,
  providerRequiresApiKey,
  providerSupportsCustomModel,
} from './ai-models';
import { getStoredAIProviderConfig } from '@/lib';

export async function buildAISettingsFromProvider(
  provider: AIProvider,
  model: string,
  enabled: boolean,
): Promise<AISettings> {
  const stored = await getStoredAIProviderConfig(provider);
  const finalModel = providerSupportsCustomModel(provider)
    ? stored.customModel?.trim() || model || getDefaultModel(provider)
    : model || getDefaultModel(provider);

  const settings: AISettings = {
    enabled,
    provider,
    model: finalModel,
    customModel: stored.customModel?.trim() || undefined,
    apiKey: stored.apiKey?.trim() || '',
    baseUrl: stored.baseUrl?.trim() || getProviderBaseUrl(provider),
    extraHeaders: parseExtraHeaders(stored.extraHeaders),
  };

  if (providerRequiresApiKey(provider) && !settings.apiKey) {
    throw new Error('API key not configured. Please set it in Options -> AI.');
  }

  return settings;
}

function parseExtraHeaders(rawHeaders?: string) {
  if (!rawHeaders?.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawHeaders) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === 'string' && value.length > 0),
    );
  } catch {
    return undefined;
  }
}
