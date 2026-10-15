import { describe, expect, it } from 'vitest';
import { aiProviderFileSchema, aiProviderFilesSchema } from '@/lib/config/ai-provider-schema';
import { getAvailableProviders, getProviderGroup, getProviderKeyUrl } from '@/services/ai-models';
import { isAISetUp } from '@/services/ai-settings';
import { listConfigFiles, readConfigToml } from '../config-files';

const service = (provider: string, id = provider) => ({
  id,
  name: provider,
  provider: provider as AIProvider,
  model: '',
  enabled: true,
});

describe('AI set up for the AI buttons', () => {
  it('needs a default service', () => {
    expect(isAISetUp({ services: [] }, {})).toBe(false);
    expect(isAISetUp({ services: [service('openai')] }, { openai: { apiKey: 'sk-test' } })).toBe(
      false,
    );
  });

  it('needs an API key when the provider asks for one, and none for a local server', () => {
    const openai = { services: [service('openai')], defaultServiceId: 'openai' };
    expect(isAISetUp(openai, {})).toBe(false);
    expect(isAISetUp(openai, { openai: { apiKey: '   ' } })).toBe(false);
    expect(isAISetUp(openai, { openai: { apiKey: 'sk-test' } })).toBe(true);
    // A key saved for another service does not count.
    expect(isAISetUp(openai, { other: { apiKey: 'sk-test' } })).toBe(false);

    const ollama = { services: [service('ollama')], defaultServiceId: 'ollama' };
    expect(isAISetUp(ollama, {})).toBe(true);
  });
});

describe('Get a key links', () => {
  const files = Object.fromEntries(
    listConfigFiles()
      .filter((file) => file.startsWith('ai/providers/'))
      .map((file) => [file.slice('ai/providers/'.length, -'.toml'.length), readConfigToml(file)]),
  ) as Record<string, { requires_api_key: boolean; key_url?: string; group?: string }>;

  it('come from the provider files, and catalog providers have none', () => {
    for (const [id, file] of Object.entries(files)) {
      expect(getProviderKeyUrl(id as AIProvider), id).toBe(file.key_url);
    }
    const catalog = getAvailableProviders().filter(
      (provider) => getProviderGroup(provider.id) === 'catalog',
    );
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog.filter((provider) => getProviderKeyUrl(provider.id))).toEqual([]);
  });

  it('are set for the featured providers that need a key, on https pages', () => {
    const featured = Object.entries(files).filter(
      ([, file]) => (file.group ?? 'featured') === 'featured' && file.requires_api_key,
    );
    // Azure keys live in each user's own Azure resource, so there is no one page to link.
    const missing = featured.filter(([id, file]) => id !== 'azure' && !file.key_url);
    expect(missing.map(([id]) => id)).toEqual([]);
    for (const [, file] of featured) {
      if (file.key_url) expect(new URL(file.key_url).protocol).toBe('https:');
    }
  });

  it('are rejected in a provider file that needs no key, or on a non-https page', () => {
    const base = {
      name: 'Example',
      order: 1,
      default_model: '',
      provider_kind: 'openai_compatible',
      requires_api_key: true,
    };
    expect(
      aiProviderFileSchema.safeParse({ ...base, key_url: 'http://example.com/keys' }).success,
    ).toBe(false);
    expect(
      aiProviderFileSchema.safeParse({ ...base, key_url: 'https://example.com/keys' }).success,
    ).toBe(true);
    expect(
      aiProviderFilesSchema.safeParse({
        example: { ...base, requires_api_key: false, key_url: 'https://example.com/keys' },
      }).success,
    ).toBe(false);
  });
});
