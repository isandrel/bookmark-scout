export type StoredAIProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  customModel?: string;
  extraHeaders?: string;
  /** Values of the provider's extra connection fields, keyed by field name. */
  options?: Partial<Record<AIProviderExtraField, string>>;
};

/** A provider's model list as last fetched, tied to the endpoint it came from. */
export type CachedModelList = {
  endpoint: string;
  models: DetectedAIModel[];
  fetchedAt: number;
};

/** Entries keyed by provider or service id; only this extension writes them. */
function parseRecord<T>(raw: unknown): Record<string, T> {
  return isPlainObject(raw) ? (raw as Record<string, T>) : {};
}

/** Credentials stay on this device: local area only, never sync. Keyed by service id. */
export const aiProviderConfigValue = defineStoredValue<Record<string, StoredAIProviderConfig>>({
  key: STORAGE_KEYS.aiProviders,
  parse: parseRecord,
  empty: {},
});

/** @deprecated Watch `aiProviderConfigValue`; kept until AIServiceEditor moves. */
export const aiProviderConfigItem = storage.defineItem<Record<string, StoredAIProviderConfig>>(
  STORAGE_KEYS.aiProviders,
);

/** Fetched model lists, so the model picker keeps them across reloads. Local only. */
export const aiModelListValue = defineStoredValue<Record<string, CachedModelList>>({
  key: STORAGE_KEYS.aiModelLists,
  parse: parseRecord,
  empty: {},
});

export async function getStoredAIProviderConfig(provider: string): Promise<StoredAIProviderConfig> {
  return (await aiProviderConfigValue.get())[provider] ?? {};
}

export async function saveStoredAIProviderConfig(
  provider: string,
  config: StoredAIProviderConfig,
): Promise<void> {
  await aiProviderConfigValue.update((configs) => ({
    ...configs,
    [provider]: { ...(configs[provider] ?? {}), ...config },
  }));
}

export async function clearStoredAIProviderConfig(provider: string): Promise<void> {
  await aiProviderConfigValue.update(({ [provider]: _removed, ...rest }) => rest);
}

/** The cached list for `provider`, if it was fetched from `endpoint`. */
export async function getCachedModelList(
  provider: string,
  endpoint: string | undefined,
): Promise<CachedModelList | undefined> {
  const cached = (await aiModelListValue.get())[provider];
  return cached && cached.endpoint === endpoint ? cached : undefined;
}

export async function saveCachedModelList(provider: string, entry: CachedModelList): Promise<void> {
  await aiModelListValue.update((lists) => ({ ...lists, [provider]: entry }));
}
