import { beforeEach, describe, expect, it } from 'vitest';
import { getAIProviderPanelFields } from '@/components/options/AIProviderPanel';
import { setLanguage, t } from '@/hooks/use-i18n';

beforeEach(() => {
  setLanguage('en');
});

describe('AI provider panel search fields', () => {
  it('lists the panel fields with their labels so settings search can find them', () => {
    const fields = getAIProviderPanelFields('custom');
    expect(fields.map(({ field }) => field)).toEqual([
      'apiKey',
      'baseUrl',
      'customModel',
      'extraHeaders',
    ]);
    expect(fields.map(({ text }) => text[0])).toEqual([
      'API Key',
      'Base URL',
      'Custom Model',
      'Extra Headers JSON',
    ]);
  });

  it('omits Custom Model for providers that do not support it', () => {
    expect(getAIProviderPanelFields('openai').map(({ field }) => field)).toEqual([
      'apiKey',
      'baseUrl',
      'extraHeaders',
    ]);
  });
});

describe('API key format message', () => {
  it('reads correctly for provider names that start with a vowel', () => {
    expect(t('options_apiKeyInvalidFormat', 'OpenAI')).toBe(
      "This doesn't look like an API key for OpenAI. It was not saved.",
    );
  });
});
