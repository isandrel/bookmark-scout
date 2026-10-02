import { parse } from 'smol-toml';
import providerCatalog from '../../config/provider-catalog.json';
import settingsToml from '../../config/settings.default.toml?raw';

export type AIModel = {
  id: string;
  name: string;
  description?: string;
};

export type AIProviderKind = 'native' | 'openai_compatible' | 'anthropic_compatible' | 'ollama';

export type AIProviderConfig = {
  name: string;
  default_model: string;
  models: AIModel[];
  api_key_pattern?: string;
  api_key_placeholder?: string;
  provider_kind?: AIProviderKind;
  requires_api_key?: boolean;
  base_url?: string;
  supports_custom_model?: boolean;
  /** Shape of the provider's model-list endpoint; `openai` when omitted. */
  model_list?: ModelListStyle;
  /** Extra connection fields shown in Options, e.g. `organization` or `resourceName`. */
  extra_fields?: AIProviderExtraField[];
  /** Provider documentation, shown next to the provider picker. */
  doc_url?: string;
  /** `catalog` providers come from config/provider-catalog.json (models.dev), not the TOML. */
  source?: 'featured' | 'catalog';
  /** Picker group for TOML providers; catalog providers are always `catalog`. */
  group?: 'featured' | 'local' | 'custom';
};

/** Provider picker groups, in display order. */
export type AIProviderGroup = 'featured' | 'local' | 'custom' | 'catalog';

/** Provider-specific connection settings beyond the API key, Base URL, and headers. */
export type AIProviderExtraField = 'organization' | 'project' | 'resourceName' | 'apiVersion';

type TomlConfig = {
  ai: {
    providers: Record<string, AIProviderConfig>;
  };
};

const config = parse(settingsToml) as unknown as TomlConfig;

type CatalogEntry = {
  name: string;
  base_url: string;
  doc?: string;
  protocol: 'openai' | 'anthropic';
  requires_api_key: boolean;
  model_list?: 'none';
};

type ProviderCatalog = { logos: string[]; providers: Record<string, CatalogEntry> };
const catalog = providerCatalog as ProviderCatalog;

/**
 * Providers from the bundled models.dev snapshot, as provider configs. They have no built-in
 * model list: models come from Refresh Models, or a custom model.
 */
function catalogProviders(): Record<string, AIProviderConfig> {
  const entries = catalog.providers;
  return Object.fromEntries(
    Object.entries(entries).map(([id, entry]) => [
      id,
      {
        name: entry.name,
        default_model: '',
        models: [],
        provider_kind:
          entry.protocol === 'anthropic' ? 'anthropic_compatible' : 'openai_compatible',
        requires_api_key: entry.requires_api_key,
        base_url: entry.base_url,
        supports_custom_model: true,
        model_list: entry.model_list ?? (entry.protocol === 'anthropic' ? 'anthropic' : 'openai'),
        doc_url: entry.doc,
        source: 'catalog',
      } satisfies AIProviderConfig,
    ]),
  );
}

// Featured providers from the TOML come first and win over catalog entries with the same id.
const providers: Record<string, AIProviderConfig> = (() => {
  const featured = Object.fromEntries(
    Object.entries(config.ai?.providers ?? {}).map(([id, provider]) => [
      id,
      { ...provider, source: 'featured' as const },
    ]),
  );
  const catalog = Object.fromEntries(
    Object.entries(catalogProviders()).filter(([id]) => !(id in featured)),
  );
  return { ...featured, ...catalog };
})();

function getProviders() {
  return providers;
}

export function getAvailableProviders(): { id: AIProvider; name: string }[] {
  return Object.entries(getProviders()).map(([id, provider]) => ({
    id: id as AIProvider,
    name: provider.name,
  }));
}

export function getProviderConfig(provider: AIProvider): AIProviderConfig | undefined {
  return getProviders()[provider];
}

export function getProviderName(provider: AIProvider): string {
  return getProviderConfig(provider)?.name ?? provider;
}

export function getModelsForProvider(provider: AIProvider): AIModel[] {
  return getProviderConfig(provider)?.models ?? [];
}

export function getDefaultModel(provider: AIProvider): string {
  const providerConfig = getProviderConfig(provider);
  if (providerConfig?.default_model) {
    return providerConfig.default_model;
  }

  return getModelsForProvider(provider)[0]?.id ?? '';
}

export function getProviderKind(provider: AIProvider): AIProviderKind {
  return getProviderConfig(provider)?.provider_kind ?? 'native';
}

export function getProviderBaseUrl(provider: AIProvider): string | undefined {
  return getProviderConfig(provider)?.base_url;
}

export function providerRequiresApiKey(provider: AIProvider): boolean {
  return getProviderConfig(provider)?.requires_api_key ?? true;
}

export function providerSupportsCustomModel(provider: AIProvider): boolean {
  return getProviderConfig(provider)?.supports_custom_model ?? false;
}

export function getProviderModelListStyle(provider: AIProvider): ModelListStyle {
  return getProviderConfig(provider)?.model_list ?? 'openai';
}

export function getProviderExtraFields(provider: AIProvider): AIProviderExtraField[] {
  return getProviderConfig(provider)?.extra_fields ?? [];
}

export function isCatalogProvider(provider: AIProvider): boolean {
  return getProviderConfig(provider)?.source === 'catalog';
}

export function getProviderDocUrl(provider: AIProvider): string | undefined {
  return getProviderConfig(provider)?.doc_url;
}

const logoIds = new Set(catalog.logos);
/** Featured providers whose logo is published under another models.dev id. */
const LOGO_ALIASES: Record<string, string> = { ollama: 'ollama-cloud' };

/** URL of the provider's bundled one-color logo, if the catalog has one. */
export function getProviderLogoUrl(provider: AIProvider): string | undefined {
  const id = LOGO_ALIASES[provider] ?? provider;
  return logoIds.has(id) ? `/provider-logos/${id}.svg` : undefined;
}

export function getProviderGroup(provider: AIProvider): AIProviderGroup {
  const providerConfig = getProviderConfig(provider);
  if (providerConfig?.source === 'catalog') return 'catalog';
  return providerConfig?.group ?? 'featured';
}
