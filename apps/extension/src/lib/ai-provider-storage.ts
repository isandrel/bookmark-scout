
export type StoredAIProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  customModel?: string;
  extraHeaders?: string;
};

// Provider configs, including API keys, stay in the local area and never sync.
const aiProviderStorageItem = storage.defineItem<Record<string, StoredAIProviderConfig>>(
  'local:bookmark-scout-ai',
  { fallback: {} },
);

export async function getStoredAIProviderConfig(
  provider: string,
): Promise<StoredAIProviderConfig> {
  const data = await aiProviderStorageItem.getValue();
  return data[provider] ?? {};
}

export async function saveStoredAIProviderConfig(
  provider: string,
  config: StoredAIProviderConfig,
): Promise<void> {
  const data = await aiProviderStorageItem.getValue();
  data[provider] = {
    ...(data[provider] ?? {}),
    ...config,
  };
  await aiProviderStorageItem.setValue(data);
}

export async function clearStoredAIProviderConfig(provider: string): Promise<void> {
  const data = await aiProviderStorageItem.getValue();
  delete data[provider];
  await aiProviderStorageItem.setValue(data);
}
