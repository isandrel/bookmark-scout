/**
 * Each AI service's credentials and connection fields, and the model lists fetched for it, keyed
 * by service id. Both stay on this device; credentials are never synced or backed up.
 */
import { z } from 'zod';

const credentialsSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  extraHeaders: z.string().optional(),
  /** Values of the provider's extra connection fields, keyed by field name. */
  options: z.record(z.string(), z.string()).optional(),
});

/** What is stored for one service. The model is the service's own (`AIService.model`). */
export type StoredAIProviderConfig = Omit<z.infer<typeof credentialsSchema>, 'options'> & {
  options?: Partial<Record<AIProviderExtraField, string>>;
};

const cachedModelListSchema = z.object({
  /** The endpoint the list came from; a list from another endpoint is not offered. */
  endpoint: z.string(),
  models: z.array(z.object({ id: z.string(), name: z.string() })),
  fetchedAt: z.number().finite(),
});

/** A service's model list as last fetched, tied to the endpoint it came from. */
export type CachedModelList = z.infer<typeof cachedModelListSchema>;

/** How long a fetched model list is offered before it must be fetched again. */
const MODEL_CACHE_MAX_AGE_MS =
  readConfig('ai/model-cache', z.strictObject({ max_age_days: z.number().positive() }))
    .max_age_days *
  24 *
  60 *
  60 *
  1000;

/** Credentials stay on this device: local area only, never sync. Keyed by service id. */
export const aiProviderConfigValue = defineStoredValue<Record<string, StoredAIProviderConfig>>(
  STORAGE_ITEMS.aiCredentials,
  {
    parse: (raw) => parseValidRecord(raw, credentialsSchema),
    empty: {},
    isEmpty: (configs) => Object.keys(configs).length === 0,
  },
);

/** Fetched model lists by service id, so the model picker keeps them across reloads. */
export const aiModelListValue = defineStoredValue<Record<string, CachedModelList>>(
  STORAGE_ITEMS.aiModelCache,
  {
    parse: (raw) => parseValidRecord(raw, cachedModelListSchema),
    empty: {},
    isEmpty: (lists) => Object.keys(lists).length === 0,
  },
);

export async function getStoredAIProviderConfig(serviceId: string): Promise<StoredAIProviderConfig> {
  return (await aiProviderConfigValue.get())[serviceId] ?? {};
}

export async function saveStoredAIProviderConfig(
  serviceId: string,
  config: StoredAIProviderConfig,
): Promise<void> {
  await aiProviderConfigValue.update((configs) => ({
    ...configs,
    [serviceId]: { ...(configs[serviceId] ?? {}), ...config },
  }));
}

/** Removes a service's credentials and its fetched model list. */
export async function clearStoredAIProviderConfig(serviceId: string): Promise<void> {
  await aiProviderConfigValue.update(({ [serviceId]: _removed, ...rest }) => rest);
  await aiModelListValue.update(({ [serviceId]: _removed, ...rest }) => rest);
}

const isFresh = (list: CachedModelList, now: number) =>
  now - list.fetchedAt < MODEL_CACHE_MAX_AGE_MS && list.fetchedAt <= now;

/** The list fetched for `serviceId`, if it came from `endpoint` and has not expired. */
export async function getCachedModelList(
  serviceId: string,
  endpoint: string | undefined,
  now = Date.now(),
): Promise<CachedModelList | undefined> {
  const cached = (await aiModelListValue.get())[serviceId];
  return cached && cached.endpoint === endpoint && isFresh(cached, now) ? cached : undefined;
}

/** Stores a service's fetched list and drops every expired one. */
export async function saveCachedModelList(
  serviceId: string,
  entry: CachedModelList,
  now = Date.now(),
): Promise<void> {
  await aiModelListValue.update((lists) => ({
    ...Object.fromEntries(Object.entries(lists).filter(([, list]) => isFresh(list, now))),
    [serviceId]: entry,
  }));
}
