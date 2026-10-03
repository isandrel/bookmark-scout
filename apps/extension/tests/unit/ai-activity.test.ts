import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import enMessages from '../../public/_locales/en/messages.json';
import {
  aiActivityItem,
  aiActivityRecordingItem,
  MAX_AI_ACTIVITY_BODY_CHARS,
  MAX_AI_ACTIVITY_ENTRIES,
  REDACTED_VALUE,
  recordAIActivity,
  redactHeaders,
  redactUrl,
  truncateBody,
} from '@/lib/ai-activity-storage';
import { aiRuntimeConfig } from '@/lib/ai-runtime-config';
import { AI_ACTIVITY_SOURCES, createLoggingFetch } from '@/services/ai-activity';

const entry = (index: number) => ({
  at: index,
  source: 'ai' as const,
  method: 'POST',
  url: `https://api.example.invalid/${index}`,
  durationMs: 1,
  requestHeaders: {},
});

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI runtime config', () => {
  it('reads the limits from the TOML config', () => {
    expect(MAX_AI_ACTIVITY_ENTRIES).toBe(aiRuntimeConfig.activity.max_entries);
    expect(MAX_AI_ACTIVITY_BODY_CHARS).toBe(aiRuntimeConfig.activity.max_body_chars);
    expect(aiRuntimeConfig.limits.prompt_max_bytes).toBeLessThanOrEqual(8192);
  });
});

describe('AI activity redaction', () => {
  it('never stores credential headers', () => {
    expect(
      redactHeaders({
        Authorization: 'Bearer secret',
        'x-api-key': 'secret',
        'x-goog-api-key': 'secret',
        'content-type': 'application/json',
      }),
    ).toEqual({
      authorization: REDACTED_VALUE,
      'x-api-key': REDACTED_VALUE,
      'x-goog-api-key': REDACTED_VALUE,
      'content-type': 'application/json',
    });
  });

  it('removes API keys from the query string', () => {
    const url = redactUrl('https://api.example.invalid/v1/models?key=secret&pageSize=10');
    expect(url).not.toContain('secret');
    expect(new URL(url).searchParams.get('pageSize')).toBe('10');
  });

  it('cuts long bodies and reports how much was left out', () => {
    expect(truncateBody('short')).toEqual({ body: 'short' });
    const long = 'x'.repeat(MAX_AI_ACTIVITY_BODY_CHARS + 5);
    expect(truncateBody(long)).toEqual({
      body: 'x'.repeat(MAX_AI_ACTIVITY_BODY_CHARS),
      omitted: 5,
    });
  });
});

describe('AI activity log', () => {
  it('keeps only the newest entries and never loses concurrent writes', async () => {
    await Promise.all(
      Array.from({ length: MAX_AI_ACTIVITY_ENTRIES + 3 }, (_, index) =>
        recordAIActivity(entry(index)),
      ),
    );
    const entries = await aiActivityItem.getValue();
    expect(entries).toHaveLength(MAX_AI_ACTIVITY_ENTRIES);
    expect(entries[0]?.at).toBe(MAX_AI_ACTIVITY_ENTRIES + 2);
  });

  it('names every source with a message that exists', () => {
    for (const key of Object.values(AI_ACTIVITY_SOURCES)) {
      expect(enMessages).toHaveProperty(key);
    }
  });
});

describe('createLoggingFetch', () => {
  const respond = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));

  beforeEach(() => {
    respond.mockClear();
    vi.stubGlobal('fetch', respond);
  });

  it('records nothing while recording is off', async () => {
    const fetch = createLoggingFetch({ source: 'verifyService' });
    const response = await fetch('https://api.example.invalid/v1/models');
    expect(await response.text()).toBe('{"ok":true}');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await aiActivityItem.getValue()).toEqual([]);
  });

  it('records the call with credentials redacted and leaves the response readable', async () => {
    await aiActivityRecordingItem.setValue(true);
    const fetch = createLoggingFetch({ source: 'autoTagging', provider: 'openai', model: 'm' });
    const response = await fetch('https://api.example.invalid/v1/chat', {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key' },
      body: '{"prompt":"hi"}',
    });
    expect(await response.text()).toBe('{"ok":true}');
    await vi.waitFor(async () => expect(await aiActivityItem.getValue()).toHaveLength(1));
    const [recorded] = await aiActivityItem.getValue();
    expect(recorded).toMatchObject({
      source: 'autoTagging',
      provider: 'openai',
      method: 'POST',
      status: 200,
      requestBody: '{"prompt":"hi"}',
      responseBody: '{"ok":true}',
      requestHeaders: { authorization: REDACTED_VALUE },
    });
    expect(JSON.stringify(recorded)).not.toContain('secret-key');
  });

  it('records a failed call and still throws it to the caller', async () => {
    await aiActivityRecordingItem.setValue(true);
    respond.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const fetch = createLoggingFetch({ source: 'modelList' });
    await expect(fetch('https://api.example.invalid/v1/models')).rejects.toThrow('Failed to fetch');
    await vi.waitFor(async () => expect(await aiActivityItem.getValue()).toHaveLength(1));
    expect((await aiActivityItem.getValue())[0]?.error).toBe('TypeError: Failed to fetch');
  });
});
