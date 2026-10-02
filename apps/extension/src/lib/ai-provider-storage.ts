export type StoredAIProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  customModel?: string;
  extraHeaders?: string;
  /** Values of the provider's extra connection fields, keyed by field name. */
  options?: Partial<Record<AIProviderExtraField, string>>;
};

/** Credentials stay on this device: local area only, never sync. */
export const aiProviderConfigItem =
  storage.defineItem<Record<string, StoredAIProviderConfig>>('local:bookmark-scout-ai');

async function readAIProviderConfigs(): Promise<Record<string, StoredAIProviderConfig>> {
  return { ...(await aiProviderConfigItem.getValue()) };
}

export async function getStoredAIProviderConfig(
  provider: string,
): Promise<StoredAIProviderConfig> {
  const data = await readAIProviderConfigs();
  return data[provider] ?? {};
}

export async function saveStoredAIProviderConfig(
  provider: string,
  config: StoredAIProviderConfig,
): Promise<void> {
  const data = await readAIProviderConfigs();
  data[provider] = {
    ...(data[provider] ?? {}),
    ...config,
  };
  await aiProviderConfigItem.setValue(data);
}

export async function clearStoredAIProviderConfig(provider: string): Promise<void> {
  const data = await readAIProviderConfigs();
  delete data[provider];
  await aiProviderConfigItem.setValue(data);
}

/** A provider's model list as last fetched, tied to the endpoint it came from. */
export type CachedModelList = {
  endpoint: string;
  models: DetectedAIModel[];
  fetchedAt: number;
};

/** Fetched model lists, so the model picker keeps them across reloads. Local only. */
export const aiModelListItem =
  storage.defineItem<Record<string, CachedModelList>>('local:bookmark-scout-ai-models');

/** The cached list for `provider`, if it was fetched from `endpoint`. */
export async function getCachedModelList(
  provider: string,
  endpoint: string | undefined,
): Promise<CachedModelList | undefined> {
  const cached = (await aiModelListItem.getValue())?.[provider];
  return cached && cached.endpoint === endpoint ? cached : undefined;
}

export async function saveCachedModelList(provider: string, entry: CachedModelList): Promise<void> {
  const data = { ...(await aiModelListItem.getValue()) };
  data[provider] = entry;
  await aiModelListItem.setValue(data);
}
