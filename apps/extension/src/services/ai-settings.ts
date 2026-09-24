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

  const storedBaseUrl = stored.baseUrl?.trim();
  if (storedBaseUrl && !isValidProviderBaseUrl(storedBaseUrl)) {
    throw new Error(t('options_baseUrlInvalid'));
  }

  const settings: AISettings = {
    enabled,
    provider,
    model: finalModel,
    customModel,
    apiKey: stored.apiKey?.trim() || '',
    baseUrl: storedBaseUrl || getProviderBaseUrl(provider),
    extraHeaders: parseExtraHeaders(stored.extraHeaders),
  };

  if (providerRequiresApiKey(provider) && !settings.apiKey) {
    throw new Error(t('error_aiKeyNotConfigured'));
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

/**
 * Provider endpoints must be absolute http(s) URLs; anything else (javascript:, file:, relative
 * paths) is rejected before it is stored or used.
 */
export function isValidProviderBaseUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Extra headers must be a JSON object with string values.
 */
export function isValidProviderExtraHeaders(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const parsed = JSON.parse(value) as unknown;
    return (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Object.values(parsed).every((header) => typeof header === 'string')
    );
  } catch {
    return false;
  }
}

/**
 * Ask for access to one provider origin at click time so the request is not blocked by CORS.
 * Resolves false when the browser does not allow the request; the call may still succeed if the
 * provider sends CORS headers, so callers continue either way.
 */
export async function requestProviderHostAccess(baseUrl: string | undefined): Promise<boolean> {
  if (!baseUrl || !isValidProviderBaseUrl(baseUrl)) return false;
  const origins = [`${new URL(baseUrl).origin}/*`];
  try {
    // Call request directly (no awaited contains first) so the click's user gesture is kept;
    // Chrome resolves true without prompting when access was already granted.
    return await browser.permissions.request({ origins });
  } catch {
    return false;
  }
}

/** Default endpoints of native SDK providers, which have no base_url in the TOML config. */
const nativeProviderEndpoints: Partial<Record<AIProvider, string>> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
};

/** The endpoint a provider request will reach: the configured Base URL, else the default. */
export function getProviderEndpoint(
  provider: AIProvider,
  baseUrl: string | undefined,
): string | undefined {
  return baseUrl?.trim() || getProviderBaseUrl(provider) || nativeProviderEndpoints[provider];
}
