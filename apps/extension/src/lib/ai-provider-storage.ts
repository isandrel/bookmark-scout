import { browser } from './extension-browser';

const AI_STORAGE_KEY = 'bookmark-scout-ai';

export type StoredAIProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  customModel?: string;
  extraHeaders?: string;
};

export async function getStoredAIProviderConfig(
  provider: string,
): Promise<StoredAIProviderConfig> {
  const result = await browser.storage.local.get(AI_STORAGE_KEY);
  const data = (result?.[AI_STORAGE_KEY] ?? {}) as Record<string, StoredAIProviderConfig>;
  return data[provider] ?? {};
}

export async function saveStoredAIProviderConfig(
  provider: string,
  config: StoredAIProviderConfig,
): Promise<void> {
  const result = await browser.storage.local.get(AI_STORAGE_KEY);
  const data = (result?.[AI_STORAGE_KEY] ?? {}) as Record<string, StoredAIProviderConfig>;
  data[provider] = {
    ...(data[provider] ?? {}),
    ...config,
  };
  await browser.storage.local.set({ [AI_STORAGE_KEY]: data });
}

export async function clearStoredAIProviderConfig(provider: string): Promise<void> {
  const result = await browser.storage.local.get(AI_STORAGE_KEY);
  const data = (result?.[AI_STORAGE_KEY] ?? {}) as Record<string, StoredAIProviderConfig>;
  delete data[provider];
  await browser.storage.local.set({ [AI_STORAGE_KEY]: data });
}
