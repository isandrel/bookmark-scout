import { APICallError, NoObjectGeneratedError, RetryError } from 'ai';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { saveSettings } from '@/lib/settings-storage';
import { describeAIError } from '@/services/ai-errors';

const URL_ = 'https://api.e2e.invalid/v1/chat/completions';

function apiError(statusCode?: number) {
  return new APICallError({
    message: `HTTP ${statusCode} raw provider text`,
    url: URL_,
    requestBodyValues: {},
    statusCode,
  });
}

beforeEach(async () => {
  fakeBrowser.reset();
  await saveSettings({ language: 'en' });
  setLanguage('en');
});

describe('describeAIError', () => {
  it('explains a response that did not match the schema', () => {
    const error = new NoObjectGeneratedError({
      message: 'No object generated: response did not match schema.',
      text: 'not json',
      response: undefined,
      usage: undefined,
      finishReason: 'stop',
    } as never);
    expect(describeAIError(error)).toBe(
      "The AI's answer was not in the expected format. Try again, or choose another model.",
    );
  });

  it.each([
    [401, 'The provider rejected the API key. Check that it is correct and still active.'],
    [429, 'The provider is reachable but is rate-limiting requests. Try again shortly.'],
    [500, 'The provider answered with HTTP 500 (api.e2e.invalid).'],
  ])('names what an HTTP %i answer means', (status, message) => {
    expect(describeAIError(apiError(status))).toBe(message);
  });

  it('reports an unreachable provider when no answer came back', () => {
    expect(describeAIError(apiError())).toContain('Could not reach api.e2e.invalid');
  });

  it('describes the last error after the retries ran out', () => {
    const error = new RetryError({
      message: 'Failed after 3 attempts. Last error: AI_APICallError: Internal boom',
      reason: 'maxRetriesExceeded',
      errors: [apiError(500), apiError(500), apiError(500)],
    });
    expect(describeAIError(error)).toBe(
      'Gave up after 3 attempts. The provider answered with HTTP 500 (api.e2e.invalid).',
    );
  });

  it('keeps messages the extension already localized', () => {
    expect(describeAIError(new Error('Localized message'))).toBe('Localized message');
  });

  it('shows a localized message in Japanese too', () => {
    setLanguage('ja');
    expect(describeAIError(apiError(500))).toBe(
      'プロバイダーが HTTP 500 を返しました（api.e2e.invalid）。',
    );
  });
});
