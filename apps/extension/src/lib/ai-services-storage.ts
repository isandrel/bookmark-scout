/**
 * Named AI services: any number of saved provider configurations, one of them the default.
 * A service's credentials and endpoint overrides live in the AI credentials item
 * (`STORAGE_ITEMS.aiCredentials`) under the service id. Everything here stays on this device.
 */
import { z } from 'zod';

export type AIService = {
  id: string;
  /** User-facing label; defaults to the provider name. */
  name: string;
  provider: AIProvider;
  /** Chosen model id; empty means the provider default. */
  model: string;
  enabled: boolean;
};

export type AIServicesState = {
  services: AIService[];
  defaultServiceId?: string;
};

/** `null` until services are first saved. */
export const aiServicesValue = defineStoredValue<AIServicesState | null>(STORAGE_ITEMS.aiServices, {
  parse: (raw) =>
    isPlainObject(raw) && Array.isArray(raw.services) ? (raw as AIServicesState) : null,
  empty: null,
});

/** Drops services whose provider no longer exists and repairs a missing default. */
function normalizeServices(state: AIServicesState): AIServicesState {
  const services = state.services.filter((service) => isAvailableProvider(service.provider));
  const defaultService =
    services.find((service) => service.id === state.defaultServiceId && service.enabled) ??
    services.find((service) => service.enabled);
  return { services, defaultServiceId: defaultService?.id };
}

function resolveServices(stored: AIServicesState | null): AIServicesState {
  return normalizeServices(stored ?? { services: [] });
}

export async function getAIServicesState(): Promise<AIServicesState> {
  return resolveServices(await aiServicesValue.get());
}

/** The provider the Add service dialog starts with. */
export const DEFAULT_SERVICE_PROVIDER: AIProvider = readConfig(
  'ai/services',
  z.strictObject({ default_provider: z.string().refine(isAvailableProvider) }),
).default_provider;

export async function getDefaultAIService(): Promise<AIService | undefined> {
  const state = await getAIServicesState();
  return state.services.find((service) => service.id === state.defaultServiceId);
}

async function updateServices(
  change: (state: AIServicesState) => AIServicesState,
): Promise<AIServicesState> {
  const next = await aiServicesValue.update((stored) =>
    normalizeServices(change(resolveServices(stored))),
  );
  return next ?? { services: [] };
}

/** A new id that no stored service or credential entry uses yet. */
function newServiceId(provider: AIProvider, taken: Set<string>): string {
  for (;;) {
    const id = `${provider}-${crypto.randomUUID().slice(0, 8)}`;
    if (!taken.has(id)) return id;
  }
}

export async function addAIService(provider: AIProvider, name?: string): Promise<AIService> {
  const configs = await aiProviderConfigValue.get();
  let created: AIService | undefined;
  await updateServices((state) => {
    const taken = new Set([
      ...state.services.map((service) => service.id),
      ...Object.keys(configs),
    ]);
    created = {
      id: newServiceId(provider, taken),
      name: name?.trim() || getLocalizedProviderName(provider),
      provider,
      model: getDefaultModel(provider),
      enabled: true,
    };
    return {
      services: [...state.services, created],
      // The first service becomes the default.
      defaultServiceId: state.defaultServiceId ?? created.id,
    };
  });
  return created as AIService;
}

export async function updateAIService(
  id: string,
  changes: Partial<Omit<AIService, 'id' | 'provider'>>,
): Promise<void> {
  await updateServices((state) => ({
    ...state,
    services: state.services.map((service) =>
      service.id === id ? { ...service, ...changes } : service,
    ),
  }));
}

export async function setDefaultAIService(id: string): Promise<void> {
  await updateServices((state) => ({
    services: state.services.map((service) =>
      service.id === id ? { ...service, enabled: true } : service,
    ),
    defaultServiceId: id,
  }));
}

/** Copies a service and its credentials under a new id, named "<name> (copy)". */
export async function duplicateAIService(id: string): Promise<AIService | undefined> {
  const state = await getAIServicesState();
  const source = state.services.find((service) => service.id === id);
  if (!source) return undefined;
  const copy = await addAIService(source.provider, t('format_copyName', source.name));
  await updateAIService(copy.id, { model: source.model, enabled: source.enabled });
  const config = await getStoredAIProviderConfig(source.id);
  if (Object.keys(config).length > 0) await saveStoredAIProviderConfig(copy.id, config);
  return { ...copy, model: source.model, enabled: source.enabled };
}

/** Removes a service and its stored credentials. */
export async function deleteAIService(id: string): Promise<void> {
  await updateServices((state) => ({
    ...state,
    services: state.services.filter((service) => service.id !== id),
  }));
  await clearStoredAIProviderConfig(id);
}
