/**
 * Named AI services: any number of saved provider configurations, one of them the default.
 * A service's credentials and endpoint overrides live in the AI credentials item
 * (`STORAGE_ITEMS.aiCredentials`) under the service id. Everything here stays on this device.
 */
import { z } from 'zod';

const serviceSchema = z.object({
  id: z.string().min(1),
  /** User-facing label; defaults to the provider name. */
  name: z.string(),
  provider: z.string(),
  /** Chosen model id; empty means the provider default. */
  model: z.string(),
  enabled: z.boolean(),
});

export type AIService = z.infer<typeof serviceSchema> & { provider: AIProvider };

export type AIServicesState = {
  services: AIService[];
  defaultServiceId?: string;
};

const EMPTY_SERVICES: AIServicesState = { services: [] };

/** A malformed service, or a repeat of an id, is dropped on its own. */
function parseServices(raw: unknown): AIServicesState {
  if (!isPlainObject(raw)) return EMPTY_SERVICES;
  const seen = new Set<string>();
  const services = parseValidList(raw.services, serviceSchema).filter((service) => {
    if (seen.has(service.id)) return false;
    seen.add(service.id);
    return true;
  });
  const defaultServiceId =
    typeof raw.defaultServiceId === 'string' ? raw.defaultServiceId : undefined;
  return { services, ...(defaultServiceId ? { defaultServiceId } : {}) };
}

/** Every saved service and the default one, as stored. */
export const aiServicesValue = defineStoredValue<AIServicesState>(STORAGE_ITEMS.aiServices, {
  parse: parseServices,
  empty: EMPTY_SERVICES,
  isEmpty: (state) => state.services.length === 0,
});

/** Drops services whose provider no longer exists and repairs a missing default. */
function normalizeServices(state: AIServicesState): AIServicesState {
  const services = state.services.filter((service) => isAvailableProvider(service.provider));
  const defaultService =
    services.find((service) => service.id === state.defaultServiceId && service.enabled) ??
    services.find((service) => service.enabled);
  return { services, defaultServiceId: defaultService?.id };
}

/** The services that can be used, with the default repaired; follows changes live. */
export const aiServicesStateValue = defineDerivedValue(
  [aiServicesValue] as const,
  ([stored]) => normalizeServices(stored),
  EMPTY_SERVICES,
);

export async function getAIServicesState(): Promise<AIServicesState> {
  return aiServicesStateValue.get();
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
  return aiServicesValue.update((stored) => normalizeServices(change(normalizeServices(stored))));
}

/** A new id that no stored service or credential entry uses yet. */
function newServiceId(provider: AIProvider, taken: Set<string>): string {
  for (;;) {
    const id = `${provider}-${crypto.randomUUID().slice(0, INPUT_LIMITS.ids.service_suffix)}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * Whether only one service of this provider may exist: the browser's built-in model is one model
 * on this computer with nothing to configure, so a second service would be the same thing again.
 */
export function isSingleServiceProvider(provider: AIProvider): boolean {
  return isBuiltinProvider(provider);
}

/**
 * Adds a service of `provider`, the first one becoming the default. For a provider that allows
 * only one service (`isSingleServiceProvider`), an existing one is returned unchanged instead.
 */
export async function addAIService(provider: AIProvider, name?: string): Promise<AIService> {
  const configs = await aiProviderConfigValue.get();
  let created: AIService | undefined;
  await updateServices((state) => {
    const existing = isSingleServiceProvider(provider)
      ? state.services.find((service) => service.provider === provider)
      : undefined;
    if (existing) {
      created = existing;
      return state;
    }
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

/**
 * Puts the services in `ids` order. The order matters: an AI feature the default service cannot
 * run uses the first enabled service that can (`pickAIService`).
 */
export async function reorderAIServices(ids: readonly string[]): Promise<void> {
  await updateServices((state) => ({
    ...state,
    services: orderByIds(state.services, (service) => service.id, ids),
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

/**
 * Copies a service and its credentials under a new id, named "<name> (copy)". A service whose
 * provider allows only one is not copied.
 */
export async function duplicateAIService(id: string): Promise<AIService | undefined> {
  const state = await getAIServicesState();
  const source = state.services.find((service) => service.id === id);
  if (!source || isSingleServiceProvider(source.provider)) return undefined;
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
