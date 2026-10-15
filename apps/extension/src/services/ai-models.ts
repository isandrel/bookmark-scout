import providerLogoAliases from 'virtual:provider-logo-aliases';
import {
  type AI_FEATURES,
  type AI_PROVIDER_EXTRA_FIELDS,
  type AI_PROVIDER_KINDS,
  AI_PROVIDERS_CONFIG_PATH,
  aiProviderFilesSchema,
} from '@/lib/config/ai-provider-schema';
import { type ProviderCatalog, providerCatalogSchema } from '@/lib/config/provider-catalog-schema';
import providerCatalog from '../../config/provider-catalog.json';

export type AIModel = {
  id: string;
  name: string;
  description?: string;
};

export type AIProviderKind = (typeof AI_PROVIDER_KINDS)[number];

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
  /** Where a signed-in user creates an API key, shown as "Get a key" by the key field. */
  key_url?: string;
  /** `catalog` providers come from config/provider-catalog.json (models.dev), not the TOML. */
  source?: 'featured' | 'catalog';
  /** Picker group for TOML providers; catalog providers are always `catalog`. */
  group?: 'featured' | 'local' | 'custom';
  /** models.dev logo id for a provider file; catalog providers use their own id. */
  logo?: string;
  /** The AI features this provider may serve; every feature when omitted. */
  features?: readonly AIFeature[];
};

/** An AI feature that picks its own service (`AI_FEATURES`). */
export type AIFeature = (typeof AI_FEATURES)[number];

/** Provider picker groups, in display order. */
export type AIProviderGroup = 'featured' | 'local' | 'custom' | 'catalog';

/** Provider-specific connection settings beyond the API key, Base URL, and headers. */
export type AIProviderExtraField = (typeof AI_PROVIDER_EXTRA_FIELDS)[number];

/** One file per featured, local, and custom provider, in picker order. */
const providerFiles = Object.entries(
  readConfig(AI_PROVIDERS_CONFIG_PATH, aiProviderFilesSchema),
).sort(([, left], [, right]) => left.order - right.order);

const featuredProviderIds = new Set(providerFiles.map(([id]) => id));

let catalog: ProviderCatalog | undefined;

/**
 * The bundled snapshot, validated on first use: a bad snapshot fails here, not in the picker.
 * Not on load: every page and the background read settings, and most never need more than the
 * featured providers, so they skip validating about 200 catalog entries at start.
 */
function getCatalog(): ProviderCatalog {
  catalog ??= providerCatalogSchema.parse(providerCatalog);
  return catalog;
}

/**
 * Providers from the bundled models.dev snapshot, as provider configs. They have no built-in
 * model list: models come from Refresh Models, or a custom model.
 */
function catalogProviders(): Record<string, AIProviderConfig> {
  const entries = getCatalog().providers;
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

let providers: Record<string, AIProviderConfig> | undefined;

// Provider files come first and win over catalog entries with the same id.
function getProviders(): Record<string, AIProviderConfig> {
  providers ??= (() => {
    const featured = Object.fromEntries(
      providerFiles.map(([id, provider]) => [id, { ...provider, source: 'featured' as const }]),
    );
    const catalog = Object.fromEntries(
      Object.entries(catalogProviders()).filter(([id]) => !(id in featured)),
    );
    return { ...featured, ...catalog };
  })();
  return providers;
}

/**
 * Whether `provider` is one of `getAvailableProviders()`. A provider file answers without
 * reading the catalog, so checking a stored setting does not validate the whole snapshot.
 */
export function isAvailableProvider(provider: string): provider is AIProvider {
  return featuredProviderIds.has(provider) || Object.hasOwn(getProviders(), provider);
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

/** A model's name from its provider file ("Gemini Nano"), or its id when the file lists none. */
export function getModelDisplayName(provider: AIProvider, modelId: string): string {
  return getModelsForProvider(provider).find((model) => model.id === modelId)?.name ?? modelId;
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

/** Whether the provider is the browser's own model on this computer (Chrome's built-in AI). */
export function isBuiltinProvider(provider: AIProvider): boolean {
  return getProviderKind(provider) === 'chrome_builtin';
}

/** The provider file of the browser's built-in model, which the AI onboarding offers first. */
export const BUILTIN_AI_PROVIDER: AIProvider | undefined = providerFiles.find(
  ([, provider]) => provider.provider_kind === 'chrome_builtin',
)?.[0];

/** Whether a service of this provider may serve `feature` (its file's `features`). */
export function providerSupportsFeature(provider: AIProvider, feature: AIFeature): boolean {
  const features = getProviderConfig(provider)?.features;
  return !features || features.includes(feature);
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

/** The provider's page for creating an API key ("Get a key"), where its file names one. */
export function getProviderKeyUrl(provider: AIProvider): string | undefined {
  return getProviderConfig(provider)?.key_url;
}

let logoIds: Set<string> | undefined;

/**
 * URL of the provider's bundled one-color logo, if the catalog has one. Provider files name their
 * logo with `logo`; catalog providers use their own id. Byte-identical logos share a generated
 * canonical URL, so the package needs only one copy while the catalog keeps every provider id.
 */
export function getProviderLogoUrl(provider: AIProvider): string | undefined {
  const providerConfig = getProviderConfig(provider);
  const id = providerConfig?.source === 'featured' ? providerConfig.logo : provider;
  logoIds ??= new Set(getCatalog().logos);
  if (id === undefined || !logoIds.has(id)) return undefined;
  const file = Object.hasOwn(providerLogoAliases, id) ? providerLogoAliases[id] : id;
  return `/provider-logos/${file}.svg`;
}

export function getProviderGroup(provider: AIProvider): AIProviderGroup {
  const providerConfig = getProviderConfig(provider);
  if (providerConfig?.source === 'catalog') return 'catalog';
  return providerConfig?.group ?? 'featured';
}
