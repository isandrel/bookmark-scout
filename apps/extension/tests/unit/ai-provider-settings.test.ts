import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { saveStoredAIProviderConfig } from '@/lib/ai-provider-storage';
import { createAIModel } from '@/services/ai-client';
import {
  buildAISettingsFromProvider,
  getProviderEndpoint,
  isValidProviderBaseUrl,
  isValidProviderExtraHeaders,
} from '@/services/ai-settings';

const mocks = vi.hoisted(() => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ model }))),
  createAnthropic: vi.fn(() => vi.fn((model: string) => ({ model }))),
}));

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mocks.createOpenAI }));
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: mocks.createAnthropic }));

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
    createAIModel(await buildAISettingsFromProvider(provider, model, true));
    expect(factory).toHaveBeenCalledWith({
      apiKey,
      baseURL: 'https://proxy.example.test/v1',
      headers: { 'X-Proxy': 'yes' },
    });
  });

  it('keeps the SDK default endpoint when no Base URL is configured', async () => {
    await saveStoredAIProviderConfig('openai', { apiKey: 'sk-synthetic' });
    createAIModel(await buildAISettingsFromProvider('openai', 'gpt-4o-mini', true));
    expect(mocks.createOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-synthetic',
      baseURL: undefined,
      headers: undefined,
    });
  });
});
