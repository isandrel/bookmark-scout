/**
 * Settings for one AI service: its provider and model, with the credentials and connection fields
 * stored under its id (`STORAGE_ITEMS.aiCredentials`).
 */
export async function buildAISettingsFromService(
  service: AIService,
  enabled: boolean,
): Promise<AISettings> {
  const { provider } = service;
  const stored = await getStoredAIProviderConfig(service.id);
  const storedBaseUrl = stored.baseUrl?.trim();
  if (storedBaseUrl && !isValidProviderBaseUrl(storedBaseUrl)) {
    throw new Error(t('options_baseUrlInvalid'));
  }

  const settings: AISettings = {
    enabled,
    provider,
    model: service.model || getDefaultModel(provider),
    apiKey: stored.apiKey?.trim() || '',
    baseUrl: storedBaseUrl || getProviderBaseUrl(provider),
    extraHeaders: parseExtraHeaders(stored.extraHeaders),
    providerOptions: pickProviderOptions(provider, stored.options),
  };

  if (providerRequiresApiKey(provider) && !settings.apiKey) {
    throw new Error(t('error_aiKeyNotConfigured'));
  }

  return settings;
}

/** Options on its AI tab, where AI is turned on and services are set up. */
const OPTIONS_AI_PATH = '/options.html?category=ai';

/** Opens Options on the AI tab in a new tab ("Open AI settings", "Finish AI setup"). */
export async function openAISettings(): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL(OPTIONS_AI_PATH), active: true });
}

/**
 * Whether AI tools can call the default service as set up: one is chosen, and it has an API key
 * unless its provider needs none (a local server). The same conditions `getActiveAISettings`
 * checks before any call, so AI buttons are offered only when a click would not stop at setup.
 */
export function isAISetUp(
  state: AIServicesState,
  credentials: Readonly<Record<string, StoredAIProviderConfig>>,
): boolean {
  const service = state.services.find((candidate) => candidate.id === state.defaultServiceId);
  if (!service) return false;
  return (
    !providerRequiresApiKey(service.provider) || Boolean(credentials[service.id]?.apiKey?.trim())
  );
}

/** Settings of the default AI service, which every AI tool uses. */
export async function getActiveAISettings(enabled: boolean): Promise<AISettings> {
  const service = await getDefaultAIService();
  if (!service) throw new Error(t('error_aiNoService'));
  return buildAISettingsFromService(service, enabled);
}

/** Only the extra fields this provider declares, trimmed, with empty values dropped. */
function pickProviderOptions(
  provider: AIProvider,
  options: StoredAIProviderConfig['options'],
): AISettings['providerOptions'] {
  const picked: NonNullable<AISettings['providerOptions']> = {};
  for (const field of getProviderExtraFields(provider)) {
    const value = options?.[field]?.trim();
    if (value) picked[field] = value;
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
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
  const trimmed = value.trim();
  return isWebUrl(trimmed) && new URL(trimmed).hostname.length > 0;
}

/**
 * Extra headers must be a JSON object with string values.
 */
export function isValidProviderExtraHeaders(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const parsed = JSON.parse(value) as unknown;
    return (
      isPlainObject(parsed) && Object.values(parsed).every((header) => typeof header === 'string')
    );
  } catch {
    return false;
  }
}

/**
 * Ask, at click time, for access to one provider origin (so the request is not blocked by CORS)
 * and, in Firefox, for consent to send the API key (`aiProviderCheck`), in one prompt. Resolves
 * false when the browser does not allow it; the call may still succeed if the provider sends CORS
 * headers, so callers continue either way, and the provider fetch stops without the consent.
 */
export function requestProviderHostAccess(baseUrl: string | undefined): Promise<boolean> {
  const origins =
    baseUrl && isValidProviderBaseUrl(baseUrl) ? [`${new URL(baseUrl).origin}/*`] : [];
  // Called directly (no awaited contains first) so the click's user gesture is kept; the browser
  // resolves true without prompting when everything was already granted.
  return requestPermission('aiProviderCheck', origins);
}

/**
 * The endpoint a provider request will reach: the configured Base URL, else the provider's default
 * from config/ai/providers/ or the catalog. Azure builds its default from the resource name.
 */
export function getProviderEndpoint(
  provider: AIProvider,
  baseUrl: string | undefined,
  options?: AISettings['providerOptions'],
): string | undefined {
  const configured = baseUrl?.trim();
  if (configured) return configured;
  const resourceName = options?.resourceName?.trim();
  if (provider === 'azure' && resourceName) {
    return `https://${encodeURIComponent(resourceName)}.openai.azure.com/openai/v1`;
  }
  return getProviderBaseUrl(provider);
}
