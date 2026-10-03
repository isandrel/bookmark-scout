import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { z } from 'zod';
import { saveStoredAIProviderConfig } from '@/lib/ai-provider-storage';
import { generateAIObject } from '@/services/ai-client';
import { createAIModel } from '@/services/ai-client.lazy';
import {
  buildAISettingsFromProvider,
  getProviderEndpoint,
  isValidProviderBaseUrl,
  isValidProviderExtraHeaders,
} from '@/services/ai-settings';

const mocks = vi.hoisted(() => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ model }))),
  createAnthropic: vi.fn(() => vi.fn((model: string) => ({ model }))),
  generateObject: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mocks.createOpenAI }));
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: mocks.createAnthropic }));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateObject: mocks.generateObject,
}));

beforeEach(() => {
  fakeBrowser.reset();
  vi.clearAllMocks();
  setLanguage('en');
});

describe('AI provider endpoint validation', () => {
  it.each([
    ['https://proxy.example.test/v1', true],
    ['http://localhost:11434/api', true],
    ['javascript:alert(1)', false],
    ['not a url', false],
    ['file:///etc/passwd', false],
    ['/relative/path', false],
  ])('%s -> %s', (url, valid) => {
    expect(isValidProviderBaseUrl(url)).toBe(valid);
  });

  it('accepts only JSON objects with string header values', () => {
    expect(isValidProviderExtraHeaders('')).toBe(true);
    expect(isValidProviderExtraHeaders('{"X-Test":"1"}')).toBe(true);
    expect(isValidProviderExtraHeaders('{"X-Test":1}')).toBe(false);
    expect(isValidProviderExtraHeaders('["a"]')).toBe(false);
    expect(isValidProviderExtraHeaders('{oops')).toBe(false);
  });

  it('refuses to build settings from a stored invalid Base URL', async () => {
    await saveStoredAIProviderConfig('openai', {
      apiKey: 'sk-synthetic',
      baseUrl: 'javascript:alert(1)',
    });
    await expect(buildAISettingsFromProvider('openai', 'gpt-4o-mini', true)).rejects.toThrow(
      'Enter a full http:// or https:// URL.',
    );
  });

  it('resolves the endpoint a request will reach', () => {
    expect(getProviderEndpoint('openai', undefined)).toBe('https://api.openai.com/v1');
    expect(getProviderEndpoint('openai', 'https://proxy.example.test/v1')).toBe(
      'https://proxy.example.test/v1',
    );
    expect(getProviderEndpoint('ollama', '')).toBe('http://localhost:11434/api');
    expect(getProviderEndpoint('google', undefined)).toBe(
      'https://generativelanguage.googleapis.com/v1beta',
    );
    expect(getProviderEndpoint('azure', undefined, { resourceName: 'my-resource' })).toBe(
      'https://my-resource.openai.azure.com/openai/v1',
    );
  });
});

describe('[mocked provider contract] native providers honor Base URL and Extra Headers', () => {
  it.each([
    ['openai', 'gpt-4o-mini', mocks.createOpenAI, 'sk-synthetic'],
    ['anthropic', 'claude-sonnet-4-20250514', mocks.createAnthropic, 'sk-ant-synthetic'],
  ] as const)('%s uses the configured endpoint', async (provider, model, factory, apiKey) => {
    await saveStoredAIProviderConfig(provider, {
      apiKey,
      baseUrl: 'https://proxy.example.test/v1',
      extraHeaders: '{"X-Proxy":"yes"}',
    });
    await createAIModel(await buildAISettingsFromProvider(provider, model, true));
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey,
        baseURL: 'https://proxy.example.test/v1',
        headers: expect.objectContaining({ 'X-Proxy': 'yes' }),
      }),
    );
  });

  it('uses the provider default endpoint when no Base URL is configured', async () => {
    await saveStoredAIProviderConfig('openai', { apiKey: 'sk-synthetic' });
    await createAIModel(await buildAISettingsFromProvider('openai', 'gpt-4o-mini', true));
    expect(mocks.createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-synthetic',
        baseURL: 'https://api.openai.com/v1',
        headers: undefined,
      }),
    );
  });

  it('sends Anthropic the browser-access header alongside extra headers', async () => {
    await saveStoredAIProviderConfig('anthropic', {
      apiKey: 'sk-ant-synthetic',
      extraHeaders: '{"X-Proxy":"yes"}',
    });
    await createAIModel(
      await buildAISettingsFromProvider('anthropic', 'claude-sonnet-4-20250514', true),
    );
    expect(mocks.createAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'anthropic-dangerous-direct-browser-access': 'true', 'X-Proxy': 'yes' },
      }),
    );
  });

  it('passes OpenAI organization and project from the extra fields', async () => {
    await saveStoredAIProviderConfig('openai', {
      apiKey: 'sk-synthetic',
      options: { organization: ' org-synthetic ', project: '' },
    });
    await createAIModel(await buildAISettingsFromProvider('openai', 'gpt-4o-mini', true));
    expect(mocks.createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ organization: 'org-synthetic', project: undefined }),
    );
  });
});

describe('[mocked provider contract] AI client calls', () => {
  it('loads the AI SDK on first use and sends the request to the service model', async () => {
    await saveStoredAIProviderConfig('openai', { apiKey: 'sk-synthetic' });
    const settings = await buildAISettingsFromProvider('openai', 'gpt-4o-mini', true);
    const schema = z.object({ ok: z.boolean() });
    mocks.generateObject.mockResolvedValue({ object: { ok: true }, usage: {} });

    await expect(
      generateAIObject({ settings, source: 'autoTagging', schema, system: 'S', prompt: 'P' }),
    ).resolves.toEqual({ object: { ok: true } });
    expect(mocks.generateObject).toHaveBeenCalledWith({
      schema,
      system: 'S',
      prompt: 'P',
      model: { model: 'gpt-4o-mini' },
    });
  });

  it('checks the settings before loading a provider', async () => {
    await saveStoredAIProviderConfig('openai', { apiKey: 'sk-synthetic' });
    const settings = await buildAISettingsFromProvider('openai', 'gpt-4o-mini', false);
    await expect(
      generateAIObject({
        settings,
        source: 'autoTagging',
        schema: z.object({}),
        system: '',
        prompt: '',
      }),
    ).rejects.toThrow('AI features are disabled');
    expect(mocks.createOpenAI).not.toHaveBeenCalled();
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });
});
