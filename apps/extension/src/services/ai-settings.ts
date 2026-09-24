export async function buildAISettingsFromProvider(
  provider: AIProvider,
  model: string,
  enabled: boolean,
): Promise<AISettings> {
  const stored = await getStoredAIProviderConfig(provider);
  const customModel = providerSupportsCustomModel(provider)
    ? stored.customModel?.trim() || undefined
    : undefined;
  const finalModel = customModel || model || getDefaultModel(provider);

  const settings: AISettings = {
    enabled,
    provider,
    model: finalModel,
    customModel,
    apiKey: stored.apiKey?.trim() || '',
    baseUrl: stored.baseUrl?.trim() || getProviderBaseUrl(provider),
    extraHeaders: parseExtraHeaders(stored.extraHeaders),
  };

  if (providerRequiresApiKey(provider) && !settings.apiKey) {
    throw new Error(t('ai_apiKeyNotConfigured'));
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
