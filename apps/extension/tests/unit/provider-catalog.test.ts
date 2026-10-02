import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { saveStoredAIProviderConfig } from '@/lib/ai-provider-storage';
import { settingsSchema } from '@/lib/settings-schema';
import { createAIModel } from '@/services/ai-client';
import {
  getAvailableProviders,
  getProviderLogoUrl,
  getProviderBaseUrl,
  getProviderKind,
  getProviderModelListStyle,
  isCatalogProvider,
  providerRequiresApiKey,
  providerSupportsCustomModel,
} from '@/services/ai-models';
import { buildAISettingsFromProvider } from '@/services/ai-settings';
import providerCatalog from '../../config/provider-catalog.json';

const mocks = vi.hoisted(() => ({
  chatModel: vi.fn((model: string) => ({ model })),
  createOpenAICompatible: vi.fn(),
  createAnthropic: vi.fn(() => vi.fn((model: string) => ({ model }))),
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: mocks.createOpenAICompatible,
}));
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: mocks.createAnthropic }));

beforeEach(() => {
  fakeBrowser.reset();
  vi.clearAllMocks();
  mocks.createOpenAICompatible.mockReturnValue({ chatModel: mocks.chatModel });
  setLanguage('en');
});

const catalogIds = Object.keys(
  (providerCatalog as { providers: Record<string, unknown> }).providers,
);

describe('bundled models.dev provider catalog', () => {
  it('lists featured providers first, then catalog providers', () => {
    const ids = getAvailableProviders().map((provider) => provider.id);
    expect(ids.slice(0, 3)).toEqual(['openai', 'anthropic', 'google']);
    expect(ids).toContain('togetherai');
    expect(ids.indexOf('togetherai')).toBeGreaterThan(ids.indexOf('custom'));
    expect(new Set(ids).size).toBe(ids.length);
    expect(catalogIds.length).toBeGreaterThan(150);
  });

  it('keeps featured definitions when the catalog has the same id', () => {
    expect(catalogIds).toContain('deepseek');
    expect(isCatalogProvider('deepseek')).toBe(false);
    expect(getProviderKind('deepseek')).toBe('native');
  });

  it('turns catalog entries into OpenAI- or Anthropic-compatible providers', () => {
    expect(isCatalogProvider('togetherai')).toBe(true);
    expect(getProviderKind('togetherai')).toBe('openai_compatible');
    expect(getProviderBaseUrl('togetherai')).toBe('https://api.together.xyz/v1');
    expect(getProviderModelListStyle('togetherai')).toBe('openai');
    expect(providerSupportsCustomModel('togetherai')).toBe(true);
    expect(providerRequiresApiKey('lmstudio')).toBe(false);
  });

  it('leaves out providers that need account-specific URLs or no longer answer', () => {
    const ids = getAvailableProviders().map((provider) => provider.id);
    for (const id of ['cloudflare-workers-ai', 'databricks', 'clarifai', 'crof']) {
      expect(ids).not.toContain(id);
    }
  });

  it('uses a test prompt for catalog providers without a model list', () => {
    expect(getProviderModelListStyle('oci')).toBe('none');
  });

  it('points featured and catalog providers at bundled logos', () => {
    expect(getProviderLogoUrl('openai')).toBe('/provider-logos/openai.svg');
    expect(getProviderLogoUrl('ollama')).toBe('/provider-logos/ollama-cloud.svg');
    expect(getProviderLogoUrl('togetherai')).toBe('/provider-logos/togetherai.svg');
    expect(getProviderLogoUrl('custom')).toBeUndefined();
  });

  it('accepts catalog provider ids in synced settings', () => {
    expect(settingsSchema.shape.aiProvider.parse('togetherai')).toBe('togetherai');
  });
});

describe('[mocked provider contract] catalog providers', () => {
  it('call Chat Completions through the OpenAI-compatible package', async () => {
    await saveStoredAIProviderConfig('togetherai', { apiKey: 'synthetic-key' });
    createAIModel(await buildAISettingsFromProvider('togetherai', 'meta-llama/x', true));
    expect(mocks.createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'togetherai',
        apiKey: 'synthetic-key',
        baseURL: 'https://api.together.xyz/v1',
      }),
    );
    expect(mocks.chatModel).toHaveBeenCalledWith('meta-llama/x');
  });

  it('send Anthropic-protocol providers the browser-access header', async () => {
    const anthropicCatalogId = Object.entries(
      (providerCatalog as { providers: Record<string, { protocol: string }> }).providers,
    ).find(([id, entry]) => entry.protocol === 'anthropic' && isCatalogProvider(id))?.[0];
    expect(anthropicCatalogId).toBeDefined();
    const id = anthropicCatalogId as string;
    await saveStoredAIProviderConfig(id, { apiKey: 'synthetic-key' });
    createAIModel(await buildAISettingsFromProvider(id, 'some-model', true));
    expect(mocks.createAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: getProviderBaseUrl(id),
        headers: expect.objectContaining({ 'anthropic-dangerous-direct-browser-access': 'true' }),
      }),
    );
  });
});
