import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '@/hooks/use-i18n';
import type { AISettings } from '@/services/ai-client';
import {
  AIConnectionError,
  listProviderModels,
  modelListHeaders,
  parseModelPage,
} from '@/services/ai-model-list';

const settings = (overrides: Partial<AISettings>): AISettings => ({
  enabled: true,
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: 'sk-synthetic',
  ...overrides,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  setLanguage('en');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const requestedUrl = (call: number) => String(fetchMock.mock.calls[call]?.[0]);
const requestedHeaders = (call: number) =>
  (fetchMock.mock.calls[call]?.[1]?.headers ?? {}) as Record<string, string>;

describe('model list response shapes', () => {
  const url = new URL('https://api.example.test/v1/models');

  it('reads OpenAI-style data[].id', () => {
    expect(parseModelPage('openai', { data: [{ id: 'b' }, { id: 'a', name: 'A' }, {}] }, url)).toEqual(
      { models: [{ id: 'b', name: 'b' }, { id: 'a', name: 'A' }] },
    );
  });

  it('reads Anthropic display names and the next page', () => {
    const page = parseModelPage(
      'anthropic',
      { data: [{ id: 'claude-x', display_name: 'Claude X' }], has_more: true, last_id: 'claude-x' },
      url,
    );
    expect(page?.models).toEqual([{ id: 'claude-x', name: 'Claude X' }]);
    expect(page?.next?.searchParams.get('after_id')).toBe('claude-x');
  });

  it('keeps only Gemini models that generate content and strips the models/ prefix', () => {
    const page = parseModelPage(
      'google',
      {
        models: [
          {
            name: 'models/gemini-x',
            displayName: 'Gemini X',
            supportedGenerationMethods: ['generateContent'],
          },
          { name: 'models/embedding-x', supportedGenerationMethods: ['embedContent'] },
        ],
        nextPageToken: 'token-2',
      },
      url,
    );
    expect(page?.models).toEqual([{ id: 'gemini-x', name: 'Gemini X' }]);
    expect(page?.next?.searchParams.get('pageToken')).toBe('token-2');
  });

  it('reads Ollama tags', () => {
    expect(parseModelPage('ollama', { models: [{ name: 'llama3:latest' }] }, url)).toEqual({
      models: [{ id: 'llama3:latest', name: 'llama3:latest' }],
    });
  });

  it('rejects responses that are not the expected shape', () => {
    expect(parseModelPage('openai', { models: [] }, url)).toBeNull();
    expect(parseModelPage('google', { data: [] }, url)).toBeNull();
    expect(parseModelPage('openai', '<html>', url)).toBeNull();
  });
});

describe('model list request headers', () => {
  it('authenticates in each provider style', () => {
    expect(modelListHeaders('openai', settings({}))).toMatchObject({
      Authorization: 'Bearer sk-synthetic',
    });
    expect(modelListHeaders('anthropic', settings({ apiKey: 'sk-ant-synthetic' }))).toMatchObject({
      'x-api-key': 'sk-ant-synthetic',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    expect(modelListHeaders('google', settings({ apiKey: 'synthetic' }))).toMatchObject({
      'x-goog-api-key': 'synthetic',
    });
    expect(modelListHeaders('google', settings({}))).not.toHaveProperty('Authorization');
  });

  it('adds OpenAI organization and project, and extra headers', () => {
    expect(
      modelListHeaders(
        'openai',
        settings({
          providerOptions: { organization: 'org-1', project: 'proj_1' },
          extraHeaders: { 'X-Proxy': 'yes' },
        }),
      ),
    ).toMatchObject({ 'OpenAI-Organization': 'org-1', 'OpenAI-Project': 'proj_1', 'X-Proxy': 'yes' });
  });
});

describe('[mocked provider contract] listing models', () => {
  it('lists OpenAI-compatible models from the configured Base URL, sorted', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: [{ id: 'z-model' }, { id: 'a-model' }] }));
    const models = await listProviderModels(
      settings({ provider: 'custom', baseUrl: 'https://proxy.example.test/v1' }),
    );
    expect(requestedUrl(0)).toBe('https://proxy.example.test/v1/models');
    expect(models.map((model) => model.id)).toEqual(['a-model', 'z-model']);
  });

  it('follows Anthropic pages', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ data: [{ id: 'm1' }], has_more: true, last_id: 'm1' }))
      .mockResolvedValueOnce(json({ data: [{ id: 'm2' }], has_more: false }));
    const models = await listProviderModels(
      settings({ provider: 'anthropic', apiKey: 'sk-ant-synthetic', baseUrl: undefined }),
    );
    expect(requestedUrl(0)).toBe('https://api.anthropic.com/v1/models?limit=1000');
    expect(requestedUrl(1)).toContain('after_id=m1');
    expect(models.map((model) => model.id)).toEqual(['m1', 'm2']);
  });

  it('lists Gemini models from the default endpoint with the Google key header', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ models: [{ name: 'models/g1', supportedGenerationMethods: ['generateContent'] }] }),
    );
    await listProviderModels(settings({ provider: 'google', apiKey: 'synthetic' }));
    expect(requestedUrl(0)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
    );
    expect(requestedHeaders(0)['x-goog-api-key']).toBe('synthetic');
  });

  it('lists Ollama tags from the /api base', async () => {
    fetchMock.mockResolvedValueOnce(json({ models: [{ name: 'llama3' }] }));
    await listProviderModels(settings({ provider: 'ollama', apiKey: '' }));
    expect(requestedUrl(0)).toBe('http://localhost:11434/api/tags');
  });

  it('refuses providers without a model list', async () => {
    await expect(listProviderModels(settings({ provider: 'azure' }))).rejects.toThrow(
      'This provider has no model list.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('connection error classification', () => {
  const failWith = async (response: Response | Error, overrides: Partial<AISettings> = {}) => {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
    try {
      await listProviderModels(settings(overrides));
    } catch (error) {
      return error as AIConnectionError;
    }
    throw new Error('expected a failure');
  };

  it.each([
    [json({ error: 'nope' }, 401), 'invalid_key'],
    [json({ error: { details: [{ reason: 'API_KEY_INVALID' }] } }, 400), 'invalid_key'],
    [json({ error: 'forbidden' }, 403), 'forbidden'],
    [json({ error: 'missing' }, 404), 'not_found'],
    [json({ error: 'slow down' }, 429), 'rate_limited'],
    [json({ error: 'boom' }, 500), 'http_error'],
    [new Response('<html>Welcome</html>', { status: 200 }), 'not_api'],
    [json({ unexpected: true }), 'not_api'],
    [new TypeError('Failed to fetch'), 'unreachable'],
  ] as const)('%#: classifies as %s', async (response, code) => {
    const error = await failWith(response);
    expect(error).toBeInstanceOf(AIConnectionError);
    expect(error.code).toBe(code);
  });

  it('explains a 403 from a local server as a rejected extension origin', async () => {
    const error = await failWith(json({}, 403), { provider: 'ollama', apiKey: '' });
    expect(error.code).toBe('origin_rejected');
    expect(error.message).toContain('OLLAMA_ORIGINS');
  });

  it('treats a server on the local network like one on this computer', async () => {
    const error = await failWith(json({}, 403), {
      provider: 'ollama',
      apiKey: '',
      baseUrl: 'http://192.168.1.20:11434/api',
    });
    expect(error.code).toBe('origin_rejected');
  });

  it('times out when the provider never answers', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const pending = listProviderModels(settings({})).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(8000);
    const error = (await pending) as AIConnectionError;
    expect(error.code).toBe('timeout');
    expect(error.message).toBe('api.openai.com did not answer within 8 seconds.');
  });
});
