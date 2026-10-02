/**
 * Named AI services: any number of saved provider configurations, one of them the default.
 * A service's credentials and endpoint overrides live in `local:bookmark-scout-ai` under the
 * service id, so a service created from an older single-provider setup keeps its provider id as
 * its own id and needs no data copied. Everything here stays on this device.
 */
import { useEffect, useState } from 'react';

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

export const aiServicesItem = storage.defineItem<AIServicesState>(
  'local:bookmark-scout-ai-services',
);

/**
 * The services a setup from before named services implies: one per provider with stored
 * credentials, plus the selected provider, which is the default. Nothing is written.
 */
async function deriveLegacyServices(): Promise<AIServicesState> {
  const [settings, configs] = await Promise.all([
    getSettings(),
    aiProviderConfigItem.getValue(),
  ]);
  const providerIds = new Set(getAvailableProviders().map((provider) => provider.id));
  const ids = [
    settings.aiProvider,
    ...Object.keys(configs ?? {}).filter((id) => id !== settings.aiProvider),
  ].filter((id) => providerIds.has(id));
  return {
    defaultServiceId: settings.aiProvider,
    services: ids.map((provider) => ({
      id: provider,
      name: getLocalizedProviderName(provider),
      provider,
      model:
        provider === settings.aiProvider
          ? configs?.[provider]?.customModel?.trim() || settings.aiModel
          : configs?.[provider]?.customModel?.trim() || getDefaultModel(provider),
      enabled: true,
    })),
  };
}

/** Drops services whose provider no longer exists and repairs a missing default. */
function normalizeServices(state: AIServicesState): AIServicesState {
  const providerIds = new Set(getAvailableProviders().map((provider) => provider.id));
  const services = state.services.filter((service) => providerIds.has(service.provider));
  const defaultService =
    services.find((service) => service.id === state.defaultServiceId && service.enabled) ??
    services.find((service) => service.enabled);
  return { services, defaultServiceId: defaultService?.id };
}

export async function getAIServicesState(): Promise<AIServicesState> {
  const stored = await aiServicesItem.getValue();
  return normalizeServices(stored ?? (await deriveLegacyServices()));
}

export async function getDefaultAIService(): Promise<AIService | undefined> {
  const state = await getAIServicesState();
  return state.services.find((service) => service.id === state.defaultServiceId);
}

async function updateServices(update: (state: AIServicesState) => AIServicesState) {
  const next = normalizeServices(update(await getAIServicesState()));
  await aiServicesItem.setValue(next);
  return next;
}

/** A new id that no stored service or credential entry uses yet. */
function newServiceId(provider: AIProvider, taken: Set<string>): string {
  for (;;) {
    const id = `${provider}-${crypto.randomUUID().slice(0, 8)}`;
    if (!taken.has(id)) return id;
  }
}

export async function addAIService(provider: AIProvider, name?: string): Promise<AIService> {
  const configs = (await aiProviderConfigItem.getValue()) ?? {};
  let created: AIService | undefined;
  await updateServices((state) => {
    const taken = new Set([...state.services.map((service) => service.id), ...Object.keys(configs)]);
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
  const copy = await addAIService(source.provider, t('options_aiServiceCopyName', source.name));
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

/** Live services state for React, following changes from any page. */
export function useAIServices(): { state: AIServicesState; isLoading: boolean } {
  const [state, setState] = useState<AIServicesState>({ services: [] });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let received = false;
    const refresh = () => {
      void getAIServicesState().then((next) => {
        if (active) setState(next);
      });
    };
    void getAIServicesState().then((next) => {
      if (!active) return;
      if (!received) setState(next);
      setIsLoading(false);
    });
    const unwatchServices = aiServicesItem.watch(() => {
      received = true;
      refresh();
    });
    // Before the first save, services are derived from the synced provider and stored keys.
    const unwatchSettings = subscribeToSettings(() => {
      received = true;
      refresh();
    });
    const unwatchConfigs = aiProviderConfigItem.watch(() => {
      received = true;
      refresh();
    });
    return () => {
      active = false;
      unwatchServices();
      unwatchSettings();
      unwatchConfigs();
    };
  }, []);

  return { state, isLoading };
}
