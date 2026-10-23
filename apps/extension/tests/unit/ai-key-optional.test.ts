/**
 * Requires an API key, per AI service: its default from the provider file, the user's override,
 * the setup check, requests that go out with no key header, and the message when a service
 * refuses a request without a key.
 */
import { generateText } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage, t } from '@/hooks/use-i18n';
import { saveStoredAIProviderConfig } from '@/lib/ai-provider-storage';
import {
  addAIService,
  duplicateAIService,
  getAIServicesState,
  serviceRequiresApiKey,
  setAIServiceRequiresApiKey,
} from '@/lib/ai-services-storage';
import { getSettings, saveSettings } from '@/lib/settings-storage';
import type { AISettings } from '@/services/ai-client';
import { createAIModel } from '@/services/ai-client.lazy';
import { describeAIError, isAIKeyRequiredError } from '@/services/ai-errors';
import {
  AIConnectionError,
  isKeylessRejection,
  listProviderModels,
} from '@/services/ai-model-list';
import {
  buildAISettingsFromService,
  isAISetUp,
  OPTIONS_AI_SERVICE_PARAM,
  openAISettings,
} from '@/services/ai-settings';
import { buildQuickSaveView, runQuickSave } from '@/services/quick-save';
import { AIHostError, withAIHost } from '@/services/quick-save-ai-host';
import { installFakeBookmarks } from '../fake-bookmarks';
import { readStoredRaw, STORAGE_ITEMS } from './storage-helpers';

vi.mock('@/services/quick-save-ai-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/quick-save-ai-host')>()),
  withAIHost: vi.fn(),
}));

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The headers of a request the mock received, by lowercase name. */
function sentHeaders(call = 0): Record<string, string> {
  const [input, init] = fetchMock.mock.calls[call] ?? [];
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  for (const [name, value] of new Headers(init?.headers)) headers.set(name, value);
  return Object.fromEntries(headers);
}

const KEY_HEADERS = ['authorization', 'x-api-key', 'x-goog-api-key', 'api-key'];

beforeEach(async () => {
  fakeBrowser.reset();
  await saveSettings({ language: 'en' });
  setLanguage('en');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function storedService(id: string) {
  const service = (await getAIServicesState()).services.find((entry) => entry.id === id);
  if (!service) throw new Error(`no service ${id}`);
  return service;
}

describe('Requires an API key', () => {
  it('defaults to the provider file and stores only an override of it', async () => {
    const hosted = await addAIService('openai');
    const local = await addAIService('lmstudio');
    expect(serviceRequiresApiKey(hosted)).toBe(true);
    expect(serviceRequiresApiKey(local)).toBe(false);

    await setAIServiceRequiresApiKey(hosted, false);
    await setAIServiceRequiresApiKey(local, true);
    expect(serviceRequiresApiKey(await storedService(hosted.id))).toBe(false);
    expect(serviceRequiresApiKey(await storedService(local.id))).toBe(true);

    // Back to the provider's default: nothing is stored for it.
    await setAIServiceRequiresApiKey(hosted, true);
    const raw = (await readStoredRaw(STORAGE_ITEMS.aiServices)) as {
      data: { services: Record<string, unknown>[] };
    };
    const byId = Object.fromEntries(raw.data.services.map((entry) => [entry.id, entry]));
    expect(byId[hosted.id]).not.toHaveProperty('requiresApiKey');
    expect(byId[local.id]).toMatchObject({ requiresApiKey: true });
  });

  it('keeps the choice on a duplicated service', async () => {
    const source = await addAIService('openai', 'Gateway');
    await setAIServiceRequiresApiKey(source, false);
    const copy = await duplicateAIService(source.id);
    expect(copy && serviceRequiresApiKey(await storedService(copy.id))).toBe(false);
  });

  it('lets a service without a key build settings and count as set up once turned off', async () => {
    const service = await addAIService('openai');
    const state = await getAIServicesState();
    expect(isAISetUp(state, {}, 'askAI')).toBe(false);
    await expect(buildAISettingsFromService(service, true)).rejects.toThrow(
      t('error_aiKeyNotConfigured'),
    );

    await setAIServiceRequiresApiKey(service, false);
    const keyless = await storedService(service.id);
    expect(isAISetUp(await getAIServicesState(), {}, 'askAI')).toBe(true);
    await expect(buildAISettingsFromService(keyless, true)).resolves.toMatchObject({
      apiKey: '',
      requiresApiKey: false,
    });
  });

  it('asks for a key again when turned on for a provider that needs none', async () => {
    const service = await addAIService('lmstudio');
    expect(isAISetUp(await getAIServicesState(), {}, 'askAI')).toBe(true);
    await setAIServiceRequiresApiKey(service, true);
    expect(isAISetUp(await getAIServicesState(), {}, 'askAI')).toBe(false);
    await saveStoredAIProviderConfig(service.id, { apiKey: 'lm-synthetic' });
    expect(
      isAISetUp(await getAIServicesState(), { [service.id]: { apiKey: 'lm-synthetic' } }, 'askAI'),
    ).toBe(true);
  });
});

/** Settings of an OpenAI-family service used without a key. */
const keyless = (overrides: Partial<AISettings> = {}): AISettings => ({
  enabled: true,
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: '',
  requiresApiKey: false,
  ...overrides,
});

describe('[mocked provider contract] requests without a key', () => {
  it.each([
    ['openai', 'gpt-4o-mini'],
    ['anthropic', 'claude-sonnet-4-20250514'],
    ['google', 'gemini-2.5-flash'],
    ['mistral', 'mistral-small-latest'],
    ['custom', 'local-model'],
  ])('%s sends no key header at all', async (provider, model) => {
    fetchMock.mockResolvedValue(json({ error: { message: 'stub' } }, 400));
    const settings = keyless({
      provider,
      model,
      ...(provider === 'custom' ? { baseUrl: 'https://gateway.example.test/v1' } : {}),
    });
    await expect(
      generateText({ model: await createAIModel(settings), prompt: 'hi', maxRetries: 0 }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalled();
    const headers = sentHeaders();
    for (const name of KEY_HEADERS) expect(headers).not.toHaveProperty(name);
    expect(JSON.stringify(headers)).not.toContain('no-api-key');
  });

  it('still sends the key when the service has one', async () => {
    fetchMock.mockResolvedValue(json({ error: { message: 'stub' } }, 400));
    await expect(
      generateText({
        model: await createAIModel(keyless({ apiKey: 'sk-synthetic', requiresApiKey: true })),
        prompt: 'hi',
        maxRetries: 0,
      }),
    ).rejects.toThrow();
    expect(sentHeaders().authorization).toBe('Bearer sk-synthetic');
  });

  it('says the service needs a key when it refuses a keyless request', async () => {
    fetchMock.mockResolvedValue(json({ error: { message: 'Missing bearer token' } }, 401));
    const error = await generateText({
      model: await createAIModel(keyless()),
      prompt: 'hi',
      maxRetries: 0,
    }).catch((caught: unknown) => caught);
    expect(isAIKeyRequiredError(error)).toBe(true);
    expect(describeAIError(error)).toBe(t('ai_connErrorKeyRequired'));
  });

  it('keeps the wrong-key message when a key was sent', async () => {
    fetchMock.mockResolvedValue(json({ error: { message: 'Incorrect API key' } }, 401));
    const error = await generateText({
      model: await createAIModel(keyless({ apiKey: 'sk-synthetic', requiresApiKey: true })),
      prompt: 'hi',
      maxRetries: 0,
    }).catch((caught: unknown) => caught);
    expect(isAIKeyRequiredError(error)).toBe(false);
    expect(describeAIError(error)).toBe(t('ai_connErrorInvalidKey'));
  });
});

describe('[mocked provider contract] model list without a key', () => {
  it('lists models with no Authorization header', async () => {
    fetchMock.mockResolvedValue(json({ data: [{ id: 'gpt-4o-mini' }] }));
    await expect(listProviderModels(keyless())).resolves.toEqual([
      { id: 'gpt-4o-mini', name: 'gpt-4o-mini' },
    ]);
    expect(sentHeaders()).not.toHaveProperty('authorization');
  });

  it.each([401, 403])(
    'classifies a %i from a remote host as a key the service wants',
    async (status) => {
      fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, status));
      const error = await listProviderModels(keyless()).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AIConnectionError);
      expect(error).toMatchObject({ code: 'key_required', message: t('ai_connErrorKeyRequired') });
      expect(isAIKeyRequiredError(error)).toBe(true);
    },
  );

  it('keeps the other meanings: a sent key, and a local server origin check', async () => {
    fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, 401));
    await expect(
      listProviderModels(keyless({ apiKey: 'sk-synthetic', requiresApiKey: true })),
    ).rejects.toMatchObject({ code: 'invalid_key' });
    expect(isKeylessRejection(403, 'http://localhost:11434/api/tags')).toBe(false);
    expect(isKeylessRejection(404, 'https://api.openai.com/v1/models')).toBe(false);
  });
});

describe('the way to the service that wants a key', () => {
  it('opens Options on the editor of the service a feature uses', async () => {
    const service = await addAIService('openai');
    const opened: string[] = [];
    fakeBrowser.tabs.onCreated.addListener((tab) => {
      if (tab.url) opened.push(tab.url);
    });
    await openAISettings('askAI');
    await openAISettings();
    expect(opened.map((url) => new URL(url).searchParams.get(OPTIONS_AI_SERVICE_PARAM))).toEqual([
      service.id,
      null,
    ]);
  });

  it('turns an AI quick save the service refused without a key into a setup failure', async () => {
    installFakeBookmarks([
      { id: 'bar', title: 'Bookmarks Bar' },
      { id: 'react', parentId: 'bar', title: 'React' },
    ]);
    await saveSettings({ language: 'en', aiEnabled: true });
    const service = await addAIService('openai');
    await setAIServiceRequiresApiKey(service, false);
    vi.mocked(withAIHost).mockRejectedValue(
      new AIHostError(t('ai_connErrorKeyRequired'), 'keyRequired'),
    );

    const record = await runQuickSave('ai-quick-save', {
      id: 7,
      index: 0,
      windowId: 1,
      url: 'https://react.dev/learn',
      title: 'React',
      active: true,
    } as Browser.tabs.Tab);
    expect(record).toMatchObject({
      status: 'failed',
      failure: 'aiUnavailable',
      error: t('ai_connErrorKeyRequired'),
    });
    const [settings] = vi.mocked(withAIHost).mock.calls[0] ?? [];
    expect(settings).toMatchObject({ apiKey: '', requiresApiKey: false });
    const view = buildQuickSaveView(record, await getSettings());
    expect(view.actions.map(({ id }) => id)).toEqual(['openAISettings', 'saveWithoutAI']);
    expect(view.note).toBe(t('ai_connErrorKeyRequired'));
  });
});
