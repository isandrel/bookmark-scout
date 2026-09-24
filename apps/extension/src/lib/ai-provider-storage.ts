export type StoredAIProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  customModel?: string;
  extraHeaders?: string;
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
